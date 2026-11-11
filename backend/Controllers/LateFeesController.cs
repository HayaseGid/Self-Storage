using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// PHÍ TRỄ HẠN TIỀN THUÊ &amp; CÔNG NỢ (file THÊM MỚI). Luật tính: Services/LateFeeRules.cs, nghiệp vụ: Services/LateFeeService.cs.
///   KHÁCH
///   GET  /api/late-fees/mine                               Phí trễ hạn + tiền thuê quá hạn của tôi (tự cập nhật tới hôm nay)
///   POST /api/late-fees/{reservationId}/pay-demo           Đóng mô phỏng phí trễ hạn (thật: POST /api/vnpay/create, đã thu kèm tiền thuê)
///   MANAGER / BOM / STAFF CỦA CƠ SỞ
///   GET  /api/late-fees/facilities/{facilityId}            Công nợ tiền thuê &amp; phí trễ hạn tại cơ sở
///   POST /api/late-fees/facilities/{facilityId}/sync       Cập nhật phí trễ hạn tới hôm nay (trang Manager / Staff gọi khi tải)
///   PUT  /api/late-fees/charges/{chargeId}/waive           Manager / BOM miễn phí trễ hạn { reason }
///   GET  /api/late-fees/returns/{reservationId}/preview    Staff xem trước công nợ sẽ trừ vào cọc khi hoàn tất trả kho
/// Danh tính lấy từ header X-User-Email (JwtIdentityMiddleware ghi từ token).
/// </summary>
[ApiController]
[Route("api/late-fees")]
public class LateFeesController : ControllerBase
{
    private readonly ILateFeeService _service;

    public LateFeesController(ILateFeeService service)
    {
        _service = service;
    }

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine(
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetMineAsync(userEmail, cancellationToken));

    [HttpPost("{reservationId:int}/pay-demo")]
    public async Task<IActionResult> PayDemo(
        int reservationId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.PayDemoAsync(reservationId, userEmail, cancellationToken));

    [HttpGet("facilities/{facilityId:int}")]
    public async Task<IActionResult> GetFacility(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetFacilityAsync(facilityId, userEmail, cancellationToken));

    [HttpPost("facilities/{facilityId:int}/sync")]
    public async Task<IActionResult> SyncFacility(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.SyncFacilityAsync(facilityId, userEmail, cancellationToken));

    [HttpPut("charges/{chargeId:int}/waive")]
    public async Task<IActionResult> Waive(
        int chargeId,
        [FromBody] WaiveLateFeeDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.WaiveAsync(chargeId, request, userEmail, cancellationToken));

    [HttpGet("returns/{reservationId:int}/preview")]
    public async Task<IActionResult> PreviewReturn(
        int reservationId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.PreviewReturnAsync(reservationId, userEmail, cancellationToken));

    // Cùng cách trả kết quả với ManagerToolsController: lỗi luôn kèm { message } tiếng Việt
    private IActionResult MapResponse(LateFeeResponse response)
    {
        if (response.IsSuccess)
            return StatusCode(response.StatusCode, response.Data);
        return StatusCode(response.StatusCode, new { message = response.ErrorMessage });
    }
}
