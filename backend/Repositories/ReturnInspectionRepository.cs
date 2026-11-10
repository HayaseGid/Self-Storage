using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

/*
 * Dữ liệu kiểm kho khi trả (bảng ReturnInspection / ReturnInspectionFee - database/20261109_KiemKhoXacNhan.sql).
 * Hai bảng mới đọc / ghi bằng câu SQL có tham số qua CHÍNH kết nối + transaction của SelfStorageDbContext,
 * nên không phải sửa SelfStorageDbContext.cs của nhóm, và vẫn nằm chung transaction với Charge / Payment (EF).
 */
public class ReturnInspectionRepository : IReturnInspectionRepository
{
    private readonly SelfStorageDbContext _context;

    public ReturnInspectionRepository(SelfStorageDbContext context)
    {
        _context = context;
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

    // Ảnh lưu dạng JSON mảng "data:image/..."; danh sách chỉ đếm số ảnh (đếm số lần xuất hiện "data:image") để nhẹ.
    private static string SelectSql(bool includeImages) => $@"
SELECT ri.InspectionID, ri.ReservationID, ri.ConditionResult, ri.StaffNotes,
       {(includeImages ? "ri.StaffImages" : "CAST(NULL AS NVARCHAR(MAX))")} AS StaffImages,
       (LEN(ISNULL(ri.StaffImages, N'')) - LEN(REPLACE(ISNULL(ri.StaffImages, N''), N'data:image', N''))) / 10 AS StaffImageCount,
       ri.InspectedByUserID, iu.FullName AS InspectedByName, ri.InspectedAt, ri.ConfirmDeadline, ri.DepositRemaining,
       ri.Status, ri.RespondedAt, ri.DisputeReason,
       {(includeImages ? "ri.CustomerImages" : "CAST(NULL AS NVARCHAR(MAX))")} AS CustomerImages,
       (LEN(ISNULL(ri.CustomerImages, N'')) - LEN(REPLACE(ISNULL(ri.CustomerImages, N''), N'data:image', N''))) / 10 AS CustomerImageCount,
       ri.ResolvedByUserID, mu.FullName AS ResolvedByName, ri.ResolvedAt, ri.ResolutionNotes, ri.SettledAt, ri.SettledBy,
       r.ReservationCode, c.ContractNumber, r.CustomerID, cu.FullName AS CustomerName, cu.Email AS CustomerEmail,
       cu.PhoneNumber AS CustomerPhone, r.FacilityID, f.FacilityName
FROM dbo.ReturnInspection AS ri
JOIN dbo.Reservation AS r ON r.ReservationID = ri.ReservationID
JOIN dbo.Users AS cu ON cu.UserID = r.CustomerID
JOIN dbo.Facility AS f ON f.FacilityID = r.FacilityID
JOIN dbo.Users AS iu ON iu.UserID = ri.InspectedByUserID
LEFT JOIN dbo.Users AS mu ON mu.UserID = ri.ResolvedByUserID
LEFT JOIN dbo.Contract AS c ON c.ReservationID = r.ReservationID";

    public async Task<List<ReturnInspectionRow>> ListAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, string? status,
        DateTime? settledSince, bool includeImages, CancellationToken cancellationToken)
    {
        if (facilityIds is { Count: 0 }) return new List<ReturnInspectionRow>();
        var parameters = new List<(string, object?)>();
        var where = new List<string>();
        if (customerId is not null) { where.Add("r.CustomerID = @customerId"); parameters.Add(("@customerId", customerId.Value)); }
        if (facilityIds is not null)
            where.Add($"r.FacilityID IN ({string.Join(",", facilityIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)))})");
        if (status is not null) { where.Add("ri.Status = @status"); parameters.Add(("@status", status)); }
        if (settledSince is not null)
        {
            where.Add("(ri.Status <> N'Settled' OR ri.SettledAt >= @since)");
            parameters.Add(("@since", settledSince.Value));
        }
        var sql = SelectSql(includeImages) + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "") +
                  " ORDER BY CASE ri.Status WHEN N'Disputed' THEN 0 WHEN N'Awaiting Customer' THEN 1 ELSE 2 END, ri.InspectedAt DESC";
        var rows = await QueryAsync(sql, parameters, ReadInspection, cancellationToken);
        await AttachFeesAndUnitsAsync(rows, cancellationToken);
        return rows;
    }

    public async Task<ReturnInspectionRow?> GetAsync(int inspectionId, bool includeImages, CancellationToken cancellationToken)
    {
        var rows = await QueryAsync(SelectSql(includeImages) + " WHERE ri.InspectionID = @id",
            new List<(string, object?)> { ("@id", inspectionId) }, ReadInspection, cancellationToken);
        await AttachFeesAndUnitsAsync(rows, cancellationToken);
        return rows.FirstOrDefault();
    }

    public async Task<List<int>> GetOverdueAwaitingIdsAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, DateTime now,
        CancellationToken cancellationToken)
    {
        if (facilityIds is { Count: 0 }) return new List<int>();
        var parameters = new List<(string, object?)> { ("@now", now) };
        var sql = @"SELECT ri.InspectionID FROM dbo.ReturnInspection AS ri JOIN dbo.Reservation AS r ON r.ReservationID = ri.ReservationID
                    WHERE ri.Status = N'Awaiting Customer' AND ri.ConfirmDeadline <= @now";
        if (customerId is not null) { sql += " AND r.CustomerID = @customerId"; parameters.Add(("@customerId", customerId.Value)); }
        if (facilityIds is not null)
            sql += $" AND r.FacilityID IN ({string.Join(",", facilityIds.Select(id => id.ToString(System.Globalization.CultureInfo.InvariantCulture)))})";
        return await QueryAsync(sql, parameters, rd => rd.GetInt32(0), cancellationToken);
    }

    private async Task AttachFeesAndUnitsAsync(List<ReturnInspectionRow> rows, CancellationToken cancellationToken)
    {
        if (rows.Count == 0) return;
        var ids = string.Join(",", rows.Select(r => r.InspectionID.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        var fees = await QueryAsync(
            $@"SELECT FeeID, InspectionID, FeeCode, FeePolicyID, Description, ProposedAmount, FinalAmount
               FROM dbo.ReturnInspectionFee WHERE InspectionID IN ({ids}) ORDER BY FeeID",
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
            .Where(ru => reservationIds.Contains(ru.ReservationID) && (ru.Status == "Active" || ru.Status == "Returned"))
            .Select(ru => new { ru.ReservationID, ru.Unit.UnitNumber })
            .ToListAsync(cancellationToken);
        foreach (var row in rows)
            row.Units = string.Join(", ", units.Where(u => u.ReservationID == row.ReservationID).Select(u => u.UnitNumber));
    }

    private static ReturnInspectionRow ReadInspection(DbDataReader rd)
    {
        string? S(string name) => rd[name] is DBNull ? null : (string)rd[name];
        // DB lưu giờ UTC (DateTime.UtcNow) -> đánh dấu Utc để JSON có "Z", FE đổi đúng sang giờ Việt Nam
        DateTime U(string name) => DateTime.SpecifyKind((DateTime)rd[name], DateTimeKind.Utc);
        DateTime? D(string name) => rd[name] is DBNull ? null : U(name);
        int? I(string name) => rd[name] is DBNull ? null : Convert.ToInt32(rd[name]);
        return new ReturnInspectionRow
        {
            InspectionID = (int)rd["InspectionID"],
            ReservationID = (int)rd["ReservationID"],
            ConditionResult = (string)rd["ConditionResult"],
            StaffNotes = S("StaffNotes"),
            StaffImages = S("StaffImages"),
            StaffImageCount = I("StaffImageCount") ?? 0,
            InspectedByUserID = (int)rd["InspectedByUserID"],
            InspectedByName = S("InspectedByName"),
            InspectedAt = U("InspectedAt"),
            ConfirmDeadline = U("ConfirmDeadline"),
            DepositRemaining = (decimal)rd["DepositRemaining"],
            Status = (string)rd["Status"],
            RespondedAt = D("RespondedAt"),
            DisputeReason = S("DisputeReason"),
            CustomerImages = S("CustomerImages"),
            CustomerImageCount = I("CustomerImageCount") ?? 0,
            ResolvedByUserID = I("ResolvedByUserID"),
            ResolvedByName = S("ResolvedByName"),
            ResolvedAt = D("ResolvedAt"),
            ResolutionNotes = S("ResolutionNotes"),
            SettledAt = D("SettledAt"),
            SettledBy = S("SettledBy"),
            ReservationCode = (string)rd["ReservationCode"],
            ContractNumber = S("ContractNumber"),
            CustomerID = (int)rd["CustomerID"],
            CustomerName = S("CustomerName"),
            CustomerEmail = S("CustomerEmail"),
            CustomerPhone = S("CustomerPhone"),
            FacilityID = (int)rd["FacilityID"],
            FacilityName = S("FacilityName")
        };
    }

    // ================================================================== GHI (trong transaction đang mở)

    public async Task<int> InsertAsync(NewReturnInspection row, IReadOnlyList<NewReturnInspectionFee> fees, CancellationToken cancellationToken)
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
        var inspectionId = Convert.ToInt32(id);

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
        return inspectionId;
    }

    // UPDLOCK + HOLDLOCK: 2 người cùng xử lý 1 kết quả (khách bấm Đồng ý đúng lúc hệ thống tự xác nhận) -> người sau phải chờ,
    // đọc lại thấy đã Settled thì dừng. Chỉ gọi trong transaction.
    public async Task<ReturnInspectionRow?> LockAsync(int inspectionId, CancellationToken cancellationToken)
    {
        await ExecuteAsync("SELECT InspectionID FROM dbo.ReturnInspection WITH (UPDLOCK, HOLDLOCK) WHERE InspectionID = @id;",
            new List<(string, object?)> { ("@id", inspectionId) }, cancellationToken);
        return await GetAsync(inspectionId, includeImages: false, cancellationToken);
    }

    public Task SetFinalAmountAsync(int feeId, decimal finalAmount, CancellationToken cancellationToken)
        => ExecuteAsync("UPDATE dbo.ReturnInspectionFee SET FinalAmount = @amount WHERE FeeID = @id;",
            new List<(string, object?)> { ("@amount", finalAmount), ("@id", feeId) }, cancellationToken);

    public Task MarkDisputedAsync(int inspectionId, string reason, string? customerImagesJson, DateTime respondedAt, CancellationToken cancellationToken)
        => ExecuteAsync(@"
UPDATE dbo.ReturnInspection
SET Status = N'Disputed', DisputeReason = @reason, CustomerImages = @images, RespondedAt = @at
WHERE InspectionID = @id AND Status = N'Awaiting Customer';",
            new List<(string, object?)> { ("@reason", reason), ("@images", customerImagesJson), ("@at", respondedAt), ("@id", inspectionId) },
            cancellationToken);

    public Task MarkSettledAsync(int inspectionId, string settledBy, DateTime settledAt, DateTime? respondedAt,
        int? resolvedByUserId, string? resolutionNotes, CancellationToken cancellationToken)
        => ExecuteAsync(@"
UPDATE dbo.ReturnInspection
SET Status = N'Settled', SettledBy = @by, SettledAt = @at,
    RespondedAt = COALESCE(RespondedAt, @respondedAt),
    ResolvedByUserID = @resolvedBy, ResolvedAt = CASE WHEN @resolvedBy IS NULL THEN NULL ELSE @at END, ResolutionNotes = @notes
WHERE InspectionID = @id AND Status <> N'Settled';",
            new List<(string, object?)>
            {
                ("@by", settledBy), ("@at", settledAt), ("@respondedAt", respondedAt), ("@resolvedBy", resolvedByUserId),
                ("@notes", resolutionNotes), ("@id", inspectionId)
            }, cancellationToken);

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
            if (value is string) p.DbType = DbType.String; // NVARCHAR (tiếng Việt có dấu)
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
