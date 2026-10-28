using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

public class LoginRequestDTO
{
    [Required]
    public string Email { get; set; } = null!;
    [Required]
    public string Password { get; set; } = null!;
}

public class RegisterRequestDTO
{
    [Required]
    public string FullName { get; set; } = null!;
    [Required]
    public string Email { get; set; } = null!;
    [Required]
    public string Password { get; set; } = null!;
    [Required]
    public string RoleName { get; set; } = null!;
    public string? PhoneNumber { get; set; }
    public string? Gender { get; set; }
    public string? DateOfBirth { get; set; }
}

public class AuthResponseDTO
{
    public int UserID { get; set; }
    public string FullName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string RoleName { get; set; } = null!;
    public string Status { get; set; } = null!;
    public string? PhoneNumber { get; set; }
    /// <summary>JWT access token, gửi lại trong header "Authorization: Bearer {token}".</summary>
    public string? Token { get; set; }
    public DateTime? TokenExpiresAt { get; set; }
}
