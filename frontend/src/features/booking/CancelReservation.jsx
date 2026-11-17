/**
 * ======================================================================
 * FILE: src/features/booking/CancelReservation.jsx  —  KHÁCH HỦY ĐẶT KHO + HOÀN CỌC THEO CHÍNH SÁCH
 * CHỨC NĂNG: Hộp thoại để khách tự hủy đơn đặt kho (đã cọc hoặc đang chờ cọc, chưa nhận kho). Hiện báo giá hoàn cọc do
 *   backend tính (số ngày còn tới ngày nhận kho, % và số tiền được hoàn, bảng các mức hoàn), cho chọn lý do, tick
 *   đồng ý rồi hủy ngay — không cần ai duyệt. Đơn trả qua VNPay thì tiền hoàn về đúng thẻ / tài khoản đã thanh toán
 *   (API hoàn tiền VNPay). Có thêm hàm gửi lại yêu cầu hoàn tiền khi lần hoàn trước bị lỗi.
 * THÀNH PHẦN CHÍNH:
 *   - CancelReservationModal (default export): hộp thoại hủy đặt kho.
 *   - tierLabel (export): tạo nhãn cho 1 mức trong bảng chính sách hoàn cọc.
 *   - retryRefund (export): gửi lại yêu cầu hoàn tiền.
 *   - money, fmtIso, REASONS: tiện ích định dạng + danh sách lý do hủy.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx, src/features/payment/PendingPayments.jsx.
 * PHỤ THUỘC: api/api (apiGet, apiPost), components/common/Dialog (useDialog), services/storageRules (formatVnd),
 *   ../contract/ContractSignFlow.css (khung hộp thoại csf-*), CancelReservation.css.
 * API (ReservationCancellationsController):
 *   GET  /api/reservation-cancellations/{id}/quote        -> có hủy được không, số ngày trước ngày nhận, % & số tiền hoàn
 *   POST /api/reservation-cancellations/{id}              -> body { reason, expectedRefund } : hủy ngay, không cần duyệt
 *   POST /api/reservation-cancellations/{id}/refund-retry -> gửi lại yêu cầu hoàn tiền (VNPay lỗi lần trước)
 * LUỒNG: khách bấm "Hủy đặt kho" / "Hủy đặt chỗ" -> mở CancelReservationModal -> load(): GET .../quote -> hiện số tiền hoàn
 *   -> chọn lý do + tick đồng ý -> bấm "Hủy & hoàn ..." -> submit(): dialog xác nhận -> POST .../{id} -> onDone(result)
 *   (cha tải lại dữ liệu) -> dialog báo kết quả hoàn tiền. Nếu hoàn lỗi: mục Thanh toán -> retryRefund() -> POST .../refund-retry.
 * ======================================================================
 */
