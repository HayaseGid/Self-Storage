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
                f.UnitCodePrefix,
                f.StreetAddress + ", " + f.Ward + (f.District != null ? ", " + f.District : "") + ", " + f.City,
                f.StreetAddress,
                f.Ward,
                f.District,
                f.City,
                f.ContactPhone,
                f.OpeningHours,
                f.Description,
                f.Status,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (decimal?)p.DepositMonths)
                    .FirstOrDefault() ?? 2m,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.HoldMinutes)
                    .FirstOrDefault() ?? 15,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (decimal?)p.LateFeePerDay)
                    .FirstOrDefault() ?? 50000m,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.GracePeriodDays)
                    .FirstOrDefault() ?? 3,
                _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.RenewalNoticeDays)
                    .FirstOrDefault() ?? 30
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
                u.UnitSize.AreaM2,
                u.UnitSize.VolumeM3,
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
                                : u.Status,
                u.Floor,
                u.Zone,
                u.LocationNote
            )).ToListAsync(cancellationToken);
    }

    public async Task<object> GetCatalogPoliciesAsync(CancellationToken cancellationToken)
    {
        var globalPolicy = await _context.RentalPolicies
            .Include(p => p.CancellationRules)
            .FirstOrDefaultAsync(p => p.FacilityID == null, cancellationToken);

        var contractTypes = await _context.ContractTypes
            .Where(ct => ct.IsActive)
            .OrderBy(ct => ct.RentalMonths)
            .Select(ct => new
            {
                contractTypeId = ct.ContractTypeID,
                typeName = ct.TypeName,
                months = ct.RentalMonths,
                discountPercent = ct.DiscountRate
            })
            .ToListAsync(cancellationToken);

        var feePolicies = await _context.FeePolicies
            .Where(fp => fp.IsActive)
            .OrderBy(fp => fp.FeePolicyID)
            .Select(fp => new
            {
                id = fp.FeeCode,
                feePolicyId = fp.FeePolicyID,
                feeCode = fp.FeeCode,
                name = fp.FeeName,
                category = fp.FeeCategory,
                valueType = fp.ValueType,
                minValue = fp.MinValue,
                maxValue = fp.MaxValue,
                amount = fp.MaxValue
            })
            .ToListAsync(cancellationToken);

        var cancellationRules = globalPolicy?.CancellationRules
            .OrderByDescending(r => r.DaysBeforeStart)
            .Select(r => new
            {
                cancellationRuleId = r.CancellationRuleID,
                daysBeforeStart = r.DaysBeforeStart,
                refundPercent = r.RefundPercent
            })
            .ToList();

        return new
        {
            depositMonths = globalPolicy?.DepositMonths ?? (byte)2,
            holdMinutes = globalPolicy?.HoldMinutes ?? 15,
            lateFeePerDay = globalPolicy?.LateFeePerDay ?? 50000m,
            gracePeriodDays = globalPolicy?.GracePeriodDays ?? 3,
            renewalNoticeDays = globalPolicy?.RenewalNoticeDays ?? 30,
            cancellationRules,
            contractTypes,
            feePolicies
        };
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

    public async Task<decimal> GetContractDiscountRateAsync(int months, CancellationToken cancellationToken)
    {
        var discount = await _context.ContractTypes
            .Where(ct => ct.RentalMonths == months && ct.IsActive)
            .Select(ct => (decimal?)ct.DiscountRate)
            .FirstOrDefaultAsync(cancellationToken);

        return discount ?? (months switch { 6 => 5m, 12 => 10m, _ => 0m });
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
