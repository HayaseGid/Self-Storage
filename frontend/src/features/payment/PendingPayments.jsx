/**
 * ======================================================================
 * FILE: src/features/payment/PendingPayments.jsx  —  TRUNG TÂM THANH TOÁN & HÓA ĐƠN CỦA KHÁCH HÀNG
 * CHỨC NĂNG: Gom mọi thứ liên quan tới tiền của khách:
 *   - Thanh nhắc các đơn CHƯA ĐẶT CỌC (khách thoát VNPay giữa chừng hoặc chưa bấm thanh toán) kèm đồng hồ đếm ngược
 *     giờ giữ kho; hiện dưới header mọi trang và đầu trang tài khoản.
 *   - Trang "Thanh toán & Hóa đơn": 1) cọc giữ kho / gia hạn chờ thanh toán, 2) hóa đơn tiền thuê định kỳ + phí trễ hạn,
 *     3) số liệu tóm tắt công nợ & hoàn tiền, 4) lịch sử giao dịch (phân trang) kèm tiến trình hoàn cọc.
 * THÀNH PHẦN CHÍNH:
 *   - parseUtc, fmtLeft (export): đọc giờ UTC của backend; định dạng thời gian còn lại.
 *   - useNow (export hook): thời điểm hiện tại, tự cập nhật theo chu kỳ (đồng hồ đếm ngược).
 *   - pendingDepositsOf (export): lọc đơn chờ cọc còn hạn giữ kho.
 *   - usePendingDeposits (export hook): danh sách đơn chờ cọc + now.
 *   - PendingDepositBar (export component): thanh nhắc đơn chưa đặt cọc.
 *   - CustomerPaymentCenter (export component): trang "Thanh toán & Hóa đơn".
 *   - money, fmtTime, fmtDate, abandonedNote, unitsOf, historyStatus: hàm tiện ích nội bộ.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx (CustomerPaymentCenter, PendingDepositBar, pendingDepositsOf),
 *   src/features/notification/HeaderNotificationBell.jsx (PendingDepositBar, fmtLeft, usePendingDeposits).
 * PHỤ THUỘC: components/common/listKit (Code, NewBadge, Pager, rowClass, useClientPaging...), services/storageRules
 *   (formatReservationCode), components/common/Dialog (useDialog), api/vnpay (startVnPayPayment), api/lateFees
 *   (lateFeePolicyText, useLateFees), ../contract/ContractRenewal (fmtIsoDate), ../booking/CancelReservation
 *   (CancelReservationModal, retryRefund), PendingPayments.css.
 * API:
 *   - POST /api/vnpay/create (qua startVnPayPayment; kind 'deposit' | 'renewal' | 'rent') — chuyển sang trang VNPay.
 *   - GET /api/late-fees/mine (qua useLateFees) — phí trễ hạn và kỳ tiền thuê quá hạn.
 *   - GET /api/reservation-cancellations/{id}/quote, POST /api/reservation-cancellations/{id} (qua CancelReservationModal),
 *     POST /api/reservation-cancellations/{id}/refund-retry (qua retryRefund).
 *   Dữ liệu đơn (reservations) do CustomerAccount tải từ GET /api/customer-reservations/mine rồi truyền vào.
 * LUỒNG: CustomerAccount truyền reservations -> usePendingDeposits lọc đơn chờ cọc + đếm ngược; useLateFees tải phí trễ
 *   -> khách bấm "Thanh toán qua VNPay" (payWithVnPay) hoặc "Đóng ..." (payRentBill: dialog xác nhận) -> startVnPayPayment
 *   -> POST /api/vnpay/create -> trình duyệt chuyển sang VNPay -> VNPay trả về /payment-result (PaymentResultPage xử lý).
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ" → dùng ở: PendingDepositBar, historyStatus, CustomerPaymentCenter
 *   parseUtc: Đọc thời điểm UTC từ backend. Backend trả giờ UTC không kèm "Z" -> tự thêm "Z" nếu thiếu để không bị lệch 7 tiếng → dùng ở: fmtDate, pendingDepositsOf, CustomerPaymentCenter
 *   fmtTime: Định dạng milisecond thành "HH:mm dd/MM" (giờ hết hạn giữ kho) → dùng ở: PendingDepositBar, CustomerPaymentCenter
 *   fmtDate: Định dạng thời điểm UTC thành ngày giờ đầy đủ theo vi-VN (không hợp lệ -> "—"); dùng cho cột "Ngày" của lịch sử → dùng ở: CustomerPaymentCenter
 *   fmtLeft: Định dạng thời gian còn lại: "mm:ss" (dưới 1 giờ) hoặc "H giờ mm phút"; hết giờ -> "hết giờ" → dùng ở: PendingDepositBar, CustomerPaymentCenter; HeaderNotificationBell.jsx (HeaderNotificationBell)
 *   useNow: Hook trả về thời điểm hiện tại, tự cập nhật mỗi `intervalMs` ms (dùng cho đồng hồ đếm ngược) → dùng ở: usePendingDeposits
 *   pendingDepositsOf: Lọc các đơn đang chờ đặt cọc (status 'Pending Deposit', chưa có giao dịch thành công) và còn trong giờ giữ kho, thêm trường expiresAtMs → dùng ở: usePendingDeposits; CustomerAccount.jsx (CustomerDashboard)
 *   usePendingDeposits: Hook: danh sách đơn chờ cọc + thời điểm hiện tại (chỉ chạy đồng hồ 1 giây/lần khi có đơn chờ cọc) → dùng ở: PendingDepositBar, CustomerPaymentCenter; HeaderNotificationBell.jsx (HeaderNotificationBell)
 *   abandonedNote: Câu ghi chú khi lần thanh toán trước chưa xong (mở VNPay rồi thoát / thất bại / bị hủy), dựa trên paymentStatus → dùng ở: PendingDepositBar, CustomerPaymentCenter
 *   unitsOf: Ghép danh sách số kho của đơn thành chuỗi "A01, A02" (chưa có thì "Chưa phân kho") → dùng ở: PendingDepositBar, CustomerPaymentCenter
 *   PendingDepositBar: Thanh nhắc đơn chưa đặt cọc: số đơn, tổng tiền cọc, giờ hết hạn giữ kho của đơn sớm nhất và thời gian còn lại (tô đỏ khi còn dưới 5 phút) → dùng ở: HeaderNotificationBell.jsx (HeaderPendingDepositBar), CustomerAccount.jsx (CustomerDashboard)
 *   historyStatus: Trạng thái hiển thị của 1 dòng lịch sử giao dịch: "Thành công", "Đang hoàn ...", "Đã hoàn ..." → dùng ở: CustomerPaymentCenter
 *   CustomerPaymentCenter: Trang "Thanh toán & Hóa đơn" của khách: khoản cọc / gia hạn chờ thanh toán, hóa đơn tiền thuê & phí trễ hạn, thẻ tóm tắt → dùng ở: CustomerAccount.jsx (CustomerDashboard)
 *   lateFeeOf: Lấy thông tin phí trễ hạn của 1 đơn (kèm chính sách phí trễ hạn) → dùng ở: lateUnpaidOf, CustomerPaymentCenter
 *   lateUnpaidOf: Tính tổng phí trễ hạn CHƯA đóng (và không đang chờ VNPay xác nhận) của 1 đơn → dùng ở: payRentBill, CustomerPaymentCenter
 *   payWithVnPay: Thanh toán tiền cọc / gia hạn cho 1 hoặc nhiều đơn qua VNPay → dùng ở: CustomerPaymentCenter
 *   payRentBill: Đóng hóa đơn tiền thuê định kỳ + phí trễ hạn của 1 hợp đồng: hỏi xác nhận rồi chuyển sang VNPay → dùng ở: CustomerPaymentCenter
 *   retry: Gửi lại yêu cầu hoàn tiền cho 1 đơn đã hủy rồi tải lại dữ liệu → dùng ở: CustomerPaymentCenter
 */
