using SelfStorageAPI.DTOs;

namespace SelfStorageAPI.Interfaces;

public interface IFacilityManagementService
{
    Task<OperationsServiceResponse> AssignReservationAsync(int reservationId, AssignReservationDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> UpdatePolicyAsync(int facilityId, UpdateRentalPolicyDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> GetSystemPoliciesAsync(CancellationToken cancellationToken);
    Task<OperationsServiceResponse> UpdateSystemPoliciesAsync(UpdateSystemPoliciesDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> CreateFacilityAsync(CreateFacilityDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> DeleteFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> UpdateFacilityAsync(int facilityId, UpdateFacilityDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> AssignStaffAsync(int facilityId, AssignFacilityStaffDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> CreateUnitAsync(CreateStorageUnitDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> UpdateRentalRateAsync(int facilityId, UpdateRentalRateDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> DeleteRentalRateAsync(int facilityId, int unitTypeId, int unitSizeId, string? userEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> UpdateUnitAsync(string unitNumber, CreateStorageUnitDTO request, string? userEmail, CancellationToken cancellationToken);
}
