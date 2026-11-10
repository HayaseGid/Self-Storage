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
/// Tiền thuê KHÔNG phải điều kiện bàn giao: khách đóng tiền thuê SAU khi nhận kho (RentPaymentRules).
/// Bàn giao xong: việc Move In chuyển Completed (GIỮ NGUYÊN người được giao), kho In Use, đơn Handed Over, cấp quyền truy cập.
/// </summary>
public class HandoverService : IHandoverService
{
    private static readonly string[] ValidAccessTypes = { "Smart Lock", "PIN Code", "Key", "Access Card", "QR", "Access Code" };

    // Trạng thái kho cho phép bàn giao. In Use (người khác đang dùng), Pending Inspection (vừa trả, chưa kiểm),
    // Maintenance, Inactive đều KHÔNG được bàn giao.
    private static readonly string[] HandoverReadyUnitStatuses = { UnitStatus.Available, UnitStatus.Booking, UnitStatus.Reserved };

    private const string MoveIn = "Move In";

    private readonly IHandoverRepository _handoverRepository;
    private readonly IEmailService _email;
    private readonly ILogger<HandoverService> _logger;

    public HandoverService(IHandoverRepository handoverRepository, IEmailService email, ILogger<HandoverService> logger)
    {
        _handoverRepository = handoverRepository;
        _email = email;
        _logger = logger;
    }

    public async Task<HandoverServiceResponse> CompleteHandoverAsync(CompleteHandoverDTO request, string? staffEmail, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(staffEmail))
            return Fail(401, "Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.");

        // 8. Thông tin truy cập: hệ thống tự sinh mã Access Code 6 số và Chìa khóa KEY-{UnitNumber}
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        if (notes is { Length: > 1000 })
            return Fail(400, "Ghi chú tối đa 1000 ký tự.");

        var staff = await _handoverRepository.GetActiveStaffByEmailAsync(staffEmail, cancellationToken);
        if (staff == null)
            return Fail(403, "Chỉ tài khoản Facility Staff đang hoạt động mới được bàn giao kho.");

        (string Email, string Name, string Code, string Facility, string Units)? onlineNotice = null;

        var result = await _handoverRepository.ExecuteInTransactionAsync(async () =>
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

            var evidenceJson = request.EvidenceImages != null && request.EvidenceImages.Count > 0
                ? System.Text.Json.JsonSerializer.Serialize(request.EvidenceImages.Take(5).ToList())
                : null;

            foreach (var task in myTasks)
            {
                // Không đổi AssignedStaffID: người làm chính là người được giao (đã kiểm tra ở bước 6)
                task.Status = "Completed";
                task.ActualAt = now;
                task.ConditionResult = string.IsNullOrWhiteSpace(request.ConditionResult) ? "Good" : request.ConditionResult.Trim();
                if (notes is not null) task.UnitConditionNotes = notes;
                if (evidenceJson is not null) task.EvidenceImages = evidenceJson;
            }

            // Cấp mã Access Code 6 số cho khách nếu chưa có (duy nhất trong toàn hệ thống)
            if (reservation.Customer != null)
            {
                if (string.IsNullOrWhiteSpace(reservation.Customer.AccessCode))
                {
                    string code;
                    do
                    {
                        code = Random.Shared.Next(100000, 999999).ToString();
                    } while (await _handoverRepository.IsAccessCodeTakenAsync(code, reservation.Customer.UserID, cancellationToken));

                    reservation.Customer.AccessCode = code;
                }
                reservation.Customer.AccessCodeStatus = "Active";
            }

            foreach (var ru in heldUnits)
            {
                // 1. Chìa khóa vật lý: tự sinh KEY-{UnitNumber}
                var keyVal = !string.IsNullOrWhiteSpace(request.AccessValue) && string.Equals(request.AccessType, "Key", StringComparison.OrdinalIgnoreCase)
                    ? request.AccessValue.Trim()
                    : $"KEY-{ru.Unit.UnitNumber}";

                _handoverRepository.AddUnitAccess(new UnitAccess
                {
                    ReservationUnitID = ru.ReservationUnitID,
                    ReservationID = reservation.ReservationID,
                    UnitID = ru.UnitID,
                    UserID = reservation.CustomerID,
                    AccessType = "Key",
                    AccessValue = keyVal,
                    IssuedAt = now,
                    IssuedByUserID = staff.UserID,
                    Status = "Active"
                });

                // 2. Mã ra vào cơ sở 6 số
                if (!string.IsNullOrWhiteSpace(reservation.Customer?.AccessCode))
                {
                    _handoverRepository.AddUnitAccess(new UnitAccess
                    {
                        ReservationUnitID = ru.ReservationUnitID,
                        ReservationID = reservation.ReservationID,
                        UnitID = ru.UnitID,
                        UserID = reservation.CustomerID,
                        AccessType = "Access Code",
                        AccessValue = reservation.Customer.AccessCode,
                        IssuedAt = now,
                        IssuedByUserID = staff.UserID,
                        Status = "Active"
                    });
                }
            }

            await _handoverRepository.SaveChangesAsync(cancellationToken);

            // Bàn giao online: báo khách xem mã truy cập trong tài khoản và lên lễ tân nhận chìa (gửi sau khi lưu xong)
            if (reservation.HandoverMethod == HandoverMethod.Online && reservation.Customer is not null)
            {
                onlineNotice = (reservation.Customer.Email, reservation.Customer.FullName, reservation.ReservationCode,
                    reservation.Facility?.FacilityName ?? "", string.Join(", ", heldUnits.Select(ru => ru.Unit.UnitNumber)));
            }

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

        if (result.IsSuccess && onlineNotice is { } n)
            await SendOnlineHandoverEmailAsync(n.Email, n.Name, n.Code, n.Facility, n.Units);
        return result;
    }

    private async Task SendOnlineHandoverEmailAsync(string email, string name, string code, string facility, string units)
    {
        static string E(string value) => System.Net.WebUtility.HtmlEncode(value);
        var html = $@"
<div style=""font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;color:#1e293b"">
  <h2 style=""margin:0 0 8px;color:#073d70"">Kho của bạn đã được bàn giao</h2>
  <p>Xin chào <strong>{E(name)}</strong>, đơn <strong>{E(code)}</strong> (kho {E(units)}) tại {E(facility)} đã được bàn giao online.</p>
  <ul style=""line-height:1.7"">
    <li><strong>Mã truy cập</strong>: xem trong tài khoản StoreSpace, mục Kho của tôi.</li>
    <li><strong>Chìa khóa</strong>: nhận tại <strong>quầy lễ tân</strong> của cơ sở. Vui lòng mang theo CCCD và báo mã đơn {E(code)}.</li>
  </ul>
  <p style=""font-size:12px;color:#94a3b8"">Email được gửi tự động từ hệ thống StoreSpace. Mã truy cập không được ghi trong email để đảm bảo an toàn.</p>
</div>";
        try
        {
            await _email.SendRawEmailAsync(email, $"[StoreSpace] Đơn {code} đã bàn giao online — nhận chìa tại lễ tân", html, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không gửi được email bàn giao online cho đơn {Code}", code);
        }
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
