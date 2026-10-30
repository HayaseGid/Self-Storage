import React, { useEffect, useMemo, useRef, useState } from 'react'
import './RentalCalendar.css'

/*
 * Lịch chọn ngày bắt đầu thuê.
 * - Không cho chọn ngày trong quá khứ hoặc sau maxDate.
 * - Tô màu cả kỳ thuê (từ ngày bắt đầu tới ngày kết thúc dự kiến).
 * - Có nút chọn nhanh và điều khiển bằng phím mũi tên.
 */

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const startOfDay = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
const sameDay = (a, b) => !!a && !!b &&
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const addDays = (date, n) => {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
const fmt = date => date
  ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  : '—'
const keyOf = date => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

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

export default function RentalCalendar({ value, onChange, endDate, minDate, maxDate, durationMonths }) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const min = startOfDay(minDate || today)
  const max = maxDate ? startOfDay(maxDate) : null
  const [viewMonth, setViewMonth] = useState(() => {
    const base = value || min
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [focusDate, setFocusDate] = useState(value || min)
  const gridRef = useRef(null)
  const shouldFocus = useRef(false)

  // Khi giá trị đổi từ bên ngoài (khôi phục bản nháp) thì chuyển lịch tới tháng đó.
  useEffect(() => {
    if (value) {
      setViewMonth(new Date(value.getFullYear(), value.getMonth(), 1))
      setFocusDate(value)
    }
  }, [value?.getTime()])

  useEffect(() => {
    if (!shouldFocus.current) return
    shouldFocus.current = false
    gridRef.current?.querySelector(`[data-day="${keyOf(focusDate)}"]`)?.focus()
  }, [focusDate, viewMonth])

  const isDisabled = date => date < min || (max && date > max)
  const cells = buildMonth(viewMonth)
  const canPrev = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0) >= new Date(min.getFullYear(), min.getMonth(), 1)
  const canNext = !max || new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1) <= max

  const select = date => {
    if (!date || isDisabled(date)) return
    onChange(date)
    setFocusDate(date)
  }

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

  return (
    <div className="rc">
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

      <div className={`rc-summary${value ? '' : ' empty'}`}>
        {value
          ? <>Thuê từ <strong>{fmt(value)}</strong> đến <strong>{fmt(end)}</strong>{durationMonths ? <> · {durationMonths} tháng</> : null}</>
          : 'Chọn ngày bắt đầu thuê trên lịch.'}
      </div>
    </div>
  )
}
