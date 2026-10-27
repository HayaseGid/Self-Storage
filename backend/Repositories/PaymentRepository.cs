using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class PaymentRepository : IPaymentRepository
{
    private readonly SelfStorageDbContext _context;
    private readonly IReservationHoldService _reservationHoldService;

    public PaymentRepository(SelfStorageDbContext context, IReservationHoldService reservationHoldService)
    {
        _context = context;
        _reservationHoldService = reservationHoldService;
    }

    public async Task<int?> GetCustomerIdByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<Reservation?> GetReservationWithDetailsAsync(int reservationId, int customerId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.AssignedUnit)
            .Include(r => r.Payments)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId, cancellationToken);
    }

    public async Task ReleaseExpiredReservationsAsync(DateTime now, CancellationToken cancellationToken)
    {
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);
    }

    public void AddPayment(Payment payment)
    {
        _context.Payments.Add(payment);
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
