using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// API bổ sung cho Facility Manager.
///   GET    /api/manager-tools/facilities/{facilityId}/reports?months=6     Báo cáo thực thu, khoản phí, đơn, kho
///   DELETE /api/manager-tools/facilities/{facilityId}/staff/{userId}       Gỡ nhân viên khỏi cơ sở
///   GET    /api/manager-tools/facilities/{facilityId}/tasks                Việc tại cơ sở
///   POST   /api/manager-tools/facilities/{facilityId}/tasks                Giao việc cho nhân viên
///   PUT    /api/manager-tools/tasks/{taskId}/cancel                        Hủy việc đã giao
///   POST   /api/manager-tools/facilities/{facilityId}/auto-assign          Tự phân công việc nhận kho (Manager hoặc Staff của cơ sở gọi khi tải trang)
///   GET    /api/manager-tools/facilities/{facilityId}/workload?date=       Khối lượng việc từng nhân viên trong ngày
///   PUT    /api/manager-tools/reservations/{reservationId}/owner           Đổi người phụ trách đơn
///   GET    /api/manager-tools/facilities/{facilityId}/unit-reports         Báo cáo sự cố kho do Staff gửi
/// Danh tính lấy từ header X-User-Email (JwtIdentityMiddleware ghi từ token, không giả mạo được).
/// </summary>
[ApiController]
[Route("api/manager-tools")]
public class ManagerToolsController : ControllerBase
{
    private readonly IManagerToolsService _service;

    public ManagerToolsController(IManagerToolsService service)
    {
        _service = service;
    }

    [HttpGet("facilities/{facilityId:int}/reports")]
    public async Task<IActionResult> GetReports(
        int facilityId,
        [FromQuery] int? months,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.GetReportsAsync(facilityId, months ?? 6, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpDelete("facilities/{facilityId:int}/staff/{userId:int}")]
    public async Task<IActionResult> RemoveStaff(
        int facilityId,
        int userId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.RemoveStaffAsync(facilityId, userId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpGet("facilities/{facilityId:int}/tasks")]
    public async Task<IActionResult> GetTasks(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.GetFacilityTasksAsync(facilityId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPost("facilities/{facilityId:int}/tasks")]
    public async Task<IActionResult> AssignTask(
        int facilityId,
        [FromBody] AssignTaskDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.AssignTaskAsync(facilityId, request, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPut("tasks/{taskId:int}/cancel")]
    public async Task<IActionResult> CancelTask(
        int taskId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.CancelTaskAsync(taskId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPost("facilities/{facilityId:int}/auto-assign")]
    public async Task<IActionResult> AutoAssign(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.AutoAssignAsync(facilityId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpGet("facilities/{facilityId:int}/workload")]
    public async Task<IActionResult> GetWorkload(
        int facilityId,
        [FromQuery] DateTime? date,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.GetWorkloadAsync(facilityId, date, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPut("reservations/{reservationId:int}/owner")]
    public async Task<IActionResult> ChangeOwner(
        int reservationId,
        [FromBody] ChangeOwnerDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.ChangeOwnerAsync(reservationId, request, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpGet("facilities/{facilityId:int}/unit-reports")]
    public async Task<IActionResult> GetUnitReports(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.GetUnitReportsAsync(facilityId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    // Cùng cách trả kết quả với OperationsController: lỗi luôn kèm { message } tiếng Việt
    private IActionResult MapResponse(ManagerToolsResponse response)
    {
        if (response.IsSuccess)
            return StatusCode(response.StatusCode, response.Data);

        return StatusCode(response.StatusCode, new { message = response.ErrorMessage });
    }
}
