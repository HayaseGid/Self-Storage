namespace SelfStorageAPI.Models;

public class SmtpSettings
{
    public string Server { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public string SenderEmail { get; set; } = string.Empty;
    public string SenderName { get; set; } = "StoreSpace Support";
    public string Password { get; set; } = string.Empty;
    public bool EnableSsl { get; set; } = true;
}

