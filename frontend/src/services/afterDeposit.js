/**
 * ======================================================================
 * FILE: src/services/afterDeposit.js  —  XỬ LÝ SAU KHI ĐẶT CỌC / GIA HẠN & ĐIỀU HƯỚNG GIỮA CÁC TAB KHÁCH HÀNG
 * Luồng sau đặt cọc (từ 29/10/2026 không còn bước Manager duyệt):
 *   Khách trả cọc xong -> confirmAfterDeposit() gọi POST /api/reservation-confirmations/mine
 *   (ReservationConfirmationsController: xác nhận đơn + tạo hợp đồng) -> announceDepositSuccess()
 *   -> openCustomerSection() mở tab "Hợp đồng" để khách ký.
 * Các hàm request…, take…, peek…: truyền "yêu cầu mở tab / mở hợp đồng / mở gia hạn" giữa các trang
 * thông qua sessionStorage + sự kiện window 'storespace:open-section'.
 * Dùng ở: App, CartPage, CustomerAccount, ContractRenewal, HeaderNotificationBell, UnitReturn.
 * ======================================================================
 */
import { apiPost } from '../api/api'

/*
 * Luồng mới (29/10/2026): KHÔNG còn bước Manager duyệt.
 * Khách thanh toán cọc xong -> hệ thống xác nhận đơn + tạo hợp đồng ngay
 * (POST /api/reservation-confirmations/mine) -> thông báo "Đặt cọc thành công" -> mở tab Hợp đồng để ký.
 * Manager chỉ còn phân Staff bàn giao kho.
 */

export const CUSTOMER_SECTION_KEY = 'storespace_customer_section'

/* Xác nhận các đơn vừa thanh toán. Lỗi không chặn luồng: trang Hợp đồng sẽ tự thử lại. */
/**
 * Xác nhận các đơn vừa thanh toán cọc -> backend xác nhận đơn và tạo hợp đồng.
 * API: POST /api/reservation-confirmations/mine  body { reservationIds } (rỗng = xác nhận mọi đơn đã cọc của khách)
 * Lỗi KHÔNG chặn luồng (trang Hợp đồng sẽ tự thử lại), khi lỗi trả về { confirmed:[], failed:[], error }.
 * @param {number|number[]} reservationIds
 */
export async function confirmAfterDeposit(reservationIds) {
  try {
    const ids = (Array.isArray(reservationIds) ? reservationIds : [reservationIds]).map(Number).filter(Boolean)
    return await apiPost('/api/reservation-confirmations/mine', ids.length ? { reservationIds: ids } : {})
  } catch (error) {
    return { confirmed: [], failed: [], contracts: null, error }
  }
}

/* Mở trang khách hàng ở đúng tab (mặc định: Hợp đồng). */
/**
 * Chuyển tới trang khách hàng (/customer) và mở sẵn một tab (mặc định 'contract' = Hợp đồng).
 * @param {Function} navigate hàm điều hướng của App.
 * @param {string} section tên tab.
 */
export function openCustomerSection(navigate, section = 'contract') {
  try { sessionStorage.setItem(CUSTOMER_SECTION_KEY, section) } catch { /* bỏ qua */ }
  navigate('/customer')
}

/* CustomerDashboard đọc 1 lần khi mở. */
/**
 * Đọc tab cần mở (đã lưu bởi openCustomerSection) đúng 1 lần rồi xóa. CustomerDashboard gọi khi mở trang.
 * @param {string} fallback tab mặc định nếu không có yêu cầu.
 */
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
/**
 * Hiện hộp thoại "Đặt cọc thành công" và nhắc khách ký hợp đồng.
 * @param {object} dialog đối tượng từ useDialog().
 * @param {{count?:number, amountText?:string, failed?:boolean}} options count = số hợp đồng cần ký,
 *   failed = true khi xác nhận đơn lỗi (hợp đồng đang được tạo).
 */
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

/*
 * Mở màn hình ký cho một hợp đồng cụ thể (dùng sau khi gia hạn: "Gia hạn thành công, vui lòng ký phụ lục gia hạn").
 * Trang Hợp đồng đọc yêu cầu này khi dữ liệu có hợp đồng đó, rồi mở ContractSignFlow.
 */
export const SIGN_REQUEST_KEY = 'storespace_sign_contract'
export const OPEN_SECTION_EVENT = 'storespace:open-section'

