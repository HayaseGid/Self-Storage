using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using System.Linq;
using System.Threading.Tasks;

namespace SelfStorageAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CatalogController : ControllerBase
    {
        private readonly SelfStorageDbContext _context;

        public CatalogController(SelfStorageDbContext context)
        {
            _context = context;
        }

        [HttpGet("state")]
        public async Task<IActionResult> GetCatalogState(CancellationToken cancellationToken)
        {
            var facilities = await _context.Facilities
                .Where(f => f.Status == "Active")
                .Select(f => new {
                    id = f.FacilityID.ToString(),
                    name = f.FacilityName,
                    address = f.Address,
                    status = f.Status,
                    depositPercent = _context.RentalPolicies
                        .Where(p => p.FacilityID == f.FacilityID)
                        .Select(p => (decimal?)p.DepositPercent)
                        .FirstOrDefault() ?? 20m
                }).ToListAsync(cancellationToken);

            var units = await _context.StorageUnits
                .Where(u => u.Facility.Status == "Active")
                .Include(u => u.UnitType)
                .Include(u => u.UnitSize)
                .Select(u => new {
                    id = u.UnitNumber,
                    unitId = u.UnitID,
                    facility = u.FacilityID.ToString(),
                    type = u.UnitType.TypeName,
                    unitTypeId = u.UnitTypeID,
                    climate = u.UnitType.TypeName,
                    size = u.UnitSize.Dimensions,
                    unitSizeId = u.UnitSizeID,
                    price = u.BasePrice,
                    status = u.Status,
                    location = (string?)null
                }).ToListAsync(cancellationToken);

            return Ok(new { facilities, units });
        }

        [HttpGet("availability")]
        public async Task<IActionResult> GetAvailability(
            [FromQuery] int facilityId,
            [FromQuery] int unitTypeId,
            [FromQuery] DateTime startDate,
            [FromQuery] int months,
            CancellationToken cancellationToken)
        {
            if (months is < 1 or > 12 || startDate.Date < DateTime.Today)
                return BadRequest(new { message = "Ngày bắt đầu hoặc thời gian thuê không hợp lệ." });

            var start = startDate.Date;
            var end = start.AddMonths(months).AddDays(-1);
            if (!await _context.Facilities.AnyAsync(
                    f => f.FacilityID == facilityId && f.Status == "Active",
                    cancellationToken))
                return Ok(new { facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = 20m, units = Array.Empty<object>() });

            var policy = await _context.RentalPolicies
                .Where(p => p.FacilityID == facilityId)
                .Select(p => (decimal?)p.DepositPercent)
                .FirstOrDefaultAsync(cancellationToken) ?? 20m;

            var units = await _context.StorageUnits
                .Where(u => u.FacilityID == facilityId && u.UnitTypeID == unitTypeId &&
                    (u.Status == "Available" || u.Status == "Reserved" || u.Status == "In Use") &&
                    !_context.Reservations.Any(r => r.AssignedUnitID == u.UnitID &&
                        r.Status != "Cancelled" && r.StartDate <= end && r.EndDate >= start))
                .Include(u => u.UnitType)
                .Include(u => u.UnitSize)
                .OrderBy(u => u.BasePrice)
                .Select(u => new
                {
                    unitId = u.UnitID,
                    unitNumber = u.UnitNumber,
                    unitType = u.UnitType.TypeName,
                    size = u.UnitSize.Dimensions,
                    monthlyPrice = u.BasePrice,
                    rentalAmount = decimal.Round(u.BasePrice * months, 2),
                    depositAmount = decimal.Round(u.BasePrice * months * policy / 100m, 2),
                    totalAmount = decimal.Round(u.BasePrice * months * (1m + policy / 100m), 2)
                })
                .ToListAsync(cancellationToken);

            return Ok(new { facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = policy, units });
        }
    }
}
