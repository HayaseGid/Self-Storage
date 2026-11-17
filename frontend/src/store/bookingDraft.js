/**
 * ======================================================================
 * FILE: src/store/bookingDraft.js  —  BẢN NHÁP ĐẶT KHO CỦA KHÁCH CHƯA ĐĂNG NHẬP
 * CHỨC NĂNG: Khi khách xem kho rồi bấm "Đặt kho" mà chưa đăng nhập, lựa chọn đang có (cơ sở, kho,
 *   ngày bắt đầu, số tháng, chu kỳ thanh toán) được lưu vào localStorage (sống tối đa 24 giờ). Đăng nhập /
 *   đăng ký xong, App đọc lại để đưa khách về đúng trang đặt kho và điền sẵn form. Kèm tiện ích đọc /
 *   gắn tham số ?next= an toàn. Bản nháp KHÔNG giữ chỗ kho trong database; kho chỉ được giữ khi khách đã
 *   đăng nhập và bấm "Xác nhận đặt kho".
 * THÀNH PHẦN CHÍNH:
 *   - loadBookingDraft / saveBookingDraft / clearBookingDraft : đọc / lưu (gộp) / xóa bản nháp.
 *   - draftMatchesUnit : bản nháp có đúng của kho đang xem không.
 *   - getSafeNextPath / withNext : đọc ?next= (chỉ đường dẫn nội bộ) / gắn ?next= vào đường dẫn.
 * DÙNG Ở: src/App.jsx.
 * PHỤ THUỘC: localStorage key 'storespace_booking_draft'.
 * API: Không gọi API.
 * LUỒNG: Khách chưa đăng nhập bấm "Đặt kho" -> saveBookingDraft({ facilityId, unitId, path, ... })
 *   -> chuyển withNext('/login', path) -> đăng nhập xong -> getSafeNextPath() + loadBookingDraft()
 *   -> về trang đặt kho, điền sẵn form -> đặt xong clearBookingDraft().
 * ======================================================================
 */

// Key localStorage của bản nháp và thời gian sống tối đa.
const BOOKING_DRAFT_KEY = 'storespace_booking_draft'
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000 // giữ bản nháp tối đa 24 giờ

/**
 * Đọc bản nháp thô từ localStorage (lỗi parse -> null).
 */
function readRaw() {
  try {
    return JSON.parse(localStorage.getItem(BOOKING_DRAFT_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Lấy bản nháp hợp lệ (có unitId, path và chưa quá 24 giờ); quá hạn thì tự xóa.
 * Được gọi bởi App.jsx sau khi đăng nhập / khi mở trang đặt kho, và bởi saveBookingDraft.
 * @returns {object|null} bản nháp { facilityId, unitId, path, savedAt, ... } hoặc null.
 */
export function loadBookingDraft() {
  const draft = readRaw()
  if (!draft || typeof draft !== 'object' || !draft.unitId || !draft.path) return null
  if (!draft.savedAt || Date.now() - Date.parse(draft.savedAt) > DRAFT_TTL_MS) {
    clearBookingDraft()
    return null
  }
  return draft
}

/**
 * Lưu (hoặc gộp) bản nháp. Nếu bản nháp cũ cùng kho thì giữ các trường đã chọn trước,
 * chỉ ghi đè các trường được truyền vào (bỏ trường undefined).
 * Được gọi bởi App.jsx khi khách chưa đăng nhập bấm "Đặt kho" hoặc đổi lựa chọn trên form.
 * @param {object} partial phải có unitId và path.
 * @returns {object|null} bản nháp sau khi lưu.
 */
export function saveBookingDraft(partial) {
  if (!partial?.unitId || !partial?.path) return null
  const existing = loadBookingDraft()
  const sameUnit = existing &&
    String(existing.facilityId) === String(partial.facilityId) &&
    String(existing.unitId).toLowerCase() === String(partial.unitId).toLowerCase()

  const cleaned = Object.fromEntries(
    Object.entries(partial).filter(([, value]) => value !== undefined)
  )
  const draft = {
    ...(sameUnit ? existing : {}),
    ...cleaned,
    savedAt: new Date().toISOString()
  }

  try {
    localStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Trình duyệt chặn lưu trữ: bỏ qua, luồng đăng nhập vẫn chạy bình thường.
  }
  return draft
}

/**
 * Xóa bản nháp đặt kho.
 */
export function clearBookingDraft() {
  try {
    localStorage.removeItem(BOOKING_DRAFT_KEY)
  } catch {
    // bỏ qua
  }
}

/**
 * Kiểm tra bản nháp có đúng là của kho đang xem (cùng cơ sở, cùng mã kho, không phân biệt hoa thường).
 * @param {object|null} draft bản nháp. @param {number|string} facilityId mã cơ sở. @param {string} unitId mã kho.
 * @returns {boolean} true nếu khớp (App dùng để quyết định có điền sẵn form không).
 */
export function draftMatchesUnit(draft, facilityId, unitId) {
  return !!draft &&
    String(draft.facilityId) === String(facilityId) &&
    String(draft.unitId).toLowerCase() === String(unitId).toLowerCase()
}

/**
 * Đọc tham số ?next= trên URL; chỉ chấp nhận đường dẫn nội bộ (bắt đầu bằng "/", không phải "//")
 * để tránh bị chuyển hướng ra trang ngoài (open redirect).
 * @param {string} search chuỗi query (mặc định window.location.search).
 * @returns {string|null} đường dẫn an toàn hoặc null.
 */
export function getSafeNextPath(search = window.location.search) {
  try {
    const next = new URLSearchParams(search).get('next')
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
    return next
  } catch {
    return null
  }
}

/**
 * Gắn tham số ?next= vào đường dẫn (vd withNext('/login', '/facility/1') -> '/login?next=%2Ffacility%2F1').
 * @param {string} path đường dẫn đích (vd '/login'). @param {string} [next] đường dẫn quay lại sau đó.
 * @returns {string} đường dẫn đã gắn ?next= (giữ nguyên nếu next rỗng).
 */
export function withNext(path, next) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}
