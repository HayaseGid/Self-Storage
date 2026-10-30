using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IPaymentRepository
{
    Task<int?> GetCustomerIdByEmailAsync(string email, CancellationToken cancellationToken);
    Task<Reservation?> GetReservationWithDetailsAsync(int reservationId, int customerId, CancellationToken cancellationToken);
    Task ReleaseExpiredReservationsAsync(DateTime now, CancellationToken cancellationToken);
    void AddPayment(Payment payment);
    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}