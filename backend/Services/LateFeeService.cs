using System.Data;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/*
 * PHÍ TRỄ HẠN (7a) + QUYẾT TOÁN CÔNG NỢ KHI TRẢ KHO (7b) — file THÊM MỚI.
 *
 * 7a. Phí trễ hạn tiền thuê (luật tính: LateFeeRules, mức phí: chính sách "Phí quá hạn & phụ phí" của BOM)
 *   - Chỉ tính cho đơn đang thuê (Handed Over). Mỗi kỳ thuê quá hạn -> 1 khoản Charge "LateFee" (cùng kho + kỳ),
 *     số tiền cập nhật tới hôm nay mỗi khi trang khách / Manager / Staff tải (không cần job chạy nền).
 *   - Khách đóng tiền thuê -> phí chốt theo ngày đã đóng. Khoản đang gắn với giao dịch VNPay chờ thanh toán thì không sửa.
 *   - Khách đóng phí: VNPay (POST /api/vnpay/create đã thu sẵn LateFee cùng tiền thuê) hoặc mô phỏng (pay-demo ở đây).
 *   - Manager / BOM được miễn (Waived, bắt buộc lý do); kỳ đã miễn không tính thêm.
 *   - Phí trễ chưa đóng quá hạn sẽ chặn gia hạn (đã có trong ContractRenewalsController - chính sách requireNoOverdue).
 *
 * 7b. Quyết toán khi trả kho (SettleOnReturnAsync, gọi từ UnitReturnsController.Complete trong cùng transaction)
 *   - Kỳ thuê đã bắt đầu tính tới ngày nhận lại kho mà chưa đóng: tính đủ cả kỳ (không chia theo ngày), trừ vào cọc.
 *     DB chỉ cho trừ cọc với LateFee / ExtraFee (CK_Charge_SettledFromDeposit) nên kỳ thuê đó được hủy và thay bằng
 *     1 khoản ExtraFee "Tiền thuê kỳ ... chưa đóng" cùng số tiền.
 *   - Kỳ thuê chưa bắt đầu (khách trả trước hạn, đã báo trước theo chính sách) -> hủy, không thu.
 *   - Phí trễ hạn (chốt tới ngày quyết toán) + phí cũ chưa đóng -> trừ vào cọc.
 *   - Thứ tự trừ cọc: tiền thuê (kỳ cũ trước) -> phí trễ -> phí cũ -> (sau đó Complete trừ tiếp phí kiểm kho).
 *     Cọc không đủ -> phần thiếu thành khoản chưa đóng (hạn 7 ngày), khách đóng ở mục Trả kho như phí phát sinh.
 */
public class LateFeeService : ILateFeeService
{
    private const int CustomerRoleId = 1;
    private const int StaffRoleId = 2;
    private const int ManagerRoleId = 3;
    private const int BusinessOperationsRoleId = 4;
    private const int OwedDueDays = 7; // giống phí còn thiếu khi trả kho (UnitReturnsController)

    private readonly ILateFeeRepository _repo;
    private readonly IFacilityManagementService _policies;
    private readonly ILogger<LateFeeService> _logger;

    public LateFeeService(ILateFeeRepository repo, IFacilityManagementService policies, ILogger<LateFeeService> logger)
    {
        _repo = repo;
        _policies = policies;
        _logger = logger;
    }

    /* =====================================================================
       KHÁCH
       ===================================================================== */
    public async Task<LateFeeResponse> GetMineAsync(string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, CustomerRoleId, "Vui lòng đăng nhập bằng tài khoản khách hàng.", cancellationToken);
        if (fail is not null) return fail;

        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var today = BusinessClock.Today;
        var (list, _) = await LoadAndSyncAsync(() => _repo.GetCustomerReservationsAsync(user!.UserID, cancellationToken), policy, today, cancellationToken);

