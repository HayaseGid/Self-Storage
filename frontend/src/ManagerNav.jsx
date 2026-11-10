import React, { useCallback, useEffect, useState } from 'react'
import { apiGet } from './api'
import './ManagerNav.css'

/*
 * MENU TRÁI CỦA FACILITY MANAGER (file THÊM MỚI): gom nhóm theo loại việc + số việc đang chờ xử lý.
 *   - Một bộ icon nét mảnh đồng nhất, tên mục ngắn (tiêu đề đầy đủ vẫn hiện ở đầu trang).
 *   - Nhóm "Thiết lập" (ít dùng) thu gọn được; đang ở mục trong nhóm thì tự mở.
 *   Số đỏ lấy từ các API sẵn có, tải lại mỗi khi đổi mục / quay lại tab trình duyệt / mỗi 2 phút:
 *     - Sự cố kho          : kho hư mà báo cáo mới nhất chưa xử lý (kho còn Bảo trì / Chờ kiểm tra) - cùng luật nút "Cần xử lý"
 *     - Công nợ & phí trễ  : hợp đồng còn nợ tiền thuê quá hạn / phí trễ / phí khác (7a) - cùng luật nút "Đang nợ"
 *     - Khiếu nại kiểm kho : khiếu nại khách gửi, chờ Manager quyết định (14)
 *   API nào lỗi / chưa có thì mục đó không hiện số (không chặn menu).
 */

