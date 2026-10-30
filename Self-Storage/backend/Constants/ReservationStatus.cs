namespace SelfStorageAPI.Constants;

/// <summary>
/// Trạng thái Reservation — nguồn sự thật duy nhất, dùng trong Service, Controller và test.
/// Khớp với CK_Reservation_Status trong SelfStorageDB_test.sql.
/// </summary>
public static class ReservationStatus
{
    public const string PendingPayment = "Pending Payment";
    public const string PendingDeposit = "Pending Payment";
    public const string Paid           = "Paid";
    public const string Confirmed      = "Confirmed";
    public const string HandedOver     = "Handed Over";
    public const string Completed      = "Completed";
    public const string Cancelled      = "Cancelled";
    public const string Expired        = "Expired";
}
