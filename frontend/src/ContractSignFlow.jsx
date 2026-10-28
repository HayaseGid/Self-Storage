import React, { useEffect, useState } from 'react'
import SignaturePad from './SignaturePad'
import { buildContractTerms, usePolicies } from './policies'
import { formatVnd } from './storageRules'
import ContractDocument, { contractUnits } from './ContractDocument'
import './ContractSignFlow.css'

/*
 * Ký hợp đồng thuê kho online (sau khi khách đã đặt cọc và Facility Manager đã duyệt).
 * Một hợp đồng có thể gồm nhiều kho cùng cơ sở, cùng kỳ thuê (đặt từ giỏ hàng) -> hiển thị
 * thành Hợp đồng chính + Phụ lục danh sách kho.
 *
 * Bước 1: Xem hợp đồng  ·  Bước 2: Xác nhận từng nhóm điều khoản  ·  Bước 3: Ký tay + nhập họ tên
 * Ký xong, bản hợp đồng được gửi qua email cho khách (EmailJS, xem contractEmail.js).
 */

const money = value => `${formatVnd(value || 0)}đ`
export const CONTRACT_TERMS_VERSION = 'storage-rental-v1'

export default function ContractSignFlow({ group, customer, onClose, onSign }) {
  const [step, setStep] = useState(1)
  const [accepted, setAccepted] = useState(() => new Set())
  const [signature, setSignature] = useState(null)
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Điều khoản lấy từ chính sách hiện hành do Business Operations thiết lập.
  const policies = usePolicies()
  const TERM_POLICIES = buildContractTerms(policies.values)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose, submitting])

  const rentals = group.rentals
  const first = rentals[0]
  const monthlyTotal = rentals.reduce((n, r) => n + Number(r.monthlyPrice || 0), 0)
  const rentTotal = rentals.reduce((n, r) => n + Number(r.rentalAmount || Number(r.monthlyPrice || 0) * Number(r.months || 0)), 0)
  const depositTotal = rentals.reduce((n, r) => n + Number(r.depositAmount || 0), 0)
  const unitCount = contractUnits(rentals).length
  const allAccepted = TERM_POLICIES.every(policy => accepted.has(policy.key))
  const nameMatches = typedName.trim().toLowerCase() === String(customer?.name || '').trim().toLowerCase()

  const toggle = key => setAccepted(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const submit = async () => {
    if (!allAccepted) return setError('Bạn cần xác nhận đồng ý tất cả các nhóm điều khoản.')
    if (!signature) return setError('Vui lòng ký vào khung chữ ký.')
    if (!nameMatches) return setError(`Họ tên xác nhận phải trùng với tên tài khoản: ${customer?.name}.`)
    setError('')
    setSubmitting(true)
    try {
      await onSign({ image: signature, acceptedPolicies: [...accepted], termsVersion: CONTRACT_TERMS_VERSION })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <div className="csf" role="dialog" aria-modal="true" aria-labelledby="csf-title">
        <div className="csf-head">
          <div>
            <span className="customer-eyebrow">HỢP ĐỒNG THUÊ KHO</span>
            <h2 id="csf-title">{group.title}</h2>
            <p>{unitCount} kho · {first.facility} · {first.startDate} → {first.endDate}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} aria-label="Đóng" disabled={submitting}>×</button>
        </div>
        <ol className="csf-steps">
          {['Xem hợp đồng', 'Xác nhận điều khoản', 'Ký hợp đồng'].map((label, index) => (
            <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}>{label}</li>
          ))}
        </ol>

        <div className="csf-body">
          {step === 1 && (
            <ContractDocument group={group} customer={customer} />
          )}

          {step === 2 && (
            <div className="csf-terms">
              <p className="csf-lead">Đọc và xác nhận từng nhóm điều khoản. Đây là các điều khoản ảnh hưởng trực tiếp đến quyền, nghĩa vụ và chi phí của bạn.</p>
              {TERM_POLICIES.map(policy => (
                <label key={policy.key} className={`csf-term${accepted.has(policy.key) ? ' checked' : ''}`}>
                  <input type="checkbox" checked={accepted.has(policy.key)} onChange={() => toggle(policy.key)} />
                  <div>
                    <strong>{policy.title}</strong>
                    <p>{policy.summary}</p>
                    <ul>{policy.settings.map(([label, value]) => <li key={label}><span>{label}:</span> {value}</li>)}</ul>
                  </div>
                </label>
              ))}
              <button type="button" className="csf-link" onClick={() => setAccepted(new Set(TERM_POLICIES.map(p => p.key)))}>Tôi đã đọc và đồng ý tất cả</button>
            </div>
          )}

          {step === 3 && (
            <div className="csf-sign">
              <div className="csf-sign-summary">
                <div><span>Bên thuê</span><strong>{customer?.name}</strong></div>
                <div><span>Số kho</span><strong>{unitCount}</strong></div>
                <div><span>Kỳ thuê</span><strong>{first.startDate} → {first.endDate}</strong></div>
                <div><span>Tiền thuê / tháng</span><strong>{money(monthlyTotal)}</strong></div>
              </div>
              <label className="csf-label">Chữ ký của bạn</label>
              <div className="csf-pad"><SignaturePad onChange={setSignature} /></div>
              <label className="csf-label" htmlFor="csf-name">Nhập đầy đủ họ tên để xác nhận</label>
              <input id="csf-name" className={`csf-input${typedName && !nameMatches ? ' bad' : ''}`} value={typedName} onChange={e => setTypedName(e.target.value)} placeholder={customer?.name} autoComplete="off" />
              {typedName && !nameMatches && <span className="csf-hint bad">Họ tên phải trùng với tên tài khoản: {customer?.name}</span>}
              <p className="csf-hint">Bằng việc ký, bạn xác nhận đã đọc toàn bộ hợp đồng, Phụ lục 01 và {TERM_POLICIES.length} nhóm điều khoản. Chữ ký điện tử có giá trị như chữ ký tay theo Luật Giao dịch điện tử.</p>
            </div>
          )}
          {error && <div className="auth-message error csf-error" role="alert">{error}</div>}
        </div>

        <div className="csf-actions">
          {step === 1 && <button type="button" className="dashboard-secondary-btn" onClick={() => window.print()}>In / Lưu PDF</button>}
          <span className="csf-spacer" />
          {step > 1 && <button type="button" className="dashboard-secondary-btn" onClick={() => { setError(''); setStep(step - 1) }} disabled={submitting}>Quay lại</button>}
          {step === 1 && <button type="button" className="dashboard-primary-btn" onClick={() => setStep(2)}>Tiếp tục: Điều khoản</button>}
          {step === 2 && <button type="button" className="dashboard-primary-btn" disabled={!allAccepted} onClick={() => { setError(''); setStep(3) }}>{allAccepted ? 'Tiếp tục: Ký' : `Xác nhận ${TERM_POLICIES.length - accepted.size} nhóm còn lại`}</button>}
          {step === 3 && <button type="button" className="dashboard-primary-btn" disabled={submitting} onClick={submit}>{submitting ? 'Đang ký...' : 'Ký hợp đồng'}</button>}
        </div>
      </div>
    </div>
  )
}
