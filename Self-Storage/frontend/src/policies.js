import { useEffect, useState } from 'react'
import { apiGet } from './api'
import { RENTAL_TERMS, formatVnd } from './storageRules'

export const DEFAULT_POLICIES = {
  deposit: { method: 'months', value: 2, scope: 'all', facilityIds: [] },
  overdue: {
    feeType: 'percent', feeValue: 0.05, period: 'day', graceDays: 3, maxPercent: 5,
    extraFees: [
      { code: 'LOST_CARD', name: 'Làm lại thẻ truy cập', amount: null, condition: 'Khách làm mất / hỏng thẻ ra vào', active: true },
      { code: 'LOST_KEY', name: 'Mất khóa', amount: null, condition: 'Khách làm mất khóa', active: true },
      { code: 'REPLACE_LOCK', name: 'Thay khóa', amount: null, condition: 'Thay khóa do lỗi / mất khóa thuộc trách nhiệm khách', active: true },
      { code: 'CLEANING', name: 'Vệ sinh kho', amount: null, condition: 'Kho cần vệ sinh vượt mức sử dụng thông thường', active: true },
      { code: 'PROCESSING', name: 'Phí xử lý', amount: null, condition: 'Chỉ áp dụng khi đã công bố / thỏa thuận', active: false }
    ]
  },
  reservation: {
    holdMinutes: 10,
    cancellationConditions: 'Chỉ hủy được khi đặt chỗ chưa bàn giao. Hủy do lỗi doanh nghiệp được hoàn toàn bộ số tiền đã thanh toán.',
    refundTiers: [{ minDaysBefore: 7, refundPercent: 100 }, { minDaysBefore: 3, refundPercent: 50 }, { minDaysBefore: 0, refundPercent: 0 }],
    noShowAfterDays: 0, noShowRefundPercent: 0, releaseUnitOnNoShow: true
  },
  renewal_return: {
    renewalNoticeDays: 7, minRenewalMonths: 1, maxRenewalMonths: 12, requireNoOverdue: true,
    renewalPaymentDeadlineDays: null, renewalPricing: 'Theo bảng giá có hiệu lực tại thời điểm gia hạn',
    returnNoticeDays: 7, depositRefundWorkingDays: 7,
    returnRequirements: 'Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập',
    returnFees: [
      { name: 'Vệ sinh kho', amount: null, condition: 'Kho bẩn vượt mức sử dụng thông thường' },
      { name: 'Sửa chữa hư hỏng', amount: null, condition: 'Theo chi phí thực tế, có biên bản kiểm tra' }
    ]
  }
}

export const POLICY_KEYS = ['deposit', 'overdue', 'reservation', 'renewal_return']
export const POLICY_TITLES = {
  deposit: 'Tiền đặt cọc',
  overdue: 'Phí quá hạn & phụ phí',
  reservation: 'Đặt chỗ & hủy',
  renewal_return: 'Gia hạn & trả kho'
}
export const PERIOD_LABELS = { day: 'ngày', week: 'tuần', month: 'tháng' }
export const DEPOSIT_METHOD_LABELS = { months: 'Số tháng tiền thuê', percent: 'Phần trăm (%) tổng tiền thuê', fixed: 'Số tiền cố định / kho' }

const money = value => (value == null || value === '' ? 'Theo chi phí thực tế' : `${formatVnd(value)}đ`)
const pct = value => `${String(Number(value)).replace('.', ',')}%`
export const fmtDay = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')

/* ---------- Tiền cọc ---------- */
export function depositFor(policy, { facilityId, monthlyPrice, months }) {
  const p = policy || DEFAULT_POLICIES.deposit
  const price = Number(monthlyPrice || 0)
  const inScope = p.scope !== 'selected' || (p.facilityIds || []).map(Number).includes(Number(facilityId))
  let amount
  if (!inScope) amount = price * 2
  else if (p.method === 'percent') amount = price * Number(months || 0) * Number(p.value) / 100
  else if (p.method === 'fixed') amount = Number(p.value)
  else amount = price * Number(p.value)
  return Math.round(amount)
}

export function describeDepositShort(policy, facilityId) {
  const p = policy || DEFAULT_POLICIES.deposit
  const inScope = p.scope !== 'selected' || facilityId == null || (p.facilityIds || []).map(Number).includes(Number(facilityId))
  if (!inScope) return '2 tháng tiền thuê / kho'
  if (p.method === 'percent') return `${pct(p.value)} tổng tiền thuê`
  if (p.method === 'fixed') return `${formatVnd(p.value)}đ / kho`
  return `${String(Number(p.value)).replace('.', ',')} tháng tiền thuê / kho`
}

