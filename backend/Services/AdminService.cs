using System.Text;
using System.Text;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class AdminService : IAdminService
{
    private const int SystemAdministratorRoleId = 5;
    private const int CustomerRoleId = 1;
    private static readonly string[] OpenInspectionStatuses = ["Pending Manager", "Awaiting Customer", "Disputed"];
    private readonly IAdminRepository _adminRepository;
    private readonly IReturnInspectionRepository _inspections;

    public AdminService(IAdminRepository adminRepository, IReturnInspectionRepository inspections)
    {
        _adminRepository = adminRepository;
        _inspections = inspections;
    }

    /*
     * Lý do tài khoản chưa được đổi vai trò (rỗng = tài khoản trống hoàn toàn).
     * = các lý do theo vai trò hiện tại (AdminRepository.GetRoleChangeBlockersAsync)
     *   + với khách hàng: kết quả kiểm kho chưa xong (chờ Quản lý duyệt / chờ khách xác nhận / đang khiếu nại).
     */
    private async Task<List<string>> RoleChangeBlockersAsync(User user, CancellationToken cancellationToken)
    {
        var blockers = await _adminRepository.GetRoleChangeBlockersAsync(user, DateTime.UtcNow, cancellationToken);
        if (user.RoleID == CustomerRoleId)
        {
            try
            {
                var rows = await _inspections.ListAsync(user.UserID, null, null, null, false, cancellationToken);
                var open = rows.Count(r => OpenInspectionStatuses.Contains(r.Status));
                if (open > 0) blockers.Add($"Có {open} kết quả kiểm kho khi trả kho chưa quyết toán xong.");
            }
            catch (Exception) { /* bảng kiểm kho chưa có (DB cũ): bỏ qua mục này */ }
        }
        return blockers;
    }

    /// <summary>
    /// GET /api/admin/users/{id}/role-eligibility — tài khoản có đang trống để đổi vai trò không, kèm danh sách lý do.
    /// </summary>
    public async Task<AdminServiceResponse> GetRoleEligibilityAsync(int userId, string? adminEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);
        var administrator = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (administrator == null) return new AdminServiceResponse(false, null, 403, null);

        var user = await _adminRepository.GetUserByIdAsync(userId, cancellationToken);
        if (user == null) return new AdminServiceResponse(false, "Không tìm thấy tài khoản.", 404, null);

        List<string> blockers;
        if (user.RoleID == SystemAdministratorRoleId) blockers = ["Không thể thay đổi tài khoản System Administrator."];
        else if (user.UserID == administrator.UserID) blockers = ["Không thể tự thay đổi quyền của tài khoản đang đăng nhập."];
        else blockers = await RoleChangeBlockersAsync(user, cancellationToken);

        return new AdminServiceResponse(true, null, 200, new
        {
            userId = user.UserID,
            role = user.Role.RoleName,
            canChangeRole = blockers.Count == 0,
            blockers
        });
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
            user.Username ?? user.Email,
            user.Email ?? string.Empty,
            user.PhoneNumber ?? string.Empty,
            user.Role.RoleName,
            GetFacilityName(user),
            ToClientStatus(user.Status),
            user.CreatedAt.ToString("yyyy-MM-dd HH:mm"),
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
            log.Details ?? log.User.Username ?? log.User.Email,
            GetActivityType(log.Action))).ToList();

        return new AdminServiceResponse(true, null, 200, data);
    }

    /* [PHÂN TRANG] Giống GetUsersAsync nhưng chỉ tải 1 trang (xem AdminRepository.GetUsersPageAsync). */
    public async Task<AdminServiceResponse> GetUsersPageAsync(string? adminEmail, PageQuery query, string? roleName, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var admin = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (admin == null) return new AdminServiceResponse(false, null, 403, null);

        var (users, total) = await _adminRepository.GetUsersPageAsync(query, roleName, cancellationToken);
        var lastLogins = await _adminRepository.GetLastLoginsAsync(users.Select(user => user.UserID).ToArray(), cancellationToken);

        var items = users.Select(user => new AdminUserResponse(
            user.UserID,
            user.FullName,
            user.Username ?? user.Email,
            user.Email ?? string.Empty,
            user.PhoneNumber ?? string.Empty,
            user.Role.RoleName,
            GetFacilityName(user),
            ToClientStatus(user.Status),
            user.CreatedAt.ToString("yyyy-MM-dd HH:mm"),
            lastLogins.TryGetValue(user.UserID, out var lastLogin) && lastLogin.HasValue
                ? lastLogin.Value.ToString("yyyy-MM-dd HH:mm")
                : "Chưa đăng nhập")).ToList();

        return new AdminServiceResponse(true, null, 200, PagedResult<AdminUserResponse>.Create(items, total, query));
    }

    /* [PHÂN TRANG] Nhật ký hoạt động theo trang (mới nhất lên đầu). */
    public async Task<AdminServiceResponse> GetActivityPageAsync(string? adminEmail, PageQuery query, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var admin = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (admin == null) return new AdminServiceResponse(false, null, 403, null);

        var (logs, total) = await _adminRepository.GetActivityLogsPageAsync(query, cancellationToken);
        var items = logs.Select(log => new AdminActivityLogResponse(
            log.LogID,
            new DateTimeOffset(DateTime.SpecifyKind(log.Timestamp, DateTimeKind.Local)),
            log.User.FullName,
            ToClientAction(log.Action),
            log.Details ?? log.User.Username ?? log.User.Email,
            GetActivityType(log.Action))).ToList();

        return new AdminServiceResponse(true, null, 200, PagedResult<AdminActivityLogResponse>.Create(items, total, query));
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

        // Đổi vai trò chỉ khi tài khoản trống hoàn toàn (không còn nghiệp vụ đang mở). Kiểm tra + ghi trong cùng transaction
        // để không có đơn / việc mới chen vào giữa lúc kiểm tra và lúc đổi. Khóa / mở khóa (chỉ đổi trạng thái) không bị chặn.
        var roleChanging = role.RoleID != user.RoleID;
        await using var transaction = roleChanging ? await _adminRepository.BeginTransactionAsync(cancellationToken) : null;
        if (roleChanging)
        {
            var blockers = await RoleChangeBlockersAsync(user, cancellationToken);
            if (blockers.Count > 0)
                return new AdminServiceResponse(false, "Chưa thể đổi vai trò: tài khoản đang còn nghiệp vụ chưa xong. " + string.Join(" ", blockers), 409, blockers);
            // Khách hàng chuyển sang vai trò khác: mã ra vào cơ sở hết hiệu lực (giữ số mã và lịch sử đơn cũ để đối chiếu).
            if (user.RoleID == CustomerRoleId && !string.IsNullOrWhiteSpace(user.AccessCode))
                user.AccessCodeStatus = "Inactive";
        }

        var oldRole = user.Role.RoleName;
        var oldStatus = ToClientStatus(user.Status);
        user.RoleID = role.RoleID;
        user.Status = normalizedStatus;
        user.UpdatedAt = DateTime.UtcNow;

        var changes = new List<string>();
        if (oldRole != role.RoleName) changes.Add($"Role: {oldRole} → {role.RoleName}");
        if (oldStatus != ToClientStatus(normalizedStatus)) changes.Add($"Trạng thái: {oldStatus} → {ToClientStatus(normalizedStatus)}");
        
        if (changes.Count == 0) return new AdminServiceResponse(true, null, 204, null);

        _adminRepository.AddActivityLog(new UserActivityLog
        {
            UserID = administrator.UserID,
            Action = oldStatus != ToClientStatus(normalizedStatus) ? GetStatusAction(oldStatus, ToClientStatus(normalizedStatus)) : "Role Changed",
            IPAddress = ipAddress,
            Timestamp = DateTime.UtcNow,
            Details = $"{user.Username ?? user.Email}: {string.Join("; ", changes)}"
        });
        
        await _adminRepository.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        return new AdminServiceResponse(true, null, 204, null);
    }

    public async Task<AdminServiceResponse> ResetUserPasswordAsync(int userId, ResetAdminUserPasswordDTO request, string? adminEmail, string? ipAddress, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(adminEmail)) return new AdminServiceResponse(false, null, 403, null);

        var administrator = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
        if (administrator == null) return new AdminServiceResponse(false, null, 403, null);

        if (string.IsNullOrEmpty(request.Password) || request.Password.Length < 6)
            return new AdminServiceResponse(false, "Mật khẩu phải có ít nhất 6 ký tự.", 400, null);

        if (Encoding.UTF8.GetByteCount(request.Password) > 72)
            return new AdminServiceResponse(false, "Mật khẩu không được vượt quá 72 byte UTF-8.", 400, null);

        var user = await _adminRepository.GetUserByIdAsync(userId, cancellationToken);
        if (user == null) return new AdminServiceResponse(false, "Không tìm thấy tài khoản.", 404, null);

        if (user.UserID == administrator.UserID || user.RoleID == SystemAdministratorRoleId)
            return new AdminServiceResponse(false, "Không thể đặt lại mật khẩu tài khoản System Administrator tại đây.", 409, null);

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
        user.FailedLoginCount = 0;
        user.LockoutEndAt = null;
        user.UpdatedAt = DateTime.UtcNow;

        _adminRepository.AddActivityLog(new UserActivityLog
        {
            UserID = administrator.UserID,
            Action = "Password Reset",
            IPAddress = ipAddress,
            Timestamp = DateTime.UtcNow,
            Details = user.Username ?? user.Email
        });

        await _adminRepository.SaveChangesAsync(cancellationToken);

        return new AdminServiceResponse(true, null, 204, null);
    }

    private static string GetFacilityName(User user)
    {
        var names = user.ManagedFacilities
            .Select(f => f.FacilityName)
            .Concat(user.FacilityStaffs.Select(a => a.Facility.FacilityName))
            .Distinct().ToArray();
        return names.Length == 0 ? "—" : string.Join(", ", names);
    }

    private static string ToClientStatus(string? status) => status switch { "Pending Approval" => "Pending", null or "" => "Unknown", _ => status };

    private static string? NormalizeStatus(string status) => status switch { "Pending" => "Pending Approval", "Pending Approval" => "Pending Approval", "Active" => "Active", "Locked" => "Locked", "Rejected" => "Rejected", "Inactive" => "Inactive", _ => null };

    private static string GetStatusAction(string oldStatus, string status) => (oldStatus, status) switch { ("Pending", "Active") => "Account Approved", ("Locked", "Active") => "Account Unlocked", (_, "Locked") => "Account Locked", (_, "Rejected") => "Account Rejected", _ => "Account Updated" };

    private static string ToClientAction(string action) => action switch { "Login" => "Đăng nhập hệ thống", "Account Approved" => "Đã duyệt tài khoản", "Account Rejected" => "Từ chối tài khoản", "Account Locked" => "Đã khóa tài khoản", "Account Unlocked" => "Đã mở khóa tài khoản", "Role Changed" => "Đã thay đổi role", "Password Reset" => "Đã đặt lại mật khẩu", _ => action };

    private static string GetActivityType(string action) => action switch { "Login" => "login", "Account Approved" or "Account Rejected" => "approval", "Role Changed" => "role", _ => "security" };
}
