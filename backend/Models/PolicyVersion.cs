using System;

namespace SelfStorageAPI.Models;

/// <summary>
/// Một phiên bản của 1 nhóm chính sách do Business Operations Manager chỉnh (deposit, overdue, reservation, renewal_return).
/// Toàn bộ nội dung chính sách lưu dạng JSON ở ConfigJson; Status: Active (đang áp dụng) | Scheduled (hẹn ngày) | Superseded (đã thay).
/// </summary>
public class PolicyVersion
{
    public int PolicyVersionID { get; set; }
    public string PolicyKey { get; set; } = string.Empty;
    public int Version { get; set; }
    public string Status { get; set; } = "Active";
    public string EffectiveFrom { get; set; } = string.Empty; // yyyy-MM-dd
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string? Note { get; set; }
    public string ConfigJson { get; set; } = "{}";
}
