/*
 * Tính tiền thuê và tiền cọc ở frontend (không áp dụng bất kỳ giảm giá / khuyến mãi nào):
 *   tiền thuê / tháng = giá niêm yết của kho (không giảm giá theo gói hay hình thức trả)
 *   tiền thuê         = giá niêm yết × số tháng
 *   tiền cọc          = giá niêm yết × số tháng cọc của cơ sở (mặc định 2 tháng)
 */

const state = {
  contractTypes: [],
  facilities: new Map()   // facilityId -> { depositMonths, holdMinutes }
}

export function setCatalogPricing(catalog) {
  const types = catalog?.policies?.contractTypes
  if (Array.isArray(types)) {
    state.contractTypes = types.map(t => ({ months: Number(t.months), discountPercent: 0 }))
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

export const DISCOUNT_ENABLED = false
export const discountFor = () => 0
export const depositMonthsFor = facilityId => state.facilities.get(Number(facilityId))?.depositMonths || 2
export const holdMinutesFor = facilityId => state.facilities.get(Number(facilityId))?.holdMinutes || 15

export function effectiveMonthly(price) {
  return Math.round(Number(price || 0))
}

/* Báo giá cho một hoặc nhiều kho cùng cơ sở, cùng gói thuê. */
export function quote(prices, months, facilityId) {
  const list = (Array.isArray(prices) ? prices : [prices]).map(Number).filter(n => n > 0)
  const depositMonths = depositMonthsFor(facilityId)
  const monthly = list.reduce((n, p) => n + p, 0)
  return {
    discountPercent: 0,
    depositMonths,
    monthlyBase: monthly,
    monthly,
    rent: monthly * Number(months || 0),
    deposit: monthly * depositMonths,
    saving: 0
  }
}
