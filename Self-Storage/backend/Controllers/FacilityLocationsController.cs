using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;

namespace SelfStorageAPI.Controllers;

/*
 * Vị trí các cơ sở để hiển thị bản đồ ở trang khách hàng (file THÊM MỚI, không sửa code cũ).
 *   GET /api/facility-locations   (công khai, chỉ đọc)
 * Trả về tọa độ Latitude/Longitude đã có sẵn trong bảng Facility cùng địa chỉ, SĐT, giờ mở cửa.
 */
[ApiController]
[Route("api/facility-locations")]
public sealed class FacilityLocationsController(SelfStorageDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetLocations(CancellationToken cancellationToken)
    {
        var rows = await context.Facilities
            .AsNoTracking()
            .Where(f => f.Status == "Active")
            .OrderBy(f => f.FacilityID)
            .Select(f => new
            {
                f.FacilityID,
                f.FacilityName,
                f.StreetAddress,
                f.Ward,
                f.District,
                f.City,
                f.Latitude,
                f.Longitude,
                f.ContactPhone,
                f.OpeningHours
            })
            .ToListAsync(cancellationToken);

        return Ok(rows.Select(f => new
        {
            facilityId = f.FacilityID,
            name = f.FacilityName,
            address = string.Join(", ", new[] { f.StreetAddress, f.Ward, f.District, f.City }.Where(s => !string.IsNullOrWhiteSpace(s))),
            latitude = f.Latitude,
            longitude = f.Longitude,
            contactPhone = f.ContactPhone,
            openingHours = f.OpeningHours
        }));
    }
}
