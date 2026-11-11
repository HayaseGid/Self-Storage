using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class StaffToolsService : IStaffToolsService
{
    private const int CustomerRoleId = 1;
    private const int StaffRoleId = 2;
    private const int ManagerRoleId = 3;
    private const int BusinessOperationsRoleId = 4;

    // Trạng thái kho Staff được tự đổi (khớp CHECK CK_StorageUnit_Status).
    // "In Use" do bàn giao đặt, "Inactive" do Manager quyết định nên Staff không đổi.
    private static readonly string[] StaffEditableUnitStatuses =
    {
        UnitStatus.Available,
        UnitStatus.PendingInspection,
        UnitStatus.Maintenance
    };

    private readonly IStaffToolsRepository _repo;
    private readonly IHandoverService _handoverService; // dùng lại logic bàn giao có sẵn, không viết lại

    public StaffToolsService(IStaffToolsRepository repo, IHandoverService handoverService)
    {
        _repo = repo;
        _handoverService = handoverService;
    }

    /* =====================================================================
       1. XÁC NHẬN ĐƠN ĐÃ CỌC: Paid -> Confirmed + tạo hợp đồng
       Thay cho bước "Manager duyệt" đã bỏ. HandoverService chỉ cho bàn giao
       đơn Confirmed, nên đơn phải qua bước này trước khi Staff bàn giao.
       ===================================================================== */
    public async Task<StaffToolsResponse> ConfirmPaidReservationAsync(int reservationId, string? userEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserAsync(userEmail, cancellationToken);
        if (user is null)
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        var reservation = await _repo.GetReservationForConfirmAsync(reservationId, cancellationToken);
        if (reservation is null)
            return Fail(404, "Không tìm thấy đơn đặt kho.");

        // Ai được xác nhận: Staff / Manager của cơ sở, BOM, hoặc chính khách của đơn
        var allowed = user.RoleID switch
        {
            BusinessOperationsRoleId => true,
            ManagerRoleId => await _repo.IsManagerOfFacilityAsync(user.UserID, reservation.FacilityID, cancellationToken),
            StaffRoleId => await _repo.IsActiveStaffOfFacilityAsync(user.UserID, reservation.FacilityID, cancellationToken),
            CustomerRoleId => reservation.CustomerID == user.UserID,
            _ => false
        };
        if (!allowed)
            return Fail(403, "Bạn không có quyền xác nhận đơn của cơ sở này.");

        // Gọi lại nhiều lần vẫn an toàn (idempotent): đơn đã Confirmed thì trả về luôn
        if (reservation.Status == ReservationStatus.Confirmed)
            return Ok(BuildConfirmResult(reservation, reservation.Contract, alreadyConfirmed: true));

        if (reservation.Status == ReservationStatus.HandedOver || reservation.Status == ReservationStatus.Completed)
            return Fail(409, "Đơn đã được bàn giao, không cần xác nhận nữa.");

        if (reservation.Status != ReservationStatus.Paid)
            return Fail(409, "Chỉ xác nhận được đơn đã thanh toán cọc (trạng thái Paid).");

        // Tiền phải do hệ thống ghi nhận, không dựa vào trình duyệt
        var paymentCompleted = reservation.Payments.Any(p => p.Status == "Completed" && p.Direction == "Collection");
        if (!paymentCompleted)
            return Fail(409, "Hệ thống chưa ghi nhận thanh toán thành công cho đơn này.");

        // Mỗi dòng yêu cầu phải đủ số kho đã giữ (trigger TR_Reservation_Update cũng kiểm tra lại)
        var missingUnits = reservation.ReservationItems.Any(item =>
            item.Quantity != reservation.ReservationUnits.Count(ru =>
                ru.ReservationItemID == item.ReservationItemID && ru.Status != "Released"));
        if (missingUnits)
            return Fail(409, "Đơn chưa được giữ đủ kho. Báo Facility Manager phân kho trước khi xác nhận.");

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user.UserID, "StaffTools.ConfirmPaidReservation", cancellationToken);

                var now = DateTime.UtcNow;
                reservation.Status = ReservationStatus.Confirmed;
                reservation.ConfirmedAt = now;
                reservation.ConfirmedByUserID = user.UserID;
                await _repo.SaveChangesAsync(cancellationToken);

                // Trigger TR_Contract_Insert chỉ cho tạo hợp đồng khi đơn đã Confirmed -> tạo SAU khi lưu trạng thái
                var contract = reservation.Contract;
                if (contract is null)
                {
                    contract = new Contract
                    {
                        ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}", // cùng định dạng với code hiện có
                        ReservationID = reservation.ReservationID,
                        StartDate = reservation.StartDate,
                        EndDate = reservation.EndDate,
                        ContractStatus = "Active",
                        CreatedAt = now,
                        CreatedByUserID = user.UserID
                    };
                    _repo.AddContract(contract);
                    await _repo.SaveChangesAsync(cancellationToken);
                }

                return Ok(BuildConfirmResult(reservation, contract, alreadyConfirmed: false));
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không xác nhận được đơn. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       2. STAFF XEM CÔNG VIỆC ĐƯỢC GIAO (HandoverTask)
       ===================================================================== */
    public async Task<StaffToolsResponse> GetMyTasksAsync(int? facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserAsync(userEmail, cancellationToken);
        if (user is null)
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        if (user.RoleID != StaffRoleId)
            return Fail(403, "Chỉ Facility Staff mới xem được danh sách việc được giao.");

        if (facilityId.HasValue && !await _repo.IsActiveStaffOfFacilityAsync(user.UserID, facilityId.Value, cancellationToken))
            return Fail(403, "Bạn không làm việc tại cơ sở này.");

        var tasks = await _repo.GetTasksForStaffAsync(user.UserID, facilityId, cancellationToken);

        var data = tasks.Select(t => new
        {
            taskId = t.TaskID,
            taskType = t.TaskType,
            status = t.Status,
            facilityId = t.FacilityID,
            facilityName = t.Facility.FacilityName,
            unitId = t.UnitID,
            unitNumber = t.Unit.UnitNumber,
            reservationId = t.ReservationID,
            reservationCode = t.Reservation?.ReservationCode,
            customerName = t.Reservation?.Customer?.FullName,
            // Liên hệ khách để nhân viên chủ động gọi trước / bàn thêm về lịch nhận kho (4.1)
            customerPhone = t.Reservation?.Customer?.PhoneNumber,
            customerEmail = t.Reservation?.Customer?.Email,
            handoverMethod = t.Reservation?.HandoverMethod,
            scheduledDate = t.ScheduledDate?.ToString("yyyy-MM-dd"),
            scheduledTime = t.ScheduledTime?.ToString(@"hh\:mm"),
            scheduledSlot = StaffAssignmentPolicy.SlotLabel(t.ScheduledTime),
            actualAt = t.ActualAt,
            notes = t.UnitConditionNotes,
            conditionResult = t.ConditionResult,
            createdAt = t.CreatedAt // [THÊM] để tô sáng việc mới được giao
        }).ToList();

        return Ok(data);
    }

    /* =====================================================================
       3. STAFF ĐỔI TRẠNG THÁI KHO
       Chỉ đổi giữa Available / Pending Inspection / Maintenance, kho thuộc cơ sở mình,
       và không đụng kho đang được giữ hoặc đang thuê.
       ===================================================================== */
    public async Task<StaffToolsResponse> UpdateUnitStatusAsync(int unitId, string? newStatus, string? userEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserAsync(userEmail, cancellationToken);
        if (user is null)
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        var target = NormalizeUnitStatus(newStatus);
        if (target is null)
            return Fail(400, "Trạng thái mới chỉ được là Còn trống, Chờ kiểm tra hoặc Bảo trì.");

        var unit = await _repo.GetUnitAsync(unitId, cancellationToken);
        if (unit is null)
            return Fail(404, "Không tìm thấy kho.");

        var allowed = user.RoleID switch
        {
            StaffRoleId => await _repo.IsActiveStaffOfFacilityAsync(user.UserID, unit.FacilityID, cancellationToken),
            ManagerRoleId => await _repo.IsManagerOfFacilityAsync(user.UserID, unit.FacilityID, cancellationToken),
            _ => false
        };
        if (!allowed)
            return Fail(403, "Bạn chỉ được đổi trạng thái kho tại cơ sở mình làm việc.");

        if (!StaffEditableUnitStatuses.Contains(unit.Status))
        {
            var reason = unit.Status == UnitStatus.InUse
                ? $"Kho {unit.UnitNumber} đang cho thuê nên không đổi trạng thái được."
                : $"Kho {unit.UnitNumber} đang ở trạng thái \"{unit.Status}\", chỉ Facility Manager mới đổi được.";
            return Fail(409, reason);
        }

        // Kho đang được kiểm tra trong luồng trả kho: kết quả phải nhập ở mục "Trả kho & kiểm kho" để quyết toán cọc
        if (await _repo.HasMoveOutInProgressAsync(unit.UnitID, cancellationToken))
            return Fail(409, $"Kho {unit.UnitNumber} đang trong quy trình trả kho. Hãy nhập kết quả kiểm tra ở mục \"Trả kho & kiểm kho\".");

        var oldStatus = unit.Status;
        if (oldStatus == target)
            return Ok(new { unitId = unit.UnitID, unitNumber = unit.UnitNumber, oldStatus, newStatus = target, changed = false });

        // Kho đang có đơn giữ chỗ thì không chuyển sang Bảo trì / Chờ kiểm tra (khách đã đặt kho này)
        if (target != UnitStatus.Available && await _repo.HasActiveReservationOnUnitAsync(unit.UnitID, cancellationToken))
            return Fail(409, $"Kho {unit.UnitNumber} đang có đơn giữ chỗ. Báo Facility Manager đổi kho cho khách trước.");

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user.UserID, "StaffTools.UpdateUnitStatus", cancellationToken);

                unit.Status = target;
                unit.UpdatedAt = DateTime.UtcNow;
                unit.UpdatedByUserID = user.UserID;
                await _repo.SaveChangesAsync(cancellationToken);

                return Ok(new { unitId = unit.UnitID, unitNumber = unit.UnitNumber, oldStatus, newStatus = target, changed = true });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không đổi được trạng thái kho. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       4. BÀN GIAO KHO
       Toàn bộ điều kiện bàn giao (đúng người được phân công, đã ký hợp đồng, đã tới ngày
       bắt đầu thuê, kho không bị người khác dùng...) nằm DUY NHẤT trong HandoverService,
       để không có API nào bàn giao mà bỏ qua quy tắc. Ở đây chỉ chuyển tiếp kết quả.
       ===================================================================== */
    public async Task<StaffToolsResponse> HandoverAssignedAsync(CompleteHandoverDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _handoverService.CompleteHandoverAsync(request, userEmail, cancellationToken);
            return result.IsSuccess
                ? new StaffToolsResponse(true, null, 200, result.Data)
                : new StaffToolsResponse(false, result.ErrorMessage ?? "Không bàn giao được.", result.StatusCode, null);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không bàn giao được. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       5. BÁO CÁO SỰ CỐ KHO
       Staff phát hiện tình trạng kho -> ghi thành việc "Inspection" đã hoàn thành do chính Staff làm
       (cột UnitConditionNotes / ConditionResult / EvidenceImages có sẵn trong HandoverTask).
         - Damaged: kho trống (Available / Pending Inspection) -> chuyển Maintenance để không ai đặt được.
                    Kho đang có khách giữ / đang thuê -> giữ nguyên, Manager xử lý.
         - Good:    kho đang Pending Inspection / Maintenance (đã sửa xong) -> mở lại Available.
       ===================================================================== */
    private const int MaxEvidenceImages = 3;
    private const int MaxImageLength = 1_500_000; // ~1,1 MB ảnh sau khi FE nén

    public async Task<StaffToolsResponse> ReportUnitAsync(UnitReportDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        var user = await GetUserAsync(userEmail, cancellationToken);
        if (user is null)
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        var result = (request.Result ?? string.Empty).Trim().ToUpperInvariant() switch
        {
            "GOOD" => "Good",
            "DAMAGED" => "Damaged",
            _ => null
        };
        if (result is null)
            return Fail(400, "Kết quả kiểm tra chỉ được là Tốt (Good) hoặc Hư hỏng (Damaged).");

        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (result == "Damaged" && notes is null)
            return Fail(400, "Vui lòng mô tả tình trạng hư hỏng.");
        if (notes is { Length: > 1000 })
            return Fail(400, "Ghi chú tối đa 1000 ký tự.");

        var images = (request.EvidenceImages ?? new List<string>()).Where(i => !string.IsNullOrWhiteSpace(i)).ToList();
        if (images.Count > MaxEvidenceImages)
            return Fail(400, $"Tối đa {MaxEvidenceImages} ảnh cho một báo cáo.");
        if (images.Any(i => !i.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || i.Length > MaxImageLength))
            return Fail(400, "Ảnh không hợp lệ hoặc quá lớn (mỗi ảnh tối đa khoảng 1 MB).");

        var unit = await _repo.GetUnitAsync(request.UnitId, cancellationToken);
        if (unit is null)
            return Fail(404, "Không tìm thấy kho.");

        // DB (TR_HandoverTask_Validate) bắt buộc người làm việc phải là nhân viên Active của cơ sở
        if (user.RoleID != StaffRoleId || !await _repo.IsActiveStaffOfFacilityAsync(user.UserID, unit.FacilityID, cancellationToken))
            return Fail(403, "Chỉ nhân viên đang làm việc tại cơ sở mới được báo cáo tình trạng kho.");

        if (await _repo.HasMoveOutInProgressAsync(unit.UnitID, cancellationToken))
            return Fail(409, $"Kho {unit.UnitNumber} đang trong quy trình trả kho. Hãy nhập kết quả kiểm tra ở mục \"Trả kho & kiểm kho\".");

        var oldStatus = unit.Status;
        var newStatus = oldStatus;
        string? warning = null;
        if (result == "Damaged")
        {
            if (oldStatus == UnitStatus.Available || oldStatus == UnitStatus.PendingInspection)
            {
                if (await _repo.HasActiveReservationOnUnitAsync(unit.UnitID, cancellationToken))
                    warning = "Kho đang có đơn giữ chỗ nên chưa chuyển sang Bảo trì. Facility Manager cần xử lý đổi kho cho khách.";
                else
                    newStatus = UnitStatus.Maintenance;
            }
            else if (oldStatus == UnitStatus.InUse)
            {
                warning = "Kho đang cho thuê nên giữ nguyên trạng thái. Facility Manager sẽ liên hệ khách để xử lý.";
            }
        }
        else if (oldStatus == UnitStatus.PendingInspection || oldStatus == UnitStatus.Maintenance)
        {
            newStatus = UnitStatus.Available;
        }

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user.UserID, "StaffTools.ReportUnit", cancellationToken);
                var now = DateTime.UtcNow;
                var task = new HandoverTask
                {
                    TaskType = "Inspection",
                    FacilityID = unit.FacilityID,
                    UnitID = unit.UnitID,
                    AssignedStaffID = user.UserID,
                    AssignedByID = user.UserID, // nhân viên tự phát hiện và báo cáo
                    ScheduledDate = BusinessClock.Today,
                    ActualAt = now,
                    UnitConditionNotes = notes,
                    ConditionResult = result,
                    EvidenceImages = images.Count > 0 ? System.Text.Json.JsonSerializer.Serialize(images) : null,
                    Status = "Completed",
                    CreatedAt = now
                };
                _repo.AddTask(task);

                if (newStatus != oldStatus)
                {
                    unit.Status = newStatus;
                    unit.UpdatedAt = now;
                    unit.UpdatedByUserID = user.UserID;
                }

                await _repo.SaveChangesAsync(cancellationToken);

                var statusText = newStatus == oldStatus
                    ? "Trạng thái kho giữ nguyên."
                    : newStatus == UnitStatus.Maintenance ? "Kho đã chuyển sang Bảo trì." : "Kho đã mở lại (Còn trống).";
                return Ok(new
                {
                    taskId = task.TaskID,
                    unitId = unit.UnitID,
                    unitNumber = unit.UnitNumber,
                    result,
                    oldStatus,
                    newStatus,
                    warning,
                    message = $"Đã ghi báo cáo kho {unit.UnitNumber}. {statusText}"
                });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không ghi được báo cáo. Vui lòng tải lại và thử lại."));
        }
    }

    /* ---------- helpers ---------- */

    private async Task<User?> GetUserAsync(string? email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return null;
        return await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
    }

    private static string? NormalizeUnitStatus(string? status)
    {
        var key = (status ?? string.Empty).Trim().Replace('_', ' ').ToUpperInvariant();
        return key switch
        {
            "AVAILABLE" => UnitStatus.Available,
            "PENDING INSPECTION" or "NEEDS INSPECTION" => UnitStatus.PendingInspection,
            "MAINTENANCE" => UnitStatus.Maintenance,
            _ => null
        };
    }

    private static object BuildConfirmResult(Reservation reservation, Contract? contract, bool alreadyConfirmed) => new
    {
        reservationId = reservation.ReservationID,
        reservationCode = reservation.ReservationCode,
        status = reservation.Status,
        contractId = contract?.ContractID,
        contractNumber = contract?.ContractNumber,
        alreadyConfirmed,
        message = alreadyConfirmed
            ? "Đơn đã được xác nhận trước đó."
            : "Đã xác nhận đơn và tạo hợp đồng. Khách ký hợp đồng xong, tới ngày bắt đầu thuê là có thể bàn giao."
    };

    // Trigger SQL ném lỗi dạng "MA_LOI: câu tiếng Việt" -> lấy phần câu tiếng Việt để FE hiển thị
    private static string ReadDatabaseMessage(DbUpdateException ex, string fallback)
    {
        var message = ex.InnerException?.Message;
        if (string.IsNullOrWhiteSpace(message))
            return fallback;
        var colon = message.IndexOf(':');
        var text = colon >= 0 ? message[(colon + 1)..].Trim() : message.Trim();
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private static StaffToolsResponse Ok(object data) => new(true, null, 200, data);

    private static StaffToolsResponse Fail(int statusCode, string message) => new(false, message, statusCode, null);
}
