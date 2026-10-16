using System;

namespace SelfStorageAPI.Models;

public class UserActivityLog
{
    [System.ComponentModel.DataAnnotations.Key]
    public int LogID { get; set; }
    public int UserID { get; set; }
    public string Action { get; set; } = null!;
    public string? IPAddress { get; set; }
    public DateTime Timestamp { get; set; }
    public string? Details { get; set; }

    public User User { get; set; } = null!;
}
