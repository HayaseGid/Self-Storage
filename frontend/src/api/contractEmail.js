/**
 * ======================================================================
 * FILE: src/api/contractEmail.js  —  GỬI HỢP ĐỒNG THUÊ KHO QUA EMAIL
 * Dùng ở: ContractDetailModal, CustomerAccount (sau khi khách ký hợp đồng / bấm "Gửi email").
 * Luồng gửi (sendContractEmail):
 *  1. Dựng nội dung hợp đồng dạng HTML (buildContractEmailHtml).
 *  2. Ưu tiên gửi qua backend: POST /api/email/send-contract (EmailController, Gmail SMTP).
 *  3. Nếu backend lỗi -> dự phòng gửi trực tiếp qua dịch vụ EmailJS (cần cấu hình biến
 *     VITE_EMAILJS_* trong .env).
 * ======================================================================
 */
/*
 * Gửi hợp đồng thuê kho qua email bằng EmailJS (giống cách gửi OTP trong otpService.js),
 * nên KHÔNG cần sửa backend.
 *
 * Cấu hình (file frontend/.env):
 *   VITE_EMAILJS_SERVICE_ID=...            (dùng chung với OTP)
 *   VITE_EMAILJS_PUBLIC_KEY=...            (dùng chung với OTP)
 *   VITE_EMAILJS_CONTRACT_TEMPLATE_ID=...  (template RIÊNG cho hợp đồng)
 *
 * Template hợp đồng trên EmailJS cần:
 *   - To Email:  {{to_email}}
 *   - Subject:   {{subject}}
 *   - Content:   chọn chế độ "Code" (HTML) và đặt {{{contract_html}}}  (3 dấu ngoặc để giữ định dạng HTML)
 * Các biến khác có thể dùng: {{to_name}}, {{contract_number}}, {{facility_name}}, {{start_date}}, {{end_date}}.
 */
import { contractUnits } from '../features/contract/ContractDocument'
import { describePolicy } from '../services/policies'
import { formatVnd } from '../services/storageRules'
import { apiPost } from './api'

const EMAILJS_SEND_URL = 'https://api.emailjs.com/api/v1.0/email/send'
const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
const CONTRACT_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_CONTRACT_TEMPLATE_ID
const MAX_HTML_LENGTH = 40000 // EmailJS giới hạn dung lượng mỗi lần gửi (~50KB)

/**
 * Escape ký tự đặc biệt HTML (& < > " ') để chèn dữ liệu người dùng vào HTML an toàn.
 */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
/**
 * Định dạng số tiền kiểu Việt Nam kèm chữ "đ" (ví dụ 1500000 -> "1.500.000đ").
 */
const money = value => `${formatVnd(value || 0)}đ`
/**
 * Định dạng thời điểm ISO thành "HH:mm dd/MM/yyyy" theo vi-VN (rỗng nếu không hợp lệ).
 */
