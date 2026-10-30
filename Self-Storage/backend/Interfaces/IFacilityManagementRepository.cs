using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public interface IFacilityManagementRepository
{
    Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<User?> GetActiveUserByEmailAndRoleAsync(string email, int roleId, CancellationToken cancellationToken);
    Task<string?> GetUserEmailByIdAsync(int userId, CancellationToken cancellationToken);
    Task<bool> IsFacilityManagerAsync(int facilityId, int userId, CancellationToken cancellationToken);

    Task<Facility?> GetFacilityByIdAsync(int facilityId, CancellationToken cancellationToken);
    Task<bool> FacilityExistsAsync(int facilityId, CancellationToken cancellationToken);
    Task<bool> IsFacilityActiveAsync(int facilityId, CancellationToken cancellationToken);
    Task<bool> UnitCodePrefixExistsAsync(string unitCodePrefix, CancellationToken cancellationToken);
    Task<bool> FacilityNameExistsAsync(string facilityName, CancellationToken cancellationToken);
    Task<bool> FacilityHasDependenciesAsync(int facilityId, CancellationToken cancellationToken);
    void AddFacility(Facility facility);
    void RemoveFacility(Facility facility);

    Task<RentalPolicy?> GetRentalPolicyByFacilityIdAsync(int facilityId, CancellationToken cancellationToken);
    Task<RentalPolicy?> GetGlobalRentalPolicyAsync(CancellationToken cancellationToken);
    Task<List<RentalPolicy>> GetAllRentalPoliciesAsync(CancellationToken cancellationToken);
    void AddRentalPolicy(RentalPolicy policy);
    void RemoveRentalPolicy(RentalPolicy policy);

    Task<List<ContractType>> GetContractTypesAsync(CancellationToken cancellationToken);
    Task<List<FeePolicy>> GetFeePoliciesAsync(CancellationToken cancellationToken);
    void AddFeePolicy(FeePolicy feePolicy);
    void RemoveFeePolicy(FeePolicy feePolicy);
    void ReplaceCancellationRules(RentalPolicy policy, IEnumerable<CancellationRule> rules);

    Task<List<SizeCategory>> GetSizeCategoriesWithDetailsAsync(CancellationToken cancellationToken);
    Task<SizeCategory?> GetSizeCategoryByCodeAsync(string code, CancellationToken cancellationToken);
    void AddSizeCategory(SizeCategory category);
    void RemoveSizeCategory(SizeCategory category);
    Task<List<StorageUnit>> GetAllStorageUnitsAsync(CancellationToken cancellationToken);
    Task<List<RentalRate>> GetAllRentalRatesAsync(CancellationToken cancellationToken);
    Task<List<UnitSize>> GetAllUnitSizesAsync(CancellationToken cancellationToken);

    Task<FacilityStaff?> GetFacilityStaffAssignmentAsync(int facilityId, int userId, CancellationToken cancellationToken);
    void AddFacilityStaff(FacilityStaff assignment);

    Task<Reservation?> GetReservationByIdAsync(int reservationId, CancellationToken cancellationToken);
    Task<bool> HasConflictingReservationForUnitAsync(int excludeReservationId, int unitId, DateTime startDate, DateTime endDate, CancellationToken cancellationToken);
    Task<bool> HasActiveBookingHoldForUnitAsync(int unitId, DateTime now, CancellationToken cancellationToken);
    void AddReservationUnit(ReservationUnit reservationUnit);
    Task<Contract> EnsureContractForReservationAsync(Reservation reservation, int? userId, CancellationToken cancellationToken);

    Task<StorageUnit?> GetUnitByNumberAndFacilityAsync(string unitNumber, int facilityId, CancellationToken cancellationToken);
    Task<List<string>> GetUnitNumbersByFacilityAsync(int facilityId, CancellationToken cancellationToken);
    Task<List<StorageUnit>> GetUnitsByFacilityTypeAndSizeAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    Task<bool> AnyUnitUsesRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    void AddStorageUnit(StorageUnit unit);

    Task<bool> UnitTypeExistsAsync(int unitTypeId, CancellationToken cancellationToken);
    Task<bool> UnitSizeExistsAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<UnitSize?> GetUnitSizeWithCategoryAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<(UnitType unitType, UnitSize unitSize)> GetOrCreateUnitLookupsAsync(CreateStorageUnitDTO request, CancellationToken cancellationToken);
    Task EnsureFacilityCatalogLinksAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);

    Task<RentalRate?> GetRentalRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    Task<List<RentalRate>> GetRentalRatesByFacilityIdAsync(int facilityId, CancellationToken cancellationToken);
    void AddRentalRate(RentalRate rate);
    void RemoveRentalRate(RentalRate rate);
    void RemoveRentalRates(IEnumerable<RentalRate> rates);
    Task RemoveFacilityCatalogLinksAsync(int facilityId, CancellationToken cancellationToken);

    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}
