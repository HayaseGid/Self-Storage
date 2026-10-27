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
                address = f.Address,
                status = f.Status,
                managerEmail = f.Manager.Email,
                depositPercent = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID)
                    .Select(p => (decimal?)p.DepositPercent)
                    .FirstOrDefault() ?? 20m
            })
            .ToListAsync(cancellationToken);

        var units = await _context.StorageUnits
            .Where(u => facilityIdsInScope.Contains(u.FacilityID))
            .Include(u => u.Facility)
            .Include(u => u.UnitType)
            .Include(u => u.UnitSize)
            .Select(u => new
            {
                id = u.UnitNumber,
                unitId = u.UnitID,
                facilityId = u.Facility.FacilityName,
                facilityDbId = u.FacilityID,
                type = u.UnitType.TypeName,
                unitTypeId = u.UnitTypeID,
                size = u.UnitSize.Dimensions,
                sizeId = u.UnitSizeID,
                sizeM2 = u.UnitSize.Volume,
                pricePerMonth = u.BasePrice,
                status = NormalizeUnitStatus(u.Status)
            })
            .ToListAsync(cancellationToken);

        var reservationsQuery = _context.Reservations
            .Where(r => facilityIdsInScope.Contains(r.FacilityID));
        if (customerId.HasValue)
            reservationsQuery = reservationsQuery.Where(r => r.CustomerID == customerId.Value);

        var now = DateTime.UtcNow;
        var reservations = await reservationsQuery
            .Include(r => r.Customer)
            .Include(r => r.Facility)
            .Include(r => r.AssignedUnit)
            .Include(r => r.UnitType)
            .Include(r => r.Payments)
            .Include(r => r.Contract)
            .OrderByDescending(r => r.ReservationID)
            .Select(r => new
            {
                id = r.ReservationID,
                customerName = r.Customer.FullName,
                customerEmail = r.Customer.Email,
                customerPhone = r.Customer.PhoneNumber,
                facilityId = r.Facility.FacilityName,
                unitId = r.AssignedUnit == null ? null : r.AssignedUnit.UnitNumber,
                assignedUnitId = r.AssignedUnit == null ? null : r.AssignedUnit.UnitNumber,
                unitType = r.UnitType.TypeName,
                unitTypeId = r.UnitTypeID,
                startDate = r.StartDate,
                endDate = r.EndDate,
                months = r.RentalPeriod,
                appointmentDate = r.StartDate,
                appointmentTime = "Cả ngày",
                deposit = r.DepositAmount,
                rentalFee = r.TotalEstimatedCost ?? 0,
                paymentStatus = r.Payments.Any(p => p.PaymentStatus == "Completed") ? "PAID" : "PENDING",
                paymentTxn = r.Payments
                    .Where(p => p.PaymentStatus == "Completed")
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => p.TransactionReference)
                    .FirstOrDefault(),
                status = NormalizeReservationStatus(
                    r.Status == ReservationStatus.PendingDeposit && r.DepositExpiresAt <= now
                        ? ReservationStatus.Expired
                        : r.Status),
                depositExpiresAt = r.DepositExpiresAt,
                contractId = r.Contract == null ? (int?)null : r.Contract.ContractID,
                source = "live"
            })
            .ToListAsync(cancellationToken);

        var contracts = await _context.Contracts
            .Where(c => c.Reservation.CustomerID == customerId || facilityIdsInScope.Contains(c.Reservation.FacilityID))
            .Select(c => new
            {
                id = c.ContractID,
                reservationId = c.ReservationID,
                customerName = c.Reservation.Customer.FullName,
                unitId = c.Reservation.AssignedUnit == null ? null : c.Reservation.AssignedUnit.UnitNumber,
                startDate = c.StartDate,
                endDate = c.EndDate,
                deposit = c.DepositAmount,
                totalFee = c.TotalFee,
                status = c.ContractStatus,
                accessType = c.UnitAccesses.Select(a => a.AccessType).FirstOrDefault(),
                accessValue = c.UnitAccesses.Select(a => a.AccessValue).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var payments = await _context.Payments
            .Where(p => facilityIdsInScope.Contains(p.Reservation.FacilityID) &&
                (!customerId.HasValue || p.Reservation.CustomerID == customerId.Value))
            .Select(p => new
            {
                txn = p.TransactionReference,
                resId = p.ReservationID,
                amount = p.Amount,
                paymentType = p.PaymentType,
                status = p.PaymentStatus,
                date = p.PaymentDate,
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
                staffId = fs.StaffID,
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
            .Select(s => new { unitSizeId = s.UnitSizeID, dimensions = s.Dimensions, volume = s.Volume })
            .ToListAsync(cancellationToken);

        var rentalRates = await _context.RentalRates
            .Where(r => facilityIdsInScope.Contains(r.FacilityID))
            .Select(r => new
            {
                facilityId = r.FacilityID,
                unitTypeId = r.UnitTypeID,
                unitType = r.UnitType.TypeName,
                unitSizeId = r.UnitSizeID,
                size = r.UnitSize.Dimensions,
                price = r.MonthlyPrice
            })
            .ToListAsync(cancellationToken);

        var activity = await _context.HandoverTasks
            .Where(t => facilityIdsInScope.Contains(t.Reservation.FacilityID))
            .OrderByDescending(t => t.TaskID)
            .Select(t => new
            {
                id = t.TaskID,
                at = t.ActualDate,
                facilityId = t.Reservation.Facility.FacilityName,
                staffName = t.Staff.FullName,
                unitNumber = t.Unit.UnitNumber,
                customerName = t.Customer.FullName,
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
        var monthlyRevenue = await _context.Payments
            .Where(p => p.PaymentStatus == "Completed")
            .GroupBy(p => new { p.PaymentDate.Year, p.PaymentDate.Month })
            .Select(group => new
            {
                year = group.Key.Year,
                month = group.Key.Month,
                receivedAmount = group.Sum(payment => payment.Amount)
            })
            .OrderByDescending(item => item.year)
            .ThenByDescending(item => item.month)
            .Take(12)
            .OrderBy(item => item.year)
            .ThenBy(item => item.month)
            .ToListAsync(cancellationToken);

        var facilities = await _context.Facilities
            .Select(f => new
            {
                facilityId = f.FacilityID,
                name = f.FacilityName,
                totalUnits = f.StorageUnits.Count,
                handedOverUnits = f.StorageUnits.Count(u => u.Status == "In Use"),
                occupancyRate = f.StorageUnits.Count == 0 ? 0m :
                    decimal.Round((decimal)f.StorageUnits.Count(u => u.Status == "In Use") * 100m / f.StorageUnits.Count, 2),
                receivedRevenue = f.Reservations.SelectMany(r => r.Payments)
                    .Where(p => p.PaymentStatus == "Completed")
                    .Sum(p => (decimal?)p.Amount) ?? 0m,
                handedOverCount = f.Reservations.Count(r => r.Status == "Handed Over")
            })
            .ToListAsync(cancellationToken);

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
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };

    private static string NormalizeReservationStatus(string status) => status switch
    {
        "Pending Deposit" => "PENDING_PAYMENT",
        "Paid" => "PENDING_APPROVAL",
        "Confirmed" => "CONFIRMED",
        "Handed Over" => "HANDED_OVER",
        "Cancelled" => "CANCELLED",
        "Expired" => "EXPIRED",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };
}

