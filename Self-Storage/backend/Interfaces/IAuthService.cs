using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IAuthService
{
    Task<AuthResult> LoginAsync(LoginRequestDTO request);
    Task<AuthResult> RegisterAsync(RegisterRequestDTO request);
}
