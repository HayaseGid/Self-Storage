namespace SelfStorageAPI.Constants;

/// <summary>
/// Trạng thái StorageUnit — nguồn sự thật duy nhất.
/// </summary>
public static class UnitStatus
{
    public const string Available = "Available";
    public const string Booking  = "Booking";
    public const string Reserved  = "Reserved";
    public const string InUse     = "In Use";
    public const string Inactive  = "Inactive";
}