import React, { useEffect, useState } from 'react'
import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from '../../components/common/listKit'
import { formatReservationCode } from '../../services/storageRules'
import { useDialog } from '../../components/common/Dialog'
import { apiPost } from '../../api/api'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'
import { lateFeePolicyText, payLateFeesDemo, useLateFees } from '../../api/lateFees'
import { fmtIsoDate } from '../contract/ContractRenewal'
import CancelReservationModal, { retryRefund } from '../booking/CancelReservation'
import './PendingPayments.css'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ".
 * @param {number|string} n số tiền.
 * @returns {string}
 */
const money = n => `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)))}đ`

/**
 * Đọc thời điểm UTC từ backend. Backend trả giờ UTC không kèm "Z" -> tự thêm "Z" nếu thiếu để không bị lệch 7 tiếng.
 * @param {string} value chuỗi thời điểm.
 * @returns {number} milisecond (NaN nếu rỗng).
 * Được gọi bởi: pendingDepositsOf, fmtDate, CustomerPaymentCenter (sắp xếp lịch sử).
 */
export function parseUtc(value) {
  if (!value) return NaN
  const text = String(value)
  return Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
}
/**
 * Định dạng milisecond thành "HH:mm dd/MM" (giờ hết hạn giữ kho).
 * @param {number} ms
 * @returns {string}
 */
