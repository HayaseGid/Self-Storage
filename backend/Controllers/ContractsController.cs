using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

[ApiController]
[Route("api/contracts")]
public sealed class ContractsController(
    IContractSignatureService signatures,
    SelfStorageDbContext context) : ControllerBase
{
    private const int MaximumSignatureBytes = 200_000;
    private static readonly byte[] PngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

    /// <summary>Gets signature status for a contract owned by the customer in X-User-Email.</summary>
    [HttpGet("{contractId:int}/signature")]
    [ProducesResponseType<ContractSignatureStatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ContractSignatureStatusResponse>> GetSignature(
        int contractId,
        CancellationToken cancellationToken)
    {
        var userId = await GetCustomerIdAsync(cancellationToken);
        if (!userId.HasValue)
            return Unauthorized();

        var signature = await signatures.GetForCustomerAsync(contractId, userId.Value, cancellationToken);
        return signature is null ? NotFound() : Ok(signature);
    }

    /// <summary>Records an immutable signature for the active contract owned by X-User-Email.</summary>
    [HttpPost("{contractId:int}/signature")]
    [ProducesResponseType<ContractSignatureStatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ContractSignatureStatusResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ContractSignatureStatusResponse>> SaveSignature(
        int contractId,
        [FromBody] CreateContractSignatureRequest request,
        CancellationToken cancellationToken)
    {
        var userId = await GetCustomerIdAsync(cancellationToken);
        if (!userId.HasValue)
            return Unauthorized();

        if (!request.AcceptedTerms)
            return BadRequest(new { message = "Bạn cần xác nhận đồng ý với điều khoản hợp đồng." });

        if (!string.Equals(
                request.TermsVersion,
                ContractSignatureService.CurrentTermsVersion,
                StringComparison.Ordinal))
        {
            return BadRequest(new { message = "Phiên bản điều khoản không hợp lệ. Hãy tải lại hợp đồng." });
        }

        if (!TryReadPng(request.SignatureImage, out _))
            return BadRequest(new { message = "Chữ ký phải là ảnh PNG hợp lệ và không vượt quá 200 KB." });

        var result = await signatures.SaveForCustomerAsync(
            contractId, userId.Value, request, cancellationToken);
        if (result is null)
            return NotFound(new { message = "Không tìm thấy hợp đồng đang hiệu lực thuộc tài khoản này." });

        if (!result.Created)
            return Ok(result.Signature);

        return CreatedAtAction(
            nameof(GetSignature),
            new { contractId },
            result.Signature);
    }

    private Task<int?> GetCustomerIdAsync(CancellationToken cancellationToken)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return Task.FromResult<int?>(null);

        return context.Users
            .Where(user => user.Email == email && user.RoleID == 1 && user.Status == "Active")
            .Select(user => (int?)user.UserID)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static bool TryReadPng(string dataUrl, out byte[] imageBytes)
    {
        imageBytes = [];
        const string prefix = "data:image/png;base64,";
        if (!dataUrl.StartsWith(prefix, StringComparison.Ordinal))
            return false;

        try
        {
            imageBytes = Convert.FromBase64String(dataUrl[prefix.Length..]);
            return imageBytes.Length is > 0 and <= MaximumSignatureBytes &&
                   imageBytes.AsSpan(0, Math.Min(imageBytes.Length, PngSignature.Length))
                       .SequenceEqual(PngSignature);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
