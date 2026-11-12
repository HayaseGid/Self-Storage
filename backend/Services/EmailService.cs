using System.Net;
using System.Net.Http.Json;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class EmailService : IEmailService
{
    private const string BrevoApiUrl = "https://api.brevo.com/v3/smtp/email";

    private readonly SmtpSettings _smtp;
    private readonly BrevoSettings _brevo;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<EmailService> _logger;

    public EmailService(
        IOptions<SmtpSettings> smtpOptions,
        IOptions<BrevoSettings> brevoOptions,
        IHttpClientFactory httpClientFactory,
        ILogger<EmailService> logger)
    {
        _smtp = smtpOptions.Value;
        _brevo = brevoOptions.Value;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task SendOtpEmailAsync(string toEmail, string? toName, string otp, CancellationToken ct = default)
    {
        var subject = $"[StoreSpace] Mã xác thực OTP của bạn: {otp}";
        var bodyHtml = BuildOtpEmailHtml(toName, otp);
        await SendRawEmailAsync(toEmail, subject, bodyHtml, ct);
    }

    public async Task SendContractEmailAsync(SendContractEmailRequest request, CancellationToken ct = default)
    {
        var finalSubject = !string.IsNullOrWhiteSpace(request.Subject)
            ? request.Subject
            : !string.IsNullOrWhiteSpace(request.ContractNumber)
                ? $"[StoreSpace] Hợp đồng thuê kho {request.ContractNumber}"
                : "[StoreSpace] Hợp đồng thuê kho lưu trữ của bạn";
        var bodyHtml = BuildContractEmailHtml(request);
        await SendRawEmailAsync(request.ToEmail, finalSubject, bodyHtml, ct);
    }

    public async Task TestConnectionAsync(string toEmail, CancellationToken ct = default)
    {
        var subject = "[StoreSpace Support] Thử nghiệm kết nối Gmail SMTP thành công!";
        var bodyHtml = $@"
<div style=""font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;"">
  <div style=""text-align: center; padding-bottom: 16px; border-bottom: 2px solid #0877cf;"">
    <h2 style=""color: #073d70; margin: 0;"">StoreSpace Storage Support</h2>
    <p style=""color: #64748b; margin: 4px 0 0; font-size: 14px;"">Hệ thống gửi thư điện tử tự động</p>
  </div>
  <div style=""padding: 20px 0; color: #1e293b; line-height: 1.6;"">
    <p>Xin chào,</p>
    <p>Đây là email kiểm tra hệ thống Gmail SMTP được gửi từ ứng dụng <strong>StoreSpace</strong>.</p>
    <div style=""background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 14px 18px; color: #065f46;"">
      ✓ <strong>Kết nối Gmail SMTP thành công!</strong> Cấu hình gửi email tự động đã sẵn sàng hoạt động.
    </div>
    <p style=""margin-top: 16px; font-size: 13px; color: #64748b;"">
      Tài khoản gửi: <strong>{_smtp.SenderEmail}</strong><br/>
      Thời gian gửi: <strong>{DateTime.Now:dd/MM/yyyy HH:mm:ss}</strong>
    </p>
  </div>
  <div style=""text-align: center; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #94a3b8;"">
    StoreSpace Support · Tự động gửi từ hệ thống cho thuê kho thông minh.
  </div>
</div>";
        await SendRawEmailAsync(toEmail, subject, bodyHtml, ct);
    }

    public async Task SendRawEmailAsync(string toEmail, string subject, string bodyHtml, CancellationToken ct = default)
    {
        // Ưu tiên gửi qua Brevo HTTP API (cổng 443) nếu đã cấu hình ApiKey — không bị chặn trên Render Free
        if (!string.IsNullOrWhiteSpace(_brevo.ApiKey))
        {
            await SendViaBrevoAsync(toEmail, subject, bodyHtml, ct);
            return;
        }

        if (string.IsNullOrWhiteSpace(_smtp.SenderEmail) || string.IsNullOrWhiteSpace(_smtp.Password))
        {
            throw new InvalidOperationException("Chưa cấu hình BrevoSettings:ApiKey hoặc SmtpSettings trong appsettings.json.");
        }

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_smtp.SenderName, _smtp.SenderEmail));
        message.To.Add(MailboxAddress.Parse(toEmail));
        message.Subject = subject;

        message.Body = new TextPart(TextFormat.Html)
        {
            Text = bodyHtml
        };

        using var client = new SmtpClient
        {
            // Giới hạn thời gian chờ SMTP (15 giây) để tránh treo request quá lâu
            Timeout = 15000
        };
        using var smtpTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        smtpTimeoutCts.CancelAfter(TimeSpan.FromSeconds(15));
        var smtpCt = smtpTimeoutCts.Token;

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            // Gmail dùng cổng 587 với STARTTLS
            var options = _smtp.Port == 465 
                ? SecureSocketOptions.SslOnConnect 
                : SecureSocketOptions.StartTls;

            await client.ConnectAsync(_smtp.Server, _smtp.Port, options, smtpCt);

            // Xóa khoảng trắng trong mật khẩu ứng dụng nếu người dùng nhập dạng "xxxx xxxx xxxx xxxx"
            var cleanPassword = _smtp.Password.Replace(" ", "").Trim();
            await client.AuthenticateAsync(_smtp.SenderEmail.Trim(), cleanPassword, smtpCt);

            await client.SendAsync(message, smtpCt);
            await client.DisconnectAsync(true, smtpCt);

            _logger.LogInformation("Đã gửi email thành công tới {ToEmail} với tiêu đề '{Subject}' trong {ElapsedMs} ms.", toEmail, subject, sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogError(ex, "Hết thời gian chờ kết nối Gmail SMTP ({ElapsedMs} ms) khi gửi tới {ToEmail}.", sw.ElapsedMilliseconds, toEmail);
            throw new TimeoutException("Kết nối tới máy chủ gửi email (Gmail SMTP) quá lâu. Vui lòng thử lại sau.", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi khi gửi email qua Gmail SMTP tới {ToEmail} sau {ElapsedMs} ms.", toEmail, sw.ElapsedMilliseconds);
            throw new InvalidOperationException($"Lỗi kết nối Gmail SMTP: {ex.Message}", ex);
        }
    }

    private async Task SendViaBrevoAsync(string toEmail, string subject, string bodyHtml, CancellationToken ct)
    {
        var senderEmail = !string.IsNullOrWhiteSpace(_brevo.SenderEmail)
            ? _brevo.SenderEmail.Trim()
            : _smtp.SenderEmail.Trim();
        var senderName = !string.IsNullOrWhiteSpace(_brevo.SenderName)
            ? _brevo.SenderName.Trim()
            : _smtp.SenderName.Trim();

        if (string.IsNullOrWhiteSpace(senderEmail))
        {
            throw new InvalidOperationException("Chưa cấu hình BrevoSettings:SenderEmail (hoặc SmtpSettings:SenderEmail).");
        }

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(15));

        var payload = new
        {
            sender = new { name = senderName, email = senderEmail },
            to = new[] { new { email = toEmail.Trim() } },
            subject,
            htmlContent = bodyHtml
        };

        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var client = _httpClientFactory.CreateClient();
            using var request = new HttpRequestMessage(HttpMethod.Post, BrevoApiUrl);
            request.Headers.Add("api-key", _brevo.ApiKey.Trim());
            request.Headers.Add("accept", "application/json");
            request.Content = JsonContent.Create(payload);

            using var response = await client.SendAsync(request, timeoutCts.Token);
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(timeoutCts.Token);
                _logger.LogError("Brevo API trả về lỗi {StatusCode} khi gửi tới {ToEmail}: {ErrorBody}", (int)response.StatusCode, toEmail, errorBody);
                throw new InvalidOperationException($"Lỗi gửi email qua Brevo API ({(int)response.StatusCode}): {errorBody}");
            }

            _logger.LogInformation("Đã gửi email qua Brevo API thành công tới {ToEmail} với tiêu đề '{Subject}' trong {ElapsedMs} ms.", toEmail, subject, sw.ElapsedMilliseconds);
        }
        catch (OperationCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogError(ex, "Hết thời gian chờ Brevo API ({ElapsedMs} ms) khi gửi tới {ToEmail}.", sw.ElapsedMilliseconds, toEmail);
            throw new TimeoutException("Kết nối tới Brevo API quá lâu. Vui lòng thử lại sau.", ex);
        }
    }

    private static string BuildOtpEmailHtml(string? toName, string otp)
    {
        var displayName = !string.IsNullOrWhiteSpace(toName) ? WebUtility.HtmlEncode(toName) : "Quý khách";
        return $@"
<!DOCTYPE html>
<html lang=""vi"">
<head>
  <meta charset=""UTF-8"">
  <title>Mã xác thực OTP - StoreSpace</title>
</head>
<body style=""margin:0;padding:24px;background-color:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;"">
  <div style=""max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(7,90,159,0.06);"">
    <div style=""background:linear-gradient(135deg,#073d70 0%,#0877cf 100%);padding:28px 24px;text-align:center;color:#ffffff;"">
      <h1 style=""margin:0;font-size:24px;font-weight:800;letter-spacing:0.5px;"">StoreSpace Storage</h1>
      <p style=""margin:6px 0 0;font-size:13px;color:#cfe8ff;"">Hệ thống Cho Thuê Kho Lưu Trữ Tự Quản</p>
    </div>

    <div style=""padding:32px 28px;"">
      <h2 style=""margin:0 0 12px;font-size:18px;color:#073d70;font-weight:700;"">Mã xác thực tài khoản (OTP)</h2>
      <p style=""margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;"">
        Xin chào <strong>{displayName}</strong>,<br/>
        Chúng tôi nhận được yêu cầu xác thực tài khoản từ bạn trên StoreSpace. Dưới đây là mã OTP của bạn:
      </p>

      <div style=""margin:24px 0;text-align:center;"">
        <div style=""display:inline-block;padding:16px 36px;background:#f0f7ff;border:2px dashed #0877cf;border-radius:12px;letter-spacing:10px;font-size:32px;font-weight:800;color:#073d70;font-family:monospace;"">
          {otp}
        </div>
      </div>

      <div style=""background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:12px 16px;margin:20px 0;font-size:13px;color:#92400e;line-height:1.5;"">
        ⏱ <strong>Thời gian hiệu lực:</strong> Mã xác thực có hiệu lực trong vòng <strong>5 phút</strong>.<br/>
        🔒 <strong>Bảo mật:</strong> Tuyệt đối không cung cấp mã OTP này cho bất kỳ ai để đảm bảo an toàn cho tài khoản và kho lưu trữ của bạn.
      </div>

      <p style=""margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.5;"">
        Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ với bộ phận hỗ trợ của chúng tôi ngay lập tức.
      </p>
    </div>

    <div style=""background:#f8fafc;padding:18px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.5;"">
      <strong>StoreSpace Support</strong> · Hỗ trợ khách hàng: stardewvalleypvp@gmail.com<br/>
      Email được gửi tự động từ hệ thống StoreSpace. Vui lòng không trả lời thư này.
    </div>
  </div>
</body>
</html>";
    }

    private string BuildContractEmailHtml(SendContractEmailRequest req)
    {
        static string E(string? v) => WebUtility.HtmlEncode(v ?? string.Empty);

        var contractNumber = !string.IsNullOrWhiteSpace(req.ContractNumber) ? E(req.ContractNumber.Trim()) : null;
        var facilityName = !string.IsNullOrWhiteSpace(req.FacilityName) ? E(req.FacilityName.Trim()) : null;
        var period = !string.IsNullOrWhiteSpace(req.StartDate) || !string.IsNullOrWhiteSpace(req.EndDate)
            ? $"{E(req.StartDate ?? "—")} → {E(req.EndDate ?? "—")}"
            : null;
        var supportEmail = !string.IsNullOrWhiteSpace(_brevo.SenderEmail)
            ? E(_brevo.SenderEmail.Trim())
            : !string.IsNullOrWhiteSpace(_smtp.SenderEmail)
                ? E(_smtp.SenderEmail.Trim())
                : "stardewvalleypvp@gmail.com";

        var metaHtml = (contractNumber is not null || facilityName is not null || period is not null)
            ? $@"
      <table style=""width:100%;border-collapse:collapse;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:20px;font-size:13px;color:#1e3a8a;"">
        <tr>
          {(contractNumber is not null ? $@"<td style=""padding:10px 14px;""><strong>Mã hợp đồng:</strong> {contractNumber}</td>" : "")}
          {(facilityName is not null ? $@"<td style=""padding:10px 14px;""><strong>Cơ sở:</strong> {facilityName}</td>" : "")}
          {(period is not null ? $@"<td style=""padding:10px 14px;""><strong>Thời hạn:</strong> {period}</td>" : "")}
        </tr>
      </table>"
            : string.Empty;

        return $@"
<!DOCTYPE html>
<html lang=""vi"">
<head>
  <meta charset=""UTF-8"">
  <title>Hợp đồng thuê kho - StoreSpace</title>
</head>
<body style=""margin:0;padding:24px;background-color:#f4f7fb;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;"">
  <div style=""max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(7,90,159,0.06);"">
    <div style=""background:linear-gradient(135deg,#073d70 0%,#0877cf 100%);padding:28px 24px;text-align:center;color:#ffffff;"">
      <h1 style=""margin:0;font-size:24px;font-weight:800;letter-spacing:0.5px;"">StoreSpace Storage</h1>
      <p style=""margin:6px 0 0;font-size:13px;color:#cfe8ff;"">Hợp đồng Thuê Kho Lưu Trữ Điện Tử</p>
    </div>

    <div style=""padding:32px 28px;"">
      <div style=""background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;color:#065f46;line-height:1.5;"">
        ✓ <strong>Bản sao hợp đồng điện tử:</strong> Hợp đồng của bạn được lưu trữ an toàn trong tài khoản StoreSpace.
      </div>
      {metaHtml}
      <div style=""margin-top:12px;"">
        {req.ContractHtml}
      </div>

      <div style=""margin-top:24px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;color:#475569;line-height:1.5;"">
        📌 <strong>Lưu ý:</strong> Chữ ký điện tử trên hợp đồng có giá trị pháp lý theo quy định của Luật Giao dịch điện tử. Bạn có thể tra cứu mã PIN ra vào cổng và quản lý hợp đồng bất cứ lúc nào trong trang tài khoản StoreSpace.
      </div>
    </div>

    <div style=""background:#f8fafc;padding:18px 24px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;line-height:1.5;"">
      <strong>StoreSpace Support</strong> · Hỗ trợ khách hàng: {supportEmail}<br/>
      Email được gửi tự động từ hệ thống StoreSpace. Vui lòng không trả lời thư này.
    </div>
  </div>
</body>
</html>";
    }
}

