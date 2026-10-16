using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class Contract
{
    public int ContractID { get; set; }
    public int ReservationID { get; set; }
    public int ContractTypeID { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal DepositAmount { get; set; }
    public decimal TotalFee { get; set; }
    public string ContractStatus { get; set; } = null!;

    public Reservation Reservation { get; set; } = null!;
    public ContractType ContractType { get; set; } = null!;
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
}
