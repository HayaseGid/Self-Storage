using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

/// <summary>Kết quả trả về của ManagerToolsService (cùng kiểu với các service khác trong project).</summary>
public record ManagerToolsResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

/// <summary>
/// Các API bổ sung cho Facility Manager (chỉ trên cơ sở mình quản lý; BOM được mọi cơ sở):
///  1. Báo cáo doanh thu thực thu, khoản phí, đơn và kho theo trạng thái.
///  2. Gỡ nhân viên khỏi cơ sở (đặt FacilityStaff = Inactive, giữ lịch sử).
///  3. Giao việc (HandoverTask) cho nhân viên, xem và hủy việc đã giao.
///  4. TỰ PHÂN CÔNG việc nhận kho: đơn đã cọc tự được giao cho nhân viên phù hợp nhất
///     (không trùng giờ, ít việc nhất trong ngày hẹn). Người được giao là NGƯỜI PHỤ TRÁCH đơn.
///  5. Đổi người phụ trách đơn, xem khối lượng việc theo ngày, xem báo cáo sự cố kho do Staff gửi.
/// </summary>
public interface IManagerToolsService
{
    Task<ManagerToolsResponse> GetReportsAsync(int facilityId, int months, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> RemoveStaffAsync(int facilityId, int staffUserId, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> GetFacilityTasksAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> AssignTaskAsync(int facilityId, AssignTaskDTO request, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> CancelTaskAsync(int taskId, string? userEmail, CancellationToken cancellationToken);

    /// <summary>Gọi khi trang Manager / Staff tải dữ liệu: giao các đơn đã cọc chưa có người nhận kho.</summary>
    Task<ManagerToolsResponse> AutoAssignAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> GetWorkloadAsync(int facilityId, DateTime? date, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> ChangeOwnerAsync(int reservationId, ChangeOwnerDTO request, string? userEmail, CancellationToken cancellationToken);

    Task<ManagerToolsResponse> GetUnitReportsAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);
}
