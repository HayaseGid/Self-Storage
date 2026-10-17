namespace SelfStorageAPI.Constants;

/// <summary>
/// Tên Role khớp 100% với bảng Role trong DB.
/// Frontend phải dùng đúng các giá trị này để route đúng trang.
/// </summary>
public static class RoleNames
{
    public const string StorageCustomer    = "Storage Customer";
    public const string FacilityStaff     = "Facility Staff";
    public const string FacilityManager   = "Facility Manager";
    public const string SystemAdmin       = "System Administrator";
    public const string BusinessOperations = "Business Operations Manager";
}
