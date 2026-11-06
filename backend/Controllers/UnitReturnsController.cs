using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

/*
 * TRẢ KHO + KIỂM KHO + QUYẾT TOÁN CỌC (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 * KHÁCH
 *   GET  /api/unit-returns/mine                         -> hợp đồng trả được + yêu cầu trả kho / kết quả kiểm kho / hoàn cọc
 *   POST /api/unit-returns                              -> { reservationId, returnDate, note } báo trả kho (đặt lịch)
 *   POST /api/unit-returns/{reservationId}/cancel       -> hủy lịch trả kho (khi Staff chưa bắt đầu kiểm)
 *   POST /api/unit-returns/{reservationId}/pay-demo     -> đóng phí còn thiếu (mô phỏng); thật thì POST /api/vnpay/create
 * STAFF
 *   GET  /api/unit-returns/staff                        -> lịch trả kho tại các cơ sở của Staff + danh mục phí
 *   POST /api/unit-returns/staff/{reservationId}/start  -> nhận kho lại: kho "Đang kiểm tra", thu hồi mã/thẻ
 *   POST /api/unit-returns/staff/{reservationId}/complete
 *        { condition: "Good"|"Damaged", notes, unitStatus: "Available"|"Maintenance", fees: [{ feeCode, description, amount }] }
 *
 * Dữ liệu dùng bảng sẵn có: HandoverTask (TaskType = 'Move Out', mỗi kho 1 việc), ReservationUnit Active -> Returned,
 * StorageUnit 'Pending Inspection', Charge 'ExtraFee' (SettledFromDeposit = 1 khi trừ vào cọc), Payment Refund 'DepositReturn'.
 * Việc kiểm kho giao cho ĐÚNG Staff đã bàn giao kho (việc 'Move In'); Staff đó nghỉ thì giao Staff khác của cơ sở.
 * Quyết toán: phí phát sinh trừ vào cọc trước, thiếu thì khách đóng thêm; cọc còn dư hoàn sau N ngày
 * (chính sách "Gia hạn & trả kho" -> depositRefundWorkingDays, mặc định 7). Ngày hoàn dự kiến lưu ở Payment.ExpiresAt;
 * tới ngày, khoản hoàn được ghi nhận "đã chuyển" (mô phỏng chuyển khoản) mỗi khi khách / Staff mở trang.
 */
