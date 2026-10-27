using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace SelfStorageAPI.Models;

public class UnitSize
{
    public int UnitSizeID { get; set; }
    public int SizeCategoryID { get; set; }
    public string SizeCode { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public decimal WidthM { get; set; }
    public decimal LengthM { get; set; }
    public decimal HeightM { get; set; }
    public decimal? AreaM2 { get; set; }
    public decimal? VolumeM3 { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserID { get; set; }

    [NotMapped]
    public string Dimensions
    {
        get => !string.IsNullOrWhiteSpace(DisplayName) && !string.IsNullOrWhiteSpace(SizeCode)
            ? $"{SizeCode}: {DisplayName}"
            : DisplayName ?? SizeCode ?? string.Empty;
        set
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            var parts = value.Split(':', 2, StringSplitOptions.TrimEntries);
            if (parts.Length == 2)
            {
                SizeCode = parts[0];
                DisplayName = parts[1];
            }
            else
            {
                DisplayName = value.Trim();
                if (string.IsNullOrWhiteSpace(SizeCode))
                    SizeCode = "S1";
            }
        }
    }

    [NotMapped]
    public decimal? Volume
    {
        get => VolumeM3 ?? decimal.Round(WidthM * LengthM * HeightM, 2);
        set { }
    }

    public SizeCategory SizeCategory { get; set; } = null!;
    public User? CreatedByUser { get; set; }
    public ICollection<FacilityUnitSize> FacilityUnitSizes { get; set; } = new List<FacilityUnitSize>();
    public ICollection<RentalRate> RentalRates { get; set; } = new List<RentalRate>();
    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<ReservationItem> ReservationItems { get; set; } = new List<ReservationItem>();
}
