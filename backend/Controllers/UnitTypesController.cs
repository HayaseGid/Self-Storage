using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/unit-types")]
public sealed class UnitTypesController(IUnitTypeService unitTypeService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UnitTypeResponse>>> GetAll(CancellationToken cancellationToken)
    {
        return Ok(await unitTypeService.GetAllAsync(cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UnitTypeResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var item = await unitTypeService.GetByIdAsync(id, cancellationToken);
        return item is null ? NotFound(new { message = "Không tìm thấy loại kho." }) : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertUnitTypeDTO request, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitTypeService.CreateAsync(request, email, cancellationToken);
        
        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage });
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.UnitTypeID }, result.Data);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpsertUnitTypeDTO request, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitTypeService.UpdateAsync(id, request, email, cancellationToken);

        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Không tìm thấy")) return NotFound(new { message = result.ErrorMessage });
            if (result.ErrorMessage!.Contains("Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage });
        }

        return Ok(result.Data);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitTypeService.DeleteAsync(id, email, cancellationToken);

        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Không tìm thấy")) return NotFound(new { message = result.ErrorMessage });
            if (result.ErrorMessage!.Contains("Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage });
        }

        return NoContent();
    }
}