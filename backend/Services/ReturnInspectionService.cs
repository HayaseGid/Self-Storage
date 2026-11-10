using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/*
 * GÓP Ý 14 - KIỂM KHO KHI TRẢ: CÓ ẢNH, KHÁCH XÁC NHẬN RỒI MỚI TRỪ CỌC (file THÊM MỚI).
 *
 * 1. Staff "Hoàn tất kiểm tra" (UnitReturnsController.Complete gọi ValidateAsync + RecordAsync trong transaction của nó):
 *    - Kho có vấn đề HOẶC có phí kiểm kho -> bắt buộc 1-5 ảnh (data:image, FE nén ~1 MB / ảnh).
 *    - Phí chọn từ danh mục FeePolicy (loại Amount) phải nằm trong khoảng Min-Max của danh mục; tối đa 10 khoản.
 *    - Công nợ hợp đồng (tiền thuê chưa đóng, phí trễ hạn - 7b) vẫn trừ vào cọc ngay vì là nghĩa vụ hợp đồng, không phải kết quả kiểm tra.
 *    - KHÔNG có phí kiểm kho -> quyết toán ngay như cũ (ReturnInspection 'Settled', SettledBy 'NoFee').
 *    - CÓ phí kiểm kho      -> 'Awaiting Customer': chưa tạo khoản phí, chưa hoàn cọc; lưu số cọc còn lại (DepositRemaining).
 *      Đơn + hợp đồng vẫn kết thúc (khách đã trả kho, mã / thẻ đã thu hồi), kho đã về Còn trống / Bảo trì theo Staff chọn.
 * 2. Khách (trong N ngày, chính sách "Gia hạn & trả kho" -> inspectionConfirmDays, mặc định 3):
 *    - Đồng ý      -> quyết toán theo đúng số Staff đề xuất (SettledBy 'Customer').
 *    - Khiếu nại   -> lý do 10-1000 ký tự + tối đa 3 ảnh -> 'Disputed', chờ Facility Manager.
 *    - Không trả lời tới hạn -> hệ thống tự xác nhận (SettledBy 'Auto'), chạy mỗi khi khách / Staff / Manager mở trang.
 * 3. Facility Manager của cơ sở (hoặc BOM) giải quyết khiếu nại: xem ảnh 2 bên, giữ nguyên / giảm / miễn từng khoản
 *    (không tăng), ghi nội dung quyết định -> quyết toán (SettledBy 'Manager'). Quyết định là cuối cùng.
 * Quyết toán: phí trừ vào phần cọc còn lại, thiếu thì khách đóng thêm (hạn 7 ngày, mục Trả kho / VNPay như cũ),
 * dư thì hoàn sau N ngày (Payment Refund 'DepositReturn', giống UnitReturnsController).
 * Chống xử lý trùng: khóa dòng ReturnInspection (UPDLOCK) trong transaction + trigger DB chỉ cho đúng luồng trạng thái.
 */
public class ReturnInspectionService : IReturnInspectionService
{
    private const int CustomerRoleId = 1;
    private const int StaffRoleId = 2;
    private const int ManagerRoleId = 3;
    private const int BusinessOperationsRoleId = 4;

    private const int MaxStaffImages = 5;
    private const int MaxCustomerImages = 3;
    private const int MaxImageLength = 1_500_000; // ~1,1 MB ảnh sau khi FE nén (giống báo cáo sự cố kho)
    private const int MaxFees = 10;
    private const decimal MaxFeeAmount = 100_000_000m;
    private const int OwedDueDays = 7;            // giống phí còn thiếu khi trả kho (UnitReturnsController)
    private const int MinReasonLength = 10;

    public const string PendingManager = "Pending Manager";
    public const string Awaiting = "Awaiting Customer";
    public const string Disputed = "Disputed";
    public const string Settled = "Settled";

    private sealed record Rules(int RefundDays, int ConfirmDays);

    private readonly IReturnInspectionRepository _repo;
    private readonly IFacilityManagementService _policies;
    private readonly ILogger<ReturnInspectionService> _logger;

    public ReturnInspectionService(IReturnInspectionRepository repo, IFacilityManagementService policies, ILogger<ReturnInspectionService> logger)
    {
        _repo = repo;
        _policies = policies;
        _logger = logger;
    }

    /* =====================================================================
       1. STAFF HOÀN TẤT KIỂM TRA (gọi từ UnitReturnsController.Complete)
       ===================================================================== */

