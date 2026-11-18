namespace SelfStorageAPI.Models;

public class BrevoSettings
{
    public string ApiKey { get; set; } = string.Empty;
    public string SenderEmail { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    // Hộp thư nhận tin nhắn "Liên hệ" của khách (POST /api/support/contact). Trống thì dùng storespacevn101@gmail.com.
    public string SupportInboxEmail { get; set; } = string.Empty;
}

