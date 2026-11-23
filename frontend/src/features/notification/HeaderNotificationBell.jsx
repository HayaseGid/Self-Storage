/**
 * ======================================================================
 * FILE: src/features/notification/HeaderNotificationBell.jsx  —  CHUÔNG THÔNG BÁO Ở HEADER (chỉ với tài khoản KHÁCH HÀNG)
 * CHỨC NĂNG: Nút chuông trên header các trang công khai, có số đỏ = thông báo chưa xem + đơn chưa đặt cọc.
 *   Bấm chuông mở popup danh sách thông báo ngay tại trang đang xem (không chuyển trang); bấm 1 thông báo
 *   thì chuyển tới đúng chỗ trong trang khách (ký hợp đồng, gia hạn, thẻ hợp đồng, tab thanh toán...);
 *   "Xem tất cả" mở tab Thông báo. Đơn chưa đặt cọc (khách thoát VNPay giữa chừng) được GHIM đầu popup
 *   ("Cần làm ngay", có đồng hồ đếm giờ giữ kho). Kèm thanh nhắc HeaderPendingDepositBar dưới header.
 *   Dùng CHUNG trạng thái "đã xem" (useCustomerNotifications) với trang Thông báo nên số luôn khớp.
 * THÀNH PHẦN CHÍNH:
 *   - fetchShared / useSharedRentals (nội bộ): tải danh sách đơn 1 lần dùng chung cho chuông + thanh nhắc.
 *   - BellIcon (export): biểu tượng chuông SVG.
 *   - useHeaderNotices (export): hook gom dữ liệu và tính danh sách thông báo.
 *   - HeaderPendingDepositBar (export): thanh nhắc đơn chưa đặt cọc dưới header.
 *   - openNoticeTarget (nội bộ): chuyển tới đúng nơi xử lý 1 thông báo.
 *   - HeaderNotificationBell (export default): nút chuông + popup (variant 'icon') hoặc dòng menu điện thoại ('menu').
 * DÙNG Ở: src/App.jsx (header desktop + menu điện thoại).
 * PHỤ THUỘC: services/customerNoticeData (useCustomerNotifications), ./CustomerNotifications (NotificationsPreview),
 *   features/contract/ContractRenewal (useContractRenewals), services/policies (usePolicies),
 *   features/return/UnitReturn (useUnitReturns), features/return/ReturnInspection (useMyInspections),
 *   services/afterDeposit (focusContract, openCustomerSection, requestContractSign, requestRenewal),
 *   features/payment/PendingPayments (PendingDepositBar, fmtLeft, usePendingDeposits), services/storageRules.
 * API (gọi gián tiếp qua các hook / hàm truyền vào):
 *   loadRentals() do App.jsx truyền vào -> GET /api/customer-reservations/mine
 *   useContractRenewals -> GET /api/contract-renewals/mine;  usePolicies -> GET /api/policies
 *   useUnitReturns -> GET /api/unit-returns/mine;  useMyInspections -> GET /api/return-inspections/mine
 * LUỒNG: App.jsx vẽ <HeaderNotificationBell> -> useHeaderNotices tải đơn/gia hạn/chính sách/trả kho/kiểm kho
 *   -> useCustomerNotifications tính danh sách + trạng thái đã xem -> hiện số đỏ -> khách bấm chuông mở popup
 *   -> bấm 1 thông báo -> goTo -> openNoticeTarget ghi yêu cầu vào sessionStorage (qua afterDeposit)
 *   -> chuyển sang /customer đúng tab -> trang khách đọc yêu cầu và mở đúng hộp thoại.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   fetchShared: Tải danh sách đơn của khách dùng chung cho chuông + thanh nhắc: nếu đang tải thì dùng lại lần tải đó, nếu dữ liệu còn mới → dùng ở: useSharedRentals
 *   useSharedRentals: Hook: lấy danh sách đơn dùng chung từ bộ nhớ đệm `shared` (đổi tài khoản thì bỏ dữ liệu cũ) → dùng ở: useHeaderNotices, HeaderPendingDepositBar
 *   BellIcon: Vẽ biểu tượng cái chuông bằng SVG (màu theo CSS của nút chứa nó) → dùng ở: HeaderNotificationBell
 *   useHeaderNotices: Hook: gom dữ liệu đơn, gia hạn, chính sách, trả kho, kiểm kho rồi tính danh sách thông báo cho khách bằng useCustomerNotifications → dùng ở: HeaderNotificationBell
 *   HeaderPendingDepositBar: Thanh nhắc "đơn chưa đặt cọc" ngay dưới header (mọi trang công khai); bấm "Thanh toán" để mở tab Thanh toán của trang khách → dùng ở: App.jsx (SiteHeader)
 *   openNoticeTarget: Mở đúng nơi xử lý 1 thông báo trong trang khách khi đang ở trang khác (giống openNotice của CustomerAccount): ghi yêu cầu → dùng ở: goTo
 *   HeaderNotificationBell: Nút chuông thông báo của khách: tính số đỏ (thông báo chưa xem + đơn chờ cọc, không đếm trùng), mở/đóng popup → dùng ở: App.jsx (SiteHeader)
 *   depositNoticeId: Số đỏ = thông báo chưa xem + đơn chưa đặt cọc (việc phải làm, vẫn đếm dù đã xem; hết giờ giữ kho thì tự mất) → dùng ở: HeaderNotificationBell
 *   goTo: Bấm 1 thông báo: đóng popup và mở đúng nơi xử lý thông báo đó → dùng ở: HeaderNotificationBell
 *   openPayment: Mở tab Thanh toán trong trang khách → dùng ở: HeaderNotificationBell
 *   openAll: Mở tab Thông báo trong trang khách (xem tất cả) → dùng ở: HeaderNotificationBell
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCustomerNotifications } from '../../services/customerNoticeData'
import { NotificationsPreview } from './CustomerNotifications'
import { useContractRenewals } from '../contract/ContractRenewal'
import { usePolicies } from '../../services/policies'
import { useUnitReturns } from '../return/UnitReturn'
import { focusContract, openCustomerSection, requestContractSign, requestRenewal } from '../../services/afterDeposit'
import { PendingDepositBar, fmtLeft, usePendingDeposits } from '../payment/PendingPayments'
import { useMyInspections } from '../return/ReturnInspection'
import { formatReservationCode } from '../../services/storageRules'
import './HeaderNotificationBell.css'

/**
 * Bộ nhớ đệm dùng chung (cấp module) giữa chuông + thanh nhắc trên header để chỉ tải danh sách đơn 1 lần.
 *   email: tài khoản đang dùng dữ liệu này; data: danh sách đơn; at: thời điểm tải (ms);
 *   promise: lần tải đang chạy (tránh gọi trùng); subs: các hàm setState của component đang theo dõi.
 */
