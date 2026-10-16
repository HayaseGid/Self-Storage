using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class StorageUnit
{
    [System.ComponentModel.DataAnnotations.Key]
    public int UnitID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public string UnitNumber { get; set; } = null!;
    public decimal BasePrice { get; set; }
    public string Status { get; set; } = null!;

    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
}
