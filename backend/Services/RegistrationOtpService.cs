using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// ĐĂNG KÝ TÀI KHOẢN KHÁCH BẰNG OTP — mã được TẠO, LƯU và KIỂM TRA ở backend (trình duyệt không bao giờ biết mã).
/// Dùng 2 bảng có sẵn trong DB:
///   PendingRegistration   : thông tin đăng ký đang chờ xác thực (mật khẩu đã băm BCrypt), hết hạn sau 30 phút.
///   EmailVerificationCode : mã OTP (chỉ lưu SHA-256), hết hạn 5 phút, sai tối đa 5 lần, mỗi email chỉ 1 mã đang mở.
///
///   1. StartAsync  : kiểm tra dữ liệu, lưu PendingRegistration, tạo mã, gửi email.
///   2. ResendAsync : gửi mã mới (mã cũ đóng "Replaced"), cách nhau tối thiểu 60 giây.
///   3. VerifyAsync : đúng mã -> tạo tài khoản Storage Customer (Active, EmailVerified) và xóa PendingRegistration.
/// </summary>
public sealed class RegistrationOtpService
{
    public const string Purpose = "Registration";
    public const string CustomerRole = "Storage Customer";

    private static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan PendingLifetime = TimeSpan.FromMinutes(30);
    private const byte MaxAttempts = 5;

    private readonly SelfStorageDbContext _context;
    private readonly IEmailService _email;
    private readonly ILogger<RegistrationOtpService> _logger;

    public RegistrationOtpService(SelfStorageDbContext context, IEmailService email, ILogger<RegistrationOtpService> logger)
    {
        _context = context;
        _email = email;
        _logger = logger;
    }

    public sealed record Result(int Status, object Body)
    {
        public static Result Ok(object body) => new(200, body);
        public static Result Fail(int status, string message) => new(status, new { message });
    }

    public async Task<Result> StartAsync(string? fullName, string? email, string? password, string? phone, string? ip, CancellationToken ct)
    {
        var normalizedEmail = NormalizeEmail(email);
        var name = fullName?.Trim() ?? "";
        var normalizedPhone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();

        if (name.Length == 0) return Result.Fail(400, "Vui lòng nhập họ và tên.");
        if (name.Length > 150) return Result.Fail(400, "Họ và tên tối đa 150 ký tự.");
        if (normalizedEmail is null) return Result.Fail(400, "Email không hợp lệ.");
        if (string.IsNullOrEmpty(password) || password.Length < 6) return Result.Fail(400, "Mật khẩu phải có ít nhất 6 ký tự.");
        if (password.Length > 100) return Result.Fail(400, "Mật khẩu tối đa 100 ký tự.");
        if (normalizedPhone is { Length: > 30 }) return Result.Fail(400, "Số điện thoại tối đa 30 ký tự.");

        if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
            return Result.Fail(409, "Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.");

        var now = DateTime.UtcNow;
        var wait = await CooldownSecondsAsync(normalizedEmail, now, ct);
        if (wait > 0) return Result.Fail(429, $"Vui lòng chờ {wait} giây rồi gửi lại mã.");

        var pending = await _context.PendingRegistrations.FirstOrDefaultAsync(p => p.Email == normalizedEmail, ct);
        if (pending is null)
        {
            pending = new PendingRegistration { Email = normalizedEmail, CreatedAt = now };
            _context.PendingRegistrations.Add(pending);
        }
        pending.FullName = name;
        pending.PhoneNumber = normalizedPhone;
        pending.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
        pending.ExpiresAt = now.Add(PendingLifetime);
        pending.RequestedIPAddress = Trim(ip, 50);
        await _context.SaveChangesAsync(ct);

        return await IssueAndSendAsync(pending, ip, now, ct);
    }

    public async Task<Result> ResendAsync(string? email, string? ip, CancellationToken ct)
    {
        var normalizedEmail = NormalizeEmail(email);
        if (normalizedEmail is null) return Result.Fail(400, "Email không hợp lệ.");

        var now = DateTime.UtcNow;
        var pending = await _context.PendingRegistrations.FirstOrDefaultAsync(p => p.Email == normalizedEmail, ct);
        if (pending is null || pending.ExpiresAt <= now)
            return Result.Fail(404, "Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.");

        var wait = await CooldownSecondsAsync(normalizedEmail, now, ct);
        if (wait > 0) return Result.Fail(429, $"Vui lòng chờ {wait} giây rồi gửi lại mã.");

        pending.ExpiresAt = now.Add(PendingLifetime);
        await _context.SaveChangesAsync(ct);

        return await IssueAndSendAsync(pending, ip, now, ct);
    }

