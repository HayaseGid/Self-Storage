using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// Xóa kho tại cơ sở.
/// - Facility Manager: chỉ kho thuộc cơ sở mình phụ trách (Facility.ManagerID).
/// - Business Operations Manager: mọi cơ sở.
/// Chỉ xóa được kho CHƯA TỪNG có đơn đặt chỗ, bàn giao, yêu cầu hỗ trợ.
/// Kho đã có lịch sử thì giữ lại để không mất dữ liệu, chuyển sang "Inactive" (Ngừng sử dụng).
/// </summary>
[ApiController]
[Route("api/storage-units")]
public sealed class StorageUnitsController(SelfStorageDbContext db) : ControllerBase
{
    private const int FacilityManagerRoleId = 3;
    private const int BusinessOperationsRoleId = 4;

    // DELETE /api/storage-units/{unitId}
    [HttpDelete("{unitId:int}")]
    public async Task<IActionResult> Delete(
        int unitId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
            return Unauthorized(new { message = "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại." });

        var user = await db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == userEmail.Trim() && u.Status == "Active", ct);
        if (user is null)
            return Unauthorized(new { message = "Tài khoản không hợp lệ hoặc đã bị khóa." });

        if (user.RoleID != FacilityManagerRoleId && user.RoleID != BusinessOperationsRoleId)
            return StatusCode(403, new { message = "Chỉ Facility Manager hoặc Business Operations Manager mới được xóa kho." });

        var unit = await db.StorageUnits.AsNoTracking()
            .Where(u => u.UnitID == unitId)
            .Select(u => new { u.UnitID, u.UnitNumber, u.FacilityID, u.Status, ManagerID = u.Facility.ManagerID })
            .FirstOrDefaultAsync(ct);
        if (unit is null)
            return NotFound(new { message = "Không tìm thấy kho." });

        if (user.RoleID == FacilityManagerRoleId && unit.ManagerID != user.UserID)
            return StatusCode(403, new { message = "Bạn chỉ được xóa kho tại cơ sở mình phụ trách." });

        if (unit.Status == UnitStatus.InUse)
            return Conflict(new { message = $"Kho {unit.UnitNumber} đang được thuê nên không thể xóa." });

        // Kho đã có lịch sử nghiệp vụ thì không xóa (khóa ngoại + giữ lịch sử)
        var hasReservations = await db.ReservationUnits.AnyAsync(r => r.UnitID == unitId, ct);
        var hasHandovers = await db.HandoverTasks.AnyAsync(t => t.UnitID == unitId, ct);
        var hasSupport = await db.SupportRequests.AnyAsync(s => s.UnitID == unitId, ct);
        if (hasReservations || hasHandovers || hasSupport)
            return Conflict(new
            {
                message = $"Kho {unit.UnitNumber} đã có lịch sử đặt chỗ, bàn giao hoặc hỗ trợ nên không thể xóa để giữ dữ liệu."
            });

        // ExecuteDelete chạy lệnh DELETE trực tiếp (không dùng OUTPUT), an toàn với bảng có trigger
        await db.StorageUnits.Where(u => u.UnitID == unitId).ExecuteDeleteAsync(ct);
        return NoContent();
    }
}