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
            .Include(u => u.UnitSize)
            .Include(u => u.RentalRate)
            .FirstOrDefaultAsync(u => u.UnitID == unitId && u.UnitNumber == unitNumber, cancellationToken);
    }

    public async Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.Status == "Active", cancellationToken);
    }

    public async Task<bool> HasConflictingReservationsAsync(int unitId, DateTime startDate, DateTime endDate, DateTime now, CancellationToken cancellationToken)
    {
        var today = now.Date;
        return await _context.ReservationUnits.AnyAsync(ru =>
            ru.UnitID == unitId &&
            (ru.Status == "Held" || ru.Status == "Active") &&
            (ru.Reservation.Status == ReservationStatus.PendingPayment ||
             ru.Reservation.Status == ReservationStatus.Paid ||
             ru.Reservation.Status == ReservationStatus.Confirmed ||
             ru.Reservation.Status == ReservationStatus.HandedOver) &&
            !(ru.Reservation.Status == ReservationStatus.PendingPayment && ru.Reservation.HoldExpiresAt <= now) &&
            ru.Reservation.StartDate <= endDate &&
            ((ru.Status == "Active" && ru.Reservation.EndDate < today) || ru.Reservation.EndDate >= startDate),
            cancellationToken);
    }

    public async Task<(byte DepositMonths, int HoldMinutes, decimal DiscountRate)> GetReservationPolicyAndDiscountAsync(int facilityId, int rentalMonths, CancellationToken cancellationToken)
    {
        var policy = await _context.RentalPolicies
            .Where(p => p.FacilityID == facilityId || p.FacilityID == null)
            .OrderBy(p => p.FacilityID != null ? 0 : 1)
            .FirstOrDefaultAsync(cancellationToken);

        var contractType = await _context.ContractTypes
            .FirstOrDefaultAsync(ct => ct.RentalMonths == rentalMonths, cancellationToken);

        return (
            policy?.DepositMonths ?? 2,
            policy?.HoldMinutes ?? 15,
            contractType?.DiscountRate ?? 0m
        );
    }

    public async Task ReleaseExpiredReservationsAsync(DateTime now, CancellationToken cancellationToken)
    {
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);
    }

    public async Task<Reservation?> GetReservationByIdAndCustomerAsync(int id, int customerId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.Customer)
            .Include(r => r.ReservationItems)
                .ThenInclude(ri => ri.UnitType)
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
            .Include(r => r.Charges)
            .FirstOrDefaultAsync(r => r.ReservationID == id && r.CustomerID == customerId, cancellationToken);
    }

    public async Task<List<Reservation>> GetCustomerReservationsAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.Customer)
            .Include(r => r.Facility)
            .Include(r => r.ReservationItems)
                .ThenInclude(ri => ri.UnitType)
            .Include(r => r.ReservationItems)
                .ThenInclude(ri => ri.UnitSize)
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
                    .ThenInclude(u => u.UnitSize)
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
                    .ThenInclude(u => u.UnitType)
            .Include(r => r.Payments)
            .Include(r => r.Charges)
            .Include(r => r.Contract)
            .Include(r => r.UnitAccesses)
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
