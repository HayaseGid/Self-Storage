using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservationController : ControllerBase
{
    private readonly IReservationService _reservationService;

    public ReservationController(IReservationService reservationService)
    {
        _reservationService = reservationService;
    }

    [HttpPost]
    public async Task<IActionResult> CreateReservation(
        [FromBody] CreateReservationDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _reservationService.CreateReservationAsync(request, email, cancellationToken);

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                400 => BadRequest(new { message = result.ErrorMessage }),
                401 => Unauthorized(),
                404 => NotFound(new { message = result.ErrorMessage }),
                409 => Conflict(new { message = result.ErrorMessage }),
                _ => StatusCode(500, new { message = result.ErrorMessage })
            };
        }

        // Lấy property `reservationId` từ object động (anonymous object) để truyền vào CreatedAtAction
        var resIdProperty = result.Data!.GetType().GetProperty("reservationId");
        var resId = resIdProperty!.GetValue(result.Data, null);

        return CreatedAtAction(nameof(GetById), new { id = resId }, result.Data);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id, CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _reservationService.GetByIdAsync(id, email, cancellationToken);

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                401 => Unauthorized(),
                404 => NotFound(),
                _ => StatusCode(500)
            };
        }

        return Ok(result.Data);
    }

    [HttpGet("customer/{email}")]
    public async Task<IActionResult> GetForCustomer(string email, CancellationToken cancellationToken)
    {
        var authEmail = Request.Headers["X-User-Email"].ToString();
        var result = await _reservationService.GetForCustomerAsync(email, authEmail, cancellationToken);

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                403 => Forbid(),
                401 => Unauthorized(),
                _ => StatusCode(500)
            };
        }

        return Ok(result.Data);
    }
}