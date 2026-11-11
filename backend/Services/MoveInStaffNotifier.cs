using System.Net;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

/// <summary>
/// Gửi email cho nhân viên vừa được giao việc NHẬN KHO, kèm khung giờ / cách nhận kho và thông tin liên lạc của khách
/// để nhân viên chủ động gọi trước, bàn thêm nếu cần (mục 4.1). Gửi lỗi chỉ ghi log, không làm hỏng việc phân công
/// (nhân viên vẫn thấy việc trong mục "Việc được giao").
/// </summary>
public static class MoveInStaffNotifier
{
    public sealed record Notice(
        string StaffEmail,
        string StaffName,
        string ReservationCode,
        string FacilityName,
        IReadOnlyList<string> UnitNumbers,
        DateTime Date,
        TimeSpan? Time,
        string HandoverMethod,
        string CustomerName,
        string? CustomerPhone,
        string CustomerEmail);

    public static async Task SendAsync(IEmailService email, ILogger logger, IEnumerable<Notice> notices, CancellationToken ct)
    {
        foreach (var n in notices)
        {
            if (string.IsNullOrWhiteSpace(n.StaffEmail)) continue;
            try
            {
                var when = n.HandoverMethod == HandoverMethod.Online
                    ? "bàn giao online"
                    : $"khung {StaffAssignmentPolicy.SlotLabel(n.Time) ?? "chưa hẹn giờ"}";
                var subject = $"[StoreSpace] Việc nhận kho mới {n.ReservationCode} · {n.Date:dd/MM/yyyy} · {when}";
                await email.SendRawEmailAsync(n.StaffEmail, subject, BuildHtml(n), ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Không gửi được email giao việc nhận kho {Code} cho {Staff}", n.ReservationCode, n.StaffEmail);
            }
        }
    }

    private static string BuildHtml(Notice n)
    {
        static string E(string? value) => WebUtility.HtmlEncode(value ?? "");
        var online = n.HandoverMethod == HandoverMethod.Online;
        var schedule = online
            ? $"{n.Date:dd/MM/yyyy} · <strong>Bàn giao online</strong> (không hẹn giờ)"
            : $"{n.Date:dd/MM/yyyy} · khung <strong>{E(StaffAssignmentPolicy.SlotLabel(n.Time) ?? "chưa hẹn giờ")}</strong>";
        var todo = online
            ? "Khách chọn bàn giao online: hoàn tất bàn giao trên hệ thống (mã truy cập sẽ hiện trong tài khoản khách), " +
              "để chìa khóa kèm mã đơn tại quầy lễ tân. Khách sẽ lên lễ tân nhận chìa."
            : "Khách sẽ đến cơ sở trong khung giờ trên. Nên gọi xác nhận trước với khách, chuẩn bị kho và chìa khóa.";
        var row = (string label, string value) =>
            $"<tr><td style=\"padding:6px 12px 6px 0;color:#64748b;white-space:nowrap\">{label}</td><td style=\"padding:6px 0\">{value}</td></tr>";

        return $@"
<div style=""font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;color:#1e293b"">
  <h2 style=""margin:0 0 4px;color:#073d70"">Bạn được giao việc nhận kho</h2>
  <p style=""margin:0 0 16px;color:#64748b"">Xin chào {E(n.StaffName)}, hệ thống vừa phân công cho bạn:</p>
  <table style=""border-collapse:collapse;font-size:14px"">
    {row("Mã đơn", $"<strong>{E(n.ReservationCode)}</strong>")}
    {row("Cơ sở", E(n.FacilityName))}
    {row("Kho", E(string.Join(", ", n.UnitNumbers)))}
    {row("Lịch", schedule)}
    {row("Khách hàng", $"<strong>{E(n.CustomerName)}</strong>")}
    {row("Điện thoại", string.IsNullOrWhiteSpace(n.CustomerPhone) ? "—" : $"<a href=\"tel:{E(n.CustomerPhone)}\">{E(n.CustomerPhone)}</a>")}
    {row("Email", $"<a href=\"mailto:{E(n.CustomerEmail)}\">{E(n.CustomerEmail)}</a>")}
  </table>
  <p style=""margin:16px 0 0;padding:12px 14px;background:#f0f7ff;border-radius:8px;font-size:14px"">{E(todo)}</p>
  <p style=""margin:16px 0 0;font-size:12px;color:#94a3b8"">Xem chi tiết trong mục Việc được giao trên trang nhân viên StoreSpace.</p>
</div>";
    }
}
