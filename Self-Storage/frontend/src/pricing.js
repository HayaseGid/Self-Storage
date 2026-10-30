/*
 * Tính tiền xem trước ở frontend, khớp đúng công thức backend (ReservationService):
 *   giá sau giảm / tháng = làm tròn(giá kho × (100 − % giảm theo gói) / 100)
 *   tiền thuê            = giá sau giảm × số tháng
 *   tiền cọc             = giá sau giảm × số tháng cọc của cơ sở (RentalPolicy.DepositMonths, mặc định 2)
 * % giảm theo gói lấy từ ContractType (catalog.policies.contractTypes): 6 tháng 5%, 12 tháng 10%...
 * Dữ liệu được nạp mỗi lần tải /api/catalog/state (App.jsx -> setCatalogPricing).
 * Sau khi tạo đặt chỗ, luôn hiển thị số tiền backend trả về.
 */

const state = {
  contractTypes: [],      // [{ months, discountPercent }]
  facilities: new Map()   // facilityId -> { depositMonths, holdMinutes }
}

export function setCatalogPricing(catalog) {
  const types = catalog?.policies?.contractTypes
  if (Array.isArray(types)) {
    state.contractTypes = types.map(t => ({ months: Number(t.months), discountPercent: Number(t.discountPercent || 0) }))
  }
  if (Array.isArray(catalog?.facilities)) {
    state.facilities = new Map(catalog.facilities.map(f => [
      Number(f.facilityId ?? f.id),
      {
        depositMonths: Number(f.depositMonths ?? f.depositPercent ?? 2) || 2,
        holdMinutes: Number(f.holdMinutes ?? 15) || 15
      }
    ]))
  }
}

/* Tạm TẮT giảm giá theo gói (yêu cầu 29/10/2026): mọi gói đều tính đúng giá niêm yết.
 * Backend vẫn đọc ContractType.DiscountRate, nên cần chạy database/Migrations/20261029_TamBoGiamGia.sql (đặt về 0).
 * Khi làm lại giảm giá: đổi DISCOUNT_ENABLED = true. */
export const DISCOUNT_ENABLED = false
export const discountFor = months => DISCOUNT_ENABLED
  ? state.contractTypes.find(t => t.months === Number(months))?.discountPercent || 0
  : 0
export const depositMonthsFor = facilityId => state.facilities.get(Number(facilityId))?.depositMonths || 2
export const holdMinutesFor = facilityId => state.facilities.get(Number(facilityId))?.holdMinutes || 15

export function effectiveMonthly(price, months) {
  return Math.round(Number(price || 0) * (100 - discountFor(months)) / 100)
}

/* Báo giá cho một hoặc nhiều kho cùng cơ sở, cùng gói thuê. */
export function quote(prices, months, facilityId) {
  const list = (Array.isArray(prices) ? prices : [prices]).map(Number).filter(n => n > 0)
  const discountPercent = discountFor(months)
  const depositMonths = depositMonthsFor(facilityId)
  const monthlyBase = list.reduce((n, p) => n + p, 0)
  const monthly = list.reduce((n, p) => n + effectiveMonthly(p, months), 0)
  return {
    discountPercent,
    depositMonths,
    monthlyBase,
    monthly,
    rent: monthly * Number(months || 0),
    deposit: monthly * depositMonths,
    saving: (monthlyBase - monthly) * Number(months || 0)
  }
}
