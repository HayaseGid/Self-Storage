namespace SelfStorageAPI.Interfaces;

public record OperationsServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface IOperationsStateService
{
    Task<OperationsServiceResponse> GetStateAsync(string? queryEmail, string? headerEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> GetReportsAsync(string? headerEmail, CancellationToken cancellationToken);
}

