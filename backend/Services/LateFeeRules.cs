using System.Globalization;
using System.Text.Json;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// LUẬT PHÍ TRỄ HẠN TIỀN THUÊ — nguồn duy nhất (file THÊM MỚI).
///
/// Mức phí lấy từ chính sách "Phí quá hạn &amp; phụ phí" (key "overdue") mà Business Operations chỉnh ở trang Chính sách,
/// cũng là điều khoản in trong hợp đồng. Cách tính giống hệt phần "Ví dụ" ở trang chỉnh chính sách (BusinessPolicyEditor):
///   số ngày trễ      = hôm nay (hoặc ngày đã đóng) - ngày bắt đầu tính trễ
///   ngày bắt đầu trễ = hạn đóng của kỳ, nhưng không sớm hơn ngày nhận kho (nhận kho muộn thì không bị phạt oan)
///   số kỳ tính phí   = max(0, số ngày trễ - số ngày ân hạn), quy theo ngày / tuần (làm tròn lên) / tháng (30 ngày, làm tròn lên)
///   phí              = "percent": số tiền quá hạn x mức % x số kỳ      | "fixed": số tiền cố định x số kỳ
///   trần             = số tiền quá hạn x mức tối đa % (để trống = không giới hạn)
/// Mỗi kỳ tiền thuê của mỗi kho (một dòng Charge "Rent") có tối đa MỘT khoản phí trễ đang mở (Charge "LateFee",
/// cùng ReservationUnitID + PeriodStart với kỳ thuê đó). Khoản phí tăng dần theo ngày tới khi khách đóng tiền thuê
/// hoặc chạm trần; Manager miễn (Waived) thì kỳ đó không tính thêm.
/// </summary>
public static class LateFeeRules
{
    public sealed record Policy(string FeeType, decimal FeeValue, string Period, int GraceDays, decimal? MaxPercent)
    {
        /// <summary>Mặc định giống FacilityManagementService (0,05%/ngày, sau 3 ngày, tối đa 5% mỗi kỳ).</summary>
        public static readonly Policy Default = new("percent", 0.05m, "day", 3, 5m);

        public string PeriodLabel => Period switch { "week" => "tuần", "month" => "tháng", _ => "ngày" };

        public string Summary
        {
            get
            {
                var fee = FeeType == "percent"
                    ? $"{Pct(FeeValue)} số tiền quá hạn / {PeriodLabel}"
                    : $"{Vnd(FeeValue)}đ / {PeriodLabel}";
                var cap = MaxPercent is null ? "" : $", tối đa {Pct(MaxPercent.Value)} số tiền quá hạn mỗi kỳ";
                return $"Quá hạn hơn {GraceDays} ngày: {fee}{cap}.";
            }
        }
    }

    public sealed record Result(int DaysLate, int BillableUnits, decimal Fee, decimal? Cap, bool Capped);

    public static Result Compute(decimal overdueAmount, DateTime lateFrom, DateTime until, Policy p)
    {
        var daysLate = Math.Max(0, (until.Date - lateFrom.Date).Days);
        var billableDays = Math.Max(0, daysLate - p.GraceDays);
        var units = p.Period switch
        {
            "week" => (int)Math.Ceiling(billableDays / 7m),
            "month" => (int)Math.Ceiling(billableDays / 30m),
            _ => billableDays
        };
        var fee = p.FeeType == "percent" ? overdueAmount * p.FeeValue / 100m * units : p.FeeValue * units;
        decimal? cap = p.MaxPercent is null ? null : overdueAmount * p.MaxPercent.Value / 100m;
        var capped = cap is not null && fee > cap.Value;
        if (capped) fee = cap!.Value;
        fee = decimal.Round(Math.Max(0m, fee), 0, MidpointRounding.AwayFromZero);
        return new Result(daysLate, units, fee, cap is null ? null : decimal.Round(cap.Value, 0, MidpointRounding.AwayFromZero), capped);
    }

    /// <summary>Ngày bắt đầu tính trễ của một kỳ thuê: hạn đóng, nhưng không sớm hơn ngày nhận kho (giờ VN).</summary>
    public static DateTime LateFrom(Charge rent, ReservationUnit? unit)
    {
        var due = rent.DueDate.Date;
        if (unit?.HandedOverAt is DateTime handed)
        {
            var handedDay = handed.AddHours(7).Date;
            if (handedDay > due) return handedDay;
        }
        return due;
    }

    /// <summary>Phí trễ của đúng kỳ thuê này (cùng kho, cùng ngày bắt đầu kỳ).</summary>
    public static bool IsLateFeeFor(Charge fee, Charge rent) =>
        fee.ChargeType == "LateFee" &&
        fee.ReservationUnitID == rent.ReservationUnitID &&
        fee.PeriodStart?.Date == rent.PeriodStart?.Date;

    public static string Describe(Charge rent, string? unitNumber, int daysLate)
    {
        var period = rent.PeriodStart is null ? "" : $" kỳ {rent.PeriodStart:dd/MM}–{rent.PeriodEnd:dd/MM/yyyy}";
        var unit = string.IsNullOrWhiteSpace(unitNumber) ? "" : $" (kho {unitNumber})";
        var text = $"Phí trễ hạn tiền thuê{period}{unit} - trễ {daysLate} ngày";
        return text.Length > 255 ? text[..255] : text;
    }

    /// <summary>Đọc chính sách "overdue" hiện hành (cùng nguồn với trang Chính sách); lỗi thì dùng mặc định.</summary>
    public static async Task<Policy> ReadPolicyAsync(IFacilityManagementService policies, CancellationToken ct)
    {
        try
        {
            var result = await policies.GetPolicyGroupsAsync(ct);
            if (!result.IsSuccess || result.Data is null) return Policy.Default;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(result.Data));
            if (!doc.RootElement.TryGetProperty("current", out var current) ||
                !current.TryGetProperty("overdue", out var policy)) return Policy.Default;
            var value = policy.TryGetProperty("value", out var v) ? v : policy.TryGetProperty("config", out var c) ? c : default;
            if (value.ValueKind != JsonValueKind.Object) return Policy.Default;

            var feeType = ReadString(value, "feeType") == "fixed" ? "fixed" : "percent";
            var period = ReadString(value, "period") is "week" or "month" ? ReadString(value, "period")! : "day";
            var feeValue = Math.Max(0m, ReadDecimal(value, "feeValue") ?? Policy.Default.FeeValue);
            if (feeType == "percent") feeValue = Math.Min(feeValue, 100m);
            var grace = (int)Math.Clamp(ReadDecimal(value, "graceDays") ?? Policy.Default.GraceDays, 0, 365);
            var max = ReadDecimal(value, "maxPercent");
            if (max is not null) max = Math.Clamp(max.Value, 0m, 100m);
            return new Policy(feeType, feeValue, period, grace, max);
        }
        catch
        {
            return Policy.Default;
        }
    }

    private static string? ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    private static decimal? ReadDecimal(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var el)) return null;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return d;
        if (el.ValueKind == JsonValueKind.String &&
            decimal.TryParse(el.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var s)) return s;
        return null; // null / "" = không giới hạn (maxPercent)
    }

    private static string Pct(decimal v) => $"{v.ToString("0.##", CultureInfo.GetCultureInfo("vi-VN"))}%";
    private static string Vnd(decimal v) => v.ToString("N0", CultureInfo.GetCultureInfo("vi-VN"));
}
