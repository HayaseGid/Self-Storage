/*
 * Khung giá theo nhóm kích thước (S / M / L / V ...).
 * Business Operations đặt khoảng diện tích + khoảng giá cho từng nhóm;
 * Facility Manager đặt giá cụ thể cho từng size (S1, S2...) trong khoảng đó.
 */
import { formatVnd } from './storageRules'

export function getBandCode(dimensions) {
  const match = /^\s*([A-Za-z]+)\s*\d*\s*:/.exec(String(dimensions || ''))
  return match ? match[1].toUpperCase() : null
}

export function getArea(dimensions, volume = null) {
  if (Number(volume) > 0) return Number(volume)
  let text = String(dimensions || '')
  const colon = text.indexOf(':')
  if (colon >= 0) text = text.slice(colon + 1)
  const rect = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(text)
  const num = value => Number(String(value).replace(',', '.'))
  if (rect) return num(rect[1]) * num(rect[2])
  const single = /(\d+(?:[.,]\d+)?)/.exec(text)
  return single ? num(single[1]) : null
}

export function findBand(bands = [], dimensions) {
  const code = getBandCode(dimensions)
  return code ? bands.find(band => String(band.code).toUpperCase() === code) || null : null
}

export const formatArea = value => (value == null ? '—' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m²`)
export const formatBandPrice = band => `${formatVnd(band.minPrice)}đ – ${formatVnd(band.maxPrice)}đ`

/* { ok, error } — giá phải nằm trong khung của nhóm (nhóm chưa có khung thì không chặn). */
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

