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
                f.StreetAddress + ", " + f.Ward + (f.District != null ? ", " + f.District : "") + ", " + f.City,
                f.Status,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (decimal?)p.DepositMonths)
                    .FirstOrDefault() ?? 2m
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
                u.UnitSize.SizeCode + ": " + u.UnitSize.DisplayName,
                u.UnitSizeID,
                u.RentalRate != null ? u.RentalRate.MonthlyPrice : 0m,
                _context.ReservationUnits.Any(ru =>
                    ru.UnitID == u.UnitID &&
                    ru.Status == "Held" &&
                    ru.Reservation.Status == ReservationStatus.PendingPayment &&
                    ru.Reservation.HoldExpiresAt > now)
                        ? UnitStatus.Booking
                        : _context.ReservationUnits.Any(ru =>
                            ru.UnitID == u.UnitID &&
                            ru.Status == "Held" &&
                            (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed))
                                ? UnitStatus.Reserved
                                : u.Status
            )).ToListAsync(cancellationToken);
    }

    public async Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.Status == "Active", cancellationToken);
    }

    public async Task<decimal> GetFacilityDepositPercentAsync(int facilityId, CancellationToken cancellationToken)
    {
        var depositMonths = await _context.RentalPolicies
            .Where(p => p.FacilityID == facilityId || p.FacilityID == null)
            .OrderBy(p => p.FacilityID != null ? 0 : 1)
            .Select(p => (byte?)p.DepositMonths)
            .FirstOrDefaultAsync(cancellationToken);

        return depositMonths ?? 2m;
    }

    public async Task<IReadOnlyList<AvailableUnitData>> GetAvailableUnitsAsync(int facilityId, int unitTypeId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken)
    {
        var today = now.Date;
        return await _context.StorageUnits
            .Where(u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId &&
                u.Status != UnitStatus.Maintenance && u.Status != UnitStatus.Inactive &&
                u.UnitType.IsActive && u.UnitSize.IsActive &&
                !_context.ReservationUnits.Any(ru =>
                    ru.UnitID == u.UnitID &&
                    (ru.Status == "Held" || ru.Status == "Active") &&
                    (ru.Reservation.Status == ReservationStatus.PendingPayment ||
                     ru.Reservation.Status == ReservationStatus.Paid ||
                     ru.Reservation.Status == ReservationStatus.Confirmed ||
                     ru.Reservation.Status == ReservationStatus.HandedOver) &&
                    !(ru.Reservation.Status == ReservationStatus.PendingPayment && ru.Reservation.HoldExpiresAt <= now) &&
                    ru.Reservation.StartDate <= endDate &&
                    ((ru.Status == "Active" && ru.Reservation.EndDate < today) || ru.Reservation.EndDate >= startDate)))
            .OrderBy(u => u.RentalRate != null ? u.RentalRate.MonthlyPrice : 0m)
            .Select(u => new AvailableUnitData(
                u.UnitID,
                u.UnitNumber,
                u.UnitType.TypeName,
                u.UnitSize.SizeCode + ": " + u.UnitSize.DisplayName,
                u.RentalRate != null ? u.RentalRate.MonthlyPrice : 0m
            )).ToListAsync(cancellationToken);
    }
}
