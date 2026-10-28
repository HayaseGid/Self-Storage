import React, { useEffect, useState } from 'react'
import { apiGet } from './api'
import { formatVnd } from './storageRules'
import ContractDocument, { contractUnits } from './ContractDocument'
import { sendContractEmail } from './contractEmail'
import { usePolicies } from './policies'
import './ContractSignFlow.css'

/*
 * Chi tiết hợp đồng cho khách hàng: xem được ở mọi trạng thái
 * (chờ duyệt -> bản xem trước, chờ ký, đã ký chờ nhận kho, đang thuê).
 * - Văn bản đầy đủ + điều khoản chi tiết + Phụ lục kho + chữ ký (nếu đã ký)
 * - In / Lưu PDF
 * - Gửi hợp đồng qua email (EmailJS - contractEmail.js, không cần backend)
 */
const money = value => `${formatVnd(value || 0)}đ`

export function contractStage(rentals) {
  const r = rentals[0] || {}
  if (r.status === 'Handed Over') return 'active'
  if (r.contractStatus === 'Signed' || r.contractStatus === 'Active') return r.status === 'Handed Over' ? 'active' : 'signed'
  if (r.status === 'Confirmed' && r.contractId) return 'toSign'
  if (r.status === 'Confirmed') return 'preparing'
  return 'approval'
}

const STAGE_LABEL = {
  approval: ['Chờ Manager duyệt', 'wait'],
  preparing: ['Đang tạo hợp đồng', 'wait'],
  toSign: ['Chờ bạn ký', 'todo'],
  signed: ['Đã ký · Chờ nhận kho', 'done'],
  active: ['Đang hiệu lực', 'done']
}

export default function ContractDetailModal({ group, customer, facilityAddress, knownSignature, autoMailResult, onClose, onSign }) {
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

  const steps = [
    ['Đặt cọc', 'Đã thanh toán'],
    ['Manager duyệt', stage === 'approval' ? 'Đang chờ' : 'Đã duyệt'],
    ['Ký online', stage === 'signed' || stage === 'active' ? 'Đã ký' : stage === 'toSign' ? 'Chờ bạn ký' : 'Chưa đến bước'],
    ['Nhận kho', stage === 'active' ? 'Đã nhận' : `Ngày ${first.startDate}`]
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
            <div><span>Tiền cọc đã trả</span><strong>{money(rentals.reduce((n, r) => n + Number(r.depositAmount || 0), 0))}</strong></div>
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
            title={hasAllContracts ? '' : 'Hợp đồng chưa được tạo (chờ Manager duyệt)'}
            onClick={sendMail}
          >
            {sending ? 'Đang gửi...' : '✉ Gửi qua email'}
          </button>
          <span className="csf-spacer" />
          {stage === 'toSign' && onSign && <button type="button" className="dashboard-primary-btn" onClick={() => onSign(group)}>Ký hợp đồng</button>}
          <button type="button" className={stage === 'toSign' ? 'dashboard-secondary-btn' : 'dashboard-primary-btn'} onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}
