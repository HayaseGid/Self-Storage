using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class ReservationRepository : IReservationRepository
{
    private readonly SelfStorageDbContext _context;
    private readonly IReservationHoldService _reservationHoldService;

    public ReservationRepository(SelfStorageDbContext context, IReservationHoldService reservationHoldService)
    {
        _context = context;
        _reservationHoldService = reservationHoldService;
    }

    public async Task<User?> GetActiveCustomerByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email && u.RoleID == 1 && u.Status == "Active", cancellationToken);
    }

    public async Task<StorageUnit?> GetStorageUnitWithTypeAsync(int unitId, string unitNumber, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Include(u => u.UnitType)
            .FirstOrDefaultAsync(u => u.UnitID == unitId && u.UnitNumber == unitNumber, cancellationToken);
    }

    public async Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.Status == "Active", cancellationToken);
    }

    public async Task<bool> HasConflictingReservationsAsync(int unitId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken)
    {
        return await _context.Reservations.AnyAsync(r =>
            r.AssignedUnitID == unitId &&
            r.Status != ReservationStatus.Cancelled &&
            r.Status != ReservationStatus.Expired &&
            ((r.Status == ReservationStatus.PendingDeposit && r.DepositExpiresAt > now) ||
             (r.Status != ReservationStatus.PendingDeposit && r.StartDate <= endDate && r.EndDate >= startDate)),
            cancellationToken);
    }

    public async Task<decimal> GetFacilityDepositPercentAsync(int facilityId, CancellationToken cancellationToken)
    {
        var policy = await _context.RentalPolicies.FirstOrDefaultAsync(p => p.FacilityID == facilityId, cancellationToken);
        return policy?.DepositPercent ?? 20m;
    }

    public async Task ReleaseExpiredReservationsAsync(DateTime now, CancellationToken cancellationToken)
    {
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);
    }

    public async Task<Reservation?> GetReservationByIdAndCustomerAsync(int id, int customerId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.Customer)
            .Include(r => r.AssignedUnit)
            .FirstOrDefaultAsync(r => r.ReservationID == id && r.CustomerID == customerId, cancellationToken);
    }

    public async Task<List<Reservation>> GetCustomerReservationsAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.Customer)
            .Include(r => r.Facility)
            .Include(r => r.AssignedUnit)
                .ThenInclude(u => u.UnitSize)
            .Include(r => r.UnitType)
            .Include(r => r.Payments)
            .Include(r => r.Contract)
                .ThenInclude(c => c.UnitAccesses)
            .Where(r => r.Customer.Email == email)
            .OrderByDescending(r => r.StartDate)
            .ToListAsync(cancellationToken);
    }

    public void AddReservation(Reservation reservation)
    {
        _context.Reservations.Add(reservation);
    }

    public async Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var result = await action();
            await transaction.CommitAsync(cancellationToken);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}
