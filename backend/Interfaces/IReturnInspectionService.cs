using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public record ReturnInspectionResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

/* Phí kiểm kho Staff nhập ở bước "Hoàn tất kiểm tra" (UnitReturnsController.Complete). */
public sealed record InspectionFeeInput(string? FeeCode, string Description, decimal Amount);

/* Kết quả ghi nhận kiểm kho. Held = có phí kiểm kho -> CHƯA trừ cọc / hoàn cọc, chờ khách xác nhận. */
public sealed record InspectionRecordResult(bool Held, int InspectionId, DateTime? ConfirmDeadline, string? Message);

public interface IReturnInspectionService
{
    // ----- Gọi từ UnitReturnsController.Complete
    Task<string?> ValidateAsync(string condition, IReadOnlyList<string>? images, IReadOnlyList<InspectionFeeInput> fees, CancellationToken cancellationToken);
    Task<InspectionRecordResult> RecordAsync(Reservation reservation, string condition, string? notes, IReadOnlyList<string>? images,
        IReadOnlyList<InspectionFeeInput> fees, decimal depositRemaining, DateTime now, int staffUserId, CancellationToken cancellationToken);

    // ----- Khách
    Task<ReturnInspectionResponse> GetMineAsync(string? userEmail, CancellationToken cancellationToken);
    Task<ReturnInspectionResponse> AcceptAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken);
    Task<ReturnInspectionResponse> DisputeAsync(int inspectionId, DisputeInspectionDTO request, string? userEmail, CancellationToken cancellationToken);

    // ----- Staff / Manager / BOM
    Task<ReturnInspectionResponse> GetStaffAsync(string? userEmail, CancellationToken cancellationToken);
    Task<ReturnInspectionResponse> GetFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);
    Task<ReturnInspectionResponse> ApproveAsync(int inspectionId, ApproveInspectionDTO request, string? userEmail, CancellationToken cancellationToken);
    Task<ReturnInspectionResponse> ResolveAsync(int inspectionId, ResolveInspectionDTO request, string? userEmail, CancellationToken cancellationToken);

    // ----- Chi tiết (kèm ảnh) cho mọi vai trò có quyền xem
    Task<ReturnInspectionResponse> GetDetailAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken);
}
