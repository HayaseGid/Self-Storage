using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class ReservationHoldRepository : IReservationHoldRepository
{
    private readonly SelfStorageDbContext _context;

    public ReservationHoldRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<List<Reservation>> GetExpiredHoldsAsync(DateTime now, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(reservation => reservation.ReservationUnits)
            .Include(reservation => reservation.Charges)
            .Where(reservation =>
                reservation.Status == ReservationStatus.PendingPayment &&
                reservation.HoldExpiresAt <= now)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasAnotherActiveHoldAsync(int currentReservationId, int unitId, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.ReservationUnits.AnyAsync(ru =>
            ru.ReservationID != currentReservationId &&
            ru.UnitID == unitId &&
            ru.Status == "Held" &&
            ru.Reservation.Status == ReservationStatus.PendingPayment &&
            ru.Reservation.HoldExpiresAt > now,
            cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
