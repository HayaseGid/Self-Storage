using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

// ===================== UNIT TYPE =====================

/// <summary>Dữ liệu trả về cho 1 loại kho.</summary>
public sealed record UnitTypeResponse(
    int UnitTypeID,
    string TypeName,
    string? Description,
    int StorageUnitCount,
    int Id = 0,
    string Name = "",
    bool IsActive = true,
    int UnitCount = 0,
    int ReservationCount = 0,
    int RateCount = 0,
    int? FacilityID = null);

/// <summary>Body cho POST / PUT loại kho (khớp bảng UnitType trong DB).</summary>
public sealed record UpsertUnitTypeDTO
{
    [StringLength(100, ErrorMessage = "Tên loại kho tối đa 100 ký tự.")]
    public string TypeName { get; init; } = string.Empty;

    [StringLength(100, ErrorMessage = "Tên loại kho tối đa 100 ký tự.")]
    public string? Name { get; init; }

    [StringLength(255, ErrorMessage = "Mô tả tối đa 255 ký tự.")]
    public string? Description { get; init; }

    public bool? IsActive { get; init; }

    public int? FacilityID { get; init; }
}

// ===================== UNIT SIZE =====================

/// <summary>Dữ liệu trả về cho 1 kích thước kho.</summary>
public sealed record UnitSizeResponse(
    int UnitSizeID,
    string Dimensions,
    decimal? Volume,
    int StorageUnitCount,
    int Id = 0,
    string SizeCode = "",
    string DisplayName = "",
    decimal? AreaM2 = null,
    decimal WidthM = 0m,
    decimal LengthM = 0m,
    decimal HeightM = 0m,
    bool IsActive = true,
    int UnitCount = 0,
    int ReservationCount = 0,
    int RateCount = 0);

/// <summary>Body cho POST / PUT kích thước kho (khớp bảng UnitSize trong DB).</summary>
public sealed record UpsertUnitSizeDTO
{
    [StringLength(50, ErrorMessage = "Kích thước tối đa 50 ký tự.")]
    public string Dimensions { get; init; } = string.Empty;

    [StringLength(10, ErrorMessage = "Mã size tối đa 10 ký tự.")]
    public string? SizeCode { get; init; }

    [StringLength(100, ErrorMessage = "Tên hiển thị tối đa 100 ký tự.")]
    public string? DisplayName { get; init; }

    // DECIMAL(10,2) => tối đa 99,999,999.99
    [Range(0.01, 99999999.99, ErrorMessage = "Thể tích/diện tích phải lớn hơn 0.")]
    public decimal? Volume { get; init; }

    [Range(0.10, 50, ErrorMessage = "Chiều rộng phải từ 0.1m đến 50m.")]
    public decimal? WidthM { get; init; }

    [Range(0.10, 50, ErrorMessage = "Chiều dài phải từ 0.1m đến 50m.")]
    public decimal? LengthM { get; init; }

    [Range(0.10, 10, ErrorMessage = "Chiều cao phải từ 0.1m đến 10m.")]
    public decimal? HeightM { get; init; }

    public bool? IsActive { get; init; }

    public int? FacilityID { get; init; }
}
