using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class ContractType
{
    public int ContractTypeID { get; set; }
    public string TypeName { get; set; } = null!;
    public int MinDays { get; set; }
    public int MaxDays { get; set; }
    public decimal DiscountRate { get; set; }

    public ICollection<Contract> Contracts { get; set; } = new List<Contract>();
}
