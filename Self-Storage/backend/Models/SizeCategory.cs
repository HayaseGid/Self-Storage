using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class SizeCategory
{
    public int SizeCategoryID { get; set; }
    public string CategoryCode { get; set; } = null!;
    public string CategoryName { get; set; } = null!;
    public string CodePrefix { get; set; } = null!;
    public decimal StandardHeightM { get; set; }
    public decimal MinVolumeM3 { get; set; }
    public decimal MaxVolumeM3 { get; set; }
    public decimal MinMonthlyPrice { get; set; }
    public decimal MaxMonthlyPrice { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedByUserID { get; set; }

    public User? UpdatedByUser { get; set; }
    public ICollection<UnitSize> UnitSizes { get; set; } = new List<UnitSize>();
}

