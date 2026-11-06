using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

/// <summary>Truy cập dữ liệu cho StaffToolsService (chỉ đọc/ghi qua EF Core).</summary>
public interface IStaffToolsRepository
{
    Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken);

    Task<bool> IsActiveStaffOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);

    Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);

    /// <summary>Đơn kèm ReservationItems, ReservationUnits, Payments, Contract.</summary>
    Task<Reservation?> GetReservationForConfirmAsync(int reservationId, CancellationToken cancellationToken);

    Task<StorageUnit?> GetUnitAsync(int unitId, CancellationToken cancellationToken);

    /// <summary>Kho đang được giữ / đang thuê bởi một đơn còn hiệu lực.</summary>
    Task<bool> HasActiveReservationOnUnitAsync(int unitId, CancellationToken cancellationToken);

    /// <summary>Kho đang trong quy trình trả kho (việc "Move Out" đang làm – UnitReturnsController của nhóm).</summary>
    Task<bool> HasMoveOutInProgressAsync(int unitId, CancellationToken cancellationToken);

    Task<List<HandoverTask>> GetTasksForStaffAsync(int staffUserId, int? facilityId, CancellationToken cancellationToken);

    void AddContract(Contract contract);

    void AddTask(HandoverTask task);

    /// <summary>Ghi UserID vào SESSION_CONTEXT để trigger *_LogStatus lưu đúng người thay đổi.</summary>
    Task SetAuditContextAsync(int userId, string source, CancellationToken cancellationToken);

    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}
