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

        return await _paymentRepository.ExecuteInTransactionAsync(async () =>
        {
            var now = DateTime.UtcNow;
            await _paymentRepository.ReleaseExpiredReservationsAsync(now, cancellationToken);

            var reservation = await _paymentRepository.GetReservationWithDetailsAsync(request.ReservationID, customerId.Value, cancellationToken);
            if (reservation == null) 
                return new PaymentServiceResponse(false, "Không tìm thấy Reservation.", 404, null);

            if (reservation.Status == ReservationStatus.Expired)
            {
                await _paymentRepository.SaveChangesAsync(cancellationToken);
                return new PaymentServiceResponse(false, "Thời gian giữ kho đã hết. Vui lòng tạo đặt chỗ mới.", 409, null);
            }

            if (reservation.Status != ReservationStatus.PendingPayment)
                return new PaymentServiceResponse(false, "Đặt chỗ không ở trạng thái chờ thanh toán hoặc đã được thanh toán.", 409, null);

            var unpaidDeposits = reservation.Charges
                .Where(c => c.ChargeType == "Deposit" && c.Status == "Unpaid")
                .ToList();

            var firstMonthRents = reservation.Charges
                .Where(c => c.ChargeType == "Rent" && c.Status == "Unpaid" && c.PeriodStart == reservation.StartDate.Date)
                .ToList();

            var depositSum = unpaidDeposits.Sum(c => c.Amount);
            var depositAndFirstRentSum = depositSum + firstMonthRents.Sum(c => c.Amount);

            List<Charge> chargesToSettle;
            if (request.Amount == depositSum && depositSum > 0)
            {
                chargesToSettle = unpaidDeposits;
            }
            else if (request.Amount == depositAndFirstRentSum && depositAndFirstRentSum > 0)
            {
                chargesToSettle = unpaidDeposits.Concat(firstMonthRents).ToList();
            }
            else
            {
                return new PaymentServiceResponse(
                    false,
                    $"Số tiền thanh toán phải đúng bằng tiền cọc ({depositSum:N0}) hoặc tiền cọc + tháng đầu ({depositAndFirstRentSum:N0}).",
                    400,
                    null);
            }

            if (reservation.Payments.Any(p => p.Status == "Completed" && p.Direction == "Collection"))
                return new PaymentServiceResponse(false, "Đặt chỗ đã có giao dịch thanh toán thành công.", 409, null);

            var orderCode = $"ORD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}";
            var providerTxn = $"SIM-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";

            // Bước 1: Tạo Payment ở trạng thái Pending (theo ràng buộc TR_Payment_Validate)
            var payment = new Payment
            {
                ReservationID = request.ReservationID,
                OrderCode = orderCode,
                IdempotencyKey = $"PAY-{request.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Simulator",
                Direction = "Collection",
                Amount = request.Amount,
                PaymentMethod = string.IsNullOrWhiteSpace(request.PaymentType) ? "QR" : request.PaymentType,
                Status = "Pending",
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(15),
                CreatedByUserID = customerId.Value
            };

            _paymentRepository.AddPayment(payment);
            await _paymentRepository.SaveChangesAsync(cancellationToken);

            // Bước 2: Gán PaymentID vào các khoản Charge được tất toán
            foreach (var charge in chargesToSettle)
            {
                charge.PaymentID = payment.PaymentID;
            }
            await _paymentRepository.SaveChangesAsync(cancellationToken);

            // Bước 3: Xác nhận Payment Completed
            payment.Status = "Completed";
            payment.ProviderTransactionId = providerTxn;
            payment.ReceivedAmount = payment.Amount;
            payment.ConfirmedAt = now;
            await _paymentRepository.SaveChangesAsync(cancellationToken);

            // Bước 4: Đánh dấu các Charge là Paid
            foreach (var charge in chargesToSettle)
            {
                charge.Status = "Paid";
                charge.PaidAt = now;
            }
            await _paymentRepository.SaveChangesAsync(cancellationToken);

            // Bước 5: Chuyển trạng thái Reservation sang Paid
            reservation.Status = ReservationStatus.Paid;
            reservation.PaidAt = now;
            await _paymentRepository.SaveChangesAsync(cancellationToken);

            var data = new PaymentResultDTO(payment.PaymentID, providerTxn, payment.Amount, reservation.Status);
            return new PaymentServiceResponse(true, "Thanh toán thành công. Đơn hàng chuyển sang chờ phân kho.", 200, data);
        }, cancellationToken);
    }
}
