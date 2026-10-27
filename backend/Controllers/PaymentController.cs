using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentController : ControllerBase
{
    private readonly IPaymentService _paymentService;

    public PaymentController(IPaymentService paymentService)
    {
        _paymentService = paymentService;
    }

    [HttpPost("confirm")]
    public async Task<IActionResult> ConfirmPayment(
        [FromBody] CreatePaymentDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _paymentService.ConfirmPaymentAsync(request, email, cancellationToken);

        if (!result.IsSuccess)
        {
            return result.StatusCode switch
            {
                401 => Unauthorized(new { message = result.ErrorMessage }),
                404 => NotFound(new { message = result.ErrorMessage }),
                400 => BadRequest(new { message = result.ErrorMessage }),
                409 => Conflict(new { message = result.ErrorMessage }),
                _ => StatusCode(500, new { message = result.ErrorMessage })
            };
        }

        return Ok(new
        {
            message = result.ErrorMessage, 
            paymentId = result.Data!.PaymentId,
            transactionReference = result.Data.TransactionReference,
            amount = result.Data.Amount,
            reservationStatus = result.Data.ReservationStatus
        });
    }
}