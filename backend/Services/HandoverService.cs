using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// NƠI DUY NHẤT quyết định một đơn có được bàn giao (nhận kho) hay không.
/// Mọi đường bàn giao (POST /api/staff-tools/handover, POST /api/Handover/complete) đều đi qua đây,
/// nên quy tắc không thể bị bỏ qua ở bất kỳ API nào.
///
/// Điều kiện bàn giao (kiểm tra theo đúng thứ tự, trong transaction Serializable):
///   1. Người thao tác là Facility Staff đang Active tại cơ sở của đơn.
///   2. Đơn ở trạng thái Confirmed và còn kho đang giữ (Held).
///   3. Hệ thống đã ghi nhận thanh toán: có Payment thu tiền Completed và mọi khoản cọc đã Paid.
///   4. Đã có hợp đồng và khách đã ký hợp đồng online.
///   5. Hôm nay (giờ VN) nằm trong kỳ thuê: không bàn giao trước ngày bắt đầu, không bàn giao khi kỳ thuê đã hết.
///   6. Người thao tác là NGƯỜI ĐƯỢC PHÂN CÔNG: mọi kho Held của đơn có việc "Move In" đang mở giao cho chính người này.
///      Muốn đổi người thì Facility Manager đổi người phụ trách (PUT /api/manager-tools/reservations/{id}/owner).
///   7. Kho sẵn sàng: không bị đơn khác đang dùng, không ở trạng thái Đang thuê / Chờ kiểm tra / Bảo trì / Ngừng hoạt động.
///   8. Thông tin truy cập hợp lệ (loại khóa đúng danh mục, mã không rỗng).
/// Bàn giao xong: việc Move In chuyển Completed (GIỮ NGUYÊN người được giao), kho In Use, đơn Handed Over, cấp quyền truy cập.
/// </summary>
public class HandoverService : IHandoverService
{
    private static readonly string[] ValidAccessTypes = { "Smart Lock", "PIN Code", "Key", "Access Card", "QR" };

    // Trạng thái kho cho phép bàn giao. In Use (người khác đang dùng), Pending Inspection (vừa trả, chưa kiểm),
    // Maintenance, Inactive đều KHÔNG được bàn giao.
    private static readonly string[] HandoverReadyUnitStatuses = { UnitStatus.Available, UnitStatus.Booking, UnitStatus.Reserved };

    private const string MoveIn = "Move In";

    private readonly IHandoverRepository _handoverRepository;

    public HandoverService(IHandoverRepository handoverRepository)
    {
        _handoverRepository = handoverRepository;
    }

    public async Task<HandoverServiceResponse> CompleteHandoverAsync(CompleteHandoverDTO request, string? staffEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(staffEmail))
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        // 8. Thông tin truy cập: kiểm tra trước, không cần chạm DB
        var accessType = ValidAccessTypes.FirstOrDefault(t => string.Equals(t, request.AccessType?.Trim(), StringComparison.OrdinalIgnoreCase));
        if (accessType is null)
            return Fail(400, "Loại quyền truy cập không hợp lệ (chỉ Smart Lock, PIN Code, Key, Access Card, QR).");
        var accessValue = request.AccessValue?.Trim() ?? string.Empty;
        if (accessValue.Length == 0)
            return Fail(400, "Vui lòng nhập mã khóa / số thẻ / mã PIN giao cho khách.");
        if (accessValue.Length > 255)
            return Fail(400, "Mã truy cập tối đa 255 ký tự.");
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (notes is { Length: > 1000 })
            return Fail(400, "Ghi chú tối đa 1000 ký tự.");

        var staff = await _handoverRepository.GetActiveStaffByEmailAsync(staffEmail, cancellationToken);
        if (staff == null)
            return Fail(403, "Chỉ tài khoản Facility Staff đang hoạt động mới được bàn giao kho.");

