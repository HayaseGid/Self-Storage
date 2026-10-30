using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class ReservationItem
{
    public long ReservationItemID { get; set; }
    public int ReservationID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int UnitSizeID { get; set; }
    public byte Quantity { get; set; }
    public decimal MonthlyPrice { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal? EffectiveMonthlyPrice { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Reservation Reservation { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public UnitSize UnitSize { get; set; } = null!;
    public RentalRate RentalRate { get; set; } = null!;
    public ICollection<ReservationUnit> ReservationUnits { get; set; } = new List<ReservationUnit>();
}

