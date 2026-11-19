/**
 * ======================================================================
 * FILE: src/features/return/EarlyReturn.jsx  —  TRẢ KHO SỚM (chấm dứt hợp đồng trước hạn)
 * CHỨC NĂNG: Hợp đồng còn HƠN 30 ngày thì khách không "Báo trả kho" thường được mà gửi ĐƠN TRẢ KHO SỚM để
 *   Facility Manager duyệt. Manager duyệt -> hệ thống tạo lịch trả kho cho nhân viên và đi tiếp quy trình trả kho
 *   bình thường (Staff nhận lại kho -> kiểm tra -> quyết toán cọc).
 *   Luật tiền (không có phí chấm dứt sớm, tháng đang dở tính tròn tháng):
 *   - Trả 1 lần: hoàn đủ tiền thuê các tháng SAU tháng chứa ngày trả kho (cùng hạn với hoàn cọc).
 *   - Trả theo tháng: hủy các kỳ sau ngày trả kho. Phải gửi đơn trước ngày đóng tiền kỳ tới ít nhất N ngày
 *     (N = "Báo trả kho trước" trong chính sách, mặc định 7); gửi muộn thì PHẢI ĐÓNG cả kỳ tới (form báo rõ).
 * THÀNH PHẦN CHÍNH:
 *   - EARLY_REASONS (export): danh sách lý do trả kho sớm.
 *   - EarlyReturnModal (export): form khách gửi đơn (ngày, giờ, lý do, ghi chú, bảng tiền dự kiến, đồng ý).
 *   - EarlyRequestCard (export): thẻ trạng thái đơn của khách (chờ duyệt / bị từ chối), rút đơn.
 *   - ManagerEarlyReturnsTab (export): danh sách đơn cho Facility Manager, duyệt / từ chối.
 * DÙNG Ở: pages/customer/CustomerAccount.jsx (EarlyReturnModal), features/return/UnitReturn.jsx (EarlyRequestCard),
 *   pages/manager/FacilityManagerAccount.jsx (ManagerEarlyReturnsTab, mục "Trả kho sớm").
 * API (backend UnitReturnsController, khối "TRẢ KHO SỚM"):
 *   GET  /api/unit-returns/early/{reservationId}/quote?date=  -> tiền dự kiến theo ngày trả
 *   GET  /api/unit-returns/{reservationId}/slots?date=        -> khung giờ còn nhân viên rảnh (khách)
 *   POST /api/unit-returns/early                              -> gửi đơn
 *   POST /api/unit-returns/early/{id}/cancel                  -> khách rút đơn (khi chưa duyệt)
 *   GET  /api/unit-returns/early/manager                      -> đơn tại cơ sở của Manager
 *   GET  /api/unit-returns/early/{id}/slots?date=             -> khung giờ rảnh (Manager đổi giờ hẹn)
 *   POST /api/unit-returns/early/{id}/approve | /reject       -> duyệt / từ chối
 * LUỒNG: Khách bấm "Trả kho sớm" -> EarlyReturnModal -> POST early -> Manager mở mục "Trả kho sớm" -> Duyệt
 *   -> backend hủy / hoàn các kỳ sau ngày trả + tạo lịch trả kho -> khách thấy tiến trình trả kho như bình thường.
 * ======================================================================
 */
import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from '../../components/common/listKit'
import { formatVnd } from '../../services/storageRules'
import '../contract/ContractSignFlow.css'
import './UnitReturn.css'
import './EarlyReturn.css'

/** Lý do trả kho sớm (mã gửi backend -> nhãn hiển thị). */
export const EARLY_REASONS = [
  ['moving', 'Chuyển nhà / chuyển nơi ở'],
  ['no_need', 'Không còn nhu cầu lưu trữ'],
  ['other_unit', 'Chuyển sang kho khác'],
  ['price', 'Giá thuê chưa phù hợp'],
  ['service', 'Chưa hài lòng về dịch vụ'],
  ['other', 'Lý do khác']
]
const reasonLabel = code => (EARLY_REASONS.find(([k]) => k === code) || [null, code])[1]

