using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IUserRepository
{
    Task<User?> GetUserByEmailAsync(string email);
    Task<bool> EmailExistsAsync(string email);
    Task<Role?> GetRoleByNameAsync(string roleName);
    Task AddUserAsync(User user);
    Task SaveChangesAsync();
}
