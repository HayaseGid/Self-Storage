/**
 * ======================================================================
 * FILE: src/features/booking/HandoverChoice.jsx  —  CHỌN CÁCH NHẬN KHO + KHUNG GIỜ NHẬN KHO (mục 4.1)
 * CHỨC NĂNG: Ô chọn cách nhận kho khi đặt kho, dùng chung cho trang Đặt kho 1 kho và trang Giỏ kho:
 *   - InPerson (Nhận trực tiếp): khách đến cơ sở trong 1 trong 4 khung 2 tiếng -> gửi appointmentSlot
 *     "08:00" | "10:00" | "12:00" | "14:00". Khung giờ đã qua trong ngày hôm nay bị khóa.
 *   - Online (Bàn giao online): không hẹn giờ; mã truy cập hiện trong tài khoản sau khi nhân viên bàn giao,
 *     chìa khóa để ở quầy lễ tân.
 *   Kèm các hằng số + hàm kiểm tra để trang đặt kho báo lỗi trước khi gửi.
 * THÀNH PHẦN CHÍNH:
 *   - HandoverChoice (default export): component chọn cách nhận + khung giờ.
 *   - HANDOVER_METHODS, MOVE_IN_SLOTS, ONLINE_HANDOVER_NOTE (export): hằng số cách nhận, 4 khung giờ, câu lưu ý online.
 *   - slotLabel, isSlotPast, handoverChoiceError (export): đổi nhãn khung giờ, kiểm tra khung đã qua, kiểm tra lỗi.
 * DÙNG Ở: src/App.jsx (trang Đặt kho), src/pages/customer/CartPage.jsx (Giỏ kho),
 *   src/features/contract/ContractCard.jsx (chỉ dùng ONLINE_HANDOVER_NOTE).
 * PHỤ THUỘC: React, HandoverChoice.css.
 * API: Không gọi API trực tiếp. Giá trị method/slot được trang cha gửi kèm khi tạo đơn đặt kho; backend
 *   (ReservationService) kiểm tra lại đúng các giá trị này.
 * LUỒNG: khách bấm thẻ "Nhận trực tiếp" / "Bàn giao online" -> onMethodChange -> cha lưu state -> (trực tiếp) bấm
 *   khung giờ -> onSlotChange -> khi bấm Đặt kho, cha gọi handoverChoiceError() để chặn nếu chưa chọn khung / khung đã qua
 *   -> gửi handoverMethod + appointmentSlot lên backend.
 * ======================================================================
 */
import React from 'react'
import './HandoverChoice.css'

/** 2 cách nhận kho; giá trị chuỗi khớp với backend (ReservationService). */
export const HANDOVER_METHODS = { InPerson: 'InPerson', Online: 'Online' }

/**
 * 4 khung giờ nhận kho trực tiếp: value gửi lên backend, label hiển thị, endHour = giờ kết thúc khung
 * (dùng để khóa khung đã qua trong ngày).
 */
export const MOVE_IN_SLOTS = [
  { value: '08:00', label: '08:00 – 10:00', endHour: 10 },
  { value: '10:00', label: '10:00 – 12:00', endHour: 12 },
  { value: '12:00', label: '12:00 – 14:00', endHour: 14 },
  { value: '14:00', label: '14:00 – 16:00', endHour: 16 }
]

/**
 * Đổi giá trị khung giờ ("08:00") thành nhãn hiển thị ("08:00 – 10:00"); không tìm thấy thì trả nguyên giá trị.
 * @param {string} value giá trị khung giờ.
 * @returns {string}
 * Được gọi bởi: App.jsx, CartPage (hiện khung giờ đã chọn trong tóm tắt đơn).
 */
export const slotLabel = value => MOVE_IN_SLOTS.find(s => s.value === value)?.label || value

/** Câu hướng dẫn nhận kho online; hiện trong HandoverChoice, ContractCard, App.jsx, CartPage. */
export const ONLINE_HANDOVER_NOTE = 'Sau khi nhân viên bàn giao, mã truy cập sẽ hiện trong tài khoản của bạn (mục Kho của tôi). Chìa khóa được để ở quầy lễ tân của cơ sở: bạn lên lễ tân, báo mã đơn và mang theo CCCD để nhận.'

/**
 * Kiểm tra 2 ngày có cùng ngày/tháng/năm không (bỏ qua giờ).
 * @param {Date} a
 * @param {Date} b
 * @returns {boolean}
 */
const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/**
 * Khung giờ đã qua nếu ngày nhận kho là hôm nay và giờ hiện tại đã quá giờ kết thúc khung
 * (theo giờ máy khách; backend kiểm tra lại theo giờ Việt Nam).
 * @param {{endHour:number}} slot 1 phần tử của MOVE_IN_SLOTS.
 * @param {Date} startDate ngày nhận kho.
 * @returns {boolean}
 * Được gọi bởi: HandoverChoice (khóa nút khung giờ), handoverChoiceError.
 */
export function isSlotPast(slot, startDate) {
  const now = new Date()
  return sameDay(startDate, now) && now.getHours() >= slot.endHour
}

/**
 * Kiểm tra lựa chọn nhận kho trước khi đặt: Online luôn hợp lệ; InPerson phải chọn khung giờ và khung đó chưa qua.
 * @param {string} method 'InPerson' | 'Online'.
 * @param {string} slot giá trị khung giờ đã chọn ("08:00"...).
 * @param {Date} startDate ngày nhận kho.
 * @returns {string|null} câu lỗi cần báo cho khách, hoặc null nếu hợp lệ.
 * Được gọi bởi: App.jsx và CartPage trước khi gửi yêu cầu đặt kho.
 */
export function handoverChoiceError(method, slot, startDate) {
  if (method === HANDOVER_METHODS.Online) return null
  const chosen = MOVE_IN_SLOTS.find(s => s.value === slot)
  if (!chosen) return 'Vui lòng chọn khung giờ đến nhận kho.'
  if (isSlotPast(chosen, startDate)) return 'Khung giờ này hôm nay đã qua. Vui lòng chọn khung giờ khác.'
  return null
}

/**
 * Vẽ 2 thẻ chọn cách nhận kho (Nhận trực tiếp / Bàn giao online); nếu chọn trực tiếp thì hiện thêm 4 nút khung giờ
 * (khung đã qua bị khóa), nếu chọn online thì hiện lưu ý ONLINE_HANDOVER_NOTE. Component "có kiểm soát": state do cha giữ.
 * @param {object} props
 * @param {string} props.method cách nhận đang chọn ('InPerson' | 'Online').
 * @param {Function} props.onMethodChange onMethodChange(method) khi bấm 1 thẻ cách nhận.
 * @param {string} props.slot khung giờ đang chọn.
 * @param {Function} props.onSlotChange onSlotChange(value) khi bấm 1 nút khung giờ.
 * @param {Date} [props.startDate] ngày nhận kho (hiện trong tiêu đề, dùng để khóa khung giờ đã qua).
 * @returns {JSX.Element}
 * Được gọi bởi: App.jsx (trang Đặt kho), CartPage (Giỏ kho).
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
