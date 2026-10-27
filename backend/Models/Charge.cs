using System;

namespace SelfStorageAPI.Models;

public class Charge
{
    public int ChargeID { get; set; }
    public int ReservationID { get; set; }
    public long? ReservationUnitID { get; set; }
    public string ChargeType { get; set; } = null!;
    public string? Description { get; set; }
    public DateTime? PeriodStart { get; set; }
    public DateTime? PeriodEnd { get; set; }
    public decimal Amount { get; set; }
    public DateTime DueDate { get; set; }
    public string Status { get; set; } = "Unpaid";
    public int? PaymentID { get; set; }
    public DateTime? PaidAt { get; set; }
    public bool SettledFromDeposit { get; set; }
    public decimal RefundedAmount { get; set; }
    public int? RefundPaymentID { get; set; }
    public int? FeePolicyID { get; set; }
    public int? WaivedByUserID { get; set; }
    public DateTime? WaivedAt { get; set; }
    public string? WaiveReason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserID { get; set; }

    public Reservation Reservation { get; set; } = null!;
    public ReservationUnit? ReservationUnit { get; set; }
    public Payment? Payment { get; set; }
    public Payment? RefundPayment { get; set; }
    public FeePolicy? FeePolicy { get; set; }
    public User? WaivedByUser { get; set; }
    public User? CreatedByUser { get; set; }
}