/* ---------- Mô tả từng nhóm thành { summary, settings } ---------- */
export function describePolicy(key, value, { facilities = [] } = {}) {
  const v = value || DEFAULT_POLICIES[key]
  if (key === 'deposit') {
    const scopeNames = v.scope === 'selected'
      ? facilities.filter(f => (v.facilityIds || []).map(Number).includes(Number(f.facilityId ?? f.id))).map(f => f.name).join(', ') || `${(v.facilityIds || []).length} cơ sở`
      : 'Tất cả cơ sở'
    return {
      summary: `Cọc ${describeDepositShort(v)}, thu trước khi bàn giao, hoàn lại sau khi trả kho.`,
      settings: [
        ['Phương thức tính', DEPOSIT_METHOD_LABELS[v.method] || v.method],
        ['Mức cọc', describeDepositShort(v)],
        ['Phạm vi áp dụng', scopeNames + (v.scope === 'selected' ? ' (cơ sở khác: 2 tháng tiền thuê)' : '')],
        ['Khấu trừ', 'Chỉ khi có căn cứ: phí còn thiếu, mất khóa/thẻ, hư hỏng do khách']
      ]
    }
  }
  if (key === 'overdue') {
    const fee = v.feeType === 'percent' ? `${pct(v.feeValue)} số tiền quá hạn / ${PERIOD_LABELS[v.period]}` : `${formatVnd(v.feeValue)}đ / ${PERIOD_LABELS[v.period]}`
    const fees = (v.extraFees || []).filter(f => f.active)
    return {
      summary: `Sau ${v.graceDays} ngày kể từ hạn thanh toán: ${fee}${v.maxPercent != null && v.maxPercent !== '' ? `, tối đa ${pct(v.maxPercent)} mỗi kỳ` : ''}.`,
      settings: [
        ['Phí quá hạn', fee],
        ['Bắt đầu tính phí', `Sau ${v.graceDays} ngày kể từ ngày đến hạn`],
        ['Mức tối đa', v.maxPercent != null && v.maxPercent !== '' ? `${pct(v.maxPercent)} số tiền quá hạn mỗi kỳ` : 'Không giới hạn'],
        ...fees.map(f => [`Phụ phí: ${f.name}`, money(f.amount)])
      ]
    }
  }
  if (key === 'reservation') {
    const tiers = [...(v.refundTiers || [])].sort((a, b) => b.minDaysBefore - a.minDaysBefore)
    return {
      summary: `Giữ chỗ ${v.holdMinutes} phút chờ đặt cọc. Hoàn cọc ${tiers.map(t => `${t.refundPercent}%`).join(' / ')} tùy thời điểm hủy.`,
      settings: [
        ['Thời hạn giữ chỗ', `${v.holdMinutes} phút để thanh toán tiền cọc`],
        ...tiers.map((t, i) => {
          const upper = i > 0 ? tiers[i - 1].minDaysBefore - 1 : null
          const label = t.minDaysBefore === 0
            ? (upper != null ? `Hủy dưới ${tiers[i - 1].minDaysBefore} ngày trước ngày bắt đầu` : 'Hủy bất kỳ lúc nào')
            : upper != null && upper >= t.minDaysBefore ? `Hủy từ ${t.minDaysBefore} đến ${upper} ngày trước` : `Hủy từ ${t.minDaysBefore} ngày trở lên trước ngày bắt đầu`
          return [label, `Hoàn ${t.refundPercent}% tiền cọc`]
        }),
        ['Khách không đến nhận kho', `Sau ${v.noShowAfterDays === 0 ? 'hết ngày bắt đầu' : `${v.noShowAfterDays} ngày kể từ ngày bắt đầu`}: hoàn ${v.noShowRefundPercent}% tiền cọc${v.releaseUnitOnNoShow ? ', kho được mở lại cho thuê' : ''}`],
        ['Điều kiện hủy', v.cancellationConditions || '—']
      ]
    }
  }
  if (key === 'renewal_return') {
    return {
      summary: `Gia hạn: gửi yêu cầu trước ${v.renewalNoticeDays} ngày. Trả kho: báo trước ${v.returnNoticeDays} ngày, hoàn cọc trong ${v.depositRefundWorkingDays} ngày làm việc.`,
      settings: [
        ['Yêu cầu gia hạn', `Trước ít nhất ${v.renewalNoticeDays} ngày so với ngày hết hạn`],
        ['Kỳ gia hạn', `Từ ${v.minRenewalMonths} đến ${v.maxRenewalMonths} tháng`],
        ['Điều kiện gia hạn', v.requireNoOverdue ? 'Hợp đồng còn hiệu lực, không còn khoản quá hạn' : 'Hợp đồng còn hiệu lực'],
        ['Hạn chót thanh toán gia hạn', v.renewalPaymentDeadlineDays != null && v.renewalPaymentDeadlineDays !== '' ? `Trước ngày hết hạn ${v.renewalPaymentDeadlineDays} ngày` : 'Chưa quy định'],
        ['Giá gia hạn', v.renewalPricing || '—'],
        ['Báo trả kho', `Trước ít nhất ${v.returnNoticeDays} ngày`],
        ['Khi trả kho', v.returnRequirements || '—'],
        ['Hoàn cọc', `Trong ${v.depositRefundWorkingDays} ngày làm việc sau khi kiểm tra kho`],
        ...(v.returnFees || []).map(f => [`Phí trả kho: ${f.name}`, money(f.amount)])
      ]
    }
  }
  return { summary: '', settings: [] }
}

