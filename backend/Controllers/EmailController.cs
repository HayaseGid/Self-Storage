using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ILogger<EmailController> _logger;
    private readonly IWebHostEnvironment _environment;

    public EmailController(IEmailService emailService, ILogger<EmailController> logger, IWebHostEnvironment environment)
    {
        _emailService = emailService;
        _logger = logger;
        _environment = environment;
    }

    /* Email người đang đăng nhập (JwtIdentityMiddleware ghi từ token vào X-User-Email). */
    private string? CurrentUserEmail()
    {
        var email = Request.Headers[SelfStorageAPI.Middleware.JwtIdentityMiddleware.UserEmailHeader].ToString().Trim();
        return email.Length == 0 ? null : email;
    }

    // [ĐÃ BỎ] POST /api/email/send-otp: trình duyệt tự tạo mã rồi nhờ backend gửi -> ai cũng gửi được mã bất kỳ tới email bất kỳ.
    // OTP đăng ký giờ do backend tạo và gửi: POST /api/auth/register/start (RegistrationOtpService).

    /// <summary>
    /// Gửi bản hợp đồng thuê kho qua Gmail SMTP.
    /// </summary>
    [HttpPost("send-contract")]
    public async Task<IActionResult> SendContract([FromBody] SendContractEmailRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        // Chỉ gửi hợp đồng về email của chính người đang đăng nhập (không cho gửi thư tùy ý tới người khác).
        var me = CurrentUserEmail();
        if (me is null)
            return Unauthorized(new { success = false, message = "Vui lòng đăng nhập để gửi hợp đồng." });
        if (!string.Equals(me, request.ToEmail.Trim(), StringComparison.OrdinalIgnoreCase))
            return StatusCode(403, new { success = false, message = "Chỉ gửi được hợp đồng về email của tài khoản đang đăng nhập." });

        try
        {
            await _emailService.SendContractEmailAsync(
                request.ToEmail, 
                request.ToName, 
                request.Subject, 
                request.ContractHtml, 
                ct);

            return Ok(new { success = true, message = $"Đã gửi hợp đồng đến {request.ToEmail}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi gửi hợp đồng qua Gmail SMTP đến {Email}", request.ToEmail);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    /// <summary>
    /// Gửi thử một email kiểm tra kết nối Gmail SMTP.
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> TestEmail([FromBody] TestEmailRequest request, CancellationToken ct)
    {
        // Chỉ dùng khi chạy Development để kiểm tra cấu hình SMTP.
        if (!_environment.IsDevelopment())
            return NotFound();

        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        try
        {
            await _emailService.TestConnectionAsync(request.ToEmail, ct);
            return Ok(new { success = true, message = $"Đã gửi email kiểm tra thành công đến {request.ToEmail}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi kiểm tra kết nối Gmail SMTP đến {Email}", request.ToEmail);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }
}

