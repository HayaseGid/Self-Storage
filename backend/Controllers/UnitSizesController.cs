using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/unit-sizes")]
[Route("api/operations/unit-sizes")]
[ApiController]
public class UnitSizesController : ControllerBase
{
    private readonly IUnitSizeService _unitSizeService;

    public UnitSizesController(IUnitSizeService unitSizeService)
    {
        _unitSizeService = unitSizeService;
    }

    // GET /api/unit-sizes
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UnitSizeResponse>>> GetAll(
        [FromQuery] int? facilityId,
        CancellationToken cancellationToken)
    {
        var items = await _unitSizeService.GetAllAsync(facilityId, cancellationToken);
        return Ok(items);
    }

    // GET /api/unit-sizes/{id}
    [HttpGet("{id:int}")]
    public async Task<ActionResult<UnitSizeResponse>> GetById(
        int id,
        [FromQuery] int? facilityId,
        CancellationToken cancellationToken)
    {
        var item = await _unitSizeService.GetByIdAsync(id, facilityId, cancellationToken);
        if (item is null)
            return NotFound(new { message = "Không tìm thấy kích thước kho." });

        return Ok(item);
    }

    // POST /api/unit-sizes
    [HttpPost]
    public async Task<ActionResult<UnitSizeResponse>> Create(
        [FromBody] UpsertUnitSizeDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error, data) = await _unitSizeService.CreateAsync(request, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return CreatedAtAction(nameof(GetById), new { id = data!.UnitSizeID }, data);
    }

    // PUT /api/unit-sizes/{id}
    [HttpPut("{id:int}")]
    public async Task<ActionResult<UnitSizeResponse>> Update(
        int id,
        [FromBody] UpsertUnitSizeDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error, data) = await _unitSizeService.UpdateAsync(id, request, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return Ok(data);
    }

    // DELETE /api/unit-sizes/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(
        int id,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error) = await _unitSizeService.DeleteAsync(id, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return NoContent();
    }

    private ActionResult MapErrorResult(string? error)
    {
        if (error == "NOT_FOUND")
            return NotFound(new { message = "Không tìm thấy kích thước kho." });
        if (error != null && error.StartsWith("UNAUTHORIZED:"))
            return Unauthorized(new { message = error["UNAUTHORIZED:".Length..] });
        if (error != null && error.StartsWith("FORBIDDEN:"))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = error["FORBIDDEN:".Length..] });

        return Conflict(new { message = error });
    }
}
