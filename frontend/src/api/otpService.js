/**
 * ======================================================================
 * FILE: src/api/otpService.js  —  API ĐĂNG KÝ TÀI KHOẢN BẰNG MÃ OTP QUA EMAIL
 * CHỨC NĂNG: Gói 3 bước đăng ký tài khoản có xác thực email: gửi thông tin để nhận mã OTP,
 *   gửi lại mã, và xác nhận mã để tạo tài khoản. Backend tạo, lưu (chỉ lưu bản băm) và kiểm tra mã;
 *   trình duyệt không bao giờ biết mã OTP nên không thể đọc mã trong DevTools hay bỏ qua bước xác thực.
 *   Hết hạn 5 phút, gửi lại sau 60 giây, sai tối đa 5 lần: do backend quyết định và trả thông báo lỗi.
 * THÀNH PHẦN CHÍNH:
 *   - startRegistration     : bước 1, gửi thông tin đăng ký -> backend gửi OTP về email.
 *   - resendRegistrationOtp : gửi lại mã OTP mới.
 *   - verifyRegistrationOtp : bước 2, xác nhận mã -> backend tạo tài khoản.
 *   - toTimes               : đổi mốc thời gian backend trả về sang milisecond để đếm ngược.
 * DÙNG Ở: src/App.jsx (trang Đăng ký).
 * PHỤ THUỘC: ./api (apiPost).
 * API: POST /api/auth/register/start  { fullName, email, password, phoneNumber } -> { email, expiresAt, resendAvailableAt }
 *      POST /api/auth/register/resend { email }                                  -> { email, expiresAt, resendAvailableAt }
 *      POST /api/auth/register/verify { email, otp }                             -> tạo tài khoản (AuthController)
 * LUỒNG: Người dùng điền form Đăng ký -> startRegistration() -> backend gửi OTP về email -> giao diện
 *   đếm ngược theo expiresAt/resendAvailableAt -> người dùng nhập mã -> verifyRegistrationOtp() -> tạo User.
 *   Hết 60 giây có thể bấm "Gửi lại mã" -> resendRegistrationOtp().
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   toTimes: Chuẩn hóa phản hồi của backend về dạng mốc thời gian (milisecond) để giao diện đếm ngược → dùng ở: startRegistration, resendRegistrationOtp
 *   startRegistration: Bước 1 đăng ký: gửi thông tin tài khoản để backend tạo bản đăng ký tạm và gửi mã OTP về email → dùng ở: App.jsx (sendRegistrationOtp)
 *   resendRegistrationOtp: Yêu cầu backend gửi lại mã OTP mới cho email đang đăng ký → dùng ở: App.jsx (resendOtp)
 *   verifyRegistrationOtp: Bước 2 đăng ký: gửi mã OTP người dùng nhập để backend kiểm tra; đúng thì backend tạo tài khoản → dùng ở: App.jsx (verifyOtp)
 */
import { apiPost } from './api'


/**
 * Chuẩn hóa phản hồi của backend về dạng mốc thời gian (milisecond) để giao diện đếm ngược.
 * Nếu backend không trả thì mặc định: mã hết hạn sau 5 phút, được gửi lại sau 60 giây.
 * @param {object} res phản hồi backend { email, expiresAt, resendAvailableAt } (chuỗi ISO).
 * @returns {{email:string, expiresAt:number, resendAvailableAt:number}}
 */
const toTimes = res => ({
  email: res?.email,
  expiresAt: Date.parse(res?.expiresAt) || Date.now() + 5 * 60 * 1000,
  resendAvailableAt: Date.parse(res?.resendAvailableAt) || Date.now() + 60 * 1000
})

// Thời gian chờ mong muốn khi backend gửi mail OTP (35 giây). Lưu ý: apiPost() trong ./api chỉ nhận
// (path, body) nên tham số { timeout } truyền thêm bên dưới KHÔNG có tác dụng; thực tế vẫn là 20 giây mặc định.
const OTP_SEND_TIMEOUT_MS = 35000

/**
 * Bước 1 đăng ký: gửi thông tin tài khoản để backend tạo bản đăng ký tạm và gửi mã OTP về email.
 * API: POST /api/auth/register/start  (AuthController)
 * Được gọi khi người dùng bấm "Đăng ký" trên form đăng ký ở App.jsx.
 * @param {{fullName:string, email:string, password:string, phoneNumber:string}} data thông tin đăng ký.
 * @returns {Promise<{email, expiresAt, resendAvailableAt}>} mốc hết hạn / mốc được gửi lại mã.
 */
export async function startRegistration({ fullName, email, password, phoneNumber }) {
  return toTimes(await apiPost('/api/auth/register/start', { fullName, email, password, phoneNumber }, { timeout: OTP_SEND_TIMEOUT_MS }))
}

/**
 * Yêu cầu backend gửi lại mã OTP mới cho email đang đăng ký.
 * API: POST /api/auth/register/resend  (AuthController)
 * Được gọi khi người dùng bấm "Gửi lại mã" (sau khi hết thời gian chờ 60 giây).
 * @param {string} email email đang đăng ký.
 * @returns {Promise<{email, expiresAt, resendAvailableAt}>} mốc thời gian mới.
 */
export async function resendRegistrationOtp(email) {
  return toTimes(await apiPost('/api/auth/register/resend', { email }, { timeout: OTP_SEND_TIMEOUT_MS }))
}

/**
 * Bước 2 đăng ký: gửi mã OTP người dùng nhập để backend kiểm tra; đúng thì backend tạo tài khoản.
 * API: POST /api/auth/register/verify  (AuthController)
 * Được gọi khi người dùng nhập mã OTP và bấm "Xác nhận".
 * @param {string} email email đang đăng ký.
 * @param {string} otp mã 6 số người dùng nhập.
 * @returns {Promise<any>} dữ liệu backend trả về khi tạo tài khoản thành công; ném ApiError nếu sai / hết hạn.
 */
export async function verifyRegistrationOtp(email, otp) {
  return apiPost('/api/auth/register/verify', { email, otp })
}
