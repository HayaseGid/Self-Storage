using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class FacilityUnitType
{
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
    public int? AddedByUserID { get; set; }

    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public User? AddedByUser { get; set; }
    public ICollection<RentalRate> RentalRates { get; set; } = new List<RentalRate>();
}

