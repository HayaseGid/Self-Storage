using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IUnitSizeService
{
    Task<IReadOnlyList<UnitSizeResponse>> GetAllAsync(int? facilityId = null, CancellationToken cancellationToken = default);
    Task<UnitSizeResponse?> GetByIdAsync(int id, int? facilityId = null, CancellationToken cancellationToken = default);
    Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> CreateAsync(UpsertUnitSizeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage, UnitSizeResponse? Data)> UpdateAsync(int id, UpsertUnitSizeDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<(bool IsSuccess, string? ErrorMessage)> DeleteAsync(int id, string? userEmail, CancellationToken cancellationToken);
}
