using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

public sealed record AdminUserResponse(
    int Id,
    string Name,
    string Username,
    string Email,
    string Phone,
    string Role,
    string Facility,
    string Status,
    string CreatedAt,
    string LastLogin);

public sealed record AdminActivityLogResponse(
    int Id,
    DateTimeOffset Time,
    string Actor,
    string Action,
    string Target,
    string Type);

public sealed record UpdateAdminUserDTO
{
    [Required]
    public string RoleName { get; init; } = string.Empty;

    [Required]
    public string Status { get; init; } = string.Empty;
}
