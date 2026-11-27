using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class UnitSizeService : IUnitSizeService
{
    // Giới hạn số đo khi BOM tạo / sửa kích thước kho (mét).
    private const decimal MinSideM = 0.5m;
    private const decimal MaxSideM = 50m;

    private readonly IUnitSizeRepository _unitSizeRepository;
    private readonly IUserRepository _userRepository;

    public UnitSizeService(IUnitSizeRepository unitSizeRepository, IUserRepository userRepository)
    {
        _unitSizeRepository = unitSizeRepository;
        _userRepository = userRepository;
    }

    public async Task<IReadOnlyList<UnitSizeResponse>> GetAllAsync(int? facilityId = null, CancellationToken cancellationToken = default)
    {
        var items = await _unitSizeRepository.GetAllAsync(cancellationToken);
        var result = new List<UnitSizeResponse>(items.Count);

        foreach (var item in items)
        {
            var stats = await _unitSizeRepository.GetUsageStatsAsync(item.UnitSizeID, facilityId, cancellationToken);
            result.Add(MapResponse(item, stats));
        }

        return result;
    }

    public async Task<UnitSizeResponse?> GetByIdAsync(int id, int? facilityId = null, CancellationToken cancellationToken = default)
    {
        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return null;

        var stats = await _unitSizeRepository.GetUsageStatsAsync(entity.UnitSizeID, facilityId, cancellationToken);
        return MapResponse(entity, stats);
    }

    /// <summary>Danh sách nhóm kích thước đang dùng (để BOM chọn khi tạo kích thước), kèm khoảng diện tích cho phép.</summary>
    public async Task<IReadOnlyList<SizeCategoryOption>> GetCategoriesAsync(CancellationToken cancellationToken)
    {
        var categories = await _unitSizeRepository.GetActiveCategoriesAsync(cancellationToken);
        return categories.Select(c => new SizeCategoryOption(
            c.SizeCategoryID,
            c.CategoryCode,
            c.CategoryName,
            c.CodePrefix.Trim(),
            c.StandardHeightM,
            c.MinVolumeM3,
            c.MaxVolumeM3,
            decimal.Round(c.MinVolumeM3 / c.StandardHeightM, 2),
            decimal.Round(c.MaxVolumeM3 / c.StandardHeightM, 2))).ToList();
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> CreateAsync(
        UpsertUnitSizeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail);
        if (!authorized || user is null) return (false, authError, null);

        if (request.SizeCategoryID is null)
            return (false, "Vui lòng chọn nhóm kích thước (Nhỏ / Vừa / Lớn / Xe).", null);

        var category = await _unitSizeRepository.GetCategoryAsync(request.SizeCategoryID.Value, cancellationToken);
        var (valid, error, width, length) = await ValidateDimensionsAsync(category, request.WidthM, request.LengthM, null, cancellationToken);
        if (!valid) return (false, error, null);

        var displayName = NormalizeName(request.DisplayName) ?? DefaultDisplayName(category!, width, length);
        var nameError = await ValidateDisplayNameAsync(displayName, null, cancellationToken);
        if (nameError is not null) return (false, nameError, null);

        var isActive = request.IsActive ?? true;
        var entity = new UnitSize
        {
            SizeCategoryID = category!.SizeCategoryID,
            SizeCode = await _unitSizeRepository.NextSizeCodeAsync(category.CodePrefix.Trim(), null, cancellationToken),
            DisplayName = displayName,
            WidthM = width,
            LengthM = length,
            HeightM = category.StandardHeightM,
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserID = user.UserID
        };

        _unitSizeRepository.Add(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        await _unitSizeRepository.EnsureAllFacilitiesLinkAsync(entity.UnitSizeID, user.UserID, cancellationToken);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var stats = (UnitCount: 0, ReservationCount: 0, RateCount: 0, IsActiveAtFacility: isActive);
        entity.SizeCategory = category;
        return (true, null, MapResponse(entity, stats));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> UpdateAsync(
        int id,
        UpsertUnitSizeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        // Có FacilityID: chỉ bật / tắt kích thước tại cơ sở đó (Quản lý cơ sở dùng), không sửa danh mục.
        if (request.FacilityID.HasValue)
            return await ToggleAtFacilityAsync(id, request.FacilityID.Value, request.IsActive, userEmail, cancellationToken);

        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail);
        if (!authorized || user is null) return (false, authError, null);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND", null);

        var newCategoryId = request.SizeCategoryID ?? entity.SizeCategoryID;
        var newWidth = request.WidthM ?? entity.WidthM;
        var newLength = request.LengthM ?? entity.LengthM;
        var dimsChanged = newCategoryId != entity.SizeCategoryID || newWidth != entity.WidthM || newLength != entity.LengthM;

        if (dimsChanged)
        {
            // Kích thước đã được kho / đơn / bảng giá dùng thì không đổi số đo hay nhóm (sẽ làm sai kho và giá đang chạy).
            if (await _unitSizeRepository.IsUsedByUnitsOrRatesAsync(id, cancellationToken))
                return (false, $"Kích thước {entity.SizeCode} đang được kho, đơn đặt chỗ hoặc bảng giá sử dụng nên không đổi được số đo hay nhóm. Chỉ đổi được tên hiển thị và trạng thái; nếu cần số đo khác, hãy tạo kích thước mới.", null);

            var category = await _unitSizeRepository.GetCategoryAsync(newCategoryId, cancellationToken);
            var (valid, error, width, length) = await ValidateDimensionsAsync(category, newWidth, newLength, id, cancellationToken);
            if (!valid) return (false, error, null);

            if (category!.SizeCategoryID != entity.SizeCategoryID)
                entity.SizeCode = await _unitSizeRepository.NextSizeCodeAsync(category.CodePrefix.Trim(), id, cancellationToken);
            entity.SizeCategoryID = category.SizeCategoryID;
            entity.WidthM = width;
            entity.LengthM = length;
            entity.HeightM = category.StandardHeightM;
            entity.AreaM2 = null;
            entity.VolumeM3 = null;
        }

        if (request.DisplayName is not null)
        {
            var displayName = NormalizeName(request.DisplayName);
            if (displayName is null) return (false, "Tên hiển thị không được để trống.", null);
            var nameError = await ValidateDisplayNameAsync(displayName, id, cancellationToken);
            if (nameError is not null) return (false, nameError, null);
            entity.DisplayName = displayName;
        }

        if (request.IsActive.HasValue)
            entity.IsActive = request.IsActive.Value;

        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var stats = await _unitSizeRepository.GetUsageStatsAsync(id, null, cancellationToken);
        return (true, null, MapResponse(entity, stats));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(
        int id,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, _) = await CheckAuthorizationAsync(userEmail);
        if (!authorized) return (false, authError);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND");

        var isUsed = await _unitSizeRepository.IsUsedByUnitsOrRatesAsync(id, cancellationToken);
        if (isUsed)
            return (false, $"Không thể xóa kích thước {entity.SizeCode}: đang được kho, đơn đặt chỗ hoặc bảng giá sử dụng. Có thể tắt \"Đang dùng\" để ngừng dùng kích thước này.");

        await _unitSizeRepository.RemoveFacilityLinksAsync(id, cancellationToken);
        _unitSizeRepository.Remove(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        return (true, null);
    }

    /// <summary>Bật / tắt 1 kích thước tại 1 cơ sở (chọn được hay không khi tạo kho ở cơ sở đó).</summary>
    private async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> ToggleAtFacilityAsync(
        int id, int facilityId, bool? isActive, string? userEmail, CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckFacilityAuthorizationAsync(userEmail, facilityId, cancellationToken);
        if (!authorized || user is null) return (false, authError, null);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND", null);
        if (isActive is null) return (false, "Thiếu trạng thái bật / tắt tại cơ sở.", null);

        if (!isActive.Value && await _unitSizeRepository.HasActiveUnitsAtFacilityAsync(facilityId, id, cancellationToken))
            return (false, "Cơ sở vẫn còn kho đang hoạt động thuộc kích thước này. Hãy ngừng hoặc đổi các kho đó trước.", null);

        await _unitSizeRepository.EnsureFacilityLinkAsync(facilityId, id, isActive.Value, user.UserID, cancellationToken);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var stats = await _unitSizeRepository.GetUsageStatsAsync(id, facilityId, cancellationToken);
        return (true, null, MapResponse(entity, stats));
    }

    /// <summary>
    /// Kiểm tra số đo: nhóm phải tồn tại và đang dùng; rộng, dài từ 0,5 đến 50 m (tối đa 2 số lẻ); dài ≥ rộng;
    /// thể tích (dài × rộng × chiều cao chuẩn của nhóm) nằm trong khoảng của nhóm; không trùng số đo với kích thước khác.
    /// </summary>
    private async Task<(bool Valid, string? Error, decimal Width, decimal Length)> ValidateDimensionsAsync(
        SizeCategory? category,
        decimal? widthInput,
        decimal? lengthInput,
        int? excludeId,
        CancellationToken cancellationToken)
    {
        if (category is null)
            return (false, "Nhóm kích thước không tồn tại.", 0, 0);
        if (!category.IsActive)
            return (false, $"Nhóm {category.CategoryName} đang ngừng sử dụng, không thể tạo hoặc chuyển kích thước vào nhóm này.", 0, 0);
        if (widthInput is null || lengthInput is null)
            return (false, "Vui lòng nhập đủ chiều rộng và chiều dài.", 0, 0);

        var width = widthInput.Value;
        var length = lengthInput.Value;
        if (width < MinSideM || width > MaxSideM)
            return (false, $"Chiều rộng phải từ {MinSideM:0.#} m đến {MaxSideM:0} m.", 0, 0);
        if (length < MinSideM || length > MaxSideM)
            return (false, $"Chiều dài phải từ {MinSideM:0.#} m đến {MaxSideM:0} m.", 0, 0);
        if (decimal.Round(width, 2) != width || decimal.Round(length, 2) != length)
            return (false, "Số đo chỉ được tối đa 2 chữ số thập phân (ví dụ 2.25).", 0, 0);
        if (length < width)
            return (false, $"Chiều dài ({length:0.##} m) phải lớn hơn hoặc bằng chiều rộng ({width:0.##} m). Hãy đổi chỗ 2 số đo.", 0, 0);

        var height = category.StandardHeightM;
        var volume = width * length * height;
        if (volume < category.MinVolumeM3 || volume > category.MaxVolumeM3)
        {
            var minArea = category.MinVolumeM3 / height;
            var maxArea = category.MaxVolumeM3 / height;
            return (false, $"Diện tích {width * length:0.##} m² không thuộc nhóm {category.CategoryName}: nhóm này nhận diện tích từ {minArea:0.##} đến {maxArea:0.##} m² (chiều cao chuẩn {height:0.##} m). Hãy đổi số đo hoặc chọn nhóm khác.", 0, 0);
        }

        var same = await _unitSizeRepository.FindSameDimensionsAsync(width, length, height, excludeId, cancellationToken);
        if (same is not null)
            return (false, $"Đã có kích thước {same.SizeCode} \"{same.DisplayName}\" với cùng số đo {width:0.##} x {length:0.##} m.", 0, 0);

        return (true, null, width, length);
    }

    /// <summary>Tên hiển thị: 2–100 ký tự, không trùng (không phân biệt hoa thường) với kích thước khác.</summary>
    private async Task<string?> ValidateDisplayNameAsync(string displayName, int? excludeId, CancellationToken cancellationToken)
    {
        if (displayName.Length < 2) return "Tên hiển thị cần ít nhất 2 ký tự.";
        if (displayName.Length > 100) return "Tên hiển thị tối đa 100 ký tự.";
        var same = await _unitSizeRepository.FindByDisplayNameAsync(displayName, excludeId, cancellationToken);
        return same is null ? null : $"Tên hiển thị \"{displayName}\" đã được kích thước {same.SizeCode} dùng.";
    }

    private static string? NormalizeName(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries));

    private static string DefaultDisplayName(SizeCategory category, decimal width, decimal length)
        => category.CodePrefix.Trim().Equals("V", StringComparison.OrdinalIgnoreCase)
            ? $"Kho xe {width:0.##} x {length:0.##} m"
            : $"Kho {width:0.##} x {length:0.##} m";

    private static UnitSizeResponse MapResponse(
        UnitSize item,
        (int UnitCount, int ReservationCount, int RateCount, bool IsActiveAtFacility) stats)
    {
        var area = item.AreaM2 ?? decimal.Round(item.WidthM * item.LengthM, 2);
        var vol = item.VolumeM3 ?? decimal.Round(item.WidthM * item.LengthM * item.HeightM, 2);
        return new UnitSizeResponse(
            item.UnitSizeID,
            $"{item.SizeCode}: {item.DisplayName}",
            vol,
            stats.UnitCount,
            item.UnitSizeID,
            item.SizeCode,
            item.DisplayName,
            area,
            item.WidthM,
            item.LengthM,
            item.HeightM,
            stats.IsActiveAtFacility,
            stats.UnitCount,
            stats.ReservationCount,
            stats.RateCount,
            item.SizeCategoryID,
            item.SizeCategory?.CategoryName);
    }

    /// <summary>Chỉ Business Operations Manager (RoleID 4) được thêm / sửa / xóa danh mục kích thước kho.</summary>
    private async Task<(bool Authorized, string? ErrorMessage, User? User)> CheckAuthorizationAsync(string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return (false, "UNAUTHORIZED:Thiếu thông tin người dùng (header X-User-Email).", null);

        var user = await _userRepository.GetUserByEmailAsync(email.Trim());
        if (user is null || user.Status != "Active")
            return (false, "UNAUTHORIZED:Tài khoản không hợp lệ hoặc đã bị khóa.", null);

        if (user.RoleID == 4)
            return (true, null, user);

        return (false, "FORBIDDEN:Chỉ Business Operations Manager mới được thêm, sửa, xóa kích thước kho.", null);
    }

    /// <summary>Bật / tắt tại cơ sở: Business Operations Manager, hoặc Facility Manager của đúng cơ sở đó.</summary>
    private async Task<(bool Authorized, string? ErrorMessage, User? User)> CheckFacilityAuthorizationAsync(
        string? email, int facilityId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return (false, "UNAUTHORIZED:Thiếu thông tin người dùng (header X-User-Email).", null);

        var user = await _userRepository.GetUserByEmailAsync(email.Trim());
        if (user is null || user.Status != "Active")
            return (false, "UNAUTHORIZED:Tài khoản không hợp lệ hoặc đã bị khóa.", null);

        if (user.RoleID == 4) return (true, null, user);
        if (user.RoleID == 3 && await _unitSizeRepository.IsFacilityManagerAsync(facilityId, user.UserID, cancellationToken))
            return (true, null, user);

        return (false, "FORBIDDEN:Chỉ Quản lý của cơ sở này hoặc Business Operations mới được bật / tắt kích thước tại cơ sở.", null);
    }
}
