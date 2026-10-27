using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IUnitTypeService
{
    Task<IReadOnlyList<UnitTypeResponse>> GetAllAsync(int? facilityId = null, CancellationToken cancellationToken = default);
    Task<UnitTypeResponse?> GetByIdAsync(int id, int? facilityId = null, CancellationToken cancellationToken = default);
    Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> CreateAsync(UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> UpdateAsync(int id, UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(int id, string? userEmail, CancellationToken cancellationToken);
}
