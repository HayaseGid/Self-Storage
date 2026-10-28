using Microsoft.AspNetCore.Mvc;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Controllers;

[Route("api/policies")]
[ApiController]
public class PoliciesController : ControllerBase
{
    private readonly IFacilityManagementService _facilityManagementService;

    public PoliciesController(IFacilityManagementService facilityManagementService)
    {
        _facilityManagementService = facilityManagementService;
    }

    [HttpGet]
    public async Task<IActionResult> GetPolicies(CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.GetPolicyGroupsAsync(cancellationToken);
        return StatusCode(result.StatusCode, result.Data);
    }

    [HttpGet("{policyKey}/history")]
    public async Task<IActionResult> GetPolicyHistory(string policyKey, CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.GetPolicyGroupHistoryAsync(policyKey, cancellationToken);
        if (!result.IsSuccess)
            return StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return Ok(result.Data);
    }

    [HttpPut("{policyKey}")]
    public async Task<IActionResult> UpdatePolicy(
        string policyKey,
        [FromBody] UpdatePolicyGroupDTO request,
        [FromHeader(Name = "X-User-Email")] string? userEmail,
        CancellationToken cancellationToken)
    {
        var result = await _facilityManagementService.UpdatePolicyGroupAsync(policyKey, request, userEmail, cancellationToken);
        if (!result.IsSuccess)
            return result.StatusCode == 403 ? Forbid() : StatusCode(result.StatusCode, new { message = result.ErrorMessage });
        return Ok(result.Data);
    }
}

