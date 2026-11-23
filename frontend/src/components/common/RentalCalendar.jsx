/**
 * ======================================================================
 * FILE: src/components/common/RentalCalendar.jsx  —  LỊCH CHỌN NGÀY BẮT ĐẦU THUÊ KHO
 * CHỨC NĂNG: Lịch tháng để khách chọn ngày bắt đầu thuê. Không cho chọn ngày quá khứ (theo "hôm nay"
 *   của Demo Clock) hoặc sau maxDate; tô màu cả kỳ thuê từ ngày bắt đầu tới ngày kết thúc dự kiến; có nút
 *   chọn nhanh (Hôm nay, Ngày mai, Thứ Hai tới, Đầu tháng sau) và điều khiển bằng phím mũi tên.
 * THÀNH PHẦN CHÍNH:
 *   - RentalCalendar (default) : component lịch.
 *   - buildMonth : dựng mảng ô ngày của 1 tháng (lưới 7 cột, Thứ Hai đầu tuần).
 *   - startOfDay / sameDay / addDays / fmt / keyOf : hàm phụ về ngày.
 * DÙNG Ở: src/App.jsx (trang đặt kho), src/pages/customer/CartPage.jsx.
 * PHỤ THUỘC: react, src/demoClock/demoClock (getTodayDate), ./RentalCalendar.css.
 * API: Không gọi API.
 * LUỒNG: Khách bấm 1 ô ngày / nút chọn nhanh / Enter -> select(date) -> onChange(date) báo trang cha
 *   -> trang tính endDate (calculateEndDate) và truyền lại -> lịch tô kỳ thuê + dòng tóm tắt.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   startOfDay: Trả về bản sao của ngày ở 00:00:00 → dùng ở: RentalCalendar
 *   sameDay: Kiểm tra 2 ngày có trùng ngày/tháng/năm không → dùng ở: RentalCalendar
 *   addDays: Cộng n ngày vào một ngày → dùng ở: moveFocus, RentalCalendar
 *   fmt: Định dạng ngày thành 'dd/MM/yyyy' (null -> '—') → dùng ở: RentalCalendar
 *   keyOf: Tạo khóa duy nhất cho 1 ngày (dùng làm key React và thuộc tính data-day) → dùng ở: RentalCalendar
 *   buildMonth: Dựng mảng ô của 1 tháng cho lưới 7 cột (Thứ Hai là cột đầu), ô trống ở đầu/cuối là null → dùng ở: RentalCalendar
 *   RentalCalendar: Component lịch chọn ngày bắt đầu thuê → dùng ở: App.jsx (BookingPage), CartPage.jsx (CartPage)
 *   isDisabled: Ngày bị khóa nếu trước minDate hoặc sau maxDate → dùng ở: select, RentalCalendar
 *   select: Chọn 1 ngày (bỏ qua nếu bị khóa): báo lên cha và chuyển focus tới ngày đó → dùng ở: onKeyDown, RentalCalendar
 *   moveFocus: Dời ô đang focus đi `days` ngày (giới hạn trong min/max), tự chuyển tháng hiển thị nếu cần → dùng ở: onKeyDown
 *   onKeyDown: Xử lý bàn phím trên lưới ngày: mũi tên để di chuyển, Enter/Space để chọn → dùng ở: RentalCalendar
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getTodayDate } from '../../demoClock/demoClock'
import './RentalCalendar.css'

// Nhãn các cột thứ trong tuần (Thứ Hai đầu tuần).
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

/**
 * Trả về bản sao của ngày ở 00:00:00.
 */
const startOfDay = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
/**
 * Kiểm tra 2 ngày có trùng ngày/tháng/năm không.
 */
const sameDay = (a, b) => !!a && !!b &&
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
/**
 * Cộng n ngày vào một ngày.
 */
const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
/**
 * Định dạng ngày thành 'dd/MM/yyyy' (null -> '—').
 */
const fmt = date => date
  ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  : '—'
/**
 * Tạo khóa duy nhất cho 1 ngày (dùng làm key React và thuộc tính data-day).
 */
const keyOf = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

/**
 * Dựng mảng ô của 1 tháng cho lưới 7 cột (Thứ Hai là cột đầu), ô trống ở đầu/cuối là null.
 * @param {Date} monthDate một ngày bất kỳ trong tháng cần dựng.
 * @returns {Array<Date|null>} mảng ô, độ dài chia hết cho 7.
 */
function buildMonth(monthDate) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // Thứ Hai là cột đầu
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7) cells.push(null)
  return cells
}

/**
 * Component lịch chọn ngày bắt đầu thuê.
 * @param {object} props value (Date đang chọn), onChange(Date), endDate (ngày kết thúc dự kiến để tô kỳ thuê),
 *   minDate, maxDate, durationMonths (số tháng thuê, để hiển thị chú thích).
 * @returns {JSX.Element}
 */
