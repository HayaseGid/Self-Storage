using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class UnitSizeRepository : IUnitSizeRepository
{
    private readonly SelfStorageDbContext _context;

    public UnitSizeRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<UnitSize>> GetAllAsync(CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.AsNoTracking().OrderBy(s => s.UnitSizeID).ToListAsync(cancellationToken);
    }

    public async Task<UnitSize?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.FirstOrDefaultAsync(s => s.UnitSizeID == id, cancellationToken);
    }

    public async Task<bool> ExistsByDimensionsAsync(string dimensions, int? excludeId = null, CancellationToken cancellationToken = default)
    {
        var query = _context.UnitSizes.Where(s => s.Dimensions == dimensions);
        if (excludeId.HasValue)
        {
            query = query.Where(s => s.UnitSizeID != excludeId.Value);
        }
        return await query.AnyAsync(cancellationToken);
    }

    public async Task<int> GetStorageUnitCountAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.CountAsync(u => u.UnitSizeID == unitSizeId, cancellationToken);
    }

    public async Task<bool> IsUsedByUnitsOrRatesAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        var usedByUnits = await _context.StorageUnits.AnyAsync(u => u.UnitSizeID == unitSizeId, cancellationToken);
        var usedByRates = await _context.RentalRates.AnyAsync(r => r.UnitSizeID == unitSizeId, cancellationToken);
        return usedByUnits || usedByRates;
    }

    public void Add(UnitSize unitSize) => _context.UnitSizes.Add(unitSize);

    public void Remove(UnitSize unitSize) => _context.UnitSizes.Remove(unitSize);

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}