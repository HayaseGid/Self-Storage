using System.Collections.Concurrent;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Middleware;

namespace SelfStorageAPI.Controllers;

/// <summary>
/// Liên hệ hỗ trợ: khách đang đăng nhập gửi tin nhắn từ mục "Liên hệ" trên trang tài khoản.
///   POST /api/support/contact  body { subject?, message }
/// Tin nhắn được gửi qua email (Brevo HTTP API) tới hộp thư hỗ trợ
/// BrevoSettings:SupportInboxEmail (mặc định storespacevn101@gmail.com), Reply-To = email của khách.
/// Chống gửi dồn: mỗi tài khoản gửi tối đa 1 tin / 30 giây.
/// </summary>
[ApiController]
[Route("api/support")]
public sealed class SupportController(
    SelfStorageDbContext context,
    IEmailService emailService,
    ILogger<SupportController> logger) : ControllerBase
{
    private static readonly ConcurrentDictionary<string, DateTime> LastSentAt = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan Cooldown = TimeSpan.FromSeconds(30);

    [HttpPost("contact")]
    public async Task<IActionResult> Contact([FromBody] SupportContactRequest request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { success = false, message = "Tin nhắn phải từ 5 đến 4000 ký tự, chủ đề tối đa 150 ký tự." });

        // Email người đang đăng nhập (JwtIdentityMiddleware ghi từ token vào X-User-Email).
        var email = Request.Headers[JwtIdentityMiddleware.UserEmailHeader].ToString().Trim();
        if (email.Length == 0)
            return Unauthorized(new { success = false, message = "Vui lòng đăng nhập để gửi tin nhắn cho bộ phận hỗ trợ." });

        var text = request.Message.Trim();
        if (text.Length < 5)
            return BadRequest(new { success = false, message = "Vui lòng nhập nội dung tin nhắn (ít nhất 5 ký tự)." });

        var now = DateTime.UtcNow;
        if (LastSentAt.TryGetValue(email, out var last) && now - last < Cooldown)
        {
            var wait = (int)Math.Ceiling((Cooldown - (now - last)).TotalSeconds);
            return StatusCode(429, new { success = false, message = $"Bạn vừa gửi tin nhắn. Vui lòng đợi {wait} giây rồi gửi tiếp." });
        }

        var fullName = await context.Users.AsNoTracking()
            .Where(u => u.Email == email)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync(ct);
        var subject = string.IsNullOrWhiteSpace(request.Subject) ? "Khách hàng cần hỗ trợ" : request.Subject.Trim();

        try
        {
            await emailService.SendSupportMessageAsync(email, fullName, subject, text, ct);
            LastSentAt[email] = now;
            return Ok(new { success = true, message = "Đã gửi tin nhắn. Bộ phận hỗ trợ sẽ trả lời qua email của bạn." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Lỗi gửi tin nhắn liên hệ từ {Email}", email);
            return StatusCode(502, new { success = false, message = "Chưa gửi được tin nhắn (lỗi máy chủ email). Vui lòng thử lại sau." });
        }
    }
}
