using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public record ReservationServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface IReservationService
{
    Task<ReservationServiceResponse> CreateReservationAsync(CreateReservationDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<ReservationServiceResponse> GetByIdAsync(int id, string? userEmail, CancellationToken cancellationToken);
    Task<ReservationServiceResponse> GetForCustomerAsync(string pathEmail, string? userEmail, CancellationToken cancellationToken);
}