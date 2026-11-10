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
    public async Task<IActionResult> GetUsers(
        [FromQuery] PageQuery query,
        [FromQuery] string? role,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        // [PHÂN TRANG] ?page=&pageSize=&q=&status=Active,Locked&role=&sort=newest|oldest|name -> { items, total, ... };
        // không gửi page thì trả nguyên mảng như trước.
        var result = query.IsPaged
            ? await _adminService.GetUsersPageAsync(email, query, role, cancellationToken)
            : await _adminService.GetUsersAsync(email, cancellationToken);

        if (!result.IsSuccess) return Forbid();
        return Ok(result.Data);
    }

    [HttpGet("activity")]
    public async Task<IActionResult> GetActivity([FromQuery] PageQuery query, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        // [PHÂN TRANG] ?page=&pageSize=&q=&status=LOGIN|APPROVAL|ROLE|SECURITY&sort=newest|oldest
        var result = query.IsPaged
            ? await _adminService.GetActivityPageAsync(email, query, cancellationToken)
            : await _adminService.GetActivityAsync(email, cancellationToken);

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