        return await _handoverRepository.ExecuteInTransactionAsync(async () =>
        {
            var reservation = await _handoverRepository.GetReservationForHandoverAsync(request.ReservationID, cancellationToken);
            if (reservation == null)
                return Fail(404, "Không tìm thấy đơn đặt kho.");

            // 1. Đúng cơ sở
            if (!await _handoverRepository.IsStaffAssignedToFacilityAsync(staff.UserID, reservation.FacilityID, cancellationToken))
                return Fail(403, "Bạn không làm việc tại cơ sở của đơn này.");

            // 2. Trạng thái đơn
            if (reservation.Status == ReservationStatus.HandedOver || reservation.Status == ReservationStatus.Completed)
                return Fail(409, "Đơn này đã được bàn giao trước đó.");
            if (reservation.Status != ReservationStatus.Confirmed)
                return Fail(409, "Chỉ bàn giao được đơn đã xác nhận (đã cọc và đủ kho).");

            var heldUnits = reservation.ReservationUnits.Where(ru => ru.Status == "Held").ToList();
            if (heldUnits.Count == 0)
                return Fail(409, "Đơn không còn kho nào đang giữ để bàn giao.");

            // 3. Thanh toán do hệ thống ghi nhận
            var deposits = reservation.Charges.Where(c => c.ChargeType == "Deposit" && c.Status != "Cancelled").ToList();
            var paymentCompleted = reservation.Payments.Any(p => p.Status == "Completed" && p.Direction == "Collection");
            if (!paymentCompleted || deposits.Count == 0 || deposits.Any(c => c.Status != "Paid"))
                return Fail(409, "Hệ thống chưa ghi nhận đủ tiền cọc cho đơn này.");

            // 4. Hợp đồng đã ký
            var contract = reservation.Contract;
            if (contract == null)
                return Fail(409, "Đơn chưa có hợp đồng. Vui lòng tải lại trang để hệ thống tạo hợp đồng.");
            if (!await _handoverRepository.IsContractSignedAsync(contract.ContractID, cancellationToken))
                return Fail(409, $"Khách chưa ký hợp đồng {contract.ContractNumber}. Khách phải ký online trước khi nhận kho.");

            // 5. Trong kỳ thuê
            var today = BusinessClock.Today;
            if (today < reservation.StartDate.Date)
                return Fail(409, $"Chưa tới ngày bắt đầu thuê ({reservation.StartDate:dd/MM/yyyy}). Không bàn giao kho trước ngày bắt đầu.");
            if (today > reservation.EndDate.Date)
                return Fail(409, $"Kỳ thuê đã kết thúc ngày {reservation.EndDate:dd/MM/yyyy}. Không thể bàn giao, báo Facility Manager xử lý.");

            // 6. Đúng người được phân công
            var openMoveIns = reservation.HandoverTasks
                .Where(t => t.TaskType == MoveIn && (t.Status == "Scheduled" || t.Status == "In Progress"))
                .ToList();
            var unassigned = heldUnits.Count(ru => !openMoveIns.Any(t => t.ReservationUnitID == ru.ReservationUnitID));
            if (unassigned == heldUnits.Count)
                return Fail(403, "Đơn này chưa được phân công nhân viên nhận kho. Báo Facility Manager phân công trước khi bàn giao.");
            if (unassigned > 0)
                return Fail(403, $"Còn {unassigned} kho của đơn chưa được phân công. Báo Facility Manager phân công đủ trước khi bàn giao.");

            var myTasks = openMoveIns.Where(t => heldUnits.Any(ru => ru.ReservationUnitID == t.ReservationUnitID)).ToList();
            var others = myTasks.Where(t => t.AssignedStaffID != staff.UserID)
                .Select(t => t.AssignedStaff?.FullName ?? "nhân viên khác")
                .Distinct()
                .ToList();
            if (others.Count > 0)
                return Fail(403, $"Đơn này được phân công cho {string.Join(", ", others)}. Bạn không được bàn giao thay; nếu cần đổi người, báo Facility Manager.");

            // 7. Kho sẵn sàng
            var notReady = heldUnits
                .Where(ru => !HandoverReadyUnitStatuses.Contains(ru.Unit.Status))
                .Select(ru => $"{ru.Unit.UnitNumber} ({DescribeUnitStatus(ru.Unit.Status)})")
                .ToList();
            if (notReady.Count > 0)
                return Fail(409, $"Kho chưa sẵn sàng bàn giao: {string.Join(", ", notReady)}. Báo Facility Manager kiểm tra.");

            var occupied = await _handoverRepository.GetUnitsOccupiedByOtherReservationsAsync(
                reservation.ReservationID, heldUnits.Select(ru => ru.UnitID).ToList(), cancellationToken);
            if (occupied.Count > 0)
                return Fail(409, $"Kho {string.Join(", ", occupied)} vẫn đang có khách khác sử dụng (chưa trả kho). Không bàn giao chồng.");

            // ===== Đủ điều kiện: bàn giao =====
            var now = DateTime.UtcNow;

            foreach (var ru in heldUnits)
            {
                ru.Status = "Active";
                ru.HandedOverAt = now;
                ru.Unit.Status = UnitStatus.InUse;
                ru.Unit.UpdatedAt = now;
                ru.Unit.UpdatedByUserID = staff.UserID;
            }
            await _handoverRepository.SaveChangesAsync(cancellationToken);

            // Trigger DB yêu cầu mọi ReservationUnit đã Active trước khi đơn sang Handed Over
            reservation.Status = ReservationStatus.HandedOver;
            await _handoverRepository.SaveChangesAsync(cancellationToken);

            contract.ContractStatus = "Active";

            foreach (var task in myTasks)
            {
                // Không đổi AssignedStaffID: người làm chính là người được giao (đã kiểm tra ở bước 6)
                task.Status = "Completed";
                task.ActualAt = now;
                task.ConditionResult = "Good";
                if (notes is not null) task.UnitConditionNotes = notes;
            }

            foreach (var ru in heldUnits)
            {
                _handoverRepository.AddUnitAccess(new UnitAccess
                {
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = reservation.ReservationID,
                    UnitID = ru.UnitID,
                    UserID = reservation.CustomerID,
                    AccessType = accessType,
                    AccessValue = accessValue,
                    IssuedAt = now,
                    IssuedByUserID = staff.UserID,
                    Status = "Active"
                });
            }

            await _handoverRepository.SaveChangesAsync(cancellationToken);

            var responseData = new
            {
                message = $"Bàn giao thành công {heldUnits.Count} kho. Hợp đồng {contract.ContractNumber} đã có hiệu lực.",
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                reservationStatus = reservation.Status,
                unitStatus = UnitStatus.InUse
            };

            return new HandoverServiceResponse(true, null, 200, responseData);
        }, cancellationToken);
    }

    private static string DescribeUnitStatus(string status) => status switch
    {
        UnitStatus.InUse => "đang cho thuê",
        UnitStatus.PendingInspection => "đang chờ kiểm tra sau khi khách trước trả",
        UnitStatus.Maintenance => "đang bảo trì",
        UnitStatus.Inactive => "ngừng hoạt động",
        _ => status
    };

    private static HandoverServiceResponse Fail(int statusCode, string message) => new(false, message, statusCode, null);
}
