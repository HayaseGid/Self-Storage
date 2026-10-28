import { DEPOSIT_MONTHS, RENTAL_TERMS } from './storageRules'
import { apiPut } from './api'

export const POLICY_VERSION = {
  version: 'v2.0',
  effectiveFrom: '2026-10-27',
  effectiveTo: null,
  status: 'Đang áp dụng (SQL Server)',
  note: 'Tiền cọc 1–2 tháng tiền thuê; kỳ hạn thuê chuẩn 1, 3, 6 hoặc 12 tháng.'
}

export const POLICY_SET = [
  {
    key: 'rental',
    code: 'RP',
    title: 'Thời hạn & thanh toán',
    summary: `Thuê theo gói ${RENTAL_TERMS.join(', ')} tháng, tính tiền theo tháng.`,
    settings: [
      ['Gói thời hạn thuê', `${RENTAL_TERMS.join(' tháng, ')} tháng`],
      ['Một tháng thuê', 'Từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng sau'],
      ['Ngày bắt đầu', 'Hôm nay hoặc một ngày trong tương lai'],
      ['Giảm giá kỳ hạn dài', 'Thuê 6 tháng giảm 5%; thuê 12 tháng giảm 10%'],
      ['Thay đổi giá', 'Không áp dụng cho hợp đồng đang hiệu lực']
    ],
    rules: [
      'RP-05: Tiền thuê tính theo từng tháng thuê (bảng Charge).',
      'RP-07: Giá mới không tự động thay đổi giá đã xác nhận trong hợp đồng đang hiệu lực.',
      'RP-09: Hợp đồng chỉ được xác nhận khi kho còn khả dụng, khách đã chấp nhận điều khoản và đã thanh toán các khoản bắt buộc.'
    ]
  },
  {
    key: 'deposit',
    code: 'DP',
    title: 'Tiền cọc',
    summary: `Cọc ${DEPOSIT_MONTHS} tháng tiền thuê mỗi kho (sau giảm giá), hoàn trong 7 ngày làm việc sau khi trả kho.`,
    settings: [
      ['Mức cọc', `${DEPOSIT_MONTHS} tháng tiền thuê / kho (hoặc 1–2 tháng theo cấu hình cơ sở)`],
      ['Thời điểm thu', 'Trước khi bàn giao kho (giữ chỗ 15 phút để thanh toán)'],
      ['Thời hạn hoàn cọc', '07 ngày làm việc sau khi trả kho và kiểm tra xong'],
      ['Khấu trừ', 'Chỉ khi có căn cứ: phí còn thiếu, mất khóa/thẻ, hư hỏng do khách']
    ],
    rules: [
      'DP-03: Tiền cọc không mặc nhiên được xem là tiền thuê tháng cuối và không tính vào doanh thu.',
      'DP-06: Mọi khoản khấu trừ phải ghi rõ lý do, loại phí, số tiền và bằng chứng.',
      'DP-07: Không tự động giữ toàn bộ tiền cọc chỉ vì khách chấm dứt thuê.'
    ]
  },
  {
    key: 'cancellation',
    code: 'CP',
    title: 'Hủy đặt chỗ',
    summary: 'Hoàn cọc 100% / 50% / 0% tùy số ngày hủy trước ngày bắt đầu.',
    settings: [
      ['Hủy từ 07 ngày trở lên trước ngày bắt đầu', 'Hoàn 100% tiền cọc'],
      ['Hủy từ 03 đến 06 ngày trước', 'Hoàn 50% tiền cọc'],
      ['Hủy dưới 03 ngày / không đến nhận kho', 'Không hoàn tiền cọc (trừ ngoại lệ)'],
      ['Hủy do lỗi doanh nghiệp', 'Hoàn toàn bộ số tiền đã thanh toán']
    ],
    rules: [
      'CP-01: Chỉ hủy được khi đặt chỗ chưa bàn giao.',
      'CP-07: Ngoại lệ phải có lý do, người phê duyệt và được lưu nhật ký.',
      'CP-08: Khoản hoàn tiền ghi nhận thành giao dịch hoàn tiền riêng.'
    ]
  },
  {
    key: 'renewal',
    code: 'RNP',
    title: 'Gia hạn',
    summary: 'Gửi yêu cầu trước khi hết hạn theo kỳ 1, 3, 6 hoặc 12 tháng.',
    settings: [
      ['Thời điểm nhắc gia hạn', 'Trước 30 ngày ngày hết hạn'],
      ['Kỳ gia hạn', '1, 3, 6 hoặc 12 tháng'],
      ['Giá gia hạn', 'Theo bảng giá hiệu lực tại thời điểm gia hạn'],
      ['Điều kiện', 'Hợp đồng còn hiệu lực, không có khoản quá hạn']
    ],
    rules: [
      'RNP-04: Gia hạn tạo hợp đồng gia hạn liên kết với hợp đồng gốc (RenewedFromContractID).',
      'RNP-08: Gia hạn không được coi là hợp đồng thuê lần đầu.'
    ]
  },
  {
    key: 'return',
    code: 'RTP',
    title: 'Trả kho',
    summary: 'Báo trước 7 ngày, dọn sạch kho, trả khóa/thẻ; nhân viên kiểm tra trước khi hoàn cọc.',
    settings: [
      ['Báo trả kho', 'Trước ít nhất 07 ngày'],
      ['Khách cần làm', 'Lấy hết đồ, vệ sinh kho, trả khóa/thẻ'],
      ['Kiểm tra', 'Nhân viên ghi nhận tình trạng (Pending Inspection), hư hỏng, vệ sinh, khóa/thẻ'],
      ['Hao mòn thông thường', 'Không tính phí']
    ],
    rules: [
      'RTP-08: Kho sau khi trả chuyển sang "Chờ kiểm tra" (Pending Inspection) trước khi về "Còn trống".',
      'RTP-09: Tài sản khách để lại phải lập biên bản và thông báo, không tự ý xử lý.'
    ]
  },
  {
    key: 'overdue',
    code: 'OFP',
    title: 'Thanh toán quá hạn',
    summary: 'Ân hạn 3 ngày, sau đó tính phí trễ hạn 50.000đ/ngày.',
    settings: [
      ['Thời gian ân hạn', '03 ngày kể từ ngày đến hạn'],
      ['Phí quá hạn', '50.000đ / ngày (khung 0đ – 200.000đ/ngày)'],
      ['Hạn chế', 'Có thể tạm khóa gia hạn / quyền truy cập khi quá hạn']
    ],
    rules: [
      'OFP-05: Phần đã thanh toán không tiếp tục bị tính phí quá hạn.',
      'OFP-08: Không tự động chuyển quyền sở hữu tài sản của khách khi chậm thanh toán.'
    ]
  }
]

