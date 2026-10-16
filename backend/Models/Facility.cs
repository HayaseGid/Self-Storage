using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Facility
{
    public int FacilityID { get; set; }
    public int ManagerID { get; set; }
    public string FacilityName { get; set; } = null!;
    public string Address { get; set; } = null!;
    public string? ContactPhone { get; set; }
    public string? Status { get; set; }

    public User Manager { get; set; } = null!;
    public ICollection<FacilityStaff> FacilityStaffs { get; set; } = new List<FacilityStaff>();
    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
}
