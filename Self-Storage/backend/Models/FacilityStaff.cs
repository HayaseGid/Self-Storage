using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SelfStorageAPI.Models;

public class FacilityStaff
{
    [Key]
    public int AssignmentID { get; set; }
    public int FacilityID { get; set; }
    public int UserID { get; set; }
    public DateTime AssignedDate { get; set; }
    public string Status { get; set; } = "Active";

    [NotMapped]
    public int StaffID
    {
        get => AssignmentID;
        set => AssignmentID = value;
    }

    public Facility Facility { get; set; } = null!;
    public User User { get; set; } = null!;
}
