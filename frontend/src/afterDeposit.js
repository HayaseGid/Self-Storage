import { apiPost } from './api'

/*
 * Luồng mới (29/10/2026): KHÔNG còn bước Manager duyệt.
 * Khách thanh toán cọc xong -> hệ thống xác nhận đơn + tạo hợp đồng ngay
 * (POST /api/reservation-confirmations/mine) -> thông báo "Đặt cọc thành công" -> mở tab Hợp đồng để ký.
 * Manager chỉ còn phân Staff bàn giao kho.
 */

export const CUSTOMER_SECTION_KEY = 'storespace_customer_section'

/* Xác nhận các đơn vừa thanh toán. Lỗi không chặn luồng: trang Hợp đồng sẽ tự thử lại. */
export async function confirmAfterDeposit(reservationIds) {
  try {
    const ids = (Array.isArray(reservationIds) ? reservationIds : [reservationIds]).map(Number).filter(Boolean)
    return await apiPost('/api/reservation-confirmations/mine', ids.length ? { reservationIds: ids } : {})
  } catch (error) {
    return { confirmed: [], failed: [], contracts: null, error }
  }
}

/* Mở trang khách hàng ở đúng tab (mặc định: Hợp đồng). */
export function openCustomerSection(navigate, section = 'contract') {
  try { sessionStorage.setItem(CUSTOMER_SECTION_KEY, section) } catch { /* bỏ qua */ }
  navigate('/customer')
}

/* CustomerDashboard đọc 1 lần khi mở. */
export function takeCustomerSection(fallback = 'overview') {
  try {
    const value = sessionStorage.getItem(CUSTOMER_SECTION_KEY)
    sessionStorage.removeItem(CUSTOMER_SECTION_KEY)
    return value || fallback
  } catch {
    return fallback
  }
}

/* Thông báo sau khi đặt cọc. count = số hợp đồng cần ký. */
export async function announceDepositSuccess(dialog, { count = 1, amountText = '', failed = false } = {}) {
  await dialog.alert({
    tone: 'success',
    title: 'Đặt cọc thành công',
    message: failed
      ? `Đã ghi nhận tiền cọc${amountText ? ` ${amountText}` : ''}. Hợp đồng đang được tạo, bạn có thể ký ngay trong mục Hợp đồng.`
      : `Đã ghi nhận tiền cọc${amountText ? ` ${amountText}` : ''}. Vui lòng ký ${count > 1 ? `${count} hợp đồng (mỗi kho một hợp đồng)` : 'hợp đồng'} để hoàn tất đặt kho.`,
    okLabel: 'OK, ký hợp đồng'
  })
}
