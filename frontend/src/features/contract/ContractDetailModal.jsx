/**
 * ======================================================================
 * FILE: src/features/contract/ContractDetailModal.jsx  —  CHI TIẾT HỢP ĐỒNG CHO KHÁCH (xem ở mọi trạng thái)
 * Trạng thái: đang tạo hợp đồng (bản xem trước) -> chờ ký -> đã ký chờ nhận kho -> đang hiệu lực.
 * Chức năng: xem văn bản đầy đủ + điều khoản + phụ lục kho + chữ ký; In/Lưu PDF; gửi hợp đồng qua email;
 * nút Ký / Gia hạn / Hủy đặt kho (do cha truyền vào).
 * API: GET /api/contracts/{contractId}/signature (ContractsController) — lấy ảnh chữ ký nếu đã ký;
 *      gửi email qua sendContractEmail() -> POST /api/email/send-contract (dự phòng EmailJS).
 * Dùng ở: CustomerAccount.
 * ======================================================================
 */
import React, { useEffect, useState } from 'react'
import { apiGet } from '../../api/api'
import { formatVnd } from '../../services/storageRules'
import ContractDocument, { contractUnits } from './ContractDocument'
import { sendContractEmail } from '../../api/contractEmail'
import { usePolicies } from '../../services/policies'
import './ContractSignFlow.css'

/*
 * Chi tiết hợp đồng cho khách hàng: xem được ở mọi trạng thái
 * (đang tạo hợp đồng -> bản xem trước, chờ ký, đã ký chờ nhận kho, đang thuê).
 * Luồng mới: không còn bước Manager duyệt, đặt cọc xong là hợp đồng được tạo để ký.
 * - Văn bản đầy đủ + điều khoản chi tiết + Phụ lục kho + chữ ký (nếu đã ký)
 * - In / Lưu PDF
 * - Gửi hợp đồng qua email (EmailJS - contractEmail.js, không cần backend)
 */
/**
 * Định dạng tiền kèm "đ".
 */
const money = value => `${formatVnd(value || 0)}đ`

/**
 * Xác định giai đoạn của hợp đồng từ trạng thái đơn/hợp đồng:
 * 'toSign' (chờ ký, kể cả phụ lục gia hạn), 'active' (đang thuê), 'signed' (đã ký chờ nhận kho),
 * 'preparing' (đã xác nhận nhưng chưa có hợp đồng), 'approval' (đang tạo).
 * @param {object[]} rentals các đơn trong nhóm hợp đồng.
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

const STAGE_LABEL = {
  approval: ['Đang tạo hợp đồng', 'wait'],
  preparing: ['Đang tạo hợp đồng', 'wait'],
  toSign: ['Chờ bạn ký', 'todo'],
  signed: ['Đã ký · Chờ nhận kho', 'done'],
  active: ['Đang hiệu lực', 'done']
}

/**
 * Component hộp thoại chi tiết hợp đồng.
 * @param {object} props group, customer, facilityAddress, knownSignature (chữ ký đã biết, khỏi gọi API),
 *   autoMailResult (kết quả gửi email tự động sau khi ký), onClose, onSign(group), onRenew, onCancel.
 */
export default function ContractDetailModal({ group, customer, facilityAddress, knownSignature, autoMailResult, onClose, onSign, onRenew, onCancel }) {
  const [signature, setSignature] = useState(knownSignature || null)
  const [loading, setLoading] = useState(!knownSignature)
  const [mail, setMail] = useState(autoMailResult || null)
  const [sending, setSending] = useState(false)

  const policies = usePolicies()
  const rentals = group.rentals
  const first = rentals[0]
  const unitCount = contractUnits(rentals).length
  const contractIds = rentals.map(r => r.contractId).filter(Boolean)
  const hasAllContracts = contractIds.length === rentals.length
  const signedLocally = rentals.some(r => r.contractStatus === 'Signed' || r.contractStatus === 'Active')
  let stage = contractStage(rentals)
  if (signature && (stage === 'toSign')) stage = 'signed'
  const [stageText, stageTone] = STAGE_LABEL[stage]

  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại.
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose])

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
   * Gửi hợp đồng qua email cho khách và hiện kết quả.
   * API: POST /api/email/send-contract (qua sendContractEmail; dự phòng EmailJS).
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

  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
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
