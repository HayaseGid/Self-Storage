using System;
using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.Models;

public class UnitAccess
{
    [Key]
    public int AccessID { get; set; }
    public long ReservationUnitID { get; set; }
    public int ReservationID { get; set; }
    public int UnitID { get; set; }
    public int UserID { get; set; }
    public string AccessType { get; set; } = null!;
    public string? AccessValue { get; set; }
    public DateTime IssuedAt { get; set; } = DateTime.UtcNow;
    public int? IssuedByUserID { get; set; }
    public DateTime? ClosedAt { get; set; }
    public string Status { get; set; } = "Active";

    public ReservationUnit ReservationUnit { get; set; } = null!;
    public Reservation Reservation { get; set; } = null!;
    public StorageUnit Unit { get; set; } = null!;
    public User User { get; set; } = null!;
    public User? IssuedByUser { get; set; }
}
