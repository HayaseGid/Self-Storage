namespace SelfStorageAPI.DTOs;

/// <summary>Body của PUT /api/manager-tools/reservations/{reservationId}/owner (đổi người phụ trách đơn)</summary>
public sealed class ChangeOwnerDTO
{
    /// <summary>UserID của Facility Staff mới phụ trách đơn.</summary>
    public int StaffUserId { get; set; }

    /// <summary>Ngày hẹn mới (không bắt buộc). Bỏ trống: giữ lịch hẹn hiện tại.</summary>
    public DateTime? ScheduledDate { get; set; }

    /// <summary>Giờ hẹn mới "HH:mm" (không bắt buộc).</summary>
    public string? ScheduledTime { get; set; }
}

/// <summary>Body của POST /api/manager-tools/facilities/{facilityId}/tasks</summary>
public sealed class AssignTaskDTO
{
    /// <summary>"Move In" (nhận kho) | "Move Out" (trả kho) | "Inspection" (kiểm tra kho)</summary>
    public string? TaskType { get; set; }

    /// <summary>Bắt buộc với Move In / Move Out: giao cho mọi kho của đơn.</summary>
    public int? ReservationId { get; set; }

    /// <summary>Bắt buộc với Inspection. Với Move In / Move Out: nếu có thì chỉ giao kho này của đơn.</summary>
    public int? UnitId { get; set; }

    /// <summary>UserID của Facility Staff được giao.</summary>
    public int StaffUserId { get; set; }

    /// <summary>Ngày hẹn (yyyy-MM-dd). Bỏ trống: Move In lấy ngày hẹn của đơn, việc khác lấy hôm nay.</summary>
    public DateTime? ScheduledDate { get; set; }

    /// <summary>Giờ hẹn dạng "HH:mm" (không bắt buộc).</summary>
    public string? ScheduledTime { get; set; }

    /// <summary>Ghi chú cho nhân viên (tối đa 1000 ký tự).</summary>
    public string? Notes { get; set; }
}
