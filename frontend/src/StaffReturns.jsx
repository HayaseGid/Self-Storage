import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'
import { useDialog } from './Dialog'
import { formatVnd } from './storageRules'
import { usePolicies } from './policies'
import { fmtDay } from './UnitReturn'
import './UnitReturn.css'

/*
 * STAFF: TRẢ KHO & KIỂM KHO (UnitReturnsController /api/unit-returns/staff...).
 *   1. Khách báo trả kho -> việc hiện cho Staff đã bàn giao kho (Staff khác cùng cơ sở vẫn xem / làm thay được).
 *   2. "Nhận lại kho": kho chuyển "Đang kiểm tra", thu hồi mã / thẻ ra vào của khách.
 *   3. "Hoàn tất kiểm tra": tình trạng + các khoản phí -> hệ thống trừ vào cọc, báo khách đóng thêm nếu thiếu,
 *      cọc dư hoàn sau N ngày; kho trở lại "Còn trống" hoặc "Bảo trì".
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
const todayIso = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)

export function useStaffReturns() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    return apiGet('/api/unit-returns/staff')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({ loading: false, data: null, error: error?.status === 404 ? 'Backend chưa có UnitReturnsController.cs (chép file rồi chạy lại backend).' : error.message }))
  }, [])
  useEffect(() => { reload() }, [reload])
  return { ...state, items: state.data?.items || [], fees: state.data?.fees || [], rules: state.data?.rules || null, reload }
}

function InspectForm({ item, catalog, refundDays, onDone, onCancel }) {
  const dialog = useDialog()
  const [condition, setCondition] = useState('Good')
  const [notes, setNotes] = useState('')
  const [unitStatus, setUnitStatus] = useState('Available')
  const [fees, setFees] = useState([])
  const [busy, setBusy] = useState(false)

  const total = fees.reduce((n, f) => n + (Number(f.amount) || 0), 0)
  const deposit = Number(item.depositPaid || 0)
  const fromDeposit = Math.min(total, deposit)
  const owed = Math.max(0, total - deposit)
  const refund = Math.max(0, deposit - total)

  const addFee = key => {
    const f = catalog.find(c => c.key === key)
    setFees(list => [...list, { feeCode: f?.feeCode || null, description: f?.name || '', amount: f?.amount ?? '' }])
  }
  const update = (i, patch) => setFees(list => list.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const submit = async () => {
    if (condition === 'Damaged' && !notes.trim()) {
      await dialog.alert({ tone: 'warning', title: 'Thiếu mô tả', message: 'Kho có vấn đề: ghi rõ tình trạng để gửi cho khách.' })
      return
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Hoàn tất kiểm tra?',
      message: `${condition === 'Good' ? 'Kho không có vấn đề.' : 'Kho có vấn đề.'} Phí phát sinh: ${money(total)}.\n${owed > 0 ? `Khách cần đóng thêm ${money(owed)}.` : `Hoàn cọc cho khách: ${money(refund)} sau ${refundDays} ngày.`}\nKết quả sẽ gửi cho khách và không sửa lại được.`,
      confirmLabel: 'Hoàn tất', cancelLabel: 'Xem lại'
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await apiPost(`/api/unit-returns/staff/${item.reservationId}/complete`, {
        condition, notes, unitStatus,
        fees: fees.filter(f => Number(f.amount) > 0).map(f => ({ feeCode: f.feeCode, description: f.description, amount: Number(f.amount) }))
      })
      await dialog.alert({ tone: 'success', title: 'Đã hoàn tất kiểm tra', message: result.message })
      onDone()
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa lưu được', message: error.message })
      setBusy(false)
    }
  }

  return (
    <div className="sr-form">
      <div className="sr-radio" role="radiogroup" aria-label="Tình trạng kho">
        <label><input type="radio" checked={condition === 'Good'} onChange={() => setCondition('Good')} /> Không có vấn đề</label>
        <label><input type="radio" checked={condition === 'Damaged'} onChange={() => { setCondition('Damaged') }} /> Có vấn đề / hư hỏng</label>
      </div>
      <label>Ghi chú tình trạng {condition === 'Damaged' && <em>(bắt buộc)</em>}
        <textarea className="st-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ví dụ: tường trầy 2 vết, mất 1 thẻ từ, còn rác..." />
      </label>

      <div>
        <strong>Phí phát sinh</strong>
        {fees.map((f, i) => (
          <div key={i} className="sr-fee-row">
            <input className="st-input" value={f.description} onChange={e => update(i, { description: e.target.value })} placeholder="Tên khoản phí" />
            <input className="st-input" type="number" min="0" step="10000" value={f.amount} onChange={e => update(i, { amount: e.target.value })} placeholder="Số tiền" />
            <button type="button" onClick={() => setFees(list => list.filter((_, j) => j !== i))} aria-label="Xóa">×</button>
          </div>
        ))}
        <select className="st-input" value="" onChange={e => { if (e.target.value) addFee(e.target.value) }}>
          <option value="">+ Thêm khoản phí...</option>
          {catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          <option value="custom">Khoản khác (tự nhập)</option>
        </select>
      </div>

      <label>Kho sau khi kiểm tra
        <select className="st-input" value={unitStatus} onChange={e => setUnitStatus(e.target.value)}>
          <option value="Available">Sẵn sàng cho thuê (Còn trống)</option>
          <option value="Maintenance">Cần bảo trì / sửa chữa</option>
        </select>
      </label>

      <div className="sr-summary">
        <div><span>Tiền cọc khách đã đóng</span><b>{money(deposit)}</b></div>
        <div><span>Tổng phí phát sinh</span><b>{money(total)}</b></div>
        <div><span>Trừ vào cọc</span><b>{money(fromDeposit)}</b></div>
        {owed > 0
          ? <div className="bad"><span>Khách cần đóng thêm</span><b>{money(owed)}</b></div>
          : <div className="ok"><span>Hoàn cọc sau {refundDays} ngày</span><b>{money(refund)}</b></div>}
      </div>

      <div className="sr-actions">
        <button type="button" className="dashboard-secondary-btn" onClick={onCancel} disabled={busy}>Đóng</button>
        <button type="button" className="dashboard-primary-btn" onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Hoàn tất kiểm tra'}</button>
      </div>
    </div>
  )
}

export default function StaffReturns({ staff }) {
  const dialog = useDialog()
  const data = useStaffReturns()
  const policies = usePolicies()
  const [filter, setFilter] = useState('todo')
  const [inspecting, setInspecting] = useState(null)
  const [busy, setBusy] = useState(null)

  const today = todayIso()
  const atFacility = data.items.filter(i => !staff?.facilityId || i.facility === staff.facilityId)
  const groups = {
    todo: atFacility.filter(i => i.requestStatus === 'Scheduled' && String(i.scheduledDate).slice(0, 10) <= today),
    upcoming: atFacility.filter(i => i.requestStatus === 'Scheduled' && String(i.scheduledDate).slice(0, 10) > today),
    inspecting: atFacility.filter(i => i.requestStatus === 'In Progress'),
    done: atFacility.filter(i => i.requestStatus === 'Completed')
  }
  const shown = groups[filter]

  const catalog = [
    ...(policies.values?.renewal_return?.returnFees || []).map((f, i) => ({ key: `p${i}`, name: f.name, amount: f.amount ?? '', label: `${f.name}${f.amount ? ` · ${money(f.amount)}` : ' · theo thực tế'}` })),
    ...data.fees.map(f => ({ key: f.feeCode, feeCode: f.feeCode, name: f.name, amount: f.valueType === 'Amount' && f.maxValue === f.minValue ? f.maxValue : '', label: `${f.name}${f.valueType === 'Amount' ? ` · ${f.minValue === f.maxValue ? money(f.maxValue) : `${money(f.minValue)}–${money(f.maxValue)}`}` : ''}` }))
  ]

  const start = async item => {
    const ok = await dialog.confirm({
      tone: 'info', title: 'Nhận lại kho?',
      message: `Nhận lại kho ${item.units.map(u => u.unitNumber).join(', ')} của ${item.customerName}. Kho chuyển sang "Đang kiểm tra" và mã / thẻ ra vào của khách bị thu hồi.`,
      confirmLabel: 'Nhận lại kho', cancelLabel: 'Chưa'
    })
    if (!ok) return
    setBusy(item.reservationId)
    try {
      await apiPost(`/api/unit-returns/staff/${item.reservationId}/start`, {})
      await data.reload()
      setFilter('inspecting'); setInspecting(item.reservationId)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa nhận lại kho được', message: error.message })
    } finally { setBusy(null) }
  }

  if (data.loading && !data.data) return <div className="st-card">Đang tải lịch trả kho...</div>
  if (data.error) return <div className="st-card"><div className="st-alert st-warn" role="alert">{data.error}</div><button type="button" className="dashboard-primary-btn" onClick={data.reload}>Thử lại</button></div>

  return (
    <div className="sr-wrap">
      <div className="sr-chips">
        {[['todo', `Hôm nay & quá hẹn ${groups.todo.length}`], ['upcoming', `Sắp tới ${groups.upcoming.length}`], ['inspecting', `Đang kiểm tra ${groups.inspecting.length}`], ['done', `Đã xong ${groups.done.length}`]].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="st-card st-empty">Không có yêu cầu trả kho nào trong mục này.</div>}

      {shown.map(item => {
        const req = item.request
        return (
          <article key={item.reservationId} className="sr-item">
            <div className="sr-item-head">
              <div>
                <h3>
                  {item.customerName}
                  {item.assignedToMe ? <span className="sr-mine">Giao cho bạn</span> : <span className="sr-other">NV {req.staffName}</span>}
                </h3>
                <p>{item.contractNumber} · {item.customerPhone || item.customerEmail} · hẹn trả {fmtDay(item.scheduledDate)} · hết hạn {fmtDay(item.endDate)}</p>
              </div>
              <div><small>Tiền cọc đang giữ</small><br /><strong>{money(item.depositPaid)}</strong></div>
            </div>
            <div className="sr-units">
              {item.units.map(u => <span key={u.unitNumber}><b>{u.unitNumber}</b> · {u.type} · {u.size}{u.access ? ` · ${u.access}` : ''}</span>)}
            </div>
            {req.notes && <p className="ur-help" style={{ whiteSpace: 'pre-line' }}>{req.notes}</p>}

            {item.requestStatus === 'Scheduled' && (
              <div className="sr-actions">
                <button type="button" className="dashboard-primary-btn" disabled={busy === item.reservationId} onClick={() => start(item)}>
                  {busy === item.reservationId ? 'Đang xử lý...' : 'Nhận lại kho & bắt đầu kiểm tra'}
                </button>
              </div>
            )}
            {item.requestStatus === 'In Progress' && (inspecting === item.reservationId
              ? <InspectForm item={item} catalog={catalog} refundDays={data.rules?.depositRefundDays ?? 7} onCancel={() => setInspecting(null)} onDone={() => { setInspecting(null); data.reload(); setFilter('done') }} />
              : <div className="sr-actions"><button type="button" className="dashboard-primary-btn" onClick={() => setInspecting(item.reservationId)}>Nhập kết quả kiểm tra</button></div>)}
            {item.requestStatus === 'Completed' && (
              <div className="sr-summary">
                <div><span>Kết quả</span><b>{req.conditionResult === 'Damaged' ? 'Có vấn đề' : 'Không có vấn đề'}</b></div>
                <div><span>Trừ vào cọc</span><b>{money(req.deductedFromDeposit)}</b></div>
                {Number(req.amountOwed) > 0 && <div className="bad"><span>Khách còn nợ</span><b>{money(req.amountOwed)}</b></div>}
                <div className="ok"><span>Hoàn cọc</span><b>{money(req.refundAmount)}{Number(req.refundAmount) > 0 ? (req.refundStatus === 'Completed' ? ' · đã chuyển' : ` · ${fmtDay(req.refundDueDate)}`) : ''}</b></div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