const svg = children => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
)
const ICONS = {
  overview: svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>),
  reservations: svg(<><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2.5v3" /><path d="M16 2.5v3" /><path d="M4 9.5h16" /><path d="M8 13.5h3" /><path d="M8 17h6" /></>),
  units: svg(<><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>),
  reports: svg(<><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4.5" /><path d="M12 17.5h.01" /></>),
  staff: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20" /></>),
  contracts: svg(<><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" /><path d="M14 3v5h5" /><path d="M8.5 13h7" /><path d="M8.5 16.5h5" /></>),
  lateFees: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  returnInspections: svg(<><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" /><path d="M12 7v4" /><path d="M12 14h.01" /></>),
  unitTypes: svg(<><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h3" /><path d="M11 12h9" /><circle cx="9" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></>),
  prices: svg(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>)
}
const Chevron = ({ open }) => (
  <svg className={`mnav-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
)

const GROUPS = [
  { id: 'main', title: null, items: [{ key: 'overview', label: 'Tổng quan' }] },
  {
    id: 'ops',
    title: 'Vận hành',
    items: [
      { key: 'units', label: 'Kho cơ sở' },
      { key: 'reports', label: 'Sự cố kho' },
      { key: 'staff', label: 'Nhân sự' }
    ]
  },
  {
    id: 'finance',
    title: 'Khách hàng & tài chính',
    items: [
      { key: 'reservations', label: 'Đơn đặt chỗ' },
      { key: 'contracts', label: 'Hợp đồng' },
      { key: 'lateFees', label: 'Công nợ & phí trễ' },
      { key: 'returnInspections', label: 'Khiếu nại kiểm kho' }
    ]
  },
  {
    id: 'setup',
    title: 'Thiết lập',
    collapsible: true,
    items: [
      { key: 'unitTypes', label: 'Đặc tính kho' },
      { key: 'prices', label: 'Bảng giá' }
    ]
  }
]

const HINTS = {
  reports: n => `${n} kho hư chưa xử lý`,
  reservations: n => `${n} đơn chờ bàn giao / chờ cọc`,
  contracts: n => `${n} hợp đồng sắp / đã hết hạn`,
  lateFees: n => `${n} hợp đồng đang nợ`,
  returnInspections: n => `${n} khiếu nại chờ quyết định`
}
const SETUP_KEY = 'storespace_mnav_setup_open'

export function useManagerBadges(facilityId, activeTab) {
  const [counts, setCounts] = useState({})

  const load = useCallback(async () => {
    if (facilityId == null) return
    const [reports, lateFees, inspections] = await Promise.allSettled([
      apiGet(`/api/manager-tools/facilities/${facilityId}/unit-reports`),
      apiGet(`/api/late-fees/facilities/${facilityId}`),
      apiGet(`/api/return-inspections/facilities/${facilityId}`)
    ])
    const next = {}
    if (reports.status === 'fulfilled' && Array.isArray(reports.value)) {
      // Giống nút "Cần xử lý" của Báo cáo sự cố: chỉ báo cáo mới nhất của mỗi kho, kho hư và chưa mở lại
      const latest = new Map()
      reports.value.forEach(r => { if (!latest.has(r.unitId)) latest.set(r.unitId, r.taskId) })
      next.reports = reports.value.filter(r =>
        r.result === 'Damaged' && latest.get(r.unitId) === r.taskId &&
        (r.unitStatus === 'Maintenance' || r.unitStatus === 'Pending Inspection')).length
    }
    if (lateFees.status === 'fulfilled' && Array.isArray(lateFees.value?.items)) {
      next.lateFees = lateFees.value.items.filter(it =>
        it.overdueRent?.length > 0 || Number(it.lateFeeUnpaid) > 0 || Number(it.otherUnpaid) > 0).length
    }
    if (inspections.status === 'fulfilled' && inspections.value?.summary) {
      next.returnInspections = Number(inspections.value.summary.pendingManager || 0) + Number(inspections.value.summary.disputed || 0)
    }
    setCounts(next)
  }, [facilityId])

  // Đổi mục (vd vừa xử lý xong 1 khiếu nại rồi chuyển mục khác) -> cập nhật số
  useEffect(() => { load() }, [load, activeTab])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(load, 120000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  return counts
}

/* freshUnits: số kho mới BOM vừa thêm cho cơ sở (nhãn "Mới" sẵn có của mục Kho cơ sở).
   extraCounts: [THÊM] số việc tính sẵn ở trang (vd { reservations: đơn cần theo dõi, contracts: HĐ cần chú ý }). */
export default function ManagerNav({ activeTab, onSelect, facilityId, freshUnits = 0, extraCounts = {} }) {
  const apiCounts = useManagerBadges(facilityId, activeTab)
  const counts = { ...extraCounts, ...apiCounts }
  const [setupOpen, setSetupOpen] = useState(() => {
    try { return localStorage.getItem(SETUP_KEY) === '1' } catch { return false }
  })
  const toggleSetup = () => setSetupOpen(v => {
    try { localStorage.setItem(SETUP_KEY, v ? '0' : '1') } catch { /* bỏ qua */ }
    return !v
  })

  return (
    <nav className="customer-nav mnav" aria-label="Menu Facility Manager">
      {GROUPS.map(group => {
        const hasActive = group.items.some(i => i.key === activeTab)
        const open = !group.collapsible || setupOpen || hasActive
        const groupCount = group.items.reduce((s, i) => s + Number(counts[i.key] || 0), 0)
        return (
          <div key={group.id} className="mnav-group">
            {group.title && (group.collapsible ? (
              <button type="button" className="mnav-title toggle" onClick={toggleSetup} aria-expanded={open} disabled={hasActive}>
                {group.title}
                {!open && groupCount > 0 && <em className="mnav-dot" aria-label={`${groupCount} việc chờ`} />}
                <Chevron open={open} />
              </button>
            ) : <div className="mnav-title">{group.title}</div>)}
            {open && group.items.map(item => {
              const count = Number(counts[item.key] || 0)
              const hint = count > 0 && HINTS[item.key] ? HINTS[item.key](count) : null
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`mnav-item${activeTab === item.key ? ' active' : ''}`}
                  aria-current={activeTab === item.key ? 'page' : undefined}
                  onClick={() => onSelect(item.key)}
                  title={hint || item.label}
                >
                  <span className="mnav-icon">{ICONS[item.key]}</span>
                  <i className="mnav-label">{item.label}</i>
                  {item.key === 'units' && freshUnits > 0 && <em className="mnav-badge new" aria-label={`${freshUnits} kho mới`}>Mới {freshUnits}</em>}
                  {count > 0 && <em className="mnav-badge" aria-label={hint}>{count > 99 ? '99+' : count}</em>}
                </button>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
