/**
 * ======================================================================
 * FILE: src/pages/business/BusinessPolicyEditor.jsx  —  THIẾT LẬP CHÍNH SÁCH CHUNG (BUSINESS OPERATIONS)
 * CHỨC NĂNG: Màn hình "Chính sách" của Business Operations, gồm 4 tab chính sách thuê áp dụng toàn hệ thống:
 *   1. Tiền đặt cọc · 3. Phí quá hạn & phụ phí · 4. Đặt chỗ & hủy · 5. Gia hạn & trả kho
 *   (nhóm 2. Kích thước & giá nằm ở menu riêng - BusinessPriceBands.jsx).
 *   Mỗi lần lưu tạo một PHIÊN BẢN mới có ngày bắt đầu áp dụng; phiên bản cũ được giữ để đối chiếu
 *   hợp đồng / đặt chỗ đã tạo trước đó.
 * THÀNH PHẦN CHÍNH:
 *   - BusinessPolicyEditor (export): thanh tab + tải chính sách hiện hành.
 *   - PolicyForm: form sửa 1 nhóm chính sách (kiểm tra, lưu phiên bản mới, xem lịch sử).
 *   - DepositFields / OverdueFields / ReservationFields / RenewalReturnFields: các ô nhập riêng cho từng nhóm.
 *   - NumField, Choice: ô nhập số và nhóm nút chọn dùng chung trong form.
 *   - TABS, today, clone, toNumber: hằng số và hàm tiện ích.
 * DÙNG Ở: src/pages/business/BusinessOperations.jsx (menu "Chính sách").
 * PHỤ THUỘC: api/api, components/common/PriceInput (ô nhập tiền), services/storageRules (formatVnd),
 *   services/policies (giá trị mặc định, mô tả chính sách, tính cọc, làm mới cache), demoClock/demoClock,
 *   BusinessPolicyEditor.css.
 * API (PoliciesController):
 *   GET /api/policies                       -> chính sách hiện hành (current) + phiên bản đã hẹn ngày (scheduled)
 *   PUT /api/policies/{policyKey}           -> body { value, effectiveFrom, note }: lưu phiên bản mới
 *   GET /api/policies/{policyKey}/history   -> lịch sử các phiên bản
 * LUỒNG: mở menu -> load (GET /api/policies) -> chọn tab -> PolicyForm hiển thị ô nhập của nhóm
 *   -> người dùng sửa (dirty) + chọn ngày áp dụng -> bấm "Lưu phiên bản mới" -> validate -> hộp thoại xác nhận
 *   -> PUT /api/policies/{key} -> onSaved = load() tải lại + loadPolicies(true) làm mới cache chính sách
 *   dùng chung (services/policies.js) cho các màn hình khác.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   today: "Hôm nay" dạng 'YYYY-MM-DD' theo Demo Clock (ngày áp dụng nhỏ nhất được phép chọn) → dùng ở: PolicyForm, validate, save
 *   clone: Sao chép sâu 1 giá trị (qua JSON) để sửa form mà không đụng dữ liệu gốc → dùng ở: PolicyForm
 *   toNumber: Đổi chuỗi người dùng nhập thành số (chấp nhận dấu phẩy thập phân, vd "1,5" -> 1.5) → dùng ở: NumField
 *   NumField: Ô nhập số dùng trong form chính sách: tự lọc ký tự không phải số, hỗ trợ số thập phân (dấu phẩy), cho phép để trống → dùng ở: DepositFields, OverdueFields, ReservationFields +1
 *   Choice: Nhóm nút chọn 1 trong nhiều lựa chọn (hoạt động như radio), nút đang chọn có class 'on' → dùng ở: DepositFields, OverdueFields
 *   BusinessPolicyEditor: Màn hình thiết lập chính sách: tải chính sách hiện hành, hiện thanh tab 4 nhóm và PolicyForm của nhóm đang chọn → dùng ở: BusinessOperations.jsx (BusinessOperations)
 *   load: Tải chính sách hiện hành và làm mới cache chính sách dùng chung (loadPolicies(true) trong services/policies) → dùng ở: BusinessPolicyEditor
 *   PolicyForm: Form sửa 1 nhóm chính sách: hiện tóm tắt chính sách hiện hành + bản nháp đang sửa, các ô nhập theo nhóm, chọn ngày áp dụng + ghi chú → dùng ở: BusinessPolicyEditor
 *   set: Cập nhật 1 trường trong cấu hình chính sách đang sửa → dùng ở: PolicyForm
 *   validate: Kiểm tra cấu hình theo từng nhóm → dùng ở: save
 *   save: Lưu phiên bản chính sách mới (bấm "Lưu phiên bản mới"): validate, hỏi xác nhận → dùng ở: PolicyForm
 *   toggleHistory: Hiện/ẩn bảng lịch sử phiên bản (bấm "Lịch sử thay đổi"); chỉ tải ở lần mở đầu tiên → dùng ở: PolicyForm
 *   DepositFields: Các ô của nhóm "Tiền đặt cọc": số tháng cọc (1 hoặc 2), phạm vi áp dụng (tất cả / chọn cơ sở), và ví dụ tính cọc cho kho 1.000.000đ/tháng → dùng ở: PolicyForm
 *   toggleFacility: Thêm/bỏ 1 cơ sở khỏi danh sách cơ sở áp dụng chính sách cọc → dùng ở: DepositFields
 *   OverdueFields: Các ô của nhóm "Phí quá hạn & phụ phí": loại phí (% hoặc cố định), chu kỳ tính, mức phí, số ngày chưa tính phí, mức trần mỗi kỳ → dùng ở: PolicyForm
 *   updateFee: Sửa 1 phụ phí trong danh sách theo vị trí → dùng ở: OverdueFields
 *   ReservationFields: Các ô của nhóm "Đặt chỗ & hủy": thời hạn giữ chỗ chờ cọc, điều kiện hủy, các mức hoàn tiền cọc theo số ngày hủy trước ngày bắt đầu → dùng ở: PolicyForm
 *   updateTier: Sửa 1 mức hoàn tiền trong danh sách theo vị trí → dùng ở: ReservationFields
 *   RenewalReturnFields: Các ô của nhóm "Gia hạn & trả kho": số ngày báo trước khi gia hạn, kỳ gia hạn tối thiểu/tối đa, hạn thanh toán → dùng ở: PolicyForm
 *   toggleTerm: Bật/tắt 1 kỳ gia hạn (số tháng) được phép, rồi cập nhật kỳ gia hạn tối thiểu/tối đa → dùng ở: RenewalReturnFields
 */
