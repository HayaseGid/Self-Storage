using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

[Route("api/admin")]
[ApiController]
public class AdminController : ControllerBase
{
    private const int SystemAdministratorRoleId = 5;
    private readonly SelfStorageDbContext _context;

    public AdminController(SelfStorageDbContext context)
    {
        _context = context;
    }

    [HttpGet("users")]
    public async Task<ActionResult<IReadOnlyList<AdminUserResponse>>> GetUsers(
        CancellationToken cancellationToken)
    {
        if (await GetActiveAdministratorAsync(cancellationToken) is null)
            return Forbid();

        var users = await _context.Users
            .AsNoTracking()
            .Include(user => user.Role)
            .Include(user => user.ManagedFacilities)
            .Include(user => user.FacilityStaffs)
                .ThenInclude(assignment => assignment.Facility)
            .OrderBy(user => user.UserID)
            .ToListAsync(cancellationToken);

        var userIds = users.Select(user => user.UserID).ToArray();
        var lastLogins = await _context.UserActivityLogs
            .AsNoTracking()
            .Where(log => userIds.Contains(log.UserID) && log.Action == "Login")
            .GroupBy(log => log.UserID)
            .Select(group => new { UserId = group.Key, Time = group.Max(log => log.Timestamp) })
            .ToDictionaryAsync(item => item.UserId, item => (DateTime?)item.Time, cancellationToken);

        return Ok(users.Select(user => new AdminUserResponse(
            user.UserID,
            user.FullName,
            user.Username,
            user.Email ?? string.Empty,
            user.PhoneNumber ?? string.Empty,
            user.Role.RoleName,
            GetFacilityName(user),
            ToClientStatus(user.Status),
            "Chưa được ghi nhận",
            lastLogins.TryGetValue(user.UserID, out var lastLogin) && lastLogin.HasValue
                ? lastLogin.Value.ToString("yyyy-MM-dd HH:mm")
                : "Chưa đăng nhập")));
    }

    [HttpGet("activity")]
    public async Task<ActionResult<IReadOnlyList<AdminActivityLogResponse>>> GetActivity(
        CancellationToken cancellationToken)
    {
        if (await GetActiveAdministratorAsync(cancellationToken) is null)
            return Forbid();

        var logs = await _context.UserActivityLogs
            .AsNoTracking()
            .Include(log => log.User)
            .OrderByDescending(log => log.Timestamp)
            .Take(200)
            .ToListAsync(cancellationToken);

        return Ok(logs.Select(log => new AdminActivityLogResponse(
            log.LogID,
            new DateTimeOffset(DateTime.SpecifyKind(log.Timestamp, DateTimeKind.Local)),
            log.User.FullName,
            ToClientAction(log.Action),
            log.Details ?? log.User.Username,
            GetActivityType(log.Action))));
    }

