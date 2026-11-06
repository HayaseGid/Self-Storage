using System.Data;
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
 * GIA HẠN HỢP ĐỒNG CỦA KHÁCH HÀNG (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 *   GET  /api/contract-renewals/mine           -> các hợp đồng của khách + điều kiện & báo giá gia hạn
 *   POST /api/contract-renewals                -> { reservationId, months, paymentPlan: "Monthly"|"Upfront", expectedAmount } tạo đơn gia hạn CHỜ THANH TOÁN
 *   POST /api/contract-renewals/{id}/pay-demo  -> thanh toán mô phỏng (khi chưa dùng VNPay) rồi hoàn tất gia hạn
 *   POST /api/contract-renewals/{id}/finalize  -> thử hoàn tất lại (đã thanh toán nhưng lỗi giữa chừng)
 *   POST /api/contract-renewals/{id}/cancel    -> hủy đơn gia hạn đang chờ thanh toán
 *   Thanh toán thật: POST /api/vnpay/create { reservationIds: [id đơn gia hạn] } như đặt cọc.
 *
 * Cách làm (đúng ràng buộc của SelfStorageDB_test.sql):
 *   - Mỗi Reservation chỉ có 1 Contract và ngày của Contract phải trùng Reservation, nên gia hạn = tạo
 *     Reservation MỚI cho đúng các kho đang thuê, bắt đầu từ ngày hôm sau ngày hết hạn cũ,
 *     cùng Contract MỚI có RenewedFromContractID = hợp đồng cũ.
 *   - Giá gia hạn: bảng giá (RentalRate) hiện hành + % giảm của gói (ContractType), giống lúc đặt mới.
 *   - Khách CHỌN LẠI hình thức trả khi gia hạn (mặc định giữ hình thức cũ). Trả ngay khi gia hạn:
 *     trả 1 lần -> toàn bộ tiền thuê kỳ mới; trả theo tháng -> tháng đầu kỳ mới (các tháng sau trả hằng tháng);
 *     cộng phần cọc bổ sung nếu giá tăng. Tiền cọc kỳ cũ được chuyển sang kỳ mới (RentPaymentRules / ContractRenewalFinalizer).
 *   - Không gia hạn khi còn nợ tiền thuê / phí quá hạn (chính sách requireNoOverdue).
 *   - Thanh toán xong (ContractRenewalFinalizer): đơn được xác nhận + tạo hợp đồng (phụ lục gia hạn) + bàn giao ngay
 *     (khách đang giữ kho, không cần Staff bàn giao lại). Khách ký phụ lục gia hạn online ngay sau đó.
 *   - Khi kỳ cũ kết thúc: kỳ cũ được đóng (Completed), hợp đồng cũ chuyển "Renewed",
 *     quyền truy cập kho (mã/thẻ) được chuyển sang kỳ mới. Việc này chạy mỗi khi gọi API này.
 *   - Điều kiện lấy từ chính sách "renewal_return" (BOM chỉnh): renewalNoticeDays, min/maxRenewalMonths, requireNoOverdue.
 */
[ApiController]
[Route("api/contract-renewals")]
public sealed class ContractRenewalsController(
    SelfStorageDbContext context,
    IFacilityManagementService facilityManagementService,
    ILogger<ContractRenewalsController> logger) : ControllerBase
{
    private static readonly int[] AllowedMonths = [1, 3, 6, 12];
    // Tạm bỏ giảm giá theo gói (yêu cầu 29/10/2026). Làm lại giảm giá thì đổi thành true.
    private const bool ApplyContractDiscount = false;
    private static readonly string[] RenewableContractStatuses = ["Active", "Expiring Soon"];
    // Thời gian giữ yêu cầu gia hạn chờ thanh toán (giống giữ kho khi đặt cọc).
    private const int PaymentHoldMinutes = 15;

    public sealed record RenewContractRequest(int ReservationId, int Months, string? PaymentPlan, decimal? ExpectedAmount);

    private sealed record RenewalRules(int NoticeDays, int MinMonths, int MaxMonths, bool RequireNoOverdue);

    private sealed record UnitQuote(
        int UnitId, string UnitNumber, int UnitTypeId, int UnitSizeId, string? TypeName, string? SizeLabel,
        decimal ListPrice, decimal MonthlyPrice, decimal OldDeposit, decimal NewDeposit)
    {
        /* Phần cọc chuyển từ kỳ cũ sang (không thu tiền). */
        public decimal Transfer => Math.Min(NewDeposit, OldDeposit);
        /* Cọc phải thu thêm: giá tăng, hoặc kho không còn cọc cũ. */
        public decimal TopUp => Math.Max(0m, NewDeposit - OldDeposit);
        /* Cọc cũ dư (giá giảm) -> hoàn lại khách. */
        public decimal Excess => Math.Max(0m, OldDeposit - NewDeposit);
    }

    private sealed record PlanQuote(
        int Months, decimal DiscountPercent, DateTime StartDate, DateTime EndDate,
        decimal MonthlyBase, decimal Monthly, decimal Rent, decimal NewDeposit, decimal OldDeposit,
        decimal FirstMonth, decimal DepositTransfer, decimal DepositTopUp,
        decimal AmountDue, decimal RefundAmount, List<UnitQuote> Units)
    {
        /* Trả ngay khi gia hạn theo hình thức trả: 1 lần = toàn bộ tiền thuê kỳ mới, theo tháng = tháng đầu; + cọc bổ sung. */
        public decimal AmountDueFor(string plan) => (plan == PaymentPlan.Upfront ? Rent : FirstMonth) + DepositTopUp;
    }

    // ------------------------------------------------------------------ GET

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        await TryFinalizePaidRenewalsAsync(customerId.Value, cancellationToken);
        await TrySettleEndedTermsAsync(customerId.Value, cancellationToken);

        var rules = await ReadRulesAsync(cancellationToken);
        var plans = await GetPlansAsync(rules, cancellationToken);
        var reservations = await LoadCustomerReservationsAsync(customerId.Value, null, cancellationToken);

        // Yêu cầu gia hạn đang chờ thanh toán (còn thời gian giữ) -> cho khách thanh toán tiếp hoặc hủy.
        var nowUtc = DateTime.UtcNow;
        var prefix = ContractRenewalFinalizer.CodePrefix;
        var pendingRenewals = await context.Reservations.AsNoTracking()
            .Include(r => r.Charges)
            .Where(r => r.CustomerID == customerId.Value &&
                        r.ReservationCode.StartsWith(prefix) &&
                        r.Status == ReservationStatus.PendingPayment &&
                        r.HoldExpiresAt > nowUtc)
            .ToListAsync(cancellationToken);

        var contractIds = reservations.Where(r => r.Contract != null).Select(r => r.Contract!.ContractID).ToList();
        var renewals = await context.Contracts.AsNoTracking()
            .Include(c => c.Reservation)
            .Where(c => c.RenewedFromContractID != null && contractIds.Contains(c.RenewedFromContractID.Value))
            .ToListAsync(cancellationToken);
        var parentIds = reservations
            .Where(r => r.Contract?.RenewedFromContractID != null)
            .Select(r => r.Contract!.RenewedFromContractID!.Value)
            .ToList();
        var parents = await context.Contracts.AsNoTracking()
            .Include(c => c.Reservation)
            .Where(c => parentIds.Contains(c.ContractID))
            .ToListAsync(cancellationToken);
        var renewalContractIds = renewals.Select(c => c.ContractID).ToList();
        var signedRenewalIds = await context.Contracts.AsNoTracking()
            .Where(c => renewalContractIds.Contains(c.ContractID) && c.Signature != null)
            .Select(c => c.ContractID)
            .ToListAsync(cancellationToken);

        var today = Today();
        var items = reservations.Where(r => r.Contract != null).Select(r =>
        {
            var contract = r.Contract!;
            var renewedBy = renewals.FirstOrDefault(c => c.RenewedFromContractID == contract.ContractID
                                                        && c.Reservation.Status != ReservationStatus.Cancelled);
            var renewedFrom = contract.RenewedFromContractID is null
                ? null
                : parents.FirstOrDefault(c => c.ContractID == contract.RenewedFromContractID);
            var (eligible, reason) = CheckEligibility(r, renewedBy != null, rules, today);
            var deadline = r.EndDate.Date.AddDays(-rules.NoticeDays);
            var pending = renewedBy != null ? null : pendingRenewals.FirstOrDefault(p =>
                p.FacilityID == r.FacilityID && p.StartDate.Date == r.EndDate.Date.AddDays(1));

            return new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                contractStatus = contract.ContractStatus,
                facilityId = r.FacilityID,
                facility = r.Facility.FacilityName,
                startDate = r.StartDate.Date,
                endDate = r.EndDate.Date,
                months = r.RentalPeriod,
                paymentPlan = r.PaymentPlan, // hình thức trả hiện tại -> chọn sẵn khi gia hạn
                daysLeft = (r.EndDate.Date - today).Days,
                renewDeadline = deadline,
                eligible,
                reason,
                renewedBy = renewedBy == null ? null : new
                {
                    reservationId = renewedBy.ReservationID,
                    reservationCode = renewedBy.Reservation.ReservationCode,
                    contractId = renewedBy.ContractID,
                    contractNumber = renewedBy.ContractNumber,
                    startDate = renewedBy.StartDate.Date,
                    endDate = renewedBy.EndDate.Date,
                    months = renewedBy.Reservation.RentalPeriod,
                    isSigned = signedRenewalIds.Contains(renewedBy.ContractID)
                },
                pendingRenewal = pending == null ? null : new
                {
                    reservationId = pending.ReservationID,
                    reservationCode = pending.ReservationCode,
                    months = pending.RentalPeriod,
                    paymentPlan = pending.PaymentPlan,
                    startDate = pending.StartDate.Date,
                    endDate = pending.EndDate.Date,
                    amountDue = pending.Charges.Where(c => ContractRenewalFinalizer.IsPayableNow(c, pending)).Sum(c => c.Amount),
                    paid = !pending.Charges.Any(c => ContractRenewalFinalizer.IsPayableNow(c, pending)),
                    holdExpiresAt = pending.HoldExpiresAt
                },
                renewedFrom = renewedFrom == null ? null : new
                {
                    reservationId = renewedFrom.ReservationID,
                    reservationCode = renewedFrom.Reservation.ReservationCode,
                    contractId = renewedFrom.ContractID,
                    contractNumber = renewedFrom.ContractNumber,
                    startDate = renewedFrom.StartDate.Date,
                    endDate = renewedFrom.EndDate.Date
                },
                quotes = eligible ? plans.Select(p => ToQuoteDto(BuildQuote(r, p.Months, p.DiscountRate))).ToList() : []
            };
        }).ToList();

        return Ok(new
        {
            rules = new
            {
                renewalNoticeDays = rules.NoticeDays,
                minRenewalMonths = rules.MinMonths,
                maxRenewalMonths = rules.MaxMonths,
                requireNoOverdue = rules.RequireNoOverdue
            },
            plans = plans.Select(p => new { months = p.Months, discountPercent = p.DiscountRate }),
            items
        });
    }

    // ------------------------------------------------------------------ POST: tạo đơn gia hạn chờ thanh toán

    [HttpPost]
    public async Task<IActionResult> Renew([FromBody] RenewContractRequest request, CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        if (!AllowedMonths.Contains(request.Months))
            return BadRequest(new { message = "Kỳ gia hạn chỉ được chọn 1, 3, 6 hoặc 12 tháng." });

        // Không gửi = giữ hình thức trả của hợp đồng hiện tại; gửi sai = báo lỗi
        var requestedPlan = request.PaymentPlan is null ? null : PaymentPlan.Normalize(request.PaymentPlan);
        if (request.PaymentPlan is not null && requestedPlan is null)
            return BadRequest(new { message = "Hình thức trả chỉ được là trả theo tháng hoặc trả 1 lần." });

        await TrySettleEndedTermsAsync(customerId.Value, cancellationToken);

        var rules = await ReadRulesAsync(cancellationToken);
        var plans = await GetPlansAsync(rules, cancellationToken);
        var plan = plans.FirstOrDefault(p => p.Months == request.Months);
        if (plan is null)
            return BadRequest(new { message = $"Theo chính sách hiện hành, kỳ gia hạn phải từ {rules.MinMonths} đến {rules.MaxMonths} tháng." });

        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

            var old = (await LoadCustomerReservationsAsync(customerId.Value, request.ReservationId, cancellationToken)).FirstOrDefault();
            if (old?.Contract is null)
                return NotFound(new { message = "Không tìm thấy hợp đồng thuộc tài khoản này." });

            var alreadyRenewed = await context.Contracts.AnyAsync(c =>
                c.RenewedFromContractID == old.Contract.ContractID &&
                c.Reservation.Status != ReservationStatus.Cancelled, cancellationToken);

            var (eligible, reason) = CheckEligibility(old, alreadyRenewed, rules, Today());
            if (!eligible)
                return Conflict(new { message = reason });

            var paymentPlan = requestedPlan ?? old.PaymentPlan;
            var quote = BuildQuote(old, plan.Months, plan.DiscountRate);
            var amountDue = quote.AmountDueFor(paymentPlan);
            if (quote.Units.Count == 0)
                return Conflict(new { message = "Hợp đồng không còn kho đang thuê để gia hạn." });
            if (quote.Units.Any(u => u.ListPrice <= 0))
                return Conflict(new { message = "Có kho chưa được cấu hình giá thuê hiện hành, vui lòng liên hệ cơ sở." });

            if (request.ExpectedAmount is not null && request.ExpectedAmount.Value != amountDue)
                return Conflict(new
                {
                    message = "Giá gia hạn vừa thay đổi theo bảng giá mới. Vui lòng xem lại số tiền và xác nhận lại.",
                    quote = ToQuoteDto(quote)
                });

            var now = DateTime.UtcNow;

            // Đã có đơn gia hạn đang chờ thanh toán: cùng kỳ + cùng số tiền thì dùng lại, khác thì hủy để tạo đơn mới.
            var pending = await FindPendingRenewalsAsync(old, now, cancellationToken);
            var reusable = pending.FirstOrDefault(p => p.RentalPeriod == quote.Months &&
                                                       p.PaymentPlan == paymentPlan &&
                                                       p.Charges.Where(c => ContractRenewalFinalizer.IsPayableNow(c, p)).Sum(c => c.Amount) == amountDue);
            foreach (var stale in pending.Where(p => p != reusable))
                await CancelPendingAsync(stale, customerId.Value, "Khách chọn lại kỳ gia hạn", now, cancellationToken);

            var renewal = reusable ?? await CreatePendingRenewalAsync(old, quote, paymentPlan, customerId.Value, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return StatusCode(reusable is null ? 201 : 200, new
            {
                message = $"Đã tạo yêu cầu gia hạn hợp đồng {old.Contract.ContractNumber} thêm {quote.Months} tháng ({PaymentPlan.Label(paymentPlan).ToLowerInvariant()}). Vui lòng thanh toán để hoàn tất.",
                reservationId = renewal.ReservationID,
                reservationCode = renewal.ReservationCode,
                renewedFromContractNumber = old.Contract.ContractNumber,
                startDate = quote.StartDate,
                endDate = quote.EndDate,
                months = quote.Months,
                paymentPlan,
                amountDue,
                holdExpiresAt = renewal.HoldExpiresAt,
                quote = ToQuoteDto(quote)
            });
        }
        catch (DbUpdateException exception)
        {
            var text = exception.InnerException?.Message ?? exception.Message;
            logger.LogWarning(exception, "Tạo đơn gia hạn thất bại (reservation {ReservationId})", request.ReservationId);
            if (text.Contains("RESERVATION_OVERLAP", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = "Kho đã có người đặt cho thời gian sau hợp đồng hiện tại nên không thể gia hạn. Vui lòng liên hệ cơ sở." });
            return Conflict(new { message = CleanDbMessage(text, "Không thể gia hạn hợp đồng lúc này. Vui lòng thử lại.") });
        }
    }

    // ------------------------------------------------------------------ POST: thanh toán mô phỏng / hoàn tất / hủy

    /* Thanh toán mô phỏng (giống POST /api/payment/confirm của đặt cọc) rồi hoàn tất gia hạn. */
    [HttpPost("{reservationId:int}/pay-demo")]
    public async Task<IActionResult> PayDemo(int reservationId, CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var renewal = await context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId.Value, cancellationToken);
        if (renewal is null || !ContractRenewalFinalizer.IsRenewal(renewal))
            return NotFound(new { message = "Không tìm thấy đơn gia hạn thuộc tài khoản này." });

        var now = DateTime.UtcNow;
        if (renewal.Status == ReservationStatus.PendingPayment)
        {
            if (renewal.HoldExpiresAt <= now)
                return Conflict(new { message = "Yêu cầu gia hạn đã quá thời gian chờ thanh toán. Vui lòng gia hạn lại." });

            var payable = renewal.Charges.Where(c => ContractRenewalFinalizer.IsPayableNow(c, renewal)).ToList();
            if (payable.Count > 0)
            {
                try
                {
                    await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);
                    foreach (var old in renewal.Payments.Where(p => p.Status == "Pending")) old.Status = "Cancelled";
                    await context.SaveChangesAsync(cancellationToken);

                    var payment = new Payment
                    {
                        ReservationID = renewal.ReservationID,
                        OrderCode = $"ORD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                        IdempotencyKey = $"RENEW-PAY-{renewal.ReservationID}-{Guid.NewGuid():N}",
                        Provider = "Simulator",
                        Direction = "Collection",
                        Amount = payable.Sum(c => c.Amount),
                        PaymentMethod = "QR",
                        Status = "Pending",
                        CreatedAt = now,
                        ExpiresAt = renewal.HoldExpiresAt,
                        CreatedByUserID = customerId.Value
                    };
                    context.Payments.Add(payment);
                    await context.SaveChangesAsync(cancellationToken);

                    foreach (var charge in payable) charge.PaymentID = payment.PaymentID;
                    await context.SaveChangesAsync(cancellationToken);

                    payment.Status = "Completed";
                    payment.ProviderTransactionId = $"SIM-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
                    payment.ReceivedAmount = payment.Amount;
                    payment.ConfirmedAt = now;
                    await context.SaveChangesAsync(cancellationToken);

                    foreach (var charge in payable) { charge.Status = "Paid"; charge.PaidAt = now; }
                    await context.SaveChangesAsync(cancellationToken);
                    await transaction.CommitAsync(cancellationToken);
                }
                catch (DbUpdateException exception)
                {
                    logger.LogWarning(exception, "Thanh toán mô phỏng gia hạn thất bại ({ReservationId})", reservationId);
                    return Conflict(new { message = CleanDbMessage(exception.InnerException?.Message ?? exception.Message, "Chưa thanh toán được, vui lòng thử lại.") });
                }
            }
        }

        return await FinalizeResponseAsync(reservationId, customerId.Value, cancellationToken);
    }

    [HttpPost("{reservationId:int}/finalize")]
    public async Task<IActionResult> Finalize(int reservationId, CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });
        var owns = await context.Reservations.AnyAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId.Value, cancellationToken);
        if (!owns)
            return NotFound(new { message = "Không tìm thấy đơn gia hạn thuộc tài khoản này." });
        return await FinalizeResponseAsync(reservationId, customerId.Value, cancellationToken);
    }

    [HttpPost("{reservationId:int}/cancel")]
    public async Task<IActionResult> Cancel(int reservationId, CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var renewal = await context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Include(r => r.ReservationUnits)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId.Value, cancellationToken);
        if (renewal is null || !ContractRenewalFinalizer.IsRenewal(renewal))
            return NotFound(new { message = "Không tìm thấy đơn gia hạn thuộc tài khoản này." });
        if (renewal.Status != ReservationStatus.PendingPayment)
            return Conflict(new { message = "Chỉ hủy được yêu cầu gia hạn đang chờ thanh toán." });
        if (renewal.Charges.Any(c => c.Status == "Paid"))
            return Conflict(new { message = "Yêu cầu gia hạn đã được thanh toán, không thể hủy. Vui lòng bấm \"Hoàn tất gia hạn\" hoặc liên hệ cơ sở." });

        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);
            await CancelPendingAsync(renewal, customerId.Value, "Khách hủy yêu cầu gia hạn", DateTime.UtcNow, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Ok(new { message = "Đã hủy yêu cầu gia hạn." });
        }
        catch (DbUpdateException exception)
        {
            logger.LogWarning(exception, "Hủy đơn gia hạn thất bại ({ReservationId})", reservationId);
            return Conflict(new { message = CleanDbMessage(exception.InnerException?.Message ?? exception.Message, "Chưa hủy được, vui lòng thử lại.") });
        }
    }

    private async Task<IActionResult> FinalizeResponseAsync(int reservationId, int customerId, CancellationToken ct)
    {
        try
        {
            var contract = await ContractRenewalFinalizer.FinalizeAsync(context, reservationId, customerId, ct);
            if (contract is null)
                return Conflict(new { message = "Yêu cầu gia hạn chưa được thanh toán." });

            await TrySettleEndedTermsAsync(customerId, ct);
            var previous = await context.Contracts.AsNoTracking()
                .Where(c => c.ContractID == contract.RenewedFromContractID)
                .Select(c => c.ContractNumber)
                .FirstOrDefaultAsync(ct);
            return Ok(new
            {
                message = "Gia hạn thành công. Vui lòng ký phụ lục gia hạn.",
                reservationId,
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                renewedFromContractNumber = previous,
                startDate = contract.StartDate,
                endDate = contract.EndDate
            });
        }
        catch (Exception exception) when (exception is DbUpdateException or InvalidOperationException)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Hoàn tất gia hạn thất bại ({ReservationId})", reservationId);
            var text = (exception as DbUpdateException)?.InnerException?.Message ?? exception.Message;
            if (text.Contains("RESERVATION_OVERLAP", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = "Kho đã có người đặt cho thời gian sau hợp đồng hiện tại. Đã nhận tiền, vui lòng liên hệ cơ sở để được hỗ trợ." });
            return Conflict(new { message = CleanDbMessage(text, "Đã nhận thanh toán nhưng chưa hoàn tất được gia hạn. Vui lòng thử lại hoặc liên hệ cơ sở.") });
        }
    }

    private static string CleanDbMessage(string text, string fallback)
    {
        var colon = text.IndexOf(':');
        return colon > 0 && colon < 60 ? text[(colon + 1)..].Trim() : fallback;
    }

    // ------------------------------------------------------------------ Đơn gia hạn chờ thanh toán

    private async Task<List<Reservation>> FindPendingRenewalsAsync(Reservation old, DateTime now, CancellationToken ct)
    {
        var start = old.EndDate.Date.AddDays(1);
        var prefix = ContractRenewalFinalizer.CodePrefix;
        var unitIds = old.ReservationUnits.Where(ru => ru.Status == "Active").Select(ru => ru.UnitID).ToList();
        return await context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Include(r => r.ReservationUnits)
            .AsSplitQuery()
            .Where(r => r.CustomerID == old.CustomerID &&
                        r.FacilityID == old.FacilityID &&
                        r.StartDate == start &&
                        r.ReservationCode.StartsWith(prefix) &&
                        r.Status == ReservationStatus.PendingPayment &&
                        r.HoldExpiresAt > now &&
                        r.ReservationUnits.Any(ru => ru.Status == "Held" && unitIds.Contains(ru.UnitID)))
            .ToListAsync(ct);
    }

    private async Task CancelPendingAsync(Reservation renewal, int customerId, string reason, DateTime now, CancellationToken ct)
    {
        if (renewal.Charges.Any(c => c.Status == "Paid"))
            throw new DbUpdateException("RENEWAL_PAID: Yêu cầu gia hạn trước đó đã được thanh toán, vui lòng hoàn tất yêu cầu đó.");
        foreach (var payment in renewal.Payments.Where(p => p.Status == "Pending")) payment.Status = "Cancelled";
        await context.SaveChangesAsync(ct);
        foreach (var charge in renewal.Charges.Where(c => c.Status == "Unpaid")) { charge.Status = "Cancelled"; charge.PaymentID = null; }
        foreach (var ru in renewal.ReservationUnits.Where(ru => ru.Status == "Held")) { ru.Status = "Released"; ru.ReleasedAt = now; }
        await context.SaveChangesAsync(ct);
        renewal.Status = ReservationStatus.Cancelled;
        renewal.CancelledAt = now;
        renewal.CancelledByUserID = customerId;
        renewal.CancelReason = reason;
        await context.SaveChangesAsync(ct);
    }

    /* Tạo đơn gia hạn (chờ thanh toán) + dòng yêu cầu + kho + các khoản phí, giống ReservationService. */
    private async Task<Reservation> CreatePendingRenewalAsync(Reservation old, PlanQuote quote, string paymentPlan, int customerId, DateTime now, CancellationToken ct)
    {
        var reservation = new Reservation
        {
            ReservationCode = await NewReservationCodeAsync(now, ct),
            CheckInToken = Guid.NewGuid(),
            CustomerID = customerId,
            FacilityID = old.FacilityID,
            StartDate = quote.StartDate,
            RentalPeriod = quote.Months,
            EndDate = quote.EndDate,
            DepositMonths = old.DepositMonths,
            PaymentPlan = paymentPlan,
            HoldExpiresAt = now.AddMinutes(PaymentHoldMinutes),
            AppointmentDate = quote.StartDate,
            AppointmentTime = new TimeSpan(9, 0, 0),
            Status = ReservationStatus.PendingPayment,
            CreatedAt = now
        };

        var previousNumber = old.Contract!.ContractNumber;
        foreach (var group in quote.Units.GroupBy(u => new { u.UnitTypeId, u.UnitSizeId }))
        {
            var item = new ReservationItem
            {
                Reservation = reservation,
                FacilityID = old.FacilityID,
                UnitTypeID = group.Key.UnitTypeId,
                UnitSizeID = group.Key.UnitSizeId,
                Quantity = (byte)group.Count(),
                MonthlyPrice = group.First().ListPrice,
                DiscountPercent = quote.DiscountPercent,
                CreatedAt = now
            };
            reservation.ReservationItems.Add(item);

            foreach (var unit in group)
            {
                var ru = new ReservationUnit
                {
                    Reservation = reservation,
                    ReservationItem = item,
                    FacilityID = old.FacilityID,
                    UnitID = unit.UnitId,
                    UnitTypeID = unit.UnitTypeId,
                    UnitSizeID = unit.UnitSizeId,
                    Status = "Held",
                    AssignedAt = now
                };
                item.ReservationUnits.Add(ru);
                reservation.ReservationUnits.Add(ru);

                // Cọc: mỗi kho đúng 1 dòng (UX_Charge_Deposit). Có cọc cũ -> dòng cọc = phần chuyển sang (không thu tiền),
                // phần tăng thêm (nếu giá tăng) là khoản "Renewal" khách trả ngay. Không có cọc cũ -> dòng cọc phải thu.
                var hasOldDeposit = unit.OldDeposit > 0;
                reservation.Charges.Add(new Charge
                {
                    Reservation = reservation,
                    ReservationUnit = ru,
                    ChargeType = "Deposit",
                    Description = hasOldDeposit
                        ? $"Tiền cọc kho {unit.UnitNumber} ({ContractRenewalFinalizer.TransferMarker} - HĐ {previousNumber})"
                        : $"Tiền cọc {old.DepositMonths} tháng (gia hạn) - kho {unit.UnitNumber}",
                    Amount = hasOldDeposit ? unit.Transfer : unit.NewDeposit,
                    DueDate = now.Date,
                    Status = "Unpaid",
                    CreatedAt = now,
                    CreatedByUserID = customerId
                });
                if (hasOldDeposit && unit.TopUp > 0)
                {
                    reservation.Charges.Add(new Charge
                    {
                        Reservation = reservation,
                        ChargeType = "Renewal",
                        Description = $"Bổ sung tiền cọc do giá thuê tăng - kho {unit.UnitNumber}",
                        Amount = unit.TopUp,
                        DueDate = now.Date,
                        Status = "Unpaid",
                        CreatedAt = now,
                        CreatedByUserID = customerId
                    });
                }

                for (var m = 0; m < quote.Months; m++)
                {
                    var periodStart = quote.StartDate.AddMonths(m);
                    reservation.Charges.Add(new Charge
                    {
                        Reservation = reservation,
                        ReservationUnit = ru,
                        ChargeType = "Rent",
                        Description = $"Tiền thuê tháng {m + 1} (gia hạn) - kho {unit.UnitNumber}",
                        PeriodStart = periodStart,
                        PeriodEnd = quote.StartDate.AddMonths(m + 1).AddDays(-1),
                        Amount = unit.MonthlyPrice,
                        // Hạn theo RentPaymentRules (phần phải trả ngay được thu lúc gia hạn - ContractRenewalFinalizer.IsPayableNow)
                        DueDate = RentPaymentRules.DueDateFor(paymentPlan, quote.StartDate, periodStart),
                        Status = "Unpaid",
                        CreatedAt = now,
                        CreatedByUserID = customerId
                    });
                }
            }
        }

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync(ct);
        return reservation;
    }

    // ------------------------------------------------------------------ Đóng kỳ cũ khi đã qua ngày hết hạn

    /* Đơn gia hạn đã thanh toán đủ nhưng chưa hoàn tất (lỗi giữa chừng) -> hoàn tất lại. */
    private async Task TryFinalizePaidRenewalsAsync(int customerId, CancellationToken ct)
    {
        var prefix = ContractRenewalFinalizer.CodePrefix;
        var candidates = await context.Reservations.AsNoTracking()
            .Include(r => r.Charges)
            .Where(r => r.CustomerID == customerId &&
                        r.ReservationCode.StartsWith(prefix) &&
                        (r.Status == ReservationStatus.PendingPayment || r.Status == ReservationStatus.Paid || r.Status == ReservationStatus.Confirmed) &&
                        r.Charges.Any(c => c.Status == "Paid" && c.ChargeType != "Deposit"))
            .ToListAsync(ct);
        foreach (var renewal in candidates.Where(r => !r.Charges.Any(c => ContractRenewalFinalizer.IsPayableNow(c, r))))
        {
            try { await ContractRenewalFinalizer.FinalizeAsync(context, renewal.ReservationID, customerId, ct); }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                context.ChangeTracker.Clear();
                logger.LogWarning(exception, "Chưa hoàn tất được đơn gia hạn {ReservationId}", renewal.ReservationID);
            }
        }
        context.ChangeTracker.Clear();
    }

    private async Task TrySettleEndedTermsAsync(int customerId, CancellationToken ct)
    {
        try
        {
            await SettleEndedTermsAsync(customerId, ct);
        }
        catch (Exception exception)
        {
            // Không chặn việc xem / gia hạn nếu bước dọn dẹp lỗi; lần gọi sau sẽ thử lại.
            logger.LogWarning(exception, "Không đóng được kỳ thuê cũ đã gia hạn của khách {CustomerId}", customerId);
            context.ChangeTracker.Clear();
        }
    }

    private async Task SettleEndedTermsAsync(int customerId, CancellationToken ct)
    {
        var today = Today();
        var renewals = await context.Contracts
            .Include(c => c.Reservation).ThenInclude(r => r.ReservationUnits)
            .Include(c => c.RenewedFromContract!).ThenInclude(o => o.Reservation).ThenInclude(r => r.ReservationUnits).ThenInclude(ru => ru.UnitAccesses)
            .Where(c => c.RenewedFromContractID != null &&
                        c.Reservation.CustomerID == customerId &&
                        c.Reservation.Status == ReservationStatus.HandedOver &&
                        c.RenewedFromContract!.Reservation.Status == ReservationStatus.HandedOver &&
                        c.RenewedFromContract!.Reservation.EndDate < today)
            .ToListAsync(ct);

        foreach (var renewal in renewals)
        {
            var oldContract = renewal.RenewedFromContract!;
            var old = oldContract.Reservation;
            var now = DateTime.UtcNow;
            await using var transaction = await context.Database.BeginTransactionAsync(ct);

            // Thu quyền truy cập cũ trước (mỗi kho chỉ 1 quyền Active / loại) rồi cấp lại cho kỳ mới.
            var transfers = new List<UnitAccess>();
            foreach (var oldUnit in old.ReservationUnits.Where(ru => ru.Status == "Active"))
            {
                var newUnit = renewal.Reservation.ReservationUnits.FirstOrDefault(ru => ru.UnitID == oldUnit.UnitID && ru.Status == "Active");
                foreach (var access in oldUnit.UnitAccesses.Where(a => a.Status == "Active"))
                {
                    access.Status = "Returned";
                    access.ClosedAt = now;
                    if (newUnit != null)
                    {
                        transfers.Add(new UnitAccess
                        {
                            ReservationUnitID = newUnit.ReservationUnitID,
                            ReservationID = renewal.ReservationID,
                            UnitID = newUnit.UnitID,
                            UserID = renewal.Reservation.CustomerID,
                            AccessType = access.AccessType,
                            AccessValue = access.AccessValue,
                            IssuedAt = now,
                            IssuedByUserID = access.IssuedByUserID,
                            Status = "Active"
                        });
                    }
                }
                oldUnit.Status = "Returned";
                oldUnit.ReturnedOn = old.EndDate.Date;
            }
            await context.SaveChangesAsync(ct);

            if (transfers.Count > 0)
            {
                context.UnitAccesses.AddRange(transfers);
                await context.SaveChangesAsync(ct);
            }

            old.Status = ReservationStatus.Completed;
            old.CompletedAt = now;
            oldContract.ContractStatus = "Renewed";
            oldContract.ActualEndDate = old.EndDate.Date;
            await context.SaveChangesAsync(ct);

            await transaction.CommitAsync(ct);
        }
    }

    // ------------------------------------------------------------------ Helpers

    private (bool Eligible, string? Reason) CheckEligibility(Reservation r, bool alreadyRenewed, RenewalRules rules, DateTime today)
    {
        var contract = r.Contract!;
        if (alreadyRenewed)
            return (false, "Hợp đồng này đã được gia hạn.");
        if (r.Status != ReservationStatus.HandedOver)
            return (false, r.Status == ReservationStatus.Completed ? "Hợp đồng đã kết thúc." : "Chỉ gia hạn được hợp đồng đang thuê (đã nhận kho).");
        if (!RenewableContractStatuses.Contains(contract.ContractStatus))
            return (false, $"Hợp đồng đang ở trạng thái \"{contract.ContractStatus}\" nên không thể gia hạn.");
        if (r.EndDate.Date < today)
            return (false, "Hợp đồng đã quá hạn. Vui lòng liên hệ cơ sở để xử lý trước khi gia hạn.");
        var deadline = r.EndDate.Date.AddDays(-rules.NoticeDays);
        if (today > deadline)
            return (false, $"Theo chính sách, cần gia hạn trước ngày hết hạn ít nhất {rules.NoticeDays} ngày (hạn chót {deadline:dd/MM/yyyy}). Vui lòng liên hệ cơ sở.");
        if (rules.RequireNoOverdue && r.Charges.Any(c =>
                (c.ChargeType == "LateFee" || c.ChargeType == "ExtraFee") &&
                c.Status == "Unpaid" && c.DueDate.Date < today))
            return (false, "Bạn còn khoản phí quá hạn chưa thanh toán. Vui lòng thanh toán trước khi gia hạn.");
        if (rules.RequireNoOverdue && RentPaymentRules.Overdue(r, today).Count > 0)
            return (false, "Bạn còn tiền thuê quá hạn chưa đóng. Vui lòng đóng tiền thuê trước khi gia hạn.");
        if (!r.ReservationUnits.Any(ru => ru.Status == "Active"))
            return (false, "Hợp đồng không còn kho đang thuê để gia hạn.");
        if (r.Facility.Status != "Active")
            return (false, "Cơ sở đang tạm ngừng hoạt động nên chưa nhận gia hạn.");
        return (true, null);
    }

    private static PlanQuote BuildQuote(Reservation r, int months, decimal discountRate)
    {
        var start = r.EndDate.Date.AddDays(1);
        var end = start.AddMonths(months).AddDays(-1);
        var units = r.ReservationUnits
            .Where(ru => ru.Status == "Active" && ru.Unit != null)
            .OrderBy(ru => ru.Unit.UnitNumber)
            .Select(ru =>
            {
                var listPrice = ru.Unit.RentalRate?.MonthlyPrice ?? 0m;
                var monthly = decimal.Round(listPrice * (100m - discountRate) / 100m, 0, MidpointRounding.AwayFromZero);
                var oldDeposit = r.Charges
                    .Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0 && c.ReservationUnitID == ru.ReservationUnitID)
                    .Sum(c => c.Amount);
                return new UnitQuote(
                    ru.UnitID, ru.Unit.UnitNumber, ru.Unit.UnitTypeID, ru.Unit.UnitSizeID,
                    ru.Unit.UnitType?.TypeName,
                    ru.Unit.UnitSize == null ? null : $"{ru.Unit.UnitSize.SizeCode}: {ru.Unit.UnitSize.DisplayName}",
                    listPrice, monthly, oldDeposit, monthly * r.DepositMonths);
            })
            .ToList();

        var monthlyTotal = units.Sum(u => u.MonthlyPrice);
        var topUp = units.Sum(u => u.TopUp);
        return new PlanQuote(
            months, discountRate, start, end,
            MonthlyBase: units.Sum(u => u.ListPrice),
            Monthly: monthlyTotal,
            Rent: monthlyTotal * months,
            NewDeposit: units.Sum(u => u.NewDeposit),
            OldDeposit: units.Sum(u => u.OldDeposit),
            FirstMonth: monthlyTotal,
            DepositTransfer: units.Sum(u => u.Transfer),
            DepositTopUp: topUp,
            AmountDue: monthlyTotal + topUp,
            RefundAmount: units.Sum(u => u.Excess),
            units);
    }

    private static object ToQuoteDto(PlanQuote q) => new
    {
        months = q.Months,
        discountPercent = q.DiscountPercent,
        startDate = q.StartDate,
        endDate = q.EndDate,
        monthlyBase = q.MonthlyBase,
        monthly = q.Monthly,
        rent = q.Rent,
        newDeposit = q.NewDeposit,
        oldDeposit = q.OldDeposit,
        firstMonth = q.FirstMonth,
        depositTransfer = q.DepositTransfer,
        depositTopUp = q.DepositTopUp,
        laterMonths = Math.Max(0, q.Months - 1),
        amountDue = q.AmountDue, // = trả theo tháng (giữ cho client cũ)
        amountDueMonthly = q.AmountDueFor(PaymentPlan.Monthly),
        amountDueUpfront = q.AmountDueFor(PaymentPlan.Upfront),
        refundAmount = q.RefundAmount,
        units = q.Units.Select(u => new
        {
            unitId = u.UnitId,
            unitNumber = u.UnitNumber,
            type = u.TypeName,
            size = u.SizeLabel,
            listPrice = u.ListPrice,
            monthlyPrice = u.MonthlyPrice
        })
    };

    private Task<List<Reservation>> LoadCustomerReservationsAsync(int customerId, int? reservationId, CancellationToken ct)
    {
        var query = context.Reservations
            .Include(r => r.Facility)
            .Include(r => r.Contract)
            .Include(r => r.Charges)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.RentalRate)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitType)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitSize)
            .AsSplitQuery()
            .Where(r => r.CustomerID == customerId && r.Contract != null);
        if (reservationId is not null)
            query = query.Where(r => r.ReservationID == reservationId.Value);
        return query.OrderByDescending(r => r.EndDate).ToListAsync(ct);
    }

    private sealed record Plan(int Months, decimal DiscountRate);

    private async Task<List<Plan>> GetPlansAsync(RenewalRules rules, CancellationToken ct)
    {
        var types = await context.ContractTypes.AsNoTracking()
            .Where(t => t.IsActive)
            .Select(t => new { t.RentalMonths, t.DiscountRate })
            .ToListAsync(ct);
        return AllowedMonths
            .Where(m => m >= rules.MinMonths && m <= rules.MaxMonths)
            .Where(m => types.Count == 0 || types.Any(t => t.RentalMonths == m))
            .Select(m => new Plan(m, ApplyContractDiscount ? types.FirstOrDefault(t => t.RentalMonths == m)?.DiscountRate ?? 0m : 0m))
            .ToList();
    }

    private async Task<RenewalRules> ReadRulesAsync(CancellationToken ct)
    {
        var globalNotice = await context.RentalPolicies.AsNoTracking()
            .Where(p => p.FacilityID == null)
            .Select(p => (int?)p.RenewalNoticeDays)
            .FirstOrDefaultAsync(ct);
        var rules = new RenewalRules(globalNotice ?? 7, 1, 12, true);

        try
        {
            var result = await facilityManagementService.GetPolicyGroupsAsync(ct);
            if (!result.IsSuccess || result.Data is null) return rules;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(result.Data));
            if (!doc.RootElement.TryGetProperty("current", out var current) ||
                !current.TryGetProperty("renewal_return", out var policy))
                return rules;
            var value = policy.TryGetProperty("value", out var v) ? v : policy.TryGetProperty("config", out var c) ? c : default;
            if (value.ValueKind != JsonValueKind.Object) return rules;

            var notice = Math.Clamp(ReadInt(value, "renewalNoticeDays", rules.NoticeDays), 0, 365);
            var min = Math.Clamp(ReadInt(value, "minRenewalMonths", rules.MinMonths), 1, 12);
            var max = Math.Clamp(ReadInt(value, "maxRenewalMonths", rules.MaxMonths), min, 12);
            var requireNoOverdue = value.TryGetProperty("requireNoOverdue", out var flag)
                ? flag.ValueKind != JsonValueKind.False && !(flag.ValueKind == JsonValueKind.String && flag.GetString() == "false")
                : rules.RequireNoOverdue;
            return new RenewalRules(notice, min, max, requireNoOverdue);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Không đọc được chính sách gia hạn, dùng giá trị mặc định.");
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

    private async Task<string> NewReservationCodeAsync(DateTime now, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = $"{ContractRenewalFinalizer.CodePrefix}{now:yyyy}-{Random.Shared.Next(10000, 99999)}";
            if (!await context.Reservations.AnyAsync(r => r.ReservationCode == code, ct))
                return code;
        }
        return $"{ContractRenewalFinalizer.CodePrefix}{now:yyyy}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
    }

    /* Ngày hiện tại: lấy ngày muộn hơn giữa giờ máy chủ và UTC (khớp cách trigger DB tính "quá hạn"). */
    private static DateTime Today()
    {
        var local = DateTime.Today;
        var utc = DateTime.UtcNow.Date;
        return local > utc ? local : utc;
    }

    private Task<int?> GetCustomerIdAsync(CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return Task.FromResult<int?>(null);

        return context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
    }
}
