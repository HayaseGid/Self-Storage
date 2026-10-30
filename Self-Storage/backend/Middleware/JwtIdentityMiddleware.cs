using System.Security.Claims;
using Microsoft.Extensions.Options;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Middleware;

/// <summary>
/// Cầu nối giữa JWT và code hiện có.
/// Các controller/service vẫn đọc danh tính qua header "X-User-Email", nên middleware này:
///   - Request có JWT hợp lệ  -> ghi đè X-User-Email bằng email lấy từ token (client không thể giả mạo).
///   - Request có "Bearer ..." nhưng token sai/hết hạn -> trả 401.
///   - Request không có token -> nếu AllowLegacyEmailHeader = false thì xóa X-User-Email client tự gửi.
/// Chạy sau app.UseAuthentication().
/// </summary>
public class JwtIdentityMiddleware
{
    public const string UserEmailHeader = "X-User-Email";
    public const string AuthenticatedByJwtItem = "AuthenticatedByJwt";

    private readonly RequestDelegate _next;
    private readonly JwtOptions _options;

    public JwtIdentityMiddleware(RequestDelegate next, IOptions<JwtOptions> options)
    {
        _next = next;
        _options = options.Value;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var headers = context.Request.Headers;
        var authorization = headers.Authorization.ToString();
        var hasBearer = authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase);

        if (context.User.Identity?.IsAuthenticated == true)
        {
            var email = context.User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(email))
            {
                await WriteUnauthorizedAsync(context, "Token không chứa thông tin email.");
                return;
            }

            headers[UserEmailHeader] = email;
            context.Items[AuthenticatedByJwtItem] = true;
        }
        else if (hasBearer)
        {
            await WriteUnauthorizedAsync(context, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.");
            return;
        }
        else if (!_options.AllowLegacyEmailHeader)
        {
            headers.Remove(UserEmailHeader);
        }

        await _next(context);
    }

    private static Task WriteUnauthorizedAsync(HttpContext context, string message)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return context.Response.WriteAsJsonAsync(new { message, code = "TOKEN_INVALID" });
    }
}
