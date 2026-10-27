using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class UnitTypeRepository : IUnitTypeRepository
{
    private readonly SelfStorageDbContext _context;

    public UnitTypeRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<UnitType>> GetAllAsync(CancellationToken cancellationToken)
    {
        return await _context.UnitTypes.AsNoTracking().OrderBy(t => t.UnitTypeID).ToListAsync(cancellationToken);
    }

    public async Task<UnitType?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await _context.UnitTypes.FirstOrDefaultAsync(t => t.UnitTypeID == id, cancellationToken);
    }

    public async Task<bool> ExistsByNameAsync(string name, int? excludeId = null, CancellationToken cancellationToken = default)
    {
        var query = _context.UnitTypes.Where(t => t.TypeName == name);
        if (excludeId.HasValue) query = query.Where(t => t.UnitTypeID != excludeId.Value);
        return await query.AnyAsync(cancellationToken);
    }

    public async Task<int> GetStorageUnitCountAsync(int unitTypeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.CountAsync(u => u.UnitTypeID == unitTypeId, cancellationToken);
    }

    public async Task<bool> IsUsedAsync(int unitTypeId, CancellationToken cancellationToken)
    {
        var usedByUnits = await _context.StorageUnits.AnyAsync(u => u.UnitTypeID == unitTypeId, cancellationToken);
        var usedByReservations = await _context.Reservations.AnyAsync(r => r.UnitTypeID == unitTypeId, cancellationToken);
        var usedByRates = await _context.RentalRates.AnyAsync(r => r.UnitTypeID == unitTypeId, cancellationToken);
        return usedByUnits || usedByReservations || usedByRates;
    }

    public void Add(UnitType unitType) => _context.UnitTypes.Add(unitType);
    public void Remove(UnitType unitType) => _context.UnitTypes.Remove(unitType);
    public async Task SaveChangesAsync(CancellationToken cancellationToken) => await _context.SaveChangesAsync(cancellationToken);
}