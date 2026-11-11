/**
 * ======================================================================
 * FILE: src/services/storageRules.js  —  QUY TẮC NGHIỆP VỤ DÙNG CHUNG (KHÔNG GỌI API)
 * Tương đương: Constants + một phần Services ở backend.
 * Chứa:
 * - Hằng số nghiệp vụ: thời gian giữ chỗ chờ cọc, các kỳ hạn thuê (6/12 tháng), số tháng cọc.
 * - Nhãn tiếng Việt cho trạng thái kho (UnitStatus) và trạng thái đơn (ReservationStatus).
 * - Định dạng mã đơn đặt kho (RS-2026-00012).
 * - Xác định kho có đang bị "khóa" (đã có đơn) để chặn sửa.
 * - Tự sinh tiền tố mã kho theo tên cơ sở, dự đoán mã kho kế tiếp.
 * - Định dạng / kiểm tra giá thuê VNĐ, tính ngày kết thúc hợp đồng, tính tiền cọc.
 * Được import ở rất nhiều nơi (App, các dashboard, hợp đồng, giá...).
 * ======================================================================
 */
/*
 * Quy tắc nghiệp vụ dùng chung cho frontend:
 * - Định dạng mã đơn (mã đặt chỗ) thống nhất ở mọi màn hình.
 * - Xác định kho nào đang bị khóa (đã có đơn) để không cho sửa.
 * - Tự sinh mã chi nhánh (tiền tố mã kho) từ tên cơ sở.
 * - Kiểm tra giá thuê, tiền cọc và kỳ hạn thuê.
 */

import { getTodayISO } from '../demoClock/demoClock'

export const DEPOSIT_HOLD_MINUTES = 15
export const RENTAL_TERMS = [6, 12]
export const DEPOSIT_MONTHS = 2

export const UNIT_TYPE_CODES = {
  'Climate-Control Unit': 'CLM',
  'Drive-up Unit': 'DRV',
  'Basic Unit': 'BSC',
  'Indoor Unit': 'IND'
}

/* ---------- Mã đơn ---------- */

/**
 * Định dạng mã đơn đặt kho thống nhất trên mọi màn hình.
 * Ví dụ: 12 -> "RS-2026-00012"; chuỗi đã có tiền tố RSV-/RS-/RES- thì giữ nguyên (viết hoa);
 * chuỗi khác số -> "RSV-<chuỗi>"; rỗng -> "—".
 * @param {number|string} id mã đơn từ backend.
 * @returns {string}
 */
export function formatReservationCode(id) {
  if (id === null || id === undefined || id === '') return '—'
  const text = String(id).trim()
  if (/^(RSV|RS|RES)-/i.test(text)) return text.toUpperCase()
  const number = Number(text)
  return Number.isFinite(number) ? `RS-2026-${String(number).padStart(5, '0')}` : `RSV-${text}`
}

/* ---------- Trạng thái kho ---------- */

export const UNIT_STATUS_LABELS = {
  AVAILABLE: 'Còn trống',
  BOOKING: 'Đang giữ chỗ chờ cọc',
  RESERVED: 'Đã giữ chỗ',
  RENTED: 'Đang thuê',
  IN_USE: 'Đang thuê',
  PENDING_INSPECTION: 'Chờ kiểm tra',
  NEEDS_INSPECTION: 'Cần kiểm tra',
  MAINTENANCE: 'Bảo trì',
  INACTIVE: 'Ngừng sử dụng'
}

/* Trạng thái người quản lý được phép tự chọn. Các trạng thái giữ chỗ / đang thuê
   chỉ do hệ thống đặt theo quy trình đặt kho, không chọn tay. */
export const EDITABLE_UNIT_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE']

/* Trạng thái kho cho thấy kho đang gắn với một đơn. */
const LOCKED_UNIT_STATUSES = ['BOOKING', 'RESERVED', 'RENTED', 'IN_USE']

/* Trạng thái đơn còn hiệu lực (chưa hủy, chưa hết hạn). */
export const ACTIVE_RESERVATION_STATUSES = ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'HANDED_OVER']

