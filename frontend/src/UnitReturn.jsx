import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'
import { useDialog } from './Dialog'
import { formatVnd } from './storageRules'
import { usePolicies } from './policies'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'
import { focusContract } from './afterDeposit'
import './ContractSignFlow.css'
import './UnitReturn.css'
import { CustomerInspectionBox, INSPECTION, useMyInspections } from './ReturnInspection' // [THÊM 14]

/*
 * TRẢ KHO (khách hàng) - UnitReturnsController.
 *   Khách báo trả kho (chọn ngày) -> Staff đã bàn giao kho nhận lại + kiểm tra (kho "Đang kiểm tra")
 *   -> kết quả: không vấn đề -> hoàn cọc sau N ngày; có phí -> trừ vào cọc, thiếu thì khách đóng thêm.
 *   [14] Có phí kiểm kho: khách xem ảnh, Đồng ý hoặc Khiếu nại trong N ngày trước khi trừ cọc (ReturnInspection.jsx).
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
export const fmtDay = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
const toInput = iso => (iso ? String(iso).slice(0, 10) : '')

export function useUnitReturns() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const reload = useCallback(() => {
    setState(current => ({ ...current, loading: true }))
    return apiGet('/api/unit-returns/mine')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({
        loading: false,
        data: null,
        error: error?.status === 404 ? 'Backend chưa có chức năng trả kho (UnitReturnsController.cs). Chép file rồi chạy lại backend.' : error.message
      }))
  }, [])
  useEffect(() => { reload() }, [reload])
  const items = Array.isArray(state.data?.items) ? state.data.items : []
  return {
    ...state,
    items,
    rules: state.data?.rules || null,
    fees: state.data?.fees || [],
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

/* Các bước của một yêu cầu trả kho, dùng chung cho khách và thông báo. */
export function returnStage(req, inspection) {
  if (!req) return null
  if (req.status === 'Scheduled') return 'scheduled'
  if (req.status === 'In Progress') return 'inspecting'
  if (inspection?.status === INSPECTION.AWAITING) return 'confirm' // [THÊM 14] chờ khách xác nhận phí kiểm kho
  if (inspection?.status === INSPECTION.DISPUTED) return 'disputed' // [THÊM 14] đang giải quyết khiếu nại
  if (Number(req.amountOwed) > 0) return 'owed'
  if (Number(req.refundAmount) > 0 && req.refundStatus !== 'Completed') return 'refunding'
  return 'done'
}

export async function payReturnFees(dialog, item) {
  const amount = item.request?.amountOwed
  const demo = SIMULATED_PAYMENT_ENABLED && await dialog.confirm({
    tone: 'info', title: 'Chọn cách thanh toán', message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
    confirmLabel: 'Mô phỏng', cancelLabel: 'Qua VNPay'
  })
  if (demo) return apiPost(`/api/unit-returns/${item.reservationId}/pay-demo`, {})
  await startVnPayPayment([item.reservationId], { amount, count: 1, label: item.contractNumber, kind: 'fee' })
  return { redirected: true }
}