/** Định dạng tiền làm tròn kèm "đ". */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/** 'YYYY-MM-DD...' -> 'dd/MM/yyyy' ('—' nếu rỗng). */
const fmtDay = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
/** Cắt ngày ISO về 'YYYY-MM-DD' cho ô input type="date". */
const toInput = iso => (iso ? String(iso).slice(0, 10) : '')
/** Lùi n ngày từ ngày ISO (tính theo ngày, không lệch múi giờ). */
const minusDays = (iso, n) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString() }

/**
 * Bảng tiền dự kiến khi trả kho sớm (dùng cho khách và Manager).
 * @param {{quote:object, refundDays?:number}} props quote = kết quả /quote (refundAmount, cancelledPeriods, lateNotice...).
 */
function QuoteTable({ quote, refundDays }) {
  if (!quote) return null
  const upfront = quote.paymentPlan === 'Upfront'
  return (
    <table className="ur-table er-quote">
      <tbody>
        <tr><td>Ngày trả kho</td><td>{fmtDay(quote.returnDate)}</td></tr>
        <tr><td>Tiền thuê tính đến</td><td>{fmtDay(quote.coveredUntil)} <small>(tháng đang dở tính tròn tháng)</small></td></tr>
        {Number(quote.keptUnpaidAmount) > 0 && <tr className="owed"><td>Tiền thuê còn phải đóng trước khi trả kho</td><td>{money(quote.keptUnpaidAmount)}</td></tr>}
        <tr>
          <td>{upfront ? 'Kỳ thuê đã trả trước được hoàn' : 'Kỳ thuê sau ngày trả kho'}</td>
          <td>{quote.cancelledPeriods > 0 ? `${quote.cancelledPeriods} kỳ ${Number(quote.refundAmount) > 0 ? 'được hoàn' : 'được hủy, không phải đóng'}` : 'Không có'}</td>
        </tr>
        <tr><td>Tiền cọc đang giữ</td><td>{money(quote.depositTotal)} <small>(hoàn sau kiểm tra kho, trừ phí nếu có)</small></td></tr>
      </tbody>
      <tfoot>
        <tr><td>Tiền thuê được hoàn lại</td><td>{money(quote.refundAmount)}{Number(quote.refundAmount) > 0 && refundDays != null ? <small> · khoảng {refundDays} ngày sau ngày trả kho</small> : ''}</td></tr>
      </tfoot>
    </table>
  )
}

/**
 * Hộp thoại "Trả kho sớm" của khách.
 * @param {object} props
 * @param {object} props.item thông tin trả kho của hợp đồng (reservationId, contractNumber, units, endDate,
 *   minReturnDate, maxReturnDate, paymentPlan) từ GET /api/unit-returns/mine (mode = 'early').
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onDone] gọi sau khi gửi đơn thành công.
 */
