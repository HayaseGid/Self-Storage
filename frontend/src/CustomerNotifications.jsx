import React, { useEffect, useRef, useState } from 'react'
import './CustomerNotifications.css'

/*
 * Trang "Thông báo" của khách hàng + khối "Thông báo mới" ở Tổng quan.
 * Dữ liệu từ useCustomerNotifications (customerNoticeData.js).
 */

const ICON = { danger: '!', warn: '⏰', info: 'i', ok: '✓' }
const FILTERS = [
  ['all', 'Tất cả'],
  ['contract', 'Hợp đồng'],
  ['payment', 'Thanh toán'],
  ['storage', 'Kho của tôi'],
  ['policy', 'Chính sách']
]

function NotificationItem({ item, isNew, onAction }) {
  return (
    <li className={`cn-item ${item.tone}${isNew ? ' new' : ''}`}>
      <span className="cn-icon" aria-hidden="true">{ICON[item.tone] || 'i'}</span>
      <div className="cn-text">
        <strong>
          {item.title}
          {isNew && <span className="cn-new">Mới</span>}
        </strong>
        <p>{item.message}</p>
      </div>
      {item.action && (
        <button type="button" className="dashboard-secondary-btn cn-action" onClick={() => onAction(item)}>
          {item.action.label}
        </button>
      )}
    </li>
  )
}

export default function CustomerNotificationsPage({ center, onAction }) {
  const [filter, setFilter] = useState('all')
  // Ghi nhớ các thông báo CHƯA xem lúc mở trang để vẫn gắn nhãn "Mới" trong lần xem này.
  const freshAtOpen = useRef(null)
  if (freshAtOpen.current === null) freshAtOpen.current = new Set(center.notifications.filter(n => !center.isSeen(n.id)).map(n => n.id))
  useEffect(() => {
    center.notifications.forEach(n => { if (!center.isSeen(n.id)) freshAtOpen.current.add(n.id) })
    center.markAll()
  }, [center.notifications.map(n => n.id).join('|')])

  const counts = center.notifications.reduce((acc, n) => ({ ...acc, [n.section]: (acc[n.section] || 0) + 1 }), {})
  const shown = center.notifications.filter(n => filter === 'all' || n.section === filter)

  return (
    <div className="customer-content-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">NOTIFICATIONS</span>
          <h1>Thông báo</h1>
          <p>Nhắc hạn thuê kho, gia hạn, thanh toán và thay đổi chính sách.</p>
        </div>
        {center.notifications.length > 0 && <span className="page-count">{center.notifications.length} thông báo</span>}
      </div>

      <div className="cn-filters" role="tablist" aria-label="Lọc thông báo">
        {FILTERS.filter(([key]) => key === 'all' || counts[key]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}{key !== 'all' && <span>{counts[key]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0
        ? <div className="empty-state">Bạn chưa có thông báo nào.</div>
        : (
          <ul className="cn-list">
            {shown.map(item => <NotificationItem key={item.id} item={item} isNew={freshAtOpen.current.has(item.id)} onAction={onAction} />)}
          </ul>
        )}
    </div>
  )
}

/* Khối nhỏ ở Tổng quan: tối đa 3 thông báo quan trọng nhất. */
export function NotificationsPreview({ center, onAction, onOpenAll }) {
  const top = center.notifications.slice(0, 3)
  if (!top.length) return null
  return (
    <section className="cn-preview" aria-label="Thông báo mới">
      <div className="cn-preview-head">
        <h2>Thông báo {center.unseenCount > 0 && <span className="cnav-badge">{center.unseenCount}</span>}</h2>
        <button type="button" onClick={onOpenAll}>Xem tất cả →</button>
      </div>
      <ul className="cn-list compact">
        {top.map(item => <NotificationItem key={item.id} item={item} isNew={!center.isSeen(item.id)} onAction={onAction} />)}
      </ul>
    </section>
  )
}
