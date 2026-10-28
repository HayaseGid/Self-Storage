using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class OperationsController : ControllerBase
{
    private readonly IOperationsStateService _stateService;
    private readonly IFacilityManagementService _facilityService;

    public OperationsController(
        IOperationsStateService stateService,
        IFacilityManagementService facilityService)
    {
        _stateService = stateService;
        _facilityService = facilityService;
    }

    [HttpGet("state")]
    public async Task<IActionResult> GetState([FromQuery] string? email, CancellationToken cancellationToken)
    {
        var headerEmail = Request.Headers["X-User-Email"].ToString();
        var result = await _stateService.GetStateAsync(email, headerEmail, cancellationToken);
        return ToActionResult(result);
    }

    [HttpGet("reports")]
    public async Task<IActionResult> GetReports(CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _stateService.GetReportsAsync(email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPost("reservations/{reservationId:int}/assign")]
    public async Task<IActionResult> AssignReservation(
        int reservationId,
        [FromBody] AssignReservationDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.AssignReservationAsync(reservationId, request, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPut("facilities/{facilityId:int}/policy")]
    public async Task<IActionResult> UpdatePolicy(
        int facilityId,
        [FromBody] UpdateRentalPolicyDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.UpdatePolicyAsync(facilityId, request, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPost("facilities")]
    public async Task<IActionResult> CreateFacility(
        [FromBody] CreateFacilityDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.CreateFacilityAsync(request, email, cancellationToken);
        if (!result.IsSuccess)
            return ToActionResult(result);

        return CreatedAtAction(nameof(GetState), new { email = (string?)null }, result.Data);
    }

    [HttpDelete("facilities/{facilityId:int}")]
    public async Task<IActionResult> DeleteFacility(
        int facilityId,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.DeleteFacilityAsync(facilityId, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPut("facilities/{facilityId:int}")]
    public async Task<IActionResult> UpdateFacility(
        int facilityId,
        [FromBody] UpdateFacilityDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.UpdateFacilityAsync(facilityId, request, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPost("facilities/{facilityId:int}/staff")]
    public async Task<IActionResult> AssignStaff(
        int facilityId,
        [FromBody] AssignFacilityStaffDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.AssignStaffAsync(facilityId, request, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPost("units")]
    public async Task<IActionResult> CreateUnit(
        [FromBody] CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.CreateUnitAsync(request, email, cancellationToken);
        if (!result.IsSuccess)
            return ToActionResult(result);

        return CreatedAtAction(nameof(GetState), new { email = (string?)null }, result.Data);
    }

    [HttpPut("facilities/{facilityId:int}/rates")]
    public async Task<IActionResult> UpdateRentalRate(
        int facilityId,
        [FromBody] UpdateRentalRateDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.UpdateRentalRateAsync(facilityId, request, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpDelete("facilities/{facilityId:int}/rates/{unitTypeId:int}/{unitSizeId:int}")]
    public async Task<IActionResult> DeleteRentalRate(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.DeleteRentalRateAsync(facilityId, unitTypeId, unitSizeId, email, cancellationToken);
        return ToActionResult(result);
    }

    [HttpPut("units/{unitNumber}")]
    public async Task<IActionResult> UpdateUnit(
        string unitNumber,
        [FromBody] CreateStorageUnitDTO request,
        CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        var result = await _facilityService.UpdateUnitAsync(unitNumber, request, email, cancellationToken);
        return ToActionResult(result);
    }

    private IActionResult ToActionResult(OperationsServiceResponse result)
    {
        if (result.IsSuccess)
        {
            return result.StatusCode == 204 ? NoContent() : Ok(result.Data);
        }

        return result.StatusCode switch
        {
            400 => BadRequest(new { message = result.ErrorMessage }),
            401 => result.ErrorMessage is null ? Unauthorized() : Unauthorized(new { message = result.ErrorMessage }),
            403 => Forbid(),
            404 => NotFound(new { message = result.ErrorMessage }),
            409 => Conflict(new { message = result.ErrorMessage }),
            _ => StatusCode(result.StatusCode, new { message = result.ErrorMessage })
        };
    }
}


