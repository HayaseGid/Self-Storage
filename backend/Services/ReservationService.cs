using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class ReservationService : IReservationService
{
    private readonly IReservationRepository _reservationRepository;

    public ReservationService(IReservationRepository reservationRepository)
    {
        _reservationRepository = reservationRepository;
    }

    public async Task<ReservationServiceResponse> CreateReservationAsync(CreateReservationDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (request.Months is not (1 or 3 or 6 or 12))
            return new ReservationServiceResponse(false, "Thời hạn thuê chỉ được chọn 1, 3, 6 hoặc 12 tháng.", 400, null);

        if (string.IsNullOrWhiteSpace(userEmail))
            return new ReservationServiceResponse(false, null, 401, null);

        var customer = await _reservationRepository.GetActiveCustomerByEmailAsync(userEmail, cancellationToken);
        if (customer == null) 
            return new ReservationServiceResponse(false, "Không tìm thấy tài khoản khách hàng.", 404, null);

        var startDate = request.StartDate.Date;
        if (startDate < DateTime.Today)
            return new ReservationServiceResponse(false, "Ngày bắt đầu thuê không được ở trong quá khứ.", 400, null);

        var unit = await _reservationRepository.GetStorageUnitWithTypeAsync(request.UnitID, request.UnitNumber, cancellationToken);
        if (unit == null) 
            return new ReservationServiceResponse(false, "Không tìm thấy kho.", 404, null);

        if (unit.RentalRate == null)
            return new ReservationServiceResponse(false, "Kho chưa được cấu hình giá thuê tại cơ sở này.", 409, null);

        var endDate = startDate.AddMonths(request.Months).AddDays(-1);
        var now = DateTime.UtcNow;

        return await _reservationRepository.ExecuteInTransactionAsync(async () =>
        {
            await _reservationRepository.ReleaseExpiredReservationsAsync(now, cancellationToken);

            var facilityIsActive = await _reservationRepository.IsFacilityActiveAsync(unit.FacilityID, cancellationToken);
            if (!facilityIsActive)
                return new ReservationServiceResponse(false, "Cơ sở hiện không nhận đặt chỗ mới.", 409, null);

            if (unit.Status is UnitStatus.Maintenance or UnitStatus.Inactive)
                return new ReservationServiceResponse(false, "Kho đang bảo trì hoặc ngừng hoạt động.", 409, null);

            var hasConflict = await _reservationRepository.HasConflictingReservationsAsync(unit.UnitID, startDate, endDate, now, cancellationToken);
            if (hasConflict)
                return new ReservationServiceResponse(false, "Kho đang được giữ để thanh toán hoặc đã có đặt chỗ trùng kỳ thuê.", 409, null);

            var (depositMonths, holdMinutes, discountRate) = await _reservationRepository.GetReservationPolicyAndDiscountAsync(
                unit.FacilityID, request.Months, cancellationToken);

            var monthlyPrice = unit.RentalRate.MonthlyPrice;
            var effectiveMonthlyPrice = decimal.Round(monthlyPrice * (100m - discountRate) / 100m, 0, MidpointRounding.AwayFromZero);
            var rent = effectiveMonthlyPrice * request.Months;
            var deposit = effectiveMonthlyPrice * depositMonths;

            var reservationCode = $"RS-{now:yyyy}-{Random.Shared.Next(10000, 99999)}";

            var reservation = new Reservation
            {
                ReservationCode = reservationCode,
                CheckInToken = Guid.NewGuid(),
                CustomerID = customer.UserID,
                FacilityID = unit.FacilityID,
                StartDate = startDate,
                RentalPeriod = request.Months,
                EndDate = endDate,
                DepositMonths = depositMonths,
                HoldExpiresAt = now.AddMinutes(holdMinutes),
                AppointmentDate = startDate,
                AppointmentTime = new TimeSpan(9, 0, 0),
                Status = ReservationStatus.PendingPayment,
                CreatedAt = now
            };

            var reservationItem = new ReservationItem
            {
                Reservation = reservation,
                FacilityID = unit.FacilityID,
                UnitTypeID = unit.UnitTypeID,
                UnitSizeID = unit.UnitSizeID,
                Quantity = 1,
                MonthlyPrice = monthlyPrice,
                DiscountPercent = discountRate,
                CreatedAt = now
            };
            reservation.ReservationItems.Add(reservationItem);

            var reservationUnit = new ReservationUnit
            {
                Reservation = reservation,
                ReservationItem = reservationItem,
                FacilityID = unit.FacilityID,
                UnitID = unit.UnitID,
                UnitTypeID = unit.UnitTypeID,
                UnitSizeID = unit.UnitSizeID,
                Status = "Held",
                AssignedAt = now
            };
            reservationItem.ReservationUnits.Add(reservationUnit);
            reservation.ReservationUnits.Add(reservationUnit);

            // Tạo khoản cọc (Deposit)
            reservation.Charges.Add(new Charge
            {
                Reservation = reservation,
                ReservationUnit = reservationUnit,
                ChargeType = "Deposit",
                Description = $"Tiền cọc {depositMonths} tháng - kho {unit.UnitNumber}",
                Amount = deposit,
                DueDate = now.Date,
                Status = "Unpaid",
                CreatedAt = now
            });

            // Tạo các khoản tiền thuê từng tháng (Rent)
            for (var m = 0; m < request.Months; m++)
            {
                var periodStart = startDate.AddMonths(m);
                var periodEnd = startDate.AddMonths(m + 1).AddDays(-1);
                reservation.Charges.Add(new Charge
                {
                    Reservation = reservation,
                    ReservationUnit = reservationUnit,
                    ChargeType = "Rent",
                    Description = $"Tiền thuê tháng {m + 1} - kho {unit.UnitNumber}",
                    PeriodStart = periodStart,
                    PeriodEnd = periodEnd,
                    Amount = effectiveMonthlyPrice,
                    DueDate = m == 0 ? now.Date : periodStart,
                    Status = "Unpaid",
                    CreatedAt = now
                });
            }

            _reservationRepository.AddReservation(reservation);
            await _reservationRepository.SaveChangesAsync(cancellationToken);

            var responseData = new
            {
                message = "Đặt kho thành công, đang chờ thanh toán tiền cọc.",
                reservationId = reservation.ReservationID,
                reservationCode = reservation.ReservationCode,
                monthlyPrice = effectiveMonthlyPrice,
                rentalAmount = rent,
                depositAmount = deposit,
                totalAmount = rent + deposit,
                depositExpiresAt = reservation.HoldExpiresAt,
                startDate = reservation.StartDate,
                endDate = reservation.EndDate
            };

            return new ReservationServiceResponse(true, null, 201, responseData);
        }, cancellationToken);
    }

    public async Task<ReservationServiceResponse> GetByIdAsync(int id, string? userEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
            return new ReservationServiceResponse(false, null, 401, null);

        var customer = await _reservationRepository.GetActiveCustomerByEmailAsync(userEmail, cancellationToken);
        if (customer == null)
            return new ReservationServiceResponse(false, null, 401, null);

        var now = DateTime.UtcNow;
        await _reservationRepository.ReleaseExpiredReservationsAsync(now, cancellationToken);

        var r = await _reservationRepository.GetReservationByIdAndCustomerAsync(id, customer.UserID, cancellationToken);
        if (r == null) return new ReservationServiceResponse(false, null, 404, null);

        var monthlyTotal = r.ReservationItems.Sum(i =>
            i.Quantity * (i.EffectiveMonthlyPrice ?? decimal.Round(i.MonthlyPrice * (100m - i.DiscountPercent) / 100m, 0)));
        var rentalAmount = monthlyTotal * r.RentalPeriod;
        var depositAmount = monthlyTotal * r.DepositMonths;
        var activeUnit = r.ReservationUnits.FirstOrDefault(ru => ru.Status != "Released")?.Unit;

        var responseData = new
        {
            reservationId = r.ReservationID,
            reservationCode = r.ReservationCode,
            customerEmail = r.Customer.Email,
            facilityId = r.FacilityID,
            unitNumber = activeUnit?.UnitNumber,
            startDate = r.StartDate,
            endDate = r.EndDate,
            months = r.RentalPeriod,
            rentalAmount,
            depositAmount,
            status = r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now
                ? ReservationStatus.Expired
                : r.Status,
            depositExpiresAt = r.HoldExpiresAt
        };

        return new ReservationServiceResponse(true, null, 200, responseData);
    }

    public async Task<ReservationServiceResponse> GetForCustomerAsync(string pathEmail, string? userEmail, CancellationToken cancellationToken)
    {
        if (!string.Equals(userEmail, pathEmail, StringComparison.OrdinalIgnoreCase))
            return new ReservationServiceResponse(false, null, 403, null);

        var customer = await _reservationRepository.GetActiveCustomerByEmailAsync(pathEmail, cancellationToken);
        if (customer == null)
            return new ReservationServiceResponse(false, null, 401, null);

        var now = DateTime.UtcNow;
        await _reservationRepository.ReleaseExpiredReservationsAsync(now, cancellationToken);

        var reservations = await _reservationRepository.GetCustomerReservationsAsync(pathEmail, cancellationToken);

        var responseData = reservations.Select(r =>
        {
            var latestPayment = r.Payments.OrderByDescending(p => p.PaymentID).FirstOrDefault();
            var monthlyTotal = r.ReservationItems.Sum(i =>
                i.Quantity * (i.EffectiveMonthlyPrice ?? decimal.Round(i.MonthlyPrice * (100m - i.DiscountPercent) / 100m, 0)));
            var rentalAmount = monthlyTotal * r.RentalPeriod;
            var depositAmount = monthlyTotal * r.DepositMonths;
            var activeUnit = r.ReservationUnits.FirstOrDefault(ru => ru.Status != "Released")?.Unit;
            var firstItem = r.ReservationItems.FirstOrDefault();
            var activeAccess = r.UnitAccesses.FirstOrDefault(a => a.Status == "Active") ?? r.UnitAccesses.FirstOrDefault();

            return new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                facility = r.Facility.FacilityName,
                unitNumber = activeUnit?.UnitNumber,
                unitType = activeUnit?.UnitType?.TypeName ?? firstItem?.UnitType?.TypeName,
                startDate = r.StartDate,
                endDate = r.EndDate,
                months = r.RentalPeriod,
                rentalAmount,
                monthlyPrice = monthlyTotal,
                depositAmount,
                status = r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now
                    ? ReservationStatus.Expired
                    : r.Status,
                depositExpiresAt = r.HoldExpiresAt,
                paymentStatus = latestPayment?.Status,
                paymentReference = latestPayment?.ProviderTransactionId ?? latestPayment?.OrderCode,
                paymentAmount = (decimal?)latestPayment?.Amount,
                paymentDate = latestPayment?.ConfirmedAt ?? (DateTime?)latestPayment?.CreatedAt,
                contractId = r.Contract?.ContractID,
                contractStatus = r.Contract?.ContractStatus,
                accessType = activeAccess?.AccessType,
                accessValue = activeAccess?.AccessValue,
                size = activeUnit != null
                    ? $"{activeUnit.UnitSize.SizeCode}: {activeUnit.UnitSize.DisplayName}"
                    : firstItem?.UnitSize != null
                        ? $"{firstItem.UnitSize.SizeCode}: {firstItem.UnitSize.DisplayName}"
                        : null
            };
        }).ToList();

        return new ReservationServiceResponse(true, null, 200, responseData);
    }
}
