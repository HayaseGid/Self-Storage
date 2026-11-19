using System;

namespace SelfStorageAPI.Models;

/// <summary>
/// Đơn trả kho sớm (chấm dứt hợp đồng trước hạn) khách gửi khi hợp đồng còn hơn 30 ngày; Facility Manager duyệt / từ chối.
/// Status: Pending (chờ duyệt) | Approved (đã duyệt, đã tạo lịch trả kho) | Rejected (từ chối) | Cancelled (khách rút đơn).
/// RefundAmount: tiền thuê được hoàn (các kỳ đã đóng sau ngày trả kho); CancelledPeriods: số kỳ bị hủy / hoàn;
/// LateNotice: trả theo tháng mà gửi đơn muộn (dưới N ngày trước kỳ đóng tiền tới) nên phải đóng kỳ tới.
/// </summary>
public class EarlyReturnRequest
{
    public int EarlyReturnRequestID { get; set; }
    public int ReservationID { get; set; }
    public int CustomerID { get; set; }
    public DateTime ReturnDate { get; set; }
    public string ReturnTime { get; set; } = string.Empty; // HH:mm
    public string Reason { get; set; } = string.Empty;     // moving | no_need | other_unit | price | service | other
    public string? Note { get; set; }
    public string Status { get; set; } = "Pending";
    public decimal RefundAmount { get; set; }
    public int CancelledPeriods { get; set; }
    public bool LateNotice { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? DecidedByUserID { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? ManagerNote { get; set; }
}
