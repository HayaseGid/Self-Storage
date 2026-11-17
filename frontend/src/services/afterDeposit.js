/**
 * ======================================================================
 * FILE: src/services/afterDeposit.js  —  SAU ĐẶT CỌC / GIA HẠN & ĐIỀU HƯỚNG TAB KHÁCH HÀNG
 * CHỨC NĂNG: Xử lý các bước ngay sau khi khách thanh toán cọc hoặc gia hạn: xác nhận đơn để backend
 *   tạo hợp đồng, hiện hộp thoại thông báo thành công, và mở đúng tab "Hợp đồng" để khách ký.
 *   Không còn bước Manager duyệt đơn (Manager chỉ phân Staff bàn giao kho). Ngoài ra file truyền các
 *   "yêu cầu" giữa các trang (mở tab, mở màn ký, mở gia hạn, cuộn tới hợp đồng) qua sessionStorage
 *   + sự kiện window 'storespace:open-section'.
 * THÀNH PHẦN CHÍNH:
 *   - confirmAfterDeposit : xác nhận đơn vừa cọc -> backend tạo hợp đồng.
 *   - openCustomerSection / takeCustomerSection : chuyển tới /customer và mở sẵn tab (ghi / đọc-1-lần).
 *   - announceDepositSuccess / announceRenewalSuccess : hộp thoại "Đặt cọc / Gia hạn thành công".
 *   - requestContractSign / peekContractSignRequest / clearContractSignRequest : yêu cầu mở màn ký 1 hợp đồng.
 *   - requestRenewal / takeRenewalRequest : yêu cầu mở hộp thoại gia hạn 1 đơn.
 *   - focusContract / takePendingContractFocus : cuộn tới thẻ hợp đồng và nháy sáng.
 *   - Các hằng key sessionStorage + OPEN_SECTION_EVENT.
 * DÙNG Ở: src/App.jsx, src/pages/customer/CartPage.jsx, src/pages/customer/CustomerAccount.jsx,
 *   src/pages/payment/PaymentResultPage.jsx, src/features/contract/ContractRenewal.jsx,
 *   src/features/notification/HeaderNotificationBell.jsx, src/features/return/UnitReturn.jsx.
 * PHỤ THUỘC: src/api/api (apiPost); đối tượng dialog từ useDialog() (src/components/common/Dialog.jsx)
 *   được truyền vào các hàm announce...; sessionStorage.
 * API: POST /api/reservation-confirmations/mine (ReservationConfirmationsController: xác nhận đơn + tạo hợp đồng).
 * LUỒNG: Khách trả cọc VNPay xong -> PaymentResultPage/CartPage gọi confirmAfterDeposit(ids)
 *   -> POST /api/reservation-confirmations/mine -> announceDepositSuccess(dialog) -> openCustomerSection(navigate)
 *   lưu 'contract' vào sessionStorage + chuyển /customer -> CustomerAccount gọi takeCustomerSection() mở tab Hợp đồng.
 * ======================================================================
 */
import { apiPost } from '../api/api'

// Key sessionStorage lưu tên tab cần mở khi vào trang /customer.
export const CUSTOMER_SECTION_KEY = 'storespace_customer_section'

/**
 * Xác nhận các đơn vừa thanh toán cọc -> backend xác nhận đơn và tạo hợp đồng.
 * API: POST /api/reservation-confirmations/mine  body { reservationIds } (rỗng = xác nhận mọi đơn đã cọc của khách)
 * Lỗi KHÔNG chặn luồng (trang Hợp đồng sẽ tự thử lại), khi lỗi trả về { confirmed:[], failed:[], error }.
 * Được gọi bởi App.jsx / CartPage / CustomerAccount ngay sau khi thanh toán cọc thành công.
 * @param {number|number[]} reservationIds mã đơn vừa cọc (1 hoặc nhiều).
 * @returns {Promise<object>} kết quả backend { confirmed, failed, contracts } hoặc object lỗi như trên.
 */
export async function confirmAfterDeposit(reservationIds) {
  try {
    const ids = (Array.isArray(reservationIds) ? reservationIds : [reservationIds]).map(Number).filter(Boolean)
    return await apiPost('/api/reservation-confirmations/mine', ids.length ? { reservationIds: ids } : {})
  } catch (error) {
    return { confirmed: [], failed: [], contracts: null, error }
  }
}

/**
 * Chuyển tới trang khách hàng (/customer) và mở sẵn một tab (mặc định 'contract' = Hợp đồng):
 * ghi tên tab vào sessionStorage rồi gọi navigate('/customer').
 * Được gọi sau khi đặt cọc xong (App, CartPage, PaymentResultPage) hoặc khi bấm thông báo (HeaderNotificationBell).
 * @param {Function} navigate hàm điều hướng của App.
 * @param {string} section tên tab.
 */
export function openCustomerSection(navigate, section = 'contract') {
  try { sessionStorage.setItem(CUSTOMER_SECTION_KEY, section) } catch { /* bỏ qua */ }
  navigate('/customer')
}

