/**
 * ======================================================================
 * FILE: src/pages/manager/ManagerNav.jsx  —  MENU TRÁI CỦA QUẢN LÝ CƠ SỞ
 * CHỨC NĂNG: Vẽ thanh menu bên trái của trang Facility Manager, chia mục theo nhóm công việc:
 *   Tổng quan · Vận hành (Kho cơ sở, Sự cố kho, Nhân sự) · Khách hàng & tài chính (Đơn đặt chỗ, Hợp đồng,
 *   Công nợ & phí trễ, Khiếu nại kiểm kho) · Thiết lập (Đặc tính kho, Bảng giá — nhóm này thu gọn được).
 *   Mỗi mục có thể hiện "số đỏ" = số việc đang chờ xử lý, để Manager biết nên vào đâu trước.
 * THÀNH PHẦN CHÍNH:
 *   - ICONS / GROUPS / HINTS: bộ icon SVG, danh sách nhóm + mục menu, câu gợi ý khi rê chuột lên số đỏ.
 *   - useManagerBadges(facilityId, activeTab): hook gọi API và đếm số việc chờ (Sự cố kho, Công nợ, Khiếu nại).
 *   - ManagerNav (export default): component menu, nhận mục đang chọn và báo lại khi người dùng bấm mục khác.
 * DÙNG Ở: src/pages/manager/FacilityManagerAccount.jsx.
 * PHỤ THUỘC: react, api/api.js (apiGet), ManagerNav.css (giao diện menu).
 * API (tải lại khi đổi mục, khi tab trình duyệt hiện lại, và mỗi 2 phút; API nào lỗi thì mục đó không hiện số):
 *   GET /api/manager-tools/facilities/{id}/unit-reports  -> đếm kho hư có báo cáo mới nhất chưa xử lý (luật như nút "Cần xử lý")
 *   GET /api/late-fees/facilities/{id}                   -> đếm hợp đồng còn nợ tiền thuê quá hạn / phí trễ / phí khác (luật như nút "Đang nợ")
 *   GET /api/return-inspections/facilities/{id}          -> đếm kết quả kiểm kho chờ Manager duyệt + khiếu nại của khách
 * LUỒNG: FacilityManagerAccount truyền activeTab + facilityId -> useManagerBadges gọi 3 API song song -> gộp với
 *   extraCounts (số tính sẵn ở trang) -> hiện số đỏ trên từng mục. Người dùng bấm mục -> onSelect(key) -> trang đổi activeTab.
 * ======================================================================
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '../../api/api'
import './ManagerNav.css'

/**
 * Bọc các thẻ path/rect/circle SVG thành 1 icon 24x24 nét mảnh (kích thước, màu nét do ManagerNav.css quy định).
 * @param {JSX.Element} children các hình vẽ bên trong icon.
 * @returns {JSX.Element} thẻ <svg> ẩn với trình đọc màn hình (chỉ để trang trí).
 * Được gọi khi khai báo bảng ICONS bên dưới.
 */