/**
 * Yêu cầu mở màn hình ký cho 1 hợp đồng cụ thể (ví dụ ký phụ lục sau khi gia hạn):
 * lưu contractId vào sessionStorage và phát sự kiện mở tab Hợp đồng.
 */
export function requestContractSign(contractId) {
  try { sessionStorage.setItem(SIGN_REQUEST_KEY, String(contractId)) } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'contract' }))
}

/**
 * Xem (không xóa) yêu cầu ký hợp đồng đang chờ.
 * @returns {string|null} contractId
 */
export function peekContractSignRequest() {
  try { return sessionStorage.getItem(SIGN_REQUEST_KEY) } catch { return null }
}

/**
 * Xóa yêu cầu ký hợp đồng đang chờ.
 */
export function clearContractSignRequest() {
  try { sessionStorage.removeItem(SIGN_REQUEST_KEY) } catch { /* bỏ qua */ }
}

/* Thông báo sau khi gia hạn thành công. */
/**
 * Hiện hộp thoại "Gia hạn thành công" và nhắc khách ký phụ lục gia hạn.
 * @param {object} dialog
 * @param {{contractNumber?, renewedFromContractNumber?, amountText?}} options
 */
export async function announceRenewalSuccess(dialog, { contractNumber, renewedFromContractNumber, amountText = '' } = {}) {
  await dialog.alert({
    tone: 'success',
    title: 'Gia hạn thành công',
    message: `Đã ghi nhận thanh toán${amountText ? ` ${amountText}` : ''}${renewedFromContractNumber ? ` cho hợp đồng ${renewedFromContractNumber}` : ''}. Vui lòng ký phụ lục gia hạn${contractNumber ? ` ${contractNumber}` : ''} để hoàn tất. Bạn tiếp tục sử dụng kho như hiện tại, không cần đến cơ sở.`,
    okLabel: 'OK, ký phụ lục'
  })
}

/* Mở hộp thoại gia hạn của một hợp đồng (từ thông báo "Kho sắp hết hạn"). */
export const RENEW_REQUEST_KEY = 'storespace_renew_request'
/**
 * Yêu cầu mở hộp thoại gia hạn của 1 đơn (từ thông báo "Kho sắp hết hạn"): lưu reservationId + mở tab Hợp đồng.
 */
export function requestRenewal(reservationId) {
  try { sessionStorage.setItem(RENEW_REQUEST_KEY, String(reservationId)) } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'contract' }))
}
/**
 * Đọc và xóa yêu cầu gia hạn đang chờ (trả về reservationId hoặc null).
 */
export function takeRenewalRequest() {
  try {
    const value = sessionStorage.getItem(RENEW_REQUEST_KEY)
    sessionStorage.removeItem(RENEW_REQUEST_KEY)
    return value
  } catch {
    return null
  }
}

/*
 * Cuộn tới thẻ hợp đồng (id "contract-{reservationId}") trong trang Hợp đồng và nháy sáng để khách thấy ngay.
 * Nếu đang ở trang khác: lưu lại, chuyển sang tab Hợp đồng, ContractPage sẽ cuộn khi hiển thị xong.
 */
export const FOCUS_CONTRACT_KEY = 'storespace_focus_contract'

/**
 * Cuộn tới thẻ hợp đồng (phần tử id "contract-{reservationId}") và nháy sáng để khách thấy.
 * Nếu thẻ chưa có trên trang: lưu lại và mở tab Hợp đồng, trang Hợp đồng sẽ cuộn khi hiển thị xong.
 * @returns {boolean} true nếu cuộn được ngay.
 */
export function focusContract(reservationId) {
  if (reservationId == null) return false
  const el = document.getElementById(`contract-${reservationId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('cc-flash')
    void el.offsetWidth
    el.classList.add('cc-flash')
    window.setTimeout(() => el.classList.remove('cc-flash'), 2600)
    return true
  }
  try { sessionStorage.setItem(FOCUS_CONTRACT_KEY, String(reservationId)) } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'contract' }))
  return false
}

/**
 * Đọc và xóa yêu cầu cuộn tới hợp đồng đang chờ (trả về reservationId hoặc null).
 */
export function takePendingContractFocus() {
  try {
    const value = sessionStorage.getItem(FOCUS_CONTRACT_KEY)
    if (value) sessionStorage.removeItem(FOCUS_CONTRACT_KEY)
    return value
  } catch {
    return null
  }
}
