/**
 * ======================================================================
 * FILE: src/features/contract/ContractCard.jsx  —  THẺ HỢP ĐỒNG (TAB "HỢP ĐỒNG" CỦA KHÁCH)
 * CHỨC NĂNG: Vẽ 1 thẻ cho mỗi hợp đồng / phụ lục gia hạn của khách trong tab "Hợp đồng". Thẻ chia nhóm rõ ràng:
 *   Vị trí (cơ sở, quận, địa chỉ) · Kho thuê · Thời hạn (+ cách nhận kho) · Chi phí · Tiền thuê & phí trễ hạn · Chữ ký.
 *   Thẻ còn hiện trạng thái gia hạn, trả kho, kiểm kho và các nút Ký, Xem chi tiết, Gia hạn, Trả kho, Đóng tiền.
 * THÀNH PHẦN CHÍNH:
 *   - ContractCard (default export): component thẻ hợp đồng.
 *   - money, parseVnDate, daysFromToday: hàm tiện ích định dạng tiền / đổi ngày / đếm ngày tới hạn.
 *   - STATUS_TONE: bảng màu chip theo trạng thái đơn.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx.
 * PHỤ THUỘC: components/common/listKit (Code, NewBadge, UnitCodes), utils/districts, services/contractSignatures,
 *   services/storageRules, ./ContractRenewal (fmtIsoDate), api/lateFees (lateFeePolicyText), demoClock,
 *   ../booking/HandoverChoice (ONLINE_HANDOVER_NOTE), ContractCard.css, ../return/UnitReturn.css.
 * API: Không gọi API. Mọi dữ liệu (đơn, chữ ký, gia hạn, trả kho, phí trễ hạn, kiểm kho) do CustomerAccount tải rồi truyền vào.
 * LUỒNG: CustomerAccount tải dữ liệu -> truyền props vào ContractCard -> thẻ tính số tiền cần đóng, nhãn trạng thái
 *   -> khách bấm nút (Ký / Chi tiết / Gia hạn / Trả kho / Đóng tiền) -> gọi callback onSign / onDetail / onRenew /
 *   onReturn / onOpenPayment của CustomerAccount để mở hộp thoại hoặc chuyển trang tương ứng.
 * ======================================================================
 */
import React from 'react'
import { Code, NewBadge, UnitCodes } from '../../components/common/listKit'
import { extractDistrict } from '../../utils/districts'
import { formatSignedAt } from '../../services/contractSignatures'
import { formatVnd } from '../../services/storageRules'
import { fmtIsoDate } from './ContractRenewal'
import { lateFeePolicyText } from '../../api/lateFees'
import { getTodayDate } from '../../demoClock/demoClock'
import './ContractCard.css'
import '../return/UnitReturn.css'
import { ONLINE_HANDOVER_NOTE } from '../booking/HandoverChoice'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ", vd 1500000 -> "1.500.000đ".
 * @param {number|string} value số tiền (rỗng -> 0).
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/**
 * Đổi chuỗi ngày 'dd/MM/yyyy' (dạng backend trả cho startDate) thành đối tượng Date.
 * @param {string} text chuỗi ngày.
 * @returns {Date|null} null nếu sai định dạng.
 */
const parseVnDate = text => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''))
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}
/**
 * Tính số ngày từ "hôm nay" tới một ngày. "Hôm nay" lấy theo Demo Clock (getTodayDate) để demo tua thời gian được.
 * Dùng để biết hợp đồng đã bắt đầu chưa ("Bắt đầu sau N ngày").
 * @param {Date|null} date ngày cần so.
 * @returns {number|null} số ngày (dương = tương lai, âm = đã qua), null nếu không có ngày.
 */
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

/** Màu chip trạng thái (class CSS ok/info/warn/muted/bad) theo trạng thái đơn đặt kho do backend trả. */
const STATUS_TONE = {
  'Handed Over': 'ok',
  Confirmed: 'info',
  Paid: 'info',
  'Pending Deposit': 'warn',
  Completed: 'muted',
  Cancelled: 'bad',
  Expired: 'bad'
}

