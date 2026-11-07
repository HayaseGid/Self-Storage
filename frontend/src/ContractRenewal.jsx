import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'
import { formatVnd } from './storageRules'
import { useDialog } from './Dialog'
import DepositConfirm from './DepositConfirm'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'
import { announceRenewalSuccess, focusContract, requestContractSign } from './afterDeposit'
import './ContractSignFlow.css'
import './ContractRenewal.css'

/*
 * GIA HẠN HỢP ĐỒNG (khách hàng).
 *   GET  /api/contract-renewals/mine            -> điều kiện + báo giá từng hợp đồng (backend tính, frontend chỉ hiển thị)
 *   POST /api/contract-renewals                 -> { reservationId, months, paymentPlan, expectedAmount } tạo yêu cầu gia hạn chờ thanh toán
 *     paymentPlan: "Monthly" (trả ngay tháng đầu kỳ mới) | "Upfront" (trả ngay toàn bộ kỳ mới) — mặc định giữ hình thức cũ
 *   POST /api/vnpay/create { reservationIds }   -> thanh toán qua VNPay (như đặt cọc)
 *   POST /api/contract-renewals/{id}/pay-demo   -> thanh toán mô phỏng (chỉ khi VITE_ALLOW_SIMULATED_PAYMENT=true)
 *   POST /api/contract-renewals/{id}/finalize | cancel
 *
 * Luồng: Gia hạn -> chọn số tháng -> xác nhận + thanh toán (tiền thuê THÁNG ĐẦU của kỳ mới + cọc bổ sung nếu giá tăng;
 * cọc cũ được chuyển sang kỳ mới; các tháng sau trả hằng tháng) -> "Gia hạn thành công, vui lòng ký phụ lục gia hạn"
 * -> OK -> mở màn hình ký phụ lục gia hạn. Khách tiếp tục dùng kho, không cần bàn giao lại.
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
export const fmtIsoDate = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
const addMonthsIso = (iso, months) => {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
const minutesLeft = iso => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60000))

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

/*
 * Thanh toán một yêu cầu gia hạn đang chờ. Trả về:
 *   { redirected: true }  -> đã chuyển sang VNPay (VNPay chuyển về /payment-result)
 *   { contractId, ... }   -> thanh toán mô phỏng xong, gia hạn đã hoàn tất
 */
export async function payRenewal(dialog, { reservationId, amount, label }) {
  const demo = SIMULATED_PAYMENT_ENABLED && await dialog.confirm({
    tone: 'info',
    title: 'Chọn cách thanh toán',
    message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
    confirmLabel: 'Mô phỏng',
    cancelLabel: 'Qua VNPay'
  })
  if (demo) return apiPost(`/api/contract-renewals/${reservationId}/pay-demo`, {})
  await startVnPayPayment([reservationId], { amount, count: 1, label, kind: 'renewal' })
  return { redirected: true }
}

/* Gia hạn xong: "Gia hạn thành công, vui lòng ký phụ lục gia hạn" -> OK -> mở màn hình ký. */
export async function finishRenewal(dialog, result, amount) {
  await announceRenewalSuccess(dialog, {
    contractNumber: result.contractNumber,
    renewedFromContractNumber: result.renewedFromContractNumber,
    amountText: amount ? money(amount) : ''
  })
  if (result.contractId) requestContractSign(result.contractId)
}

