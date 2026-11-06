using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class ManagerToolsService : IManagerToolsService
{
    private const int ManagerRoleId = 3;
    private const int BusinessOperationsRoleId = 4;

    private const string MoveIn = "Move In";
    private const string MoveOut = "Move Out";
    private const string Inspection = "Inspection";

    // Khớp CHECK CK_Charge_Type trong DB
    private static readonly string[] ChargeTypes = { "Deposit", "Rent", "Renewal", "LateFee", "ExtraFee" };

    private readonly IManagerToolsRepository _repo;

    public ManagerToolsService(IManagerToolsRepository repo)
    {
        _repo = repo;
    }

    /* =====================================================================
       1. BÁO CÁO CƠ SỞ: tiền thực thu (Payment Completed), khoản phí, đơn, kho
       ===================================================================== */
    public async Task<ManagerToolsResponse> GetReportsAsync(int facilityId, int months, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        months = Math.Clamp(months, 1, 12);
        var today = DateTime.UtcNow.Date;
        var firstMonth = new DateTime(today.Year, today.Month, 1).AddMonths(-(months - 1));

        var payments = await _repo.GetCompletedPaymentsAsync(facilityId, cancellationToken);
        var charges = await _repo.GetChargesAsync(facilityId, cancellationToken);
        var reservationCounts = await _repo.CountReservationsByStatusAsync(facilityId, cancellationToken);
        var unitCounts = await _repo.CountUnitsByStatusAsync(facilityId, cancellationToken);

        // Tiền thu (Collection) trừ tiền hoàn (Refund) theo tháng xác nhận
        static DateTime MonthOf(Payment p)
        {
            var at = p.ConfirmedAt ?? p.CreatedAt;
            return new DateTime(at.Year, at.Month, 1);
        }

        var monthly = Enumerable.Range(0, months)
            .Select(i => firstMonth.AddMonths(i))
            .Select(month =>
            {
                var inMonth = payments.Where(p => MonthOf(p) == month).ToList();
                var collected = inMonth.Where(p => p.Direction == "Collection").Sum(p => p.Amount);
                var refunded = inMonth.Where(p => p.Direction == "Refund").Sum(p => p.Amount);
                return new
                {
                    month = month.ToString("yyyy-MM"),
                    collected,
                    refunded,
                    net = collected - refunded,
                    payments = inMonth.Count(p => p.Direction == "Collection")
                };
            })
            .ToList();

        var totalCollected = payments.Where(p => p.Direction == "Collection").Sum(p => p.Amount);
        var totalRefunded = payments.Where(p => p.Direction == "Refund").Sum(p => p.Amount);

        var chargeSummary = ChargeTypes.Select(type =>
        {
            var ofType = charges.Where(c => c.ChargeType == type).ToList();
            return new
            {
                chargeType = type,
                paid = ofType.Where(c => c.Status == "Paid").Sum(c => c.Amount),
                unpaid = ofType.Where(c => c.Status == "Unpaid").Sum(c => c.Amount),
                waived = ofType.Where(c => c.Status == "Waived").Sum(c => c.Amount),
                refunded = ofType.Sum(c => c.RefundedAmount),
                count = ofType.Count(c => c.Status != "Cancelled")
            };
        }).ToList();

        var overdue = charges.Where(c => c.Status == "Unpaid" && c.DueDate.Date < today).ToList();

        var totalUnits = unitCounts.Values.Sum();
        var inactiveUnits = unitCounts.GetValueOrDefault(UnitStatus.Inactive);
        var inUseUnits = unitCounts.GetValueOrDefault(UnitStatus.InUse);
        var operatingUnits = totalUnits - inactiveUnits;

        return Ok(new
        {
            facilityId,
            generatedAt = DateTime.UtcNow,
            months,
            revenue = new
            {
                totalCollected,
                totalRefunded,
                net = totalCollected - totalRefunded,
                inRange = new
                {
                    collected = monthly.Sum(m => m.collected),
                    refunded = monthly.Sum(m => m.refunded),
                    net = monthly.Sum(m => m.net)
                },
                monthly
            },
            charges = chargeSummary,
            overdueCharges = new { count = overdue.Count, amount = overdue.Sum(c => c.Amount) },
            depositHeld = charges.Where(c => c.ChargeType == "Deposit" && c.Status == "Paid").Sum(c => c.Amount - c.RefundedAmount),
            reservations = reservationCounts,
            units = new
            {
                total = totalUnits,
                byStatus = unitCounts,
                occupancyRate = operatingUnits > 0 ? Math.Round(inUseUnits * 100m / operatingUnits, 1) : 0m
            }
        });
    }

    /* =====================================================================
       2. GỠ NHÂN VIÊN KHỎI CƠ SỞ (đặt Inactive, không xóa để giữ lịch sử)
       ===================================================================== */
    public async Task<ManagerToolsResponse> RemoveStaffAsync(int facilityId, int staffUserId, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var assignment = await _repo.GetFacilityStaffAsync(facilityId, staffUserId, cancellationToken);
        if (assignment is null || assignment.Status != "Active")
            return Fail(404, "Nhân viên này không đang làm việc tại cơ sở.");

        var openTasks = await _repo.CountOpenTasksAsync(facilityId, staffUserId, cancellationToken);
        if (openTasks > 0)
            return Fail(409, $"{assignment.User.FullName} còn {openTasks} việc chưa hoàn thành. Hãy giao lại hoặc hủy các việc đó trước khi gỡ.");

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user!.UserID, "ManagerTools.RemoveStaff", cancellationToken);
                assignment.Status = "Inactive";
                await _repo.SaveChangesAsync(cancellationToken);
                return Ok(new
                {
                    facilityId,
                    userId = staffUserId,
                    fullName = assignment.User.FullName,
                    status = assignment.Status,
                    message = $"Đã gỡ {assignment.User.FullName} khỏi cơ sở."
                });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không gỡ được nhân viên. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       3a. DANH SÁCH VIỆC TẠI CƠ SỞ
       ===================================================================== */
    public async Task<ManagerToolsResponse> GetFacilityTasksAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var tasks = await _repo.GetFacilityTasksAsync(facilityId, cancellationToken);
        var data = tasks.Select(t => new
        {
            taskId = t.TaskID,
            taskType = t.TaskType,
            status = t.Status,
            unitId = t.UnitID,
            unitNumber = t.Unit.UnitNumber,
            reservationId = t.ReservationID,
            reservationCode = t.Reservation?.ReservationCode,
            customerName = t.Reservation?.Customer?.FullName,
            staffUserId = t.AssignedStaffID,
            staffName = t.AssignedStaff.FullName,
            scheduledDate = t.ScheduledDate?.ToString("yyyy-MM-dd"),
            scheduledTime = t.ScheduledTime?.ToString(@"hh\:mm"),
            actualAt = t.ActualAt,
            notes = t.UnitConditionNotes
        }).ToList();

        return Ok(data);
    }

    /* =====================================================================
       3b. GIAO VIỆC CHO NHÂN VIÊN
       Move In / Move Out: một task cho mỗi kho của đơn (DB chỉ cho 1 task nhận / trả cho mỗi kho,
       nên kho đã có task thì đổi người nhận thay vì tạo mới).
       Inspection: một task cho một kho.
       Khi Staff bàn giao, HandoverService tự chuyển task Move In tương ứng sang Completed.
       ===================================================================== */
    public async Task<ManagerToolsResponse> AssignTaskAsync(int facilityId, AssignTaskDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var taskType = NormalizeTaskType(request.TaskType);
        if (taskType is null)
            return Fail(400, "Loại việc chỉ được là Nhận kho (Move In), Trả kho (Move Out) hoặc Kiểm tra kho (Inspection).");

        if (request.StaffUserId <= 0 || !await _repo.IsActiveStaffOfFacilityAsync(request.StaffUserId, facilityId, cancellationToken))
            return Fail(400, "Nhân viên được chọn không đang làm việc tại cơ sở này.");

        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (notes is { Length: > 1000 })
            return Fail(400, "Ghi chú tối đa 1000 ký tự.");

        TimeSpan? requestedTime = null;
        if (!string.IsNullOrWhiteSpace(request.ScheduledTime))
        {
            if (!TimeSpan.TryParse(request.ScheduledTime, out var parsed) || parsed < TimeSpan.Zero || parsed >= TimeSpan.FromDays(1))
                return Fail(400, "Giờ hẹn không hợp lệ (định dạng HH:mm).");
            requestedTime = parsed;
        }

        var today = BusinessClock.Today;
        if (request.ScheduledDate.HasValue && request.ScheduledDate.Value.Date < today)
            return Fail(400, "Ngày hẹn không được ở quá khứ.");

        try
        {
            // Kiểm tra kho do Staff tự phát hiện và báo cáo (POST /api/staff-tools/unit-reports), Manager không giao
            if (taskType == Inspection)
                return Fail(400, "Việc kiểm tra kho do nhân viên tự báo cáo khi phát hiện sự cố, Manager không giao việc này.");

            return await AssignReservationTaskAsync(facilityId, taskType, request, user!, requestedTime, notes, today, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không giao được việc. Vui lòng tải lại và thử lại."));
        }
    }

    private async Task<ManagerToolsResponse> AssignReservationTaskAsync(
        int facilityId, string taskType, AssignTaskDTO request, User user, TimeSpan? time, string? notes, DateTime today, CancellationToken cancellationToken)
    {
        if (request.ReservationId is null)
            return Fail(400, "Cần chọn đơn đặt kho cho việc nhận / trả kho.");

        var reservation = await _repo.GetReservationWithUnitsAsync(request.ReservationId.Value, cancellationToken);
        if (reservation is null || reservation.FacilityID != facilityId)
            return Fail(404, "Không tìm thấy đơn đặt kho tại cơ sở này.");

        string requiredUnitStatus;
        DateTime defaultDate;
        if (taskType == MoveIn)
        {
            if (reservation.Status != ReservationStatus.Paid && reservation.Status != ReservationStatus.Confirmed)
                return Fail(409, "Chỉ giao việc nhận kho cho đơn đã cọc và chưa bàn giao.");
            requiredUnitStatus = "Held";
            defaultDate = (reservation.AppointmentDate ?? reservation.StartDate).Date;
        }
        else
        {
            if (reservation.Status != ReservationStatus.HandedOver)
                return Fail(409, "Chỉ giao việc trả kho cho đơn đang thuê (đã bàn giao).");
            requiredUnitStatus = "Active";
            defaultDate = reservation.EndDate.Date;
        }

        var scheduledDate = request.ScheduledDate?.Date ?? (defaultDate < today ? today : defaultDate);
        var scheduledTime = time ?? (taskType == MoveIn ? reservation.AppointmentTime : null);

        var targets = reservation.ReservationUnits
            .Where(ru => ru.Status == requiredUnitStatus && (request.UnitId == null || ru.UnitID == request.UnitId))
            .ToList();
        if (targets.Count == 0)
            return Fail(409, "Đơn không có kho phù hợp để giao việc này.");

        return await _repo.ExecuteInTransactionAsync(async () =>
        {
            await _repo.SetAuditContextAsync(user.UserID, "ManagerTools.AssignTask", cancellationToken);

            var now = DateTime.UtcNow;
            var created = new List<HandoverTask>();
            var updated = new List<HandoverTask>();
            var skipped = new List<string>();

            foreach (var ru in targets)
            {
                var existing = reservation.HandoverTasks.FirstOrDefault(t =>
                    t.ReservationUnitID == ru.ReservationUnitID &&
                    t.TaskType == taskType &&
                    t.Status != "Cancelled");

                if (existing is not null)
                {
                    if (existing.Status == "Completed")
                    {
                        skipped.Add(ru.Unit.UnitNumber);
                        continue;
                    }
                    // Kho đã có việc: đổi người nhận / lịch hẹn
                    existing.AssignedStaffID = request.StaffUserId;
                    existing.AssignedByID = user.UserID;
                    existing.ScheduledDate = scheduledDate;
                    existing.ScheduledTime = scheduledTime;
                    if (notes is not null) existing.UnitConditionNotes = notes;
                    updated.Add(existing);
                    continue;
                }

                var task = new HandoverTask
                {
                    TaskType = taskType,
                    FacilityID = reservation.FacilityID,
                    UnitID = ru.UnitID,
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = reservation.ReservationID,
                    AssignedStaffID = request.StaffUserId,
                    AssignedByID = user.UserID,
                    ScheduledDate = scheduledDate,
                    ScheduledTime = scheduledTime,
                    UnitConditionNotes = notes,
                    Status = "Scheduled",
                    CreatedAt = now
                };
                _repo.AddTask(task);
                created.Add(task);
            }

            if (created.Count == 0 && updated.Count == 0)
                return Fail(409, "Các kho của đơn đã hoàn thành việc này rồi.");

            await _repo.SaveChangesAsync(cancellationToken);

            var label = taskType == MoveIn ? "nhận kho" : "trả kho";
            return Ok(new
            {
                createdTaskIds = created.Select(t => t.TaskID).ToArray(),
                updatedTaskIds = updated.Select(t => t.TaskID).ToArray(),
                skippedUnits = skipped,
                message = $"Đã giao việc {label} cho {created.Count + updated.Count} kho của đơn {reservation.ReservationCode}."
            });
        }, cancellationToken);
    }

    /* =====================================================================
       3c. HỦY VIỆC ĐÃ GIAO
       ===================================================================== */
    public async Task<ManagerToolsResponse> CancelTaskAsync(int taskId, string? userEmail, CancellationToken cancellationToken)
    {
        var task = await _repo.GetTaskAsync(taskId, cancellationToken);
        if (task is null)
            return Fail(404, "Không tìm thấy việc.");

        var (user, fail) = await AuthorizeAsync(userEmail, task.FacilityID, cancellationToken);
        if (fail is not null) return fail;

        if (task.Status == "Completed")
            return Fail(409, "Việc đã hoàn thành, không hủy được.");

        if (task.Status == "Cancelled")
            return Ok(new { taskId, status = task.Status, message = "Việc đã được hủy trước đó." });

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user!.UserID, "ManagerTools.CancelTask", cancellationToken);
                task.Status = "Cancelled";
                await _repo.SaveChangesAsync(cancellationToken);
                return Ok(new { taskId, status = task.Status, message = "Đã hủy việc." });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không hủy được việc. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       4. TỰ PHÂN CÔNG (gọi mỗi khi trang Manager / Staff tải dữ liệu)
       a) NHẬN KHO: đơn Paid / Confirmed còn kho "Held" chưa có việc Move In
          -> ngày hẹn = ngày hẹn của đơn (đã qua thì hôm nay), giờ = giờ hẹn của đơn.
       b) TRẢ KHO QUÁ HẠN: hợp đồng đã hết hạn, KHÔNG gia hạn, khách chưa báo trả
          -> tự tạo việc Move Out ngày hôm nay (không giờ cố định: nhân viên liên hệ khách),
             ưu tiên nhân viên đã bàn giao kho.
       Chọn người: StaffAssignmentPolicy (luật dùng chung với trả kho do khách đặt lịch).
       Cả đơn giao cho MỘT người. AssignedByID = null nghĩa là "hệ thống giao".
       Hai trang gọi cùng lúc cũng không tạo trùng vì DB có UX_HandoverTask_ReservationUnit_Type
       (mỗi kho chỉ 1 việc nhận kho và 1 việc trả kho chưa hủy).
       ===================================================================== */
    private sealed record AssignPlan(Reservation Reservation, string TaskType, DateTime Date, TimeSpan? Time, int? PreferredStaffId, List<ReservationUnit> Units);

    public async Task<ManagerToolsResponse> AutoAssignAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeMemberAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var today = BusinessClock.Today;
        var plans = new List<AssignPlan>();

        foreach (var r in await _repo.GetReservationsNeedingMoveInAsync(facilityId, cancellationToken))
        {
            var units = r.ReservationUnits
                .Where(ru => ru.Status == "Held" && !r.HandoverTasks.Any(t =>
                    t.ReservationUnitID == ru.ReservationUnitID && t.TaskType == MoveIn && t.Status != "Cancelled"))
                .ToList();
            if (units.Count == 0) continue;
            var date = (r.AppointmentDate ?? r.StartDate).Date;
            plans.Add(new AssignPlan(r, MoveIn, date < today ? today : date, r.AppointmentTime, null, units));
        }

        foreach (var r in await _repo.GetOverdueReservationsWithoutMoveOutAsync(facilityId, today, cancellationToken))
        {
            var units = r.ReservationUnits
                .Where(ru => ru.Status == "Active" && !r.HandoverTasks.Any(t =>
                    t.ReservationUnitID == ru.ReservationUnitID && t.TaskType == MoveOut && t.Status != "Cancelled"))
                .ToList();
            if (units.Count == 0) continue;
            // Ưu tiên người đã bàn giao kho (biết tình trạng kho lúc giao)
            var handedOverBy = r.HandoverTasks
                .Where(t => t.TaskType == MoveIn && t.Status == "Completed")
                .OrderByDescending(t => t.ActualAt)
                .Select(t => (int?)t.AssignedStaffID)
                .FirstOrDefault();
            plans.Add(new AssignPlan(r, MoveOut, today, null, handedOverBy, units));
        }

        if (plans.Count == 0)
            return Ok(new { assigned = Array.Empty<object>(), unassigned = Array.Empty<object>(), message = "Không có đơn nào cần phân công." });

        plans = plans
            .OrderBy(p => p.Date)
            .ThenBy(p => p.Time ?? TimeSpan.MaxValue)
            .ThenBy(p => p.Reservation.ReservationID)
            .ToList();

        var staff = await _repo.GetActiveStaffAsync(facilityId, cancellationToken);
        if (staff.Count == 0)
        {
            return Ok(new
            {
                assigned = Array.Empty<object>(),
                unassigned = plans.Select(p => DescribeUnassigned(p, "Cơ sở chưa có nhân viên đang làm việc.")).ToArray(),
                message = "Cơ sở chưa có nhân viên để phân công."
            });
        }

        var candidates = staff.Select(s => new StaffAssignmentPolicy.Candidate(s.UserID, s.FullName)).ToList();
        var from = StaffAssignmentPolicy.WeekStart(plans.Min(p => p.Date));
        var to = StaffAssignmentPolicy.WeekStart(plans.Max(p => p.Date)).AddDays(6);
        var existing = await _repo.GetStaffTasksInRangeAsync(candidates.Select(c => c.UserId).ToList(), from, to, cancellationToken);
        var slots = StaffAssignmentPolicy.ToSlots(existing);

        var now = DateTime.UtcNow;
        var assigned = new List<object>();
        var unassigned = new List<object>();
        var newTasks = 0;

        foreach (var plan in plans)
        {
            var r = plan.Reservation;
            var pick = StaffAssignmentPolicy.Pick(candidates, slots, plan.Date, plan.Time, plan.PreferredStaffId);
            if (pick is null)
            {
                unassigned.Add(DescribeUnassigned(plan, "Tất cả nhân viên đều có việc trùng giờ hẹn."));
                continue;
            }

            var note = plan.TaskType == MoveOut
                ? $"Hệ thống tạo: hợp đồng hết hạn ngày {r.EndDate:dd/MM/yyyy} nhưng khách chưa trả kho. Liên hệ khách để hẹn thu hồi kho."
                : null;

            foreach (var ru in plan.Units)
            {
                _repo.AddTask(new HandoverTask
                {
                    TaskType = plan.TaskType,
                    FacilityID = r.FacilityID,
                    UnitID = ru.UnitID,
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = r.ReservationID,
                    AssignedStaffID = pick.UserId,
                    AssignedByID = null, // hệ thống tự giao
                    ScheduledDate = plan.Date,
                    ScheduledTime = plan.Time,
                    UnitConditionNotes = note,
                    Status = "Scheduled",
                    CreatedAt = now
                });
                newTasks++;
            }

            slots.Add(new StaffAssignmentPolicy.Slot(pick.UserId, plan.Date, plan.Time, $"R{r.ReservationID}"));
            assigned.Add(new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                taskType = plan.TaskType,
                staffUserId = pick.UserId,
                staffName = pick.FullName,
                scheduledDate = plan.Date.ToString("yyyy-MM-dd"),
                scheduledTime = plan.Time?.ToString(@"hh\:mm"),
                units = plan.Units.Count
            });
        }

        if (newTasks == 0)
            return Ok(new { assigned, unassigned, message = "Không phân công thêm được đơn nào." });

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user!.UserID, "ManagerTools.AutoAssign", cancellationToken);
                await _repo.SaveChangesAsync(cancellationToken);
                return Ok(new { assigned, unassigned, message = $"Đã tự phân công {assigned.Count} đơn." });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            // Thường do trang khác vừa phân công cùng đơn (ràng buộc mỗi kho 1 việc nhận / trả kho)
            return Fail(409, ReadDatabaseMessage(ex, "Đơn vừa được phân công ở phiên khác. Vui lòng tải lại trang."));
        }
    }

    private static object DescribeUnassigned(AssignPlan plan, string reason) => new
    {
        reservationId = plan.Reservation.ReservationID,
        reservationCode = plan.Reservation.ReservationCode,
        taskType = plan.TaskType,
        scheduledDate = plan.Date.ToString("yyyy-MM-dd"),
        reason = plan.TaskType == MoveOut ? $"Quá hạn chưa trả kho · {reason}" : reason
    };

    /* =====================================================================
       5a. KHỐI LƯỢNG VIỆC TỪNG NHÂN VIÊN TRONG NGÀY (để Manager chọn khi đổi người)
       ===================================================================== */
    public async Task<ManagerToolsResponse> GetWorkloadAsync(int facilityId, DateTime? date, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var day = (date ?? BusinessClock.Today).Date;
        var staff = await _repo.GetActiveStaffAsync(facilityId, cancellationToken);
        var staffIds = staff.Select(s => s.UserID).ToList();
        var weekStart = StaffAssignmentPolicy.WeekStart(day);
        var tasks = await _repo.GetStaffTasksInRangeAsync(staffIds, weekStart, weekStart.AddDays(6), cancellationToken);
        var slots = StaffAssignmentPolicy.ToSlots(tasks);

        var data = staff.Select(s => new
        {
            userId = s.UserID,
            fullName = s.FullName,
            email = s.Email,
            dayCount = StaffAssignmentPolicy.DayLoad(slots, s.UserID, day),
            weekCount = StaffAssignmentPolicy.WeekLoad(slots, s.UserID, day),
            tasks = tasks
                .Where(t => t.AssignedStaffID == s.UserID && t.ScheduledDate!.Value.Date == day)
                .OrderBy(t => t.ScheduledTime)
                .Select(t => new
                {
                    taskId = t.TaskID,
                    taskType = t.TaskType,
                    status = t.Status,
                    facilityId = t.FacilityID,
                    reservationId = t.ReservationID,
                    reservationCode = t.Reservation?.ReservationCode,
                    unitNumber = t.Unit.UnitNumber,
                    scheduledTime = t.ScheduledTime?.ToString(@"hh\:mm")
                })
                .ToList()
        }).ToList();

        return Ok(new { date = day.ToString("yyyy-MM-dd"), staff = data });
    }

    /* =====================================================================
       5b. ĐỔI NGƯỜI PHỤ TRÁCH ĐƠN
       Chuyển mọi việc chưa xong của đơn (Scheduled / In Progress) sang nhân viên mới.
       Kho "Held" chưa có việc nhận kho (đơn chưa được phân công) thì tạo việc cho người mới.
       Việc đã hoàn thành giữ nguyên người làm (không sửa lịch sử).
       ===================================================================== */
    public async Task<ManagerToolsResponse> ChangeOwnerAsync(int reservationId, ChangeOwnerDTO request, string? userEmail, CancellationToken cancellationToken)
    {
        var reservation = await _repo.GetReservationWithUnitsAsync(reservationId, cancellationToken);
        if (reservation is null)
            return Fail(404, "Không tìm thấy đơn đặt kho.");

        var (user, fail) = await AuthorizeAsync(userEmail, reservation.FacilityID, cancellationToken);
        if (fail is not null) return fail;

        if (request.StaffUserId <= 0 || !await _repo.IsActiveStaffOfFacilityAsync(request.StaffUserId, reservation.FacilityID, cancellationToken))
            return Fail(400, "Nhân viên được chọn không đang làm việc tại cơ sở này.");

        TimeSpan? newTime = null;
        if (!string.IsNullOrWhiteSpace(request.ScheduledTime))
        {
            if (!TimeSpan.TryParse(request.ScheduledTime, out var parsed) || parsed < TimeSpan.Zero || parsed >= TimeSpan.FromDays(1))
                return Fail(400, "Giờ hẹn không hợp lệ (định dạng HH:mm).");
            newTime = parsed;
        }
        var today = BusinessClock.Today;
        if (request.ScheduledDate.HasValue && request.ScheduledDate.Value.Date < today)
            return Fail(400, "Ngày hẹn không được ở quá khứ.");

        var openTasks = reservation.HandoverTasks
            .Where(t => t.Status == "Scheduled" || t.Status == "In Progress")
            .ToList();

        var missingUnits = (reservation.Status == ReservationStatus.Paid || reservation.Status == ReservationStatus.Confirmed)
            ? reservation.ReservationUnits
                .Where(ru => ru.Status == "Held" && !reservation.HandoverTasks.Any(t =>
                    t.ReservationUnitID == ru.ReservationUnitID && t.TaskType == MoveIn && t.Status != "Cancelled"))
                .ToList()
            : new List<ReservationUnit>();

        if (openTasks.Count == 0 && missingUnits.Count == 0)
            return Fail(409, "Đơn không còn việc nào đang mở để đổi người phụ trách.");

        var staffName = (await _repo.GetFacilityStaffAsync(reservation.FacilityID, request.StaffUserId, cancellationToken))?.User.FullName ?? "nhân viên mới";

        try
        {
            return await _repo.ExecuteInTransactionAsync(async () =>
            {
                await _repo.SetAuditContextAsync(user!.UserID, "ManagerTools.ChangeOwner", cancellationToken);

                foreach (var task in openTasks)
                {
                    task.AssignedStaffID = request.StaffUserId;
                    task.AssignedByID = user.UserID;
                    if (request.ScheduledDate.HasValue) task.ScheduledDate = request.ScheduledDate.Value.Date;
                    if (newTime.HasValue) task.ScheduledTime = newTime;
                }

                var defaultDate = (reservation.AppointmentDate ?? reservation.StartDate).Date;
                foreach (var ru in missingUnits)
                {
                    _repo.AddTask(new HandoverTask
                    {
                        TaskType = MoveIn,
                        FacilityID = reservation.FacilityID,
                        UnitID = ru.UnitID,
                        ReservationUnitID = ru.ReservationUnitID,
                        ReservationID = reservation.ReservationID,
                        AssignedStaffID = request.StaffUserId,
                        AssignedByID = user.UserID,
                        ScheduledDate = request.ScheduledDate?.Date ?? (defaultDate < today ? today : defaultDate),
                        ScheduledTime = newTime ?? reservation.AppointmentTime,
                        Status = "Scheduled",
                        CreatedAt = DateTime.UtcNow
                    });
                }

                await _repo.SaveChangesAsync(cancellationToken);
                var changed = openTasks.Count + missingUnits.Count;
                return Ok(new
                {
                    reservationId = reservation.ReservationID,
                    reservationCode = reservation.ReservationCode,
                    staffUserId = request.StaffUserId,
                    staffName,
                    changedTasks = changed,
                    message = $"Đã chuyển {changed} việc của đơn {reservation.ReservationCode} cho {staffName}."
                });
            }, cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            return Fail(409, ReadDatabaseMessage(ex, "Không đổi được người phụ trách. Vui lòng tải lại và thử lại."));
        }
    }

    /* =====================================================================
       5c. BÁO CÁO SỰ CỐ KHO (Staff gửi qua POST /api/staff-tools/unit-reports)
       ===================================================================== */
    public async Task<ManagerToolsResponse> GetUnitReportsAsync(int facilityId, string? userEmail, CancellationToken cancellationToken)
    {
        var (_, fail) = await AuthorizeAsync(userEmail, facilityId, cancellationToken);
        if (fail is not null) return fail;

        var reports = await _repo.GetUnitReportsAsync(facilityId, cancellationToken);
        var data = reports.Select(t => new
        {
            taskId = t.TaskID,
            unitId = t.UnitID,
            unitNumber = t.Unit.UnitNumber,
            unitStatus = t.Unit.Status,
            staffUserId = t.AssignedStaffID,
            staffName = t.AssignedStaff.FullName,
            reportedAt = t.ActualAt,
            result = t.ConditionResult,
            notes = t.UnitConditionNotes,
            images = ParseImages(t.EvidenceImages)
        }).ToList();

        return Ok(data);
    }

    private static List<string> ParseImages(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new List<string>();
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch (System.Text.Json.JsonException)
        {
            return new List<string>();
        }
    }

    /* ---------- helpers ---------- */

    // Manager chỉ thao tác cơ sở mình quản lý (Facility.ManagerID); BOM được mọi cơ sở
    private async Task<(User? User, ManagerToolsResponse? Fail)> AuthorizeAsync(string? email, int facilityId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return (null, Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại."));

        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        if (user is null)
            return (null, Fail(401, "Tài khoản không hợp lệ hoặc đã bị khóa."));

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return (null, Fail(404, "Không tìm thấy cơ sở."));

        if (user.RoleID == BusinessOperationsRoleId)
            return (user, null);

        if (user.RoleID == ManagerRoleId && await _repo.IsManagerOfFacilityAsync(user.UserID, facilityId, cancellationToken))
            return (user, null);

        return (null, Fail(403, "Bạn chỉ được thao tác trên cơ sở mình quản lý."));
    }

    // Tự phân công được gọi cả từ trang Staff: cho phép thêm nhân viên Active của cơ sở
    private async Task<(User? User, ManagerToolsResponse? Fail)> AuthorizeMemberAsync(string? email, int facilityId, CancellationToken cancellationToken)
    {
        var (user, fail) = await AuthorizeAsync(email, facilityId, cancellationToken);
        if (fail is null) return (user, null);
        if (fail.StatusCode != 403) return (null, fail);

        var caller = await _repo.GetActiveUserByEmailAsync(email!, cancellationToken);
        if (caller is not null && caller.RoleID == 2 &&
            await _repo.IsActiveStaffOfFacilityAsync(caller.UserID, facilityId, cancellationToken))
            return (caller, null);

        return (null, fail);
    }

    private static string? NormalizeTaskType(string? value)
    {
        var key = (value ?? string.Empty).Trim().Replace('_', ' ').ToUpperInvariant();
        return key switch
        {
            "MOVE IN" or "MOVEIN" => MoveIn,
            "MOVE OUT" or "MOVEOUT" => MoveOut,
            "INSPECTION" => Inspection,
            _ => null
        };
    }

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

    private static ManagerToolsResponse Ok(object data) => new(true, null, 200, data);

    private static ManagerToolsResponse Fail(int statusCode, string message) => new(false, message, statusCode, null);
}
