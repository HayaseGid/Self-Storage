using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Controllers;

/*
 * KHÁCH HỦY ĐẶT KHO TRƯỚC NGÀY NHẬN KHO + HOÀN CỌC (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 *   GET  /api/reservation-cancellations/{reservationId}/quote        -> có hủy được không, hoàn bao nhiêu (theo chính sách)
 *   POST /api/reservation-cancellations/{reservationId}              -> { reason, expectedRefund } hủy ngay + hoàn cọc
 *   POST /api/reservation-cancellations/{reservationId}/refund-retry -> gửi lại yêu cầu hoàn tiền VNPay (nếu lần trước lỗi)
 *
 * Điều kiện: đơn của khách đang đăng nhập, trạng thái Chờ thanh toán / Đã cọc / Đã xác nhận (CHƯA nhận kho), không phải đơn gia hạn.
 * Tiền hoàn = tiền cọc đã trả x % hoàn theo số ngày trước ngày bắt đầu thuê. % lấy từ bảng CancellationRule của chính sách
 * cơ sở (BO chỉnh ở chính sách "Đặt chỗ & hủy" -> refundTiers, đã đồng bộ xuống bảng này), không có thì dùng chính sách chung.
 * Hủy: đơn Cancelled (trigger DB tự trả kho đang giữ + hủy các khoản chưa trả), hợp đồng "Terminated", việc bàn giao bị hủy.
 * Hoàn tiền (mỗi giao dịch thu cọc gốc một giao dịch hoàn, RefundReason = Cancellation):
 *   - trả qua VNPay  -> gọi API hoàn tiền VNPay (merchant_webapi/api/transaction, vnp_Command = refund),
 *                       thành công -> Completed; lỗi -> giữ Pending "Đang hoàn tiền", khách / hệ thống gửi lại sau.
 *   - trả mô phỏng   -> ghi nhận hoàn ngay (Completed).
 */
