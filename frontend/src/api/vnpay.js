/**
 * ======================================================================
 * FILE: src/api/vnpay.js  —  API THANH TOÁN QUA CỔNG VNPAY (SANDBOX)
 * Backend: VnPayController (/api/vnpay/create, /api/vnpay/return-verify, /api/vnpay/status).
 * Dùng ở: App.jsx, CartPage, CustomerAccount, PendingPayments, ContractRenewal, UnitReturn, PaymentResultPage.
 * Luồng thanh toán:
 *  1. startVnPayPayment() -> POST /api/vnpay/create -> nhận paymentUrl -> lưu thông tin giao dịch đang chờ
 *     vào sessionStorage -> chuyển trình duyệt sang trang VNPay.
 *  2. VNPay xử lý xong -> chuyển về /payment-result?vnp_... (PaymentResultPage).
 *  3. PaymentResultPage gọi /api/vnpay/return-verify để backend kiểm tra chữ ký & ghi nhận thanh toán,
 *     đọc lại thông tin chờ bằng readPendingVnPay() rồi xóa bằng clearPendingVnPay().
 * Dùng cho nhiều loại khoản thu: tiền cọc (deposit), tiền thuê, gia hạn, phí trả kho... (tham số kind).
 * ======================================================================
 */
import { apiPost } from './api'

/*
 * Thanh toán tiền cọc qua VNPay (sandbox).
 *  1. startVnPayPayment(): backend tạo giao dịch (POST /api/vnpay/create) -> chuyển trình duyệt sang trang VNPay.
 *  2. VNPay chuyển về /payment-result?vnp_... -> PaymentResultPage gọi /api/vnpay/return-verify để kiểm tra
 *     chữ ký và ghi nhận cọc -> "Đặt cọc thành công" -> mở tab Hợp đồng để ký.
 * Thẻ test sandbox (ngân hàng NCB): 9704198526191432198 · NGUYEN VAN A · 07/15 · OTP 123456.
 */

export const VNPAY_PENDING_KEY = 'storespace_vnpay_pending'
export const PAYMENT_RESULT_PATH = '/payment-result'
/* Chỉ bật nút "thanh toán mô phỏng" khi cần demo không có mạng: VITE_ALLOW_SIMULATED_PAYMENT=true trong .env */
export const SIMULATED_PAYMENT_ENABLED = import.meta.env.VITE_ALLOW_SIMULATED_PAYMENT === 'true'

/**
 * Khởi tạo giao dịch VNPay cho 1 hoặc nhiều đơn đặt kho rồi chuyển hướng sang trang thanh toán VNPay.
 * API: POST /api/vnpay/create  body { reservationIds, returnUrl }  -> { paymentUrl, txnRef, amount }
 * Trước khi chuyển trang, lưu { reservationIds, amount, count, label, kind, txnRef, createdAt }
 * vào sessionStorage (key VNPAY_PENDING_KEY) để trang kết quả biết đang thanh toán khoản gì.
 * @param {number|number[]} reservationIds mã đơn đặt kho cần thanh toán.
 * @param {{amount?:number, count?:number, label?:string, kind?:string}} options thông tin hiển thị ở trang kết quả;
 *   kind = loại khoản thu ('deposit' mặc định).
 * @returns {Promise<object>} dữ liệu backend trả về (trình duyệt sẽ rời trang ngay sau đó).
 */
export async function startVnPayPayment(reservationIds, { amount, count, label, kind = 'deposit' } = {}) {
  const ids = (Array.isArray(reservationIds) ? reservationIds : [reservationIds]).map(Number).filter(Boolean)
  const data = await apiPost('/api/vnpay/create', {
    reservationIds: ids,
    returnUrl: `${window.location.origin}${PAYMENT_RESULT_PATH}`
  })
  try {
    sessionStorage.setItem(VNPAY_PENDING_KEY, JSON.stringify({
      reservationIds: ids,
      amount: amount ?? data.amount,
      count: count ?? ids.length,
      label: label || '',
      kind,
      txnRef: data.txnRef,
      createdAt: new Date().toISOString()
    }))
  } catch { /* bỏ qua */ }
  window.location.assign(data.paymentUrl)
  return data
}

/**
 * Đọc thông tin giao dịch VNPay đang chờ (đã lưu khi bắt đầu thanh toán) từ sessionStorage.
 * @returns {object|null}
 */
export function readPendingVnPay() {
  try {
    return JSON.parse(sessionStorage.getItem(VNPAY_PENDING_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Xóa thông tin giao dịch VNPay đang chờ khỏi sessionStorage (gọi sau khi đã xử lý xong kết quả).
 */
export function clearPendingVnPay() {
  try { sessionStorage.removeItem(VNPAY_PENDING_KEY) } catch { /* bỏ qua */ }
}