const shared = { email: null, data: null, at: 0, promise: null, subs: new Set() }
/**
 * Tải danh sách đơn của khách dùng chung cho chuông + thanh nhắc: nếu đang tải thì dùng lại lần tải đó,
 * nếu dữ liệu còn mới (< 15 giây) thì trả luôn; tải xong thì báo cho mọi component đang theo dõi (shared.subs).
 * Gọi API gián tiếp qua loadRentals (GET /api/customer-reservations/mine).
 * Được gọi bởi: useSharedRentals (khi mount và khi refresh).
 * @param {Function} loadRentals hàm trả về Promise danh sách đơn (App.jsx truyền vào).
 * @param {boolean} force true để bỏ qua bộ nhớ đệm 15 giây.
 * @returns {Promise<object[]>} danh sách đơn (lỗi thì trả dữ liệu cũ hoặc mảng rỗng).
 */
function fetchShared(loadRentals, force = false) {
  if (shared.promise) return shared.promise
  if (!force && shared.data && Date.now() - shared.at < 15000) return Promise.resolve(shared.data)
  shared.promise = loadRentals()
    .then(list => {
      shared.data = Array.isArray(list) ? list : []
      shared.at = Date.now()
      shared.subs.forEach(fn => fn(shared.data))
      return shared.data
    })
    .catch(() => shared.data || [])
    .finally(() => { shared.promise = null })
  return shared.promise
}
/**
 * Hook: lấy danh sách đơn dùng chung từ bộ nhớ đệm `shared` (đổi tài khoản thì bỏ dữ liệu cũ),
 * đăng ký nhận dữ liệu mới và trả về hàm refresh để bắt buộc tải lại.
 * Được gọi bởi: useHeaderNotices và HeaderPendingDepositBar.
 * @param {object} user người dùng hiện tại (dùng user.email để nhận biết đổi tài khoản).
 * @param {Function} loadRentals hàm trả về Promise danh sách đơn.
 * @returns {[object[], Function]} [danh sách đơn, refresh()].
 */
