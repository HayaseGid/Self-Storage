import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPut } from './api'
import PriceInput from './PriceInput'
import { formatVnd } from './storageRules'
import {
  DEFAULT_POLICIES, PERIOD_LABELS, POLICY_TITLES,
  depositFor, describePolicy, fmtDay, loadPolicies
} from './policies'
import './BusinessPolicyEditor.css'

/*
 * Business Operations: thiết lập chính sách chung.
 *   1. Tiền đặt cọc            3. Phí quá hạn & phụ phí
 *   4. Đặt chỗ & hủy           5. Gia hạn & trả kho
 * (2. Kích thước & giá ở menu riêng - BusinessPriceBands.jsx)
 * Mỗi lần lưu tạo một PHIÊN BẢN mới với ngày bắt đầu áp dụng; phiên bản cũ giữ lại để đối chiếu hợp đồng.
 */

const TABS = [
  ['deposit', '1', 'Tiền đặt cọc'],
  ['overdue', '3', 'Phí quá hạn & phụ phí'],
  ['reservation', '4', 'Đặt chỗ & hủy'],
  ['renewal_return', '5', 'Gia hạn & trả kho']
]
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const clone = value => JSON.parse(JSON.stringify(value))
const toNumber = text => {
  if (text === '' || text == null) return null
  const n = Number(String(text).replace(',', '.'))
  return Number.isNaN(n) ? NaN : n
}

function NumField({ label, value, onChange, suffix, hint, allowDecimal = false, allowEmpty = false, width }) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', allowDecimal ? ',' : '.'))
  useEffect(() => {
    const current = toNumber(text)
    if (current !== value && !(current == null && value == null)) setText(value == null ? '' : String(value).replace('.', ','))
  }, [value])
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

