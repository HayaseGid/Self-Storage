/**
 * ======================================================================
 * FILE: src/features/booking/HandoverChoice.jsx  —  CHỌN CÁCH NHẬN KHO + KHUNG GIỜ NHẬN KHO
 * Dùng chung cho trang Giỏ kho (CartPage), trang Đặt kho (App.jsx) và ContractCard.
 * - InPerson: khách đến cơ sở trong 1 trong 4 khung 2 tiếng -> gửi appointmentSlot "08:00"|"10:00"|"12:00"|"14:00".
 * - Online: không hẹn giờ; mã truy cập hiện trong tài khoản sau khi nhân viên bàn giao, chìa khóa để ở quầy.
 * Giá trị được gửi kèm khi tạo đơn (POST /api/reservation); backend (ReservationService) kiểm tra lại.
 * Không gọi API trực tiếp.
 * ======================================================================
 */
import React from 'react'
import './HandoverChoice.css'

/*
 * CÁCH NHẬN KHO + KHUNG GIỜ (mục 4.1) — dùng chung cho trang Giỏ kho (CartPage) và trang Đặt kho (BookingPage).
 *   InPerson: khách đến cơ sở trong 1 trong 4 khung 2 tiếng -> gửi appointmentSlot "08:00" | "10:00" | "12:00" | "14:00".
 *   Online  : không hẹn giờ; mã truy cập hiện trong tài khoản sau khi nhân viên bàn giao, chìa khóa để ở quầy lễ tân.
 * Backend (ReservationService) kiểm tra lại đúng các giá trị này.
 */
export const HANDOVER_METHODS = { InPerson: 'InPerson', Online: 'Online' }

export const MOVE_IN_SLOTS = [
  { value: '08:00', label: '08:00 – 10:00', endHour: 10 },
  { value: '10:00', label: '10:00 – 12:00', endHour: 12 },
  { value: '12:00', label: '12:00 – 14:00', endHour: 14 },
  { value: '14:00', label: '14:00 – 16:00', endHour: 16 }
]

/**
 * Đổi giá trị khung giờ ("08:00") thành nhãn hiển thị ("08:00 – 10:00").
 */
export const slotLabel = value => MOVE_IN_SLOTS.find(s => s.value === value)?.label || value

export const ONLINE_HANDOVER_NOTE = 'Sau khi nhân viên bàn giao, mã truy cập sẽ hiện trong tài khoản của bạn (mục Kho của tôi). Chìa khóa được để ở quầy lễ tân của cơ sở: bạn lên lễ tân, báo mã đơn và mang theo CCCD để nhận.'

/**
 * Kiểm tra 2 ngày có cùng ngày/tháng/năm không.
 */
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Khung giờ đã qua nếu ngày nhận kho là hôm nay (giờ máy khách, backend kiểm tra lại theo giờ VN). */
/**
 * Khung giờ đã qua nếu ngày nhận kho là hôm nay và giờ hiện tại đã quá giờ kết thúc khung
 * (theo giờ máy khách; backend kiểm tra lại theo giờ Việt Nam).
 */
export function isSlotPast(slot, startDate) {
  const now = new Date()
  return sameDay(startDate, now) && now.getHours() >= slot.endHour
}

/** Lỗi cần báo trước khi đặt, null nếu hợp lệ. */
/**
 * Kiểm tra lựa chọn nhận kho trước khi đặt: Online luôn hợp lệ; InPerson phải chọn khung giờ và khung đó chưa qua.
 * @returns {string|null} câu lỗi hoặc null nếu hợp lệ.
 */
export function handoverChoiceError(method, slot, startDate) {
  if (method === HANDOVER_METHODS.Online) return null
  const chosen = MOVE_IN_SLOTS.find(s => s.value === slot)
  if (!chosen) return 'Vui lòng chọn khung giờ đến nhận kho.'
  if (isSlotPast(chosen, startDate)) return 'Khung giờ này hôm nay đã qua. Vui lòng chọn khung giờ khác.'
  return null
}

/**
 * Component chọn cách nhận kho (Đến nhận trực tiếp / Bàn giao online) và khung giờ (khi nhận trực tiếp).
 * @param {object} props method, onMethodChange, slot, onSlotChange, startDate (ngày nhận kho để khóa khung giờ đã qua).
 */
export default function HandoverChoice({ method, onMethodChange, slot, onSlotChange, startDate }) {
  return (
    <div className="booking-large-field handover-choice">
      <label>Cách nhận kho</label>
      <div className="payment-mode-grid">
        <button
          type="button"
          className={method === HANDOVER_METHODS.InPerson ? 'payment-mode-card active' : 'payment-mode-card'}
          onClick={() => onMethodChange(HANDOVER_METHODS.InPerson)}
        >
          <span className="payment-mode-icon">⌂</span>
          <strong>Nhận trực tiếp</strong>
          <small>Bạn đến cơ sở trong khung giờ đã chọn, nhân viên bàn giao kho, chìa khóa và hướng dẫn tại chỗ.</small>
        </button>

        <button
          type="button"
          className={method === HANDOVER_METHODS.Online ? 'payment-mode-card active' : 'payment-mode-card'}
          onClick={() => onMethodChange(HANDOVER_METHODS.Online)}
        >
          <span className="payment-mode-icon">@</span>
          <strong>Bàn giao online</strong>
          <small>Không cần hẹn giờ. Mã truy cập hiện trong tài khoản, chìa khóa nhận tại quầy lễ tân.</small>
        </button>
      </div>

      {method === HANDOVER_METHODS.InPerson && (
        <div className="handover-slots">
          <span className="handover-slots-title">Khung giờ đến nhận kho {startDate ? `(ngày ${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getMonth() + 1).padStart(2, '0')})` : ''}</span>
          <div className="handover-slot-grid" role="radiogroup" aria-label="Khung giờ nhận kho">
            {MOVE_IN_SLOTS.map(s => {
              const past = isSlotPast(s, startDate)
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={slot === s.value}
                  disabled={past}
                  className={`handover-slot${slot === s.value ? ' active' : ''}`}
                  onClick={() => onSlotChange(s.value)}
                  title={past ? 'Khung giờ này hôm nay đã qua' : undefined}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          <small className="handover-hint">Nhân viên phụ trách sẽ nhận lịch kèm số điện thoại của bạn và có thể gọi trước để xác nhận.</small>
        </div>
      )}

      {method === HANDOVER_METHODS.Online && (
        <div className="handover-online-note" role="note">
          <strong>Lưu ý khi bàn giao online</strong>
          <p>{ONLINE_HANDOVER_NOTE}</p>
        </div>
      )}
    </div>
  )
}
