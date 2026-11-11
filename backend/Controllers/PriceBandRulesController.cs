using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/*
 * KHÓA CHẶT KHUNG GIÁ / NHÓM SIZE (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 * Kiểm tra đầy đủ rồi mới gọi lại đúng service cũ (FacilityManagementService) để lưu.
 *
 *   GET    /api/price-band-rules          -> mỗi nhóm: số size, số kho, số kho ĐANG ĐƯỢC ĐẶT, giá đang dùng, các khóa
 *   POST   /api/price-band-rules          -> thêm nhóm (đã kiểm tra)
 *   PUT    /api/price-band-rules/{code}   -> sửa nhóm / ngừng / dùng lại (đã kiểm tra)
 *   DELETE /api/price-band-rules/{code}   -> xóa nhóm (đã kiểm tra)
 *
 * Quy tắc (nhóm xe "V"/VEHICLE là nhóm đặc biệt, không so với nhóm kho thường):
 *  1. Khoảng hợp lệ: 0 < từ < đến (diện tích và giá).
 *  2. Diện tích các nhóm KHÔNG được chồng lên nhau (chạm mép thì được, ví dụ S đến 9,6 m², M từ 9,6 m²).
 *  3. Nhóm lớn hơn phải có giá sàn VÀ giá trần CAO HƠN nhóm nhỏ hơn (không thể đặt M giá bằng L).
 *  4. Nhóm có kho ĐANG ĐƯỢC ĐẶT / ĐANG THUÊ: khóa khung (diện tích + giá), không ngừng sử dụng, không xóa.
 *     Chỉ được đổi tên.
 *  5. Nhóm đã có size/kho (chưa ai đặt): khung mới phải chứa hết diện tích các size và giá đang áp dụng
 *     của mọi cơ sở (không tự ép giá của Facility Manager như API cũ).
 *  6. Chỉ xóa được nhóm chưa có size nào.
 */
