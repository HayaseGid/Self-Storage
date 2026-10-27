namespace SelfStorageAPI.Interfaces;

public interface IReservationHoldService
{
    Task ReleaseExpiredAsync(DateTime now, CancellationToken cancellationToken);
}