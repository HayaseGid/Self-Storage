using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public record PaymentResultDTO(int PaymentId, string TransactionReference, decimal Amount, string ReservationStatus);

// Sử dụng StatusCode để báo lại cho Controller biết nên trả về lỗi HTTP 400, 404 hay 409
public record PaymentServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, PaymentResultDTO? Data);

public interface IPaymentService
{
    Task<PaymentServiceResponse> ConfirmPaymentAsync(CreatePaymentDTO request, string? userEmail, CancellationToken cancellationToken);
}