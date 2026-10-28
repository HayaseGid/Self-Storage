using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

public sealed record UpdateRentalPolicyDTO
{
    [Range(0, 100)]
    public decimal DepositPercent { get; init; }
    public byte? DepositMonths { get; init; }
    public int? HoldMinutes { get; init; }
    public decimal? LateFeePerDay { get; init; }
    public int? GracePeriodDays { get; init; }
    public int? RenewalNoticeDays { get; init; }
}

public sealed record CancellationRuleDTO
{
    public int DaysBeforeStart { get; init; }
    public decimal RefundPercent { get; init; }
}

public sealed record ContractTermDiscountDTO
{
    public int Months { get; init; }
    public decimal DiscountPercent { get; init; }
}

public sealed record ExtraFeeRuleDTO
{
    public string? Id { get; init; }
    public string? FeeCode { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Category { get; init; }
    public string? ValueType { get; init; }
    public decimal Amount { get; init; }
    public decimal? MinValue { get; init; }
    public decimal? MaxValue { get; init; }
    public bool? IsActive { get; init; }
}

public sealed record UpdateSystemPoliciesDTO
{
    public byte? DepositMonths { get; init; }
    public decimal? DepositPercent { get; init; }
    public int? HoldMinutes { get; init; }
    public decimal? LateFeePerDay { get; init; }
    public int? GracePeriodDays { get; init; }
    public int? RenewalNoticeDays { get; init; }
    public List<CancellationRuleDTO>? CancellationRules { get; init; }
    public List<ContractTermDiscountDTO>? ContractDiscounts { get; init; }
    public List<ExtraFeeRuleDTO>? ExtraFees { get; init; }
}

public sealed record AssignReservationDTO
{
    public string UnitNumber { get; init; } = string.Empty;
}

public sealed record CreateStorageUnitDTO
{
    [Range(1, int.MaxValue)]
    public int FacilityID { get; init; }
    public int? UnitTypeID { get; init; }
    public int? UnitSizeID { get; init; }
    [Required]
    public string UnitType { get; init; } = string.Empty;
    [Required]
    public string Size { get; init; } = string.Empty;
    [Range(0.01, 999999)]
    public decimal? SizeM2 { get; init; }
    [Range(0.01, 999999999)]
    public decimal BasePrice { get; init; }
    [Required]
    public string Status { get; init; } = "Available";
    public string? Floor { get; init; }
    public string? Zone { get; init; }
    public string? LocationNote { get; init; }
}

public sealed record CreateFacilityDTO
{
    [Required]
    public string FacilityName { get; init; } = string.Empty;
    [Required]
    [RegularExpression("^[A-Za-z0-9]{1,10}$")]
    public string UnitCodePrefix { get; init; } = string.Empty;
    [Required]
    public string Address { get; init; } = string.Empty;
    public string? StreetAddress { get; init; }
    public string? Ward { get; init; }
    public string? District { get; init; }
    public string? City { get; init; }
    public string? ContactPhone { get; init; }
    public string? OpeningHours { get; init; }
    public string? Description { get; init; }
    [Required]
    public string ManagerEmail { get; init; } = string.Empty;
    public string Status { get; init; } = "Active";
    public byte? DepositMonths { get; init; }
    public decimal? DepositPercent { get; init; }
}

public sealed record UpdateFacilityDTO
{
    public string? FacilityName { get; init; }
    public string? Address { get; init; }
    public string? StreetAddress { get; init; }
    public string? Ward { get; init; }
    public string? District { get; init; }
    public string? City { get; init; }
    public string? ContactPhone { get; init; }
    public string? OpeningHours { get; init; }
    public string? Description { get; init; }
    public string? ManagerEmail { get; init; }
    public string? Status { get; init; }
    public byte? DepositMonths { get; init; }
    public decimal? DepositPercent { get; init; }
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