/**
 * Đọc tab cần mở (đã lưu bởi openCustomerSection) đúng 1 lần rồi xóa khỏi sessionStorage.
 * Được gọi bởi CustomerAccount khi trang tài khoản khách mở ra.
 * @param {string} fallback tab mặc định nếu không có yêu cầu.
 * @returns {string} tên tab cần mở.
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

/**
 * Hiện hộp thoại "Đặt cọc thành công" và nhắc khách ký hợp đồng (chờ khách bấm OK).
 * Được gọi bởi App.jsx / CartPage / PaymentResultPage sau confirmAfterDeposit().
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
 * Key sessionStorage lưu contractId cần mở màn ký (vd sau khi gia hạn: "vui lòng ký phụ lục gia hạn"),
 * và tên sự kiện window để yêu cầu trang khách hàng chuyển sang tab (detail = tên tab).
 * Trang Hợp đồng đọc yêu cầu này khi dữ liệu có hợp đồng đó, rồi mở ContractSignFlow.
 */
export const SIGN_REQUEST_KEY = 'storespace_sign_contract'
export const OPEN_SECTION_EVENT = 'storespace:open-section'

/**
 * Yêu cầu mở màn hình ký cho 1 hợp đồng cụ thể (ví dụ ký phụ lục sau khi gia hạn):
 * lưu contractId vào sessionStorage và phát sự kiện mở tab Hợp đồng.
 * Được gọi bởi ContractRenewal, PaymentResultPage, HeaderNotificationBell, CustomerAccount.
 * @param {number|string} contractId mã hợp đồng cần ký.
 */
export function requestContractSign(contractId) {
  try { sessionStorage.setItem(SIGN_REQUEST_KEY, String(contractId)) } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'contract' }))
}

/**
 * Xem (không xóa) yêu cầu ký hợp đồng đang chờ. CustomerAccount gọi để biết cần mở màn ký hợp đồng nào.
 * @returns {string|null} contractId hoặc null.
 */
export function peekContractSignRequest() {
  try { return sessionStorage.getItem(SIGN_REQUEST_KEY) } catch { return null }
}

/**
 * Xóa yêu cầu ký hợp đồng đang chờ (CustomerAccount gọi sau khi đã mở màn ký).
 */
export function clearContractSignRequest() {
  try { sessionStorage.removeItem(SIGN_REQUEST_KEY) } catch { /* bỏ qua */ }
}

/**
 * Hiện hộp thoại "Gia hạn thành công" và nhắc khách ký phụ lục gia hạn.
 * Được gọi bởi ContractRenewal / PaymentResultPage sau khi thanh toán gia hạn thành công.
 * @param {object} dialog đối tượng từ useDialog().
 * @param {{contractNumber?, renewedFromContractNumber?, amountText?}} options số phụ lục mới, số hợp đồng gốc, chuỗi số tiền.
 */
export async function announceRenewalSuccess(dialog, { contractNumber, renewedFromContractNumber, amountText = '' } = {}) {
  await dialog.alert({
    tone: 'success',
    title: 'Gia hạn thành công',
    message: `Đã ghi nhận thanh toán${amountText ? ` ${amountText}` : ''}${renewedFromContractNumber ? ` cho hợp đồng ${renewedFromContractNumber}` : ''}. Vui lòng ký phụ lục gia hạn${contractNumber ? ` ${contractNumber}` : ''} để hoàn tất. Bạn tiếp tục sử dụng kho như hiện tại, không cần đến cơ sở.`,
    okLabel: 'OK, ký phụ lục'
  })
}

/* Key sessionStorage lưu reservationId cần mở hộp thoại gia hạn (từ thông báo "Kho sắp hết hạn"). */
export const RENEW_REQUEST_KEY = 'storespace_renew_request'
/**
 * Yêu cầu mở hộp thoại gia hạn của 1 đơn (từ thông báo "Kho sắp hết hạn"): lưu reservationId + mở tab Hợp đồng.
 * Được gọi bởi HeaderNotificationBell / CustomerAccount khi khách bấm "Gia hạn" trên thông báo.
 * @param {number|string} reservationId mã đơn cần gia hạn.
 */
export function requestRenewal(reservationId) {
  try { sessionStorage.setItem(RENEW_REQUEST_KEY, String(reservationId)) } catch { /* bỏ qua */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'contract' }))
}
/**
 * Đọc và xóa yêu cầu gia hạn đang chờ (CustomerAccount gọi để mở hộp thoại gia hạn).
 * @returns {string|null} reservationId hoặc null.
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

/* Key sessionStorage lưu reservationId của thẻ hợp đồng cần cuộn tới khi tab Hợp đồng hiển thị xong. */
export const FOCUS_CONTRACT_KEY = 'storespace_focus_contract'

/**
 * Cuộn tới thẻ hợp đồng (phần tử id "contract-{reservationId}") và nháy sáng để khách thấy.
 * Nếu thẻ chưa có trên trang: lưu lại và mở tab Hợp đồng, trang Hợp đồng sẽ cuộn khi hiển thị xong.
 * Được gọi bởi HeaderNotificationBell, ContractRenewal, UnitReturn, CustomerAccount.
 * @param {number|string} reservationId mã đơn của thẻ hợp đồng.
 * @returns {boolean} true nếu cuộn được ngay.
 */
export function focusContract(reservationId) {
  if (reservationId == null) return false
  const el = document.getElementById(`contract-${reservationId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('cc-flash')
    // Đọc offsetWidth để ép trình duyệt vẽ lại, nhờ đó hiệu ứng nháy chạy lại cả khi bấm nhiều lần.
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
 * Đọc và xóa yêu cầu cuộn tới hợp đồng đang chờ (CustomerAccount gọi khi danh sách hợp đồng hiển thị xong).
 * @returns {string|null} reservationId hoặc null.
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
