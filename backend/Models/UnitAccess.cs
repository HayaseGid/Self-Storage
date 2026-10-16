using System;

namespace SelfStorageAPI.Models;

public class UnitAccess
{
    [System.ComponentModel.DataAnnotations.Key]
    public int AccessID { get; set; }
    public int ContractID { get; set; }
    public int UserID { get; set; }
    public int UnitID { get; set; }
    public string? AccessType { get; set; }
    public string? AccessValue { get; set; }
    public DateTime IssueDate { get; set; }
    public DateTime? ReturnDate { get; set; }
    public string? Status { get; set; }

    public Contract Contract { get; set; } = null!;
    public User User { get; set; } = null!;
    public StorageUnit Unit { get; set; } = null!;
}
