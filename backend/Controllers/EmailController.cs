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

    public EmailController(IEmailService emailService, ILogger<EmailController> logger)
    {
        _emailService = emailService;
        _logger = logger;
    }

    /// <summary>
    /// Gửi mã xác thực OTP qua Gmail SMTP.
    /// </summary>
    [HttpPost("send-otp")]
    public async Task<IActionResult> SendOtp([FromBody] SendOtpEmailRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        try
        {
            await _emailService.SendOtpEmailAsync(request.Email, request.FullName, request.Otp, ct);
            return Ok(new { success = true, message = $"Đã gửi mã OTP đến {request.Email}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi gửi mã OTP qua Gmail SMTP đến {Email}", request.Email);
            return StatusCode(500, new { success = false, message = ex.Message });
        }
    }

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

