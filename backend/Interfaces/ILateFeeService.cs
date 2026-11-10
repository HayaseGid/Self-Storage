using SelfStorageAPI.DTOs;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Interfaces;

public record LateFeeResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

/// <summary>Kết quả quyết toán công nợ khi trả kho (dùng trong UnitReturnsController.Complete).</summary>
public sealed record ReturnDebtResult(decimal RemainingDeposit, decimal FromDeposit, decimal Owed, int CancelledFuturePeriods, string? Message);

public interface ILateFeeService
{
    /// <summary>Khách: phí trễ hạn + tiền thuê quá hạn của mình (tự cập nhật phí tới hôm nay).</summary>
    Task<LateFeeResponse> GetMineAsync(string? userEmail, CancellationToken cancellationToken);

    /// <summary>Khách: đóng mô phỏng các khoản phí trễ hạn chưa đóng của một đơn.</summary>
    Task<LateFeeResponse> PayDemoAsync(int reservationId, string? userEmail, CancellationToken cancellationToken);

    /// <summary>Manager / BOM / Staff của cơ sở: công nợ tiền thuê &amp; phí trễ hạn tại cơ sở.</summary>
    Task<LateFeeResponse> GetFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);

    /// <summary>Manager / Staff gọi khi tải trang: cập nhật phí trễ hạn của cơ sở tới hôm nay.</summary>
    Task<LateFeeResponse> SyncFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken);

    /// <summary>Manager / BOM: miễn một khoản phí trễ hạn chưa đóng (bắt buộc ghi lý do).</summary>
    Task<LateFeeResponse> WaiveAsync(int chargeId, WaiveLateFeeDTO request, string? userEmail, CancellationToken cancellationToken);

    /// <summary>Staff: xem trước công nợ sẽ trừ vào cọc khi hoàn tất kiểm tra trả kho.</summary>
    Task<LateFeeResponse> PreviewReturnAsync(int reservationId, string? userEmail, CancellationToken cancellationToken);

    /// <summary>
    /// Quyết toán công nợ khi trả kho, chạy BÊN TRONG transaction của UnitReturnsController.Complete:
    /// tiền thuê đã tới kỳ chưa đóng + phí trễ hạn + phí cũ chưa đóng trừ vào cọc trước; kỳ thuê chưa tới thì hủy.
    /// </summary>
    Task<ReturnDebtResult> SettleOnReturnAsync(Reservation reservation, decimal depositAvailable, DateTime today, DateTime now,
        int staffUserId, CancellationToken cancellationToken);
}