/**
 * Vẽ thẻ của MỘT hợp đồng: đầu thẻ (số HĐ, chip trạng thái, mã đơn, mã kho), vị trí, ghi chú gia hạn / trả kho,
 * 3 nhóm thông tin (kho, thời hạn, chi phí), khối tiền thuê & phí trễ hạn, chân thẻ (chữ ký + các nút).
 * Không gọi API; mọi hành động đều gọi callback của CustomerAccount.
 * @param {object} props
 * @param {object} props.rental đơn đặt kho / hợp đồng (contractNumber, status, units, startDate, endDate, rentPayableNow...).
 * @param {object} [props.facility] cơ sở (location, district) để hiện quận và địa chỉ.
 * @param {string} props.customerName tên bên thuê.
 * @param {object|null} props.signature chữ ký đã có ({ signedAt, ... }), null nếu chưa ký.
 * @param {boolean} props.signatureLoaded đã tải xong trạng thái chữ ký chưa.
 * @param {string} [props.signatureError] lỗi khi tải chữ ký (hiện nút "Thử lại" -> onReloadSignature).
 * @param {object} [props.renewal] thông tin gia hạn (renewedFrom / renewedBy).
 * @param {object} [props.returnInfo] yêu cầu trả kho ({ request: { status, scheduledDate, refundAmount... } }).
 * @param {object} [props.lateFee] phí trễ hạn ({ lateFees, overdueRent, policy }).
 * @param {object} [props.inspection] kết quả kiểm kho khi trả kho (status: Pending Manager / Awaiting Customer / Disputed / Settled).
 * @param {Function} [props.onSign] bấm "Ký hợp đồng".
 * @param {Function} props.onDetail bấm "Xem chi tiết hợp đồng".
 * @param {Function} [props.onRenew] bấm "Gia hạn" (không truyền thì ẩn nút).
 * @param {Function} [props.onReturn] bấm "Trả kho" (không truyền thì ẩn nút).
 * @param {Function} [props.onOpenPayment] bấm nút đóng tiền -> sang trang Thanh toán (ưu tiên hơn onPayRent).
 * @param {Function} [props.onPayRent] bấm nút đóng tiền trực tiếp; props.payingRent = true khi đang xử lý.
 * @returns {JSX.Element}
 */
