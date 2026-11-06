using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

/// <summary>Kết quả trả về của StaffToolsService (cùng kiểu với các service khác trong project).</summary>
public record StaffToolsResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

/// <summary>
/// Các API bổ sung cho Facility Staff (và luồng đơn sau thanh toán):
///  1. Xác nhận đơn đã cọc: Paid -> Confirmed + tạo hợp đồng (thay bước Manager duyệt đã bỏ).
///  2. Staff xem các công việc (HandoverTask) được giao.
///  3. Staff đổi trạng thái kho: Available / Pending Inspection / Maintenance.
///  4. Bàn giao kho: chuyển tiếp HandoverService (nơi duy nhất chứa điều kiện bàn giao, gồm cả kiểm tra phân công).
///  5. Báo cáo sự cố kho: Staff ghi tình trạng (Good / Damaged) + ảnh; kho hư hỏng tự chuyển Bảo trì.
/// </summary>
public interface IStaffToolsService
{
    Task<StaffToolsResponse> ConfirmPaidReservationAsync(int reservationId, string? userEmail, CancellationToken cancellationToken);

    Task<StaffToolsResponse> GetMyTasksAsync(int? facilityId, string? userEmail, CancellationToken cancellationToken);

    Task<StaffToolsResponse> UpdateUnitStatusAsync(int unitId, string? newStatus, string? userEmail, CancellationToken cancellationToken);

    Task<StaffToolsResponse> HandoverAssignedAsync(CompleteHandoverDTO request, string? userEmail, CancellationToken cancellationToken);

    Task<StaffToolsResponse> ReportUnitAsync(UnitReportDTO request, string? userEmail, CancellationToken cancellationToken);
}
