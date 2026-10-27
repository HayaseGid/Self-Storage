using System;
using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.Models;

public class StatusChangeLog
{
    [Key]
    public long LogID { get; set; }
    public string EntityType { get; set; } = null!;
    public long EntityID { get; set; }
    public string? OldStatus { get; set; }
    public string NewStatus { get; set; } = null!;
    public int? ChangedByUserID { get; set; }
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
    public string? Source { get; set; }

    public User? ChangedByUser { get; set; }
}