const fmtTime = iso => {
  const d = iso ? new Date(iso) : null
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

/**
 * Kiểm tra đã cấu hình đủ biến môi trường EmailJS (service, public key, template hợp đồng) chưa.
 * @returns {boolean}
 */
export const isContractEmailConfigured = () => Boolean(SERVICE_ID && PUBLIC_KEY && CONTRACT_TEMPLATE_ID)

/* Nội dung hợp đồng dạng HTML (inline style để hiển thị đúng trong Gmail/Outlook). Không nhúng ảnh chữ ký vì quá nặng. */
/**
 * Dựng nội dung email hợp đồng dạng HTML (dùng inline style để Gmail/Outlook hiển thị đúng):
 * các bên, thời hạn thuê, giá thuê + tiền cọc, điều khoản chính (lấy từ chính sách), phụ lục danh sách kho
 * và trạng thái chữ ký. Không nhúng ảnh chữ ký vì quá nặng.
 * @param {{group, customer, facilityAddress, signature, policies}} args
 *   group = nhóm hợp đồng { code, rentals[] }, customer = { name, email },
 *   signature = thông tin chữ ký (null nếu chưa ký), policies = chính sách hiện hành.
 * @returns {string} chuỗi HTML.
 */
export function buildContractEmailHtml({ group, customer, facilityAddress, signature, policies }) {
  const rentals = group.rentals
  const first = rentals[0]
  const units = contractUnits(rentals)
  const monthly = rentals.reduce((n, r) => n + Number(r.monthlyPrice || 0), 0)
  const rent = rentals.reduce((n, r) => n + Number(r.rentalAmount || 0), 0)
  const deposit = rentals.reduce((n, r) => n + Number(r.depositAmount || 0), 0)
  // Tạo thẻ tiêu đề mục (h4) có style sẵn.
  const h4 = text => `<h4 style="color:#073d70;margin:16px 0 4px;font-size:15px">${text}</h4>`
  // Tạo 1 ô bảng (td) có viền và padding.
  const td = text => `<td style="border:1px solid #e1e8f0;padding:6px 8px">${text}</td>`
  const terms = ['deposit', 'reservation', 'overdue', 'renewal_return']
    .map(key => describePolicy(key, policies?.[key]))
    .map(item => `<li style="margin:2px 0">${esc(item.summary)}</li>`).join('')

  return `
<div style="max-width:700px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#23475e;font-size:14px;line-height:1.6">
  <p>Xin chào <strong>${esc(customer?.name)}</strong>,</p>
  <p>StoreSpace gửi bạn bản hợp đồng thuê kho <strong>${esc(group.code)}</strong>${signature ? ' đã được ký điện tử' : ''}. Bạn có thể xem và in hợp đồng bất cứ lúc nào trong mục <em>Hợp đồng</em> trên website.</p>
  <div style="border:1px solid #e1e8f0;border-radius:10px;padding:20px;margin-top:14px">
    <h2 style="text-align:center;color:#073d70;margin:0;font-size:19px">HỢP ĐỒNG THUÊ KHO LƯU TRỮ</h2>
    <p style="text-align:center;color:#8197ab;margin:4px 0 12px">Số: ${esc(group.code)}${first.reservationCode ? ` · Đơn ${esc(first.reservationCode)}` : ''}</p>
    ${h4('Điều 1. Các bên')}
    <p style="margin:0"><strong>Bên cho thuê:</strong> StoreSpace – ${esc(first.facility)}${facilityAddress ? `, ${esc(facilityAddress)}` : ''}.</p>
    <p style="margin:0"><strong>Bên thuê:</strong> ${esc(customer?.name)} · ${esc(customer?.email)}</p>
    ${h4('Điều 2. Đối tượng và thời hạn thuê')}
    <p style="margin:0">${units.length} kho tại Phụ lục 01, thời hạn ${esc(first.months)} tháng, từ <strong>${esc(first.startDate)}</strong> đến hết <strong>${esc(first.endDate)}</strong>.</p>
    ${h4('Điều 3. Giá thuê và tiền cọc')}
    <p style="margin:0">Tiền thuê mỗi tháng: <strong>${money(monthly)}</strong> · Tổng tiền thuê: <strong>${money(rent)}</strong> · Tiền cọc đã thanh toán: <strong>${money(deposit)}</strong>.</p>
    ${h4('Điều 4. Điều khoản chính')}
    <ul style="margin:0;padding-left:18px">${terms}</ul>
    ${h4('Phụ lục 01. Danh sách kho thuê')}
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f5faff">${['#', 'Kho', 'Loại · Kích thước', 'Giá / tháng'].map(x => `<th style="border:1px solid #e1e8f0;padding:6px 8px;text-align:left">${x}</th>`).join('')}</tr>
      ${units.map((u, i) => `<tr>${td(i + 1)}${td(`<strong>${esc(u.number)}</strong>`)}${td(esc(`${u.type || '—'} · ${u.size || '—'}`))}${td(u.monthlyPrice != null ? money(u.monthlyPrice) : '—')}</tr>`).join('')}
    </table>
    ${h4('Xác nhận của bên thuê')}
    <p style="margin:0">${signature
      ? `Đã ký điện tử bởi <strong>${esc(signature.signerName || customer?.name)}</strong> lúc ${esc(fmtTime(signature.signedAt))}.`
      : '<span style="color:#9a6700">Hợp đồng chưa được ký. Vui lòng đăng nhập StoreSpace để ký online.</span>'}</p>
  </div>
  <p style="color:#8197ab;font-size:12px;margin-top:14px">Chữ ký điện tử có giá trị như chữ ký tay theo Luật Giao dịch điện tử. Email được gửi tự động từ hệ thống StoreSpace, vui lòng không trả lời.</p>
</div>`.trim()
}

/**
 * Gửi email hợp đồng cho khách hàng.
 * API chính: POST /api/email/send-contract  (EmailController — gửi bằng Gmail SMTP phía backend).
 * Dự phòng: gọi trực tiếp https://api.emailjs.com/api/v1.0/email/send nếu backend lỗi.
 * @param {{group, customer, facilityAddress, signature, policies}} args giống buildContractEmailHtml.
 * @returns {Promise<{sentTo:string}>} email đã gửi tới.
 * @throws {Error} khi tài khoản không có email, chưa cấu hình EmailJS, hoặc nội dung quá dài.
 */
export async function sendContractEmail({ group, customer, facilityAddress, signature, policies }) {
  if (!customer?.email) throw new Error('Tài khoản chưa có email.')
  const html = buildContractEmailHtml({ group, customer, facilityAddress, signature, policies })
  const first = group.rentals[0]
  const subject = `[StoreSpace] Hợp đồng thuê kho ${group.code}${signature ? ' (đã ký)' : ''}`

  // 1. Ưu tiên gửi qua Backend Gmail SMTP (bền vững, không giới hạn lượt gửi)
  try {
    await apiPost('/api/email/send-contract', {
      toEmail: customer.email,
      toName: customer.name,
      subject,
      contractNumber: group.code,
      facilityName: first?.facility,
      startDate: first?.startDate,
      endDate: first?.endDate,
      contractHtml: html
    })
    return { sentTo: customer.email }
  } catch (backendError) {
    console.warn('Gửi hợp đồng qua Backend SMTP gặp sự cố, chuyển sang EmailJS fallback:', backendError.message)
  }

  // 2. Fallback sang EmailJS nếu backend chưa phản hồi
  if (!isContractEmailConfigured()) {
    throw new Error('Chưa thể gửi email hợp đồng. Vui lòng thử lại sau ít phút hoặc in hợp đồng dạng PDF.')
  }
  if (html.length > MAX_HTML_LENGTH) throw new Error('Hợp đồng quá dài để gửi qua email. Vui lòng dùng In / Lưu PDF.')

  const response = await fetch(EMAILJS_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: CONTRACT_TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        to_email: customer.email,
        to_name: customer.name,
        subject,
        contract_number: group.code,
        facility_name: first.facility,
        start_date: first.startDate,
        end_date: first.endDate,
        contract_html: html
      }
    })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || 'EmailJS không gửi được email hợp đồng.')
  return { sentTo: customer.email }
}
