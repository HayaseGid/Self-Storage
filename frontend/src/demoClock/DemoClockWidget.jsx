import React, { useState } from 'react'
import {
  addDaysISO,
  addMonthsISO,
  clearSimulatedDate,
  formatDateVN,
  getRealTodayISO,
  getSimulatedDateISO,
  getTodayISO,
  setSimulatedDateISO
} from './demoClock'
import './DemoClockWidget.css'

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </svg>
  )
}

export default function DemoClockWidget() {
  const [expanded, setExpanded] = useState(false)
  const realToday = getRealTodayISO()
  const simulated = getSimulatedDateISO()
  const activeDate = simulated || realToday
  const isSimulated = Boolean(simulated && simulated !== realToday)

  const [draftDate, setDraftDate] = useState(activeDate)

  const toggleOpen = () => {
    if (!expanded) {
      setDraftDate(getTodayISO())
    }
    setExpanded(prev => !prev)
  }

  const handleConfirm = e => {
    e.preventDefault()
    if (!draftDate) return
    setSimulatedDateISO(draftDate)
    window.location.reload()
  }

  const handleResetToday = () => {
    clearSimulatedDate()
    window.location.reload()
  }

  const hasUnconfirmedChange = Boolean(draftDate && draftDate !== activeDate)

  return (
    <aside className={`demo-clock-root${isSimulated ? ' is-simulated' : ''}`} aria-label="Tiện ích giả lập ngày hệ thống">
      {expanded && (
        <div className="demo-clock-panel" role="dialog" aria-label="Điều chỉnh ngày giả lập (Demo)">
          <div className="demo-clock-header">
            <div>
              <span className="demo-clock-eyebrow">DEMO TIME TRAVEL</span>
              <h3>Giả lập ngày hệ thống</h3>
            </div>
            <button
              type="button"
              className="demo-clock-close"
              onClick={() => setExpanded(false)}
              aria-label="Thu gọn tiện ích ngày"
              title="Thu gọn"
            >
              ×
            </button>
          </div>

          <div className="demo-clock-status">
            <div>
              <span>Đang áp dụng:</span>
              <strong>{formatDateVN(activeDate)}</strong>
            </div>
            <em className={`demo-clock-badge ${isSimulated ? 'sim' : 'real'}`}>
              {isSimulated ? 'Đang giả lập' : 'Ngày thực tế'}
            </em>
          </div>

          <form className="demo-clock-form" onSubmit={handleConfirm}>
            <label className="demo-clock-label">
              Chọn ngày muốn chuyển tới
              <input
                type="date"
                value={draftDate}
                onChange={e => setDraftDate(e.target.value)}
                required
              />
            </label>

            <div className="demo-clock-quick">
              <span>Nhảy nhanh (cộng vào ngày đang chọn):</span>
              <div className="demo-clock-quick-grid">
                <button type="button" onClick={() => setDraftDate(d => addDaysISO(d, 1))}>+1 ngày</button>
                <button type="button" onClick={() => setDraftDate(d => addDaysISO(d, 7))}>+7 ngày</button>
                <button type="button" onClick={() => setDraftDate(d => addMonthsISO(d, 1))}>+1 tháng</button>
                <button type="button" onClick={() => setDraftDate(d => addMonthsISO(d, 6))}>+6 tháng</button>
                <button type="button" onClick={() => setDraftDate(d => addMonthsISO(d, 12))}>+1 năm</button>
              </div>
            </div>

            {hasUnconfirmedChange && (
              <div className="demo-clock-preview">
                Sẽ đổi sang ngày: <strong>{formatDateVN(draftDate)}</strong> (bấm Xác nhận để áp dụng)
              </div>
            )}

            <div className="demo-clock-actions">
              <button
                type="button"
                className="demo-clock-btn secondary"
                onClick={handleResetToday}
                disabled={!isSimulated && draftDate === realToday}
                title={`Quay về ngày thực tế (${formatDateVN(realToday)})`}
              >
                Về hôm nay
              </button>
              <button
                type="submit"
                className="demo-clock-btn primary"
                disabled={!draftDate}
              >
                Xác nhận
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        className={`demo-clock-trigger${expanded ? ' active' : ''}`}
        onClick={toggleOpen}
        aria-expanded={expanded}
        title={isSimulated ? `Đang giả lập ngày ${formatDateVN(activeDate)} (Bấm để chỉnh)` : `Ngày hệ thống: ${formatDateVN(activeDate)} (Bấm để giả lập ngày Demo)`}
      >
        <span className="demo-clock-icon">
          <ClockIcon />
          {isSimulated && <i className="demo-clock-dot" />}
        </span>
        <span className="demo-clock-trigger-text">
          <small>{isSimulated ? 'Ngày Demo' : 'Hôm nay'}</small>
          <strong>{formatDateVN(activeDate)}</strong>
        </span>
      </button>
    </aside>
  )
}

