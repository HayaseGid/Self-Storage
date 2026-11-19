using System.Globalization;
using System.Net;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// JOB HẰNG NGÀY: GỬI EMAIL NHẮC HẠN ĐÓNG TIỀN THUÊ (mục B3).
/// - Mỗi ngày lúc 08:00 giờ VN (và 1 lần khi server khởi động, bù ngày server tắt), tìm các kỳ tiền thuê CHƯA ĐÓNG
///   của kho đang thuê (đơn Handed Over) có hạn đóng = hôm nay + 3 ngày (nhắc trước, "D3") hoặc = hôm nay ("D0").
/// - Gộp theo khách: mỗi khách nhận 1 email cho mỗi mốc (liệt kê các kho, kỳ, số tiền, hạn đóng).
/// - Chống gửi trùng (server khởi động lại nhiều lần trong ngày): ghi bảng RentReminderLog (CustomerID, DueDate, Kind).
/// - Gửi qua EmailService (Brevo). Lỗi gửi 1 khách chỉ ghi log, lần chạy sau thử lại.
/// Thông báo trên web (chuông) do frontend tự tính từ nextRentDueDate / rentOverdue của GET /api/customer-reservations/mine.
/// </summary>
public sealed class RentReminderJob : BackgroundService
{
    private static readonly TimeSpan RunAtVietnamTime = new(8, 0, 0);
    /// <summary>Số ngày nhắc trước hạn đóng tiền.</summary>
    public const int RemindBeforeDays = 3;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RentReminderJob> _logger;
    private readonly bool _enabled;

