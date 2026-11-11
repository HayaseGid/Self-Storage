using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public record AdminServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface IAdminService
{
    Task<AdminServiceResponse> GetUsersAsync(string? adminEmail, CancellationToken cancellationToken);
    Task<AdminServiceResponse> GetActivityAsync(string? adminEmail, CancellationToken cancellationToken);
    Task<AdminServiceResponse> GetUsersPageAsync(string? adminEmail, PageQuery query, string? roleName, CancellationToken cancellationToken);
    Task<AdminServiceResponse> GetActivityPageAsync(string? adminEmail, PageQuery query, CancellationToken cancellationToken);
    Task<AdminServiceResponse> UpdateUserAsync(int userId, UpdateAdminUserDTO request, string? adminEmail, string? ipAddress, CancellationToken cancellationToken);
    Task<AdminServiceResponse> ResetUserPasswordAsync(int userId, ResetAdminUserPasswordDTO request, string? adminEmail, string? ipAddress, CancellationToken cancellationToken);
}