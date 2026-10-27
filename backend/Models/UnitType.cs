using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class UnitType
{
    public int UnitTypeID { get; set; }
    public string TypeName { get; set; } = null!;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserID { get; set; }

    public User? CreatedByUser { get; set; }
    public ICollection<FacilityUnitType> FacilityUnitTypes { get; set; } = new List<FacilityUnitType>();
    public ICollection<RentalRate> RentalRates { get; set; } = new List<RentalRate>();
    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<ReservationItem> ReservationItems { get; set; } = new List<ReservationItem>();
}
