using System.Globalization;

namespace SelfStorageAPI.Constants;

/// <summary>
/// "Hôm nay" theo giờ Việt Nam (UTC+7) — dùng chung cho mọi quy tắc nghiệp vụ theo ngày
/// (ngày bắt đầu thuê, ngày trả kho...), không phụ thuộc múi giờ của máy chạy server.
/// Hỗ trợ nhận ngày giả lập từ header "X-Simulated-Date" (YYYY-MM-DD) khi chạy Demo.
/// </summary>
public static class BusinessClock
{
    public const string SimulatedDateHeader = "X-Simulated-Date";

    private static readonly AsyncLocal<DateTime?> SimulatedToday = new();

    public static DateTime Today => SimulatedToday.Value ?? DateTime.UtcNow.AddHours(7).Date;

    public static void SetSimulatedDate(string? rawDate)
    {
        if (!string.IsNullOrWhiteSpace(rawDate) &&
            DateTime.TryParseExact(rawDate.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
        {
            SimulatedToday.Value = parsed.Date;
        }
        else
        {
            SimulatedToday.Value = null;
        }
    }
}
