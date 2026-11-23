/**
 * ======================================================================
 * FILE: src/features/contract/ContractDetailModal.jsx  —  HỘP THOẠI CHI TIẾT HỢP ĐỒNG (PHÍA KHÁCH)
 * CHỨC NĂNG: Hộp thoại xem hợp đồng ở MỌI giai đoạn: đang tạo (bản xem trước) -> chờ ký -> đã ký chờ nhận kho
 *   -> đang hiệu lực. Hiện thanh tiến trình 4 bước, bảng tóm tắt tiền, toàn văn hợp đồng (ContractDocument có điều khoản
 *   chi tiết + Phụ lục kho + chữ ký). Cho In / Lưu PDF, gửi hợp đồng qua email, và các nút Ký / Gia hạn / Hủy đặt kho.
 *   Luồng mới: không còn bước Manager duyệt, đặt cọc xong là hợp đồng được tạo để ký.
 * THÀNH PHẦN CHÍNH:
 *   - ContractDetailModal (default export): component hộp thoại.
 *   - contractStage(rentals): xác định giai đoạn hợp đồng (approval / preparing / toSign / signed / active).
 *   - STAGE_LABEL: nhãn + màu badge cho từng giai đoạn.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx.
 * PHỤ THUỘC: api/api (apiGet), services/storageRules (formatVnd), ./ContractDocument, api/contractEmail
 *   (sendContractEmail), services/policies (usePolicies), ContractSignFlow.css.
 * API: GET /api/contracts/{contractId}/signature (ContractsController) — lấy ảnh chữ ký nếu đã ký;
 *      POST /api/email/send-contract (qua sendContractEmail; backend gửi bằng Brevo) — gửi hợp đồng qua email.
 * LUỒNG: khách bấm "Xem chi tiết hợp đồng" trên ContractCard -> CustomerAccount mở hộp thoại với group
 *   -> useEffect gọi GET .../signature cho từng contractId tới khi thấy chữ ký -> hiện văn bản + chữ ký
 *   -> bấm "Gửi qua email" -> sendMail() -> POST /api/email/send-contract -> hiện thông báo kết quả;
 *   bấm "Ký hợp đồng" -> onSign(group) -> CustomerAccount mở ContractSignFlow.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng số tiền thành chuỗi kiểu Việt Nam kèm "đ" (rỗng -> "0đ") → dùng ở: ContractDetailModal
 *   contractStage: Xác định giai đoạn của hợp đồng từ trạng thái đơn/hợp đồng: 'toSign' (chờ ký, kể cả phụ lục gia hạn), 'active' (đang thuê), 'signed' → dùng ở: ContractDetailModal
 *   ContractDetailModal: Hộp thoại chi tiết hợp đồng cho khách: badge giai đoạn, tiến trình 4 bước, tóm tắt tiền, văn bản hợp đồng, các nút In/PDF, Gửi email → dùng ở: CustomerAccount.jsx (ContractPage)
 *   sendMail: Gửi hợp đồng qua email cho khách và hiện kết quả trong khung thông báo (state mail) → dùng ở: ContractDetailModal
 */
import React, { useEffect, useState } from 'react'
import { apiGet } from '../../api/api'
import { formatVnd } from '../../services/storageRules'
import ContractDocument, { contractUnits } from './ContractDocument'
import { sendContractEmail } from '../../api/contractEmail'
import { usePolicies } from '../../services/policies'
import './ContractSignFlow.css'

/**
 * Định dạng số tiền thành chuỗi kiểu Việt Nam kèm "đ" (rỗng -> "0đ").
 * @param {number} value số tiền.
 * @returns {string}
 */
const money = value => `${formatVnd(value || 0)}đ`

/**
 * Xác định giai đoạn của hợp đồng từ trạng thái đơn/hợp đồng:
 * 'toSign' (chờ ký, kể cả phụ lục gia hạn), 'active' (đang thuê), 'signed' (đã ký chờ nhận kho),
 * 'preparing' (đã xác nhận nhưng chưa có hợp đồng), 'approval' (đang tạo).
 * Chỉ xét đơn đầu tiên của nhóm (các đơn trong nhóm cùng trạng thái).
 * @param {object[]} rentals các đơn trong nhóm hợp đồng (dùng status, contractStatus, contractId, isRenewal, renewedFrom).
 * @returns {'toSign'|'active'|'signed'|'preparing'|'approval'}
 * Được gọi bởi: ContractDetailModal (chọn nhãn badge, bước tiến trình, có hiện nút Ký hay không).
 */
