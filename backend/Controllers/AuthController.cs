using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly SelfStorageDbContext _context;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly RegistrationOtpService _registrationOtp;

    public AuthController(
        IAuthService authService,
        SelfStorageDbContext context,
        IJwtTokenService jwtTokenService,
        RegistrationOtpService registrationOtp)
    {
        _authService = authService;
        _context = context;
        _jwtTokenService = jwtTokenService;
        _registrationOtp = registrationOtp;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(
        [FromBody] LoginRequestDTO request,
        CancellationToken cancellationToken)
    {
        var result = await _authService.LoginAsync(request);

        if (!result.IsSuccess)
        {
            if (result.ErrorMessage == "Tài khoản chưa được kích hoạt hoặc đã bị khóa.")
                return Forbid();
            return Unauthorized(new { message = result.ErrorMessage });
        }

        var user = result.User!;
        _context.UserActivityLogs.Add(new UserActivityLog
        {
            UserID = user.UserID,
            Action = "Login",
            IPAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            Timestamp = DateTime.UtcNow,
            Details = "Đăng nhập thành công"
        });
        await _context.SaveChangesAsync(cancellationToken);

        var (token, expiresAt) = _jwtTokenService.CreateToken(user);
        user.Token = token;
        user.TokenExpiresAt = expiresAt;

        return Ok(user);
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequestDTO request)
    {
        // Tài khoản khách phải xác thực email bằng OTP: /register/start -> /register/verify
        if (string.Equals(request.RoleName?.Trim(), RegistrationOtpService.CustomerRole, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Tài khoản khách hàng đăng ký qua bước xác thực email (OTP)." });

        var result = await _authService.RegisterAsync(request);

        if (!result.IsSuccess)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(new { message = result.ErrorMessage });
    }

    /* ĐĂNG KÝ KHÁCH HÀNG BẰNG OTP (mã tạo và kiểm tra ở backend — RegistrationOtpService) */

    [HttpPost("register/start")]
    public async Task<IActionResult> RegisterStart([FromBody] RegisterStartDTO request, CancellationToken cancellationToken)
    {
        var result = await _registrationOtp.StartAsync(request.FullName, request.Email, request.Password, request.PhoneNumber, ClientIp(), cancellationToken);
        return StatusCode(result.Status, result.Body);
    }

    [HttpPost("register/resend")]
    public async Task<IActionResult> RegisterResend([FromBody] RegisterResendDTO request, CancellationToken cancellationToken)
    {
        var result = await _registrationOtp.ResendAsync(request.Email, ClientIp(), cancellationToken);
        return StatusCode(result.Status, result.Body);
    }

    [HttpPost("register/verify")]
    public async Task<IActionResult> RegisterVerify([FromBody] RegisterVerifyDTO request, CancellationToken cancellationToken)
    {
        var result = await _registrationOtp.VerifyAsync(request.Email, request.Otp, cancellationToken);
        return StatusCode(result.Status, result.Body);
    }

    private string? ClientIp() => HttpContext.Connection.RemoteIpAddress?.ToString();
}
