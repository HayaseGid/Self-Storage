using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class ReservationService : IReservationService
{
    private const int DepositHoldMinutes = 10;
    private readonly IReservationRepository _reservationRepository;

    public ReservationService(IReservationRepository reservationRepository)
    {
        _reservationRepository = reservationRepository;
    }

    public async Task<ReservationServiceResponse> CreateReservationAsync(CreateReservationDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (request.Months is < 1 or > 12)
            return new ReservationServiceResponse(false, "Thời gian thuê phải từ 1 đến 12 tháng.", 400, null);

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

        var endDate = startDate.AddMonths(request.Months).AddDays(-1);
        var now = DateTime.UtcNow;

        return await _reservationRepository.ExecuteInTransactionAsync(async () =>
        {
            await _reservationRepository.ReleaseExpiredReservationsAsync(now, cancellationToken);

            var facilityIsActive = await _reservationRepository.IsFacilityActiveAsync(unit.FacilityID, cancellationToken);
            if (!facilityIsActive)
                return new ReservationServiceResponse(false, "Cơ sở hiện không nhận đặt chỗ mới.", 409, null);

            var hasConflict = await _reservationRepository.HasConflictingReservationsAsync(unit.UnitID, startDate, endDate, now, cancellationToken);
            if (hasConflict)
                return new ReservationServiceResponse(false, "Kho đang được giữ để thanh toán hoặc đã có đặt chỗ trùng kỳ thuê.", 409, null);

            if (unit.Status == UnitStatus.Booking)
                return new ReservationServiceResponse(false, "Kho đang được giữ để thanh toán. Vui lòng chọn kho khác.", 409, null);

            if (unit.Status is not (UnitStatus.Available or UnitStatus.Reserved or UnitStatus.InUse))
                return new ReservationServiceResponse(false, "Kho hiện không được phép cho thuê.", 409, null);

            var depositPercent = await _reservationRepository.GetFacilityDepositPercentAsync(unit.FacilityID, cancellationToken);
            var rent = decimal.Round(unit.BasePrice * request.Months, 2, MidpointRounding.AwayFromZero);
            var deposit = decimal.Round(rent * depositPercent / 100m, 2, MidpointRounding.AwayFromZero);
            
            var reservation = new Reservation
            {
                CustomerID = customer.UserID,
                FacilityID = unit.FacilityID,
                UnitTypeID = unit.UnitTypeID,
                AssignedUnitID = unit.UnitID,
                StartDate = startDate,
                RentalPeriod = request.Months,
                EndDate = endDate,
                TotalEstimatedCost = rent,
                DepositAmount = deposit,
                DepositExpiresAt = now.AddMinutes(DepositHoldMinutes),
                Status = ReservationStatus.PendingDeposit
            };

            unit.StatusBeforeBooking = unit.Status;
            unit.Status = UnitStatus.Booking;
            
            _reservationRepository.AddReservation(reservation);
            await _reservationRepository.SaveChangesAsync(cancellationToken);

            var responseData = new
            {
                message = "Đặt kho thành công, đang chờ thanh toán tiền cọc.",
                reservationId = reservation.ReservationID,
                monthlyPrice = unit.BasePrice,
                rentalAmount = rent,
                depositAmount = deposit,
                totalAmount = rent + deposit,
                depositExpiresAt = reservation.DepositExpiresAt,
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

        var responseData = new
        {
            reservationId = r.ReservationID,
            customerEmail = r.Customer.Email,
            facilityId = r.FacilityID,
            unitNumber = r.AssignedUnit?.UnitNumber,
            startDate = r.StartDate,
            endDate = r.EndDate,
            months = r.RentalPeriod,
            rentalAmount = r.TotalEstimatedCost,
            depositAmount = r.DepositAmount,
            status = r.Status == ReservationStatus.PendingDeposit && r.DepositExpiresAt <= now
                ? ReservationStatus.Expired
                : r.Status,
            depositExpiresAt = r.DepositExpiresAt
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
            return new
            {
                reservationId = r.ReservationID,
                facility = r.Facility.FacilityName,
                unitNumber = r.AssignedUnit?.UnitNumber,
                unitType = r.UnitType.TypeName,
                startDate = r.StartDate,
                endDate = r.EndDate,
                months = r.RentalPeriod,
                rentalAmount = r.TotalEstimatedCost,
                monthlyPrice = r.RentalPeriod > 0 && r.TotalEstimatedCost.HasValue
                    ? r.TotalEstimatedCost.Value / r.RentalPeriod
                    : 0m,
                depositAmount = r.DepositAmount,
                status = r.Status == ReservationStatus.PendingDeposit && r.DepositExpiresAt <= now
                    ? ReservationStatus.Expired
                    : r.Status,
                depositExpiresAt = r.DepositExpiresAt,
                paymentStatus = latestPayment?.PaymentStatus,
                paymentReference = latestPayment?.TransactionReference,
                paymentAmount = (decimal?)latestPayment?.Amount,
                paymentDate = (DateTime?)latestPayment?.PaymentDate,
                contractId = r.Contract?.ContractID,
                contractStatus = r.Contract?.ContractStatus,
                accessType = r.Contract?.UnitAccesses.FirstOrDefault()?.AccessType,
                accessValue = r.Contract?.UnitAccesses.FirstOrDefault()?.AccessValue,
                size = r.AssignedUnit?.UnitSize.Dimensions
            };
        }).ToList();

        return new ReservationServiceResponse(true, null, 200, responseData);
    }
}