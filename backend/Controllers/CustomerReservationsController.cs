using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

/*
 * DANH SÁCH ĐẶT CHỖ CỦA KHÁCH - BẢN NHANH (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 *   GET /api/customer-reservations/mine
 *
 * Trả về ĐÚNG cấu trúc JSON như GET /api/reservation/customer/{email}, nhưng không bị treo khi dữ liệu nhiều.
 *
 * Vì sao API cũ bị "Máy chủ phản hồi quá lâu":
 *   ReservationRepository.GetCustomerReservationsAsync() Include 5 danh sách con (ReservationItems, ReservationUnits,
 *   Payments, Charges, UnitAccesses) trong MỘT câu SQL -> số dòng = tích số lượng các danh sách (cartesian explosion),
 *   và mỗi dòng còn kèm nguyên ảnh chữ ký base64 (ContractSignature.SignatureImage, hàng chục - hàng trăm KB).
 *   Đơn thuê 12 tháng có 13 khoản phí, vài lần thanh toán... -> vài chục dòng x ảnh chữ ký cho MỖI đơn,
 *   khách test nhiều đơn là vượt 20 giây. Các actor khác (Operations, Catalog) dùng Select nên không bị.
 *
 * Bản này: chỉ Select đúng các cột cần, không tải ảnh chữ ký, không tải Charges (API cũ có Include nhưng không dùng),
 * AsSplitQuery + AsNoTracking.
 * Thêm cho gia hạn: isRenewal, amountDueNow (đơn gia hạn chờ thanh toán), renewedFrom (hợp đồng gốc của phụ lục gia hạn).
 */
