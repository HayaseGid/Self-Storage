/**
 * ======================================================================
 * FILE: src/store/bookingDraft.js  —  BẢN NHÁP ĐẶT KHO CỦA KHÁCH CHƯA ĐĂNG NHẬP (localStorage, sống 24 giờ)
 * Luồng: khách xem kho -> bấm "Đặt kho" khi chưa đăng nhập -> saveBookingDraft() lưu lựa chọn
 * (cơ sở, kho, ngày bắt đầu, số tháng...) -> chuyển /login?next=... -> đăng nhập/đăng ký xong
 * -> App đọc loadBookingDraft() để đưa khách về đúng trang đặt kho và điền sẵn form.
 * Bản nháp KHÔNG giữ chỗ kho trong database. Không gọi API.
 * Dùng ở: App.jsx.
 * ======================================================================
 */
/*
 * Vùng lưu trữ tạm cho đơn đặt kho của khách chưa đăng nhập.
 *
 * Khi khách xem kho rồi bấm "Đặt kho" mà chưa đăng nhập, thông tin đang chọn
 * (cơ sở, kho, ngày bắt đầu, số tháng, chu kỳ thanh toán) được lưu ở đây.
 * Sau khi đăng nhập hoặc đăng ký xong, hệ thống đọc lại để đưa khách về đúng
 * trang đặt kho và điền sẵn form.
 *
 * Lưu ý: bản nháp chỉ nằm trên trình duyệt, KHÔNG giữ chỗ kho trong database.
 * Kho chỉ được giữ (10 phút) khi khách đã đăng nhập và bấm "Xác nhận đặt kho".
 */

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
 * @returns {object|null}
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

/*
 * Lưu (hoặc gộp) bản nháp. Nếu bản nháp cũ cùng kho thì giữ lại các trường
 * đã chọn trước đó, chỉ ghi đè những trường được truyền vào.
 */
/**
 * Lưu (hoặc gộp) bản nháp. Nếu bản nháp cũ cùng kho thì giữ các trường đã chọn trước,
 * chỉ ghi đè các trường được truyền vào (bỏ trường undefined).
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
 */
export function draftMatchesUnit(draft, facilityId, unitId) {
  return !!draft &&
    String(draft.facilityId) === String(facilityId) &&
    String(draft.unitId).toLowerCase() === String(unitId).toLowerCase()
}

/* Chỉ chấp nhận đường dẫn nội bộ để tránh chuyển hướng ra trang ngoài. */
/**
 * Đọc tham số ?next= trên URL; chỉ chấp nhận đường dẫn nội bộ (bắt đầu bằng "/", không phải "//")
 * để tránh bị chuyển hướng ra trang ngoài.
 * @returns {string|null}
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
 */
export function withNext(path, next) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}
