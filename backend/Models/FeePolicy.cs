using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class FeePolicy
{
    public int FeePolicyID { get; set; }
    public string FeeCode { get; set; } = null!;
    public string FeeName { get; set; } = null!;
    public string FeeCategory { get; set; } = null!;
    public string ValueType { get; set; } = null!;
    public decimal MinValue { get; set; }
    public decimal MaxValue { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Charge> Charges { get; set; } = new List<Charge>();
}

