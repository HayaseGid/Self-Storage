using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Reservation
{
    public int ReservationID { get; set; }
    public string ReservationCode { get; set; } = null!;
    public Guid CheckInToken { get; set; } = Guid.NewGuid();
    public int CustomerID { get; set; }
    public int FacilityID { get; set; }
    public DateTime StartDate { get; set; }
    public int RentalPeriod { get; set; }
    public DateTime EndDate { get; set; }
    public byte DepositMonths { get; set; } = 2;
    public DateTime HoldExpiresAt { get; set; }
    public DateTime? AppointmentDate { get; set; }
    public TimeSpan? AppointmentTime { get; set; }
    public string Status { get; set; } = "Pending Payment";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public int? ConfirmedByUserID { get; set; }
    public DateTime? CancelledAt { get; set; }
    public int? CancelledByUserID { get; set; }
    public string? CancelReason { get; set; }
    public DateTime? CompletedAt { get; set; }

    public User Customer { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public ContractType ContractType { get; set; } = null!;
    public User? ConfirmedByUser { get; set; }
    public User? CancelledByUser { get; set; }
    public Contract? Contract { get; set; }
    public ICollection<ReservationItem> ReservationItems { get; set; } = new List<ReservationItem>();
    public ICollection<ReservationUnit> ReservationUnits { get; set; } = new List<ReservationUnit>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
    public ICollection<Charge> Charges { get; set; } = new List<Charge>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
}
