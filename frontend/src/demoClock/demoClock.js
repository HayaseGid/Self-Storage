/**
 * ======================================================================
 * FILE: src/demoClock/demoClock.js  —  TIỆN ÍCH "ĐỒNG HỒ GIẢ LẬP" (DEMO CLOCK / TIME TRAVEL)
 * CHỨC NĂNG: Cho phép chọn một ngày giả lập để demo / kiểm thử các nghiệp vụ phụ thuộc thời gian
 *   (quá hạn, phí trễ, gia hạn, hết hạn hợp đồng...) mà không phải đợi ngày thật. Ngày giả lập lưu ở
 *   localStorage key 'storespace_demo_date' (YYYY-MM-DD); api.js đọc ngày này và gửi header
 *   'X-Simulated-Date' cho backend (backend dùng BusinessClock.Today). Mọi chỗ ở frontend cần "hôm nay"
 *   nên gọi getTodayISO() / getTodayDate() thay vì new Date().
 * THÀNH PHẦN CHÍNH:
 *   - DEMO_DATE_STORAGE_KEY, SIMULATED_DATE_HEADER : hằng số key localStorage và tên header.
 *   - getTodayISO / getTodayDate : "hôm nay" của hệ thống (có tính giả lập).
 *   - getRealTodayISO / getSimulatedDateISO : ngày thật / ngày giả lập đang lưu.
 *   - setSimulatedDateISO / clearSimulatedDate : bật-đổi / tắt giả lập.
 *   - formatISODate / addDaysISO / addMonthsISO / formatDateVN : tiện ích ngày.
 * DÙNG Ở: src/api/api.js (header), src/demoClock/DemoClockWidget.jsx, src/App.jsx,
 *   src/services (storageRules, customerNoticeData), src/components/common/RentalCalendar.jsx,
 *   src/features/contract/ContractCard.jsx, src/features/return/StaffReturns.jsx,
 *   src/pages (customer/CartPage, manager/FacilityManagerAccount, staff/FacilityStaffAccount,
 *   business/BusinessPanels, business/BusinessPolicyEditor).
 * PHỤ THUỘC: localStorage.
 * API: Không gọi API (chỉ cung cấp giá trị header cho src/api/api.js).
 * LUỒNG: Người demo chọn ngày ở DemoClockWidget -> setSimulatedDateISO() lưu localStorage -> tải lại trang
 *   -> mọi request qua apiRequest() gắn X-Simulated-Date -> backend tính theo ngày giả lập; frontend
 *   getTodayISO() cũng trả ngày giả lập.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   pad: Thêm số 0 phía trước cho đủ 2 chữ số (5 -> "05"), dùng khi định dạng ngày/tháng → dùng ở: formatISODate
 *   formatISODate: Định dạng đối tượng Date thành chuỗi 'YYYY-MM-DD' theo giờ địa phương → dùng ở: getRealTodayISO, addDaysISO, addMonthsISO
 *   getRealTodayISO: Trả về ngày THẬT hôm nay dạng 'YYYY-MM-DD' (không tính giả lập) → dùng ở: getTodayISO, setSimulatedDateISO; DemoClockWidget.jsx (DemoClockWidget)
 *   getSimulatedDateISO: Đọc ngày giả lập đang lưu trong localStorage → dùng ở: getTodayISO; api.js (apiRequest), DemoClockWidget.jsx (DemoClockWidget)
 *   getTodayISO: Trả về "hôm nay" của hệ thống: ngày giả lập nếu có, không thì ngày thật → dùng ở: getTodayDate, addDaysISO, addMonthsISO; DemoClockWidget.jsx (toggleOpen), StaffReturns.jsx (todayIso), BusinessPanels.jsx (BusinessReportsCenter) +4
 *   getTodayDate: Giống getTodayISO() nhưng trả về đối tượng Date (00:00:00 giờ địa phương) → dùng ở: App.jsx (getRestoredBookingForm, BookingPage +1), RentalCalendar.jsx (RentalCalendar), ContractCard.jsx (daysFromToday) +2
 *   setSimulatedDateISO: Bật/đổi ngày giả lập. Nếu truyền chuỗi rỗng, sai định dạng hoặc trùng ngày thật thì TẮT giả lập → dùng ở: DemoClockWidget.jsx (handleConfirm)
 *   clearSimulatedDate: Tắt chế độ giả lập ngày (xóa key khỏi localStorage) -> hệ thống quay về ngày thật → dùng ở: DemoClockWidget.jsx (handleResetToday)
 *   addDaysISO: Cộng/trừ số ngày vào một ngày ISO → dùng ở: DemoClockWidget.jsx (DemoClockWidget)
 *   addMonthsISO: Cộng số tháng vào một ngày ISO; nếu tháng đích ngắn hơn thì lấy ngày cuối tháng (ví dụ 31/01 + 1 tháng -> 28/02 hoặc 29/02) → dùng ở: DemoClockWidget.jsx (DemoClockWidget)
 *   formatDateVN: Đổi 'YYYY-MM-DD' sang định dạng hiển thị Việt Nam 'DD/MM/YYYY' (sai định dạng -> '—') → dùng ở: DemoClockWidget.jsx (DemoClockWidget)
 */

