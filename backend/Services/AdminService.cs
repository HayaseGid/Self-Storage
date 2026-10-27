using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class AdminService : IAdminService
{
    private const int SystemAdministratorRoleId = 5;
    private readonly IAdminRepository _adminRepository;

    public AdminService(IAdminRepository adminRepository)
    {
        _adminRepository = adminRepository;
    }

    public async Task<AdminServiceResponse> GetUsersAsync(string? adminEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var admin = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (admin == null) return new AdminServiceResponse(false, null, 403, null);

        var users = await _adminRepository.GetUsersWithDetailsAsync(cancellationToken);
        var userIds = users.Select(user => user.UserID).ToArray();
        var lastLogins = await _adminRepository.GetLastLoginsAsync(userIds, cancellationToken);

        var data = users.Select(user => new AdminUserResponse(
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
                : "Chưa đăng nhập")).ToList();

        return new AdminServiceResponse(true, null, 200, data);
    }

    public async Task<AdminServiceResponse> GetActivityAsync(string? adminEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var admin = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (admin == null) return new AdminServiceResponse(false, null, 403, null);

        var logs = await _adminRepository.GetRecentActivityLogsAsync(200, cancellationToken);

        var data = logs.Select(log => new AdminActivityLogResponse(
            log.LogID,
            new DateTimeOffset(DateTime.SpecifyKind(log.Timestamp, DateTimeKind.Local)),
            log.User.FullName,
            ToClientAction(log.Action),
            log.Details ?? log.User.Username,
            GetActivityType(log.Action))).ToList();

        return new AdminServiceResponse(true, null, 200, data);
    }

    public async Task<AdminServiceResponse> UpdateUserAsync(int userId, UpdateAdminUserDTO request, string? adminEmail, string? ipAddress, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var administrator = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (administrator == null) return new AdminServiceResponse(false, null, 403, null);

        if (userId == administrator.UserID)
            return new AdminServiceResponse(false, "Không thể tự thay đổi quyền hoặc trạng thái của tài khoản quản trị hiện tại.", 409, null);

        var user = await _adminRepository.GetUserByIdAsync(userId, cancellationToken);
        if (user == null) return new AdminServiceResponse(false, "Không tìm thấy tài khoản.", 404, null);
        
        if (user.RoleID == SystemAdministratorRoleId)
            return new AdminServiceResponse(false, "Không thể thay đổi tài khoản System Administrator tại đây.", 409, null);

        var normalizedStatus = NormalizeStatus(request.Status);
        if (normalizedStatus == null)
            return new AdminServiceResponse(false, "Trạng thái không hợp lệ.", 400, null);

        var role = await _adminRepository.GetRoleByNameAsync(request.RoleName, cancellationToken);
        if (role == null || role.RoleID == SystemAdministratorRoleId)
            return new AdminServiceResponse(false, "Role không hợp lệ.", 400, null);

        if (role.RoleID != user.RoleID)
        {
            var hasOperationalAssignments = await _adminRepository.HasOperationalAssignmentsAsync(userId, cancellationToken);
            if (hasOperationalAssignments)
                return new AdminServiceResponse(false, "Không thể đổi role khi tài khoản đang được gán cơ sở hoặc có nhiệm vụ nghiệp vụ.", 409, null);
        }

        var oldRole = user.Role.RoleName;
        var oldStatus = ToClientStatus(user.Status);
        user.RoleID = role.RoleID;
        user.Status = normalizedStatus;

        var changes = new List<string>();
        if (oldRole != role.RoleName) changes.Add($"Role: {oldRole} → {role.RoleName}");
        if (oldStatus != ToClientStatus(normalizedStatus)) changes.Add($"Trạng thái: {oldStatus} → {ToClientStatus(normalizedStatus)}");
        
        if (changes.Count == 0) return new AdminServiceResponse(true, null, 204, null);

        _adminRepository.AddActivityLog(new UserActivityLog
        {
            UserID = administrator.UserID,
            Action = oldStatus != ToClientStatus(normalizedStatus) ? GetStatusAction(oldStatus, ToClientStatus(normalizedStatus)) : "Role Changed",
            IPAddress = ipAddress,
            Timestamp = DateTime.Now,
            Details = $"{user.Username}: {string.Join("; ", changes)}"
        });
        
        await _adminRepository.SaveChangesAsync(cancellationToken);

        return new AdminServiceResponse(true, null, 204, null);
    }

    // Các Helper Logic được bưng nguyên xi từ Controller cũ qua
    private static string GetFacilityName(User user)
    {
        var names = user.ManagedFacilities
            .Select(f => f.FacilityName)
            .Concat(user.FacilityStaffs.Select(a => a.Facility.FacilityName))
            .Distinct().ToArray();
        return names.Length == 0 ? "—" : string.Join(", ", names);
    }

    private static string ToClientStatus(string? status) => status switch { "Pending Approval" => "Pending", null or "" => "Unknown", _ => status };

    private static string? NormalizeStatus(string status) => status switch { "Pending" => "Pending Approval", "Pending Approval" => "Pending Approval", "Active" => "Active", "Locked" => "Locked", "Rejected" => "Rejected", _ => null };

    private static string GetStatusAction(string oldStatus, string status) => (oldStatus, status) switch { ("Pending", "Active") => "Account Approved", ("Locked", "Active") => "Account Unlocked", (_, "Locked") => "Account Locked", (_, "Rejected") => "Account Rejected", _ => "Account Updated" };

    private static string ToClientAction(string action) => action switch { "Login" => "Đăng nhập hệ thống", "Account Approved" => "Đã duyệt tài khoản", "Account Rejected" => "Từ chối tài khoản", "Account Locked" => "Đã khóa tài khoản", "Account Unlocked" => "Đã mở khóa tài khoản", "Role Changed" => "Đã thay đổi role", _ => action };

    private static string GetActivityType(string action) => action switch { "Login" => "login", "Account Approved" or "Account Rejected" => "approval", "Role Changed" => "role", _ => "security" };
}