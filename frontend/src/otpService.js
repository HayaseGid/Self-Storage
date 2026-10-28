export const OTP_EXPIRES_MS = 5 * 60 * 1000
export const OTP_RESEND_MS = 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export function generateOTP() {
  const digits = new Uint32Array(1)
  crypto.getRandomValues(digits)
  return String(digits[0] % 1000000).padStart(6, '0')
}

export async function sendOTPEmail(email, otp, fullName = '') {
  const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:6868').replace(/\/+$/, '')
  const response = await fetch(`${apiUrl}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp, fullName })
  })

  if (!response.ok) {
    let message = 'Không thể gửi mã OTP. Vui lòng thử lại.'
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // Dùng thông báo mặc định nếu backend không trả JSON.
    }
    throw new Error(message)
  }
}