export function EarlyReturnModal({ item, onClose, onDone }) {
  const dialog = useDialog()
  const [date, setDate] = useState(toInput(item.minReturnDate))
  const [time, setTime] = useState('')
  const [slots, setSlots] = useState({ loading: false, list: [], error: '' })
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [info, setInfo] = useState(null) // { quote, noticeDays, refundDays }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Esc để đóng (khi không đang gửi).
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Đổi ngày -> tải khung giờ còn nhân viên rảnh và tiền dự kiến của ngày đó.
  useEffect(() => {
    if (!date) return
    let cancelled = false
    setSlots(s => ({ ...s, loading: true, error: '' }))
    apiGet(`/api/unit-returns/${item.reservationId}/slots?date=${date}`)
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data?.slots) ? data.slots : []
        setSlots({ loading: false, list, error: '' })
        setTime(cur => (list.includes(cur) ? cur : list[0] || ''))
      })
      .catch(err => { if (!cancelled) { setSlots({ loading: false, list: [], error: err.message }); setTime('') } })
    apiGet(`/api/unit-returns/early/${item.reservationId}/quote?date=${date}`)
      .then(data => { if (!cancelled) setInfo(data) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [date, item.reservationId])

  const quote = info?.quote
  const noticeDays = info?.noticeDays ?? 7
  const monthly = item.paymentPlan !== 'Upfront'

  /** Gửi đơn trả kho sớm. API: POST /api/unit-returns/early */
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await apiPost('/api/unit-returns/early', { reservationId: item.reservationId, returnDate: date, returnTime: time, reason, note, agree: agreed })
      onDone?.(result)
      onClose()
      await dialog.alert({ tone: 'success', title: 'Đã gửi đơn trả kho sớm', message: result.message })
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  const canSubmit = agreed && date && time && reason && (reason !== 'other' || note.trim()) && !busy

  return (
    <div className="csf-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="csf ur-modal" role="dialog" aria-modal="true" aria-labelledby="er-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Trả kho sớm</span>
            <h2 id="er-title">Hợp đồng {item.contractNumber}</h2>
            <p>{item.facility} · kho {item.units.join(', ')} · hết hạn {fmtDay(item.endDate)} · {monthly ? 'trả tiền theo tháng' : 'đã trả 1 lần'}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        <div className="csf-body">
          {error && <div className="auth-message error" role="alert">{error}</div>}

          <div className="er-intro">
            Đơn trả kho sớm được gửi tới <strong>Quản lý cơ sở</strong> duyệt. Khi được duyệt, lịch trả kho được giao cho nhân viên
            và bạn trả kho như bình thường. <strong>Không có phí chấm dứt hợp đồng sớm.</strong>
          </div>

          <label className="csf-label" htmlFor="er-date">Ngày trả kho</label>
          <input id="er-date" type="date" className="csf-input" value={date} min={toInput(item.minReturnDate)} max={toInput(item.maxReturnDate)} onChange={e => setDate(e.target.value)} />
          <p className="csf-hint">Chọn từ {fmtDay(item.minReturnDate)} đến {fmtDay(item.maxReturnDate)} · cần báo trước ít nhất {noticeDays} ngày.</p>

          <label className="csf-label" htmlFor="er-time">Giờ trả kho</label>
          {slots.loading ? <p className="csf-hint">Đang tải khung giờ còn trống...</p>
            : slots.error ? <p className="csf-hint" role="alert">{slots.error}</p>
            : slots.list.length === 0 ? <p className="csf-hint" role="alert">Ngày này đã kín lịch nhân viên. Vui lòng chọn ngày khác.</p>
            : (
              <select id="er-time" className="csf-input" value={time} onChange={e => setTime(e.target.value)}>
                {slots.list.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

          {/* Trả theo tháng: nhắc mốc báo trước kỳ đóng tiền tới; gửi muộn -> phải đóng cả kỳ tới */}
          {monthly && quote?.nextDueDate && (
            quote.lateNotice ? (
              <div className="er-warn" role="alert">
                <strong>⚠ Bạn phải đóng tiền thuê kỳ bắt đầu {fmtDay(quote.nextDueDate)}.</strong>
                <span>
                  Theo chính sách, muốn không phải đóng kỳ tới thì cần gửi đơn trả kho sớm <b>trước ngày đóng tiền kỳ tới ít nhất {noticeDays} ngày</b>
                  (tức trước ngày {fmtDay(minusDays(quote.nextDueDate, noticeDays))}).
                  Đơn này gửi muộn hơn mốc đó nên kỳ {fmtDay(quote.nextDueDate)} vẫn được tính và bạn được dùng kho tới hết kỳ.
                </span>
              </div>
            ) : (
              <div className="er-note">
                Kỳ đóng tiền tới: <strong>{fmtDay(quote.nextDueDate)}</strong>. Trả kho trước ngày này thì kỳ đó và các kỳ sau được hủy, không phải đóng.
                Gửi đơn muộn hơn {noticeDays} ngày trước kỳ đóng tiền thì phải đóng cả kỳ đó.
              </div>
            )
          )}

          <h4 className="er-sub">Số tiền dự kiến</h4>
          {quote ? <QuoteTable quote={quote} refundDays={info?.refundDays} /> : <p className="csf-hint">Đang tính...</p>}
          <p className="csf-hint">Số tiền cuối cùng được chốt khi Quản lý duyệt và sau khi nhân viên kiểm tra kho (phí vệ sinh / hư hỏng nếu có được trừ vào tiền cọc).</p>

          <label className="csf-label" htmlFor="er-reason">Lý do trả kho sớm</label>
          <select id="er-reason" className="csf-input" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">— Chọn lý do —</option>
            {EARLY_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>

          <label className="csf-label" htmlFor="er-note">Ghi chú {reason === 'other' ? '(bắt buộc)' : '(không bắt buộc)'}</label>
          <textarea id="er-note" className="csf-input ur-note" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: chuyển công tác, cần xe đẩy khi trả kho..." />

          <label className={`csf-term ur-agree${agreed ? ' checked' : ''}`}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <div>
              <strong>Tôi đồng ý chấm dứt hợp đồng trước hạn theo các điều kiện trên</strong>
              <p>Khi được duyệt, tôi không hủy được lịch trả kho; mã / thẻ ra vào bị thu hồi khi nhân viên nhận lại kho.</p>
            </div>
          </label>
        </div>
        <div className="csf-actions">
          <span className="csf-spacer" />
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Để sau</button>
          <button type="button" className="dashboard-primary-btn" disabled={!canSubmit} onClick={submit}>{busy ? 'Đang gửi...' : 'Gửi đơn trả kho sớm'}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Thẻ trạng thái đơn trả kho sớm của khách (đang chờ duyệt / bị từ chối). Đơn đã duyệt hiển thị qua tiến trình trả kho.
 * @param {{item:object, onChanged:Function}} props item = thông tin trả kho có item.earlyRequest.
 */
export function EarlyRequestCard({ item, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const e = item.earlyRequest
  if (!e) return null
  const pending = e.status === 'Pending'

  /** Rút đơn. API: POST /api/unit-returns/early/{id}/cancel */
  const cancel = async () => {
    const ok = await dialog.confirm({ tone: 'warning', title: 'Rút đơn trả kho sớm?', message: 'Bạn tiếp tục thuê kho như hợp đồng.', confirmLabel: 'Rút đơn', cancelLabel: 'Không' })
    if (!ok) return
    setBusy(true)
    try { await apiPost(`/api/unit-returns/early/${e.id}/cancel`, {}); onChanged?.() }
    catch (err) { await dialog.alert({ tone: 'danger', title: 'Chưa rút được đơn', message: err.message }) }
    finally { setBusy(false) }
  }

  return (
    <article className={`ur-card er-card ${pending ? 'pending' : 'rejected'}`}>
      <div className="ur-card-head">
        <div>
          <span className="ur-eyebrow">TRẢ KHO SỚM</span>
          <h3>Hợp đồng {item.contractNumber} · {item.units.join(', ')}</h3>
          <p>{item.facility}</p>
        </div>
        <span className={`ur-badge ${pending ? 'inspecting' : 'owed'}`}>{pending ? 'Chờ Quản lý duyệt' : 'Bị từ chối'}</span>
      </div>
      <table className="ur-table">
        <tbody>
          <tr><td>Ngày giờ trả kho đề nghị</td><td>{e.returnTime} · {fmtDay(e.returnDate)}</td></tr>
          <tr><td>Lý do</td><td>{reasonLabel(e.reason)}{e.note ? ` — ${e.note}` : ''}</td></tr>
          <tr><td>Tiền thuê được hoàn (dự kiến)</td><td>{money(e.refundAmount)}{e.cancelledPeriods > 0 && Number(e.refundAmount) === 0 ? ` · hủy ${e.cancelledPeriods} kỳ chưa đóng` : ''}</td></tr>
          {e.lateNotice && <tr className="owed"><td colSpan={2}>Đơn gửi muộn: bạn vẫn phải đóng kỳ tiền thuê kế tiếp.</td></tr>}
          {!pending && e.managerNote && <tr><td>Lý do từ chối</td><td>{e.managerNote}</td></tr>}
        </tbody>
      </table>
      <div className="ur-actions">
        {pending && <button type="button" className="dashboard-secondary-btn" disabled={busy} onClick={cancel}>Rút đơn</button>}
      </div>
    </article>
  )
}

/**
 * Hộp thoại Manager duyệt / từ chối 1 đơn trả kho sớm (có thể đổi ngày giờ hẹn nếu khung cũ đã kín).
 * @param {{row:object, refundDays:number, onClose:Function, onDone:Function}} props
 */
function DecisionModal({ row, refundDays, onClose, onDone }) {
  const e = row.request
  const [date, setDate] = useState(toInput(e.returnDate))
  const [time, setTime] = useState(e.returnTime)
  const [slots, setSlots] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Đổi ngày -> tải khung giờ còn nhân viên rảnh. API: GET /api/unit-returns/early/{id}/slots?date=
  useEffect(() => {
    if (!date) return
    let cancelled = false
    apiGet(`/api/unit-returns/early/${e.id}/slots?date=${date}`)
      .then(d => { if (!cancelled) { const list = Array.isArray(d?.slots) ? d.slots : []; setSlots(list); setTime(cur => (list.includes(cur) ? cur : list[0] || '')) } })
      .catch(() => { if (!cancelled) setSlots([]) })
    return () => { cancelled = true }
  }, [date, e.id])

  /** Duyệt / từ chối. API: POST /api/unit-returns/early/{id}/approve | /reject */
  const decide = async approve => {
    if (!approve && !note.trim()) { setError('Vui lòng ghi lý do từ chối để khách biết.'); return }
    setBusy(true); setError('')
    try {
      const result = approve
        ? await apiPost(`/api/unit-returns/early/${e.id}/approve`, { returnDate: date, returnTime: time, note })
        : await apiPost(`/api/unit-returns/early/${e.id}/reject`, { note })
      onDone(result)
    } catch (err) { setError(err.message); setBusy(false) }
  }

  return (
    <div className="csf-overlay" onMouseDown={ev => { if (ev.target === ev.currentTarget && !busy) onClose() }}>
      <div className="csf ur-modal" role="dialog" aria-modal="true" aria-labelledby="er-dec-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Đơn trả kho sớm</span>
            <h2 id="er-dec-title">{row.customerName} · HĐ {row.contractNumber}</h2>
            <p>{row.facility} · kho {row.units.join(', ')} · hết hạn {fmtDay(row.endDate)} · {row.paymentPlan === 'Upfront' ? 'đã trả 1 lần' : 'trả theo tháng'}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        <div className="csf-body">
          {error && <div className="auth-message error" role="alert">{error}</div>}
          <p className="er-note">Lý do: <strong>{reasonLabel(e.reason)}</strong>{e.note ? ` — “${e.note}”` : ''} · gửi lúc {fmtDay(e.createdAt)}</p>
          <h4 className="er-sub">Số tiền (tính theo ngày khách đề nghị)</h4>
          <QuoteTable quote={row.quote} refundDays={refundDays} />
          {row.quote?.lateNotice && <div className="er-warn">Khách gửi đơn muộn: kỳ tiền thuê kế tiếp vẫn được tính.</div>}

          <h4 className="er-sub">Lịch trả kho giao cho nhân viên</h4>
          <div className="er-row">
            <input type="date" className="csf-input" value={date} onChange={ev => setDate(ev.target.value)} aria-label="Ngày trả kho" />
            <select className="csf-input" value={time} onChange={ev => setTime(ev.target.value)} aria-label="Giờ trả kho">
              {slots.length === 0 && <option value="">Kín lịch</option>}
              {slots.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <p className="csf-hint">Mặc định là ngày giờ khách chọn. Nếu khung giờ đã kín, liên hệ khách rồi chọn ngày giờ khác. Đổi ngày thì số tiền được tính lại theo ngày mới khi duyệt.</p>

          <label className="csf-label" htmlFor="er-dec-note">Ghi chú cho khách (bắt buộc khi từ chối)</label>
          <textarea id="er-dec-note" className="csf-input ur-note" rows={2} maxLength={500} value={note} onChange={ev => setNote(ev.target.value)} />
        </div>
        <div className="csf-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={() => decide(false)} disabled={busy}>Từ chối</button>
          <span className="csf-spacer" />
          <button type="button" className="dashboard-primary-btn" onClick={() => decide(true)} disabled={busy || !date || !time}>{busy ? 'Đang xử lý...' : 'Duyệt & chấm dứt hợp đồng sớm'}</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = { Pending: 'Chờ duyệt', Approved: 'Đã duyệt', Rejected: 'Từ chối', Cancelled: 'Khách rút đơn' }
const STATUS_PILL = { Pending: 'fm-badge fm-warn', Approved: 'fm-badge fm-ok', Rejected: 'fm-badge fm-bad', Cancelled: 'fm-badge' }

/**
 * Mục "Trả kho sớm" của Facility Manager: danh sách đơn (chờ duyệt trước), duyệt / từ chối.
 * @param {{showToast:Function}} props
 */
export function ManagerEarlyReturnsTab({ showToast }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('Pending')
  const [open, setOpen] = useState(null)

  /** Tải danh sách. API: GET /api/unit-returns/early/manager */
  const load = useCallback(() => {
    setError('')
    return apiGet('/api/unit-returns/early/manager').then(setData).catch(err => { setError(err.message); setData({ items: [] }) })
  }, [])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const count = s => items.filter(i => i.request.status === s).length
  const shown = filter === 'all' ? items : items.filter(i => i.request.status === filter)
  const paging = useClientPaging(shown, { resetKey: filter })

  return (
    <div className="fm-section-card">
      <div className="fm-card-header-flex">
        <div>
          <h2>Đơn trả kho sớm</h2>
          <p>
            Khách còn hơn 30 ngày hợp đồng muốn trả kho gửi đơn tại đây. Duyệt → hệ thống hủy / hoàn các kỳ tiền thuê sau ngày trả kho
            (không phí chấm dứt sớm) và giao lịch trả kho cho nhân viên, sau đó đi tiếp quy trình trả kho bình thường.
          </p>
        </div>
        <button type="button" className="dashboard-secondary-btn" onClick={load}>Tải lại</button>
      </div>
      <div className="fp-toolbar">
        <div className="fp-chips">
          {[['Pending', `Chờ duyệt ${count('Pending')}`], ['Approved', `Đã duyệt ${count('Approved')}`], ['Rejected', `Từ chối ${count('Rejected')}`], ['all', `Tất cả ${items.length}`]].map(([v, t]) => (
            <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{t}</button>
          ))}
        </div>
      </div>
      {error && <div className="auth-message error" role="alert">{error}</div>}
      {data === null ? <p className="fm-muted">Đang tải...</p> : shown.length === 0 ? (
        <div className="empty-state">Không có đơn trả kho sớm nào trong mục này.</div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr><th>Khách hàng</th><th>Hợp đồng · kho</th><th>Trả kho đề nghị</th><th>Lý do</th><th>Tiền thuê hoàn</th><th>Trạng thái</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {paging.pageRows.map(row => {
                const e = row.request
                const refund = row.quote ? row.quote.refundAmount : e.refundAmount
                return (
                  <tr key={e.id} className={rowClass(e.createdAt)}>
                    <td><strong>{row.customerName}</strong> <NewBadge createdAt={e.createdAt} /><div className="fm-muted">{row.customerPhone || row.customerEmail}</div></td>
                    <td><Code kind="contract">{row.contractNumber || row.reservationCode}</Code><div style={{ marginTop: 4 }}><UnitCodes units={row.units} max={4} /></div><div className="fm-muted">Hết hạn {fmtDay(row.endDate)} · {row.paymentPlan === 'Upfront' ? 'trả 1 lần' : 'theo tháng'}</div></td>
                    <td>{e.returnTime} · {fmtDay(e.returnDate)}{e.lateNotice && <div className="fm-muted">Gửi muộn: tính thêm kỳ tới</div>}</td>
                    <td>{reasonLabel(e.reason)}{e.note && <div className="fm-muted ri-clamp">“{e.note}”</div>}</td>
                    <td><strong>{money(refund)}</strong>{e.cancelledPeriods > 0 && <div className="fm-muted">{e.cancelledPeriods} kỳ hủy / hoàn</div>}</td>
                    <td><span className={STATUS_PILL[e.status] || 'fm-badge'}>{STATUS_LABEL[e.status] || e.status}</span>{e.managerNote && <div className="fm-muted ri-clamp">{e.managerNote}</div>}</td>
                    <td>{e.status === 'Pending' ? <button type="button" className="fp-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => setOpen(row)}>Xem & duyệt</button> : <span className="fm-muted">{fmtDay(e.decidedAt)}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pager {...paging.pagerProps} unit="đơn" />
        </div>
      )}
      {open && (
        <DecisionModal row={open} refundDays={data?.refundDays} onClose={() => setOpen(null)} onDone={async result => {
          setOpen(null)
          showToast?.(result.message)
          await load()
        }} />
      )}
    </div>
  )
}
