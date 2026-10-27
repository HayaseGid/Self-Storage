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

    public async Task<bool> IsUsedByUnitsOrRatesAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        var usedByUnits = await _context.StorageUnits.AnyAsync(u => u.UnitSizeID == unitSizeId, cancellationToken);
        var usedByRates = await _context.RentalRates.AnyAsync(r => r.UnitSizeID == unitSizeId, cancellationToken);
        var usedByFacilities = await _context.FacilityUnitSizes.AnyAsync(fs => fs.UnitSizeID == unitSizeId, cancellationToken);
        var usedByItems = await _context.ReservationItems.AnyAsync(ri => ri.UnitSizeID == unitSizeId, cancellationToken);
        return usedByUnits || usedByRates || usedByFacilities || usedByItems;
    }

    public async Task PopulateSizeFieldsAsync(UnitSize entity, string rawDimensions, decimal? requestedVolume, CancellationToken cancellationToken)
    {
        var categories = await _context.SizeCategories
            .Where(c => c.IsActive)
            .OrderBy(c => c.SizeCategoryID)
            .ToListAsync(cancellationToken);

        var trimmed = rawDimensions.Trim();
        string? explicitCode = null;
        var displayName = trimmed;

        if (trimmed.Contains(':'))
        {
            var parts = trimmed.Split(':', 2, StringSplitOptions.TrimEntries);
            explicitCode = parts[0].ToUpperInvariant();
            displayName = string.IsNullOrWhiteSpace(parts[1]) ? trimmed : parts[1];
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
        if (string.IsNullOrWhiteSpace(explicitCode) || !explicitCode.StartsWith(prefixChar, StringComparison.OrdinalIgnoreCase) || explicitCode.Length < 2 || !char.IsDigit(explicitCode[1]))
        {
            var existingCodes = await _context.UnitSizes
                .Where(s => s.SizeCode.StartsWith(prefixChar))
                .Select(s => s.SizeCode)
                .ToListAsync(cancellationToken);
            var nextNum = existingCodes
                .Select(code => int.TryParse(code[prefixChar.Length..], out var n) ? n : 0)
                .DefaultIfEmpty(0)
                .Max() + 1;
            explicitCode = $"{prefixChar}{nextNum}";
        }

        var height = chosenCategory.StandardHeightM;
        var targetVolume = Math.Clamp(requestedVolume ?? chosenCategory.MinVolumeM3, chosenCategory.MinVolumeM3, chosenCategory.MaxVolumeM3);
        var targetArea = targetVolume / height;
        var width = 2.00m;
        var length = decimal.Round(targetArea / width, 2, MidpointRounding.AwayFromZero);
        if (width * length * height < chosenCategory.MinVolumeM3)
        {
            length = decimal.Round(chosenCategory.MinVolumeM3 / (width * height) + 0.01m, 2);
        }
        else if (width * length * height > chosenCategory.MaxVolumeM3)
        {
            length = decimal.Round(chosenCategory.MaxVolumeM3 / (width * height) - 0.01m, 2);
        }

        entity.SizeCategoryID = chosenCategory.SizeCategoryID;
        entity.SizeCode = explicitCode;
        entity.DisplayName = displayName;
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
