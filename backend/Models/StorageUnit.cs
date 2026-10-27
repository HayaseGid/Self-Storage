using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SelfStorageAPI.Models;

public class StorageUnit
{
    [Key]
    public int UnitID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public string UnitNumber { get; set; } = null!;
    public string? Floor { get; set; }
    public string? Zone { get; set; }
    public string? LocationNote { get; set; }
    public string Status { get; set; } = "Available";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedByUserID { get; set; }

    [NotMapped]
    public decimal BasePrice
    {
        get => RentalRate?.MonthlyPrice ?? _basePrice;
        set => _basePrice = value;
    }
    private decimal _basePrice;

    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
    public RentalRate? RentalRate { get; set; }
    public User? UpdatedByUser { get; set; }
    public ICollection<ReservationUnit> ReservationUnits { get; set; } = new List<ReservationUnit>();
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
    public ICollection<SupportRequest> SupportRequests { get; set; } = new List<SupportRequest>();
}
