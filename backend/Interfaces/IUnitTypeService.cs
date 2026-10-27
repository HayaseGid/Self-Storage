using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IUnitTypeService
{
    Task<IReadOnlyList<UnitTypeResponse>> GetAllAsync(CancellationToken cancellationToken);
    Task<UnitTypeResponse?> GetByIdAsync(int id, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> CreateAsync(UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage, UnitTypeResponse? Data)> UpdateAsync(int id, UpsertUnitTypeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(int id, string? userEmail, CancellationToken cancellationToken);
}