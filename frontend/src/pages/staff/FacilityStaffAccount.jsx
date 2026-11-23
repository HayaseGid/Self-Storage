/**
 * ======================================================================
 * FILE: src/pages/staff/FacilityStaffAccount.jsx  —  TRANG LÀM VIỆC CỦA NHÂN VIÊN CƠ SỞ (Facility Staff, route /staff)
 * CHỨC NĂNG: Toàn bộ cổng làm việc của nhân viên cơ sở. Khi mở trang, tải dữ liệu vận hành của cơ sở
 *   (đơn, kho, việc được giao), tự phân công đơn đã cọc và cập nhật phí trễ hạn, rồi hiển thị các mục:
 *   Tổng quan · Bàn giao kho (đơn được giao cho mình, chia Hôm nay / Quá hẹn / Sắp tới; kiểm tra điều kiện,
 *   xác nhận đơn đã cọc, chụp ảnh kho và bàn giao) · Đơn đặt chỗ (phân trang server) · Kho tại cơ sở (đổi trạng
 *   thái, báo cáo sự cố kèm ảnh) · Việc được giao · Trả kho (StaffReturns) · Nhật ký thao tác.
 * THÀNH PHẦN CHÍNH:
 *   - Hàm tiện ích: pad, fmtISO, todayStr, addMonths, fmtDate, fmtMoney, fmtDateTime, compressImage,
 *     endOf, overlaps, unitsOf, resCode, dayGroup.
 *   - Bảng hằng số: RES_STATUS, PAY_STATUS, UNIT_STATUS, ACCESS_TYPES, TASK_TYPE, TASK_STATUS, ... (nhãn + màu).
 *   - Kiểm tra bàn giao: findClashes, myMoveInTasks, isAssignedToMe, checkHandover.
 *   - Component nhỏ: Badge, Info, DayTag, AuthFrame, NoAccess, cùng các mục giao diện bên dưới.
 *   - StaffPortal (export default): component trang, giữ state chung và điều hướng giữa các mục.
 * DÙNG Ở: src/App.jsx (route /staff, role FACILITY_STAFF; import tên StaffPortal).
 * PHỤ THUỘC: api/api (apiGet, apiPost, apiPut), features/return/StaffReturns, mappers/operationsState
 *   (mapOperationsState), hooks/opsLists (RESERVATION_SORTS, UNIT_SORTS, useOpsList), components/common/Dialog,
 *   components/common/listKit, services/storageRules (formatReservationCode), demoClock/demoClock (getTodayISO),
 *   styles/styles.css, styles/staffstyles.css.
 * API:
 *   GET  /api/operations/state?email=...                       (OperationsController)  -> dữ liệu vận hành -> mapOperationsState()
 *   POST /api/manager-tools/facilities/{id}/auto-assign        (ManagerToolsController) -> tự phân công đơn đã cọc chưa có người
 *   POST /api/late-fees/facilities/{id}/sync                   (LateFeesController)     -> cập nhật phí trễ hạn tới hôm nay
 *   GET  /api/staff-tools/tasks                                (StaffToolsController)   -> việc Manager giao cho mình
 *   POST /api/staff-tools/handover                             -> bàn giao kho (hệ thống tự sinh mã truy cập & KEY-<mã kho>)
 *   POST /api/staff-tools/reservations/{id}/confirm            -> xác nhận đơn đã cọc (Paid -> Confirmed + tạo hợp đồng)
 *   POST /api/staff-tools/unit-reports                         -> báo cáo tình trạng / sự cố kho (kèm ảnh)
 *   PUT  /api/staff-tools/units/{unitId}/status                -> đổi trạng thái kho (Còn trống / Chờ kiểm tra / Bảo trì)
 *   GET  /api/operations/reservations | units  (qua useOpsList) -> danh sách có phân trang
 * Điều kiện bàn giao hiển thị ở checkHandover() chỉ để xem trước; quyết định cuối cùng ở backend (HandoverService).
 * LUỒNG (bàn giao kho): mở trang -> GET /api/operations/state + /api/staff-tools/tasks -> mapOperationsState
 *   -> mục "Bàn giao kho" liệt kê đơn được giao -> chọn 1 đơn -> checkHandover hiển thị danh sách điều kiện
 *   -> (nếu đơn chưa xác nhận) bấm "Xác nhận đơn đã cọc" -> POST .../reservations/{id}/confirm -> tick đối chiếu
 *   giấy tờ + tình trạng kho, thêm ảnh -> bấm "Xác nhận bàn giao" -> POST /api/staff-tools/handover (hệ thống tự cấp
 *   mã truy cập và KEY-<mã kho>) -> tải lại dữ liệu, ghi nhật ký, kho chuyển "Đang thuê".
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   pad: Thêm số 0 phía trước cho đủ 2 chữ số (vd 5 -> "05") → dùng ở: fmtISO
 *   fmtISO: Định dạng đối tượng Date thành 'YYYY-MM-DD' (theo giờ máy) → dùng ở: addMonths, Portal
 *   todayStr: "Hôm nay" dạng 'YYYY-MM-DD' theo Demo Clock (đồng hồ giả lập để test), dùng để chia nhóm ngày hẹn → dùng ở: checkHandover, ReservationDetail, Workspace +1
 *   addMonths: Cộng n tháng vào ngày 'YYYY-MM-DD' (kẹp về cuối tháng nếu tháng đích ngắn hơn, vd 31/01 + 1 tháng = 28/02) → dùng ở: endOf
 *   fmtDate: Đổi 'YYYY-MM-DD' (hoặc ISO) thành 'dd/MM/yyyy' để hiển thị (rỗng -> '—') → dùng ở: checkHandover, ReservationDetail, TaskDetailModal +2
 *   fmtMoney: Định dạng tiền kiểu Việt Nam kèm "đ" (vd 1500000 -> "1.500.000đ") → dùng ở: ReservationDetail, Portal
 *   fmtDateTime: Định dạng ngày giờ theo vi-VN (không hợp lệ -> '—'), dùng cho nhật ký / thời điểm báo cáo → dùng ở: ReservationDetail, TaskDetailModal, Portal
 *   compressImage: Nén ảnh trước khi gửi: vẽ lên canvas thu nhỏ (cạnh dài tối đa 1280px), xuất JPEG chất lượng 0.7, trả về data URL → dùng ở: addHandoverImages, addImages
 *   endOf: Ngày kết thúc của đơn: ưu tiên ngày backend trả về (khớp hợp đồng), thiếu thì tự tính = ngày bắt đầu + số tháng → dùng ở: overlaps, checkHandover, ReservationDetail
 *   overlaps: Kiểm tra 2 đơn có trùng kỳ thuê (khoảng thời gian giao nhau) không → dùng ở: findClashes
 *   unitsOf: Lấy danh sách mã kho của 1 đơn (đơn có thể gồm nhiều kho: unitNumbers; đơn cũ chỉ có assignedUnitId / unitId) → dùng ở: findClashes, isAssignedToMe, checkHandover +4
 *   resCode: Mã đơn hiển thị (reservationCode, không có thì định dạng từ id bằng formatReservationCode) → dùng ở: doConfirm, ReservationDetail, ReservationItem +2
 *   dayGroup: Phân nhóm đơn theo ngày hẹn (appointmentDate) so với hôm nay: 'overdue' (quá hẹn), 'today' (hôm nay), 'upcoming' → dùng ở: DayTag, ReservationDetail, Portal
 *   findClashes: Tìm các kho của đơn đang bị đơn khác (trạng thái HOLDING) giữ trùng kỳ thuê, để cảnh báo / chặn bàn giao → dùng ở: checkHandover, ReservationDetail
 *   myMoveInTasks: Lấy các việc "Nhận kho" (Move In, chưa hủy) đã giao cho chính nhân viên này ở đơn đang xét → dùng ở: isAssignedToMe
 *   isAssignedToMe: Kiểm tra mọi kho của đơn đều đã được giao cho nhân viên này (điều kiện để được bàn giao) → dùng ở: checkHandover, ReservationDetail, ReservationItem +1
 *   checkHandover: Kiểm tra trước các điều kiện bàn giao → dùng ở: ReservationDetail, Portal
 *   Badge: Nhãn trạng thái có màu: tra nhãn + tone của `value` trong bảng `map` (không có thì hiện nguyên giá trị) → dùng ở: ReservationDetail, TaskDetailModal, ReservationItem +1
 *   Info: 1 ô thông tin "nhãn: giá trị" trong khung chi tiết đơn → dùng ở: ReservationDetail
 *   DayTag: Nhãn ngày hẹn cho đơn đang chờ bàn giao: "Hôm nay" hoặc "Quá hẹn"; đơn khác / ngày sắp tới thì không hiện gì → dùng ở: ReservationItem, Portal
 *   AuthFrame: Khung trang kiểu màn hình đăng nhập (dùng lại class auth-* của trang khách): logo bấm về trang chủ, tiêu đề, phụ đề → dùng ở: NoAccess
 *   NoAccess: Màn hình "Cần tài khoản nhân viên": hiện khi tài khoản không phải nhân viên hoặc chưa được phân công cơ sở → dùng ở: StaffPortal
 *   ReservationDetail: Khung chi tiết 1 đơn + bàn giao kho: cảnh báo (chưa cọc, quá hẹn, trùng lịch...), thông tin khách / kho / thanh toán → dùng ở: Workspace
 *   addHandoverImages: Khi chọn file ở ô "+ Thêm ảnh kho": nén và thêm ảnh bằng chứng bàn giao (tối đa 3 ảnh) → dùng ở: ReservationDetail
 *   doHandover: Khi bấm "Xác nhận bàn giao N kho": hỏi xác nhận, gửi yêu cầu bàn giao (tình trạng Good, ghi chú, ảnh) rồi hiện kết quả → dùng ở: ReservationDetail
 *   doConfirm: Khi bấm "Xác nhận đơn đã cọc": hỏi xác nhận, chuyển đơn Paid -> Confirmed + tạo hợp đồng để khách ký → dùng ở: ReservationDetail
 *   retryHandover: Khi bấm "Thử bàn giao lại (kiểm tra chống trùng)" ở đơn đã bàn giao: gửi lại yêu cầu bàn giao, backend phải từ chối → dùng ở: ReservationDetail
 *   UnitReportModal: Hộp thoại "Báo cáo tình trạng kho": chọn Hư hỏng (kho trống chuyển Bảo trì) hoặc Bình thường (kho đang Bảo trì / Chờ kiểm tra được mở lại) → dùng ở: Portal
 *   addImages: Khi chọn file ở ô "+ Thêm ảnh": nén và thêm ảnh sự cố (tối đa 3 ảnh) → dùng ở: UnitReportModal
 *   submit: Khi bấm gửi báo cáo (submit form): bắt buộc mô tả khi hư hỏng, gọi onSubmit (-> POST /api/staff-tools/unit-reports) → dùng ở: UnitReportModal
 *   TaskDetailModal: Hộp thoại chi tiết 1 việc được giao: loại việc, trạng thái, lịch hẹn, hình thức nhận/trả, khách, kho, kết quả / ghi chú, ảnh bằng chứng → dùng ở: Portal
 *   ReservationItem: 1 dòng đơn trong danh sách bên trái: mã đơn, khách, nhãn Mới / Hôm nay / Quá hẹn, kho, lịch hẹn, trạng thái → dùng ở: Workspace
 *   handleSelect: Khi bấm vào dòng: đánh dấu đã xem (tắt nhãn Mới, lưu ở listKit) rồi gọi onSelect → dùng ở: ReservationItem
 *   Workspace: Bố cục 2 cột dùng chung cho mục "Bàn giao kho" và "Đơn đặt chỗ": bên trái ô tìm kiếm + bộ lọc + danh sách đơn → dùng ở: Portal
 *   sumCounts: Tính tổng các giá trị trong object đếm (vd { AVAILABLE: 3, RENTED: 5 } -> 8), dùng cho số "Tất cả" trên nút lọc → dùng ở: Portal
 *   Portal: Phần giao diện chính của nhân viên (sau khi đã tải dữ liệu): menu bên trái, các mục → dùng ở: AuthFrame, (cấp file), StaffPortal
 *   sortKey: Khóa sắp xếp theo lịch hẹn (ngày + khung giờ; chưa hẹn xếp cuối) → dùng ở: bySort
 *   bySort: So sánh 2 đơn theo lịch hẹn → dùng ở: Portal
 *   matches: Lọc đơn theo ô tìm kiếm (mã đơn, khách, email, mã kho) → dùng ở: Portal
 *   changeUnitStatus: Khi chọn trạng thái mới ở ô trạng thái của 1 kho (mục "Kho tại cơ sở"): hỏi xác nhận rồi đổi trạng thái; lỗi thì hiện hộp thoại báo lỗi → dùng ở: Portal
 *   open: Mở chi tiết 1 đơn trong màn hình Bàn giao kho (bỏ lọc ngày); dùng khi bấm 1 dòng "Việc cần làm hôm nay" ở Tổng quan → dùng ở: Portal
 *   dayChips: Nút lọc theo ngày hẹn của mục "Bàn giao kho" → dùng ở: Portal
 *   StaffPortal: Component gốc trang nhân viên (route /staff): tải dữ liệu vận hành, xác định cơ sở đang làm → dùng ở: App.jsx (Router)
 *   loadState: Tải dữ liệu: trạng thái vận hành -> tự phân công đơn chưa có người -> đồng bộ phí trễ hạn -> việc được giao, rồi lưu vào state db → dùng ở: StaffPortal, handover, confirmReservation +2
 *   switchFacility: Khi chọn cơ sở khác ở ô "Cơ sở đang làm việc": đổi cơ sở và nhớ lựa chọn vào localStorage → dùng ở: StaffPortal
 *   logout: Khi bấm "Đăng xuất": xóa phiên (currentUserKey) khỏi localStorage và về trang chủ → dùng ở: StaffPortal
 *   handover: Bàn giao kho rồi tải lại ngầm. Backend kiểm tra phân công và điều kiện, tự sinh mã truy cập & KEY-<mã kho> → dùng ở: StaffPortal
 *   confirmReservation: Xác nhận đơn đã cọc (Paid -> Confirmed + tạo hợp đồng) rồi tải lại ngầm → dùng ở: StaffPortal
 *   reportUnitCondition: Gửi báo cáo tình trạng / sự cố kho rồi tải lại ngầm → dùng ở: StaffPortal
 *   updateUnitStatus: Đổi trạng thái kho rồi tải lại ngầm → dùng ở: StaffPortal
 */