function Choice({ label, value, options, onChange }) {
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

export function BusinessPolicyEditor({ facilities = [], dialog }) {
  const [tab, setTab] = useState('deposit')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

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
  useEffect(() => { load() }, [])

  if (error && !data) {
    return (
      <section className="business-panel">
        <div className="auth-message error" role="alert">{error}</div>
        <button type="button" className="dashboard-primary-btn" onClick={load}>Thử lại</button>
      </section>
    )
  }
  if (!data) return <section className="business-panel"><p>Đang tải chính sách...</p></section>

  const current = data.current?.[tab] || { version: 0, value: DEFAULT_POLICIES[tab], isDefault: true }
  const scheduled = (data.scheduled || []).filter(item => item.key === tab)

  return (
    <div className="pe-root">
      <div className="pe-tabs" role="tablist" aria-label="Nhóm chính sách">
        {TABS.map(([key, , label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
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

function PolicyForm({ policyKey, current, scheduled, facilities, dialog, onSaved }) {
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
  const [history, setHistory] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const dirty = JSON.stringify(value) !== JSON.stringify(current.value || DEFAULT_POLICIES[policyKey])
  const set = (key, next) => setValue(v => ({ ...v, [key]: next }))
  const preview = useMemo(() => describePolicy(policyKey, value, { facilities }), [policyKey, value, facilities])

  const validate = () => {
    const v = value
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
      if (!v.refundTiers.length) return 'Cần ít nhất một mức hoàn tiền.'
      if (v.refundTiers.some(t => bad(t.minDaysBefore) || bad(t.refundPercent) || t.refundPercent > 100)) return 'Mức hoàn tiền không hợp lệ.'
      const days = v.refundTiers.map(t => t.minDaysBefore)
      if (new Set(days).size !== days.length) return 'Các mức hoàn tiền bị trùng số ngày.'
      if (!days.includes(0)) return 'Cần có mức cho trường hợp hủy sát ngày (từ 0 ngày).'
      if (bad(v.noShowAfterDays) || bad(v.noShowRefundPercent) || v.noShowRefundPercent > 100) return 'Quy định khách không đến chưa hợp lệ.'
    }
    if (policyKey === 'renewal_return') {
      if ([v.renewalNoticeDays, v.minRenewalMonths, v.maxRenewalMonths, v.returnNoticeDays, v.depositRefundWorkingDays].some(bad)) return 'Vui lòng điền đủ các ô số.'
      if (v.minRenewalMonths < 1 || v.minRenewalMonths > v.maxRenewalMonths || v.maxRenewalMonths > 36) return 'Kỳ gia hạn không hợp lệ.'
      if (v.returnFees.some(f => !f.name.trim())) return 'Mỗi phí trả kho cần có tên.'
    }
    if (!effectiveFrom || effectiveFrom < today()) return 'Ngày bắt đầu áp dụng không được ở trong quá khứ.'
    return null
  }

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

  return (
    <section className="business-panel pe-panel">
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

      {scheduled.length > 0 && (
        <div className="pe-scheduled">
          ⏱ Đã hẹn {scheduled.map(item => <strong key={item.version}>v{item.version} áp dụng từ {fmtDay(item.effectiveFrom)}</strong>)}. Lưu thêm sẽ tạo phiên bản mới hơn.
        </div>
      )}

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

      <div className="pe-body">
        {policyKey === 'deposit' && <DepositFields value={value} set={set} facilities={facilities} />}
        {policyKey === 'overdue' && <OverdueFields value={value} set={set} />}
        {policyKey === 'reservation' && <ReservationFields value={value} set={set} />}
        {policyKey === 'renewal_return' && <RenewalReturnFields value={value} set={set} />}
      </div>

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
function DepositFields({ value, set, facilities }) {
  const sample = 1000000
  const toggleFacility = id => set('facilityIds', value.facilityIds.includes(id) ? value.facilityIds.filter(x => x !== id) : [...value.facilityIds, id])
  return (
    <div className="pe-grid">
      <div className="pe-field">
        <span>Phương thức tính</span>
        <div className="pe-fixed-method">Theo số tháng tiền thuê của mỗi kho</div>
      </div>
      <NumField label="Giá trị đặt cọc" value={value.value} onChange={n => set('value', n)} suffix="tháng tiền thuê / kho" width={260} hint="Chọn 1 hoặc 2 tháng (mặc định 2 tháng tiền thuê)." />
      <Choice label="Phạm vi áp dụng" value={value.scope} options={[['all', 'Tất cả cơ sở'], ['selected', 'Các cơ sở được chọn']]} onChange={scope => set('scope', scope)} />
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
function OverdueFields({ value, set }) {
  const fees = value.extraFees
  const updateFee = (index, patch) => set('extraFees', fees.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  const sampleDebt = 1000000
  const sampleDays = 20
  const units = Math.max(0, sampleDays - (value.graceDays || 0))
  const periods = value.period === 'day' ? units : value.period === 'week' ? Math.ceil(units / 7) : Math.ceil(units / 30)
  let fee = value.feeType === 'percent' ? sampleDebt * (value.feeValue || 0) / 100 * periods : (value.feeValue || 0) * periods
  if (value.maxPercent != null && !Number.isNaN(value.maxPercent)) fee = Math.min(fee, sampleDebt * value.maxPercent / 100)
  return (
    <>
      <h4 className="pe-sub">Phí quá hạn</h4>
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
function ReservationFields({ value, set }) {
  const tiers = value.refundTiers
  const updateTier = (index, patch) => set('refundTiers', tiers.map((t, i) => (i === index ? { ...t, ...patch } : t)))
  const sorted = [...tiers].map((t, i) => ({ ...t, i })).sort((a, b) => (b.minDaysBefore ?? 0) - (a.minDaysBefore ?? 0))
  return (
    <>
      <div className="pe-grid">
        <NumField label="Thời hạn giữ chỗ" value={value.holdMinutes} onChange={n => set('holdMinutes', n)} suffix="phút chờ khách trả cọc" width={280} hint="Hết thời gian mà chưa cọc, kho được mở lại cho khách khác." />
        <label className="pe-field pe-wide">
          <span>Điều kiện hủy đặt chỗ</span>
          <textarea rows={2} value={value.cancellationConditions || ''} onChange={e => set('cancellationConditions', e.target.value)} />
        </label>
      </div>

      <h4 className="pe-sub">Mức hoàn tiền cọc khi hủy</h4>
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
function RenewalReturnFields({ value, set }) {
  const fees = value.returnFees
  const updateFee = (index, patch) => set('returnFees', fees.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  return (
    <>
      <h4 className="pe-sub">Gia hạn</h4>
      <div className="pe-grid">
        <NumField label="Gửi yêu cầu gia hạn trước" value={value.renewalNoticeDays} onChange={n => set('renewalNoticeDays', n)} suffix="ngày so với ngày hết hạn" width={300} />
        <NumField label="Kỳ gia hạn tối thiểu" value={value.minRenewalMonths} onChange={n => set('minRenewalMonths', n)} suffix="tháng" width={160} />
        <NumField label="Kỳ gia hạn tối đa" value={value.maxRenewalMonths} onChange={n => set('maxRenewalMonths', n)} suffix="tháng" width={160} />
        <NumField label="Hạn chót thanh toán khi gia hạn (để trống = chưa quy định)" value={value.renewalPaymentDeadlineDays} onChange={n => set('renewalPaymentDeadlineDays', n)} allowEmpty suffix="ngày trước ngày hết hạn" width={300} />
        <label className="pe-check"><input type="checkbox" checked={value.requireNoOverdue} onChange={e => set('requireNoOverdue', e.target.checked)} /> Chỉ cho gia hạn khi không còn khoản quá hạn</label>
        <label className="pe-field pe-wide"><span>Cách tính giá gia hạn</span><input value={value.renewalPricing || ''} onChange={e => set('renewalPricing', e.target.value)} /></label>
      </div>

      <h4 className="pe-sub">Trả kho</h4>
      <div className="pe-grid">
        <NumField label="Báo trả kho trước" value={value.returnNoticeDays} onChange={n => set('returnNoticeDays', n)} suffix="ngày" width={160} />
        <NumField label="Hoàn cọc trong" value={value.depositRefundWorkingDays} onChange={n => set('depositRefundWorkingDays', n)} suffix="ngày làm việc sau khi kiểm tra" width={320} />
        <label className="pe-field pe-wide"><span>Khách cần làm khi trả kho</span><textarea rows={2} value={value.returnRequirements || ''} onChange={e => set('returnRequirements', e.target.value)} /></label>
      </div>
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