import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPut } from '../../api/api'
import PriceInput from '../../components/common/PriceInput'
import { formatVnd } from '../../services/storageRules'
import {
  DEFAULT_POLICIES, PERIOD_LABELS, POLICY_TITLES,
  depositFor, describePolicy, fmtDay, loadPolicies
} from '../../services/policies'
import { getTodayISO } from '../../demoClock/demoClock'
import './BusinessPolicyEditor.css'

/** Danh sách tab: [policyKey gửi lên API, số thứ tự nhóm, nhãn hiển thị]. */
const TABS = [
  ['deposit', '1', 'Tiền đặt cọc'],
  ['overdue', '3', 'Phí quá hạn & phụ phí'],
  ['reservation', '4', 'Đặt chỗ & hủy'],
  ['renewal_return', '5', 'Gia hạn & trả kho']
]
// [THỜI GIAN THỰC]:
// const today = () => {
//   const d = new Date()
//   return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// }
// [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock
/**
 * "Hôm nay" dạng 'YYYY-MM-DD' theo Demo Clock (ngày áp dụng nhỏ nhất được phép chọn).
 * @returns {string}
 */
const today = () => getTodayISO()
/**
 * Sao chép sâu 1 giá trị (qua JSON) để sửa form mà không đụng dữ liệu gốc.
 * @param {any} value giá trị cần sao chép.
 * @returns {any} bản sao độc lập.
 */
const clone = value => JSON.parse(JSON.stringify(value))
/**
 * Đổi chuỗi người dùng nhập thành số (chấp nhận dấu phẩy thập phân, vd "1,5" -> 1.5).
 * @param {string} text chuỗi nhập.
 * @returns {number|null} số; rỗng -> null; không hợp lệ -> NaN.
 */
const toNumber = text => {
  if (text === '' || text == null) return null
  const n = Number(String(text).replace(',', '.'))
  return Number.isNaN(n) ? NaN : n
}

/**
 * Ô nhập số dùng trong form chính sách: tự lọc ký tự không phải số, hỗ trợ số thập phân (dấu phẩy),
 * cho phép để trống; chỉ báo onChange khi giá trị hợp lệ. Giữ chuỗi đang gõ riêng (text) để gõ "1," không bị mất dấu phẩy.
 * Được dùng bởi: DepositFields, OverdueFields, ReservationFields, RenewalReturnFields.
 * @param {object} props
 * @param {string} props.label nhãn ô.
 * @param {number|null} props.value giá trị số hiện tại.
 * @param {Function} props.onChange nhận số mới (hoặc null khi để trống và allowEmpty).
 * @param {string} [props.suffix] đơn vị hiển thị sau ô (vd "ngày").
 * @param {string} [props.hint] dòng gợi ý dưới ô.
 * @param {boolean} [props.allowDecimal] cho nhập số thập phân.
 * @param {boolean} [props.allowEmpty] cho phép để trống (giá trị null).
 * @param {number} [props.width] độ rộng tối đa (px).
 */
function NumField({ label, value, onChange, suffix, hint, allowDecimal = false, allowEmpty = false, width }) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', allowDecimal ? ',' : '.'))
  // Khi value từ ngoài đổi (vd bấm "Hoàn tác") mà khác chuỗi đang gõ -> cập nhật lại chuỗi hiển thị.
  useEffect(() => {
    const current = toNumber(text)
    if (current !== value && !(current == null && value == null)) setText(value == null ? '' : String(value).replace('.', ','))
  }, [value])
  // Ô nhập số có nhãn
  return (
    <label className="pe-field">
      <span>{label}</span>
      <div className="pe-input-wrap" style={width ? { maxWidth: width } : undefined}>
        <input
          inputMode={allowDecimal ? 'decimal' : 'numeric'}
          value={text}
          onChange={e => {
            const raw = e.target.value.replace(allowDecimal ? /[^\d.,]/g : /[^\d]/g, '')
            setText(raw)
            const n = toNumber(raw)
            if (raw === '' ? allowEmpty : !Number.isNaN(n)) onChange(raw === '' ? null : n)
          }}
        />
        {suffix && <em>{suffix}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  )
}

/**
 * Nhóm nút chọn 1 trong nhiều lựa chọn (hoạt động như radio), nút đang chọn có class 'on'.
 * @param {object} props
 * @param {string} props.label nhãn nhóm.
 * @param {string} props.value key đang chọn.
 * @param {Array<[string, string]>} props.options danh sách [key, chữ hiển thị].
 * @param {Function} props.onChange nhận key khi bấm 1 nút.
 */
