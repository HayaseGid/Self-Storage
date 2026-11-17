/**
 * ======================================================================
 * FILE: src/services/priceBands.js  —  KHUNG GIÁ THEO NHÓM KÍCH THƯỚC (S / M / L / V ...)
 * CHỨC NĂNG: Business Operations đặt khoảng diện tích + khoảng giá cho từng nhóm kích thước;
 *   Facility Manager đặt giá cụ thể cho từng cỡ (S1, S2, M1...) và giá đó PHẢI nằm trong khung của nhóm.
 *   File chứa các hàm thuần để lấy mã nhóm, tính diện tích, tìm khung giá, kiểm tra giá trong khung và định dạng hiển thị.
 * THÀNH PHẦN CHÍNH:
 *   - getBandCode      : "M2: 2x3m" -> "M".
 *   - getArea          : tính diện tích m² từ volume hoặc chuỗi kích thước.
 *   - findBand         : tìm khung giá của nhóm theo chuỗi kích thước.
 *   - checkPriceInBand : kiểm tra giá có nằm trong khung không.
 *   - formatArea / formatBandPrice : định dạng "6 m²" / "a đ – b đ".
 * DÙNG Ở: src/pages/business/BusinessPriceBands.jsx, src/pages/manager/ManagerPriceTable.jsx,
 *   src/utils/unitGeometry.js (getBandCode).
 * PHỤ THUỘC: ./storageRules (formatVnd).
 * API: Không gọi API (danh sách khung giá do trang tải rồi truyền vào).
 * LUỒNG: Manager nhập giá cho size ở ManagerPriceTable -> checkPriceInBand(bands, dimensions, price)
 *   -> ngoài khung thì hiện câu lỗi, trong khung mới cho lưu.
 * ======================================================================
 */
import { formatVnd } from './storageRules'

/**
 * Lấy mã nhóm kích thước từ chuỗi kích thước, ví dụ "M2: 2x3m" -> "M" (không khớp -> null).
 * @param {string} dimensions chuỗi kích thước.
 * @returns {string|null} mã nhóm viết hoa.
 */
export function getBandCode(dimensions) {
  const match = /^\s*([A-Za-z]+)\s*\d*\s*:/.exec(String(dimensions || ''))
  return match ? match[1].toUpperCase() : null
}

/**
 * Tính diện tích (m²) của kho: ưu tiên `volume` nếu có, không thì tính dài×rộng từ chuỗi kích thước,
 * hoặc lấy con số đầu tiên.
 * @param {string} dimensions ví dụ "M2: 2x3m".
 * @param {number|null} volume diện tích có sẵn.
 * @returns {number|null}
 */
export function getArea(dimensions, volume = null) {
  if (Number(volume) > 0) return Number(volume)
  let text = String(dimensions || '')
  const colon = text.indexOf(':')
  if (colon >= 0) text = text.slice(colon + 1)
  const rect = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(text)
  // Đổi chuỗi số (cho phép dấu phẩy thập phân) thành Number.
  const num = value => Number(String(value).replace(',', '.'))
  if (rect) return num(rect[1]) * num(rect[2])
  const single = /(\d+(?:[.,]\d+)?)/.exec(text)
  return single ? num(single[1]) : null
}

/**
 * Tìm khung giá của nhóm tương ứng với chuỗi kích thước.
 * @param {object[]} bands danh sách khung giá.
 * @param {string} dimensions chuỗi kích thước, ví dụ "M2: 2x3m".
 * @returns {object|null} khung giá { code, name, minPrice, maxPrice, ... }.
 */
export function findBand(bands = [], dimensions) {
  const code = getBandCode(dimensions)
  return code ? bands.find(band => String(band.code).toUpperCase() === code) || null : null
}

/**
 * Định dạng diện tích để hiển thị (ví dụ 6 -> "6 m²", null -> "—").
 */
export const formatArea = value => (value == null ? '—' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m²`)
/**
 * Định dạng khoảng giá của khung: "minPrice đ – maxPrice đ".
 */
export const formatBandPrice = band => `${formatVnd(band.minPrice)}đ – ${formatVnd(band.maxPrice)}đ`

/**
 * Kiểm tra giá quản lý nhập có nằm trong khung giá của nhóm không (nhóm chưa có khung thì không chặn).
 * Được gọi bởi ManagerPriceTable khi Manager nhập / lưu giá cho 1 size.
 * @param {object[]} bands danh sách khung giá.
 * @param {string} dimensions chuỗi kích thước của size.
 * @param {number|string} price giá/tháng đang nhập.
 * @returns {{ok:boolean, band:object|null, error?:string}}
 */
export function checkPriceInBand(bands, dimensions, price) {
  const band = findBand(bands, dimensions)
  if (!band || price == null || price === '') return { ok: true, band }
  const value = Number(price)
  if (value < Number(band.minPrice) || value > Number(band.maxPrice)) {
    return {
      ok: false,
      band,
      error: `Giá size ${dimensions} phải nằm trong khung nhóm ${band.code} (${band.name}): ${formatBandPrice(band)}/tháng. Khung này do Business Operations đặt.`
    }
  }
  return { ok: true, band }
}