export const DEMO_DATE_STORAGE_KEY = 'storespace_demo_date'
export const SIMULATED_DATE_HEADER = 'X-Simulated-Date'

// Mẫu kiểm tra chuỗi ngày đúng dạng 'YYYY-MM-DD'.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Thêm số 0 phía trước cho đủ 2 chữ số (5 -> "05"), dùng khi định dạng ngày/tháng.
 */
const pad = n => String(n).padStart(2, '0')

/**
 * Định dạng đối tượng Date thành chuỗi 'YYYY-MM-DD' theo giờ địa phương.
 * @param {Date} date
 * @returns {string}
 */
export function formatISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Trả về ngày THẬT hôm nay dạng 'YYYY-MM-DD' (không tính giả lập).
 */
export function getRealTodayISO() {
  return formatISODate(new Date())
}

/**
 * Đọc ngày giả lập đang lưu trong localStorage. Được gọi bởi apiRequest() (src/api/api.js) ở MỌI request.
 * @returns {string|null} 'YYYY-MM-DD' nếu đang bật giả lập và hợp lệ, ngược lại null.
 */
export function getSimulatedDateISO() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DEMO_DATE_STORAGE_KEY)?.trim()
    return raw && ISO_DATE_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * Trả về "hôm nay" của hệ thống: ngày giả lập nếu có, không thì ngày thật. Dạng 'YYYY-MM-DD'.
 * Được dùng bởi storageRules, các trang Manager/Staff/Business khi so sánh ngày.
 * @returns {string}
 */
export function getTodayISO() {
  return getSimulatedDateISO() || getRealTodayISO()
}

/**
 * Giống getTodayISO() nhưng trả về đối tượng Date (00:00:00 giờ địa phương).
 * Được dùng bởi App.jsx, CartPage, RentalCalendar, ContractCard, customerNoticeData.
 * @returns {Date}
 */
export function getTodayDate() {
  const [y, m, d] = getTodayISO().split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/**
 * Bật/đổi ngày giả lập. Nếu truyền chuỗi rỗng, sai định dạng hoặc trùng ngày thật thì TẮT giả lập.
 * @param {string} iso ngày muốn giả lập 'YYYY-MM-DD'.
 * Ghi localStorage. Được gọi khi bấm "Xác nhận" trong DemoClockWidget.
 */
export function setSimulatedDateISO(iso) {
  if (typeof window === 'undefined') return
  const clean = String(iso || '').trim()
  try {
    if (!clean || !ISO_DATE_RE.test(clean) || clean === getRealTodayISO()) {
      localStorage.removeItem(DEMO_DATE_STORAGE_KEY)
    } else {
      localStorage.setItem(DEMO_DATE_STORAGE_KEY, clean)
    }
  } catch {
    // bỏ qua nếu trình duyệt chặn localStorage
  }
}

/**
 * Tắt chế độ giả lập ngày (xóa key khỏi localStorage) -> hệ thống quay về ngày thật.
 * Được gọi khi bấm "Về hôm nay" trong DemoClockWidget.
 */
export function clearSimulatedDate() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DEMO_DATE_STORAGE_KEY)
  } catch {
    // bỏ qua
  }
}

/**
 * Cộng/trừ số ngày vào một ngày ISO. Nếu baseIso sai định dạng thì lấy "hôm nay" làm gốc.
 * @param {string} baseIso 'YYYY-MM-DD'
 * @param {number} days số ngày (âm để lùi lại).
 * @returns {string} 'YYYY-MM-DD'
 */
export function addDaysISO(baseIso, days) {
  const [y, m, d] = (ISO_DATE_RE.test(baseIso) ? baseIso : getTodayISO()).split('-').map(Number)
  const next = new Date(y, m - 1, d + Number(days || 0))
  return formatISODate(next)
}

/**
 * Cộng số tháng vào một ngày ISO; nếu tháng đích ngắn hơn thì lấy ngày cuối tháng
 * (ví dụ 31/01 + 1 tháng -> 28/02 hoặc 29/02). Dùng cho các nút nhảy nhanh của DemoClockWidget.
 * @param {string} baseIso 'YYYY-MM-DD' (sai định dạng -> lấy "hôm nay").
 * @param {number} months số tháng cần cộng.
 * @returns {string} 'YYYY-MM-DD'
 */
export function addMonthsISO(baseIso, months) {
  const [y, m, d] = (ISO_DATE_RE.test(baseIso) ? baseIso : getTodayISO()).split('-').map(Number)
  const targetMonth = m - 1 + Number(months || 0)
  const lastDay = new Date(y, targetMonth + 1, 0).getDate()
  const next = new Date(y, targetMonth, Math.min(d, lastDay))
  return formatISODate(next)
}

/**
 * Đổi 'YYYY-MM-DD' sang định dạng hiển thị Việt Nam 'DD/MM/YYYY' (sai định dạng -> '—').
 * @param {string} iso ngày ISO. @returns {string}
 */
export function formatDateVN(iso) {
  if (!iso || !ISO_DATE_RE.test(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

