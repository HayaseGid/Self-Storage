using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

/*
 * BỎ BƯỚC MANAGER DUYỆT ĐƠN (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 *   POST /api/reservation-confirmations/mine
 *
 * Theo yêu cầu mới: khách đặt cọc xong là giữ kho luôn, ký hợp đồng ngay. Manager chỉ còn phân Staff bàn giao.
 * Kho đã được giữ (ReservationUnit "Held") ngay lúc đặt, nên với mỗi đơn "Paid" của khách đang đăng nhập:
 *   Paid -> Confirmed (đủ kho theo số lượng) + tạo hợp đồng (HD-yyyy-xxxxx), y như lúc Manager bấm duyệt trước đây.
 * Frontend gọi API này ngay sau khi thanh toán cọc và mỗi lần mở trang Hợp đồng (nếu còn đơn "Paid").
 * Gọi nhiều lần không sao: đơn đã Confirmed / đã có hợp đồng thì bỏ qua.
 */
[ApiController]
[Route("api/reservation-confirmations")]
public sealed class ReservationConfirmationsController(
    SelfStorageDbContext context,
    ILogger<ReservationConfirmationsController> logger) : ControllerBase
{
    public sealed record ConfirmMineRequest(List<int>? ReservationIds);

    [HttpPost("mine")]
    public async Task<IActionResult> ConfirmMine([FromBody] ConfirmMineRequest? request, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var customerId = await context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var ids = request?.ReservationIds?.Where(id => id > 0).Distinct().ToList();
        var query = context.Reservations
            .Where(r => r.CustomerID == customerId.Value && r.Status == ReservationStatus.Paid);
        if (ids is { Count: > 0 })
            query = query.Where(r => ids.Contains(r.ReservationID));
        var pendingIds = await query.Select(r => r.ReservationID).ToListAsync(cancellationToken);

        var confirmed = new List<object>();
        var failed = new List<object>();
        foreach (var reservationId in pendingIds)
        {
            try
            {
                var contract = await ConfirmOneAsync(reservationId, cancellationToken);
                if (contract is not null)
                    confirmed.Add(new { reservationId, contractId = contract.ContractID, contractNumber = contract.ContractNumber });
            }
            catch (Exception exception)
            {
                context.ChangeTracker.Clear();
                logger.LogWarning(exception, "Không tự xác nhận được đơn {ReservationId}", reservationId);
                var text = (exception as DbUpdateException)?.InnerException?.Message ?? exception.Message;
                var colon = text.IndexOf(':');
                failed.Add(new
                {
                    reservationId,
                    message = colon > 0 && colon < 60 ? text[(colon + 1)..].Trim() : "Chưa tạo được hợp đồng, vui lòng thử lại."
                });
            }
        }

        // Kèm danh sách hợp đồng của các đơn được hỏi (kể cả đã xác nhận từ trước) để frontend mở trang ký.
        var contracts = ids is { Count: > 0 }
            ? await context.Contracts.AsNoTracking()
                .Where(c => ids.Contains(c.ReservationID) && c.Reservation.CustomerID == customerId.Value)
                .Select(c => new { reservationId = c.ReservationID, contractId = c.ContractID, contractNumber = c.ContractNumber })
                .ToListAsync(cancellationToken)
            : null;

        return Ok(new { confirmed, failed, contracts });
    }

    private async Task<Contract?> ConfirmOneAsync(int reservationId, CancellationToken ct)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(ct);

        var reservation = await context.Reservations
            .Include(r => r.ReservationItems)
            .Include(r => r.ReservationUnits)
            .Include(r => r.Contract)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, ct);
        if (reservation is null || reservation.Status != ReservationStatus.Paid)
            return null;

        // Phải đủ kho đã giữ cho từng dòng yêu cầu (trigger DB cũng kiểm tra điều này).
        var fullyHeld = reservation.ReservationItems.All(item =>
            reservation.ReservationUnits.Count(ru => ru.ReservationItemID == item.ReservationItemID && ru.Status != "Released") == item.Quantity);
        if (!fullyHeld)
            throw new InvalidOperationException("RESERVATION_NOT_FULLY_ASSIGNED: Đơn chưa đủ kho, vui lòng liên hệ cơ sở.");

        var now = DateTime.UtcNow;
        reservation.Status = ReservationStatus.Confirmed;
        reservation.ConfirmedAt = now;
        await context.SaveChangesAsync(ct);

        var contract = reservation.Contract;
        if (contract is null)
        {
            contract = new Contract
            {
                ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}",
                ReservationID = reservation.ReservationID,
                StartDate = reservation.StartDate,
                EndDate = reservation.EndDate,
                ContractStatus = "Active",
                CreatedAt = now
            };
            context.Contracts.Add(contract);
            await context.SaveChangesAsync(ct);
        }

        await transaction.CommitAsync(ct);
        return contract;
    }
}
