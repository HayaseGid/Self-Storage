using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// LUẬT PHÂN CÔNG NHÂN VIÊN — nguồn duy nhất, dùng chung cho việc NHẬN KHO (Move In) và TRẢ KHO (Move Out).
/// Không chứa truy vấn DB: nơi gọi tự tải danh sách nhân viên + lịch hiện có rồi đưa vào đây,
/// nên mọi nơi phân công đều chấm điểm cùng một cách.
///
/// Thứ tự chọn người:
///   1. Loại người có lịch trùng giờ (cách nhau dưới 60 phút) trong cùng ngày.
///   2. Người được ưu tiên (VD: người đã bàn giao kho, khi trả kho) được chọn nếu không trùng giờ
///      và số lần hẹn trong ngày không hơn người rảnh nhất quá 1 lần (không để một người ôm hết việc).
///   3. Còn lại: ít lần hẹn nhất trong ngày → ít nhất trong tuần → theo tên → theo mã.
///   4. Không ai hợp lệ → trả về null (nơi gọi quyết định: để Manager giao tay, hoặc yêu cầu chọn giờ khác).
/// Một "lần hẹn" = một đơn trong một ngày (đơn nhiều kho chỉ tính 1 lần).
/// </summary>
public static class StaffAssignmentPolicy
{
    public static readonly TimeSpan ConflictWindow = TimeSpan.FromMinutes(60);

    /// <summary>Chênh lệch tối đa (số lần hẹn trong ngày) để vẫn ưu tiên người được chỉ định.</summary>
    public const int PreferredMaxExtraLoad = 1;

    /// <summary>Khung giờ khách được chọn khi hẹn trả kho (giờ VN).</summary>
    public static readonly TimeSpan[] ReturnSlots =
        Enumerable.Range(8, 9).Select(h => TimeSpan.FromHours(h)).ToArray(); // 08:00 ... 16:00

    /// <summary>
    /// Khung giờ NHẬN KHO khách được chọn (giờ VN), mỗi khung 2 tiếng: 8–10, 10–12, 12–14, 14–16.
    /// Lưu giờ bắt đầu khung vào Reservation.AppointmentTime. Hai đơn cùng khung trùng giờ (cách nhau 0 phút),
    /// hai khung liền nhau cách 120 phút nên không trùng -> mỗi nhân viên nhận tối đa 1 đơn / khung, 4 đơn / ngày.
    /// </summary>
    public static readonly TimeSpan[] MoveInSlots =
        { TimeSpan.FromHours(8), TimeSpan.FromHours(10), TimeSpan.FromHours(12), TimeSpan.FromHours(14) };

    public static readonly TimeSpan MoveInSlotLength = TimeSpan.FromHours(2);

    /// <summary>"08:00–10:00" nếu là khung nhận kho, "09:30" nếu là giờ lẻ (dữ liệu cũ), null nếu không có giờ.</summary>
    public static string? SlotLabel(TimeSpan? time)
    {
        if (time is null) return null;
        return MoveInSlots.Contains(time.Value)
            ? $"{time.Value:hh\\:mm}–{time.Value.Add(MoveInSlotLength):hh\\:mm}"
            : time.Value.ToString(@"hh\:mm");
    }

    /// <summary>Đọc khung giờ client gửi ("08:00", "8", "08:00-10:00"). null = không phải khung hợp lệ.</summary>
    public static TimeSpan? ParseMoveInSlot(string? value)
    {
        var raw = (value ?? string.Empty).Trim();
        var dash = raw.IndexOfAny(new[] { '-', '–' });
        if (dash > 0) raw = raw[..dash].Trim();
        if (int.TryParse(raw, out var hour)) raw = $"{hour}:00";
        return TimeSpan.TryParse(raw, out var parsed) && MoveInSlots.Contains(parsed) ? parsed : null;
    }

    public sealed record Slot(int StaffId, DateTime Date, TimeSpan? Time, string Key);

