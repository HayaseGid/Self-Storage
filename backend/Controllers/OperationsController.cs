using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
public class OperationsController : ControllerBase
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
    public async Task<IActionResult> GetState(
        [FromQuery] string? email,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        // Đã xác thực bằng JWT thì chỉ tin email trong token, bỏ qua ?email= để tránh xem trộm dữ liệu người khác.
        var authenticatedByJwt = HttpContext.Items.ContainsKey(SelfStorageAPI.Middleware.JwtIdentityMiddleware.AuthenticatedByJwtItem);
        var response = await _stateService.GetStateAsync(authenticatedByJwt ? null : email, userEmail, cancellationToken);
        return MapResponse(response);
    }

    /*
     * Danh sách có phân trang (Staff / Manager / Business / Admin / Khách - cùng phạm vi dữ liệu với /state):
     *   GET /api/operations/reservations?page=1&pageSize=20&q=&status=HANDED_OVER,CONFIRMED&sort=newest|oldest|appointment|appointment_desc|start|code&facilityId=
     *   GET /api/operations/units?page=1&pageSize=20&q=&status=AVAILABLE&typeId=&sort=newest|oldest|code|code_desc|updated&facilityId=
     *   GET /api/operations/contracts?page=1&pageSize=20&q=&status=ACTIVE,EXPIRING,EXPIRED,RENEWED,CLOSED&sort=newest|oldest|ending|code&facilityId=
     * Trả về { items, total, page, pageSize, pageCount, statusCounts }.
     */
    [HttpGet("reservations")]
    public Task<IActionResult> GetReservationsPage(
        [FromQuery] PageQuery query,
        [FromQuery] string? email,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => GetPagedList("reservations", query, email, userEmail, cancellationToken);

    [HttpGet("units")]
    public Task<IActionResult> GetUnitsPage(
        [FromQuery] PageQuery query,
        [FromQuery] string? email,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => GetPagedList("units", query, email, userEmail, cancellationToken);

    [HttpGet("contracts")]
    public Task<IActionResult> GetContractsPage(
        [FromQuery] PageQuery query,
        [FromQuery] string? email,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
        => GetPagedList("contracts", query, email, userEmail, cancellationToken);

    private async Task<IActionResult> GetPagedList(
        string kind,
        PageQuery query,
        string? email,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var authenticatedByJwt = HttpContext.Items.ContainsKey(SelfStorageAPI.Middleware.JwtIdentityMiddleware.AuthenticatedByJwtItem);
        var response = await _stateService.GetPagedListAsync(kind, query, authenticatedByJwt ? null : email, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpGet("reports")]
    public async Task<IActionResult> GetReports(
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _stateService.GetReportsAsync(userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpGet("policies")]
    public async Task<IActionResult> GetSystemPolicies(CancellationToken cancellationToken)
    {
        var response = await _facilityService.GetSystemPoliciesAsync(cancellationToken);
        return MapResponse(response);
    }

    [HttpPut("policies")]
    public async Task<IActionResult> UpdateSystemPolicies(
        [FromBody] UpdateSystemPoliciesDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.UpdateSystemPoliciesAsync(request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPost("reservations/{reservationId:int}/assign")]
    public async Task<IActionResult> AssignReservation(
        int reservationId,
        [FromBody] AssignReservationDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.AssignReservationAsync(reservationId, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPut("facilities/{facilityId:int}/policy")]
    public async Task<IActionResult> UpdatePolicy(
        int facilityId,
        [FromBody] UpdateRentalPolicyDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.UpdatePolicyAsync(facilityId, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPost("facilities")]
    public async Task<IActionResult> CreateFacility(
        [FromBody] CreateFacilityDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.CreateFacilityAsync(request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpDelete("facilities/{facilityId:int}")]
    public async Task<IActionResult> DeleteFacility(
        int facilityId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.DeleteFacilityAsync(facilityId, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPut("facilities/{facilityId:int}")]
    public async Task<IActionResult> UpdateFacility(
        int facilityId,
        [FromBody] UpdateFacilityDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.UpdateFacilityAsync(facilityId, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPost("facilities/{facilityId:int}/staff")]
    public async Task<IActionResult> AssignStaff(
        int facilityId,
        [FromBody] AssignFacilityStaffDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.AssignStaffAsync(facilityId, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPost("units")]
    public async Task<IActionResult> CreateUnit(
        [FromBody] CreateStorageUnitDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.CreateUnitAsync(request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPut("facilities/{facilityId:int}/rates")]
    public async Task<IActionResult> UpdateRentalRate(
        int facilityId,
        [FromBody] UpdateRentalRateDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.UpdateRentalRateAsync(facilityId, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpDelete("facilities/{facilityId:int}/rates/{unitTypeId:int}/{unitSizeId:int}")]
    public async Task<IActionResult> DeleteRentalRate(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.DeleteRentalRateAsync(facilityId, unitTypeId, unitSizeId, userEmail, cancellationToken);
        return MapResponse(response);
    }

    [HttpPut("units/{unitNumber}")]
    public async Task<IActionResult> UpdateUnit(
        string unitNumber,
        [FromBody] CreateStorageUnitDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var response = await _facilityService.UpdateUnitAsync(unitNumber, request, userEmail, cancellationToken);
        return MapResponse(response);
    }

    private IActionResult MapResponse(OperationsServiceResponse response)
    {
        if (response.StatusCode == 204)
            return NoContent();

        if (response.IsSuccess)
            return StatusCode(response.StatusCode, response.Data);

        if (response.ErrorMessage is null)
            return StatusCode(response.StatusCode);

        return StatusCode(response.StatusCode, new { message = response.ErrorMessage });
    }
}