import React, { useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import { formatVnd } from '../../services/storageRules'
import '../contract/ContractSignFlow.css'
import './CancelReservation.css'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ".
 * @param {number|string} value số tiền.
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/**
 * Đổi ngày ISO thành 'dd/MM/yyyy' (rỗng -> '—').
 * @param {string} iso ngày dạng ISO.
 * @returns {string}
 */
const fmtIso = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
/** Các lý do hủy cho khách chọn trong ô select; chọn "Lý do khác" thì nội dung ô ghi chú là lý do. */
const REASONS = ['Không còn nhu cầu thuê', 'Đã tìm được kho khác', 'Muốn đổi thời gian / kích thước kho', 'Lý do khác']

/**
 * Tạo nhãn mô tả cho 1 mức hoàn tiền trong bảng chính sách (vd "Hủy trước 3–6 ngày").
 * @param {object[]} tiers các mức { minDaysBefore, refundPercent } đã sắp giảm dần.
 * @param {number} index vị trí mức cần mô tả.
 * @returns {string} mức đầu: "từ N ngày trở lên"; mức minDaysBefore = 0: "dưới N ngày"; còn lại: khoảng "a–b ngày".
 * Được gọi bởi: CancelReservationModal (vẽ bảng "Chính sách hoàn cọc khi hủy").
 */
export function tierLabel(tiers, index) {
  const t = tiers[index]
  const prev = tiers[index - 1]
  if (index === 0) return `Hủy trước ngày nhận kho từ ${t.minDaysBefore} ngày trở lên`
  if (t.minDaysBefore === 0) return `Hủy dưới ${prev.minDaysBefore} ngày trước ngày nhận kho`
  return `Hủy trước ${t.minDaysBefore}–${prev.minDaysBefore - 1} ngày`
}

/**
 * Hộp thoại hủy đặt kho: tải báo giá hoàn tiền theo chính sách, chọn lý do, tick đồng ý rồi xác nhận hủy.
 * Nếu đơn không được hủy (quote.eligible = false) thì chỉ hiện lý do backend trả về.
 * @param {object} props
 * @param {object} props.rental đơn cần hủy (reservationId, reservationCode, contractNumber, facility, units, startDate).
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onDone] onDone(result) — gọi sau khi hủy thành công để cha tải lại dữ liệu.
 * API: GET /api/reservation-cancellations/{id}/quote, POST /api/reservation-cancellations/{id}.
 * Được gọi bởi: CustomerAccount (các nút "Hủy đặt kho" ở tab Hợp đồng và trong ContractDetailModal),
 *   PendingPayments (nút "Hủy đặt chỗ" ở khoản chờ đặt cọc).
 */
export default function CancelReservationModal({ rental, onClose, onDone }) {
  const dialog = useDialog()
  const [quote, setQuote] = useState(null) // báo giá hủy: eligible, daysBefore, depositPaid, refundPercent, refundAmount, tiers...
  const [loadError, setLoadError] = useState('')
  const [reason, setReason] = useState(REASONS[0]) // lý do chọn trong select
  const [note, setNote] = useState('') // ghi chú thêm (hoặc lý do khi chọn "Lý do khác")
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  /**
   * Tải báo giá hủy/hoàn tiền vào state quote (404 không kèm message -> báo backend chưa có chức năng).
   * Chạy khi mở hộp thoại (useEffect bên dưới) và khi bấm "Thử lại".
   * API: GET /api/reservation-cancellations/{reservationId}/quote
   */
  const load = () => {
    setLoadError('')
    apiGet(`/api/reservation-cancellations/${rental.reservationId}/quote`)
      .then(setQuote)
      .catch(err => setLoadError(err?.status === 404 && !err?.data?.message
        ? 'Backend chưa có chức năng hủy đặt kho. Hãy chép ReservationCancellationsController.cs vào backend/Controllers rồi chạy lại backend.'
        : err.message))
  }
  // Chạy khi mở hộp thoại / đổi đơn (reservationId): tải báo giá.
  useEffect(load, [rental.reservationId])

  // Chạy khi mở hộp thoại và khi submitting đổi: gắn phím Esc để đóng; gỡ khi đóng.
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại (khi không đang gửi).
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  /**
   * Xác nhận hủy: hỏi lại bằng dialog, gửi yêu cầu hủy, báo kết quả hoàn tiền (thành công / còn chờ hoàn).
   * Chạy khi bấm nút "Hủy & hoàn ..." / "Hủy đặt kho" (chỉ bật khi đơn được hủy và đã tick đồng ý).
   * expectedRefund gửi kèm để backend so khớp: nếu số tiền hoàn đã đổi thì backend từ chối và trả báo giá mới.
   * API: POST /api/reservation-cancellations/{reservationId}  body { reason, expectedRefund }
   * Nếu backend trả báo giá mới (số tiền thay đổi) thì cập nhật báo giá và bắt tick đồng ý lại.
   */
  const submit = async () => {
    if (!quote?.eligible || !agreed) return
    const ok = await dialog.confirm({
      tone: 'danger',
      title: 'Hủy đặt kho?',
      message: `Đơn ${quote.contractNumber || quote.reservationCode} sẽ bị hủy ngay, kho được trả lại cho người khác đặt và không khôi phục được.\n${quote.refundAmount > 0 ? `Bạn được hoàn ${money(quote.refundAmount)} (${Number(quote.refundPercent)}% tiền cọc).` : 'Theo chính sách, đơn này không được hoàn cọc.'}`,
      confirmLabel: 'Hủy đặt kho',
      cancelLabel: 'Không hủy'
    })
    if (!ok) return
    setSubmitting(true)
    setError('')
    try {
      const fullReason = reason === 'Lý do khác' ? (note.trim() || 'Lý do khác') : `${reason}${note.trim() ? ` - ${note.trim()}` : ''}`
      const result = await apiPost(`/api/reservation-cancellations/${rental.reservationId}`, { reason: fullReason, expectedRefund: quote.refundAmount })
      onDone?.(result)
      onClose()
      const pending = (result.refunds || []).filter(r => r.status !== 'Completed')
      await dialog.alert({
        tone: pending.length ? 'warning' : 'success',
        title: 'Đã hủy đặt kho',
        message: result.refundAmount > 0
          ? pending.length
            ? `${result.message}\n${pending.map(r => r.message).join('\n')}\nBạn có thể theo dõi và gửi lại yêu cầu hoàn trong mục Thanh toán.`
            : `${result.message} ${quote.refundMethod === 'VNPay' ? 'Tiền được hoàn về thẻ / tài khoản bạn đã dùng để thanh toán qua VNPay (thường 1–3 ngày làm việc tùy ngân hàng).' : ''}`
          : result.message
      })
    } catch (err) {
      if (err?.data?.quote) { setQuote(err.data.quote); setAgreed(false) }
      setError(err.message)
      setSubmitting(false)
    }
  }

  // Bảng các mức hoàn cọc; activeTier = mức áp dụng cho đơn này (mức đầu tiên có daysBefore >= minDaysBefore).
  const tiers = quote?.tiers || []
  const activeTier = tiers.findIndex(t => quote && quote.daysBefore >= t.minDaysBefore)

  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <div className="csf cr-modal" role="dialog" aria-modal="true" aria-labelledby="cr-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge wait cr-badge">Hủy đặt kho</span>
            <h2 id="cr-title">{rental.contractNumber ? `Hợp đồng ${rental.contractNumber}` : `Đơn ${rental.reservationCode || rental.reservationId}`}</h2>
            <p>{rental.facility} · kho {rental.units?.map(u => u.number).join(', ') || rental.unitId} · nhận kho {rental.startDate}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={submitting} aria-label="Đóng">×</button>
        </div>

        <div className="csf-body">
          {loadError && (
            <div className="auth-message error" role="alert">
              {loadError} <button type="button" className="csf-link" onClick={load}>Thử lại</button>
            </div>
          )}
          {!quote && !loadError && <p className="csf-lead">Đang tính số tiền được hoàn...</p>}
          {error && <div className="auth-message error cr-error" role="alert">{error}</div>}

          {quote && !quote.eligible && <div className="cr-blocked" role="alert">{quote.reason}</div>}

          {quote && quote.eligible && (
            <>
              <div className="cdm-summary cr-summary">
                <div><span>Ngày nhận kho</span><strong>{fmtIso(quote.startDate)}</strong></div>
                <div><span>Còn lại</span><strong>{quote.daysBefore >= 0 ? `${quote.daysBefore} ngày` : `Trễ ${-quote.daysBefore} ngày`}</strong></div>
                <div><span>Tiền cọc đã trả</span><strong>{money(quote.depositPaid)}</strong></div>
                <div className={quote.refundAmount > 0 ? 'cr-refund' : 'cr-norefund'}><span>Được hoàn ({Number(quote.refundPercent)}%)</span><strong>{money(quote.refundAmount)}</strong></div>
              </div>

              {tiers.length > 0 && (
                <div className="cr-tiers">
                  <h4>Chính sách hoàn cọc khi hủy</h4>
                  <ul>
                    {tiers.map((t, i) => (
                      <li key={t.minDaysBefore} className={i === activeTier ? 'active' : ''}>
                        <span>{tierLabel(tiers, i)}</span>
                        <strong>hoàn {Number(t.refundPercent)}%</strong>
                        {i === activeTier && <em>Đơn của bạn</em>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {quote.refundAmount > 0 && (
                <p className="csf-hint">
                  {quote.refundMethod === 'VNPay'
                    ? 'Tiền hoàn về đúng thẻ / tài khoản bạn đã dùng thanh toán qua VNPay, thường trong 1–3 ngày làm việc tùy ngân hàng.'
                    : 'Đơn được thanh toán mô phỏng nên hệ thống ghi nhận hoàn tiền ngay.'}
                </p>
              )}

              <label className="csf-label" htmlFor="cr-reason">Lý do hủy</label>
              <select id="cr-reason" className="csf-input" value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <textarea
                className="csf-input cr-note"
                rows={2}
                maxLength={300}
                placeholder={reason === 'Lý do khác' ? 'Cho chúng tôi biết lý do...' : 'Ghi chú thêm (không bắt buộc)'}
                value={note}
                onChange={e => setNote(e.target.value)}
              />

              <label className={`csf-term cr-agree${agreed ? ' checked' : ''}`}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <div>
                  <strong>Tôi hiểu đơn sẽ bị hủy ngay</strong>
                  <p>Kho được trả lại để người khác đặt, hợp đồng chấm dứt và không khôi phục được. Số tiền hoàn tính theo chính sách ở trên tại thời điểm hủy.</p>
                </div>
              </label>
            </>
          )}
        </div>

        <div className="csf-actions">
          <span className="csf-spacer" />
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={submitting}>Không hủy</button>
          {quote?.eligible && (
            <button type="button" className="cr-danger-btn" disabled={!agreed || submitting} onClick={submit}>
              {submitting ? 'Đang hủy...' : quote.refundAmount > 0 ? `Hủy & hoàn ${money(quote.refundAmount)}` : 'Hủy đặt kho'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Gửi lại yêu cầu hoàn tiền cho đơn đã hủy (khi lần hoàn trước qua VNPay bị lỗi) và báo kết quả bằng dialog
 * (thành công / vẫn chưa hoàn được / lỗi gửi). Không ném lỗi ra ngoài.
 * API: POST /api/reservation-cancellations/{reservationId}/refund-retry
 * @param {object} dialog từ useDialog().
 * @param {number} reservationId mã đơn đã hủy.
 * @returns {Promise<void>}
 * Được gọi bởi: PendingPayments (nút "Gửi lại yêu cầu hoàn tiền" trong lịch sử giao dịch); CustomerAccount cũng import.
 */
export async function retryRefund(dialog, reservationId) {
  try {
    const result = await apiPost(`/api/reservation-cancellations/${reservationId}/refund-retry`, {})
    const pending = (result.refunds || []).filter(r => r.status !== 'Completed')
    await dialog.alert({
      tone: pending.length ? 'warning' : 'success',
      title: pending.length ? 'Chưa hoàn được tiền' : 'Đã hoàn tiền',
      message: pending.length ? pending.map(r => r.message).join('\n') : (result.refunds?.[0]?.message || result.message)
    })
  } catch (error) {
    await dialog.alert({ tone: 'danger', title: 'Chưa gửi được yêu cầu hoàn', message: error.message })
  }
}
