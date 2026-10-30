using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

/*
 * THANH TOÁN TIỀN CỌC QUA VNPAY SANDBOX (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 * Cấu hình (appsettings.Development.json hoặc user-secrets, KHÔNG commit HashSecret lên GitHub):
 *   "VnPay": {
 *     "TmnCode":    "<mã website sandbox>",
 *     "HashSecret": "<chuỗi bí mật sandbox>",
 *     "BaseUrl":    "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
 *     "ReturnUrl":  "http://localhost:5173/payment-result"
 *   }
 *
 *   POST /api/vnpay/create          { reservationIds: [..], returnUrl }  -> { paymentUrl } (khách đang đăng nhập)
 *   GET  /api/vnpay/return-verify?<query VNPay trả về>                   -> kết quả (frontend gọi khi VNPay chuyển về)
 *   GET  /api/vnpay/ipn?<query>                                          -> VNPay gọi máy chủ-máy chủ (cần URL public)
 *
 * Luồng: tạo Payment "Pending" (Provider = VNPay) cho từng đơn + gắn khoản cọc -> chuyển khách sang VNPay
 *   -> VNPay chuyển về / gọi IPN -> KIỂM TRA CHỮ KÝ + số tiền -> Payment Completed -> cọc Paid -> đơn Paid
 *   -> xác nhận đơn + tạo hợp đồng (không còn bước Manager duyệt) -> khách ký hợp đồng.
 * return-verify và IPN dùng chung một hàm, gọi nhiều lần cũng chỉ ghi nhận 1 lần (idempotent),
 * nên chạy ở localhost (VNPay không gọi được IPN) vẫn hoạt động.
 */