export default function ContractCard({
  rental, facility, customerName, signature, signatureLoaded, signatureError, renewal,
  onReloadSignature, onSign, onDetail, onRenew, onReturn, returnInfo, onPayRent, onOpenPayment, payingRent,
  lateFee, inspection // [14] kết quả kiểm kho
}) {
  const isSigned = Boolean(signature)
  // Phí trễ hạn: lấy các khoản chưa đóng; lateUnpaid = tổng khoản chưa đóng (bỏ khoản đang chờ VNPay xác nhận);
  // payNow = tiền thuê đến hạn + phí trễ = số tiền hiện trên nút đóng tiền.
  const unpaidLateFees = (lateFee?.lateFees || []).filter(f => f.status === 'Unpaid')
  const lateUnpaid = unpaidLateFees.filter(f => !f.pendingPayment).reduce((n, f) => n + Number(f.amount || 0), 0)
  const overdueItems = lateFee?.overdueRent || []
  const payNow = Number(rental.rentPayableNow || 0) + lateUnpaid
  const isRenewal = Boolean(rental.isRenewal || rental.renewedFrom || renewal?.renewedFrom)
  const district = facility?.district?.label || extractDistrict(facility?.location, rental.facility)?.label
  const address = facility?.location
  const units = rental.units?.length ? rental.units : [{ number: rental.unitId, type: rental.type, size: rental.size }]

  // notStarted: hợp đồng chưa tới ngày bắt đầu; ended: đơn đã kết thúc (thẻ bị làm mờ, ẩn thanh tiến độ).
  const start = parseVnDate(rental.startDate)
  const startsIn = daysFromToday(start)
  const notStarted = startsIn != null && startsIn > 0
  const ended = ['Completed', 'Cancelled', 'Expired'].includes(rental.status)

  // Đang có kết quả kiểm kho chưa chốt -> chip đầu thẻ hiện trạng thái kiểm kho thay cho trạng thái đơn.
  const inspectionHeld = inspection && inspection.status !== 'Settled'
  const chipLabel = inspectionHeld
    ? (inspection.status === 'Pending Manager' ? 'Chờ Quản lý duyệt' : inspection.status === 'Awaiting Customer' ? 'Chờ xác nhận phí' : 'Đang khiếu nại')
    : (rental.statusLabel || rental.status)
  const chipTone = inspectionHeld ? 'warn' : (STATUS_TONE[rental.status] || 'info')

  return (
    <article id={`contract-${rental.reservationId}`} className={`cc-card${ended ? ' ended' : ''}`}>
      {/* ---- Đầu thẻ ---- */}
      <header className="cc-head">
        <div>
          <span className="cc-eyebrow">{isRenewal ? 'PHỤ LỤC GIA HẠN' : 'HỢP ĐỒNG THUÊ KHO'}</span>
          <h2>{rental.contractNumber || `Hợp đồng #${rental.contractId}`}</h2>
          <div className="cc-chips">
            <span className={`cc-chip ${chipTone}`}>{chipLabel}</span>
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
          ⇦ {(() => {
            if (inspection && inspection.status !== 'Settled') {
              if (inspection.status === 'Pending Manager') return 'Đã kiểm tra kho · Đang chờ Quản lý cơ sở phê duyệt kết quả.'
              if (inspection.status === 'Awaiting Customer') return `Đã kiểm tra kho · Chờ bạn xác nhận phí kiểm kho (${money(inspection.proposedTotal)}).`
              if (inspection.status === 'Disputed') return 'Đang giải quyết khiếu nại kiểm kho với Quản lý cơ sở.'
            }
            if (returnInfo.request.status === 'Scheduled') {
              return `Đã hẹn trả kho ngày ${fmtIsoDate(returnInfo.request.scheduledDate)}${returnInfo.request.staffName ? ` · nhân viên ${returnInfo.request.staffName}` : ''}.`
            }
            if (returnInfo.request.status === 'In Progress') {
              return 'Nhân viên đang kiểm tra kho bạn trả.'
            }
            if (returnInfo.request.status === 'Completed') {
              return Number(returnInfo.request.amountOwed) > 0
                ? `Đã kiểm tra kho · cần đóng thêm ${money(returnInfo.request.amountOwed)} phí phát sinh.`
                : `Đã trả kho · hoàn cọc ${money(returnInfo.request.refundAmount)}${returnInfo.request.refundStatus === 'Completed' ? ' (đã chuyển)' : returnInfo.request.refundDueDate ? ` dự kiến ${fmtIsoDate(returnInfo.request.refundDueDate)}` : ''}.`
            }
            return 'Đang xử lý trả kho.'
          })()} Xem chi tiết ở mục "Trả kho" phía trên.
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
          {/* Cách nhận kho (4.1): trực tiếp theo khung giờ / online (mã trên tài khoản, chìa ở lễ tân) */}
          {rental.handoverMethod && ['Pending Deposit', 'Paid', 'Confirmed'].includes(rental.status) && (
            rental.handoverMethod === 'Online'
              ? <p className="cc-sub"><strong>Bàn giao online</strong> · {ONLINE_HANDOVER_NOTE}</p>
              : <p className="cc-sub"><strong>Nhận trực tiếp</strong> · {fmtIsoDate(rental.appointmentDate)}{rental.appointmentSlot ? `, khung ${rental.appointmentSlot}` : ''}</p>
          )}
          {rental.handoverMethod === 'Online' && rental.status === 'Handed Over' && (
            <p className="cc-sub">Bàn giao online · chìa khóa nhận tại quầy lễ tân của cơ sở (mang theo CCCD, báo mã đơn).</p>
          )}
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
