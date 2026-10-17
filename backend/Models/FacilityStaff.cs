using System;

namespace SelfStorageAPI.Models;

public class FacilityStaff
{
    [System.ComponentModel.DataAnnotations.Key]
    public int StaffID { get; set; }
    public int FacilityID { get; set; }
    public int UserID { get; set; }
    public DateTime AssignedDate { get; set; }
    public string? Status { get; set; }

    public Facility Facility { get; set; } = null!;
    public User User { get; set; } = null!;
}
