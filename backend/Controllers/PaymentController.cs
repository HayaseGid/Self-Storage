using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;
using SelfStorageAPI.Constants;
using System.Data;

namespace SelfStorageAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PaymentController : ControllerBase
    {
        private readonly SelfStorageDbContext _context;

        public PaymentController(SelfStorageDbContext context)
        {
            _context = context;
        }

        [HttpPost("confirm")]
        public async Task<IActionResult> ConfirmPayment(
            [FromBody] CreatePaymentDTO request,
            CancellationToken cancellationToken)
        {
            var email = Request.Headers["X-User-Email"].ToString();
            if (string.IsNullOrWhiteSpace(email))
                return Unauthorized();

            var customerId = await _context.Users
                .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
                .Select(u => (int?)u.UserID)
                .FirstOrDefaultAsync(cancellationToken);
            if (!customerId.HasValue)
                return Unauthorized();

            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable, cancellationToken);
            var reservation = await _context.Reservations
                .Include(r => r.AssignedUnit)
                .Include(r => r.Payments)
                .FirstOrDefaultAsync(r =>
                    r.ReservationID == request.ReservationID &&
                    r.CustomerID == customerId.Value,
                    cancellationToken);

            if (reservation == null) return NotFound(new { message = "Không tìm thấy Reservation." });
            if (reservation.Status != ReservationStatus.PendingDeposit)
                return Conflict(new { message = "Đặt chỗ không ở trạng thái chờ thanh toán hoặc đã được thanh toán." });
            if (request.Amount <= 0 || request.Amount != reservation.DepositAmount)
                return BadRequest(new { message = $"Số tiền thanh toán phải đúng bằng tiền cọc {reservation.DepositAmount}." });
            if (reservation.Payments.Any(p => p.PaymentStatus == "Completed"))
                return Conflict(new { message = "Đặt chỗ đã có giao dịch thanh toán thành công." });

            var payment = new Payment
            {
                ReservationID = request.ReservationID,
                TransactionReference = $"TXN-{Guid.NewGuid():N}",
                Amount = request.Amount,
                PaymentType = request.PaymentType,
                PaymentDate = DateTime.Today,
                PaymentStatus = "Completed"
            };

            _context.Payments.Add(payment);
            reservation.Status = ReservationStatus.Paid;

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new
            {
                message = "Thanh toán thành công. Đơn hàng chuyển sang chờ phân kho.",
                paymentId = payment.PaymentID,
                transactionReference = payment.TransactionReference,
                amount = payment.Amount,
                reservationStatus = reservation.Status
            });
        }
    }
}
