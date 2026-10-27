namespace SelfStorageAPI.Interfaces;

// Các Data Record giúp truyền dữ liệu tối ưu từ Repository lên Service
public record FacilityCatalogData(int FacilityId, string Name, string Address, string Status, decimal DepositPercent);
public record UnitCatalogData(int UnitId, string UnitNumber, int FacilityId, string TypeName, int UnitTypeId, string Dimensions, int UnitSizeId, decimal BasePrice, string Status);
public record AvailableUnitData(int UnitId, string UnitNumber, string TypeName, string Dimensions, decimal BasePrice);

public interface ICatalogRepository
{
    Task<IReadOnlyList<FacilityCatalogData>> GetActiveFacilitiesAsync(CancellationToken cancellationToken);
    Task<IReadOnlyList<UnitCatalogData>> GetUnitsForActiveFacilitiesAsync(DateTime now, CancellationToken cancellationToken);
    Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken);
    Task<decimal> GetFacilityDepositPercentAsync(int facilityId, CancellationToken cancellationToken);
    Task<IReadOnlyList<AvailableUnitData>> GetAvailableUnitsAsync(int facilityId, int unitTypeId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken);
}