/* Bảng phụ phí theo bảng FeePolicy trong SelfStorageDB_test.sql */
export const EXTRA_FEES = [
  { code: 'CLEANING_FEE', name: 'Phí vệ sinh kho khi trả', condition: 'Kho cần vệ sinh vượt mức sử dụng thông thường', amount: 500000, note: 'Khung 0đ – 500.000đ' },
  { code: 'LOCK_REPLACEMENT', name: 'Phí thay khóa / thẻ bị mất', condition: 'Khách làm mất khóa hoặc thẻ ra vào', amount: 1000000, note: 'Khung 0đ – 1.000.000đ' },
  { code: 'LATE_FEE_PER_DAY', name: 'Phí trễ hạn mỗi ngày', condition: 'Quá hạn thanh toán sau 3 ngày ân hạn', amount: 50000, note: 'Khung 0đ – 200.000đ/ngày' },
  { code: 'DAMAGE', name: 'Sửa chữa hư hỏng', condition: 'Khách gây hư hỏng kho', amount: null, note: 'Theo chi phí thực tế, có biên bản' }
]

/* Chương trình giảm giá theo bảng ContractType & FeePolicy trong SelfStorageDB_test.sql */
export const DISCOUNTS = [
  { code: 'TERM_6M', name: 'Thuê kỳ hạn 6 tháng', rate: 5, scope: 'Tiền thuê hàng tháng', condition: 'Hợp đồng kỳ hạn 06 tháng', combinable: false },
  { code: 'TERM_12M', name: 'Thuê kỳ hạn 12 tháng', rate: 10, scope: 'Tiền thuê hàng tháng', condition: 'Hợp đồng kỳ hạn 12 tháng', combinable: false },
  { code: 'PROMO_DISCOUNT', name: 'Giảm giá khuyến mãi', rate: 20, scope: 'Theo chiến dịch', condition: 'Tối đa 20% theo cấu hình FeePolicy', combinable: false }
]

/* Các nhóm điều khoản khách phải xác nhận trước khi ký hợp đồng. */
export const CONTRACT_TERM_GROUPS = ['rental', 'deposit', 'cancellation', 'return', 'overdue']

