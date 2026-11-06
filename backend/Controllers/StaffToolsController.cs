using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// API bổ sung cho Facility Staff.
///   POST /api/staff-tools/reservations/{reservationId}/confirm   Paid -> Confirmed + tạo hợp đồng
///   GET  /api/staff-tools/tasks?facilityId=                       Việc được giao cho Staff đang đăng nhập
///   PUT  /api/staff-tools/units/{unitId}/status                   Đổi trạng thái kho
///   POST /api/staff-tools/handover                                Bàn giao kho (chỉ nhân viên được phân công)
///   POST /api/staff-tools/unit-reports                            Báo cáo tình trạng / sự cố kho
/// Danh tính lấy từ header X-User-Email (JwtIdentityMiddleware ghi từ token, không giả mạo được).
/// </summary>
[ApiController]
[Route("api/staff-tools")]
public class StaffToolsController : ControllerBase
{
    private readonly IStaffToolsService _service;

    public StaffToolsController(IStaffToolsService service)
    {
        _service = service;
    }

    [HttpPost("reservations/{reservationId:int}/confirm")]
    public async Task<IActionResult> ConfirmReservation(
        int reservationId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.ConfirmPaidReservationAsync(reservationId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpGet("tasks")]
    public async Task<IActionResult> GetMyTasks(
        [FromQuery] int? facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.GetMyTasksAsync(facilityId, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPut("units/{unitId:int}/status")]
    public async Task<IActionResult> UpdateUnitStatus(
        int unitId,
        [FromBody] UpdateUnitStatusDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.UpdateUnitStatusAsync(unitId, request.Status, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPost("handover")]
    public async Task<IActionResult> Handover(
        [FromBody] CompleteHandoverDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.HandoverAssignedAsync(request, userEmail, cancellationToken);
        return MapResponse(result);
    }

    [HttpPost("unit-reports")]
    public async Task<IActionResult> ReportUnit(
        [FromBody] UnitReportDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _service.ReportUnitAsync(request, userEmail, cancellationToken);
        return MapResponse(result);
    }

    // Cùng cách trả kết quả với OperationsController: lỗi luôn kèm { message } tiếng Việt
    private IActionResult MapResponse(StaffToolsResponse response)
    {
        if (response.IsSuccess)
            return StatusCode(response.StatusCode, response.Data);

        return StatusCode(response.StatusCode, new { message = response.ErrorMessage });
    }
}
