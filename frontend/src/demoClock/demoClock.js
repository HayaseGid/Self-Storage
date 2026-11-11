/**
 * ======================================================================
 * FILE: src/demoClock/demoClock.js  —  TIỆN ÍCH "ĐỒNG HỒ GIẢ LẬP" (DEMO CLOCK / TIME TRAVEL)
 * Công dụng: cho phép chọn một ngày giả lập để demo/kiểm thử các nghiệp vụ phụ thuộc thời gian
 * (quá hạn, phí trễ, gia hạn, hết hạn hợp đồng...) mà không phải đợi ngày thật.
 * - Ngày giả lập lưu ở localStorage key 'storespace_demo_date' (dạng YYYY-MM-DD).
 * - api.js đọc ngày này và gửi header 'X-Simulated-Date' cho backend (backend dùng BusinessClock.Today).
 * - Mọi chỗ ở frontend cần "hôm nay" nên gọi getTodayISO()/getTodayDate() thay vì new Date().
 * Được dùng bởi: api/api.js, services/storageRules.js, các trang dashboard, lịch thuê, giỏ hàng...
 * ======================================================================
 */
/*
 * Tiện ích giả lập ngày hệ thống (Time Travel / Demo Clock) phục vụ báo cáo & kiểm thử.
 * - Lưu ngày giả lập (YYYY-MM-DD) trong localStorage.
 * - Mọi request qua api.js tự động gửi kèm header "X-Simulated-Date" xuống Backend (BusinessClock.Today).
 */

export const DEMO_DATE_STORAGE_KEY = 'storespace_demo_date'
export const SIMULATED_DATE_HEADER = 'X-Simulated-Date'

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
 * Đọc ngày giả lập đang lưu trong localStorage.
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
 */
export function getTodayISO() {
  return getSimulatedDateISO() || getRealTodayISO()
}

/**
 * Giống getTodayISO() nhưng trả về đối tượng Date (00:00:00 giờ địa phương).
 */
export function getTodayDate() {
  const [y, m, d] = getTodayISO().split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

/**
 * Bật/đổi ngày giả lập. Nếu truyền chuỗi rỗng, sai định dạng hoặc trùng ngày thật thì TẮT giả lập.
 * @param {string} iso ngày muốn giả lập 'YYYY-MM-DD'.
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
 * (ví dụ 31/01 + 1 tháng -> 28/02 hoặc 29/02).
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
 */
export function formatDateVN(iso) {
  if (!iso || !ISO_DATE_RE.test(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

