/*
 * Kích thước hình học của một kho, đọc từ chuỗi size của backend, ví dụ "S2: Kho 2 x 2 m", "L1: Kho 4 x 6 m",
 * "S1: Tủ nhỏ 1.5 x 1.5 m", "V1: Kho xe 8 x 4 m".
 * Chiều cao chỉ dùng để VẼ 3D (không dùng để so sánh / tính giá): theo chiều cao chuẩn của nhóm size.
 */
import { getBandCode } from './priceBands'

const STANDARD_HEIGHT = { S: 2.5, M: 2.5, L: 2.5, V: 3.5 }
const LOCKER_HEIGHT = 2.0

export const BAND_LABELS = {
  S: 'Small · kho nhỏ',
  M: 'Medium · kho vừa',
  L: 'Large · kho lớn',
  V: 'Vehicle · kho xe'
}
export const BAND_ORDER = ['S', 'M', 'L', 'V']

const num = value => Number(String(value).replace(',', '.'))

export function unitGeometry(unit) {
  const text = String(unit?.size || '')
  const band = getBandCode(text) || 'S'
  const label = text.includes(':') ? text.slice(text.indexOf(':') + 1).trim() : text
  const code = text.includes(':') ? text.slice(0, text.indexOf(':')).trim() : band
  const rect = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(label)
  let a = rect ? num(rect[1]) : 2
  let b = rect ? num(rect[2]) : 2
  if (!(a > 0)) a = 2
  if (!(b > 0)) b = 2
  // Chiều dài luôn >= chiều rộng.
  const length = Math.max(a, b)
  const width = Math.min(a, b)
  const isLocker = /tủ|locker/i.test(label)
  const height = isLocker ? LOCKER_HEIGHT : (STANDARD_HEIGHT[band] || 2.5)
  return {
    band,
    code,
    label,
    width,
    length,
    height,
    isLocker,
    area: Math.round(width * length * 100) / 100,
    volume: Math.round(width * length * height * 100) / 100
  }
}

export const formatMeters = value => `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m`

/* Trạng thái hiển thị trên sơ đồ. */
export function unitPlanStatus(unit) {
  const status = String(unit?.status || '').toLowerCase()
  if (unit?.available) return 'free'
  if (status === 'maintenance' || status === 'inactive') return 'off'
  return 'rented'
}