[ApiController]
[Route("api/customer-reservations")]
public sealed class CustomerReservationsController(
    SelfStorageDbContext context,
    IReservationHoldService holdService,
    ILogger<CustomerReservationsController> logger) : ControllerBase
{
    [HttpGet("mine")]
    public async Task<IActionResult> GetMine([FromQuery] PageQuery paging, CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var customerId = await context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var now = DateTime.UtcNow;

        // Giống API cũ: nhả các đơn giữ chỗ đã hết hạn. Lỗi ở bước phụ này không được làm hỏng cả trang.
        try { await holdService.ReleaseExpiredAsync(now, ct); }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Không nhả được đơn giữ chỗ hết hạn.");
            context.ChangeTracker.Clear();
        }

        // Giống API cũ: đơn đã Confirmed / Handed Over mà chưa có hợp đồng thì tạo hợp đồng.
        try { await CreateMissingContractsAsync(customerId.Value, ct); }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Không tạo được hợp đồng còn thiếu.");
            context.ChangeTracker.Clear();
        }

        // [PHÂN TRANG] Mới nhất lên đầu. Gửi ?page=&pageSize= thì trả { items, total, page, pageSize, pageCount },
        // không gửi thì trả nguyên mảng như trước (trang khách vẫn cần toàn bộ đơn để tính thông báo / nhắc hạn).
        var mine = context.Reservations
            .AsNoTracking()
            .Where(r => r.CustomerID == customerId.Value);
        var keyword = paging.Keyword;
        if (keyword.Length > 0)
        {
            mine = mine.Where(r =>
                r.ReservationCode.Contains(keyword) ||
                r.Facility.FacilityName.Contains(keyword) ||
                r.ReservationUnits.Any(ru => ru.Status != "Released" && ru.Unit.UnitNumber.Contains(keyword)) ||
                (r.Contract != null && r.Contract.ContractNumber.Contains(keyword)));
        }
        var total = paging.IsPaged ? await mine.CountAsync(ct) : 0;
        IQueryable<Reservation> pageQuery = mine
            .OrderByDescending(r => r.CreatedAt)
            .ThenByDescending(r => r.ReservationID);
        if (paging.IsPaged)
            pageQuery = pageQuery.Skip(paging.SkipFor(total)).Take(paging.SafePageSize);

        var rows = await pageQuery
            .AsSplitQuery()
            .Select(r => new
            {
                r.CreatedAt,
                r.ReservationID,
                r.ReservationCode,
                FacilityName = r.Facility.FacilityName,
                r.FacilityID,
                r.StartDate,
                r.EndDate,
                r.RentalPeriod,
                r.DepositMonths,
                r.Status,
                r.HoldExpiresAt,
                r.PaymentPlan,
                RentRows = r.Charges
                    .Where(c => c.ChargeType == "Rent")
                    .Select(c => new { c.Status, c.Amount, c.DueDate, c.PeriodStart })
                    .ToList(),
                Items = r.ReservationItems
                    .OrderBy(i => i.ReservationItemID)
                    .Select(i => new
                    {
                        i.Quantity,
                        i.MonthlyPrice,
                        i.DiscountPercent,
                        i.EffectiveMonthlyPrice,
                        TypeName = i.UnitType.TypeName,
                        SizeCode = i.UnitSize.SizeCode,
                        SizeName = i.UnitSize.DisplayName
                    }).ToList(),
                Units = r.ReservationUnits
                    .Where(ru => ru.Status != "Released")
                    .OrderBy(ru => ru.ReservationUnitID)
                    .Select(ru => new
                    {
                        ru.Unit.UnitNumber,
                        TypeName = ru.Unit.UnitType.TypeName,
                        SizeCode = ru.Unit.UnitSize.SizeCode,
                        SizeName = ru.Unit.UnitSize.DisplayName
                    }).ToList(),
                // Giao dịch thu tiền gần nhất (bỏ qua giao dịch hoàn tiền và chuyển cọc nội bộ khi gia hạn).
                LatestPayment = r.Payments
                    .Where(p => p.Direction == "Collection" && p.Provider != ContractRenewalFinalizer.TransferProvider)
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => new { p.Status, p.ProviderTransactionId, p.OrderCode, p.Amount, p.ConfirmedAt, p.CreatedAt })
                    .FirstOrDefault(),
                ContractId = r.Contract != null ? (int?)r.Contract.ContractID : null,
                ContractNumber = r.Contract != null ? r.Contract.ContractNumber : null,
                IsSigned = r.Contract != null && r.Contract.Signature != null,
                RenewedFromNumber = r.Contract != null && r.Contract.RenewedFromContract != null ? r.Contract.RenewedFromContract.ContractNumber : null,
                RenewedFromStart = r.Contract != null && r.Contract.RenewedFromContract != null ? (DateTime?)r.Contract.RenewedFromContract.StartDate : null,
                RenewedFromEnd = r.Contract != null && r.Contract.RenewedFromContract != null ? (DateTime?)r.Contract.RenewedFromContract.EndDate : null,
                // Đơn gia hạn chờ thanh toán: cọc bổ sung phải trả ngay (tiền thuê cộng thêm ở dưới theo RentPaymentRules).
                PayNow = r.Charges
                    .Where(c => c.Status == "Unpaid" &&
                                (c.ChargeType == "Renewal" ||
                                 (c.ChargeType == "Deposit" && !c.Description!.Contains(ContractRenewalFinalizer.TransferMarker))))
                    .Sum(c => (decimal?)c.Amount) ?? 0m,
                CancelledAt = r.CancelledAt,
                CancelReason = r.CancelReason,
                // Hoàn cọc khi khách hủy đặt kho (ReservationCancellationsController).
                RefundTotal = r.Payments.Where(p => p.Direction == "Refund" && p.RefundReason == "Cancellation").Sum(p => (decimal?)p.Amount) ?? 0m,
                RefundPending = r.Payments.Any(p => p.Direction == "Refund" && p.RefundReason == "Cancellation" && p.Status == "Pending"),
                RefundProvider = r.Payments.Where(p => p.Direction == "Refund" && p.RefundReason == "Cancellation").Select(p => p.Provider).FirstOrDefault(),
                // Chi tiết khoản hoàn mới nhất: lúc yêu cầu, lúc hoàn xong, mã hoàn của cổng, kết quả lần gửi VNPay gần nhất.
                LastRefund = r.Payments
                    .Where(p => p.Direction == "Refund" && p.RefundReason == "Cancellation")
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => new
                    {
                        p.CreatedAt,
                        p.ConfirmedAt,
                        p.ProviderTransactionId,
                        LastNote = p.CallbackLogs.OrderByDescending(l => l.CallbackID).Select(l => l.Note).FirstOrDefault(),
                        LastNoteAt = p.CallbackLogs.OrderByDescending(l => l.CallbackID).Select(l => (DateTime?)l.ReceivedAt).FirstOrDefault()
                    })
                    .FirstOrDefault(),
                Accesses = r.UnitAccesses
                    .OrderBy(a => a.AccessID)
                    .Select(a => new { a.AccessType, a.AccessValue, a.Status })
                    .ToList()
            })
            .ToListAsync(ct);

        var today = BusinessClock.Today;
        var data = rows.Select(r =>
        {
            // Tiền thuê: cùng luật RentPaymentRules với thanh toán và điều kiện bàn giao
            var rentState = RentPaymentRules.Snapshot(r.Status, r.StartDate, r.EndDate, r.PaymentPlan,
                r.RentRows.Select(x => (x.Status, x.Amount, x.DueDate, x.PeriodStart)));
            var rentPayable = RentPaymentRules.PayableNow(rentState, today);
            var monthlyTotal = r.Items.Sum(i =>
                i.Quantity * (i.EffectiveMonthlyPrice ?? decimal.Round(i.MonthlyPrice * (100m - i.DiscountPercent) / 100m, 0)));
            var unitNumbers = r.Units.Select(u => u.UnitNumber).ToList();
            var activeUnit = r.Units.FirstOrDefault();
            var firstItem = r.Items.FirstOrDefault();
            var activeAccess = r.Accesses.FirstOrDefault(a => a.Status == "Active") ?? r.Accesses.FirstOrDefault();
            var isRenewal = r.ReservationCode.StartsWith(ContractRenewalFinalizer.CodePrefix, StringComparison.OrdinalIgnoreCase);

            return new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                createdAt = r.CreatedAt,
                facility = r.FacilityName,
                facilityId = r.FacilityID,
                unitNumber = unitNumbers.Count > 0 ? string.Join(", ", unitNumbers) : null,
                unitNumbers,
                unitCount = unitNumbers.Count,
                unitType = r.Units.Count > 1
                    ? string.Join(", ", r.Units.Select(u => u.TypeName).Where(t => !string.IsNullOrWhiteSpace(t)).Distinct())
                    : (activeUnit?.TypeName ?? firstItem?.TypeName),
                startDate = r.StartDate,
                endDate = r.EndDate,
                months = r.RentalPeriod,
                depositMonths = r.DepositMonths,
                rentalAmount = monthlyTotal * r.RentalPeriod,
                monthlyPrice = monthlyTotal,
                depositAmount = monthlyTotal * r.DepositMonths,
                status = r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now
                    ? ReservationStatus.Expired
                    : r.Status,
                depositExpiresAt = r.HoldExpiresAt,
                paymentStatus = r.LatestPayment?.Status,
                paymentReference = r.LatestPayment?.ProviderTransactionId ?? r.LatestPayment?.OrderCode,
                paymentAmount = r.LatestPayment?.Amount,
                paymentDate = r.LatestPayment?.ConfirmedAt ?? r.LatestPayment?.CreatedAt,
                contractId = r.ContractId,
                contractNumber = r.ContractNumber,
                contractStatus = r.ContractId is null ? null : (r.IsSigned ? "Signed" : "Pending Signature"),
                isRenewal,
                // Đơn gia hạn chờ thanh toán: cọc bổ sung + tiền thuê phải trả ngay theo hình thức trả (RentPaymentRules)
                amountDueNow = isRenewal && r.Status == ReservationStatus.PendingPayment
                    ? r.PayNow + RentPaymentRules.DueAtStart(rentState).Where(c => c.Status == "Unpaid").Sum(c => c.Amount)
                    : (decimal?)null,
                renewedFrom = r.RenewedFromNumber == null ? null : new
                {
                    contractNumber = r.RenewedFromNumber,
                    startDate = r.RenewedFromStart,
                    endDate = r.RenewedFromEnd
                },
                paymentPlan = r.PaymentPlan,
                paymentPlanLabel = PaymentPlan.Label(r.PaymentPlan),
                rentDueAtStart = RentPaymentRules.DueAtStart(rentState).Sum(c => c.Amount),
                startRentPaid = RentPaymentRules.IsStartRentPaid(rentState),
                rentPayableNow = rentPayable.Sum(c => c.Amount),
                rentOverdue = RentPaymentRules.Overdue(rentState, today).Sum(c => c.Amount),
                rentNote = RentPaymentRules.WhyNotPayable(rentState, today),
                cancelledAt = r.CancelledAt,
                cancelReason = r.CancelReason,
                refundAmount = r.RefundTotal > 0 ? r.RefundTotal : (decimal?)null,
                refundStatus = r.RefundTotal > 0 ? (r.RefundPending ? "Pending" : "Completed") : null,
                refundProvider = r.RefundProvider,
                refundRequestedAt = r.LastRefund?.CreatedAt,
                refundCompletedAt = r.LastRefund?.ConfirmedAt,
                refundReference = r.LastRefund?.ProviderTransactionId,
                refundLastAttempt = r.LastRefund?.LastNote,
                refundLastAttemptAt = r.LastRefund?.LastNoteAt,
                accessType = activeAccess?.AccessType,
                accessValue = activeAccess?.AccessValue,
                size = r.Units.Count > 1
                    ? string.Join(", ", r.Units.Select(u => $"{u.SizeCode}: {u.SizeName}").Distinct())
                    : activeUnit != null
                        ? $"{activeUnit.SizeCode}: {activeUnit.SizeName}"
                        : firstItem != null
                            ? $"{firstItem.SizeCode}: {firstItem.SizeName}"
                            : null
            };
        }).ToList();

        if (paging.IsPaged)
            return Ok(PagedResult<object>.Create(data.Cast<object>().ToList(), total, paging));
        return Ok(data);
    }

    private async Task CreateMissingContractsAsync(int customerId, CancellationToken ct)
    {
        var missing = await context.Reservations
            .Where(r => r.CustomerID == customerId &&
                        (r.Status == ReservationStatus.Confirmed || r.Status == ReservationStatus.HandedOver) &&
                        r.Contract == null)
            .Select(r => new { r.ReservationID, r.StartDate, r.EndDate })
            .ToListAsync(ct);
        if (missing.Count == 0) return;

        foreach (var r in missing)
        {
            context.Contracts.Add(new Contract
            {
                ContractNumber = $"CT-{r.StartDate:yyyy}-{r.ReservationID:00000}",
                ReservationID = r.ReservationID,
                StartDate = r.StartDate.Date,
                EndDate = r.EndDate.Date,
                ContractStatus = "Active",
                CreatedAt = DateTime.UtcNow
            });
        }
        await context.SaveChangesAsync(ct);
    }
}
