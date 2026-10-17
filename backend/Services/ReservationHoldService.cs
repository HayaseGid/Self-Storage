using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;

namespace SelfStorageAPI.Services;

public static class ReservationHoldService
{
    public static async Task ReleaseExpiredAsync(
        SelfStorageDbContext context,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var expiredReservations = await context.Reservations
            .Include(reservation => reservation.AssignedUnit)
            .Where(reservation =>
                reservation.Status == ReservationStatus.PendingDeposit &&
                reservation.DepositExpiresAt <= now)
            .ToListAsync(cancellationToken);

        foreach (var reservation in expiredReservations)
        {
            reservation.Status = ReservationStatus.Expired;
            var unit = reservation.AssignedUnit;
            if (unit is null || unit.Status != UnitStatus.Booking)
                continue;

            var anotherActiveHold = await context.Reservations.AnyAsync(other =>
                other.ReservationID != reservation.ReservationID &&
                other.AssignedUnitID == unit.UnitID &&
                other.Status == ReservationStatus.PendingDeposit &&
                other.DepositExpiresAt > now,
                cancellationToken);

            if (!anotherActiveHold)
            {
                unit.Status = unit.StatusBeforeBooking ?? UnitStatus.Available;
                unit.StatusBeforeBooking = null;
            }
        }

        if (expiredReservations.Count > 0)
            await context.SaveChangesAsync(cancellationToken);
    }
}