    public RentReminderJob(IServiceScopeFactory scopeFactory, ILogger<RentReminderJob> logger, IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        // Tắt job (vd khi chạy thử, không muốn gửi email thật): appsettings "RentReminders": { "Enabled": false }
        // hoặc biến môi trường RentReminders__Enabled=false. Mặc định bật.
        _enabled = configuration.GetValue("RentReminders:Enabled", true);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_enabled)
        {
            _logger.LogInformation("Job nhắc hạn đóng tiền thuê đang tắt (RentReminders:Enabled = false).");
            return;
        }
        // Đợi app khởi động xong (Program.cs còn tạo bảng / seed DB)
        try { await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken); }
        catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            await RunOnceAsync(stoppingToken);
            try { await Task.Delay(DelayUntilNextRun(DateTime.UtcNow), stoppingToken); }
            catch (OperationCanceledException) { return; }
        }
    }

    public async Task RunOnceAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<SelfStorageDbContext>();
            var email = scope.ServiceProvider.GetRequiredService<IEmailService>();
            var sent = await SendDueRemindersAsync(context, email, BusinessClock.Today, _logger, ct);
            if (sent > 0) _logger.LogInformation("Job nhắc hạn: đã gửi {Count} email nhắc đóng tiền thuê.", sent);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Job nhắc hạn đóng tiền thuê bị lỗi.");
        }
    }

    /// <summary>
    /// Gửi email nhắc cho 2 mốc: hạn = hôm nay + 3 ngày ("D3") và hạn = hôm nay ("D0"). Trả về số email đã gửi.
    /// </summary>
    public static async Task<int> SendDueRemindersAsync(SelfStorageDbContext context, IEmailService email, DateTime today, ILogger logger, CancellationToken ct)
    {
        var sent = 0;
        foreach (var (due, kind) in new[] { (today.Date.AddDays(RemindBeforeDays), "D3"), (today.Date, "D0") })
        {
            var next = due.AddDays(1);
            var rows = await context.Charges.AsNoTracking()
                .Where(c => c.ChargeType == "Rent" && c.Status == "Unpaid" &&
                            c.DueDate >= due && c.DueDate < next &&
                            c.Reservation.Status == ReservationStatus.HandedOver)
                .Select(c => new
                {
                    c.Reservation.CustomerID,
                    c.Reservation.Customer.Email,
                    c.Reservation.Customer.FullName,
                    Facility = c.Reservation.Facility.FacilityName,
                    Unit = c.ReservationUnit != null ? c.ReservationUnit.Unit.UnitNumber : null,
                    c.PeriodStart,
                    c.PeriodEnd,
                    c.Amount
                })
                .ToListAsync(ct);

            foreach (var group in rows.GroupBy(r => r.CustomerID))
            {
                var first = group.First();
                if (string.IsNullOrWhiteSpace(first.Email)) continue;
                var already = await context.RentReminderLogs.AnyAsync(l => l.CustomerID == group.Key && l.DueDate == due && l.Kind == kind, ct);
                if (already) continue;

                var total = group.Sum(x => x.Amount);
                var subject = kind == "D0"
                    ? $"[StoreSpace] Hôm nay ({due:dd/MM/yyyy}) là hạn đóng tiền thuê kho"
                    : $"[StoreSpace] Nhắc hạn đóng tiền thuê kho ngày {due:dd/MM/yyyy}";
                var lines = group.Select(x => (
                    $"{x.Unit ?? "—"} · {x.Facility}",
                    x.PeriodStart is DateTime ps ? $"{ps:dd/MM/yyyy} – {x.PeriodEnd:dd/MM/yyyy}" : "",
                    x.Amount)).ToList();
                try
                {
                    await email.SendRawEmailAsync(first.Email, subject, BuildHtml(first.FullName, due, kind, lines, total), ct);
                    context.RentReminderLogs.Add(new RentReminderLog { CustomerID = group.Key, DueDate = due, Kind = kind, SentAt = DateTime.UtcNow });
                    await context.SaveChangesAsync(ct);
                    sent++;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    context.ChangeTracker.Clear();
                    logger.LogWarning(ex, "Không gửi được email nhắc hạn cho khách {CustomerId}", group.Key);
                }
            }
        }
        return sent;
    }

    /* Nội dung HTML email nhắc hạn (chữ lấy từ dữ liệu đều được mã hóa HTML). */
    private static string BuildHtml(string? name, DateTime due, string kind, List<(string Unit, string Period, decimal Amount)> lines, decimal total)
    {
        string Vnd(decimal v) => v.ToString("N0", CultureInfo.GetCultureInfo("vi-VN")) + "đ";
        var rowsHtml = string.Concat(lines.Select(l =>
            $@"<tr><td style=""padding:8px 10px;border-bottom:1px solid #e2e8f0;"">{WebUtility.HtmlEncode(l.Unit)}</td><td style=""padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;"">{WebUtility.HtmlEncode(l.Period)}</td><td style=""padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;""><strong>{Vnd(l.Amount)}</strong></td></tr>"));
        var lead = kind == "D0"
            ? $"Hôm nay <strong>{due:dd/MM/yyyy}</strong> là hạn đóng tiền thuê kho của bạn."
            : $"Tiền thuê kho của bạn sẽ đến hạn vào ngày <strong>{due:dd/MM/yyyy}</strong> (còn {RemindBeforeDays} ngày).";
        return $@"
<div style=""font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;"">
  <h2 style=""color: #073d70; margin: 0 0 6px;"">Nhắc hạn đóng tiền thuê kho</h2>
  <p style=""color: #1e293b; line-height: 1.6;"">Xin chào {WebUtility.HtmlEncode(name ?? "quý khách")},<br/>{lead}</p>
  <table style=""width: 100%; border-collapse: collapse; font-size: 14px; color: #1e293b;"">
    <tr style=""background:#f5f8fb;""><th style=""padding:8px 10px;text-align:left;"">Kho</th><th style=""padding:8px 10px;text-align:left;"">Kỳ thuê</th><th style=""padding:8px 10px;text-align:right;"">Số tiền</th></tr>
    {rowsHtml}
    <tr><td colspan=""2"" style=""padding:10px;text-align:right;"">Tổng cần đóng</td><td style=""padding:10px;text-align:right;color:#075a9f;font-size:16px;""><strong>{Vnd(total)}</strong></td></tr>
  </table>
  <p style=""color: #1e293b; line-height: 1.6;"">Vui lòng đăng nhập StoreSpace, mở mục <strong>Thanh toán</strong> để đóng tiền qua VNPay.
  Quá hạn sẽ phát sinh phí trễ hạn theo chính sách hiện hành.</p>
  <p style=""font-size: 12px; color: #94a3b8;"">Email tự động từ hệ thống StoreSpace. Nếu bạn đã thanh toán, vui lòng bỏ qua email này.</p>
</div>";
    }

    /// <summary>Khoảng chờ tới 08:00 giờ VN kế tiếp.</summary>
    public static TimeSpan DelayUntilNextRun(DateTime utcNow)
    {
        var vnNow = utcNow.AddHours(7);
        var nextRun = vnNow.Date.Add(RunAtVietnamTime);
        if (nextRun <= vnNow) nextRun = nextRun.AddDays(1);
        return nextRun - vnNow;
    }
}
