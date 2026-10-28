import React, { useEffect, useState } from 'react'
import SignaturePad from './SignaturePad'
import { CONTRACT_TERM_GROUPS, POLICY_SET, POLICY_VERSION } from './policies'
import { DEPOSIT_MONTHS, formatReservationCode, formatVnd } from './storageRules'
import './ContractSignFlow.css'

/*
 * Ký hợp đồng thuê kho online (sau khi khách đã đặt cọc và Facility Manager đã duyệt).
 * Một hợp đồng có thể gồm nhiều kho cùng cơ sở, cùng kỳ thuê (đặt từ giỏ hàng) -> hiển thị
 * thành Hợp đồng chính + Phụ lục danh sách kho.
 *
 * Bước 1: Xem hợp đồng  ·  Bước 2: Xác nhận từng nhóm điều khoản  ·  Bước 3: Ký tay + nhập họ tên
 * (Mã OTP qua email sẽ thêm khi backend có chức năng gửi email.)
 */

const money = value => `${formatVnd(value || 0)}đ`
const TERM_POLICIES = POLICY_SET.filter(policy => CONTRACT_TERM_GROUPS.includes(policy.key))
export const CONTRACT_TERMS_VERSION = 'storage-rental-v1'

export default function ContractSignFlow({ group, customer, onClose, onSign }) {
  const [step, setStep] = useState(1)
  const [accepted, setAccepted] = useState(() => new Set())
  const [signature, setSignature] = useState(null)
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
            <p>{rentals.length} kho · {first.facility} · {first.startDate} → {first.endDate}</p>
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
            <article className="csf-doc" id="csf-print">
              <h3>HỢP ĐỒNG THUÊ KHO LƯU TRỮ</h3>
              <p className="csf-doc-meta">Số: {group.code} · Áp dụng chính sách {POLICY_VERSION.version} (hiệu lực từ {POLICY_VERSION.effectiveFrom.split('-').reverse().join('/')})</p>
              <section>
                <h4>Điều 1. Các bên</h4>
                <p><strong>Bên cho thuê:</strong> StoreSpace, cơ sở {first.facility}.</p>
                <p><strong>Bên thuê:</strong> {customer?.name} · Email: {customer?.email}</p>
              </section>
              <section>
                <h4>Điều 2. Đối tượng và thời hạn thuê</h4>
                <p>Bên thuê thuê {rentals.length} kho lưu trữ liệt kê tại Phụ lục 01, thời hạn {first.months} tháng, từ ngày <strong>{first.startDate}</strong> đến hết ngày <strong>{first.endDate}</strong>. Một tháng thuê tính từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng tiếp theo.</p>
              </section>
              <section>
                <h4>Điều 3. Giá thuê, tiền cọc và thanh toán</h4>
                <p>Tổng tiền thuê mỗi tháng: <strong>{money(monthlyTotal)}</strong>. Tổng tiền thuê cả kỳ: <strong>{money(rentTotal)}</strong>.</p>
                <p>Tiền cọc: <strong>{money(depositTotal)}</strong> ({DEPOSIT_MONTHS} tháng tiền thuê mỗi kho), <strong>đã thanh toán</strong>. Tiền cọc dùng để bảo đảm nghĩa vụ, không mặc nhiên là tiền thuê tháng cuối, và được hoàn trong 07 ngày làm việc sau khi trả kho nếu không phát sinh khấu trừ.</p>
                <p>Giá thuê đã xác nhận không thay đổi trong suốt thời hạn hợp đồng.</p>
              </section>
              <section>
                <h4>Điều 4. Quyền và nghĩa vụ</h4>
                <p>Bên thuê sử dụng kho đúng mục đích, không lưu trữ hàng cấm, hàng dễ cháy nổ; bảo quản khóa/thẻ ra vào; báo trả kho trước ít nhất 07 ngày. Bên cho thuê bàn giao kho đúng hiện trạng, bảo đảm an ninh khu vực chung và hoàn cọc đúng hạn.</p>
              </section>
              <section>
                <h4>Điều 5. Hiệu lực</h4>
                <p>Hợp đồng có hiệu lực khi Bên thuê ký điện tử trên hệ thống StoreSpace và kho được bàn giao. Khi nhận kho, Bên thuê xuất trình CCCD để nhân viên đối chiếu.</p>
              </section>
              <section>
                <h4>Phụ lục 01. Danh sách kho thuê</h4>
                <div className="csf-table-wrap">
                  <table className="csf-table">
                    <thead><tr><th>#</th><th>Mã đơn</th><th>Kho</th><th>Loại · Kích thước</th><th>Giá / tháng</th><th>Tiền cọc</th></tr></thead>
                    <tbody>
                      {rentals.map((r, i) => (
                        <tr key={r.reservationId}>
                          <td>{i + 1}</td>
                          <td>{formatReservationCode(r.reservationId)}</td>
                          <td><strong>{r.unitId}</strong></td>
                          <td>{r.type} · {r.size || '—'}</td>
                          <td>{money(r.monthlyPrice)}</td>
                          <td>{money(r.depositAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan="4">Tổng cộng</td><td>{money(monthlyTotal)}</td><td>{money(depositTotal)}</td></tr></tfoot>
                  </table>
                </div>
              </section>
            </article>
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
                <div><span>Số kho</span><strong>{rentals.length}</strong></div>
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
