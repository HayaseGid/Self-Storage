using System;

namespace SelfStorageAPI.Models;

public class EmailVerificationCode
{
    public long VerificationCodeID { get; set; }
    public int? UserID { get; set; }
    public long? PendingRegistrationID { get; set; }
    public string Email { get; set; } = null!;
    public string Purpose { get; set; } = null!;
    public byte[] CodeHash { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public byte FailedAttempts { get; set; }
    public byte MaxAttempts { get; set; } = 5;
    public DateTime? ClosedAt { get; set; }
    public string? CloseReason { get; set; }
    public string? RequestedIPAddress { get; set; }

    public User? User { get; set; }
    public PendingRegistration? PendingRegistration { get; set; }
}

