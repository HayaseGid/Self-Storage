using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/unit-sizes")]
public sealed class UnitSizesController(IUnitSizeService unitSizeService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<UnitSizeResponse>>> GetAll(CancellationToken cancellationToken)
    {
        var items = await unitSizeService.GetAllAsync(cancellationToken);
        return Ok(items);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<UnitSizeResponse>> GetById(int id, CancellationToken cancellationToken)
    {
        var item = await unitSizeService.GetByIdAsync(id, cancellationToken);
        return item is null ? NotFound(new { message = "Không tìm thấy kích thước kho." }) : Ok(item);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertUnitSizeDTO request, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitSizeService.CreateAsync(request, email, cancellationToken);
        
        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Chỉ Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage }); // Hoặc BadRequest tùy logic
        }

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.UnitSizeID }, result.Data);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpsertUnitSizeDTO request, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitSizeService.UpdateAsync(id, request, email, cancellationToken);

        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Không tìm thấy")) return NotFound(new { message = result.ErrorMessage });
            if (result.ErrorMessage!.Contains("Chỉ Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage });
        }

        return Ok(result.Data);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await unitSizeService.DeleteAsync(id, email, cancellationToken);

        if (!result.IsSuccess)
        {
            if (result.ErrorMessage!.Contains("Không tìm thấy")) return NotFound(new { message = result.ErrorMessage });
            if (result.ErrorMessage!.Contains("Chỉ Business Operations")) return StatusCode(StatusCodes.Status403Forbidden, new { message = result.ErrorMessage });
            return Conflict(new { message = result.ErrorMessage });
        }

        return NoContent();
    }
}