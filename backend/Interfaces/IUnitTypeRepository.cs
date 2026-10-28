using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IUnitTypeRepository
{
    Task<IReadOnlyList<UnitType>> GetAllAsync(CancellationToken cancellationToken);
    Task<UnitType?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<bool> ExistsByNameAsync(string name, int? excludeId = null, CancellationToken cancellationToken = default);
    Task<int> GetStorageUnitCountAsync(int unitTypeId, CancellationToken cancellationToken);
    Task<bool> IsUsedAsync(int unitTypeId, CancellationToken cancellationToken);
    void Add(UnitType unitType);
    void Remove(UnitType unitType);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}