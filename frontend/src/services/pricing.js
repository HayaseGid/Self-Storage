/**
 * ======================================================================
 * FILE: src/services/pricing.js  —  TÍNH TIỀN THUÊ & TIỀN CỌC Ở FRONTEND (để báo giá hiển thị)
 * Không áp dụng giảm giá/khuyến mãi (đã tắt theo migration 20261029_TamBoGiamGia).
 * Công thức:
 *   tiền thuê/tháng = giá niêm yết của kho
 *   tiền thuê       = giá niêm yết × số tháng
 *   tiền cọc        = giá niêm yết × số tháng cọc của cơ sở (mặc định 2)
 * Số tiền CHÍNH THỨC vẫn do backend tính khi tạo đơn (POST /api/reservation).
 * Dữ liệu cấu hình (số tháng cọc, phút giữ chỗ theo cơ sở) được nạp từ GET /api/catalog/state
 * qua setCatalogPricing() trong App.jsx.
 * Dùng ở: App.jsx, CartPage.
 * ======================================================================
 */
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

/**
 * Nạp cấu hình tính giá từ dữ liệu catalog backend trả về (GET /api/catalog/state):
 * danh sách gói thuê (contractTypes) và theo từng cơ sở: số tháng cọc, số phút giữ chỗ.
 * @param {object} catalog dữ liệu catalog.
 */
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
/**
 * Giảm giá luôn = 0 (tính năng giảm giá đang tắt, giữ hàm để code cũ không lỗi).
 */
export const discountFor = () => 0
/**
 * Số tháng tiền cọc của một cơ sở (mặc định 2).
 */
export const depositMonthsFor = facilityId => state.facilities.get(Number(facilityId))?.depositMonths || 2
/**
 * Số phút giữ chỗ chờ khách đặt cọc của một cơ sở (mặc định 15).
 */
export const holdMinutesFor = facilityId => state.facilities.get(Number(facilityId))?.holdMinutes || 15

/**
 * Giá thuê thực tế mỗi tháng (= giá niêm yết làm tròn, vì không có giảm giá).
 */
export function effectiveMonthly(price) {
  return Math.round(Number(price || 0))
}

/* Báo giá cho một hoặc nhiều kho cùng cơ sở, cùng gói thuê. */
/**
 * Báo giá cho một hoặc nhiều kho cùng cơ sở, cùng gói thuê.
 * @param {number|number[]} prices giá thuê/tháng của từng kho.
 * @param {number} months số tháng thuê.
 * @param {number} facilityId cơ sở (để lấy số tháng cọc).
 * @returns {{discountPercent, depositMonths, monthlyBase, monthly, rent, deposit, saving}}
 *   monthly = tổng tiền/tháng, rent = tổng tiền thuê cả kỳ, deposit = tổng tiền cọc.
 */
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
