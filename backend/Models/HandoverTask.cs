using System;

namespace SelfStorageAPI.Models;

public class HandoverTask
{
    [System.ComponentModel.DataAnnotations.Key]
    public int TaskID { get; set; }
    public int StaffID { get; set; }
    public string? TaskType { get; set; }
    public DateTime? ScheduledDate { get; set; }
    public DateTime? ActualDate { get; set; }
    public string? UnitConditionNotes { get; set; }
    public string? Status { get; set; }
    public int ReservationID { get; set; }
    public int CustomerID { get; set; }
    public int UnitID { get; set; }
    public string? EvidenceImages { get; set; }

    public User Staff { get; set; } = null!;
    public Reservation Reservation { get; set; } = null!;
    public User Customer { get; set; } = null!;
    public StorageUnit Unit { get; set; } = null!;
}
