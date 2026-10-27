using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class HandoverService : IHandoverService
{
    private readonly IHandoverRepository _handoverRepository;

    public HandoverService(IHandoverRepository handoverRepository)
    {
        _handoverRepository = handoverRepository;
    }

    public async Task<HandoverServiceResponse> CompleteHandoverAsync(CompleteHandoverDTO request, string? staffEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(staffEmail))
            return new HandoverServiceResponse(false, "Không có quyền truy cập.", 401, null);

        var staff = await _handoverRepository.GetActiveStaffByEmailAsync(staffEmail, cancellationToken);
        if (staff == null) 
            return new HandoverServiceResponse(false, "Không tìm thấy nhân viên.", 404, null);

        // Bắt đầu Transaction
        return await _handoverRepository.ExecuteInTransactionAsync(async () =>
        {
            var reservation = await _handoverRepository.GetReservationForHandoverAsync(request.ReservationID, cancellationToken);

            if (reservation == null) 
                return new HandoverServiceResponse(false, "Không tìm thấy Reservation.", 404, null);
            if (reservation.Status != ReservationStatus.Confirmed)
                return new HandoverServiceResponse(false, "Chỉ có thể bàn giao đặt chỗ đã thanh toán và được phân kho.", 409, null);
            if (reservation.AssignedUnit == null || reservation.AssignedUnitID is not int assignedUnitId)
                return new HandoverServiceResponse(false, "Đặt chỗ chưa được phân kho.", 409, null);
            if (reservation.Payments.All(p => p.PaymentStatus != "Completed"))
                return new HandoverServiceResponse(false, "Hệ thống chưa ghi nhận thanh toán thành công.", 409, null);
            if (reservation.StartDate.Date > DateTime.Today)
                return new HandoverServiceResponse(false, "Chưa đến ngày hẹn nhận kho.", 409, null);
            if (reservation.Contract != null)
                return new HandoverServiceResponse(false, "Đặt chỗ này đã được bàn giao.", 409, null);

            var isAssignedStaff = await _handoverRepository.IsStaffAssignedToFacilityAsync(staff.UserID, reservation.FacilityID, cancellationToken);
            if (!isAssignedStaff)
                return new HandoverServiceResponse(false, "Không có quyền thao tác trên cơ sở này.", 403, null);

            var rentalDays = (reservation.EndDate.Date - reservation.StartDate.Date).Days + 1;
            var contractType = await _handoverRepository.GetContractTypeByDaysAsync(rentalDays, cancellationToken);
            if (contractType == null)
                return new HandoverServiceResponse(false, "Chưa cấu hình loại hợp đồng phù hợp với thời hạn thuê.", 409, null);

            var task = new HandoverTask
            {
                StaffID = staff.UserID,
                TaskType = "Move In",
                ScheduledDate = reservation.StartDate,
                ActualDate = DateTime.Today,
                UnitConditionNotes = request.Notes,
                Status = "Completed",
                ReservationID = reservation.ReservationID,
                CustomerID = reservation.CustomerID,
                UnitID = assignedUnitId
            };
            _handoverRepository.AddHandoverTask(task);

            reservation.Status = ReservationStatus.HandedOver;
            reservation.AssignedUnit.Status = UnitStatus.InUse;

            var contract = new Contract
            {
                ReservationID = reservation.ReservationID,
                ContractTypeID = contractType.ContractTypeID,
                StartDate = reservation.StartDate,
                EndDate = reservation.EndDate,
                DepositAmount = reservation.DepositAmount,
                TotalFee = reservation.TotalEstimatedCost.GetValueOrDefault(0m),
                ContractStatus = "Active"
            };
            _handoverRepository.AddContract(contract);

            var access = new UnitAccess
            {
                Contract = contract,
                UserID = reservation.CustomerID,
                UnitID = assignedUnitId,
                AccessType = request.AccessType,
                AccessValue = request.AccessValue,
                IssueDate = DateTime.Today,
                Status = "Active"
            };
            _handoverRepository.AddUnitAccess(access);

            await _handoverRepository.SaveChangesAsync(cancellationToken);

            var responseData = new
            {
                message = "Bàn giao thành công. Hợp đồng và thông tin truy cập đã được ghi nhận.",
                contractId = contract.ContractID,
                reservationStatus = reservation.Status,
                unitStatus = reservation.AssignedUnit.Status
            };

            return new HandoverServiceResponse(true, null, 200, responseData);
        }, cancellationToken);
    }
}