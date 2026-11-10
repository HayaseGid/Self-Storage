import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from './api'
import { useDialog } from './Dialog'
import { formatVnd } from './storageRules'
import './ReturnInspection.css'

/*
 * GÓP Ý 14 - KIỂM KHO KHI TRẢ: ẢNH + KHÁCH XÁC NHẬN / KHIẾU NẠI TRƯỚC KHI TRỪ CỌC (file THÊM MỚI).
 * Backend: ReturnInspectionsController (/api/return-inspections/...), Staff gửi ảnh ở /api/unit-returns/staff/{id}/complete.
 *   - Staff:   PhotoPicker trong form "Nhập kết quả kiểm tra" + StaffInspectionStatus ở thẻ "Đã xong".
 *   - Khách:   CustomerInspectionBox trong khối "Trả kho" (trang Hợp đồng): xem ảnh, Đồng ý / Khiếu nại.
 *   - Manager: ManagerReturnInspectionsTab: xem ảnh 2 bên, giữ / giảm / miễn từng khoản, ghi quyết định.
 */

export const INSPECTION = { AWAITING: 'Awaiting Customer', DISPUTED: 'Disputed', SETTLED: 'Settled' }
export const MAX_STAFF_PHOTOS = 5
export const MAX_CUSTOMER_PHOTOS = 3

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
const fmtDateTime = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
const timeLeft = iso => {
  const ms = Date.parse(iso) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'đã quá hạn'
  const hours = Math.ceil(ms / 3600000)
  return hours >= 24 ? `còn ${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `còn ${hours} giờ`
}
const missingTableMessage = error => (error?.status === 404
  ? 'Backend chưa có ReturnInspectionsController (chép file rồi chạy lại backend).'
  : error?.message || 'Không tải được kết quả kiểm kho.')

/* ------------------------------------------------------------------ Ảnh */

/* Nén ảnh trước khi gửi: cạnh dài tối đa 1280px, JPEG 0.7 (giống báo cáo sự cố kho của Staff) */
export const compressImage = file => new Promise((resolve, reject) => {
  if (!file.type?.startsWith('image/')) { reject(new Error(`"${file.name}" không phải file ảnh.`)); return }
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Không đọc được ảnh.'))
  reader.onload = () => {
    const img = new Image()
    img.onerror = () => reject(new Error('File không phải ảnh hợp lệ.'))
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.src = reader.result
  }
  reader.readAsDataURL(file)
})

export function PhotoPicker({ images, onChange, max = MAX_STAFF_PHOTOS, required = false, label = 'Ảnh hiện trạng kho', hint, disabled }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async fileList => {
    const files = [...fileList].slice(0, Math.max(0, max - images.length))
    if (!files.length) return
    setBusy(true); setError('')
    try {
      const compressed = await Promise.all(files.map(compressImage))
      onChange([...images, ...compressed].slice(0, max))
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }
  return (
    <div className={`ri-picker${required && images.length === 0 ? ' need' : ''}`}>
      <div className="ri-picker-head">
        <strong>{label} {required ? <em>(bắt buộc, ít nhất 1 ảnh)</em> : <small>(không bắt buộc)</small>}</strong>
        <span>{images.length}/{max}</span>
      </div>
      {hint && <p className="ri-hint">{hint}</p>}
      <div className="ri-thumbs">
        {images.map((src, i) => (
          <figure key={i} className="ri-thumb">
            <img src={src} alt={`Ảnh ${i + 1}`} />
            {!disabled && <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label={`Xóa ảnh ${i + 1}`}>×</button>}
          </figure>
        ))}
        {images.length < max && !disabled && (
          <label className="ri-add">
            <input type="file" accept="image/*" capture="environment" multiple disabled={busy}
              onChange={e => { add(e.target.files); e.target.value = '' }} />
            <span aria-hidden="true">＋</span>
            <small>{busy ? 'Đang nén...' : 'Chụp / chọn ảnh'}</small>
          </label>
        )}
      </div>
      {error && <p className="ri-error" role="alert">{error}</p>}
    </div>
  )
}

export function PhotoGallery({ images = [], emptyText = 'Không có ảnh.' }) {
  const [open, setOpen] = useState(null)
  useEffect(() => {
    if (open === null) return undefined
    const onKey = e => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen(i => (i + 1) % images.length)
      if (e.key === 'ArrowLeft') setOpen(i => (i - 1 + images.length) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, images.length])
  if (!images.length) return <p className="ri-hint">{emptyText}</p>
  return (
    <>
      <div className="ri-thumbs">
        {images.map((src, i) => (
          <button key={i} type="button" className="ri-thumb view" onClick={() => setOpen(i)} aria-label={`Phóng to ảnh ${i + 1}`}>
            <img src={src} alt={`Ảnh ${i + 1}`} />
          </button>
        ))}
      </div>
      {open !== null && createPortal(
        <div className="ri-lightbox" role="dialog" aria-modal="true" aria-label="Xem ảnh" onClick={() => setOpen(null)}>
          <img src={images[open]} alt={`Ảnh ${open + 1}`} onClick={e => e.stopPropagation()} />
          <div className="ri-lightbox-bar" onClick={e => e.stopPropagation()}>
            {images.length > 1 && <button type="button" onClick={() => setOpen((open - 1 + images.length) % images.length)}>‹ Trước</button>}
            <span>{open + 1}/{images.length}</span>
            {images.length > 1 && <button type="button" onClick={() => setOpen((open + 1) % images.length)}>Sau ›</button>}
            <button type="button" onClick={() => setOpen(null)}>Đóng</button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/* Chi tiết kèm ảnh (danh sách không trả ảnh cho nhẹ) - chỉ tải khi mở. */
export function useInspectionDetail(inspectionId, enabled = true) {
  const [state, setState] = useState({ loading: false, error: '', data: null })
  const load = useCallback(() => {
    if (!inspectionId || !enabled) return Promise.resolve()
    setState(s => ({ ...s, loading: true, error: '' }))
    return apiGet(`/api/return-inspections/${inspectionId}`)
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({ loading: false, error: missingTableMessage(error), data: null }))
  }, [inspectionId, enabled])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

function InspectionPhotos({ inspection, showCustomer = true }) {
  const hasAny = inspection.staffImageCount > 0 || (showCustomer && inspection.customerImageCount > 0)
  const [open, setOpen] = useState(false)
  const detail = useInspectionDetail(inspection.inspectionId, open)
  if (!hasAny) return <p className="ri-hint">Nhân viên không đính kèm ảnh.</p>
  if (!open) {
    return (
      <button type="button" className="ri-link" onClick={() => setOpen(true)}>
        📷 Xem {inspection.staffImageCount} ảnh kiểm kho{showCustomer && inspection.customerImageCount > 0 ? ` + ${inspection.customerImageCount} ảnh khách gửi` : ''}
      </button>
    )
  }
  if (detail.loading || !detail.data) return <p className="ri-hint">{detail.error || 'Đang tải ảnh...'}</p>
  return (
    <div className="ri-photos">
      <h5>Ảnh nhân viên chụp khi kiểm kho</h5>
      <PhotoGallery images={detail.data.staffImages} />
      {showCustomer && detail.data.customerImages?.length > 0 && (
        <>
          <h5>Ảnh khách gửi kèm khiếu nại</h5>
          <PhotoGallery images={detail.data.customerImages} />
        </>
      )}
    </div>
  )
}

function FeeTable({ inspection, showFinal }) {
  return (
    <table className="ri-table">
      <thead>
        <tr><th>Khoản phí kiểm kho</th><th>{showFinal ? 'Đề xuất' : 'Số tiền'}</th>{showFinal && <th>Chốt</th>}</tr>
      </thead>
      <tbody>
        {inspection.fees.map(f => (
          <tr key={f.feeId}>
            <td>{f.description}</td>
            <td className={showFinal && f.finalAmount != null && Number(f.finalAmount) < Number(f.proposedAmount) ? 'struck' : ''}>{money(f.proposedAmount)}</td>
            {showFinal && <td>{f.finalAmount == null ? '—' : money(f.finalAmount)}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td>Tổng</td><td>{money(inspection.proposedTotal)}</td>{showFinal && <td>{money(inspection.finalTotal)}</td>}</tr>
      </tfoot>
    </table>
  )
}

/* ------------------------------------------------------------------ KHÁCH */

export function useMyInspections() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    return apiGet('/api/return-inspections/mine')
      .then(data => { setState({ loading: false, error: '', data }); return data })
      .catch(error => { setState({ loading: false, error: missingTableMessage(error), data: null }); return null })
  }, [])
  useEffect(() => { reload() }, [reload])
  const items = Array.isArray(state.data?.items) ? state.data.items : []
  return {
    ...state,
    items,
    confirmDays: state.data?.confirmDays ?? 3,
    autoSettled: state.data?.autoSettled ?? 0,
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

function DisputeModal({ inspection, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  const submit = async e => {
    e.preventDefault()
    if (reason.trim().length < 10) { setError('Vui lòng ghi rõ lý do khiếu nại (ít nhất 10 ký tự).'); return }
    setBusy(true); setError('')
    try {
      const result = await apiPost(`/api/return-inspections/${inspection.inspectionId}/dispute`, { reason: reason.trim(), images })
      onDone(result)
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }
  // [SỬA] Vẽ popup thẳng vào <body> (portal). Trước đây popup nằm TRONG thẻ "Trả kho" (.ur-card.clickable),
  // thẻ đó có transform khi hover -> position: fixed bị tính theo thẻ thay vì màn hình: popup không nổi lên
  // mà nằm đè/đẩy nội dung, và rê chuột ra vào thẻ làm popup nhảy qua lại (nhấp nháy).
  return createPortal(
    <div className="ri-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <form className="ri-modal" role="dialog" aria-modal="true" aria-labelledby="ri-dispute-title" onSubmit={submit}>
        <div className="ri-modal-head">
          <h3 id="ri-dispute-title">Khiếu nại kết quả kiểm kho</h3>
          <button type="button" className="ri-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        <p className="ri-hint">
          Hợp đồng {inspection.contractNumber} · phí đề xuất {money(inspection.proposedTotal)}. Facility Manager sẽ đối chiếu ảnh của nhân viên
          với lý do và ảnh của bạn rồi quyết định giữ nguyên, giảm hoặc miễn từng khoản. Tiền cọc chưa bị trừ trong lúc chờ.
          Mỗi kết quả chỉ khiếu nại được 1 lần, quyết định của Manager là cuối cùng.
        </p>
        {error && <div className="ri-error" role="alert">{error}</div>}
        <label className="ri-label" htmlFor="ri-reason">Lý do khiếu nại <em>(bắt buộc, 10–1000 ký tự)</em></label>
        <textarea id="ri-reason" className="ri-input" rows={4} maxLength={1000} value={reason} autoFocus
          onChange={e => { setReason(e.target.value); setError('') }}
          placeholder="Ví dụ: vết trầy ở tường đã có từ lúc nhận kho (xem biên bản bàn giao), tôi đã dọn sạch kho trước khi trả..." />
        <small className="ri-count">{reason.trim().length}/1000</small>
        <PhotoPicker images={images} onChange={setImages} max={MAX_CUSTOMER_PHOTOS} label="Ảnh của bạn" disabled={busy}
          hint="Ví dụ: ảnh kho lúc bạn trả, ảnh lúc mới nhận kho." />
        <div className="ri-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Để sau</button>
          <button type="submit" className="dashboard-primary-btn" disabled={busy || reason.trim().length < 10}>{busy ? 'Đang gửi...' : 'Gửi khiếu nại'}</button>
        </div>
      </form>
    </div>,
    document.body
  )
}

/*
 * Hộp kết quả kiểm kho trong thẻ "Trả kho" của khách.
 *   depositTotal / debtDeducted: lấy từ /api/unit-returns/mine (request.depositTotal, request.deductedFromDeposit).
 * Chặn click lan ra ngoài vì thẻ trả kho bấm vào là mở hợp đồng.
 */
export function CustomerInspectionBox({ inspection, depositTotal, debtDeducted = 0, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const i = inspection
  if (!i) return null
  const settled = i.status === INSPECTION.SETTLED
  const noFee = i.settledBy === 'NoFee'

  const accept = async () => {
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Đồng ý kết quả kiểm kho?',
      message: `Phí kiểm kho ${money(i.proposedTotal)} sẽ trừ vào tiền cọc còn lại ${money(i.depositRemaining)}.\n` +
        (Number(i.expectedOwed) > 0 ? `Bạn cần đóng thêm ${money(i.expectedOwed)}.` : `Bạn được hoàn ${money(i.expectedRefund)}.`) +
        '\nSau khi đồng ý sẽ không khiếu nại được nữa.',
      confirmLabel: 'Đồng ý', cancelLabel: 'Xem lại'
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await apiPost(`/api/return-inspections/${i.inspectionId}/accept`, {})
      await dialog.alert({ tone: 'success', title: 'Đã quyết toán tiền cọc', message: result.message })
      onChanged?.()
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa xác nhận được', message: error.message })
      onChanged?.()
    } finally { setBusy(false) }
  }

  if (noFee) {
    // Không có phí kiểm kho: chỉ hiện ảnh (nếu có) cho minh bạch
    return i.staffImageCount > 0
      ? <div className="ri-box ok" onClick={e => e.stopPropagation()}><InspectionPhotos inspection={i} showCustomer={false} /></div>
      : null
  }

  return (
    <div className={`ri-box ${i.status === INSPECTION.AWAITING ? 'warn' : i.status === INSPECTION.DISPUTED ? 'info' : 'ok'}`}
      onClick={e => e.stopPropagation()}>{/* chỉ chặn click (thẻ trả kho bấm vào là mở hợp đồng); không chặn phím để Esc / mũi tên vẫn chạy */}
      <div className="ri-box-head">
        <div>
          <strong>
            {i.status === INSPECTION.AWAITING && 'Kết quả kiểm kho chờ bạn xác nhận'}
            {i.status === INSPECTION.DISPUTED && 'Bạn đã gửi khiếu nại · Facility Manager đang xem xét'}
            {settled && (i.settledBy === 'Manager' ? 'Manager đã giải quyết khiếu nại' : i.settledBy === 'Auto' ? 'Hệ thống đã tự xác nhận (quá hạn)' : 'Bạn đã đồng ý kết quả kiểm kho')}
          </strong>
          <small>Kiểm tra bởi NV {i.inspectedBy} lúc {fmtDateTime(i.inspectedAt)} · {i.conditionResult === 'Damaged' ? 'kho có vấn đề' : 'kho không có vấn đề'}</small>
        </div>
        {i.status === INSPECTION.AWAITING && <span className="ri-deadline">Hạn {fmtDateTime(i.confirmDeadline)} · {timeLeft(i.confirmDeadline)}</span>}
      </div>

      {i.staffNotes && <p className="ri-notes">“{i.staffNotes}”</p>}
      <InspectionPhotos inspection={i} />
      <FeeTable inspection={i} showFinal={i.settledBy === 'Manager'} />

      {/* Đã quyết toán: bảng quyết toán thật nằm ngay trên (khối Trả kho), ở đây chỉ còn ảnh + quyết định */}
      {!settled && <table className="ri-table ri-sum">
        <tbody>
          {depositTotal != null && <tr><td>Tiền cọc đã đóng</td><td>{money(depositTotal)}</td></tr>}
          {Number(debtDeducted) > 0 && <tr><td>Đã trừ công nợ hợp đồng (tiền thuê, phí trễ hạn)</td><td>− {money(debtDeducted)}</td></tr>}
          <tr><td>Tiền cọc còn lại để quyết toán</td><td>{money(i.depositRemaining)}</td></tr>
          <tr><td>{settled ? 'Phí kiểm kho đã chốt' : 'Phí kiểm kho đề xuất'}</td><td>− {money(i.finalTotal)}</td></tr>
        </tbody>
        <tfoot>
          {Number(i.expectedOwed) > 0
            ? <tr className="bad"><td>{settled ? 'Cần đóng thêm' : 'Nếu đồng ý: cần đóng thêm'}</td><td>{money(i.expectedOwed)}</td></tr>
            : <tr className="good"><td>{settled ? 'Tiền cọc được hoàn' : 'Nếu đồng ý: được hoàn'}</td><td>{money(i.expectedRefund)}</td></tr>}
        </tfoot>
      </table>}

      {i.disputeReason && (
        <div className="ri-quote">
          <b>Khiếu nại của bạn ({fmtDateTime(i.respondedAt)}):</b> {i.disputeReason}
        </div>
      )}
      {i.resolutionNotes && (
        <div className="ri-quote decision">
          <b>Quyết định của {i.resolvedBy || 'Facility Manager'} ({fmtDateTime(i.resolvedAt)}):</b> {i.resolutionNotes}
        </div>
      )}

      {i.status === INSPECTION.AWAITING && (
        <>
          <p className="ri-hint">
            Tiền cọc <b>chưa bị trừ</b>. Kiểm tra ảnh và các khoản phí: đồng ý để quyết toán ngay, hoặc khiếu nại nếu thấy chưa đúng.
            Quá hạn mà bạn không phản hồi, hệ thống sẽ tự xác nhận theo số tiền trên.
          </p>
          <div className="ri-actions">
            {i.canRespond && <button type="button" className="dashboard-secondary-btn" disabled={busy} onClick={() => setDisputing(true)}>Khiếu nại</button>}
            <button type="button" className="dashboard-primary-btn" disabled={busy} onClick={accept}>{busy ? 'Đang xử lý...' : 'Đồng ý & quyết toán'}</button>
          </div>
        </>
      )}
      {i.status === INSPECTION.DISPUTED && <p className="ri-hint">Tiền cọc chưa bị trừ cho tới khi Manager quyết định. Bạn sẽ thấy kết quả tại đây.</p>}

      {disputing && (
        <DisputeModal inspection={i} onClose={() => setDisputing(false)} onDone={async result => {
          setDisputing(false)
          await dialog.alert({ tone: 'success', title: 'Đã gửi khiếu nại', message: result.message })
          onChanged?.()
        }} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ STAFF */

export function useStaffInspections() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    return apiGet('/api/return-inspections/staff')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({ loading: false, error: missingTableMessage(error), data: null }))
  }, [])
  useEffect(() => { reload() }, [reload])
  const items = Array.isArray(state.data?.items) ? state.data.items : []
  return {
    ...state,
    items,
    confirmDays: state.data?.confirmDays ?? 3,
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

/* Trạng thái xác nhận ở thẻ "Đã xong" của Staff. */
export function StaffInspectionStatus({ inspection }) {
  const i = inspection
  if (!i) return null
  const tone = i.status === INSPECTION.DISPUTED ? 'bad' : i.status === INSPECTION.AWAITING ? 'warn' : 'ok'
  return (
    <div className={`ri-staff ${tone}`}>
      <div className="ri-staff-head">
        <span className={`ri-pill ${tone}`}>{i.statusLabel}</span>
        {i.status === INSPECTION.AWAITING && <small>Hạn khách xác nhận {fmtDateTime(i.confirmDeadline)} · {timeLeft(i.confirmDeadline)}</small>}
        {i.status === INSPECTION.SETTLED && i.settledAt && i.settledBy !== 'NoFee' && <small>Quyết toán {fmtDateTime(i.settledAt)}</small>}
      </div>
      {i.fees.length > 0 && (
        <p className="ri-hint">
          Phí kiểm kho {i.settledBy === 'Manager' ? <>đề xuất {money(i.proposedTotal)} → chốt <b>{money(i.finalTotal)}</b></> : <b>{money(i.proposedTotal)}</b>}
          : {i.fees.map(f => f.description).join(', ')}.
        </p>
      )}
      {i.disputeReason && <p className="ri-quote"><b>Khách khiếu nại:</b> {i.disputeReason}</p>}
      {i.resolutionNotes && <p className="ri-quote decision"><b>Quyết định của Manager:</b> {i.resolutionNotes}</p>}
      <InspectionPhotos inspection={i} />
    </div>
  )
}

/* ------------------------------------------------------------------ FACILITY MANAGER */

function ResolveModal({ inspectionId, onClose, onDone }) {
  const dialog = useDialog()
  const detail = useInspectionDetail(inspectionId)
  const [finals, setFinals] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const d = detail.data
  const canResolve = d?.status === INSPECTION.DISPUTED

  useEffect(() => {
    if (!d) return
    setFinals(Object.fromEntries(d.fees.map(f => [f.feeId, String(Math.round(Number(f.finalAmount ?? f.proposedAmount)))])))
  }, [d])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const finalOf = f => {
    const n = Number(finals[f.feeId])
    return Number.isFinite(n) ? n : NaN
  }
  const invalid = d ? d.fees.find(f => !(finalOf(f) >= 0 && finalOf(f) <= Number(f.proposedAmount))) : null
  const finalTotal = d ? d.fees.reduce((s, f) => s + (Number.isFinite(finalOf(f)) ? finalOf(f) : 0), 0) : 0
  const remaining = Number(d?.depositRemaining || 0)
  const owed = Math.max(0, finalTotal - remaining)
  const refund = Math.max(0, remaining - finalTotal)

  const submit = async e => {
    e.preventDefault()
    if (invalid) { setError(`Khoản "${invalid.description}": số tiền chốt phải từ 0 đến ${money(invalid.proposedAmount)} (chỉ giữ nguyên hoặc giảm).`); return }
    if (notes.trim().length < 10) { setError('Vui lòng ghi nội dung quyết định gửi khách (ít nhất 10 ký tự).'); return }
    const ok = await dialog.confirm({
      tone: 'warning', title: 'Chốt quyết định khiếu nại?',
      message: `Phí chốt ${money(finalTotal)} (đề xuất ${money(d.proposedTotal)}).\n${owed > 0 ? `Khách cần đóng thêm ${money(owed)}.` : `Hoàn cọc cho khách ${money(refund)}.`}\nQuyết định là cuối cùng, hệ thống quyết toán tiền cọc ngay.`,
      confirmLabel: 'Chốt quyết định', cancelLabel: 'Xem lại'
    })
    if (!ok) return
    setBusy(true); setError('')
    try {
      const result = await apiPost(`/api/return-inspections/${inspectionId}/resolve`, {
        notes: notes.trim(),
        fees: d.fees.map(f => ({ feeId: f.feeId, finalAmount: finalOf(f) }))
      })
      onDone(result)
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  return (
    <div className="fm-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="fm-modal-card ri-resolve" role="dialog" aria-modal="true" aria-labelledby="ri-resolve-title">
        <div className="fm-modal-header">
          <h2 id="ri-resolve-title">{canResolve ? 'Giải quyết khiếu nại kiểm kho' : 'Kết quả kiểm kho'}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        {!d ? <p className="fm-muted">{detail.error || 'Đang tải...'}</p> : (
          <form onSubmit={submit} className="fm-modal-form">
            {error && <div className="auth-message error" role="alert">{error}</div>}
            <p>
              <strong>{d.customerName}</strong> · {d.customerPhone || d.customerEmail} · {d.contractNumber || d.reservationCode} · kho {d.units}
              <br /><span className="fm-muted">Kiểm tra bởi NV {d.inspectedBy} lúc {fmtDateTime(d.inspectedAt)} · {d.conditionResult === 'Damaged' ? 'có vấn đề' : 'không có vấn đề'} · {d.statusLabel}</span>
            </p>

            <div className="ri-compare">
              <section>
                <h4>Nhân viên ghi nhận</h4>
                {d.staffNotes ? <p className="ri-notes">“{d.staffNotes}”</p> : <p className="fm-muted">Không có ghi chú.</p>}
                <PhotoGallery images={d.staffImages} emptyText="Không có ảnh." />
              </section>
              <section>
                <h4>Khách khiếu nại {d.respondedAt ? <small>({fmtDateTime(d.respondedAt)})</small> : null}</h4>
                {d.disputeReason ? <p className="ri-notes">“{d.disputeReason}”</p> : <p className="fm-muted">Khách chưa khiếu nại.</p>}
                <PhotoGallery images={d.customerImages} emptyText="Khách không gửi ảnh." />
              </section>
            </div>

            <table className="ri-table">
              <thead><tr><th>Khoản phí</th><th>Đề xuất</th><th>Chốt (chỉ giữ / giảm)</th></tr></thead>
              <tbody>
                {d.fees.map(f => (
                  <tr key={f.feeId}>
                    <td>{f.description}</td>
                    <td>{money(f.proposedAmount)}</td>
                    <td>
                      {canResolve ? (
                        <div className="ri-final">
                          <input type="number" min="0" max={Number(f.proposedAmount)} step="1000" className="ri-input"
                            aria-label={`Số tiền chốt cho ${f.description}`}
                            value={finals[f.feeId] ?? ''} onChange={e => { setFinals(m => ({ ...m, [f.feeId]: e.target.value })); setError('') }} />
                          <button type="button" className="fp-btn" onClick={() => setFinals(m => ({ ...m, [f.feeId]: String(Math.round(Number(f.proposedAmount))) }))}>Giữ</button>
                          <button type="button" className="fp-btn" onClick={() => setFinals(m => ({ ...m, [f.feeId]: '0' }))}>Miễn</button>
                        </div>
                      ) : (f.finalAmount == null ? '—' : money(f.finalAmount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="ri-table ri-sum">
              <tbody>
                <tr><td>Tiền cọc còn lại (sau công nợ hợp đồng)</td><td>{money(remaining)}</td></tr>
                <tr><td>Phí {canResolve ? 'chốt' : 'đã chốt'}</td><td>− {money(canResolve ? finalTotal : d.finalTotal)}</td></tr>
              </tbody>
              <tfoot>
                {(canResolve ? owed : Number(d.expectedOwed)) > 0
                  ? <tr className="bad"><td>Khách cần đóng thêm</td><td>{money(canResolve ? owed : d.expectedOwed)}</td></tr>
                  : <tr className="good"><td>Hoàn cọc cho khách</td><td>{money(canResolve ? refund : d.expectedRefund)}</td></tr>}
              </tfoot>
            </table>

            {d.resolutionNotes && <p className="ri-quote decision"><b>Quyết định ({d.resolvedBy}, {fmtDateTime(d.resolvedAt)}):</b> {d.resolutionNotes}</p>}

            {canResolve && (
              <label>
                Nội dung quyết định gửi khách (bắt buộc, 10–1000 ký tự)
                <textarea rows={3} maxLength={1000} value={notes} onChange={e => { setNotes(e.target.value); setError('') }}
                  placeholder="Ví dụ: Đối chiếu biên bản bàn giao, vết trầy đã có từ trước nên miễn phí sửa tường; phí vệ sinh giữ nguyên." />
              </label>
            )}
            <div className="fm-modal-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Đóng</button>
              {canResolve && <button type="submit" className="dashboard-primary-btn" disabled={busy}>{busy ? 'Đang lưu...' : 'Chốt quyết định'}</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export function ManagerReturnInspectionsTab({ facilityId, showToast = () => {} }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState(null)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    if (facilityId == null) return
    try {
      setError('')
      const result = await apiGet(`/api/return-inspections/facilities/${facilityId}`)
      setData(result)
      setFilter(f => f ?? (result?.summary?.disputed > 0 ? INSPECTION.DISPUTED : 'all'))
    } catch (err) {
      setData({ items: [], summary: null })
      setError(missingTableMessage(err))
    }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const s = data?.summary
  const shown = !filter || filter === 'all' ? items : items.filter(i => i.status === filter)
  const pill = i => (i.status === INSPECTION.DISPUTED ? 'fm-badge fm-warn' : i.status === INSPECTION.AWAITING ? 'fm-badge fm-info' : 'fm-badge fm-ok')

  return (
    <div className="fm-section-card">
      <div className="fm-card-header-flex">
        <div>
          <h2>Xác nhận & khiếu nại kết quả kiểm kho</h2>
          <p>
            Kho có phí khi trả: nhân viên chụp ảnh, khách có {data?.confirmDays ?? 3} ngày để đồng ý hoặc khiếu nại trước khi trừ cọc
            (quá hạn hệ thống tự xác nhận). Khiếu nại do Facility Manager quyết định: chỉ giữ nguyên, giảm hoặc miễn, không tăng phí.
          </p>
        </div>
        <button type="button" className="dashboard-secondary-btn" onClick={load}>Tải lại</button>
      </div>

      {s && (
        <section className="customer-stats" style={{ marginBottom: 16 }}>
          <div className="customer-stat-card">
            <span className="stat-icon yellow">!</span>
            <small>Khiếu nại chờ xử lý</small>
            <strong>{s.disputed}</strong>
            <span className="stat-note warning">Cần Manager quyết định</span>
          </div>
          <div className="customer-stat-card">
            <span className="stat-icon blue">⏳</span>
            <small>Chờ khách xác nhận</small>
            <strong>{s.awaiting}</strong>
            <span className="stat-note">Phí đang giữ {fmtMoneyShort(s.heldAmount)}</span>
          </div>
          <div className="customer-stat-card">
            <span className="stat-icon">✓</span>
            <small>Đã quyết toán (90 ngày)</small>
            <strong>{s.settled}</strong>
            <span className="stat-note">Đã giảm sau khiếu nại {fmtMoneyShort(s.reducedAmount)}</span>
          </div>
        </section>
      )}

      <div className="fp-toolbar">
        <div className="fp-chips">
          {[[INSPECTION.DISPUTED, `Khiếu nại ${s?.disputed ?? 0}`], [INSPECTION.AWAITING, `Chờ khách ${s?.awaiting ?? 0}`], [INSPECTION.SETTLED, `Đã quyết toán ${s?.settled ?? 0}`], ['all', `Tất cả ${items.length}`]].map(([v, t]) => (
            <button key={v} type="button" className={(filter || 'all') === v ? 'active' : ''} onClick={() => setFilter(v)}>{t}</button>
          ))}
        </div>
      </div>
      {error && <div className="auth-message error" role="alert">{error}</div>}

      {data === null ? <p className="fm-muted">Đang tải...</p> : shown.length === 0 ? (
        <div className="empty-state">Không có kết quả kiểm kho nào trong mục này.</div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table">
            <thead>
              <tr><th>Khách hàng</th><th>Hợp đồng · kho</th><th>Kiểm tra</th><th>Phí kiểm kho</th><th>Trạng thái</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {shown.map(i => (
                <tr key={i.inspectionId}>
                  <td><strong>{i.customerName}</strong><div className="fm-muted">{i.customerPhone || i.customerEmail}</div></td>
                  <td>{i.contractNumber || i.reservationCode}<div className="fm-muted">{i.units}</div></td>
                  <td>
                    {i.conditionResult === 'Damaged' ? 'Có vấn đề' : 'Không vấn đề'} · NV {i.inspectedBy}
                    <div className="fm-muted">{fmtDateTime(i.inspectedAt)} · {i.staffImageCount} ảnh{i.customerImageCount ? ` · khách ${i.customerImageCount} ảnh` : ''}</div>
                  </td>
                  <td>
                    {i.fees.length === 0 ? <span className="fm-muted">Không có</span> : (
                      <>
                        <strong>{fmtMoneyShort(i.settledBy === 'Manager' ? i.finalTotal : i.proposedTotal)}</strong>
                        {i.settledBy === 'Manager' && Number(i.finalTotal) < Number(i.proposedTotal) && <div className="fm-muted">đề xuất {fmtMoneyShort(i.proposedTotal)}</div>}
                        <div className="fm-muted">{i.fees.map(f => f.description).join(', ')}</div>
                      </>
                    )}
                  </td>
                  <td>
                    <span className={pill(i)}>{i.statusLabel}</span>
                    {i.status === INSPECTION.AWAITING && <div className="fm-muted">Hạn {fmtDateTime(i.confirmDeadline)}</div>}
                    {i.disputeReason && <div className="fm-muted ri-clamp">“{i.disputeReason}”</div>}
                  </td>
                  <td>
                    <button type="button" className="fp-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => setOpenId(i.inspectionId)}>
                      {i.status === INSPECTION.DISPUTED ? 'Giải quyết' : 'Xem ảnh & chi tiết'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && (
        <ResolveModal inspectionId={openId} onClose={() => setOpenId(null)} onDone={async result => {
          setOpenId(null)
          showToast(result.message)
          await load()
        }} />
      )}
    </div>
  )
}

const fmtMoneyShort = n => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)))}đ`
