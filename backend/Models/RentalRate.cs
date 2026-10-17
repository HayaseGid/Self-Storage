namespace SelfStorageAPI.Models;

public class RentalRate
{
    public int RentalRateID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public decimal MonthlyPrice { get; set; }

    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
}
