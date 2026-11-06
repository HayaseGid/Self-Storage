using SelfStorageAPI.Constants;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// LUẬT TIỀN THUÊ — nguồn duy nhất, dùng chung cho: tạo đơn, gia hạn, thanh toán (VNPay / mô phỏng),
/// điều kiện bàn giao, hủy đơn và hiển thị cho khách / nhân viên.
///
///   Đặt kho:     chỉ đóng TIỀN CỌC.
///   Nhận kho:    Trả 1 lần (Upfront)  -> đóng TOÀN BỘ tiền thuê.
///                Trả theo tháng       -> đóng tiền thuê THÁNG ĐẦU.
///                Chỉ đóng được từ ngày bắt đầu thuê (ngày được bàn giao), đơn đã xác nhận.
///                Chưa đóng đủ -> không bàn giao được (HandoverService).
///   Đang thuê:   Trả theo tháng -> đóng từng kỳ, hạn là ngày đầu kỳ; được đóng trước tối đa 7 ngày.
///   Gia hạn:     khách chọn lại hình thức trả; đóng ngay lúc gia hạn: toàn bộ kỳ mới hoặc tháng đầu kỳ mới.
/// Mỗi tháng của mỗi kho là một dòng Charge "Rent" (PeriodStart / PeriodEnd), đúng như lúc tạo đơn.
/// </summary>
public static class RentPaymentRules
{
    /// <summary>Số ngày được đóng trước hạn của kỳ tiếp theo (trả theo tháng).</summary>
    public const int PayAheadDays = 7;

    public static bool IsRent(Charge c) => c.ChargeType == "Rent" && c.Status != "Cancelled";

    /// <summary>Hạn đóng của một kỳ thuê khi TẠO khoản phí.</summary>
    public static DateTime DueDateFor(string plan, DateTime startDate, DateTime periodStart)
        => plan == PaymentPlan.Upfront ? startDate.Date : periodStart.Date;

    /// <summary>Các khoản tiền thuê phải đóng NGAY TỪ ĐẦU kỳ thuê (lúc nhận kho / lúc gia hạn).</summary>
    public static List<Charge> DueAtStart(Reservation r) => r.Charges
        .Where(c => IsRent(c) && (r.PaymentPlan == PaymentPlan.Upfront || c.PeriodStart?.Date == r.StartDate.Date))
        .ToList();

    /// <summary>Đã đóng đủ tiền thuê phải trả lúc bắt đầu kỳ thuê chưa.</summary>
    public static bool IsStartRentPaid(Reservation r)
    {
        var due = DueAtStart(r);
        return due.Count > 0 && due.All(c => c.Status is "Paid" or "Waived");
    }

    /// <summary>Tiền thuê quá hạn chưa đóng (đơn đang thuê).</summary>
    public static List<Charge> Overdue(Reservation r, DateTime today) => r.Charges
        .Where(c => IsRent(c) && c.Status == "Unpaid" && c.DueDate.Date < today.Date)
        .ToList();

    /// <summary>
    /// Các khoản tiền thuê khách được đóng NGAY BÂY GIỜ (đơn thường, không gồm đơn gia hạn đang chờ thanh toán —
    /// đơn gia hạn dùng ContractRenewalFinalizer.IsPayableNow). Rỗng = chưa / không có gì để đóng.
    /// </summary>
    public static List<Charge> PayableNow(Reservation r, DateTime today)
    {
        var unpaid = r.Charges.Where(c => IsRent(c) && c.Status == "Unpaid").ToList();
        if (unpaid.Count == 0) return unpaid;

        if (r.Status == ReservationStatus.Confirmed)
        {
            // Ngày nhận kho: chỉ khi đã tới kỳ thuê
            if (today.Date < r.StartDate.Date || today.Date > r.EndDate.Date) return new List<Charge>();
            return DueAtStart(r).Where(c => c.Status == "Unpaid").ToList();
        }

        if (r.Status == ReservationStatus.HandedOver)
        {
            var due = unpaid.Where(c => c.DueDate.Date <= today.Date).ToList();
            if (due.Count > 0) return due;
            // Không có kỳ nào đến hạn: cho đóng trước kỳ gần nhất (mọi kho của kỳ đó) nếu còn <= 7 ngày
            var next = unpaid.Min(c => c.DueDate.Date);
            return next <= today.Date.AddDays(PayAheadDays)
                ? unpaid.Where(c => c.DueDate.Date == next).ToList()
                : new List<Charge>();
        }

        return new List<Charge>();
    }

    /// <summary>
    /// Dựng một Reservation tạm từ dữ liệu đã Select (không tải cả entity) để áp đúng luật ở trên,
    /// tránh viết lại luật bằng LINQ ở từng màn hình.
    /// </summary>
    public static Reservation Snapshot(string status, DateTime startDate, DateTime endDate, string plan,
        IEnumerable<(string Status, decimal Amount, DateTime DueDate, DateTime? PeriodStart)> rentRows) => new()
    {
        Status = status,
        StartDate = startDate,
        EndDate = endDate,
        PaymentPlan = plan,
        Charges = rentRows.Select(x => new Charge
        {
            ChargeType = "Rent",
            Status = x.Status,
            Amount = x.Amount,
            DueDate = x.DueDate,
            PeriodStart = x.PeriodStart
        }).ToList()
    };

    /// <summary>Lý do chưa đóng được tiền thuê (để hiển thị), null nếu đóng được hoặc không còn gì phải đóng.</summary>
    public static string? WhyNotPayable(Reservation r, DateTime today)
    {
        if (!r.Charges.Any(c => IsRent(c) && c.Status == "Unpaid")) return null;
        if (PayableNow(r, today).Count > 0) return null;
        return r.Status switch
        {
            ReservationStatus.PendingPayment or ReservationStatus.Paid => "Đặt cọc xong, tiền thuê đóng vào ngày nhận kho.",
            ReservationStatus.Confirmed when today.Date < r.StartDate.Date => $"Tiền thuê đóng từ ngày nhận kho ({r.StartDate:dd/MM/yyyy}).",
            ReservationStatus.Confirmed => "Kỳ thuê đã kết thúc, vui lòng liên hệ cơ sở.",
            ReservationStatus.HandedOver => $"Kỳ tiếp theo được đóng trước tối đa {PayAheadDays} ngày so với hạn.",
            _ => "Đơn không còn khoản tiền thuê cần đóng."
        };
    }
}
