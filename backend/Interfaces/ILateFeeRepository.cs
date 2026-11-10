using System.Data;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

/// <summary>Truy cập dữ liệu cho phí trễ hạn &amp; quyết toán công nợ khi trả kho (file THÊM MỚI).</summary>
public interface ILateFeeRepository
{
    Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken);
    Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);
    Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);

    /// <summary>Đơn đang thuê của cơ sở + đơn đã trả kho còn phí chưa đóng (có theo dõi thay đổi).</summary>
    Task<List<Reservation>> GetFacilityReservationsAsync(int facilityId, CancellationToken cancellationToken);

    /// <summary>Đơn đang thuê của khách + đơn đã trả kho còn phí chưa đóng (có theo dõi thay đổi).</summary>
    Task<List<Reservation>> GetCustomerReservationsAsync(int customerId, CancellationToken cancellationToken);

    Task<Reservation?> GetReservationAsync(int reservationId, CancellationToken cancellationToken);
    Task<Charge?> GetChargeAsync(int chargeId, CancellationToken cancellationToken);
    Task<int?> GetLateFeePolicyIdAsync(CancellationToken cancellationToken);
    Task<List<Payment>> GetPendingCollectionPaymentsAsync(int reservationId, CancellationToken cancellationToken);

    void AddPayment(Payment payment);
    Task SaveChangesAsync(CancellationToken cancellationToken);
    bool HasActiveTransaction { get; }
    Task<IDbContextTransaction> BeginTransactionAsync(IsolationLevel isolationLevel, CancellationToken cancellationToken);
    void ClearTracking();
}
