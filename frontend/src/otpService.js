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

const toTimes = res => ({
  email: res?.email,
  expiresAt: Date.parse(res?.expiresAt) || Date.now() + 5 * 60 * 1000,
  resendAvailableAt: Date.parse(res?.resendAvailableAt) || Date.now() + 60 * 1000
})

export async function startRegistration({ fullName, email, password, phoneNumber }) {
  return toTimes(await apiPost('/api/auth/register/start', { fullName, email, password, phoneNumber }))
}

export async function resendRegistrationOtp(email) {
  return toTimes(await apiPost('/api/auth/register/resend', { email }))
}

export async function verifyRegistrationOtp(email, otp) {
  return apiPost('/api/auth/register/verify', { email, otp })
}