export function contractStage(rentals) {
  const r = rentals[0] || {}
  // Phụ lục gia hạn: khách đang dùng kho (Handed Over) nhưng phụ lục chưa ký.
  if (r.status === 'Handed Over' && (r.isRenewal || r.renewedFrom) && r.contractId && r.contractStatus === 'Pending Signature') return 'toSign'
  if (r.status === 'Handed Over') return 'active'
  if (r.contractStatus === 'Signed' || r.contractStatus === 'Active') return r.status === 'Handed Over' ? 'active' : 'signed'
  if (r.status === 'Confirmed' && r.contractId) return 'toSign'
  if (r.status === 'Confirmed') return 'preparing'
  return 'approval'
}

/** Giai đoạn -> [chữ hiện trên badge, class màu badge (wait/todo/done)]. */
const STAGE_LABEL = {
  approval: ['Đang tạo hợp đồng', 'wait'],
  preparing: ['Đang tạo hợp đồng', 'wait'],
  toSign: ['Chờ bạn ký', 'todo'],
  signed: ['Đã ký · Chờ nhận kho', 'done'],
  active: ['Đang hiệu lực', 'done']
}

/**
 * Hộp thoại chi tiết hợp đồng cho khách: badge giai đoạn, tiến trình 4 bước, tóm tắt tiền, văn bản hợp đồng,
 * các nút In/PDF, Gửi email, Hủy đặt kho, Gia hạn, Ký, Đóng. Nhấn Esc hoặc bấm nền tối để đóng.
 * @param {object} props
 * @param {{key, code, title, rentals: object[], renewedFrom?}} props.group nhóm hợp đồng (1 hoặc nhiều đơn).
 * @param {{name, email, phone}} props.customer thông tin khách (in vào văn bản, gửi email).
 * @param {string} [props.facilityAddress] địa chỉ cơ sở.
 * @param {object} [props.knownSignature] chữ ký đã biết sẵn -> không cần gọi API lấy chữ ký.
 * @param {{tone, text}} [props.autoMailResult] kết quả gửi email tự động ngay sau khi ký (hiện sẵn ở đầu hộp thoại).
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onSign] onSign(group) — bấm "Ký hợp đồng / Ký phụ lục" (chỉ hiện khi giai đoạn 'toSign').
 * @param {Function} [props.onRenew] bấm "Gia hạn".
 * @param {Function} [props.onCancel] bấm "Hủy đặt kho".
 * API: GET /api/contracts/{id}/signature (trong useEffect), POST /api/email/send-contract (sendMail).
 * Được gọi bởi: CustomerAccount khi khách bấm "Xem chi tiết hợp đồng".
 */