import { useEffect, useMemo, useState } from "react";
import "../../styles/styles.css";
import "../../styles/staffstyles.css";
import { apiGet, apiPost, apiPut } from "../../api/api";
import StaffReturns from "../../features/return/StaffReturns"; // mục "Trả kho" (nhận lại & kiểm tra kho)
import { mapOperationsState } from "../../mappers/operationsState";
import { RESERVATION_SORTS, UNIT_SORTS, useOpsList } from "../../hooks/opsLists";
import { useDialog } from "../../components/common/Dialog";
import { formatReservationCode } from "../../services/storageRules";
import { getTodayISO } from "../../demoClock/demoClock";
import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, isNewItem, markAllItemsSeen, markItemSeen, newestFirst, rowClass, timeAgo, useClientPaging, useServerList } from "../../components/common/listKit";

/* ---------- helpers ---------- */
/**
 * Thêm số 0 phía trước cho đủ 2 chữ số (vd 5 -> "05").
 * @param {number} n
 * @returns {string}
 */
const pad = (n) => String(n).padStart(2, "0");
/**
 * Định dạng đối tượng Date thành 'YYYY-MM-DD' (theo giờ máy).
 * @param {Date} d
 * @returns {string}
 */
const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/**
 * "Hôm nay" dạng 'YYYY-MM-DD' theo Demo Clock (đồng hồ giả lập để test), dùng để chia nhóm ngày hẹn.
 * @returns {string}
 */
const todayStr = () => getTodayISO();
/**
 * Cộng n tháng vào ngày 'YYYY-MM-DD' (kẹp về cuối tháng nếu tháng đích ngắn hơn, vd 31/01 + 1 tháng = 28/02).
 * @param {string} s ngày bắt đầu 'YYYY-MM-DD'.
 * @param {number} n số tháng.
 * @returns {string} ngày kết quả, hoặc "" nếu ngày vào không hợp lệ.
 */
const addMonths = (s, n) => {
  const [y, m, d] = String(s || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const last = new Date(y, m - 1 + n + 1, 0).getDate();           // kẹp về cuối tháng (31/01 + 1 tháng = 28/02)
  return fmtISO(new Date(y, m - 1 + n, Math.min(d, last)));
};
/**
 * Đổi 'YYYY-MM-DD' (hoặc ISO) thành 'dd/MM/yyyy' để hiển thị (rỗng -> '—').
 * @param {string} s
 * @returns {string}
 */
const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
/**
 * Định dạng tiền kiểu Việt Nam kèm "đ" (vd 1500000 -> "1.500.000đ").
 * @param {number|string} n
 * @returns {string}
 */
const fmtMoney = (n) => new Intl.NumberFormat("vi-VN").format(Number(n) || 0) + "đ";
/**
 * Định dạng ngày giờ theo vi-VN (không hợp lệ -> '—'), dùng cho nhật ký / thời điểm báo cáo.
 * @param {string} s thời điểm ISO.
 * @returns {string}
 */
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
};

/**
 * Nén ảnh trước khi gửi: vẽ lên canvas thu nhỏ (cạnh dài tối đa 1280px), xuất JPEG chất lượng 0.7, trả về data URL.
 * Được gọi bởi: ReservationDetail (ảnh kho khi bàn giao) và UnitReportModal (ảnh báo cáo sự cố kho).
 * (Trùng ý với compressImage trong features/return/ReturnInspection.jsx.)
 * @param {File} file file ảnh người dùng chọn.
 * @returns {Promise<string>}
 */
const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Không đọc được ảnh."));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error("File không phải ảnh hợp lệ."));
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

/**
 * Ngày kết thúc của đơn: ưu tiên ngày backend trả về (khớp hợp đồng), thiếu thì tự tính = ngày bắt đầu + số tháng.
 * @param {object} r đơn đặt chỗ (endDate, startDate, months).
 * @returns {string} 'YYYY-MM-DD'.
 */
const endOf = (r) => r.endDate || addMonths(r.startDate, r.months);
/**
 * Kiểm tra 2 đơn có trùng kỳ thuê (khoảng thời gian giao nhau) không.
 * @param {object} a đơn thứ nhất.
 * @param {object} b đơn thứ hai.
 * @returns {boolean}
 */
const overlaps = (a, b) => a.startDate < endOf(b) && b.startDate < endOf(a);

/**
 * Lấy danh sách mã kho của 1 đơn (đơn có thể gồm nhiều kho: unitNumbers; đơn cũ chỉ có assignedUnitId / unitId).
 * @param {object} r đơn đặt chỗ.
 * @returns {string[]}
 */
const unitsOf = (r) => {
  const list = Array.isArray(r.unitNumbers) && r.unitNumbers.length ? r.unitNumbers : [r.assignedUnitId || r.unitId];
  return list.filter(Boolean);
};
/**
 * Mã đơn hiển thị (reservationCode, không có thì định dạng từ id bằng formatReservationCode).
 * @param {object} r đơn đặt chỗ.
 * @returns {string}
 */
const resCode = (r) => r.reservationCode || formatReservationCode(r.id);

