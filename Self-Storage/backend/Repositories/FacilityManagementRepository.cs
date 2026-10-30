using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class FacilityManagementRepository : IFacilityManagementRepository
{
    private readonly SelfStorageDbContext _context;

    public FacilityManagementRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users.FirstOrDefaultAsync(
            u => u.Email == email && u.Status == "Active",
            cancellationToken);
    }

    public async Task<User?> GetActiveUserByEmailAndRoleAsync(string email, int roleId, CancellationToken cancellationToken)
    {
        return await _context.Users.FirstOrDefaultAsync(
            u => u.Email == email && u.RoleID == roleId && u.Status == "Active",
            cancellationToken);
    }

    public async Task<string?> GetUserEmailByIdAsync(int userId, CancellationToken cancellationToken)
    {
        return await _context.Users
            .Where(u => u.UserID == userId)
            .Select(u => u.Email)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.FacilityID == facilityId && f.ManagerID == userId,
            cancellationToken);
    }

    public async Task<Facility?> GetFacilityByIdAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.FirstOrDefaultAsync(
            f => f.FacilityID == facilityId,
            cancellationToken);
    }

    public async Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.FacilityID == facilityId,
            cancellationToken);
    }

    public async Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.FacilityID == facilityId && f.Status == "Active",
            cancellationToken);
    }

    public async Task<bool> UnitCodePrefixExistsAsync(string unitCodePrefix, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.UnitCodePrefix == unitCodePrefix,
            cancellationToken);
    }

    public async Task<bool> FacilityNameExistsAsync(string facilityName, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.FacilityName == facilityName,
            cancellationToken);
    }

    public async Task<bool> FacilityHasDependenciesAsync(int facilityId, CancellationToken cancellationToken)
    {
        var hasUnits = await _context.StorageUnits.AnyAsync(u => u.FacilityID == facilityId, cancellationToken);
        var hasReservations = await _context.Reservations.AnyAsync(r => r.FacilityID == facilityId, cancellationToken);
        var hasStaffAssignments = await _context.FacilityStaffs.AnyAsync(fs => fs.FacilityID == facilityId, cancellationToken);
        return hasUnits || hasReservations || hasStaffAssignments;
    }

    public void AddFacility(Facility facility) => _context.Facilities.Add(facility);
    public void RemoveFacility(Facility facility) => _context.Facilities.Remove(facility);

    public async Task<RentalPolicy?> GetRentalPolicyByFacilityIdAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.RentalPolicies
            .Include(p => p.CancellationRules)
            .FirstOrDefaultAsync(p => p.FacilityID == facilityId, cancellationToken);
    }

    public async Task<RentalPolicy?> GetGlobalRentalPolicyAsync(CancellationToken cancellationToken)
    {
        return await _context.RentalPolicies
            .Include(p => p.CancellationRules)
            .Include(p => p.UpdatedByUser)
            .FirstOrDefaultAsync(p => p.FacilityID == null, cancellationToken);
    }

    public async Task<List<RentalPolicy>> GetAllRentalPoliciesAsync(CancellationToken cancellationToken)
    {
        return await _context.RentalPolicies
            .Include(p => p.CancellationRules)
            .ToListAsync(cancellationToken);
    }

    public void AddRentalPolicy(RentalPolicy policy) => _context.RentalPolicies.Add(policy);
    public void RemoveRentalPolicy(RentalPolicy policy) => _context.RentalPolicies.Remove(policy);

    public async Task<List<ContractType>> GetContractTypesAsync(CancellationToken cancellationToken)
    {
        return await _context.ContractTypes
            .OrderBy(ct => ct.RentalMonths)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<FeePolicy>> GetFeePoliciesAsync(CancellationToken cancellationToken)
    {
        return await _context.FeePolicies
            .OrderBy(fp => fp.FeePolicyID)
            .ToListAsync(cancellationToken);
    }

    public void AddFeePolicy(FeePolicy feePolicy) => _context.FeePolicies.Add(feePolicy);
    public void RemoveFeePolicy(FeePolicy feePolicy) => _context.FeePolicies.Remove(feePolicy);

    public void ReplaceCancellationRules(RentalPolicy policy, IEnumerable<CancellationRule> rules)
    {
        if (policy.CancellationRules.Count > 0)
        {
            _context.CancellationRules.RemoveRange(policy.CancellationRules);
            policy.CancellationRules.Clear();
        }
        foreach (var rule in rules)
        {
            policy.CancellationRules.Add(rule);
        }
    }

    public async Task<List<SizeCategory>> GetSizeCategoriesWithDetailsAsync(CancellationToken cancellationToken)
    {
        return await _context.SizeCategories
            .Include(c => c.UpdatedByUser)
            .Include(c => c.UnitSizes)
            .OrderBy(c => c.SizeCategoryID)
            .ToListAsync(cancellationToken);
    }

    public async Task<SizeCategory?> GetSizeCategoryByCodeAsync(string code, CancellationToken cancellationToken)
    {
        var normalized = code.Trim().ToUpperInvariant();
        return await _context.SizeCategories
            .Include(c => c.UpdatedByUser)
            .Include(c => c.UnitSizes)
            .FirstOrDefaultAsync(c => c.CodePrefix == normalized || c.CategoryCode == normalized, cancellationToken);
    }

    public void AddSizeCategory(SizeCategory category) => _context.SizeCategories.Add(category);
    public void RemoveSizeCategory(SizeCategory category) => _context.SizeCategories.Remove(category);

    public async Task<List<StorageUnit>> GetAllStorageUnitsAsync(CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.AsNoTracking().ToListAsync(cancellationToken);
    }

    public async Task<List<RentalRate>> GetAllRentalRatesAsync(CancellationToken cancellationToken)
    {
        return await _context.RentalRates.ToListAsync(cancellationToken);
    }

    public async Task<List<UnitSize>> GetAllUnitSizesAsync(CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.AsNoTracking().ToListAsync(cancellationToken);
    }

    public async Task<FacilityStaff?> GetFacilityStaffAssignmentAsync(int facilityId, int userId, CancellationToken cancellationToken)
    {
        return await _context.FacilityStaffs.FirstOrDefaultAsync(
            fs => fs.FacilityID == facilityId && fs.UserID == userId,
            cancellationToken);
    }

    public void AddFacilityStaff(FacilityStaff assignment) => _context.FacilityStaffs.Add(assignment);

    public async Task<Reservation?> GetReservationByIdAsync(int reservationId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.Contract)
            .Include(r => r.ReservationItems)
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);
    }

    public async Task<Contract> EnsureContractForReservationAsync(Reservation reservation, int? userId, CancellationToken cancellationToken)
    {
        var existing = await _context.Contracts.FirstOrDefaultAsync(c => c.ReservationID == reservation.ReservationID, cancellationToken);
        if (existing is not null)
            return existing;

        var now = DateTime.UtcNow;
        var contract = new Contract
        {
            ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}",
            ReservationID = reservation.ReservationID,
            StartDate = reservation.StartDate,
            EndDate = reservation.EndDate,
            ContractStatus = "Active",
            CreatedAt = now,
            CreatedByUserID = userId
        };
        _context.Contracts.Add(contract);
        await _context.SaveChangesAsync(cancellationToken);
        return contract;
    }

    public async Task<bool> HasConflictingReservationForUnitAsync(
        int excludeReservationId,
        int unitId,
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var today = now.Date;
        return await _context.ReservationUnits.AnyAsync(ru =>
            ru.ReservationID != excludeReservationId &&
            ru.UnitID == unitId &&
            (ru.Status == "Held" || ru.Status == "Active") &&
            (ru.Reservation.Status == ReservationStatus.PendingPayment ||
             ru.Reservation.Status == ReservationStatus.Paid ||
             ru.Reservation.Status == ReservationStatus.Confirmed ||
             ru.Reservation.Status == ReservationStatus.HandedOver) &&
            !(ru.Reservation.Status == ReservationStatus.PendingPayment && ru.Reservation.HoldExpiresAt <= now) &&
            ru.Reservation.StartDate <= endDate &&
            ((ru.Status == "Active" && ru.Reservation.EndDate < today) || ru.Reservation.EndDate >= startDate),
            cancellationToken);
    }

    public async Task<bool> HasActiveBookingHoldForUnitAsync(int unitId, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.ReservationUnits.AnyAsync(ru =>
            ru.UnitID == unitId &&
            ru.Status == "Held" &&
            ru.Reservation.Status == ReservationStatus.PendingPayment &&
            ru.Reservation.HoldExpiresAt > now,
            cancellationToken);
    }

    public void AddReservationUnit(ReservationUnit reservationUnit) => _context.ReservationUnits.Add(reservationUnit);

    public async Task<StorageUnit?> GetUnitByNumberAndFacilityAsync(string unitNumber, int facilityId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Include(u => u.RentalRate)
            .FirstOrDefaultAsync(
                u => u.UnitNumber == unitNumber && u.FacilityID == facilityId,
                cancellationToken);
    }

    public async Task<List<string>> GetUnitNumbersByFacilityAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Where(u => u.FacilityID == facilityId)
            .Select(u => u.UnitNumber)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<StorageUnit>> GetUnitsByFacilityTypeAndSizeAsync(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Where(u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId && u.UnitSizeID == unitSizeId)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> AnyUnitUsesRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.AnyAsync(
            u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId && u.UnitSizeID == unitSizeId,
            cancellationToken);
    }

    public void AddStorageUnit(StorageUnit unit) => _context.StorageUnits.Add(unit);

    public async Task<bool> UnitTypeExistsAsync(int unitTypeId, CancellationToken cancellationToken)
    {
        return await _context.UnitTypes.AnyAsync(t => t.UnitTypeID == unitTypeId, cancellationToken);
    }

    public async Task<bool> UnitSizeExistsAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.UnitSizes.AnyAsync(s => s.UnitSizeID == unitSizeId, cancellationToken);
    }

    public async Task<UnitSize?> GetUnitSizeWithCategoryAsync(int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.UnitSizes
            .Include(s => s.SizeCategory)
            .FirstOrDefaultAsync(s => s.UnitSizeID == unitSizeId, cancellationToken);
    }

    public async Task<(UnitType unitType, UnitSize unitSize)> GetOrCreateUnitLookupsAsync(
        CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var unitType = request.UnitTypeID.HasValue
            ? await _context.UnitTypes.FirstOrDefaultAsync(
                t => t.UnitTypeID == request.UnitTypeID.Value, cancellationToken)
            : await _context.UnitTypes.FirstOrDefaultAsync(
                t => t.TypeName == request.UnitType.Trim(), cancellationToken);
        if (unitType is null)
        {
            unitType = new UnitType { TypeName = request.UnitType.Trim(), IsActive = true };
            _context.UnitTypes.Add(unitType);
            await _context.SaveChangesAsync(cancellationToken);
        }

        var rawSize = request.Size.Trim();
        var sizeCodeCandidate = rawSize.Contains(':') ? rawSize.Split(':', 2)[0].Trim() : rawSize;

        var unitSize = request.UnitSizeID.HasValue
            ? await _context.UnitSizes.Include(s => s.SizeCategory).FirstOrDefaultAsync(
                s => s.UnitSizeID == request.UnitSizeID.Value, cancellationToken)
            : await _context.UnitSizes.Include(s => s.SizeCategory).FirstOrDefaultAsync(
                s => s.SizeCode == sizeCodeCandidate || s.DisplayName == rawSize || (s.SizeCode + ": " + s.DisplayName) == rawSize,
                cancellationToken);

        if (unitSize is null)
        {
            unitSize = await _context.UnitSizes.Include(s => s.SizeCategory).OrderBy(s => s.UnitSizeID).FirstOrDefaultAsync(cancellationToken);
            if (unitSize is null)
            {
                var cat = await _context.SizeCategories.OrderBy(c => c.SizeCategoryID).FirstAsync(cancellationToken);
                unitSize = new UnitSize
                {
                    SizeCategoryID = cat.SizeCategoryID,
                    SizeCode = $"{cat.CodePrefix.Trim()}9",
                    DisplayName = rawSize,
                    WidthM = 2.0m,
                    LengthM = 2.0m,
                    HeightM = cat.StandardHeightM,
                    IsActive = true
                };
                _context.UnitSizes.Add(unitSize);
                await _context.SaveChangesAsync(cancellationToken);
            }
        }

        return (unitType, unitSize);
    }

    public async Task EnsureFacilityCatalogLinksAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken)
    {
        var ft = await _context.FacilityUnitTypes.FirstOrDefaultAsync(
            x => x.FacilityID == facilityId && x.UnitTypeID == unitTypeId,
            cancellationToken);
        if (ft is null)
        {
            _context.FacilityUnitTypes.Add(new FacilityUnitType
            {
                FacilityID = facilityId,
                UnitTypeID = unitTypeId,
                IsActive = true,
                AddedAt = DateTime.UtcNow
            });
        }
        else if (!ft.IsActive)
        {
            ft.IsActive = true;
        }

        var fs = await _context.FacilityUnitSizes.FirstOrDefaultAsync(
            x => x.FacilityID == facilityId && x.UnitSizeID == unitSizeId,
            cancellationToken);
        if (fs is null)
        {
            _context.FacilityUnitSizes.Add(new FacilityUnitSize
            {
                FacilityID = facilityId,
                UnitSizeID = unitSizeId,
                IsActive = true,
                AddedAt = DateTime.UtcNow
            });
        }
        else if (!fs.IsActive)
        {
            fs.IsActive = true;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<RentalRate?> GetRentalRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken)
    {
        return await _context.RentalRates.FirstOrDefaultAsync(r =>
            r.FacilityID == facilityId &&
            r.UnitTypeID == unitTypeId &&
            r.UnitSizeID == unitSizeId,
            cancellationToken);
    }

    public async Task<List<RentalRate>> GetRentalRatesByFacilityIdAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.RentalRates
            .Where(r => r.FacilityID == facilityId)
            .ToListAsync(cancellationToken);
    }

    public void AddRentalRate(RentalRate rate) => _context.RentalRates.Add(rate);
    public void RemoveRentalRate(RentalRate rate) => _context.RentalRates.Remove(rate);
    public void RemoveRentalRates(IEnumerable<RentalRate> rates) => _context.RentalRates.RemoveRange(rates);

    public async Task RemoveFacilityCatalogLinksAsync(int facilityId, CancellationToken cancellationToken)
    {
        var fts = await _context.FacilityUnitTypes.Where(x => x.FacilityID == facilityId).ToListAsync(cancellationToken);
        var fss = await _context.FacilityUnitSizes.Where(x => x.FacilityID == facilityId).ToListAsync(cancellationToken);
        _context.FacilityUnitTypes.RemoveRange(fts);
        _context.FacilityUnitSizes.RemoveRange(fss);
    }

    public async Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var result = await action();
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
