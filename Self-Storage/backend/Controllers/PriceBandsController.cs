using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/price-bands")]
[Route("api/operations/price-bands")]
[ApiController]
public class PriceBandsController : ControllerBase
{
    private readonly IFacilityManagementService _facilityManagementService;

    public PriceBandsController(IFacilityManagementService facilityManagementService)
    {
        _facilityManagementService = facilityManagementService;
    }

    [HttpGet]
    public async Task<IActionResult> GetPriceBands(CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.GetPriceBandsAsync(cancellationToken);
        return StatusCode(result.StatusCode, result.Data);
    }

    [HttpPost]
    public async Task<IActionResult> CreatePriceBand(
        [FromBody] UpsertPriceBandDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.CreatePriceBandAsync(request, userEmail, cancellationToken);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return StatusCode(result.StatusCode, result.Data);
    }

    [HttpPut("{code}")]
    public async Task<IActionResult> UpdatePriceBand(
        string code,
        [FromBody] UpsertPriceBandDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.UpdatePriceBandAsync(code, request, userEmail, cancellationToken);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return Ok(result.Data);
    }

    [HttpDelete("{code}")]
    public async Task<IActionResult> DeletePriceBand(
        string code,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.DeletePriceBandAsync(code, userEmail, cancellationToken);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return NoContent();
    }
}

