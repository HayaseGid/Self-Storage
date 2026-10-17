using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IContractSignatureService
{
    Task<ContractSignatureStatusResponse?> GetForCustomerAsync(
        int contractId,
        int userId,
        CancellationToken cancellationToken);

    Task<SaveContractSignatureResult?> SaveForCustomerAsync(
        int contractId,
        int userId,
        CreateContractSignatureRequest request,
        CancellationToken cancellationToken);
}
