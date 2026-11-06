namespace SelfStorageAPI.DTOs;

/// <summary>Body của POST /api/staff-tools/unit-reports (Staff báo cáo tình trạng / sự cố kho)</summary>
public sealed class UnitReportDTO
{
    public int UnitId { get; set; }

    /// <summary>"Good" (kho bình thường) | "Damaged" (hư hỏng) – khớp CHECK CK_HandoverTask_ConditionResult</summary>
    public string? Result { get; set; }

    /// <summary>Mô tả tình trạng (bắt buộc khi Damaged, tối đa 1000 ký tự)</summary>
    public string? Notes { get; set; }

    /// <summary>Ảnh minh chứng dạng data URL "data:image/...;base64,..." (tối đa 3 ảnh)</summary>
    public List<string>? EvidenceImages { get; set; }
}

/// <summary>Body của PUT /api/staff-tools/units/{unitId}/status</summary>
public sealed class UpdateUnitStatusDTO
{
    /// <summary>"Available" | "Pending Inspection" | "Maintenance" (nhận cả AVAILABLE / PENDING_INSPECTION / MAINTENANCE)</summary>
    public string? Status { get; set; }
}
