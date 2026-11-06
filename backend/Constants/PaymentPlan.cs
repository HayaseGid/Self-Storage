namespace SelfStorageAPI.Constants;

/// <summary>
/// Hình thức trả tiền thuê — khớp CK_Reservation_PaymentPlan trong DB (N'Monthly', N'Upfront').
/// </summary>
public static class PaymentPlan
{
    public const string Monthly = "Monthly";   // trả theo tháng: tháng đầu đóng ngày nhận kho, các tháng sau đóng trước ngày đầu mỗi kỳ
    public const string Upfront = "Upfront";   // trả 1 lần: đóng toàn bộ tiền thuê ngày nhận kho

    /// <summary>Chuẩn hóa giá trị từ client. null = không hợp lệ.</summary>
    public static string? Normalize(string? value) => (value ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "MONTHLY" => Monthly,
        "UPFRONT" => Upfront,
        _ => null
    };

    public static string Label(string plan) => plan == Upfront ? "Trả 1 lần" : "Trả theo tháng";
}
