using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IUnitTypeRepository
{
    Task<IReadOnlyList<UnitType>> GetAllAsync(CancellationToken cancellationToken);
    Task<UnitType?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<bool> ExistsByNameAsync(string name, int? excludeId = null, CancellationToken cancellationToken = default);
    Task<int> GetStorageUnitCountAsync(int unitTypeId, CancellationToken cancellationToken);
    Task<(int UnitCount, int ReservationCount, int RateCount, bool IsActiveAtFacility)> GetUsageStatsAsync(int unitTypeId, int? facilityId, CancellationToken cancellationToken);
    Task<bool> IsUsedAsync(int unitTypeId, CancellationToken cancellationToken);
    Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken);
    Task<bool> HasActiveUnitsAtFacilityAsync(int facilityId, int unitTypeId, CancellationToken cancellationToken);
    Task EnsureFacilityLinkAsync(int facilityId, int unitTypeId, bool isActive, int? userId, CancellationToken cancellationToken);
    Task EnsureAllFacilitiesLinkAsync(int unitTypeId, int? userId, CancellationToken cancellationToken);
    Task RemoveFacilityLinksAsync(int unitTypeId, CancellationToken cancellationToken);
    void Add(UnitType unitType);
    void Remove(UnitType unitType);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
