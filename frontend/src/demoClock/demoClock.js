/*
 * Tiện ích giả lập ngày hệ thống (Time Travel / Demo Clock) phục vụ báo cáo & kiểm thử.
 * - Lưu ngày giả lập (YYYY-MM-DD) trong localStorage.
 * - Mọi request qua api.js tự động gửi kèm header "X-Simulated-Date" xuống Backend (BusinessClock.Today).
 */

export const DEMO_DATE_STORAGE_KEY = 'storespace_demo_date'
export const SIMULATED_DATE_HEADER = 'X-Simulated-Date'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const pad = n => String(n).padStart(2, '0')

export function formatISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getRealTodayISO() {
  return formatISODate(new Date())
}

export function getSimulatedDateISO() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(DEMO_DATE_STORAGE_KEY)?.trim()
    return raw && ISO_DATE_RE.test(raw) ? raw : null
  } catch {
    return null
  }
}

export function getTodayISO() {
  return getSimulatedDateISO() || getRealTodayISO()
}

export function getTodayDate() {
  const [y, m, d] = getTodayISO().split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

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

export function clearSimulatedDate() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(DEMO_DATE_STORAGE_KEY)
  } catch {
    // bỏ qua
  }
}

export function addDaysISO(baseIso, days) {
  const [y, m, d] = (ISO_DATE_RE.test(baseIso) ? baseIso : getTodayISO()).split('-').map(Number)
  const next = new Date(y, m - 1, d + Number(days || 0))
  return formatISODate(next)
}

export function addMonthsISO(baseIso, months) {
  const [y, m, d] = (ISO_DATE_RE.test(baseIso) ? baseIso : getTodayISO()).split('-').map(Number)
  const targetMonth = m - 1 + Number(months || 0)
  const lastDay = new Date(y, targetMonth + 1, 0).getDate()
  const next = new Date(y, targetMonth, Math.min(d, lastDay))
  return formatISODate(next)
}

export function formatDateVN(iso) {
  if (!iso || !ISO_DATE_RE.test(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

