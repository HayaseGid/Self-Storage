using System;

namespace SelfStorageAPI.Models;

public class PaymentCallbackLog
{
    public long CallbackID { get; set; }
    public int? PaymentID { get; set; }
    public string Provider { get; set; } = null!;
    public string OrderCode { get; set; } = null!;
    public string? ProviderTransactionId { get; set; }
    public string? ReportedStatus { get; set; }
    public decimal? ReportedAmount { get; set; }
    public string? Payload { get; set; }
    public bool SignatureValid { get; set; }
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
    public string ProcessResult { get; set; } = null!;
    public string? Note { get; set; }

    public Payment? Payment { get; set; }
}

