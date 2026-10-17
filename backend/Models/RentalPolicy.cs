namespace SelfStorageAPI.Models;

public class RentalPolicy
{
    public int RentalPolicyID { get; set; }
    public int FacilityID { get; set; }
    public decimal DepositPercent { get; set; }
    public Facility Facility { get; set; } = null!;
}
