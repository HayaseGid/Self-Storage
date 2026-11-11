using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Repositories;

public class LateFeeRepository : ILateFeeRepository
{
    private readonly SelfStorageDbContext _context;

    public LateFeeRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        var normalized = email.Trim();
        return await _context.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email == normalized && u.Status == "Active", cancellationToken);
    }

    public Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken)
        => _context.Facilities.AnyAsync(f => f.FacilityID == facilityId, cancellationToken);

    public Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
        => _context.Facilities.AnyAsync(f => f.FacilityID == facilityId && f.ManagerID == userId, cancellationToken);

    public Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken)
        => _context.FacilityStaffs.AnyAsync(fs =>
            fs.UserID == userId && fs.FacilityID == facilityId && fs.Status == "Active", cancellationToken);

    private IQueryable<Reservation> WithDetails() => _context.Reservations
        .Include(r => r.Customer)
        .Include(r => r.Contract)
        .Include(r => r.Charges)
        .Include(r => r.Payments)
        .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit)
        .AsSplitQuery();

    // Đơn đang thuê (tính phí trễ) + đơn đã trả kho nhưng còn khoản phí chưa đóng (để theo dõi công nợ)
    private static IQueryable<Reservation> InScope(IQueryable<Reservation> query) => query.Where(r =>
        r.Status == ReservationStatus.HandedOver ||
        (r.Status == ReservationStatus.Completed &&
         r.Charges.Any(c => (c.ChargeType == "LateFee" || c.ChargeType == "ExtraFee") && c.Status == "Unpaid")));

    public Task<List<Reservation>> GetFacilityReservationsAsync(int facilityId, CancellationToken cancellationToken)
        => InScope(WithDetails().Where(r => r.FacilityID == facilityId))
            .OrderBy(r => r.ReservationID)
            .ToListAsync(cancellationToken);

    public Task<List<Reservation>> GetCustomerReservationsAsync(int customerId, CancellationToken cancellationToken)
        => InScope(WithDetails().Where(r => r.CustomerID == customerId))
            .OrderBy(r => r.ReservationID)
            .ToListAsync(cancellationToken);

    public Task<Reservation?> GetReservationAsync(int reservationId, CancellationToken cancellationToken)
        => WithDetails().FirstOrDefaultAsync(r => r.ReservationID == reservationId, cancellationToken);

    public Task<Charge?> GetChargeAsync(int chargeId, CancellationToken cancellationToken)
        => _context.Charges
            .Include(c => c.Reservation)
            .Include(c => c.Payment)
            .FirstOrDefaultAsync(c => c.ChargeID == chargeId, cancellationToken);

    public Task<int?> GetLateFeePolicyIdAsync(CancellationToken cancellationToken)
        => _context.FeePolicies.AsNoTracking()
            .Where(f => f.FeeCode == "LATE_FEE_PER_DAY")
            .Select(f => (int?)f.FeePolicyID)
            .FirstOrDefaultAsync(cancellationToken);

    public Task<List<Payment>> GetPendingCollectionPaymentsAsync(int reservationId, CancellationToken cancellationToken)
        => _context.Payments
            .Where(p => p.ReservationID == reservationId && p.Direction == "Collection" && p.Status == "Pending")
            .ToListAsync(cancellationToken);

    public void AddPayment(Payment payment) => _context.Payments.Add(payment);

    public Task SaveChangesAsync(CancellationToken cancellationToken) => _context.SaveChangesAsync(cancellationToken);

    public bool HasActiveTransaction => _context.Database.CurrentTransaction is not null;

    public Task<IDbContextTransaction> BeginTransactionAsync(IsolationLevel isolationLevel, CancellationToken cancellationToken)
        => _context.Database.BeginTransactionAsync(isolationLevel, cancellationToken);

    public void ClearTracking() => _context.ChangeTracker.Clear();
}
