using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

/*
 * Dữ liệu kiểm kho khi trả (bảng ReturnInspection / ReturnInspectionFee).
 * Hỗ trợ song song cả SQL Server (T-SQL) và PostgreSQL (Npgsql).
 */
public class ReturnInspectionRepository : IReturnInspectionRepository
{
    private readonly SelfStorageDbContext _context;
    private readonly bool _isNpgsql;

    public ReturnInspectionRepository(SelfStorageDbContext context)
    {
        _context = context;
        _isNpgsql = context.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
    }

    // ================================================================== EF (bảng sẵn có)

    public Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = email.Trim();
        return _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == normalized && u.Status == "Active", cancellationToken);
    }

    public Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
        => _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.ManagerID == userId, cancellationToken);

    public Task<List<int>> GetStaffFacilityIdsAsync(int userId, CancellationToken cancellationToken)
        => _context.FacilityStaffs.Where(fs => fs.UserID == userId && fs.Status == "Active")
            .Select(fs => fs.FacilityID).ToListAsync(cancellationToken);

    public Task<List<FeePolicy>> GetFeePoliciesAsync(CancellationToken cancellationToken)
        => _context.FeePolicies.AsNoTracking().ToListAsync(cancellationToken);

    public Task<Reservation?> GetReservationForSettlementAsync(int reservationId, CancellationToken cancellationToken)
        => _context.Reservations
            .Include(r => r.Contract)
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);

    public void AddCharge(Charge charge) => _context.Charges.Add(charge);
    public void AddPayment(Payment payment) => _context.Payments.Add(payment);
    public Task SaveChangesAsync(CancellationToken cancellationToken) => _context.SaveChangesAsync(cancellationToken);
    public bool HasActiveTransaction => _context.Database.CurrentTransaction is not null;

    public Task<IDbContextTransaction> BeginTransactionAsync(IsolationLevel isolationLevel, CancellationToken cancellationToken)
        => _context.Database.BeginTransactionAsync(isolationLevel, cancellationToken);

    public void ClearTracking() => _context.ChangeTracker.Clear();

    // ================================================================== ĐỌC

    private string SelectSql(bool includeImages)
    {
        if (_isNpgsql)
        {
            return $@"
SELECT ri.""InspectionID"", ri.""ReservationID"", ri.""ConditionResult"", ri.""StaffNotes"",
       {(includeImages ? "ri.\"StaffImages\"" : "CAST(NULL AS TEXT)")} AS ""StaffImages"",
       (LENGTH(COALESCE(ri.""StaffImages"", '')) - LENGTH(REPLACE(COALESCE(ri.""StaffImages"", ''), 'data:image', ''))) / 10 AS ""StaffImageCount"",
       ri.""InspectedByUserID"", iu.""FullName"" AS ""InspectedByName"", ri.""InspectedAt"", ri.""ConfirmDeadline"", ri.""DepositRemaining"",
       ri.""Status"", ri.""RespondedAt"", ri.""DisputeReason"",
       {(includeImages ? "ri.\"CustomerImages\"" : "CAST(NULL AS TEXT)")} AS ""CustomerImages"",
       (LENGTH(COALESCE(ri.""CustomerImages"", '')) - LENGTH(REPLACE(COALESCE(ri.""CustomerImages"", ''), 'data:image', ''))) / 10 AS ""CustomerImageCount"",
       ri.""ResolvedByUserID"", mu.""FullName"" AS ""ResolvedByName"", mu.""Email"" AS ""ResolvedByEmail"", mu.""PhoneNumber"" AS ""ResolvedByPhone"", ri.""ResolvedAt"", ri.""ResolutionNotes"", ri.""SettledAt"", ri.""SettledBy"",
       r.""ReservationCode"", c.""ContractNumber"", r.""CustomerID"", cu.""FullName"" AS ""CustomerName"", cu.""Email"" AS ""CustomerEmail"",
       cu.""PhoneNumber"" AS ""CustomerPhone"", r.""FacilityID"", f.""FacilityName""
FROM ""ReturnInspection"" AS ri
JOIN ""Reservation"" AS r ON r.""ReservationID"" = ri.""ReservationID""
JOIN ""Users"" AS cu ON cu.""UserID"" = r.""CustomerID""
JOIN ""Facility"" AS f ON f.""FacilityID"" = r.""FacilityID""
JOIN ""Users"" AS iu ON iu.""UserID"" = ri.""InspectedByUserID""
LEFT JOIN ""Users"" AS mu ON mu.""UserID"" = ri.""ResolvedByUserID""
LEFT JOIN ""Contract"" AS c ON c.""ReservationID"" = r.""ReservationID""";
        }

        return $@"
SELECT ri.InspectionID, ri.ReservationID, ri.ConditionResult, ri.StaffNotes,
       {(includeImages ? "ri.StaffImages" : "CAST(NULL AS NVARCHAR(MAX))")} AS StaffImages,
       (LEN(ISNULL(ri.StaffImages, N'')) - LEN(REPLACE(ISNULL(ri.StaffImages, N''), N'data:image', N''))) / 10 AS StaffImageCount,
       ri.InspectedByUserID, iu.FullName AS InspectedByName, ri.InspectedAt, ri.ConfirmDeadline, ri.DepositRemaining,
       ri.Status, ri.RespondedAt, ri.DisputeReason,
       {(includeImages ? "ri.CustomerImages" : "CAST(NULL AS NVARCHAR(MAX))")} AS CustomerImages,
       (LEN(ISNULL(ri.CustomerImages, N'')) - LEN(REPLACE(ISNULL(ri.CustomerImages, N''), N'data:image', N''))) / 10 AS CustomerImageCount,
       ri.ResolvedByUserID, mu.FullName AS ResolvedByName, mu.Email AS ResolvedByEmail, mu.PhoneNumber AS ResolvedByPhone, ri.ResolvedAt, ri.ResolutionNotes, ri.SettledAt, ri.SettledBy,
       r.ReservationCode, c.ContractNumber, r.CustomerID, cu.FullName AS CustomerName, cu.Email AS CustomerEmail,
       cu.PhoneNumber AS CustomerPhone, r.FacilityID, f.FacilityName
FROM dbo.ReturnInspection AS ri
JOIN dbo.Reservation AS r ON r.ReservationID = ri.ReservationID
JOIN dbo.Users AS cu ON cu.UserID = r.CustomerID
JOIN dbo.Facility AS f ON f.FacilityID = r.FacilityID
JOIN dbo.Users AS iu ON iu.UserID = ri.InspectedByUserID
LEFT JOIN dbo.Users AS mu ON mu.UserID = ri.ResolvedByUserID
LEFT JOIN dbo.Contract AS c ON c.ReservationID = r.ReservationID";
    }

    public async Task<List<ReturnInspectionRow>> ListAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, string? status,
        DateTime? settledSince, bool includeImages, CancellationToken cancellationToken)
    {
        if (facilityIds is { Count: 0 }) return new List<ReturnInspectionRow>();
        var parameters = new List<(string, object?)>();
        var where = new List<string>();
        var customerCol = _isNpgsql ? "r.\"CustomerID\"" : "r.CustomerID";
        var facilityCol = _isNpgsql ? "r.\"FacilityID\"" : "r.FacilityID";
        var statusCol = _isNpgsql ? "ri.\"Status\"" : "ri.Status";
        var settledAtCol = _isNpgsql ? "ri.\"SettledAt\"" : "ri.SettledAt";

        if (customerId is not null) { where.Add($"{customerCol} = @customerId"); parameters.Add(("@customerId", customerId.Value)); }
        if (facilityIds is not null)
            where.Add($"{facilityCol} IN ({string.Join(",", facilityIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)))})");
        if (status is not null) { where.Add($"{statusCol} = @status"); parameters.Add(("@status", status)); }
        if (settledSince is not null)
        {
            where.Add($"({statusCol} <> 'Settled' OR {settledAtCol} >= @since)");
            parameters.Add(("@since", settledSince.Value));
        }
        var sql = SelectSql(includeImages) + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "") +
                  $" ORDER BY CASE {statusCol} WHEN 'Disputed' THEN 0 WHEN 'Awaiting Customer' THEN 1 ELSE 2 END, " +
                  (_isNpgsql ? "ri.\"InspectedAt\" DESC" : "ri.InspectedAt DESC");

        var rows = await QueryAsync(sql, parameters, ReadInspection, cancellationToken);
        await AttachFeesAndUnitsAsync(rows, cancellationToken);
        return rows;
    }

    public async Task<ReturnInspectionRow?> GetAsync(int inspectionId, bool includeImages, CancellationToken cancellationToken)
    {
        var idCol = _isNpgsql ? "ri.\"InspectionID\"" : "ri.InspectionID";
        var rows = await QueryAsync(SelectSql(includeImages) + $" WHERE {idCol} = @id",
            new List<(string, object?)> { ("@id", inspectionId) }, ReadInspection, cancellationToken);
        await AttachFeesAndUnitsAsync(rows, cancellationToken);
        return rows.FirstOrDefault();
    }

    public async Task<List<int>> GetOverdueAwaitingIdsAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, DateTime now,
        CancellationToken cancellationToken)
    {
        if (facilityIds is { Count: 0 }) return new List<int>();
        var parameters = new List<(string, object?)> { ("@now", now) };
        string sql;
        if (_isNpgsql)
        {
            sql = @"SELECT ri.""InspectionID"" FROM ""ReturnInspection"" AS ri JOIN ""Reservation"" AS r ON r.""ReservationID"" = ri.""ReservationID""
                    WHERE ri.""Status"" = 'Awaiting Customer' AND ri.""ConfirmDeadline"" <= @now";
            if (customerId is not null) { sql += " AND r.\"CustomerID\" = @customerId"; parameters.Add(("@customerId", customerId.Value)); }
            if (facilityIds is not null)
                sql += $" AND r.\"FacilityID\" IN ({string.Join(",", facilityIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)))})";
        }
        else
        {
            sql = @"SELECT ri.InspectionID FROM dbo.ReturnInspection AS ri JOIN dbo.Reservation AS r ON r.ReservationID = ri.ReservationID
                    WHERE ri.Status = N'Awaiting Customer' AND ri.ConfirmDeadline <= @now";
            if (customerId is not null) { sql += " AND r.CustomerID = @customerId"; parameters.Add(("@customerId", customerId.Value)); }
            if (facilityIds is not null)
                sql += $" AND r.FacilityID IN ({string.Join(",", facilityIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)))})";
        }
        return await QueryAsync(sql, parameters, rd => rd.GetInt32(0), cancellationToken);
    }

    private async Task AttachFeesAndUnitsAsync(List<ReturnInspectionRow> rows, CancellationToken cancellationToken)
    {
        if (rows.Count == 0) return;
        var ids = string.Join(",", rows.Select(r => r.InspectionID.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        var sql = _isNpgsql
            ? $@"SELECT ""FeeID"", ""InspectionID"", ""FeeCode"", ""FeePolicyID"", ""Description"", ""ProposedAmount"", ""FinalAmount""
               FROM ""ReturnInspectionFee"" WHERE ""InspectionID"" IN ({ids}) ORDER BY ""FeeID"""
            : $@"SELECT FeeID, InspectionID, FeeCode, FeePolicyID, Description, ProposedAmount, FinalAmount
               FROM dbo.ReturnInspectionFee WHERE InspectionID IN ({ids}) ORDER BY FeeID";

        var fees = await QueryAsync(
            sql,
            new List<(string, object?)>(),
            rd => new ReturnInspectionFeeRow
            {
                FeeID = rd.GetInt32(0),
                InspectionID = rd.GetInt32(1),
                FeeCode = rd.IsDBNull(2) ? null : rd.GetString(2),
                FeePolicyID = rd.IsDBNull(3) ? null : rd.GetInt32(3),
                Description = rd.GetString(4),
                ProposedAmount = rd.GetDecimal(5),
                FinalAmount = rd.IsDBNull(6) ? null : rd.GetDecimal(6)
            }, cancellationToken);
        foreach (var row in rows) row.Fees = fees.Where(f => f.InspectionID == row.InspectionID).ToList();

        var reservationIds = rows.Select(r => r.ReservationID).Distinct().ToList();
        var units = await _context.ReservationUnits.AsNoTracking()
            .Where(ru => reservationIds.Contains(ru.ReservationID))
            .Select(ru => new {
                ru.ReservationID,
                ru.Unit.UnitNumber,
                Size = ru.Unit.UnitSize.DisplayName,
                TypeName = ru.Unit.UnitType.TypeName,
                ru.Reservation.StartDate,
                ru.Reservation.EndDate
            })
            .ToListAsync(cancellationToken);

        var deposits = await _context.Charges.AsNoTracking()
            .Where(c => reservationIds.Contains(c.ReservationID) && c.ChargeType == "Deposit" && c.Status == "Paid")
            .GroupBy(c => c.ReservationID)
            .Select(g => new { ReservationID = g.Key, Total = g.Sum(c => c.Amount) })
            .ToListAsync(cancellationToken);

        foreach (var row in rows)
        {
            var uList = units.Where(u => u.ReservationID == row.ReservationID).ToList();
            row.Units = string.Join(", ", uList.Select(u => u.UnitNumber).Distinct());
            row.UnitDetails = string.Join("; ", uList.Select(u => $"{u.UnitNumber} ({u.TypeName ?? "Kho"} · {u.Size})").Distinct());
            var firstU = uList.FirstOrDefault();
            if (firstU != null)
            {
                row.StartDate = firstU.StartDate;
                row.EndDate = firstU.EndDate;
            }
            row.DepositPaid = deposits.FirstOrDefault(d => d.ReservationID == row.ReservationID)?.Total ?? 0m;
        }
    }

    private static ReturnInspectionRow ReadInspection(DbDataReader rd)
    {
        object? Val(string name)
        {
            try { return rd[name]; }
            catch { return rd[name.ToLowerInvariant()]; }
        }

        string? S(string name) => Val(name) is DBNull or null ? null : (string)Val(name)!;
        DateTime U(string name) => DateTime.SpecifyKind((DateTime)Val(name)!, DateTimeKind.Utc);
        DateTime? D(string name) => Val(name) is DBNull or null ? null : U(name);
        int? I(string name) => Val(name) is DBNull or null ? null : Convert.ToInt32(Val(name));

        return new ReturnInspectionRow
        {
            InspectionID = Convert.ToInt32(Val("InspectionID")),
            ReservationID = Convert.ToInt32(Val("ReservationID")),
            ConditionResult = (string)Val("ConditionResult")!,
            StaffNotes = S("StaffNotes"),
            StaffImages = S("StaffImages"),
            StaffImageCount = I("StaffImageCount") ?? 0,
            InspectedByUserID = Convert.ToInt32(Val("InspectedByUserID")),
            InspectedByName = S("InspectedByName"),
            InspectedAt = U("InspectedAt"),
            ConfirmDeadline = U("ConfirmDeadline"),
            DepositRemaining = Convert.ToDecimal(Val("DepositRemaining")),
            Status = (string)Val("Status")!,
            RespondedAt = D("RespondedAt"),
            DisputeReason = S("DisputeReason"),
            CustomerImages = S("CustomerImages"),
            CustomerImageCount = I("CustomerImageCount") ?? 0,
            ResolvedByUserID = I("ResolvedByUserID"),
            ResolvedByName = S("ResolvedByName"),
            ResolvedByEmail = S("ResolvedByEmail"),
            ResolvedByPhone = S("ResolvedByPhone"),
            ResolvedAt = D("ResolvedAt"),
            ResolutionNotes = S("ResolutionNotes"),
            SettledAt = D("SettledAt"),
            SettledBy = S("SettledBy"),
            ReservationCode = (string)Val("ReservationCode")!,
            ContractNumber = S("ContractNumber"),
            CustomerID = Convert.ToInt32(Val("CustomerID")),
            CustomerName = S("CustomerName"),
            CustomerEmail = S("CustomerEmail"),
            CustomerPhone = S("CustomerPhone"),
            FacilityID = Convert.ToInt32(Val("FacilityID")),
            FacilityName = S("FacilityName")
        };
    }

    // ================================================================== GHI (trong transaction đang mở)

    public async Task<int> InsertAsync(NewReturnInspection row, IReadOnlyList<NewReturnInspectionFee> fees, CancellationToken cancellationToken)
    {
        int inspectionId;
        if (_isNpgsql)
        {
            var insertSql = @"
INSERT INTO ""ReturnInspection""
    (""ReservationID"", ""ConditionResult"", ""StaffNotes"", ""StaffImages"", ""InspectedByUserID"", ""InspectedAt"", ""ConfirmDeadline"", ""DepositRemaining"",
     ""Status"", ""SettledBy"", ""SettledAt"")
VALUES (@reservationId, @condition, @notes, @images, @staffId, @inspectedAt, @deadline, @deposit, @status, @settledBy, @settledAt)
RETURNING ""InspectionID"";";

            var id = await ScalarAsync(insertSql,
                new List<(string, object?)>
                {
                    ("@reservationId", row.ReservationId), ("@condition", row.ConditionResult), ("@notes", row.StaffNotes),
                    ("@images", row.StaffImagesJson), ("@staffId", row.InspectedByUserId), ("@inspectedAt", row.InspectedAt),
                    ("@deadline", row.ConfirmDeadline), ("@deposit", row.DepositRemaining), ("@status", row.Status),
                    ("@settledBy", row.SettledBy), ("@settledAt", row.SettledAt)
                }, cancellationToken);
            inspectionId = Convert.ToInt32(id);

            foreach (var fee in fees)
            {
                await ExecuteAsync(@"
INSERT INTO ""ReturnInspectionFee"" (""InspectionID"", ""FeeCode"", ""FeePolicyID"", ""Description"", ""ProposedAmount"")
VALUES (@inspectionId, @code, @policyId, @description, @amount);",
                    new List<(string, object?)>
                    {
                        ("@inspectionId", inspectionId), ("@code", fee.FeeCode), ("@policyId", fee.FeePolicyId),
                        ("@description", fee.Description), ("@amount", fee.ProposedAmount)
                    }, cancellationToken);
            }
        }
        else
        {
            var id = await ScalarAsync(@"
INSERT INTO dbo.ReturnInspection
    (ReservationID, ConditionResult, StaffNotes, StaffImages, InspectedByUserID, InspectedAt, ConfirmDeadline, DepositRemaining,
     Status, SettledBy, SettledAt)
VALUES (@reservationId, @condition, @notes, @images, @staffId, @inspectedAt, @deadline, @deposit, @status, @settledBy, @settledAt);
SELECT CAST(SCOPE_IDENTITY() AS INT);",
                new List<(string, object?)>
                {
                    ("@reservationId", row.ReservationId), ("@condition", row.ConditionResult), ("@notes", row.StaffNotes),
                    ("@images", row.StaffImagesJson), ("@staffId", row.InspectedByUserId), ("@inspectedAt", row.InspectedAt),
                    ("@deadline", row.ConfirmDeadline), ("@deposit", row.DepositRemaining), ("@status", row.Status),
                    ("@settledBy", row.SettledBy), ("@settledAt", row.SettledAt)
                }, cancellationToken);
            inspectionId = Convert.ToInt32(id);

            foreach (var fee in fees)
            {
                await ExecuteAsync(@"
INSERT INTO dbo.ReturnInspectionFee (InspectionID, FeeCode, FeePolicyID, Description, ProposedAmount)
VALUES (@inspectionId, @code, @policyId, @description, @amount);",
                    new List<(string, object?)>
                    {
                        ("@inspectionId", inspectionId), ("@code", fee.FeeCode), ("@policyId", fee.FeePolicyId),
                        ("@description", fee.Description), ("@amount", fee.ProposedAmount)
                    }, cancellationToken);
            }
        }
        return inspectionId;
    }

    public async Task<ReturnInspectionRow?> LockAsync(int inspectionId, CancellationToken cancellationToken)
    {
        if (_isNpgsql)
        {
            await ExecuteAsync(@"SELECT ""InspectionID"" FROM ""ReturnInspection"" WHERE ""InspectionID"" = @id FOR UPDATE;",
                new List<(string, object?)> { ("@id", inspectionId) }, cancellationToken);
        }
        else
        {
            await ExecuteAsync("SELECT InspectionID FROM dbo.ReturnInspection WITH (UPDLOCK, HOLDLOCK) WHERE InspectionID = @id;",
                new List<(string, object?)> { ("@id", inspectionId) }, cancellationToken);
        }
        return await GetAsync(inspectionId, includeImages: false, cancellationToken);
    }

    public Task SetFinalAmountAsync(int feeId, decimal finalAmount, CancellationToken cancellationToken)
    {
        var sql = _isNpgsql
            ? @"UPDATE ""ReturnInspectionFee"" SET ""FinalAmount"" = @amount WHERE ""FeeID"" = @id;"
            : "UPDATE dbo.ReturnInspectionFee SET FinalAmount = @amount WHERE FeeID = @id;";

        return ExecuteAsync(sql, new List<(string, object?)> { ("@amount", finalAmount), ("@id", feeId) }, cancellationToken);
    }

    public Task MarkDisputedAsync(int inspectionId, string reason, string? customerImagesJson, DateTime respondedAt, CancellationToken cancellationToken)
    {
        var sql = _isNpgsql
            ? @"UPDATE ""ReturnInspection""
                SET ""Status"" = 'Disputed', ""DisputeReason"" = @reason, ""CustomerImages"" = @images, ""RespondedAt"" = @at
                WHERE ""InspectionID"" = @id AND ""Status"" = 'Awaiting Customer';"
            : @"UPDATE dbo.ReturnInspection
                SET Status = N'Disputed', DisputeReason = @reason, CustomerImages = @images, RespondedAt = @at
                WHERE InspectionID = @id AND Status = N'Awaiting Customer';";

        return ExecuteAsync(sql,
            new List<(string, object?)> { ("@reason", reason), ("@images", customerImagesJson), ("@at", respondedAt), ("@id", inspectionId) },
            cancellationToken);
    }

    public Task MarkApprovedAsync(int inspectionId, string nextStatus, DateTime confirmDeadline,
        int resolvedByUserId, string? resolutionNotes, CancellationToken cancellationToken)
    {
        var sql = _isNpgsql
            ? @"UPDATE ""ReturnInspection""
                SET ""Status"" = @status, ""ConfirmDeadline"" = @deadline,
                    ""ResolvedByUserID"" = @resolvedBy, ""ResolvedAt"" = CURRENT_TIMESTAMP, ""ResolutionNotes"" = @notes
                WHERE ""InspectionID"" = @id AND ""Status"" = 'Pending Manager';"
            : @"UPDATE dbo.ReturnInspection
                SET Status = @status, ConfirmDeadline = @deadline,
                    ResolvedByUserID = @resolvedBy, ResolvedAt = SYSUTCDATETIME(), ResolutionNotes = @notes
                WHERE InspectionID = @id AND Status = N'Pending Manager';";

        return ExecuteAsync(sql,
            new List<(string, object?)>
            {
                ("@status", nextStatus), ("@deadline", confirmDeadline), ("@resolvedBy", resolvedByUserId),
                ("@notes", resolutionNotes), ("@id", inspectionId)
            }, cancellationToken);
    }

    public Task MarkSettledAsync(int inspectionId, string settledBy, DateTime settledAt, DateTime? respondedAt,
        int? resolvedByUserId, string? resolutionNotes, CancellationToken cancellationToken)
    {
        var sql = _isNpgsql
            ? @"UPDATE ""ReturnInspection""
                SET ""Status"" = 'Settled', ""SettledBy"" = @by, ""SettledAt"" = @at,
                    ""RespondedAt"" = COALESCE(""RespondedAt"", @respondedAt),
                    ""ResolvedByUserID"" = @resolvedBy, ""ResolvedAt"" = CASE WHEN @resolvedBy IS NULL THEN NULL ELSE @at END, ""ResolutionNotes"" = @notes
                WHERE ""InspectionID"" = @id AND ""Status"" <> 'Settled';"
            : @"UPDATE dbo.ReturnInspection
                SET Status = N'Settled', SettledBy = @by, SettledAt = @at,
                    RespondedAt = COALESCE(RespondedAt, @respondedAt),
                    ResolvedByUserID = @resolvedBy, ResolvedAt = CASE WHEN @resolvedBy IS NULL THEN NULL ELSE @at END, ResolutionNotes = @notes
                WHERE InspectionID = @id AND Status <> N'Settled';";

        return ExecuteAsync(sql,
            new List<(string, object?)>
            {
                ("@by", settledBy), ("@at", settledAt), ("@respondedAt", respondedAt), ("@resolvedBy", resolvedByUserId),
                ("@notes", resolutionNotes), ("@id", inspectionId)
            }, cancellationToken);
    }

    // ================================================================== ADO dùng chung kết nối / transaction của EF

    private async Task<DbCommand> CommandAsync(string sql, List<(string Name, object? Value)> parameters, CancellationToken cancellationToken)
    {
        var connection = _context.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open) await _context.Database.OpenConnectionAsync(cancellationToken);
        var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Transaction = _context.Database.CurrentTransaction?.GetDbTransaction();
        foreach (var (name, value) in parameters)
        {
            var p = command.CreateParameter();
            p.ParameterName = name;
            p.Value = value ?? DBNull.Value;
            if (value is string) p.DbType = DbType.String;
            command.Parameters.Add(p);
        }
        return command;
    }

    private async Task<List<T>> QueryAsync<T>(string sql, List<(string, object?)> parameters, Func<DbDataReader, T> map, CancellationToken cancellationToken)
    {
        await using var command = await CommandAsync(sql, parameters, cancellationToken);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var list = new List<T>();
        while (await reader.ReadAsync(cancellationToken)) list.Add(map(reader));
        return list;
    }

    private async Task<object?> ScalarAsync(string sql, List<(string, object?)> parameters, CancellationToken cancellationToken)
    {
        await using var command = await CommandAsync(sql, parameters, cancellationToken);
        return await command.ExecuteScalarAsync(cancellationToken);
    }

    private async Task<int> ExecuteAsync(string sql, List<(string, object?)> parameters, CancellationToken cancellationToken)
    {
        await using var command = await CommandAsync(sql, parameters, cancellationToken);
        return await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
