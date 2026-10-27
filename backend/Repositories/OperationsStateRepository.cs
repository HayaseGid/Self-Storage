using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class OperationsStateRepository : IOperationsStateRepository
{
    private readonly SelfStorageDbContext _context;

    public OperationsStateRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users.FirstOrDefaultAsync(
            u => u.Email == email && u.Status == "Active",
            cancellationToken);
    }

    public async Task<int[]> GetFacilityIdsInScopeAsync(User requestingUser, CancellationToken cancellationToken)
    {
        var facilityQuery = _context.Facilities.AsQueryable();

        if (requestingUser.RoleID == 1)
        {
            facilityQuery = facilityQuery.Where(f => _context.Reservations
                .Any(r => r.FacilityID == f.FacilityID && r.CustomerID == requestingUser.UserID));
        }
        else if (requestingUser.RoleID == 2)
        {
            var staffFacilityIds = await _context.FacilityStaffs
                .Where(fs => fs.UserID == requestingUser.UserID && fs.Status == "Active")
                .Select(fs => fs.FacilityID)
                .ToArrayAsync(cancellationToken);
            facilityQuery = facilityQuery.Where(f => staffFacilityIds.Contains(f.FacilityID));
        }
        else if (requestingUser.RoleID == 3)
        {
            facilityQuery = facilityQuery.Where(f => f.ManagerID == requestingUser.UserID);
        }

        return await facilityQuery
            .OrderBy(f => f.FacilityID)
            .Select(f => f.FacilityID)
            .ToArrayAsync(cancellationToken);
    }

    public async Task<object> GetStateDataAsync(int[] facilityIdsInScope, int? customerId, CancellationToken cancellationToken)
    {
        var facilities = await _context.Facilities
            .Where(f => facilityIdsInScope.Contains(f.FacilityID))
            .OrderBy(f => f.FacilityID)
            .Select(f => new
            {
                id = f.FacilityName,
                facilityId = f.FacilityID,
                name = f.FacilityName,
                unitCodePrefix = f.UnitCodePrefix,
                address = f.StreetAddress + ", " + f.Ward + (f.District != null ? ", " + f.District : "") + ", " + f.City,
                status = f.Status,
                managerEmail = f.Manager.Email,
                depositPercent = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (decimal?)p.DepositMonths)
                    .FirstOrDefault() ?? 2m
            })
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;

        var rawUnits = await _context.StorageUnits
            .Where(u => facilityIdsInScope.Contains(u.FacilityID))
            .Select(u => new
            {
                u.UnitNumber,
                u.UnitID,
                FacilityName = u.Facility.FacilityName,
                u.FacilityID,
                TypeName = u.UnitType.TypeName,
                u.UnitTypeID,
                SizeCode = u.UnitSize.SizeCode,
                SizeDisplayName = u.UnitSize.DisplayName,
                u.UnitSizeID,
                u.UnitSize.VolumeM3,
                MonthlyPrice = u.RentalRate != null ? u.RentalRate.MonthlyPrice : 0m,
                u.Status,
                IsReserved = _context.ReservationUnits.Any(ru =>
                    ru.UnitID == u.UnitID &&
                    ru.Status == "Held" &&
                    (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed))
            })
            .ToListAsync(cancellationToken);

        var units = rawUnits.Select(u => new
        {
            id = u.UnitNumber,
            unitId = u.UnitID,
            facilityId = u.FacilityName,
            facilityDbId = u.FacilityID,
            type = u.TypeName,
            unitTypeId = u.UnitTypeID,
            size = $"{u.SizeCode}: {u.SizeDisplayName}",
            sizeId = u.UnitSizeID,
            sizeM2 = u.VolumeM3,
            pricePerMonth = u.MonthlyPrice,
            status = u.Status == UnitStatus.Available && u.IsReserved
                ? "RESERVED"
                : NormalizeUnitStatus(u.Status)
        }).ToList();

        var reservationsQuery = _context.Reservations
            .Where(r => facilityIdsInScope.Contains(r.FacilityID));
        if (customerId.HasValue)
            reservationsQuery = reservationsQuery.Where(r => r.CustomerID == customerId.Value);

        var rawReservations = await reservationsQuery
            .OrderByDescending(r => r.ReservationID)
            .Select(r => new
            {
                r.ReservationID,
                r.ReservationCode,
                CustomerFullName = r.Customer.FullName,
                CustomerEmail = r.Customer.Email,
                CustomerPhone = r.Customer.PhoneNumber,
                FacilityName = r.Facility.FacilityName,
                AssignedUnitNumber = r.ReservationUnits
                    .Where(ru => ru.Status != "Released")
                    .Select(ru => ru.Unit.UnitNumber)
                    .FirstOrDefault(),
                UnitTypeName = r.ReservationItems
                    .Select(ri => ri.UnitType.TypeName)
                    .FirstOrDefault(),
                UnitTypeId = r.ReservationItems
                    .Select(ri => (int?)ri.UnitTypeID)
                    .FirstOrDefault() ?? 0,
                r.StartDate,
                r.EndDate,
                r.RentalPeriod,
                r.AppointmentDate,
                r.AppointmentTime,
                Deposit = r.Charges
                    .Where(c => c.ChargeType == "Deposit" && c.Status != "Cancelled")
                    .Sum(c => (decimal?)c.Amount) ?? 0m,
                RentalFee = r.Charges
                    .Where(c => c.ChargeType == "Rent" && c.Status != "Cancelled")
                    .Sum(c => (decimal?)c.Amount) ?? 0m,
                IsPaid = r.Payments.Any(p => p.Status == "Completed" && p.Direction == "Collection"),
                PaymentTxn = r.Payments
                    .Where(p => p.Status == "Completed" && p.Direction == "Collection")
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => p.ProviderTransactionId ?? p.OrderCode)
                    .FirstOrDefault(),
                r.Status,
                r.HoldExpiresAt,
                ContractId = r.Contract == null ? (int?)null : r.Contract.ContractID
            })
            .ToListAsync(cancellationToken);

        var reservations = rawReservations.Select(r => new
        {
            id = r.ReservationID,
            reservationCode = r.ReservationCode,
            customerName = r.CustomerFullName,
            customerEmail = r.CustomerEmail,
            customerPhone = r.CustomerPhone,
            facilityId = r.FacilityName,
            unitId = r.AssignedUnitNumber,
            assignedUnitId = r.AssignedUnitNumber,
            unitType = r.UnitTypeName ?? string.Empty,
            unitTypeId = r.UnitTypeId,
            startDate = r.StartDate,
            endDate = r.EndDate,
            months = r.RentalPeriod,
            appointmentDate = r.AppointmentDate ?? r.StartDate,
            appointmentTime = r.AppointmentTime.HasValue ? r.AppointmentTime.Value.ToString(@"hh\:mm") : "Cả ngày",
            deposit = r.Deposit,
            rentalFee = r.RentalFee,
            paymentStatus = r.IsPaid ? "PAID" : "PENDING",
            paymentTxn = r.PaymentTxn,
            status = NormalizeReservationStatus(
                r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now
                    ? ReservationStatus.Expired
                    : r.Status),
            depositExpiresAt = r.HoldExpiresAt,
            contractId = r.ContractId,
            source = "live"
        }).ToList();

        var contracts = await _context.Contracts
            .Where(c => c.Reservation.CustomerID == customerId || facilityIdsInScope.Contains(c.Reservation.FacilityID))
            .Select(c => new
            {
                id = c.ContractID,
                contractNumber = c.ContractNumber,
                reservationId = c.ReservationID,
                customerName = c.Reservation.Customer.FullName,
                unitId = c.Reservation.ReservationUnits
                    .Where(ru => ru.Status != "Released")
                    .Select(ru => ru.Unit.UnitNumber)
                    .FirstOrDefault(),
                startDate = c.StartDate,
                endDate = c.EndDate,
                deposit = c.Reservation.Charges
                    .Where(ch => ch.ChargeType == "Deposit" && ch.Status != "Cancelled")
                    .Sum(ch => (decimal?)ch.Amount) ?? 0m,
                totalFee = c.Reservation.Charges
                    .Where(ch => ch.ChargeType == "Rent" && ch.Status != "Cancelled")
                    .Sum(ch => (decimal?)ch.Amount) ?? 0m,
                status = c.ContractStatus,
                accessType = c.Reservation.UnitAccesses.Select(a => a.AccessType).FirstOrDefault(),
                accessValue = c.Reservation.UnitAccesses.Select(a => a.AccessValue).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var payments = await _context.Payments
            .Where(p => facilityIdsInScope.Contains(p.Reservation.FacilityID) &&
                (!customerId.HasValue || p.Reservation.CustomerID == customerId.Value))
            .Select(p => new
            {
                txn = p.ProviderTransactionId ?? p.OrderCode,
                resId = p.ReservationID,
                amount = p.Amount,
                paymentType = p.PaymentMethod,
                status = p.Status,
                date = p.ConfirmedAt ?? p.CreatedAt,
                facility = p.Reservation.Facility.FacilityName,
                customerName = p.Reservation.Customer.FullName,
                customerEmail = p.Reservation.Customer.Email
            })
            .ToListAsync(cancellationToken);

        var staff = await _context.FacilityStaffs
            .Where(fs => facilityIdsInScope.Contains(fs.FacilityID))
            .Include(fs => fs.Facility)
            .Include(fs => fs.User)
            .Select(fs => new
            {
                id = fs.UserID,
                staffId = fs.AssignmentID,
                fullName = fs.User.FullName,
                email = fs.User.Email,
                facilityId = fs.Facility.FacilityName,
                status = fs.Status
            })
            .ToListAsync(cancellationToken);

        var managers = await _context.Users
            .Where(u => u.RoleID == 3 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);

        var staffUsers = await _context.Users
            .Where(u => u.RoleID == 2 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);

        var unitTypes = await _context.UnitTypes
            .OrderBy(t => t.TypeName)
            .Select(t => new { unitTypeId = t.UnitTypeID, name = t.TypeName })
            .ToListAsync(cancellationToken);

        var unitSizes = await _context.UnitSizes
            .OrderBy(s => s.UnitSizeID)
            .Select(s => new
            {
                unitSizeId = s.UnitSizeID,
                dimensions = s.SizeCode + ": " + s.DisplayName,
                volume = s.VolumeM3
            })
            .ToListAsync(cancellationToken);

        var rentalRates = await _context.RentalRates
            .Where(r => facilityIdsInScope.Contains(r.FacilityID))
            .Select(r => new
            {
                facilityId = r.FacilityID,
                unitTypeId = r.UnitTypeID,
                unitType = r.UnitType.TypeName,
                unitSizeId = r.UnitSizeID,
                size = r.UnitSize.SizeCode + ": " + r.UnitSize.DisplayName,
                price = r.MonthlyPrice
            })
            .ToListAsync(cancellationToken);

        var activity = await _context.HandoverTasks
            .Where(t => facilityIdsInScope.Contains(t.FacilityID))
            .OrderByDescending(t => t.TaskID)
            .Select(t => new
            {
                id = t.TaskID,
                at = t.ActualAt ?? (DateTime?)t.CreatedAt,
                facilityId = t.Facility.FacilityName,
                staffName = t.AssignedStaff.FullName,
                unitNumber = t.Unit.UnitNumber,
                customerName = t.Reservation != null ? t.Reservation.Customer.FullName : "Khách hàng",
                reservationId = t.ReservationID
            })
            .ToListAsync(cancellationToken);

        var activityLog = activity.Select(item => new
        {
            item.id,
            item.at,
            item.facilityId,
            item.staffName,
            text = $"Bàn giao {item.unitNumber} cho {item.customerName} (đặt chỗ {item.reservationId})."
        });

        return new
        {
            facilities,
            units,
            reservations,
            contracts,
            payments,
            staff,
            unitTypes,
            unitSizes,
            rentalRates,
            managers,
            staffUsers,
            activity = activityLog
        };
    }

    public async Task<object> GetReportsDataAsync(CancellationToken cancellationToken)
    {
        // Theo vw_Revenue trong SelfStorageDB_test.sql: chỉ tính Charge đã Paid và KHÔNG tính Deposit, trừ RefundedAmount
        var paidRevenueCharges = await _context.Charges
            .Where(c => c.Status == "Paid" && c.ChargeType != "Deposit")
            .Select(c => new
            {
                FacilityID = c.Reservation.FacilityID,
                RevenueDate = c.PaidAt ?? c.CreatedAt,
                NetAmount = c.Amount - c.RefundedAmount
            })
            .ToListAsync(cancellationToken);

        var monthlyRevenue = paidRevenueCharges
            .GroupBy(c => new { c.RevenueDate.Year, c.RevenueDate.Month })
            .Select(group => new
            {
                year = group.Key.Year,
                month = group.Key.Month,
                receivedAmount = group.Sum(item => item.NetAmount)
            })
            .OrderByDescending(item => item.year)
            .ThenByDescending(item => item.month)
            .Take(12)
            .OrderBy(item => item.year)
            .ThenBy(item => item.month)
            .ToList();

        var revenueByFacility = paidRevenueCharges
            .GroupBy(c => c.FacilityID)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.NetAmount));

        var rawFacilities = await _context.Facilities
            .Select(f => new
            {
                facilityId = f.FacilityID,
                name = f.FacilityName,
                totalUnits = f.StorageUnits.Count(u => u.Status != UnitStatus.Inactive),
                handedOverUnits = f.StorageUnits.Count(u => u.Status == UnitStatus.InUse),
                handedOverCount = f.Reservations.Count(r => r.Status == ReservationStatus.HandedOver)
            })
            .ToListAsync(cancellationToken);

        var facilities = rawFacilities.Select(f => new
        {
            f.facilityId,
            f.name,
            f.totalUnits,
            f.handedOverUnits,
            occupancyRate = f.totalUnits == 0 ? 0m :
                decimal.Round((decimal)f.handedOverUnits * 100m / f.totalUnits, 2),
            receivedRevenue = revenueByFacility.TryGetValue(f.facilityId, out var rev) ? rev : 0m,
            f.handedOverCount
        }).ToList();

        return new
        {
            totalRevenue = facilities.Sum(f => f.receivedRevenue),
            totalUnits = facilities.Sum(f => f.totalUnits),
            handedOverUnits = facilities.Sum(f => f.handedOverUnits),
            handedOverCount = facilities.Sum(f => f.handedOverCount),
            occupancyRate = facilities.Sum(f => f.totalUnits) == 0 ? 0m :
                decimal.Round((decimal)facilities.Sum(f => f.handedOverUnits) * 100m / facilities.Sum(f => f.totalUnits), 2),
            monthlyRevenue,
            facilities
        };
    }

    private static string NormalizeUnitStatus(string status) => status switch
    {
        "Available" => "AVAILABLE",
        "Reserved" => "RESERVED",
        "In Use" => "RENTED",
        "Pending Inspection" => "MAINTENANCE",
        "Maintenance" => "MAINTENANCE",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };

    private static string NormalizeReservationStatus(string status) => status switch
    {
        "Pending Payment" or "Pending Deposit" => "PENDING_PAYMENT",
        "Paid" => "PENDING_APPROVAL",
        "Confirmed" => "CONFIRMED",
        "Handed Over" => "HANDED_OVER",
        "Completed" => "COMPLETED",
        "Cancelled" => "CANCELLED",
        "Expired" => "EXPIRED",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };
}