export default function RentalCalendar({ value, onChange, endDate, minDate, maxDate, durationMonths }) {
  // "Hôm nay" theo Demo Clock (tính 1 lần khi mở lịch).
  const today = useMemo(() => startOfDay(getTodayDate()), [])
  const min = startOfDay(minDate || today)
  const max = maxDate ? startOfDay(maxDate) : null
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value || min
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [focusDate, setFocusDate] = useState(value || min) // ô ngày đang được focus bằng bàn phím
  const gridRef = useRef(null)
  const shouldFocus = useRef(false) // true khi vừa di chuyển bằng phím -> cần focus ô mới sau render

  // Chạy khi value đổi từ bên ngoài (vd khôi phục bản nháp): chuyển lịch tới tháng đó.
  useEffect(() => {
    if (value) {
      setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1))
      setFocusDate(value)
    }
  }, [value?.getTime()])

  // Chạy khi focusDate / viewMonth đổi: nếu vừa di chuyển bằng phím mũi tên thì focus vào ô ngày mới.
  useEffect(() => {
    if (!shouldFocus.current) return
    shouldFocus.current = false
    gridRef.current?.querySelector(`[data-day="${keyOf(focusDate)}"]`)?.focus()
  }, [focusDate, viewMonth])

  // Ngày bị khóa nếu trước minDate hoặc sau maxDate.
  const isDisabled = date => date < min || (max && date > max)
  const cells = buildMonth(viewMonth)
  const canPrev = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0) >= new Date(min.getFullYear(), min.getMonth(), 1)
  const canNext = !max || new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <= max

  // Chọn 1 ngày (bỏ qua nếu bị khóa): báo lên cha và chuyển focus tới ngày đó.
  const select = date => {
    if (!date || isDisabled(date)) return
    onChange(date)
    setFocusDate(date)
  }

  // Dời ô đang focus đi `days` ngày (giới hạn trong min/max), tự chuyển tháng hiển thị nếu cần.
  const moveFocus = days => {
    let next = addDays(focusDate, days)
    if (next < min) next = min
    if (max && next > max) next = max
    shouldFocus.current = true
    setFocusDate(next)
    if (next.getMonth() !== viewMonth.getMonth() || next.getFullYear() !== viewMonth.getFullYear()) {
      setViewMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    }
  }

  // Xử lý bàn phím trên lưới ngày: mũi tên để di chuyển, Enter/Space để chọn.
  const onKeyDown = event => {
    const map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (map[event.key] !== undefined) {
      event.preventDefault()
      moveFocus(map[event.key])
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(focusDate)
    }
  }

  const nextMonday = addDays(today, ((8 - today.getDay()) % 7) || 7)
  const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const quickPicks = [
    ['Hôm nay', today],
    ['Ngày mai', addDays(today, 1)],
    ['Thứ Hai tới', nextMonday],
    ['Đầu tháng sau', firstOfNextMonth]
  ].filter(([, date]) => !isDisabled(date))

  const monthLabel = viewMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
  const end = endDate ? startOfDay(endDate) : null

  // Lịch chọn ngày bắt đầu thuê
  return (
    <div className="rc">
      {/* Nút chọn nhanh: hôm nay, ngày mai... */}
      <div className="rc-quick" aria-label="Chọn nhanh ngày bắt đầu">
        {quickPicks.map(([label, date]) => (
          <button
            key={label}
            type="button"
            className={sameDay(value, date) ? 'active' : ''}
            onClick={() => {
              select(date)
              setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1))
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lưới ngày của tháng + nút chuyển tháng */}
      <div className="rc-card">
        <div className="rc-head">
          <button type="button" className="rc-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} disabled={!canPrev} aria-label="Tháng trước">‹</button>
          <strong aria-live="polite">{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong>
          <button type="button" className="rc-nav" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} disabled={!canNext} aria-label="Tháng sau">›</button>
        </div>

        <div className="rc-grid" role="grid" ref={gridRef} onKeyDown={onKeyDown}>
          {WEEKDAYS.map(day => <span key={day} className="rc-weekday" role="columnheader">{day}</span>)}
          {cells.map((date, index) => {
            if (!date) return <span key={`empty-${index}`} className="rc-empty" />
            const disabled = isDisabled(date)
            const isStart = sameDay(date, value)
            const isEnd = sameDay(date, end)
            const inRange = value && end && date > value && date < end
            const classes = [
              'rc-day',
              disabled && 'disabled',
              isStart && 'start',
              isEnd && 'end',
              inRange && 'in-range',
              sameDay(date, today) && 'today'
            ].filter(Boolean).join(' ')
            // 1 ô ngày (bị khóa nếu ngoài khoảng cho phép)
            return (
              <button
                key={keyOf(date)}
                type="button"
                role="gridcell"
                className={classes}
                data-day={keyOf(date)}
                disabled={disabled}
                tabIndex={sameDay(date, focusDate) ? 0 : -1}
                aria-selected={isStart}
                aria-label={`${fmt(date)}${isStart ? ', ngày bắt đầu' : ''}${isEnd ? ', ngày kết thúc dự kiến' : ''}`}
                onClick={() => select(date)}
                onFocus={() => setFocusDate(date)}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>

        <div className="rc-legend">
          <span><i className="rc-dot start" /> Bắt đầu</span>
          <span><i className="rc-dot range" /> Kỳ thuê {durationMonths ? `${durationMonths} tháng` : ''}</span>
          <span><i className="rc-dot end" /> Kết thúc</span>
        </div>
      </div>

      {/* Dòng tóm tắt kỳ thuê đã chọn */}
      <div className={`rc-summary${value ? '' : ' empty'}`}>
        {value
          ? <>Thuê từ <strong>{fmt(value)}</strong> đến <strong>{fmt(end)}</strong>{durationMonths ? <> · {durationMonths} tháng</> : null}</>
          : 'Chọn ngày bắt đầu thuê trên lịch.'}
      </div>
    </div>
  )
}
