using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
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
        return await _context.UnitSizes
            .AsNoTracking()
            .Include(s => s.SizeCategory)
            .OrderBy(s => s.UnitSizeID)
            .ToListAsync(cancellationToken);
    }

    public async Task<UnitSize?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.Include(s => s.SizeCategory).FirstOrDefaultAsync(s => s.UnitSizeID == id, cancellationToken);
    }

    public async Task<int> GetStorageUnitCountAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.CountAsync(u => u.UnitSizeID == unitSizeId, cancellationToken);
    }

    public async Task<(int UnitCount, int ReservationCount, int RateCount, bool IsActiveAtFacility)> GetUsageStatsAsync(
        int unitSizeId,
        int? facilityId,
        CancellationToken cancellationToken)
    {
        var unitsQuery = _context.StorageUnits.Where(u => u.UnitSizeID == unitSizeId);
        var itemsQuery = _context.ReservationItems.Where(ri => ri.UnitSizeID == unitSizeId);
        var ratesQuery = _context.RentalRates.Where(r => r.UnitSizeID == unitSizeId);

        if (facilityId.HasValue)
        {
            unitsQuery = unitsQuery.Where(u => u.FacilityID == facilityId.Value);
            itemsQuery = itemsQuery.Where(ri => ri.FacilityID == facilityId.Value);
            ratesQuery = ratesQuery.Where(r => r.FacilityID == facilityId.Value);
        }

        var unitCount = await unitsQuery.CountAsync(cancellationToken);
        var reservationCount = await itemsQuery.CountAsync(cancellationToken);
        var rateCount = await ratesQuery.CountAsync(cancellationToken);

        bool isActive = await _context.UnitSizes
            .Where(s => s.UnitSizeID == unitSizeId)
            .Select(s => s.IsActive)
            .FirstOrDefaultAsync(cancellationToken);

        if (facilityId.HasValue)
        {
            var fsActive = await _context.FacilityUnitSizes
                .Where(fs => fs.FacilityID == facilityId.Value && fs.UnitSizeID == unitSizeId)
                .Select(fs => (bool?)fs.IsActive)
                .FirstOrDefaultAsync(cancellationToken);
            if (fsActive.HasValue)
            {
                isActive = isActive && fsActive.Value;
            }
        }

        return (unitCount, reservationCount, rateCount, isActive);
    }

    public async Task<bool> IsUsedByUnitsOrRatesAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        var usedByUnits = await _context.StorageUnits.AnyAsync(u => u.UnitSizeID == unitSizeId, cancellationToken);
        var usedByRates = await _context.RentalRates.AnyAsync(r => r.UnitSizeID == unitSizeId, cancellationToken);
        var usedByItems = await _context.ReservationItems.AnyAsync(ri => ri.UnitSizeID == unitSizeId, cancellationToken);
        return usedByUnits || usedByRates || usedByItems;
    }

    public async Task<bool> HasRentalRatesAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.RentalRates.AnyAsync(r => r.UnitSizeID == unitSizeId, cancellationToken);
    }

    public async Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.ManagerID == userId, cancellationToken);
    }

    public async Task<bool> HasActiveUnitsAtFacilityAsync(int facilityId, int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.AnyAsync(
            u => u.FacilityID == facilityId && u.UnitSizeID == unitSizeId && u.Status != UnitStatus.Inactive,
            cancellationToken);
    }

    public async Task EnsureFacilityLinkAsync(int facilityId, int unitSizeId, bool isActive, int? userId, CancellationToken cancellationToken)
    {
        var link = await _context.FacilityUnitSizes.FirstOrDefaultAsync(
            fs => fs.FacilityID == facilityId && fs.UnitSizeID == unitSizeId,
            cancellationToken);

        if (link is null)
        {
            _context.FacilityUnitSizes.Add(new FacilityUnitSize
            {
                FacilityID = facilityId,
                UnitSizeID = unitSizeId,
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

    public async Task EnsureAllFacilitiesLinkAsync(int unitSizeId, int? userId, CancellationToken cancellationToken)
    {
        var facilityIds = await _context.Facilities.Select(f => f.FacilityID).ToListAsync(cancellationToken);
        var existingLinks = await _context.FacilityUnitSizes
            .Where(fs => fs.UnitSizeID == unitSizeId)
            .Select(fs => fs.FacilityID)
            .ToListAsync(cancellationToken);

        foreach (var fid in facilityIds.Except(existingLinks))
        {
            _context.FacilityUnitSizes.Add(new FacilityUnitSize
            {
                FacilityID = fid,
                UnitSizeID = unitSizeId,
                IsActive = true,
                AddedAt = DateTime.UtcNow,
                AddedByUserID = userId
            });
        }
    }

    public async Task RemoveFacilityLinksAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        var links = await _context.FacilityUnitSizes.Where(fs => fs.UnitSizeID == unitSizeId).ToListAsync(cancellationToken);
        if (links.Count > 0)
        {
            _context.FacilityUnitSizes.RemoveRange(links);
        }
    }

    public async Task<SizeCategory?> GetCategoryAsync(int sizeCategoryId, CancellationToken cancellationToken)
        => await _context.SizeCategories.FirstOrDefaultAsync(c => c.SizeCategoryID == sizeCategoryId, cancellationToken);

    public async Task<IReadOnlyList<SizeCategory>> GetActiveCategoriesAsync(CancellationToken cancellationToken)
        => await _context.SizeCategories.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.SizeCategoryID).ToListAsync(cancellationToken);

    // Cùng rộng × dài × cao (đảo chiều cũng tính là trùng).
    public async Task<UnitSize?> FindSameDimensionsAsync(decimal widthM, decimal lengthM, decimal heightM, int? excludeId, CancellationToken cancellationToken)
        => await _context.UnitSizes.AsNoTracking().FirstOrDefaultAsync(s =>
            s.HeightM == heightM &&
            ((s.WidthM == widthM && s.LengthM == lengthM) || (s.WidthM == lengthM && s.LengthM == widthM)) &&
            (!excludeId.HasValue || s.UnitSizeID != excludeId.Value), cancellationToken);

    // So tên không phân biệt hoa thường (Postgres mặc định phân biệt, SQL Server thì không).
    public async Task<UnitSize?> FindByDisplayNameAsync(string displayName, int? excludeId, CancellationToken cancellationToken)
    {
        var lowered = displayName.ToLower();
        return await _context.UnitSizes.AsNoTracking().FirstOrDefaultAsync(s =>
            s.DisplayName.ToLower() == lowered && (!excludeId.HasValue || s.UnitSizeID != excludeId.Value), cancellationToken);
    }

    // Mã size kế tiếp của nhóm: chữ đầu nhóm + (số lớn nhất đang có + 1), vd S4 -> S5.
    public async Task<string> NextSizeCodeAsync(string prefix, int? excludeId, CancellationToken cancellationToken)
    {
        var codes = await _context.UnitSizes
            .Where(s => s.SizeCode.StartsWith(prefix) && (!excludeId.HasValue || s.UnitSizeID != excludeId.Value))
            .Select(s => s.SizeCode)
            .ToListAsync(cancellationToken);
        var next = codes
            .Select(code => int.TryParse(code[prefix.Length..], out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max() + 1;
        return $"{prefix}{next}";
    }

    public void Add(UnitSize unitSize) => _context.UnitSizes.Add(unitSize);

    public void Remove(UnitSize unitSize) => _context.UnitSizes.Remove(unitSize);

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