export const RESERVATION_STATUS_LABELS = {
  PENDING_PAYMENT: 'Chờ khách trả cọc',

  //Đã cập nhật: Vì bỏ luôn phần xét duyệt từ Facility Manager
  PENDING_APPROVAL: 'Đã cọc · Chờ bàn giao',
  CONFIRMED: 'Đã cọc · Chờ bàn giao',
  //Đã sửa: 29/10/2026

  HANDED_OVER: 'Đang thuê',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn giữ chỗ'
}

/**
 * Lấy "hôm nay" dạng 'YYYY-MM-DD' (có tính ngày giả lập của Demo Clock).
 */
function todayISO() {
  return getTodayISO()
}

/**
 * Kiểm tra một đơn đặt kho còn hiệu lực không: trạng thái thuộc ACTIVE_RESERVATION_STATUSES,
 * nếu đang chờ cọc thì chưa quá hạn giữ chỗ, và ngày kết thúc chưa qua.
 * @param {object} reservation đơn đặt kho.
 * @returns {boolean}
 */
function isReservationActive(reservation) {
  if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) return false
  if (reservation.status === 'PENDING_PAYMENT' && reservation.depositExpiresAt &&
      Date.parse(reservation.depositExpiresAt) <= Date.now()) return false
  const end = String(reservation.endDate || '').slice(0, 10)
  return !end || end >= todayISO()
}

/* Các đơn còn hiệu lực đang gắn với kho, đơn gần nhất trước. */
/**
 * Lấy các đơn còn hiệu lực đang gắn với 1 kho (cùng cơ sở), sắp xếp theo ngày bắt đầu tăng dần.
 * @param {object[]} reservations danh sách đơn.
 * @param {object} unit kho cần kiểm tra ({ id, facilityId }).
 * @returns {object[]}
 */
export function getActiveReservationsForUnit(reservations = [], unit) {
  if (!unit) return []
  return reservations
    .filter(reservation =>
      reservation.assignedUnitId === unit.id &&
      (!unit.facilityId || !reservation.facilityId || reservation.facilityId === unit.facilityId) &&
      isReservationActive(reservation))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
}

/*
 * Kho bị khóa (không cho sửa) khi đang ở trạng thái giữ chỗ / đang thuê,
 * hoặc đã có đơn còn hiệu lực (kể cả đơn cho kỳ thuê tương lai).
 */
/**
 * Xác định kho có bị khóa không (khóa = không cho quản lý sửa thông tin kho).
 * Khóa khi: kho đã có đơn còn hiệu lực (kể cả đơn tương lai) HOẶC trạng thái kho là giữ chỗ / đang thuê.
 * @returns {{locked:boolean, reservation:object|null, reservations:object[], reason:string}}
 *   reason = câu giải thích hiển thị cho người dùng.
 */
export function getUnitLock(unit, reservations = []) {
  const active = getActiveReservationsForUnit(reservations, unit)
  if (active.length) {
    const first = active[0]
    return {
      locked: true,
      reservation: first,
      reservations: active,
      reason: `Kho đã có đơn ${formatReservationCode(first.id)} (${RESERVATION_STATUS_LABELS[first.status] || first.status}). Kho đã đặt thì không được sửa.`
    }
  }
  if (LOCKED_UNIT_STATUSES.includes(unit?.status)) {
    return {
      locked: true,
      reservation: null,
      reservations: [],
      reason: `Kho đang ở trạng thái "${UNIT_STATUS_LABELS[unit.status] || unit.status}". Kho đã đặt thì không được sửa.`
    }
  }
  return { locked: false, reservation: null, reservations: [], reason: '' }
}

/* ---------- Mã chi nhánh tự sinh ---------- */

const IGNORED_WORDS = new Set(['storespace', 'store', 'space', 'kho', 'co', 'so', 'chi', 'nhanh', 'tp', 'hcm', 'cs'])

/**
 * Chuẩn hóa tên cơ sở thành mảng từ không dấu, chữ thường (bỏ dấu tiếng Việt, đ->d, bỏ ký tự đặc biệt,
 * bỏ cụm "thành phố") để làm đầu vào sinh mã.
 */