const formatMoneyText = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`

export function buildPolicySet(apiPolicies) {
  const live = apiPolicies || loadLivePolicies()
  if (!live) return POLICY_SET

  const depositMonths = Number(live.depositMonths ?? DEPOSIT_MONTHS)
  const holdMinutes = Number(live.holdMinutes ?? 15)
  const lateFeePerDay = Number(live.lateFeePerDay ?? 50000)

  return POLICY_SET.map(section => {
    if (section.key === 'deposit') {
      return {
        ...section,
        summary: `Cọc ${depositMonths} tháng tiền thuê mỗi kho (sau giảm giá), hoàn trong 7 ngày làm việc sau khi trả kho.`,
        settings: [
          ['Mức cọc', `${depositMonths} tháng tiền thuê / kho (hoặc 1–2 tháng theo cấu hình cơ sở)`],
          ['Thời điểm thu', `Trước khi bàn giao kho (giữ chỗ ${holdMinutes} phút để thanh toán)`],
          ['Thời hạn hoàn cọc', '07 ngày làm việc sau khi trả kho và kiểm tra xong'],
          ['Khấu trừ', 'Chỉ khi có căn cứ: phí còn thiếu, mất khóa/thẻ, hư hỏng do khách']
        ]
      }
    }
    if (section.key === 'overdue') {
      return {
        ...section,
        summary: `Ân hạn 3 ngày, sau đó tính phí trễ hạn ${formatMoneyText(lateFeePerDay)}/ngày.`,
        settings: [
          ['Thời gian ân hạn', '03 ngày kể từ ngày đến hạn'],
          ['Phí quá hạn', `${formatMoneyText(lateFeePerDay)} / ngày (khung 0đ – 200.000đ/ngày)`],
          ['Hạn chế', 'Có thể tạm khóa gia hạn / quyền truy cập khi quá hạn']
        ]
      }
    }
    return section
  })
}

export function buildExtraFees(apiPolicies) {
  const live = apiPolicies || loadLivePolicies()
  const backendFees = Array.isArray(live?.feePolicies) ? live.feePolicies : []
  if (!backendFees.length) return EXTRA_FEES

  const usedIds = new Set()
  const merged = EXTRA_FEES.map(item => {
    const match = backendFees.find(fp => {
      const code = String(fp.feeType || fp.code || '').toUpperCase()
      return code === item.code || (item.code === 'LATE_FEE_PER_DAY' && /LATE|OVERDUE/.test(code))
    })
    if (!match) return item
    if (match.feePolicyId != null) usedIds.add(match.feePolicyId)
    return {
      ...item,
      feePolicyId: match.feePolicyId ?? match.feePolicyID,
      feeType: match.feeType || item.code,
      amount: match.unitPrice != null ? Number(match.unitPrice) : item.amount,
      condition: match.description || item.condition
    }
  })

  backendFees.forEach(fp => {
    const id = fp.feePolicyId ?? fp.feePolicyID
    if (id != null && usedIds.has(id)) return
    const code = String(fp.feeType || fp.code || `FEE_${id || merged.length + 1}`).toUpperCase()
    if (merged.some(item => item.code === code)) return
    merged.push({
      code,
      feePolicyId: id,
      feeType: fp.feeType || code,
      name: fp.name || fp.feeType || code,
      condition: fp.description || 'Theo quy định vận hành',
      amount: fp.unitPrice != null ? Number(fp.unitPrice) : null,
      note: ''
    })
  })

  return merged
}

export function buildDiscounts(apiPolicies) {
  const live = apiPolicies || loadLivePolicies()
  const contractDiscounts = Array.isArray(live?.contractTypeDiscounts) ? live.contractTypeDiscounts : []
  if (!contractDiscounts.length) return DISCOUNTS

  const byMonths = new Map(
    contractDiscounts.map(d => [Number(d.durationMonths), d])
  )

  const mapped = contractDiscounts
    .filter(d => Number(d.durationMonths) > 0)
    .map(d => {
      const months = Number(d.durationMonths)
      const code = `TERM_${months}M`
      const rate = Number(d.discountPercent ?? d.discountRate ?? 0)
      return {
        code,
        contractTypeId: d.contractTypeId ?? d.contractTypeID,
        durationMonths: months,
        name: d.typeName || `Thuê kỳ hạn ${months} tháng`,
        rate,
        scope: 'Tiền thuê hàng tháng',
        condition: `Hợp đồng kỳ hạn ${String(months).padStart(2, '0')} tháng`,
        combinable: false
      }
    })

  DISCOUNTS.forEach(defaultItem => {
    const monthMatch = defaultItem.code.match(/^TERM_(\d+)M$/)
    if (monthMatch && byMonths.has(Number(monthMatch[1]))) return
    if (!mapped.some(m => m.code === defaultItem.code)) {
      mapped.push(defaultItem)
    }
  })

  return mapped
}

const POLICIES_STORAGE_KEY = 'storespace_live_policies'

export function syncPoliciesFromBackend(backendPolicies) {
  if (!backendPolicies) return null
  try {
    localStorage.setItem(POLICIES_STORAGE_KEY, JSON.stringify(backendPolicies))
  } catch {
    // ignore storage errors
  }
  return backendPolicies
}

export function loadLivePolicies() {
  try {
    const raw = localStorage.getItem(POLICIES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function savePoliciesToBackend(payload) {
  const updated = await apiPut('/api/operations/policies', payload)
  return syncPoliciesFromBackend(updated)
}
