using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IHandoverRepository
{
    Task<Reservation?> GetReservationForHandoverAsync(int reservationId, CancellationToken cancellationToken);
    Task<User?> GetActiveStaffByEmailAsync(string email, CancellationToken cancellationToken);
    Task<bool> IsStaffAssignedToFacilityAsync(int staffUserId, int facilityId, CancellationToken cancellationToken);
    void AddHandoverTask(HandoverTask task);
    void AddContract(Contract contract);
    void AddUnitAccess(UnitAccess access);
    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}