    public async Task<string?> ValidateAsync(string condition, IReadOnlyList<string>? images, IReadOnlyList<InspectionFeeInput> fees,
        CancellationToken cancellationToken)
    {
        var photos = CleanImages(images);
        if (photos.Count > MaxStaffImages) return $"Tối đa {MaxStaffImages} ảnh cho một lần kiểm kho.";
        if (photos.Any(i => !IsValidImage(i))) return "Ảnh không hợp lệ hoặc quá lớn (mỗi ảnh tối đa khoảng 1 MB).";
        if ((condition == "Damaged" || fees.Count > 0) && photos.Count == 0)
            return "Kho có vấn đề hoặc có phí phát sinh: vui lòng chụp ít nhất 1 ảnh làm bằng chứng gửi khách.";

        if (fees.Count > MaxFees) return $"Tối đa {MaxFees} khoản phí cho một lần kiểm kho.";
        if (fees.Any(f => f.Amount <= 0 || f.Amount > MaxFeeAmount)) return "Số tiền phí không hợp lệ.";
        if (fees.Any(f => string.IsNullOrWhiteSpace(f.Description) || f.Description.Trim().Length > 255))
            return "Tên khoản phí không được trống và tối đa 255 ký tự.";

        if (fees.Any(f => !string.IsNullOrWhiteSpace(f.FeeCode)))
        {
            var catalog = await _repo.GetFeePoliciesAsync(cancellationToken);
            foreach (var fee in fees.Where(f => !string.IsNullOrWhiteSpace(f.FeeCode)))
            {
                var policy = catalog.FirstOrDefault(p => string.Equals(p.FeeCode, fee.FeeCode, StringComparison.OrdinalIgnoreCase));
                if (policy is null) continue; // mã lạ -> coi như khoản khác (giống UnitReturnsController)
                if (!policy.IsActive || policy.FeeCategory != "ExtraFee")
                    return $"Khoản phí \"{policy.FeeName}\" không còn áp dụng khi trả kho.";
                if (policy.ValueType == "Amount" && (fee.Amount < policy.MinValue || fee.Amount > policy.MaxValue))
                    return policy.MinValue == policy.MaxValue
                        ? $"Phí \"{policy.FeeName}\" theo danh mục là {Vnd(policy.MaxValue)}đ."
                        : $"Phí \"{policy.FeeName}\" phải từ {Vnd(policy.MinValue)}đ đến {Vnd(policy.MaxValue)}đ theo danh mục phí.";
            }
        }
        return null;
    }

    public async Task<InspectionRecordResult> RecordAsync(Reservation reservation, string condition, string? notes, IReadOnlyList<string>? images,
        IReadOnlyList<InspectionFeeInput> fees, decimal depositRemaining, DateTime now, int staffUserId, CancellationToken cancellationToken)
    {
        if (!_repo.HasActiveTransaction)
            throw new InvalidOperationException("RecordAsync phải chạy trong transaction của Hoàn tất kiểm tra.");

        var rules = await ReadRulesAsync(cancellationToken);
        var photos = CleanImages(images);
        var deadline = now.AddDays(rules.ConfirmDays);
        var catalog = fees.Any(f => !string.IsNullOrWhiteSpace(f.FeeCode)) ? await _repo.GetFeePoliciesAsync(cancellationToken) : new List<FeePolicy>();
        var remaining = Math.Max(0, depositRemaining);

        int id;
        try
        {
            // [QUY TRÌNH MỚI]: Sau khi Staff kiểm tra kho xong, đơn được chuyển qua Facility Manager để xác nhận & duyệt trước khi trả về cho khách
            id = await _repo.InsertAsync(
                new NewReturnInspection(
                    reservation.ReservationID, condition, Trim(notes, 1000), photos.Count > 0 ? JsonSerializer.Serialize(photos) : null,
                    staffUserId, now, deadline, remaining,
                    PendingManager, null, null),
                fees.Select(f => new NewReturnInspectionFee(
                    Trim(f.FeeCode, 50),
                    catalog.FirstOrDefault(p => string.Equals(p.FeeCode, f.FeeCode, StringComparison.OrdinalIgnoreCase))?.FeePolicyID,
                    Trim(f.Description, 255)!,
                    decimal.Round(f.Amount, 0))).ToList(),
                cancellationToken);
        }
        catch (DbException exception)
        {
            // Đổi sang DbUpdateException để UnitReturnsController.Complete bắt như lỗi DB khác (rollback + thông báo tiếng Việt)
            _logger.LogWarning(exception, "Lưu kết quả kiểm kho thất bại ({ReservationId})", reservation.ReservationID);
            if (exception.Message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase))
                throw new DbUpdateException("INSPECTION_TABLE_MISSING: Chưa có bảng kiểm kho. Chạy database/20261109_KiemKhoXacNhan.sql rồi thử lại.");
            throw new DbUpdateException(exception.Message, exception);
        }

