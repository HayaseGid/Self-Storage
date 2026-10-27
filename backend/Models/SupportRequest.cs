using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class SupportRequest
{
    public int RequestID { get; set; }
    public int CustomerID { get; set; }
    public int FacilityID { get; set; }
    public int? UnitID { get; set; }
    public int? ContractID { get; set; }
    public string Category { get; set; } = null!;
    public string Description { get; set; } = null!;
    public string Status { get; set; } = "Open";
    public int? AssignedStaffID { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }

    public User Customer { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public StorageUnit? Unit { get; set; }
    public Contract? Contract { get; set; }
    public User? AssignedStaff { get; set; }
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
}

