/**
 * ======================================================================
 * FILE: src/features/notification/CustomerNotifications.jsx  —  TRANG "THÔNG BÁO" CỦA KHÁCH + KHỐI "THÔNG BÁO MỚI"
 * CHỨC NĂNG: Hiển thị danh sách thông báo của khách hàng (nhắc hạn thuê, gia hạn, thanh toán, trả kho,
 *   thay đổi chính sách). Thông báo KHÔNG lấy từ một API riêng mà được tính sẵn ở frontend bởi
 *   useCustomerNotifications (services/customerNoticeData.js) rồi truyền vào đây qua prop `center`.
 *   Trang đầy đủ có bộ lọc theo nhóm và phân trang; khối nhỏ (preview) dùng ở Tổng quan và popup chuông.
 * THÀNH PHẦN CHÍNH:
 *   - NotificationItem (nội bộ): vẽ 1 dòng thông báo.
 *   - CustomerNotificationsPage (export default): trang "Thông báo" đầy đủ (lọc + phân trang 10 dòng).
 *   - NotificationsPreview (export): khối tối đa 3 thông báo + nút "Xem tất cả".
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx (trang + preview),
 *   src/features/notification/HeaderNotificationBell.jsx (preview trong popup chuông).
 * PHỤ THUỘC: components/common/listKit (Pager, useClientPaging), CustomerNotifications.css.
 * API: Không gọi API (dữ liệu do component cha truyền vào).
 * LUỒNG: CustomerAccount tính `notices` = useCustomerNotifications(...) -> truyền `center` vào trang ->
 *   mở trang thì center.markAll() đánh dấu đã xem -> người dùng chọn bộ lọc -> lọc + phân trang ->
 *   bấm nút hành động trên 1 dòng -> onAction(item) (cha điều hướng tới đúng chỗ xử lý).
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   NotificationItem: Vẽ 1 dòng thông báo: biểu tượng theo tone, tiêu đề, nhãn "Mới", nội dung và nút hành động (nếu có) → dùng ở: CustomerNotificationsPage, NotificationsPreview
 *   CustomerNotificationsPage: Trang "Thông báo" đầy đủ của khách: mở trang là đánh dấu tất cả đã xem → dùng ở: CustomerAccount.jsx (CustomerDashboard)
 *   NotificationsPreview: Khối nhỏ "Thông báo": hiện tối đa 3 thông báo đầu danh sách (đã được sắp theo độ quan trọng) kèm số chưa xem và nút "Xem tất cả" → dùng ở: HeaderNotificationBell.jsx (HeaderNotificationBell), CustomerAccount.jsx (CustomerDashboard)
 */
import React, { useEffect, useRef, useState } from 'react'
import './CustomerNotifications.css'
import { Pager, useClientPaging } from '../../components/common/listKit'

/** Ký tự biểu tượng theo mức độ (tone) của thông báo: nguy cấp, cảnh báo, thông tin, hoàn tất. */
const ICON = { danger: '!', warn: '⏰', info: 'i', ok: '✓' }
/** Các nút lọc trên trang Thông báo: [khóa nhóm (trùng item.section), nhãn hiển thị]. */
const FILTERS = [
  ['all', 'Tất cả'],
  ['contract', 'Hợp đồng'],
  ['payment', 'Thanh toán'],
  ['storage', 'Kho của tôi'],
  ['policy', 'Chính sách']
]

/**
 * Vẽ 1 dòng thông báo: biểu tượng theo tone, tiêu đề, nhãn "Mới", nội dung và nút hành động (nếu có).
 * Được gọi bởi: CustomerNotificationsPage và NotificationsPreview (mỗi thông báo 1 lần).
 * @param {object} props
 * @param {object} props.item thông báo { id, tone, title, message, section, action?: { label, ... } }.
 * @param {boolean} props.isNew true thì hiện nhãn "Mới" và tô nổi dòng.
 * @param {Function} props.onAction (item) => void, chạy khi bấm nút hành động của dòng.
 * @returns {JSX.Element} thẻ <li>.
 */
