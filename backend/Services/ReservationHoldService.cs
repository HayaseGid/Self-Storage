using SelfStorageAPI.Constants;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

public class ReservationHoldService : IReservationHoldService
{
    private readonly IReservationHoldRepository _repository;

    public ReservationHoldService(IReservationHoldRepository repository)
    {
        _repository = repository;
    }

    public async Task ReleaseExpiredAsync(DateTime now, CancellationToken cancellationToken)
    {
        var expiredReservations = await _repository.GetExpiredHoldsAsync(now, cancellationToken);

        foreach (var reservation in expiredReservations)
        {
            reservation.Status = ReservationStatus.Expired;
            foreach (var ru in reservation.ReservationUnits.Where(u => u.Status == "Held"))
            {
                ru.Status = "Released";
                ru.ReleasedAt = now;
            }
            foreach (var charge in reservation.Charges.Where(c => c.Status == "Unpaid"))
            {
                charge.Status = "Cancelled";
            }
        }

        if (expiredReservations.Count > 0)
        {
            await _repository.SaveChangesAsync(cancellationToken);
        }
    }
}
