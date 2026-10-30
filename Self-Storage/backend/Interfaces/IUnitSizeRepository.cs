using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IUnitSizeRepository
{
    Task<IReadOnlyList<UnitSize>> GetAllAsync(CancellationToken cancellationToken);
    Task<UnitSize?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<bool> ExistsByDimensionsAsync(string dimensions, int? excludeId = null, CancellationToken cancellationToken = default);
    Task<int> GetStorageUnitCountAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<(int UnitCount, int ReservationCount, int RateCount, bool IsActiveAtFacility)> GetUsageStatsAsync(int unitSizeId, int? facilityId, CancellationToken cancellationToken);
    Task<bool> IsUsedByUnitsOrRatesAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<bool> HasRentalRatesAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken);
    Task<bool> HasActiveUnitsAtFacilityAsync(int facilityId, int unitSizeId, CancellationToken cancellationToken);
    Task EnsureFacilityLinkAsync(int facilityId, int unitSizeId, bool isActive, int? userId, CancellationToken cancellationToken);
    Task EnsureAllFacilitiesLinkAsync(int unitSizeId, int? userId, CancellationToken cancellationToken);
    Task RemoveFacilityLinksAsync(int unitSizeId, CancellationToken cancellationToken);
    Task PopulateSizeFieldsAsync(UnitSize entity, UpsertUnitSizeDTO request, CancellationToken cancellationToken);
    void Add(UnitSize unitSize);
    void Remove(UnitSize unitSize);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
