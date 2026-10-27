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

    public async Task<bool> FacilityNameAndAddressExistsAsync(string facilityName, string address, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(
            f => f.FacilityName == facilityName && f.Address == address,
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
        return await _context.RentalPolicies.FirstOrDefaultAsync(
            p => p.FacilityID == facilityId,
            cancellationToken);
    }

    public void AddRentalPolicy(RentalPolicy policy) => _context.RentalPolicies.Add(policy);
    public void RemoveRentalPolicy(RentalPolicy policy) => _context.RentalPolicies.Remove(policy);

    public async Task<FacilityStaff?> GetFacilityStaffAssignmentAsync(int facilityId, int userId, CancellationToken cancellationToken)
    {
        return await _context.FacilityStaffs.FirstOrDefaultAsync(
            fs => fs.FacilityID == facilityId && fs.UserID == userId,
            cancellationToken);
    }

    public void AddFacilityStaff(FacilityStaff assignment) => _context.FacilityStaffs.Add(assignment);

    public async Task<Reservation?> GetReservationByIdAsync(int reservationId, CancellationToken cancellationToken)
    {
        return await _context.Reservations.FirstOrDefaultAsync(
            r => r.ReservationID == reservationId,
            cancellationToken);
    }

    public async Task<bool> HasConflictingReservationForUnitAsync(
        int excludeReservationId,
        int unitId,
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken)
    {
        return await _context.Reservations.AnyAsync(r =>
            r.ReservationID != excludeReservationId &&
            r.AssignedUnitID == unitId &&
            r.Status != ReservationStatus.Cancelled &&
            r.StartDate <= endDate &&
            r.EndDate >= startDate,
            cancellationToken);
    }

    public async Task<bool> HasActiveBookingHoldForUnitAsync(int unitId, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.Reservations.AnyAsync(r =>
            r.AssignedUnitID == unitId &&
            r.Status == ReservationStatus.PendingDeposit &&
            r.DepositExpiresAt > now,
            cancellationToken);
    }

    public async Task<StorageUnit?> GetUnitForReservationAssignmentAsync(
        int? assignedUnitId,
        string unitNumber,
        int facilityId,
        int unitTypeId,
        CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.FirstOrDefaultAsync(u =>
            u.UnitID == assignedUnitId &&
            u.UnitNumber == unitNumber &&
            u.FacilityID == facilityId &&
            u.UnitTypeID == unitTypeId,
            cancellationToken);
    }

    public async Task<StorageUnit?> GetUnitByNumberAndFacilityAsync(string unitNumber, int facilityId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits.FirstOrDefaultAsync(
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
            unitType = new UnitType { TypeName = request.UnitType.Trim() };
            _context.UnitTypes.Add(unitType);
        }

        var unitSize = request.UnitSizeID.HasValue
            ? await _context.UnitSizes.FirstOrDefaultAsync(
                s => s.UnitSizeID == request.UnitSizeID.Value, cancellationToken)
            : await _context.UnitSizes.FirstOrDefaultAsync(
                s => s.Dimensions == request.Size.Trim(), cancellationToken);
        if (unitSize is null)
        {
            unitSize = new UnitSize
            {
                Dimensions = request.Size.Trim(),
                Volume = request.SizeM2
            };
            _context.UnitSizes.Add(unitSize);
        }

        return (unitType, unitSize);
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

