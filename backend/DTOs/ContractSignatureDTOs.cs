using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

/// <summary>Payload for recording a customer's electronic contract signature.</summary>
public sealed record CreateContractSignatureRequest
{
    [Required, MaxLength(280_000)]
    public required string SignatureImage { get; init; }

    [Required, MaxLength(50)]
    public required string TermsVersion { get; init; }

    public required bool AcceptedTerms { get; init; }
}

/// <summary>Signature state and, when signed, the customer's stored signature.</summary>
public sealed record ContractSignatureStatusResponse(
    int ContractId,
    bool IsSigned,
    string? SignerName,
    string? SignatureImage,
    string? TermsVersion,
    DateTimeOffset? SignedAt);

/// <summary>Result of creating a signature or returning an existing immutable signature.</summary>
public sealed record SaveContractSignatureResult(
    bool Created,
    ContractSignatureStatusResponse Signature);