const fmtTime = ms => new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
/**
 * Định dạng thời điểm UTC thành ngày giờ đầy đủ theo vi-VN (không hợp lệ -> "—"); dùng cho cột "Ngày" của lịch sử.
 * @param {string} value
 * @returns {string}
 */
const fmtDate = value => {
  const ms = parseUtc(value)
  return Number.isNaN(ms) ? '—' : new Date(ms).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
/**
 * Định dạng thời gian còn lại: "mm:ss" (dưới 1 giờ) hoặc "H giờ mm phút"; hết giờ -> "hết giờ".
 * @param {number} ms số milisecond còn lại.
 * @returns {string}
 * Được gọi bởi: PendingDepositBar, CustomerPaymentCenter, HeaderNotificationBell.
 */
export function fmtLeft(ms) {
  if (ms <= 0) return 'hết giờ'
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Hook trả về thời điểm hiện tại, tự cập nhật mỗi `intervalMs` ms (dùng cho đồng hồ đếm ngược).
 * @param {number} intervalMs chu kỳ cập nhật.
 * @param {boolean} enabled false thì không chạy bộ đếm.
 * @returns {number} Date.now() mới nhất.
 * Được gọi bởi: usePendingDeposits.
 */
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  // Chạy khi intervalMs / enabled đổi: bật setInterval cập nhật now; tắt bộ đếm khi unmount hoặc enabled = false.
  useEffect(() => {
    if (!enabled) return undefined
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs, enabled])
  return now
}

/**
 * Lọc các đơn đang chờ đặt cọc (status 'Pending Deposit', chưa có giao dịch thành công) và còn trong giờ giữ kho,
 * thêm trường expiresAtMs, sắp theo hạn sớm nhất. Đơn hết giờ thì tự biến mất khỏi danh sách.
 * @param {object[]} rentals danh sách đơn của khách.
 * @param {number} now thời điểm hiện tại (ms).
 * @returns {object[]}
 * Được gọi bởi: usePendingDeposits, CustomerAccount.
 */
export function pendingDepositsOf(rentals, now = Date.now()) {
  return (Array.isArray(rentals) ? rentals : [])
    .filter(r => r && r.status === 'Pending Deposit' && r.paymentStatus !== 'Completed')
    .map(r => ({ ...r, expiresAtMs: parseUtc(r.depositExpiresAt) }))
    .filter(r => Number.isNaN(r.expiresAtMs) || r.expiresAtMs > now)
    .sort((a, b) => (a.expiresAtMs || Infinity) - (b.expiresAtMs || Infinity))
}

/**
 * Hook: danh sách đơn chờ cọc + thời điểm hiện tại (chỉ chạy đồng hồ 1 giây/lần khi có đơn chờ cọc).
 * @param {object[]} rentals danh sách đơn của khách.
 * @returns {{list:object[], now:number}}
 * Được gọi bởi: PendingDepositBar, CustomerPaymentCenter, HeaderNotificationBell.
 */
export function usePendingDeposits(rentals) {
  const has = (Array.isArray(rentals) ? rentals : []).some(r => r?.status === 'Pending Deposit' && r.paymentStatus !== 'Completed')
  const now = useNow(1000, has)
  return { list: has ? pendingDepositsOf(rentals, now) : [], now }
}

/**
 * Câu ghi chú khi lần thanh toán trước chưa xong (mở VNPay rồi thoát / thất bại / bị hủy), dựa trên paymentStatus.
 * @param {object} item đơn chờ cọc.
 * @returns {string|null} null nếu chưa từng thử thanh toán.
 */
const abandonedNote = item => {
  if (item.paymentStatus === 'Pending') return 'Bạn đã mở trang VNPay nhưng chưa hoàn tất thanh toán.'
  if (item.paymentStatus === 'Failed') return 'Lần thanh toán trước không thành công.'
  if (item.paymentStatus === 'Cancelled') return 'Lần thanh toán trước đã bị hủy.'
  return null
}
/**
 * Ghép danh sách số kho của đơn thành chuỗi "A01, A02" (chưa có thì "Chưa phân kho").
 * @param {object} item đơn.
 * @returns {string}
 */
const unitsOf = item => (item.units?.length ? item.units.map(u => u.number).join(', ') : item.unitId) || 'Chưa phân kho'

/**
 * Thanh nhắc đơn chưa đặt cọc: số đơn, tổng tiền cọc, giờ hết hạn giữ kho của đơn sớm nhất và thời gian còn lại
 * (tô đỏ khi còn dưới 5 phút). Không có đơn chờ cọc thì trả null.
 * @param {object} props
 * @param {object[]} props.rentals danh sách đơn của khách.
 * @param {Function} props.onPay bấm nút -> mở trang Thanh toán.
 * @param {'header'|'inline'} [props.variant='header'] 'header' (dưới header mọi trang) | 'inline' (trong trang tài khoản).
 * @param {string} [props.actionLabel] chữ trên nút.
 * @returns {JSX.Element|null}
 * Được gọi bởi: HeaderNotificationBell (variant header), CustomerAccount (variant inline).
 */
export function PendingDepositBar({ rentals, onPay, variant = 'header', actionLabel = 'Xem & thanh toán' }) {
  const { list, now } = usePendingDeposits(rentals)
  if (list.length === 0) return null
  const first = list[0]
  const left = Number.isNaN(first.expiresAtMs) ? null : first.expiresAtMs - now
  const urgent = left != null && left < 5 * 60000
  const total = list.reduce((s, r) => s + Number(r.depositAmount || 0), 0)
  // Thanh nhắc đơn chưa đặt cọc
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

/* ------------------------------------------------------------------ Trang Thanh toán & Hóa đơn */

/**
 * Trạng thái hiển thị của 1 dòng lịch sử giao dịch: "Thành công", "Đang hoàn ...", "Đã hoàn ...".
 * @param {object} item đơn trong lịch sử (refundAmount, refundStatus).
 * @returns {{label:string, tone:'ok'|'info'|'warn'}} chữ và màu chip.
 */
const historyStatus = item => {
  if (Number(item.refundAmount) > 0) {
    return item.refundStatus === 'Completed'
      ? { label: `Đã hoàn ${money(item.refundAmount)}`, tone: 'info' }
      : { label: `Đang hoàn ${money(item.refundAmount)}`, tone: 'warn' }
  }
  return { label: 'Thành công', tone: 'ok' }
}

/**
 * Trang "Thanh toán & Hóa đơn" của khách: khoản cọc / gia hạn chờ thanh toán, hóa đơn tiền thuê & phí trễ hạn,
 * thẻ tóm tắt, bảng lịch sử giao dịch (phân trang) và hộp thoại hủy đặt chỗ.
 * @param {object} props
 * @param {object[]} props.reservations đơn của khách (CustomerAccount tải từ GET /api/customer-reservations/mine).
 * @param {Function} [props.onChanged] gọi để cha tải lại dữ liệu (sau khi hủy đơn / gửi lại hoàn tiền).
 * @param {Function} [props.renderRefund] renderRefund(item) — cha vẽ tiến trình hoàn cọc (RefundTimeline).
 * @param {Function} [props.onOpenContract] onOpenContract(reservationId) — mở hợp đồng liên quan ở tab Hợp đồng.
 * API: GET /api/late-fees/mine (useLateFees), POST /api/vnpay/create (payWithVnPay, payRentBill),
 *   POST /api/reservation-cancellations/{id}/refund-retry (retry).
 * @returns {JSX.Element}
 * Được gọi bởi: CustomerAccount (mục "Thanh toán").
 */
export function CustomerPaymentCenter({ reservations, onChanged, renderRefund, onOpenContract }) {
  const dialog = useDialog()
  const [paying, setPaying] = useState(null) // chuỗi reservationId đang chuyển sang VNPay (khóa các nút thanh toán cọc)
  const [payingRentId, setPayingRentId] = useState(null) // đơn đang đóng tiền thuê
  const [cancelRental, setCancelRental] = useState(null) // đơn đang mở CancelReservationModal
  const [retrying, setRetrying] = useState(null) // đơn đang gửi lại yêu cầu hoàn tiền
  const [openRefund, setOpenRefund] = useState(null) // đơn đang mở dòng tiến trình hoàn cọc
  const { list: pending, now } = usePendingDeposits(reservations)
  const lateFees = useLateFees()

  // Lấy thông tin phí trễ hạn của 1 đơn (kèm chính sách phí trễ hạn).
  const lateFeeOf = rental => {
    const item = lateFees.byReservation(rental.reservationId)
    return item ? { ...item, policy: lateFees.policy } : null
  }
  // Tính tổng phí trễ hạn CHƯA đóng (và không đang chờ VNPay xác nhận) của 1 đơn.
  const lateUnpaidOf = rental => (lateFeeOf(rental)?.lateFees || [])
    .filter(f => f.status === 'Unpaid' && !f.pendingPayment)
    .reduce((n, f) => n + Number(f.amount || 0), 0)

  /**
   * Thanh toán tiền cọc / gia hạn cho 1 hoặc nhiều đơn qua VNPay.
   * Chạy khi bấm "Thanh toán qua VNPay" (1 đơn) hoặc "Thanh toán tất cả" (mọi đơn chờ cọc).
   * API: POST /api/vnpay/create (qua startVnPayPayment), kind = 'renewal' nếu toàn đơn gia hạn, ngược lại 'deposit'.
   */
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

  /**
   * Đóng hóa đơn tiền thuê định kỳ + phí trễ hạn của 1 hợp đồng: hỏi xác nhận rồi chuyển sang VNPay.
   * Chạy khi bấm nút "Đóng ..." trên thẻ hóa đơn tiền thuê.
   * API: POST /api/vnpay/create (qua startVnPayPayment, kind 'rent').
   */
  const payRentBill = async rental => {
    const rentAmount = Number(rental.rentPayableNow || 0)
    const lateAmount = lateUnpaidOf(rental)
    const amount = rentAmount + lateAmount
    if (!amount) return
    // Định dạng số tiền kiểu Việt Nam (không kèm "đ").
    const vnd = n => new Intl.NumberFormat('vi-VN').format(n)
    const ok = await dialog.confirm({
      tone: 'info',
      title: `Đóng ${vnd(amount)}đ${lateAmount > 0 ? (rentAmount > 0 ? ' (tiền thuê + phí trễ hạn)' : ' phí trễ hạn') : ' tiền thuê'}?`,
      message: `Hợp đồng ${rental.contractNumber || rental.reservationCode || formatReservationCode(rental.reservationId)} · ${rental.paymentPlan === 'Upfront' ? 'trả 1 lần (toàn bộ kỳ thuê)' : 'trả theo tháng'}.` +
        (lateAmount > 0 ? `\nGồm ${rentAmount > 0 ? `${vnd(rentAmount)}đ tiền thuê và ` : ''}${vnd(lateAmount)}đ phí trễ hạn.` : ''),
      confirmLabel: 'Thanh toán ngay'
    })
    if (!ok) return
    setPayingRentId(rental.reservationId)
    try {
      await startVnPayPayment([rental.reservationId], { amount, count: 1, label: rental.contractNumber, kind: 'rent' })
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa đóng được tiền thuê', message: error.message })
      setPayingRentId(null)
    }
  }

  /**
   * Gửi lại yêu cầu hoàn tiền cho 1 đơn đã hủy rồi tải lại dữ liệu.
   * Chạy khi bấm "Gửi lại yêu cầu hoàn tiền" trong dòng tiến trình hoàn (refundStatus = 'Pending').
   * API: POST /api/reservation-cancellations/{id}/refund-retry (qua retryRefund).
   */
  const retry = async item => {
    setRetrying(item.reservationId)
    await retryRefund(dialog, item.reservationId)
    setRetrying(null)
    onChanged?.()
  }

  // rentBills: hợp đồng chưa kết thúc có tiền thuê đến hạn hoặc phí trễ chưa đóng; các tổng dùng cho tiêu đề và thẻ tóm tắt.
  const all = Array.isArray(reservations) ? reservations : []
  const rentBills = all.filter(r => {
    const ended = ['Completed', 'Cancelled', 'Expired'].includes(r.status)
    if (ended) return false
    return Number(r.rentPayableNow || 0) > 0 || lateUnpaidOf(r) > 0
  })
  const rentDueTotal = rentBills.reduce((s, r) => s + Number(r.rentPayableNow || 0) + lateUnpaidOf(r), 0)
  const pendingTotal = pending.reduce((s, r) => s + Number(r.depositAmount || 0), 0)
  const totalDueNow = pendingTotal + rentDueTotal
  const totalDueCount = pending.length + rentBills.length

  // Lịch sử: đơn đã thanh toán thành công hoặc có hoàn tiền, mới nhất lên đầu, phân trang phía client (useClientPaging).
  const history = all
    .filter(r => r.paymentStatus === 'Completed' || Number(r.refundAmount) > 0)
    .sort((a, b) => (parseUtc(b.paymentDate) || 0) - (parseUtc(a.paymentDate) || 0))
  const historyPaging = useClientPaging(history)
  const paidTotal = all.filter(r => r.paymentStatus === 'Completed').reduce((s, r) => s + Number(r.paymentAmount || 0), 0)
  const refunding = all.filter(r => Number(r.refundAmount) > 0 && r.refundStatus !== 'Completed')
  const refundTotal = all.filter(r => Number(r.refundAmount) > 0).reduce((s, r) => s + Number(r.refundAmount || 0), 0)

  // Trang "Thanh toán & Hóa đơn"
  return (
    <div className="customer-content-page cp-page">
      {/* Tiêu đề trang */}
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">TRUNG TÂM TÀI CHÍNH & HÓA ĐƠN</span>
          <h1>Thanh toán & Hóa đơn</h1>
          <p>Đóng tiền cọc giữ kho, thanh toán hóa đơn tiền thuê định kỳ, phí phát sinh và tra cứu biên lai giao dịch.</p>
        </div>
      </div>

      {/* ---------- 1. Cọc giữ kho / Gia hạn chờ thanh toán ---------- */}
      {pending.length > 0 && (
        <section className="cp-due" aria-label="Đơn chờ đặt cọc">
          <div className="cp-due-head">
            <div>
              <h2>1. Tiền cọc giữ kho & Phí gia hạn cần đóng ngay</h2>
              <p>{pending.length} đơn · tổng {money(pendingTotal)}. Kho chỉ được giữ trong thời gian đếm ngược bên dưới, quá giờ đơn tự hủy và kho mở lại cho khách khác.</p>
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
            // 1 khoản chờ thanh toán
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

      {/* ---------- 2. Hóa đơn tiền thuê định kỳ & Phí trễ hạn ---------- */}
      <section className={`cp-rent-bills${rentBills.length > 0 ? ' has-due' : ''}`} aria-label="Hóa đơn tiền thuê định kỳ và phí phát sinh">
        <div className="cp-due-head">
          <div>
            <h2>{pending.length > 0 ? '2. Hóa đơn tiền thuê định kỳ & Phí trễ hạn' : 'Hóa đơn tiền thuê định kỳ & Phí phát sinh'}</h2>
            <p>
              {rentBills.length > 0
                ? `Bạn có ${rentBills.length} hợp đồng đang có kỳ tiền thuê đến hạn hoặc phí trễ hạn cần thanh toán (${money(rentDueTotal)}).`
                : 'Tất cả kỳ tiền thuê hiện tại của bạn đã được thanh toán đầy đủ. Hóa đơn kỳ tiếp theo sẽ tự động hiển thị tại đây khi đến hạn.'}
            </p>
          </div>
        </div>

        {rentBills.length > 0 && (
          <div className="cp-bill-list">
            {rentBills.map(rental => {
              const rentAmount = Number(rental.rentPayableNow || 0)
              const lf = lateFeeOf(rental)
              const unpaidLate = (lf?.lateFees || []).filter(f => f.status === 'Unpaid')
              const lateAmount = lateUnpaidOf(rental)
              const overdueItems = lf?.overdueRent || []
              const totalBill = rentAmount + lateAmount
              const isOverdue = Number(rental.rentOverdue) > 0 || lateAmount > 0

              // 1 hóa đơn tiền thuê
              return (
                <article key={rental.reservationId} className={`cp-due-item cp-bill-card${isOverdue ? ' urgent' : ''}`}>
                  <div className="cp-due-info">
                    <div className="cp-bill-badges">
                      <span className={`cp-chip ${isOverdue ? 'warn' : 'info'}`}>
                        {isOverdue ? 'Quá hạn / Có phí trễ' : 'Đến kỳ thanh toán'}
                      </span>
                      <span className="cp-kind">
                        {rental.paymentPlan === 'Upfront' ? 'Trả 1 lần toàn kỳ' : 'Tiền thuê định kỳ hằng tháng'}
                      </span>
                    </div>
                    <h3>{rental.facility} · Kho {unitsOf(rental)}</h3>
                    <p>
                      Hợp đồng <b>{rental.contractNumber || `#${rental.contractId || rental.reservationId}`}</b>
                      {' · '}Mã đơn <Code kind="order">{rental.reservationCode || formatReservationCode(rental.reservationId)}</Code>
                      {' · '}Thời hạn {rental.startDate} → {rental.endDate}
                    </p>
                    <div className="cp-bill-breakdown">
                      {rentAmount > 0 && (
                        <span>• Tiền thuê kỳ hiện tại: <strong>{money(rentAmount)}</strong></span>
                      )}
                      {lateAmount > 0 && (
                        <span className="cp-late-line">• Phí trễ hạn chưa đóng: <strong>{money(lateAmount)}</strong></span>
                      )}
                    </div>
                    {overdueItems.map(o => (
                      <p key={`o${o.chargeId}`} className="cp-note">
                        ⚠ Kỳ {fmtIsoDate(o.periodStart)}–{fmtIsoDate(o.periodEnd)}{o.unitNumber ? ` (kho ${o.unitNumber})` : ''}: trễ {o.daysLate} ngày
                        {o.graceDaysLeft > 0 ? ` · còn ${o.graceDaysLeft} ngày ân hạn trước khi tính phí phạt` : ' · đang tính phí trễ hạn'}
                      </p>
                    ))}
                    {unpaidLate.map(f => (
                      <p key={`f${f.chargeId}`} className="cp-note">
                        • {f.description}: <b>{money(f.amount)}</b>{f.pendingPayment ? ' (đang chờ VNPay xác nhận)' : ''}
                      </p>
                    ))}
                    {lf?.policy && (overdueItems.length > 0 || unpaidLate.length > 0) && (
                      <small className="cp-policy-note">Chính sách: {lateFeePolicyText(lf.policy)}</small>
                    )}
                  </div>
                  <div className="cp-due-pay">
                    <small>Tổng cần thanh toán</small>
                    <strong>{money(totalBill)}</strong>
                    <button
                      type="button"
                      className="dashboard-primary-btn"
                      disabled={payingRentId === rental.reservationId}
                      onClick={() => payRentBill(rental)}
                    >
                      {payingRentId === rental.reservationId ? 'Đang xử lý...' : `Đóng ${money(totalBill)}`}
                    </button>
                    {onOpenContract && (
                      <button
                        type="button"
                        className="cp-link"
                        onClick={() => onOpenContract(rental.reservationId)}
                      >
                        Xem hợp đồng liên quan →
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {/* ---------- Tóm tắt ---------- */}
      <section className="cp-stats">
        <div className={`cp-stat${totalDueCount > 0 ? ' warn' : ''}`}>
          <small>Cần thanh toán ngay</small>
          <strong>{money(totalDueNow)}</strong>
          <span>
            {totalDueCount > 0
              ? `${pending.length ? `${pending.length} đơn cọc` : ''}${pending.length && rentBills.length ? ' + ' : ''}${rentBills.length ? `${rentBills.length} hóa đơn thuê kho` : ''}`
              : 'Không có công nợ hay hóa đơn chờ'}
          </span>
        </div>
        <div className="cp-stat">
          <small>Đã thanh toán</small>
          <strong>{money(paidTotal)}</strong>
          <span>{all.filter(r => r.paymentStatus === 'Completed').length} giao dịch hoàn tất</span>
        </div>
        <div className="cp-stat">
          <small>Hoàn tiền cọc</small>
          <strong>{money(refundTotal)}</strong>
          <span>{refunding.length ? `${refunding.length} khoản đang xử lý hoàn` : 'Không có khoản đang hoàn'}</span>
        </div>
      </section>

      {/* ---------- Lịch sử ---------- */}
      <section className="cp-history" aria-label="Lịch sử giao dịch">
        <h2>Lịch sử giao dịch & Biên lai</h2>
        {history.length === 0 ? (
          <div className="cp-empty">Chưa có giao dịch nào. Sau khi bạn đặt cọc hoặc đóng tiền thuê thành công, giao dịch sẽ hiện ở đây.</div>
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
                  // 1 dòng lịch sử + tiến trình hoàn cọc
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
        Tất cả các khoản tiền cọc giữ kho, hóa đơn tiền thuê định kỳ hằng tháng và phí phát sinh đều được thanh toán tập trung tại trang này qua cổng VNPay (hoặc mô phỏng trong môi trường thử nghiệm).
      </p>

      {cancelRental && (
        <CancelReservationModal rental={cancelRental} onClose={() => setCancelRental(null)} onDone={() => onChanged?.()} />
      )}
    </div>
  )
}
