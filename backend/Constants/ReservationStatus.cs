namespace SelfStorageAPI.Constants;

/// <summary>
/// Trạng thái Reservation — nguồn sự thật duy nhất, dùng trong Service, Controller và test.
/// Frontend phải dùng đúng các giá trị chuỗi này.
/// </summary>
public static class ReservationStatus
{
    public const string PendingDeposit = "Pending Deposit";
    public const string Paid           = "Paid";
    public const string Confirmed      = "Confirmed";
    public const string HandedOver     = "Handed Over";
    public const string Cancelled      = "Cancelled";
    public const string Expired        = "Expired";
}
