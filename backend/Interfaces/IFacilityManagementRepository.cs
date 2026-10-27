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
    Task<bool> FacilityNameAndAddressExistsAsync(string facilityName, string address, CancellationToken cancellationToken);
    Task<bool> FacilityHasDependenciesAsync(int facilityId, CancellationToken cancellationToken);
    void AddFacility(Facility facility);
    void RemoveFacility(Facility facility);

    Task<RentalPolicy?> GetRentalPolicyByFacilityIdAsync(int facilityId, CancellationToken cancellationToken);
    void AddRentalPolicy(RentalPolicy policy);
    void RemoveRentalPolicy(RentalPolicy policy);

    Task<FacilityStaff?> GetFacilityStaffAssignmentAsync(int facilityId, int userId, CancellationToken cancellationToken);
    void AddFacilityStaff(FacilityStaff assignment);

    Task<Reservation?> GetReservationByIdAsync(int reservationId, CancellationToken cancellationToken);
    Task<bool> HasConflictingReservationForUnitAsync(int excludeReservationId, int unitId, DateTime startDate, DateTime endDate, CancellationToken cancellationToken);
    Task<bool> HasActiveBookingHoldForUnitAsync(int unitId, DateTime now, CancellationToken cancellationToken);

    Task<StorageUnit?> GetUnitForReservationAssignmentAsync(int? assignedUnitId, string unitNumber, int facilityId, int unitTypeId, CancellationToken cancellationToken);
    Task<StorageUnit?> GetUnitByNumberAndFacilityAsync(string unitNumber, int facilityId, CancellationToken cancellationToken);
    Task<List<string>> GetUnitNumbersByFacilityAsync(int facilityId, CancellationToken cancellationToken);
    Task<List<StorageUnit>> GetUnitsByFacilityTypeAndSizeAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    Task<bool> AnyUnitUsesRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    void AddStorageUnit(StorageUnit unit);

    Task<bool> UnitTypeExistsAsync(int unitTypeId, CancellationToken cancellationToken);
    Task<bool> UnitSizeExistsAsync(int unitSizeId, CancellationToken cancellationToken);
    Task<(UnitType unitType, UnitSize unitSize)> GetOrCreateUnitLookupsAsync(CreateStorageUnitDTO request, CancellationToken cancellationToken);

    Task<RentalRate?> GetRentalRateAsync(int facilityId, int unitTypeId, int unitSizeId, CancellationToken cancellationToken);
    Task<List<RentalRate>> GetRentalRatesByFacilityIdAsync(int facilityId, CancellationToken cancellationToken);
    void AddRentalRate(RentalRate rate);
    void RemoveRentalRate(RentalRate rate);
    void RemoveRentalRates(IEnumerable<RentalRate> rates);

    Task<T> ExecuteInTransactionAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken);
    Task SaveChangesAsync(CancellationToken cancellationToken);
}

