using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;
using SelfStorageAPI.Constants;

namespace SelfStorageAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HandoverController : ControllerBase
    {
        private readonly SelfStorageDbContext _context;

        public HandoverController(SelfStorageDbContext context)
        {
            _context = context;
        }

        [HttpPost("complete")]
        public async Task<IActionResult> CompleteHandover(
            [FromBody] CompleteHandoverDTO request,
            CancellationToken cancellationToken)
        {
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable, cancellationToken);
            var reservation = await _context.Reservations
                .Include(r => r.AssignedUnit)
                .Include(r => r.Customer)
                .Include(r => r.Payments)
                .Include(r => r.Contract)
                .FirstOrDefaultAsync(r => r.ReservationID == request.ReservationID, cancellationToken);

            if (reservation == null) return NotFound(new { message = "Không tìm thấy Reservation." });
            if (reservation.Status != ReservationStatus.Confirmed)
                return Conflict(new { message = "Chỉ có thể bàn giao đặt chỗ đã thanh toán và được phân kho." });
            if (reservation.AssignedUnit == null)
                return Conflict(new { message = "Đặt chỗ chưa được phân kho." });
            if (reservation.AssignedUnitID is not int assignedUnitId)
                return Conflict(new { message = "Đặt chỗ chưa được phân kho." });
            if (reservation.Payments.All(p => p.PaymentStatus != "Completed"))
                return Conflict(new { message = "Hệ thống chưa ghi nhận thanh toán thành công." });
            if (reservation.StartDate.Date > DateTime.Today)
                return Conflict(new { message = "Chưa đến ngày hẹn nhận kho." });
            if (reservation.Contract != null)
                return Conflict(new { message = "Đặt chỗ này đã được bàn giao." });

            var email = Request.Headers["X-User-Email"].ToString();
            if (string.IsNullOrWhiteSpace(email))
                return Unauthorized();

            var staff = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == email && u.RoleID == 2 && u.Status == "Active", cancellationToken);
            if (staff == null) return NotFound(new { message = "Không tìm thấy nhân viên." });
            var isAssignedStaff = await _context.FacilityStaffs.AnyAsync(fs =>
                fs.UserID == staff.UserID &&
                fs.FacilityID == reservation.FacilityID &&
                fs.Status == "Active", cancellationToken);
            if (!isAssignedStaff)
                return Forbid();

            var rentalDays = (reservation.EndDate.Date - reservation.StartDate.Date).Days + 1;
            var contractType = await _context.ContractTypes
                .Where(ct => ct.MinDays <= rentalDays && ct.MaxDays >= rentalDays)
                .OrderBy(ct => ct.ContractTypeID)
                .FirstOrDefaultAsync(cancellationToken);
            if (contractType == null)
                return Conflict(new { message = "Chưa cấu hình loại hợp đồng phù hợp với thời hạn thuê." });

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

            _context.HandoverTasks.Add(task);

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
            _context.Contracts.Add(contract);
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
            _context.UnitAccesses.Add(access);
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Ok(new
            {
                message = "Bàn giao thành công. Hợp đồng và thông tin truy cập đã được ghi nhận.",
                contractId = contract.ContractID,
                reservationStatus = reservation.Status,
                unitStatus = reservation.AssignedUnit.Status
            });
        }
    }
}
