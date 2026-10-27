using System.ComponentModel.DataAnnotations;

namespace SelfStorageAPI.DTOs;

// ===================== UNIT TYPE =====================

/// <summary>Dữ liệu trả về cho 1 loại kho.</summary>
public sealed record UnitTypeResponse(
    int UnitTypeID,
    string TypeName,
    string? Description,
    int StorageUnitCount);

/// <summary>Body cho POST / PUT loại kho (khớp bảng UnitType trong DB).</summary>
public sealed record UpsertUnitTypeDTO
{
    [Required(ErrorMessage = "Tên loại kho là bắt buộc.")]
    [StringLength(100, ErrorMessage = "Tên loại kho tối đa 100 ký tự.")]
    public string TypeName { get; init; } = string.Empty;

    [StringLength(255, ErrorMessage = "Mô tả tối đa 255 ký tự.")]
    public string? Description { get; init; }
}

// ===================== UNIT SIZE =====================

/// <summary>Dữ liệu trả về cho 1 kích thước kho.</summary>
public sealed record UnitSizeResponse(
    int UnitSizeID,
    string Dimensions,
    decimal? Volume,
    int StorageUnitCount);

/// <summary>Body cho POST / PUT kích thước kho (khớp bảng UnitSize trong DB).</summary>
public sealed record UpsertUnitSizeDTO
{
    [Required(ErrorMessage = "Kích thước là bắt buộc.")]
    [StringLength(50, ErrorMessage = "Kích thước tối đa 50 ký tự.")]
    public string Dimensions { get; init; } = string.Empty;

    // DECIMAL(10,2) => tối đa 99,999,999.99
    [Range(0.01, 99999999.99, ErrorMessage = "Thể tích/diện tích phải lớn hơn 0.")]
    public decimal? Volume { get; init; }
}
