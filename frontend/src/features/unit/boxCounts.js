/**
 * ======================================================================
 * FILE: src/features/unit/boxCounts.js  —  NHỚ "ĐỒ CỦA BẠN" KHÁCH ĐÃ NHẬP
 * counts = { 'box-s', 'box-m', 'box-l', 'box-custom', mattress, fridge, shelf, motorbike: số lượng,
 *            customSize: { w, d, h } (cm, kích thước thùng tự nhập) }.
 * Lưu trong sessionStorage (chỉ trong tab đang mở), dùng chung giữa cửa sổ xem kho 3D và bộ lọc ở trang Tìm kho,
 * để khách nhập 1 lần rồi xem nhiều kho. Kèm hàm đổi qua lại với tham số URL (?items=box-m.500,fridge.1&cs=50x40x30).
 * ======================================================================
 */
import { COUNT_KEYS, CUSTOM_BOX_KEY, DEFAULT_CUSTOM_SIZE } from '../../utils/packing'

const STORAGE_KEY = 'storespace.boxCounts'
export const DEFAULT_BOX_COUNTS = normalizeBoxCounts({ 'box-m': 10 })

/* Kích thước thùng tự nhập: số nguyên 5–300 cm, sai thì dùng mặc định. */
function normalizeCustomSize(size) {
  const out = {}
  ;['w', 'd', 'h'].forEach(dim => {
    const n = Math.round(Number(size?.[dim]))
    out[dim] = Number.isFinite(n) && n > 0 ? Math.min(300, Math.max(5, n)) : DEFAULT_CUSTOM_SIZE[dim]
  })
  return out
}

/**
 * Chuẩn hóa counts: mọi số lượng là số nguyên không âm, customSize hợp lệ.
 */
export function normalizeBoxCounts(value) {
  const out = {}
  COUNT_KEYS.forEach(key => { out[key] = Math.max(0, Math.floor(Number(value?.[key]) || 0)) })
  out.customSize = normalizeCustomSize(value?.customSize)
  return out
}

/**
 * Đọc đồ đã lưu (không có thì trả mặc định).
 */
export function loadBoxCounts() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeBoxCounts(JSON.parse(raw))
  } catch { /* trình duyệt chặn lưu trữ: dùng mặc định */ }
  return normalizeBoxCounts(DEFAULT_BOX_COUNTS)
}

/**
 * Lưu đồ khách vừa nhập.
 */
export function saveBoxCounts(counts) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBoxCounts(counts)))
  } catch { /* bỏ qua nếu không lưu được */ }
}

/**
 * Đọc counts từ tham số URL: items=box-m.500,fridge.1 và cs=50x40x30 (kích thước thùng tự nhập, cm).
 */
export function countsFromParams(params) {
  const value = {}
  String(params.get('items') || '').split(',').forEach(part => {
    const [key, n] = part.split('.')
    if (COUNT_KEYS.includes(key)) value[key] = n
  })
  const [w, d, h] = String(params.get('cs') || '').split('x')
  value.customSize = { w, d, h }
  return normalizeBoxCounts(value)
}

/**
 * Ghi counts vào URLSearchParams (chỉ ghi món có số lượng; cs chỉ ghi khi có thùng tự nhập).
 */
export function writeCountsParams(qs, counts) {
  const value = normalizeBoxCounts(counts)
  const items = COUNT_KEYS.filter(key => value[key] > 0).map(key => `${key}.${value[key]}`).join(',')
  if (items) qs.set('items', items)
  if (value[CUSTOM_BOX_KEY] > 0) qs.set('cs', `${value.customSize.w}x${value.customSize.d}x${value.customSize.h}`)
}
