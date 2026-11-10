using SelfStorageAPI.DTOs;
namespace SelfStorageAPI.Interfaces;

public record OperationsServiceResponse(bool IsSuccess, string? ErrorMessage, int StatusCode, object? Data);

public interface IOperationsStateService
{
    Task<OperationsServiceResponse> GetStateAsync(string? queryEmail, string? headerEmail, CancellationToken cancellationToken);
    Task<OperationsServiceResponse> GetReportsAsync(string? headerEmail, CancellationToken cancellationToken);
    /// <summary>kind: "reservations" | "units" | "contracts" - danh sách có phân trang, cùng phạm vi dữ liệu với GetStateAsync.</summary>
    Task<OperationsServiceResponse> GetPagedListAsync(string kind, PageQuery query, string? queryEmail, string? headerEmail, CancellationToken cancellationToken);
}

