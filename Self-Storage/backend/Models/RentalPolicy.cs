using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class RentalPolicy
{
    public int RentalPolicyID { get; set; }
    public int? FacilityID { get; set; }
    public byte DepositMonths { get; set; } = 2;
    public int HoldMinutes { get; set; } = 15;
    public decimal LateFeePerDay { get; set; }
    public int GracePeriodDays { get; set; } = 3;
    public int RenewalNoticeDays { get; set; } = 30;
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedByUserID { get; set; }

    public Facility? Facility { get; set; }
    public User? UpdatedByUser { get; set; }
    public ICollection<CancellationRule> CancellationRules { get; set; } = new List<CancellationRule>();
}
