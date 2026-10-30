using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

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

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                401 => Unauthorized(),
                403 => Forbid(),
                404 => NotFound(new { message = result.ErrorMessage }),
                409 => Conflict(new { message = result.ErrorMessage }),
                _ => StatusCode(500, new { message = result.ErrorMessage })
            };
        }

        return Ok(result.Data);
    }
}