using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
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
            || await _context.HandoverTasks.AnyAsync(item => item.StaffID == userId, cancellationToken);
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