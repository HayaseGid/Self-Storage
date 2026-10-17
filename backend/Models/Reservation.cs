using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Reservation
{
    public int ReservationID { get; set; }
    public int CustomerID { get; set; }
    public int FacilityID { get; set; }
    public int UnitTypeID { get; set; }
    public int? AssignedUnitID { get; set; }
    public DateTime StartDate { get; set; }
    public int RentalPeriod { get; set; }
    public DateTime EndDate { get; set; }
    public decimal? TotalEstimatedCost { get; set; }
    public decimal DepositAmount { get; set; }
    public string Status { get; set; } = null!;

    public User Customer { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public UnitType UnitType { get; set; } = null!;
    public StorageUnit? AssignedUnit { get; set; }
    public Contract? Contract { get; set; }
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
}
