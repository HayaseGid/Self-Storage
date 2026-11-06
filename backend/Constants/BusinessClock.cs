namespace SelfStorageAPI.Constants;

/// <summary>
/// "Hôm nay" theo giờ Việt Nam (UTC+7) — dùng chung cho mọi quy tắc nghiệp vụ theo ngày
/// (ngày bắt đầu thuê, ngày trả kho...), không phụ thuộc múi giờ của máy chạy server.
/// </summary>
public static class BusinessClock
{
    public static DateTime Today => DateTime.UtcNow.AddHours(7).Date;
}
