/**
 * ======================================================================
 * FILE: src/services/priceBands.js  —  KHUNG GIÁ THEO NHÓM KÍCH THƯỚC (S / M / L / V ...)
 * Nghiệp vụ: Business Operations đặt khoảng diện tích + khoảng giá cho từng nhóm (API /api/price-bands);
 * Facility Manager đặt giá cụ thể cho từng cỡ (S1, S2, M1...) và giá đó PHẢI nằm trong khung của nhóm.
 * Dùng ở: BusinessPriceBands, ManagerPriceTable, utils/unitGeometry.
 * ======================================================================
 */
/*
 * Khung giá theo nhóm kích thước (S / M / L / V ...).
 * Business Operations đặt khoảng diện tích + khoảng giá cho từng nhóm;
 * Facility Manager đặt giá cụ thể cho từng size (S1, S2...) trong khoảng đó.
 */
import { formatVnd } from './storageRules'

/**
 * Lấy mã nhóm kích thước từ chuỗi kích thước, ví dụ "M2: 2x3m" -> "M" (không khớp -> null).
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

/* { ok, error } — giá phải nằm trong khung của nhóm (nhóm chưa có khung thì không chặn). */
/**
 * Kiểm tra giá quản lý nhập có nằm trong khung giá của nhóm không (nhóm chưa có khung thì không chặn).
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

