namespace SelfStorageAPI.Models;

public class CancellationRule
{
    public int CancellationRuleID { get; set; }
    public int RentalPolicyID { get; set; }
    public int DaysBeforeStart { get; set; }
    public decimal RefundPercent { get; set; }

    public RentalPolicy RentalPolicy { get; set; } = null!;
}