function NotificationItem({ item, isNew, onAction }) {
  // 1 dòng thông báo
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

/**
 * Trang "Thông báo" đầy đủ của khách: mở trang là đánh dấu tất cả đã xem (center.markAll) nhưng vẫn giữ
 * nhãn "Mới" cho những thông báo chưa xem trong lần mở này; có nút lọc theo nhóm và phân trang 10 dòng.
 * Được gọi bởi: CustomerAccount.jsx khi khách mở tab "Thông báo".
 * @param {object} props
 * @param {object} props.center kết quả useCustomerNotifications: { notifications, isSeen(id), markAll(), unseenCount }.
 * @param {Function} props.onAction (item) => void, cha xử lý khi bấm nút hành động (mở hợp đồng, thanh toán...).
 * @returns {JSX.Element}
 */
export default function CustomerNotificationsPage({ center, onAction }) {
  const [filter, setFilter] = useState('all') // nhóm đang lọc: 'all' | 'contract' | 'payment' | 'storage' | 'policy'
  // Ghi nhớ các thông báo CHƯA xem lúc mở trang để vẫn gắn nhãn "Mới" trong lần xem này.
  const freshAtOpen = useRef(null)
  if (freshAtOpen.current === null) freshAtOpen.current = new Set(center.notifications.filter(n => !center.isSeen(n.id)).map(n => n.id))
  // Chạy khi mở trang và mỗi khi danh sách id thông báo thay đổi: thêm thông báo mới vào tập "Mới",
  // rồi đánh dấu tất cả là đã xem (để số đỏ trên chuông về 0).
  useEffect(() => {
    center.notifications.forEach(n => { if (!center.isSeen(n.id)) freshAtOpen.current.add(n.id) })
    center.markAll()
  }, [center.notifications.map(n => n.id).join('|')])

  // counts: số thông báo theo từng nhóm (để hiện số trên nút lọc và ẩn nút của nhóm rỗng).
  // shown: danh sách sau khi lọc; paging: cắt trang, đổi bộ lọc thì quay về trang 1 (resetKey).
  const counts = center.notifications.reduce((acc, n) => ({ ...acc, [n.section]: (acc[n.section] || 0) + 1 }), {})
  const shown = center.notifications.filter(n => filter === 'all' || n.section === filter)
  const paging = useClientPaging(shown, { resetKey: filter })

  // Trang thông báo của khách
  return (
    <div className="customer-content-page">
      {/* Tiêu đề trang */}
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">NOTIFICATIONS</span>
          <h1>Thông báo</h1>
          <p>Nhắc hạn thuê kho, gia hạn, thanh toán và thay đổi chính sách.</p>
        </div>
        {center.notifications.length > 0 && <span className="page-count">{center.notifications.length} thông báo</span>}
      </div>

      {/* Nút lọc theo nhóm */}
      <div className="cn-filters" role="tablist" aria-label="Lọc thông báo">
        {FILTERS.filter(([key]) => key === 'all' || counts[key]).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}{key !== 'all' && <span>{counts[key]}</span>}
          </button>
        ))}
      </div>

      {/* Danh sách thông báo + phân trang */}
      {shown.length === 0
        ? <div className="empty-state">Bạn chưa có thông báo nào.</div>
        : (
          <ul className="cn-list">
            {paging.pageRows.map(item => <NotificationItem key={item.id} item={item} isNew={freshAtOpen.current.has(item.id)} onAction={onAction} />)}
          </ul>
        )}
      <Pager {...paging.pagerProps} unit="thông báo" />
    </div>
  )
}

/**
 * Khối nhỏ "Thông báo": hiện tối đa 3 thông báo đầu danh sách (đã được sắp theo độ quan trọng) kèm số chưa xem
 * và nút "Xem tất cả". Không có thông báo nào thì không vẽ gì (trả về null).
 * Được gọi bởi: CustomerAccount.jsx (trang Tổng quan) và HeaderNotificationBell.jsx (trong popup chuông).
 * @param {object} props
 * @param {object} props.center kết quả useCustomerNotifications (hoặc bản đã lọc bớt từ chuông).
 * @param {Function} props.onAction (item) => void, khi bấm nút hành động của 1 thông báo.
 * @param {Function} props.onOpenAll () => void, khi bấm "Xem tất cả →" (mở tab Thông báo).
 * @returns {JSX.Element|null}
 */
export function NotificationsPreview({ center, onAction, onOpenAll }) {
  const top = center.notifications.slice(0, 3)
  if (!top.length) return null
  // Khối 3 thông báo mới + "Xem tất cả"
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
