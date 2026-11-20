using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmailController : ControllerBase
{
    private readonly IEmailService _emailService;
    private readonly ILogger<EmailController> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly BrevoSettings _brevo;

    public EmailController(IEmailService emailService, ILogger<EmailController> logger, IWebHostEnvironment environment, IOptions<BrevoSettings> brevo)
    {
        _emailService = emailService;
        _logger = logger;
        _environment = environment;
        _brevo = brevo.Value;
    }

    /// <summary>
    /// GET /api/email/status — KIỂM TRA CẤU HÌNH GỬI EMAIL (không gửi email, không lộ khóa).
    /// Cho biết backend đang gửi qua Brevo hay Gmail SMTP, 6 ký tự cuối của khóa Brevo đang dùng,
    /// khóa lấy từ biến môi trường (BrevoSettings__ApiKey, vd đặt trên Render) hay từ appsettings.json, và email người gửi.
    /// </summary>
    [HttpGet("status")]
    public IActionResult Status()
    {
        var key = _brevo.ApiKey?.Trim() ?? string.Empty;
        var envKey = Environment.GetEnvironmentVariable("BrevoSettings__ApiKey");
        return Ok(new
        {
            provider = key.Length == 0 ? "Gmail SMTP (không có khóa Brevo)" : "Brevo",
            brevoKeySuffix = key.Length >= 6 ? key[^6..] : (key.Length == 0 ? null : "(quá ngắn)"),
            keySource = !string.IsNullOrWhiteSpace(envKey) ? "biến môi trường BrevoSettings__ApiKey" : key.Length > 0 ? "appsettings.json" : "không có",
            envVarPresent = !string.IsNullOrWhiteSpace(envKey),
            senderEmail = string.IsNullOrWhiteSpace(_brevo.SenderEmail) ? null : _brevo.SenderEmail.Trim(),
            environment = _environment.EnvironmentName
        });
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
    /// Gửi bản hợp đồng thuê kho qua email (Brevo).
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
            await _emailService.SendContractEmailAsync(request, ct);

            return Ok(new { success = true, message = $"Đã gửi hợp đồng đến {request.ToEmail}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi gửi hợp đồng qua email đến {Email}", request.ToEmail);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

    /// <summary>
    /// Gửi thử một email kiểm tra cấu hình gửi email (Brevo).
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> TestEmail([FromBody] TestEmailRequest request, CancellationToken ct)
    {
        // Chỉ dùng khi chạy Development để kiểm tra cấu hình gửi email.
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
            _logger.LogError(ex, "Lỗi gửi email kiểm tra đến {Email}", request.ToEmail);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }
}

