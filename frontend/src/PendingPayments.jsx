import React, { useEffect, useState } from 'react'
import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from './listKit'
import { formatReservationCode } from './storageRules'
import { useDialog } from './Dialog'
import { startVnPayPayment } from './vnpay'
import CancelReservationModal, { retryRefund } from './CancelReservation'
import './PendingPayments.css'

/*
 * THANH TOÁN CỦA KHÁCH (file THÊM MỚI)
 *   - usePendingDeposits / PendingDepositBar: đơn chưa đặt cọc (khách thoát VNPay giữa chừng, hoặc chưa bấm thanh toán)
 *     -> thanh nhắc có đồng hồ đếm ngược giờ giữ kho, hiện ở header mọi trang + đầu trang tài khoản.
 *   - CustomerPaymentCenter: trang "Thanh toán" mới: "Cần thanh toán" (đếm ngược, lý do lần trước chưa xong),
 *     số liệu tóm tắt, "Lịch sử giao dịch" dạng bảng, tiến trình hoàn tiền.
 * Dữ liệu: danh sách đơn của khách (/api/customer-reservations/mine, đã đổi qua mapCustomerReservation).
 *   depositExpiresAt = Reservation.HoldExpiresAt (giờ UTC), paymentStatus = trạng thái giao dịch gần nhất.
 */