[ApiController]
[Route("api/price-band-rules")]
public sealed class PriceBandRulesController(
    SelfStorageDbContext context,
    IFacilityManagementService facilityManagementService) : ControllerBase
{
    private const decimal AreaTolerance = 0.005m;
    private static readonly string[] ActiveReservationStatuses =
        [ReservationStatus.PendingPayment, ReservationStatus.Paid, ReservationStatus.Confirmed, ReservationStatus.HandedOver];

    private sealed record BandInfo(
        int Id, string Code, string CategoryCode, string Name,
        decimal MinArea, decimal MaxArea, decimal MinPrice, decimal MaxPrice, bool IsActive,
        int SizeCount, int UnitCount, int BookedUnitCount,
        decimal? SizeAreaMin, decimal? SizeAreaMax, decimal? RateMin, decimal? RateMax)
    {
        public bool IsSpecial => Code == "V" || CategoryCode.Equals("VEHICLE", StringComparison.OrdinalIgnoreCase);
        public bool Locked => BookedUnitCount > 0;
    }

    private sealed record Candidate(string Code, decimal MinArea, decimal MaxArea, decimal MinPrice, decimal MaxPrice, bool IsActive, bool IsSpecial);

    // ------------------------------------------------------------------ GET

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var bands = await LoadBandsAsync(ct);
        return Ok(new
        {
            rules = new[]
            {
                "Diện tích các nhóm không được chồng lên nhau (chạm mép thì được).",
                "Nhóm lớn hơn phải có giá sàn và giá trần cao hơn nhóm nhỏ hơn.",
                "Nhóm đang có kho được đặt / đang thuê: khóa khung diện tích và giá, không ngừng sử dụng, không xóa.",
                "Nhóm đã có size: khung mới phải chứa hết diện tích các size và giá đang áp dụng tại các cơ sở.",
                "Chỉ xóa được nhóm chưa có size nào. Nhóm xe (V) là nhóm đặc biệt, không so với nhóm kho thường."
            },
            bands = bands.Select(b => new
            {
                code = b.Code,
                name = b.Name,
                minArea = b.MinArea,
                maxArea = b.MaxArea,
                minPrice = b.MinPrice,
                maxPrice = b.MaxPrice,
                isActive = b.IsActive,
                isSpecial = b.IsSpecial,
                sizeCount = b.SizeCount,
                unitCount = b.UnitCount,
                bookedUnitCount = b.BookedUnitCount,
                sizeAreaMin = b.SizeAreaMin,
                sizeAreaMax = b.SizeAreaMax,
                rateMin = b.RateMin,
                rateMax = b.RateMax,
                locked = b.Locked,
                canDeactivate = !b.Locked,
                canDelete = b.SizeCount == 0,
                lockReason = b.Locked
                    ? $"Đang có {b.BookedUnitCount} kho được đặt / đang thuê trong nhóm này nên khung bị khóa."
                    : null
            })
        });
    }

    // ------------------------------------------------------------------ POST / PUT / DELETE

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPriceBandDTO request, CancellationToken ct)
    {
        var code = (request.Code ?? string.Empty).Trim().ToUpperInvariant();
        var bands = await LoadBandsAsync(ct);
        var candidate = new Candidate(code, request.MinArea, request.MaxArea, request.MinPrice, request.MaxPrice,
            request.IsActive ?? true, code == "V");
        var errors = Validate(candidate, bands, current: null);
        if (errors.Count > 0)
            return Conflict(new { message = errors[0], errors });

        var result = await facilityManagementService.CreatePriceBandAsync(request, Request.Headers["X-User-Email"].ToString(), ct);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return StatusCode(result.StatusCode, result.Data);
    }

    [HttpPut("{code}")]
    public async Task<IActionResult> Update(string code, [FromBody] UpsertPriceBandDTO request, CancellationToken ct)
    {
        var bands = await LoadBandsAsync(ct);
        var current = bands.FirstOrDefault(b => b.Code.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase));
        if (current is null)
            return NotFound(new { message = "Không tìm thấy nhóm size." });

        var candidate = new Candidate(current.Code, request.MinArea, request.MaxArea, request.MinPrice, request.MaxPrice,
            request.IsActive ?? current.IsActive, current.IsSpecial);
        var errors = Validate(candidate, bands, current);
        if (errors.Count > 0)
            return Conflict(new { message = errors[0], errors });

        var result = await facilityManagementService.UpdatePriceBandAsync(current.Code, request, Request.Headers["X-User-Email"].ToString(), ct);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return Ok(result.Data);
    }

    [HttpDelete("{code}")]
    public async Task<IActionResult> Delete(string code, CancellationToken ct)
    {
        var bands = await LoadBandsAsync(ct);
        var current = bands.FirstOrDefault(b => b.Code.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase));
        if (current is null)
            return NotFound(new { message = "Không tìm thấy nhóm size." });
        if (current.SizeCount > 0)
            return Conflict(new { message = $"Không xóa được nhóm {current.Code}: còn {current.SizeCount} kích thước thuộc nhóm. Hãy dùng \"Ngừng sử dụng\"." });

        var result = await facilityManagementService.DeletePriceBandAsync(current.Code, Request.Headers["X-User-Email"].ToString(), ct);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return NoContent();
    }

    // ------------------------------------------------------------------ Kiểm tra

    private static List<string> Validate(Candidate c, List<BandInfo> bands, BandInfo? current)
    {
        var errors = new List<string>();
        var money = (decimal v) => $"{v:#,0}đ".Replace(',', '.');
        var area = (decimal v) => $"{v:0.##} m²";

        // 1. Khoảng hợp lệ
        if (current is null && !System.Text.RegularExpressions.Regex.IsMatch(c.Code, "^[A-Z]{1,3}$"))
            errors.Add("Mã nhóm gồm 1–3 chữ cái, ví dụ S, M, L, XL.");
        if (current is null && bands.Any(b => b.Code == c.Code))
            errors.Add($"Nhóm {c.Code} đã tồn tại.");
        if (c.MinArea <= 0 || c.MaxArea <= c.MinArea)
            errors.Add("Diện tích: \"từ\" phải lớn hơn 0 và nhỏ hơn \"đến\".");
        if (c.MinPrice <= 0 || c.MaxPrice <= c.MinPrice)
            errors.Add("Giá: giá thấp nhất phải lớn hơn 0 và nhỏ hơn giá cao nhất.");
        if (errors.Count > 0) return errors;

        // 4. Nhóm đang có kho được đặt: khóa khung
        if (current is not null && current.Locked)
        {
            var areaChanged = Math.Abs(c.MinArea - current.MinArea) > AreaTolerance || Math.Abs(c.MaxArea - current.MaxArea) > AreaTolerance;
            var priceChanged = c.MinPrice != current.MinPrice || c.MaxPrice != current.MaxPrice;
            if (areaChanged || priceChanged)
                errors.Add($"Nhóm {current.Code} đang có {current.BookedUnitCount} kho được đặt / đang thuê nên không được sửa khung diện tích và giá (chỉ đổi tên).");
            if (!c.IsActive && current.IsActive)
                errors.Add($"Nhóm {current.Code} đang có {current.BookedUnitCount} kho được đặt / đang thuê nên không ngừng sử dụng được.");
            return errors;
        }

        // 5. Nhóm đã có size / giá đang áp dụng: khung mới phải chứa hết
        if (current is not null)
        {
            if (current.SizeAreaMin is decimal sMin && c.MinArea > sMin + AreaTolerance)
                errors.Add($"Diện tích \"từ\" không được lớn hơn {area(sMin)} (size nhỏ nhất đang thuộc nhóm {current.Code}).");
            if (current.SizeAreaMax is decimal sMax && c.MaxArea < sMax - AreaTolerance)
                errors.Add($"Diện tích \"đến\" không được nhỏ hơn {area(sMax)} (size lớn nhất đang thuộc nhóm {current.Code}).");
            if (current.RateMin is decimal rMin && c.MinPrice > rMin)
                errors.Add($"Giá thấp nhất không được lớn hơn {money(rMin)} (giá đang áp dụng thấp nhất tại các cơ sở).");
            if (current.RateMax is decimal rMax && c.MaxPrice < rMax)
                errors.Add($"Giá cao nhất không được nhỏ hơn {money(rMax)} (giá đang áp dụng cao nhất tại các cơ sở).");
        }

        // 2 + 3. So với các nhóm khác cùng loại (nhóm thường so với nhóm thường)
        var others = bands.Where(b => b.Code != c.Code && b.IsSpecial == c.IsSpecial).ToList();
        foreach (var other in others)
        {
            if (c.MinArea < other.MaxArea - AreaTolerance && other.MinArea < c.MaxArea - AreaTolerance)
                errors.Add($"Diện tích {area(c.MinArea)} – {area(c.MaxArea)} chồng lên nhóm {other.Code} ({area(other.MinArea)} – {area(other.MaxArea)}).");
        }
        var smaller = others.Where(o => o.MaxArea <= c.MinArea + AreaTolerance).OrderByDescending(o => o.MaxArea).FirstOrDefault();
        var larger = others.Where(o => o.MinArea >= c.MaxArea - AreaTolerance).OrderBy(o => o.MinArea).FirstOrDefault();
        if (smaller is not null && (c.MinPrice <= smaller.MinPrice || c.MaxPrice <= smaller.MaxPrice))
            errors.Add($"Nhóm {c.Code} lớn hơn nhóm {smaller.Code} nên giá phải cao hơn: giá thấp nhất > {money(smaller.MinPrice)} và giá cao nhất > {money(smaller.MaxPrice)}.");
        if (larger is not null && (c.MinPrice >= larger.MinPrice || c.MaxPrice >= larger.MaxPrice))
            errors.Add($"Nhóm {c.Code} nhỏ hơn nhóm {larger.Code} nên giá phải thấp hơn: giá thấp nhất < {money(larger.MinPrice)} và giá cao nhất < {money(larger.MaxPrice)}.");

        return errors;
    }

    // ------------------------------------------------------------------ Dữ liệu

    private async Task<List<BandInfo>> LoadBandsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var categories = await context.Set<SelfStorageAPI.Models.SizeCategory>().AsNoTracking()
            .Select(c => new
            {
                c.SizeCategoryID, c.CodePrefix, c.CategoryCode, c.CategoryName, c.StandardHeightM,
                c.MinVolumeM3, c.MaxVolumeM3, c.MinMonthlyPrice, c.MaxMonthlyPrice, c.IsActive
            })
            .ToListAsync(ct);

        var sizes = await context.Set<SelfStorageAPI.Models.UnitSize>().AsNoTracking()
            .Select(s => new { s.UnitSizeID, s.SizeCategoryID, s.WidthM, s.LengthM })
            .ToListAsync(ct);

        var units = await context.StorageUnits.AsNoTracking()
            .Where(u => u.Status != UnitStatus.Inactive)
            .Select(u => new { u.UnitID, u.UnitSizeID })
            .ToListAsync(ct);

        var bookedUnitIds = (await context.ReservationUnits.AsNoTracking()
            .Where(ru => (ru.Status == "Held" || ru.Status == "Active") &&
                         ActiveReservationStatuses.Contains(ru.Reservation.Status) &&
                         !(ru.Reservation.Status == ReservationStatus.PendingPayment && ru.Reservation.HoldExpiresAt <= now))
            .Select(ru => ru.UnitID)
            .Distinct()
            .ToListAsync(ct)).ToHashSet();

        var rates = await context.RentalRates.AsNoTracking()
            .Select(r => new { r.UnitSizeID, r.MonthlyPrice })
            .ToListAsync(ct);

        return categories.Select(c =>
        {
            var height = c.StandardHeightM > 0 ? c.StandardHeightM : 2.50m;
            var sizeIds = sizes.Where(s => s.SizeCategoryID == c.SizeCategoryID).Select(s => s.UnitSizeID).ToHashSet();
            var areas = sizes.Where(s => sizeIds.Contains(s.UnitSizeID)).Select(s => decimal.Round(s.WidthM * s.LengthM, 2)).ToList();
            var bandUnits = units.Where(u => sizeIds.Contains(u.UnitSizeID)).ToList();
            var bandRates = rates.Where(r => sizeIds.Contains(r.UnitSizeID)).Select(r => r.MonthlyPrice).ToList();
            return new BandInfo(
                c.SizeCategoryID,
                c.CodePrefix.Trim().ToUpperInvariant(),
                c.CategoryCode,
                c.CategoryName,
                decimal.Round(c.MinVolumeM3 / height, 2),
                decimal.Round(c.MaxVolumeM3 / height, 2),
                c.MinMonthlyPrice,
                c.MaxMonthlyPrice,
                c.IsActive,
                sizeIds.Count,
                bandUnits.Count,
                bandUnits.Count(u => bookedUnitIds.Contains(u.UnitID)),
                areas.Count > 0 ? areas.Min() : null,
                areas.Count > 0 ? areas.Max() : null,
                bandRates.Count > 0 ? bandRates.Min() : null,
                bandRates.Count > 0 ? bandRates.Max() : null);
        }).ToList();
    }
}
