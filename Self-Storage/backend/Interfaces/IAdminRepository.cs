using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IAdminRepository
{
    Task<User?> GetActiveAdministratorByEmailAsync(string email, CancellationToken cancellationToken);
    Task<IReadOnlyList<User>> GetUsersWithDetailsAsync(CancellationToken cancellationToken);
    Task<Dictionary<int, DateTime?>> GetLastLoginsAsync(int[] userIds, CancellationToken cancellationToken);
    Task<IReadOnlyList<UserActivityLog>> GetRecentActivityLogsAsync(int limit, CancellationToken cancellationToken);
    Task<User?> GetUserByIdAsync(int userId, CancellationToken cancellationToken);
    Task<Role?> GetRoleByNameAsync(string roleName, CancellationToken cancellationToken);
    Task<bool> HasOperationalAssignmentsAsync(int userId, CancellationToken cancellationToken);
    void AddActivityLog(UserActivityLog log);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}