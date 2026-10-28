using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class UnitSizeService : IUnitSizeService
{
    private const int BusinessOperationsRoleId = 4;
    private readonly IUnitSizeRepository _unitSizeRepository;
    private readonly IUserRepository _userRepository;

    public UnitSizeService(IUnitSizeRepository unitSizeRepository, IUserRepository userRepository)
    {
        _unitSizeRepository = unitSizeRepository;
        _userRepository = userRepository;
    }

    public async Task<IReadOnlyList<UnitSizeResponse>> GetAllAsync(CancellationToken cancellationToken)
    {
        var unitSizes = await _unitSizeRepository.GetAllAsync(cancellationToken);
        var responses = new List<UnitSizeResponse>();
        foreach (var s in unitSizes)
        {
            var count = await _unitSizeRepository.GetStorageUnitCountAsync(s.UnitSizeID, cancellationToken);
            responses.Add(new UnitSizeResponse(s.UnitSizeID, s.Dimensions, s.Volume, count));
        }
        return responses;
    }

    public async Task<UnitSizeResponse?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        var s = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (s is null) return null;
        var count = await _unitSizeRepository.GetStorageUnitCountAsync(s.UnitSizeID, cancellationToken);
        return new UnitSizeResponse(s.UnitSizeID, s.Dimensions, s.Volume, count);
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> CreateAsync(
        UpsertUnitSizeDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý kích thước kho.", null);

        var dimensions = request.Dimensions.Trim();
        if (await _unitSizeRepository.ExistsByDimensionsAsync(dimensions, null, cancellationToken))
            return (false, $"Kích thước \"{dimensions}\" đã tồn tại.", null);

        var entity = new UnitSize { IsActive = true, CreatedAt = DateTime.UtcNow };
        await _unitSizeRepository.PopulateSizeFieldsAsync(entity, dimensions, request.Volume, cancellationToken);
        _unitSizeRepository.Add(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        return (true, null, new UnitSizeResponse(entity.UnitSizeID, entity.Dimensions, entity.Volume, 0));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> UpdateAsync(
        int id, UpsertUnitSizeDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý kích thước kho.", null);

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "Không tìm thấy kích thước kho.", null);

        var dimensions = request.Dimensions.Trim();
        if (await _unitSizeRepository.ExistsByDimensionsAsync(dimensions, id, cancellationToken))
            return (false, $"Kích thước \"{dimensions}\" đã tồn tại.", null);

        var isUsed = await _unitSizeRepository.IsUsedByUnitsOrRatesAsync(id, cancellationToken);
        if (isUsed)
        {
            // Theo TR_UnitSize_Validate: Size đang được dùng không được đổi WidthM/LengthM/HeightM/SizeCategoryID
            if (dimensions.Contains(':'))
            {
                var parts = dimensions.Split(':', 2, StringSplitOptions.TrimEntries);
                entity.DisplayName = string.IsNullOrWhiteSpace(parts[1]) ? dimensions : parts[1];
            }
            else
            {
                entity.DisplayName = dimensions;
            }
        }
        else
        {
            await _unitSizeRepository.PopulateSizeFieldsAsync(entity, dimensions, request.Volume, cancellationToken);
        }

        await _unitSizeRepository.SaveChangesAsync(cancellationToken);

        var unitCount = await _unitSizeRepository.GetStorageUnitCountAsync(id, cancellationToken);
        return (true, null, new UnitSizeResponse(entity.UnitSizeID, entity.Dimensions, entity.Volume, unitCount));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(int id, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý kích thước kho.");

        var entity = await _unitSizeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "Không tìm thấy kích thước kho.");

        if (await _unitSizeRepository.IsUsedByUnitsOrRatesAsync(id, cancellationToken))
            return (false, "Không thể xóa kích thước đang được sử dụng bởi kho hoặc bảng giá.");

        _unitSizeRepository.Remove(entity);
        await _unitSizeRepository.SaveChangesAsync(cancellationToken);
        return (true, null);
    }

    private async Task<bool> IsBusinessOperationsManagerAsync(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var user = await _userRepository.GetUserByEmailAsync(email);
        return user != null && user.RoleID == BusinessOperationsRoleId && user.Status == "Active";
    }
}
