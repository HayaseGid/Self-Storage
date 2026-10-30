using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CatalogController : ControllerBase
{
    private readonly ICatalogService _catalogService;

    public CatalogController(ICatalogService catalogService)
    {
        _catalogService = catalogService;
    }

    [HttpGet("state")]
    public async Task<IActionResult> GetCatalogState(CancellationToken cancellationToken)
    {
        var result = await _catalogService.GetCatalogStateAsync(cancellationToken);
        return Ok(result.Data);
    }

    [HttpGet("availability")]
    public async Task<IActionResult> GetAvailability(
        [FromQuery] int facilityId,
        [FromQuery] int unitTypeId,
        [FromQuery] DateTime startDate,
        [FromQuery] int months,
        CancellationToken cancellationToken)
    {
        var result = await _catalogService.GetAvailabilityAsync(facilityId, unitTypeId, startDate, months, cancellationToken);

        if (!result.IsSuccess)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }
}