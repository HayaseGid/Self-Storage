using System;

namespace SelfStorageAPI.Models;

/// <summary>
/// Đã gửi email nhắc hạn đóng tiền thuê cho khách (RentReminderJob) — chống gửi trùng khi job chạy lại trong ngày.
/// Kind: "D3" (nhắc trước 3 ngày) | "D0" (đúng ngày đến hạn).
/// </summary>
public class RentReminderLog
{
    public int RentReminderLogID { get; set; }
    public int CustomerID { get; set; }
    public DateTime DueDate { get; set; }
    public string Kind { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
}
