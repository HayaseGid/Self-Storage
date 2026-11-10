using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class StaffToolsRepository : IStaffToolsRepository
{
    private readonly SelfStorageDbContext _context;

    public StaffToolsRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = email.Trim();
        return await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == normalized && u.Status == "Active", cancellationToken);
    }

    public async Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
    {
        return await _context.FacilityStaffs.AnyAsync(fs =>
            fs.UserID == userId &&
            fs.FacilityID == facilityId &&
            fs.Status == "Active", cancellationToken);
    }

    public async Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Facilities.AnyAsync(f =>
            f.FacilityID == facilityId &&
            f.ManagerID == userId, cancellationToken);
    }

    public async Task<Reservation?> GetReservationForConfirmAsync(int reservationId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.ReservationItems)
            .Include(r => r.ReservationUnits)
            .Include(r => r.Payments)
            .Include(r => r.Contract)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);
    }

    public async Task<StorageUnit?> GetUnitAsync(int unitId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .FirstOrDefaultAsync(u => u.UnitID == unitId, cancellationToken);
    }

    public async Task<bool> HasActiveReservationOnUnitAsync(int unitId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        return await _context.ReservationUnits.AnyAsync(ru =>
            ru.UnitID == unitId &&
            (ru.Status == "Held" || ru.Status == "Active") &&
            (ru.Reservation.Status == ReservationStatus.Paid ||
             ru.Reservation.Status == ReservationStatus.Confirmed ||
             ru.Reservation.Status == ReservationStatus.HandedOver ||
             (ru.Reservation.Status == ReservationStatus.PendingPayment && ru.Reservation.HoldExpiresAt > now)),
            cancellationToken);
    }

    public Task<bool> HasMoveOutInProgressAsync(int unitId, CancellationToken cancellationToken)
        => _context.HandoverTasks.AnyAsync(t =>
            t.UnitID == unitId && t.TaskType == "Move Out" && t.Status == "In Progress", cancellationToken);

    public async Task<List<HandoverTask>> GetTasksForStaffAsync(int staffUserId, int? facilityId, CancellationToken cancellationToken)
    {
        var query = _context.HandoverTasks
            .AsNoTracking()
            .Include(t => t.Facility)
            .Include(t => t.Unit)
            .Include(t => t.Reservation)
                .ThenInclude(r => r!.Customer)
            .Where(t => t.AssignedStaffID == staffUserId);

        if (facilityId.HasValue)
            query = query.Where(t => t.FacilityID == facilityId.Value);

        return await query
            .OrderBy(t => t.Status == "Completed" || t.Status == "Cancelled") // việc chưa xong lên trước
            .ThenBy(t => t.ScheduledDate)
            .ThenBy(t => t.ScheduledTime)
            .ToListAsync(cancellationToken);
    }

    public void AddContract(Contract contract) => _context.Contracts.Add(contract);

    public void AddTask(HandoverTask task) => _context.HandoverTasks.Add(task);

    public async Task SetAuditContextAsync(int userId, string source, CancellationToken cancellationToken)
    {
        if (_context.Database.ProviderName?.Contains("SqlServer", StringComparison.OrdinalIgnoreCase) != true)
            return;

        // Chạy trong transaction nên cùng một kết nối: trigger sau đó đọc được SESSION_CONTEXT.
        await _context.Database.ExecuteSqlInterpolatedAsync(
            $"EXEC sp_set_session_context @key = N'UserID', @value = {userId}; EXEC sp_set_session_context @key = N'Source', @value = {source};",
            cancellationToken);
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

    public Task SaveChangesAsync(CancellationToken cancellationToken) => _context.SaveChangesAsync(cancellationToken);
}
