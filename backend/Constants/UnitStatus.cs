namespace SelfStorageAPI.Constants;

/// <summary>
/// Trạng thái StorageUnit — nguồn sự thật duy nhất.
/// Khớp với CK_StorageUnit_Status trong SelfStorageDB_test.sql.
/// </summary>
public static class UnitStatus
{
    public const string Available         = "Available";
    public const string Booking           = "Booking";
    public const string Reserved          = "Reserved";
    public const string InUse             = "In Use";
    public const string PendingInspection = "Pending Inspection";
    public const string Maintenance       = "Maintenance";
    public const string Inactive          = "Inactive";
}