        var items = list.Select(r => BuildReservationDto(r, today, policy, includeCustomer: false))
            .Where(x => x is not null)
            .ToList();
        return Ok(new { policy = PolicyDto(policy), items });
    }

    public async Task<LateFeeResponse> PayDemoAsync(int reservationId, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, CustomerRoleId, "Vui lòng đăng nhập bằng tài khoản khách hàng.", cancellationToken);
        if (fail is not null) return fail;

        var owner = await _repo.GetReservationAsync(reservationId, cancellationToken);
        if (owner is null || owner.CustomerID != user!.UserID)
            return Fail(404, "Không tìm thấy đơn thuộc tài khoản này.");
        _repo.ClearTracking(); // đọc lại trong transaction cập nhật phí, không dùng bản vừa tải

        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var today = BusinessClock.Today;
        var r = (await LoadAndSyncAsync(async () =>
        {
            var one = await _repo.GetReservationAsync(reservationId, cancellationToken);
            return one is null ? new List<Reservation>() : new List<Reservation> { one };
        }, policy, today, cancellationToken)).List.FirstOrDefault();
        if (r is null) return Fail(404, "Không tìm thấy đơn thuộc tài khoản này.");

        var due = r.Charges.Where(c => c.ChargeType == "LateFee" && c.Status == "Unpaid").ToList();
        if (due.Count == 0) return Ok(new { message = "Không còn phí trễ hạn nào cần đóng.", amount = 0m });

        var now = DateTime.UtcNow;
        try
        {
            await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);

            // Giao dịch đang chờ của đơn (VNPay bỏ dở) -> hủy, gỡ khỏi các khoản phí, tránh ghi nhận 2 lần (giống các pay-demo khác)
            var pending = r.Payments.Where(p => p.Direction == "Collection" && p.Status == "Pending").ToList();
            foreach (var p in pending) p.Status = "Cancelled";
            var pendingIds = pending.Select(p => p.PaymentID).ToHashSet();
            foreach (var c in r.Charges.Where(c => c.Status == "Unpaid" && c.PaymentID is int id && pendingIds.Contains(id)))
                c.PaymentID = null;
            await _repo.SaveChangesAsync(cancellationToken);

            var payment = new Payment
            {
                ReservationID = r.ReservationID,
                OrderCode = $"LATE-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                IdempotencyKey = $"LATEFEE-{r.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Simulator",
                Direction = "Collection",
                Amount = due.Sum(c => c.Amount),
                PaymentMethod = "QR",
                Status = "Pending",
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(15),
                CreatedByUserID = user.UserID
            };
            _repo.AddPayment(payment);
            await _repo.SaveChangesAsync(cancellationToken);

            foreach (var c in due) c.PaymentID = payment.PaymentID;
            await _repo.SaveChangesAsync(cancellationToken);

            payment.Status = "Completed";
            payment.ProviderTransactionId = $"SIM-LATE-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            payment.ReceivedAmount = payment.Amount;
            payment.ConfirmedAt = now;
            await _repo.SaveChangesAsync(cancellationToken);

            foreach (var c in due) { c.Status = "Paid"; c.PaidAt = now; }
            await _repo.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new { message = $"Đã đóng {Vnd(payment.Amount)}đ phí trễ hạn.", amount = payment.Amount });
        }
        catch (DbUpdateException exception)
        {
            _repo.ClearTracking();
            _logger.LogWarning(exception, "Đóng phí trễ hạn mô phỏng thất bại ({ReservationId})", reservationId);
            return Fail(409, ReadDatabaseMessage(exception, "Chưa đóng được phí trễ hạn, vui lòng thử lại."));
        }
    }

    /* =====================================================================
       MANAGER / STAFF
       ===================================================================== */
    public async Task<LateFeeResponse> GetFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeFacilityAsync(userEmail, facilityId, allowStaff: true, cancellationToken);
        if (fail is not null) return fail;

        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var today = BusinessClock.Today;
        var (list, _) = await LoadAndSyncAsync(() => _repo.GetFacilityReservationsAsync(facilityId, cancellationToken), policy, today, cancellationToken);

        var items = list.Select(r => BuildReservationDto(r, today, policy, includeCustomer: true))
            .Where(x => x is not null)
            .ToList();

        var rentOverdue = list.SelectMany(r => OverdueRents(r, today)).ToList();
        var lateFees = list.SelectMany(r => r.Charges.Where(c => c.ChargeType == "LateFee")).ToList();
        return Ok(new
        {
            policy = PolicyDto(policy),
            summary = new
            {
                overdueRentAmount = rentOverdue.Sum(c => c.Amount),
                overdueRentCount = rentOverdue.Count,
                customersOverdue = list.Count(r => OverdueRents(r, today).Any()),
                lateFeeUnpaid = lateFees.Where(c => c.Status == "Unpaid").Sum(c => c.Amount),
                lateFeePaid = lateFees.Where(c => c.Status == "Paid").Sum(c => c.Amount),
                lateFeeWaived = lateFees.Where(c => c.Status == "Waived").Sum(c => c.Amount),
                owedAfterReturn = list.Where(r => r.Status == ReservationStatus.Completed)
                    .SelectMany(r => r.Charges.Where(c => c.ChargeType is "LateFee" or "ExtraFee" && c.Status == "Unpaid"))
                    .Sum(c => c.Amount)
            },
            items
        });
    }

    public async Task<LateFeeResponse> SyncFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeFacilityAsync(userEmail, facilityId, allowStaff: true, cancellationToken);
        if (fail is not null) return fail;

        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var (_, changes) = await LoadAndSyncAsync(() => _repo.GetFacilityReservationsAsync(facilityId, cancellationToken), policy, BusinessClock.Today, cancellationToken);
        return Ok(new { updated = changes });
    }

    public async Task<LateFeeResponse> WaiveAsync(int chargeId, WaiveLateFeeDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        var reason = request?.Reason?.Trim();
        if (string.IsNullOrWhiteSpace(reason))
            return Fail(400, "Vui lòng ghi lý do miễn phí trễ hạn.");
        if (reason.Length > 255) reason = reason[..255];

        var charge = await _repo.GetChargeAsync(chargeId, cancellationToken);
        if (charge is null || charge.ChargeType != "LateFee")
            return Fail(404, "Không tìm thấy khoản phí trễ hạn.");

        var (user, fail) = await AuthorizeFacilityAsync(userEmail, charge.Reservation.FacilityID, allowStaff: false, cancellationToken);
        if (fail is not null) return fail;

        if (charge.Status != "Unpaid")
            return Fail(409, "Khoản phí này đã được xử lý (đã đóng / đã miễn / đã hủy).");
        if (charge.Payment is not null && IsLivePending(charge.Payment, DateTime.UtcNow))
            return Fail(409, "Khách đang thanh toán khoản phí này qua VNPay. Vui lòng thử lại sau.");

        charge.Status = "Waived";
        charge.WaivedByUserID = user!.UserID;
        charge.WaivedAt = DateTime.UtcNow;
        charge.WaiveReason = reason;
        try
        {
            await _repo.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
        {
            _repo.ClearTracking();
            return Fail(409, ReadDatabaseMessage(exception, "Chưa miễn được phí, vui lòng thử lại."));
        }
        return Ok(new { message = $"Đã miễn {Vnd(charge.Amount)}đ phí trễ hạn. Kỳ thuê này sẽ không tính thêm phí trễ." });
    }

    public async Task<LateFeeResponse> PreviewReturnAsync(int reservationId, string? userEmail, CancellationToken cancellationToken)
    {
        var basic = await _repo.GetReservationAsync(reservationId, cancellationToken);
        if (basic is null) return Fail(404, "Không tìm thấy đơn.");
        var (_, fail) = await AuthorizeFacilityAsync(userEmail, basic.FacilityID, allowStaff: true, cancellationToken);
        if (fail is not null) return fail;
        _repo.ClearTracking(); // đọc lại trong transaction cập nhật phí

        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var today = BusinessClock.Today;
        var r = (await LoadAndSyncAsync(async () =>
        {
            var one = await _repo.GetReservationAsync(reservationId, cancellationToken);
            return one is null ? new List<Reservation>() : new List<Reservation> { one };
        }, policy, today, cancellationToken)).List.FirstOrDefault();
        if (r is null) return Fail(404, "Không tìm thấy đơn.");

        var plan = PlanDebts(r, today);
        var deposit = DepositAvailable(r);
        var debt = plan.RentDebts.Sum(c => c.Amount) + plan.Fees.Sum(c => c.Amount);
        string Unit(Charge c) => UnitNumber(r, c.ReservationUnitID) ?? "";
        return Ok(new
        {
            reservationId = r.ReservationID,
            depositAvailable = deposit,
            rentDebts = plan.RentDebts.Select(c => new { periodStart = c.PeriodStart?.Date, periodEnd = c.PeriodEnd?.Date, unitNumber = Unit(c), amount = c.Amount }),
            futureRents = plan.FutureRents.Select(c => new { periodStart = c.PeriodStart?.Date, periodEnd = c.PeriodEnd?.Date, unitNumber = Unit(c), amount = c.Amount }),
            fees = plan.Fees.Select(c => new { description = c.Description, type = c.ChargeType, amount = c.Amount }),
            debtTotal = debt,
            depositAfterDebt = Math.Max(0m, deposit - debt),
            owedAfterDebt = Math.Max(0m, debt - deposit),
            note = "Công nợ trừ vào cọc trước, sau đó mới tới phí kiểm kho. Kỳ thuê chưa tới (trả trước hạn) được hủy, không thu."
        });
    }

    /* =====================================================================
       7b. QUYẾT TOÁN KHI TRẢ KHO (trong transaction của UnitReturnsController.Complete)
       ===================================================================== */
    public async Task<ReturnDebtResult> SettleOnReturnAsync(Reservation r, decimal depositAvailable, DateTime today, DateTime now,
        int staffUserId, CancellationToken cancellationToken)
    {
        var policy = await LateFeeRules.ReadPolicyAsync(_policies, cancellationToken);
        var feePolicyId = await _repo.GetLateFeePolicyIdAsync(cancellationToken);

        // 1) Giao dịch thu tiền đang chờ (VNPay bỏ dở) -> hủy, gỡ khỏi các khoản sắp quyết toán
        var pending = await _repo.GetPendingCollectionPaymentsAsync(r.ReservationID, cancellationToken);
        if (pending.Count > 0)
        {
            var ids = pending.Select(p => p.PaymentID).ToHashSet();
            foreach (var p in pending) p.Status = "Cancelled";
            foreach (var c in r.Charges.Where(c => c.Status == "Unpaid" && c.PaymentID is int id && ids.Contains(id)))
                c.PaymentID = null;
            await _repo.SaveChangesAsync(cancellationToken);
        }

        // 2) Chốt phí trễ hạn tới ngày quyết toán
        if (SyncReservation(r, policy, today, feePolicyId, now) > 0)
            await _repo.SaveChangesAsync(cancellationToken);

        // 3) Trừ công nợ vào cọc
        var plan = PlanDebts(r, today);
        var remaining = depositAvailable;
        decimal fromDeposit = 0, owed = 0, rentTotal = 0, feeTotal = 0;

        foreach (var future in plan.FutureRents) future.Status = "Cancelled";

        foreach (var rent in plan.RentDebts)
        {
            rentTotal += rent.Amount;
            rent.Status = "Cancelled"; // thay bằng ExtraFee cùng số tiền (DB chỉ cho trừ cọc với LateFee / ExtraFee)
            var label = $"Tiền thuê kỳ {rent.PeriodStart:dd/MM}–{rent.PeriodEnd:dd/MM/yyyy}{UnitLabel(r, rent.ReservationUnitID)} chưa đóng";
            var take = Math.Min(remaining, rent.Amount);
            if (take > 0)
                r.Charges.Add(NewDebtCharge(r, rent, "ExtraFee", $"{label} (trừ vào tiền cọc)", take, settled: true, today, now, staffUserId, null));
            var rest = rent.Amount - take;
            if (rest > 0)
                r.Charges.Add(NewDebtCharge(r, rent, "ExtraFee", $"{label}{(take > 0 ? " (phần còn thiếu)" : "")}", rest, settled: false, today, now, staffUserId, null));
            remaining -= take; fromDeposit += take; owed += rest;
        }

        foreach (var fee in plan.Fees)
        {
            feeTotal += fee.Amount;
            var take = Math.Min(remaining, fee.Amount);
            if (take <= 0)
            {
                owed += fee.Amount;
                continue;
            }
            var rest = fee.Amount - take;
            var baseText = fee.Description ?? (fee.ChargeType == "LateFee" ? "Phí trễ hạn" : "Phí phát sinh");
            fee.Amount = take;
            fee.Description = Trim255($"{baseText} ({(rest > 0 ? "phần " : "")}trừ vào tiền cọc)");
            fee.SettledFromDeposit = true;
            fee.Status = "Paid";
            fee.PaidAt = now;
            fee.PaymentID = null;
            if (rest > 0)
                r.Charges.Add(NewDebtCharge(r, fee, fee.ChargeType, $"{baseText} (phần còn thiếu)", rest, settled: false, today, now, staffUserId, fee.FeePolicyID));
            remaining -= take; fromDeposit += take; owed += rest;
        }

        await _repo.SaveChangesAsync(cancellationToken);

        string? message = null;
        if (rentTotal + feeTotal > 0 || plan.FutureRents.Count > 0)
        {
            var parts = new List<string>();
            if (rentTotal > 0) parts.Add($"tiền thuê chưa đóng {Vnd(rentTotal)}đ");
            if (feeTotal > 0) parts.Add($"phí trễ hạn / phí cũ {Vnd(feeTotal)}đ");
            message = parts.Count > 0
                ? $"Công nợ trước khi trả kho ({string.Join(", ", parts)}) đã trừ {Vnd(fromDeposit)}đ vào cọc" +
                  (owed > 0 ? $", còn thiếu {Vnd(owed)}đ." : ".")
                : null;
            if (plan.FutureRents.Count > 0)
                message = $"{message} Đã hủy {plan.FutureRents.Count} kỳ tiền thuê chưa tới (trả kho trước hạn).".Trim();
        }
        return new ReturnDebtResult(remaining, fromDeposit, owed, plan.FutureRents.Count, message);
    }

    /* =====================================================================
       Đồng bộ phí trễ hạn
       ===================================================================== */

    /* Tải + cập nhật phí trong 1 transaction Serializable (2 trang mở cùng lúc không tạo trùng khoản phí).
       Lỗi khi cập nhật thì vẫn trả dữ liệu hiện có, lần tải sau thử lại. */
    private async Task<(List<Reservation> List, int Changes)> LoadAndSyncAsync(
        Func<Task<List<Reservation>>> loader, LateFeeRules.Policy policy, DateTime today, CancellationToken cancellationToken)
    {
        if (_repo.HasActiveTransaction)
        {
            var inTx = await loader();
            var feePolicy = await _repo.GetLateFeePolicyIdAsync(cancellationToken);
            var n = inTx.Sum(r => SyncReservation(r, policy, today, feePolicy, DateTime.UtcNow));
            if (n > 0) await _repo.SaveChangesAsync(cancellationToken);
            return (inTx, n);
        }

        try
        {
            await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var list = await loader();
            var feePolicyId = await _repo.GetLateFeePolicyIdAsync(cancellationToken);
            var now = DateTime.UtcNow;
            var changes = list.Sum(r => SyncReservation(r, policy, today, feePolicyId, now));
            if (changes > 0) await _repo.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return (list, changes);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(exception, "Không cập nhật được phí trễ hạn, hiển thị dữ liệu hiện có.");
            _repo.ClearTracking();
            return (await loader(), 0);
        }
    }

    /* Cập nhật phí trễ của MỘT đơn đang thuê theo LateFeeRules. Trả về số khoản phí thêm / sửa / hủy. */
    private static int SyncReservation(Reservation r, LateFeeRules.Policy policy, DateTime today, int? feePolicyId, DateTime now)
    {
        if (r.Status != ReservationStatus.HandedOver) return 0;

        var pendingIds = r.Payments
            .Where(p => IsLivePending(p, now))
            .Select(p => p.PaymentID)
            .ToHashSet();
        bool Locked(Charge c) => c.PaymentID is int id && pendingIds.Contains(id);

        var changes = 0;
        foreach (var rent in r.Charges.Where(c => c.ChargeType == "Rent" && c.Status != "Cancelled").ToList())
        {
            var unit = r.ReservationUnits.FirstOrDefault(ru => ru.ReservationUnitID == rent.ReservationUnitID);
            var lateFrom = LateFeeRules.LateFrom(rent, unit);

            bool open;
            DateTime until;
            if (rent.Status == "Unpaid")
            {
                if (lateFrom >= today) continue;           // chưa quá hạn
                open = true; until = today;                  // còn nợ: tính tới hôm nay
            }
            else if (rent.Status == "Paid" && rent.PaidAt is DateTime paidAt)
            {
                open = false; until = paidAt.AddHours(7).Date; // đã đóng: chốt theo ngày đóng (giờ VN)
            }
            else continue;                                   // Waived

            var fees = r.Charges.Where(f => LateFeeRules.IsLateFeeFor(f, rent) && f.Status != "Cancelled").OrderBy(f => f.ChargeID).ToList();
            if (fees.Any(f => f.Status == "Waived")) continue;                // Manager đã miễn kỳ này
            if (fees.Any(f => f.Status == "Unpaid" && Locked(f))) continue;   // đang chờ VNPay: không sửa số tiền

            var result = LateFeeRules.Compute(rent.Amount, lateFrom, until, policy);
            var settled = fees.Where(f => f.Status == "Paid").Sum(f => f.Amount);
            var unpaid = fees.Where(f => f.Status == "Unpaid").ToList();
            var editable = unpaid.FirstOrDefault();
            foreach (var duplicate in unpaid.Skip(1)) { duplicate.Status = "Cancelled"; changes++; }

            var target = result.Fee - settled;
            var description = LateFeeRules.Describe(rent, unit?.Unit?.UnitNumber, result.DaysLate);
            if (editable is not null)
            {
                if (target <= 0) { editable.Status = "Cancelled"; changes++; }
                else if (editable.Amount != target || editable.Description != description)
                {
                    editable.Amount = target;
                    editable.Description = description;
                    changes++;
                }
            }
            // Đã đóng tiền thuê mà phí trễ đã thu cùng giao dịch -> coi như xong, không phát sinh thêm
            else if (target > 0 && (open || fees.Count == 0))
            {
                r.Charges.Add(new Charge
                {
                    ReservationID = r.ReservationID,
                    ReservationUnitID = rent.ReservationUnitID,
                    ChargeType = "LateFee",
                    Description = description,
                    PeriodStart = rent.PeriodStart,
                    PeriodEnd = rent.PeriodEnd,
                    Amount = target,
                    DueDate = today,
                    Status = "Unpaid",
                    FeePolicyID = feePolicyId,
                    CreatedAt = now
                });
                changes++;
            }
        }
        return changes;
    }

    private sealed record DebtPlan(List<Charge> RentDebts, List<Charge> FutureRents, List<Charge> Fees);

    /* Công nợ khi trả kho: kỳ đã bắt đầu tới ngày nhận lại kho = nợ; kỳ sau đó = hủy; phí chưa đóng = nợ. */
    private static DebtPlan PlanDebts(Reservation r, DateTime today)
    {
        var rentDebts = new List<Charge>();
        var futureRents = new List<Charge>();
        foreach (var rent in r.Charges.Where(c => c.ChargeType == "Rent" && c.Status == "Unpaid").OrderBy(c => c.PeriodStart).ThenBy(c => c.ChargeID))
        {
            var unit = r.ReservationUnits.FirstOrDefault(ru => ru.ReservationUnitID == rent.ReservationUnitID);
            var returnedOn = unit?.ReturnedOn?.Date ?? today;
            if (rent.PeriodStart?.Date > returnedOn) futureRents.Add(rent);
            else rentDebts.Add(rent);
        }
        var fees = r.Charges
            .Where(c => c.ChargeType is "LateFee" or "ExtraFee" && c.Status == "Unpaid")
            .OrderBy(c => c.ChargeType == "LateFee" ? 0 : 1).ThenBy(c => c.ChargeID)
            .ToList();
        return new DebtPlan(rentDebts, futureRents, fees);
    }

    private static Charge NewDebtCharge(Reservation r, Charge source, string type, string description, decimal amount,
        bool settled, DateTime today, DateTime now, int staffUserId, int? feePolicyId) => new()
    {
        ReservationID = r.ReservationID,
        ReservationUnitID = source.ReservationUnitID,
        ChargeType = type,
        Description = Trim255(description),
        PeriodStart = source.PeriodStart,
        PeriodEnd = source.PeriodEnd,
        Amount = amount,
        DueDate = settled ? today : today.AddDays(OwedDueDays),
        Status = settled ? "Paid" : "Unpaid",
        PaidAt = settled ? now : null,
        SettledFromDeposit = settled,
        FeePolicyID = feePolicyId,
        CreatedAt = now,
        CreatedByUserID = staffUserId
    };

    /* =====================================================================
       Dữ liệu trả về
       ===================================================================== */
    private static List<Charge> OverdueRents(Reservation r, DateTime today) =>
        r.Status != ReservationStatus.HandedOver
            ? new List<Charge>()
            : r.Charges.Where(c => c.ChargeType == "Rent" && c.Status == "Unpaid" &&
                                   LateFeeRules.LateFrom(c, r.ReservationUnits.FirstOrDefault(ru => ru.ReservationUnitID == c.ReservationUnitID)) < today)
                .OrderBy(c => c.PeriodStart).ToList();

    private static object? BuildReservationDto(Reservation r, DateTime today, LateFeeRules.Policy policy, bool includeCustomer)
    {
        var overdue = OverdueRents(r, today);
        var lateFees = r.Charges.Where(c => c.ChargeType == "LateFee" && c.Status != "Cancelled").OrderBy(c => c.PeriodStart).ThenBy(c => c.ChargeID).ToList();
        var otherUnpaid = r.Charges.Where(c => c.ChargeType == "ExtraFee" && c.Status == "Unpaid").Sum(c => c.Amount);
        if (overdue.Count == 0 && lateFees.Count == 0 && otherUnpaid == 0) return null;

        return new
        {
            reservationId = r.ReservationID,
            reservationCode = r.ReservationCode,
            contractNumber = r.Contract?.ContractNumber,
            status = r.Status,
            customerName = includeCustomer ? r.Customer?.FullName : null,
            customerPhone = includeCustomer ? r.Customer?.PhoneNumber : null,
            customerEmail = includeCustomer ? r.Customer?.Email : null,
            overdueRent = overdue.Select(c =>
            {
                var unit = r.ReservationUnits.FirstOrDefault(ru => ru.ReservationUnitID == c.ReservationUnitID);
                var lateFrom = LateFeeRules.LateFrom(c, unit);
                var days = Math.Max(0, (today - lateFrom).Days);
                return new
                {
                    chargeId = c.ChargeID,
                    periodStart = c.PeriodStart?.Date,
                    periodEnd = c.PeriodEnd?.Date,
                    unitNumber = unit?.Unit?.UnitNumber,
                    amount = c.Amount,
                    dueDate = c.DueDate.Date,
                    lateFrom,
                    daysLate = days,
                    // còn mấy ngày nữa thì bắt đầu tính phí (0 = đang tính phí)
                    graceDaysLeft = Math.Max(0, policy.GraceDays - days)
                };
            }),
            overdueRentAmount = overdue.Sum(c => c.Amount),
            lateFees = lateFees.Select(c => new
            {
                chargeId = c.ChargeID,
                description = c.Description,
                periodStart = c.PeriodStart?.Date,
                periodEnd = c.PeriodEnd?.Date,
                unitNumber = UnitNumber(r, c.ReservationUnitID),
                amount = c.Amount,
                status = c.Status,
                settledFromDeposit = c.SettledFromDeposit,
                paidAt = c.PaidAt,
                waiveReason = c.WaiveReason,
                waivedAt = c.WaivedAt,
                pendingPayment = c.PaymentID is int pid && r.Payments.Any(p => p.PaymentID == pid && IsLivePending(p, DateTime.UtcNow))
            }),
            lateFeeUnpaid = lateFees.Where(c => c.Status == "Unpaid").Sum(c => c.Amount),
            lateFeePaid = lateFees.Where(c => c.Status == "Paid").Sum(c => c.Amount),
            lateFeeWaived = lateFees.Where(c => c.Status == "Waived").Sum(c => c.Amount),
            otherUnpaid
        };
    }

    private static object PolicyDto(LateFeeRules.Policy p) => new
    {
        feeType = p.FeeType,
        feeValue = p.FeeValue,
        period = p.Period,
        graceDays = p.GraceDays,
        maxPercent = p.MaxPercent,
        summary = p.Summary
    };

    /* Giao dịch thu đang chờ và còn hạn (VNPay bỏ dở quá hạn thì không giữ khóa khoản phí nữa). */
    private static bool IsLivePending(Payment p, DateTime now) =>
        p.Direction == "Collection" && p.Status == "Pending" && (p.ExpiresAt is null || p.ExpiresAt > now);

    private static decimal DepositAvailable(Reservation r) =>
        r.Charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0).Sum(c => c.Amount);

    private static string? UnitNumber(Reservation r, long? reservationUnitId) =>
        r.ReservationUnits.FirstOrDefault(ru => ru.ReservationUnitID == reservationUnitId)?.Unit?.UnitNumber;

    private static string UnitLabel(Reservation r, long? reservationUnitId) =>
        UnitNumber(r, reservationUnitId) is { } n ? $" (kho {n})" : "";

    /* =====================================================================
       Phân quyền
       ===================================================================== */
    private async Task<(User? User, LateFeeResponse? Fail)> AuthorizeRoleAsync(string? email, int roleId, string message, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email)) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        if (user is null) return (null, Fail(401, "Tài khoản không hợp lệ hoặc đã bị khóa."));
        if (user.RoleID != roleId) return (null, Fail(403, message));
        return (user, null);
    }

    // Manager của cơ sở / BOM; allowStaff: thêm nhân viên Active của cơ sở
    private async Task<(User? User, LateFeeResponse? Fail)> AuthorizeFacilityAsync(string? email, int facilityId, bool allowStaff, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email)) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        if (user is null) return (null, Fail(401, "Tài khoản không hợp lệ hoặc đã bị khóa."));
        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken)) return (null, Fail(404, "Không tìm thấy cơ sở."));

        if (user.RoleID == BusinessOperationsRoleId) return (user, null);
        if (user.RoleID == ManagerRoleId && await _repo.IsManagerOfFacilityAsync(user.UserID, facilityId, cancellationToken)) return (user, null);
        if (allowStaff && user.RoleID == StaffRoleId && await _repo.IsActiveStaffOfFacilityAsync(user.UserID, facilityId, cancellationToken)) return (user, null);

        return (null, Fail(403, allowStaff
            ? "Bạn chỉ xem được công nợ của cơ sở mình làm việc / quản lý."
            : "Chỉ Facility Manager của cơ sở (hoặc Business Operations) mới được miễn phí trễ hạn."));
    }

    /* ---------- helpers ---------- */
    private static string ReadDatabaseMessage(DbUpdateException ex, string fallback)
    {
        var message = ex.InnerException?.Message;
        if (string.IsNullOrWhiteSpace(message)) return fallback;
        var colon = message.IndexOf(':');
        var text = colon >= 0 && colon < 60 ? message[(colon + 1)..].Trim() : fallback;
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private static string Vnd(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("vi-VN"));
    private static string Trim255(string s) => s.Length > 255 ? s[..255] : s;
    private static LateFeeResponse Ok(object data) => new(true, null, 200, data);
    private static LateFeeResponse Fail(int statusCode, string message) => new(false, message, statusCode, null);
}
