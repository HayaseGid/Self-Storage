using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IReservationRepository
{
    Task<User?> GetActiveCustomerByEmailAsync(string email, CancellationToken cancellationToken);
    Task<StorageUnit?> GetStorageUnitWithTypeAsync(int unitId, string unitNumber, CancellationToken cancellationToken);
    Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken);
    Task<bool> HasConflictingReservationsAsync(int unitId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken);
    Task<(byte DepositMonths, int HoldMinutes, decimal DiscountRate)> GetReservationPolicyAndDiscountAsync(int facilityId, int rentalMonths, CancellationToken cancellationToken);
    Task ReleaseExpiredReservationsAsync(DateTime now, CancellationToken cancellationToken);
    Task<Reservation?> GetReservationByIdAndCustomerAsync(int id, int customerId, CancellationToken cancellationToken);
    Task<List<Reservation>> GetCustomerReservationsAsync(string email, CancellationToken cancellationToken);

    void AddReservation(Reservation reservation);
    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