/** Nhãn + màu (tone) cho trạng thái đơn đặt chỗ (khóa = status đã chuẩn hóa bởi mapOperationsState). */
const RES_STATUS = {
  PENDING_PAYMENT: { label: "Chờ khách trả cọc", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận thanh toán", tone: "warn" },
  PENDING_APPROVAL: { label: "Đã cọc · Chờ xác nhận", tone: "warn" },
  CONFIRMED: { label: "Sẵn sàng bàn giao", tone: "info" },
  HANDED_OVER: { label: "Đã bàn giao", tone: "ok" },
  COMPLETED: { label: "Đã hoàn tất", tone: "ok" },
  CANCELLED: { label: "Đã hủy", tone: "bad" },
  EXPIRED: { label: "Hết hạn giữ chỗ", tone: "bad" },
};
/** Nhãn + màu cho trạng thái thanh toán cọc. */
const PAY_STATUS = {
  PENDING: { label: "Chưa thanh toán", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận", tone: "warn" },
  PAID: { label: "Đã xác nhận cọc", tone: "ok" },
  FAILED: { label: "Thất bại", tone: "bad" },
};
/** Nhãn + màu cho trạng thái kho (nhiều khóa cùng nghĩa vì backend có thể trả các tên khác nhau). */
const UNIT_STATUS = {
  AVAILABLE: { label: "Còn trống", tone: "ok" },
  BOOKING: { label: "Đang giữ chỗ chờ cọc", tone: "warn" },
  RESERVED: { label: "Đã giữ chỗ", tone: "info" },
  RENTED: { label: "Đang thuê", tone: "ok" },
  IN_USE: { label: "Đang thuê", tone: "ok" },
  NEEDS_INSPECTION: { label: "Chờ kiểm tra", tone: "warn" },
  PENDING_INSPECTION: { label: "Chờ kiểm tra", tone: "warn" },
  MAINTENANCE: { label: "Bảo trì", tone: "warn" },
  INACTIVE: { label: "Ngừng sử dụng", tone: "bad" },
};

// Giá trị gửi backend phải khớp CHECK của DB: Key, Access Card, PIN Code, Smart Lock, QR
const ACCESS_TYPES = [
  { value: "Key", label: "Chìa khóa", field: "Số hiệu chìa khóa", placeholder: "VD: KEY-0301" },
  { value: "Access Card", label: "Thẻ truy cập", field: "Mã thẻ", placeholder: "VD: CARD-1029" },
  { value: "PIN Code", label: "Mã PIN", field: "Mã PIN", placeholder: "VD: 482915" },
  { value: "Smart Lock", label: "Khóa thông minh", field: "Mã khóa thông minh", placeholder: "VD: SL-7781" },
  { value: "QR", label: "Mã QR", field: "Mã QR", placeholder: "VD: QR-55120" },
];

// Loại việc được giao (bảng HandoverTask) – giá trị khớp CHECK trong DB, giá trị là nhãn tiếng Việt
const TASK_TYPE = {
  "Move In": "Nhận kho",
  "Move Out": "Trả kho",
  "Inspection": "Kiểm tra kho",
  "Support": "Hỗ trợ khách",
};
const TASK_STATUS = {
  Scheduled: { label: "Đã lên lịch", tone: "info" },
  "In Progress": { label: "Đang làm", tone: "warn" },
  Completed: { label: "Hoàn thành", tone: "ok" },
  Cancelled: { label: "Đã hủy", tone: "bad" },
};
// Trạng thái kho Staff được đổi (backend chỉ nhận 3 giá trị này)
const STAFF_UNIT_STATUS_OPTIONS = [
  { value: "Available", label: "Còn trống" },
  { value: "Pending Inspection", label: "Chờ kiểm tra" },
  { value: "Maintenance", label: "Bảo trì" },
];
// Chỉ kho đang ở các trạng thái này mới hiện ô đổi trạng thái cho Staff
const STAFF_EDITABLE_UNIT = ["AVAILABLE", "MAINTENANCE", "PENDING_INSPECTION", "NEEDS_INSPECTION"];

// Đơn đã cọc, đang chờ bàn giao
const AWAITING = ["PENDING_APPROVAL", "CONFIRMED"];
// Đơn đang giữ kho (dùng để phát hiện trùng lịch)
const HOLDING = ["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED", "HANDED_OVER"];

/**
 * Phân nhóm đơn theo ngày hẹn (appointmentDate) so với hôm nay: 'overdue' (quá hẹn), 'today' (hôm nay),
 * 'upcoming' (sắp tới hoặc chưa có ngày hẹn). Dùng cho bộ lọc mục "Bàn giao kho" và nhãn DayTag.
 * @param {object} r đơn đặt chỗ.
 * @param {string} today 'YYYY-MM-DD'.
 * @returns {'overdue'|'today'|'upcoming'}
 */
const dayGroup = (r, today) => {
  if (!r.appointmentDate) return "upcoming";
  if (r.appointmentDate < today) return "overdue";
  if (r.appointmentDate === today) return "today";
  return "upcoming";
};

/* ---------- handover checks ---------- */
/**
 * Tìm các kho của đơn đang bị đơn khác (trạng thái HOLDING) giữ trùng kỳ thuê, để cảnh báo / chặn bàn giao.
 * Được gọi bởi: checkHandover (điều kiện "clash") và phần chi tiết bàn giao.
 * @param {object} db dữ liệu vận hành (db.reservations).
 * @param {object} res đơn đang xét.
 * @returns {Array<{unitId:string, reservation:object}>}
 */
const findClashes = (db, res) =>
  unitsOf(res).flatMap((unitId) =>
    db.reservations
      .filter((r) => r.id !== res.id && HOLDING.includes(r.status) && unitsOf(r).includes(unitId) && overlaps(r, res))
      .map((r) => ({ unitId, reservation: r })));

/**
 * Lấy các việc "Nhận kho" (Move In, chưa hủy) đã giao cho chính nhân viên này ở đơn đang xét.
 * db.staffTasks lấy từ GET /api/staff-tools/tasks.
 * @param {object} db dữ liệu vận hành.
 * @param {object} res đơn đang xét.
 * @returns {object[]}
 */
const myMoveInTasks = (db, res) =>
  (db.staffTasks || []).filter((t) => t.taskType === "Move In" && Number(t.reservationId) === Number(res.id) && t.status !== "Cancelled");
/**
 * Kiểm tra mọi kho của đơn đều đã được giao cho nhân viên này (điều kiện để được bàn giao).
 * @param {object} db dữ liệu vận hành.
 * @param {object} res đơn đang xét.
 * @returns {boolean}
 */
const isAssignedToMe = (db, res) => {
  const mine = myMoveInTasks(db, res);
  const units = unitsOf(res);
  return units.length > 0 && units.every((u) => mine.some((t) => t.unitNumber === u));
};

// Các lựa chọn sắp xếp / lọc ở mục "Việc được giao": [giá trị, nhãn].
const TASK_SORTS = [
  ["date_asc", "Ngày hẹn gần nhất"],
  ["date_desc", "Ngày hẹn xa nhất"],
  ["newest_created", "Mới giao lên đầu"],
  ["unit_asc", "Theo mã kho (A-Z)"],
];

const TASK_STATUS_FILTERS = [
  ["", "Tất cả trạng thái"],
  ["Scheduled", "Chờ thực hiện"],
  ["In Progress", "Đang làm"],
  ["Completed", "Đã hoàn thành"],
];

const TASK_TYPE_FILTERS = [
  ["", "Tất cả loại việc"],
  ["Move In", "Nhận kho"],
  ["Move Out", "Trả kho"],
  ["Inspection", "Kiểm tra kho"],
  ["Support", "Hỗ trợ khách"],
];

// Trạng thái kho KHÔNG được bàn giao (khớp HandoverService.HandoverReadyUnitStatuses ở backend)
const UNIT_NOT_READY = ["IN_USE", "RENTED", "PENDING_INSPECTION", "NEEDS_INSPECTION", "MAINTENANCE", "INACTIVE"];

// Danh sách này CHỈ để hiển thị trước cho nhân viên. Quyết định cuối cùng luôn ở backend (HandoverService),
// các điều kiện dưới đây phải giữ đúng thứ tự và ý nghĩa với backend.
/**
 * Kiểm tra trước các điều kiện bàn giao (đúng cơ sở, đơn Confirmed, đã xác nhận cọc, đã ký hợp đồng, đang trong kỳ thuê,
 * được phân công, kho sẵn sàng, không trùng lịch). Chỉ để hiển thị — backend (HandoverService) quyết định cuối cùng.
 * Được gọi bởi: phần chi tiết đơn trong mục "Bàn giao kho" (hiện danh sách ✓/✗ và bật/tắt nút bàn giao).
 * @param {object} res đơn đang xét.
 * @param {object} staff nhân viên hiện tại (facilityId).
 * @param {object} db dữ liệu vận hành (reservations, units, staffTasks).
 * @returns {{checks: Array<{key:string, label:string, ok:boolean}>, canHandover: boolean}}
 */
function checkHandover(res, staff, db) {
  const units = unitsOf(res);
  const today = todayStr();
  const notReadyUnits = units.filter((unitId) => {
    const u = db.units.find((x) => x.id === unitId);
    return u && UNIT_NOT_READY.includes(String(u.status).toUpperCase());
  });
  const checks = [
    { key: "facility", label: "Đặt chỗ thuộc đúng cơ sở của bạn", ok: res.facilityId === staff.facilityId },
    { key: "status", label: "Đơn đã được xác nhận và chưa bàn giao", ok: res.status === "CONFIRMED" },
    { key: "payment", label: "Hệ thống đã xác nhận tiền cọc (không dựa vào thông báo từ trình duyệt)", ok: res.paymentStatus === "PAID" },
    { key: "signed", label: "Khách đã ký hợp đồng online", ok: res.contractStatus === "Signed" },
    { key: "date", label: `Đang trong kỳ thuê (từ ${fmtDate(res.startDate)} đến ${fmtDate(endOf(res))})`, ok: !!res.startDate && res.startDate <= today && today <= endOf(res) },
    { key: "assigned", label: "Bạn là người phụ trách đơn này (được hệ thống / Manager phân công)", ok: isAssignedToMe(db, res) },
    { key: "unit", label: notReadyUnits.length ? `Kho sẵn sàng bàn giao (chưa sẵn sàng: ${notReadyUnits.join(", ")})` : `Kho sẵn sàng bàn giao (${units.length} kho)`, ok: units.length > 0 && notReadyUnits.length === 0 },
    { key: "clash", label: "Kho không trùng kỳ thuê với đặt chỗ khác", ok: findClashes(db, res).length === 0 },
  ];
  return { checks, canHandover: checks.every((c) => c.ok) };
}

/* ---------- small UI parts ---------- */
/**
 * Nhãn trạng thái có màu: tra nhãn + tone của `value` trong bảng `map` (không có thì hiện nguyên giá trị).
 * @param {object} props
 * @param {object} props.map bảng tra, vd RES_STATUS, UNIT_STATUS.
 * @param {string} props.value giá trị trạng thái.
 * @returns {JSX.Element}
 */
const Badge = ({ map, value }) => {
  const s = map[value] || { label: value, tone: "info" };
  return <span className={`st-badge st-${s.tone}`}>{s.label}</span>;
};
/**
 * 1 ô thông tin "nhãn: giá trị" trong khung chi tiết đơn.
 * @param {object} props
 * @param {string} props.k nhãn.
 * @param {React.ReactNode} props.children giá trị.
 * @param {boolean} [props.strong=false] true thì tô nổi (class st-info-key).
 * @returns {JSX.Element}
 */
const Info = ({ k, children, strong = false }) => (
  <div className={strong ? "st-info-key" : ""}><small>{k}</small><strong>{children}</strong></div>
);
/**
 * Nhãn ngày hẹn cho đơn đang chờ bàn giao: "Hôm nay" hoặc "Quá hẹn"; đơn khác / ngày sắp tới thì không hiện gì.
 * @param {object} props
 * @param {object} props.res đơn đặt chỗ.
 * @param {string} props.today 'YYYY-MM-DD'.
 * @returns {JSX.Element|null}
 */
const DayTag = ({ res, today }) => {
  if (!AWAITING.includes(res.status)) return null; // chỉ nhắc ngày hẹn cho đơn đang chờ bàn giao
  const group = dayGroup(res, today);
  if (group === "today") return <span className="st-badge st-new">Hôm nay</span>;
  if (group === "overdue") return <span className="st-badge st-bad">Quá hẹn</span>;
  return null;
};

/**
 * Khung trang kiểu màn hình đăng nhập (dùng lại class auth-* của trang khách): logo bấm về trang chủ, tiêu đề, phụ đề.
 * Được gọi bởi: NoAccess (và các màn hình thông báo toàn trang khác).
 * @param {object} props
 * @param {string} props.title tiêu đề lớn.
 * @param {string} props.subtitle mô tả dưới tiêu đề.
 * @param {Function} props.onBrand chạy khi bấm logo.
 * @param {React.ReactNode} props.children nội dung bên dưới.
 * @returns {JSX.Element}
 */
function AuthFrame({ title, subtitle, onBrand, children }) {
  // Khung kiểu trang đăng nhập
  return (
    <div className="auth-page">
      <div className="auth-background auth-bg-one" />
      <div className="auth-background auth-bg-two" />
      <div className="auth-card">
        <button className="auth-brand" type="button" onClick={onBrand}>
          <span className="brand-mark">S</span>
          <span><strong>StoreSpace</strong><small>Facility Staff Portal</small></span>
        </button>
        <div className="auth-heading">
          <div className="eyebrow"><span /> FACILITY STAFF</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Màn hình "Cần tài khoản nhân viên": hiện khi tài khoản không phải nhân viên hoặc chưa được phân công cơ sở;
 * có nút đến trang đăng nhập và về trang chủ.
 * @param {object} props
 * @param {Function} props.navigate hàm chuyển trang của App.
 * @returns {JSX.Element}
 */
function NoAccess({ navigate }) {
  // Màn hình không có quyền nhân viên
  return (
    <AuthFrame title="Cần tài khoản nhân viên" subtitle="Trang này chỉ dành cho Facility Staff đang được phân công tại một cơ sở. Hãy đăng nhập bằng tài khoản nhân viên hoặc liên hệ Facility Manager để được thêm vào cơ sở." onBrand={() => navigate("/")}>
      <div className="auth-form">
        <button className="auth-submit" type="button" onClick={() => navigate("/login")}>Đến trang đăng nhập</button>
        <button className="back-home" type="button" onClick={() => navigate("/")}>← Quay lại trang chủ</button>
      </div>
    </AuthFrame>
  );
}

/* ---------- Reservation detail + handover ---------- */
/**
 * Khung chi tiết 1 đơn + bàn giao kho: cảnh báo (chưa cọc, quá hẹn, trùng lịch...), thông tin khách / kho / thanh toán,
 * danh sách điều kiện bàn giao (checkHandover), 2 ô tick (đối chiếu giấy tờ, kho nguyên vẹn), ảnh bằng chứng (tối đa 3),
 * ghi chú, nút "Xác nhận bàn giao" / "Xác nhận đơn đã cọc" / "Thử bàn giao lại (kiểm tra chống trùng)".
 * API (qua actions do StaffPortal truyền vào): POST /api/staff-tools/handover, POST /api/staff-tools/reservations/{id}/confirm.
 * Được gọi bởi: mục "Bàn giao kho" và "Đơn đặt chỗ" khi chọn 1 đơn.
 * @param {object} props
 * @param {object} props.res đơn đang xem.
 * @param {object} props.staff nhân viên hiện tại.
 * @param {object} props.db dữ liệu vận hành (reservations, units, staffTasks).
 * @param {{handover:Function, confirm:Function}} props.actions hàm gọi API của trang cha.
 * @returns {JSX.Element}
 */
function ReservationDetail({ res, staff, db, actions }) {
  const [idChecked, setIdChecked] = useState(false); // đã tick "đối chiếu giấy tờ"
  const [conditionChecked, setConditionChecked] = useState(false); // đã tick "kho nguyên vẹn"
  const [handoverImages, setHandoverImages] = useState([]); // ảnh kho khi bàn giao (data URL)
  const [handoverNotes, setHandoverNotes] = useState("");
  const [imageError, setImageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { tone, message } kết quả thao tác gần nhất
  const [confirming, setConfirming] = useState(false);
  const dialog = useDialog();

  // Chạy khi chuyển sang đơn khác: đánh dấu đơn đã xem (bỏ nhãn "Mới") và xóa sạch các ô tick / ảnh / kết quả cũ.
  useEffect(() => {
    if (res?.id) {
      markItemSeen(res.id);
      setIdChecked(false);
      setConditionChecked(false);
      setHandoverImages([]);
      setHandoverNotes("");
      setImageError("");
      setResult(null);
    }
  }, [res?.id]);

  const today = todayStr();
  const units = unitsOf(res);
  const { checks, canHandover } = checkHandover(res, staff, db);
  const clashes = findClashes(db, res);
  const handedOver = res.status === "HANDED_OVER";
  const group = dayGroup(res, today);
  const ready = canHandover && idChecked && conditionChecked && !busy; // bật nút "Xác nhận bàn giao"

  // Khi chọn file ở ô "+ Thêm ảnh kho": nén và thêm ảnh bằng chứng bàn giao (tối đa 3 ảnh).
  const addHandoverImages = async (fileList) => {
    setImageError("");
    const remaining = 3 - handoverImages.length;
    if (remaining <= 0) return;
    const files = [...fileList].slice(0, remaining);
    try {
      const compressed = await Promise.all(files.map(compressImage));
      setHandoverImages((prev) => [...prev, ...compressed].slice(0, 3));
    } catch (err) {
      setImageError(err.message || "Không tải được ảnh.");
    }
  };

  /**
   * Khi bấm "Xác nhận bàn giao N kho": hỏi xác nhận, gửi yêu cầu bàn giao (tình trạng Good, ghi chú, ảnh) rồi hiện kết quả.
   * API: POST /api/staff-tools/handover (qua actions.handover)
   */
  const doHandover = async () => {
    const keyPreview = units.map((u) => `KEY-${u}`).join(", ");
    const hasPhotos = handoverImages.length > 0;
    const confirmed = await dialog.confirm({
      tone: "warning",
      title: `Xác nhận bàn giao ${units.length} kho cho ${res.customerName}?`,
      message: `Kho ${units.join(", ")} sẽ chuyển sang đang thuê và hợp đồng được kích hoạt. Đã xác nhận kho nguyên vẹn, không hư hỏng ${hasPhotos ? `(kèm ${handoverImages.length} ảnh minh chứng)` : ""}. Hãy chắc chắn đã đối chiếu CCCD và bàn giao chìa khóa vật lý (${keyPreview}) cho khách. Mã ra vào cơ sở 6 số sẽ được hệ thống tự động cấp vào hồ sơ của khách.`,
      confirmLabel: "Xác nhận bàn giao"
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await actions.handover(res.id, {
        unitConditionConfirmed: true,
        conditionResult: "Good",
        notes: handoverNotes.trim() || "Kho nguyên vẹn, sạch sẽ khi bàn giao",
        evidenceImages: handoverImages
      });
      setResult({ tone: "ok", message: response?.message || "Bàn giao thành công." });
    } catch (error) {
      setResult({ tone: "warn", message: error.message });
      void dialog.alert({ tone: "danger", title: "Bàn giao không thành công", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Khi bấm "Xác nhận đơn đã cọc": hỏi xác nhận, chuyển đơn Paid -> Confirmed + tạo hợp đồng để khách ký
   * (thay cho bước Manager duyệt trước đây).
   * API: POST /api/staff-tools/reservations/{id}/confirm (qua actions.confirm)
   */
  const doConfirm = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Xác nhận đơn ${resCode(res)} đã cọc?`,
      message: "Hệ thống kiểm tra lại tiền cọc và số kho đã giữ, sau đó chuyển đơn sang \"Đã xác nhận\" và tạo hợp đồng để khách ký.",
      confirmLabel: "Xác nhận đơn"
    });
    if (!ok) return;
    setConfirming(true);
    try {
      const response = await actions.confirm(res.id);
      setResult({ tone: "ok", message: response?.message || "Đã xác nhận đơn." });
    } catch (error) {
      setResult({ tone: "warn", message: error.message });
      void dialog.alert({ tone: "danger", title: "Chưa xác nhận được đơn", message: error.message });
    } finally {
      setConfirming(false);
    }
  };

  // Khi bấm "Thử bàn giao lại (kiểm tra chống trùng)" ở đơn đã bàn giao: gửi lại yêu cầu bàn giao,
  // backend phải từ chối (lỗi = đúng, thành công = có lỗi cần báo nhóm phát triển).
  const retryHandover = async () => {
    setBusy(true);
    try {
      await actions.handover(res.id, { type: ACCESS_TYPES[0].value, value: "CHECK-DUPLICATE" });
      setResult({ tone: "warn", message: "Hệ thống đã chấp nhận yêu cầu lần 2. Hãy báo lại cho nhóm phát triển." });
    } catch (error) {
      setResult({
        tone: "ok",
        message: `Hệ thống từ chối bàn giao lần 2: "${error.message}". Không có hợp đồng hay kho nào được tạo thêm.`
      });
    } finally {
      setBusy(false);
    }
  };

  // Chi tiết đơn + bàn giao kho
  return (
    <div className="st-card st-detail">
      {/* Mã đơn, khách, trạng thái */}
      <div className="st-head">
        <div>
          <div className="st-head-codes">
            <span className="st-head-label">Mã đơn</span>
            <Code kind="order">{resCode(res)}</Code>
            <NewBadge createdAt={res.createdAt} id={res.id} />
          </div>
          <h2>{res.customerName}</h2>
          <div className="st-head-units">
            <span className="st-head-label">{units.length} kho</span>
            <UnitCodes units={units} max={8} />
            <span className="st-head-type">{res.unitType}</span>
          </div>
        </div>
        <Badge map={RES_STATUS} value={res.status} />
      </div>

      {res.paymentStatus === "PENDING" && !handedOver && (
        <div className="st-alert st-warn">Khách chưa thanh toán tiền cọc. Chưa thể bàn giao.</div>
      )}
      {res.paymentStatus === "PENDING_CONFIRMATION" && (
        <div className="st-alert st-warn">Khách báo đã thanh toán nhưng hệ thống chưa nhận kết quả từ cổng thanh toán. Không bàn giao dựa trên ảnh chụp hoặc thông báo từ trình duyệt của khách.</div>
      )}
      {!handedOver && AWAITING.includes(res.status) && !isAssignedToMe(db, res) && (
        <div className="st-alert st-warn">Đơn này do nhân viên khác phụ trách (hoặc chưa có người nhận) nên bạn không bàn giao được. Liên hệ Facility Manager nếu cần đổi người.</div>
      )}
      {/* Nút xác nhận đơn đã cọc */}
      {res.status === "PENDING_APPROVAL" && (
        <div className="st-alert st-warn st-confirm-box">
          <span>Khách đã đặt cọc nhưng đơn chưa được chuyển sang "Đã xác nhận" nên chưa thể bàn giao.</span>
          {res.paymentStatus === "PAID" && (
            <button type="button" className="dashboard-primary-btn sm" onClick={doConfirm} disabled={confirming}>
              {confirming ? "Đang xác nhận..." : "Xác nhận đơn đã cọc"}
            </button>
          )}
        </div>
      )}
      {!handedOver && group === "overdue" && (
        <div className="st-alert st-warn">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, đã quá hẹn. Hãy liên hệ khách trước khi bàn giao.</div>
      )}
      {!handedOver && group === "upcoming" && (
        <div className="st-alert st-info">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, chưa đến ngày nhận kho.</div>
      )}
      {!handedOver && res.startDate && today < res.startDate && (
        <div className="st-alert st-warn">Kỳ thuê bắt đầu ngày {fmtDate(res.startDate)}. Hệ thống không cho bàn giao kho trước ngày này.</div>
      )}
      {/* Cảnh báo trùng lịch */}
      {clashes.length > 0 && !handedOver && (
        <div className="st-alert st-warn">
          Trùng kỳ thuê: {clashes.map((c) => `${c.unitId} (đơn ${resCode(c.reservation)})`).join(", ")}. Không bàn giao, báo Facility Manager kiểm tra.
        </div>
      )}

      {/* Thông tin khách, kho, thanh toán */}
      <div className="st-grid">
        <Info k="Lịch hẹn nhận kho" strong>{fmtDate(res.appointmentDate)} · {res.appointmentTime}</Info>
        <Info k="Cách nhận kho">{res.handoverMethod === "Online"
          ? "Bàn giao online: hoàn tất bàn giao trên hệ thống (mã truy cập hiện trong tài khoản khách), để chìa khóa kèm mã đơn tại quầy lễ tân"
          : "Khách đến nhận trực tiếp trong khung giờ trên, nên gọi xác nhận trước"}</Info>
        <Info k="Tiền cọc" strong>{fmtMoney(res.deposit)} <Badge map={PAY_STATUS} value={res.paymentStatus} /></Info>
        <Info k="Kỳ thuê">{fmtDate(res.startDate)} → {fmtDate(endOf(res))} ({res.months} tháng)</Info>
        <Info k="Liên hệ">{res.customerPhone || "—"} · {res.customerEmail}</Info>
        <Info k="Tổng tiền thuê">{fmtMoney(res.rentalFee)}</Info>
        <Info k="Hình thức trả">{res.paymentPlan === "Upfront" ? "Trả 1 lần" : "Trả theo tháng"} · {res.startRentPaid ? "đã đóng tiền thuê đầu kỳ" : `sau khi nhận kho khách đóng online ${fmtMoney(res.startRentUnpaid)} (${res.paymentPlan === "Upfront" ? "toàn bộ kỳ thuê" : "tháng đầu"})`}</Info>
        {res.paymentTxn && <Info k="Mã giao dịch"><Code>{res.paymentTxn}</Code></Info>}
        {res.createdAt && <Info k="Ngày đặt">{fmtDateTime(res.createdAt)} <span className="st-hint">({timeAgo(res.createdAt)})</span></Info>}
      </div>

      <h3>Kho bàn giao ({units.length})</h3>
      {/* Bảng kho trong đơn */}
      <table className="st-table st-units">
        <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {units.map((unitId) => {
            const u = db.units.find((x) => x.id === unitId);
            return (
              <tr key={unitId}>
                <td><Code kind="unit">{unitId}</Code></td>
                <td>{u?.type || "—"}</td>
                <td>{u?.size || "—"}</td>
                <td>{u ? <Badge map={UNIT_STATUS} value={u.status} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Đã bàn giao: mã truy cập / chưa: checklist + chụp ảnh + nút bàn giao */}
      {handedOver ? (
        <>
          <div className="st-alert st-ok">Đã bàn giao{res.contractId ? <> · hợp đồng <Code kind="contract">{res.contractNumber || `#${res.contractId}`}</Code></> : ""}.</div>
          <button className="dashboard-secondary-btn" type="button" onClick={retryHandover} disabled={busy}>
            {busy ? "Đang kiểm tra..." : "Thử bàn giao lại (kiểm tra chống trùng)"}
          </button>
        </>
      ) : (
        <>
          <h3>Kiểm tra trước khi bàn giao</h3>
          <ul className="st-checks">
            {checks.map((c) => (
              <li key={c.key} className={c.ok ? "st-yes" : "st-no"}>
                <span aria-hidden="true">{c.ok ? "✓" : "✕"}</span> {c.label}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "12px 0 16px" }}>
            <label className="st-check">
              <input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} />
              Đã đối chiếu giấy tờ, đúng khách hàng đặt chỗ
            </label>
            <label className="st-check">
              <input type="checkbox" checked={conditionChecked} onChange={(e) => setConditionChecked(e.target.checked)} />
              Xác nhận tình trạng kho nguyên vẹn, bình thường, không bị hư hỏng gì
            </label>
          </div>

          <div style={{ margin: "12px 0 16px", background: "#f8fafc", padding: "14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                📸 Ảnh chụp kho nguyên vẹn trước khi bàn giao ({handoverImages.length}/3)
              </strong>
              {handoverImages.length > 0 && (
                <button
                  type="button"
                  style={{ background: "none", border: "none", color: "#dc2626", fontSize: "12px", cursor: "pointer", padding: 0 }}
                  onClick={() => setHandoverImages([])}
                >
                  Xóa tất cả
                </button>
              )}
            </div>
            <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}>
              Chụp ảnh hiện trường kho để lưu làm bằng chứng kho bình thường, nguyên vẹn khi bàn giao cho khách.
            </p>

            {imageError && <div className="st-alert st-warn" style={{ marginBottom: "8px" }}>{imageError}</div>}

            <div className="st-report-images">
              {handoverImages.map((src, i) => (
                <div key={i} className="st-report-thumb">
                  <img src={src} alt={`Ảnh kho ${i + 1}`} />
                  <button type="button" onClick={() => setHandoverImages((prev) => prev.filter((_, j) => j !== i))} aria-label="Xóa ảnh">×</button>
                </div>
              ))}
              {handoverImages.length < 3 && (
                <label className="st-report-add">
                  + Thêm ảnh kho
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => { addHandoverImages(e.target.files); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>

            <div style={{ marginTop: "10px" }}>
              <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>
                Ghi chú tình trạng kho khi bàn giao (tùy chọn):
              </label>
              <input
                className="st-input"
                style={{ width: "100%", fontSize: "12.5px" }}
                placeholder="VD: Kho sạch sẽ, ổ khóa hoạt động tốt, không trầy xước"
                value={handoverNotes}
                onChange={(e) => setHandoverNotes(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>

          <h3>Quyền truy cập & Chìa khóa (Hệ thống tự động cấp)</h3>
          <div style={{ display: 'grid', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', margin: '12px 0' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔑</span>
              <div>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '13.5px' }}>Chìa khóa vật lý từng ô kho</strong>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Mã chìa: {units.map((u) => <code key={u} style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginRight: '4px' }}>KEY-{u}</code>)}
                  — Giao chìa vật lý trực tiếp cho khách tại quầy lễ tân.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔢</span>
              <div>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '13.5px' }}>Mã ra vào cơ sở (Access Code)</strong>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Mã 6 chữ số tự động kích hoạt và gửi vào hồ sơ khách hàng. Có hiệu lực trong suốt thời gian thuê, tự động tạm khóa nếu nợ quá hạn &gt; 30 ngày.
                </p>
              </div>
            </div>
          </div>
          <button className="dashboard-primary-btn" type="button" disabled={!ready} onClick={doHandover}>
            {busy ? "Đang bàn giao..." : `Xác nhận bàn giao ${units.length} kho`}
          </button>
          {!ready && !busy && (
            <p className="st-hint">
              {!canHandover
                ? "Chưa đủ điều kiện bàn giao theo quy định."
                : !idChecked
                ? "Cần tick xác nhận đã đối chiếu giấy tờ của khách."
                : !conditionChecked
                ? "Cần tick xác nhận tình trạng kho nguyên vẹn, không hư hỏng để kích hoạt bàn giao."
                : ""}
            </p>
          )}
        </>
      )}

      {result && <div className={`st-alert st-${result.tone}`} role="status">{result.message}</div>}
    </div>
  );
}

/* ---------- Báo cáo sự cố kho ---------- */

/**
 * Hộp thoại "Báo cáo tình trạng kho": chọn Hư hỏng (kho trống chuyển Bảo trì) hoặc Bình thường (kho đang Bảo trì /
 * Chờ kiểm tra được mở lại), mô tả (bắt buộc khi hư hỏng), ảnh minh chứng (tối đa 3).
 * API: POST /api/staff-tools/unit-reports (gọi qua onSubmit của trang cha).
 * Được gọi bởi: mục "Kho tại cơ sở" khi bấm nút báo cáo ở 1 kho.
 * @param {object} props
 * @param {object} props.unit kho được báo cáo (id = mã kho, unitId = id số).
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} props.onSubmit async ({ unitId, result, notes, evidenceImages }) => void.
 * @returns {JSX.Element}
 */
function UnitReportModal({ unit, onClose, onSubmit }) {
  const [result, setResult] = useState("Damaged"); // 'Damaged' | 'Good'
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Khi chọn file ở ô "+ Thêm ảnh": nén và thêm ảnh sự cố (tối đa 3 ảnh).
  const addImages = async (fileList) => {
    const files = [...fileList].slice(0, 3 - images.length);
    try {
      const compressed = await Promise.all(files.map(compressImage));
      setImages((prev) => [...prev, ...compressed].slice(0, 3));
    } catch (err) {
      setError(err.message);
    }
  };

  // Khi bấm gửi báo cáo (submit form): bắt buộc mô tả khi hư hỏng, gọi onSubmit (-> POST /api/staff-tools/unit-reports).
  const submit = async (e) => {
    e.preventDefault();
    if (result === "Damaged" && !notes.trim()) return setError("Vui lòng mô tả tình trạng hư hỏng.");
    setError("");
    setSaving(true);
    try {
      await onSubmit({ unitId: unit.unitId, result, notes: notes.trim() || null, evidenceImages: images });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // Hộp thoại báo cáo tình trạng kho
  return (
    <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={`Báo cáo kho ${unit.id}`}>
      {/* Chọn hư hỏng/bình thường, ghi chú, ảnh */}
      <form className="st-modal" onSubmit={submit}>
        <div className="st-modal-head">
          <h3>Báo cáo tình trạng kho {unit.id}</h3>
          <button type="button" className="st-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        {error && <div className="st-alert st-warn" role="alert">{error}</div>}
        <div className="st-report-choice">
          <label className={result === "Damaged" ? "active bad" : ""}>
            <input type="radio" name="result" value="Damaged" checked={result === "Damaged"} onChange={() => setResult("Damaged")} />
            Hư hỏng / có sự cố
          </label>
          <label className={result === "Good" ? "active ok" : ""}>
            <input type="radio" name="result" value="Good" checked={result === "Good"} onChange={() => setResult("Good")} />
            Bình thường / đã sửa xong
          </label>
        </div>
        <p className="st-hint">
          {result === "Damaged"
            ? "Kho đang trống sẽ chuyển sang Bảo trì để khách không đặt được. Kho đang có khách thì giữ nguyên, Manager sẽ xử lý."
            : "Kho đang Bảo trì / Chờ kiểm tra sẽ được mở lại thành Còn trống."}
        </p>
        <label className="st-field">
          Mô tả tình trạng {result === "Damaged" ? "*" : "(không bắt buộc)"}
          <textarea className="st-input" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Khóa cửa bị kẹt, trần có vết thấm nước" />
        </label>
        <div className="st-field">
          Ảnh minh chứng (tối đa 3)
          <div className="st-report-images">
            {images.map((src, i) => (
              <div key={i} className="st-report-thumb">
                <img src={src} alt={`Ảnh ${i + 1}`} />
                <button type="button" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label="Xóa ảnh">×</button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="st-report-add">
                + Thêm ảnh
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
        <div className="st-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? "Đang gửi..." : "Gửi báo cáo"}</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Hộp thoại chi tiết 1 việc được giao: loại việc, trạng thái, lịch hẹn, hình thức nhận/trả, khách, kho, kết quả / ghi chú,
 * ảnh bằng chứng (bấm để mở ảnh lớn ở tab mới), nút "Xem đơn đặt kho →" chuyển tới đơn liên quan.
 * Không gọi API (dữ liệu việc đã có trong db.staffTasks).
 * Được gọi bởi: Portal, khi bấm 1 việc trong mục "Việc được giao".
 * @param {object} props
 * @param {object|null} props.task việc đang xem (null thì không vẽ gì).
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onGoToReservation] (reservationId) => void, mở đơn liên quan.
 * @returns {JSX.Element|null}
 */
function TaskDetailModal({ task, onClose, onGoToReservation }) {
  if (!task) return null;
  // Đọc danh sách ảnh bằng chứng của việc (backend trả chuỗi JSON hoặc mảng); lỗi thì coi như không có ảnh.
  const parsedImages = useMemo(() => {
    if (!task.evidenceImages) return [];
    try {
      const arr = typeof task.evidenceImages === "string" ? JSON.parse(task.evidenceImages) : task.evidenceImages;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [task.evidenceImages]);

  // Hộp thoại chi tiết việc được giao
  return (
    <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={`Chi tiết việc #${task.taskId}`}>
      <div className="st-modal" style={{ maxWidth: "600px" }}>
        {/* Tiêu đề + nút đóng */}
        <div className="st-modal-head">
          <div>
            <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#64748b", fontWeight: 700, letterSpacing: "0.5px" }}>
              CHI TIẾT CÔNG VIỆC #{task.taskId}
            </span>
            <h3 style={{ margin: "2px 0 0", color: "#0f172a" }}>{TASK_TYPE[task.taskType] || task.taskType} · Kho {task.unitNumber}</h3>
          </div>
          <button type="button" className="st-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div style={{ display: "grid", gap: "12px", margin: "14px 0" }}>
          {/* Loại việc + trạng thái */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div>
              <small style={{ color: "#64748b", display: "block" }}>Trạng thái công việc</small>
              <Badge map={TASK_STATUS} value={task.status} />
            </div>
            <div style={{ textAlign: "right" }}>
              <small style={{ color: "#64748b", display: "block" }}>Thời gian phân công</small>
              <strong>{fmtDateTime(task.createdAt)}</strong>
            </div>
          </div>

          {/* Lịch hẹn, khách, kho */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Lịch hẹn thực hiện</small>
              <strong style={{ fontSize: "14px" }}>{fmtDate(task.scheduledDate)}</strong>
              <div style={{ fontSize: "12.5px", color: "#0369a1", marginTop: "2px" }}>
                {task.scheduledSlot || task.scheduledTime || "Trong ngày"}
              </div>
            </div>

            <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block" }}>Hình thức nhận / trả</small>
              <strong style={{ fontSize: "13.5px" }}>
                {task.handoverMethod === "Online" ? "Bàn giao online" : "Trực tiếp tại cơ sở"}
              </strong>
              {task.handoverMethod === "Online" && (
                <div style={{ fontSize: "12px", color: "#059669", marginTop: "2px" }}>
                  Chìa khóa để sẵn tại quầy lễ tân
                </div>
              )}
            </div>
          </div>

          <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <small style={{ color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>Thông tin ô kho &amp; Đơn đặt chỗ</small>
              {task.reservationCode && <Code kind="order">{task.reservationCode}</Code>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
              <div><strong>Ô kho:</strong> <Code kind="unit">{task.unitNumber}</Code> {task.unitType ? `(${task.unitType})` : ""}</div>
              <div><strong>Khách hàng:</strong> {task.customerName || "—"}</div>
              {task.customerPhone && (
                <div><strong>SĐT:</strong> <a href={`tel:${task.customerPhone}`}>{task.customerPhone}</a></div>
              )}
              {task.customerEmail && (
                <div><strong>Email:</strong> <a href={`mailto:${task.customerEmail}`}>{task.customerEmail}</a></div>
              )}
            </div>
          </div>

          {/* Kết quả / ghi chú */}
          {(task.notes || task.conditionResult) && (
            <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <small style={{ color: "#64748b", display: "block", marginBottom: "4px", textTransform: "uppercase", fontWeight: 700 }}>
                Kết quả &amp; Ghi chú hiện trạng
              </small>
              {task.conditionResult && (
                <p style={{ margin: "0 0 4px", fontSize: "13px" }}>
                  <strong>Đánh giá:</strong> {task.conditionResult === "Good" ? "✓ Tốt / Đạt" : task.conditionResult === "Damaged" ? "⚠️ Hư hỏng / Có vấn đề" : task.conditionResult}
                </p>
              )}
              {task.notes && (
                <p style={{ margin: 0, fontSize: "13px", fontStyle: "italic", color: "#334155" }}>
                  &ldquo;{task.notes}&rdquo;
                </p>
              )}
              {task.actualAt && (
                <small style={{ display: "block", color: "#64748b", marginTop: "6px" }}>
                  Hoàn tất lúc: {fmtDateTime(task.actualAt)}
                </small>
              )}
            </div>
          )}

          {/* Ảnh đính kèm */}
          {parsedImages.length > 0 && (
            <div>
              <small style={{ color: "#64748b", display: "block", marginBottom: "6px", fontWeight: 700 }}>
                Ảnh hiện trường ({parsedImages.length} ảnh):
              </small>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {parsedImages.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`Bằng chứng ${i + 1}`}
                    style={{ width: "90px", height: "90px", objectFit: "cover", borderRadius: "8px", border: "1px solid #cbd5e1", cursor: "pointer" }}
                    onClick={() => window.open(img, "_blank")}
                    title="Bấm để xem ảnh lớn"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nút đóng / mở đơn */}
        <div className="st-modal-actions" style={{ justifyContent: "space-between" }}>
          {task.reservationId ? (
            <button
              type="button"
              className="dashboard-primary-btn"
              onClick={() => {
                onClose();
                onGoToReservation?.(task.reservationId);
              }}
            >
              Xem đơn đặt kho →
            </button>
          ) : <span />}
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 1 dòng đơn trong danh sách bên trái: mã đơn, khách, nhãn Mới / Hôm nay / Quá hẹn, kho, lịch hẹn, trạng thái,
 * nhãn "Giao cho bạn" / "Chưa giao cho bạn".
 * Được gọi bởi: Workspace (mỗi đơn trong danh sách).
 * @param {object} props
 * @param {object} props.r đơn đặt chỗ.
 * @param {boolean} props.active đang được chọn hay không.
 * @param {Function} props.onSelect gọi khi bấm vào dòng.
 * @param {object} props.db dữ liệu vận hành.
 * @param {string} props.today 'YYYY-MM-DD'.
 * @returns {JSX.Element}
 */
function ReservationItem({ r, active, onSelect, db, today }) {
  const units = unitsOf(r);
  // Khi bấm vào dòng: đánh dấu đã xem (tắt nhãn Mới, lưu ở listKit) rồi gọi onSelect.
  const handleSelect = () => {
    markItemSeen(r.id);
    onSelect();
  };
  // 1 đơn trong danh sách bên trái
  return (
    <button type="button" className={rowClass(r.createdAt, `st-item ${active ? "active" : ""}`, r.id)} onClick={handleSelect}>
      <div className="st-item-top">
        <Code kind="order">{resCode(r)}</Code>
        <span className="st-name">{r.customerName}</span>
        <NewBadge createdAt={r.createdAt} id={r.id} />
        <DayTag res={r} today={today} />
      </div>
      <div className="st-item-mid">
        <UnitCodes units={units} max={3} />
        {r.unitType && <span className="st-item-type">{r.unitType}</span>}
      </div>
      <div className="st-item-foot">
        <span className="st-item-badges">
          <Badge map={RES_STATUS} value={r.status} />
          {AWAITING.includes(r.status) && (isAssignedToMe(db, r)
            ? <span className="st-badge st-ok">Giao cho bạn</span>
            : <span className="st-badge st-warn">Chưa giao cho bạn</span>)}
        </span>
        <span className="st-item-when"><b>{r.appointmentTime}</b> · Hẹn {fmtDate(r.appointmentDate)}</span>
      </div>
    </button>
  );
}

/**
 * Bố cục 2 cột dùng chung cho mục "Bàn giao kho" và "Đơn đặt chỗ": bên trái ô tìm kiếm + bộ lọc + danh sách đơn
 * (ReservationItem) + phân trang; bên phải chi tiết đơn đang chọn (ReservationDetail).
 * Được gọi bởi: Portal.
 * @param {object} props
 * @param {object[]} props.list các đơn của trang hiện tại.
 * @param {string} props.query / @param {Function} props.setQuery ô tìm kiếm.
 * @param {object|null} props.selected đơn đang chọn; props.selectedId / props.setSelectedId: id đơn đang chọn.
 * @param {object} props.staff, props.db, props.actions truyền tiếp xuống ReservationDetail.
 * @param {React.ReactNode} [props.chips] / [props.toolbar] bộ lọc riêng của từng mục.
 * @param {object} [props.pager] props cho <Pager>.
 * @param {boolean} [props.loading] / [props.error] / [props.emptyText] trạng thái tải, lỗi, câu khi rỗng.
 * @returns {JSX.Element}
 */
function Workspace({ list, query, setQuery, selected, selectedId, setSelectedId, staff, db, actions, chips, toolbar, pager, loading, error, emptyText }) {
  const today = todayStr();
  // Bố cục 2 cột: danh sách đơn | chi tiết đơn
  return (
    <div className="st-split">
      <div>
        {chips}
        <input className="st-search" placeholder="Tìm theo mã đơn, tên khách, email, SĐT, mã kho" value={query} onChange={(e) => setQuery(e.target.value)} />
        {toolbar}
        {error && <div className="ss-error-line" role="alert">{error}</div>}
        <div className="st-list" aria-busy={loading ? "true" : "false"}>
          {loading && list.length === 0 && <div className="st-card st-empty">Đang tải danh sách…</div>}
          {!loading && list.length === 0 && <div className="st-card st-empty">{emptyText || "Không có đặt chỗ nào phù hợp."}</div>}
          {list.map((r) => (
            <ReservationItem key={r.id} r={r} active={r.id === selectedId} onSelect={() => setSelectedId(r.id)} db={db} today={today} />
          ))}
        </div>
        {pager && <Pager {...pager} unit="đơn" compact />}
      </div>
      <div>
        {selected ? (
          <ReservationDetail key={selected.id} res={selected} staff={staff} db={db} actions={actions} />
        ) : (
          <div className="st-card st-empty">Chọn một đặt chỗ ở danh sách bên trái để kiểm tra và bàn giao kho.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Portal (khung giống Customer Portal) ---------- */
/* Menu bên trái: [khóa mục, biểu tượng, tên mục, mô tả]. Số bên cạnh tên mục = việc đang chờ. */
const NAV = [
  ["overview", "⌂", "Tổng quan", "Việc hôm nay, số liệu nhanh"],
  ["today", "◷", "Bàn giao kho", "Đơn đã cọc chờ giao kho cho khách"],
  ["all", "▤", "Đơn đặt chỗ", "Mọi đơn tại cơ sở, mới nhất lên đầu"],
  ["units", "▣", "Kho tại cơ sở", "Tình trạng từng kho, báo sự cố"],
  ["returns", "⇦", "Trả kho & kiểm kho", "Nhận lại kho, quyết toán cọc"],
  ["tasks", "☑", "Việc được giao", "Việc Manager giao cho bạn"],
  ["log", "◫", "Nhật ký bàn giao", "Lịch sử bàn giao kho"],
];

// Nút lọc trạng thái ở mục "Đơn đặt chỗ" và "Kho tại cơ sở": [giá trị gửi backend (nhiều trạng thái cách bằng dấu phẩy), nhãn].
const STAFF_RES_FILTERS = [
  ["", "Tất cả"],
  ["PENDING_APPROVAL,CONFIRMED", "Chờ bàn giao"],
  ["HANDED_OVER", "Đang thuê"],
  ["PENDING_PAYMENT", "Chờ cọc"],
  ["COMPLETED", "Đã trả kho"],
  ["CANCELLED,EXPIRED", "Hủy / hết hạn"],
];
const STAFF_UNIT_FILTERS = [
  ["", "Tất cả"],
  ["AVAILABLE", "Còn trống"],
  ["RESERVED", "Đã giữ chỗ"],
  ["RENTED", "Đang thuê"],
  ["MAINTENANCE", "Bảo trì / chờ kiểm tra"],
  ["INACTIVE", "Ngừng dùng"],
];
/**
 * Tính tổng các giá trị trong object đếm (vd { AVAILABLE: 3, RENTED: 5 } -> 8), dùng cho số "Tất cả" trên nút lọc.
 * @param {Object<string, number>} counts
 * @returns {number}
 */
const sumCounts = (counts) => Object.values(counts || {}).reduce((a, b) => a + b, 0);

/**
 * Phần giao diện chính của nhân viên (sau khi đã tải dữ liệu): menu bên trái, các mục (Tổng quan, Bàn giao kho,
 * Đơn đặt chỗ, Kho tại cơ sở, Trả kho, Việc được giao, Nhật ký), đổi cơ sở (nếu làm nhiều cơ sở), lọc / sắp xếp / phân trang.
 * Không tự gọi API ghi dữ liệu: mọi thao tác đi qua các hàm on... do StaffPortal truyền vào;
 * riêng danh sách phân trang gọi GET /api/operations/reservations | units qua useOpsList.
 * Được gọi bởi: StaffPortal.
 * @param {object} props
 * @param {object} props.staff nhân viên hiện tại (facilityId = tên/mã cơ sở đang chọn).
 * @param {object[]} props.facilities các cơ sở nhân viên được phân công.
 * @param {Function} props.onSwitchFacility đổi cơ sở đang làm.
 * @param {object} props.db dữ liệu vận hành đã chuẩn hóa (mapOperationsState).
 * @param {Function} props.onLogout đăng xuất.
 * @param {Function} props.onRefresh tải lại dữ liệu.
 * @param {Function} props.onHandover (id, payload) => Promise, bàn giao kho.
 * @param {Function} props.onConfirm (id) => Promise, xác nhận đơn đã cọc.
 * @param {Function} props.onUnitStatus (unitId, status) => Promise, đổi trạng thái kho.
 * @param {Function} props.onReportUnit (payload) => Promise, gửi báo cáo sự cố kho.
 * @returns {JSX.Element}
 */
function Portal({ staff, facilities, onSwitchFacility, db, onLogout, onRefresh, onHandover, onConfirm, onUnitStatus, onReportUnit }) {
  const [section, setSection] = useState("overview"); // mục đang mở (khóa trong NAV)
  const [query, setQuery] = useState(""); // ô tìm kiếm đơn
  const [selectedId, setSelectedId] = useState(null); // id đơn đang xem chi tiết
  const [dayFilter, setDayFilter] = useState("today"); // bộ lọc mục Bàn giao: today | overdue | upcoming | all
  // Kho đang gọi API đổi trạng thái (để khóa ô chọn)
  const [unitBusy, setUnitBusy] = useState("");
  const [reportUnit, setReportUnit] = useState(null); // kho đang mở form báo cáo sự cố
  // Bộ lọc của "Đơn đặt chỗ" và "Kho tại cơ sở" (lọc / chia trang ở backend), và của "Việc được giao" (ở frontend)
  const [allStatus, setAllStatus] = useState("");
  const [allSort, setAllSort] = useState("newest");
  const [unitQuery, setUnitQuery] = useState("");
  const [unitStatus, setUnitStatus] = useState("");
  const [unitSort, setUnitSort] = useState("newest");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [taskTypeFilter, setTaskTypeFilter] = useState("");
  const [taskSort, setTaskSort] = useState("date_asc");
  const [selectedTask, setSelectedTask] = useState(null); // việc đang mở TaskDetailModal
  const dialog = useDialog();

  const facility = db.facilities.find((f) => f.id === staff.facilityId);
  // Các đơn thuộc cơ sở của nhân viên.
  const mine = useMemo(() => db.reservations.filter((r) => r.facilityId === staff.facilityId), [db, staff]);
  const today = todayStr();
  // Khóa sắp xếp theo lịch hẹn (ngày + khung giờ; chưa hẹn xếp cuối).
  const sortKey = (r) => `${r.appointmentDate || "9999"}${r.appointmentTime || ""}`;
  // So sánh 2 đơn theo lịch hẹn.
  const bySort = (a, b) => sortKey(a).localeCompare(sortKey(b));
  // Lọc đơn theo ô tìm kiếm (mã đơn, khách, email, mã kho).
  const matches = (r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.id, resCode(r), r.customerName, r.customerEmail, ...unitsOf(r)].some((v) => String(v ?? "").toLowerCase().includes(q));
  };

  // Đơn cần bàn giao (đã cọc, chưa bàn giao) MÀ MÌNH PHỤ TRÁCH, sắp theo lịch hẹn rồi chia theo ngày hẹn.
  // Hệ thống tự phân công nên mỗi nhân viên chỉ thấy đơn được giao cho mình.
  const awaiting = useMemo(() => mine.filter((r) => AWAITING.includes(r.status) && isAssignedToMe(db, r)).sort(bySort), [mine, db]);
  const groups = {
    today: awaiting.filter((r) => dayGroup(r, today) === "today"),
    overdue: awaiting.filter((r) => dayGroup(r, today) === "overdue"),
    upcoming: awaiting.filter((r) => dayGroup(r, today) === "upcoming"),
    all: awaiting,
  };
  const handoverVisible = groups[dayFilter].filter(matches);
  const allVisible = [...mine].sort(bySort).filter(matches);

  // Việc cần xử lý ngay = hôm nay + quá hẹn; counts: số liệu cho mục Tổng quan
  // (sẵn sàng bàn giao / còn vướng điều kiện / số lần bàn giao hôm nay theo nhật ký).
  const actionable = [...groups.overdue, ...groups.today];
  const facilityActivity = db.activity.filter((a) => a.facilityId === staff.facilityId);
  const counts = {
    ready: actionable.filter((r) => checkHandover(r, staff, db).canHandover).length,
    blocked: actionable.filter((r) => !checkHandover(r, staff, db).canHandover).length,
    doneToday: facilityActivity.filter((a) => a.at && fmtISO(new Date(a.at)) === today).length,
  };
  const units = db.units.filter((u) => u.facilityId === staff.facilityId);
  const freeUnits = units.filter((u) => u.status === "AVAILABLE").length;

  // Đơn đặt chỗ: backend lọc + chia trang (GET /api/operations/reservations), chỉ tải khi đang mở mục "all"
  const allList = useOpsList("reservations", {
    q: query, status: allStatus, sort: allSort, facilityId: facility?.facilityId,
    reloadKey: db, fallbackRows: mine, enabled: section === "all" && facility?.facilityId != null,
  });
  // Kho tại cơ sở: backend lọc + chia trang (GET /api/operations/units), chỉ tải khi đang mở mục "units"
  const unitList = useOpsList("units", {
    q: unitQuery, status: unitStatus, sort: unitSort, facilityId: facility?.facilityId,
    reloadKey: db, fallbackRows: units, enabled: section === "units" && facility?.facilityId != null,
  });
  // Bàn giao kho: danh sách nhỏ (đơn giao cho mình) -> chia trang ở frontend
  const handoverPaging = useClientPaging(handoverVisible, { resetKey: `${dayFilter}|${query}` });
  // Số việc được giao chưa xong tại cơ sở này (hiện cạnh mục "Việc được giao")
  const pendingTasks = (db.staffTasks || []).filter((t) =>
    (t.facilityName === staff.facilityId || (facility?.facilityId != null && Number(t.facilityId) === Number(facility.facilityId))) &&
    t.status !== "Completed" && t.status !== "Cancelled"
  ).length;

  // Đơn đang chọn: tìm trong đơn của cơ sở, không có thì tìm trong trang danh sách server.
  const selected = mine.find((r) => r.id === selectedId) || allList.items.find((r) => r.id === selectedId) || null;

  // Gói các hàm thao tác truyền xuống ReservationDetail.
  const actions = { handover: (id, access) => onHandover(id, access), confirm: (id) => onConfirm(id) };

  // Việc được giao tại cơ sở đang chọn (tải cùng state, xem loadState trong StaffPortal)
  const rawTasks = (db.staffTasks || []).filter((t) =>
    t.facilityName === staff.facilityId ||
    (facility?.facilityId != null && Number(t.facilityId) === Number(facility.facilityId))
  );
  const tasksError = db.staffTasksError || "";

  // Đếm số việc được giao theo trạng thái.
  const taskStatusCounts = useMemo(() => {
    const counts = {};
    for (const t of rawTasks) {
      const st = t.status || "";
      if (st) counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [rawTasks]);

  // Đếm số việc được giao theo loại việc.
  const taskTypeCounts = useMemo(() => {
    const counts = {};
    for (const t of rawTasks) {
      const tp = t.taskType || "";
      if (tp) counts[tp] = (counts[tp] || 0) + 1;
    }
    return counts;
  }, [rawTasks]);

  // Lọc + sắp xếp việc được giao theo từ khóa, trạng thái, loại việc và kiểu sắp xếp.
  const filteredTasks = useMemo(() => {
    let list = rawTasks;
    if (taskQuery.trim()) {
      const q = taskQuery.toLowerCase().trim();
      list = list.filter((t) =>
        (t.unitNumber || "").toLowerCase().includes(q) ||
        (t.reservationCode || "").toLowerCase().includes(q) ||
        (t.customerName || "").toLowerCase().includes(q) ||
        (t.customerPhone || "").includes(q) ||
        (t.customerEmail || "").toLowerCase().includes(q)
      );
    }
    if (taskStatusFilter && taskStatusFilter !== "all") {
      list = list.filter((t) => t.status === taskStatusFilter);
    }
    if (taskTypeFilter && taskTypeFilter !== "all") {
      list = list.filter((t) => t.taskType === taskTypeFilter);
    }
    return [...list].sort((a, b) => {
      if (taskSort === "date_asc") {
        const da = a.scheduledDate || "";
        const db = b.scheduledDate || "";
        return da.localeCompare(db);
      }
      if (taskSort === "date_desc") {
        const da = a.scheduledDate || "";
        const db = b.scheduledDate || "";
        return db.localeCompare(da);
      }
      if (taskSort === "newest_created") {
        return (new Date(b.createdAt || 0)).getTime() - (new Date(a.createdAt || 0)).getTime();
      }
      if (taskSort === "unit_asc") {
        return (a.unitNumber || "").localeCompare(b.unitNumber || "");
      }
      return 0;
    });
  }, [rawTasks, taskQuery, taskStatusFilter, taskTypeFilter, taskSort]);

  // Chia trang ở frontend cho "Việc được giao" (đổi bộ lọc thì về trang 1) và "Nhật ký".
  const taskPaging = useClientPaging(filteredTasks, { resetKey: `${taskQuery}|${taskStatusFilter}|${taskTypeFilter}|${taskSort}` });
  const logPaging = useClientPaging(facilityActivity);

  /**
   * Khi chọn trạng thái mới ở ô trạng thái của 1 kho (mục "Kho tại cơ sở"): hỏi xác nhận rồi đổi trạng thái;
   * lỗi thì hiện hộp thoại báo lỗi.
   * API: PUT /api/staff-tools/units/{unitId}/status (qua onUnitStatus)
   */
  const changeUnitStatus = async (unit, nextStatus) => {
    const option = STAFF_UNIT_STATUS_OPTIONS.find((o) => o.value === nextStatus);
    if (!option) return;
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Đổi trạng thái kho ${unit.id}?`,
      message: `Kho ${unit.id} sẽ chuyển sang "${option.label}".`,
      confirmLabel: "Đổi trạng thái"
    });
    if (!ok) return;
    setUnitBusy(unit.id);
    try {
      await onUnitStatus(unit.unitId, nextStatus);
    } catch (err) {
      void dialog.alert({ tone: "danger", title: "Không đổi được trạng thái kho", message: err.message });
    } finally {
      setUnitBusy("");
    }
  };
  // Mở chi tiết 1 đơn trong màn hình Bàn giao kho (bỏ lọc ngày); dùng khi bấm 1 dòng "Việc cần làm hôm nay" ở Tổng quan.
  const open = (id) => { setSelectedId(id); setDayFilter("all"); setSection("today"); };

  // Tiêu đề đầu trang theo mục đang mở: [nhãn nhỏ, tiêu đề, mô tả].
  const HEAD = {
    overview: ["STAFF DASHBOARD", `Xin chào, ${staff.fullName}!`, `Nhận kho và bàn giao cho khách tại ${facility?.name || staff.facilityId}.`],
    today: ["CHECK-IN & HANDOVER", "Bàn giao kho", "Đơn đã cọc được giao cho bạn: kiểm tra điều kiện và bàn giao kho cho khách theo lịch hẹn."],
    all: ["RESERVATIONS", "Đơn đặt chỗ", "Toàn bộ đơn đặt chỗ tại cơ sở. Đơn mới đặt nằm đầu danh sách và được tô vàng."],
    units: ["FACILITY UNITS", "Kho tại cơ sở", "Kiểm tra kho và báo cáo khi phát hiện sự cố. Kho hư hỏng tự chuyển sang Bảo trì."],
    returns: ["MOVE-OUT & INSPECTION", "Trả kho & kiểm kho", "Nhận lại kho khách trả, kiểm tra tình trạng và quyết toán tiền cọc."],
    tasks: ["MY TASKS", "Việc được giao", "Các công việc nhận kho, trả kho, kiểm tra được giao cho bạn."],
    log: ["ACTIVITY LOG", "Nhật ký bàn giao", "Lịch sử bàn giao kho tại cơ sở của bạn."],
  }[section];
  const initial = staff.fullName.trim().split(" ").pop().charAt(0).toUpperCase(); // chữ cái avatar (chữ đầu của tên)

  // Nút lọc theo ngày hẹn của mục "Bàn giao kho".
  const dayChips = (
    <div className="st-chips">
      {[
        ["today", `Hôm nay ${groups.today.length}`],
        ["overdue", `Quá hẹn ${groups.overdue.length}`],
        ["upcoming", `Sắp tới ${groups.upcoming.length}`],
        ["all", `Tất cả ${groups.all.length}`],
      ].map(([key, label]) => (
        <button key={key} type="button" className={dayFilter === key ? "active" : ""} onClick={() => setDayFilter(key)}>{label}</button>
      ))}
    </div>
  );

  // Trang nhân viên: menu trái + nội dung theo mục
  return (
    <div className="customer-layout">
      {/* Menu trái */}
      <aside className="customer-sidebar">
        <div className="customer-brand">
          <span className="brand-mark">S</span>
          <div><strong>StoreSpace</strong><small>Staff Portal</small></div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">{initial}</div>
          <div><strong>{staff.fullName}</strong><small>Facility Staff · {facility?.name || staff.facilityId}</small></div>
        </div>

        {facilities.length > 1 && (
          <label className="st-facility-switch">
            <small>Cơ sở đang làm việc</small>
            <select className="st-input" value={staff.facilityId} onChange={(e) => { setSelectedId(null); onSwitchFacility(e.target.value); }}>
              {facilities.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        )}

        <nav className="customer-nav">
          {NAV.map(([key, icon, label, hint]) => {
            const count = key === "today" ? actionable.length : key === "tasks" ? pendingTasks : 0;
            return (
              <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)} title={hint}>
                <span>{icon}</span>{label}
                {count > 0 && <span className="st-nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="customer-sidebar-bottom">
          <button type="button" onClick={onRefresh}><span>↻</span>Làm mới đặt chỗ</button>
          <button type="button" onClick={onLogout}><span>↪</span>Đăng xuất</button>
        </div>
      </aside>

      {/* Nội dung chính */}
      <main className="customer-main">
        {/* Thanh trên: cơ sở, ngày, làm mới */}
        <div className="customer-topbar">
          <div>
            <span className="customer-eyebrow">{HEAD[0]}</span>
            <h1>{HEAD[1]}</h1>
            <p>{HEAD[2]}</p>
          </div>
          <button type="button" className="customer-profile-button" onClick={() => setSection("overview")}>{initial}</button>
        </div>

        {/* TỔNG QUAN: 4 thẻ số liệu + danh sách việc hôm nay / quá hẹn */}
        {section === "overview" && (
          <div>
            <section className="customer-stats">
              <div className="customer-stat-card"><span className="stat-icon">▣</span><small>Sẵn sàng bàn giao</small><strong>{counts.ready}</strong><span className="stat-note">Hôm nay & quá hẹn</span></div>
              <div className="customer-stat-card"><span className="stat-icon yellow">◷</span><small>Chưa đủ điều kiện</small><strong>{counts.blocked}</strong><span className="stat-note warning">Cần xử lý</span></div>
              <div className="customer-stat-card"><span className="stat-icon blue">✓</span><small>Đã bàn giao</small><strong>{counts.doneToday}</strong><span className="stat-note">Hôm nay</span></div>
              <div className="customer-stat-card"><span className="stat-icon">◴</span><small>Kho còn trống</small><strong>{freeUnits}</strong><span className="stat-note">Tại {facility?.name || staff.facilityId}</span></div>
            </section>

            <section className="customer-section">
              <div className="customer-section-heading">
                <div><span className="customer-eyebrow">TODAY</span><h2>Việc cần làm hôm nay</h2></div>
                <button type="button" className="overview-text-button" onClick={() => { setDayFilter("today"); setSection("today"); }}>Mở màn hình bàn giao →</button>
              </div>
              <div className="st-card st-todo-card">
                {actionable.length === 0 && <div className="st-empty">Hôm nay chưa có khách cần nhận kho.</div>}
                {actionable.map((r) => (
                  <button type="button" key={r.id} className="st-todo" onClick={() => open(r.id)}>
                    <span className="st-time">{r.appointmentTime}</span>
                    <span className="st-todo-main"><strong>{r.customerName}</strong><small className="st-todo-codes"><Code kind="order">{resCode(r)}</Code><UnitCodes units={unitsOf(r)} max={3} /><span>{r.unitType}</span></small></span>
                    <DayTag res={r} today={today} />
                    <Badge map={RES_STATUS} value={r.status} />
                    <span className="st-go">→</span>
                  </button>
                ))}
              </div>
              {groups.upcoming.length > 0 && (
                <p className="st-hint">Sắp tới còn {groups.upcoming.length} đơn chờ nhận kho (xem trong mục Nhận kho → Sắp tới).</p>
              )}
            </section>
          </div>
        )}

        {/* BÀN GIAO KHO (lọc + chia trang ở frontend) và ĐƠN ĐẶT CHỖ (lọc + chia trang ở backend) */}
        {section === "today" && (
          <Workspace list={handoverPaging.pageRows} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} chips={dayChips}
            pager={handoverPaging.pagerProps} emptyText="Không có đơn nào cần bàn giao trong nhóm này." />
        )}
        {/* Mục Đơn đặt chỗ */}
        {section === "all" && (
          <Workspace list={allList.items} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions}
            chips={<FilterChips options={STAFF_RES_FILTERS} value={allStatus} onChange={setAllStatus} counts={allList.statusCounts} total={sumCounts(allList.statusCounts)} className="st-chips-row" />}
            toolbar={<div className="ss-toolbar st-list-toolbar"><SortSelect value={allSort} onChange={setAllSort} options={RESERVATION_SORTS} /></div>}
            pager={allList.pagerProps} loading={allList.loading} error={allList.error} />
        )}

        {/* KHO TẠI CƠ SỞ: bảng kho, đổi trạng thái (changeUnitStatus), nút "Báo cáo" mở UnitReportModal */}
        {section === "units" && (
          <div className="st-card">
            <div className="ss-toolbar" style={{ flexWrap: "wrap", gap: "8px" }}>
              <input className="ss-search ss-grow" placeholder="Tìm mã kho, loại kho, khu, tầng" value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} />
              <SortSelect value={unitSort} onChange={setUnitSort} options={UNIT_SORTS} />
              {unitList.items.length > 0 && (
                <button
                  type="button"
                  className="dashboard-secondary-btn sm"
                  onClick={() => markAllItemsSeen(unitList.items.map((u) => u.id))}
                  title="Tắt toàn bộ nhãn Mới và màu da của danh sách kho"
                >
                  ✓ Tắt nhãn Mới
                </button>
              )}
            </div>
            <FilterChips options={STAFF_UNIT_FILTERS} value={unitStatus} onChange={setUnitStatus} counts={unitList.statusCounts} total={sumCounts(unitList.statusCounts)} className="st-chips-row" />
            {unitList.error && <div className="ss-error-line" role="alert">{unitList.error}</div>}
            <table className="st-table">
              <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Vị trí</th><th>Giá thuê / tháng</th><th>Trạng thái</th><th>Đổi trạng thái</th><th>Báo cáo</th></tr></thead>
              <tbody>
                {unitList.loading && unitList.items.length === 0 && <tr><td colSpan="8" className="st-empty">Đang tải danh sách kho…</td></tr>}
                {!unitList.loading && unitList.items.length === 0 && <tr><td colSpan="8" className="st-empty">{units.length === 0 ? "Cơ sở chưa có kho." : "Không có kho phù hợp bộ lọc."}</td></tr>}
                {unitList.items.map((u) => ( // 1 dòng kho
                  <tr
                    key={u.id}
                    className={rowClass(u.createdAt, "", u.id)}
                    onClick={() => markItemSeen(u.id)}
                    style={{ cursor: "pointer" }}
                    title="Bấm vào kho để đánh dấu đã xem (tắt Mới)"
                  >
                    <td><Code kind="unit">{u.id}</Code> <NewBadge createdAt={u.createdAt} id={u.id} /></td><td>{u.type}</td><td>{u.size || "—"}</td>
                    <td>{[u.zone && `Khu ${u.zone}`, u.floor && `Tầng ${u.floor}`].filter(Boolean).join(" · ") || "—"}</td>
                    <td><b>{fmtMoney(u.pricePerMonth)}</b></td>
                    <td><Badge map={UNIT_STATUS} value={u.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {STAFF_EDITABLE_UNIT.includes(u.status) && u.unitId != null ? (
                        <select className="st-input st-unit-status" value="" disabled={unitBusy === u.id} onChange={(e) => changeUnitStatus(u, e.target.value)}>
                          <option value="">{unitBusy === u.id ? "Đang lưu..." : "Chọn trạng thái mới"}</option>
                          {STAFF_UNIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : <span className="st-hint">Kho đang có đơn hoặc ngừng dùng</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {u.unitId != null && u.status !== "INACTIVE"
                        ? <button type="button" className="dashboard-secondary-btn sm" onClick={() => setReportUnit(u)}>Báo cáo</button>
                        : <span className="st-hint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...unitList.pagerProps} unit="kho" />
          </div>
        )}

        {/* TRẢ KHO & KIỂM KHO: toàn bộ nằm trong features/return/StaffReturns.jsx */}
        {section === "returns" && <StaffReturns staff={staff} />}

        {/* VIỆC ĐƯỢC GIAO: tìm kiếm, lọc theo trạng thái / loại việc, bấm 1 dòng mở TaskDetailModal */}
        {section === "tasks" && (
          <div className="st-card">
            <div className="ss-toolbar" style={{ flexWrap: "wrap", gap: "8px" }}>
              <input
                className="ss-search ss-grow"
                placeholder="Tìm mã kho, mã đơn, tên hoặc SĐT khách..."
                value={taskQuery}
                onChange={(e) => setTaskQuery(e.target.value)}
              />
              <SortSelect value={taskSort} onChange={setTaskSort} options={TASK_SORTS} />
              {filteredTasks.length > 0 && (
                <button
                  type="button"
                  className="dashboard-secondary-btn sm"
                  onClick={() => markAllItemsSeen(filteredTasks.map((t) => t.taskId))}
                  title="Tắt toàn bộ nhãn Mới giao của danh sách việc hiện tại"
                >
                  ✓ Tắt nhãn Mới
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "10px 0 14px" }}>
              <FilterChips
                options={TASK_STATUS_FILTERS}
                value={taskStatusFilter}
                onChange={setTaskStatusFilter}
                counts={taskStatusCounts}
                total={rawTasks.length}
                className="st-chips-row"
              />
              <FilterChips
                options={TASK_TYPE_FILTERS}
                value={taskTypeFilter}
                onChange={setTaskTypeFilter}
                counts={taskTypeCounts}
                total={rawTasks.length}
                className="st-chips-row"
              />
            </div>

            {tasksError && <div className="st-alert st-warn" role="alert">{tasksError}</div>}

            <table className="st-table">
              <thead>
                <tr>
                  <th>Ngày hẹn</th>
                  <th>Loại việc</th>
                  <th>Kho</th>
                  <th>Đơn / Khách</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "center", width: "90px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan="6" className="st-empty">
                      {rawTasks.length === 0 ? "Bạn chưa được giao việc nào tại cơ sở này." : "Không tìm thấy công việc phù hợp với bộ lọc."}
                    </td>
                  </tr>
                )}
                {taskPaging.pageRows.map((t) => ( // 1 dòng việc được giao
                  <tr
                    key={t.taskId}
                    className={rowClass(t.createdAt, "st-clickable-row", t.taskId)}
                    onClick={() => {
                      markItemSeen(t.taskId);
                      setSelectedTask(t);
                    }}
                    style={{ cursor: "pointer" }}
                    title="Bấm để xem chi tiết công việc"
                  >
                    <td>
                      <b>{fmtDate(t.scheduledDate)}</b>
                      {t.scheduledSlot || t.scheduledTime ? ` · ${t.scheduledSlot || t.scheduledTime}` : ""}
                      <NewBadge createdAt={t.createdAt} id={t.taskId} label="Mới giao" />
                      {t.handoverMethod === "Online" && t.taskType === "Move In" ? (
                        <span className="st-cell-sub">Bàn giao online · chìa để ở lễ tân</span>
                      ) : ""}
                    </td>
                    <td>{TASK_TYPE[t.taskType] || t.taskType}</td>
                    <td><Code kind="unit">{t.unitNumber}</Code></td>
                    <td>
                      <Code kind="order">{t.reservationCode || (t.reservationId ? formatReservationCode(t.reservationId) : null)}</Code>
                      {t.customerName ? <span className="st-cell-sub">{t.customerName}</span> : ""}
                      {t.customerPhone || t.customerEmail ? (
                        <span className="st-cell-sub">
                          {t.customerPhone ? <a href={`tel:${t.customerPhone}`} onClick={(e) => e.stopPropagation()}>{t.customerPhone}</a> : null}
                          {t.customerPhone && t.customerEmail ? " · " : ""}
                          {t.customerEmail ? <a href={`mailto:${t.customerEmail}`} onClick={(e) => e.stopPropagation()}>{t.customerEmail}</a> : null}
                        </span>
                      ) : ""}
                    </td>
                    <td><Badge map={TASK_STATUS} value={t.status} /></td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="dashboard-secondary-btn sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markItemSeen(t.taskId);
                          setSelectedTask(t);
                        }}
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...taskPaging.pagerProps} unit="việc" />
          </div>
        )}

        {/* Hộp thoại chi tiết việc */}
        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onGoToReservation={(resId) => {
              setSection("all");
              setSelectedId(resId);
            }}
          />
        )}

        {/* Hộp thoại báo cáo kho */}
        {reportUnit && (
          <UnitReportModal
            unit={reportUnit}
            onClose={() => setReportUnit(null)}
            onSubmit={async (body) => {
              const response = await onReportUnit(body);
              setReportUnit(null);
              const text = [response?.message, response?.warning].filter(Boolean).join(" ");
              void dialog.alert({ tone: response?.warning ? "warning" : "success", title: "Đã gửi báo cáo", message: text || "Đã ghi báo cáo kho." });
            }}
          />
        )}

        {/* NHẬT KÝ BÀN GIAO tại cơ sở (db.activity), chia trang ở frontend */}
        {section === "log" && (
          <div className="st-card">
            {facilityActivity.length === 0 && <div className="st-empty">Chưa có lần bàn giao nào.</div>}
            <ul className="st-log">
              {logPaging.pageRows.map((a) => (
                <li key={a.id} className={rowClass(a.at)}><small><b>{fmtDateTime(a.at)}</b> · {a.staffName} <NewBadge createdAt={a.at} /></small><div>{a.text}</div></li>
              ))}
            </ul>
            <Pager {...logPaging.pagerProps} unit="lượt" />
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Root ---------- */
/* Dùng phiên đăng nhập của trang (currentUser) và API vận hành của backend. */
/** Khóa localStorage lưu cơ sở nhân viên chọn làm việc gần nhất (khi được phân công nhiều cơ sở). */
const FACILITY_KEY = "storespace_staff_facility";

/**
 * Component gốc trang nhân viên (route /staff): tải dữ liệu vận hành, xác định cơ sở đang làm (có thể nhiều cơ sở,
 * lựa chọn lưu ở localStorage), cung cấp các hàm gọi API ghi dữ liệu cho Portal; tài khoản không phải nhân viên
 * đang hoạt động thì hiện NoAccess.
 * API: xem loadState, handover, confirmReservation, reportUnitCondition, updateUnitStatus bên dưới.
 * Được gọi bởi: App.jsx (import tên StaffPortal) khi người dùng mở /staff.
 * @param {object} [props]
 * @param {boolean} [props.embedded=false] (hiện không dùng trong thân hàm).
 * @param {object} [props.currentUser] người dùng đăng nhập ({ email, role }).
 * @param {Function} [props.navigate] hàm chuyển trang của App.
 * @param {string} [props.currentUserKey] khóa localStorage lưu phiên đăng nhập (xóa khi đăng xuất).
 * @returns {JSX.Element}
 */
export default function StaffPortal({ embedded = false, currentUser = null, navigate = null, currentUserKey = "storespace_current_user" } = {}) {
  const [db, setDb] = useState({ facilities: [], units: [], reservations: [], activity: [], staff: [] }); // dữ liệu vận hành đã chuẩn hóa
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Cơ sở đang chọn, đọc lại từ localStorage khi mở trang
  const [facilityChoice, setFacilityChoice] = useState(() => {
    try { return localStorage.getItem(FACILITY_KEY) || ""; } catch { return ""; }
  });

  /**
   * Tải dữ liệu: trạng thái vận hành -> tự phân công đơn chưa có người -> đồng bộ phí trễ hạn -> việc được giao,
   * rồi lưu vào state db. Không phải FACILITY_STAFF thì dừng ngay.
   * silent = true thì tải ngầm, không che trang (dùng sau bàn giao / xác nhận / đổi trạng thái).
   * Gọi khi: mở trang (useEffect), bấm "Thử lại" / tải lại, và sau mỗi thao tác ghi dữ liệu.
   * API: GET /api/operations/state, POST /api/manager-tools/facilities/{id}/auto-assign,
   *      POST /api/late-fees/facilities/{id}/sync, GET /api/staff-tools/tasks
   */
  const loadState = async ({ silent = false } = {}) => {
    if (!currentUser?.email || currentUser.role !== "FACILITY_STAFF") {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/api/operations/state?email=${encodeURIComponent(currentUser.email)}`);
      // Tự phân công đơn đã cọc chưa có người ở các cơ sở mình làm việc, rồi mới tải việc của mình (lỗi bỏ qua)
      const mapped = mapOperationsState(data);
      const myFacilityNames = (mapped.staff || [])
        .filter((s) => s.email?.toLowerCase() === currentUser.email.toLowerCase() && s.status?.toLowerCase() === "active")
        .map((s) => s.facilityId);
      const facilityIds = (mapped.facilities || [])
        .filter((f) => myFacilityNames.includes(f.id) && f.facilityId != null)
        .map((f) => f.facilityId);
      await Promise.all(facilityIds.map((id) => apiPost(`/api/manager-tools/facilities/${id}/auto-assign`, {}).catch(() => null)));
      // Cập nhật phí trễ hạn tiền thuê của cơ sở tới hôm nay (lỗi không chặn trang)
      await Promise.all(facilityIds.map((id) => apiPost(`/api/late-fees/facilities/${id}/sync`, {}).catch(() => null)));
      // Việc Manager giao cho mình: dùng để kiểm tra quyền bàn giao và hiện mục "Việc được giao" (lỗi lưu vào staffTasksError)
      let staffTasks = [];
      let staffTasksError = "";
      try {
        const taskData = await apiGet("/api/staff-tools/tasks");
        staffTasks = Array.isArray(taskData) ? taskData : [];
      } catch (taskError) {
        staffTasksError = taskError.message;
      }
      setDb({ ...mapped, staffTasks, staffTasksError });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Chạy khi mở trang và khi đổi tài khoản (email / role đổi): tải dữ liệu vận hành.
  useEffect(() => {
    loadState();
  }, [currentUser?.email, currentUser?.role]);

  // Một nhân viên có thể được phân công ở nhiều cơ sở: lấy các phân công đang hoạt động của tài khoản,
  // chọn cơ sở theo facilityChoice (không có thì cơ sở đầu tiên) và tạo đối tượng staff cho Portal.
  const assignments = db.staff.filter(item =>
    item.email?.toLowerCase() === currentUser?.email?.toLowerCase() &&
    item.status?.toLowerCase() === "active"
  );
  const facilities = [...new Set(assignments.map(a => a.facilityId))];
  const assignment = assignments.find(a => a.facilityId === facilityChoice) || assignments[0];
  const staff = assignment ? {
    id: assignment.id,
    fullName: assignment.fullName,
    email: assignment.email,
    facilityId: assignment.facilityId,
    role: "FACILITY_STAFF"
  } : null;

  // Khi chọn cơ sở khác ở ô "Cơ sở đang làm việc": đổi cơ sở và nhớ lựa chọn vào localStorage.
  const switchFacility = (facilityId) => {
    setFacilityChoice(facilityId);
    try { localStorage.setItem(FACILITY_KEY, facilityId); } catch { /* bỏ qua */ }
  };

  // Khi bấm "Đăng xuất": xóa phiên (currentUserKey) khỏi localStorage và về trang chủ.
  const logout = () => {
    localStorage.removeItem(currentUserKey);
    navigate("/");
  };
  /**
   * Bàn giao kho rồi tải lại ngầm. Backend kiểm tra phân công và điều kiện, tự sinh mã truy cập & KEY-<mã kho>.
   * API: POST /api/staff-tools/handover  body { reservationID, notes, unitConditionConfirmed, conditionResult, evidenceImages }
   * Được gọi bởi: ReservationDetail (doHandover, retryHandover) qua actions.handover.
   * @param {number|string} reservationId mã đơn.
   * @param {object} [payload] { notes, unitConditionConfirmed, conditionResult, evidenceImages }.
   * @returns {Promise<object>} phản hồi backend ({ message, ... }).
   */
  const handover = async (reservationId, payload = {}) => {
    // Bàn giao qua API có kiểm tra phân công (hệ thống tự sinh AccessCode & KEY-UnitNumber)
    const response = await apiPost("/api/staff-tools/handover", {
      reservationID: Number(reservationId),
      notes: payload?.notes || "",
      unitConditionConfirmed: payload?.unitConditionConfirmed ?? true,
      conditionResult: payload?.conditionResult || "Good",
      evidenceImages: payload?.evidenceImages || []
    });
    await loadState({ silent: true });
    return response;
  };

  /**
   * Xác nhận đơn đã cọc (Paid -> Confirmed + tạo hợp đồng) rồi tải lại ngầm.
   * API: POST /api/staff-tools/reservations/{reservationId}/confirm
   * Được gọi bởi: ReservationDetail (doConfirm) qua actions.confirm.
   * @param {number|string} reservationId mã đơn.
   * @returns {Promise<object>}
   */
  const confirmReservation = async (reservationId) => {
    const response = await apiPost(`/api/staff-tools/reservations/${Number(reservationId)}/confirm`);
    await loadState({ silent: true });
    return response;
  };

  /**
   * Gửi báo cáo tình trạng / sự cố kho rồi tải lại ngầm.
   * API: POST /api/staff-tools/unit-reports  body { unitId, result, notes, evidenceImages }
   * Được gọi bởi: UnitReportModal (qua onReportUnit của Portal).
   * @param {object} body nội dung báo cáo.
   * @returns {Promise<object>}
   */
  const reportUnitCondition = async (body) => {
    const response = await apiPost("/api/staff-tools/unit-reports", body);
    await loadState({ silent: true });
    return response;
  };

  /**
   * Đổi trạng thái kho rồi tải lại ngầm.
   * API: PUT /api/staff-tools/units/{unitId}/status  body { status }
   * Được gọi bởi: changeUnitStatus trong Portal (qua onUnitStatus).
   * @param {number|string} unitId id số của kho.
   * @param {string} status 'Available' | 'Pending Inspection' | 'Maintenance'.
   * @returns {Promise<object>}
   */
  const updateUnitStatus = async (unitId, status) => {
    const response = await apiPut(`/api/staff-tools/units/${Number(unitId)}/status`, { status });
    await loadState({ silent: true });
    return response;
  };

  // Khung gốc trang nhân viên
  return (
    <div className="st-root">
      {loading ? <div className="st-card">Đang tải dữ liệu vận hành từ backend...</div> :
        error ? <div className="st-card"><div className="st-alert st-warn" role="alert">{error}</div><button type="button" className="dashboard-primary-btn" onClick={() => loadState()}>Thử lại</button></div> :
          staff ? <Portal staff={staff} facilities={facilities} onSwitchFacility={switchFacility} db={db} onLogout={logout} onRefresh={() => loadState()} onHandover={handover} onConfirm={confirmReservation} onUnitStatus={updateUnitStatus} onReportUnit={reportUnitCondition} /> :
            <NoAccess navigate={navigate} />}
    </div>
  );
}
