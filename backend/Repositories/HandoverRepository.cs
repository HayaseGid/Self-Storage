using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
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
            .Include(r => r.Facility)
            .Include(r => r.Payments)
            .Include(r => r.Charges)
            .Include(r => r.Contract)
            .Include(r => r.HandoverTasks)
                .ThenInclude(t => t.AssignedStaff)
            .AsSplitQuery()
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

    // Chỉ kiểm tra có chữ ký hay không, không tải ảnh chữ ký (base64 rất nặng)
    public Task<bool> IsContractSignedAsync(int contractId, CancellationToken cancellationToken)
        => _context.ContractSignatures.AnyAsync(s => s.ContractID == contractId, cancellationToken);

    // Kho đang có người khác dùng thật sự: dòng ReservationUnit "Active" của đơn khác (kể cả đơn đã quá hạn chưa trả)
    public async Task<List<string>> GetUnitsOccupiedByOtherReservationsAsync(int reservationId, IReadOnlyCollection<int> unitIds, CancellationToken cancellationToken)
    {
        return await _context.ReservationUnits
            .Where(ru => unitIds.Contains(ru.UnitID) &&
                         ru.ReservationID != reservationId &&
                         ru.Status == "Active" &&
                         ru.Reservation.Status == ReservationStatus.HandedOver)
            .Select(ru => ru.Unit.UnitNumber)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> IsAccessCodeTakenAsync(string accessCode, int excludeUserId, CancellationToken cancellationToken)
    {
        return await _context.Users
            .AnyAsync(u => u.AccessCode == accessCode && u.UserID != excludeUserId, cancellationToken);
    }

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
