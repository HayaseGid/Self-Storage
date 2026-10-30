namespace SelfStorageAPI.Interfaces;

public record CatalogServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface ICatalogService
{
    Task<CatalogServiceResponse> GetCatalogStateAsync(CancellationToken cancellationToken);
    Task<CatalogServiceResponse> GetAvailabilityAsync(int facilityId, int unitTypeId, DateTime startDate, int months, CancellationToken cancellationToken);
}