using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IOperationsStateRepository
{
    Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<int[]> GetFacilityIdsInScopeAsync(User requestingUser, CancellationToken cancellationToken);
    Task<object> GetStateDataAsync(int[] facilityIdsInScope, int? customerId, CancellationToken cancellationToken);
    Task<object> GetReportsDataAsync(CancellationToken cancellationToken);
}

