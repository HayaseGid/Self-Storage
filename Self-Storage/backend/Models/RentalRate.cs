using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class RentalRate
{
    public int RentalRateID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public decimal MonthlyPrice { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedByUserID { get; set; }

    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
    public FacilityUnitType FacilityUnitType { get; set; } = null!;
    public FacilityUnitSize FacilityUnitSize { get; set; } = null!;
    public User? UpdatedByUser { get; set; }
    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<ReservationItem> ReservationItems { get; set; } = new List<ReservationItem>();
}