function normalizeWords(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/thanh pho/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/*
 * Sinh mã chi nhánh từ tên cơ sở, ví dụ:
 *   "StoreSpace Thủ Đức"  -> "TD"
 *   "StoreSpace Quận 7"   -> "Q7"
 *   "Kho Bình Thạnh"      -> "BT"
 * Nếu trùng với mã đã có thì thêm số: "TD2", "TD3"...
 */
/**
 * Sinh tiền tố mã kho (mã chi nhánh) từ tên cơ sở, bỏ qua các từ chung (storespace, kho, chi nhánh...).
 * Ví dụ: "StoreSpace Thủ Đức" -> "TD", "StoreSpace Quận 7" -> "Q7".
 * Nếu trùng với tiền tố đã có thì thêm chữ/số phía sau ("Q7B", "TD2"...).
 * @param {string} name tên cơ sở.
 * @param {string[]} existingPrefixes các tiền tố đã dùng.
 * @returns {string} tiền tố tối đa 10 ký tự.
 */
export function generateUnitCodePrefix(name, existingPrefixes = []) {
  const words = normalizeWords(name).filter(word => !IGNORED_WORDS.has(word))
  let base = ''

  const districtIndex = words.findIndex(word => word === 'quan' || word === 'q')
  if (districtIndex >= 0 && /^\d+$/.test(words[districtIndex + 1] || '')) {
    base = `Q${words[districtIndex + 1]}`
  } else if (words.length >= 2) {
    base = words.slice(0, 3).map(word => /^\d+$/.test(word) ? word : word[0]).join('')
  } else if (words.length === 1) {
    base = words[0].slice(0, 2)
  }

  base = base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'CS'
  const taken = new Set(existingPrefixes.filter(Boolean).map(prefix => String(prefix).trim().toUpperCase()))
  if (!taken.has(base)) return base
  if (/\d$/.test(base)) {
    for (const letter of 'BCDEFGHJKLMNPQRSTUVWXYZ') {
      const candidate = `${base}${letter}`.slice(0, 10)
      if (!taken.has(candidate)) return candidate
    }
  }
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`.slice(0, 10)
    if (!taken.has(candidate)) return candidate
  }
  return `${base}${Date.now() % 1000}`.slice(0, 10)
}

/**
 * Lấy mã 3 ký tự của loại kho (Climate-Control Unit -> CLM...). Loại lạ thì lấy chữ cái đầu mỗi từ.
 */
export function getUnitTypeCode(typeName) {
  if (!typeName) return 'UNT'
  if (UNIT_TYPE_CODES[typeName]) return UNIT_TYPE_CODES[typeName]
  const letters = String(typeName)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
  return (letters || 'UNT').slice(0, 3).padEnd(3, 'X')
}

/**
 * Dự đoán mã kho tiếp theo của cơ sở (ví dụ tiền tố "Q7" và đã có Q7-U01..Q7-U05 -> "Q7-U06").
 * Chỉ để xem trước trên form; mã thật do backend sinh.
 * @param {string} unitCodePrefix tiền tố mã kho của cơ sở.
 * @param {object[]} units các kho hiện có.
 */
export function previewNextUnitCode(unitCodePrefix, units = []) {
  const prefix = String(unitCodePrefix || 'FAC').trim().toUpperCase() || 'FAC'
  const codePrefix = `${prefix}-U`
  const maxNumber = units.reduce((max, unit) => {
    const code = String(unit?.id || unit?.unitNumber || '').toUpperCase()
    if (!code.startsWith(codePrefix)) return max
    const parsed = Number.parseInt(code.slice(codePrefix.length), 10)
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max
  }, 0)
  return `${codePrefix}${String(maxNumber + 1).padStart(2, '0')}`
}

/**
 * Tính ngày kết thúc hợp đồng = ngày bắt đầu + số tháng - 1 ngày.
 * Ví dụ 2026-01-15 + 6 tháng -> 2026-07-14.
 * @param {string} startDate 'YYYY-MM-DD'
 * @param {number} months
 * @returns {string} 'YYYY-MM-DD' (rỗng nếu ngày bắt đầu không hợp lệ).
 */
export function calculateEndDate(startDate, months) {
  if (!startDate) return ''
  const [year, month, day] = String(startDate).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

/* ---------- Giá thuê ---------- */

export const PRICE_RULES = {
  min: 50000,
  max: 100000000,
  step: 1000,
  warnDeviation: 0.3
}

/**
 * Định dạng số tiền theo kiểu Việt Nam (1500000 -> "1.500.000"), không kèm đơn vị.
 */
export function formatVnd(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return new Intl.NumberFormat('vi-VN').format(number)
}

/**
 * Đọc chuỗi tiền người dùng nhập (có dấu chấm, chữ...) thành số; không có chữ số -> null.
 */
export function parseVnd(text) {
  const digits = String(text ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

/**
 * Làm tròn giá theo bước giá PRICE_RULES.step (1.000đ).
 */
export function roundPrice(value) {
  return Math.round(Number(value) / PRICE_RULES.step) * PRICE_RULES.step
}

/**
 * Diễn giải số tiền bằng chữ ngắn gọn để người nhập dễ kiểm tra (2500000 -> "2,5 triệu").
 */
export function describeVnd(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn`
  return `${n} đồng`
}

/**
 * Kiểm tra giá thuê theo tháng người quản lý nhập.
 * Lỗi khi: trống/<=0, nhỏ hơn mức tối thiểu, lớn hơn mức tối đa, không chia hết bước giá.
 * Cảnh báo (không chặn) khi lệch quá 30% so với giá tham chiếu.
 * @param {number|string} rawValue giá nhập.
 * @param {number|null} reference giá tham chiếu (ví dụ giá trung vị cùng loại).
 * @returns {{ok:boolean, error:string, warning:string, value:number|null, deviation:number|null}}
 */
export function validateMonthlyPrice(rawValue, reference = null) {
  const value = typeof rawValue === 'number' ? rawValue : parseVnd(rawValue)
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return { ok: false, error: 'Vui lòng nhập giá thuê theo tháng.', warning: '', value: null, deviation: null }
  }
  if (value < PRICE_RULES.min) {
    return {
      ok: false,
      error: `Giá tối thiểu là ${formatVnd(PRICE_RULES.min)}đ/tháng. Có thể bạn gõ thiếu số 0? Ví dụ ${formatVnd(value * 1000)}đ thay vì ${formatVnd(value)}đ.`,
      warning: '',
      value,
      deviation: null
    }
  }
  if (value > PRICE_RULES.max) {
    return { ok: false, error: `Giá tối đa là ${formatVnd(PRICE_RULES.max)}đ/tháng. Kiểm tra lại xem có gõ thừa số 0 không.`, warning: '', value, deviation: null }
  }
  if (value % PRICE_RULES.step !== 0) {
    return { ok: false, error: `Giá phải làm tròn theo ${formatVnd(PRICE_RULES.step)}đ, ví dụ ${formatVnd(roundPrice(value))}đ.`, warning: '', value, deviation: null }
  }
  let warning = ''
  let deviation = null
  if (reference && Number(reference) > 0) {
    deviation = (value - Number(reference)) / Number(reference)
    if (Math.abs(deviation) > PRICE_RULES.warnDeviation) {
      warning = `Giá ${deviation > 0 ? 'cao' : 'thấp'} hơn ${Math.round(Math.abs(deviation) * 100)}% so với giá tham chiếu ${formatVnd(reference)}đ.`
    }
  }
  return { ok: true, error: '', warning, value, deviation }
}

/**
 * Tính giá trung vị của danh sách giá (bỏ giá trị không hợp lệ), dùng làm giá tham chiếu.
 * @returns {number|null}
 */
export function medianPrice(values) {
  const list = values.map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2)
}

/**
 * Tính tiền cọc mặc định = giá thuê tháng × DEPOSIT_MONTHS (2 tháng).
 */
export function computeDeposit(monthlyPrice) {
  return Math.round(Number(monthlyPrice || 0) * DEPOSIT_MONTHS)
}
