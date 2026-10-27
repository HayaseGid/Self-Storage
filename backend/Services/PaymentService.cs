using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class PaymentService : IPaymentService
{
    private readonly IPaymentRepository _paymentRepository;

    public PaymentService(IPaymentRepository paymentRepository)
    {
        _paymentRepository = paymentRepository;
    }

    public async Task<PaymentServiceResponse> ConfirmPaymentAsync(CreatePaymentDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userEmail))
            return new PaymentServiceResponse(false, "Không có quyền truy cập.", 401, null);

        var customerId = await _paymentRepository.GetCustomerIdByEmailAsync(userEmail, cancellationToken);
        if (!customerId.HasValue)
            return new PaymentServiceResponse(false, "Không tìm thấy tài khoản khách hàng.", 401, null);

        // Đẩy toàn bộ logic nghiệp vụ vào trong block Transaction
        return await _paymentRepository.ExecuteInTransactionAsync(async () =>
        {
            await _paymentRepository.ReleaseExpiredReservationsAsync(DateTime.UtcNow, cancellationToken);

            var reservation = await _paymentRepository.GetReservationWithDetailsAsync(request.ReservationID, customerId.Value, cancellationToken);
            if (reservation == null) 
                return new PaymentServiceResponse(false, "Không tìm thấy Reservation.", 404, null);

            if (reservation.Status == ReservationStatus.Expired)
            {
                await _paymentRepository.SaveChangesAsync(cancellationToken); // Lưu trạng thái Expired
                return new PaymentServiceResponse(false, "Thời gian giữ kho 10 phút đã hết. Vui lòng tạo đặt chỗ mới.", 409, null);
            }

            if (reservation.Status != ReservationStatus.PendingDeposit)
                return new PaymentServiceResponse(false, "Đặt chỗ không ở trạng thái chờ thanh toán hoặc đã được thanh toán.", 409, null);

            if (request.Amount <= 0 || request.Amount != reservation.DepositAmount)
                return new PaymentServiceResponse(false, $"Số tiền thanh toán phải đúng bằng tiền cọc {reservation.DepositAmount}.", 400, null);

            if (reservation.Payments.Any(p => p.PaymentStatus == "Completed"))
                return new PaymentServiceResponse(false, "Đặt chỗ đã có giao dịch thanh toán thành công.", 409, null);

            var payment = new Payment
            {
                ReservationID = request.ReservationID,
                TransactionReference = $"TXN-{Guid.NewGuid():N}",
                Amount = request.Amount,
                PaymentType = request.PaymentType,
                PaymentDate = DateTime.Today,
                PaymentStatus = "Completed"
            };

            _paymentRepository.AddPayment(payment);
            reservation.Status = ReservationStatus.Paid;

            if (reservation.AssignedUnit?.Status == UnitStatus.Booking)
            {
                reservation.AssignedUnit.Status = UnitStatus.Reserved;
                reservation.AssignedUnit.StatusBeforeBooking = null;
            }

            await _paymentRepository.SaveChangesAsync(cancellationToken);

            var data = new PaymentResultDTO(payment.PaymentID, payment.TransactionReference, payment.Amount, reservation.Status);
            return new PaymentServiceResponse(true, "Thanh toán thành công. Đơn hàng chuyển sang chờ phân kho.", 200, data);

        }, cancellationToken);
    }
}