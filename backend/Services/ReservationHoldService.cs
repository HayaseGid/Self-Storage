using SelfStorageAPI.Constants;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

// Đã bỏ chữ "static"
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
            var unit = reservation.AssignedUnit;
            
            if (unit is null || unit.Status != UnitStatus.Booking)
                continue;

            var anotherActiveHold = await _repository.HasAnotherActiveHoldAsync(
                reservation.ReservationID, 
                unit.UnitID, 
                now, 
                cancellationToken);

            if (!anotherActiveHold)
            {
                unit.Status = unit.StatusBeforeBooking ?? UnitStatus.Available;
                unit.StatusBeforeBooking = null;
            }
        }

        if (expiredReservations.Count > 0)
        {
            await _repository.SaveChangesAsync(cancellationToken);
        }
    }
}