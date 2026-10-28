using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class FacilityManagementService : IFacilityManagementService
{
    private readonly IFacilityManagementRepository _repo;

    public FacilityManagementService(IFacilityManagementRepository repo)
    {
        _repo = repo;
    }

    public async Task<OperationsServiceResponse> AssignReservationAsync(
        int reservationId,
        AssignReservationDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var reservation = await _repo.GetReservationByIdAsync(reservationId, cancellationToken);
        if (reservation is null)
            return new OperationsServiceResponse(false, "Không tìm thấy đặt chỗ.", 404, null);

        if (!await CanManageFacilityAsync(reservation.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (reservation.Status != ReservationStatus.Paid)
            return new OperationsServiceResponse(false, "Chỉ đặt chỗ đã thanh toán mới được phân kho.", 409, null);

        var unit = await _repo.GetUnitByNumberAndFacilityAsync(request.UnitNumber, reservation.FacilityID, cancellationToken);
        if (unit is null)
            return new OperationsServiceResponse(false, "Kho không thuộc cơ sở đã đặt.", 400, null);

        var matchingItem = reservation.ReservationItems.FirstOrDefault(
            ri => ri.UnitTypeID == unit.UnitTypeID && ri.UnitSizeID == unit.UnitSizeID)
            ?? reservation.ReservationItems.FirstOrDefault();

        if (matchingItem is null || matchingItem.UnitTypeID != unit.UnitTypeID || matchingItem.UnitSizeID != unit.UnitSizeID)
            return new OperationsServiceResponse(false, "Kho không thuộc loại hoặc size đã đặt.", 400, null);

        if (unit.Status is UnitStatus.Maintenance or UnitStatus.Inactive)
            return new OperationsServiceResponse(false, "Kho hiện không khả dụng.", 409, null);

        var managerUser = string.IsNullOrWhiteSpace(userEmail)
            ? null
            : await _repo.GetActiveUserByEmailAsync(userEmail, cancellationToken);

        return await _repo.ExecuteInTransactionAsync(async () =>
        {
            var hasConflict = await _repo.HasConflictingReservationForUnitAsync(
                reservationId,
                unit.UnitID,
                reservation.StartDate,
                reservation.EndDate,
                cancellationToken);
            if (hasConflict)
                return new OperationsServiceResponse(false, "Kho đã được đặt trong kỳ thuê này.", 409, null);

            var now = DateTime.UtcNow;
            var activeHold = reservation.ReservationUnits.FirstOrDefault(
                ru => ru.ReservationItemID == matchingItem.ReservationItemID && ru.Status != "Released");

            // Theo TR_ReservationUnit_Validate: đổi kho = Released dòng cũ + thêm dòng mới
            if (activeHold != null && activeHold.UnitID != unit.UnitID)
            {
                activeHold.Status = "Released";
                activeHold.ReleasedAt = now;
                await _repo.SaveChangesAsync(cancellationToken);

                _repo.AddReservationUnit(new ReservationUnit
                {
                    ReservationID = reservation.ReservationID,
                    ReservationItemID = matchingItem.ReservationItemID,
                    FacilityID = reservation.FacilityID,
                    UnitID = unit.UnitID,
                    UnitTypeID = unit.UnitTypeID,
                    UnitSizeID = unit.UnitSizeID,
                    Status = "Held",
                    AssignedAt = now,
                    AssignedByUserID = managerUser?.UserID
                });
                await _repo.SaveChangesAsync(cancellationToken);
            }
            else if (activeHold == null)
            {
                _repo.AddReservationUnit(new ReservationUnit
                {
                    ReservationID = reservation.ReservationID,
                    ReservationItemID = matchingItem.ReservationItemID,
                    FacilityID = reservation.FacilityID,
                    UnitID = unit.UnitID,
                    UnitTypeID = unit.UnitTypeID,
                    UnitSizeID = unit.UnitSizeID,
                    Status = "Held",
                    AssignedAt = now,
                    AssignedByUserID = managerUser?.UserID
                });
                await _repo.SaveChangesAsync(cancellationToken);
            }

            reservation.Status = ReservationStatus.Confirmed;
            reservation.ConfirmedAt = now;
            reservation.ConfirmedByUserID = managerUser?.UserID;

            await _repo.SaveChangesAsync(cancellationToken);

            return new OperationsServiceResponse(true, null, 200, new
            {
                reservationId,
                unitNumber = unit.UnitNumber,
                status = reservation.Status,
                message = "Đã phân kho cho đặt chỗ."
            });
        }, cancellationToken);
    }

    public async Task<OperationsServiceResponse> UpdatePolicyAsync(
        int facilityId,
        UpdateRentalPolicyDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        byte depositMonths = request.DepositPercent <= 1 ? (byte)1 : (byte)2;

        var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facilityId, cancellationToken);
        if (policy is null)
        {
            policy = new RentalPolicy { FacilityID = facilityId, DepositMonths = depositMonths };
            _repo.AddRentalPolicy(policy);
        }
        else
        {
            policy.DepositMonths = depositMonths;
            policy.UpdatedAt = DateTime.UtcNow;
        }

        await _repo.SaveChangesAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 200, new { facilityId, depositPercent = (decimal)policy.DepositMonths, depositMonths = policy.DepositMonths });
    }

    public async Task<OperationsServiceResponse> CreateFacilityAsync(
        CreateFacilityDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (string.IsNullOrWhiteSpace(request.FacilityName) ||
            string.IsNullOrWhiteSpace(request.Address) ||
            string.IsNullOrWhiteSpace(request.ManagerEmail))
            return new OperationsServiceResponse(false, "Tên, địa chỉ và Facility Manager là bắt buộc.", 400, null);

        if (string.IsNullOrWhiteSpace(request.UnitCodePrefix) ||
            request.UnitCodePrefix.Length > 10 ||
            request.UnitCodePrefix.Any(character => !char.IsAsciiLetterOrDigit(character)))
            return new OperationsServiceResponse(false, "Mã chi nhánh chỉ được gồm tối đa 10 chữ cái hoặc chữ số.", 400, null);

        if (!string.Equals(request.Status, "active", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase))
            return new OperationsServiceResponse(false, "Trạng thái cơ sở không hợp lệ.", 400, null);

        var facilityName = request.FacilityName.Trim();
        var unitCodePrefix = request.UnitCodePrefix.Trim().ToUpperInvariant();
        var address = request.Address.Trim();

        if (await _repo.UnitCodePrefixExistsAsync(unitCodePrefix, cancellationToken))
            return new OperationsServiceResponse(false, "Mã chi nhánh đã được sử dụng.", 409, null);

        if (await _repo.FacilityNameExistsAsync(facilityName, cancellationToken))
            return new OperationsServiceResponse(false, "Tên cơ sở đã tồn tại.", 409, null);

        var manager = await _repo.GetActiveUserByEmailAndRoleAsync(request.ManagerEmail, 3, cancellationToken);
        if (manager is null)
            return new OperationsServiceResponse(false, "Cần chỉ định tài khoản Facility Manager hợp lệ.", 400, null);

        var facility = new Facility
        {
            ManagerID = manager.UserID,
            FacilityName = facilityName,
            UnitCodePrefix = unitCodePrefix,
            ContactPhone = request.ContactPhone?.Trim(),
            Status = string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active",
            CreatedAt = DateTime.UtcNow
        };
        facility.ApplyAddressString(address);

        // Trigger TR_Facility_CreateDefaultPolicy tự động tạo RentalPolicy và CancellationRule cho cơ sở mới
        _repo.AddFacility(facility);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 201, new
        {
            facilityId = facility.FacilityID,
            name = facility.FacilityName,
            unitCodePrefix = facility.UnitCodePrefix,
            address = facility.Address,
            managerEmail = manager.Email,
            depositPercent = 2m
        });
    }

    public async Task<OperationsServiceResponse> DeleteFacilityAsync(
        int facilityId,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var facility = await _repo.GetFacilityByIdAsync(facilityId, cancellationToken);
        if (facility is null)
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if (await _repo.FacilityHasDependenciesAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(
                false,
                "Không thể xóa cơ sở đã có kho, đặt chỗ hoặc nhân viên được phân công. Hãy chuyển cơ sở sang trạng thái tạm ngưng.",
                409,
                null);

        var rates = await _repo.GetRentalRatesByFacilityIdAsync(facilityId, cancellationToken);
        var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facilityId, cancellationToken);

        _repo.RemoveRentalRates(rates);
        await _repo.RemoveFacilityCatalogLinksAsync(facilityId, cancellationToken);
        if (policy is not null)
            _repo.RemoveRentalPolicy(policy);
        _repo.RemoveFacility(facility);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 204, null);
    }

    public async Task<OperationsServiceResponse> UpdateFacilityAsync(
        int facilityId,
        UpdateFacilityDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var facility = await _repo.GetFacilityByIdAsync(facilityId, cancellationToken);
        if (facility is null)
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if ((request.FacilityName is not null && string.IsNullOrWhiteSpace(request.FacilityName)) ||
            (request.Address is not null && string.IsNullOrWhiteSpace(request.Address)) ||
            (request.ManagerEmail is not null && string.IsNullOrWhiteSpace(request.ManagerEmail)))
            return new OperationsServiceResponse(false, "Tên, địa chỉ và Facility Manager không được để trống.", 400, null);

        if (request.Status is not null &&
            !request.Status.Equals("active", StringComparison.OrdinalIgnoreCase) &&
            !request.Status.Equals("inactive", StringComparison.OrdinalIgnoreCase))
            return new OperationsServiceResponse(false, "Trạng thái cơ sở không hợp lệ.", 400, null);

        if (request.ManagerEmail is not null)
        {
            var manager = await _repo.GetActiveUserByEmailAndRoleAsync(request.ManagerEmail, 3, cancellationToken);
            if (manager is null)
                return new OperationsServiceResponse(false, "Cần chỉ định tài khoản Facility Manager hợp lệ.", 400, null);
            facility.ManagerID = manager.UserID;
        }

        if (request.FacilityName is not null)
            facility.FacilityName = request.FacilityName.Trim();
        if (request.Address is not null)
            facility.ApplyAddressString(request.Address.Trim());
        if (request.Status is not null)
            facility.Status = string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active";

        facility.UpdatedAt = DateTime.UtcNow;
        await _repo.SaveChangesAsync(cancellationToken);

        var managerEmail = request.ManagerEmail ?? await _repo.GetUserEmailByIdAsync(facility.ManagerID, cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            facilityId = facility.FacilityID,
            name = facility.FacilityName,
            address = facility.Address,
            managerEmail,
            status = facility.Status
        });
    }

    public async Task<OperationsServiceResponse> AssignStaffAsync(
        int facilityId,
        AssignFacilityStaffDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(facilityId, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var staffUser = await _repo.GetActiveUserByEmailAndRoleAsync(request.StaffEmail, 2, cancellationToken);
        if (staffUser is null)
            return new OperationsServiceResponse(false, "Không tìm thấy tài khoản Facility Staff hợp lệ.", 400, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        var assignment = await _repo.GetFacilityStaffAssignmentAsync(facilityId, staffUser.UserID, cancellationToken);
        if (assignment is null)
        {
            assignment = new FacilityStaff
            {
                FacilityID = facilityId,
                UserID = staffUser.UserID,
                AssignedDate = DateTime.Today,
                Status = "Active"
            };
            _repo.AddFacilityStaff(assignment);
        }
        else
        {
            assignment.Status = "Active";
        }

        await _repo.SaveChangesAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 200, new
        {
            StaffID = assignment.AssignmentID,
            assignment.AssignmentID,
            assignment.FacilityID,
            assignment.UserID,
            assignment.Status
        });
    }

    public async Task<OperationsServiceResponse> CreateUnitAsync(
        CreateStorageUnitDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(request.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.IsFacilityActiveAsync(request.FacilityID, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ có thể thêm kho cho cơ sở đang hoạt động.", 400, null);

        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return new OperationsServiceResponse(false, "Trạng thái kho không hợp lệ.", 400, null);

        if (request.UnitTypeID.HasValue && !await _repo.UnitTypeExistsAsync(request.UnitTypeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Loại kho không hợp lệ.", 400, null);

        if (request.UnitSizeID.HasValue && !await _repo.UnitSizeExistsAsync(request.UnitSizeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Kích thước kho không hợp lệ.", 400, null);

        return await _repo.ExecuteInTransactionAsync(async () =>
        {
            var facility = await _repo.GetFacilityByIdAsync(request.FacilityID, cancellationToken);
            if (facility is null)
                return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

            var lookups = await _repo.GetOrCreateUnitLookupsAsync(request, cancellationToken);
            await _repo.EnsureFacilityCatalogLinksAsync(
                request.FacilityID,
                lookups.unitType.UnitTypeID,
                lookups.unitSize.UnitSizeID,
                cancellationToken);

            var rate = await _repo.GetRentalRateAsync(
                request.FacilityID,
                lookups.unitType.UnitTypeID,
                lookups.unitSize.UnitSizeID,
                cancellationToken);

            if (rate is null)
            {
                var minPrice = lookups.unitSize.SizeCategory?.MinMonthlyPrice ?? 400000m;
                var maxPrice = lookups.unitSize.SizeCategory?.MaxMonthlyPrice ?? 3500000m;
                var monthlyPrice = Math.Clamp(request.BasePrice, minPrice, maxPrice);

                rate = new RentalRate
                {
                    FacilityID = request.FacilityID,
                    UnitTypeID = lookups.unitType.UnitTypeID,
                    UnitSizeID = lookups.unitSize.UnitSizeID,
                    MonthlyPrice = monthlyPrice
                };
                _repo.AddRentalRate(rate);
                await _repo.SaveChangesAsync(cancellationToken);
            }

            var unitCodePrefix = facility.UnitCodePrefix.Trim().ToUpperInvariant();
            var existingUnitNumbers = await _repo.GetUnitNumbersByFacilityAsync(request.FacilityID, cancellationToken);
            var codePrefix = $"{unitCodePrefix}-U";
            var nextUnitNumber = existingUnitNumbers
                .Where(unitNumber => unitNumber.StartsWith(codePrefix, StringComparison.OrdinalIgnoreCase))
                .Select(unitNumber => int.TryParse(unitNumber[codePrefix.Length..], out var number) ? number : 0)
                .DefaultIfEmpty()
                .Max() + 1;
            var unitNumber = $"{codePrefix}{nextUnitNumber:D2}";

            var unit = new StorageUnit
            {
                FacilityID = request.FacilityID,
                UnitTypeID = lookups.unitType.UnitTypeID,
                UnitSizeID = lookups.unitSize.UnitSizeID,
                UnitNumber = unitNumber,
                Status = persistedStatus,
                CreatedAt = DateTime.UtcNow
            };
            _repo.AddStorageUnit(unit);
            await _repo.SaveChangesAsync(cancellationToken);

            return new OperationsServiceResponse(true, null, 201, new
            {
                unit.UnitID,
                unit.UnitNumber,
                unitCode = unit.UnitNumber,
                unit.FacilityID,
                BasePrice = rate.MonthlyPrice,
                unit.Status
            });
        }, cancellationToken);
    }

    public async Task<OperationsServiceResponse> UpdateRentalRateAsync(
        int facilityId,
        UpdateRentalRateDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if (!await _repo.UnitTypeExistsAsync(request.UnitTypeID, cancellationToken) ||
            !await _repo.UnitSizeExistsAsync(request.UnitSizeID, cancellationToken))
            return new OperationsServiceResponse(false, "Loại hoặc kích thước kho không hợp lệ.", 400, null);

        await _repo.EnsureFacilityCatalogLinksAsync(facilityId, request.UnitTypeID, request.UnitSizeID, cancellationToken);

        var rate = await _repo.GetRentalRateAsync(facilityId, request.UnitTypeID, request.UnitSizeID, cancellationToken);
        if (rate is null)
        {
            rate = new RentalRate
            {
                FacilityID = facilityId,
                UnitTypeID = request.UnitTypeID,
                UnitSizeID = request.UnitSizeID,
                MonthlyPrice = request.BasePrice,
                UpdatedAt = DateTime.UtcNow
            };
            _repo.AddRentalRate(rate);
        }
        else
        {
            rate.MonthlyPrice = request.BasePrice;
            rate.UpdatedAt = DateTime.UtcNow;
        }

        var matchingUnits = await _repo.GetUnitsByFacilityTypeAndSizeAsync(
            facilityId,
            request.UnitTypeID,
            request.UnitSizeID,
            cancellationToken);

        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            facilityId,
            request.UnitTypeID,
            request.UnitSizeID,
            request.BasePrice,
            updatedUnitCount = matchingUnits.Count
        });
    }

    public async Task<OperationsServiceResponse> DeleteRentalRateAsync(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var rate = await _repo.GetRentalRateAsync(facilityId, unitTypeId, unitSizeId, cancellationToken);
        if (rate is null)
            return new OperationsServiceResponse(false, "Không tìm thấy mức giá.", 404, null);

        if (await _repo.AnyUnitUsesRateAsync(facilityId, unitTypeId, unitSizeId, cancellationToken))
            return new OperationsServiceResponse(false, "Không thể xóa mức giá đang được kho hiện hữu sử dụng.", 409, null);

        _repo.RemoveRentalRate(rate);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 204, null);
    }

    public async Task<OperationsServiceResponse> UpdateUnitAsync(
        string unitNumber,
        CreateStorageUnitDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(request.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var unit = await _repo.GetUnitByNumberAndFacilityAsync(unitNumber, request.FacilityID, cancellationToken);
        if (unit is null)
            return new OperationsServiceResponse(false, "Không tìm thấy kho tại cơ sở.", 404, null);

        if (await _repo.HasActiveBookingHoldForUnitAsync(unit.UnitID, DateTime.UtcNow, cancellationToken))
            return new OperationsServiceResponse(false, "Không thể chỉnh sửa kho đang được giữ để thanh toán.", 409, null);

        if (request.UnitTypeID is null || request.UnitSizeID is null)
            return new OperationsServiceResponse(false, "Cần chọn loại và size kho hợp lệ.", 400, null);

        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return new OperationsServiceResponse(false, "Trạng thái kho không hợp lệ.", 400, null);

        if (!await _repo.UnitTypeExistsAsync(request.UnitTypeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Loại kho không hợp lệ.", 400, null);

        if (!await _repo.UnitSizeExistsAsync(request.UnitSizeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Kích thước kho không hợp lệ.", 400, null);

        var lookups = await _repo.GetOrCreateUnitLookupsAsync(request, cancellationToken);
        await _repo.EnsureFacilityCatalogLinksAsync(
            request.FacilityID,
            lookups.unitType.UnitTypeID,
            lookups.unitSize.UnitSizeID,
            cancellationToken);

        var rate = await _repo.GetRentalRateAsync(
            request.FacilityID,
            lookups.unitType.UnitTypeID,
            lookups.unitSize.UnitSizeID,
            cancellationToken);

        if (rate is null)
        {
            var minPrice = lookups.unitSize.SizeCategory?.MinMonthlyPrice ?? 400000m;
            var maxPrice = lookups.unitSize.SizeCategory?.MaxMonthlyPrice ?? 3500000m;
            rate = new RentalRate
            {
                FacilityID = request.FacilityID,
                UnitTypeID = lookups.unitType.UnitTypeID,
                UnitSizeID = lookups.unitSize.UnitSizeID,
                MonthlyPrice = Math.Clamp(request.BasePrice, minPrice, maxPrice)
            };
            _repo.AddRentalRate(rate);
            await _repo.SaveChangesAsync(cancellationToken);
        }

        unit.UnitTypeID = lookups.unitType.UnitTypeID;
        unit.UnitSizeID = lookups.unitSize.UnitSizeID;
        unit.Status = persistedStatus;
        unit.UpdatedAt = DateTime.UtcNow;

        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            unit.UnitID,
            unit.UnitNumber,
            unit.FacilityID,
            BasePrice = rate.MonthlyPrice,
            unit.Status
        });
    }

    private async Task<bool> IsBusinessOperationsManagerAsync(string? email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        return user is not null && user.RoleID == 4;
    }

    private async Task<bool> CanManageFacilityAsync(int facilityId, string? email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        if (user is null)
            return false;

        if (user.RoleID == 4)
            return true;

        if (user.RoleID == 3)
            return await _repo.IsFacilityManagerAsync(facilityId, user.UserID, cancellationToken);

        return false;
    }

    private static string? ToPersistedUnitStatus(string status) => status.ToUpperInvariant() switch
    {
        "AVAILABLE" => UnitStatus.Available,
        "RESERVED" => UnitStatus.Available,
        "RENTED" or "IN_USE" => UnitStatus.InUse,
        "PENDING_INSPECTION" => UnitStatus.PendingInspection,
        "NEEDS_INSPECTION" or "MAINTENANCE" => UnitStatus.Maintenance,
        "INACTIVE" => UnitStatus.Inactive,
        _ => null
    };
}
