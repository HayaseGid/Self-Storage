using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/unit-types")]
[Route("api/operations/unit-types")]
[ApiController]
public class UnitTypesController : ControllerBase
{
    private readonly IUnitTypeService _unitTypeService;

    public UnitTypesController(IUnitTypeService unitTypeService)
    {
        _unitTypeService = unitTypeService;
    }

    // GET /api/unit-types
    [HttpGet]
    public async Task<ActionResult<IEnumerable<UnitTypeResponse>>> GetAll(
        [FromQuery] int? facilityId,
        CancellationToken cancellationToken)
    {
        var items = await _unitTypeService.GetAllAsync(facilityId, cancellationToken);
        return Ok(items);
    }

    // GET /api/unit-types/{id}
    [HttpGet("{id:int}")]
    public async Task<ActionResult<UnitTypeResponse>> GetById(
        int id,
        [FromQuery] int? facilityId,
        CancellationToken cancellationToken)
    {
        var item = await _unitTypeService.GetByIdAsync(id, facilityId, cancellationToken);
        if (item is null)
            return NotFound(new { message = "Không tìm thấy loại kho." });

        return Ok(item);
    }

    // POST /api/unit-types
    [HttpPost]
    public async Task<ActionResult<UnitTypeResponse>> Create(
        [FromBody] UpsertUnitTypeDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error, data) = await _unitTypeService.CreateAsync(request, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return CreatedAtAction(nameof(GetById), new { id = data!.UnitTypeID }, data);
    }

    // PUT /api/unit-types/{id}
    [HttpPut("{id:int}")]
    public async Task<ActionResult<UnitTypeResponse>> Update(
        int id,
        [FromBody] UpsertUnitTypeDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error, data) = await _unitTypeService.UpdateAsync(id, request, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return Ok(data);
    }

    // DELETE /api/unit-types/{id}
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(
        int id,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var (isSuccess, error) = await _unitTypeService.DeleteAsync(id, userEmail, cancellationToken);
        if (!isSuccess) return MapErrorResult(error);

        return NoContent();
    }

    private ActionResult MapErrorResult(string? error)
    {
        if (error == "NOT_FOUND")
            return NotFound(new { message = "Không tìm thấy loại kho." });
        if (error != null && error.StartsWith("UNAUTHORIZED:"))
            return Unauthorized(new { message = error["UNAUTHORIZED:".Length..] });
        if (error != null && error.StartsWith("FORBIDDEN:"))
            return StatusCode(StatusCodes.Status403Forbidden, new { message = error["FORBIDDEN:".Length..] });

        return Conflict(new { message = error });
    }
}
