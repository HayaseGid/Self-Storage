using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IJwtTokenService
{
    /// <summary>Tạo access token (JWT) cho người dùng vừa đăng nhập thành công.</summary>
    (string Token, DateTime ExpiresAtUtc) CreateToken(AuthResponseDTO user);
}

