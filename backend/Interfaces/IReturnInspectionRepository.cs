using System.Data;
using Microsoft.EntityFrameworkCore.Storage;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

/* Một dòng ReturnInspection kèm thông tin đơn / khách / cơ sở để hiển thị. */
public sealed class ReturnInspectionRow
{
    public int InspectionID { get; set; }
    public int ReservationID { get; set; }
    public string ConditionResult { get; set; } = "Good";
    public string? StaffNotes { get; set; }
    public string? StaffImages { get; set; }
    public int StaffImageCount { get; set; }
    public int InspectedByUserID { get; set; }
    public string? InspectedByName { get; set; }
    public DateTime InspectedAt { get; set; }
    public DateTime ConfirmDeadline { get; set; }
    public decimal DepositRemaining { get; set; }
    public string Status { get; set; } = "";
    public DateTime? RespondedAt { get; set; }
    public string? DisputeReason { get; set; }
    public string? CustomerImages { get; set; }
    public int CustomerImageCount { get; set; }
    public int? ResolvedByUserID { get; set; }
    public string? ResolvedByName { get; set; }
    public string? ResolvedByEmail { get; set; }
    public string? ResolvedByPhone { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? ResolutionNotes { get; set; }
    public DateTime? SettledAt { get; set; }
    public string? SettledBy { get; set; }

    public string ReservationCode { get; set; } = "";
    public string? ContractNumber { get; set; }
    public int CustomerID { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string? CustomerPhone { get; set; }
    public int FacilityID { get; set; }
    public string? FacilityName { get; set; }
    public string? Units { get; set; }
    public string? UnitDetails { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public decimal DepositPaid { get; set; }

    public List<ReturnInspectionFeeRow> Fees { get; set; } = new();
}

public sealed class ReturnInspectionFeeRow
{
    public int FeeID { get; set; }
    public int InspectionID { get; set; }
    public string? FeeCode { get; set; }
    public int? FeePolicyID { get; set; }
    public string Description { get; set; } = "";
    public decimal ProposedAmount { get; set; }
    public decimal? FinalAmount { get; set; }
}

public sealed record NewReturnInspection(
    int ReservationId, string ConditionResult, string? StaffNotes, string? StaffImagesJson, int InspectedByUserId,
    DateTime InspectedAt, DateTime ConfirmDeadline, decimal DepositRemaining, string Status, string? SettledBy, DateTime? SettledAt);

public sealed record NewReturnInspectionFee(string? FeeCode, int? FeePolicyId, string Description, decimal ProposedAmount);

public interface IReturnInspectionRepository
{
    Task<User?> GetActiveUserByEmailAsync(string email, CancellationToken cancellationToken);
    Task<bool> IsManagerOfFacilityAsync(int userId, int facilityId, CancellationToken cancellationToken);
    Task<List<int>> GetStaffFacilityIdsAsync(int userId, CancellationToken cancellationToken);
    Task<List<FeePolicy>> GetFeePoliciesAsync(CancellationToken cancellationToken);

    // ----- đọc (includeImages = false: không trả ảnh base64 cho danh sách, chỉ đếm số ảnh)
    Task<List<ReturnInspectionRow>> ListAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, string? status,
        DateTime? settledSince, bool includeImages, CancellationToken cancellationToken);
    Task<ReturnInspectionRow?> GetAsync(int inspectionId, bool includeImages, CancellationToken cancellationToken);
    Task<List<int>> GetOverdueAwaitingIdsAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, DateTime now, CancellationToken cancellationToken);

    // ----- ghi (luôn chạy trong transaction EF đang mở)
    Task<int> InsertAsync(NewReturnInspection row, IReadOnlyList<NewReturnInspectionFee> fees, CancellationToken cancellationToken);
    Task<ReturnInspectionRow?> LockAsync(int inspectionId, CancellationToken cancellationToken);
    Task SetFinalAmountAsync(int feeId, decimal finalAmount, CancellationToken cancellationToken);
    Task MarkApprovedAsync(int inspectionId, string nextStatus, DateTime confirmDeadline,
        int resolvedByUserId, string? resolutionNotes, CancellationToken cancellationToken);
    Task MarkDisputedAsync(int inspectionId, string reason, string? customerImagesJson, DateTime respondedAt, CancellationToken cancellationToken);
    Task MarkSettledAsync(int inspectionId, string settledBy, DateTime settledAt, DateTime? respondedAt,
        int? resolvedByUserId, string? resolutionNotes, CancellationToken cancellationToken);

    Task<Reservation?> GetReservationForSettlementAsync(int reservationId, CancellationToken cancellationToken);
    void AddCharge(Charge charge);
    void AddPayment(Payment payment);
    Task SaveChangesAsync(CancellationToken cancellationToken);
    bool HasActiveTransaction { get; }
    Task<IDbContextTransaction> BeginTransactionAsync(IsolationLevel isolationLevel, CancellationToken cancellationToken);
    void ClearTracking();
}
