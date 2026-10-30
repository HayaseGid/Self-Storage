using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class UnitSizeService : IUnitSizeService
{
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

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> CreateAsync(
        UpsertUnitSizeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail, request.FacilityID, cancellationToken);
        if (!authorized || user is null) return (false, authError, null);

        var rawDimensions = !string.IsNullOrWhiteSpace(request.Dimensions)
            ? request.Dimensions.Trim()
            : !string.IsNullOrWhiteSpace(request.SizeCode) && !string.IsNullOrWhiteSpace(request.DisplayName)
                ? $"{request.SizeCode.Trim()}: {request.DisplayName.Trim()}"
                : (request.DisplayName ?? request.SizeCode ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(rawDimensions))
            return (false, "Kích thước không được để trống.", null);

        var duplicated = await _unitSizeRepository.ExistsByDimensionsAsync(rawDimensions, null, cancellationToken);
        if (duplicated)
            return (false, $"Kích thước \"{rawDimensions}\" đã tồn tại.", null);

        var isActive = request.IsActive ?? true;
        var entity = new UnitSize
        {
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserID = user.UserID
        };

        await _unitSizeRepository.PopulateSizeFieldsAsync(entity, request, cancellationToken);
        _unitSizeRepository.Add(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        await _unitSizeRepository.EnsureAllFacilitiesLinkAsync(entity.UnitSizeID, user.UserID, cancellationToken);
        if (request.FacilityID.HasValue)
        {
            await _unitSizeRepository.EnsureFacilityLinkAsync(request.FacilityID.Value, entity.UnitSizeID, isActive, user.UserID, cancellationToken);
        }
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var stats = (UnitCount: 0, ReservationCount: 0, RateCount: 0, IsActiveAtFacility: isActive);
        return (true, null, MapResponse(entity, stats));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> UpdateAsync(
        int id,
        UpsertUnitSizeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail, request.FacilityID, cancellationToken);
        if (!authorized || user is null) return (false, authError, null);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND", null);

        var rawDimensions = !string.IsNullOrWhiteSpace(request.Dimensions)
            ? request.Dimensions.Trim()
            : !string.IsNullOrWhiteSpace(request.SizeCode) && !string.IsNullOrWhiteSpace(request.DisplayName)
                ? $"{request.SizeCode.Trim()}: {request.DisplayName.Trim()}"
                : $"{entity.SizeCode}: {entity.DisplayName}";

        var duplicated = await _unitSizeRepository.ExistsByDimensionsAsync(rawDimensions, id, cancellationToken);
        if (duplicated)
            return (false, $"Kích thước \"{rawDimensions}\" đã tồn tại.", null);

        var hasRates = await _unitSizeRepository.HasRentalRatesAsync(id, cancellationToken);
        if (hasRates)
        {
            // Theo TR_UnitSize_Validate: Size đã có cơ sở dùng trong bảng giá thì chỉ đổi tên hiển thị / trạng thái
            if (!string.IsNullOrWhiteSpace(request.DisplayName))
            {
                entity.DisplayName = request.DisplayName.Trim();
            }
            else if (rawDimensions.Contains(':'))
            {
                var parts = rawDimensions.Split(':', 2, StringSplitOptions.TrimEntries);
                if (!string.IsNullOrWhiteSpace(parts[1])) entity.DisplayName = parts[1];
            }
            else if (!string.IsNullOrWhiteSpace(rawDimensions))
            {
                entity.DisplayName = rawDimensions;
            }
        }
        else
        {
            await _unitSizeRepository.PopulateSizeFieldsAsync(entity, request, cancellationToken);
        }

        if (request.IsActive.HasValue)
        {
            if (request.FacilityID.HasValue)
            {
                if (!request.IsActive.Value)
                {
                    var hasActiveUnits = await _unitSizeRepository.HasActiveUnitsAtFacilityAsync(request.FacilityID.Value, id, cancellationToken);
                    if (hasActiveUnits)
                        return (false, "Cơ sở vẫn còn kho đang hoạt động thuộc kích thước này. Hãy ngừng hoặc đổi các kho đó trước.", null);
                }
                await _unitSizeRepository.EnsureFacilityLinkAsync(request.FacilityID.Value, id, request.IsActive.Value, user.UserID, cancellationToken);
            }
            else if (user.RoleID == 4)
            {
                entity.IsActive = request.IsActive.Value;
            }
        }

        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var stats = await _unitSizeRepository.GetUsageStatsAsync(id, request.FacilityID, cancellationToken);
        return (true, null, MapResponse(entity, stats));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(
        int id,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, _) = await CheckAuthorizationAsync(userEmail, null, cancellationToken);
        if (!authorized) return (false, authError);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND");

        var isUsed = await _unitSizeRepository.IsUsedByUnitsOrRatesAsync(id, cancellationToken);
        if (isUsed)
            return (false, "Không thể xóa kích thước đang được sử dụng bởi kho, đơn đặt chỗ hoặc bảng giá.");

        await _unitSizeRepository.RemoveFacilityLinksAsync(id, cancellationToken);
        _unitSizeRepository.Remove(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        return (true, null);
    }

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
            stats.RateCount);
    }

    private async Task<(bool Authorized, string? ErrorMessage, User? User)> CheckAuthorizationAsync(
        string? email,
        int? facilityId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return (false, "UNAUTHORIZED:Thiếu thông tin người dùng (header X-User-Email).", null);

        var user = await _userRepository.GetUserByEmailAsync(email.Trim());
        if (user is null || user.Status != "Active")
            return (false, "UNAUTHORIZED:Tài khoản không hợp lệ hoặc đã bị khóa.", null);

        if (user.RoleID == 4)
            return (true, null, user);

        if (user.RoleID == 3)
        {
            if (facilityId.HasValue)
            {
                var isManager = await _unitSizeRepository.IsFacilityManagerAsync(facilityId.Value, user.UserID, cancellationToken);
                if (!isManager)
                    return (false, "FORBIDDEN:Bạn không quản lý cơ sở này.", null);
            }
            return (true, null, user);
        }

        return (false, "FORBIDDEN:Chỉ Business Operations Manager hoặc Facility Manager mới được thao tác danh mục kích thước kho.", null);
    }
}
