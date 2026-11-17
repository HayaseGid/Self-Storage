/**
 * ======================================================================
 * FILE: src/features/unit/boxCounts.js  —  LƯU & CHUẨN HÓA "ĐỒ CỦA BẠN"
 * CHỨC NĂNG: Quản lý object counts = số đồ khách đã nhập:
 *     { 'box-s', 'box-m', 'box-l', 'box-custom', mattress, fridge, shelf, motorbike: số lượng,
 *       customSize: { w, d, h } (cm, kích thước thùng tự nhập) }.
 *   Lưu trong sessionStorage (chỉ trong tab đang mở), dùng chung giữa cửa sổ xem kho 3D và bộ lọc ở trang Tìm kho,
 *   để khách nhập 1 lần rồi xem nhiều kho. Kèm hàm đổi qua lại với tham số URL (?items=box-m.500,fridge.1&cs=50x40x30)
 *   để chia sẻ / giữ bộ lọc khi tải lại trang.
 * THÀNH PHẦN CHÍNH:
 *   - DEFAULT_BOX_COUNTS: mặc định 10 thùng vừa.
 *   - normalizeBoxCounts: ép mọi số lượng về số nguyên >= 0, kích thước thùng tự nhập hợp lệ.
 *   - loadBoxCounts / saveBoxCounts: đọc / ghi sessionStorage (khóa 'storespace.boxCounts').
 *   - countsFromParams / writeCountsParams: đọc / ghi tham số URL items, cs.
 * DÙNG Ở: src/App.jsx, features/unit/ItemCountsInput.jsx, features/unit/Unit3DViewer.jsx.
 * PHỤ THUỘC: utils/packing.js (COUNT_KEYS, CUSTOM_BOX_KEY, DEFAULT_CUSTOM_SIZE).
 * API: Không gọi API.
 * LUỒNG: khách nhập số lượng ở ItemCountsInput -> onChange(counts) -> nơi dùng gọi saveBoxCounts (sessionStorage)
 *   và/hoặc writeCountsParams (URL) -> lần sau mở trang / mở kho khác: loadBoxCounts hoặc countsFromParams đọc lại.
 * ======================================================================
 */
import { COUNT_KEYS, CUSTOM_BOX_KEY, DEFAULT_CUSTOM_SIZE } from '../../utils/packing'

const STORAGE_KEY = 'storespace.boxCounts' // khóa trong sessionStorage
export const DEFAULT_BOX_COUNTS = normalizeBoxCounts({ 'box-m': 10 }) // mặc định khi khách chưa nhập: 10 thùng vừa

/**
 * Chuẩn hóa kích thước thùng tự nhập: làm tròn thành số nguyên, kẹp trong 5–300 cm; trống / sai thì dùng mặc định.
 * @param {{w,d,h}} size @returns {{w:number, d:number, h:number}}
 */
function normalizeCustomSize(size) {
  const out = {}
  ;['w', 'd', 'h'].forEach(dim => {
    const n = Math.round(Number(size?.[dim]))
    out[dim] = Number.isFinite(n) && n > 0 ? Math.min(300, Math.max(5, n)) : DEFAULT_CUSTOM_SIZE[dim]
  })
  return out
}

/**
 * Chuẩn hóa counts: mọi loại trong COUNT_KEYS có số lượng là số nguyên không âm (thiếu = 0), customSize hợp lệ.
 * Được gọi ở mọi hàm đọc/ghi trong file này và bởi ItemCountsInput trước khi hiển thị.
 * @param {object} value counts thô (có thể thiếu trường hoặc là chuỗi).
 * @returns {object} counts đầy đủ.
 */
export function normalizeBoxCounts(value) {
  const out = {}
  COUNT_KEYS.forEach(key => { out[key] = Math.max(0, Math.floor(Number(value?.[key]) || 0)) })
  out.customSize = normalizeCustomSize(value?.customSize)
  return out
}

/**
 * Đọc đồ đã lưu từ sessionStorage (khóa 'storespace.boxCounts'); không có hoặc trình duyệt chặn thì trả mặc định.
 * @returns {object} counts.
 */
export function loadBoxCounts() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeBoxCounts(JSON.parse(raw))
  } catch { /* trình duyệt chặn lưu trữ: dùng mặc định */ }
  return normalizeBoxCounts(DEFAULT_BOX_COUNTS)
}

/**
 * Lưu đồ khách vừa nhập vào sessionStorage (đã chuẩn hóa). Lỗi lưu trữ thì bỏ qua.
 * @param {object} counts
 */
export function saveBoxCounts(counts) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBoxCounts(counts)))
  } catch { /* bỏ qua nếu không lưu được */ }
}

/**
 * Đọc counts từ tham số URL: items=box-m.500,fridge.1 và cs=50x40x30 (kích thước thùng tự nhập, cm).
 * Key không có trong COUNT_KEYS bị bỏ qua.
 * @param {URLSearchParams} params
 * @returns {object} counts đã chuẩn hóa.
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
 * Sửa trực tiếp object qs truyền vào, không trả gì.
 * @param {URLSearchParams} qs @param {object} counts
 */
export function writeCountsParams(qs, counts) {
  const value = normalizeBoxCounts(counts)
  const items = COUNT_KEYS.filter(key => value[key] > 0).map(key => `${key}.${value[key]}`).join(',')
  if (items) qs.set('items', items)
  if (value[CUSTOM_BOX_KEY] > 0) qs.set('cs', `${value.customSize.w}x${value.customSize.d}x${value.customSize.h}`)
}
