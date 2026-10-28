const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send'

export const OTP_EXPIRES_MS = 5 * 60 * 1000
export const OTP_RESEND_MS = 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

export function generateOTP() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1)
    globalThis.crypto.getRandomValues(values)
    return String(values[0] % 1000000).padStart(6, '0')
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function sendOTPEmail(email, otp, fullName) {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error('EmailJS chưa được cấu hình. Hãy kiểm tra VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID và VITE_EMAILJS_PUBLIC_KEY trong file .env.')
  }

  const response = await fetch(EMAILJS_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        to_email: email,
        to_name: fullName,
        otp
      }
    })
  })

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(responseText || 'EmailJS không thể gửi email OTP.')
  }

  return responseText
}
