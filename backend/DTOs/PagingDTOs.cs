namespace SelfStorageAPI.DTOs;

/*
 * PHÂN TRANG DÙNG CHUNG (file THÊM MỚI).
 *   Query: ?page=1&pageSize=20&q=từ khóa&status=A,B&sort=newest&facilityId=3&typeId=2
 *   Trả về: { items, total, page, pageSize, pageCount, statusCounts }
 *   - page bắt đầu từ 1; pageSize tối đa 100 (mặc định 20).
 *   - status: nhiều giá trị cách nhau dấu phẩy (mã trạng thái giống frontend, vd HANDED_OVER,CONFIRMED).
 *   - statusCounts: số dòng theo từng trạng thái (đã lọc theo q / cơ sở, CHƯA lọc theo status) để hiện số trên các nút lọc.
 */
public sealed class PageQuery
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;

    public int? Page { get; set; }
    public int? PageSize { get; set; }
    public string? Q { get; set; }
    public string? Status { get; set; }
    public string? Sort { get; set; }
    public int? FacilityId { get; set; }
    public int? TypeId { get; set; }

    /// <summary>Có gửi ?page= thì mới trả dạng phân trang (API cũ không gửi vẫn nhận nguyên danh sách như trước).</summary>
    public bool IsPaged => Page.HasValue;

    public int SafePage => Page is null or < 1 ? 1 : Page.Value;

    public int SafePageSize => PageSize switch
    {
        null or < 1 => DefaultPageSize,
        > MaxPageSize => MaxPageSize,
        _ => PageSize.Value
    };

    /// <summary>Số dòng bỏ qua, đã kẹp trang về trang cuối nếu page vượt quá (vd vừa lọc lại còn ít dòng).</summary>
    public int SkipFor(int total)
    {
        var pageCount = Math.Max(1, (int)Math.Ceiling(total / (double)SafePageSize));
        return (Math.Min(SafePage, pageCount) - 1) * SafePageSize;
    }

    public string Keyword => (Q ?? string.Empty).Trim();

    public string SortKey => string.IsNullOrWhiteSpace(Sort) ? "newest" : Sort.Trim().ToLowerInvariant();

    public string[] Statuses => string.IsNullOrWhiteSpace(Status)
        ? Array.Empty<string>()
        : Status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => s.ToUpperInvariant())
            .Distinct()
            .ToArray();
}

public sealed record PagedResult<T>(
    IReadOnlyList<T> Items,
    int Total,
    int Page,
    int PageSize,
    int PageCount,
    IReadOnlyDictionary<string, int>? StatusCounts = null)
{
    public static PagedResult<T> Create(IReadOnlyList<T> items, int total, PageQuery query, IReadOnlyDictionary<string, int>? statusCounts = null)
    {
        var pageSize = query.SafePageSize;
        var pageCount = Math.Max(1, (int)Math.Ceiling(total / (double)pageSize));
        return new PagedResult<T>(items, total, Math.Min(query.SafePage, pageCount), pageSize, pageCount, statusCounts);
    }
}
