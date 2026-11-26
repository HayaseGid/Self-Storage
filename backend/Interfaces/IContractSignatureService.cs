using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IContractSignatureService
{
    Task<ContractSignatureStatusResponse?> GetForCustomerAsync(
        int contractId,
        int userId,
        CancellationToken cancellationToken);

    /// <summary>Chữ ký của hợp đồng thuộc cơ sở do Manager (userId) quản lý; null nếu không thuộc quyền.</summary>
    Task<ContractSignatureStatusResponse?> GetForFacilityManagerAsync(
        int contractId,
        int managerUserId,
        CancellationToken cancellationToken);

    Task<SaveContractSignatureResult?> SaveForCustomerAsync(
        int contractId,
        int userId,
        CreateContractSignatureRequest request,
        CancellationToken cancellationToken);
}
