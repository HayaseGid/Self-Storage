using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class ContractType
{
    public int ContractTypeID { get; set; }
    public string TypeName { get; set; } = null!;
    public int RentalMonths { get; set; }
    public decimal DiscountRate { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
}
