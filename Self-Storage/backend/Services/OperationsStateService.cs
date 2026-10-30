using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

public class OperationsStateService : IOperationsStateService
{
    private readonly IOperationsStateRepository _stateRepository;
    private readonly IReservationHoldService _reservationHoldService;

    public OperationsStateService(
        IOperationsStateRepository stateRepository,
        IReservationHoldService reservationHoldService)
    {
        _stateRepository = stateRepository;
        _reservationHoldService = reservationHoldService;
    }

    public async Task<OperationsServiceResponse> GetStateAsync(
        string? queryEmail,
        string? headerEmail,
        CancellationToken cancellationToken)
    {
        var targetEmail = string.IsNullOrWhiteSpace(queryEmail) ? headerEmail : queryEmail;
        if (string.IsNullOrWhiteSpace(targetEmail))
            return new OperationsServiceResponse(false, "Thiếu email phiên đăng nhập.", 401, null);

        var requestingUser = await _stateRepository.GetUserByEmailAsync(targetEmail, cancellationToken);
        if (requestingUser is null)
            return new OperationsServiceResponse(false, "Tài khoản không tồn tại hoặc chưa được kích hoạt.", 401, null);

        if (requestingUser.RoleID is not (1 or 2 or 3 or 4 or 5))
            return new OperationsServiceResponse(false, "Không có quyền truy cập.", 403, null);

        await _reservationHoldService.ReleaseExpiredAsync(DateTime.UtcNow, cancellationToken);

        int? customerId = requestingUser.RoleID == 1 ? requestingUser.UserID : null;
        var facilityIdsInScope = await _stateRepository.GetFacilityIdsInScopeAsync(requestingUser, cancellationToken);

        var data = await _stateRepository.GetStateDataAsync(facilityIdsInScope, customerId, cancellationToken);
        return new OperationsServiceResponse(true, null, 200, data);
    }

    public async Task<OperationsServiceResponse> GetReportsAsync(
        string? headerEmail,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(headerEmail))
            return new OperationsServiceResponse(false, "Không có quyền truy cập.", 403, null);

        var user = await _stateRepository.GetUserByEmailAsync(headerEmail, cancellationToken);
        if (user is null || user.RoleID != 4)
            return new OperationsServiceResponse(false, "Không có quyền truy cập.", 403, null);

        var data = await _stateRepository.GetReportsDataAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 200, data);
    }
}

