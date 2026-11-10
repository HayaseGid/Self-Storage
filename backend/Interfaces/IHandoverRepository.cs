using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IHandoverRepository
{
    Task<Reservation?> GetReservationForHandoverAsync(int reservationId, CancellationToken cancellationToken);
    Task<User?> GetActiveStaffByEmailAsync(string email, CancellationToken cancellationToken);
    Task<bool> IsStaffAssignedToFacilityAsync(int staffUserId, int facilityId, CancellationToken cancellationToken);
    Task<bool> IsContractSignedAsync(int contractId, CancellationToken cancellationToken);
    Task<List<string>> GetUnitsOccupiedByOtherReservationsAsync(int reservationId, IReadOnlyCollection<int> unitIds, CancellationToken cancellationToken);
    Task<bool> IsAccessCodeTakenAsync(string accessCode, int excludeUserId, CancellationToken cancellationToken);
    void AddUnitAccess(UnitAccess access);
    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
