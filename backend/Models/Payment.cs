using System;

namespace SelfStorageAPI.Models;

public class Payment
{
    public int PaymentID { get; set; }
    public int ReservationID { get; set; }
    public string? TransactionReference { get; set; }
    public decimal Amount { get; set; }
    public string? PaymentType { get; set; }
    public DateTime PaymentDate { get; set; }
    public string? PaymentStatus { get; set; }

    public Reservation Reservation { get; set; } = null!;
}
