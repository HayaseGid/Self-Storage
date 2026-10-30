using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/admin")]
[ApiController]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;

    public AdminController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _adminService.GetUsersAsync(email, cancellationToken);

        if (!result.IsSuccess) return Forbid();
        return Ok(result.Data);
    }

    [HttpGet("activity")]
    public async Task<IActionResult> GetActivity(CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _adminService.GetActivityAsync(email, cancellationToken);

        if (!result.IsSuccess) return Forbid();
        return Ok(result.Data);
    }

    [HttpPut("users/{userId:int}")]
    public async Task<IActionResult> UpdateUser(
        int userId,
        [FromBody] UpdateAdminUserDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        
        var result = await _adminService.UpdateUserAsync(userId, request, email, ipAddress, cancellationToken);

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                403 => Forbid(),
                404 => NotFound(new { message = result.ErrorMessage }),
                409 => Conflict(new { message = result.ErrorMessage }),
                400 => BadRequest(new { message = result.ErrorMessage }),
                _ => StatusCode(500, new { message = result.ErrorMessage })
            };
        }

        return NoContent();
    }
}