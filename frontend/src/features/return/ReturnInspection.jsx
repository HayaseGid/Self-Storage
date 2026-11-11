/**
 * ======================================================================
 * FILE: src/features/return/ReturnInspection.jsx  —  KIỂM KHO KHI TRẢ: ẢNH + KHÁCH XÁC NHẬN / KHIẾU NẠI TRƯỚC KHI TRỪ CỌC
 * Backend: ReturnInspectionsController (/api/return-inspections/...); Staff gửi ảnh qua /api/unit-returns/staff/{id}/complete.
 * Dùng chung cho 3 vai trò:
 * - Staff:   PhotoPicker trong form kiểm tra + StaffInspectionStatus ở thẻ "Đã xong" (useStaffInspections).
 * - Khách:   CustomerInspectionBox trong khối "Trả kho": xem ảnh, Đồng ý (accept) / Khiếu nại (dispute).
 * - Manager: ManagerReturnInspectionsTab: duyệt kết quả của Staff (approve) và giải quyết khiếu nại (resolve):
 *            giữ / giảm / miễn từng khoản phí, ghi quyết định gửi khách.
 * Trạng thái (INSPECTION): Pending Manager -> Awaiting Customer -> (Disputed) -> Settled.
 * API dùng trong file:
 *   GET  /api/return-inspections/mine | staff | facilities/{facilityId} | {inspectionId}
 *   POST /api/return-inspections/{id}/accept | dispute | approve | resolve
 * Dùng ở: UnitReturn, StaffReturns, CustomerAccount, FacilityManagerAccount, HeaderNotificationBell.
 * ======================================================================
 */
