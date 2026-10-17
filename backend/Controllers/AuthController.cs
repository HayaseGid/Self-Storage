using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly SelfStorageDbContext _context;

    public AuthController(
        IAuthService authService,
        SelfStorageDbContext context)
    {
        _authService = authService;
        _context = context;
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
            Timestamp = DateTime.Now,
            Details = "Đăng nhập thành công"
        });
        await _context.SaveChangesAsync(cancellationToken);

        return Ok(user);
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequestDTO request)
    {
        var result = await _authService.RegisterAsync(request);

        if (!result.IsSuccess)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        return Ok(new { message = result.ErrorMessage });
    }

}
