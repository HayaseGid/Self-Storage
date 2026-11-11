using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class AdminRepository : IAdminRepository
{
    private const int SystemAdministratorRoleId = 5;
    private readonly SelfStorageDbContext _context;

    public AdminRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetActiveAdministratorByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users
            .Include(user => user.Role)
            .FirstOrDefaultAsync(
                user => user.Email == email
                    && user.RoleID == SystemAdministratorRoleId
                    && user.Status == "Active",
                cancellationToken);
    }

    public async Task<IReadOnlyList<User>> GetUsersWithDetailsAsync(CancellationToken cancellationToken)
    {
        return await _context.Users
            .AsNoTracking()
            .Include(user => user.Role)
            .Include(user => user.ManagedFacilities)
            .Include(user => user.FacilityStaffs)
                .ThenInclude(assignment => assignment.Facility)
            .OrderBy(user => user.UserID)
            .ToListAsync(cancellationToken);
    }

    public async Task<Dictionary<int, DateTime?>> GetLastLoginsAsync(int[] userIds, CancellationToken cancellationToken)
    {
        return await _context.UserActivityLogs
            .AsNoTracking()
            .Where(log => userIds.Contains(log.UserID) && log.Action == "Login")
            .GroupBy(log => log.UserID)
            .Select(group => new { UserId = group.Key, Time = group.Max(log => log.Timestamp) })
            .ToDictionaryAsync(item => item.UserId, item => (DateTime?)item.Time, cancellationToken);
    }

    public async Task<IReadOnlyList<UserActivityLog>> GetRecentActivityLogsAsync(int limit, CancellationToken cancellationToken)
    {
        return await _context.UserActivityLogs
            .AsNoTracking()
            .Include(log => log.User)
            .OrderByDescending(log => log.Timestamp)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    /* [PHÂN TRANG] Danh sách tài khoản: lọc / đếm / Skip-Take trong SQL. Mới tạo lên đầu (sort=newest mặc định). */
    public async Task<(IReadOnlyList<User> Items, int Total)> GetUsersPageAsync(PageQuery query, string? roleName, CancellationToken cancellationToken)
    {
        var users = _context.Users.AsNoTracking().AsQueryable();

        var keyword = query.Keyword;
        if (keyword.Length > 0)
        {
            users = users.Where(user =>
                user.FullName.Contains(keyword) ||
                user.Email.Contains(keyword) ||
                (user.Username != null && user.Username.Contains(keyword)) ||
                (user.PhoneNumber != null && user.PhoneNumber.Contains(keyword)));
        }

        if (!string.IsNullOrWhiteSpace(roleName) && roleName != "All")
            users = users.Where(user => user.Role.RoleName == roleName);

        var statuses = query.Statuses
            .Where(code => code != "ALL")
            .Select(code => code switch
            {
                "PENDING" or "PENDING APPROVAL" => "Pending Approval",
                "ACTIVE" => "Active",
                "LOCKED" => "Locked",
                "REJECTED" => "Rejected",
                "INACTIVE" => "Inactive",
                _ => code
            })
            .ToArray();
        if (statuses.Length > 0)
            users = users.Where(user => statuses.Contains(user.Status));

        var ordered = query.SortKey switch
        {
            "oldest" => users.OrderBy(user => user.CreatedAt).ThenBy(user => user.UserID),
            "name" => users.OrderBy(user => user.FullName).ThenBy(user => user.UserID),
            _ => users.OrderByDescending(user => user.CreatedAt).ThenByDescending(user => user.UserID)
        };

        var total = await users.CountAsync(cancellationToken);
        var items = await ordered
            .Skip(query.SkipFor(total))
            .Take(query.SafePageSize)
            .Include(user => user.Role)
            .Include(user => user.ManagedFacilities)
            .Include(user => user.FacilityStaffs)
                .ThenInclude(assignment => assignment.Facility)
            .AsSplitQuery()
            .ToListAsync(cancellationToken);
        return (items, total);
    }

    /* [PHÂN TRANG] Nhật ký hoạt động: mới nhất lên đầu. status=LOGIN|APPROVAL|ROLE|SECURITY lọc theo nhóm hành động. */
    public async Task<(IReadOnlyList<UserActivityLog> Items, int Total)> GetActivityLogsPageAsync(PageQuery query, CancellationToken cancellationToken)
    {
        var logs = _context.UserActivityLogs.AsNoTracking().AsQueryable();

        var keyword = query.Keyword;
        if (keyword.Length > 0)
        {
            logs = logs.Where(log =>
                log.Action.Contains(keyword) ||
                (log.Details != null && log.Details.Contains(keyword)) ||
                log.User.FullName.Contains(keyword) ||
                log.User.Email.Contains(keyword));
        }

        var types = query.Statuses;
        if (types.Length > 0)
        {
            var wantLogin = types.Contains("LOGIN");
            var wantApproval = types.Contains("APPROVAL");
            var wantRole = types.Contains("ROLE");
            var wantSecurity = types.Contains("SECURITY");
            logs = logs.Where(log =>
                (wantLogin && log.Action == "Login") ||
                (wantApproval && (log.Action == "Account Approved" || log.Action == "Account Rejected")) ||
                (wantRole && log.Action == "Role Changed") ||
                (wantSecurity && log.Action != "Login" && log.Action != "Account Approved" &&
                    log.Action != "Account Rejected" && log.Action != "Role Changed"));
        }

        var total = await logs.CountAsync(cancellationToken);
        var ordered = query.SortKey == "oldest"
            ? logs.OrderBy(log => log.Timestamp).ThenBy(log => log.LogID)
            : logs.OrderByDescending(log => log.Timestamp).ThenByDescending(log => log.LogID);
        var items = await ordered
            .Skip(query.SkipFor(total))
            .Take(query.SafePageSize)
            .Include(log => log.User)
            .ToListAsync(cancellationToken);
        return (items, total);
    }

    public async Task<User?> GetUserByIdAsync(int userId, CancellationToken cancellationToken)
    {
        return await _context.Users
            .Include(item => item.Role)
            .FirstOrDefaultAsync(item => item.UserID == userId, cancellationToken);
    }

    public async Task<Role?> GetRoleByNameAsync(string roleName, CancellationToken cancellationToken)
    {
        return await _context.Roles
            .FirstOrDefaultAsync(item => item.RoleName == roleName, cancellationToken);
    }

    public async Task<bool> HasOperationalAssignmentsAsync(int userId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(item => item.ManagerID == userId, cancellationToken)
            || await _context.FacilityStaffs.AnyAsync(item => item.UserID == userId, cancellationToken)
            || await _context.HandoverTasks.AnyAsync(item => item.AssignedStaffID == userId, cancellationToken);
    }

    public void AddActivityLog(UserActivityLog log)
    {
        _context.UserActivityLogs.Add(log);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