export default function ContractDetailModal({ group, customer, facilityAddress, knownSignature, autoMailResult, onClose, onSign, onRenew, onCancel }) {
  const [signature, setSignature] = useState(knownSignature || null) // chữ ký { image, signerName, signedAt } nếu đã ký
  const [loading, setLoading] = useState(!knownSignature) // đang tải trạng thái chữ ký
  const [mail, setMail] = useState(autoMailResult || null) // thông báo gửi email { tone, text }
  const [sending, setSending] = useState(false) // đang gửi email

  const policies = usePolicies()
  const rentals = group.rentals
  const first = rentals[0]
  const unitCount = contractUnits(rentals).length
  const contractIds = rentals.map(r => r.contractId).filter(Boolean)
  const hasAllContracts = contractIds.length === rentals.length
  const signedLocally = rentals.some(r => r.contractStatus === 'Signed' || r.contractStatus === 'Active')
  // Giai đoạn hiện tại; nếu API báo đã có chữ ký mà dữ liệu đơn chưa cập nhật thì coi như 'signed'.
  let stage = contractStage(rentals)
  if (signature && (stage === 'toSign')) stage = 'signed'
  const [stageText, stageTone] = STAGE_LABEL[stage]

  // Chạy khi mở hộp thoại (và khi onClose đổi): bắt phím Esc để đóng + khóa cuộn trang nền; dọn dẹp khi đóng.
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại.
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose])

  // Chạy khi mở hộp thoại / đổi nhóm hợp đồng (group.key): lần lượt gọi GET /api/contracts/{id}/signature cho từng
  // hợp đồng trong nhóm, gặp hợp đồng đã ký thì lưu chữ ký vào state và dừng. Bỏ qua nếu đã có knownSignature.
  useEffect(() => {
    if (knownSignature || !contractIds.length) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      for (const id of contractIds) {
        try {
          const status = await apiGet(`/api/contracts/${id}/signature`)
          if (status?.isSigned) {
            if (!cancelled) setSignature({ image: status.signatureImage, signerName: status.signerName, signedAt: status.signedAt })
            break
          }
        } catch {
          // bỏ qua: vẫn xem được nội dung hợp đồng
        }
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [group.key])

  /**
   * Gửi hợp đồng qua email cho khách và hiện kết quả trong khung thông báo (state mail).
   * Chạy khi bấm nút "✉ Gửi qua email" (nút bị khóa khi nhóm chưa có đủ contractId).
   * API: POST /api/email/send-contract (qua sendContractEmail; backend gửi bằng Brevo).
   */
  const sendMail = async () => {
    setSending(true)
    setMail({ tone: 'info', text: 'Đang gửi hợp đồng qua email...' })
    try {
      const result = await sendContractEmail({ group, customer, facilityAddress, signature, policies: policies.values })
      setMail({ tone: 'ok', text: `Đã gửi hợp đồng ${group.code} tới ${result.sentTo}. Kiểm tra cả thư mục Spam nếu chưa thấy.` })
    } catch (error) {
      setMail({ tone: 'err', text: error.message })
    } finally {
      setSending(false)
    }
  }

  // Các bước của thanh tiến trình: phụ lục gia hạn và hợp đồng mới có bộ bước khác nhau.
  // currentIndex = bước đang ở (các bước trước được tô "done").
  const isRenewal = Boolean(group.renewedFrom || first.isRenewal)
  const steps = isRenewal ? [
    ['Thanh toán gia hạn', 'Đã thanh toán'],
    ['Tạo phụ lục', 'Đã tạo'],
    ['Ký online', stage === 'signed' || stage === 'active' ? 'Đã ký' : 'Chờ bạn ký'],
    ['Tiếp tục dùng kho', `Từ ${first.startDate}`]
  ] : [
    ['Đặt cọc', 'Đã thanh toán'],
    ['Tạo hợp đồng', stage === 'approval' || stage === 'preparing' ? 'Đang tạo' : 'Đã tạo'],
    ['Ký online', stage === 'signed' || stage === 'active' ? 'Đã ký' : stage === 'toSign' ? 'Chờ bạn ký' : 'Chưa đến bước'],
    ['Nhận kho & chìa khóa', stage === 'active' ? 'Đã nhận' : `Ngày ${first.startDate}`]
  ]
  const currentIndex = { approval: 1, preparing: 1, toSign: 2, signed: 3, active: 4 }[stage]

  // Hộp thoại chi tiết hợp đồng
  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      {/* Tiến trình 4 bước, tóm tắt tiền, văn bản HĐ, các nút */}
      <div className="csf" role="dialog" aria-modal="true" aria-labelledby="cdm-title">
        <div className="csf-head">
          <div>
            <span className={`sign-badge ${stageTone}`}>{stageText}</span>
            <h2 id="cdm-title">{group.title}</h2>
            <p>Mã {group.code} · {unitCount} kho · {first.facility} · {first.startDate} → {first.endDate}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <ol className="cdm-timeline" aria-label="Tiến trình hợp đồng">
          {steps.map(([label, note], index) => (
            <li key={label} className={index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''}>
              {label}<small>{note}</small>
            </li>
          ))}
        </ol>

        <div className="csf-body">
          {mail && <div className={`cdm-mail top ${mail.tone}`} role="status">{mail.text}</div>}
          <div className="cdm-summary">
            <div><span>Tiền thuê / tháng</span><strong>{money(rentals.reduce((n, r) => n + Number(r.monthlyPrice || 0), 0))}</strong></div>
            <div><span>Tổng tiền thuê</span><strong>{money(rentals.reduce((n, r) => n + Number(r.rentalAmount || 0), 0))}</strong></div>
            <div><span>{isRenewal ? 'Tiền cọc (chuyển từ HĐ cũ)' : 'Tiền cọc đã trả'}</span><strong>{money(rentals.reduce((n, r) => n + Number(r.depositAmount || 0), 0))}</strong></div>
            <div><span>Chữ ký</span><strong>{loading ? 'Đang tải...' : signature ? 'Đã ký điện tử' : signedLocally ? 'Đã ký' : 'Chưa ký'}</strong></div>
          </div>
          <ContractDocument
            group={group}
            customer={customer}
            facilityAddress={facilityAddress}
            signature={signature}
            showTerms
            draft={stage === 'approval' || stage === 'preparing'}
          />
        </div>

        <div className="csf-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={() => window.print()}>In / Lưu PDF</button>
          <button
            type="button"
            className="dashboard-secondary-btn"
            disabled={!hasAllContracts || sending}
            title={hasAllContracts ? '' : 'Hợp đồng đang được tạo, vui lòng thử lại sau ít phút'}
            onClick={sendMail}
          >
            {sending ? 'Đang gửi...' : '✉ Gửi qua email'}
          </button>
          <span className="csf-spacer" />
          {onCancel && <button type="button" className="cr-link-btn" onClick={onCancel}>Hủy đặt kho</button>}
          {onRenew && <button type="button" className="dashboard-secondary-btn" onClick={onRenew}>↻ Gia hạn</button>}
          {stage === 'toSign' && onSign && <button type="button" className="dashboard-primary-btn" onClick={() => onSign(group)}>{isRenewal ? 'Ký phụ lục' : 'Ký hợp đồng'}</button>}
          <button type="button" className={stage === 'toSign' ? 'dashboard-secondary-btn' : 'dashboard-primary-btn'} onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}
