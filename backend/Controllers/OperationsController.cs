using System.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class OperationsController(SelfStorageDbContext context) : ControllerBase
{
    [HttpGet("state")]
    public async Task<IActionResult> GetState([FromQuery] string? email, CancellationToken cancellationToken)
    {
        var facilityQuery = context.Facilities.AsQueryable();
        int? customerId = null;

        if (!string.IsNullOrWhiteSpace(email))
        {
            var user = await context.Users
                .Include(u => u.FacilityStaffs)
                .FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
            if (user is null) return NotFound(new { message = "Không tìm thấy tài khoản." });

            if (user.RoleID == 1)
            {
                customerId = user.UserID;
                facilityQuery = facilityQuery.Where(f => context.Reservations
                    .Any(r => r.FacilityID == f.FacilityID && r.CustomerID == user.UserID));
            }
            else if (user.RoleID == 2)
            {
                var facilityIds = user.FacilityStaffs
                    .Where(fs => fs.Status == "Active")
                    .Select(fs => fs.FacilityID)
                    .ToArray();
                facilityQuery = facilityQuery.Where(f => facilityIds.Contains(f.FacilityID));
            }
            else if (user.RoleID == 3)
            {
                facilityQuery = facilityQuery.Where(f => f.ManagerID == user.UserID);
            }
            else if (user.RoleID != 4 && user.RoleID != 5)
            {
                return Forbid();
            }
        }

        var facilities = await facilityQuery
            .OrderBy(f => f.FacilityID)
            .Select(f => new
            {
                id = f.FacilityName,
                facilityId = f.FacilityID,
                name = f.FacilityName,
                address = f.Address,
                status = f.Status,
                managerEmail = f.Manager.Email,
                depositPercent = context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID)
                    .Select(p => (decimal?)p.DepositPercent)
                    .FirstOrDefault() ?? 20m
            }).ToListAsync(cancellationToken);
        var facilityIdsInScope = facilities.Select(f => f.facilityId).ToArray();

        var units = await context.StorageUnits
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
            }).ToListAsync(cancellationToken);

        var reservationsQuery = context.Reservations
            .Where(r => facilityIdsInScope.Contains(r.FacilityID));
        if (customerId.HasValue)
            reservationsQuery = reservationsQuery.Where(r => r.CustomerID == customerId.Value);

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
                startDate = r.StartDate,
                endDate = r.EndDate,
                months = r.RentalPeriod,
                appointmentDate = r.StartDate,
                appointmentTime = "Cả ngày",
                deposit = r.DepositAmount,
                rentalFee = r.TotalEstimatedCost ?? 0,
                paymentStatus = r.Payments.Any(p => p.PaymentStatus == "Completed") ? "PAID" : "PENDING",
                paymentTxn = r.Payments.Where(p => p.PaymentStatus == "Completed")
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => p.TransactionReference).FirstOrDefault(),
                status = NormalizeReservationStatus(r.Status),
                contractId = r.Contract == null ? (int?)null : r.Contract.ContractID,
                source = "live"
            }).ToListAsync(cancellationToken);

        var contracts = await context.Contracts
            .Where(c => c.Reservation.CustomerID == customerId || facilityIdsInScope.Contains(c.Reservation.FacilityID))
            .Select(c => new
            {
                id = c.ContractID,
                reservationId = c.ReservationID,
                unitId = c.Reservation.AssignedUnit == null ? null : c.Reservation.AssignedUnit.UnitNumber,
                startDate = c.StartDate,
                endDate = c.EndDate,
                deposit = c.DepositAmount,
                totalFee = c.TotalFee,
                status = c.ContractStatus,
                accessType = c.UnitAccesses.Select(a => a.AccessType).FirstOrDefault(),
                accessValue = c.UnitAccesses.Select(a => a.AccessValue).FirstOrDefault()
            }).ToListAsync(cancellationToken);

        var payments = await context.Payments
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
            }).ToListAsync(cancellationToken);

        var staff = await context.FacilityStaffs
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
            }).ToListAsync(cancellationToken);
        var managers = await context.Users
            .Where(u => u.RoleID == 3 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);
        var staffUsers = await context.Users
            .Where(u => u.RoleID == 2 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);

        var unitTypes = await context.UnitTypes
            .OrderBy(t => t.TypeName)
            .Select(t => new { unitTypeId = t.UnitTypeID, name = t.TypeName })
            .ToListAsync(cancellationToken);
        var unitSizes = await context.UnitSizes
            .OrderBy(s => s.UnitSizeID)
            .Select(s => new { unitSizeId = s.UnitSizeID, dimensions = s.Dimensions, volume = s.Volume })
            .ToListAsync(cancellationToken);
        var rentalRates = await context.RentalRates
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
        var activity = await context.HandoverTasks
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
            }).ToListAsync(cancellationToken);

        var activityLog = activity.Select(item => new
        {
            item.id,
            item.at,
            item.facilityId,
            item.staffName,
            text = $"Bàn giao {item.unitNumber} cho {item.customerName} (đặt chỗ {item.reservationId})."
        });

        return Ok(new
        {
            facilities, units, reservations, contracts, payments, staff,
            unitTypes, unitSizes, rentalRates, managers, staffUsers, activity = activityLog
        });
    }

    [HttpPost("reservations/{reservationId:int}/assign")]
    public async Task<IActionResult> AssignReservation(
        int reservationId,
        [FromBody] AssignReservationDTO request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var reservation = await context.Reservations
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);
        if (reservation is null) return NotFound(new { message = "Không tìm thấy đặt chỗ." });
        if (reservation.Status != "Paid")
            return Conflict(new { message = "Chỉ đặt chỗ đã thanh toán mới được phân kho." });

        var unit = await context.StorageUnits
            .FirstOrDefaultAsync(u => u.UnitNumber == request.UnitNumber &&
                u.FacilityID == reservation.FacilityID &&
                u.UnitTypeID == reservation.UnitTypeID, cancellationToken);
        if (unit is null) return BadRequest(new { message = "Kho không thuộc cơ sở hoặc loại đã đặt." });
        if (unit.Status is not ("Available" or "Reserved" or "In Use"))
            return Conflict(new { message = "Kho hiện không khả dụng." });

        var hasConflict = await context.Reservations.AnyAsync(r =>
            r.ReservationID != reservationId &&
            r.AssignedUnitID == unit.UnitID &&
            r.Status != "Cancelled" &&
            r.StartDate <= reservation.EndDate &&
            r.EndDate >= reservation.StartDate, cancellationToken);
        if (hasConflict)
            return Conflict(new { message = "Kho đã được đặt trong kỳ thuê này." });

        reservation.AssignedUnitID = unit.UnitID;
        reservation.Status = "Confirmed";
        await context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(new
        {
            reservationId,
            unitNumber = unit.UnitNumber,
            status = reservation.Status,
            message = "Đã phân kho cho đặt chỗ."
        });
    }

    [HttpPut("facilities/{facilityId:int}/policy")]
    public async Task<IActionResult> UpdatePolicy(
        int facilityId,
        [FromBody] UpdateRentalPolicyDTO request,
        CancellationToken cancellationToken)
    {
        if (!await context.Facilities.AnyAsync(f => f.FacilityID == facilityId, cancellationToken))
            return NotFound(new { message = "Không tìm thấy cơ sở." });

        var policy = await context.RentalPolicies
            .FirstOrDefaultAsync(p => p.FacilityID == facilityId, cancellationToken);
        if (policy is null)
        {
            policy = new RentalPolicy { FacilityID = facilityId, DepositPercent = request.DepositPercent };
            context.RentalPolicies.Add(policy);
        }
        else
        {
            policy.DepositPercent = request.DepositPercent;
        }

        await context.SaveChangesAsync(cancellationToken);
        return Ok(new { facilityId, depositPercent = policy.DepositPercent });
    }

    [HttpPost("facilities")]
    public async Task<IActionResult> CreateFacility(
        [FromBody] CreateFacilityDTO request,
        CancellationToken cancellationToken)
    {
        var manager = await context.Users.FirstOrDefaultAsync(
            u => u.Email == request.ManagerEmail && u.RoleID == 3, cancellationToken);
        if (manager is null)
            return BadRequest(new { message = "Cần chỉ định tài khoản Facility Manager hợp lệ." });

        var facility = new Facility
        {
            ManagerID = manager.UserID,
            FacilityName = request.FacilityName.Trim(),
            Address = request.Address.Trim(),
            ContactPhone = request.ContactPhone?.Trim(),
            Status = request.Status.Equals("inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active"
        };
        context.RentalPolicies.Add(new RentalPolicy
        {
            Facility = facility,
            DepositPercent = 20m
        });
        context.Facilities.Add(facility);
        await context.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetState), new { email = (string?)null }, new
        {
            facilityId = facility.FacilityID,
            name = facility.FacilityName,
            address = facility.Address,
            managerEmail = manager.Email,
            depositPercent = 20m
        });
    }

    [HttpPost("facilities/{facilityId:int}/staff")]
    public async Task<IActionResult> AssignStaff(
        int facilityId,
        [FromBody] AssignFacilityStaffDTO request,
        CancellationToken cancellationToken)
    {
        var staffUser = await context.Users.FirstOrDefaultAsync(
            u => u.Email == request.StaffEmail && u.RoleID == 2, cancellationToken);
        if (staffUser is null)
            return BadRequest(new { message = "Không tìm thấy tài khoản Facility Staff hợp lệ." });
        if (!await context.Facilities.AnyAsync(f => f.FacilityID == facilityId, cancellationToken))
            return NotFound(new { message = "Không tìm thấy cơ sở." });

        var assignment = await context.FacilityStaffs.FirstOrDefaultAsync(
            fs => fs.FacilityID == facilityId && fs.UserID == staffUser.UserID, cancellationToken);
        if (assignment is null)
        {
            assignment = new FacilityStaff
            {
                FacilityID = facilityId,
                UserID = staffUser.UserID,
                AssignedDate = DateTime.Today,
                Status = "Active"
            };
            context.FacilityStaffs.Add(assignment);
        }
        else
        {
            assignment.Status = "Active";
        }
        await context.SaveChangesAsync(cancellationToken);
        return Ok(new { assignment.StaffID, assignment.FacilityID, assignment.UserID, assignment.Status });
    }

    [HttpPost("units")]
    public async Task<IActionResult> CreateUnit(
        [FromBody] CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var facilityExists = await context.Facilities
            .AnyAsync(f => f.FacilityID == request.FacilityID, cancellationToken);
        if (!facilityExists)
            return BadRequest(new { message = "Cơ sở không hợp lệ." });
        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return BadRequest(new { message = "Trạng thái kho không hợp lệ." });
        if (request.UnitTypeID.HasValue && !await context.UnitTypes
                .AnyAsync(t => t.UnitTypeID == request.UnitTypeID.Value, cancellationToken))
            return BadRequest(new { message = "Loại kho không hợp lệ." });
        if (request.UnitSizeID.HasValue && !await context.UnitSizes
                .AnyAsync(s => s.UnitSizeID == request.UnitSizeID.Value, cancellationToken))
            return BadRequest(new { message = "Kích thước kho không hợp lệ." });

        var duplicate = await context.StorageUnits.AnyAsync(u =>
            u.FacilityID == request.FacilityID && u.UnitNumber == request.UnitNumber.Trim(), cancellationToken);
        if (duplicate)
            return Conflict(new { message = "Mã kho đã tồn tại tại cơ sở này." });

        var lookups = await GetOrCreateUnitLookups(request, cancellationToken);
        var rate = lookups.unitType.UnitTypeID > 0 && lookups.unitSize.UnitSizeID > 0
            ? await context.RentalRates.FirstOrDefaultAsync(
                r => r.FacilityID == request.FacilityID &&
                    r.UnitTypeID == lookups.unitType.UnitTypeID &&
                    r.UnitSizeID == lookups.unitSize.UnitSizeID, cancellationToken)
            : null;
        var unit = new StorageUnit
        {
            FacilityID = request.FacilityID,
            UnitType = lookups.unitType,
            UnitSize = lookups.unitSize,
            UnitNumber = request.UnitNumber.Trim(),
            BasePrice = rate?.MonthlyPrice ?? request.BasePrice,
            Status = persistedStatus
        };
        context.StorageUnits.Add(unit);
        await context.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetState), new { email = (string?)null }, new
        {
            unit.UnitID,
            unit.UnitNumber,
            unit.FacilityID,
            unit.BasePrice,
            unit.Status
        });
    }

    [HttpPut("facilities/{facilityId:int}/rates")]
    public async Task<IActionResult> UpdateRentalRate(
        int facilityId,
        [FromBody] UpdateRentalRateDTO request,
        CancellationToken cancellationToken)
    {
        if (!await context.Facilities.AnyAsync(f => f.FacilityID == facilityId, cancellationToken))
            return NotFound(new { message = "Không tìm thấy cơ sở." });
        if (!await context.UnitTypes.AnyAsync(t => t.UnitTypeID == request.UnitTypeID, cancellationToken) ||
            !await context.UnitSizes.AnyAsync(s => s.UnitSizeID == request.UnitSizeID, cancellationToken))
            return BadRequest(new { message = "Loại hoặc kích thước kho không hợp lệ." });

        var rate = await context.RentalRates.FirstOrDefaultAsync(r =>
            r.FacilityID == facilityId &&
            r.UnitTypeID == request.UnitTypeID &&
            r.UnitSizeID == request.UnitSizeID, cancellationToken);
        if (rate is null)
        {
            rate = new RentalRate
            {
                FacilityID = facilityId,
                UnitTypeID = request.UnitTypeID,
                UnitSizeID = request.UnitSizeID,
                MonthlyPrice = request.BasePrice
            };
            context.RentalRates.Add(rate);
        }
        else
        {
            rate.MonthlyPrice = request.BasePrice;
        }
        var matchingUnits = await context.StorageUnits.Where(u =>
            u.FacilityID == facilityId &&
            u.UnitTypeID == request.UnitTypeID &&
            u.UnitSizeID == request.UnitSizeID).ToListAsync(cancellationToken);
        foreach (var unit in matchingUnits) unit.BasePrice = request.BasePrice;
        await context.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            facilityId,
            request.UnitTypeID,
            request.UnitSizeID,
            request.BasePrice,
            updatedUnitCount = matchingUnits.Count
        });
    }

    [HttpDelete("facilities/{facilityId:int}/rates/{unitTypeId:int}/{unitSizeId:int}")]
    public async Task<IActionResult> DeleteRentalRate(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        CancellationToken cancellationToken)
    {
        var rate = await context.RentalRates.FirstOrDefaultAsync(r =>
            r.FacilityID == facilityId &&
            r.UnitTypeID == unitTypeId &&
            r.UnitSizeID == unitSizeId, cancellationToken);
        if (rate is null) return NotFound(new { message = "Không tìm thấy mức giá." });
        if (await context.StorageUnits.AnyAsync(u =>
                u.FacilityID == facilityId &&
                u.UnitTypeID == unitTypeId &&
                u.UnitSizeID == unitSizeId, cancellationToken))
            return Conflict(new { message = "Không thể xóa mức giá đang được kho hiện hữu sử dụng." });

        context.RentalRates.Remove(rate);
        await context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("units/{unitNumber}")]
    public async Task<IActionResult> UpdateUnit(
        string unitNumber,
        [FromBody] CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var unit = await context.StorageUnits.FirstOrDefaultAsync(
            u => u.UnitNumber == unitNumber && u.FacilityID == request.FacilityID, cancellationToken);
        if (unit is null) return NotFound(new { message = "Không tìm thấy kho tại cơ sở." });
        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return BadRequest(new { message = "Trạng thái kho không hợp lệ." });
        if (request.UnitTypeID.HasValue && !await context.UnitTypes
                .AnyAsync(t => t.UnitTypeID == request.UnitTypeID.Value, cancellationToken))
            return BadRequest(new { message = "Loại kho không hợp lệ." });
        if (request.UnitSizeID.HasValue && !await context.UnitSizes
                .AnyAsync(s => s.UnitSizeID == request.UnitSizeID.Value, cancellationToken))
            return BadRequest(new { message = "Kích thước kho không hợp lệ." });

        var lookups = await GetOrCreateUnitLookups(request, cancellationToken);
        var rate = lookups.unitType.UnitTypeID > 0 && lookups.unitSize.UnitSizeID > 0
            ? await context.RentalRates.FirstOrDefaultAsync(
                r => r.FacilityID == request.FacilityID &&
                    r.UnitTypeID == lookups.unitType.UnitTypeID &&
                    r.UnitSizeID == lookups.unitSize.UnitSizeID, cancellationToken)
            : null;
        unit.UnitType = lookups.unitType;
        unit.UnitSize = lookups.unitSize;
        unit.BasePrice = rate?.MonthlyPrice ?? request.BasePrice;
        unit.Status = persistedStatus;
        await context.SaveChangesAsync(cancellationToken);
        return Ok(new { unit.UnitID, unit.UnitNumber, unit.FacilityID, unit.BasePrice, unit.Status });
    }

    [HttpGet("reports")]
    public async Task<IActionResult> GetReports(CancellationToken cancellationToken)
    {
        var monthlyRevenue = await context.Payments
            .Where(p => p.PaymentStatus == "Completed")
            .GroupBy(p => new { p.PaymentDate.Year, p.PaymentDate.Month })
            .Select(group => new
            {
                year = group.Key.Year,
                month = group.Key.Month,
                receivedAmount = group.Sum(payment => payment.Amount)
            })
            .OrderBy(item => item.year)
            .ThenBy(item => item.month)
            .Take(12)
            .ToListAsync(cancellationToken);

        var facilities = await context.Facilities
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

        return Ok(new
        {
            totalRevenue = facilities.Sum(f => f.receivedRevenue),
            totalUnits = facilities.Sum(f => f.totalUnits),
            handedOverUnits = facilities.Sum(f => f.handedOverUnits),
            handedOverCount = facilities.Sum(f => f.handedOverCount),
            occupancyRate = facilities.Sum(f => f.totalUnits) == 0 ? 0m :
                decimal.Round((decimal)facilities.Sum(f => f.handedOverUnits) * 100m / facilities.Sum(f => f.totalUnits), 2),
            monthlyRevenue,
            facilities
        });
    }

    private static string NormalizeUnitStatus(string status) => status switch
    {
        "Available" => "AVAILABLE",
        "Reserved" => "RESERVED",
        "In Use" => "RENTED",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };

    private static string? ToPersistedUnitStatus(string status) => status.ToUpperInvariant() switch
    {
        "AVAILABLE" => "Available",
        "RESERVED" => "Reserved",
        "RENTED" or "IN_USE" => "In Use",
        "NEEDS_INSPECTION" or "MAINTENANCE" => "Maintenance",
        "INACTIVE" => "Inactive",
        _ => null
    };

    private static string NormalizeReservationStatus(string status) => status switch
    {
        "Pending Deposit" => "PENDING_PAYMENT",
        "Paid" => "PENDING_APPROVAL",
        "Confirmed" => "CONFIRMED",
        "Handed Over" => "HANDED_OVER",
        "Cancelled" => "CANCELLED",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };

    private async Task<(UnitType unitType, UnitSize unitSize)> GetOrCreateUnitLookups(
        CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var unitType = request.UnitTypeID.HasValue
            ? await context.UnitTypes.FirstOrDefaultAsync(
                t => t.UnitTypeID == request.UnitTypeID.Value, cancellationToken)
            : await context.UnitTypes.FirstOrDefaultAsync(
                t => t.TypeName == request.UnitType.Trim(), cancellationToken);
        if (unitType is null)
        {
            unitType = new UnitType { TypeName = request.UnitType.Trim() };
            context.UnitTypes.Add(unitType);
        }

        var unitSize = request.UnitSizeID.HasValue
            ? await context.UnitSizes.FirstOrDefaultAsync(
                s => s.UnitSizeID == request.UnitSizeID.Value, cancellationToken)
            : await context.UnitSizes.FirstOrDefaultAsync(
                s => s.Dimensions == request.Size.Trim(), cancellationToken);
        if (unitSize is null)
        {
            unitSize = new UnitSize
            {
                Dimensions = request.Size.Trim(),
                Volume = request.SizeM2
            };
            context.UnitSizes.Add(unitSize);
        }

        return (unitType, unitSize);
    }
}
