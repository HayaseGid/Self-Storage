import React from 'react'
import { extractDistrict } from './districts'
import { formatSignedAt } from './contractSignatures'
import { formatVnd } from './storageRules'
import { fmtIsoDate } from './ContractRenewal'
import './ContractCard.css'

/*
 * Thẻ hợp đồng ở tab "Hợp đồng" của khách: chia rõ từng nhóm
 *   Vị trí (cơ sở, quận, địa chỉ) · Kho thuê · Thời hạn · Chi phí · Chữ ký.
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
const parseVnDate = text => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''))
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}
const daysFromToday = date => {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((date - today) / 86400000)
}

const STATUS_TONE = {
  'Handed Over': 'ok',
  Confirmed: 'info',
  Paid: 'info',
  'Pending Deposit': 'warn',
  Completed: 'muted',
  Cancelled: 'bad',
  Expired: 'bad'
}

export default function ContractCard({
  rental, facility, customerName, signature, signatureLoaded, signatureError, renewal,
  onReloadSignature, onSign, onDetail, onRenew
}) {
  const isSigned = Boolean(signature)
  const isRenewal = Boolean(rental.isRenewal || rental.renewedFrom || renewal?.renewedFrom)
  const district = facility?.district?.label || extractDistrict(facility?.location, rental.facility)?.label
  const address = facility?.location
  const units = rental.units?.length ? rental.units : [{ number: rental.unitId, type: rental.type, size: rental.size }]

  const start = parseVnDate(rental.startDate)
  const startsIn = daysFromToday(start)
  const notStarted = startsIn != null && startsIn > 0
  const ended = ['Completed', 'Cancelled', 'Expired'].includes(rental.status)

  return (
    <article className={`cc-card${ended ? ' ended' : ''}`}>
      {/* ---- Đầu thẻ ---- */}
      <header className="cc-head">
        <div>
          <span className="cc-eyebrow">{isRenewal ? 'PHỤ LỤC GIA HẠN' : 'HỢP ĐỒNG THUÊ KHO'}</span>
          <h2>{rental.contractNumber || `Hợp đồng #${rental.contractId}`}</h2>
          <div className="cc-chips">
            <span className={`cc-chip ${STATUS_TONE[rental.status] || 'info'}`}>{rental.statusLabel || rental.status}</span>
            {rental.reservationCode && <span className="cc-chip plain">Mã đơn {rental.reservationCode}</span>}
          </div>
        </div>
        <span className={`cc-sign ${isSigned ? 'ok' : 'todo'}`}>
          {isSigned ? '✓ Đã ký' : signatureLoaded ? 'Chưa ký' : '…'}
        </span>
      </header>

      {/* ---- Vị trí ---- */}
      <section className="cc-location" aria-label="Vị trí kho">
        <span className="cc-pin" aria-hidden="true">📍</span>
        <div>
          <strong>{rental.facility}</strong>
          {district && <span className="cc-district">{district}</span>}
          {address && <p>{address}</p>}
        </div>
      </section>

      {renewal?.renewedFrom && (
        <p className="cc-note">
          ↻ Gia hạn từ hợp đồng <strong>{renewal.renewedFrom.contractNumber}</strong> ({fmtIsoDate(renewal.renewedFrom.startDate)} → {fmtIsoDate(renewal.renewedFrom.endDate)}). Bạn tiếp tục dùng kho, không cần nhận lại.
        </p>
      )}
      {renewal?.renewedBy && (
        <p className="cc-note">↻ Đã gia hạn bằng phụ lục <strong>{renewal.renewedBy.contractNumber}</strong> đến {fmtIsoDate(renewal.renewedBy.endDate)}.</p>
      )}
      {signatureError && (
        <div className="auth-message error cc-alert">
          Không tải được trạng thái chữ ký: {signatureError}
          <button type="button" className="csf-link" onClick={onReloadSignature}>Thử lại</button>
        </div>
      )}

      {/* ---- 3 nhóm thông tin ---- */}
      <div className="cc-groups">
        <section className="cc-group">
          <h3>Kho thuê</h3>
          <div className="cc-units">
            {units.map(u => (
              <div key={u.number} className="cc-unit">
                <strong>{u.number || '—'}</strong>
                <span>{[u.type, u.size].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="cc-group">
          <h3>Thời hạn thuê</h3>
          <p className="cc-dates"><strong>{rental.startDate}</strong><span>→</span><strong>{rental.endDate}</strong></p>
          <p className="cc-sub">{rental.months ? `${rental.months} tháng` : ''}</p>
          {!ended && (
            <>
              <div className="cc-progress" aria-hidden="true"><div style={{ width: `${notStarted ? 0 : rental.progress || 0}%` }} /></div>
              <p className="cc-sub">
                {notStarted
                  ? `Bắt đầu sau ${startsIn} ngày`
                  : `Đã dùng ${rental.progress || 0}% · còn ${rental.remainingDays} ngày`}
              </p>
            </>
          )}
        </section>

        <section className="cc-group">
          <h3>Chi phí</h3>
          <dl className="cc-money">
            <div><dt>Tiền thuê / tháng</dt><dd>{money(rental.monthlyPrice)}</dd></div>
            {rental.rentalAmount > 0 && <div><dt>Tổng {rental.months} tháng</dt><dd>{money(rental.rentalAmount)}</dd></div>}
            {rental.depositAmount > 0 && <div><dt>Tiền cọc</dt><dd>{money(rental.depositAmount)}</dd></div>}
          </dl>
        </section>
      </div>

      {/* ---- Chân thẻ ---- */}
      <footer className="cc-foot">
        <p>
          <span>Bên thuê: <strong>{customerName}</strong></span>
          <span>
            Chữ ký: {isSigned
              ? <strong className="ok">Đã ký lúc {formatSignedAt(signature.signedAt)}</strong>
              : <strong className="todo">{signatureLoaded ? 'Chưa ký điện tử' : 'Đang tải...'}</strong>}
          </span>
        </p>
        <div className="cc-actions">
          {!isSigned && signatureLoaded && onSign && (
            <button type="button" className="dashboard-primary-btn" onClick={onSign}>✍ Ký hợp đồng</button>
          )}
          <button type="button" className={isSigned ? 'dashboard-primary-btn' : 'dashboard-secondary-btn'} onClick={onDetail}>Xem chi tiết hợp đồng</button>
          {onRenew && <button type="button" className="dashboard-secondary-btn" onClick={onRenew}>↻ Gia hạn</button>}
        </div>
      </footer>
    </article>
  )
}
