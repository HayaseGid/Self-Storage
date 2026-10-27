using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class HandoverRepository : IHandoverRepository
{
    private readonly SelfStorageDbContext _context;

    public HandoverRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<Reservation?> GetReservationForHandoverAsync(int reservationId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
            .Include(r => r.Customer)
            .Include(r => r.Payments)
            .Include(r => r.Contract)
            .Include(r => r.HandoverTasks)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);
    }

    public async Task<User?> GetActiveStaffByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users
            .FirstOrDefaultAsync(u => u.Email == email && u.RoleID == 2 && u.Status == "Active", cancellationToken);
    }

    public async Task<bool> IsStaffAssignedToFacilityAsync(int staffUserId, int facilityId, CancellationToken cancellationToken)
    {
        return await _context.FacilityStaffs.AnyAsync(fs =>
            fs.UserID == staffUserId &&
            fs.FacilityID == facilityId &&
            fs.Status == "Active", cancellationToken);
    }

    public void AddHandoverTask(HandoverTask task) => _context.HandoverTasks.Add(task);
    public void AddContract(Contract contract) => _context.Contracts.Add(contract);
    public void AddUnitAccess(UnitAccess access) => _context.UnitAccesses.Add(access);

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
