using System;
using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.Models;

public class HandoverTask
{
    [Key]
    public int TaskID { get; set; }
    public string TaskType { get; set; } = null!;
    public int FacilityID { get; set; }
    public int UnitID { get; set; }
    public long? ReservationUnitID { get; set; }
    public int? ReservationID { get; set; }
    public int? SupportRequestID { get; set; }
    public int AssignedStaffID { get; set; }
    public int? AssignedByID { get; set; }
    public DateTime? ScheduledDate { get; set; }
    public TimeSpan? ScheduledTime { get; set; }
    public DateTime? ActualAt { get; set; }
    public string? UnitConditionNotes { get; set; }
    public string? ConditionResult { get; set; }
    public string? EvidenceImages { get; set; }
    public string Status { get; set; } = "Scheduled";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Facility Facility { get; set; } = null!;
    public StorageUnit Unit { get; set; } = null!;
    public ReservationUnit? ReservationUnit { get; set; }
    public Reservation? Reservation { get; set; }
    public SupportRequest? SupportRequest { get; set; }
    public User AssignedStaff { get; set; } = null!;
    public User? AssignedByUser { get; set; }
}
