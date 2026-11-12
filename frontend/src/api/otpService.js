/**
 * ======================================================================
 * FILE: src/api/otpService.js  —  API ĐĂNG KÝ TÀI KHOẢN BẰNG MÃ OTP QUA EMAIL
 * Backend: AuthController (/api/auth/register/start | resend | verify).
 * Dùng ở: App.jsx (trang Đăng ký -> nhập thông tin -> nhập mã OTP -> tạo tài khoản).
 * Luồng: startRegistration() -> backend gửi mã OTP về email -> người dùng nhập mã
 * -> verifyRegistrationOtp() -> backend tạo User. Có thể resendRegistrationOtp() sau 60 giây.
 * ======================================================================
 */
import { apiPost } from './api'

/*
 * OTP ĐĂNG KÝ TÀI KHOẢN — backend tạo, lưu (chỉ lưu bản băm) và kiểm tra mã.
 * Trình duyệt không bao giờ biết mã OTP, nên không thể đọc mã trong DevTools hay bỏ qua bước xác thực.
 *
 *   POST /api/auth/register/start   { fullName, email, password, phoneNumber } -> { email, expiresAt, resendAvailableAt }
 *   POST /api/auth/register/resend  { email }                                  -> { email, expiresAt, resendAvailableAt }
 *   POST /api/auth/register/verify  { email, otp }                             -> tạo tài khoản
 *
 * Hết hạn 5 phút, gửi lại sau 60 giây, sai tối đa 5 lần: backend quyết định và trả thông báo lỗi.
 */

/**
 * Chuẩn hóa phản hồi của backend về dạng mốc thời gian (milisecond) để giao diện đếm ngược.
 * Nếu backend không trả thì mặc định: mã hết hạn sau 5 phút, được gửi lại sau 60 giây.
 * @returns {{email:string, expiresAt:number, resendAvailableAt:number}}
 */
const toTimes = res => ({
  email: res?.email,
  expiresAt: Date.parse(res?.expiresAt) || Date.now() + 5 * 60 * 1000,
  resendAvailableAt: Date.parse(res?.resendAvailableAt) || Date.now() + 60 * 1000
})

/**
 * Bước 1 đăng ký: gửi thông tin tài khoản để backend tạo bản đăng ký tạm và gửi mã OTP về email.
 * API: POST /api/auth/register/start  (AuthController)
 * @param {{fullName:string, email:string, password:string, phoneNumber:string}} data thông tin đăng ký.
 * @returns {Promise<{email, expiresAt, resendAvailableAt}>} mốc hết hạn / mốc được gửi lại mã.
 */
const OTP_SEND_TIMEOUT_MS = 35000

export async function startRegistration({ fullName, email, password, phoneNumber }) {
  return toTimes(await apiPost('/api/auth/register/start', { fullName, email, password, phoneNumber }, { timeout: OTP_SEND_TIMEOUT_MS }))
}

/**
 * Yêu cầu backend gửi lại mã OTP mới cho email đang đăng ký.
 * API: POST /api/auth/register/resend  (AuthController)
 * @param {string} email
 * @returns {Promise<{email, expiresAt, resendAvailableAt}>}
 */
export async function resendRegistrationOtp(email) {
  return toTimes(await apiPost('/api/auth/register/resend', { email }, { timeout: OTP_SEND_TIMEOUT_MS }))
}

/**
 * Bước 2 đăng ký: gửi mã OTP người dùng nhập để backend kiểm tra; đúng thì backend tạo tài khoản.
 * API: POST /api/auth/register/verify  (AuthController)
 * @param {string} email
 * @param {string} otp mã 6 số người dùng nhập.
 */
export async function verifyRegistrationOtp(email, otp) {
  return apiPost('/api/auth/register/verify', { email, otp })
}