const money = n => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)))}đ`

/* Backend trả giờ UTC không kèm "Z" (giống fmtUtc của trang khách) -> tự thêm Z */
export function parseUtc(value) {
  if (!value) return NaN
  const text = String(value)
  return Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
}
const fmtTime = ms => new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
const fmtDate = value => {
  const ms = parseUtc(value)
  return Number.isNaN(ms) ? '—' : new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
export function fmtLeft(ms) {
  if (ms <= 0) return 'hết giờ'
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return undefined
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

/* Đơn đang chờ đặt cọc (chưa có giao dịch thành công), còn trong giờ giữ kho; hết giờ thì tự biến mất. */
export function pendingDepositsOf(rentals, now = Date.now()) {
  return (Array.isArray(rentals) ? rentals : [])
    .filter(r => r && r.status === 'Pending Deposit' && r.paymentStatus !== 'Completed')
    .map(r => ({ ...r, expiresAtMs: parseUtc(r.depositExpiresAt) }))
    .filter(r => Number.isNaN(r.expiresAtMs) || r.expiresAtMs > now)
    .sort((a, b) => (a.expiresAtMs || Infinity) - (b.expiresAtMs || Infinity))
}

export function usePendingDeposits(rentals) {
  const has = (Array.isArray(rentals) ? rentals : []).some(r => r?.status === 'Pending Deposit' && r.paymentStatus !== 'Completed')
  const now = useNow(1000, has)
  return { list: has ? pendingDepositsOf(rentals, now) : [], now }
}

/* Lần thanh toán trước chưa xong (mở VNPay rồi thoát / thất bại) */
const abandonedNote = item => {
  if (item.paymentStatus === 'Pending') return 'Bạn đã mở trang VNPay nhưng chưa hoàn tất thanh toán.'
  if (item.paymentStatus === 'Failed') return 'Lần thanh toán trước không thành công.'
  if (item.paymentStatus === 'Cancelled') return 'Lần thanh toán trước đã bị hủy.'
  return null
}
const unitsOf = item => (item.units?.length ? item.units.map(u => u.number).join(', ') : item.unitId) || 'Chưa phân kho'

/*
 * Thanh nhắc đơn chưa đặt cọc.
 *   onPay(): mở trang Thanh toán. variant 'header' (dưới header trang chủ) | 'inline' (trong trang tài khoản).
 */
export function PendingDepositBar({ rentals, onPay, variant = 'header', actionLabel = 'Xem & thanh toán' }) {
  const { list, now } = usePendingDeposits(rentals)
  if (list.length === 0) return null
  const first = list[0]
  const left = Number.isNaN(first.expiresAtMs) ? null : first.expiresAtMs - now
  const urgent = left != null && left < 5 * 60000
  const total = list.reduce((s, r) => s + Number(r.depositAmount || 0), 0)
  return (
    <div className={`pd-bar ${variant}${urgent ? ' urgent' : ''}`} role="status" aria-live="polite">
      <div className="pd-bar-inner">
        <span className="pd-bar-icon" aria-hidden="true">⏳</span>
        <div className="pd-bar-text">
          <strong>
            {list.length === 1
              ? `Đơn ${formatReservationCode(first.reservationId)} (kho ${unitsOf(first)}) chưa đặt cọc`
              : `Bạn còn ${list.length} đơn chưa đặt cọc`}
            {' · '}{money(total)}
          </strong>
          <span>
            {left == null
              ? 'Hoàn tất đặt cọc để giữ kho.'
              : <>Kho chỉ được giữ đến <b>{fmtTime(first.expiresAtMs)}</b> (còn <b className="pd-left">{fmtLeft(left)}</b>). Quá giờ kho sẽ được mở lại cho khách khác.</>}
            {abandonedNote(first) ? ` ${abandonedNote(first)}` : ''}
          </span>
        </div>
        <button type="button" className="pd-bar-btn" onClick={onPay}>{actionLabel}</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Trang Thanh toán */

const historyStatus = item => {
  if (Number(item.refundAmount) > 0) {
    return item.refundStatus === 'Completed'
      ? { label: `Đã hoàn ${money(item.refundAmount)}`, tone: 'info' }
      : { label: `Đang hoàn ${money(item.refundAmount)}`, tone: 'warn' }
  }
  return { label: 'Thành công', tone: 'ok' }
}

export function CustomerPaymentCenter({ reservations, onChanged, renderRefund }) {
  const dialog = useDialog()
  const [paying, setPaying] = useState(null)
  const [cancelRental, setCancelRental] = useState(null)
  const [retrying, setRetrying] = useState(null)
  const [openRefund, setOpenRefund] = useState(null)
  const { list: pending, now } = usePendingDeposits(reservations)

  const payWithVnPay = async items => {
    setPaying(items.map(i => i.reservationId).join(','))
    try {
      await startVnPayPayment(items.map(i => i.reservationId), {
        amount: items.reduce((n, i) => n + Number(i.depositAmount || 0), 0),
        count: items.length,
        kind: items.every(i => i.isRenewal) ? 'renewal' : 'deposit'
      })
    } catch (error) {
      setPaying(null)
      await dialog.alert({ tone: 'danger', title: 'Chưa mở được trang thanh toán VNPay', message: error.message })
    }
  }
  const retry = async item => {
    setRetrying(item.reservationId)
    await retryRefund(dialog, item.reservationId)
    setRetrying(null)
    onChanged?.()
  }

  const all = Array.isArray(reservations) ? reservations : []
  const history = all
    .filter(r => r.paymentStatus === 'Completed' || Number(r.refundAmount) > 0)
    .sort((a, b) => (parseUtc(b.paymentDate) || 0) - (parseUtc(a.paymentDate) || 0))
  const historyPaging = useClientPaging(history, { pageSize: 10 })
  const pendingTotal = pending.reduce((s, r) => s + Number(r.depositAmount || 0), 0)
  const paidTotal = all.filter(r => r.paymentStatus === 'Completed').reduce((s, r) => s + Number(r.paymentAmount || 0), 0)
  const refunding = all.filter(r => Number(r.refundAmount) > 0 && r.refundStatus !== 'Completed')
  const refundTotal = all.filter(r => Number(r.refundAmount) > 0).reduce((s, r) => s + Number(r.refundAmount || 0), 0)

  return (
    <div className="customer-content-page cp-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">THANH TOÁN</span>
          <h1>Thanh toán</h1>
          <p>Tiền cọc giữ kho, lịch sử giao dịch và hoàn tiền của bạn.</p>
        </div>
      </div>

      {/* ---------- Cần thanh toán ---------- */}
      {pending.length > 0 && (
        <section className="cp-due" aria-label="Cần thanh toán">
          <div className="cp-due-head">
            <div>
              <h2>Cần thanh toán</h2>
              <p>{pending.length} đơn · tổng {money(pendingTotal)}. Kho chỉ được giữ trong thời gian bên dưới, quá giờ đơn tự hủy và kho mở lại cho khách khác.</p>
            </div>
            {pending.length > 1 && (
              <button type="button" className="dashboard-primary-btn" disabled={Boolean(paying)} onClick={() => payWithVnPay(pending)}>
                {paying === pending.map(i => i.reservationId).join(',') ? 'Đang chuyển sang VNPay...' : `Thanh toán tất cả ${money(pendingTotal)}`}
              </button>
            )}
          </div>
          {pending.map(item => {
            const left = Number.isNaN(item.expiresAtMs) ? null : item.expiresAtMs - now
            const urgent = left != null && left < 5 * 60000
            const note = abandonedNote(item)
            return (
              <article key={item.reservationId} className={`cp-due-item${urgent ? ' urgent' : ''}`}>
                <div className="cp-due-info">
                  <span className="cp-kind">{item.isRenewal ? 'Gia hạn hợp đồng' : 'Đặt cọc giữ kho'}</span>
                  <h3>{item.facility}</h3>
                  <p>Kho <b>{unitsOf(item)}</b> · Mã đơn {formatReservationCode(item.reservationId)}{item.months ? ` · thuê ${item.months} tháng` : ''}</p>
                  {left != null && (
                    <span className={`cp-timer${urgent ? ' urgent' : ''}`}>⏳ Giữ kho đến {fmtTime(item.expiresAtMs)} · còn <b>{fmtLeft(left)}</b></span>
                  )}
                  {note && <p className="cp-note">{note} Bấm thanh toán để thử lại.</p>}
                </div>
                <div className="cp-due-pay">
                  <small>{item.isRenewal ? 'Cần trả ngay' : 'Tiền cọc'}</small>
                  <strong>{money(item.depositAmount)}</strong>
                  <button type="button" className="dashboard-primary-btn" disabled={Boolean(paying)} onClick={() => payWithVnPay([item])}>
                    {paying === String(item.reservationId) ? 'Đang chuyển sang VNPay...' : 'Thanh toán qua VNPay'}
                  </button>
                  {!item.isRenewal && <button type="button" className="cp-cancel" onClick={() => setCancelRental(item)}>Hủy đặt chỗ</button>}
                </div>
              </article>
            )
          })}
        </section>
      )}

      {/* ---------- Tóm tắt ---------- */}
      <section className="cp-stats">
        <div className={`cp-stat${pending.length ? ' warn' : ''}`}>
          <small>Cần thanh toán</small>
          <strong>{money(pendingTotal)}</strong>
          <span>{pending.length ? `${pending.length} đơn đang chờ đặt cọc` : 'Không có khoản nào đang chờ'}</span>
        </div>
        <div className="cp-stat">
          <small>Đã thanh toán</small>
          <strong>{money(paidTotal)}</strong>
          <span>{all.filter(r => r.paymentStatus === 'Completed').length} giao dịch thành công</span>
        </div>
        <div className="cp-stat">
          <small>Hoàn tiền</small>
          <strong>{money(refundTotal)}</strong>
          <span>{refunding.length ? `${refunding.length} khoản đang hoàn` : 'Không có khoản đang hoàn'}</span>
        </div>
      </section>

      {/* ---------- Lịch sử ---------- */}
      <section className="cp-history" aria-label="Lịch sử giao dịch">
        <h2>Lịch sử giao dịch</h2>
        {history.length === 0 ? (
          <div className="cp-empty">Chưa có giao dịch nào. Sau khi bạn đặt cọc thành công, giao dịch sẽ hiện ở đây.</div>
        ) : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead>
                <tr><th>Ngày</th><th>Đơn · kho</th><th>Nội dung</th><th className="num">Số tiền</th><th>Mã giao dịch</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {historyPaging.pageRows.map(item => {
                  const st = historyStatus(item)
                  const hasRefund = Number(item.refundAmount) > 0
                  const expanded = openRefund === item.reservationId
                  return (
                    <React.Fragment key={item.reservationId}>
                      <tr className={rowClass(item.paymentDate)}>
                        <td data-label="Ngày"><b>{fmtDate(item.paymentDate)}</b> <NewBadge createdAt={item.paymentDate} /></td>
                        <td data-label="Đơn · kho"><span><Code kind="order">{item.reservationCode || formatReservationCode(item.reservationId)}</Code><small>{item.facility} · {unitsOf(item)}</small></span></td>
                        <td data-label="Nội dung">{item.isRenewal ? 'Gia hạn hợp đồng' : 'Đặt cọc giữ kho'}</td>
                        <td data-label="Số tiền" className="num"><b>{money(item.paymentAmount ?? item.depositAmount)}</b></td>
                        <td data-label="Mã giao dịch"><Code>{item.paymentReference}</Code></td>
                        <td data-label="Trạng thái">
                          <span>
                          <span className={`cp-chip ${st.tone}`}>{st.label}</span>
                          {hasRefund && (
                            <button type="button" className="cp-link" onClick={() => setOpenRefund(expanded ? null : item.reservationId)} aria-expanded={expanded}>
                              {expanded ? 'Ẩn tiến trình' : 'Xem tiến trình hoàn'}
                            </button>
                          )}
                          </span>
                        </td>
                      </tr>
                      {hasRefund && expanded && (
                        <tr className="cp-refund-row">
                          <td colSpan={6}>
                            {renderRefund?.(item)}
                            {item.refundStatus === 'Pending' && (
                              <button type="button" className="dashboard-secondary-btn" disabled={retrying === item.reservationId} onClick={() => retry(item)}>
                                {retrying === item.reservationId ? 'Đang gửi...' : 'Gửi lại yêu cầu hoàn tiền'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            <Pager {...historyPaging.pagerProps} unit="giao dịch" />
          </div>
        )}
      </section>

      <p className="cp-foot">
        Thanh toán qua cổng VNPay (môi trường thử nghiệm). Giao dịch chỉ được ghi nhận khi VNPay xác nhận và hệ thống kiểm tra đúng chữ ký, số tiền.
        Tiền thuê hằng tháng và phí phát sinh xem ở mục Hợp đồng.
      </p>

      {cancelRental && (
        <CancelReservationModal rental={cancelRental} onClose={() => setCancelRental(null)} onDone={() => onChanged?.()} />
      )}
    </div>
  )
}
