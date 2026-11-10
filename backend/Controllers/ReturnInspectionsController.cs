using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// GÓP Ý 14 - KẾT QUẢ KIỂM KHO KHI TRẢ: ẢNH + KHÁCH XÁC NHẬN / KHIẾU NẠI TRƯỚC KHI TRỪ CỌC (file THÊM MỚI).
/// Nghiệp vụ: Services/ReturnInspectionService.cs. Bảng: database/20261109_KiemKhoXacNhan.sql.
/// Staff gửi ảnh + phí ở bước "Hoàn tất kiểm tra" có sẵn: POST /api/unit-returns/staff/{reservationId}/complete (thêm "images").
///   KHÁCH
///   GET  /api/return-inspections/mine                      Kết quả kiểm kho của tôi (tự xác nhận các kết quả quá hạn)
///   POST /api/return-inspections/{id}/accept               Đồng ý -> trừ cọc / hoàn cọc theo phí Staff đề xuất
///   POST /api/return-inspections/{id}/dispute              Khiếu nại { reason, images[] } (trước hạn xác nhận)
///   STAFF
///   GET  /api/return-inspections/staff                     Kết quả kiểm kho tại các cơ sở của tôi (30 ngày)
///   FACILITY MANAGER / BOM
///   GET  /api/return-inspections/facilities/{facilityId}   Danh sách chờ xác nhận / khiếu nại / đã quyết toán (90 ngày)
///   POST /api/return-inspections/{id}/resolve              Giải quyết khiếu nại { fees: [{ feeId, finalAmount }], notes }
///   MỌI VAI TRÒ CÓ QUYỀN
///   GET  /api/return-inspections/{id}                      Chi tiết kèm ảnh của Staff và của khách
/// </summary>
[ApiController]
[Route("api/return-inspections")]
public class ReturnInspectionsController : ControllerBase
{
    private readonly IReturnInspectionService _service;

    public ReturnInspectionsController(IReturnInspectionService service)
    {
        _service = service;
    }

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine(
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetMineAsync(userEmail, cancellationToken));

    [HttpPost("{inspectionId:int}/accept")]
    public async Task<IActionResult> Accept(
        int inspectionId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.AcceptAsync(inspectionId, userEmail, cancellationToken));

    [HttpPost("{inspectionId:int}/dispute")]
    [RequestSizeLimit(8_000_000)] // 3 ảnh ~1,5 MB / ảnh dạng base64
    public async Task<IActionResult> Dispute(
        int inspectionId,
        [FromBody] DisputeInspectionDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.DisputeAsync(inspectionId, request, userEmail, cancellationToken));

    [HttpGet("staff")]
    public async Task<IActionResult> GetStaff(
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetStaffAsync(userEmail, cancellationToken));

    [HttpGet("facilities/{facilityId:int}")]
    public async Task<IActionResult> GetFacility(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetFacilityAsync(facilityId, userEmail, cancellationToken));

    [HttpPost("{inspectionId:int}/resolve")]
    public async Task<IActionResult> Resolve(
        int inspectionId,
        [FromBody] ResolveInspectionDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.ResolveAsync(inspectionId, request, userEmail, cancellationToken));

    [HttpGet("{inspectionId:int}")]
    public async Task<IActionResult> GetDetail(
        int inspectionId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => MapResponse(await _service.GetDetailAsync(inspectionId, userEmail, cancellationToken));

    // Cùng cách trả kết quả với ManagerToolsController: lỗi luôn kèm { message } tiếng Việt
    private IActionResult MapResponse(ReturnInspectionResponse response)
    {
        if (response.IsSuccess)
            return StatusCode(response.StatusCode, response.Data);
        return StatusCode(response.StatusCode, new { message = response.ErrorMessage });
    }
}