function Choice({ label, value, options, onChange }) {
  // Nhóm nút chọn 1 giá trị
  return (
    <div className="pe-field">
      <span>{label}</span>
      <div className="pe-choice" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button key={key} type="button" role="radio" aria-checked={value === key} className={value === key ? 'on' : ''} onClick={() => onChange(key)}>{text}</button>
        ))}
      </div>
    </div>
  )
}

/**
 * Màn hình thiết lập chính sách: tải chính sách hiện hành, hiện thanh tab 4 nhóm và PolicyForm của nhóm đang chọn.
 * Được gọi bởi: BusinessOperations khi activeMenu === "policies".
 * @param {object} props
 * @param {Array} [props.facilities] danh sách cơ sở (để chọn phạm vi áp dụng cọc, mô tả chính sách).
 * @param {object} props.dialog đối tượng hộp thoại (useDialog) truyền xuống PolicyForm.
 */
export function BusinessPolicyEditor({ facilities = [], dialog }) {
  const [tab, setTab] = useState('deposit') // policyKey của tab đang mở
  const [data, setData] = useState(null) // kết quả GET /api/policies: { current: {key: phiên bản}, scheduled: [...] }
  const [error, setError] = useState('')

  /**
   * Tải chính sách hiện hành và làm mới cache chính sách dùng chung (loadPolicies(true) trong services/policies).
   * API: GET /api/policies
   * Được gọi khi: mở màn hình, bấm "Thử lại", và sau khi lưu phiên bản mới (onSaved).
   */
  const load = async () => {
    try {
      setError('')
      const result = await apiGet('/api/policies')
      setData(result)
      loadPolicies(true)
    } catch (loadError) {
      setError(loadError.message)
    }
  }
  // Chạy 1 lần khi mở màn hình: tải chính sách.
  useEffect(() => { load() }, [])

  if (error && !data) {
    return (
      <section className="business-panel">
        <div className="auth-message error" role="alert">{error}</div>
        <button type="button" className="dashboard-primary-btn" onClick={() => load()}>Thử lại</button>
      </section>
    )
  }
  if (!data) return <section className="business-panel"><p>Đang tải chính sách...</p></section>

  // Phiên bản đang áp dụng của tab (chưa có thì dùng giá trị mặc định hệ thống, version 0).
  const current = data.current?.[tab] || { version: 0, value: DEFAULT_POLICIES[tab], isDefault: true }
  // Các phiên bản đã lưu nhưng ngày áp dụng ở tương lai.
  const scheduled = (data.scheduled || []).filter(item => item.key === tab)

  // Màn hình chính sách: tab + form
  return (
    <div className="pe-root">
      <div className="pe-tabs" role="tablist" aria-label="Nhóm chính sách">
        {TABS.map(([key, , label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {/* key đổi theo tab + version -> form được tạo mới (reset state) khi đổi tab hoặc sau khi lưu */}
      <PolicyForm
        key={`${tab}-${current.version}`}
        policyKey={tab}
        current={current}
        scheduled={scheduled}
        facilities={facilities}
        dialog={dialog}
        onSaved={load}
      />
    </div>
  )
}

/**
 * Form sửa 1 nhóm chính sách: hiện tóm tắt chính sách hiện hành + bản nháp đang sửa, các ô nhập theo nhóm,
 * chọn ngày áp dụng + ghi chú, nút Hoàn tác / Lưu phiên bản mới, và bảng lịch sử phiên bản.
 * Được gọi bởi: BusinessPolicyEditor.
 * @param {object} props
 * @param {string} props.policyKey 'deposit' | 'overdue' | 'reservation' | 'renewal_return'.
 * @param {object} props.current phiên bản hiện hành { version, value, effectiveFrom, isDefault }.
 * @param {Array} props.scheduled các phiên bản đã hẹn ngày áp dụng trong tương lai.
 * @param {Array} props.facilities danh sách cơ sở.
 * @param {object} props.dialog hộp thoại (confirm / alert).
 * @param {Function} props.onSaved gọi sau khi lưu thành công để tải lại dữ liệu.
 */
function PolicyForm({ policyKey, current, scheduled, facilities, dialog, onSaved }) {
  // Cấu hình đang sửa (bản sao của phiên bản hiện hành).
  const [value, setValue] = useState(() => {
    const initial = clone(current.value || DEFAULT_POLICIES[policyKey])
    // Cọc chỉ tính theo số tháng tiền thuê (mặc định 2 tháng).
    if (policyKey === 'deposit' && initial.method !== 'months') return { ...initial, method: 'months', value: 2 }
    return initial
  })
  const [effectiveFrom, setEffectiveFrom] = useState(today())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(null) // lịch sử phiên bản (null = chưa tải; { error } khi lỗi)
  const [showHistory, setShowHistory] = useState(false)

  // dirty = cấu hình đang sửa khác phiên bản hiện hành -> mới bật nút Lưu / Hoàn tác.
  const dirty =JSON.stringify(value) !== JSON.stringify(current.value || DEFAULT_POLICIES[policyKey])
  // Cập nhật 1 trường trong cấu hình chính sách đang sửa.
  const set = (key, next) => setValue(v => ({ ...v, [key]: next }))
  // Tính câu mô tả xem trước của cấu hình đang sửa (describePolicy).
  const preview = useMemo(() => describePolicy(policyKey, value, { facilities }), [policyKey, value, facilities])

  /**
   * Kiểm tra cấu hình theo từng nhóm (cọc 1 hoặc 2 tháng, phí quá hạn hợp lệ, thời gian giữ chỗ 5–1440 phút,
   * mức hoàn tiền không trùng và có mức 0 ngày, kỳ gia hạn hợp lệ...) và ngày áp dụng không ở quá khứ.
   * Được gọi bởi: save, trước khi hỏi xác nhận.
   * @returns {string|null} câu lỗi hoặc null nếu hợp lệ.
   */
  const validate = () => {
    const v = value
    // Kiểm tra số bị trống hoặc không hợp lệ (null/NaN).
    const bad = n => n == null || Number.isNaN(n)
    if (policyKey === 'deposit') {
      if (bad(v.value) || v.value <= 0) return 'Nhập giá trị đặt cọc lớn hơn 0.'
      // Backend chỉ lưu 1 hoặc 2 tháng cọc (RentalPolicy.DepositMonths).
      if (v.value !== 1 && v.value !== 2) return 'Tiền cọc chỉ chọn 1 hoặc 2 tháng tiền thuê.'
      if (v.scope === 'selected' && !v.facilityIds.length) return 'Chọn ít nhất một cơ sở áp dụng.'
    }
    if (policyKey === 'overdue') {
      if (bad(v.feeValue) || v.feeValue < 0) return 'Nhập phí quá hạn hợp lệ.'
      if (v.feeType === 'percent' && v.feeValue > 100) return 'Tỷ lệ phí quá hạn tối đa 100%.'
      if (bad(v.graceDays) || v.graceDays < 0) return 'Nhập số ngày bắt đầu tính phí.'
      if (v.maxPercent != null && (Number.isNaN(v.maxPercent) || v.maxPercent < 0 || v.maxPercent > 100)) return 'Mức trần phí không hợp lệ.'
      if (v.extraFees.some(f => !f.name.trim())) return 'Mỗi phụ phí cần có tên.'
      const codes = v.extraFees.map(f => (f.code || '').trim().toUpperCase()).filter(Boolean)
      if (new Set(codes).size !== codes.length) return 'Mã phụ phí bị trùng.'
    }
    if (policyKey === 'reservation') {
      if (bad(v.holdMinutes) || v.holdMinutes < 5 || v.holdMinutes > 1440) return 'Thời hạn giữ chỗ từ 5 phút đến 1440 phút (24 giờ).'
      if (bad(v.maxAdvanceBookingDays) || v.maxAdvanceBookingDays < 1 || v.maxAdvanceBookingDays > 365) return 'Số ngày được đặt trước từ 1 đến 365 ngày.'
      if (!v.refundTiers.length) return 'Cần ít nhất một mức hoàn tiền.'
      if (v.refundTiers.some(t => bad(t.minDaysBefore) || bad(t.refundPercent) || t.refundPercent > 100)) return 'Mức hoàn tiền không hợp lệ.'
      const days = v.refundTiers.map(t => t.minDaysBefore)
      if (new Set(days).size !== days.length) return 'Các mức hoàn tiền bị trùng số ngày.'
      if (!days.includes(0)) return 'Cần có mức cho trường hợp hủy sát ngày (từ 0 ngày).'
      if (bad(v.noShowAfterDays) || bad(v.noShowRefundPercent) || v.noShowRefundPercent > 100) return 'Quy định khách không đến chưa hợp lệ.'
    }
    if (policyKey === 'renewal_return') {
      if ([v.renewalNoticeDays, v.minRenewalMonths, v.maxRenewalMonths, v.returnNoticeDays, v.depositRefundWorkingDays].some(bad)) return 'Vui lòng điền đủ các ô số.'
      // Backend chỉ cho gia hạn gói 6 hoặc 12 tháng: khoảng min–max phải chứa ít nhất 1 gói.
      if (![6, 12].some(m => m >= v.minRenewalMonths && m <= v.maxRenewalMonths)) return 'Chọn ít nhất 1 gói gia hạn (6 hoặc 12 tháng).'
      if (v.returnFees.some(f => !f.name.trim())) return 'Mỗi phí trả kho cần có tên.'
    }
    if (!effectiveFrom || effectiveFrom < today()) return 'Ngày bắt đầu áp dụng không được ở trong quá khứ.'
    return null
  }

  /**
   * Lưu phiên bản chính sách mới (bấm "Lưu phiên bản mới"): validate, hỏi xác nhận (kèm số phiên bản mới,
   * ngày áp dụng, tối đa 6 dòng cấu hình), gửi lên backend, báo thành công rồi gọi onSaved để tải lại.
   * API: PUT /api/policies/{policyKey}  body { value, effectiveFrom, note }
   */
  const save = async () => {
    const message = validate()
    if (message) return setError(message)
    setError('')
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Lưu chính sách “${POLICY_TITLES[policyKey]}”?`,
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>Tạo phiên bản <strong>v{(current.version || 0) + 1}</strong>, áp dụng từ <strong>{fmtDay(effectiveFrom)}</strong>{effectiveFrom === today() ? ' (ngay hôm nay)' : ''}.</p>
          <ul className="pe-confirm-list">{preview.settings.slice(0, 6).map(([k, v]) => <li key={k}><strong>{k}:</strong> {v}</li>)}</ul>
          <p style={{ margin: '8px 0 0', color: '#6d849b' }}>Hợp đồng và đặt chỗ đã tạo trước đó giữ nguyên điều khoản cũ.</p>
        </>
      ),
      confirmLabel: 'Lưu phiên bản mới'
    })
    if (!ok) return
    setSaving(true)
    try {
      await apiPut(`/api/policies/${policyKey}`, { effectiveFrom, note: note.trim() || null, value })
      await dialog.alert({ tone: 'success', title: 'Đã lưu chính sách', message: `${POLICY_TITLES[policyKey]}: phiên bản mới áp dụng từ ${fmtDay(effectiveFrom)}.` })
      await onSaved()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Hiện/ẩn bảng lịch sử phiên bản (bấm "Lịch sử thay đổi"); chỉ tải ở lần mở đầu tiên.
   * API: GET /api/policies/{policyKey}/history
   */
  const toggleHistory = async () => {
    const next = !showHistory
    setShowHistory(next)
    if (next && !history) {
      try {
        setHistory(await apiGet(`/api/policies/${policyKey}/history`))
      } catch (historyError) {
        setHistory({ error: historyError.message })
      }
    }
  }

  // Form sửa 1 nhóm chính sách
  return (
    <section className="business-panel pe-panel">
      {/* Tiêu đề + tóm tắt chính sách hiện hành */}
      <header className="pe-head">
        <div>
          <span className="pe-eyebrow">Chính sách hiện hành</span>
          <h2>{POLICY_TITLES[policyKey]}</h2>
          <p>{describePolicy(policyKey, current.value || DEFAULT_POLICIES[policyKey], { facilities }).summary}</p>
          {dirty && <p className="pe-draft">Đang sửa (chưa lưu): {preview.summary}</p>}
        </div>
        <div className="pe-version">
          {current.isDefault
            ? <span className="pe-badge">Mặc định hệ thống</span>
            : <span className="pe-badge on">v{current.version} · từ {fmtDay(current.effectiveFrom)}</span>}
          <button type="button" className="pe-link" onClick={toggleHistory}>{showHistory ? 'Ẩn lịch sử' : 'Lịch sử thay đổi'}</button>
        </div>
      </header>

      {/* Phiên bản đã hẹn ngày áp dụng */}
      {scheduled.length > 0 && (
        <div className="pe-scheduled">
          ⏱ Đã hẹn {scheduled.map(item => <strong key={item.version}>v{item.version} áp dụng từ {fmtDay(item.effectiveFrom)}</strong>)}. Lưu thêm sẽ tạo phiên bản mới hơn.
        </div>
      )}

      {/* Bảng lịch sử phiên bản */}
      {showHistory && (
        <div className="pe-history">
          {!history ? 'Đang tải...' : history.error ? history.error : history.length === 0 ? 'Chưa có phiên bản nào, đang dùng giá trị mặc định.' : (
            <table className="admin-table">
              <thead><tr><th>Phiên bản</th><th>Áp dụng từ</th><th>Người lưu</th><th>Lưu lúc</th><th>Ghi chú</th><th>Tóm tắt</th></tr></thead>
              <tbody>
                {history.map(item => (
                  <tr key={item.version}>
                    <td><strong>v{item.version}</strong></td>
                    <td>{fmtDay(item.effectiveFrom)}</td>
                    <td>{item.createdBy || '—'}</td>
                    <td>{item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : '—'}</td>
                    <td>{item.note || '—'}</td>
                    <td className="pe-history-summary">{describePolicy(policyKey, item.value, { facilities }).summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Các ô nhập của nhóm */}
      <div className="pe-body">
        {policyKey === 'deposit' && <DepositFields value={value} set={set} facilities={facilities} />}
        {policyKey === 'overdue' && <OverdueFields value={value} set={set} />}
        {policyKey === 'reservation' && <ReservationFields value={value} set={set} />}
        {policyKey === 'renewal_return' && <RenewalReturnFields value={value} set={set} />}
      </div>

      {/* Ngày áp dụng + ghi chú + nút lưu */}
      <footer className="pe-save">
        <label className="pe-field">
          <span>Ngày bắt đầu áp dụng</span>
          <input type="date" value={effectiveFrom} min={today()} onChange={e => setEffectiveFrom(e.target.value)} />
        </label>
        <label className="pe-field pe-note">
          <span>Ghi chú thay đổi (không bắt buộc)</span>
          <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: điều chỉnh theo quyết định tháng 11" />
        </label>
        <div className="pe-save-actions">
          {error && <div className="auth-message error" role="alert">{error}</div>}
          <button type="button" className="dashboard-secondary-btn" disabled={!dirty || saving} onClick={() => { setValue(clone(current.value || DEFAULT_POLICIES[policyKey])); setError('') }}>Hoàn tác</button>
          <button type="button" className="dashboard-primary-btn" disabled={!dirty || saving} onClick={save}>{saving ? 'Đang lưu...' : 'Lưu phiên bản mới'}</button>
        </div>
      </footer>
      {!dirty && <p className="pe-muted">Chỉnh sửa các ô ở trên để tạo phiên bản mới.</p>}
    </section>
  )
}

/* ---------- 1. Tiền đặt cọc ---------- */
/**
 * Các ô của nhóm "Tiền đặt cọc": số tháng cọc (1 hoặc 2), phạm vi áp dụng (tất cả / chọn cơ sở),
 * và ví dụ tính cọc cho kho 1.000.000đ/tháng (dùng depositFor trong services/policies).
 * Được gọi bởi: PolicyForm khi policyKey === 'deposit'.
 * @param {object} props
 * @param {object} props.value cấu hình cọc { method, value, scope, facilityIds }.
 * @param {Function} props.set (key, giá trị) cập nhật 1 trường cấu hình.
 * @param {Array} props.facilities danh sách cơ sở để tick chọn.
 */
function DepositFields({ value, set, facilities }) {
  const sample = 1000000 // giá thuê mẫu để minh họa
  // Thêm/bỏ 1 cơ sở khỏi danh sách cơ sở áp dụng chính sách cọc.
  const toggleFacility = id => set('facilityIds', value.facilityIds.includes(id) ? value.facilityIds.filter(x => x !== id) : [...value.facilityIds, id])
  // Ô nhập chính sách tiền cọc
  return (
    <div className="pe-grid">
      <div className="pe-field">
        <span>Phương thức tính</span>
        <div className="pe-fixed-method">Theo số tháng tiền thuê của mỗi kho</div>
      </div>
      <NumField label="Giá trị đặt cọc" value={value.value} onChange={n => set('value', n)} suffix="tháng tiền thuê / kho" width={260} hint="Chọn 1 hoặc 2 tháng (mặc định 2 tháng tiền thuê)." />
      <Choice label="Phạm vi áp dụng" value={value.scope} options={[['all', 'Tất cả cơ sở'], ['selected', 'Các cơ sở được chọn']]} onChange={scope => set('scope', scope)} />
      {/* Chọn cơ sở áp dụng */}
      {value.scope === 'selected' && (
        <div className="pe-field pe-wide">
          <span>Chọn cơ sở ({value.facilityIds.length}/{facilities.length})</span>
          <div className="pe-checks">
            {facilities.map(f => (
              <label key={f.facilityId} className={value.facilityIds.includes(f.facilityId) ? 'on' : ''}>
                <input type="checkbox" checked={value.facilityIds.includes(f.facilityId)} onChange={() => toggleFacility(f.facilityId)} /> {f.name}
              </label>
            ))}
          </div>
          <small>Cơ sở không được chọn dùng mức mặc định hệ thống: 2 tháng tiền thuê.</small>
        </div>
      )}
      <div className="pe-example pe-wide">
        Ví dụ kho giá {formatVnd(sample)}đ/tháng: gói 6 tháng cọc <strong>{formatVnd(depositFor(value, { monthlyPrice: sample, months: 6, facilityId: value.facilityIds[0] }))}đ</strong>,
        gói 12 tháng cọc <strong>{formatVnd(depositFor(value, { monthlyPrice: sample, months: 12, facilityId: value.facilityIds[0] }))}đ</strong>.
      </div>
    </div>
  )
}

/* ---------- 3. Phí quá hạn & phụ phí ---------- */
/**
 * Các ô của nhóm "Phí quá hạn & phụ phí": loại phí (% hoặc cố định), chu kỳ tính, mức phí, số ngày chưa tính phí,
 * mức trần mỗi kỳ, ví dụ tính phí (nợ 1.000.000đ trễ 20 ngày) và bảng phụ phí chung (thêm / sửa / xóa / bật tắt).
 * Được gọi bởi: PolicyForm khi policyKey === 'overdue'.
 * @param {object} props
 * @param {object} props.value cấu hình { feeType, feeValue, period, graceDays, maxPercent, extraFees[] }.
 * @param {Function} props.set (key, giá trị) cập nhật 1 trường cấu hình.
 */
function OverdueFields({ value, set }) {
  const fees = value.extraFees
  // Sửa 1 phụ phí trong danh sách theo vị trí.
  const updateFee = (index, patch) => set('extraFees', fees.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  // Tính phí ví dụ: số ngày tính phí = ngày trễ - ngày chưa tính phí, đổi ra số kỳ theo ngày/tuần/tháng, áp mức trần nếu có.
  const sampleDebt = 1000000
  const sampleDays = 20
  const units =Math.max(0, sampleDays - (value.graceDays || 0))
  const periods = value.period === 'day' ? units : value.period === 'week' ? Math.ceil(units / 7) : Math.ceil(units / 30)
  let fee = value.feeType === 'percent' ? sampleDebt * (value.feeValue || 0) / 100 * periods : (value.feeValue || 0) * periods
  if (value.maxPercent != null && !Number.isNaN(value.maxPercent)) fee = Math.min(fee, sampleDebt * value.maxPercent / 100)
  // Ô nhập phí quá hạn & phụ phí
  return (
    <>
      <h4 className="pe-sub">Phí quá hạn</h4>
      {/* Mức phí trễ, ân hạn, trần phí */}
      <div className="pe-grid">
        <Choice label="Loại phí" value={value.feeType} options={[['percent', 'Tỷ lệ (%) số tiền quá hạn'], ['fixed', 'Số tiền cố định']]} onChange={t => set('feeType', t)} />
        <Choice label="Cách tính" value={value.period} options={Object.entries(PERIOD_LABELS).map(([k, l]) => [k, `Theo ${l}`])} onChange={p => set('period', p)} />
        {value.feeType === 'percent'
          ? <NumField label="Mức phí" value={value.feeValue} onChange={n => set('feeValue', n)} allowDecimal suffix={`% / ${PERIOD_LABELS[value.period]}`} width={220} />
          : <label className="pe-field"><span>Mức phí / {PERIOD_LABELS[value.period]}</span><PriceInput value={value.feeValue ?? ''} onChange={n => set('feeValue', n ?? 0)} ariaLabel="Phí quá hạn" /></label>}
        <NumField label="Bắt đầu tính phí sau" value={value.graceDays} onChange={n => set('graceDays', n)} suffix="ngày kể từ hạn thanh toán" width={300} />
        <NumField label="Mức tối đa mỗi kỳ (để trống = không giới hạn)" value={value.maxPercent} onChange={n => set('maxPercent', n)} allowDecimal allowEmpty suffix="% số tiền quá hạn" width={260} />
        <div className="pe-example">
          Ví dụ nợ {formatVnd(sampleDebt)}đ, trễ {sampleDays} ngày → phí <strong>{formatVnd(Math.round(fee))}đ</strong>
          {units === 0 ? ' (còn trong thời gian chưa tính phí)' : ` (${periods} ${PERIOD_LABELS[value.period]} tính phí)`}.
        </div>
      </div>

      <h4 className="pe-sub">Phụ phí chung</h4>
      <p className="pe-muted">Nhân viên chỉ được thu các khoản có trong bảng này. Để trống số tiền nếu tính theo chi phí thực tế.</p>
      {/* Bảng phụ phí */}
      <div className="admin-table-wrap">
        <table className="admin-table pe-table">
          <thead><tr><th>Mã</th><th>Tên phụ phí</th><th>Điều kiện phát sinh</th><th>Số tiền</th><th>Áp dụng</th><th></th></tr></thead>
          <tbody>
            {fees.map((f, i) => (
              <tr key={i} className={f.active ? '' : 'off'}>
                <td><input className="pe-cell code" value={f.code} onChange={e => updateFee(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20) })} aria-label="Mã phụ phí" /></td>
                <td><input className="pe-cell" value={f.name} onChange={e => updateFee(i, { name: e.target.value })} aria-label="Tên phụ phí" /></td>
                <td><input className="pe-cell" value={f.condition || ''} onChange={e => updateFee(i, { condition: e.target.value })} aria-label="Điều kiện" /></td>
                <td><PriceInput value={f.amount ?? ''} onChange={n => updateFee(i, { amount: n })} ariaLabel={`Số tiền ${f.name}`} placeholder="Chi phí thực tế" /></td>
                <td><input type="checkbox" checked={f.active} onChange={e => updateFee(i, { active: e.target.checked })} aria-label={`Áp dụng ${f.name}`} /></td>
                <td><button type="button" className="pe-remove" onClick={() => set('extraFees', fees.filter((_, x) => x !== i))} aria-label={`Xóa ${f.name}`}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="dashboard-secondary-btn sm" onClick={() => set('extraFees', [...fees, { code: '', name: '', amount: null, condition: '', active: true }])}>+ Thêm phụ phí</button>
    </>
  )
}

/* ---------- 4. Đặt chỗ & hủy ---------- */
/**
 * Các ô của nhóm "Đặt chỗ & hủy": thời hạn giữ chỗ chờ cọc, điều kiện hủy, các mức hoàn tiền cọc theo số ngày
 * hủy trước ngày bắt đầu, và quy định khi khách không đến nhận kho (no-show).
 * Được gọi bởi: PolicyForm khi policyKey === 'reservation'.
 * @param {object} props
 * @param {object} props.value cấu hình { holdMinutes, cancellationConditions, refundTiers[], noShowAfterDays, noShowRefundPercent, releaseUnitOnNoShow }.
 * @param {Function} props.set (key, giá trị) cập nhật 1 trường cấu hình.
 */
function ReservationFields({ value, set }) {
  const tiers = value.refundTiers
  // Sửa 1 mức hoàn tiền trong danh sách theo vị trí.
  const updateTier = (index, patch) => set('refundTiers', tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  // Các mức sắp xếp theo số ngày giảm dần (giữ vị trí gốc `i` để sửa/xóa đúng phần tử); dùng để hiện khoảng "từ X đến Y ngày".
  const sorted =[...tiers].map((t, i) => ({ ...t, i })).sort((a, b) => (b.minDaysBefore ?? 0) - (a.minDaysBefore ?? 0))
  // Ô nhập đặt chỗ & hủy
  return (
    <>
      {/* Thời gian giữ chỗ, đặt trước tối đa */}
      <div className="pe-grid">
        <NumField label="Thời hạn giữ chỗ" value={value.holdMinutes} onChange={n => set('holdMinutes', n)} suffix="phút chờ khách trả cọc" width={280} hint="Hết thời gian mà chưa cọc, kho được mở lại cho khách khác." />
        <NumField label="Đặt trước tối đa" value={value.maxAdvanceBookingDays ?? 30} onChange={n => set('maxAdvanceBookingDays', n)} suffix="ngày kể từ hôm nay" width={260} hint="Khách chỉ chọn được ngày bắt đầu thuê (ngày nhận kho) trong khoảng này." />
        <label className="pe-field pe-wide">
          <span>Điều kiện hủy đặt chỗ</span>
          <textarea rows={2} value={value.cancellationConditions || ''} onChange={e => set('cancellationConditions', e.target.value)} />
        </label>
      </div>

      <h4 className="pe-sub">Mức hoàn tiền cọc khi hủy</h4>
      {/* Các mức hoàn cọc khi hủy */}
      <div className="pe-tiers">
        {sorted.map((t, idx) => {
          const upper = idx > 0 ? sorted[idx - 1].minDaysBefore - 1 : null
          return (
            <div key={t.i} className="pe-tier">
              <span>Hủy từ</span>
              <NumField label="" value={t.minDaysBefore} onChange={n => updateTier(t.i, { minDaysBefore: n })} suffix="ngày" width={120} />
              <span className="pe-tier-range">{upper != null && upper >= t.minDaysBefore ? `đến ${upper} ngày` : 'trở lên'} trước ngày bắt đầu →</span>
              <NumField label="" value={t.refundPercent} onChange={n => updateTier(t.i, { refundPercent: n })} suffix="% tiền cọc" width={150} />
              <button type="button" className="pe-remove" disabled={tiers.length <= 1} onClick={() => set('refundTiers', tiers.filter((_, x) => x !== t.i))} aria-label="Xóa mức">×</button>
            </div>
          )
        })}
        <button type="button" className="dashboard-secondary-btn sm" onClick={() => set('refundTiers', [...tiers, { minDaysBefore: Math.max(0, ...tiers.map(t => t.minDaysBefore || 0)) + 7, refundPercent: 100 }])}>+ Thêm mức</button>
      </div>

      <h4 className="pe-sub">Khách không đến nhận kho (no-show)</h4>
      <div className="pe-grid">
        <NumField label="Xử lý no-show sau" value={value.noShowAfterDays} onChange={n => set('noShowAfterDays', n)} suffix="ngày kể từ ngày bắt đầu" width={300} hint="0 = khi hết ngày bắt đầu thuê mà khách chưa nhận kho." />
        <NumField label="Hoàn lại" value={value.noShowRefundPercent} onChange={n => set('noShowRefundPercent', n)} suffix="% tiền cọc" width={200} />
        <label className="pe-check"><input type="checkbox" checked={value.releaseUnitOnNoShow} onChange={e => set('releaseUnitOnNoShow', e.target.checked)} /> Mở lại kho cho khách khác thuê</label>
      </div>
    </>
  )
}

/* ---------- 5. Gia hạn & trả kho ---------- */
/**
 * Các ô của nhóm "Gia hạn & trả kho": số ngày báo trước khi gia hạn, kỳ gia hạn tối thiểu/tối đa, hạn thanh toán,
 * điều kiện không còn nợ quá hạn, cách tính giá gia hạn; số ngày báo trả kho, số ngày hoàn cọc, yêu cầu khi trả kho
 * và bảng phí trả kho (thêm / sửa / xóa).
 * Được gọi bởi: PolicyForm khi policyKey === 'renewal_return'.
 * @param {object} props
 * @param {object} props.value cấu hình gia hạn & trả kho (renewalNoticeDays, minRenewalMonths, returnFees[]...).
 * @param {Function} props.set (key, giá trị) cập nhật 1 trường cấu hình.
 */
function RenewalReturnFields({ value, set }) {
  const fees = value.returnFees
  // Sửa 1 phí trả kho trong danh sách theo vị trí.
  const updateFee = (index, patch) => set('returnFees', fees.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  // Gói gia hạn 6 / 12 tháng vẫn lưu thành min/max (6–6, 12–12, 6–12; không chọn gói nào = 0–0) để backend giữ nguyên dữ liệu.
  const allowed = [6, 12].filter(m => m >= value.minRenewalMonths && m <= value.maxRenewalMonths)
  const toggleTerm = m => {
    const next = allowed.includes(m) ? allowed.filter(x => x !== m) : [...allowed, m]
    set('minRenewalMonths', next.length ? Math.min(...next) : 0)
    set('maxRenewalMonths', next.length ? Math.max(...next) : 0)
  }
  // Ô nhập gia hạn & trả kho
  return (
    <>
      <h4 className="pe-sub">Gia hạn</h4>
      {/* Báo trước, kỳ gia hạn, hạn hoàn cọc */}
      <div className="pe-grid">
        <NumField label="Gửi yêu cầu gia hạn trước" value={value.renewalNoticeDays} onChange={n => set('renewalNoticeDays', n)} suffix="ngày so với ngày hết hạn" width={300} />
        <div className="pe-field">
          <span>Gói gia hạn cho phép</span>
          <div className="pe-checks">
            {[6, 12].map(m => (
              <label key={m} className={allowed.includes(m) ? 'on' : ''}>
                <input type="checkbox" checked={allowed.includes(m)} onChange={() => toggleTerm(m)} /> {m} tháng
              </label>
            ))}
          </div>
          <small>Khách chỉ được gia hạn theo các gói được chọn (phải chọn ít nhất 1 gói).</small>
        </div>
        <label className="pe-check"><input type="checkbox" checked={value.requireNoOverdue} onChange={e => set('requireNoOverdue', e.target.checked)} /> Chỉ cho gia hạn khi không còn khoản quá hạn</label>
        <label className="pe-field pe-wide"><span>Cách tính giá gia hạn</span><input value={value.renewalPricing || ''} onChange={e => set('renewalPricing', e.target.value)} /></label>
      </div>

      <h4 className="pe-sub">Trả kho</h4>
      <div className="pe-grid">
        <NumField label="Báo trả kho trước" value={value.returnNoticeDays} onChange={n => set('returnNoticeDays', n)} suffix="ngày" width={160} />
        <NumField label="Hoàn cọc trong" value={value.depositRefundWorkingDays} onChange={n => set('depositRefundWorkingDays', n)} suffix="ngày làm việc sau khi kiểm tra" width={320} />
        <label className="pe-field pe-wide"><span>Khách cần làm khi trả kho</span><textarea rows={2} value={value.returnRequirements || ''} onChange={e => set('returnRequirements', e.target.value)} /></label>
      </div>
      {/* Bảng phí khi trả kho */}
      <div className="admin-table-wrap">
        <table className="admin-table pe-table">
          <thead><tr><th>Phí liên quan khi trả kho</th><th>Điều kiện</th><th>Số tiền</th><th></th></tr></thead>
          <tbody>
            {fees.length === 0 && <tr><td colSpan="4" className="pe-muted">Không có phí trả kho.</td></tr>}
            {fees.map((f, i) => (
              <tr key={i}>
                <td><input className="pe-cell" value={f.name} onChange={e => updateFee(i, { name: e.target.value })} aria-label="Tên phí" /></td>
                <td><input className="pe-cell" value={f.condition || ''} onChange={e => updateFee(i, { condition: e.target.value })} aria-label="Điều kiện" /></td>
                <td><PriceInput value={f.amount ?? ''} onChange={n => updateFee(i, { amount: n })} ariaLabel={`Số tiền ${f.name}`} placeholder="Chi phí thực tế" /></td>
                <td><button type="button" className="pe-remove" onClick={() => set('returnFees', fees.filter((_, x) => x !== i))} aria-label={`Xóa ${f.name}`}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="dashboard-secondary-btn sm" onClick={() => set('returnFees', [...fees, { name: '', amount: null, condition: '' }])}>+ Thêm phí</button>
    </>
  )
}
