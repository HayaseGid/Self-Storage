using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class ReservationUnit
{
    public long ReservationUnitID { get; set; }
    public int ReservationID { get; set; }
    public long ReservationItemID { get; set; }
    public int FacilityID { get; set; }
    public int UnitID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public string Status { get; set; } = "Held";
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    public int? AssignedByUserID { get; set; }
    public DateTime? HandedOverAt { get; set; }
    public DateTime? ReturnedOn { get; set; }
    public DateTime? ReleasedAt { get; set; }

    public Reservation Reservation { get; set; } = null!;
    public ReservationItem ReservationItem { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public StorageUnit Unit { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
    public User? AssignedByUser { get; set; }
    public ICollection<Charge> Charges { get; set; } = new List<Charge>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
}

