using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IReservationHoldRepository
{
    Task<List<Reservation>> GetExpiredHoldsAsync(DateTime now, CancellationToken cancellationToken);
    Task<bool> HasAnotherActiveHoldAsync(int currentReservationId, int unitId, DateTime now, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}