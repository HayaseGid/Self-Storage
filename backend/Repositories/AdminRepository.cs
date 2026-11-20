using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Constants;
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

    /*
     * Lý do tài khoản CHƯA được đổi vai trò (đang vướng nghiệp vụ). Danh sách rỗng = tài khoản trống, đổi được.
     * Xét theo vai trò HIỆN TẠI của tài khoản; chỉ tính việc còn đang mở (đơn / việc đã xong, đã hủy không chặn).
     *   Khách hàng (1): đơn chưa kết thúc, khoản chưa đóng, tiền đang chờ hoàn, đơn trả kho sớm chờ duyệt, mã/thẻ kho còn hiệu lực
     *                   (kết quả kiểm kho chưa xong do AdminService kiểm thêm qua IReturnInspectionRepository).
     *   Nhân viên (2):  đang được phân công ở cơ sở, còn việc bàn giao / trả kho chưa xong.
     *   Quản lý (3):    đang quản lý cơ sở.
     *   BOM (4):        là BOM đang hoạt động cuối cùng.
     */
    public async Task<List<string>> GetRoleChangeBlockersAsync(User user, DateTime nowUtc, CancellationToken cancellationToken)
    {
        var blockers = new List<string>();
        var id = user.UserID;
        static string Vnd(decimal v) => v.ToString("N0", System.Globalization.CultureInfo.GetCultureInfo("vi-VN")) + "đ";

        switch (user.RoleID)
        {
            case 1:
            {
                var openReservations = await _context.Reservations
                    .Where(r => r.CustomerID == id &&
                                (r.Status == ReservationStatus.Paid || r.Status == ReservationStatus.Confirmed ||
                                 r.Status == ReservationStatus.HandedOver ||
                                 (r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt != null && r.HoldExpiresAt > nowUtc)))
                    .Select(r => r.Status)
                    .ToListAsync(cancellationToken);
                var renting = openReservations.Count(s => s == ReservationStatus.HandedOver);
                var waiting = openReservations.Count - renting;
                if (renting > 0) blockers.Add($"Đang thuê {renting} đơn kho (chưa trả kho).");
                if (waiting > 0) blockers.Add($"Có {waiting} đơn đặt kho đang xử lý (chờ cọc / đã cọc / chờ nhận kho).");

                var unpaid = await _context.Charges
                    .Where(c => c.Reservation.CustomerID == id && c.Status == "Unpaid" &&
                                c.Reservation.Status != ReservationStatus.Cancelled && c.Reservation.Status != ReservationStatus.Expired)
                    .SumAsync(c => (decimal?)c.Amount, cancellationToken) ?? 0m;
                if (unpaid > 0) blockers.Add($"Còn nợ {Vnd(unpaid)} chưa đóng (tiền thuê / phí).");

                var refunds = await _context.Payments
                    .Where(p => p.Reservation.CustomerID == id && p.Direction == "Refund" && p.Status == "Pending")
                    .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;
                if (refunds > 0) blockers.Add($"Còn {Vnd(refunds)} đang chờ hoàn cho khách.");

                if (await _context.EarlyReturnRequests.AnyAsync(e => e.CustomerID == id && e.Status == "Pending", cancellationToken))
                    blockers.Add("Có đơn trả kho sớm đang chờ Quản lý duyệt.");

                var accesses = await _context.UnitAccesses.CountAsync(a => a.UserID == id && a.Status == "Active", cancellationToken);
                if (accesses > 0) blockers.Add($"Còn {accesses} mã / thẻ ra vào kho đang hiệu lực.");
                break;
            }
            case 2:
            {
                var facilities = await _context.FacilityStaffs
                    .Where(fs => fs.UserID == id && fs.Status == "Active")
                    .Select(fs => fs.Facility.FacilityName)
                    .ToListAsync(cancellationToken);
                if (facilities.Count > 0)
                    blockers.Add($"Đang được phân công tại {string.Join(", ", facilities)}. Nhờ Quản lý cơ sở rút nhân viên khỏi cơ sở trước.");

                var openTasks = await _context.HandoverTasks
                    .CountAsync(t => t.AssignedStaffID == id && t.Status != "Completed" && t.Status != "Cancelled", cancellationToken);
                if (openTasks > 0) blockers.Add($"Còn {openTasks} việc bàn giao / trả kho chưa hoàn thành.");
                break;
            }
            case 3:
            {
                var managed = await _context.Facilities
                    .Where(f => f.ManagerID == id)
                    .Select(f => f.FacilityName)
                    .ToListAsync(cancellationToken);
                if (managed.Count > 0)
                    blockers.Add($"Đang quản lý {string.Join(", ", managed)}. Nhờ BOM đổi người quản lý cơ sở trước.");
                break;
            }
            case 4:
            {
                if (user.Status == "Active")
                {
                    var activeBoms = await _context.Users.CountAsync(u => u.RoleID == 4 && u.Status == "Active", cancellationToken);
                    if (activeBoms <= 1) blockers.Add("Đây là tài khoản Business Operations Manager đang hoạt động cuối cùng. Hãy có thêm 1 BOM khác trước.");
                }
                break;
            }
        }
        return blockers;
    }

    public async Task<IDbContextTransaction> BeginTransactionAsync(CancellationToken cancellationToken) =>
        await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);


    public void AddActivityLog(UserActivityLog log)
    {
        _context.UserActivityLogs.Add(log);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
