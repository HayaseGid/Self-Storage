import React from 'react'
import { Code, NewBadge, UnitCodes } from './listKit'
import { extractDistrict } from './districts'
import { formatSignedAt } from './contractSignatures'
import { formatVnd } from './storageRules'
import { fmtIsoDate } from './ContractRenewal'
import { lateFeePolicyText } from './lateFees'
import { getTodayDate } from './demoClock/demoClock'
import './ContractCard.css'
import './UnitReturn.css'

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
  // [THỜI GIAN THỰC]:
  // const today = new Date()
  // today.setHours(0, 0, 0, 0)
  // [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock
  const today = getTodayDate()
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
  onReloadSignature, onSign, onDetail, onRenew, onReturn, returnInfo, onPayRent, onOpenPayment, payingRent,
  lateFee // [7a] phí trễ hạn của đơn (GET /api/late-fees/mine) + policy
}) {
  const isSigned = Boolean(signature)
  // [7a] Phí trễ hạn: khoản chưa đóng (trừ khoản đang chờ VNPay) + các kỳ tiền thuê đang trễ
  const unpaidLateFees = (lateFee?.lateFees || []).filter(f => f.status === 'Unpaid')
  const lateUnpaid = unpaidLateFees.filter(f => !f.pendingPayment).reduce((n, f) => n + Number(f.amount || 0), 0)
  const overdueItems = lateFee?.overdueRent || []
  const payNow = Number(rental.rentPayableNow || 0) + lateUnpaid
  const isRenewal = Boolean(rental.isRenewal || rental.renewedFrom || renewal?.renewedFrom)
  const district = facility?.district?.label || extractDistrict(facility?.location, rental.facility)?.label
  const address = facility?.location
  const units = rental.units?.length ? rental.units : [{ number: rental.unitId, type: rental.type, size: rental.size }]

  const start = parseVnDate(rental.startDate)
  const startsIn = daysFromToday(start)
  const notStarted = startsIn != null && startsIn > 0
  const ended = ['Completed', 'Cancelled', 'Expired'].includes(rental.status)

  return (
    <article id={`contract-${rental.reservationId}`} className={`cc-card${ended ? ' ended' : ''}`}>
      {/* ---- Đầu thẻ ---- */}
      <header className="cc-head">
        <div>
          <span className="cc-eyebrow">{isRenewal ? 'PHỤ LỤC GIA HẠN' : 'HỢP ĐỒNG THUÊ KHO'}</span>
          <h2>{rental.contractNumber || `Hợp đồng #${rental.contractId}`}</h2>
          <div className="cc-chips">
            <span className={`cc-chip ${STATUS_TONE[rental.status] || 'info'}`}>{rental.statusLabel || rental.status}</span>
            {rental.reservationCode && <span className="cc-chip plain">Mã đơn <Code kind="order">{rental.reservationCode}</Code></span>}
            {rental.unitNumbers?.length > 0 && <UnitCodes units={rental.unitNumbers} max={6} />}
            <NewBadge createdAt={rental.createdAt} />
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
      {returnInfo?.request && (
        <p className="cc-return">
          ⇦ {{
            Scheduled: `Đã hẹn trả kho ngày ${fmtIsoDate(returnInfo.request.scheduledDate)}${returnInfo.request.staffName ? ` · nhân viên ${returnInfo.request.staffName}` : ''}.`,
            'In Progress': 'Nhân viên đang kiểm tra kho bạn trả.',
            Completed: Number(returnInfo.request.amountOwed) > 0
              ? `Đã kiểm tra kho · cần đóng thêm ${money(returnInfo.request.amountOwed)} phí phát sinh.`
              : `Đã trả kho · hoàn cọc ${money(returnInfo.request.refundAmount)}${returnInfo.request.refundStatus === 'Completed' ? ' (đã chuyển)' : returnInfo.request.refundDueDate ? ` dự kiến ${fmtIsoDate(returnInfo.request.refundDueDate)}` : ''}.`
          }[returnInfo.request.status]} Xem chi tiết ở mục "Trả kho" phía trên.
        </p>
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
            {rental.paymentPlan && <div><dt>Hình thức trả</dt><dd>{rental.paymentPlanLabel || (rental.paymentPlan === 'Upfront' ? 'Trả 1 lần' : 'Trả theo tháng')}</dd></div>}
          </dl>
        </section>
      </div>

      {/* ---- Tiền thuê (luật ở backend: RentPaymentRules) + phí trễ hạn (LateFeeRules) ---- */}
      {((!ended && rental.paymentPlan && Number(rental.rentDueAtStart) > 0) || lateUnpaid > 0) && (
        <section className={`cc-rent${Number(rental.rentOverdue) > 0 || lateUnpaid > 0 ? ' bad' : rental.startRentPaid ? ' ok' : ''}`} aria-label="Tiền thuê">
          {Number(rental.rentOverdue) > 0
            ? <p><strong>Tiền thuê quá hạn: {money(rental.rentOverdue)}.</strong> Vui lòng đóng sớm để tránh phí trễ hạn.</p>
            : lateUnpaid > 0 && !(Number(rental.rentPayableNow) > 0)
              ? <p><strong>Bạn còn {money(lateUnpaid)} phí trễ hạn tiền thuê chưa đóng.</strong></p>
              : rental.startRentPaid
                ? <p>✓ Đã đóng tiền thuê {rental.paymentPlan === 'Upfront' ? 'toàn bộ kỳ thuê' : 'tháng đầu'} ({money(rental.rentDueAtStart)}).</p>
                : <p>{rental.status === 'Handed Over' ? 'Bạn đã nhận kho, vui lòng đóng' : 'Sau khi nhận kho, bạn đóng'} <strong>{money(rental.rentDueAtStart)}</strong> tiền thuê ({rental.paymentPlan === 'Upfront' ? 'toàn bộ kỳ thuê' : 'tháng đầu'}), hạn là ngày bắt đầu thuê.</p>}
          {(overdueItems.length > 0 || unpaidLateFees.length > 0) && (
            <div className="cc-late">
              {overdueItems.map(o => (
                <p key={`o${o.chargeId}`} className="cc-sub">
                  Kỳ {fmtIsoDate(o.periodStart)}–{fmtIsoDate(o.periodEnd)}{o.unitNumber ? ` (kho ${o.unitNumber})` : ''}: trễ {o.daysLate} ngày
                  {o.graceDaysLeft > 0 ? ` · còn ${o.graceDaysLeft} ngày nữa mới bắt đầu tính phí trễ` : ' · đang tính phí trễ hạn'}
                </p>
              ))}
              {unpaidLateFees.map(f => (
                <p key={`f${f.chargeId}`} className="cc-sub">• {f.description}: <strong>{money(f.amount)}</strong>{f.pendingPayment ? ' (đang chờ VNPay xác nhận)' : ''}</p>
              ))}
              <p className="cc-sub">Chính sách phí trễ hạn: {lateFeePolicyText(lateFee?.policy)}</p>
            </div>
          )}
          {payNow > 0 && (onOpenPayment || onPayRent)
            ? <button type="button" className="dashboard-primary-btn" disabled={payingRent} onClick={onOpenPayment || onPayRent}>
                {onOpenPayment
                  ? `💳 Sang trang Thanh toán đóng ${money(payNow)}${Number(rental.rentPayableNow) > 0 && lateUnpaid > 0 ? ' (tiền thuê + phí trễ)' : lateUnpaid > 0 ? ' phí trễ hạn' : ' tiền thuê'} →`
                  : payingRent ? 'Đang xử lý...' : `Đóng ${money(payNow)}${Number(rental.rentPayableNow) > 0 && lateUnpaid > 0 ? ' (tiền thuê + phí trễ hạn)' : lateUnpaid > 0 ? ' phí trễ hạn' : ' tiền thuê'}`}
              </button>
            : rental.rentNote && <p className="cc-sub">{rental.rentNote}</p>}
        </section>
      )}

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
          {onReturn && <button type="button" className="dashboard-secondary-btn" onClick={onReturn}>⇦ Trả kho</button>}
        </div>
      </footer>
    </article>
  )
}
