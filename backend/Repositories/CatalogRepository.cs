using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Repositories;

public class CatalogRepository : ICatalogRepository
{
    private readonly SelfStorageDbContext _context;

    public CatalogRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<FacilityCatalogData>> GetActiveFacilitiesAsync(CancellationToken cancellationToken)
    {
        return await _context.Facilities
            .Where(f => f.Status == "Active")
            .Select(f => new FacilityCatalogData(
                f.FacilityID,
                f.FacilityName,
                f.Address,
                f.Status,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID)
                    .Select(p => (decimal?)p.DepositPercent)
                    .FirstOrDefault() ?? 20m
            )).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<UnitCatalogData>> GetUnitsForActiveFacilitiesAsync(DateTime now, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Where(u => u.Facility.Status == "Active")
            .Select(u => new UnitCatalogData(
                u.UnitID,
                u.UnitNumber,
                u.FacilityID,
                u.UnitType.TypeName,
                u.UnitTypeID,
                u.UnitSize.Dimensions,
                u.UnitSizeID,
                u.BasePrice,
                // Tính toán trạng thái Booking động ngay từ DB
                _context.Reservations.Any(r =>
                    r.AssignedUnitID == u.UnitID &&
                    r.Status == ReservationStatus.PendingDeposit &&
                    r.DepositExpiresAt > now)
                        ? UnitStatus.Booking
                        : u.Status
            )).ToListAsync(cancellationToken);
    }

    public async Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.Status == "Active", cancellationToken);
    }

    public async Task<decimal> GetFacilityDepositPercentAsync(int facilityId, CancellationToken cancellationToken)
    {
        var policy = await _context.RentalPolicies
            .Where(p => p.FacilityID == facilityId)
            .Select(p => (decimal?)p.DepositPercent)
            .FirstOrDefaultAsync(cancellationToken);
            
        return policy ?? 20m;
    }

    public async Task<IReadOnlyList<AvailableUnitData>> GetAvailableUnitsAsync(int facilityId, int unitTypeId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Where(u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId &&
                (u.Status == "Available" || u.Status == "Reserved" || u.Status == "In Use") &&
                !_context.Reservations.Any(r => r.AssignedUnitID == u.UnitID &&
                    r.Status != ReservationStatus.Cancelled &&
                    r.Status != ReservationStatus.Expired &&
                    ((r.Status == ReservationStatus.PendingDeposit && r.DepositExpiresAt > now) ||
                     (r.Status != ReservationStatus.PendingDeposit &&
                      r.StartDate <= endDate && r.EndDate >= startDate))))
            .OrderBy(u => u.BasePrice)
            .Select(u => new AvailableUnitData(
                u.UnitID,
                u.UnitNumber,
                u.UnitType.TypeName,
                u.UnitSize.Dimensions,
                u.BasePrice
            )).ToListAsync(cancellationToken);
    }
}