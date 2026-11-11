/*
 * Quy tắc khóa chặt khung giá / nhóm size (giống hệt backend PriceBandRulesController.cs).
 * Frontend kiểm tra trước để báo lỗi ngay khi nhập; backend kiểm tra lại khi lưu.
 *
 *  1. 0 < từ < đến (diện tích và giá).
 *  2. Diện tích các nhóm không chồng lên nhau (chạm mép thì được).
 *  3. Nhóm lớn hơn phải có giá sàn VÀ giá trần cao hơn nhóm nhỏ hơn.
 *  4. Nhóm có kho đang được đặt / đang thuê: khóa khung, không ngừng sử dụng (chỉ đổi tên).
 *  5. Nhóm đã có size: khung mới phải chứa hết diện tích các size và giá đang áp dụng tại các cơ sở.
 *  Nhóm xe (V) là nhóm đặc biệt, chỉ so với nhóm đặc biệt.
 */
import { formatVnd } from './storageRules'

const TOL = 0.005
const money = v => `${formatVnd(Number(v) || 0)}đ`
const area = v => `${Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m²`
export const isSpecialBand = code => String(code || '').toUpperCase() === 'V'

/* candidate: { code, minArea, maxArea, minPrice, maxPrice, isActive } (số); current: dòng rules của nhóm đang sửa hoặc null */
export function validateBand(candidate, ruleBands = [], current = null) {
  const c = { ...candidate, code: String(candidate.code || '').trim().toUpperCase() }
  const errors = []
  if (!current && !/^[A-Z]{1,3}$/.test(c.code)) errors.push('Mã nhóm gồm 1–3 chữ cái, ví dụ S, M, L, XL.')
  if (!current && ruleBands.some(b => b.code === c.code)) errors.push(`Nhóm ${c.code} đã tồn tại.`)
  if (!(c.minArea > 0) || !(c.maxArea > c.minArea)) errors.push('Diện tích: "từ" phải lớn hơn 0 và nhỏ hơn "đến".')
  if (!(c.minPrice > 0) || !(c.maxPrice > c.minPrice)) errors.push('Giá: giá thấp nhất phải lớn hơn 0 và nhỏ hơn giá cao nhất.')
  if (errors.length) return errors

  if (current?.locked) {
    const areaChanged = Math.abs(c.minArea - current.minArea) > TOL || Math.abs(c.maxArea - current.maxArea) > TOL
    const priceChanged = c.minPrice !== Number(current.minPrice) || c.maxPrice !== Number(current.maxPrice)
    if (areaChanged || priceChanged) errors.push(`Nhóm ${current.code} đang có ${current.bookedUnitCount} kho được đặt / đang thuê nên không được sửa khung diện tích và giá (chỉ đổi tên).`)
    if (c.isActive === false && current.isActive) errors.push(`Nhóm ${current.code} đang có ${current.bookedUnitCount} kho được đặt / đang thuê nên không ngừng sử dụng được.`)
    return errors
  }

  if (current) {
    if (current.sizeAreaMin != null && c.minArea > Number(current.sizeAreaMin) + TOL) errors.push(`Diện tích "từ" không được lớn hơn ${area(current.sizeAreaMin)} (size nhỏ nhất đang thuộc nhóm ${current.code}).`)
    if (current.sizeAreaMax != null && c.maxArea < Number(current.sizeAreaMax) - TOL) errors.push(`Diện tích "đến" không được nhỏ hơn ${area(current.sizeAreaMax)} (size lớn nhất đang thuộc nhóm ${current.code}).`)
    if (current.rateMin != null && c.minPrice > Number(current.rateMin)) errors.push(`Giá thấp nhất không được lớn hơn ${money(current.rateMin)} (giá đang áp dụng thấp nhất tại các cơ sở).`)
    if (current.rateMax != null && c.maxPrice < Number(current.rateMax)) errors.push(`Giá cao nhất không được nhỏ hơn ${money(current.rateMax)} (giá đang áp dụng cao nhất tại các cơ sở).`)
  }

  const special = isSpecialBand(c.code)
  const others = ruleBands.filter(b => b.code !== c.code && isSpecialBand(b.code) === special)
  others.forEach(o => {
    if (c.minArea < Number(o.maxArea) - TOL && Number(o.minArea) < c.maxArea - TOL) {
      errors.push(`Diện tích ${area(c.minArea)} – ${area(c.maxArea)} chồng lên nhóm ${o.code} (${area(o.minArea)} – ${area(o.maxArea)}).`)
    }
  })
  const { smaller, larger } = neighbours(c, others)
  if (smaller && (c.minPrice <= Number(smaller.minPrice) || c.maxPrice <= Number(smaller.maxPrice))) {
    errors.push(`Nhóm ${c.code} lớn hơn nhóm ${smaller.code} nên giá phải cao hơn: giá thấp nhất > ${money(smaller.minPrice)} và giá cao nhất > ${money(smaller.maxPrice)}.`)
  }
  if (larger && (c.minPrice >= Number(larger.minPrice) || c.maxPrice >= Number(larger.maxPrice))) {
    errors.push(`Nhóm ${c.code} nhỏ hơn nhóm ${larger.code} nên giá phải thấp hơn: giá thấp nhất < ${money(larger.minPrice)} và giá cao nhất < ${money(larger.maxPrice)}.`)
  }
  return errors
}

function neighbours(c, others) {
  const smaller = others.filter(o => Number(o.maxArea) <= c.minArea + TOL).sort((a, b) => b.maxArea - a.maxArea)[0] || null
  const larger = others.filter(o => Number(o.minArea) >= c.maxArea - TOL).sort((a, b) => a.minArea - b.minArea)[0] || null
  return { smaller, larger }
}

/* Gợi ý giới hạn cho form (hiển thị dưới các ô nhập). */
export function bandHints(candidate, ruleBands = [], current = null) {
  const code = String(candidate.code || current?.code || '').toUpperCase()
  const special = isSpecialBand(code)
  const others = ruleBands.filter(b => b.code !== code && isSpecialBand(b.code) === special)
  const hints = []
  if (current?.locked) return [] // form đã hiện thông báo khóa
  if (current?.sizeAreaMin != null) hints.push(`Phải chứa các size hiện có: ${area(current.sizeAreaMin)} – ${area(current.sizeAreaMax)}.`)
  if (current?.rateMin != null) hints.push(`Phải chứa giá đang áp dụng: ${money(current.rateMin)} – ${money(current.rateMax)}.`)
  const minA = Number(candidate.minArea), maxA = Number(candidate.maxArea)
  if (minA > 0 && maxA > minA) {
    const { smaller, larger } = neighbours({ minArea: minA, maxArea: maxA }, others)
    if (smaller) hints.push(`Nhóm nhỏ hơn ${smaller.code}: ${area(smaller.minArea)} – ${area(smaller.maxArea)}, giá ${money(smaller.minPrice)} – ${money(smaller.maxPrice)} → giá nhóm này phải cao hơn cả hai mức.`)
    if (larger) hints.push(`Nhóm lớn hơn ${larger.code}: ${area(larger.minArea)} – ${area(larger.maxArea)}, giá ${money(larger.minPrice)} – ${money(larger.maxPrice)} → giá nhóm này phải thấp hơn cả hai mức.`)
  } else if (others.length) {
    hints.push(`Các nhóm hiện có: ${[...others].sort((a, b) => a.minArea - b.minArea).map(o => `${o.code} ${area(o.minArea)}–${area(o.maxArea)}`).join(' · ')}.`)
  }
  return hints
}
