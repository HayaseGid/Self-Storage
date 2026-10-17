using System.Data;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public sealed class ContractSignatureService(SelfStorageDbContext context) : IContractSignatureService
{
    public const string CurrentTermsVersion = "storage-rental-v1";

    public async Task<ContractSignatureStatusResponse?> GetForCustomerAsync(
        int contractId,
        int userId,
        CancellationToken cancellationToken)
    {
        return await context.Contracts
            .Where(contract =>
                contract.ContractID == contractId &&
                contract.Reservation.CustomerID == userId &&
                contract.Reservation.Customer.Status == "Active" &&
                contract.Reservation.Customer.Role.RoleName == RoleNames.StorageCustomer)
            .Select(contract => contract.Signature == null
                ? new ContractSignatureStatusResponse(
                    contract.ContractID, false, null, null, null, null)
                : new ContractSignatureStatusResponse(
                    contract.ContractID,
                    true,
                    contract.Signature.SignerName,
                    contract.Signature.SignatureImage,
                    contract.Signature.TermsVersion,
                    contract.Signature.SignedAt))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<SaveContractSignatureResult?> SaveForCustomerAsync(
        int contractId,
        int userId,
        CreateContractSignatureRequest request,
        CancellationToken cancellationToken)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);

        var contract = await context.Contracts
            .Include(item => item.Reservation)
                .ThenInclude(reservation => reservation.Customer)
                    .ThenInclude(customer => customer.Role)
            .Include(item => item.Signature)
            .SingleOrDefaultAsync(item => item.ContractID == contractId, cancellationToken);

        if (contract is null ||
            contract.Reservation.CustomerID != userId ||
            contract.Reservation.Customer.Status != "Active" ||
            contract.Reservation.Customer.Role.RoleName != RoleNames.StorageCustomer)
        {
            return null;
        }

        if (!string.Equals(contract.ContractStatus, "Active", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        if (contract.Signature is not null)
        {
            await transaction.CommitAsync(cancellationToken);
            return new SaveContractSignatureResult(
                false,
                new ContractSignatureStatusResponse(
                    contract.ContractID,
                    true,
                    contract.Signature.SignerName,
                    contract.Signature.SignatureImage,
                    contract.Signature.TermsVersion,
                    contract.Signature.SignedAt));
        }

        var signature = new ContractSignature
        {
            ContractID = contract.ContractID,
            UserID = userId,
            SignerName = contract.Reservation.Customer.FullName,
            SignatureImage = request.SignatureImage,
            TermsVersion = request.TermsVersion,
            SignedAt = DateTimeOffset.UtcNow,
        };

        context.ContractSignatures.Add(signature);
        await context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new SaveContractSignatureResult(
            true,
            new ContractSignatureStatusResponse(
                signature.ContractID,
                true,
                signature.SignerName,
                signature.SignatureImage,
                signature.TermsVersion,
                signature.SignedAt));
    }
}
