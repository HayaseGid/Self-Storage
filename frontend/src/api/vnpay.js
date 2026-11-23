/**
 * ======================================================================
 * FILE: src/api/vnpay.js  —  API THANH TOÁN QUA CỔNG VNPAY (SANDBOX)
 * CHỨC NĂNG: Khởi tạo giao dịch VNPay cho 1 hoặc nhiều đơn đặt kho, ghi nhớ giao dịch đang chờ vào
 *   sessionStorage rồi chuyển trình duyệt sang trang VNPay; cung cấp hàm đọc/xóa giao dịch chờ cho
 *   trang kết quả. Dùng cho nhiều khoản thu: tiền cọc (deposit), tiền thuê, gia hạn, phí trả kho... (tham số kind).
 *   Thẻ test sandbox (ngân hàng NCB): 9704198526191432198 · NGUYEN VAN A · 07/15 · OTP 123456.
 * THÀNH PHẦN CHÍNH:
 *   - startVnPayPayment         : tạo giao dịch + chuyển sang VNPay.
 *   - readPendingVnPay / clearPendingVnPay : đọc / xóa giao dịch đang chờ trong sessionStorage.
 *   - SIMULATED_PAYMENT_ENABLED : cờ bật nút "thanh toán mô phỏng" (VITE_ALLOW_SIMULATED_PAYMENT=true).
 *   - VNPAY_PENDING_KEY, PAYMENT_RESULT_PATH : hằng số key sessionStorage và đường dẫn trang kết quả.
 * DÙNG Ở: src/App.jsx, src/pages/customer/CartPage.jsx, src/pages/customer/CustomerAccount.jsx,
 *   src/features/payment/PendingPayments.jsx, src/features/contract/ContractRenewal.jsx,
 *   src/features/return/UnitReturn.jsx (startVnPayPayment, SIMULATED_PAYMENT_ENABLED);
 *   src/pages/payment/PaymentResultPage.jsx (readPendingVnPay, clearPendingVnPay).
 * PHỤ THUỘC: ./api (apiPost); sessionStorage key 'storespace_vnpay_pending'.
 * API: POST /api/vnpay/create (VnPayController). Bước kiểm tra kết quả /api/vnpay/return-verify
 *   do PaymentResultPage tự gọi, không nằm trong file này.
 * LUỒNG: Khách bấm "Thanh toán VNPay" -> startVnPayPayment(ids) -> POST /api/vnpay/create -> nhận paymentUrl
 *   -> lưu giao dịch chờ vào sessionStorage -> chuyển sang VNPay -> VNPay trả về /payment-result?vnp_...
 *   -> PaymentResultPage gọi return-verify, đọc readPendingVnPay() để biết khoản gì, rồi clearPendingVnPay().
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   startVnPayPayment: Khởi tạo giao dịch VNPay cho 1 hoặc nhiều đơn đặt kho rồi chuyển hướng sang trang thanh toán VNPay → dùng ở: App.jsx (handleDepositPaid), ContractRenewal.jsx (payRenewal), PendingPayments.jsx (payWithVnPay, payRentBill) +3
 *   readPendingVnPay: Đọc thông tin giao dịch VNPay đang chờ (đã lưu khi bắt đầu thanh toán) từ sessionStorage → dùng ở: PaymentResultPage.jsx (PaymentResultPage)
 *   clearPendingVnPay: Xóa thông tin giao dịch VNPay đang chờ khỏi sessionStorage → dùng ở: PaymentResultPage.jsx (releaseHeld, PaymentResultPage)
 */
import { apiPost } from './api'

// Key sessionStorage lưu giao dịch VNPay đang chờ, và đường dẫn trang VNPay trả về sau khi thanh toán.
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
 * Được gọi bởi PaymentResultPage khi VNPay chuyển trình duyệt về /payment-result.
 * @returns {object|null} { reservationIds, amount, count, label, kind, txnRef, createdAt } hoặc null.
 */
export function readPendingVnPay() {
  try {
    return JSON.parse(sessionStorage.getItem(VNPAY_PENDING_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Xóa thông tin giao dịch VNPay đang chờ khỏi sessionStorage.
 * Được gọi bởi PaymentResultPage sau khi đã xử lý xong kết quả thanh toán.
 */
export function clearPendingVnPay() {
  try { sessionStorage.removeItem(VNPAY_PENDING_KEY) } catch { /* bỏ qua */ }
}
