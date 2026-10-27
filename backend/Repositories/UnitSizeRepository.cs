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
            .OrderBy(s => s.UnitSizeID)
            .ToListAsync(cancellationToken);
    }

    public async Task<UnitSize?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.FirstOrDefaultAsync(s => s.UnitSizeID == id, cancellationToken);
    }

    public async Task<bool> ExistsByDimensionsAsync(string dimensions, int? excludeId = null, CancellationToken cancellationToken = default)
    {
        var trimmed = dimensions.Trim();
        var codeCandidate = trimmed.Contains(':') ? trimmed.Split(':', 2)[0].Trim() : trimmed;
        var query = _context.UnitSizes.Where(s =>
            s.SizeCode == codeCandidate ||
            s.DisplayName == trimmed ||
            (s.SizeCode + ": " + s.DisplayName) == trimmed);
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

    public async Task PopulateSizeFieldsAsync(UnitSize entity, UpsertUnitSizeDTO request, CancellationToken cancellationToken)
    {
        var categories = await _context.SizeCategories
            .Where(c => c.IsActive)
            .OrderBy(c => c.SizeCategoryID)
            .ToListAsync(cancellationToken);

        var rawDimensions = !string.IsNullOrWhiteSpace(request.Dimensions)
            ? request.Dimensions.Trim()
            : !string.IsNullOrWhiteSpace(request.SizeCode) && !string.IsNullOrWhiteSpace(request.DisplayName)
                ? $"{request.SizeCode.Trim()}: {request.DisplayName.Trim()}"
                : (request.DisplayName ?? request.SizeCode ?? string.Empty).Trim();

        string? explicitCode = !string.IsNullOrWhiteSpace(request.SizeCode) ? request.SizeCode.Trim().ToUpperInvariant() : null;
        var displayName = !string.IsNullOrWhiteSpace(request.DisplayName) ? request.DisplayName.Trim() : rawDimensions;

        if (rawDimensions.Contains(':'))
        {
            var parts = rawDimensions.Split(':', 2, StringSplitOptions.TrimEntries);
            explicitCode ??= parts[0].ToUpperInvariant();
            if (string.IsNullOrWhiteSpace(request.DisplayName))
            {
                displayName = string.IsNullOrWhiteSpace(parts[1]) ? rawDimensions : parts[1];
            }
        }

        decimal? requestedVolume = request.Volume;
        if (!requestedVolume.HasValue && request.WidthM.HasValue && request.LengthM.HasValue)
        {
            var h = request.HeightM ?? 2.50m;
            requestedVolume = request.WidthM.Value * request.LengthM.Value * h;
        }

        SizeCategory? chosenCategory = null;
        if (!string.IsNullOrWhiteSpace(explicitCode))
        {
            var prefix = explicitCode[..1];
            chosenCategory = categories.FirstOrDefault(c => c.CodePrefix.Trim().Equals(prefix, StringComparison.OrdinalIgnoreCase));
        }

        if (chosenCategory is null && requestedVolume.HasValue)
        {
            chosenCategory = categories.FirstOrDefault(c =>
                requestedVolume.Value >= c.MinVolumeM3 && requestedVolume.Value <= c.MaxVolumeM3);
        }

        chosenCategory ??= categories.FirstOrDefault() ?? new SizeCategory
        {
            SizeCategoryID = 1,
            CodePrefix = "S",
            StandardHeightM = 2.50m,
            MinVolumeM3 = 2.25m,
            MaxVolumeM3 = 24.00m
        };

        var prefixChar = chosenCategory.CodePrefix.Trim();
        if (string.IsNullOrWhiteSpace(explicitCode) ||
            !explicitCode.StartsWith(prefixChar, StringComparison.OrdinalIgnoreCase) ||
            explicitCode.Length < 2 ||
            !char.IsDigit(explicitCode[1]))
        {
            var existingCodes = await _context.UnitSizes
                .Where(s => s.SizeCode.StartsWith(prefixChar) && s.UnitSizeID != entity.UnitSizeID)
                .Select(s => s.SizeCode)
                .ToListAsync(cancellationToken);
            var nextNum = existingCodes
                .Select(code => int.TryParse(code[prefixChar.Length..], out var n) ? n : 0)
                .DefaultIfEmpty(0)
                .Max() + 1;
            explicitCode = $"{prefixChar}{nextNum}";
        }

        var height = chosenCategory.StandardHeightM;
        decimal width;
        decimal length;

        if (request.WidthM.HasValue && request.LengthM.HasValue)
        {
            width = request.WidthM.Value;
            length = request.LengthM.Value;
            var vol = width * length * height;
            if (vol < chosenCategory.MinVolumeM3 || vol > chosenCategory.MaxVolumeM3)
            {
                var targetVol = Math.Clamp(vol, chosenCategory.MinVolumeM3, chosenCategory.MaxVolumeM3);
                length = decimal.Round(targetVol / (width * height), 2, MidpointRounding.AwayFromZero);
            }
        }
        else
        {
            var targetVolume = Math.Clamp(requestedVolume ?? chosenCategory.MinVolumeM3, chosenCategory.MinVolumeM3, chosenCategory.MaxVolumeM3);
            var targetArea = targetVolume / height;
            width = 2.00m;
            length = decimal.Round(targetArea / width, 2, MidpointRounding.AwayFromZero);
            if (width * length * height < chosenCategory.MinVolumeM3)
            {
                length = decimal.Round(chosenCategory.MinVolumeM3 / (width * height) + 0.01m, 2);
            }
            else if (width * length * height > chosenCategory.MaxVolumeM3)
            {
                length = decimal.Round(chosenCategory.MaxVolumeM3 / (width * height) - 0.01m, 2);
            }
        }

        entity.SizeCategoryID = chosenCategory.SizeCategoryID;
        entity.SizeCode = explicitCode;
        entity.DisplayName = string.IsNullOrWhiteSpace(displayName) ? explicitCode : displayName;
        entity.WidthM = width;
        entity.LengthM = Math.Max(0.50m, length);
        entity.HeightM = height;
    }

    public void Add(UnitSize unitSize) => _context.UnitSizes.Add(unitSize);

    public void Remove(UnitSize unitSize) => _context.UnitSizes.Remove(unitSize);

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
