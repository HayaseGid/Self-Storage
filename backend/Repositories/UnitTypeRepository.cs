using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
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
        return await _context.UnitTypes
            .Include(t => t.FacilityUnitTypes)
            .AsNoTracking()
            .OrderBy(t => t.UnitTypeID)
            .ToListAsync(cancellationToken);
    }

    public async Task<UnitType?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await _context.UnitTypes
            .Include(t => t.FacilityUnitTypes)
            .FirstOrDefaultAsync(t => t.UnitTypeID == id, cancellationToken);
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

    public async Task<(int UnitCount, int ReservationCount, int RateCount, bool IsActiveAtFacility)> GetUsageStatsAsync(
        int unitTypeId,
        int? facilityId,
        CancellationToken cancellationToken)
    {
        var unitsQuery = _context.StorageUnits.Where(u => u.UnitTypeID == unitTypeId);
        var itemsQuery = _context.ReservationItems.Where(ri => ri.UnitTypeID == unitTypeId);
        var ratesQuery = _context.RentalRates.Where(r => r.UnitTypeID == unitTypeId);

        if (facilityId.HasValue)
        {
            unitsQuery = unitsQuery.Where(u => u.FacilityID == facilityId.Value);
            itemsQuery = itemsQuery.Where(ri => ri.FacilityID == facilityId.Value);
            ratesQuery = ratesQuery.Where(r => r.FacilityID == facilityId.Value);
        }

        var unitCount = await unitsQuery.CountAsync(cancellationToken);
        var reservationCount = await itemsQuery.CountAsync(cancellationToken);
        var rateCount = await ratesQuery.CountAsync(cancellationToken);

        bool isActive = await _context.UnitTypes
            .Where(t => t.UnitTypeID == unitTypeId)
            .Select(t => t.IsActive)
            .FirstOrDefaultAsync(cancellationToken);

        if (facilityId.HasValue)
        {
            var ftActive = await _context.FacilityUnitTypes
                .Where(ft => ft.FacilityID == facilityId.Value && ft.UnitTypeID == unitTypeId)
                .Select(ft => (bool?)ft.IsActive)
                .FirstOrDefaultAsync(cancellationToken);
            if (ftActive.HasValue)
            {
                isActive = isActive && ftActive.Value;
            }
        }

        return (unitCount, reservationCount, rateCount, isActive);
    }

    public async Task<bool> IsUsedAsync(int unitTypeId, CancellationToken cancellationToken)
    {
        var usedByUnits = await _context.StorageUnits.AnyAsync(u => u.UnitTypeID == unitTypeId, cancellationToken);
        var usedByReservations = await _context.ReservationItems.AnyAsync(ri => ri.UnitTypeID == unitTypeId, cancellationToken);
        var usedByRates = await _context.RentalRates.AnyAsync(r => r.UnitTypeID == unitTypeId, cancellationToken);
        return usedByUnits || usedByReservations || usedByRates;
    }

    public async Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.ManagerID == userId, cancellationToken);
    }

    public async Task<bool> HasActiveUnitsAtFacilityAsync(int facilityId, int unitTypeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.AnyAsync(
            u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId && u.Status != UnitStatus.Inactive,
            cancellationToken);
    }

    public async Task EnsureFacilityLinkAsync(int facilityId, int unitTypeId, bool isActive, int? userId, CancellationToken cancellationToken)
    {
        var link = await _context.FacilityUnitTypes.FirstOrDefaultAsync(
            ft => ft.FacilityID == facilityId && ft.UnitTypeID == unitTypeId,
            cancellationToken);

        if (link is null)
        {
            _context.FacilityUnitTypes.Add(new FacilityUnitType
            {
                FacilityID = facilityId,
                UnitTypeID = unitTypeId,
                IsActive = isActive,
                AddedAt = DateTime.UtcNow,
                AddedByUserID = userId
            });
        }
        else
        {
            link.IsActive = isActive;
        }
    }

    public async Task EnsureAllFacilitiesLinkAsync(int unitTypeId, int? userId, CancellationToken cancellationToken)
    {
        var facilityIds = await _context.Facilities.Select(f => f.FacilityID).ToListAsync(cancellationToken);
        var existingLinks = await _context.FacilityUnitTypes
            .Where(ft => ft.UnitTypeID == unitTypeId)
            .Select(ft => ft.FacilityID)
            .ToListAsync(cancellationToken);

        foreach (var fid in facilityIds.Except(existingLinks))
        {
            _context.FacilityUnitTypes.Add(new FacilityUnitType
            {
                FacilityID = fid,
                UnitTypeID = unitTypeId,
                IsActive = true,
                AddedAt = DateTime.UtcNow,
                AddedByUserID = userId
            });
        }
    }

    public async Task RemoveFacilityLinksAsync(int unitTypeId, CancellationToken cancellationToken)
    {
        var links = await _context.FacilityUnitTypes.Where(ft => ft.UnitTypeID == unitTypeId).ToListAsync(cancellationToken);
        if (links.Count > 0)
        {
            _context.FacilityUnitTypes.RemoveRange(links);
        }
    }

    public void Add(UnitType unitType) => _context.UnitTypes.Add(unitType);
    public void Remove(UnitType unitType) => _context.UnitTypes.Remove(unitType);
    public async Task SaveChangesAsync(CancellationToken cancellationToken) => await _context.SaveChangesAsync(cancellationToken);
}
