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
            .Include(reservation => reservation.AssignedUnit)
            .Where(reservation =>
                reservation.Status == ReservationStatus.PendingDeposit &&
                reservation.DepositExpiresAt <= now)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasAnotherActiveHoldAsync(int currentReservationId, int unitId, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.Reservations.AnyAsync(other =>
            other.ReservationID != currentReservationId &&
            other.AssignedUnitID == unitId &&
            other.Status == ReservationStatus.PendingDeposit &&
            other.DepositExpiresAt > now,
            cancellationToken);
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}