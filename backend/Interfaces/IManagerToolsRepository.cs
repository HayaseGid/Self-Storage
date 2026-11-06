using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

/// <summary>Truy cập dữ liệu cho ManagerToolsService (EF Core).</summary>
public interface IManagerToolsRepository
{
    Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken);

    Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken);

    Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);

    Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);

    Task<FacilityStaff?> GetFacilityStaffAsync(int facilityId, int staffUserId, CancellationToken cancellationToken);

    Task<int> CountOpenTasksAsync(int facilityId, int staffUserId, CancellationToken cancellationToken);

    /// <summary>Đơn kèm ReservationUnits (+ Unit) và HandoverTasks.</summary>
    Task<Reservation?> GetReservationWithUnitsAsync(int reservationId, CancellationToken cancellationToken);

    Task<StorageUnit?> GetUnitAsync(int unitId, CancellationToken cancellationToken);

    Task<HandoverTask?> GetTaskAsync(int taskId, CancellationToken cancellationToken);

    Task<List<HandoverTask>> GetFacilityTasksAsync(int facilityId, CancellationToken cancellationToken);

    /// <summary>Payment đã Completed (thu + hoàn) của các đơn tại cơ sở.</summary>
    Task<List<Payment>> GetCompletedPaymentsAsync(int facilityId, CancellationToken cancellationToken);

    Task<List<Charge>> GetChargesAsync(int facilityId, CancellationToken cancellationToken);

    Task<Dictionary<string, int>> CountReservationsByStatusAsync(int facilityId, CancellationToken cancellationToken);

    Task<Dictionary<string, int>> CountUnitsByStatusAsync(int facilityId, CancellationToken cancellationToken);

    /// <summary>Nhân viên (RoleID 2, tài khoản Active) đang Active tại cơ sở.</summary>
    Task<List<User>> GetActiveStaffAsync(int facilityId, CancellationToken cancellationToken);

    /// <summary>Việc chưa hủy của các nhân viên trong khoảng ngày (mọi cơ sở) – để tính khối lượng và trùng giờ.</summary>
    Task<List<HandoverTask>> GetStaffTasksInRangeAsync(IReadOnlyCollection<int> staffIds, DateTime from, DateTime to, CancellationToken cancellationToken);

    /// <summary>Đơn Paid / Confirmed tại cơ sở còn kho "Held" chưa có việc nhận kho (kèm ReservationUnits, HandoverTasks).</summary>
    Task<List<Reservation>> GetReservationsNeedingMoveInAsync(int facilityId, CancellationToken cancellationToken);

    /// <summary>Báo cáo kiểm tra kho (Inspection đã hoàn thành, có kết quả) tại cơ sở, mới nhất trước.</summary>
    Task<List<HandoverTask>> GetUnitReportsAsync(int facilityId, CancellationToken cancellationToken);

    void AddTask(HandoverTask task);

    /// <summary>Ghi UserID vào SESSION_CONTEXT để trigger *_LogStatus lưu đúng người thay đổi.</summary>
    Task SetAuditContextAsync(int userId, string source, CancellationToken cancellationToken);

    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
