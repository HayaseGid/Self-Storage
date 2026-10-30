import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'
import { formatVnd } from './storageRules'
import { useDialog } from './Dialog'
import './ContractSignFlow.css'
import './ContractRenewal.css'

/*
 * GIA HẠN HỢP ĐỒNG (khách hàng).
 *   GET  /api/contract-renewals/mine  -> điều kiện + báo giá từng hợp đồng (backend tính, frontend chỉ hiển thị)
 *   POST /api/contract-renewals       -> { reservationId, months, expectedAmount }
 * Gia hạn tạo hợp đồng MỚI nối tiếp hợp đồng cũ (bắt đầu ngay ngày hôm sau ngày hết hạn), giá theo bảng giá hiện hành.
 * Tiền cọc hiện tại được chuyển sang kỳ mới, khách chỉ thanh toán phần chênh lệch.
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
export const fmtIsoDate = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')

export function useContractRenewals() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const reload = useCallback(() => {
    setState(current => ({ ...current, loading: true }))
    return apiGet('/api/contract-renewals/mine')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({
        loading: false,
        data: null,
        // 404 = backend đang chạy chưa có ContractRenewalsController.cs (chưa chép file hoặc chưa chạy lại backend).
        error: error?.status === 404
          ? 'Backend chưa có chức năng gia hạn. Hãy chép ContractRenewalsController.cs vào backend/Controllers rồi dừng và chạy lại backend (dotnet run).'
          : error.message
      }))
  }, [])
  useEffect(() => { reload() }, [reload])

  const items = Array.isArray(state.data?.items) ? state.data.items : []
  const byReservation = id => items.find(item => String(item.reservationId) === String(id)) || null
  return { ...state, items, rules: state.data?.rules || null, byReservation, reload }
}

/* Khối "Gia hạn hợp đồng" ở đầu trang Hợp đồng: hợp đồng sắp hết hạn, có thể gia hạn, hoặc đã gia hạn. */
export function RenewalSection({ renewals, onRenew }) {
  if (renewals.loading && !renewals.data) return null
  if (renewals.error) {
    return (
      <div className="rn-error" role="alert">
        Không tải được thông tin gia hạn: {renewals.error}
        <button type="button" onClick={renewals.reload}>Thử lại</button>
      </div>
    )
  }
  const rules = renewals.rules
  // Chỉ nhắc các hợp đồng sắp hết hạn; hợp đồng còn xa vẫn gia hạn được bằng nút "Gia hạn" trên thẻ hợp đồng.
  const soonDays = Math.max(30, Number(rules?.renewalNoticeDays || 0) + 30)
  const active = renewals.items.filter(item =>
    !item.renewedBy && item.daysLeft >= 0 && item.daysLeft <= soonDays &&
    (item.eligible || (item.reason && item.contractStatus !== 'Renewed' && !/kết thúc|chỉ gia hạn/i.test(item.reason))))
  const renewed = renewals.items.filter(item => item.renewedBy && item.daysLeft >= 0)
  if (active.length === 0 && renewed.length === 0) return null

  return (
    <section className="rn-section" aria-label="Gia hạn hợp đồng">
      <div className="rn-section-head">
        <h2>Gia hạn hợp đồng</h2>
        {rules && (
          <p>
            Gia hạn trước ngày hết hạn ít nhất <strong>{rules.renewalNoticeDays} ngày</strong> · kỳ gia hạn {rules.minRenewalMonths}–{rules.maxRenewalMonths} tháng
            {rules.requireNoOverdue ? ' · không còn khoản phí quá hạn' : ''}. Giá theo bảng giá hiện hành, tiền cọc được chuyển sang kỳ mới.
          </p>
        )}
      </div>
      <div className="rn-list">
        {active.map(item => (
          <article key={item.reservationId} className={`rn-card${item.eligible ? '' : ' blocked'}${item.eligible && item.daysLeft <= 30 ? ' soon' : ''}`}>
            <div>
              <span className={`sign-badge ${item.eligible ? (item.daysLeft <= 30 ? 'todo' : 'done') : 'wait'}`}>
                {item.eligible ? (item.daysLeft <= 30 ? `Sắp hết hạn · còn ${item.daysLeft} ngày` : `Còn ${item.daysLeft} ngày`) : 'Chưa thể gia hạn'}
              </span>
              <h3>Hợp đồng {item.contractNumber}</h3>
              <p>
                {item.facility} · hết hạn <strong>{fmtIsoDate(item.endDate)}</strong>
                {item.eligible ? <> · gia hạn trước <strong>{fmtIsoDate(item.renewDeadline)}</strong></> : null}
              </p>
              {!item.eligible && item.reason && <p className="rn-reason">{item.reason}</p>}
            </div>
            {item.eligible && (
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => onRenew(item)}>Gia hạn hợp đồng</button>
              </div>
            )}
          </article>
        ))}
        {renewed.map(item => (
          <article key={item.reservationId} className="rn-card done">
            <div>
              <span className="sign-badge done">Đã gia hạn</span>
              <h3>Hợp đồng {item.contractNumber} → {item.renewedBy.contractNumber}</h3>
              <p>Tiếp tục thuê từ <strong>{fmtIsoDate(item.renewedBy.startDate)}</strong> đến <strong>{fmtIsoDate(item.renewedBy.endDate)}</strong> ({item.renewedBy.months} tháng). Hãy ký hợp đồng gia hạn bên dưới.</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/* Hộp thoại gia hạn: 1) chọn kỳ  2) thanh toán  3) hoàn tất. */
export function RenewalModal({ item, onClose, onDone }) {
  const dialog = useDialog()
  const quotes = Array.isArray(item.quotes) ? item.quotes : []
  const [months, setMonths] = useState(() => (quotes.find(q => q.months === item.months) || quotes[0])?.months ?? null)
  const [agreed, setAgreed] = useState(false)
  const [step, setStep] = useState('plan')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [override, setOverride] = useState(null) // báo giá mới nếu bảng giá vừa đổi
  const quote = (override && override.months === months ? override : null) || quotes.find(q => q.months === months) || null

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const submit = async () => {
    if (!quote) return
    const ok = await dialog.confirm({
      tone: 'warning',
      title: quote.amountDue > 0 ? 'Xác nhận đã thanh toán?' : 'Xác nhận gia hạn?',
      message: quote.amountDue > 0
        ? `Bạn xác nhận đã chuyển ${money(quote.amountDue)} (chênh lệch tiền cọc) để gia hạn hợp đồng ${item.contractNumber} thêm ${quote.months} tháng.`
        : `Gia hạn hợp đồng ${item.contractNumber} thêm ${quote.months} tháng.${quote.refundAmount > 0 ? ` Bạn được hoàn ${money(quote.refundAmount)} tiền cọc chênh lệch.` : ''}`,
      confirmLabel: quote.amountDue > 0 ? 'Tôi đã thanh toán' : 'Gia hạn',
      cancelLabel: 'Chưa'
    })
    if (!ok) return
    setSubmitting(true)
    setError('')
    try {
      const data = await apiPost('/api/contract-renewals', { reservationId: item.reservationId, months: quote.months, expectedAmount: quote.amountDue })
      setResult(data)
      setStep('done')
      onDone?.(data)
    } catch (err) {
      if (err?.data?.quote) {
        setOverride(err.data.quote)
        setStep('plan')
      }
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const steps = [['plan', 'Chọn kỳ gia hạn'], ['pay', 'Thanh toán'], ['done', 'Hoàn tất']]
  const stepIndex = steps.findIndex(([key]) => key === step)

  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <div className="csf rn-modal" role="dialog" aria-modal="true" aria-labelledby="rn-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Gia hạn hợp đồng</span>
            <h2 id="rn-title">Hợp đồng {item.contractNumber}</h2>
            <p>{item.facility} · đang thuê đến {fmtIsoDate(item.endDate)} · còn {item.daysLeft} ngày</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={submitting} aria-label="Đóng">×</button>
        </div>
        <ol className="csf-steps">
          {steps.map(([key, label], index) => (
            <li key={key} className={index < stepIndex ? 'done' : index === stepIndex ? 'active' : ''}>{label}</li>
          ))}
        </ol>

        <div className="csf-body">
          {error && <div className="auth-message error rn-modal-error" role="alert">{error}</div>}

          {step === 'plan' && (
            <>
              <p className="csf-lead">Chọn thời gian muốn thuê thêm. Hợp đồng mới bắt đầu ngay sau ngày hết hạn hiện tại, các kho giữ nguyên.</p>
              <div className="rn-plans" role="radiogroup" aria-label="Kỳ gia hạn">
                {quotes.map(q => (
                  <button
                    key={q.months}
                    type="button"
                    role="radio"
                    aria-checked={q.months === months}
                    className={`rn-plan${q.months === months ? ' active' : ''}`}
                    onClick={() => { setMonths(q.months); setError('') }}
                  >
                    <strong>{q.months} tháng</strong>
                    {Number(q.discountPercent) > 0 && <span className="rn-plan-off">-{Number(q.discountPercent)}%</span>}
                    <span>{money(q.monthly)}/tháng</span>
                    <small>đến {fmtIsoDate(q.endDate)}</small>
                  </button>
                ))}
              </div>

              {quote && (
                <>
                  <div className="cdm-summary rn-summary">
                    <div><span>Thời gian mới</span><strong>{fmtIsoDate(quote.startDate)} → {fmtIsoDate(quote.endDate)}</strong></div>
                    <div><span>Tiền thuê / tháng</span><strong>{money(quote.monthly)}</strong></div>
                    <div><span>Tổng tiền thuê {quote.months} tháng</span><strong>{money(quote.rent)}</strong></div>
                    <div><span>Tiền cọc kỳ mới</span><strong>{money(quote.newDeposit)}</strong></div>
                  </div>
                  <div className="csf-table-wrap">
                    <table className="csf-table">
                      <thead><tr><th>Kho</th><th>Loại · Kích thước</th><th>Giá niêm yết</th><th>Giá gia hạn / tháng</th></tr></thead>
                      <tbody>
                        {quote.units.map(u => (
                          <tr key={u.unitId}>
                            <td><strong>{u.unitNumber}</strong></td>
                            <td>{u.type || '—'} · {u.size || '—'}</td>
                            <td>{money(u.listPrice)}</td>
                            <td>{money(u.monthlyPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className={`csf-term rn-agree${agreed ? ' checked' : ''}`}>
                    <input type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
                    <div>
                      <strong>Tôi đồng ý gia hạn</strong>
                      <p>Hợp đồng gia hạn giữ nguyên các điều khoản của hợp đồng {item.contractNumber}, áp dụng giá thuê hiện hành ở trên. Tôi sẽ ký điện tử hợp đồng gia hạn sau khi thanh toán.</p>
                    </div>
                  </label>
                </>
              )}
            </>
          )}

          {step === 'pay' && quote && (
            <div className="rn-pay">
              <table className="csf-table rn-pay-table">
                <tbody>
                  <tr><td>Tiền cọc kỳ gia hạn ({quote.units.length} kho)</td><td>{money(quote.newDeposit)}</td></tr>
                  <tr><td>Tiền cọc hiện tại chuyển sang</td><td>− {money(quote.oldDeposit)}</td></tr>
                </tbody>
                <tfoot>
                  {quote.amountDue > 0
                    ? <tr><td>Cần thanh toán</td><td>{money(quote.amountDue)}</td></tr>
                    : <tr><td>{quote.refundAmount > 0 ? 'Bạn được hoàn' : 'Cần thanh toán'}</td><td>{money(quote.refundAmount)}</td></tr>}
                </tfoot>
              </table>
              <p className="csf-hint">
                Tiền thuê hàng tháng của kỳ gia hạn ({money(quote.monthly)}/tháng) thanh toán theo từng tháng như hợp đồng hiện tại.
                {quote.amountDue > 0 ? <> Nội dung chuyển khoản: <strong>GH {item.contractNumber}</strong>.</> : null}
              </p>
              <p className="csf-hint">Thanh toán hiện là mô phỏng: hệ thống ghi nhận khi bạn bấm xác nhận.</p>
            </div>
          )}

          {step === 'done' && result && (
            <div className="rn-done">
              <span className="rn-done-icon" aria-hidden="true">✓</span>
              <h3>{result.message}</h3>
              <p>Hợp đồng mới <strong>{result.contractNumber}</strong> · {fmtIsoDate(result.startDate)} → {fmtIsoDate(result.endDate)} ({result.months} tháng).</p>
              {result.paymentReference && <p className="csf-hint">Mã giao dịch: {result.paymentReference}</p>}
              <p className="csf-hint">Bạn tiếp tục dùng kho như hiện tại, không cần đến cơ sở. Vui lòng ký điện tử hợp đồng {result.contractNumber} trong danh sách hợp đồng.</p>
            </div>
          )}
        </div>

        <div className="csf-actions">
          {step === 'pay' && <button type="button" className="dashboard-secondary-btn" disabled={submitting} onClick={() => setStep('plan')}>Quay lại</button>}
          <span className="csf-spacer" />
          {step === 'plan' && (
            <button type="button" className="dashboard-primary-btn" disabled={!quote || !agreed} onClick={() => { setError(''); setStep('pay') }}>
              Tiếp tục
            </button>
          )}
          {step === 'pay' && (
            <button type="button" className="dashboard-primary-btn" disabled={submitting} onClick={submit}>
              {submitting ? 'Đang gia hạn...' : quote?.amountDue > 0 ? `Tôi đã thanh toán ${money(quote.amountDue)}` : 'Xác nhận gia hạn'}
            </button>
          )}
          {step === 'done' && <button type="button" className="dashboard-primary-btn" onClick={onClose}>Xong</button>}
        </div>
      </div>
    </div>
  )
}
