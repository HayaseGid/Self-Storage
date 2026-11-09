namespace SelfStorageAPI.DTOs;

/// <summary>Body của PUT /api/late-fees/charges/{chargeId}/waive (Manager miễn phí trễ hạn).</summary>
public sealed class WaiveLateFeeDTO
{
    /// <summary>Lý do miễn (bắt buộc, tối đa 255 ký tự) - lưu vào Charge.WaiveReason để đối soát.</summary>
    public string? Reason { get; set; }
}