    public async Task<Result> VerifyAsync(string? email, string? otp, CancellationToken ct)
    {
        var normalizedEmail = NormalizeEmail(email);
        var code = new string((otp ?? "").Where(char.IsDigit).ToArray());
        if (normalizedEmail is null) return Result.Fail(400, "Email không hợp lệ.");
        if (code.Length != 6) return Result.Fail(400, "Vui lòng nhập đủ 6 chữ số OTP.");

        var now = DateTime.UtcNow;
        var open = await _context.EmailVerificationCodes
            .Where(c => c.Email == normalizedEmail && c.Purpose == Purpose && c.ClosedAt == null)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (open is null)
            return Result.Fail(400, "Mã OTP không còn hiệu lực. Vui lòng gửi lại mã mới.");

        if (open.ExpiresAt <= now)
        {
            Close(open, now, "Expired");
            await _context.SaveChangesAsync(ct);
            return Result.Fail(400, "Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.");
        }

        if (!CryptographicOperations.FixedTimeEquals(open.CodeHash, Hash(normalizedEmail, code)))
        {
            open.FailedAttempts++;
            var left = open.MaxAttempts - open.FailedAttempts;
            if (left <= 0) Close(open, now, "TooManyAttempts");
            await _context.SaveChangesAsync(ct);
            return Result.Fail(400, left <= 0
                ? "OTP không đúng. Bạn đã hết số lần thử, hãy gửi lại mã mới."
                : $"OTP không đúng. Bạn còn {left} lần thử.");
        }

        var pending = await _context.PendingRegistrations.FirstOrDefaultAsync(p => p.Email == normalizedEmail, ct);
        if (pending is null || pending.ExpiresAt <= now)
        {
            Close(open, now, "Expired");
            await _context.SaveChangesAsync(ct);
            return Result.Fail(400, "Phiên đăng ký đã hết hạn. Vui lòng đăng ký lại.");
        }

        var role = await _context.Roles.FirstOrDefaultAsync(r => r.RoleName == CustomerRole, ct);
        if (role is null) return Result.Fail(500, "Hệ thống chưa cấu hình vai trò khách hàng.");

        await using var transaction = await _context.Database.BeginTransactionAsync(ct);
        if (await _context.Users.AnyAsync(u => u.Email == normalizedEmail, ct))
        {
            Close(open, now, "Verified");
            _context.PendingRegistrations.Remove(pending);
            await _context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Result.Fail(409, "Email này đã được đăng ký. Vui lòng đăng nhập.");
        }

        _context.Users.Add(new User
        {
            Username = normalizedEmail,
            Email = normalizedEmail,
            FullName = pending.FullName,
            PhoneNumber = pending.PhoneNumber,
            PasswordHash = pending.PasswordHash,
            EmailVerified = true,
            RoleID = role.RoleID,
            Status = "Active",
            CreatedAt = now
        });
        Close(open, now, "Verified");
        open.PendingRegistrationID = null;
        _context.PendingRegistrations.Remove(pending);
        await _context.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return Result.Ok(new { message = "Xác thực email thành công. Tài khoản đã được tạo." });
    }

    /* Đóng mã đang mở, tạo mã mới, gửi email. Gửi lỗi -> xóa mã vừa tạo để khách thử lại ngay. */
    private async Task<Result> IssueAndSendAsync(PendingRegistration pending, string? ip, DateTime now, CancellationToken ct)
    {
        var openCodes = await _context.EmailVerificationCodes
            .Where(c => c.Email == pending.Email && c.Purpose == Purpose && c.ClosedAt == null)
            .ToListAsync(ct);
        foreach (var old in openCodes) Close(old, now, "Replaced");
        // Lưu riêng bước đóng mã cũ: DB chỉ cho 1 mã đang mở / email (UX_EmailVerificationCode_Open)
        await _context.SaveChangesAsync(ct);

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var row = new EmailVerificationCode
        {
            PendingRegistrationID = pending.PendingRegistrationID,
            Email = pending.Email,
            Purpose = Purpose,
            CodeHash = Hash(pending.Email, code),
            CreatedAt = now,
            ExpiresAt = now.Add(CodeLifetime),
            MaxAttempts = MaxAttempts,
            RequestedIPAddress = Trim(ip, 50)
        };
        _context.EmailVerificationCodes.Add(row);
        await _context.SaveChangesAsync(ct);

        try
        {
            await _email.SendOtpEmailAsync(pending.Email, pending.FullName, code, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Không gửi được OTP đăng ký tới {Email}", pending.Email);
            _context.EmailVerificationCodes.Remove(row);
            await _context.SaveChangesAsync(CancellationToken.None);
            return Result.Fail(502, "Không gửi được email OTP. Vui lòng kiểm tra địa chỉ email hoặc thử lại sau ít phút.");
        }

        return Result.Ok(new
        {
            email = pending.Email,
            expiresAt = row.ExpiresAt,
            resendAvailableAt = now.Add(ResendCooldown),
            message = $"Đã gửi mã OTP tới {pending.Email}."
        });
    }

    private async Task<int> CooldownSecondsAsync(string email, DateTime now, CancellationToken ct)
    {
        var last = await _context.EmailVerificationCodes
            .Where(c => c.Email == email && c.Purpose == Purpose)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => (DateTime?)c.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (last is null) return 0;
        var left = last.Value.Add(ResendCooldown) - now;
        return left > TimeSpan.Zero ? (int)Math.Ceiling(left.TotalSeconds) : 0;
    }

    private static void Close(EmailVerificationCode code, DateTime now, string reason)
    {
        code.ClosedAt = now;
        code.CloseReason = reason;
    }

    /* SHA-256 của "email:mã" (cột CodeHash BINARY(32)). Gắn email để 2 người cùng mã không ra cùng hash. */
    private static byte[] Hash(string email, string code) => SHA256.HashData(Encoding.UTF8.GetBytes($"{email}:{code}"));

    private static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(value) || value.Length > 150) return null;
        try
        {
            return new MailAddress(value).Address == value ? value : null;
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static string? Trim(string? value, int max) => value is null ? null : value.Length > max ? value[..max] : value;
}