    public sealed record Candidate(int UserId, string FullName);

    /// <summary>Việc nào được tính vào lịch của nhân viên: mọi việc có ngày hẹn và chưa bị hủy.</summary>
    public static bool CountsAsLoad(HandoverTask t) => t.Status != "Cancelled" && t.ScheduledDate != null;

    public static string SlotKey(HandoverTask t) => t.ReservationID.HasValue ? $"R{t.ReservationID}" : $"T{t.TaskID}";

    public static List<Slot> ToSlots(IEnumerable<HandoverTask> tasks) => tasks
        .Where(CountsAsLoad)
        .Select(t => new Slot(t.AssignedStaffID, t.ScheduledDate!.Value.Date, t.ScheduledTime, SlotKey(t)))
        .ToList();

    public static DateTime WeekStart(DateTime date)
    {
        var diff = ((int)date.DayOfWeek + 6) % 7; // Thứ 2 là đầu tuần
        return date.Date.AddDays(-diff);
    }

    /// <summary>Trùng giờ với một lần hẹn KHÁC (bỏ qua chính đơn đang xét). Việc không có giờ không gây trùng.</summary>
    public static bool HasConflict(IEnumerable<Slot> slots, int staffId, DateTime date, TimeSpan? time, string? ignoreKey = null)
    {
        if (time is null) return false;
        return slots.Any(s => s.StaffId == staffId && s.Date == date.Date && s.Key != ignoreKey && s.Time.HasValue &&
                              (s.Time.Value - time.Value).Duration() < ConflictWindow);
    }

    public static int DayLoad(IEnumerable<Slot> slots, int staffId, DateTime date, string? ignoreKey = null)
        => slots.Where(s => s.StaffId == staffId && s.Date == date.Date && s.Key != ignoreKey).Select(s => s.Key).Distinct().Count();

    public static int WeekLoad(IEnumerable<Slot> slots, int staffId, DateTime date, string? ignoreKey = null)
    {
        var week = WeekStart(date);
        return slots.Where(s => s.StaffId == staffId && WeekStart(s.Date) == week && s.Key != ignoreKey).Select(s => s.Key).Distinct().Count();
    }

    /// <summary>Chọn nhân viên cho một lần hẹn. null = không ai hợp lệ.</summary>
    public static Candidate? Pick(
        IReadOnlyCollection<Candidate> staff,
        IReadOnlyCollection<Slot> slots,
        DateTime date,
        TimeSpan? time,
        int? preferredStaffId = null,
        string? ignoreKey = null)
    {
        var candidates = staff.Where(s => !HasConflict(slots, s.UserId, date, time, ignoreKey)).ToList();
        if (candidates.Count == 0) return null;

        var lightest = candidates.Min(s => DayLoad(slots, s.UserId, date, ignoreKey));
        if (preferredStaffId is not null)
        {
            var preferred = candidates.FirstOrDefault(s => s.UserId == preferredStaffId.Value);
            if (preferred is not null && DayLoad(slots, preferred.UserId, date, ignoreKey) <= lightest + PreferredMaxExtraLoad)
                return preferred;
        }

        return candidates
            .OrderBy(s => DayLoad(slots, s.UserId, date, ignoreKey))
            .ThenBy(s => WeekLoad(slots, s.UserId, date, ignoreKey))
            .ThenBy(s => s.FullName)
            .ThenBy(s => s.UserId)
            .First();
    }

    /// <summary>Các khung giờ trả kho trong ngày còn ít nhất một nhân viên rảnh.</summary>
    public static List<TimeSpan> FreeReturnSlots(IReadOnlyCollection<Candidate> staff, IReadOnlyCollection<Slot> slots, DateTime date, string? ignoreKey = null)
        => ReturnSlots.Where(t => staff.Any(s => !HasConflict(slots, s.UserId, date, t, ignoreKey))).ToList();
}