        var total = fees.Sum(f => decimal.Round(f.Amount, 0));
        return new InspectionRecordResult(true, id, deadline,
            $"Đã hoàn tất kiểm tra kho kèm {photos.Count} ảnh. Đơn kiểm kho đã được chuyển đến Facility Manager để phê duyệt trước khi gửi kết quả cho khách hàng.");
    }

    /* ----- Điểm vào công khai (bọc lỗi DB) ----- */
    /* Lỗi đọc bảng (thường là chưa chạy script SQL) -> báo rõ thay vì lỗi 500. */
    private async Task<ReturnInspectionResponse> GuardAsync(Func<Task<ReturnInspectionResponse>> action)
    {
        try
        {
            return await action();
        }
        catch (DbException exception)
        {
            _logger.LogWarning(exception, "Lỗi đọc / ghi bảng kiểm kho");
            return exception.Message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase)
                ? Fail(503, "Chưa có bảng kiểm kho. Chạy database/20261109_KiemKhoXacNhan.sql rồi tải lại trang.")
                : Fail(409, ReadDatabaseMessage(exception, "Có lỗi khi xử lý kết quả kiểm kho, vui lòng thử lại."));
        }
    }

    public Task<ReturnInspectionResponse> GetMineAsync(string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => GetMineCoreAsync(userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> GetStaffAsync(string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => GetStaffCoreAsync(userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> GetFacilityAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => GetFacilityCoreAsync(facilityId, userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> GetDetailAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => GetDetailCoreAsync(inspectionId, userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> AcceptAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => AcceptCoreAsync(inspectionId, userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> ApproveAsync(int inspectionId, ApproveInspectionDTO request, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => ApproveCoreAsync(inspectionId, request, userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> ResolveAsync(int inspectionId, ResolveInspectionDTO request, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => ResolveCoreAsync(inspectionId, request, userEmail, cancellationToken));

    public Task<ReturnInspectionResponse> DisputeAsync(int inspectionId, DisputeInspectionDTO request, string? userEmail, CancellationToken cancellationToken)
        => GuardAsync(() => DisputeCoreAsync(inspectionId, request, userEmail, cancellationToken));

    /* =====================================================================
       2. KHÁCH
       ===================================================================== */

    private async Task<ReturnInspectionResponse> GetMineCoreAsync(string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, CustomerRoleId, "Vui lòng đăng nhập bằng tài khoản khách hàng.", cancellationToken);
        if (fail is not null) return fail;

        var autoSettled = await ProcessOverdueAsync(user!.UserID, null, cancellationToken);
        var rules = await ReadRulesAsync(cancellationToken);
        var rows = await _repo.ListAsync(user.UserID, null, null, null, includeImages: false, cancellationToken);
        return Ok(new
        {
            confirmDays = rules.ConfirmDays,
            refundDays = rules.RefundDays,
            autoSettled,
            items = rows.Select(r => ToDto(r, forCustomer: true, includeImages: false))
        });
    }

    private async Task<ReturnInspectionResponse> AcceptCoreAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, CustomerRoleId, "Vui lòng đăng nhập bằng tài khoản khách hàng.", cancellationToken);
        if (fail is not null) return fail;

        var row = await _repo.GetAsync(inspectionId, includeImages: false, cancellationToken);
        if (row is null || row.CustomerID != user!.UserID) return Fail(404, "Không tìm thấy kết quả kiểm kho của bạn.");
        if (row.Status != Awaiting) return Fail(409, AlreadyHandledMessage(row));

        return await SettleInTransactionAsync(inspectionId, Awaiting, "Customer", actorUserId: user.UserID,
            finals: null, notes: null, cancellationToken);
    }

    private async Task<ReturnInspectionResponse> DisputeCoreAsync(int inspectionId, DisputeInspectionDTO request, string? userEmail,
        CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, CustomerRoleId, "Vui lòng đăng nhập bằng tài khoản khách hàng.", cancellationToken);
        if (fail is not null) return fail;

        var reason = request.Reason?.Trim();
        if (string.IsNullOrEmpty(reason) || reason.Length < MinReasonLength)
            return Fail(400, $"Vui lòng ghi rõ lý do khiếu nại (ít nhất {MinReasonLength} ký tự).");
        if (reason.Length > 1000) return Fail(400, "Lý do khiếu nại tối đa 1000 ký tự.");
        var photos = CleanImages(request.Images);
        if (photos.Count > MaxCustomerImages) return Fail(400, $"Tối đa {MaxCustomerImages} ảnh kèm khiếu nại.");
        if (photos.Any(i => !IsValidImage(i))) return Fail(400, "Ảnh không hợp lệ hoặc quá lớn (mỗi ảnh tối đa khoảng 1 MB).");

        var row = await _repo.GetAsync(inspectionId, includeImages: false, cancellationToken);
        if (row is null || row.CustomerID != user!.UserID) return Fail(404, "Không tìm thấy kết quả kiểm kho của bạn.");
        if (row.Status != Awaiting) return Fail(409, AlreadyHandledMessage(row));
        var now = DateTime.UtcNow;
        if (now > row.ConfirmDeadline)
            return Fail(409, $"Đã quá hạn xác nhận ({VnTime(row.ConfirmDeadline)}) nên không gửi khiếu nại được. Vui lòng liên hệ cơ sở.");

        try
        {
            await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            var locked = await _repo.LockAsync(inspectionId, cancellationToken);
            if (locked is null || locked.Status != Awaiting)
                return Fail(409, locked is null ? "Không tìm thấy kết quả kiểm kho." : AlreadyHandledMessage(locked));
            await _repo.MarkDisputedAsync(inspectionId, reason, photos.Count > 0 ? JsonSerializer.Serialize(photos) : null, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is DbException or DbUpdateException)
        {
            _repo.ClearTracking();
            _logger.LogWarning(exception, "Gửi khiếu nại kiểm kho thất bại ({InspectionId})", inspectionId);
            return Fail(409, ReadDatabaseMessage(exception, "Chưa gửi được khiếu nại, vui lòng thử lại."));
        }

        return Ok(new
        {
            message = "Đã gửi khiếu nại. Facility Manager sẽ xem ảnh, đối chiếu và phản hồi; tiền cọc chưa bị trừ cho tới khi có quyết định."
        });
    }

    /* =====================================================================
       3. STAFF / MANAGER / BOM
       ===================================================================== */

    private async Task<ReturnInspectionResponse> GetStaffCoreAsync(string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeRoleAsync(userEmail, StaffRoleId, "Vui lòng đăng nhập bằng tài khoản nhân viên.", cancellationToken);
        if (fail is not null) return fail;

        var facilityIds = await _repo.GetStaffFacilityIdsAsync(user!.UserID, cancellationToken);
        await ProcessOverdueAsync(null, facilityIds, cancellationToken);
        var rules = await ReadRulesAsync(cancellationToken);
        var rows = await _repo.ListAsync(null, facilityIds, null, DateTime.UtcNow.AddDays(-30), includeImages: false, cancellationToken);
        return Ok(new { confirmDays = rules.ConfirmDays, items = rows.Select(r => ToDto(r, forCustomer: false, includeImages: false)) });
    }

    private async Task<ReturnInspectionResponse> GetFacilityCoreAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeFacilityManagerAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        await ProcessOverdueAsync(null, new[] { facilityId }, cancellationToken);
        var rules = await ReadRulesAsync(cancellationToken);
        var rows = await _repo.ListAsync(null, new[] { facilityId }, null, DateTime.UtcNow.AddDays(-90), includeImages: false, cancellationToken);
        return Ok(new
        {
            confirmDays = rules.ConfirmDays,
            summary = new
            {
                pendingManager = rows.Count(r => r.Status == PendingManager),
                disputed = rows.Count(r => r.Status == Disputed),
                awaiting = rows.Count(r => r.Status == Awaiting),
                settled = rows.Count(r => r.Status == Settled),
                heldAmount = rows.Where(r => r.Status != Settled).Sum(r => r.Fees.Sum(f => f.FinalAmount ?? f.ProposedAmount)),
                reducedAmount = rows.Where(r => r.SettledBy == "Manager").Sum(r => r.Fees.Sum(f => f.ProposedAmount - (f.FinalAmount ?? f.ProposedAmount)))
            },
            items = rows.Select(r => ToDto(r, forCustomer: false, includeImages: false))
        });
    }

    private async Task<ReturnInspectionResponse> ApproveCoreAsync(int inspectionId, ApproveInspectionDTO request, string? userEmail,
        CancellationToken cancellationToken)
    {
        var row = await _repo.GetAsync(inspectionId, includeImages: false, cancellationToken);
        if (row is null) return Fail(404, "Không tìm thấy kết quả kiểm kho.");
        var (user, fail) = await AuthorizeFacilityManagerAsync(userEmail, row.FacilityID, cancellationToken);
        if (fail is not null) return fail;
        if (row.Status != PendingManager)
            return Fail(409, $"Kết quả kiểm kho này không ở trạng thái chờ duyệt (hiện tại: {StatusLabel(row)}).");

        var notes = request.Notes?.Trim();
        var input = request.Fees ?? new List<ResolveInspectionFeeDTO>();
        if (input.Select(f => f.FeeId).Distinct().Count() != input.Count) return Fail(400, "Mỗi khoản phí chỉ chốt một lần.");

        var finals = new Dictionary<int, decimal>();
        foreach (var fee in row.Fees)
        {
            var given = input.FirstOrDefault(f => f.FeeId == fee.FeeID);
            var amount = given is not null ? decimal.Round(given.FinalAmount, 0) : fee.ProposedAmount;
            if (amount < 0) return Fail(400, "Số tiền phí không được âm.");
            if (amount > fee.ProposedAmount)
                return Fail(400, $"Khoản \"{fee.Description}\": chỉ được giữ nguyên hoặc giảm (tối đa {Vnd(fee.ProposedAmount)}đ), không tăng.");
            finals[fee.FeeID] = amount;
        }

        var totalFinal = finals.Values.Sum();
        var rules = await ReadRulesAsync(cancellationToken);
        var now = DateTime.UtcNow;

        // Nếu tổng phí sau khi duyệt = 0đ (không có phí hoặc Manager đã miễn hết) -> quyết toán cọc luôn!
        if (totalFinal <= 0)
        {
            return await SettleInTransactionAsync(inspectionId, PendingManager, "Manager", actorUserId: user!.UserID, finals, notes, cancellationToken);
        }

        // Nếu có phí -> duyệt và chuyển sang cho Khách xác nhận (Awaiting Customer)
        try
        {
            await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            var locked = await _repo.LockAsync(inspectionId, cancellationToken);
            if (locked is null || locked.Status != PendingManager)
                return Fail(409, locked is null ? "Không tìm thấy kết quả kiểm kho." : AlreadyHandledMessage(locked));

            foreach (var (feeId, amount) in finals)
            {
                await _repo.SetFinalAmountAsync(feeId, amount, cancellationToken);
            }

            var deadline = now.AddDays(rules.ConfirmDays);
            await _repo.MarkApprovedAsync(inspectionId, Awaiting, deadline, user!.UserID, notes, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is DbException or DbUpdateException)
        {
            _repo.ClearTracking();
            _logger.LogWarning(exception, "Phê duyệt kiểm kho thất bại ({InspectionId})", inspectionId);
            return Fail(409, ReadDatabaseMessage(exception, "Chưa phê duyệt được, vui lòng thử lại."));
        }

        return Ok(new
        {
            message = $"Đã phê duyệt kết quả kiểm kho và chuyển cho khách hàng xác nhận. Hạn khách phản hồi: {VnTime(now.AddDays(rules.ConfirmDays))}."
        });
    }

    private async Task<ReturnInspectionResponse> ResolveCoreAsync(int inspectionId, ResolveInspectionDTO request, string? userEmail,
        CancellationToken cancellationToken)
    {
        var row = await _repo.GetAsync(inspectionId, includeImages: false, cancellationToken);
        if (row is null) return Fail(404, "Không tìm thấy kết quả kiểm kho.");
        var (user, fail) = await AuthorizeFacilityManagerAsync(userEmail, row.FacilityID, cancellationToken);
        if (fail is not null) return fail;
        if (row.Status != Disputed)
            return Fail(409, row.Status == Awaiting ? "Khách chưa khiếu nại kết quả này nên chưa cần giải quyết." : AlreadyHandledMessage(row));

        var notes = request.Notes?.Trim();
        if (string.IsNullOrEmpty(notes) || notes.Length < MinReasonLength)
            return Fail(400, $"Vui lòng ghi nội dung quyết định gửi khách (ít nhất {MinReasonLength} ký tự).");
        if (notes.Length > 1000) return Fail(400, "Nội dung quyết định tối đa 1000 ký tự.");

        var input = request.Fees ?? new List<ResolveInspectionFeeDTO>();
        if (input.Select(f => f.FeeId).Distinct().Count() != input.Count) return Fail(400, "Mỗi khoản phí chỉ chốt một lần.");
        var finals = new Dictionary<int, decimal>();
        foreach (var fee in row.Fees)
        {
            var given = input.FirstOrDefault(f => f.FeeId == fee.FeeID);
            if (given is null) return Fail(400, $"Chưa chốt số tiền cho khoản \"{fee.Description}\".");
            var amount = decimal.Round(given.FinalAmount, 0);
            if (amount < 0) return Fail(400, "Số tiền chốt không được âm.");
            if (amount > fee.ProposedAmount)
                return Fail(400, $"Khoản \"{fee.Description}\": chỉ được giữ nguyên hoặc giảm (tối đa {Vnd(fee.ProposedAmount)}đ), không tăng.");
            finals[fee.FeeID] = amount;
        }
        if (input.Any(f => row.Fees.All(x => x.FeeID != f.FeeId))) return Fail(400, "Có khoản phí không thuộc kết quả kiểm kho này.");

        return await SettleInTransactionAsync(inspectionId, Disputed, "Manager", actorUserId: user!.UserID, finals, notes, cancellationToken);
    }

    private async Task<ReturnInspectionResponse> GetDetailCoreAsync(int inspectionId, string? userEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userEmail)) return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");
        var user = await _repo.GetActiveUserByEmailAsync(userEmail, cancellationToken);
        if (user is null) return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        var row = await _repo.GetAsync(inspectionId, includeImages: true, cancellationToken);
        if (row is null) return Fail(404, "Không tìm thấy kết quả kiểm kho.");

        var allowed = user.RoleID switch
        {
            CustomerRoleId => row.CustomerID == user.UserID,
            StaffRoleId => (await _repo.GetStaffFacilityIdsAsync(user.UserID, cancellationToken)).Contains(row.FacilityID),
            ManagerRoleId => await _repo.IsManagerOfFacilityAsync(user.UserID, row.FacilityID, cancellationToken),
            BusinessOperationsRoleId => true,
            _ => false
        };
        if (!allowed) return Fail(404, "Không tìm thấy kết quả kiểm kho.");
        return Ok(ToDto(row, forCustomer: user.RoleID == CustomerRoleId, includeImages: true));
    }

    /* =====================================================================
       QUYẾT TOÁN
       ===================================================================== */

    private async Task<ReturnInspectionResponse> SettleInTransactionAsync(int inspectionId, string expectedStatus, string settledBy,
        int? actorUserId, Dictionary<int, decimal>? finals, string? notes, CancellationToken cancellationToken)
    {
        try
        {
            await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            var row = await _repo.LockAsync(inspectionId, cancellationToken);
            if (row is null) return Fail(404, "Không tìm thấy kết quả kiểm kho.");
            if (row.Status != expectedStatus) return Fail(409, AlreadyHandledMessage(row));

            var result = await SettleAsync(row, settledBy, actorUserId, finals, notes, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Ok(result);
        }
        catch (Exception exception) when (exception is DbException or DbUpdateException)
        {
            _repo.ClearTracking();
            _logger.LogWarning(exception, "Quyết toán kiểm kho thất bại ({InspectionId}, {SettledBy})", inspectionId, settledBy);
            return Fail(409, ReadDatabaseMessage(exception, "Chưa quyết toán được, vui lòng thử lại."));
        }
    }

    /* Phí chốt -> trừ vào phần cọc còn lại, thiếu thì khách đóng thêm; cọc dư hoàn sau N ngày. Chạy trong transaction đã khóa dòng. */
    private async Task<object> SettleAsync(ReturnInspectionRow row, string settledBy, int? actorUserId, Dictionary<int, decimal>? finals,
        string? notes, CancellationToken cancellationToken)
    {
        var rules = await ReadRulesAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var today = BusinessClock.Today;
        var createdBy = actorUserId ?? row.InspectedByUserID; // tự xác nhận: ghi theo nhân viên đã kiểm kho
        var r = await _repo.GetReservationForSettlementAsync(row.ReservationID, cancellationToken)
                ?? throw new InvalidOperationException("Không tìm thấy đơn của kết quả kiểm kho.");

        // 1) Chốt số tiền từng khoản (khách đồng ý / tự xác nhận: số tiền Manager đã duyệt hoặc đề xuất ban đầu; Manager giải quyết khiếu nại: số đã duyệt)
        var lines = row.Fees.Select(f => (Fee: f, Final: finals is not null && finals.TryGetValue(f.FeeID, out var v) ? v : (f.FinalAmount ?? f.ProposedAmount))).ToList();
        foreach (var (fee, final) in lines) await _repo.SetFinalAmountAsync(fee.FeeID, final, cancellationToken);

        // 2) Trừ vào phần cọc còn lại sau công nợ hợp đồng (đã chốt lúc kiểm kho)
        var deposits = r.Charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0)
            .OrderBy(c => c.ChargeID).ToList();
        var remaining = Math.Min(row.DepositRemaining, deposits.Sum(c => c.Amount));
        decimal fromDeposit = 0, owed = 0;

        foreach (var (fee, final) in lines.Where(l => l.Final > 0))
        {
            var label = fee.Description + (final < fee.ProposedAmount ? $" (giảm từ {Vnd(fee.ProposedAmount)}đ sau khiếu nại)" : "");
            var take = Math.Min(remaining, final);
            if (take > 0)
                _repo.AddCharge(NewFee(r, fee, $"{label} ({(take < final ? "phần " : "")}trừ vào tiền cọc)", take, settled: true, today, now, createdBy));
            var rest = final - take;
            if (rest > 0)
                _repo.AddCharge(NewFee(r, fee, take > 0 ? $"{label} (phần còn thiếu)" : label, rest, settled: false, today, now, createdBy));
            remaining -= take; fromDeposit += take; owed += rest;
        }
        await _repo.SaveChangesAsync(cancellationToken);

        // 3) Cọc còn dư -> hoàn sau N ngày (giống UnitReturnsController: Payment Refund DepositReturn, ngày hoàn ở ExpiresAt)
        if (remaining > 0)
        {
            var refund = new Payment
            {
                ReservationID = r.ReservationID,
                OrderCode = $"RFD-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}",
                IdempotencyKey = $"RETURN-REFUND-{r.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Manual",
                Direction = "Refund",
                RefundReason = "DepositReturn",
                Amount = remaining,
                PaymentMethod = "Chuyển khoản hoàn cọc",
                Status = "Pending",
                CreatedAt = now,
                ExpiresAt = now.AddDays(rules.RefundDays),
                CreatedByUserID = createdBy
            };
            _repo.AddPayment(refund);
            await _repo.SaveChangesAsync(cancellationToken);
            var left = remaining;
            foreach (var d in deposits)
            {
                if (left <= 0) break;
                var part = Math.Min(d.Amount, left);
                d.RefundedAmount = part;
                d.RefundPaymentID = refund.PaymentID;
                left -= part;
            }
            await _repo.SaveChangesAsync(cancellationToken);
        }

        // 4) Đánh dấu đã quyết toán (trigger kiểm đúng luồng: Awaiting -> Customer/Auto, Disputed -> Manager)
        await _repo.MarkSettledAsync(row.InspectionID, settledBy, now,
            respondedAt: settledBy == "Customer" ? now : null,
            resolvedByUserId: settledBy == "Manager" ? actorUserId : null,
            resolutionNotes: settledBy == "Manager" ? notes : null,
            cancellationToken);

        var finalTotal = lines.Sum(l => l.Final);
        var head = settledBy switch
        {
            "Customer" => "Bạn đã đồng ý kết quả kiểm kho.",
            "Auto" => "Quá hạn xác nhận, hệ thống đã tự xác nhận kết quả kiểm kho.",
            _ => $"Đã giải quyết khiếu nại: phí chốt {Vnd(finalTotal)}đ (đề xuất {Vnd(lines.Sum(l => l.Fee.ProposedAmount))}đ)."
        };
        var tail = owed > 0
            ? $" Tiền cọc không đủ bù phí: còn {Vnd(owed)}đ cần đóng thêm trong {OwedDueDays} ngày."
            : remaining > 0
                ? $" Trừ vào cọc {Vnd(fromDeposit)}đ, hoàn {Vnd(remaining)}đ sau {rules.RefundDays} ngày."
                : $" Trừ vào cọc {Vnd(fromDeposit)}đ, tiền cọc đã dùng hết.";
        return new { message = head + tail, finalTotal, fromDeposit, owed, refundAmount = remaining };
    }

    private static Charge NewFee(Reservation r, ReturnInspectionFeeRow fee, string description, decimal amount, bool settled,
        DateTime today, DateTime now, int createdBy) => new()
    {
        ReservationID = r.ReservationID,
        ChargeType = "ExtraFee",
        Description = Trim(description, 255),
        Amount = amount,
        DueDate = settled ? today : today.AddDays(OwedDueDays),
        Status = settled ? "Paid" : "Unpaid",
        PaidAt = settled ? now : null,
        SettledFromDeposit = settled,
        FeePolicyID = fee.FeePolicyID,
        CreatedAt = now,
        CreatedByUserID = createdBy
    };

    /* Quá hạn mà khách chưa trả lời -> tự xác nhận. Mỗi kết quả 1 transaction riêng; lỗi 1 cái không chặn cái khác. */
    private async Task<int> ProcessOverdueAsync(int? customerId, IReadOnlyCollection<int>? facilityIds, CancellationToken cancellationToken)
    {
        var count = 0;
        List<int> ids;
        try
        {
            ids = await _repo.GetOverdueAwaitingIdsAsync(customerId, facilityIds, DateTime.UtcNow, cancellationToken);
        }
        catch (DbException exception)
        {
            _logger.LogWarning(exception, "Không đọc được kết quả kiểm kho quá hạn (đã chạy 20261109_KiemKhoXacNhan.sql chưa?)");
            return 0;
        }

        foreach (var id in ids)
        {
            try
            {
                await using var transaction = await _repo.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
                var row = await _repo.LockAsync(id, cancellationToken);
                if (row is null || row.Status != Awaiting || row.ConfirmDeadline > DateTime.UtcNow) continue;
                await SettleAsync(row, "Auto", actorUserId: null, finals: null, notes: null, cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                count++;
            }
            catch (Exception exception) when (exception is DbException or DbUpdateException or InvalidOperationException)
            {
                _repo.ClearTracking();
                _logger.LogWarning(exception, "Tự xác nhận kết quả kiểm kho thất bại ({InspectionId})", id);
            }
        }
        return count;
    }

    /* =====================================================================
       DTO
       ===================================================================== */

    private static object ToDto(ReturnInspectionRow r, bool forCustomer, bool includeImages)
    {
        var now = DateTime.UtcNow;
        var proposedTotal = r.Fees.Sum(f => f.ProposedAmount);
        var finalTotal = r.Fees.Sum(f => f.FinalAmount ?? f.ProposedAmount);
        return new
        {
            inspectionId = r.InspectionID,
            reservationId = r.ReservationID,
            reservationCode = r.ReservationCode,
            contractNumber = r.ContractNumber,
            facilityId = r.FacilityID,
            facilityName = r.FacilityName,
            units = r.Units,
            unitDetails = r.UnitDetails,
            startDate = r.StartDate,
            endDate = r.EndDate,
            depositPaid = r.DepositPaid,
            customerName = forCustomer ? null : r.CustomerName,
            customerEmail = forCustomer ? null : r.CustomerEmail,
            customerPhone = forCustomer ? null : r.CustomerPhone,
            status = r.Status,
            settledBy = r.SettledBy,
            statusLabel = StatusLabel(r),
            conditionResult = r.ConditionResult,
            staffNotes = r.StaffNotes,
            inspectedBy = r.InspectedByName,
            inspectedAt = r.InspectedAt,
            confirmDeadline = r.Status == Settled && r.SettledBy == "NoFee" ? (DateTime?)null : r.ConfirmDeadline,
            hoursLeft = r.Status == Awaiting ? Math.Max(0, (int)Math.Ceiling((r.ConfirmDeadline - now).TotalHours)) : 0,
            canRespond = r.Status == Awaiting && now <= r.ConfirmDeadline,
            canManagerApprove = r.Status == PendingManager,
            canManagerResolve = r.Status == Disputed,
            depositRemaining = r.DepositRemaining,
            fees = r.Fees.Select(f => new
            {
                feeId = f.FeeID,
                feeCode = f.FeeCode,
                description = f.Description,
                proposedAmount = f.ProposedAmount,
                finalAmount = f.FinalAmount
            }),
            proposedTotal,
            finalTotal,
            // Xem trước quyết toán (đã quyết toán thì đây là số thực tế)
            expectedDeduct = Math.Min(r.DepositRemaining, finalTotal),
            expectedOwed = Math.Max(0, finalTotal - r.DepositRemaining),
            expectedRefund = Math.Max(0, r.DepositRemaining - finalTotal),
            disputeReason = r.DisputeReason,
            respondedAt = r.RespondedAt,
            resolvedBy = r.ResolvedByName,
            resolvedAt = r.ResolvedAt,
            resolutionNotes = r.ResolutionNotes,
            settledAt = r.SettledAt,
            staffImageCount = r.StaffImageCount,
            customerImageCount = r.CustomerImageCount,
            staffImages = includeImages ? ParseImages(r.StaffImages) : null,
            customerImages = includeImages ? ParseImages(r.CustomerImages) : null
        };
    }

    private static string StatusLabel(ReturnInspectionRow r) => r.Status switch
    {
        PendingManager => "Chờ Manager duyệt",
        Awaiting => "Chờ khách xác nhận",
        Disputed => "Khách khiếu nại · chờ Manager",
        _ => r.SettledBy switch
        {
            "NoFee" => "Không phát sinh phí kiểm kho",
            "Customer" => "Khách đã đồng ý",
            "Auto" => "Tự xác nhận (quá hạn)",
            "Manager" => "Manager đã duyệt & quyết toán",
            _ => "Đã quyết toán"
        }
    };

    private static string AlreadyHandledMessage(ReturnInspectionRow r) => r.Status switch
    {
        PendingManager => "Kết quả kiểm kho đang chờ Facility Manager phê duyệt.",
        Disputed => "Kết quả này đang được Facility Manager giải quyết khiếu nại.",
        Settled => $"Kết quả kiểm kho đã được quyết toán ({StatusLabel(r).ToLowerInvariant()}).",
        _ => "Kết quả kiểm kho đang chờ khách xác nhận."
    };

    /* =====================================================================
       Helpers
       ===================================================================== */

    private async Task<Rules> ReadRulesAsync(CancellationToken cancellationToken)
    {
        var rules = new Rules(7, 3);
        try
        {
            var result = await _policies.GetPolicyGroupsAsync(cancellationToken);
            if (!result.IsSuccess || result.Data is null) return rules;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(result.Data));
            if (!doc.RootElement.TryGetProperty("current", out var current) || !current.TryGetProperty("renewal_return", out var policy)) return rules;
            var value = policy.TryGetProperty("value", out var v) ? v : policy.TryGetProperty("config", out var c) ? c : default;
            if (value.ValueKind != JsonValueKind.Object) return rules;
            return new Rules(
                Math.Clamp(ReadInt(value, "depositRefundWorkingDays", 7), 0, 60),
                Math.Clamp(ReadInt(value, "inspectionConfirmDays", 3), 1, 14));
        }
        catch (Exception exception)
        {
            _logger.LogWarning(exception, "Không đọc được chính sách trả kho, dùng mặc định.");
            return rules;
        }
    }

    private static int ReadInt(JsonElement obj, string name, int fallback)
    {
        if (!obj.TryGetProperty(name, out var el)) return fallback;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return (int)d;
        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var s)) return (int)s;
        return fallback;
    }

    private async Task<(User? User, ReturnInspectionResponse? Fail)> AuthorizeRoleAsync(string? userEmail, int roleId, string message,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userEmail)) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        var user = await _repo.GetActiveUserByEmailAsync(userEmail, cancellationToken);
        if (user is null) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        if (user.RoleID != roleId) return (null, Fail(403, message));
        return (user, null);
    }

    /* Facility Manager của đúng cơ sở, hoặc BOM (quản lý vận hành toàn chuỗi). */
    private async Task<(User? User, ReturnInspectionResponse? Fail)> AuthorizeFacilityManagerAsync(string? userEmail, int facilityId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(userEmail)) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        var user = await _repo.GetActiveUserByEmailAsync(userEmail, cancellationToken);
        if (user is null) return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));
        if (user.RoleID == BusinessOperationsRoleId) return (user, null);
        if (user.RoleID == ManagerRoleId && await _repo.IsManagerOfFacilityAsync(user.UserID, facilityId, cancellationToken)) return (user, null);
        return (null, Fail(403, "Chỉ Facility Manager của cơ sở này mới xem và giải quyết khiếu nại kiểm kho."));
    }

    private static List<string> CleanImages(IEnumerable<string>? images)
        => (images ?? Enumerable.Empty<string>()).Where(i => !string.IsNullOrWhiteSpace(i)).Select(i => i.Trim()).ToList();

    private static bool IsValidImage(string image)
        => image.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) && image.Length <= MaxImageLength;

    private static List<string> ParseImages(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>(); }
        catch (JsonException) { return new List<string>(); }
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var t = value.Trim();
        return t.Length > max ? t[..max] : t;
    }

    private static string Vnd(decimal value) => value.ToString("N0", CultureInfo.GetCultureInfo("vi-VN"));
    private static string VnTime(DateTime utc) => utc.AddHours(7).ToString("HH:mm dd/MM/yyyy", CultureInfo.InvariantCulture);

    // Lỗi trigger dạng "KEY: thông báo" -> lấy phần thông báo; lỗi khác -> câu mặc định
    private static string ReadDatabaseMessage(Exception exception, string fallback)
    {
        var text = exception.InnerException?.Message ?? exception.Message;
        var colon = text.IndexOf(':');
        var key = colon > 0 ? text[..colon] : "";
        return colon > 0 && colon < 60 && key.All(ch => char.IsUpper(ch) || ch == '_') ? text[(colon + 1)..].Trim() : fallback;
    }

    private static ReturnInspectionResponse Ok(object data) => new(true, null, 200, data);
    private static ReturnInspectionResponse Fail(int status, string message) => new(false, message, status, null);
}