[ApiController]
[Route("api/reservation-cancellations")]
public sealed class ReservationCancellationsController(
    SelfStorageDbContext context,
    IConfiguration configuration,
    ILogger<ReservationCancellationsController> logger) : ControllerBase
{
    private const string VnPayProvider = "VNPay";
    private const string DefaultRefundApi = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
    // VNPay chặn (403 Forbidden, tường lửa openresty) các request không có User-Agent như HttpClient mặc định của .NET,
    // nên gửi kèm User-Agent + Accept giống trình duyệt.
    private static readonly HttpClient Http = CreateHttpClient();
    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 StoreSpace/1.0");
        client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("vi-VN,vi;q=0.9,en;q=0.8");
        return client;
    }
    private static readonly string[] CancellableStatuses =
        [ReservationStatus.PendingPayment, ReservationStatus.Paid, ReservationStatus.Confirmed];
    private static readonly (int Days, decimal Percent)[] DefaultTiers = [(7, 100m), (3, 50m), (0, 0m)];

    public sealed record CancelRequest(string? Reason, decimal? ExpectedRefund);
    public sealed record RefundResult(int PaymentId, decimal Amount, string Status, string? Provider, string Message);

    private string? TmnCode => configuration["VnPay:TmnCode"]?.Trim();
    private string? HashSecret => configuration["VnPay:HashSecret"]?.Trim();

    // ------------------------------------------------------------------ Báo giá hủy

    [HttpGet("{reservationId:int}/quote")]
    public async Task<IActionResult> Quote(int reservationId, CancellationToken ct)
    {
        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var reservation = await LoadAsync(reservationId, customerId.Value, ct);
        if (reservation is null) return NotFound(new { message = "Không tìm thấy đơn đặt kho thuộc tài khoản này." });

        var quote = await BuildQuoteAsync(reservation, ct);
        return Ok(ToDto(reservation, quote));
    }

    // ------------------------------------------------------------------ Hủy + hoàn cọc

    [HttpPost("{reservationId:int}")]
    public async Task<IActionResult> Cancel(int reservationId, [FromBody] CancelRequest? request, CancellationToken ct)
    {
        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var reservation = await LoadAsync(reservationId, customerId.Value, ct);
        if (reservation is null) return NotFound(new { message = "Không tìm thấy đơn đặt kho thuộc tài khoản này." });

        var quote = await BuildQuoteAsync(reservation, ct);
        if (!quote.Eligible) return Conflict(new { message = quote.Reason });
        if (request?.ExpectedRefund is not null && request.ExpectedRefund.Value != quote.RefundAmount)
            return Conflict(new { message = "Số tiền hoàn đã thay đổi (đã qua mốc chính sách). Vui lòng xem lại trước khi hủy.", quote = ToDto(reservation, quote) });

        var now = DateTime.UtcNow;
        var reason = string.IsNullOrWhiteSpace(request?.Reason) ? "Khách hủy đặt kho" : request!.Reason!.Trim();
        if (reason.Length > 480) reason = reason[..480];
        var refunds = new List<Payment>();

        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(ct);

            // 1) Giao dịch hoàn (Pending) cho từng giao dịch thu cọc gốc, ghi phần hoàn lên từng khoản cọc.
            if (quote.RefundAmount > 0)
            {
                foreach (var group in quote.Deposits.Where(d => d.Share > 0).GroupBy(d => d.Charge.PaymentID))
                {
                    var original = reservation.Payments.FirstOrDefault(p => p.PaymentID == group.Key);
                    var refund = new Payment
                    {
                        ReservationID = reservation.ReservationID,
                        OrderCode = $"RFC-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}",
                        IdempotencyKey = $"CANCEL-REFUND-{reservation.ReservationID}-{Guid.NewGuid():N}",
                        Provider = original?.Provider == VnPayProvider ? VnPayProvider : (original?.Provider ?? "Simulator"),
                        Direction = "Refund",
                        RefundReason = "Cancellation",
                        RefundOfPaymentID = original?.PaymentID,
                        Amount = group.Sum(d => d.Share),
                        PaymentMethod = original?.Provider == VnPayProvider ? "Hoàn về VNPay" : "Hoàn tiền mô phỏng",
                        Status = "Pending",
                        CreatedAt = now,
                        CreatedByUserID = customerId.Value
                    };
                    context.Payments.Add(refund);
                    await context.SaveChangesAsync(ct);
                    foreach (var d in group) { d.Charge.RefundedAmount = d.Share; d.Charge.RefundPaymentID = refund.PaymentID; }
                    await context.SaveChangesAsync(ct);
                    refunds.Add(refund);
                }
            }

            // 2) Hủy đơn (trigger tự trả kho đang giữ + hủy khoản chưa trả), chấm dứt hợp đồng, hủy việc bàn giao.
            foreach (var p in reservation.Payments.Where(p => p.Status == "Pending" && p.Direction == "Collection")) p.Status = "Cancelled";
            reservation.Status = ReservationStatus.Cancelled;
            reservation.CancelledAt = now;
            reservation.CancelledByUserID = customerId.Value;
            reservation.CancelReason = reason;
            await context.SaveChangesAsync(ct);

            if (reservation.Contract is not null)
            {
                reservation.Contract.ContractStatus = "Terminated";
                await context.SaveChangesAsync(ct);
            }

            var tasks = await context.HandoverTasks
                .Where(t => t.ReservationID == reservation.ReservationID && (t.Status == "Scheduled" || t.Status == "In Progress"))
                .ToListAsync(ct);
            foreach (var t in tasks) t.Status = "Cancelled";
            if (tasks.Count > 0) await context.SaveChangesAsync(ct);

            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException exception)
        {
            context.ChangeTracker.Clear();
            logger.LogWarning(exception, "Hủy đơn {ReservationId} thất bại", reservationId);
            return Conflict(new { message = CleanDbMessage(exception.InnerException?.Message ?? exception.Message, "Chưa hủy được đơn, vui lòng thử lại.") });
        }

        // 3) Thực hiện hoàn tiền (ngoài transaction: gọi VNPay có thể chậm / lỗi, đơn vẫn đã hủy).
        var results = new List<RefundResult>();
        foreach (var refund in refunds)
            results.Add(await ProcessRefundAsync(refund.PaymentID, customerId.Value, ct));

        var pending = results.Count(r => r.Status != "Completed");
        return Ok(new
        {
            message = quote.RefundAmount <= 0
                ? "Đã hủy đặt kho. Theo chính sách, đơn này không được hoàn cọc."
                : pending == 0
                    ? $"Đã hủy đặt kho và hoàn {Vnd(quote.RefundAmount)}đ."
                    : $"Đã hủy đặt kho. Khoản hoàn {Vnd(quote.RefundAmount)}đ đang được xử lý.",
            reservationId,
            refundPercent = quote.RefundPercent,
            refundAmount = quote.RefundAmount,
            refunds = results
        });
    }

    [HttpPost("{reservationId:int}/refund-retry")]
    public async Task<IActionResult> RetryRefund(int reservationId, CancellationToken ct)
    {
        var customerId = await GetCustomerIdAsync(ct);
        if (customerId is null) return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        var pendingIds = await context.Payments
            .Where(p => p.ReservationID == reservationId && p.Reservation.CustomerID == customerId.Value &&
                        p.Direction == "Refund" && p.RefundReason == "Cancellation" && p.Status == "Pending")
            .Select(p => p.PaymentID)
            .ToListAsync(ct);
        if (pendingIds.Count == 0) return Ok(new { message = "Không còn khoản hoàn nào đang chờ.", refunds = Array.Empty<RefundResult>() });

        var results = new List<RefundResult>();
        foreach (var id in pendingIds) results.Add(await ProcessRefundAsync(id, customerId.Value, ct));
        return Ok(new { message = "Đã gửi lại yêu cầu hoàn tiền.", refunds = results });
    }

    // ------------------------------------------------------------------ Hoàn tiền

    private async Task<RefundResult> ProcessRefundAsync(int refundPaymentId, int customerId, CancellationToken ct)
    {
        context.ChangeTracker.Clear();
        var refund = await context.Payments.Include(p => p.RefundOfPayment).FirstAsync(p => p.PaymentID == refundPaymentId, ct);
        if (refund.Status != "Pending")
            return new RefundResult(refund.PaymentID, refund.Amount, refund.Status, refund.Provider, "Đã xử lý trước đó.");

        string? providerTxn;
        string message;
        if (refund.Provider != VnPayProvider)
        {
            providerTxn = $"SIM-RFC-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            message = "Đã hoàn tiền (mô phỏng).";
        }
        else
        {
            var (ok, txn, text) = await CallVnPayRefundAsync(refund, customerId, ct);
            if (!ok)
                return new RefundResult(refund.PaymentID, refund.Amount, "Pending", refund.Provider, text);
            providerTxn = txn;
            message = text;
        }

        try
        {
            refund.Status = "Completed";
            refund.ProviderTransactionId = providerTxn;
            refund.ReceivedAmount = refund.Amount;
            refund.ConfirmedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(ct);
            return new RefundResult(refund.PaymentID, refund.Amount, "Completed", refund.Provider, message);
        }
        catch (DbUpdateException exception)
        {
            context.ChangeTracker.Clear();
            logger.LogError(exception, "Đã hoàn tiền ở cổng nhưng không ghi nhận được giao dịch {PaymentId}", refundPaymentId);
            return new RefundResult(refundPaymentId, refund.Amount, "Pending", refund.Provider, "Cổng thanh toán đã nhận yêu cầu hoàn nhưng hệ thống chưa ghi nhận được. Vui lòng liên hệ cơ sở.");
        }
    }

    /* API hoàn tiền VNPay 2.1.0 (POST JSON). Chuỗi ký nối bằng '|' theo đúng thứ tự tài liệu, HMAC-SHA512. */
    private async Task<(bool Ok, string? ProviderTxn, string Message)> CallVnPayRefundAsync(Payment refund, int customerId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(TmnCode) || string.IsNullOrWhiteSpace(HashSecret))
            return (false, null, "Chưa cấu hình VNPay ở backend nên chưa hoàn tiền được. Yêu cầu hoàn đang chờ xử lý.");
        var original = refund.RefundOfPayment;
        if (original is null || original.Provider != VnPayProvider || original.Status != "Completed")
            return (false, null, "Không tìm thấy giao dịch VNPay gốc để hoàn tiền. Vui lòng liên hệ cơ sở.");

        // OrderCode gốc = "{vnp_TxnRef}-{ReservationID}", ProviderTransactionId gốc = "{vnp_TransactionNo}-{ReservationID}"
        var txnRef = StripSuffix(original.OrderCode, original.ReservationID);
        var transactionNo = StripSuffix(original.ProviderTransactionId ?? "", original.ReservationID);
        // Một giao dịch VNPay có thể trả cọc cho nhiều đơn (giỏ hàng) -> hoàn 1 phần nếu không hoàn hết cả giao dịch.
        var txnTotal = await context.Payments.AsNoTracking()
            .Where(p => p.Provider == VnPayProvider && p.Direction == "Collection" && p.OrderCode.StartsWith(txnRef + "-"))
            .SumAsync(p => p.Amount, ct);
        var refundedBefore = await context.Payments.AsNoTracking()
            .Where(p => p.Provider == VnPayProvider && p.Direction == "Refund" && p.Status == "Completed" &&
                        p.RefundOfPayment != null && p.RefundOfPayment.OrderCode.StartsWith(txnRef + "-"))
            .SumAsync(p => p.Amount, ct);
        var full = refundedBefore == 0 && refund.Amount == txnTotal;

        var vnNow = DateTime.UtcNow.AddHours(7);
        var email = Request.Headers["X-User-Email"].ToString();
        var req = new Dictionary<string, string>
        {
            ["vnp_RequestId"] = $"RF{vnNow:yyMMddHHmmss}{Random.Shared.Next(1000, 9999)}",
            ["vnp_Version"] = "2.1.0",
            ["vnp_Command"] = "refund",
            ["vnp_TmnCode"] = TmnCode!,
            ["vnp_TransactionType"] = full ? "02" : "03",
            ["vnp_TxnRef"] = txnRef,
            ["vnp_Amount"] = ((long)decimal.Round(refund.Amount * 100m, 0)).ToString(CultureInfo.InvariantCulture),
            ["vnp_TransactionNo"] = transactionNo,
            ["vnp_TransactionDate"] = original.CreatedAt.AddHours(7).ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture),
            ["vnp_CreateBy"] = string.IsNullOrWhiteSpace(email) ? $"customer-{customerId}" : email,
            ["vnp_CreateDate"] = vnNow.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture),
            ["vnp_IpAddr"] = "127.0.0.1",
            ["vnp_OrderInfo"] = $"Hoan coc huy dat kho {refund.ReservationID}"
        };
        var signData = string.Join("|", new[]
        {
            "vnp_RequestId", "vnp_Version", "vnp_Command", "vnp_TmnCode", "vnp_TransactionType", "vnp_TxnRef", "vnp_Amount",
            "vnp_TransactionNo", "vnp_TransactionDate", "vnp_CreateBy", "vnp_CreateDate", "vnp_IpAddr", "vnp_OrderInfo"
        }.Select(k => req[k]));
        req["vnp_SecureHash"] = Sign(signData);

        string body;
        int httpStatus;
        var requestJson = JsonSerializer.Serialize(req);
        try
        {
            using var response = await Http.PostAsync(
                configuration["VnPay:RefundUrl"] ?? DefaultRefundApi,
                new StringContent(requestJson, Encoding.UTF8, "application/json"), ct);
            httpStatus = (int)response.StatusCode;
            body = (await response.Content.ReadAsStringAsync(ct)).Trim().TrimStart('\uFEFF');
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(exception, "Không gọi được API hoàn tiền VNPay ({PaymentId})", refund.PaymentID);
            await LogAsync(refund.PaymentID, txnRef, null, null, refund.Amount, JsonSerializer.Serialize(req), false, "Error", "Refund: không kết nối được VNPay", ct);
            return (false, null, "Không kết nối được VNPay. Yêu cầu hoàn đang chờ, vui lòng thử lại sau.");
        }

        Dictionary<string, string> res;
        try
        {
            res = (JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(body) ?? new Dictionary<string, JsonElement>())
                .ToDictionary(kv => kv.Key, kv => kv.Value.ValueKind == JsonValueKind.String ? kv.Value.GetString() ?? "" : kv.Value.ToString());
        }
        catch (JsonException)
        {
            // Lưu cả yêu cầu lẫn phản hồi để tra lỗi (Payload trong PaymentCallbackLog).
            var snippet = body.Length == 0 ? "(rỗng)" : (body.Length > 160 ? body[..160] + "..." : body);
            logger.LogWarning("VNPay refund trả về không phải JSON. HTTP {Status}. Body: {Body}", httpStatus, body.Length > 2000 ? body[..2000] : body);
            if (httpStatus == 403)
            {
                await LogAsync(refund.PaymentID, txnRef, null, "403", refund.Amount,
                    $"REQUEST: {requestJson}\nRESPONSE (HTTP 403): {body}", false, "Error", "Refund: HTTP 403, VNPay chặn yêu cầu (tường lửa)", ct);
                return (false, null, "VNPay chặn yêu cầu hoàn tiền (HTTP 403). Kiểm tra mạng / VPN rồi gửi lại; nếu vẫn bị, cần liên hệ VNPay mở quyền gọi API hoàn tiền cho mã website sandbox.");
            }
            await LogAsync(refund.PaymentID, txnRef, null, httpStatus.ToString(CultureInfo.InvariantCulture), refund.Amount,
                $"REQUEST: {requestJson}\nRESPONSE (HTTP {httpStatus}): {body}", false, "Error", $"Refund: HTTP {httpStatus}, phản hồi không phải JSON: {snippet}", ct);
            return (false, null, $"VNPay trả về dữ liệu không đọc được (HTTP {httpStatus}: {snippet}). Yêu cầu hoàn đang chờ.");
        }

        string Get(string key) => res.TryGetValue(key, out var v) ? v : "";
        var code = Get("vnp_ResponseCode");
        var hashOk = true;
        if (res.TryGetValue("vnp_SecureHash", out var received) && !string.IsNullOrWhiteSpace(received))
        {
            var resData = string.Join("|", new[]
            {
                "vnp_ResponseId", "vnp_Command", "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount",
                "vnp_BankCode", "vnp_PayDate", "vnp_TransactionNo", "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo"
            }.Select(Get));
            hashOk = string.Equals(Sign(resData), received, StringComparison.OrdinalIgnoreCase);
        }

        var success = code == "00" && hashOk;
        await LogAsync(refund.PaymentID, txnRef, Get("vnp_TransactionNo"), code, refund.Amount, body, hashOk,
            success ? "Applied" : (hashOk ? "Rejected" : "Error"), $"Refund {(full ? "02" : "03")}: {code} {Get("vnp_Message")}", ct);

        if (success)
            return (true, $"RFC-{Get("vnp_TransactionNo")}-{refund.PaymentID}", "VNPay đã nhận yêu cầu hoàn tiền về thẻ / tài khoản đã thanh toán.");
        if (!hashOk)
            return (false, null, "Chữ ký phản hồi VNPay không hợp lệ. Yêu cầu hoàn đang chờ kiểm tra.");
        return (false, null, code switch
        {
            "94" => "VNPay đang xử lý yêu cầu hoàn tiền trước đó của giao dịch này.",
            "91" => "VNPay không tìm thấy giao dịch gốc để hoàn tiền. Vui lòng liên hệ cơ sở.",
            "95" => "Giao dịch gốc không thành công ở VNPay nên không hoàn được.",
            "97" => "VNPay báo sai chữ ký (kiểm tra VnPay:HashSecret).",
            "02" => "VNPay báo sai mã website (kiểm tra VnPay:TmnCode).",
            _ => $"VNPay chưa hoàn được tiền (mã {code}{(string.IsNullOrWhiteSpace(Get("vnp_Message")) ? "" : $": {Get("vnp_Message")}")})."
        });
    }

    // ------------------------------------------------------------------ Báo giá

    private sealed record DepositShare(Charge Charge, decimal Share);
    private sealed record CancelQuote(
        bool Eligible, string? Reason, int DaysBefore, decimal RefundPercent, decimal DepositPaid, decimal RefundAmount,
        List<(int Days, decimal Percent)> Tiers, List<DepositShare> Deposits, bool PaidByVnPay);

    private async Task<CancelQuote> BuildQuoteAsync(Reservation r, CancellationToken ct)
    {
        var tiers = await ReadTiersAsync(r.FacilityID, ct);
        var today = Today();
        var daysBefore = (r.StartDate.Date - today).Days;

        var deposits = r.Charges
            .Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0 && c.PaymentID != null)
            .OrderBy(c => c.ChargeID)
            .ToList();
        var depositPaid = deposits.Sum(c => c.Amount);
        var percent = tiers.Where(t => daysBefore >= t.Days).Select(t => (decimal?)t.Percent).FirstOrDefault() ?? 0m;
        var shares = deposits.Select(c => new DepositShare(c, decimal.Round(c.Amount * percent / 100m, 0, MidpointRounding.AwayFromZero))).ToList();
        var refundAmount = shares.Sum(s => s.Share);
        var paidByVnPay = deposits.Any(c => r.Payments.Any(p => p.PaymentID == c.PaymentID && p.Provider == VnPayProvider));

        string? reason = null;
        if (ContractRenewalFinalizer.IsRenewal(r))
            reason = "Đây là đơn gia hạn của kho bạn đang thuê. Muốn ngừng thuê, vui lòng báo trả kho với cơ sở.";
        else if (!CancellableStatuses.Contains(r.Status))
            reason = r.Status switch
            {
                ReservationStatus.HandedOver => "Bạn đã nhận kho nên không thể hủy đặt kho. Muốn ngừng thuê, vui lòng báo trả kho với cơ sở.",
                ReservationStatus.Cancelled => "Đơn này đã được hủy.",
                ReservationStatus.Expired => "Đơn này đã hết thời gian giữ kho.",
                ReservationStatus.Completed => "Hợp đồng đã kết thúc.",
                _ => $"Đơn đang ở trạng thái {r.Status} nên không thể hủy."
            };
        else if (r.ReservationUnits.Any(ru => ru.Status == "Active"))
            reason = "Đơn đã có kho được bàn giao nên không thể hủy online. Vui lòng liên hệ cơ sở.";

        return new CancelQuote(reason is null, reason, daysBefore, percent, depositPaid, refundAmount, tiers, shares, paidByVnPay);
    }

    private object ToDto(Reservation r, CancelQuote q) => new
    {
        reservationId = r.ReservationID,
        reservationCode = r.ReservationCode,
        contractNumber = r.Contract?.ContractNumber,
        status = r.Status,
        startDate = r.StartDate.Date,
        eligible = q.Eligible,
        reason = q.Reason,
        daysBefore = q.DaysBefore,
        depositPaid = q.DepositPaid,
        refundPercent = q.RefundPercent,
        refundAmount = q.RefundAmount,
        refundMethod = q.RefundAmount <= 0 ? null : q.PaidByVnPay ? "VNPay" : "Simulator",
        tiers = q.Tiers.Select(t => new { minDaysBefore = t.Days, refundPercent = t.Percent })
    };

    /* % hoàn theo số ngày trước ngày bắt đầu: chính sách của cơ sở -> chính sách chung -> mặc định. */
    private async Task<List<(int Days, decimal Percent)>> ReadTiersAsync(int facilityId, CancellationToken ct)
    {
        var policies = await context.RentalPolicies.AsNoTracking()
            .Include(p => p.CancellationRules)
            .Where(p => p.FacilityID == facilityId || p.FacilityID == null)
            .ToListAsync(ct);
        var policy = policies.FirstOrDefault(p => p.FacilityID == facilityId && p.CancellationRules.Count > 0)
                     ?? policies.FirstOrDefault(p => p.FacilityID == null && p.CancellationRules.Count > 0);
        var tiers = policy?.CancellationRules.Select(c => (Days: c.DaysBeforeStart, Percent: c.RefundPercent)).ToList()
                    ?? DefaultTiers.ToList();
        return tiers.OrderByDescending(t => t.Days).ToList();
    }

    // ------------------------------------------------------------------ Helpers

    private Task<Reservation?> LoadAsync(int reservationId, int customerId, CancellationToken ct) =>
        context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.Payments)
            .Include(r => r.ReservationUnits)
            .Include(r => r.Contract)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId && r.CustomerID == customerId, ct);

    private static string StripSuffix(string value, int reservationId)
    {
        var suffix = $"-{reservationId}";
        return value.EndsWith(suffix, StringComparison.Ordinal) ? value[..^suffix.Length] : value;
    }

    private string Sign(string data)
    {
        using var hmac = new HMACSHA512(Encoding.UTF8.GetBytes(HashSecret!));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(data))).ToLowerInvariant();
    }

    private async Task LogAsync(int? paymentId, string orderCode, string? transactionNo, string? status, decimal? amount,
        string payload, bool signatureValid, string result, string note, CancellationToken ct)
    {
        try
        {
            context.ChangeTracker.Clear();
            context.PaymentCallbackLogs.Add(new PaymentCallbackLog
            {
                PaymentID = paymentId,
                Provider = VnPayProvider,
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
            logger.LogWarning(exception, "Không ghi được PaymentCallbackLog (hoàn tiền)");
        }
    }

    private static string Vnd(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("vi-VN"));

    private static string CleanDbMessage(string text, string fallback)
    {
        var colon = text.IndexOf(':');
        return colon > 0 && colon < 60 ? text[(colon + 1)..].Trim() : fallback;
    }

    /* Ngày hiện tại theo giờ Việt Nam. */
    private static DateTime Today() => DateTime.UtcNow.AddHours(7).Date;

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
