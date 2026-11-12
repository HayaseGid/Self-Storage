using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IEmailService
{
    Task SendOtpEmailAsync(string toEmail, string? toName, string otp, CancellationToken ct = default);
    Task SendContractEmailAsync(SendContractEmailRequest request, CancellationToken ct = default);
    Task SendRawEmailAsync(string toEmail, string subject, string bodyHtml, CancellationToken ct = default);
    Task TestConnectionAsync(string toEmail, CancellationToken ct = default);
}

