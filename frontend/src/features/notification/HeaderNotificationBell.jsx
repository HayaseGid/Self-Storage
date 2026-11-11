/**
 * ======================================================================
 * FILE: src/features/notification/HeaderNotificationBell.jsx  —  CHUÔNG THÔNG BÁO Ở HEADER (chỉ với tài khoản KHÁCH HÀNG)
 * - Bấm chuông: mở popup danh sách thông báo ngay tại trang đang xem (không chuyển trang).
 * - Bấm 1 thông báo: chuyển tới đúng chỗ (ký hợp đồng, gia hạn, thẻ hợp đồng, tab thanh toán...).
 * - "Xem tất cả": mở tab Thông báo trong trang tài khoản.
 * - Đơn chưa đặt cọc được GHIM đầu popup ("Cần làm ngay", có đồng hồ) và cộng vào số đỏ;
 *   HeaderPendingDepositBar là thanh nhắc dưới header (dùng chung 1 lần tải dữ liệu với chuông).
 * Luồng dữ liệu / API (gọi qua các hook):
 *   loadRentals() do App.jsx truyền vào -> GET /api/customer-reservations/mine
 *   useContractRenewals -> GET /api/contract-renewals/mine;  usePolicies -> GET /api/policies
 *   useUnitReturns -> GET /api/unit-returns/mine;  useMyInspections -> GET /api/return-inspections/mine
 * Dùng chung trạng thái "đã xem" với trang Thông báo nên số trên header luôn khớp.
 * Dùng ở: App.jsx (header các trang công khai).
 * ======================================================================
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

/*
 * CHUÔNG THÔNG BÁO Ở HEADER (file THÊM MỚI) - chỉ hiện với tài khoản khách hàng.
 *   - Bấm chuông: mở POPUP danh sách thông báo ngay tại trang đang xem (không chuyển trang).
 *   - Bấm 1 thông báo: mới chuyển tới đúng chỗ (ký hợp đồng, gia hạn, thẻ hợp đồng, tab thanh toán...),
 *     cùng cách xử lý với thông báo trong trang tài khoản (openNotice của CustomerAccount).
 *   - "Xem tất cả": mở tab Thông báo trong trang tài khoản.
 * Dùng CHUNG dữ liệu + trạng thái "đã xem" với chuông trong trang tài khoản (useCustomerNotifications),
 * nên số trên header luôn khớp số trong trang Thông báo.
 *   loadRentals: hàm trả về Promise danh sách đơn của khách (cùng dữ liệu trang khách) - App.jsx truyền vào.
 *   variant: 'icon' (nút trên header, có popup) | 'menu' (dòng trong menu điện thoại, bấm là mở tab Thông báo).
 * Đơn chưa đặt cọc (khách thoát VNPay giữa chừng) được GHIM đầu popup ("Cần làm ngay") và cộng vào số đỏ,
 * kèm thanh nhắc HeaderPendingDepositBar dưới header (dùng chung 1 lần tải dữ liệu với chuông).
 */

/* Danh sách đơn dùng chung giữa chuông + thanh nhắc trên header: 1 lần tải cho cả 2, tải lại sau 15 giây / khi quay lại tab. */
const shared = { email: null, data: null, at: 0, promise: null, subs: new Set() }
/**
 * Tải danh sách đơn của khách dùng chung cho chuông + thanh nhắc: 1 lần tải cho cả 2, dùng lại trong 15 giây,
 * báo cho mọi component đang theo dõi khi có dữ liệu mới.
 * @param {Function} loadRentals hàm trả về Promise danh sách đơn.
 * @param {boolean} force true để bỏ qua bộ nhớ đệm 15 giây.
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
 * Hook: lấy danh sách đơn dùng chung (đổi tài khoản thì bỏ dữ liệu cũ) và hàm refresh để tải lại.
 * @returns {[object[], Function]}
 */
function useSharedRentals(user, loadRentals) {
  if (shared.email !== (user?.email || null)) { // đổi tài khoản -> bỏ dữ liệu cũ
    shared.email = user?.email || null
    shared.data = null
    shared.at = 0
  }
  const [rentals, setRentals] = useState(shared.data || [])
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
 * Biểu tượng cái chuông (SVG).
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
 * Hook: gom dữ liệu đơn, gia hạn, chính sách, trả kho, kiểm kho rồi tính thông báo cho khách;
 * tự tải lại khi người dùng quay lại tab trình duyệt.
 * @returns {{notices:object, rentals:object[]}}
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

/* Thanh nhắc đơn chưa đặt cọc ngay dưới header (mọi trang công khai) */
/**
 * Component thanh nhắc đơn chưa đặt cọc ngay dưới header (mọi trang công khai); bấm để mở tab Thanh toán.
 * @param {object} props user, loadRentals, navigate.
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

/* Mở đúng nơi của thông báo trong trang khách (giống openNotice của CustomerAccount, nhưng từ trang khác nên
   ghi yêu cầu lại rồi chuyển trang; trang khách đọc yêu cầu khi mở). */
/**
 * Mở đúng nơi của thông báo trong trang khách khi đang ở trang khác: ghi yêu cầu (ký / gia hạn / cuộn tới hợp đồng)
 * vào sessionStorage rồi chuyển sang /customer ở tab phù hợp.
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
 * Component chuông thông báo (variant 'icon': nút có popup; 'menu': dòng trong menu điện thoại).
 * @param {object} props user, loadRentals, navigate, variant, onOpen() (gọi khi điều hướng, vd để đóng menu).
 */
export default function HeaderNotificationBell({ user, loadRentals, navigate, variant = 'icon', onOpen }) {
  const { notices, rentals } = useHeaderNotices(user, loadRentals)
  const { list: pendingDeposits, now } = usePendingDeposits(rentals)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  // Số đỏ = thông báo chưa xem + đơn chưa đặt cọc (việc phải làm, vẫn đếm dù đã xem; hết giờ giữ kho thì tự mất).
  // Thông báo "deposit:<id>" / "renewal-pay:<id>" trùng với đơn chờ cọc nên gộp theo id, không đếm 2 lần.
  // Tạo id thông báo tương ứng của 1 đơn chờ cọc ("deposit:<id>" hoặc "renewal-pay:<id>") để gộp, không đếm 2 lần.
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

  // Bấm ra ngoài / Esc -> đóng popup
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

  return (
    <div className="header-bell-wrap" ref={wrapRef}>
      <button ref={buttonRef} className={`header-cart header-bell${count > 0 ? ' has-new' : ''}${open ? ' open' : ''}`} type="button"
        onClick={() => setOpen(v => !v)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open}>
        <BellIcon />
        {count > 0 && <em aria-hidden="true">{count > 9 ? '9+' : count}</em>}
      </button>

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