const svg = children => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
)
/** Bảng icon cho từng mục menu; khóa (overview, units...) trùng với `key` của mục trong GROUPS. */
const ICONS = {
  overview: svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>),
  reservations: svg(<><rect x="4" y="4" width="16" height="17" rx="2" /><path d="M8 2.5v3" /><path d="M16 2.5v3" /><path d="M4 9.5h16" /><path d="M8 13.5h3" /><path d="M8 17h6" /></>),
  units: svg(<><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>),
  reports: svg(<><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4.5" /><path d="M12 17.5h.01" /></>),
  staff: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20" /></>),
  contracts: svg(<><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" /><path d="M14 3v5h5" /><path d="M8.5 13h7" /><path d="M8.5 16.5h5" /></>),
  lateFees: svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  returnInspections: svg(<><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" /><path d="M12 7v4" /><path d="M12 14h.01" /></>),
  earlyReturns: svg(<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  unitTypes: svg(<><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h3" /><path d="M11 12h9" /><circle cx="9" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></>),
  prices: svg(<><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>)
}
/**
 * Icon mũi tên ">" cạnh tiêu đề nhóm thu gọn được; thêm class "open" để CSS xoay mũi tên xuống khi nhóm mở.
 * @param {{open: boolean}} props open = nhóm đang mở hay không.
 * Được dùng trong nút tiêu đề nhóm "Thiết lập".
 */
const Chevron = ({ open }) => (
  <svg className={`mnav-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
)

/**
 * Cấu trúc menu: mỗi nhóm có id, tiêu đề (null = không hiện tiêu đề), danh sách mục { key, label }.
 * `key` chính là giá trị activeTab mà FacilityManagerAccount dùng để chọn nội dung hiển thị.
 * Nhóm có `collapsible: true` thì có nút bấm để thu gọn / mở ra.
 */
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
      { key: 'returnInspections', label: 'Khiếu nại kiểm kho' },
      { key: 'earlyReturns', label: 'Trả kho sớm' }
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

/**
 * Hàm tạo câu gợi ý (hiện khi rê chuột / đọc bởi trình đọc màn hình) cho số đỏ của từng mục.
 * Mỗi hàm nhận n = số việc chờ, trả về chuỗi mô tả. Mục không có trong bảng thì chỉ hiện tên mục.
 */
const HINTS = {
  /**
   * Câu gợi ý cho số đỏ mục "Sự cố kho".
   */
  reports: n => `${n} kho hư chưa xử lý`,
  /**
   * Câu gợi ý cho số đỏ mục "Đơn đặt chỗ".
   */
  reservations: n => `${n} đơn chờ bàn giao / chờ cọc`,
  /**
   * Câu gợi ý cho số đỏ mục "Hợp đồng".
   */
  contracts: n => `${n} hợp đồng sắp / đã hết hạn`,
  /**
   * Câu gợi ý cho số đỏ mục "Công nợ & phí trễ".
   */
  lateFees: n => `${n} hợp đồng đang nợ`,
  /**
   * Câu gợi ý cho số đỏ mục "Khiếu nại kiểm kho".
   */
  returnInspections: n => `${n} khiếu nại chờ quyết định`,
  /**
   * Câu gợi ý cho số đỏ mục "Trả kho sớm".
   */
  earlyReturns: n => `${n} đơn trả kho sớm chờ duyệt`
}
/** Khóa localStorage nhớ nhóm "Thiết lập" đang mở ('1') hay thu gọn ('0') giữa các lần vào trang. */
const SETUP_KEY = 'storespace_mnav_setup_open'

/**
 * Hook: tính số việc đang chờ cho 3 mục menu của Manager (Sự cố kho, Công nợ & phí trễ, Khiếu nại kiểm kho).
 * Gọi song song 3 API bằng Promise.allSettled nên 1 API lỗi không làm hỏng các số còn lại.
 * API: GET /api/manager-tools/facilities/{id}/unit-reports, GET /api/late-fees/facilities/{id},
 *      GET /api/return-inspections/facilities/{id}.
 * Chạy lại khi: facilityId hoặc activeTab đổi, khi tab trình duyệt hiện lại, và mỗi 2 phút.
 * @param {number} facilityId mã cơ sở của Manager (null thì chưa tải).
 * @param {string} activeTab mục menu đang mở (đổi mục thì tải lại để số luôn mới).
 * @returns {{reports?:number, lateFees?:number, returnInspections?:number}} số việc chờ theo key mục; thiếu key = API lỗi.
 * Được gọi bởi: component ManagerNav bên dưới.
 */
export function useManagerBadges(facilityId, activeTab) {
  const [counts, setCounts] = useState({})

  /**
   * Gọi song song 3 API rồi đếm: kho hư có báo cáo mới nhất chưa xử lý; hợp đồng còn nợ tiền thuê/phí;
   * kết quả kiểm kho chờ Manager duyệt + đang khiếu nại.
   */
  const load = useCallback(async () => {
    if (facilityId == null) return
    const [reports, lateFees, inspections, early] = await Promise.allSettled([
      apiGet(`/api/manager-tools/facilities/${facilityId}/unit-reports`),
      apiGet(`/api/late-fees/facilities/${facilityId}`),
      apiGet(`/api/return-inspections/facilities/${facilityId}`),
      apiGet('/api/unit-returns/early/manager')
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
    if (early.status === 'fulfilled' && Array.isArray(early.value?.items)) {
      next.earlyReturns = early.value.items.filter(i => i.request?.status === 'Pending').length
    }
    setCounts(next)
  }, [facilityId])

  // Chạy khi lần đầu hiển thị và mỗi khi đổi mục / đổi cơ sở (vd vừa xử lý xong 1 khiếu nại rồi chuyển mục) -> cập nhật số
  useEffect(() => { load() }, [load, activeTab])
  // Chạy 1 lần (và khi `load` đổi): đặt hẹn giờ tải lại mỗi 2 phút + lắng nghe sự kiện tab trình duyệt hiện lại; gỡ khi rời trang.
  useEffect(() => {
    // Khi tab trình duyệt hiện lại thì tải lại số đếm.
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    const timer = window.setInterval(load, 120000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  return counts
}

/**
 * Menu trái của Manager: vẽ các nhóm/mục trong GROUPS, đánh dấu mục đang chọn, hiện số đỏ việc chờ
 * và nhãn "Mới N" ở mục Kho cơ sở. Gọi hook useManagerBadges (3 API GET) để lấy số đếm.
 * Đọc/ghi localStorage (SETUP_KEY) để nhớ nhóm "Thiết lập" đang mở hay đóng.
 * @param {object} props
 * @param {string} props.activeTab key của mục đang mở (vd 'overview', 'units').
 * @param {(key: string) => void} props.onSelect gọi khi người dùng bấm 1 mục, truyền key mục đó.
 * @param {number} props.facilityId mã cơ sở của Manager (để gọi API đếm).
 * @param {number} [props.freshUnits=0] số kho mới Business Operations vừa thêm cho cơ sở (nhãn "Mới" ở mục Kho cơ sở).
 * @param {object} [props.extraCounts={}] số việc trang đã tự tính sẵn, vd { reservations: đơn cần theo dõi, contracts: HĐ cần chú ý }.
 *   Số từ API (useManagerBadges) ghi đè lên nếu trùng key.
 * Được dùng bởi: FacilityManagerAccount.jsx (cột trái của trang /manager).
 */
export default function ManagerNav({ activeTab, onSelect, facilityId, freshUnits = 0, extraCounts = {} }) {
  const apiCounts = useManagerBadges(facilityId, activeTab)
  const counts = { ...extraCounts, ...apiCounts }
  const [setupOpen, setSetupOpen] = useState(() => {
    try { return localStorage.getItem(SETUP_KEY) === '1' } catch { return false }
  })
  // Mở/thu gọn nhóm "Thiết lập" và nhớ lựa chọn vào localStorage.
  const toggleSetup = () => setSetupOpen(v => {
    try { localStorage.setItem(SETUP_KEY, v ? '0' : '1') } catch { /* bỏ qua */ }
    return !v
  })

  // Menu cuộn được (ManagerNav.css). navRef trỏ tới thẻ <nav>; firstRender để bỏ qua lần hiển thị đầu tiên.
  const navRef = useRef(null)
  const firstRender = useRef(true)
  // Chạy khi setupOpen đổi (bấm mở nhóm "Thiết lập"): tự cuộn menu xuống cuối để thấy các mục vừa hiện.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    if (!setupOpen || !navRef.current) return
    const nav = navRef.current
    window.requestAnimationFrame(() => nav.scrollTo({ top: nav.scrollHeight, behavior: 'smooth' }))
  }, [setupOpen])
  // Chạy khi activeTab đổi: nếu mục đang chọn bị khuất trong vùng cuộn thì cuộn tới
  // (chỉ cuộn trong menu, không kéo cả trang; màn hình hẹp menu không cuộn riêng nên bỏ qua)
  useEffect(() => {
    const nav = navRef.current
    const item = nav?.querySelector('.mnav-item.active')
    if (!nav || !item || nav.scrollHeight <= nav.clientHeight) return
    const top = item.offsetTop // nav có position: relative (ManagerNav.css) nên offsetTop tính theo đầu menu
    if (top < nav.scrollTop) nav.scrollTop = top - 8
    else if (top + item.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = top + item.offsetHeight - nav.clientHeight + 8
  }, [activeTab])

  return (
    <nav ref={navRef} className="customer-nav mnav" aria-label="Menu Facility Manager">
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