import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from '../../components/common/listKit' // [THÊM] chia trang + mã nổi bật
import { apiGet, apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import { formatVnd } from '../../services/storageRules'
import './ReturnInspection.css'

/*
 * GÓP Ý 14 - KIỂM KHO KHI TRẢ: ẢNH + KHÁCH XÁC NHẬN / KHIẾU NẠI TRƯỚC KHI TRỪ CỌC (file THÊM MỚI).
 * Backend: ReturnInspectionsController (/api/return-inspections/...), Staff gửi ảnh ở /api/unit-returns/staff/{id}/complete.
 *   - Staff:   PhotoPicker trong form "Nhập kết quả kiểm tra" + StaffInspectionStatus ở thẻ "Đã xong".
 *   - Khách:   CustomerInspectionBox trong khối "Trả kho" (trang Hợp đồng): xem ảnh, Đồng ý / Khiếu nại.
 *   - Manager: ManagerReturnInspectionsTab: xem ảnh 2 bên, giữ / giảm / miễn từng khoản, ghi quyết định.
 */

export const INSPECTION = { PENDING_MANAGER: 'Pending Manager', AWAITING: 'Awaiting Customer', DISPUTED: 'Disputed', SETTLED: 'Settled' }
export const MAX_STAFF_PHOTOS = 5
export const MAX_CUSTOMER_PHOTOS = 3

/**
 * Định dạng tiền làm tròn kèm "đ".
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/**
 * Định dạng thời điểm ISO thành "HH:mm dd/MM/yyyy" (không hợp lệ -> "—").
 */
const fmtDateTime = iso => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
/**
 * Mô tả thời gian còn lại tới hạn xác nhận ("còn 2 ngày 3 giờ", "còn 5 giờ", "đã quá hạn").
 */
const timeLeft = iso => {
  const ms = Date.parse(iso) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'đã quá hạn'
  const hours = Math.ceil(ms / 3600000)
  return hours >= 24 ? `còn ${Math.floor(hours / 24)} ngày ${hours % 24} giờ` : `còn ${hours} giờ`
}
/**
 * Câu lỗi khi tải dữ liệu kiểm kho: 404 -> báo backend chưa có ReturnInspectionsController, còn lại lấy message lỗi.
 */
const missingTableMessage = error => (error?.status === 404
  ? 'Backend chưa có ReturnInspectionsController (chép file rồi chạy lại backend).'
  : error?.message || 'Không tải được kết quả kiểm kho.')

/**
 * Tách và làm sạch ghi chú trả kho:
 * - customerNote: ghi chú của khách khi hẹn trả kho
 * - staffNote: ghi chú quan sát hiện trạng của nhân viên khi kiểm kho
 * - feeText: thông tin phí đề xuất
 */
/**
 * Tách ghi chú trả kho (chuỗi gộp do backend lưu) thành: customerNote (ghi chú của khách khi hẹn),
 * staffNote (nhận xét hiện trạng của nhân viên), feeText (thông tin phí đề xuất).
 * @returns {{customerNote:string, staffNote:string, feeText:string}}
 */
export function parseReturnNotes(notes) {
  if (!notes || typeof notes !== 'string') return { customerNote: '', staffNote: '', feeText: '' }
  const raw = notes.trim()
  let customerNote = ''
  let staffNote = ''
  let feeText = ''

  const custMatch = raw.match(/Khách ghi chú:\s*([^\n]+)/i)
  if (custMatch) {
    customerNote = custMatch[1].trim()
  }

  if (raw.includes('Kết quả kiểm tra:')) {
    const feeMatch = raw.match(/(Phí đề xuất[^.\n]*\.|Phí:[^.\n]*\.|Không phát sinh phí\.)/i)
    if (feeMatch) {
      feeText = feeMatch[1].trim()
    }

    const staffMatch = raw.match(/Kết quả kiểm tra:\s*(?:Có vấn đề|Không có vấn đề)\.?\s*(.*?)(?:Phí đề xuất|Phí:|Không phát sinh phí|$)/is)
    if (staffMatch && staffMatch[1]) {
      const candidate = staffMatch[1].replace(/Ghi chú hiện trạng:\s*/i, '').trim().replace(/\.+$/, '')
      if (candidate) staffNote = candidate
    }
  } else if (!custMatch) {
    customerNote = raw
  }

  return { customerNote, staffNote, feeText }
}

/* ------------------------------------------------------------------ Ảnh */

/* Nén ảnh trước khi gửi: cạnh dài tối đa 1280px, JPEG 0.7 (giống báo cáo sự cố kho của Staff) */
/**
 * Nén ảnh trước khi gửi: cạnh dài tối đa 1280px, JPEG chất lượng 0.7, trả về data URL.
 * @param {File} file file ảnh người dùng chọn.
 * @returns {Promise<string>}
 */
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

/**
 * Component chọn ảnh (tối đa `max` ảnh): nén ảnh, xem trước, xóa từng ảnh.
 * @param {object} props images (mảng data URL), onChange(images), max, required, label, hint, disabled.
 */
export function PhotoPicker({ images, onChange, max = MAX_STAFF_PHOTOS, required = false, label = 'Ảnh hiện trạng kho', hint, disabled }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Thêm các file ảnh vừa chọn (cắt theo số ảnh còn được thêm), nén rồi báo onChange.
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

/**
 * Component lưới ảnh có xem phóng to (lightbox, vẽ bằng portal ra body); phím ←/→ để chuyển ảnh, Esc để đóng.
 * @param {object} props images, emptyText.
 */
export function PhotoGallery({ images = [], emptyText = 'Không có ảnh.' }) {
  const [open, setOpen] = useState(null)
  useEffect(() => {
    if (open === null) return undefined
    // Phím tắt khi đang xem ảnh lớn: Esc đóng, mũi tên trái/phải chuyển ảnh.
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
/**
 * Hook: tải chi tiết 1 kết quả kiểm kho (kèm ảnh — danh sách không trả ảnh cho nhẹ), chỉ tải khi enabled.
 * API: GET /api/return-inspections/{inspectionId}
 * @returns {{loading, error, data, reload}}
 */
export function useInspectionDetail(inspectionId, enabled = true) {
  const [state, setState] = useState({ loading: false, error: '', data: null })
  // Gọi API lấy chi tiết kết quả kiểm kho và cập nhật state.
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

/**
 * Component nút "Xem ảnh kiểm kho": bấm mới tải chi tiết và hiện ảnh của nhân viên (và của khách nếu có).
 * @param {object} props inspection, showCustomer (có hiện ảnh khách gửi khi khiếu nại không).
 */
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

/**
 * Component bảng các khoản phí kiểm kho: mô tả, số đề xuất, (tuỳ chọn) số chốt cuối.
 */
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

/**
 * Hook (KHÁCH): tải các kết quả kiểm kho của khách; lần tải này backend cũng tự xác nhận các kết quả quá hạn.
 * API: GET /api/return-inspections/mine  -> { items, confirmDays, autoSettled }
 * @returns {{loading, error, data, items, confirmDays, autoSettled, byReservation, reload}}
 */
export function useMyInspections() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  // Gọi lại API GET /api/return-inspections/mine và cập nhật state.
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
    // Tìm kết quả kiểm kho của 1 hợp đồng theo reservationId.
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

/**
 * Component hộp thoại khiếu nại kết quả kiểm kho (vẽ bằng portal ra body): lý do (>= 10 ký tự) + ảnh bằng chứng.
 * @param {object} props inspection, onClose, onDone(result).
 */
function DisputeModal({ inspection, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại (khi không đang gửi).
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])
  /**
   * Gửi khiếu nại.
   * API: POST /api/return-inspections/{inspectionId}/dispute  body { reason, images }
   */
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
          <h3 id="ri-dispute-title">Đơn khiếu nại kết quả kiểm kho</h3>
          <button type="button" className="ri-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>

        {/* Thông tin quan trọng về kho thuê của khách hàng */}
        <div className="ri-dispute-card">
          <div className="ri-dic-head">
            <span className="ri-dic-tag">Thông tin kho thuê</span>
            <span className="ri-dic-contract">Hợp đồng: <b>{inspection.contractNumber || inspection.reservationCode}</b></span>
          </div>
          <div className="ri-dic-grid">
            <div className="ri-dic-item">
              <small>Phòng kho</small>
              <strong>{inspection.units || '—'}</strong>
            </div>
            <div className="ri-dic-item">
              <small>Cơ sở</small>
              <span>{inspection.facilityName || 'StoreSpace'}</span>
            </div>
            {inspection.unitDetails && (
              <div className="ri-dic-item ri-dic-full">
                <small>Chi tiết diện tích / loại kho</small>
                <span>{inspection.unitDetails}</span>
              </div>
            )}
            <div className="ri-dic-item">
              <small>Tiền cọc đã đóng</small>
              <span>{money(inspection.depositPaid || inspection.depositTotal || inspection.depositRemaining)}</span>
            </div>
            <div className="ri-dic-item">
              <small>Phí kiểm kho duyệt</small>
              <strong style={{ color: '#c4373c' }}>{money(inspection.finalTotal || inspection.proposedTotal)}</strong>
            </div>
          </div>
          {inspection.fees && inspection.fees.length > 0 && (
            <div className="ri-dic-fees">
              <small>Khoản phí cần xác minh lại:</small>
              <div>{inspection.fees.map(f => `${f.description} (${money(f.finalAmount ?? f.proposedAmount)})`).join(' · ')}</div>
            </div>
          )}
          {inspection.staffNotes && (
            <div className="ri-dic-notes">
              <small>Ghi chú hiện trạng của nhân viên:</small>
              <p>“{inspection.staffNotes}”</p>
            </div>
          )}
        </div>

        <p className="ri-hint">
          ℹ️ Đơn khiếu nại kèm thông tin chi tiết này sẽ được chuyển trực tiếp về cho <b>Facility Manager (Quản lý cơ sở)</b> để kiểm tra và xác nhận lại.
          Facility Manager sẽ đối chiếu ảnh của nhân viên với lý do và ảnh bằng chứng của bạn rồi đưa ra quyết định cuối cùng. Tiền cọc chưa bị trừ trong lúc chờ giải quyết.
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
          <button type="submit" className="dashboard-primary-btn" disabled={busy || reason.trim().length < 10}>{busy ? 'Đang gửi...' : 'Gửi khiếu nại đến Facility Manager'}</button>
        </div>
      </form>
    </div>,
    document.body
  )
}

/**
 * Component khối "Quản lý đã duyệt": người duyệt, email, SĐT, thời điểm và nội dung quyết định.
 */
function ManagerApprovalBadge({ resolvedBy, resolvedByEmail, resolvedByPhone, resolvedAt, resolutionNotes }) {
  if (!resolvedBy && !resolutionNotes) return null
  return (
    <div className="ri-quote decision ri-manager-decision-card" style={{ marginTop: '12px', background: '#f8fafc', borderLeft: '4px solid #0877cf', padding: '12px 16px', borderRadius: '6px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginBottom: '6px' }}>
        <span style={{ fontWeight: 700, color: '#073d70', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>🛡️</span> Quản lý cơ sở phê duyệt: {resolvedBy || 'Facility Manager'}
        </span>
        {resolvedAt && <span style={{ fontSize: '12px', color: '#64748b' }}>({fmtDateTime(resolvedAt)})</span>}
      </div>
      {(resolvedByEmail || resolvedByPhone) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px', color: '#475569', margin: '4px 0 8px 0' }}>
          {resolvedByEmail && <span>✉️ Email: <strong style={{ color: '#1e293b' }}>{resolvedByEmail}</strong></span>}
          {resolvedByPhone && <span>📞 SĐT: <strong style={{ color: '#1e293b' }}>{resolvedByPhone}</strong></span>}
        </div>
      )}
      {resolutionNotes && (
        <div style={{ paddingTop: (resolvedByEmail || resolvedByPhone) ? '8px' : 0, borderTop: (resolvedByEmail || resolvedByPhone) ? '1px dashed #cbd5e1' : 'none' }}>
          <b style={{ color: '#334155' }}>Nội dung quyết định / Ghi chú:</b>
          <p style={{ margin: '4px 0 0', color: '#1e293b' }}>{resolutionNotes}</p>
        </div>
      )}
    </div>
  )
}

/*
 * Hộp kết quả kiểm kho trong thẻ "Trả kho" của khách.
 *   depositTotal / debtDeducted: lấy từ /api/unit-returns/mine (request.depositTotal, request.deductedFromDeposit).
 * Chặn click lan ra ngoài vì thẻ trả kho bấm vào là mở hợp đồng.
 */
/**
 * Component hộp kết quả kiểm kho trong thẻ "Trả kho" của KHÁCH: trạng thái, bảng phí, ảnh, số trừ cọc /
 * hoàn cọc / còn nợ, nút Đồng ý hoặc Khiếu nại (chặn click lan ra thẻ cha).
 * @param {object} props inspection, depositTotal, debtDeducted (lấy từ /api/unit-returns/mine), onChanged().
 */
export function CustomerInspectionBox({ inspection, depositTotal, debtDeducted = 0, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const i = inspection
  if (!i) return null
  const settled = i.status === INSPECTION.SETTLED
  const isPendingManager = i.status === INSPECTION.PENDING_MANAGER
  const isAwaiting = i.status === INSPECTION.AWAITING
  const isDisputed = i.status === INSPECTION.DISPUTED
  const tone = isDisputed ? 'bad' : isPendingManager ? 'info' : isAwaiting ? 'warn' : 'ok'
  const isDamaged = i.conditionResult === 'Damaged'

  /**
   * Khách đồng ý kết quả kiểm kho (hỏi xác nhận, sau đó không khiếu nại được nữa) -> quyết toán trừ cọc.
   * API: POST /api/return-inspections/{inspectionId}/accept
   */
  const accept = async () => {
    const feeAmount = i.finalTotal || i.proposedTotal
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Đồng ý kết quả kiểm kho?',
      message: `Phí kiểm kho ${money(feeAmount)} sẽ trừ vào tiền cọc còn lại ${money(i.depositRemaining)}.\n` +
        (Number(i.expectedOwed) > 0 ? `Bạn cần đóng thêm ${money(i.expectedOwed)}.` : `Bạn được hoàn ${money(i.expectedRefund)}.`) +
        '\nSau khi đồng ý sẽ không khiếu nại được nữa.',
      confirmLabel: 'Đồng ý & quyết toán',
      cancelLabel: 'Xem lại'
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

  return (
    <div className={`ri-box ${tone}`}
      onClick={e => e.stopPropagation()}>{/* chỉ chặn click (thẻ trả kho bấm vào là mở hợp đồng); không chặn phím để Esc / mũi tên vẫn chạy */}
      <div className="ri-box-head">
        <div>
          <strong>
            {isPendingManager && 'Đã hoàn tất kiểm tra kho · Đang chờ Facility Manager phê duyệt'}
            {isAwaiting && 'Kết quả kiểm kho đã được Quản lý duyệt · Chờ bạn xác nhận'}
            {isDisputed && 'Bạn đã gửi khiếu nại · Facility Manager đang xem xét lại'}
            {settled && (i.settledBy === 'Manager' ? 'Manager đã duyệt & giải quyết khiếu nại' : i.settledBy === 'Auto' ? 'Hệ thống đã tự xác nhận (quá hạn)' : 'Bạn đã đồng ý kết quả kiểm kho')}
          </strong>
          <div className="ri-subhead">
            <small>Kiểm tra bởi NV {i.inspectedBy} lúc {fmtDateTime(i.inspectedAt)}</small>
            <span className={`ri-condition-chip ${isDamaged ? 'bad' : 'ok'}`}>
              {isDamaged ? '⚠️ Kho có vấn đề' : '✓ Kho tốt / Không có vấn đề'}
            </span>
          </div>
        </div>
        {isAwaiting && <span className="ri-deadline">Hạn {fmtDateTime(i.confirmDeadline)} · {timeLeft(i.confirmDeadline)}</span>}
      </div>

      {isPendingManager && (
        <div className="st-alert st-info" style={{ margin: '4px 0 0' }}>
          Nhân viên cơ sở đã hoàn thành việc kiểm tra kho. Đơn kiểm kho đang được chuyển qua <b>Facility Manager (Quản lý cơ sở)</b> để xem xét hình ảnh và duyệt các khoản phí. Sau khi Quản lý duyệt, bạn sẽ nhận được thông báo để xác nhận hoặc khiếu nại nếu có nhầm lẫn.
        </div>
      )}

      {i.staffNotes && (
        <div className="ri-staff-notes-box">
          <span className="ri-notes-label">Ghi chú hiện trạng của nhân viên:</span>
          <p className="ri-notes-text">“{i.staffNotes}”</p>
        </div>
      )}
      <InspectionPhotos inspection={i} />
      {i.fees && i.fees.length > 0 && (
        <div className="ri-fees-section">
          <div className="ri-section-title">
            {isPendingManager ? 'Các khoản phí nhân viên đề xuất (chờ Quản lý duyệt):' : 'Chi tiết các khoản phí kiểm kho:'}
          </div>
          <FeeTable inspection={i} showFinal={i.settledBy === 'Manager' || isAwaiting} />
        </div>
      )}

      {/* Đã quyết toán: bảng quyết toán thật nằm ngay trên (khối Trả kho), ở đây chỉ còn ảnh + quyết định */}
      {!settled && !isPendingManager && <table className="ri-table ri-sum">
        <tbody>
          {(depositTotal != null || i.depositPaid != null) && <tr><td>Tiền cọc đã đóng</td><td>{money(depositTotal ?? i.depositPaid)}</td></tr>}
          {Number(debtDeducted) > 0 && <tr><td>Đã trừ công nợ hợp đồng (tiền thuê, phí trễ hạn)</td><td>− {money(debtDeducted)}</td></tr>}
          <tr><td>Tiền cọc còn lại để quyết toán</td><td>{money(i.depositRemaining)}</td></tr>
          <tr><td>{settled ? 'Phí kiểm kho đã chốt' : 'Phí kiểm kho Quản lý đã duyệt'}</td><td>− {money(i.finalTotal || i.proposedTotal)}</td></tr>
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
      <ManagerApprovalBadge
        resolvedBy={i.resolvedBy}
        resolvedByEmail={i.resolvedByEmail}
        resolvedByPhone={i.resolvedByPhone}
        resolvedAt={i.resolvedAt}
        resolutionNotes={i.resolutionNotes}
      />

      {isAwaiting && (
        <>
          <p className="ri-hint">
            Tiền cọc <b>chưa bị trừ</b>. Hãy kiểm tra ảnh và các khoản phí do Quản lý cơ sở đã duyệt.
            Nếu đồng ý, bấm <b>Đồng ý & quyết toán</b>. Nếu thấy có vấn đề nhầm lẫn, hãy bấm <b>Khiếu nại</b> để chuyển lại cho Quản lý kiểm tra.
            Quá hạn mà bạn không phản hồi, hệ thống sẽ tự xác nhận theo số tiền trên.
          </p>
          <div className="ri-actions">
            {i.canRespond && <button type="button" className="dashboard-secondary-btn" disabled={busy} onClick={() => setDisputing(true)}>Khiếu nại</button>}
            <button type="button" className="dashboard-primary-btn" disabled={busy} onClick={accept}>{busy ? 'Đang xử lý...' : 'Đồng ý & quyết toán'}</button>
          </div>
        </>
      )}
      {isDisputed && <p className="ri-hint">Đơn khiếu nại của bạn kèm thông tin kho và ảnh đã được gửi lại cho Facility Manager kiểm tra và xác nhận lại. Tiền cọc chưa bị trừ cho tới khi Manager quyết định.</p>}

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

/**
 * Hook (STAFF): tải các kết quả kiểm kho do nhân viên lập.
 * API: GET /api/return-inspections/staff  -> { items, confirmDays }
 * @returns {{loading, error, data, items, confirmDays, byReservation, reload}}
 */
export function useStaffInspections() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  // Gọi lại API GET /api/return-inspections/staff và cập nhật state.
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
    // Tìm kết quả kiểm kho của 1 hợp đồng theo reservationId.
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

/* Trạng thái xác nhận ở thẻ "Đã xong" của Staff. */
/**
 * Component trạng thái xác nhận ở thẻ "Đã xong" của Staff (chờ Quản lý duyệt / chờ khách / khiếu nại / đã quyết toán).
 * @param {object} props inspection, fallbackNote (ghi chú hiện trạng khi chưa có bản ghi kiểm kho).
 */
export function StaffInspectionStatus({ inspection, fallbackNote }) {
  const i = inspection
  if (!i) {
    if (!fallbackNote) return null
    return (
      <div className="ri-staff ok">
        <div className="ri-staff-head">
          <span className="ri-pill ok">Đã hoàn tất kiểm tra</span>
        </div>
        <div className="ri-staff-notes-box">
          <span className="ri-notes-label">Ghi chú hiện trạng:</span>
          <p className="ri-notes-text">“{fallbackNote}”</p>
        </div>
      </div>
    )
  }
  const isPendingManager = i.status === INSPECTION.PENDING_MANAGER
  const isDisputed = i.status === INSPECTION.DISPUTED
  const isAwaiting = i.status === INSPECTION.AWAITING
  const tone = isDisputed ? 'bad' : isPendingManager ? 'info' : isAwaiting ? 'warn' : 'ok'
  const isDamaged = i.conditionResult === 'Damaged'

  return (
    <div className={`ri-staff ${tone}`}>
      <div className="ri-staff-head">
        <div className="ri-staff-head-left">
          <span className={`ri-pill ${tone}`}>{i.statusLabel}</span>
          <span className={`ri-condition-chip ${isDamaged ? 'bad' : 'ok'}`}>
            {isDamaged ? '⚠️ Có vấn đề' : '✓ Kho bình thường'}
          </span>
        </div>
        {isPendingManager && (
          <small className="ri-staff-settled-time">Đang chờ Manager duyệt</small>
        )}
        {isAwaiting && (
          <span className="ri-deadline">
            Hạn khách xác nhận {fmtDateTime(i.confirmDeadline)} · {timeLeft(i.confirmDeadline)}
          </span>
        )}
        {i.status === INSPECTION.SETTLED && i.settledAt && i.settledBy !== 'NoFee' && (
          <small className="ri-staff-settled-time">Quyết toán {fmtDateTime(i.settledAt)}</small>
        )}
      </div>

      {isPendingManager && (
        <p className="ri-hint" style={{ fontStyle: 'italic', margin: '4px 0' }}>
          Đã hoàn tất kiểm tra kho. Đơn đang được Facility Manager xem xét hình ảnh và phê duyệt phí trước khi chuyển về cho khách hàng.
        </p>
      )}

      {/* Ghi chú hiện trạng của nhân viên */}
      {i.staffNotes && (
        <div className="ri-staff-notes-box">
          <span className="ri-notes-label">Ghi chú hiện trạng của nhân viên:</span>
          <p className="ri-notes-text">“{i.staffNotes}”</p>
        </div>
      )}

      {/* Chi tiết phí kiểm kho */}
      {i.fees && i.fees.length > 0 && (
        <div className="ri-fees-section">
          <div className="ri-section-title">
            Chi tiết phí kiểm kho ({isPendingManager ? 'Nhân viên đề xuất' : isAwaiting ? 'Quản lý đã duyệt' : 'Đã chốt'}):
          </div>
          <FeeTable inspection={i} showFinal={i.settledBy === 'Manager' || isAwaiting} />
        </div>
      )}

      {i.disputeReason && (
        <div className="ri-quote">
          <b>Khách khiếu nại{i.respondedAt ? ` (${fmtDateTime(i.respondedAt)})` : ''}:</b>
          <p style={{ margin: '4px 0 0' }}>{i.disputeReason}</p>
        </div>
      )}
      <ManagerApprovalBadge
        resolvedBy={i.resolvedBy}
        resolvedByEmail={i.resolvedByEmail}
        resolvedByPhone={i.resolvedByPhone}
        resolvedAt={i.resolvedAt}
        resolutionNotes={i.resolutionNotes}
      />
      <InspectionPhotos inspection={i} />
    </div>
  )
}

/* ------------------------------------------------------------------ FACILITY MANAGER */

/**
 * Component hộp thoại của MANAGER: duyệt kết quả Staff gửi (Pending Manager) hoặc giải quyết khiếu nại (Disputed);
 * cho chỉnh số tiền chốt từng khoản (0..số đề xuất), ghi quyết định, xem ảnh hai bên.
 * @param {object} props inspectionId, onClose, onDone(result).
 */
function ResolveModal({ inspectionId, onClose, onDone }) {
  const dialog = useDialog()
  const detail = useInspectionDetail(inspectionId)
  const [finals, setFinals] = useState({})
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const d = detail.data
  const isPendingManager = d?.status === INSPECTION.PENDING_MANAGER
  const isDisputed = d?.status === INSPECTION.DISPUTED
  const canAct = isPendingManager || isDisputed

  useEffect(() => {
    if (!d) return
    setFinals(Object.fromEntries(d.fees.map(f => [f.feeId, String(Math.round(Number(f.finalAmount ?? f.proposedAmount)))])))
  }, [d])
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại (khi không đang gửi).
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Đọc số tiền chốt Manager nhập cho 1 khoản phí (không phải số -> NaN).
  const finalOf = f => {
    const n = Number(finals[f.feeId])
    return Number.isFinite(n) ? n : NaN
  }
  const invalid = d ? d.fees.find(f => !(finalOf(f) >= 0 && finalOf(f) <= Number(f.proposedAmount))) : null
  const finalTotal = d ? d.fees.reduce((s, f) => s + (Number.isFinite(finalOf(f)) ? finalOf(f) : 0), 0) : 0
  const remaining = Number(d?.depositRemaining || 0)
  const owed = Math.max(0, finalTotal - remaining)
  const refund = Math.max(0, remaining - finalTotal)

  /**
   * Gửi quyết định của Manager (kiểm tra số chốt hợp lệ, hỏi xác nhận):
   * - Đang chờ duyệt: POST /api/return-inspections/{id}/approve  body { notes, fees:[{feeId, finalAmount}] }
   * - Đang khiếu nại: POST /api/return-inspections/{id}/resolve  body { notes (>= 10 ký tự), fees }
   */
  const submit = async e => {
    e.preventDefault()
    if (invalid) { setError(`Khoản "${invalid.description}": số tiền chốt phải từ 0 đến ${money(invalid.proposedAmount)} (chỉ giữ nguyên hoặc giảm).`); return }
    
    if (isPendingManager) {
      const ok = await dialog.confirm({
        tone: 'info',
        title: 'Phê duyệt kết quả kiểm kho?',
        message: `Tổng phí duyệt: ${money(finalTotal)} (nhân viên đề xuất: ${money(d.proposedTotal)}).\n` +
          (finalTotal === 0
            ? `Vì không có phí bồi thường, hệ thống sẽ tự động hoàn cọc ${money(remaining)} và hoàn tất hợp đồng.`
            : `Hệ thống sẽ chuyển thông tin duyệt về cho khách hàng để kiểm tra & quyết toán (hoàn cọc ${money(refund)}${owed > 0 ? `, khách đóng thêm ${money(owed)}` : ''}).`),
        confirmLabel: 'Xác nhận duyệt',
        cancelLabel: 'Xem lại'
      })
      if (!ok) return
      setBusy(true); setError('')
      try {
        const result = await apiPost(`/api/return-inspections/${inspectionId}/approve`, {
          notes: notes.trim() || null,
          fees: d.fees.map(f => ({ feeId: f.feeId, finalAmount: finalOf(f) }))
        })
        onDone(result)
      } catch (err) {
        setError(err.message); setBusy(false)
      }
      return
    }

    if (isDisputed) {
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
  }

  return (
    <div className="fm-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="fm-modal-card ri-resolve" role="dialog" aria-modal="true" aria-labelledby="ri-resolve-title">
        <div className="fm-modal-header">
          <h2 id="ri-resolve-title">
            {isPendingManager ? 'Duyệt kết quả kiểm kho (từ Staff)' : isDisputed ? 'Giải quyết khiếu nại kiểm kho' : 'Chi tiết kiểm kho'}
          </h2>
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
                {d.disputeReason ? <p className="ri-notes">“{d.disputeReason}”</p> : <p className="fm-muted">{isPendingManager ? 'Chưa gửi khách (đang chờ duyệt)' : 'Khách chưa khiếu nại.'}</p>}
                <PhotoGallery images={d.customerImages} emptyText={isPendingManager ? 'Đang ở bước duyệt trước khi gửi khách.' : 'Khách không gửi ảnh.'} />
              </section>
            </div>

            <table className="ri-table">
              <thead><tr><th>Khoản phí</th><th>NV đề xuất</th><th>{canAct ? 'Số tiền chốt (giữ / giảm)' : 'Đã chốt'}</th></tr></thead>
              <tbody>
                {d.fees.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: '#64748b', padding: '12px' }}>Không có phí bồi thường hư hại nào.</td></tr>
                ) : (
                  d.fees.map(f => (
                    <tr key={f.feeId}>
                      <td>{f.description}</td>
                      <td>{money(f.proposedAmount)}</td>
                      <td>
                        {canAct ? (
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
                  ))
                )}
              </tbody>
            </table>

            <table className="ri-table ri-sum">
              <tbody>
                <tr><td>Tiền cọc ban đầu / còn lại</td><td>{money(remaining)}</td></tr>
                <tr><td>Phí {canAct ? 'chốt duyệt' : 'đã chốt'}</td><td>− {money(canAct ? finalTotal : d.finalTotal)}</td></tr>
              </tbody>
              <tfoot>
                {(canAct ? owed : Number(d.expectedOwed)) > 0
                  ? <tr className="bad"><td>Khách cần đóng thêm</td><td>{money(canAct ? owed : d.expectedOwed)}</td></tr>
                  : <tr className="good"><td>Hoàn cọc cho khách</td><td>{money(canAct ? refund : d.expectedRefund)}</td></tr>}
              </tfoot>
            </table>

            <ManagerApprovalBadge
              resolvedBy={d.resolvedBy}
              resolvedByEmail={d.resolvedByEmail}
              resolvedByPhone={d.resolvedByPhone}
              resolvedAt={d.resolvedAt}
              resolutionNotes={d.resolutionNotes}
            />

            {canAct && (
              <label>
                {isPendingManager ? 'Ghi chú duyệt gửi khách (tùy chọn)' : 'Nội dung quyết định khiếu nại gửi khách (bắt buộc, 10–1000 ký tự)'}
                <textarea rows={3} maxLength={1000} value={notes} onChange={e => { setNotes(e.target.value); setError('') }}
                  placeholder={isPendingManager ? 'Ghi chú phê duyệt (nếu có điều chỉnh hoặc lưu ý cho khách)...' : 'Ví dụ: Đối chiếu biên bản bàn giao, vết trầy đã có từ trước nên miễn phí sửa tường; phí vệ sinh giữ nguyên.'} />
              </label>
            )}
            <div className="fm-modal-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Đóng</button>
              {canAct && (
                <button type="submit" className="dashboard-primary-btn" disabled={busy}>
                  {busy ? 'Đang xử lý...' : isPendingManager ? 'Phê duyệt & chuyển về khách' : 'Chốt quyết định'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/**
 * Component tab "Xác nhận & khiếu nại kết quả kiểm kho" của Facility Manager: số liệu tóm tắt, lọc theo trạng thái,
 * danh sách phân trang, mở ResolveModal để xử lý.
 * @param {object} props facilityId, showToast(message).
 */
export function ManagerReturnInspectionsTab({ facilityId, showToast = () => {} }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState(null)
  const [openId, setOpenId] = useState(null)

  /**
   * Tải danh sách kết quả kiểm kho của cơ sở; lần đầu tự chọn bộ lọc ưu tiên (chờ duyệt -> khiếu nại -> tất cả).
   * API: GET /api/return-inspections/facilities/{facilityId}  -> { items, summary }
   */
  const load = useCallback(async () => {
    if (facilityId == null) return
    try {
      setError('')
      const result = await apiGet(`/api/return-inspections/facilities/${facilityId}`)
      setData(result)
      setFilter(f => f ?? (result?.summary?.pendingManager > 0 ? INSPECTION.PENDING_MANAGER : result?.summary?.disputed > 0 ? INSPECTION.DISPUTED : 'all'))
    } catch (err) {
      setData({ items: [], summary: null })
      setError(missingTableMessage(err))
    }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const s = data?.summary
  const shown = !filter || filter === 'all' ? items : items.filter(i => i.status === filter)
  const paging = useClientPaging(shown, { pageSize: 15, resetKey: filter })
  // Chọn class màu cho nhãn trạng thái của 1 kết quả kiểm kho.
  const pill = i => {
    if (i.status === INSPECTION.PENDING_MANAGER) return 'fm-badge fm-warn'
    if (i.status === INSPECTION.DISPUTED) return 'fm-badge fm-bad'
    if (i.status === INSPECTION.AWAITING) return 'fm-badge fm-info'
    return 'fm-badge fm-ok'
  }

  return (
    <div className="fm-section-card">
      <div className="fm-card-header-flex">
        <div>
          <h2>Xác nhận & khiếu nại kết quả kiểm kho</h2>
          <p>
            Quy trình trả kho: Khách gửi yêu cầu → Staff kiểm tra thực tế & gửi duyệt → Facility Manager xem xét & duyệt phí → Khách thanh toán / quyết toán cọc.
            Nếu khách khiếu nại, Manager đối chiếu thông tin kho và ảnh để đưa ra quyết định cuối cùng.
          </p>
        </div>
        <button type="button" className="dashboard-secondary-btn" onClick={load}>Tải lại</button>
      </div>

      {s && (
        <section className="customer-stats" style={{ marginBottom: 16 }}>
          <div className="customer-stat-card">
            <span className="stat-icon yellow">📋</span>
            <small>Chờ Manager duyệt</small>
            <strong>{s.pendingManager ?? 0}</strong>
            <span className="stat-note warning">Staff đã kiểm tra xong</span>
          </div>
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
          {[
            [INSPECTION.PENDING_MANAGER, `Chờ duyệt ${s?.pendingManager ?? 0}`],
            [INSPECTION.DISPUTED, `Khiếu nại ${s?.disputed ?? 0}`],
            [INSPECTION.AWAITING, `Chờ khách ${s?.awaiting ?? 0}`],
            [INSPECTION.SETTLED, `Đã quyết toán ${s?.settled ?? 0}`],
            ['all', `Tất cả ${items.length}`]
          ].map(([v, t]) => (
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
              {paging.pageRows.map(i => (
                <tr key={i.inspectionId} className={rowClass(i.inspectedAt)}>
                  <td><strong>{i.customerName}</strong> <NewBadge createdAt={i.inspectedAt} /><div className="fm-muted">{i.customerPhone || i.customerEmail}</div></td>
                  <td><Code kind={i.contractNumber ? 'contract' : 'order'}>{i.contractNumber || i.reservationCode}</Code><div style={{ marginTop: 4 }}><UnitCodes units={i.units} max={4} /></div></td>
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
                      {i.status === INSPECTION.PENDING_MANAGER ? 'Duyệt kết quả' : i.status === INSPECTION.DISPUTED ? 'Giải quyết khiếu nại' : 'Xem chi tiết'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager {...paging.pagerProps} unit="kết quả" />
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

/**
 * Định dạng tiền làm tròn kèm "đ" (bản rút gọn dùng trong bảng).
 */
const fmtMoneyShort = n => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)))}đ`
