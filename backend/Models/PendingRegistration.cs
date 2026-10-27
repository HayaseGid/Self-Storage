using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class PendingRegistration
{
    public long PendingRegistrationID { get; set; }
    public string Email { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string? PhoneNumber { get; set; }
    public string PasswordHash { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public string? RequestedIPAddress { get; set; }

    public ICollection<EmailVerificationCode> EmailVerificationCodes { get; set; } = new List<EmailVerificationCode>();
}

