using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Payment
{
    public int PaymentID { get; set; }
    public int ReservationID { get; set; }
    public string OrderCode { get; set; } = null!;
    public string IdempotencyKey { get; set; } = null!;
    public string Provider { get; set; } = "Simulator";
    public string? ProviderTransactionId { get; set; }
    public string Direction { get; set; } = "Collection";
    public string? RefundReason { get; set; }
    public int? RefundOfPaymentID { get; set; }
    public decimal Amount { get; set; }
    public decimal? ReceivedAmount { get; set; }
    public string? PaymentMethod { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public int? CreatedByUserID { get; set; }

    public Reservation Reservation { get; set; } = null!;
    public Payment? RefundOfPayment { get; set; }
    public ICollection<Payment> RefundPayments { get; set; } = new List<Payment>();
    public User? CreatedByUser { get; set; }
    public ICollection<PaymentCallbackLog> CallbackLogs { get; set; } = new List<PaymentCallbackLog>();
    public ICollection<Charge> Charges { get; set; } = new List<Charge>();
    public ICollection<Charge> RefundedCharges { get; set; } = new List<Charge>();
}
