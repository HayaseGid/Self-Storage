using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

public class SendOtpEmailRequest
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    public string? FullName { get; set; }

    [Required]
    public string Otp { get; set; } = string.Empty;
}

public class SendContractEmailRequest
{
    [Required]
    [EmailAddress]
    public string ToEmail { get; set; } = string.Empty;

    public string? ToName { get; set; }

    public string? Subject { get; set; }

    public string? ContractNumber { get; set; }

    public string? FacilityName { get; set; }

    public string? StartDate { get; set; }

    public string? EndDate { get; set; }

    [Required]
    public string ContractHtml { get; set; } = string.Empty;
}

public class TestEmailRequest
{
    [Required]
    [EmailAddress]
    public string ToEmail { get; set; } = string.Empty;
}

