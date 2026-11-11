using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// Endpoint bàn giao cũ, giữ lại để không gãy client cũ.
/// Áp dụng ĐÚNG các quy tắc như POST /api/staff-tools/handover (đều nằm trong HandoverService):
/// đúng người được phân công, đã ký hợp đồng, đã tới ngày bắt đầu thuê, kho không bị người khác dùng...
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class HandoverController : ControllerBase
{
    private readonly IHandoverService _handoverService;

    public HandoverController(IHandoverService handoverService)
    {
        _handoverService = handoverService;
    }

    [HttpPost("complete")]
    public async Task<IActionResult> CompleteHandover(
        [FromBody] CompleteHandoverDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _handoverService.CompleteHandoverAsync(request, email, cancellationToken);

        // Lỗi luôn kèm { message } tiếng Việt để frontend hiện popup rõ ràng
        return result.IsSuccess
            ? Ok(result.Data)
            : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
    }
}
