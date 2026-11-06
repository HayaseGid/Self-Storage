using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class ManagerToolsRepository : IManagerToolsRepository
{
    private readonly SelfStorageDbContext _context;

    public ManagerToolsRepository(SelfStorageDbContext context)
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

    public Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken)
        => _context.Facilities.AnyAsync(f => f.FacilityID == facilityId, cancellationToken);

    public Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
        => _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.ManagerID == userId, cancellationToken);

    public Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
        => _context.FacilityStaffs.AnyAsync(fs =>
            fs.UserID == userId && fs.FacilityID == facilityId && fs.Status == "Active", cancellationToken);

    public Task<FacilityStaff?> GetFacilityStaffAsync(int facilityId, int staffUserId, CancellationToken cancellationToken)
        => _context.FacilityStaffs
            .Include(fs => fs.User)
            .FirstOrDefaultAsync(fs => fs.FacilityID == facilityId && fs.UserID == staffUserId, cancellationToken);

    public Task<int> CountOpenTasksAsync(int facilityId, int staffUserId, CancellationToken cancellationToken)
        => _context.HandoverTasks.CountAsync(t =>
            t.FacilityID == facilityId &&
            t.AssignedStaffID == staffUserId &&
            (t.Status == "Scheduled" || t.Status == "In Progress"), cancellationToken);

    public Task<Reservation?> GetReservationWithUnitsAsync(int reservationId, CancellationToken cancellationToken)
        => _context.Reservations
            .Include(r => r.ReservationUnits)
                .ThenInclude(ru => ru.Unit)
            .Include(r => r.HandoverTasks)
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);

    public Task<StorageUnit?> GetUnitAsync(int unitId, CancellationToken cancellationToken)
        => _context.StorageUnits.FirstOrDefaultAsync(u => u.UnitID == unitId, cancellationToken);

    public Task<HandoverTask?> GetTaskAsync(int taskId, CancellationToken cancellationToken)
        => _context.HandoverTasks.FirstOrDefaultAsync(t => t.TaskID == taskId, cancellationToken);

    public async Task<List<HandoverTask>> GetFacilityTasksAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.HandoverTasks
            .AsNoTracking()
            .Include(t => t.Unit)
            .Include(t => t.AssignedStaff)
            .Include(t => t.Reservation)
                .ThenInclude(r => r!.Customer)
            .Where(t => t.FacilityID == facilityId)
            .OrderBy(t => t.Status == "Completed" || t.Status == "Cancelled") // việc chưa xong lên trước
            .ThenBy(t => t.ScheduledDate)
            .ThenBy(t => t.ScheduledTime)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<Payment>> GetCompletedPaymentsAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Payments
            .AsNoTracking()
            .Where(p => p.Reservation.FacilityID == facilityId && p.Status == "Completed")
            .ToListAsync(cancellationToken);
    }

    public async Task<List<Charge>> GetChargesAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Charges
            .AsNoTracking()
            .Where(c => c.Reservation.FacilityID == facilityId)
            .ToListAsync(cancellationToken);
    }

    public async Task<Dictionary<string, int>> CountReservationsByStatusAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Where(r => r.FacilityID == facilityId)
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, cancellationToken);
    }

    public async Task<Dictionary<string, int>> CountUnitsByStatusAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.StorageUnits
            .Where(u => u.FacilityID == facilityId)
            .GroupBy(u => u.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, cancellationToken);
    }

    public async Task<List<User>> GetActiveStaffAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.FacilityStaffs
            .AsNoTracking()
            .Where(fs => fs.FacilityID == facilityId && fs.Status == "Active" &&
                         fs.User.Status == "Active" && fs.User.RoleID == 2)
            .Select(fs => fs.User)
            .OrderBy(u => u.FullName)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<HandoverTask>> GetStaffTasksInRangeAsync(IReadOnlyCollection<int> staffIds, DateTime from, DateTime to, CancellationToken cancellationToken)
    {
        if (staffIds.Count == 0) return new List<HandoverTask>();
        var start = from.Date;
        var end = to.Date;
        return await _context.HandoverTasks
            .AsNoTracking()
            .Include(t => t.Unit)
            .Include(t => t.Reservation)
            .Where(t => staffIds.Contains(t.AssignedStaffID) &&
                        t.Status != "Cancelled" &&
                        t.ScheduledDate != null &&
                        t.ScheduledDate >= start && t.ScheduledDate <= end)
            .ToListAsync(cancellationToken);
    }

    public async Task<List<Reservation>> GetReservationsNeedingMoveInAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.Reservations
            .Include(r => r.ReservationUnits)
            .Include(r => r.HandoverTasks)
            .Where(r => r.FacilityID == facilityId &&
                        (r.Status == ReservationStatus.Paid || r.Status == ReservationStatus.Confirmed) &&
                        r.ReservationUnits.Any(ru => ru.Status == "Held" &&
                            !r.HandoverTasks.Any(t => t.ReservationUnitID == ru.ReservationUnitID &&
                                                      t.TaskType == "Move In" &&
                                                      t.Status != "Cancelled")))
            .ToListAsync(cancellationToken);
    }

    public async Task<List<HandoverTask>> GetUnitReportsAsync(int facilityId, CancellationToken cancellationToken)
    {
        return await _context.HandoverTasks
            .AsNoTracking()
            .Include(t => t.Unit)
            .Include(t => t.AssignedStaff)
            .Where(t => t.FacilityID == facilityId &&
                        t.TaskType == "Inspection" &&
                        t.Status == "Completed" &&
                        t.ConditionResult != null)
            .OrderByDescending(t => t.ActualAt)
            .Take(200)
            .ToListAsync(cancellationToken);
    }

    public void AddTask(HandoverTask task) => _context.HandoverTasks.Add(task);

    public async Task SetAuditContextAsync(int userId, string source, CancellationToken cancellationToken)
    {
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
