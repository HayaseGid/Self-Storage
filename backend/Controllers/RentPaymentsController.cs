using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

/*
 * TIỀN THUÊ CỦA KHÁCH (file THÊM MỚI, không cần sửa Program.cs).
 *
 *   GET  /api/rent-payments/{reservationId}           -> hình thức trả, lịch đóng từng kỳ, số tiền đóng được ngay
 *   POST /api/rent-payments/{reservationId}/pay-demo  -> đóng mô phỏng (thật: POST /api/vnpay/create { reservationIds: [id] })
 *
 * Đóng được gì, khi nào: RentPaymentRules (nguồn duy nhất, dùng chung với VNPay và điều kiện bàn giao).
 * Đơn gia hạn đang chờ thanh toán đóng ở mục Gia hạn (ContractRenewalsController), không đóng ở đây.
 */
[ApiController]
[Route("api/rent-payments")]
public sealed class RentPaymentsController(
    SelfStorageDbContext context,
    ILogger<RentPaymentsController> logger) : ControllerBase
{
    [HttpGet("{reservationId:int}")]
    public async Task<IActionResult> Get(int reservationId, CancellationToken ct)
    {
        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var r = await LoadAsync(reservationId, customerId.Value, ct);
        if (r is null) return NotFound(new { message = "Không tìm thấy đơn thuộc tài khoản này." });

        return Ok(BuildDto(r, BusinessClock.Today));
    }

    [HttpPost("{reservationId:int}/pay-demo")]
    public async Task<IActionResult> PayDemo(int reservationId, CancellationToken ct)
    {
        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var r = await LoadAsync(reservationId, customerId.Value, ct);
        if (r is null) return NotFound(new { message = "Không tìm thấy đơn thuộc tài khoản này." });
        if (ContractRenewalFinalizer.IsRenewal(r) && r.Status == ReservationStatus.PendingPayment)
            return Conflict(new { message = "Đơn gia hạn thanh toán ở mục Gia hạn hợp đồng." });

        var today = BusinessClock.Today;
        var payable = RentPaymentRules.PayableNow(r, today);
        if (payable.Count == 0)
            return Conflict(new { message = RentPaymentRules.WhyNotPayable(r, today) ?? "Không còn khoản tiền thuê nào cần đóng." });

        var now = DateTime.UtcNow;
        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);
            // Giao dịch đang chờ của đơn (VNPay bỏ dở) -> hủy, tránh ghi nhận 2 lần
            foreach (var p in r.Payments.Where(p => p.Status == "Pending" && p.Direction == "Collection")) p.Status = "Cancelled";
            await context.SaveChangesAsync(ct);

            var payment = new Payment
            {
                ReservationID = r.ReservationID,
                OrderCode = $"RENT-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                IdempotencyKey = $"RENT-{r.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Simulator",
                Direction = "Collection",
                Amount = payable.Sum(c => c.Amount),
                PaymentMethod = "QR",
                Status = "Pending",
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(15),
                CreatedByUserID = customerId.Value
            };
            context.Payments.Add(payment);
            await context.SaveChangesAsync(ct);

            foreach (var c in payable) c.PaymentID = payment.PaymentID;
            await context.SaveChangesAsync(ct);

            payment.Status = "Completed";
            payment.ProviderTransactionId = $"SIM-RENT-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            payment.ReceivedAmount = payment.Amount;
            payment.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);

            foreach (var c in payable) { c.Status = "Paid"; c.PaidAt = now; }
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            return Ok(new
            {
                message = $"Đã đóng {payment.Amount:N0}đ tiền thuê.",
                amount = payment.Amount,
                rent = BuildDto(r, today)
            });
        }
        catch (DbUpdateException exception)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Đóng tiền thuê mô phỏng thất bại ({ReservationId})", reservationId);
            return Conflict(new { message = "Chưa đóng được tiền thuê, vui lòng thử lại." });
        }
    }

    // ------------------------------------------------------------------ Helpers

    /* Dữ liệu tiền thuê của một đơn — dùng chung cho trang khách (cũng được CustomerReservationsController tóm tắt lại). */
    internal static object BuildDto(Reservation r, DateTime today)
    {
        var rent = r.Charges.Where(RentPaymentRules.IsRent).ToList();
        var payable = RentPaymentRules.PayableNow(r, today);
        var overdue = RentPaymentRules.Overdue(r, today);
        return new
        {
            reservationId = r.ReservationID,
            paymentPlan = r.PaymentPlan,
            paymentPlanLabel = PaymentPlan.Label(r.PaymentPlan),
            totalRent = rent.Sum(c => c.Amount),
            paidRent = rent.Where(c => c.Status is "Paid" or "Waived").Sum(c => c.Amount),
            dueAtStart = RentPaymentRules.DueAtStart(r).Sum(c => c.Amount),
            startRentPaid = RentPaymentRules.IsStartRentPaid(r),
            payableNow = payable.Sum(c => c.Amount),
            payableCount = payable.Count,
            overdueAmount = overdue.Sum(c => c.Amount),
            reason = RentPaymentRules.WhyNotPayable(r, today),
            // Lịch đóng: gộp các kho theo kỳ
            schedule = rent
                .GroupBy(c => c.PeriodStart!.Value.Date)
                .OrderBy(g => g.Key)
                .Select(g => new
                {
                    periodStart = g.Key,
                    periodEnd = g.Max(c => c.PeriodEnd)?.Date,
                    dueDate = g.Min(c => c.DueDate).Date,
                    amount = g.Sum(c => c.Amount),
                    status = g.All(c => c.Status is "Paid" or "Waived") ? "Paid"
                        : g.Any(c => c.Status == "Unpaid" && c.DueDate.Date < today) ? "Overdue"
                        : "Unpaid",
                    payableNow = g.Any(c => payable.Contains(c))
                })
                .ToList()
        };
    }

    private Task<Reservation?> LoadAsync(int reservationId, int customerId, CancellationToken ct) =>
        context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId, ct);

    private Task<int?> GetCustomerIdAsync(CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email)) return Task.FromResult<int?>(null);
        return context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
    }
}
