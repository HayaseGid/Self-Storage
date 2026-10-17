using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class UnitSize
{
    public int UnitSizeID { get; set; }
    public string Dimensions { get; set; } = null!;
    public decimal? Volume { get; set; }

    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
}
