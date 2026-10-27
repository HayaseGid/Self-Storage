namespace SelfStorageAPI.Interfaces;

// Các Data Record giúp truyền dữ liệu tối ưu từ Repository lên Service
public record FacilityCatalogData(
    int FacilityId,
    string Name,
    string UnitCodePrefix,
    string Address,
    string StreetAddress,
    string Ward,
    string? District,
    string City,
    string? ContactPhone,
    string? OpeningHours,
    string? Description,
    string Status,
    decimal DepositPercent,
    int HoldMinutes,
    decimal LateFeePerDay,
    int GracePeriodDays,
    int RenewalNoticeDays);

public record UnitCatalogData(
    int UnitId,
    string UnitNumber,
    int FacilityId,
    string TypeName,
    int UnitTypeId,
    string Dimensions,
    int UnitSizeId,
    decimal? AreaM2,
    decimal? VolumeM3,
    decimal BasePrice,
    string Status,
    string? Floor,
    string? Zone,
    string? LocationNote);

public record AvailableUnitData(
    int UnitId,
    string UnitNumber,
    string TypeName,
    string Dimensions,
    decimal BasePrice);

public interface ICatalogRepository
{
    Task<IReadOnlyList<FacilityCatalogData>> GetActiveFacilitiesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<UnitCatalogData>> GetUnitsForActiveFacilitiesAsync(DateTime now, CancellationToken cancellationToken);
    Task<object> GetCatalogPoliciesAsync(CancellationToken cancellationToken);
    Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken);
    Task<decimal> GetFacilityDepositPercentAsync(int facilityId, CancellationToken cancellationToken);
    Task<decimal> GetContractDiscountRateAsync(int months, CancellationToken cancellationToken);
    Task<IReadOnlyList<AvailableUnitData>> GetAvailableUnitsAsync(int facilityId, int unitTypeId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken);
}
