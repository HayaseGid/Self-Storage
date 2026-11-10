namespace SelfStorageAPI.DTOs;

/* Khách khiếu nại kết quả kiểm kho: lý do (10-1000 ký tự) + tối đa 3 ảnh (data:image/..., FE đã nén). */
public class DisputeInspectionDTO
{
    public string? Reason { get; set; }
    public List<string>? Images { get; set; }
}

/* Facility Manager giải quyết khiếu nại: số tiền chốt từng khoản (0 = miễn, không vượt số đề xuất) + nội dung quyết định. */
public class ResolveInspectionDTO
{
    public List<ResolveInspectionFeeDTO>? Fees { get; set; }
    public string? Notes { get; set; }
}

/* Facility Manager phê duyệt kết quả kiểm kho từ Staff trước khi gửi cho khách. */
public class ApproveInspectionDTO
{
    public List<ResolveInspectionFeeDTO>? Fees { get; set; }
    public string? Notes { get; set; }
}

public class ResolveInspectionFeeDTO
{
    public int FeeId { get; set; }
    public decimal FinalAmount { get; set; }
}