/* Khối "Gia hạn hợp đồng" ở đầu trang Hợp đồng: chờ thanh toán, sắp hết hạn, đã gia hạn (chờ ký phụ lục). */
export function RenewalSection({ renewals, onRenew, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(null)
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
  const refresh = () => { renewals.reload(); onChanged?.() }

  const pending = renewals.items.filter(item => item.pendingRenewal && !item.renewedBy)
  // Chỉ nhắc các hợp đồng sắp hết hạn; hợp đồng còn xa vẫn gia hạn được bằng nút "Gia hạn" trên thẻ hợp đồng.
  const soonDays = Math.max(30, Number(rules?.renewalNoticeDays || 0) + 30)
  const active = renewals.items.filter(item =>
    !item.renewedBy && !item.pendingRenewal && item.daysLeft >= 0 && item.daysLeft <= soonDays &&
    (item.eligible || (item.reason && item.contractStatus !== 'Renewed' && !/kết thúc|chỉ gia hạn/i.test(item.reason))))
  const renewed = renewals.items.filter(item => item.renewedBy && item.daysLeft >= 0)
  if (pending.length === 0 && active.length === 0 && renewed.length === 0) return null

  const continuePay = async item => {
    const p = item.pendingRenewal
    setBusy(p.reservationId)
    try {
      const result = p.paid
        ? await apiPost(`/api/contract-renewals/${p.reservationId}/finalize`, {})
        : await payRenewal(dialog, { reservationId: p.reservationId, amount: p.amountDue, label: p.reservationCode })
      if (result.redirected) return
      refresh()
      await finishRenewal(dialog, result, p.paid ? 0 : p.amountDue)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa gia hạn được', message: error.message })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  const cancelPending = async item => {
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Hủy yêu cầu gia hạn?',
      message: `Hủy yêu cầu gia hạn ${item.pendingRenewal.months} tháng của hợp đồng ${item.contractNumber}. Bạn có thể gia hạn lại sau.`,
      confirmLabel: 'Hủy yêu cầu',
      cancelLabel: 'Không'
    })
    if (!ok) return
    setBusy(item.pendingRenewal.reservationId)
    try {
      await apiPost(`/api/contract-renewals/${item.pendingRenewal.reservationId}/cancel`, {})
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa hủy được', message: error.message })
    } finally {
      setBusy(null)
      refresh()
    }
  }

  return (
    <section className="rn-section" aria-label="Gia hạn hợp đồng">
      <div className="rn-section-head">
        <h2>Gia hạn hợp đồng</h2>
        {rules && (
          <p>
            Gia hạn trong khoảng <strong>{Number(rules.renewalNoticeDays) + 30} đến {rules.renewalNoticeDays} ngày</strong> trước ngày hết hạn · kỳ gia hạn {rules.minRenewalMonths}–{rules.maxRenewalMonths} tháng
            {rules.requireNoOverdue ? ' · không còn khoản phí quá hạn' : ''}. Khi gia hạn bạn trả trước tiền thuê tháng đầu của kỳ mới, tiền cọc được chuyển sang kỳ mới.
          </p>
        )}
      </div>
      <div className="rn-list">
        {pending.map(item => {
          const p = item.pendingRenewal
          return (
            <article key={`p-${item.reservationId}`} className="rn-card soon clickable" role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }}>
              <div>
                <span className="sign-badge todo">{p.paid ? 'Đã thanh toán · Chưa hoàn tất' : `Chờ thanh toán · còn ${minutesLeft(p.holdExpiresAt)} phút`}</span>
                <h3>Gia hạn hợp đồng {item.contractNumber} thêm {p.months} tháng</h3>
                <p>
                  {fmtIsoDate(p.startDate)} → {fmtIsoDate(p.endDate)} · Mã {p.reservationCode}
                  {!p.paid && <> · cần thanh toán <strong>{money(p.amountDue)}</strong></>}
                </p>
              </div>
              <div className="sign-actions">
                {!p.paid && <button type="button" className="dashboard-secondary-btn" disabled={busy === p.reservationId} onClick={() => cancelPending(item)}>Hủy</button>}
                <button type="button" className="dashboard-primary-btn" disabled={busy === p.reservationId} onClick={() => continuePay(item)}>
                  {busy === p.reservationId ? 'Đang xử lý...' : p.paid ? 'Hoàn tất gia hạn' : `Thanh toán ${money(p.amountDue)}`}
                </button>
              </div>
            </article>
          )
        })}
        {active.map(item => (
          <article key={item.reservationId} className={`rn-card clickable${item.eligible ? '' : ' blocked'}${item.eligible && item.daysLeft <= 30 ? ' soon' : ''}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }} title="Bấm để xem hợp đồng">
            <div>
              <span className={`sign-badge ${item.eligible ? (item.daysLeft <= 30 ? 'todo' : 'done') : 'wait'}`}>
                {item.eligible ? (item.daysLeft <= 30 ? `Sắp hết hạn · còn ${item.daysLeft} ngày` : `Còn ${item.daysLeft} ngày`) : 'Chưa thể gia hạn'}
              </span>
              <h3>Hợp đồng {item.contractNumber}</h3>
              <p>
                {item.facility} · hết hạn <strong>{fmtIsoDate(item.endDate)}</strong>
                {item.eligible ? <> · gia hạn từ {item.renewOpensOn ? fmtIsoDate(item.renewOpensOn) : 'nay'} đến <strong>{fmtIsoDate(item.renewDeadline)}</strong></> : null}
              </p>
              {!item.eligible && item.reason && <p className="rn-reason">{item.reason}</p>}
              <span className="go-contract">Xem hợp đồng ↓</span>
            </div>
            {item.eligible && (
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => onRenew(item)}>Gia hạn hợp đồng</button>
              </div>
            )}
          </article>
        ))}
        {renewed.map(item => (
          <article key={item.reservationId} className={`rn-card clickable${item.renewedBy.isSigned === false ? ' soon' : ' done'}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.renewedBy.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.renewedBy.reservationId) }} title="Bấm để xem phụ lục gia hạn">
            <div>
              <span className={`sign-badge ${item.renewedBy.isSigned === false ? 'todo' : 'done'}`}>
                {item.renewedBy.isSigned === false ? 'Đã gia hạn · Chờ ký phụ lục' : 'Đã gia hạn'}
              </span>
              <h3>Hợp đồng {item.contractNumber} → phụ lục gia hạn {item.renewedBy.contractNumber}</h3>
              <p>Tiếp tục thuê từ <strong>{fmtIsoDate(item.renewedBy.startDate)}</strong> đến <strong>{fmtIsoDate(item.renewedBy.endDate)}</strong> ({item.renewedBy.months} tháng).</p>
              <span className="go-contract">Xem phụ lục gia hạn ↓</span>
            </div>
            {item.renewedBy.isSigned === false && (
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => requestContractSign(item.renewedBy.contractId)}>Ký phụ lục gia hạn</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

/* Hộp thoại gia hạn: 1) chọn kỳ  2) xác nhận & thanh toán  3) ký phụ lục (mở màn hình ký sau khi thanh toán). */
export function RenewalModal({ item, onClose, onDone }) {
  const dialog = useDialog()
  const quotes = Array.isArray(item.quotes) ? item.quotes : []
  const [months, setMonths] = useState(() => (quotes.find(q => q.months === item.months) || quotes[0])?.months ?? null)
  const [step, setStep] = useState('plan')
  // Khách chọn lại hình thức trả; chọn sẵn hình thức của hợp đồng hiện tại
  const [paymentPlan, setPaymentPlan] = useState(item.paymentPlan === 'Upfront' ? 'Upfront' : 'Monthly')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [override, setOverride] = useState(null) // báo giá mới nếu bảng giá vừa đổi
  const quote = (override && override.months === months ? override : null) || quotes.find(q => q.months === months) || null
  // Số tiền trả ngay theo hình thức trả (backend tính: amountDueMonthly / amountDueUpfront)
  const dueOf = q => (q ? Number(paymentPlan === 'Upfront' ? (q.amountDueUpfront ?? q.amountDue) : (q.amountDueMonthly ?? q.amountDue)) : 0)
  const amountDue = dueOf(quote)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const submit = async () => {
    if (!quote || !agreed) return
    setSubmitting(true)
    setError('')
    let created = null
    try {
      created = await apiPost('/api/contract-renewals', { reservationId: item.reservationId, months: quote.months, paymentPlan, expectedAmount: amountDue })
      const result = await payRenewal(dialog, { reservationId: created.reservationId, amount: created.amountDue, label: created.reservationCode })
      if (result.redirected) return // đang chuyển sang VNPay
      onDone?.(result)
      onClose()
      await finishRenewal(dialog, result, created.amountDue)
    } catch (err) {
      if (err?.data?.quote) {
        setOverride(err.data.quote)
        setAgreed(false)
      }
      // Đã tạo yêu cầu nhưng chưa thanh toán được: yêu cầu vẫn được giữ, khách thanh toán tiếp trong mục Gia hạn hợp đồng.
      setError(created ? `${err.message} Yêu cầu gia hạn được giữ ${minutesLeft(created.holdExpiresAt)} phút, bạn có thể thanh toán lại.` : err.message)
      if (created) onDone?.(null)
      setSubmitting(false)
    }
  }

  const steps = [['plan', 'Chọn kỳ gia hạn'], ['pay', 'Xác nhận & thanh toán'], ['sign', 'Ký phụ lục gia hạn']]
  const stepIndex = steps.findIndex(([key]) => key === step)
  const firstMonthEnd = quote ? addMonthsIso(quote.startDate, 1) : null
  const laterMonths = quote ? Number(quote.laterMonths ?? Math.max(0, quote.months - 1)) : 0

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
              <p className="csf-lead">Chọn thời gian muốn thuê thêm. Kỳ gia hạn bắt đầu ngay sau ngày hết hạn hiện tại, các kho giữ nguyên, bạn tiếp tục sử dụng kho mà không cần đến cơ sở.</p>
              <div className="rn-plans" role="radiogroup" aria-label="Kỳ gia hạn">
                {quotes.map(q => (
                  <button
                    key={q.months}
                    type="button"
                    role="radio"
                    aria-checked={q.months === months}
                    className={`rn-plan${q.months === months ? ' active' : ''}`}
                    onClick={() => { setMonths(q.months); setError(''); setAgreed(false) }}
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
                  <p className="csf-label">Hình thức trả tiền thuê kỳ mới</p>
                  <div className="rn-plans" role="radiogroup" aria-label="Hình thức trả">
                    {[['Monthly', 'Trả theo tháng', `Trả ngay ${money(quote.amountDueMonthly ?? quote.amountDue)}, các tháng sau trả hằng tháng`],
                      ['Upfront', 'Trả 1 lần', `Trả ngay ${money(quote.amountDueUpfront ?? quote.rent)} (toàn bộ ${quote.months} tháng)`]].map(([value, label, note]) => (
                      <button key={value} type="button" role="radio" aria-checked={paymentPlan === value}
                        className={`rn-plan${paymentPlan === value ? ' active' : ''}`}
                        onClick={() => { setPaymentPlan(value); setError(''); setAgreed(false) }}>
                        <strong>{label}</strong>
                        <small>{note}</small>
                      </button>
                    ))}
                  </div>
                  <div className="cdm-summary rn-summary">
                    <div><span>Thời gian gia hạn</span><strong>{fmtIsoDate(quote.startDate)} → {fmtIsoDate(quote.endDate)}</strong></div>
                    <div><span>Tiền thuê / tháng</span><strong>{money(quote.monthly)}</strong></div>
                    <div><span>Tổng tiền thuê {quote.months} tháng</span><strong>{money(quote.rent)}</strong></div>
                    <div><span>Trả ngay khi gia hạn</span><strong>{money(amountDue)}</strong></div>
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
                </>
              )}
            </>
          )}

          {step === 'pay' && quote && (
            <div className="rn-pay">
              <DepositConfirm
                key={`${quote.months}-${paymentPlan}-${amountDue}`}
                title="Xác nhận gia hạn"
                rows={[
                  ['Hợp đồng gốc', `${item.contractNumber} · ${item.facility}`],
                  ['Kho', quote.units.map(u => u.unitNumber).join(', ')],
                  ['Thời gian gia hạn', `${quote.months} tháng · ${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(quote.endDate)}`],
                  ['Hình thức trả', paymentPlan === 'Upfront' ? 'Trả 1 lần' : 'Trả theo tháng']
                ]}
                lines={[
                  paymentPlan === 'Upfront'
                    ? [`Tiền thuê toàn bộ ${quote.months} tháng (${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(quote.endDate)})`, Number(quote.rent)]
                    : [`Tiền thuê tháng đầu (${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(firstMonthEnd)})`, Number(quote.firstMonth ?? quote.monthly)],
                  [`Tiền cọc ${money(quote.depositTransfer ?? quote.oldDeposit)}`, 'Chuyển từ hợp đồng cũ'],
                  ...(Number(quote.depositTopUp) > 0 ? [['Bổ sung tiền cọc (giá thuê tăng)', Number(quote.depositTopUp)]] : []),
                  ...(Number(quote.refundAmount) > 0 ? [['Tiền cọc dư được hoàn lại', `${money(quote.refundAmount)} (hoàn sau)`]] : []),
                  ...(paymentPlan === 'Monthly' && laterMonths > 0 ? [[`Tháng 2 → ${quote.months}`, `${money(quote.monthly)}/tháng, trả hằng tháng`]] : [])
                ]}
                amount={amountDue}
                onChange={setAgreed}
                infoText={<>Tôi đã kiểm tra đúng <strong>kho, thời gian gia hạn và giá thuê</strong> ở trên.</>}
                policyText={<>Tôi đồng ý gia hạn với <strong>các điều khoản của hợp đồng {item.contractNumber}</strong>, áp dụng giá thuê hiện hành, và sẽ <strong>ký điện tử phụ lục gia hạn</strong> ngay sau khi thanh toán.</>}
                hint="Tick đủ 2 ô để thanh toán và gia hạn."
              />
              <p className="csf-hint">
                {SIMULATED_PAYMENT_ENABLED
                  ? 'Đang bật chế độ demo: bạn có thể chọn thanh toán mô phỏng hoặc qua VNPay.'
                  : 'Bạn sẽ được chuyển sang cổng VNPay (môi trường thử nghiệm) để thanh toán. Yêu cầu gia hạn được giữ 15 phút.'}
              </p>
            </div>
          )}
        </div>

        <div className="csf-actions">
          {step === 'pay' && <button type="button" className="dashboard-secondary-btn" disabled={submitting} onClick={() => { setStep('plan'); setAgreed(false); setError('') }}>Quay lại</button>}
          <span className="csf-spacer" />
          {step === 'plan' && (
            <button type="button" className="dashboard-primary-btn" disabled={!quote} onClick={() => { setError(''); setAgreed(false); setStep('pay') }}>
              Tiếp tục
            </button>
          )}
          {step === 'pay' && (
            <button type="button" className="dashboard-primary-btn" disabled={submitting || !agreed} onClick={submit}>
              {submitting ? 'Đang xử lý...' : `Thanh toán ${money(amountDue)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
