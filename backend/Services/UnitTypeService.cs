using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class UnitTypeService : IUnitTypeService
{
    private const int BusinessOperationsRoleId = 4;
    private readonly IUnitTypeRepository _unitTypeRepository;
    private readonly IUserRepository _userRepository;

    public UnitTypeService(IUnitTypeRepository unitTypeRepository, IUserRepository userRepository)
    {
        _unitTypeRepository = unitTypeRepository;
        _userRepository = userRepository;
    }

    public async Task<IReadOnlyList<UnitTypeResponse>> GetAllAsync(CancellationToken cancellationToken)
    {
        var unitTypes = await _unitTypeRepository.GetAllAsync(cancellationToken);
        var responses = new List<UnitTypeResponse>();
        foreach (var t in unitTypes)
        {
            var count = await _unitTypeRepository.GetStorageUnitCountAsync(t.UnitTypeID, cancellationToken);
            responses.Add(new UnitTypeResponse(t.UnitTypeID, t.TypeName, t.Description, count));
        }
        return responses;
    }

    public async Task<UnitTypeResponse?> GetByIdAsync(int id, CancellationToken cancellationToken)
    {
        var t = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (t == null) return null;
        var count = await _unitTypeRepository.GetStorageUnitCountAsync(t.UnitTypeID, cancellationToken);
        return new UnitTypeResponse(t.UnitTypeID, t.TypeName, t.Description, count);
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> CreateAsync(
        UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý loại kho.", null);

        var name = request.TypeName.Trim();
        if (await _unitTypeRepository.ExistsByNameAsync(name, null, cancellationToken))
            return (false, $"Loại kho \"{name}\" đã tồn tại.", null);

        var entity = new UnitType { TypeName = name, Description = NormalizeOptional(request.Description) };
        _unitTypeRepository.Add(entity);
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        return (true, null, new UnitTypeResponse(entity.UnitTypeID, entity.TypeName, entity.Description, 0));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> UpdateAsync(
        int id, UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý loại kho.", null);

        var entity = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "Không tìm thấy loại kho.", null);

        var name = request.TypeName.Trim();
        if (await _unitTypeRepository.ExistsByNameAsync(name, id, cancellationToken))
            return (false, $"Loại kho \"{name}\" đã tồn tại.", null);

        entity.TypeName = name;
        entity.Description = NormalizeOptional(request.Description);
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);

        var unitCount = await _unitTypeRepository.GetStorageUnitCountAsync(id, cancellationToken);
        return (true, null, new UnitTypeResponse(entity.UnitTypeID, entity.TypeName, entity.Description, unitCount));
    }

    public async Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(int id, string? userEmail, CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail))
            return (false, "Chỉ Business Operations Manager mới được quản lý loại kho.");

        var entity = await _unitTypeRepository.GetByIdAsync(id, cancellationToken);
        if (entity is null) return (false, "Không tìm thấy loại kho.");

        if (await _unitTypeRepository.IsUsedAsync(id, cancellationToken))
            return (false, "Không thể xóa loại kho đang được sử dụng bởi kho, đơn đặt chỗ hoặc bảng giá.");

        _unitTypeRepository.Remove(entity);
        await _unitTypeRepository.SaveChangesAsync(cancellationToken);
        return (true, null);
    }

    private async Task<bool> IsBusinessOperationsManagerAsync(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        var user = await _userRepository.GetUserByEmailAsync(email);
        return user != null && user.RoleID == BusinessOperationsRoleId && user.Status == "Active";
    }

    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}