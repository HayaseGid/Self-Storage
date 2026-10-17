using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;
using SelfStorageAPI.Constants;
using System.Data;

namespace SelfStorageAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReservationController : ControllerBase
    {
        private readonly SelfStorageDbContext _context;

        public ReservationController(SelfStorageDbContext context)
        {
            _context = context;
        }

        [HttpPost]
        public async Task<IActionResult> CreateReservation(
            [FromBody] CreateReservationDTO request,
            CancellationToken cancellationToken)
        {
            if (request.Months is < 1 or > 12)
                return BadRequest(new { message = "Thời gian thuê phải từ 1 đến 12 tháng." });

            var customer = await _context.Users
                .FirstOrDefaultAsync(u => u.Email == request.CustomerEmail, cancellationToken);
            if (customer == null) return NotFound(new { message = "Không tìm thấy tài khoản khách hàng." });

            var startDate = request.StartDate.Date;
            if (startDate < DateTime.Today)
                return BadRequest(new { message = "Ngày bắt đầu thuê không được ở trong quá khứ." });

            var unit = await _context.StorageUnits
                .Include(u => u.UnitType)
                .FirstOrDefaultAsync(u => u.UnitNumber == request.UnitNumber, cancellationToken);
            if (unit == null) return NotFound(new { message = "Không tìm thấy kho." });

            var endDate = startDate.AddMonths(request.Months).AddDays(-1);
            await using var transaction = await _context.Database.BeginTransactionAsync(
                IsolationLevel.Serializable, cancellationToken);

            var hasConflict = await _context.Reservations.AnyAsync(r =>
                r.AssignedUnitID == unit.UnitID &&
                r.Status != ReservationStatus.Cancelled &&
                r.StartDate <= endDate &&
                r.EndDate >= startDate, cancellationToken);
            if (hasConflict)
                return Conflict(new { message = "Kho đã có đặt chỗ trong một phần hoặc toàn bộ kỳ thuê đã chọn." });

            if (unit.Status is not ("Available" or "Reserved" or "In Use"))
                return Conflict(new { message = "Kho hiện không được phép cho thuê." });

            var policy = await _context.RentalPolicies
                .FirstOrDefaultAsync(p => p.FacilityID == unit.FacilityID, cancellationToken);
            var depositPercent = policy?.DepositPercent ?? 20m;
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
                Status = ReservationStatus.PendingDeposit
            };

            _context.Reservations.Add(reservation);
            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return CreatedAtAction(nameof(GetById), new { id = reservation.ReservationID }, new
            {
                message = "Đặt kho thành công, đang chờ thanh toán tiền cọc.",
                reservationId = reservation.ReservationID,
                monthlyPrice = unit.BasePrice,
                rentalAmount = rent,
                depositAmount = deposit,
                totalAmount = rent + deposit,
                startDate = reservation.StartDate,
                endDate = reservation.EndDate
            });
        }

        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
        {
            var reservation = await _context.Reservations
                .Where(r => r.ReservationID == id)
                .Select(r => new
                {
                    reservationId = r.ReservationID,
                    customerEmail = r.Customer.Email,
                    facilityId = r.FacilityID,
                    unitNumber = r.AssignedUnit == null ? null : r.AssignedUnit.UnitNumber,
                    startDate = r.StartDate,
                    endDate = r.EndDate,
                    months = r.RentalPeriod,
                    rentalAmount = r.TotalEstimatedCost,
                    depositAmount = r.DepositAmount,
                    status = r.Status
                })
                .FirstOrDefaultAsync(cancellationToken);

            return reservation is null ? NotFound() : Ok(reservation);
        }

        [HttpGet("customer/{email}")]
        public async Task<IActionResult> GetForCustomer(string email, CancellationToken cancellationToken)
        {
            var reservations = await _context.Reservations
                .Where(r => r.Customer.Email == email)
                .OrderByDescending(r => r.StartDate)
                .Select(r => new
                {
                    reservationId = r.ReservationID,
                    facility = r.Facility.FacilityName,
                    unitNumber = r.AssignedUnit == null ? null : r.AssignedUnit.UnitNumber,
                    unitType = r.UnitType.TypeName,
                    startDate = r.StartDate,
                    endDate = r.EndDate,
                    months = r.RentalPeriod,
                    rentalAmount = r.TotalEstimatedCost,
                    depositAmount = r.DepositAmount,
                    status = r.Status,
                    paymentStatus = r.Payments.OrderByDescending(p => p.PaymentID)
                        .Select(p => p.PaymentStatus).FirstOrDefault(),
                    contractId = r.Contract == null ? (int?)null : r.Contract.ContractID,
                    contractStatus = r.Contract == null ? null : r.Contract.ContractStatus,
                    accessType = r.Contract == null ? null :
                        r.Contract.UnitAccesses.Select(a => a.AccessType).FirstOrDefault(),
                    accessValue = r.Contract == null ? null :
                        r.Contract.UnitAccesses.Select(a => a.AccessValue).FirstOrDefault(),
                    size = r.AssignedUnit == null ? null : r.AssignedUnit.UnitSize.Dimensions
                })
                .ToListAsync(cancellationToken);

            return Ok(reservations);
        }
    }
}
