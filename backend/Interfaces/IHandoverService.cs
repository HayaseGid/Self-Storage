using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public record HandoverServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface IHandoverService
{
    Task<HandoverServiceResponse> CompleteHandoverAsync(CompleteHandoverDTO request, string? staffEmail, CancellationToken cancellationToken);
}