/* Các nhóm điều khoản khách xác nhận trước khi ký hợp đồng. */
export function buildContractTerms(policies) {
  const p = { ...DEFAULT_POLICIES, ...(policies || {}) }
  const rental = {
    key: 'rental',
    title: 'Thời hạn & thanh toán',
    summary: `Thuê mới theo gói ${RENTAL_TERMS.join(' hoặc ')} tháng, tính tiền theo tháng.`,
    settings: [
      ['Gói thời hạn thuê mới', `${RENTAL_TERMS.join(' tháng, ')} tháng`],
      ['Một tháng thuê', 'Từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng sau'],
      ['Thay đổi giá', 'Không áp dụng cho hợp đồng đang hiệu lực']
    ]
  }
  return [
    rental,
    { key: 'deposit', title: POLICY_TITLES.deposit, ...describePolicy('deposit', p.deposit) },
    { key: 'reservation', title: 'Hủy & không đến nhận kho', ...describePolicy('reservation', p.reservation) },
    { key: 'renewal_return', title: POLICY_TITLES.renewal_return, ...describePolicy('renewal_return', p.renewal_return) },
    { key: 'overdue', title: POLICY_TITLES.overdue, ...describePolicy('overdue', p.overdue) }
  ]
}

/* ---------- Tải chính sách hiện hành (dùng chung, có cache) ---------- */
let cache = null
let inflight = null
const listeners = new Set()

export function loadPolicies(force = false) {
  if (cache && !force) return Promise.resolve(cache)
  if (inflight && !force) return inflight
  inflight = apiGet('/api/policies')
    .then(data => {
      const values = {}
      const meta = {}
      for (const key of POLICY_KEYS) {
        const entry = data?.current?.[key]
        values[key] = entry?.value || DEFAULT_POLICIES[key]
        meta[key] = { version: entry?.version || 0, effectiveFrom: entry?.effectiveFrom || null, isDefault: entry?.isDefault ?? true }
      }
      cache = { values, meta, scheduled: data?.scheduled || [], loaded: true }
      listeners.forEach(fn => fn(cache))
      return cache
    })
    .catch(() => {
      cache = cache || { values: { ...DEFAULT_POLICIES }, meta: {}, scheduled: [], loaded: false }
      return cache
    })
    .finally(() => { inflight = null })
  return inflight
}

export function usePolicies() {
  const [state, setState] = useState(cache || { values: { ...DEFAULT_POLICIES }, meta: {}, scheduled: [], loaded: false })
  useEffect(() => {
    listeners.add(setState)
    loadPolicies().then(setState)
    return () => listeners.delete(setState)
  }, [])
  return state
}

/* Chương trình giảm giá (DCP) - chỉ xem. */
export const DISCOUNTS = [
  { code: 'NEW_CUSTOMER', name: 'Khách hàng mới', rate: 10, scope: 'Tiền thuê tháng đầu tiên', condition: 'Lần thuê đầu tiên, khi chương trình đang chạy', combinable: false },
  { code: 'LONG_TERM', name: 'Thuê dài hạn', rate: 5, scope: 'Tiền thuê', condition: 'Thanh toán trước từ 06 tháng trở lên', combinable: false }
]
