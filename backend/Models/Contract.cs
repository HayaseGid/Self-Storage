using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Contract
{
    public int ContractID { get; set; }
    public string ContractNumber { get; set; } = null!;
    public int ReservationID { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public DateTime? ActualEndDate { get; set; }
    public string ContractStatus { get; set; } = "Active";
    public int? RenewedFromContractID { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserID { get; set; }

    public Reservation Reservation { get; set; } = null!;
    public Contract? RenewedFromContract { get; set; }
    public ICollection<Contract> RenewedContracts { get; set; } = new List<Contract>();
    public User? CreatedByUser { get; set; }
    public ContractSignature? Signature { get; set; }
    public ICollection<SupportRequest> SupportRequests { get; set; } = new List<SupportRequest>();
}
