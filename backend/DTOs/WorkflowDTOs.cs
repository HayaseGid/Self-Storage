using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

public sealed record UpdateRentalPolicyDTO
{
    [Range(0, 100)]
    public decimal DepositPercent { get; init; }
}

public sealed record AssignReservationDTO
{
    [Required]
    public string UnitNumber { get; init; } = string.Empty;
}

public sealed record CreateStorageUnitDTO
{
    [Range(1, int.MaxValue)]
    public int FacilityID { get; init; }
    [Required]
    public string UnitNumber { get; init; } = string.Empty;
    public int? UnitTypeID { get; init; }
    public int? UnitSizeID { get; init; }
    [Required]
    public string UnitType { get; init; } = string.Empty;
    [Required]
    public string Size { get; init; } = string.Empty;
    [Range(0.01, 999999)]
    public decimal SizeM2 { get; init; }
    [Range(0.01, 999999999)]
    public decimal BasePrice { get; init; }
    [Required]
    public string Status { get; init; } = "Available";
}

public sealed record CreateFacilityDTO
{
    [Required]
    public string FacilityName { get; init; } = string.Empty;
    [Required]
    public string Address { get; init; } = string.Empty;
    public string? ContactPhone { get; init; }
    [Required]
    public string ManagerEmail { get; init; } = string.Empty;
    public string Status { get; init; } = "Active";
}

public sealed record AssignFacilityStaffDTO
{
    [Required]
    public string StaffEmail { get; init; } = string.Empty;
}

public sealed record UpdateRentalRateDTO
{
    [Range(1, int.MaxValue)]
    public int UnitTypeID { get; init; }
    [Range(1, int.MaxValue)]
    public int UnitSizeID { get; init; }
    [Range(0.01, 999999999)]
    public decimal BasePrice { get; init; }
}
