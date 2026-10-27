using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;

namespace SelfStorageAPI.Models;

public class Facility
{
    public int FacilityID { get; set; }
    public int ManagerID { get; set; }
    public string FacilityName { get; set; } = null!;
    public string UnitCodePrefix { get; set; } = null!;
    public string StreetAddress { get; set; } = null!;
    public string Ward { get; set; } = null!;
    public string? District { get; set; }
    public string City { get; set; } = "TP. Hồ Chí Minh";
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? ContactPhone { get; set; }
    public string? OpeningHours { get; set; }
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public string Status { get; set; } = "Active";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public int? UpdatedByUserID { get; set; }

    [NotMapped]
    public string Address
    {
        get => string.Join(", ", new[] { StreetAddress, Ward, District, City }.Where(s => !string.IsNullOrWhiteSpace(s)));
        set => ApplyAddressString(value);
    }

    public void ApplyAddressString(string? rawAddress)
    {
        if (string.IsNullOrWhiteSpace(rawAddress))
        {
            StreetAddress = "Chưa cập nhật";
            Ward = "Chưa cập nhật";
            City = "TP. Hồ Chí Minh";
            return;
        }

        var parts = rawAddress.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length >= 4)
        {
            StreetAddress = parts[0];
            Ward = parts[1];
            District = parts[2];
            City = string.Join(", ", parts.Skip(3));
        }
        else if (parts.Length == 3)
        {
            StreetAddress = parts[0];
            Ward = parts[1];
            District = parts[1];
            City = parts[2];
        }
        else if (parts.Length == 2)
        {
            StreetAddress = parts[0];
            Ward = parts[1];
            District = parts[1];
            City = "TP. Hồ Chí Minh";
        }
        else
        {
            StreetAddress = parts[0];
            Ward = "Phường Trung Tâm";
            City = "TP. Hồ Chí Minh";
        }
    }

    public User Manager { get; set; } = null!;
    public User? UpdatedByUser { get; set; }
    public RentalPolicy? RentalPolicy { get; set; }
    public ICollection<FacilityStaff> FacilityStaffs { get; set; } = new List<FacilityStaff>();
    public ICollection<FacilityUnitType> FacilityUnitTypes { get; set; } = new List<FacilityUnitType>();
    public ICollection<FacilityUnitSize> FacilityUnitSizes { get; set; } = new List<FacilityUnitSize>();
    public ICollection<RentalRate> RentalRates { get; set; } = new List<RentalRate>();
    public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    public ICollection<SupportRequest> SupportRequests { get; set; } = new List<SupportRequest>();
    public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
}