[ApiController]
[Route("api/vnpay")]
public sealed class VnPayController(
    SelfStorageDbContext context,
    IConfiguration configuration,
    ILogger<VnPayController> logger) : ControllerBase
{
    private const string Provider = "VNPay";
    private const string DefaultBaseUrl = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";

    public sealed record CreateVnPayRequest(List<int>? ReservationIds, string? ReturnUrl);

    private string? TmnCode => configuration["VnPay:TmnCode"];
    private string? HashSecret => configuration["VnPay:HashSecret"];
    private bool Configured => !string.IsNullOrWhiteSpace(TmnCode) && !string.IsNullOrWhiteSpace(HashSecret);

    // ------------------------------------------------------------------ Tạo giao dịch

    [HttpPost("create")]
    public async Task<IActionResult> Create([FromBody] CreateVnPayRequest request, CancellationToken ct)
    {
        if (!Configured)
            return StatusCode(503, new { message = "Chưa cấu hình VNPay (VnPay:TmnCode, VnPay:HashSecret) trong appsettings của backend." });

        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var ids = request.ReservationIds?.Where(id => id > 0).Distinct().ToList() ?? [];
        if (ids.Count == 0)
            return BadRequest(new { message = "Chưa có đơn đặt chỗ để thanh toán." });

        var now = DateTime.UtcNow;
        var reservations = await context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Where(r => ids.Contains(r.ReservationID) && r.CustomerID == customerId.Value)
            .ToListAsync(ct);
        if (reservations.Count != ids.Count)
            return NotFound(new { message = "Không tìm thấy đơn đặt chỗ thuộc tài khoản này." });

        foreach (var r in reservations)
        {
            if (r.Status != ReservationStatus.PendingPayment)
                return Conflict(new { message = $"Đơn {r.ReservationCode} không còn ở trạng thái chờ thanh toán cọc." });
            if (r.HoldExpiresAt <= now.AddSeconds(30))
                return Conflict(new { message = $"Đơn {r.ReservationCode} đã hết thời gian giữ kho. Vui lòng đặt lại." });
            if (!r.Charges.Any(c => c.ChargeType == "Deposit" && c.Status == "Unpaid"))
                return Conflict(new { message = $"Đơn {r.ReservationCode} không có khoản cọc cần thanh toán." });
        }

        var txnRef = $"SS{now.AddHours(7):yyMMddHHmmss}{Random.Shared.Next(100, 999)}";
        var expiresAt = reservations.Min(r => r.HoldExpiresAt);
        decimal total = 0;

        await using (var transaction = await context.Database.BeginTransactionAsync(ct))
        {
            // Giao dịch VNPay cũ đang chờ của các đơn này -> hủy, tránh ghi nhận 2 lần.
            foreach (var old in reservations.SelectMany(r => r.Payments).Where(p => p.Status == "Pending"))
                old.Status = "Cancelled";
            await context.SaveChangesAsync(ct);

            var created = new List<(Payment Payment, List<Charge> Charges)>();
            foreach (var r in reservations)
            {
                var deposits = r.Charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Unpaid").ToList();
                var payment = new Payment
                {
                    ReservationID = r.ReservationID,
                    OrderCode = $"{txnRef}-{r.ReservationID}",
                    IdempotencyKey = $"VNP-{txnRef}-{r.ReservationID}",
                    Provider = Provider,
                    Direction = "Collection",
                    Amount = deposits.Sum(c => c.Amount),
                    PaymentMethod = "VNPay",
                    Status = "Pending",
                    CreatedAt = now,
                    ExpiresAt = r.HoldExpiresAt,
                    CreatedByUserID = customerId.Value
                };
                context.Payments.Add(payment);
                created.Add((payment, deposits));
                total += payment.Amount;
            }
            await context.SaveChangesAsync(ct);

            foreach (var (payment, deposits) in created)
                foreach (var charge in deposits) charge.PaymentID = payment.PaymentID;
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }

        var vnTime = now.AddHours(7);
        var parameters = new SortedDictionary<string, string>(StringComparer.Ordinal)
        {
            ["vnp_Version"] = "2.1.0",
            ["vnp_Command"] = "pay",
            ["vnp_TmnCode"] = TmnCode!,
            ["vnp_Amount"] = ((long)decimal.Round(total * 100m, 0)).ToString(CultureInfo.InvariantCulture),
            ["vnp_CurrCode"] = "VND",
            ["vnp_TxnRef"] = txnRef,
            ["vnp_OrderInfo"] = $"Thanh toan tien coc {string.Join(" ", reservations.Select(r => r.ReservationCode))}",
            ["vnp_OrderType"] = "other",
            ["vnp_Locale"] = "vn",
            ["vnp_ReturnUrl"] = ResolveReturnUrl(request.ReturnUrl),
            ["vnp_IpAddr"] = ClientIp(),
            ["vnp_CreateDate"] = vnTime.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture),
            ["vnp_ExpireDate"] = expiresAt.AddHours(7).ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture)
        };
        var query = BuildQuery(parameters);
        var baseUrl = configuration["VnPay:BaseUrl"] ?? DefaultBaseUrl;
        var paymentUrl = $"{baseUrl}?{query}&vnp_SecureHash={Sign(query)}";

        return Ok(new { paymentUrl, txnRef, amount = total, expiresAt });
    }

    // ------------------------------------------------------------------ VNPay chuyển về / IPN

    [HttpGet("return-verify")]
    public async Task<IActionResult> ReturnVerify(CancellationToken ct)
    {
        var result = await ProcessAsync("Return", ct);
        var reservationIds = result.Payments.Select(p => p.ReservationID).Distinct().ToList();
        var contracts = await context.Contracts.AsNoTracking()
            .Where(c => reservationIds.Contains(c.ReservationID))
            .Select(c => new { reservationId = c.ReservationID, contractId = c.ContractID, contractNumber = c.ContractNumber })
            .ToListAsync(ct);

        return Ok(new
        {
            success = result.Paid,
            code = result.Code,
            message = result.Message,
            txnRef = result.TxnRef,
            amount = result.Amount,
            transactionNo = Request.Query["vnp_TransactionNo"].ToString(),
            bankCode = Request.Query["vnp_BankCode"].ToString(),
            reservationIds,
            contracts
        });
    }

    [HttpGet("ipn")]
    public async Task<IActionResult> Ipn(CancellationToken ct)
    {
        var result = await ProcessAsync("IPN", ct);
        return Ok(new { RspCode = result.Code, Message = result.IpnMessage });
    }

    private sealed record ProcessResult(bool Paid, string Code, string Message, string IpnMessage, string? TxnRef, decimal? Amount, List<Payment> Payments);

    private async Task<ProcessResult> ProcessAsync(string source, CancellationToken ct)
    {
        var query = Request.Query
            .Where(kv => kv.Key.StartsWith("vnp_", StringComparison.Ordinal))
            .ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
        var payload = JsonSerializer.Serialize(query);
        query.TryGetValue("vnp_TxnRef", out var txnRef);
        query.TryGetValue("vnp_TransactionNo", out var transactionNo);
        query.TryGetValue("vnp_ResponseCode", out var responseCode);
        query.TryGetValue("vnp_TransactionStatus", out var transactionStatus);
        decimal? amount = query.TryGetValue("vnp_Amount", out var rawAmount) && long.TryParse(rawAmount, out var a) ? a / 100m : null;

        if (!Configured)
            return new ProcessResult(false, "99", "Chưa cấu hình VNPay ở backend.", "Unknown error", txnRef, amount, []);

        if (!VerifySignature(query))
        {
            await LogAsync(null, txnRef ?? "?", transactionNo, responseCode, amount, payload, false, "Rejected", $"{source}: sai chữ ký", ct);
            return new ProcessResult(false, "97", "Chữ ký VNPay không hợp lệ.", "Invalid signature", txnRef, amount, []);
        }

        var prefix = $"{txnRef}-";
        var payments = await context.Payments
            .Include(p => p.Charges)
            .Include(p => p.Reservation)
            .Where(p => p.Provider == Provider && p.OrderCode.StartsWith(prefix))
            .ToListAsync(ct);
        if (string.IsNullOrWhiteSpace(txnRef) || payments.Count == 0)
        {
            await LogAsync(null, txnRef ?? "?", transactionNo, responseCode, amount, payload, true, "Rejected", $"{source}: không tìm thấy giao dịch", ct);
            return new ProcessResult(false, "01", "Không tìm thấy giao dịch.", "Order not found", txnRef, amount, []);
        }

        var expected = payments.Sum(p => p.Amount);
        if (amount != expected)
        {
            await LogAsync(payments[0].PaymentID, txnRef, transactionNo, responseCode, amount, payload, true, "Rejected", $"{source}: sai số tiền (cần {expected})", ct);
            return new ProcessResult(false, "04", "Số tiền thanh toán không khớp.", "Invalid amount", txnRef, amount, payments);
        }

        if (payments.All(p => p.Status == "Completed"))
        {
            await LogAsync(payments[0].PaymentID, txnRef, transactionNo, responseCode, amount, payload, true, "Duplicate", $"{source}: đã ghi nhận trước đó", ct);
            return new ProcessResult(true, "02", "Đã ghi nhận tiền cọc.", "Order already confirmed", txnRef, amount, payments);
        }
        if (payments.All(p => p.Status is "Failed" or "Cancelled"))
        {
            await LogAsync(payments[0].PaymentID, txnRef, transactionNo, responseCode, amount, payload, true, "Duplicate", $"{source}: giao dịch đã đóng", ct);
            return new ProcessResult(false, "02", "Giao dịch đã bị hủy hoặc thất bại trước đó.", "Order already confirmed", txnRef, amount, payments);
        }

        var success = responseCode == "00" && transactionStatus == "00";
        if (!success)
        {
            foreach (var p in payments.Where(p => p.Status == "Pending")) p.Status = "Failed";
            await context.SaveChangesAsync(ct);
            await LogAsync(payments[0].PaymentID, txnRef, transactionNo, responseCode, amount, payload, true, "Applied", $"{source}: thất bại / khách hủy (mã {responseCode})", ct);
            return new ProcessResult(false, "00", DescribeResponseCode(responseCode), "Confirm Success", txnRef, amount, payments);
        }

        var now = DateTime.UtcNow;
        var notes = new List<string>();
        var pendingIds = payments.Where(p => p.Status == "Pending").Select(p => p.PaymentID).ToList();
        foreach (var paymentId in pendingIds)
        {
            // Nạp lại từng giao dịch (lỗi ở giao dịch trước có thể đã xóa bộ theo dõi của DbContext).
            context.ChangeTracker.Clear();
            var payment = await context.Payments
                .Include(p => p.Charges)
                .Include(p => p.Reservation)
                .FirstAsync(p => p.PaymentID == paymentId, ct);
            try
            {
                await ApplyPaidAsync(payment, transactionNo, now, ct);
                await TryConfirmAsync(payment.ReservationID, ct);
            }
            catch (Exception exception)
            {
                context.ChangeTracker.Clear();
                logger.LogError(exception, "VNPay: không ghi nhận được thanh toán {OrderCode}", payment.OrderCode);
                notes.Add($"{payment.OrderCode}: {exception.InnerException?.Message ?? exception.Message}");
            }
        }

        var allPaid = await context.Payments.AsNoTracking()
            .Where(p => p.Provider == Provider && p.OrderCode.StartsWith(prefix))
            .AllAsync(p => p.Status == "Completed", ct);
        await LogAsync(payments[0].PaymentID, txnRef, transactionNo, responseCode, amount, payload, true,
            notes.Count == 0 ? "Applied" : "Error", $"{source}: {(notes.Count == 0 ? "đã ghi nhận" : string.Join(" | ", notes))}", ct);

        return allPaid
            ? new ProcessResult(true, "00", "Đặt cọc thành công.", "Confirm Success", txnRef, amount, payments)
            : new ProcessResult(false, "99", "VNPay đã nhận tiền nhưng hệ thống chưa ghi nhận được đơn (có thể đơn đã hết thời gian giữ kho). Vui lòng liên hệ cơ sở.", "Unknown error", txnRef, amount, payments);
    }

    /* Giống PaymentService: Payment Completed -> các khoản cọc Paid -> đơn Paid (đúng thứ tự trigger DB). */
    private async Task ApplyPaidAsync(Payment payment, string? transactionNo, DateTime now, CancellationToken ct)
    {
        await using var transaction = await context.Database.BeginTransactionAsync(ct);
        var reservation = payment.Reservation;
        if (reservation.Status != ReservationStatus.PendingPayment)
        {
            // Đơn đã hết hạn giữ kho / bị hủy trong lúc khách đang trả: đóng giao dịch, cần hoàn tiền thủ công.
            payment.Status = "Failed";
            await context.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            throw new InvalidOperationException($"Đơn {reservation.ReservationCode} đang ở trạng thái {reservation.Status}, không ghi nhận cọc được (cần hoàn tiền).");
        }

        payment.Status = "Completed";
        payment.ProviderTransactionId = $"{transactionNo}-{payment.ReservationID}";
        payment.ReceivedAmount = payment.Amount;
        payment.ConfirmedAt = now;
        await context.SaveChangesAsync(ct);

        foreach (var charge in payment.Charges.Where(c => c.Status == "Unpaid"))
        {
            charge.Status = "Paid";
            charge.PaidAt = now;
        }
        await context.SaveChangesAsync(ct);

        reservation.Status = ReservationStatus.Paid;
        reservation.PaidAt = now;
        await context.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    /* Không còn bước Manager duyệt: Paid -> Confirmed + tạo hợp đồng (lỗi thì trang Hợp đồng tự thử lại). */
    private async Task TryConfirmAsync(int reservationId, CancellationToken ct)
    {
        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);
            var reservation = await context.Reservations
                .Include(r => r.ReservationItems)
                .Include(r => r.ReservationUnits)
                .Include(r => r.Contract)
                .FirstAsync(r => r.ReservationID == reservationId, ct);
            if (reservation.Status != ReservationStatus.Paid) return;
            var fullyHeld = reservation.ReservationItems.All(item =>
                reservation.ReservationUnits.Count(ru => ru.ReservationItemID == item.ReservationItemID && ru.Status != "Released") == item.Quantity);
            if (!fullyHeld) return;

            var now = DateTime.UtcNow;
            reservation.Status = ReservationStatus.Confirmed;
            reservation.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);
            if (reservation.Contract is null)
            {
                context.Contracts.Add(new Contract
                {
                    ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}",
                    ReservationID = reservation.ReservationID,
                    StartDate = reservation.StartDate,
                    EndDate = reservation.EndDate,
                    ContractStatus = "Active",
                    CreatedAt = now
                });
                await context.SaveChangesAsync(ct);
            }
            await transaction.CommitAsync(ct);
        }
        catch (Exception exception)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "VNPay: đã nhận cọc nhưng chưa tạo được hợp đồng cho đơn {ReservationId}", reservationId);
        }
    }

    // ------------------------------------------------------------------ Helpers

    private async Task LogAsync(int? paymentId, string orderCode, string? transactionNo, string? status, decimal? amount,
        string payload, bool signatureValid, string result, string note, CancellationToken ct)
    {
        try
        {
            context.ChangeTracker.Clear();
            context.Set<PaymentCallbackLog>().Add(new PaymentCallbackLog
            {
                PaymentID = paymentId,
                Provider = Provider,
                OrderCode = orderCode.Length > 50 ? orderCode[..50] : orderCode,
                ProviderTransactionId = transactionNo,
                ReportedStatus = status,
                ReportedAmount = amount,
                Payload = payload,
                SignatureValid = signatureValid,
                ReceivedAt = DateTime.UtcNow,
                ProcessResult = result,
                Note = note.Length > 500 ? note[..500] : note
            });
            await context.SaveChangesAsync(ct);
        }
        catch (Exception exception)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Không ghi được PaymentCallbackLog");
        }
    }

    /* Chuỗi ký theo tài liệu VNPay 2.1.0: sắp xếp tham số theo tên, URL-encode, nối bằng &. */
    private static string BuildQuery(IEnumerable<KeyValuePair<string, string>> parameters) =>
        string.Join("&", parameters
            .Where(kv => !string.IsNullOrEmpty(kv.Value))
            .Select(kv => $"{WebUtility.UrlEncode(kv.Key)}={WebUtility.UrlEncode(kv.Value)}"));

    private string Sign(string data)
    {
        using var hmac = new HMACSHA512(Encoding.UTF8.GetBytes(HashSecret!));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(data))).ToLowerInvariant();
    }

    private bool VerifySignature(Dictionary<string, string> query)
    {
        if (!query.TryGetValue("vnp_SecureHash", out var received) || string.IsNullOrWhiteSpace(received)) return false;
        var data = BuildQuery(new SortedDictionary<string, string>(
            query.Where(kv => kv.Key is not ("vnp_SecureHash" or "vnp_SecureHashType")).ToDictionary(kv => kv.Key, kv => kv.Value),
            StringComparer.Ordinal));
        var expected = Sign(data);
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(received.ToLowerInvariant()));
    }

    private string ResolveReturnUrl(string? requested)
    {
        var configured = configuration["VnPay:ReturnUrl"] ?? "http://localhost:5173/payment-result";
        if (Uri.TryCreate(requested, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps))
        {
            var configuredHost = Uri.TryCreate(configured, UriKind.Absolute, out var c) ? c.Host : null;
            if (uri.IsLoopback || string.Equals(uri.Host, configuredHost, StringComparison.OrdinalIgnoreCase))
                return uri.ToString();
        }
        return configured;
    }

    private string ClientIp()
    {
        var ip = HttpContext.Connection.RemoteIpAddress;
        if (ip is null || IPAddress.IsLoopback(ip)) return "127.0.0.1";
        return ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4().ToString() : ip.ToString();
    }

    private static string DescribeResponseCode(string? code) => code switch
    {
        "24" => "Bạn đã hủy giao dịch trên VNPay.",
        "11" => "Hết thời gian chờ thanh toán. Vui lòng thực hiện lại.",
        "51" => "Tài khoản không đủ số dư.",
        "65" => "Tài khoản vượt quá hạn mức giao dịch trong ngày.",
        "75" => "Ngân hàng thanh toán đang bảo trì.",
        "79" => "Nhập sai mật khẩu thanh toán quá số lần quy định.",
        "12" => "Thẻ/Tài khoản bị khóa.",
        "13" => "Sai mã OTP.",
        "09" => "Thẻ/Tài khoản chưa đăng ký Internet Banking.",
        "10" => "Xác thực thông tin thẻ/tài khoản không đúng quá 3 lần.",
        "07" => "Giao dịch bị nghi ngờ gian lận, đã trừ tiền nhưng chưa ghi nhận. Vui lòng liên hệ cơ sở.",
        _ => $"Thanh toán không thành công (mã {code})."
    };

    private Task<int?> GetCustomerIdAsync(CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email)) return Task.FromResult<int?>(null);
        return context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
    }
}