function useSharedRentals(user, loadRentals) {
  if (shared.email !== (user?.email || null)) { // đổi tài khoản -> bỏ dữ liệu cũ
    shared.email = user?.email || null
    shared.data = null
    shared.at = 0
  }
  const [rentals, setRentals] = useState(shared.data || [])
  // Khi mount (hoặc loadRentals đổi): đăng ký nhận dữ liệu và tải đơn; khi unmount thì hủy đăng ký.
  useEffect(() => {
    shared.subs.add(setRentals)
    fetchShared(loadRentals)
    return () => { shared.subs.delete(setRentals) }
  }, [loadRentals])
  // Bắt buộc tải lại danh sách đơn.
  const refresh = useCallback(() => fetchShared(loadRentals, true), [loadRentals])
  return [rentals, refresh]
}

/**
 * Vẽ biểu tượng cái chuông bằng SVG (màu theo CSS của nút chứa nó).
 * Được gọi bởi: HeaderNotificationBell (variant 'icon').
 * @returns {JSX.Element}
 */
export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  )
}

/**
 * Hook: gom dữ liệu đơn, gia hạn, chính sách, trả kho, kiểm kho rồi tính danh sách thông báo cho khách
 * bằng useCustomerNotifications; tự tải lại khi người dùng quay lại tab trình duyệt.
 * API (qua các hook con): GET /api/customer-reservations/mine, /api/contract-renewals/mine, /api/policies,
 *   /api/unit-returns/mine, /api/return-inspections/mine.
 * Được gọi bởi: HeaderNotificationBell.
 * @param {object} user người dùng hiện tại (cần user.email).
 * @param {Function} loadRentals hàm trả về Promise danh sách đơn.
 * @returns {{notices:object, rentals:object[]}} notices = { notifications, isSeen, markAll, unseenCount... }.
 */
export function useHeaderNotices(user, loadRentals) {
  const [rentals, refresh] = useSharedRentals(user, loadRentals)
  const renewals = useContractRenewals()
  const policies = usePolicies()
  const returns = useUnitReturns()
  const inspections = useMyInspections() // [14] kết quả kiểm kho chờ xác nhận

  // Quay lại tab trình duyệt -> cập nhật số (vd vừa thanh toán / ký ở tab khác)
  const { reload: reloadRenewals } = renewals
  const { reload: reloadReturns } = returns
  const { reload: reloadInspections } = inspections
  // Đăng ký sự kiện visibilitychange 1 lần (đăng ký lại nếu các hàm reload đổi); gỡ khi unmount.
  useEffect(() => {
    // Khi tab trình duyệt hiện lại: tải lại đơn, gia hạn, trả kho, kiểm kho.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      refresh()
      reloadRenewals?.()
      reloadReturns?.()
      reloadInspections?.()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, reloadRenewals, reloadReturns, reloadInspections])

  const notices = useCustomerNotifications({
    email: user?.email,
    rentals,
    renewals: renewals.data,
    policies,
    returns: returns.data,
    inspections: inspections.data
  })
  return { notices, rentals }
}

/**
 * Thanh nhắc "đơn chưa đặt cọc" ngay dưới header (mọi trang công khai); bấm "Thanh toán" để mở tab Thanh toán
 * của trang khách. Dùng chung danh sách đơn với chuông nên không gọi API thêm lần nữa.
 * Được gọi bởi: App.jsx (khi người dùng là khách hàng).
 * @param {object} props
 * @param {object} props.user người dùng hiện tại.
 * @param {Function} props.loadRentals hàm trả về Promise danh sách đơn (GET /api/customer-reservations/mine).
 * @param {Function} props.navigate hàm chuyển trang của App.
 * @returns {JSX.Element}
 */
