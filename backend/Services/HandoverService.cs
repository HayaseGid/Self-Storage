using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class HandoverService : IHandoverService
{
    private static readonly HashSet<string> ValidAccessTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Smart Lock", "PIN Code", "Key", "Access Card", "QR"
    };

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

        return await _handoverRepository.ExecuteInTransactionAsync(async () =>
        {
            var reservation = await _handoverRepository.GetReservationForHandoverAsync(request.ReservationID, cancellationToken);

            if (reservation == null) 
                return new HandoverServiceResponse(false, "Không tìm thấy Reservation.", 404, null);
            if (reservation.Status != ReservationStatus.Confirmed)
                return new HandoverServiceResponse(false, "Chỉ có thể bàn giao đặt chỗ đã thanh toán và được phân kho.", 409, null);

            var activeReservationUnits = reservation.ReservationUnits
                .Where(ru => ru.Status != "Released")
                .ToList();

            if (activeReservationUnits.Count == 0)
                return new HandoverServiceResponse(false, "Đặt chỗ chưa được phân kho.", 409, null);
            if (reservation.Payments.All(p => p.Status != "Completed"))
                return new HandoverServiceResponse(false, "Hệ thống chưa ghi nhận thanh toán thành công.", 409, null);
            if (reservation.StartDate.Date > DateTime.Today)
                return new HandoverServiceResponse(false, "Chưa đến ngày hẹn nhận kho.", 409, null);
            if (reservation.Contract != null)
                return new HandoverServiceResponse(false, "Đặt chỗ này đã được bàn giao.", 409, null);

            var isAssignedStaff = await _handoverRepository.IsStaffAssignedToFacilityAsync(staff.UserID, reservation.FacilityID, cancellationToken);
            if (!isAssignedStaff)
                return new HandoverServiceResponse(false, "Không có quyền thao tác trên cơ sở này.", 403, null);

            var now = DateTime.UtcNow;
            var normalizedAccessType = ValidAccessTypes.FirstOrDefault(t => string.Equals(t, request.AccessType.Trim(), StringComparison.OrdinalIgnoreCase))
                ?? "Smart Lock";

            // Bước 1: Chuyển các ReservationUnit sang Active và StorageUnit sang In Use
            foreach (var ru in activeReservationUnits)
            {
                ru.Status = "Active";
                ru.HandedOverAt = now;
                ru.Unit.Status = UnitStatus.InUse;
                ru.Unit.UpdatedAt = now;
            }
            await _handoverRepository.SaveChangesAsync(cancellationToken);

            // Bước 2: Chuyển Reservation sang Handed Over (yêu cầu mọi ReservationUnit đã Active)
            reservation.Status = ReservationStatus.HandedOver;
            await _handoverRepository.SaveChangesAsync(cancellationToken);

            // Bước 3: Tạo Contract, cập nhật/tạo HandoverTask và cấp UnitAccess
            var contract = new Contract
            {
                ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}",
                ReservationID = reservation.ReservationID,
                StartDate = reservation.StartDate,
                EndDate = reservation.EndDate,
                ContractStatus = "Active",
                CreatedAt = now,
                CreatedByUserID = staff.UserID
            };
            _handoverRepository.AddContract(contract);

            foreach (var ru in activeReservationUnits)
            {
                var existingTask = reservation.HandoverTasks.FirstOrDefault(t =>
                    t.ReservationUnitID == ru.ReservationUnitID &&
                    t.TaskType == "Move In" &&
                    t.Status != "Cancelled");

                if (existingTask != null)
                {
                    existingTask.AssignedStaffID = staff.UserID;
                    existingTask.ActualAt = now;
                    existingTask.UnitConditionNotes = request.Notes;
                    existingTask.ConditionResult = "Good";
                    existingTask.Status = "Completed";
                }
                else
                {
                    _handoverRepository.AddHandoverTask(new HandoverTask
                    {
                        TaskType = "Move In",
                        FacilityID = reservation.FacilityID,
                        UnitID = ru.UnitID,
                        ReservationUnitID = ru.ReservationUnitID,
                        ReservationID = reservation.ReservationID,
                        AssignedStaffID = staff.UserID,
                        ScheduledDate = reservation.AppointmentDate ?? reservation.StartDate,
                        ScheduledTime = reservation.AppointmentTime,
                        ActualAt = now,
                        UnitConditionNotes = request.Notes,
                        ConditionResult = "Good",
                        Status = "Completed",
                        CreatedAt = now
                    });
                }

                _handoverRepository.AddUnitAccess(new UnitAccess
                {
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = reservation.ReservationID,
                    UnitID = ru.UnitID,
                    UserID = reservation.CustomerID,
                    AccessType = normalizedAccessType,
                    AccessValue = request.AccessValue,
                    IssuedAt = now,
                    IssuedByUserID = staff.UserID,
                    Status = "Active"
                });
            }

            await _handoverRepository.SaveChangesAsync(cancellationToken);

            var firstUnit = activeReservationUnits[0].Unit;
            var responseData = new
            {
                message = "Bàn giao thành công. Hợp đồng và thông tin truy cập đã được ghi nhận.",
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                reservationStatus = reservation.Status,
                unitStatus = firstUnit.Status
            };

            return new HandoverServiceResponse(true, null, 200, responseData);
        }, cancellationToken);
    }
}