function ReturnProgress({ item, inspection, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const req = item.request
  const stage = returnStage(req, inspection)
  const held = stage === 'confirm' || stage === 'disputed' // [THÊM 14] phí kiểm kho chưa quyết toán
  const steps = [
    ['Báo trả kho', `Hẹn ${req.scheduledTime ? `${req.scheduledTime} ` : ''}ngày ${fmtDay(req.scheduledDate)}${req.staffName ? ` · NV ${req.staffName}` : ''}`],
    ['Nhận lại & kiểm tra kho', stage === 'scheduled' ? 'Chờ đến ngày hẹn' : stage === 'inspecting' ? 'Nhân viên đang kiểm tra' : (req.conditionResult === 'Damaged' ? 'Có vấn đề' : 'Không có vấn đề')],
    ['Quyết toán tiền cọc', stage === 'confirm' ? `Chờ bạn xác nhận phí ${money(inspection.proposedTotal)}` : stage === 'disputed' ? 'Đang giải quyết khiếu nại' : stage === 'owed' ? `Cần đóng thêm ${money(req.amountOwed)}` : ['scheduled', 'inspecting'].includes(stage) ? 'Sau khi kiểm tra' : Number(req.refundAmount) > 0 ? `Hoàn ${money(req.refundAmount)}` : 'Cọc đã bù hết phí'],
    ['Hoàn cọc', held ? 'Sau khi quyết toán' : Number(req.refundAmount) > 0
      ? req.refundStatus === 'Completed' ? `Đã chuyển ${fmtDay(req.refundedAt)}` : req.refundDueDate ? `Dự kiến ${fmtDay(req.refundDueDate)}` : 'Sau khi kiểm tra'
      : ['scheduled', 'inspecting'].includes(stage) ? `Sau kiểm tra ${req.refundDays} ngày` : 'Không có']
  ]
  const current = { scheduled: 0, inspecting: 1, confirm: 2, disputed: 2, owed: 2, refunding: 3, done: 4 }[stage]

  const cancel = async () => {
    const ok = await dialog.confirm({ tone: 'warning', title: 'Hủy lịch trả kho?', message: 'Bạn tiếp tục thuê kho như bình thường đến hết hợp đồng.', confirmLabel: 'Hủy lịch', cancelLabel: 'Không' })
    if (!ok) return
    setBusy(true)
    try { await apiPost(`/api/unit-returns/${item.reservationId}/cancel`, {}); onChanged() }
    catch (error) { await dialog.alert({ tone: 'danger', title: 'Chưa hủy được', message: error.message }) }
    finally { setBusy(false) }
  }
  const pay = async () => {
    setBusy(true)
    try {
      const result = await payReturnFees(dialog, item)
      if (result.redirected) return
      onChanged()
      await dialog.alert({ tone: 'success', title: 'Đã thanh toán', message: result.message })
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa thanh toán được', message: error.message })
    } finally { setBusy(false) }
  }

  return (
    <article className={`ur-card clickable ${stage}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }} title="Bấm để xem hợp đồng">
      <div className="ur-card-head">
        <div>
          <span className="ur-eyebrow">TRẢ KHO</span>
          <h3>Hợp đồng {item.contractNumber} · {item.units.join(', ')}</h3>
          <p>{item.facility}</p>
        </div>
        <span className={`ur-badge ${stage}`}>
          {{ scheduled: 'Đã hẹn trả kho', inspecting: 'Đang kiểm tra kho', confirm: 'Chờ bạn xác nhận', disputed: 'Đang xử lý khiếu nại', owed: 'Cần đóng thêm phí', refunding: 'Chờ hoàn cọc', done: 'Hoàn tất' }[stage]}
        </span>
      </div>

      {/* [SỬA] Bước đã xong (✓ xanh lá) / bước hiện tại (số xanh dương + "Bạn đang ở bước này") / bước chưa tới (xám) */}
      <ol className="ur-steps">
        {steps.map(([label, note], i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={label} className={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="ur-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
              <div>
                {state === 'current' && <em>Bạn đang ở bước này</em>}
                {state === 'done' && <em>Đã xong</em>}
                <b>{label}</b>
                <small>{note}</small>
              </div>
            </li>
          )
        })}
      </ol>

      {/* [THÊM 14] Phí kiểm kho chờ xác nhận / khiếu nại: hộp xác nhận thay cho bảng quyết toán (chưa có số hoàn) */}
      {held && <CustomerInspectionBox inspection={inspection} depositTotal={req.depositTotal} debtDeducted={req.deductedFromDeposit} onChanged={onChanged} />}
      {req.inspectedAt && !held && (
        <div className={`ur-result ${req.conditionResult === 'Damaged' ? 'bad' : 'ok'}`}>
          <strong>{req.conditionResult === 'Damaged' ? 'Kết quả kiểm tra: có vấn đề' : 'Kết quả kiểm tra: kho không có vấn đề'}</strong>
          {req.notes && <p>{req.notes}</p>}
          <table className="ur-table">
            <tbody>
              <tr><td>Tiền cọc đã đóng</td><td>{money(req.depositTotal)}</td></tr>
              {req.fees.map((f, i) => (
                <tr key={i}><td>{f.description}{f.fromDeposit ? '' : f.status === 'Paid' ? ' · đã đóng' : ' · chưa đóng'}</td><td>− {money(f.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              {Number(req.amountOwed) > 0 && <tr className="owed"><td>Cần đóng thêm</td><td>{money(req.amountOwed)}</td></tr>}
              <tr><td>Tiền cọc được hoàn</td><td>{money(req.refundAmount)}{Number(req.refundAmount) > 0 ? (req.refundStatus === 'Completed' ? ' · đã chuyển' : ` · dự kiến ${fmtDay(req.refundDueDate)}`) : ''}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      {!held && inspection && <CustomerInspectionBox inspection={inspection} onChanged={onChanged} />}
      {stage === 'scheduled' && req.overdue && (
        <div className="auth-message error" role="alert">Hợp đồng đã hết hạn ngày {fmtDay(item.endDate)}. Cơ sở đã lên lịch thu hồi kho, nhân viên sẽ liên hệ bạn. Muốn đổi ngày giờ, vui lòng liên hệ cơ sở.</div>
      )}
      {stage === 'scheduled' && (
        <p className="ur-help ur-next"><b className="ur-next-label">Việc bạn cần làm</b><span>Dọn hết đồ, vệ sinh kho và mang theo khóa / thẻ ra vào, đến trả kho {req.scheduledTime ? <>lúc <strong>{req.scheduledTime}</strong> </> : ''}ngày <strong>{fmtDay(req.scheduledDate)}</strong>.</span></p>
      )}

      <div className="ur-actions">
        {stage === 'scheduled' && req.canCancel && <button type="button" className="dashboard-secondary-btn" disabled={busy} onClick={cancel}>Hủy lịch trả kho</button>}
        {stage === 'owed' && <button type="button" className="dashboard-primary-btn" disabled={busy} onClick={pay}>{busy ? 'Đang xử lý...' : `Đóng ${money(req.amountOwed)}`}</button>}
      </div>
    </article>
  )
}

/* Khối "Trả kho" ở đầu trang Hợp đồng: các yêu cầu trả kho đang xử lý / vừa xong. */
export function ReturnSection({ returns, onChanged }) {
  // [THÊM 14] Kết quả kiểm kho (ảnh, xác nhận / khiếu nại). Lần tải này cũng tự xác nhận các kết quả quá hạn -> tải lại trả kho.
  const inspections = useMyInspections()
  const { reload: reloadReturns } = returns
  useEffect(() => { if (inspections.autoSettled > 0) reloadReturns() }, [inspections.data, inspections.autoSettled, reloadReturns])

  if (returns.loading && !returns.data) return null
  if (returns.error) return <div className="rn-error" role="alert">Không tải được thông tin trả kho: {returns.error} <button type="button" onClick={returns.reload}>Thử lại</button></div>
  const active = returns.items.filter(i => i.request && (returnStage(i.request, inspections.byReservation(i.reservationId)) !== 'done' || (i.request.inspectedAt && Date.now() - Date.parse(i.request.inspectedAt) < 30 * 86400000)))
  if (!active.length) return null
  return (
    <section className="ur-section" aria-label="Trả kho">
      <h2>Trả kho</h2>
      {active.map(item => (
        <ReturnProgress key={item.reservationId} item={item} inspection={inspections.byReservation(item.reservationId)}
          onChanged={() => { returns.reload(); inspections.reload(); onChanged?.() }} />
      ))}
    </section>
  )
}

/* Hộp thoại báo trả kho. */
export function ReturnRequestModal({ item, rules, fees, onClose, onDone }) {
  const dialog = useDialog()
  const policies = usePolicies()
  const rr = policies.values?.renewal_return || {}
  const [date, setDate] = useState(toInput(item.minReturnDate))
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState({ loading: false, list: [], error: '' })
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Chỉ hiện khung giờ còn nhân viên rảnh (backend tính bằng luật phân công chung)
  useEffect(() => {
    if (!date) { setSlots({ loading: false, list: [], error: '' }); setTime(''); return }
    let cancelled = false
    setSlots(current => ({ ...current, loading: true, error: '' }))
    apiGet(`/api/unit-returns/${item.reservationId}/slots?date=${date}`)
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data?.slots) ? data.slots : []
        setSlots({ loading: false, list, error: '' })
        setTime(current => (list.includes(current) ? current : list[0] || ''))
      })
      .catch(err => { if (!cancelled) { setSlots({ loading: false, list: [], error: err.message }); setTime('') } })
    return () => { cancelled = true }
  }, [date, item.reservationId])

  const early = date && toInput(item.endDate) > date
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await apiPost('/api/unit-returns', { reservationId: item.reservationId, returnDate: date, returnTime: time, note })
      onDone?.(result)
      onClose()
      await dialog.alert({ tone: 'success', title: 'Đã đặt lịch trả kho', message: result.message })
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  const feeList = [
    ...(rr.returnFees || []).map(f => `${f.name}${f.amount ? `: ${money(f.amount)}` : ''}${f.condition ? ` (${f.condition})` : ''}`),
    ...fees.filter(f => !(rr.returnFees || []).some(x => x.name === f.name)).map(f => `${f.name}: ${f.valueType === 'Percentage' ? `${f.minValue}–${f.maxValue}%` : f.minValue === f.maxValue ? money(f.maxValue) : `${money(f.minValue)}–${money(f.maxValue)}`}`)
  ]

  return (
    <div className="csf-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="csf ur-modal" role="dialog" aria-modal="true" aria-labelledby="ur-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Trả kho</span>
            <h2 id="ur-title">Hợp đồng {item.contractNumber}</h2>
            <p>{item.facility} · kho {item.units.join(', ')} · hết hạn {fmtDay(item.endDate)}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        <div className="csf-body">
          {error && <div className="auth-message error" role="alert">{error}</div>}
          <label className="csf-label" htmlFor="ur-date">Ngày trả kho</label>
          <input id="ur-date" type="date" className="csf-input" value={date} min={toInput(item.minReturnDate)} max={toInput(item.maxReturnDate)} onChange={e => setDate(e.target.value)} />
          <p className="csf-hint">
            Chọn từ {fmtDay(item.minReturnDate)} đến {fmtDay(item.maxReturnDate)} · theo chính sách cần báo trước ít nhất {rules?.returnNoticeDays ?? 7} ngày.
            {early && ' Trả kho trước ngày hết hạn không được hoàn tiền thuê của những ngày còn lại.'}
          </p>

          <label className="csf-label" htmlFor="ur-time">Giờ trả kho</label>
          {slots.loading ? <p className="csf-hint">Đang tải khung giờ còn trống...</p>
            : slots.error ? <p className="csf-hint" role="alert">{slots.error}</p>
            : slots.list.length === 0 ? <p className="csf-hint" role="alert">Ngày này đã kín lịch nhân viên. Vui lòng chọn ngày khác.</p>
            : (
              <select id="ur-time" className="csf-input" value={time} onChange={e => setTime(e.target.value)}>
                {slots.list.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

          <div className="ur-policy">
            <h4>Quy trình trả kho</h4>
            <ol>
              <li>Đến cơ sở đúng ngày giờ hẹn, nhân viên được phân công (ưu tiên người đã bàn giao kho cho bạn) sẽ nhận lại và kiểm tra kho.</li>
              <li>{rr.returnRequirements || 'Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập.'}</li>
              <li>Không có vấn đề: tiền cọc được hoàn sau <strong>{rules?.depositRefundDays ?? 7} ngày</strong>.</li>
              <li>Có hư hỏng / phát sinh: nhân viên chụp ảnh và gửi bạn các khoản phí. Bạn có thời hạn để <strong>đồng ý hoặc khiếu nại</strong> trước khi trừ vào tiền cọc (quá hạn hệ thống tự xác nhận); nếu tiền cọc không đủ, bạn đóng thêm phần còn thiếu.</li>
            </ol>
            {feeList.length > 0 && <><h4>Các khoản phí có thể phát sinh</h4><ul>{feeList.map(f => <li key={f}>{f}</li>)}</ul></>}
          </div>

          <label className="csf-label" htmlFor="ur-note">Ghi chú cho nhân viên (không bắt buộc)</label>
          <textarea id="ur-note" className="csf-input ur-note" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: cần xe đẩy, có 2 người phụ chuyển đồ..." />

          <label className={`csf-term ur-agree${agreed ? ' checked' : ''}`}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <div>
              <strong>Tôi đồng ý quy trình trả kho và quyết toán tiền cọc ở trên</strong>
              <p>Sau khi nhân viên nhận lại kho, mã / thẻ ra vào của tôi sẽ bị thu hồi.</p>
            </div>
          </label>
        </div>
        <div className="csf-actions">
          <span className="csf-spacer" />
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Để sau</button>
          <button type="button" className="dashboard-primary-btn" disabled={!agreed || !date || !time || busy} onClick={submit}>{busy ? 'Đang gửi...' : `Đặt lịch trả kho ${time ? `${time} ` : ''}${date ? fmtDay(date) : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