    [HttpPut("users/{userId:int}")]
    public async Task<IActionResult> UpdateUser(
        int userId,
        [FromBody] UpdateAdminUserDTO request,
        CancellationToken cancellationToken)
    {
        var administrator = await GetActiveAdministratorAsync(cancellationToken);
        if (administrator is null)
            return Forbid();

        if (userId == administrator.UserID)
            return Conflict(new { message = "Không thể tự thay đổi quyền hoặc trạng thái của tài khoản quản trị hiện tại." });

        var user = await _context.Users
            .Include(item => item.Role)
            .FirstOrDefaultAsync(item => item.UserID == userId, cancellationToken);
        if (user is null)
            return NotFound(new { message = "Không tìm thấy tài khoản." });
        if (user.RoleID == SystemAdministratorRoleId)
            return Conflict(new { message = "Không thể thay đổi tài khoản System Administrator tại đây." });

        var normalizedStatus = NormalizeStatus(request.Status);
        if (normalizedStatus is null)
            return BadRequest(new { message = "Trạng thái không hợp lệ." });

        var role = await _context.Roles
            .FirstOrDefaultAsync(item => item.RoleName == request.RoleName, cancellationToken);
        if (role is null || role.RoleID == SystemAdministratorRoleId)
            return BadRequest(new { message = "Role không hợp lệ." });

        if (role.RoleID != user.RoleID)
        {
            var hasOperationalAssignments = await _context.Facilities
                .AnyAsync(item => item.ManagerID == userId, cancellationToken)
                || await _context.FacilityStaffs.AnyAsync(item => item.UserID == userId, cancellationToken)
                || await _context.HandoverTasks.AnyAsync(item => item.StaffID == userId, cancellationToken);
            if (hasOperationalAssignments)
                return Conflict(new { message = "Không thể đổi role khi tài khoản đang được gán cơ sở hoặc có nhiệm vụ nghiệp vụ." });
        }

        var oldRole = user.Role.RoleName;
        var oldStatus = ToClientStatus(user.Status);
        user.RoleID = role.RoleID;
        user.Status = normalizedStatus;

        var changes = new List<string>();
        if (oldRole != role.RoleName)
            changes.Add($"Role: {oldRole} → {role.RoleName}");
        if (oldStatus != ToClientStatus(normalizedStatus))
            changes.Add($"Trạng thái: {oldStatus} → {ToClientStatus(normalizedStatus)}");
        if (changes.Count == 0)
            return NoContent();

        _context.UserActivityLogs.Add(new UserActivityLog
        {
            UserID = administrator.UserID,
            Action = oldStatus != ToClientStatus(normalizedStatus)
                ? GetStatusAction(oldStatus, ToClientStatus(normalizedStatus))
                : "Role Changed",
            IPAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            Timestamp = DateTime.Now,
            Details = $"{user.Username}: {string.Join("; ", changes)}"
        });
        await _context.SaveChangesAsync(cancellationToken);

        return NoContent();
    }

    private async Task<User?> GetActiveAdministratorAsync(CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return null;

        return await _context.Users
            .Include(user => user.Role)
            .FirstOrDefaultAsync(
                user => user.Email == email
                    && user.RoleID == SystemAdministratorRoleId
                    && user.Status == "Active",
                cancellationToken);
    }

    private static string GetFacilityName(User user)
    {
        var names = user.ManagedFacilities
            .Select(facility => facility.FacilityName)
            .Concat(user.FacilityStaffs.Select(assignment => assignment.Facility.FacilityName))
            .Distinct()
            .ToArray();
        return names.Length == 0 ? "—" : string.Join(", ", names);
    }

    private static string ToClientStatus(string? status) => status switch
    {
        "Pending Approval" => "Pending",
        null or "" => "Unknown",
        _ => status
    };

    private static string? NormalizeStatus(string status) => status switch
    {
        "Pending" => "Pending Approval",
        "Pending Approval" => "Pending Approval",
        "Active" => "Active",
        "Locked" => "Locked",
        "Rejected" => "Rejected",
        _ => null
    };

    private static string GetStatusAction(string oldStatus, string status) => (oldStatus, status) switch
    {
        ("Pending", "Active") => "Account Approved",
        ("Locked", "Active") => "Account Unlocked",
        (_, "Locked") => "Account Locked",
        (_, "Rejected") => "Account Rejected",
        _ => "Account Updated"
    };

    private static string ToClientAction(string action) => action switch
    {
        "Login" => "Đăng nhập hệ thống",
        "Account Approved" => "Đã duyệt tài khoản",
        "Account Rejected" => "Từ chối tài khoản",
        "Account Locked" => "Đã khóa tài khoản",
        "Account Unlocked" => "Đã mở khóa tài khoản",
        "Role Changed" => "Đã thay đổi role",
        _ => action
    };

    private static string GetActivityType(string action) => action switch
    {
        "Login" => "login",
        "Account Approved" or "Account Rejected" => "approval",
        "Role Changed" => "role",
        _ => "security"
    };
}
