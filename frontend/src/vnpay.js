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

export async function startVnPayPayment(reservationIds, { amount, count, label } = {}) {
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
      txnRef: data.txnRef,
      createdAt: new Date().toISOString()
    }))
  } catch { /* bỏ qua */ }
  window.location.assign(data.paymentUrl)
  return data
}

export function readPendingVnPay() {
  try {
    return JSON.parse(sessionStorage.getItem(VNPAY_PENDING_KEY) || 'null')
  } catch {
    return null
  }
}

export function clearPendingVnPay() {
  try { sessionStorage.removeItem(VNPAY_PENDING_KEY) } catch { /* bỏ qua */ }
}
