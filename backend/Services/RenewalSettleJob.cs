using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;

namespace SelfStorageAPI.Services;

/// <summary>
/// JOB HẰNG NGÀY (mục 4.2): chốt mọi kỳ thuê cũ đã gia hạn và đã qua ngày kết thúc, không phụ thuộc khách có đăng nhập hay không.
/// Chạy 1 lần lúc server khởi động (bù những ngày server tắt), sau đó mỗi ngày lúc 00:30 giờ VN.
/// Luôn dùng ngày thật (không có request nên không nhận ngày giả lập của Demo Clock).
/// Đây là khung job chung: các việc theo ngày khác (nhắc tiền, khóa quyền khi nợ...) thêm vào RunOnceAsync.
/// </summary>
public sealed class RenewalSettleJob : BackgroundService
{
    private static readonly TimeSpan RunAtVietnamTime = new(0, 30, 0);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<RenewalSettleJob> _logger;

    public RenewalSettleJob(IServiceScopeFactory scopeFactory, ILogger<RenewalSettleJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Đợi app khởi động xong (Program.cs còn tạo / seed DB Postgres)
        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
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
            var settled = await RenewalTermSettler.SettleAsync(context, null, BusinessClock.Today, ct);
            if (settled > 0)
                _logger.LogInformation("Job hằng ngày: đã chốt {Count} kỳ thuê cũ sau gia hạn.", settled);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
        }
        catch (Exception ex)
        {
            // Lỗi chỉ ghi log; lần chạy sau (hoặc khi khách mở trang gia hạn) sẽ thử lại.
            _logger.LogError(ex, "Job hằng ngày: chốt kỳ thuê cũ sau gia hạn bị lỗi.");
        }
    }

    /// <summary>Khoảng chờ tới 00:30 giờ VN kế tiếp.</summary>
    public static TimeSpan DelayUntilNextRun(DateTime utcNow)
    {
        var vnNow = utcNow.AddHours(7);
        var next = vnNow.Date.Add(RunAtVietnamTime);
        if (next <= vnNow) next = next.AddDays(1);
        return next - vnNow;
    }
}
