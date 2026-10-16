using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class UnitType
{
    public int UnitTypeID { get; set; }
    public string TypeName { get; set; } = null!;
    public string? Description { get; set; }

    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
}
