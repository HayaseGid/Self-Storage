namespace SelfStorageAPI.Constants;

/// <summary>
/// Cách khách nhận kho — khách chọn lúc đặt kho, khớp CK_Reservation_HandoverMethod trong DB.
///   InPerson: khách đến cơ sở trong khung giờ đã chọn, nhân viên bàn giao trực tiếp.
///   Online  : không hẹn giờ; nhân viên bàn giao trên hệ thống, mã truy cập hiện trong tài khoản khách,
///             chìa khóa để ở quầy lễ tân, khách lên lễ tân nhận.
/// </summary>
public static class HandoverMethod
{
    public const string InPerson = "InPerson";
    public const string Online = "Online";

    /// <summary>Chuẩn hóa giá trị từ client. Bỏ trống = trực tiếp (giữ tương thích client cũ). null = không hợp lệ.</summary>
    public static string? Normalize(string? value) => (value ?? string.Empty).Trim().ToUpperInvariant() switch
    {
        "" or "INPERSON" or "IN_PERSON" or "IN-PERSON" => InPerson,
        "ONLINE" => Online,
        _ => null
    };

    public static string Label(string? method) => method == Online ? "Bàn giao online" : "Nhận trực tiếp";
}
