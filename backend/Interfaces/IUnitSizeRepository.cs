using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IUnitSizeRepository
{
    Task<IReadOnlyList<UnitSize>> GetAllAsync(CancellationToken cancellationToken);
    Task<UnitSize?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<bool> ExistsByDimensionsAsync(string dimensions, int? excludeId = null, CancellationToken cancellationToken = default);
    Task<int> GetStorageUnitCountAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<bool> IsUsedByUnitsOrRatesAsync(int unitSizeId, CancellationToken cancellationToken);
    void Add(UnitSize unitSize);
    void Remove(UnitSize unitSize);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}