[ApiController]
[Route("api/unit-returns")]
public sealed class UnitReturnsController(
    SelfStorageDbContext context,
    IFacilityManagementService facilityManagementService,
    ILogger<UnitReturnsController> logger) : ControllerBase
{
    private const string MoveOut = "Move Out";
    private const string ManualProvider = "Manual";

    public sealed record ReturnRequest(int ReservationId, DateTime ReturnDate, string? Note);
    public sealed record FeeLine(string? FeeCode, string? Description, decimal Amount);
    public sealed record CompleteRequest(string? Condition, string? Notes, string? UnitStatus, List<FeeLine>? Fees);
    private sealed record ReturnRules(int NoticeDays, int RefundDays);

    // ================================================================== KHÁCH

    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var customerId = await GetUserIdAsync(1, ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        await ProcessDueRefundsAsync(r => r.CustomerID == customerId.Value, ct);
        var rules = await ReadRulesAsync(ct);
        var today = Today();

        var reservations = await context.Reservations.AsNoTracking()
            .Include(r => r.Facility)
            .Include(r => r.Contract)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit)
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Include(r => r.HandoverTasks).ThenInclude(t => t.AssignedStaff)
            .AsSplitQuery()
            .Where(r => r.CustomerID == customerId.Value && r.Contract != null &&
                        (r.Status == ReservationStatus.HandedOver ||
                         (r.Status == ReservationStatus.Completed && r.HandoverTasks.Any(t => t.TaskType == MoveOut))))
            .OrderByDescending(r => r.EndDate)
            .ToListAsync(ct);

        var contractIds = reservations.Select(r => r.Contract!.ContractID).ToList();
        var renewedIds = await context.Contracts.AsNoTracking()
            .Where(c => c.RenewedFromContractID != null && contractIds.Contains(c.RenewedFromContractID.Value) &&
                        c.Reservation.Status != ReservationStatus.Cancelled)
            .Select(c => c.RenewedFromContractID!.Value)
            .ToListAsync(ct);

        var items = reservations.Select(r =>
        {
            var tasks = r.HandoverTasks.Where(t => t.TaskType == MoveOut && t.Status != "Cancelled").ToList();
            var (eligible, reason) = tasks.Count > 0
                ? (false, "Đã có yêu cầu trả kho.")
                : CheckEligibility(r, renewedIds.Contains(r.Contract!.ContractID));
            var (minDate, maxDate) = DateWindow(r, rules, today);
            return new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                contractNumber = r.Contract!.ContractNumber,
                facility = r.Facility.FacilityName,
                status = r.Status,
                startDate = r.StartDate.Date,
                endDate = r.EndDate.Date,
                units = r.ReservationUnits.Where(ru => ru.Status is "Active" or "Returned").Select(ru => ru.Unit.UnitNumber).ToList(),
                eligible,
                reason,
                minReturnDate = minDate,
                maxReturnDate = maxDate,
                request = tasks.Count == 0 ? null : BuildRequestDto(r, tasks, rules)
            };
        }).ToList();

        var fees = await FeeCatalogAsync(ct);
        return Ok(new
        {
            rules = new { returnNoticeDays = rules.NoticeDays, depositRefundDays = rules.RefundDays },
            fees,
            items
        });
    }

    [HttpPost]
    public async Task<IActionResult> CreateRequest([FromBody] ReturnRequest request, CancellationToken ct)
    {
        var customerId = await GetUserIdAsync(1, ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var r = await context.Reservations
            .Include(x => x.Contract)
            .Include(x => x.ReservationUnits)
            .Include(x => x.HandoverTasks)
            .Include(x => x.Facility)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.ReservationID == request.ReservationId && x.CustomerID == customerId.Value, ct);
        if (r?.Contract is null) return NotFound(new { message = "Không tìm thấy hợp đồng thuộc tài khoản này." });
        if (r.HandoverTasks.Any(t => t.TaskType == MoveOut && t.Status != "Cancelled"))
            return Conflict(new { message = "Hợp đồng này đã có yêu cầu trả kho." });

        var renewed = await context.Contracts.AnyAsync(c => c.RenewedFromContractID == r.Contract.ContractID &&
                                                            c.Reservation.Status != ReservationStatus.Cancelled, ct);
        var (eligible, reason) = CheckEligibility(r, renewed);
        if (!eligible) return Conflict(new { message = reason });

        var rules = await ReadRulesAsync(ct);
        var (minDate, maxDate) = DateWindow(r, rules, Today());
        var date = request.ReturnDate.Date;
        if (date < minDate || date > maxDate)
            return BadRequest(new { message = $"Ngày trả kho phải từ {minDate:dd/MM/yyyy} đến {maxDate:dd/MM/yyyy} (báo trước ít nhất {rules.NoticeDays} ngày theo chính sách)." });

        var activeUnits = r.ReservationUnits.Where(ru => ru.Status == "Active").ToList();
        var staffId = await PickStaffAsync(r, activeUnits.Select(u => u.UnitID).ToList(), ct);
        if (staffId is null) return Conflict(new { message = "Cơ sở chưa có nhân viên đang làm việc để nhận lại kho. Vui lòng liên hệ cơ sở." });

        var note = string.IsNullOrWhiteSpace(request.Note) ? null : request.Note.Trim();
        if (note?.Length > 500) note = note[..500];
        try
        {
            foreach (var ru in activeUnits)
            {
                context.HandoverTasks.Add(new HandoverTask
                {
                    TaskType = MoveOut,
                    FacilityID = r.FacilityID,
                    UnitID = ru.UnitID,
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = r.ReservationID,
                    AssignedStaffID = staffId.Value,
                    ScheduledDate = date,
                    ScheduledTime = new TimeSpan(9, 0, 0),
                    UnitConditionNotes = note is null ? null : $"Khách ghi chú: {note}",
                    Status = "Scheduled",
                    CreatedAt = DateTime.UtcNow
                });
            }
            await context.SaveChangesAsync(ct);
        }
        catch (DbUpdateException exception)
        {
            logger.LogWarning(exception, "Tạo yêu cầu trả kho thất bại ({ReservationId})", r.ReservationID);
            return Conflict(new { message = CleanDbMessage(exception, "Chưa tạo được yêu cầu trả kho, vui lòng thử lại.") });
        }

        var staffName = await context.Users.Where(u => u.UserID == staffId.Value).Select(u => u.FullName).FirstOrDefaultAsync(ct);
        return Ok(new { message = $"Đã đặt lịch trả kho ngày {date:dd/MM/yyyy}. Nhân viên {staffName} sẽ nhận lại và kiểm tra kho.", returnDate = date, staffName });
    }

    [HttpPost("{reservationId:int}/cancel")]
    public async Task<IActionResult> CancelRequest(int reservationId, CancellationToken ct)
    {
        var customerId = await GetUserIdAsync(1, ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var tasks = await context.HandoverTasks
            .Where(t => t.ReservationID == reservationId && t.TaskType == MoveOut && t.Status != "Cancelled" &&
                        t.Reservation!.CustomerID == customerId.Value)
            .ToListAsync(ct);
        if (tasks.Count == 0) return NotFound(new { message = "Không có yêu cầu trả kho để hủy." });
        if (tasks.Any(t => t.Status != "Scheduled"))
            return Conflict(new { message = "Nhân viên đã bắt đầu nhận lại kho nên không thể hủy yêu cầu." });
        foreach (var t in tasks) t.Status = "Cancelled";
        await context.SaveChangesAsync(ct);
        return Ok(new { message = "Đã hủy lịch trả kho. Bạn tiếp tục sử dụng kho như bình thường." });
    }

    /* Đóng phí phát sinh còn thiếu bằng thanh toán mô phỏng (giống /api/payment/confirm). Thanh toán thật: /api/vnpay/create. */
    [HttpPost("{reservationId:int}/pay-demo")]
    public async Task<IActionResult> PayDemo(int reservationId, CancellationToken ct)
    {
        var customerId = await GetUserIdAsync(1, ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var r = await context.Reservations.Include(x => x.Charges).Include(x => x.Payments)
            .FirstOrDefaultAsync(x => x.ReservationID == reservationId && x.CustomerID == customerId.Value, ct);
        if (r is null) return NotFound(new { message = "Không tìm thấy đơn thuộc tài khoản này." });
        var due = r.Charges.Where(c => c.ChargeType is "ExtraFee" or "LateFee" && c.Status == "Unpaid").ToList();
        if (due.Count == 0) return Ok(new { message = "Không còn khoản phí nào cần đóng." });

        var now = DateTime.UtcNow;
        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);
            foreach (var p in r.Payments.Where(p => p.Status == "Pending" && p.Direction == "Collection")) p.Status = "Cancelled";
            await context.SaveChangesAsync(ct);
            var payment = new Payment
            {
                ReservationID = r.ReservationID,
                OrderCode = $"FEE-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                IdempotencyKey = $"RETURN-FEE-{r.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Simulator",
                Direction = "Collection",
                Amount = due.Sum(c => c.Amount),
                PaymentMethod = "QR",
                Status = "Pending",
                CreatedAt = now,
                CreatedByUserID = customerId.Value
            };
            context.Payments.Add(payment);
            await context.SaveChangesAsync(ct);
            foreach (var c in due) c.PaymentID = payment.PaymentID;
            await context.SaveChangesAsync(ct);
            payment.Status = "Completed";
            payment.ProviderTransactionId = $"SIM-FEE-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            payment.ReceivedAmount = payment.Amount;
            payment.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);
            foreach (var c in due) { c.Status = "Paid"; c.PaidAt = now; }
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Ok(new { message = $"Đã thanh toán {Vnd(payment.Amount)}đ phí phát sinh.", amount = payment.Amount });
        }
        catch (DbUpdateException exception)
        {
            logger.LogWarning(exception, "Đóng phí trả kho thất bại ({ReservationId})", reservationId);
            return Conflict(new { message = CleanDbMessage(exception, "Chưa thanh toán được, vui lòng thử lại.") });
        }
    }

    // ================================================================== STAFF

    [HttpGet("staff")]
    public async Task<IActionResult> StaffList(CancellationToken ct)
    {
        var staffId = await GetUserIdAsync(2, ct);
        if (staffId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản nhân viên." });

        var facilityIds = await context.FacilityStaffs.Where(fs => fs.UserID == staffId.Value && fs.Status == "Active")
            .Select(fs => fs.FacilityID).ToListAsync(ct);
        await ProcessDueRefundsAsync(r => facilityIds.Contains(r.FacilityID), ct);
        var rules = await ReadRulesAsync(ct);
        var since = DateTime.UtcNow.AddDays(-30);

        var reservations = await context.Reservations.AsNoTracking()
            .Include(r => r.Facility)
            .Include(r => r.Customer)
            .Include(r => r.Contract)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitSize)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitType)
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Include(r => r.HandoverTasks).ThenInclude(t => t.AssignedStaff)
            .Include(r => r.UnitAccesses)
            .AsSplitQuery()
            .Where(r => facilityIds.Contains(r.FacilityID) &&
                        r.HandoverTasks.Any(t => t.TaskType == MoveOut &&
                                                 (t.Status == "Scheduled" || t.Status == "In Progress" ||
                                                  (t.Status == "Completed" && t.ActualAt >= since))))
            .ToListAsync(ct);

        var items = reservations.Select(r =>
        {
            var tasks = r.HandoverTasks.Where(t => t.TaskType == MoveOut && t.Status != "Cancelled").ToList();
            var deposit = DepositPaid(r);
            var requestStatus = tasks.All(t => t.Status == "Completed") ? "Completed" : tasks.Any(t => t.Status != "Scheduled") ? "In Progress" : "Scheduled";
            return new
            {
                requestStatus,
                scheduledDate = tasks.Min(t => t.ScheduledDate),
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                contractNumber = r.Contract?.ContractNumber,
                facility = r.Facility.FacilityName,
                customerName = r.Customer.FullName,
                customerEmail = r.Customer.Email,
                customerPhone = r.Customer.PhoneNumber,
                startDate = r.StartDate.Date,
                endDate = r.EndDate.Date,
                assignedToMe = tasks.Any(t => t.AssignedStaffID == staffId.Value),
                units = tasks.Select(t =>
                {
                    var ru = r.ReservationUnits.FirstOrDefault(x => x.ReservationUnitID == t.ReservationUnitID);
                    return new
                    {
                        unitNumber = ru?.Unit.UnitNumber,
                        type = ru?.Unit.UnitType?.TypeName,
                        size = ru?.Unit.UnitSize == null ? null : $"{ru.Unit.UnitSize.SizeCode}: {ru.Unit.UnitSize.DisplayName}",
                        unitStatus = ru?.Unit.Status,
                        access = r.UnitAccesses.Where(a => a.UnitID == ru!.UnitID && a.Status == "Active").Select(a => $"{a.AccessType}: {a.AccessValue}").FirstOrDefault()
                    };
                }).ToList(),
                depositPaid = deposit,
                request = BuildRequestDto(r, tasks, rules)
            };
        })
        .OrderBy(x => x.requestStatus == "Completed" ? 1 : 0)
        .ThenBy(x => x.scheduledDate)
        .ToList();

        return Ok(new
        {
            rules = new { returnNoticeDays = rules.NoticeDays, depositRefundDays = rules.RefundDays },
            fees = await FeeCatalogAsync(ct),
            items
        });
    }

    [HttpPost("staff/{reservationId:int}/start")]
    public async Task<IActionResult> Start(int reservationId, CancellationToken ct)
    {
        var staffId = await GetUserIdAsync(2, ct);
        if (staffId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản nhân viên." });

        var r = await LoadForStaffAsync(reservationId, staffId.Value, ct);
        if (r is null) return NotFound(new { message = "Không tìm thấy yêu cầu trả kho tại cơ sở của bạn." });
        var tasks = r.HandoverTasks.Where(t => t.TaskType == MoveOut && t.Status == "Scheduled").ToList();
        if (tasks.Count == 0) return Conflict(new { message = "Yêu cầu trả kho này đã được nhận trước đó." });

        var now = DateTime.UtcNow;
        var today = Today();
        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);
            foreach (var t in tasks)
            {
                t.Status = "In Progress";
                t.AssignedStaffID = staffId.Value;
                var ru = r.ReservationUnits.First(x => x.ReservationUnitID == t.ReservationUnitID);
                if (ru.Status == "Active") { ru.Status = "Returned"; ru.ReturnedOn = today; }
                foreach (var a in r.UnitAccesses.Where(a => a.UnitID == ru.UnitID && a.Status == "Active")) { a.Status = "Returned"; a.ClosedAt = now; }
                ru.Unit.Status = UnitStatus.PendingInspection;
                ru.Unit.UpdatedAt = now;
                ru.Unit.UpdatedByUserID = staffId.Value;
            }
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException exception)
        {
            logger.LogWarning(exception, "Nhận lại kho thất bại ({ReservationId})", reservationId);
            return Conflict(new { message = CleanDbMessage(exception, "Chưa nhận lại kho được, vui lòng thử lại.") });
        }
        return Ok(new { message = "Đã nhận lại kho. Kho chuyển sang trạng thái \"Đang kiểm tra\"; mã / thẻ ra vào của khách đã được thu hồi." });
    }

    [HttpPost("staff/{reservationId:int}/complete")]
    public async Task<IActionResult> Complete(int reservationId, [FromBody] CompleteRequest request, CancellationToken ct)
    {
        var staffId = await GetUserIdAsync(2, ct);
        if (staffId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản nhân viên." });

        var condition = string.Equals(request.Condition, "Damaged", StringComparison.OrdinalIgnoreCase) ? "Damaged" : "Good";
        var fees = (request.Fees ?? []).Where(f => f.Amount > 0).Select(f => f with
        {
            Amount = decimal.Round(f.Amount, 0),
            Description = string.IsNullOrWhiteSpace(f.Description) ? "Phí phát sinh khi trả kho" : f.Description.Trim()
        }).ToList();
        if (fees.Any(f => f.Amount > 100_000_000)) return BadRequest(new { message = "Số tiền phí không hợp lệ." });
        if (condition == "Damaged" && string.IsNullOrWhiteSpace(request.Notes))
            return BadRequest(new { message = "Kho có vấn đề: vui lòng ghi rõ tình trạng để gửi cho khách." });

        var r = await LoadForStaffAsync(reservationId, staffId.Value, ct);
        if (r is null) return NotFound(new { message = "Không tìm thấy yêu cầu trả kho tại cơ sở của bạn." });
        var tasks = r.HandoverTasks.Where(t => t.TaskType == MoveOut && t.Status == "In Progress").ToList();
        if (tasks.Count == 0)
            return Conflict(new { message = r.HandoverTasks.Any(t => t.TaskType == MoveOut && t.Status == "Scheduled")
                ? "Bấm \"Nhận lại kho\" trước khi hoàn tất kiểm tra."
                : "Yêu cầu trả kho này đã kiểm tra xong." });

        var rules = await ReadRulesAsync(ct);
        var now = DateTime.UtcNow;
        var today = Today();
        var feeFeePolicies = await context.FeePolicies.AsNoTracking().Select(f => new { f.FeePolicyID, f.FeeCode }).ToListAsync(ct);

        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);

            // 1) Phí phát sinh: trừ vào cọc trước, phần thiếu khách đóng thêm (hạn 7 ngày).
            var deposits = r.Charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0).OrderBy(c => c.ChargeID).ToList();
            var remaining = deposits.Sum(c => c.Amount);
            decimal fromDeposit = 0, owed = 0;
            Charge NewFee(FeeLine f, decimal amount, bool settled, string suffix) => new()
            {
                ReservationID = r.ReservationID,
                ChargeType = "ExtraFee",
                Description = Trim255($"{f.Description}{suffix}"),
                Amount = amount,
                DueDate = settled ? today : today.AddDays(7),
                Status = settled ? "Paid" : "Unpaid",
                PaidAt = settled ? now : null,
                SettledFromDeposit = settled,
                FeePolicyID = feeFeePolicies.FirstOrDefault(p => string.Equals(p.FeeCode, f.FeeCode, StringComparison.OrdinalIgnoreCase))?.FeePolicyID,
                CreatedAt = now,
                CreatedByUserID = staffId.Value
            };
            foreach (var f in fees)
            {
                if (remaining >= f.Amount)
                {
                    context.Charges.Add(NewFee(f, f.Amount, true, " (trừ vào tiền cọc)"));
                    remaining -= f.Amount; fromDeposit += f.Amount;
                }
                else
                {
                    if (remaining > 0)
                    {
                        context.Charges.Add(NewFee(f, remaining, true, " (phần trừ vào tiền cọc)"));
                        fromDeposit += remaining;
                    }
                    var rest = f.Amount - remaining;
                    context.Charges.Add(NewFee(f, rest, false, remaining > 0 ? " (phần còn thiếu)" : ""));
                    owed += rest; remaining = 0;
                }
            }
            await context.SaveChangesAsync(ct);

            // 2) Cọc còn dư -> hoàn sau N ngày (Payment Refund DepositReturn, Pending, ngày hoàn dự kiến ở ExpiresAt).
            if (remaining > 0)
            {
                var refund = new Payment
                {
                    ReservationID = r.ReservationID,
                    OrderCode = $"RFD-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}",
                    IdempotencyKey = $"RETURN-REFUND-{r.ReservationID}-{Guid.NewGuid():N}",
                    Provider = ManualProvider,
                    Direction = "Refund",
                    RefundReason = "DepositReturn",
                    Amount = remaining,
                    PaymentMethod = "Chuyển khoản hoàn cọc",
                    Status = "Pending",
                    CreatedAt = now,
                    ExpiresAt = now.AddDays(rules.RefundDays),
                    CreatedByUserID = staffId.Value
                };
                context.Payments.Add(refund);
                await context.SaveChangesAsync(ct);
                var left = remaining;
                foreach (var d in deposits)
                {
                    if (left <= 0) break;
                    var part = Math.Min(d.Amount, left);
                    d.RefundedAmount = part; d.RefundPaymentID = refund.PaymentID;
                    left -= part;
                }
                await context.SaveChangesAsync(ct);
            }

            // 3) Kết quả kiểm kho, trạng thái kho, kết thúc đơn + hợp đồng.
            var notes = request.Notes?.Trim();
            var feeText = fees.Count == 0 ? "Không phát sinh phí." : "Phí: " + string.Join("; ", fees.Select(f => $"{f.Description} {Vnd(f.Amount)}đ")) + ".";
            var unitStatus = string.Equals(request.UnitStatus, "Maintenance", StringComparison.OrdinalIgnoreCase) ? UnitStatus.Maintenance : UnitStatus.Available;
            foreach (var t in tasks)
            {
                var customerNote = t.UnitConditionNotes?.StartsWith("Khách ghi chú:") == true ? t.UnitConditionNotes + "\n" : "";
                t.Status = "Completed";
                t.ActualAt = now;
                t.ConditionResult = condition;
                t.UnitConditionNotes = Trim1000($"{customerNote}Kết quả kiểm tra: {(condition == "Good" ? "Không có vấn đề" : "Có vấn đề")}. {notes} {feeText}".Trim());
                var ru = r.ReservationUnits.First(x => x.ReservationUnitID == t.ReservationUnitID);
                ru.Unit.Status = unitStatus;
                ru.Unit.UpdatedAt = now;
                ru.Unit.UpdatedByUserID = staffId.Value;
            }
            await context.SaveChangesAsync(ct);

            if (r.Status == ReservationStatus.HandedOver && r.ReservationUnits.All(ru => ru.Status is not ("Held" or "Active")))
            {
                r.Status = ReservationStatus.Completed;
                r.CompletedAt = now;
                await context.SaveChangesAsync(ct);
                if (r.Contract is not null)
                {
                    r.Contract.ContractStatus = "Completed";
                    r.Contract.ActualEndDate = today < r.Contract.StartDate ? r.Contract.StartDate : today;
                    await context.SaveChangesAsync(ct);
                }
            }

            await transaction.CommitAsync(ct);
            return Ok(new
            {
                message = owed > 0
                    ? $"Đã hoàn tất kiểm tra. Tiền cọc không đủ bù phí: khách cần đóng thêm {Vnd(owed)}đ."
                    : remaining > 0
                        ? $"Đã hoàn tất kiểm tra. Khách được hoàn {Vnd(remaining)}đ tiền cọc sau {rules.RefundDays} ngày."
                        : "Đã hoàn tất kiểm tra. Tiền cọc đã dùng hết để bù phí phát sinh.",
                fromDeposit,
                owed,
                refundAmount = remaining,
                refundDueDate = remaining > 0 ? now.AddDays(rules.RefundDays) : (DateTime?)null
            });
        }
        catch (DbUpdateException exception)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Hoàn tất kiểm kho thất bại ({ReservationId})", reservationId);
            return Conflict(new { message = CleanDbMessage(exception, "Chưa lưu được kết quả kiểm tra, vui lòng thử lại.") });
        }
    }

    // ================================================================== Helpers

    private object BuildRequestDto(Reservation r, List<HandoverTask> tasks, ReturnRules rules)
    {
        var status = tasks.All(t => t.Status == "Completed") ? "Completed" : tasks.Any(t => t.Status != "Scheduled") ? "In Progress" : "Scheduled";
        var first = tasks.OrderBy(t => t.TaskID).First();
        var done = tasks.Where(t => t.Status == "Completed").OrderByDescending(t => t.ActualAt).FirstOrDefault();
        var fees = r.Charges.Where(c => c.ChargeType is "ExtraFee" or "LateFee").OrderBy(c => c.ChargeID).ToList();
        var refund = r.Payments.Where(p => p.Direction == "Refund" && p.RefundReason == "DepositReturn" && p.Provider == ManualProvider)
            .OrderByDescending(p => p.PaymentID).FirstOrDefault();
        return new
        {
            status,
            scheduledDate = first.ScheduledDate?.Date,
            staffName = first.AssignedStaff?.FullName,
            inspectedAt = done?.ActualAt,
            conditionResult = done?.ConditionResult,
            notes = done?.UnitConditionNotes ?? first.UnitConditionNotes,
            depositTotal = DepositPaid(r),
            fees = fees.Select(c => new
            {
                description = c.Description,
                amount = c.Amount,
                fromDeposit = c.SettledFromDeposit,
                status = c.Status
            }),
            deductedFromDeposit = fees.Where(c => c.SettledFromDeposit).Sum(c => c.Amount),
            amountOwed = fees.Where(c => c.Status == "Unpaid").Sum(c => c.Amount),
            refundAmount = refund?.Amount ?? 0m,
            refundStatus = refund?.Status,
            refundDueDate = refund?.ExpiresAt,
            refundedAt = refund?.ConfirmedAt,
            refundDays = rules.RefundDays
        };
    }

    /* Tổng tiền cọc khách đã đóng cho đơn (kể cả phần đang / đã hoàn). */
    private static decimal DepositPaid(Reservation r) =>
        r.Charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Paid").Sum(c => c.Amount);

    private static (bool, string?) CheckEligibility(Reservation r, bool renewed)
    {
        if (renewed) return (false, "Hợp đồng này đã được gia hạn. Muốn trả kho, hãy báo trả trên phụ lục gia hạn mới nhất.");
        if (r.Status != ReservationStatus.HandedOver) return (false, "Chỉ báo trả được kho đang thuê.");
        if (!r.ReservationUnits.Any(ru => ru.Status == "Active")) return (false, "Hợp đồng không còn kho đang thuê.");
        if (r.StartDate.Date > Today()) return (false, "Kỳ thuê chưa bắt đầu (đơn gia hạn). Muốn ngừng thuê, hãy báo trả trên hợp đồng hiện tại.");
        return (true, null);
    }

    /* Ngày trả: báo trước ít nhất N ngày; muộn nhất là ngày hết hạn (đã quá hạn thì trong 3 ngày tới). */
    private static (DateTime Min, DateTime Max) DateWindow(Reservation r, ReturnRules rules, DateTime today)
    {
        var end = r.EndDate.Date;
        if (end < today) return (today, today.AddDays(3));
        var min = today.AddDays(rules.NoticeDays);
        if (min > end) min = end < today.AddDays(1) ? today : end; // báo muộn: chỉ cho trả đúng ngày hết hạn
        return (min, end);
    }

    /* Staff kiểm kho = Staff đã bàn giao kho (việc Move In của đơn này hoặc các đơn trước của cùng kho, cùng khách). */
    private async Task<int?> PickStaffAsync(Reservation r, List<int> unitIds, CancellationToken ct)
    {
        var activeStaff = await context.FacilityStaffs.Where(fs => fs.FacilityID == r.FacilityID && fs.Status == "Active")
            .OrderBy(fs => fs.AssignmentID).Select(fs => fs.UserID).ToListAsync(ct);
        if (activeStaff.Count == 0) return null;
        var moveIn = await context.HandoverTasks.AsNoTracking()
            .Where(t => t.TaskType == "Move In" && t.Status == "Completed" && t.FacilityID == r.FacilityID &&
                        unitIds.Contains(t.UnitID) && t.Reservation!.CustomerID == r.CustomerID)
            .OrderByDescending(t => t.ReservationID == r.ReservationID).ThenByDescending(t => t.ActualAt)
            .Select(t => t.AssignedStaffID)
            .ToListAsync(ct);
        var picked = moveIn.FirstOrDefault(id => activeStaff.Contains(id));
        return picked != 0 ? picked : activeStaff[0];
    }

    private async Task<Reservation?> LoadForStaffAsync(int reservationId, int staffId, CancellationToken ct)
    {
        var facilityIds = await context.FacilityStaffs.Where(fs => fs.UserID == staffId && fs.Status == "Active")
            .Select(fs => fs.FacilityID).ToListAsync(ct);
        return await context.Reservations
            .Include(r => r.Contract)
            .Include(r => r.Charges)
            .Include(r => r.HandoverTasks)
            .Include(r => r.UnitAccesses)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && facilityIds.Contains(r.FacilityID), ct);
    }

    /* Khoản hoàn cọc tới ngày -> ghi nhận đã chuyển khoản (mô phỏng). */
    private async Task ProcessDueRefundsAsync(System.Linq.Expressions.Expression<Func<Reservation, bool>> scope, CancellationToken ct)
    {
        try
        {
            var now = DateTime.UtcNow;
            var ids = await context.Reservations.Where(scope).Select(r => r.ReservationID).ToListAsync(ct);
            var due = await context.Payments
                .Where(p => ids.Contains(p.ReservationID) && p.Direction == "Refund" && p.RefundReason == "DepositReturn" &&
                            p.Provider == ManualProvider && p.Status == "Pending" && p.ExpiresAt != null && p.ExpiresAt <= now)
                .ToListAsync(ct);
            foreach (var p in due)
            {
                p.Status = "Completed";
                p.ProviderTransactionId = $"MANUAL-RFD-{p.PaymentID}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
                p.ReceivedAmount = p.Amount;
                p.ConfirmedAt = now;
            }
            if (due.Count > 0) await context.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Không ghi nhận được khoản hoàn cọc tới hạn");
        }
    }

    private async Task<object> FeeCatalogAsync(CancellationToken ct) =>
        await context.FeePolicies.AsNoTracking()
            .Where(f => f.IsActive && f.FeeCategory == "ExtraFee")
            .OrderBy(f => f.FeeName)
            .Select(f => new { feeCode = f.FeeCode, name = f.FeeName, valueType = f.ValueType, minValue = f.MinValue, maxValue = f.MaxValue })
            .ToListAsync(ct);

    private async Task<ReturnRules> ReadRulesAsync(CancellationToken ct)
    {
        var rules = new ReturnRules(7, 7);
        try
        {
            var result = await facilityManagementService.GetPolicyGroupsAsync(ct);
            if (!result.IsSuccess || result.Data is null) return rules;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(result.Data));
            if (!doc.RootElement.TryGetProperty("current", out var current) || !current.TryGetProperty("renewal_return", out var policy)) return rules;
            var value = policy.TryGetProperty("value", out var v) ? v : policy.TryGetProperty("config", out var c) ? c : default;
            if (value.ValueKind != JsonValueKind.Object) return rules;
            return new ReturnRules(
                Math.Clamp(ReadInt(value, "returnNoticeDays", 7), 0, 90),
                Math.Clamp(ReadInt(value, "depositRefundWorkingDays", 7), 0, 60));
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Không đọc được chính sách trả kho, dùng mặc định.");
            return rules;
        }
    }

    private static int ReadInt(JsonElement obj, string name, int fallback)
    {
        if (!obj.TryGetProperty(name, out var el)) return fallback;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return (int)d;
        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(), out var s)) return (int)s;
        return fallback;
    }

    private static string Vnd(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("vi-VN"));
    private static string Trim255(string s) => s.Length > 255 ? s[..255] : s;
    private static string Trim1000(string s) => s.Length > 1000 ? s[..1000] : s;
    private static DateTime Today() => DateTime.UtcNow.AddHours(7).Date;

    private static string CleanDbMessage(DbUpdateException exception, string fallback)
    {
        var text = exception.InnerException?.Message ?? exception.Message;
        var colon = text.IndexOf(':');
        return colon > 0 && colon < 60 ? text[(colon + 1)..].Trim() : fallback;
    }

    private Task<int?> GetUserIdAsync(int roleId, CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email)) return Task.FromResult<int?>(null);
        return context.Users
            .Where(u => u.Email == email && u.RoleID == roleId && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
    }
}
