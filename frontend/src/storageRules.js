/*
 * Quy tắc nghiệp vụ dùng chung cho frontend:
 * - Định dạng mã đơn (mã đặt chỗ) thống nhất ở mọi màn hình.
 * - Xác định kho nào đang bị khóa (đã có đơn) để không cho sửa.
 * - Tự sinh mã chi nhánh (tiền tố mã kho) từ tên cơ sở.
 */

/* ---------- Mã đơn ---------- */

export function formatReservationCode(id) {
  if (id === null || id === undefined || id === '') return '—'
  const text = String(id).trim()
  if (/^(RS|RSV)-/i.test(text)) return text.toUpperCase()
  return `RSV-${text}`
}

/* ---------- Trạng thái kho ---------- */

export const UNIT_STATUS_LABELS = {
  AVAILABLE: 'Còn trống',
  BOOKING: 'Đang giữ chỗ chờ cọc',
  RESERVED: 'Đã giữ chỗ',
  RENTED: 'Đang thuê',
  NEEDS_INSPECTION: 'Cần kiểm tra',
  MAINTENANCE: 'Bảo trì',
  INACTIVE: 'Ngừng sử dụng'
}

/* Trạng thái người quản lý được phép tự chọn. Các trạng thái giữ chỗ / đang thuê
   chỉ do hệ thống đặt theo quy trình đặt kho, không chọn tay. */
export const EDITABLE_UNIT_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE']

/* Trạng thái kho cho thấy kho đang gắn với một đơn. */
const LOCKED_UNIT_STATUSES = ['BOOKING', 'RESERVED', 'RENTED']

/* Trạng thái đơn còn hiệu lực (chưa hủy, chưa hết hạn). */
export const ACTIVE_RESERVATION_STATUSES = ['PENDING_PAYMENT', 'PENDING_APPROVAL', 'CONFIRMED', 'HANDED_OVER']

export const RESERVATION_STATUS_LABELS = {
  PENDING_PAYMENT: 'Chờ khách trả cọc',
  PENDING_APPROVAL: 'Đã cọc · Chờ duyệt',
  CONFIRMED: 'Đã phân kho · Chờ bàn giao',
  HANDED_OVER: 'Đang thuê',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn giữ chỗ'
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isReservationActive(reservation) {
  if (!ACTIVE_RESERVATION_STATUSES.includes(reservation.status)) return false
  if (reservation.status === 'PENDING_PAYMENT' && reservation.depositExpiresAt &&
      Date.parse(reservation.depositExpiresAt) <= Date.now()) return false
  const end = String(reservation.endDate || '').slice(0, 10)
  return !end || end >= todayISO()
}

/* Các đơn còn hiệu lực đang gắn với kho, đơn gần nhất trước. */
export function getActiveReservationsForUnit(reservations = [], unit) {
  if (!unit) return []
  return reservations
    .filter(reservation => {
      const unitMatched =
        reservation.assignedUnitId === unit.id ||
        (Array.isArray(reservation.unitNumbers) && reservation.unitNumbers.includes(unit.id))
      return unitMatched &&
        (!unit.facilityId || !reservation.facilityId || reservation.facilityId === unit.facilityId) &&
        isReservationActive(reservation)
    })
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
}

/*
 * Kho bị khóa (không cho sửa) khi đang ở trạng thái giữ chỗ / đang thuê,
 * hoặc đã có đơn còn hiệu lực (kể cả đơn cho kỳ thuê tương lai).
 */
export function getUnitLock(unit, reservations = []) {
  const active = getActiveReservationsForUnit(reservations, unit)
  if (active.length) {
    const first = active[0]
    return {
      locked: true,
      reservation: first,
      reservations: active,
      reason: `Kho đã có đơn ${formatReservationCode(first.reservationCode || first.id)} (${RESERVATION_STATUS_LABELS[first.status] || first.status}). Kho đã đặt thì không được sửa.`
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

const IGNORED_WORDS = new Set(['storespace', 'store', 'space', 'kho', 'co', 'so', 'chi', 'nhanh', 'tp', 'hcm', 'cs', 'luu', 'tru'])

function normalizeWords(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/thanh pho/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

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

/* ---------- Giá thuê ---------- */

export const PRICE_RULES = {
  min: 50000,
  max: 100000000,
  step: 1000,
  warnDeviation: 0.3
}

export function formatVnd(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return new Intl.NumberFormat('vi-VN').format(number)
}

export function parseVnd(text) {
  const digits = String(text ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}

export function roundPrice(value) {
  return Math.round(Number(value) / PRICE_RULES.step) * PRICE_RULES.step
}

export function describeVnd(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} triệu`
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} nghìn`
  return `${n} đồng`
}

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

export function medianPrice(values) {
  const list = values.map(Number).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2)
}

/* ---------- Chính sách thuê hiện hành (Theo SelfStorageDB_test.sql) ---------- */

/* Kỳ hạn thuê hợp lệ trong DB ContractType: 1, 3, 6 hoặc 12 tháng */
export const RENTAL_TERMS = [1, 3, 6, 12]

/* Tiền cọc mặc định = 2 tháng tiền thuê của mỗi kho (theo RentalPolicy.DepositMonths) */
export const DEPOSIT_MONTHS = 2

export function computeDeposit(monthlyPrice, depositMonths = DEPOSIT_MONTHS) {
  const months = Number(depositMonths) >= 1 && Number(depositMonths) <= 2 ? Number(depositMonths) : DEPOSIT_MONTHS
  return Math.round(Number(monthlyPrice || 0) * months)
}
