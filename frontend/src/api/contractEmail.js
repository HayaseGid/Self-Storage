/**
 * ======================================================================
 * FILE: src/api/contractEmail.js  —  GỬI HỢP ĐỒNG THUÊ KHO QUA EMAIL
 * CHỨC NĂNG: Dựng bản hợp đồng thuê kho dạng HTML (inline style để Gmail/Outlook hiển thị đúng)
 *   từ dữ liệu nhóm hợp đồng + chính sách hiện hành, rồi nhờ backend gửi tới email khách.
 *   Dùng sau khi khách ký hợp đồng hoặc khi bấm "Gửi email" trong chi tiết hợp đồng.
 * THÀNH PHẦN CHÍNH:
 *   - buildContractEmailHtml : dựng chuỗi HTML hợp đồng (các bên, thời hạn, giá, điều khoản, phụ lục kho, chữ ký).
 *   - sendContractEmail      : gọi backend gửi email hợp đồng.
 *   - esc / money / fmtTime  : hàm phụ escape HTML, định dạng tiền "1.500.000đ", định dạng giờ ngày.
 * DÙNG Ở: src/features/contract/ContractDetailModal.jsx, src/pages/customer/CustomerAccount.jsx.
 * PHỤ THUỘC: ./api (apiPost), src/features/contract/ContractDocument (contractUnits: gom danh sách kho),
 *   src/services/policies (describePolicy: câu tóm tắt điều khoản), src/services/storageRules (formatVnd).
 * API: POST /api/email/send-contract (EmailController -> EmailService: Brevo HTTP API / SMTP).
 * LUỒNG: Khách bấm "Gửi email" / ký xong -> sendContractEmail() -> buildContractEmailHtml() dựng HTML
 *   -> POST /api/email/send-contract -> backend gửi mail -> trả { sentTo } để giao diện báo thành công.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   esc: Escape ký tự đặc biệt HTML (& < > " ') để chèn dữ liệu người dùng vào HTML an toàn → dùng ở: buildContractEmailHtml
 *   money: Định dạng số tiền kiểu Việt Nam kèm chữ "đ" (ví dụ 1500000 -> "1.500.000đ") → dùng ở: buildContractEmailHtml
 *   fmtTime: Định dạng thời điểm ISO thành "HH:mm dd/MM/yyyy" theo vi-VN (rỗng nếu không hợp lệ) → dùng ở: buildContractEmailHtml
 *   buildContractEmailHtml: Dựng nội dung email hợp đồng dạng HTML (dùng inline style để Gmail/Outlook hiển thị đúng): các bên, thời hạn thuê, giá thuê + tiền cọc → dùng ở: sendContractEmail
 *   h4: Tạo thẻ tiêu đề mục (h4) có style sẵn → dùng ở: buildContractEmailHtml
 *   td: Tạo 1 ô bảng (td) có viền và padding → dùng ở: buildContractEmailHtml
 *   sendContractEmail: Gửi email hợp đồng cho khách hàng qua Backend (Brevo HTTP API / SMTP) → dùng ở: ContractDetailModal.jsx (sendMail), CustomerAccount.jsx (signGroupContracts)
 */
import { contractUnits } from '../features/contract/ContractDocument'
import { describePolicy } from '../services/policies'
import { formatVnd } from '../services/storageRules'
import { apiPost } from './api'

// Thời gian chờ mong muốn khi gửi mail (35 giây). Lưu ý: apiPost() trong ./api hiện chỉ nhận (path, body)
// nên tham số { timeout } truyền thêm ở sendContractEmail KHÔNG có tác dụng; thực tế vẫn dùng timeout mặc định 20 giây.
const CONTRACT_SEND_TIMEOUT_MS = 35000

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
 * Dựng nội dung email hợp đồng dạng HTML (dùng inline style để Gmail/Outlook hiển thị đúng):
 * các bên, thời hạn thuê, giá thuê + tiền cọc, điều khoản chính (lấy từ chính sách), phụ lục danh sách kho
 * và trạng thái chữ ký. Không nhúng ảnh chữ ký vì quá nặng.
 * @param {{group, customer, facilityAddress, signature, policies}} args
 *   group = nhóm hợp đồng { code, rentals[] }, customer = { name, email },
 *   signature = thông tin chữ ký (null nếu chưa ký), policies = chính sách hiện hành.
 * @returns {string} chuỗi HTML.
 * Được gọi bởi sendContractEmail (cùng file). Không gọi API.
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
</div>`.trim()
}

/**
 * Gửi email hợp đồng cho khách hàng qua Backend (Brevo HTTP API / SMTP).
 * API: POST /api/email/send-contract  (EmailController).
 * @param {{group, customer, facilityAddress, signature, policies}} args giống buildContractEmailHtml.
 * @returns {Promise<{sentTo:string}>} email đã gửi tới.
 * @throws {Error} nếu khách chưa có email; ApiError nếu backend gửi thất bại.
 * Được gọi bởi ContractDetailModal / CustomerAccount khi khách bấm "Gửi email" hoặc vừa ký hợp đồng.
 */
export async function sendContractEmail({ group, customer, facilityAddress, signature, policies }) {
  if (!customer?.email) throw new Error('Tài khoản chưa có email.')
  const html = buildContractEmailHtml({ group, customer, facilityAddress, signature, policies })
  const first = group.rentals[0]
  const subject = `[StoreSpace] Hợp đồng thuê kho ${group.code}${signature ? ' (đã ký)' : ''}`

  await apiPost('/api/email/send-contract', {
    toEmail: customer.email,
    toName: customer.name,
    subject,
    contractNumber: group.code,
    facilityName: first?.facility,
    startDate: first?.startDate,
    endDate: first?.endDate,
    contractHtml: html
  }, { timeout: CONTRACT_SEND_TIMEOUT_MS })

  return { sentTo: customer.email }
}
