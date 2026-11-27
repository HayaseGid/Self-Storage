using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class UnitTypeService : IUnitTypeService
{
    private readonly IUnitTypeRepository _unitTypeRepository;
    private readonly IUserRepository _userRepository;

    public UnitTypeService(IUnitTypeRepository unitTypeRepository, IUserRepository userRepository)
    {
        _unitTypeRepository = unitTypeRepository;
        _userRepository = userRepository;
    }

    public async Task<IReadOnlyList<UnitTypeResponse>> GetAllAsync(int? facilityId = null, CancellationToken cancellationToken = default)
    {
        var items = await _unitTypeRepository.GetAllAsync(cancellationToken);
        var result = new List<UnitTypeResponse>(items.Count);

        foreach (var item in items)
        {
            var stats = await _unitTypeRepository.GetUsageStatsAsync(item.UnitTypeID, facilityId, cancellationToken);
            int? ownerFacilityId = null;
            if (item.CreatedByUserID.HasValue && item.FacilityUnitTypes.Count == 1)
            {
                ownerFacilityId = item.FacilityUnitTypes.First().FacilityID;
            }

            result.Add(new UnitTypeResponse(
                item.UnitTypeID,
                item.TypeName,
                item.Description,
                stats.UnitCount,
                item.UnitTypeID,
                item.TypeName,
                stats.IsActiveAtFacility,
                stats.UnitCount,
                stats.ReservationCount,
                stats.RateCount,
                ownerFacilityId));
        }

        return result;
    }

    public async Task<UnitTypeResponse?> GetByIdAsync(int id, int? facilityId = null, CancellationToken cancellationToken = default)
    {
        var entity = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return null;

        var stats = await _unitTypeRepository.GetUsageStatsAsync(entity.UnitTypeID, facilityId, cancellationToken);
        int? ownerFacilityId = null;
        if (entity.CreatedByUserID.HasValue && entity.FacilityUnitTypes.Count == 1)
        {
            ownerFacilityId = entity.FacilityUnitTypes.First().FacilityID;
        }

        return new UnitTypeResponse(
            entity.UnitTypeID,
            entity.TypeName,
            entity.Description,
            stats.UnitCount,
            entity.UnitTypeID,
            entity.TypeName,
            stats.IsActiveAtFacility,
            stats.UnitCount,
            stats.ReservationCount,
            stats.RateCount,
            ownerFacilityId);
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> CreateAsync(
        UpsertUnitTypeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail, request.FacilityID, cancellationToken);
        if (!authorized || user is null) return (false, authError, null);

        var rawName = !string.IsNullOrWhiteSpace(request.TypeName) ? request.TypeName : (request.Name ?? string.Empty);
        var normalizedName = rawName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
            return (false, "Tên loại kho không được để trống.", null);

        var duplicated = await _unitTypeRepository.ExistsByNameAsync(normalizedName, null, cancellationToken);
        if (duplicated)
            return (false, $"Loại kho \"{normalizedName}\" đã tồn tại.", null);

        var isActive = request.IsActive ?? true;
        var entity = new UnitType
        {
            TypeName = normalizedName,
            Description = NormalizeDescription(request.Description),
            IsActive = isActive,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserID = user.UserID
        };

        _unitTypeRepository.Add(entity);
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        if (request.FacilityID.HasValue)
        {
            await _unitTypeRepository.EnsureFacilityLinkAsync(request.FacilityID.Value, entity.UnitTypeID, isActive, user.UserID, cancellationToken);
        }
        else
        {
            await _unitTypeRepository.EnsureAllFacilitiesLinkAsync(entity.UnitTypeID, user.UserID, cancellationToken);
        }
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        return (true, null, new UnitTypeResponse(
            entity.UnitTypeID,
            entity.TypeName,
            entity.Description,
            0,
            entity.UnitTypeID,
            entity.TypeName,
            isActive,
            0,
            0,
            0,
            request.FacilityID));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> UpdateAsync(
        int id,
        UpsertUnitTypeDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, user) = await CheckAuthorizationAsync(userEmail, request.FacilityID, cancellationToken);
        if (!authorized || user is null) return (false, authError, null);

        var entity = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND", null);

        var rawName = !string.IsNullOrWhiteSpace(request.TypeName) ? request.TypeName : (request.Name ?? entity.TypeName);
        var normalizedName = rawName.Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
            return (false, "Tên loại kho không được để trống.", null);

        var duplicated = await _unitTypeRepository.ExistsByNameAsync(normalizedName, id, cancellationToken);
        if (duplicated)
            return (false, $"Loại kho \"{normalizedName}\" đã tồn tại.", null);

        entity.TypeName = normalizedName;
        entity.Description = NormalizeDescription(request.Description);

        if (request.IsActive.HasValue)
        {
            if (request.FacilityID.HasValue)
            {
                if (!request.IsActive.Value)
                {
                    var hasActiveUnits = await _unitTypeRepository.HasActiveUnitsAtFacilityAsync(request.FacilityID.Value, id, cancellationToken);
                    if (hasActiveUnits)
                        return (false, "Cơ sở vẫn còn kho đang hoạt động thuộc loại này. Hãy ngừng hoặc đổi các kho đó trước.", null);
                }
                await _unitTypeRepository.EnsureFacilityLinkAsync(request.FacilityID.Value, id, request.IsActive.Value, user.UserID, cancellationToken);
                if (entity.CreatedByUserID.HasValue && entity.FacilityUnitTypes.Count <= 1)
                {
                    entity.IsActive = request.IsActive.Value;
                }
            }
            else if (user.RoleID == 4)
            {
                entity.IsActive = request.IsActive.Value;
            }
        }

        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        var stats = await _unitTypeRepository.GetUsageStatsAsync(id, request.FacilityID, cancellationToken);
        int? ownerFacilityId = null;
        if (entity.CreatedByUserID.HasValue && entity.FacilityUnitTypes.Count == 1)
        {
            ownerFacilityId = entity.FacilityUnitTypes.First().FacilityID;
        }

        return (true, null, new UnitTypeResponse(
            entity.UnitTypeID,
            entity.TypeName,
            entity.Description,
            stats.UnitCount,
            entity.UnitTypeID,
            entity.TypeName,
            stats.IsActiveAtFacility,
            stats.UnitCount,
            stats.ReservationCount,
            stats.RateCount,
            ownerFacilityId));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(
        int id,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var (authorized, authError, _) = await CheckAuthorizationAsync(userEmail, null, cancellationToken);
        if (!authorized) return (false, authError);

        var entity = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "NOT_FOUND");

        var isUsed = await _unitTypeRepository.IsUsedAsync(id, cancellationToken);
        if (isUsed)
            return (false, "Không thể xóa loại kho đang được sử dụng bởi kho, đơn đặt chỗ hoặc bảng giá.");

        await _unitTypeRepository.RemoveFacilityLinksAsync(id, cancellationToken);
        _unitTypeRepository.Remove(entity);
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        return (true, null);
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
                var isManager = await _unitTypeRepository.IsFacilityManagerAsync(facilityId.Value, user.UserID, cancellationToken);
                if (!isManager)
                    return (false, "FORBIDDEN:Bạn không quản lý cơ sở này.", null);
            }
            return (true, null, user);
        }

        return (false, "FORBIDDEN:Chỉ Business Operations Manager hoặc Facility Manager mới được thao tác danh mục loại kho.", null);
    }

    private static string? NormalizeDescription(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