export function HeaderPendingDepositBar({ user, loadRentals, navigate }) {
  const [rentals, refresh] = useSharedRentals(user, loadRentals)
  useEffect(() => {
    // Khi tab trình duyệt hiện lại: tải lại danh sách đơn.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])
  return <PendingDepositBar rentals={rentals} onPay={() => openCustomerSection(navigate, 'payment')} />
}

/**
 * Mở đúng nơi xử lý 1 thông báo trong trang khách khi đang ở trang khác (giống openNotice của CustomerAccount):
 * ghi yêu cầu (ký hợp đồng / gia hạn / cuộn tới thẻ hợp đồng) vào sessionStorage qua các hàm của
 * services/afterDeposit, rồi chuyển sang /customer ở tab phù hợp; trang khách đọc yêu cầu khi mở.
 * Được gọi bởi: goTo trong HeaderNotificationBell (khi bấm 1 thông báo trong popup).
 * @param {object} item thông báo; item.action có thể chứa signContractId, renewReservationId, focusReservationId, section.
 * @param {Function} navigate hàm chuyển trang của App.
 */
function openNoticeTarget(item, navigate) {
  const action = item?.action || {}
  if (action.signContractId) requestContractSign(action.signContractId)
  if (action.renewReservationId) requestRenewal(action.renewReservationId)
  if (action.focusReservationId && !action.renewReservationId && !action.signContractId) focusContract(action.focusReservationId)
  const section = action.section ||
    (action.signContractId || action.renewReservationId || action.focusReservationId ? 'contract' : 'notifications')
  openCustomerSection(navigate, section)
}

/**
 * Nút chuông thông báo của khách: tính số đỏ (thông báo chưa xem + đơn chờ cọc, không đếm trùng), mở/đóng popup,
 * ghim đơn chờ cọc ở mục "Cần làm ngay" và hiện tối đa 3 thông báo khác (NotificationsPreview).
 * Được gọi bởi: App.jsx — variant 'icon' trên header desktop, variant 'menu' trong menu điện thoại.
 * @param {object} props
 * @param {object} props.user người dùng hiện tại (chỉ là khách hàng).
 * @param {Function} props.loadRentals hàm trả về Promise danh sách đơn (GET /api/customer-reservations/mine).
 * @param {Function} props.navigate hàm chuyển trang của App.
 * @param {'icon'|'menu'} [props.variant='icon'] 'icon' = nút có popup; 'menu' = dòng menu, bấm là mở tab Thông báo.
 * @param {Function} [props.onOpen] gọi mỗi khi điều hướng đi (vd để đóng menu điện thoại).
 * @returns {JSX.Element}
 */
export default function HeaderNotificationBell({ user, loadRentals, navigate, variant = 'icon', onOpen }) {
  const { notices, rentals } = useHeaderNotices(user, loadRentals)
  const { list: pendingDeposits, now } = usePendingDeposits(rentals)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  // Số đỏ = thông báo chưa xem + đơn chưa đặt cọc (việc phải làm, vẫn đếm dù đã xem; hết giờ giữ kho thì tự mất).
  // Thông báo "deposit:<id>" / "renewal-pay:<id>" trùng với đơn chờ cọc nên gộp theo id, không đếm 2 lần.
  // depositNoticeId: tạo id thông báo tương ứng của 1 đơn chờ cọc để gộp.
  const depositNoticeId = r => (r.isRenewal ? `renewal-pay:${r.reservationId}` : `deposit:${r.reservationId}`)
  const allNotices = Array.isArray(notices.notifications) ? notices.notifications : []
  const count = new Set([
    ...allNotices.filter(n => !notices.isSeen(n.id)).map(n => n.id),
    ...pendingDeposits.map(depositNoticeId)
  ]).size
  // Đơn chờ cọc đã ghim ở "Cần làm ngay" (có đồng hồ) -> bỏ khỏi danh sách bên dưới cho khỏi lặp
  const pinnedIds = new Set(pendingDeposits.map(depositNoticeId))
  const listCenter = { ...notices, notifications: allNotices.filter(n => !pinnedIds.has(n.id)) }
  const total = listCenter.notifications.length + pendingDeposits.length
  const label = count > 0 ? `Thông báo, ${count} chưa xem` : 'Thông báo'

  // Chỉ chạy khi popup đang mở (open = true): bấm ra ngoài / Esc -> đóng popup; đóng thì gỡ sự kiện.
  useEffect(() => {
    if (!open) return undefined
    // Bấm chuột ra ngoài popup thì đóng popup.
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    // Nhấn Esc thì đóng popup và trả focus về nút chuông.
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Bấm 1 thông báo: đóng popup và mở đúng nơi xử lý thông báo đó.
  const goTo = item => {
    setOpen(false)
    onOpen?.()
    openNoticeTarget(item, navigate)
  }
  // Mở tab Thanh toán trong trang khách.
  const openPayment = () => {
    setOpen(false)
    onOpen?.()
    openCustomerSection(navigate, 'payment')
  }
  // Mở tab Thông báo trong trang khách (xem tất cả).
  const openAll = () => {
    setOpen(false)
    onOpen?.()
    openCustomerSection(navigate, 'notifications')
  }

  if (variant === 'menu') {
    return (
      <button className="mobile-menu-item" type="button" onClick={openAll} aria-label={label}>
        🔔 <span>Thông báo{count > 0 ? ` (${count > 99 ? '99+' : count} mới)` : ''}</span>
      </button>
    )
  }

  // Nút chuông + popup thông báo
  return (
    <div className="header-bell-wrap" ref={wrapRef}>
      {/* Nút chuông có số đỏ */}
      <button ref={buttonRef} className={`header-cart header-bell${count > 0 ? ' has-new' : ''}${open ? ' open' : ''}`} type="button"
        onClick={() => setOpen(v => !v)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}>
        <BellIcon />
        {count > 0 && <em aria-hidden="true">{count > 9 ? '9+' : count}</em>}
      </button>

      {/* Popup: đơn chờ cọc + thông báo mới */}
      {open && (
        <div className="header-bell-pop" role="dialog" aria-label="Thông báo">
          <div className="header-bell-pop-head">
            <strong>Thông báo</strong>
            <span>{count > 0 ? `${count} cần xem` : 'Đã xem hết'}</span>
            <button type="button" className="header-bell-close" onClick={() => setOpen(false)} aria-label="Đóng">×</button>
          </div>
          {pendingDeposits.length > 0 && (
            <div className="header-bell-urgent">
              <small>Cần làm ngay</small>
              {pendingDeposits.map(item => {
                const left = Number.isNaN(item.expiresAtMs) ? null : item.expiresAtMs - now
                // Đơn chưa đặt cọc (đếm giờ giữ kho)
                return (
                  <button key={item.reservationId} type="button" className={`header-bell-urgent-item${left != null && left < 5 * 60000 ? ' hot' : ''}`} onClick={openPayment}>
                    <span aria-hidden="true">⏳</span>
                    <span>
                      <b>Đơn {formatReservationCode(item.reservationId)} chưa đặt cọc</b>
                      <small>
                        {item.facility}{item.unitId ? ` · kho ${item.unitId}` : ''}
                        {left != null ? ` · giữ kho còn ${fmtLeft(left)}` : ''}
                      </small>
                    </span>
                    <em>Thanh toán ›</em>
                  </button>
                )
              })}
            </div>
          )}
          {(listCenter.notifications.length > 0 || pendingDeposits.length === 0) && (
            <div className="header-bell-pop-body">
              {total === 0
                ? <p className="header-bell-empty">Bạn chưa có thông báo nào.</p>
                : <NotificationsPreview center={listCenter} onAction={goTo} onOpenAll={openAll} />}
            </div>
          )}
          <button type="button" className="header-bell-all" onClick={openAll}>Xem tất cả thông báo →</button>
        </div>
      )}
    </div>
  )
}
