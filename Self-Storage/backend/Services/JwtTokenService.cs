using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

/// <summary>Cấu hình JWT đọc từ mục "Jwt" trong appsettings.json.</summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "SelfStorageAPI";
    public string Audience { get; set; } = "SelfStorageClient";
    /// <summary>Khóa bí mật HMAC-SHA256, tối thiểu 32 ký tự.</summary>
    public string Key { get; set; } = string.Empty;
    public int ExpiresMinutes { get; set; } = 10080; // 7 ngày
    /// <summary>
    /// Cho phép request KHÔNG có token dùng header X-User-Email kiểu cũ (chỉ nên bật khi dev/test).
    /// Khi tắt, mọi danh tính đều phải đến từ JWT.
    /// </summary>
    public bool AllowLegacyEmailHeader { get; set; }
}

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtOptions _options;

    public JwtTokenService(Microsoft.Extensions.Options.IOptions<JwtOptions> options)
    {
        _options = options.Value;
    }

    public (string Token, DateTime ExpiresAtUtc) CreateToken(AuthResponseDTO user)
    {
        var expires = DateTime.UtcNow.AddMinutes(_options.ExpiresMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.UserID.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new(ClaimTypes.NameIdentifier, user.UserID.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.RoleName)
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}

