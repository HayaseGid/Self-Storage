import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { apiPost, apiGet } from './api'
import { DialogProvider, useDialog } from './Dialog'
import RentalCalendar from './RentalCalendar'
import {
  SizeMeter,
  UNIT_TYPE_ORDER,
  UNIT_TYPE_STYLES,
  UnitTypeArt,
  UnitTypeChip,
  UnitTypeIcon,
  getUnitTypeKey,
  getUnitTypeStyle,
  parseUnitSize
} from './unitTypes'
import './unitTypes.css'
import { getFacilityDistrict, groupFacilitiesByDistrict } from './districts'
import { DEPOSIT_MONTHS, RENTAL_TERMS, computeDeposit } from './storageRules'
import CartPage from './CartPage'
import { CART_LIMIT, addToCart, isInCart, useCart } from './cart'
import {
  clearBookingDraft,
  draftMatchesUnit,
  getSafeNextPath,
  loadBookingDraft,
  saveBookingDraft,
  withNext
} from './bookingDraft'
import CustomerDashboard from './CustomerAccount'
import { generateOTP, sendOTPEmail, OTP_EXPIRES_MS, OTP_RESEND_MS, OTP_MAX_ATTEMPTS } from './otpService'

import StaffPortal from './FacilityStaffAccount'
//Đã thêm: 04/10/2026

//Đã cập nhật: Thêm cho FqcilityManager
import FacilityManagerDashboard from './FacilityManagerAccount'
//Đã thêm: 05/10/2026

// Thêm: System Admin & Business Operations
import Admin from './AdminAccount'
import BusinessOperations from './BusinessOperations'

// Đường dẫn trang làm việc theo role
function roleHome(role) {
  switch (role) {
    case 'SYSTEM_ADMIN': return '/admin'
    case 'BUSINESS_OPERATIONS': return '/business'
    case 'FACILITY_MANAGER': return '/manager'
    case 'FACILITY_STAFF': return '/staff'
    default: return '/customer'
  }
}

function mapBackendRole(roleName) {
  switch (roleName?.trim().toLowerCase()) {
    case 'storage customer': return 'customer'
    case 'facility staff': return 'FACILITY_STAFF'
    case 'facility manager': return 'FACILITY_MANAGER'
    case 'business operations':
    case 'business operations manager': return 'BUSINESS_OPERATIONS'
    case 'system admin':
    case 'system administrator': return 'SYSTEM_ADMIN'
    default: throw new Error(`Vai trò "${roleName}" chưa được hỗ trợ trên giao diện.`)
  }
}

const facilities = []
const storageUnits = {}
const facilityImages = [
  'https://images.pexels.com/photos/38573375/pexels-photo-38573375/free-photo-of-red-storage-unit-with-padlock-and-number.jpeg?h=1000&w=1500&fit=crop',
  'https://images.unsplash.com/photo-1565610222536-ef125c59da2e?auto=format&fit=crop&w=1200&q=85',
  'https://images.unsplash.com/photo-1565793298595-6a879b1d9492?auto=format&fit=crop&w=1200&q=85'
]

const CURRENT_USER_KEY = 'storespace_current_user'
const ACTIVE_BOOKING_HOLD_KEY = 'storespace_active_booking_hold'

function createSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null')
    return user
  } catch {
    return null
  }
}

function getStorageUnits(facilityName) {
  return storageUnits[facilityName] || []
}

function getAllStorageUnits() {
  return storageUnits
}

function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0) + 'đ'
}

/* Các loại kho đang có trong hệ thống (lấy từ dữ liệu thật), theo thứ tự hiển thị. */
function getCatalogTypeKeys(unitList = Object.values(storageUnits).flat()) {
  const keys = new Set(unitList.map(unit => getUnitTypeKey(unit.type)))
  return UNIT_TYPE_ORDER.filter(key => keys.has(key))
}

/* Nhận cả mã loại mới (?type=climate) lẫn tên cũ (?type=Kho mát / Cool). */
function resolveTypeParam(value) {
  if (!value) return ''
  return UNIT_TYPE_STYLES[value] ? value : getUnitTypeKey(value)
}

function getBookingPath(facility, unit) {
  return `/facilities/${createSlug(facility.name)}/unit/${unit.id}/booking`
}

function getUnitPath(facility, unit) {
  return `/facilities/${createSlug(facility.name)}/unit/${unit.id}`
}

/*
 * Hỏi khách đăng nhập / đăng ký trước khi đặt kho.
 * Thông tin đang chọn được lưu vào bản nháp để khôi phục sau khi đăng nhập.
 */
async function promptLoginForBooking(dialog, { facility, unit, title, message, draftFields = {} }) {
  const bookingPath = getBookingPath(facility, unit)
  saveBookingDraft({
    facilityId: facility.facilityId,
    facilityName: facility.name,
    unitId: unit.id,
    unitType: unit.type,
    unitSize: unit.size,
    path: bookingPath,
    ...draftFields
  })

  const choice = await dialog.open({
    tone: 'info',
    title: title || 'Đăng nhập để đặt kho',
    message: message || `Bạn cần đăng nhập để đặt kho ${unit.id} tại ${facility.name}.\nThông tin bạn đã chọn sẽ được giữ lại và tự điền sau khi đăng nhập hoặc tạo tài khoản.`,
    dismissValue: null,
    actions: [
      { label: 'Để sau', value: null, variant: 'secondary' },
      { label: 'Tạo tài khoản mới', value: 'register', variant: 'secondary' },
      { label: 'Đăng nhập', value: 'login', variant: 'primary' }
    ]
  })

  if (choice) navigate(withNext(`/${choice}`, bookingPath))
  return choice
}

/* Thêm kho vào giỏ hàng. Khách chưa đăng nhập vẫn thêm được (giỏ lưu trên trình duyệt). */
async function handleAddToCart(dialog, facility, unit) {
  const user = getCurrentUser()
  if (user && user.role !== 'customer') {
    await alertNotCustomer(dialog)
    return
  }
  if (!unit.available) return
  const result = addToCart(facility, unit)
  if (result.reason === 'full') {
    await dialog.alert({ tone: 'warning', title: 'Giỏ hàng đã đầy', message: `Giỏ hàng chứa tối đa ${CART_LIMIT} kho. Hãy đặt hoặc bỏ bớt kho trong giỏ.` })
    return
  }
  const choice = await dialog.open({
    tone: result.ok ? 'success' : 'info',
    title: result.ok ? `Đã thêm ${unit.id} vào giỏ hàng` : `${unit.id} đã có trong giỏ hàng`,
    message: `${getUnitTypeStyle(unit.type).label} · ${unit.size} · ${formatMoney(unit.price)}/tháng tại ${facility.name}.\nCác kho cùng cơ sở có thể đặt chung một hợp đồng.`,
    dismissValue: null,
    actions: [
      { label: 'Tiếp tục xem kho', value: null, variant: 'secondary' },
      { label: 'Xem giỏ hàng', value: 'cart', variant: 'primary' }
    ]
  })
  if (choice === 'cart') navigate('/cart')
}

async function promptLoginForCart(dialog) {
  const choice = await dialog.open({
    tone: 'info',
    title: 'Đăng nhập để đặt kho',
    message: 'Giỏ hàng của bạn được giữ nguyên. Đăng nhập hoặc tạo tài khoản rồi quay lại giỏ hàng để đặt cọc.',
    dismissValue: null,
    actions: [
      { label: 'Để sau', value: null, variant: 'secondary' },
      { label: 'Tạo tài khoản mới', value: 'register', variant: 'secondary' },
      { label: 'Đăng nhập', value: 'login', variant: 'primary' }
    ]
  })
  if (choice) navigate(withNext(`/${choice}`, '/cart'))
}

function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></svg>
}

function alertNotCustomer(dialog) {
  return dialog.alert({
    tone: 'warning',
    title: 'Tài khoản này không đặt kho được',
    message: 'Chỉ tài khoản khách hàng mới đặt kho được. Hãy đăng xuất và đăng nhập bằng tài khoản khách hàng.'
  })
}

/*
 * Xác định trang cần chuyển tới sau khi đăng nhập / đăng ký.
 * - Nhân viên, quản lý: về trang làm việc theo role.
 * - Khách hàng: quay lại trang đặt kho đang dở (theo ?next= hoặc bản nháp),
 *   nếu kho đó đã có người khác đặt thì đưa về trang cơ sở kèm thông báo.
 */
function resolvePostAuthPath(user, nextPath) {
  if (user.role !== 'customer') return { path: roleHome(user.role) }

  const draft = loadBookingDraft()
  const target = nextPath || draft?.path
  if (!target) return { path: '/customer' }

  if (draft && target === draft.path) {
    const facility = facilities.find(item => String(item.facilityId) === String(draft.facilityId))
    const unit = facility && getStorageUnits(facility.name)
      .find(item => item.id.toLowerCase() === String(draft.unitId).toLowerCase())
    if (!facility || !unit || !unit.available) {
      clearBookingDraft()
      return {
        path: facility ? `/facilities/${createSlug(facility.name)}` : '/facilities',
        notice: {
          tone: 'warning',
          title: 'Kho bạn chọn không còn trống',
          message: `Kho ${draft.unitId} vừa được khách khác đặt hoặc tạm ngưng cho thuê. Vui lòng chọn một kho khác${facility ? ` tại ${facility.name}` : ''}.`
        }
      }
    }
  }

  return { path: target }
}

function BookingDraftNote({ draft, action, onClear }) {
  if (!draft) return null
  return (
    <div className="booking-draft-note" role="status">
      <span aria-hidden="true">i</span>
      <div>
        Bạn đang đặt kho <strong>{draft.unitId}</strong>{draft.facilityName ? <> tại <strong>{draft.facilityName}</strong></> : null}.
        {' '}{action} Thông tin đã chọn sẽ được giữ lại.
        {onClear && <button type="button" onClick={onClear}>Bỏ đặt kho này</button>}
      </div>
    </div>
  )
}

/* Bản nháp + tham số ?next= dùng chung cho trang đăng nhập và đăng ký. */
function usePendingBooking() {
  const [draft, setDraft] = useState(() => loadBookingDraft())
  const [nextPath, setNextPath] = useState(() => getSafeNextPath())
  const discard = () => {
    if (draft && nextPath === draft.path) setNextPath(null)
    clearBookingDraft()
    setDraft(null)
  }
  return { draft, nextPath, discard }
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg>
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.3 8.3-8 10-4.7-1.7-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
}

function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-7 8 7" /><path d="M6 9v11h12V9" /><path d="M10 20v-6h4v6" /></svg>
}

function SiteHeader() {
  const [storageOpen, setStorageOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileStorageOpen, setMobileStorageOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(getCurrentUser())
  const catalogTypeKeys = getCatalogTypeKeys()
  const cartItems = useCart()
  const showCart = !currentUser || currentUser.role === 'customer'

  const go = path => {
    setMenuOpen(false)
    setStorageOpen(false)
    setMobileStorageOpen(false)
    navigate(path)
  }

  const logout = () => {
    localStorage.removeItem(CURRENT_USER_KEY)
    setCurrentUser(null)
    navigate('/')
  }

  return (
    <>
      <header className="site-header">
        <button className="brand" type="button" onClick={() => go('/')}>
          <span className="brand-mark">S</span>
          <span className="brand-copy"><strong>StoreSpace</strong><small>Your Space. Your Freedom.</small></span>
        </button>
        <nav className="desktop-nav">
          <button type="button" onClick={() => go('/search')}>Tìm kho</button>
          <button className="nav-dropdown" type="button" onClick={() => setStorageOpen(v => !v)}>Loại kho <ChevronIcon /></button>
          {storageOpen && (
            <div className="type-menu">
              {catalogTypeKeys.length === 0 && <span className="type-menu-empty">Chưa có loại kho</span>}
              {catalogTypeKeys.map(key => {
                const style = UNIT_TYPE_STYLES[key]
                return (
                  <button key={key} type="button" style={{ '--ut-color': style.color }} onClick={() => go(`/search?type=${key}`)}>
                    <UnitTypeIcon typeKey={key} size={20} />
                    <span>{style.label}<small>{style.feature}</small></span>
                  </button>
                )
              })}
            </div>
          )}
        </nav>
        <div className="header-actions">
          {showCart && (
            <button className="header-cart" type="button" onClick={() => go('/cart')} aria-label={`Giỏ hàng (${cartItems.length} kho)`} title="Giỏ hàng">
              <CartIcon />
              {cartItems.length > 0 && <em>{cartItems.length}</em>}
            </button>
          )}
          {currentUser ? (
            <div className="user-actions">
              <span className="user-greeting">Xin chào, <strong>{currentUser.name}</strong></span>
              {currentUser.role && currentUser.role !== 'customer' && <button className="login-link" type="button" onClick={() => go(roleHome(currentUser.role))}>Trang làm việc</button>}
              <button className="logout-link" type="button" onClick={logout}>Đăng xuất</button>
            </div>
          ) : (
            <button className="login-link" type="button" onClick={() => go('/login')}>Đăng nhập</button>
          )}
          <button className="menu-button" type="button" onClick={() => setMenuOpen(v => !v)} aria-label="Mở menu"><MenuIcon /></button>
        </div>
      </header>
      {menuOpen && (
        <>
          <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)} />
          <aside className="mobile-menu">
            <div className="mobile-menu-header">
              <div><span className="mobile-menu-brand">StoreSpace</span><small>Your Space. Your Freedom.</small></div>
              <button className="mobile-menu-close" type="button" onClick={() => setMenuOpen(false)}>×</button>
            </div>
            <div className="mobile-menu-content">
              <div className="mobile-menu-section">
                <div className="mobile-menu-title">KHÁM PHÁ</div>
                {currentUser && <button className="mobile-menu-item" type="button" onClick={() => go(roleHome(currentUser.role))}>⌂ <span>{currentUser.role && currentUser.role !== 'customer' ? 'Trang làm việc' : 'Hồ sơ của tôi'}</span></button>}
                <button className="mobile-menu-item" type="button" onClick={() => go('/')}>⌂ <span>Trang chủ</span></button>
                <button className="mobile-menu-item" type="button" onClick={() => go('/search')}>⌕ <span>Tìm kho</span></button>
                <button className="mobile-menu-item mobile-menu-button" type="button" onClick={() => setMobileStorageOpen(v => !v)}>▣ <span>Loại kho</span><span>›</span></button>
                {mobileStorageOpen && (
                  <div className="mobile-submenu">
                    {catalogTypeKeys.map(key => (
                      <button key={key} type="button" style={{ '--ut-color': UNIT_TYPE_STYLES[key].color }} onClick={() => go(`/search?type=${key}`)}>
                        <UnitTypeIcon typeKey={key} size={18} /> {UNIT_TYPE_STYLES[key].label}
                      </button>
                    ))}
                  </div>
                )}
                <button className="mobile-menu-item" type="button" onClick={() => go('/facilities')}>⌖ <span>Cơ sở lưu trữ</span></button>
                {showCart && <button className="mobile-menu-item" type="button" onClick={() => go('/cart')}>🛒 <span>Giỏ hàng{cartItems.length ? ` (${cartItems.length})` : ''}</span></button>}
                <button className="mobile-menu-item" type="button" onClick={() => { setMenuOpen(false); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }) }}>◇ <span>Về StoreSpace</span></button>
              </div>
              <div className="mobile-menu-section">
                <div className="mobile-menu-title">HỖ TRỢ</div>
                <button className="mobile-menu-item" type="button" onClick={() => { setMenuOpen(false); document.getElementById('support')?.scrollIntoView({ behavior: 'smooth' }) }}>? <span>Trung tâm hỗ trợ</span></button>
                <a className="mobile-menu-item" href="mailto:support@storespace.vn">✉ <span>Liên hệ</span></a>
              </div>
              <div className="mobile-menu-section account-section">
                <div className="mobile-menu-title">TÀI KHOẢN</div>
                {currentUser ? (
                  <button className="mobile-account-item" type="button" onClick={logout}>→ <strong>Đăng xuất</strong></button>
                ) : (
                  <>
                    <div className="item-column">
                      <button className="mobile-account-item" type="button" onClick={() => go('/login')}>→ <strong>Đăng nhập</strong></button>
                      <button className="mobile-account-item register-item" type="button" onClick={() => go('/register')}>✦ <strong>Đăng ký tài khoản</strong></button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

function SiteFooter() {
  return <footer className="footer"><div className="container footer-inner"><div className="footer-brand"><span className="footer-mark">S</span><strong>StoreSpace</strong><span>Self-Storage Facility Rental & Management System</span></div><span>© 2026 StoreSpace</span></div></footer>
}

function FacilityCard({ facility, index, typeKey = '' }) {
  return (
    <article className="facility-card">
      <button className="facility-card-link" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}${typeKey ? `?type=${typeKey}` : ''}`)} aria-label={`Xem chi tiết ${facility.name}`}>
        <div className="facility-image">
          <img src={facility.image} alt={`Cơ sở ${facility.name}`} />
          <span className="availability-badge"><i /> {facility.available} kho trống</span>
          <span className="facility-index">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <div className="facility-body">
          <div className="facility-title-row">
            <div><h3>{facility.name}</h3><p><PinIcon /> {facility.location}</p></div>
            <span className="home-icon"><HomeIcon /></span>
          </div>
          <div className="tag-row">
            {facility.district && <span className="fc-district"><PinIcon /> {facility.district.label}</span>}
            {(facility.typeKeys || []).map(key => <UnitTypeChip key={key} type={UNIT_TYPE_STYLES[key].label} />)}
          </div>
          <div className="facility-footer"><span>{facility.available} / {facility.total} kho còn trống</span><span className="facility-arrow"><ArrowIcon /></span></div>
        </div>
      </button>
    </article>
  )
}

/* Danh sách khu vực có cơ sở, kèm số cơ sở và số kho còn trống. */
function getDistrictGroups(facilityList = facilities) {
  return groupFacilitiesByDistrict(facilityList).map(group => ({
    ...group,
    availableUnits: group.facilities.reduce((sum, f) => sum + (f.available || 0), 0)
  }))
}

/* Bộ chọn khu vực dạng chip (dùng ở trang chủ, danh sách cơ sở, tìm kiếm). */
function DistrictPicker({ groups, active = '', onSelect, showAll = true, large = false, label = 'Lọc theo khu vực' }) {
  if (!groups.length) return null
  return (
    <div className={`district-picker${large ? ' large' : ''}`} role="group" aria-label={label}>
      {showAll && (
        <button type="button" className={!active ? 'active' : ''} aria-pressed={!active} onClick={() => onSelect('')}>
          <span className="district-name">Tất cả khu vực</span>
          <span className="district-meta">{groups.reduce((n, g) => n + g.facilities.length, 0)} cơ sở</span>
        </button>
      )}
      {groups.map(group => (
        <button
          key={group.slug}
          type="button"
          className={active === group.slug ? 'active' : ''}
          aria-pressed={active === group.slug}
          onClick={() => onSelect(active === group.slug && showAll ? '' : group.slug)}
        >
          <span className="district-name"><PinIcon /> {group.label}</span>
          <span className="district-meta">{group.facilities.length} cơ sở · {group.availableUnits} kho trống</span>
        </button>
      ))}
    </div>
  )
}

function FacilitiesPage() {
  const district = new URLSearchParams(window.location.search).get('district') || ''
  const groups = getDistrictGroups()
  const activeGroup = groups.find(group => group.slug === district)
  const selectDistrict = slug => navigate(slug ? `/facilities?district=${slug}` : '/facilities')
  let index = 0
  return (
    <div className="app">
      <SiteHeader />
      <main className="listing-page">
        <div className="container">
          <div className="listing-heading"><div className="eyebrow">OUR FACILITIES</div><h1>Các cơ sở lưu trữ</h1><p>Chọn khu vực gần bạn, rồi chọn cơ sở để xem các kho đang có sẵn.</p></div>
          <DistrictPicker groups={groups} active={activeGroup ? district : ''} onSelect={selectDistrict} />
          {(activeGroup ? [activeGroup] : groups).map(group => (
            <section className="district-section" key={group.slug} aria-labelledby={`district-${group.slug}`}>
              <div className="district-section-head">
                <h2 id={`district-${group.slug}`}><PinIcon /> {group.label}</h2>
                <span>{group.facilities.length} cơ sở · {group.availableUnits} kho trống</span>
              </div>
              <div className="facility-grid">{group.facilities.map(f => <FacilityCard key={f.name} facility={f} index={index++} />)}</div>
            </section>
          ))}
          {facilities.length === 0 && <div className="empty-state">Chưa có cơ sở nào.</div>}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function UnitCard({ facility, unit }) {
  const dialog = useDialog()
  useCart() // vẽ lại khi giỏ hàng thay đổi
  const inCart = isInCart(facility.facilityId, unit.id)
  const style = getUnitTypeStyle(unit.type)
  const sizeInfo = parseUnitSize(unit.size)
  const isBooking = unit.status?.toLowerCase() === 'booking'
  const statusLabel = unit.available ? 'Còn trống' : isBooking ? 'Đang giữ chỗ' : 'Không khả dụng'
  const open = () => unit.available && navigate(getUnitPath(facility, unit))

  return (
    <article className={`uc-card${unit.available ? '' : ' unavailable'}`} style={{ '--ut-color': style.color, '--ut-soft': style.soft }}>
      <div className="uc-media">
        <UnitTypeArt type={unit.type} size={unit.size} unitCode={unit.id} />
        <UnitTypeChip type={unit.type} />
        <span className={`uc-status${unit.available ? ' available' : isBooking ? ' booking' : ''}`}>{statusLabel}</span>
      </div>
      <div className="uc-body">
        <div className="uc-title">
          <span className="uc-code">{unit.id}</span>
          <span className="uc-area">{sizeInfo.area ? `${sizeInfo.area.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} m²` : sizeInfo.isLocker ? 'Tủ locker' : sizeInfo.code}</span>
        </div>
        <p className="uc-type-name">{style.label}{unit.type && unit.type.toLowerCase() !== style.label.toLowerCase() ? ` · ${unit.type}` : ''}</p>
        <dl className="uc-specs">
          <div><dt>Kích thước</dt><dd>{sizeInfo.label}</dd></div>
          <div><dt>Hạng</dt><dd><SizeMeter size={unit.size} /></dd></div>
        </dl>
        <span className="uc-feature"><UnitTypeIcon typeKey={style.key} size={14} /> {style.feature}</span>
        <div className="uc-foot">
          <div className="uc-price">
            <small>Giá thuê</small>
            <strong>{formatMoney(unit.price)}</strong><span>/tháng</span>
          </div>
          <div className="uc-actions">
            {unit.available && (
              <button
                type="button"
                className={`add-cart-btn${inCart ? ' in-cart' : ''}`}
                onClick={() => handleAddToCart(dialog, facility, unit)}
                aria-label={inCart ? `${unit.id} đã có trong giỏ` : `Thêm ${unit.id} vào giỏ`}
                title={inCart ? 'Đã có trong giỏ' : 'Thêm vào giỏ'}
              >
                {inCart ? '✓' : '+'} <CartIcon />
              </button>
            )}
            <button className="unit-button" type="button" disabled={!unit.available} onClick={open}>
              {unit.available ? 'Xem kho' : 'Hết chỗ'}{unit.available && <ArrowIcon />}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function FacilityDetailPage({ facility }) {
  const units = getStorageUnits(facility.name)
  const typeKeys = getCatalogTypeKeys(units)

  const [query, setQuery] = useState('')
  const [type, setType] = useState(() => {
    const fromUrl = resolveTypeParam(new URLSearchParams(window.location.search).get('type') || '')
    return fromUrl && typeKeys.includes(fromUrl) ? fromUrl : 'all'
  })
  const [size, setSize] = useState('all')
  const [availability, setAvailability] = useState('all')
  const [priceRange, setPriceRange] = useState('all')
  const sizes = [...new Set(units.map(unit => unit.size))]
  const filteredUnits = units.filter(unit => {
    const q = query.trim().toLowerCase()
    const price = unit.price
    const matchSearch = !q || `${unit.id} ${unit.type} ${getUnitTypeStyle(unit.type).label} ${unit.size}`.toLowerCase().includes(q)
    const matchType = type === 'all' || getUnitTypeKey(unit.type) === type
    const matchSize = size === 'all' || unit.size === size
    const matchAvailability = availability === 'all' || (availability === 'available' ? unit.available : !unit.available)
    const matchPrice = priceRange === 'all' || (priceRange === 'under1' ? price < 1000000 : priceRange === '1to2' ? price >= 1000000 && price <= 2000000 : price > 2000000)
    return matchSearch && matchType && matchSize && matchAvailability && matchPrice
  })
  // Kho còn trống lên trước để khách dễ chọn.
  const sortedUnits = [...filteredUnits].sort((a, b) => Number(b.available) - Number(a.available))
  const resetFilters = () => {
    setQuery('')
    setType('all')
    setSize('all')
    setAvailability('all')
    setPriceRange('all')
  }

  return (
    <div className="app">
      <SiteHeader />
      <main className="facility-detail-page">
        <div className="container">
          <button className="back-link" type="button" onClick={() => navigate('/facilities')}>← Tất cả cơ sở</button>
          <div className="facility-detail-hero">
            <img src={facility.image} alt={facility.name} />
            <div className="facility-detail-info">
              <div className="eyebrow">STORESPACE FACILITY</div>
              <h1>{facility.name}</h1>
              <p className="facility-location"><PinIcon /> {facility.location}</p>
              <div className="uc-legend">{typeKeys.map(key => <UnitTypeChip key={key} type={UNIT_TYPE_STYLES[key].label} />)}</div>
              <p>Hiện có <strong>{facility.available}</strong> kho đang sẵn sàng cho thuê.</p>
            </div>
          </div>
          <div className="units-heading">
            <div><div className="eyebrow">AVAILABLE UNITS</div><h2>Các kho tại {facility.name}</h2></div>
            <span>{filteredUnits.length} / {units.length} kho phù hợp</span>
          </div>
          <div className="unit-filter-panel">
            <div className="uc-type-filter" role="group" aria-label="Lọc theo loại kho">
              <button type="button" className={type === 'all' ? 'active' : ''} aria-pressed={type === 'all'} onClick={() => setType('all')}>
                Tất cả <em>{units.length}</em>
              </button>
              {typeKeys.map(key => {
                const style = UNIT_TYPE_STYLES[key]
                const count = units.filter(unit => getUnitTypeKey(unit.type) === key).length
                return (
                  <button
                    key={key}
                    type="button"
                    className={type === key ? 'active' : ''}
                    aria-pressed={type === key}
                    style={{ '--ut-color': style.color, '--ut-soft': style.soft }}
                    onClick={() => setType(type === key ? 'all' : key)}
                    title={style.description}
                  >
                    <UnitTypeIcon typeKey={key} size={18} /> {style.label} <em>{count}</em>
                  </button>
                )
              })}
            </div>
            <div className="unit-filter-search"><SearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm mã kho, loại kho, diện tích..." /></div>
            <div className="unit-filter-row">
              <select value={size} onChange={e => setSize(e.target.value)} aria-label="Lọc theo diện tích"><option value="all">Tất cả diện tích</option>{sizes.map(item => <option key={item} value={item}>{item}</option>)}</select>
              <select value={availability} onChange={e => setAvailability(e.target.value)} aria-label="Lọc theo tình trạng"><option value="all">Tất cả tình trạng</option><option value="available">Còn trống</option><option value="rented">Không khả dụng</option></select>
              <select value={priceRange} onChange={e => setPriceRange(e.target.value)} aria-label="Lọc theo giá"><option value="all">Tất cả mức giá</option><option value="under1">Dưới 1 triệu</option><option value="1to2">1 - 2 triệu</option><option value="over2">Trên 2 triệu</option></select>
              <button type="button" className="filter-reset" onClick={resetFilters}>Đặt lại</button>
            </div>
          </div>
          <div className="uc-grid">
            {sortedUnits.map(unit => <UnitCard key={unit.id} facility={facility} unit={unit} />)}
          </div>
          {filteredUnits.length === 0 && <div className="empty-state unit-empty-state">Không tìm thấy kho phù hợp với bộ lọc.</div>}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function UnitDetailPage({ facility, unit }) {
  const dialog = useDialog()
  useCart()

  const handleBookClick = async () => {
    const user = getCurrentUser()
    if (!user) {
      await promptLoginForBooking(dialog, { facility, unit })
      return
    }
    if (user.role !== 'customer') {
      await alertNotCustomer(dialog)
      return
    }
    navigate(getBookingPath(facility, unit))
  }

  return (
    <div className="app">
      <SiteHeader />
      <main className="unit-detail-page">
        <div className="container">
          <button className="back-link" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)}>← Quay lại {facility.name}</button>
          <div className="unit-detail-layout">
            <div className="unit-detail-image"><UnitTypeArt type={unit.type} size={unit.size} unitCode={unit.id} /><span className="unit-detail-status">● Còn trống</span></div>
            <div className="unit-detail-content">
              <span className="customer-eyebrow">STORAGE UNIT</span>
              <h1>{unit.id}</h1>
              <div className="unit-detail-type">
                <UnitTypeChip type={unit.type} />
                <SizeMeter size={unit.size} />
                <small>{unit.type}</small>
              </div>
              <p className="unit-detail-location"><PinIcon /> {facility.name} · {facility.location}</p>
              <div className="unit-detail-price"><small>Giá thuê</small><strong>{formatMoney(unit.price)}/tháng</strong></div>
              <div className="unit-detail-info-grid">
                <div><small>Diện tích</small><strong>{unit.size}</strong></div>
                <div><small>Tình trạng</small><strong className="available-text">Còn trống</strong></div>
                <div><small>An ninh</small><strong>24/7</strong></div>
                <div><small>Ra vào</small><strong>Access Card</strong></div>
              </div>
              <p className="unit-detail-type-desc" style={{ '--ut-color': getUnitTypeStyle(unit.type).color, '--ut-soft': getUnitTypeStyle(unit.type).soft }}>
                <strong>{getUnitTypeStyle(unit.type).label}:</strong> {getUnitTypeStyle(unit.type).description} <strong>{getUnitTypeStyle(unit.type).feature}.</strong>
              </p>
              <div className="unit-detail-features"><div><span>✓</span>Camera giám sát 24/7</div><div><span>✓</span>Kiểm soát ra vào</div><div><span>✓</span>Hỗ trợ khách hàng</div><div><span>✓</span>Giá thuê minh bạch</div></div>
              <div className="unit-detail-actions">
                <button className="dashboard-primary-btn" type="button" onClick={handleBookClick}>{getCurrentUser() ? 'Đặt kho này' : 'Đăng nhập để đặt kho'} <ArrowIcon /></button>
                <button className={`add-cart-btn${isInCart(facility.facilityId, unit.id) ? ' in-cart' : ''}`} type="button" onClick={() => handleAddToCart(dialog, facility, unit)}>
                  <CartIcon /> {isInCart(facility.facilityId, unit.id) ? 'Đã có trong giỏ' : 'Thêm vào giỏ'}
                </button>
                <button className="dashboard-secondary-btn" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)}>Xem các kho khác</button>
              </div>
            </div>
          </div>
          <section className="unit-detail-description"><span className="customer-eyebrow">ABOUT THIS UNIT</span><h2>Thông tin về kho</h2><p>{getUnitTypeStyle(unit.type).label} ({unit.type}) tại {facility.name} phù hợp cho nhu cầu lưu trữ cá nhân, hồ sơ, đồ gia dụng và các vật dụng cần không gian riêng biệt. Kho được quản lý và kiểm soát ra vào theo tiêu chuẩn của StoreSpace.</p></section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

/* Các gói thời hạn thuê mới (theo tháng): chỉ 6 hoặc 12 tháng. */
const DURATION_PACKAGES = RENTAL_TERMS
const DURATION_PACKAGE_NOTES = { 6: 'Nửa năm', 12: 'Một năm' }

function getRestoredBookingForm(facility, unit) {
  const draft = loadBookingDraft()
  if (!draftMatchesUnit(draft, facility.facilityId, unit.id)) return null

  const form = { restored: false, pastDate: false }
  if (/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate || '')) {
    const [year, month, day] = draft.startDate.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (date.getTime() >= today.getTime()) {
      form.startDay = String(day)
      form.startMonth = String(month)
      form.startYear = String(year)
      form.restored = true
    } else {
      form.pastDate = true
    }
  }
  const duration = Number(draft.duration)
  if (RENTAL_TERMS.includes(duration)) {
    form.duration = duration
    form.restored = true
  }
  if (draft.paymentMode === 'cycle' || draft.paymentMode === 'full') form.paymentMode = draft.paymentMode
  const cycle = Number(draft.paymentCycle)
  if ([1, 3, 6, 12].includes(cycle) && cycle <= (form.duration || 1)) form.paymentCycle = cycle
  return form
}

function BookingPage({ facility, unit }) {
  const dialog = useDialog()
  const [restoredForm] = useState(() => getRestoredBookingForm(facility, unit))
  const [step, setStep] = useState(1)
  const [availableUnits, setAvailableUnits] = useState([])
  const [selectedUnitNumber, setSelectedUnitNumber] = useState(unit.id)

  const [startDay, setStartDay] = useState(restoredForm?.startDay || '')
  const [startMonth, setStartMonth] = useState(restoredForm?.startMonth || '')
  const [startYear, setStartYear] = useState(restoredForm?.startYear || '')

  const [duration, setDuration] = useState(restoredForm?.duration || RENTAL_TERMS[0])
  const [paymentMode, setPaymentMode] = useState(restoredForm?.paymentMode || 'cycle')
  const [paymentCycle, setPaymentCycle] = useState(restoredForm?.paymentCycle || 1)
  const [showRestoredNote, setShowRestoredNote] = useState(Boolean(restoredForm?.restored || restoredForm?.pastDate))

  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)
  const [depositPaid, setDepositPaid] = useState(false)
  const [depositSecondsRemaining, setDepositSecondsRemaining] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (step !== 2 || booking?.status !== 'Pending Deposit' || !booking.depositExpiresAt) {
      setDepositSecondsRemaining(null)
      return
    }

    const updateCountdown = () => {
      const expiresAt = Date.parse(booking.depositExpiresAt)
      setDepositSecondsRemaining(Number.isNaN(expiresAt)
        ? 0
        : Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)))
    }

    updateCountdown()
    const timerId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(timerId)
  }, [step, booking?.status, booking?.depositExpiresAt])

  const selectedUnit = getStorageUnits(facility.name).find(item => item.id === selectedUnitNumber) || unit
  const monthlyPrice = Number(selectedUnit.price)
  const totalMonths = Number(duration)
  const totalRent = monthlyPrice * totalMonths
  // Tiền cọc = 2 tháng tiền thuê. Sau khi tạo đặt chỗ thì dùng số backend trả về.
  const deposit = booking?.deposit ?? computeDeposit(monthlyPrice)

  const years = Array.from(
    { length: 6 },
    (_, index) => new Date().getFullYear() + index
  )


  const formatPrice = value =>
    new Intl.NumberFormat('vi-VN').format(value) + 'đ'

  const formatDate = date => {
    if (!date || Number.isNaN(date.getTime())) return '—'

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
  }

  const toApiDate = date => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getStartDate = () => {
    if (!startDay || !startMonth || !startYear) return null

    const day = Number(startDay)
    const month = Number(startMonth)
    const year = Number(startYear)
    const date = new Date(year, month - 1, day)

    // Reject impossible dates such as 31/02.
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null
    }

    return date
  }

  const startDate = getStartDate()

  const calculateEndDate = () => {
    if (!startDate) return null

    const targetMonth = startDate.getMonth() + totalMonths
    const targetLastDay = new Date(
      startDate.getFullYear(),
      targetMonth + 1,
      0
    ).getDate()
    const date = new Date(
      startDate.getFullYear(),
      targetMonth,
      Math.min(startDate.getDate(), targetLastDay)
    )
    date.setDate(date.getDate() - 1)
    return date
  }

  const endDate = calculateEndDate()

  // Ngày kết thúc dự kiến cho một gói bất kỳ (dùng cùng quy tắc với calculateEndDate).
  const getEndDateFor = months => {
    if (!startDate) return null
    const targetMonth = startDate.getMonth() + months
    const targetLastDay = new Date(startDate.getFullYear(), targetMonth + 1, 0).getDate()
    const date = new Date(startDate.getFullYear(), targetMonth, Math.min(startDate.getDate(), targetLastDay))
    date.setDate(date.getDate() - 1)
    return date
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isValidStartDate =
    !!startDate && startDate.getTime() >= today.getTime()

  const canConfirm =
    !!startDate &&
    isValidStartDate &&
    RENTAL_TERMS.includes(duration)

  // Hiện lỗi cả ở đầu trang và bằng pop-up để khách không bỏ sót.
  const showBookingError = (message, title = 'Chưa thể đặt kho', tone = 'danger') => {
    setError(message)
    return dialog.alert({ tone, title, message })
  }

  const currentFormDraft = () => ({
    startDate: startDate ? toApiDate(startDate) : undefined,
    duration: totalMonths,
    paymentMode,
    paymentCycle: Number(paymentCycle)
  })

  const handleConfirmBooking = async () => {
    setError('')
    setAvailableUnits([])

    // Kiểm tra đăng nhập TRƯỚC: nếu phiên đã hết (đăng xuất ở tab khác, xóa dữ liệu trình duyệt...)
    // thì lưu toàn bộ thông tin đang chọn rồi đưa sang đăng nhập / đăng ký.
    const currentUser = getCurrentUser()

    if (!currentUser?.email) {
      await promptLoginForBooking(dialog, {
        facility,
        unit,
        title: 'Bạn chưa đăng nhập',
        message: `Cần đăng nhập để xác nhận đặt kho ${unit.id}.\nNgày bắt đầu, thời gian thuê và hình thức thanh toán bạn đã chọn sẽ được giữ lại, đăng nhập xong bạn chỉ cần bấm xác nhận lần nữa.`,
        draftFields: currentFormDraft()
      })
      return
    }

    if (currentUser.role !== 'customer') {
      await alertNotCustomer(dialog)
      return
    }

    if (!facility.facilityId || !unit.unitTypeId) {
      await showBookingError('Thiếu mã cơ sở hoặc loại kho từ dữ liệu backend. Vui lòng tải lại trang.')
      return
    }

    if (!startDate) {
      await showBookingError('Vui lòng chọn đầy đủ ngày, tháng và năm bắt đầu thuê.', 'Thiếu ngày bắt đầu thuê', 'warning')
      return
    }

    if (!isValidStartDate) {
      await showBookingError('Ngày bắt đầu thuê không được ở trong quá khứ.', 'Ngày bắt đầu không hợp lệ', 'warning')
      return
    }

    setIsSubmitting(true)
    try {
      const startDateValue = toApiDate(startDate)
      const availability = await apiGet(
        `/api/catalog/availability?facilityId=${facility.facilityId}&unitTypeId=${unit.unitTypeId}&startDate=${startDateValue}&months=${totalMonths}`
      )
      const availableForPeriod = availability.units || []
      const availableUnit = availableForPeriod.find(item => item.unitNumber === selectedUnitNumber)
      if (!availableUnit) {
        setAvailableUnits(availableForPeriod)
        if (availableForPeriod.length) {
          setSelectedUnitNumber(availableForPeriod[0].unitNumber)
          await showBookingError(
            `Kho ${unit.id} đã có đặt chỗ trùng kỳ thuê. Hệ thống đã hiển thị các kho còn trống cùng loại ở đầu trang; hãy chọn kho muốn đặt và xác nhận lại.`,
            'Kho đã có người đặt trong kỳ này',
            'warning'
          )
          document.getElementById('available-unit-choice')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        } else {
          await showBookingError(
            'Hiện không có kho cùng loại còn trống trong toàn bộ kỳ thuê đã chọn. Hãy chọn ngày khác hoặc quay lại chọn loại kho khác.',
            'Không còn kho trống',
            'warning'
          )
        }
        return
      }
      if (!Number.isInteger(availableUnit.unitId) || availableUnit.unitId <= 0) {
        throw new Error('Backend không trả về mã kho hợp lệ. Vui lòng tải lại trang và thử lại.')
      }

      const reservation = await apiPost('/api/reservation', {
        unitID: availableUnit.unitId,
        unitNumber: availableUnit.unitNumber,
        startDate: startDateValue,
        months: totalMonths
      })
      const reservationId = reservation.reservationId
      const bookingData = {
        id: `RSV-${reservationId}`,
        reservationId,
        customerName: currentUser.name,
        customerEmail: currentUser.email,
        facility: facility.name,
        unitId: availableUnit.unitNumber,
        unitType: availableUnit.unitType,
        size: availableUnit.size,
        startDate: formatDate(startDate),
        endDate: formatDate(new Date(reservation.endDate)),
        durationMonths: totalMonths,
        monthlyPrice: reservation.monthlyPrice,
        totalRent: reservation.rentalAmount,
        paymentMode,
        paymentCycle: paymentMode === 'cycle' ? Number(paymentCycle) : totalMonths,
        depositPercent: availability.depositPercent,
        deposit: reservation.depositAmount,
        depositExpiresAt: reservation.depositExpiresAt,
        status: 'Pending Deposit',
        createdAt: new Date().toISOString()
      }

      sessionStorage.setItem(ACTIVE_BOOKING_HOLD_KEY, JSON.stringify({
        email: currentUser.email,
        unitNumber: availableUnit.unitNumber,
        expiresAt: reservation.depositExpiresAt
      }))
      // Đặt chỗ đã lưu vào DB, bản nháp tạm không còn cần nữa.
      clearBookingDraft()
      setShowRestoredNote(false)
      setBooking(bookingData)
      setDepositPaid(false)
      setStep(2)
    } catch (err) {
      await showBookingError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDepositPaid = async () => {
    if (!booking) return

    if (Date.parse(booking.depositExpiresAt) <= Date.now()) {
      setDepositSecondsRemaining(0)
      await showBookingError(
        'Thời gian giữ kho 10 phút đã hết nên kho đã được trả lại. Vui lòng tạo đặt chỗ mới.',
        'Hết thời gian giữ kho',
        'warning'
      )
      return
    }

    const confirmed = await dialog.confirm({
      tone: 'warning',
      title: 'Xác nhận đã thanh toán tiền cọc?',
      message: `Bạn xác nhận đã chuyển ${formatPrice(booking.deposit)} tiền cọc cho đặt chỗ ${booking.id}.\nChỉ bấm xác nhận khi đã thanh toán xong.`,
      confirmLabel: 'Tôi đã thanh toán',
      cancelLabel: 'Chưa'
    })
    if (!confirmed) return

    setError('')
    setIsSubmitting(true)
    try {
      const payment = await apiPost('/api/payment/confirm', {
        reservationID: booking.reservationId,
        amount: booking.deposit,
        paymentType: 'Demo manual confirmation'
      })
      setBooking(current => ({
        ...current,
        status: payment.reservationStatus,
        paymentReference: payment.transactionReference
      }))
      setDepositPaid(true)
      sessionStorage.removeItem(ACTIVE_BOOKING_HOLD_KEY)
      navigate('/customer')
    } catch (err) {
      await showBookingError(err.message, 'Chưa ghi nhận được tiền cọc')
    } finally {
      setIsSubmitting(false)
    }
  }

  const paymentCycleOptions = [1, 3, 6, 12].filter(
    value => value <= totalMonths
  )

  const handleDurationChange = value => {
    const nextDuration = Math.max(1, Math.min(12, value))
    setDuration(nextDuration)

    if (paymentCycle > nextDuration) {
      setPaymentCycle(1)
    }
  }

  return (
    <div className="app">
      <SiteHeader />

      <main className="booking-page">
        <div className="container">
          <button
            className="back-link"
            type="button"
            onClick={() => {
              if (step === 2) {
                navigate('/customer')
              } else {
                navigate(`/facilities/${createSlug(facility.name)}/unit/${unit.id}`)
              }
            }}
          >
            ← {step === 2 ? 'Về trang khách hàng' : 'Quay lại thông tin kho'}
          </button>

          <div className="customer-page-heading">
            <div>
              <span className="customer-eyebrow">BOOK STORAGE</span>
              <h1>
                {step === 1 ? 'Đặt kho' : 'Thanh toán tiền cọc'}
              </h1>
              <p>
                {step === 1
                  ? `Chọn ngày bắt đầu, thời gian thuê và phương thức thanh toán cho kho ${unit.id}.`
                    : `Tiền cọc bằng ${DEPOSIT_MONTHS} tháng tiền thuê, hoàn lại khi trả kho nếu không phát sinh chi phí.`}
              </p>
            </div>

            <div className="booking-step-indicator">
              <span className="active">1</span>
              <i />
              <span className={step >= 2 ? 'active' : ''}>2</span>
            </div>
          </div>

          {step === 1 && showRestoredNote && (
            <div className="booking-draft-note" role="status">
              <span aria-hidden="true">i</span>
              <div>
                {restoredForm?.restored && 'Đã khôi phục thông tin bạn chọn trước khi đăng nhập. Kiểm tra lại rồi bấm "Xác nhận đặt kho" để giữ kho. '}
                {restoredForm?.pastDate && 'Ngày bắt đầu bạn chọn trước đó đã qua, vui lòng chọn lại ngày bắt đầu thuê.'}
                <button type="button" onClick={() => setShowRestoredNote(false)}>Ẩn</button>
              </div>
            </div>
          )}
          {error && (
            <div className="auth-message error booking-page-message" role="alert">
              {error}
            </div>
          )}
          {availableUnits.length > 0 && (
            <div className="booking-form-card" style={{ marginBottom: 20 }}>
              <label htmlFor="available-unit-choice">Kho còn trống trong kỳ thuê đã chọn</label>
              <select
                id="available-unit-choice"
                value={selectedUnitNumber}
                onChange={event => setSelectedUnitNumber(event.target.value)}
              >
                {availableUnits.map(candidate => (
                  <option key={candidate.unitId} value={candidate.unitNumber}>
                    {candidate.unitNumber} · {candidate.size} · {formatPrice(candidate.monthlyPrice)}/tháng
                  </option>
                ))}
              </select>
              <p>Chọn một kho còn trống rồi bấm “Xác nhận đặt kho” để tạo đặt chỗ.</p>
            </div>
          )}

          {step === 1 && (
            <div className="booking-layout">
              <section className="booking-unit-summary">
                <div className="booking-unit-image">
                  <UnitTypeArt type={selectedUnit.type} size={selectedUnit.size} unitCode={selectedUnit.id} />
                </div>

                <div className="booking-unit-summary-body">
                  <span className="storage-facility-name">{facility.name}</span>
                  <h2>{selectedUnit.id}</h2>
                  <div className="unit-detail-type"><UnitTypeChip type={selectedUnit.type} /><SizeMeter size={selectedUnit.size} /></div>
                  <p>{selectedUnit.type} · {selectedUnit.size}</p>

                  <div className="booking-summary-info">
                    <div>
                      <small>Giá thuê / tháng</small>
                      <strong>{formatPrice(monthlyPrice)}</strong>
                    </div>

                    <div>
                      <small>Trạng thái</small>
                      <strong className="available-text">
                        {selectedUnit.status?.toLowerCase() === 'booking'
                          ? 'Đang được giữ cho bạn'
                          : selectedUnitNumber === unit.id
                            ? 'Còn trống theo danh mục'
                            : 'Đã kiểm tra còn trống theo kỳ thuê'}
                      </strong>
                    </div>
                  </div>

                  <div className="booking-features">
                    <span>✓ Camera giám sát 24/7</span>
                    <span>✓ Kiểm soát ra vào</span>
                    <span>✓ Hỗ trợ khách hàng</span>
                    <span>✓ Giá thuê minh bạch</span>
                  </div>
                </div>
              </section>

              <section className="booking-form-card">
                <div className="booking-form-heading">
                  <span>01</span>
                  <div>
                    <h2>Thông tin thuê</h2>
                    <p>Điền đầy đủ thông tin để hệ thống tính tiền tự động.</p>
                  </div>
                </div>

                <div className="booking-large-field">
                  <label id="rental-start-label">Ngày bắt đầu thuê</label>
                  <RentalCalendar
                    value={startDate}
                    endDate={endDate}
                    durationMonths={totalMonths}
                    maxDate={new Date(years[years.length - 1], 11, 31)}
                    onChange={date => {
                      setStartDay(String(date.getDate()))
                      setStartMonth(String(date.getMonth() + 1))
                      setStartYear(String(date.getFullYear()))
                      setError('')
                    }}
                  />
                </div>

                <div className="booking-large-field">
                  <label id="rental-duration-label">Thời hạn thuê</label>
                  <div className="duration-packages" role="radiogroup" aria-labelledby="rental-duration-label">
                    {DURATION_PACKAGES.map(months => {
                      const active = duration === months
                      const packageEnd = getEndDateFor(months)
                      return (
                        <button
                          key={months}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`duration-package${active ? ' active' : ''}`}
                          onClick={() => handleDurationChange(months)}
                        >
                          <span className="duration-package-months"><strong>{months}</strong> tháng</span>
                          <span className="duration-package-total">{formatPrice(monthlyPrice * months)}</span>
                          <span className="duration-package-end">{packageEnd ? `Đến ${formatDate(packageEnd)}` : DURATION_PACKAGE_NOTES[months]}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="duration-note">
                    Hợp đồng thuê mới áp dụng gói <strong>6 tháng</strong> hoặc <strong>12 tháng</strong>. Tiền cọc <strong>{DEPOSIT_MONTHS} tháng tiền thuê</strong> ({formatPrice(computeDeposit(monthlyPrice))}), hoàn lại khi trả kho. Gia hạn hợp đồng là chức năng riêng, sẽ có sau.
                  </p>
                </div>

                <div className="booking-period-summary">
                  <div>
                    <small>Ngày bắt đầu</small>
                    <strong>{formatDate(startDate)}</strong>
                  </div>

                  <div>
                    <small>Ngày kết thúc dự kiến</small>
                    <strong>{formatDate(endDate)}</strong>
                  </div>

                  <div>
                    <small>Thời gian thuê</small>
                    <strong>{duration} tháng</strong>
                  </div>
                </div>

                <div className="booking-large-field">
                  <label>Phương thức thanh toán tiền thuê</label>

                  <div className="payment-mode-grid">
                    <button
                      type="button"
                      className={paymentMode === 'cycle' ? 'payment-mode-card active' : 'payment-mode-card'}
                      onClick={() => setPaymentMode('cycle')}
                    >
                      <span className="payment-mode-icon">↻</span>
                      <strong>Thanh toán theo chu kỳ</strong>
                      <small>Thanh toán tiền thuê theo từng chu kỳ sau khi Manager phê duyệt.</small>
                    </button>

                    <button
                      type="button"
                      className={paymentMode === 'full' ? 'payment-mode-card active' : 'payment-mode-card'}
                      onClick={() => setPaymentMode('full')}
                    >
                      <span className="payment-mode-icon">✓</span>
                      <strong>Thanh toán toàn bộ</strong>
                      <small>Thanh toán toàn bộ tiền thuê một lần sau khi Manager phê duyệt.</small>
                    </button>
                  </div>
                </div>

                {paymentMode === 'cycle' && (
                  <div className="cycle-select-box">
                    <label>Chu kỳ thanh toán</label>
                    <select
                      value={paymentCycle}
                      onChange={e => setPaymentCycle(Number(e.target.value))}
                    >
                      {paymentCycleOptions.map(value => (
                        <option key={value} value={value}>
                          Mỗi {value} tháng
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="booking-price-breakdown">
                  <div>
                    <span>Giá thuê / tháng</span>
                    <strong>{formatPrice(monthlyPrice)}</strong>
                  </div>

                  <div>
                    <span>Thời gian thuê</span>
                    <strong>{duration} tháng</strong>
                  </div>

                  <div>
                    <span>Hình thức thanh toán</span>
                    <strong>
                      {paymentMode === 'cycle'
                        ? `Theo chu kỳ ${paymentCycle} tháng`
                        : 'Thanh toán toàn bộ'}
                    </strong>
                  </div>

                  <div className="price-divider" />

                  <div>
                    <span>Tổng tiền thuê</span>
                    <strong className="main-price">{formatPrice(totalRent)}</strong>
                  </div>

                  <div className="deposit-row">
                    <div>
                      <span>Tiền cọc bắt buộc</span>
                      <small>{DEPOSIT_MONTHS} tháng tiền thuê · hoàn lại khi trả kho</small>
                    </div>
                    <strong className="deposit-price">{formatPrice(deposit)}</strong>
                  </div>
                </div>

                <div className="deposit-notice">
                  <div className="deposit-notice-icon">$</div>
                  <div>
                    <strong>Quy trình thanh toán</strong>
                    <p>
                      Bước 1: thanh toán tiền cọc {formatPrice(deposit)}.
                    </p>
                    <p>
                      Bước 2: hệ thống chuyển yêu cầu cho Facility Manager duyệt.
                    </p>
                    <p>
                      Bước 3: sau khi được duyệt, bạn ký hợp đồng online trong mục Hợp đồng.
                    </p>
                    <p>
                      Bước 4: thanh toán tiền thuê theo hình thức đã chọn và nhận kho.
                    </p>
                  </div>
                </div>

                <div className="booking-actions">
                  <button
                    className="dashboard-secondary-btn"
                    type="button"
                    onClick={() => navigate(`/facilities/${createSlug(facility.name)}/unit/${unit.id}`)}
                  >
                    Quay lại
                  </button>

                  <button
                    className="dashboard-primary-btn booking-submit"
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleConfirmBooking}
                  >
                    {isSubmitting ? 'Đang tạo đặt chỗ...' : 'Xác nhận đặt kho'} <ArrowIcon />
                  </button>
                </div>
              </section>
            </div>
          )}

          {step === 2 && booking && (
            <div className="deposit-payment-page">
              <div className="deposit-payment-header">
                <span className="customer-eyebrow">DEPOSIT PAYMENT</span>
                <h2>Thanh toán tiền cọc</h2>
                <p>Đặt chỗ <strong>{booking.id}</strong> đã được lưu trong hệ thống. Tiền cọc được tính theo chính sách của cơ sở.</p>
              </div>

              <div className="deposit-payment-layout">
                <div className="deposit-qr-card">
                  <div className="deposit-qr-title">
                    <strong>Xác nhận thanh toán tiền cọc</strong>
                    <span>Số tiền lấy từ kết quả đặt chỗ backend</span>
                  </div>

                  <div className="qr-wrapper">
                    <p>Chưa tích hợp cổng thanh toán ngân hàng. Hành động bên dưới chỉ ghi nhận giao dịch mô phỏng vào database.</p>
                  </div>

                  <strong className="qr-amount">
                    {formatPrice(booking.deposit)}
                  </strong>

                  <p className="qr-note">
                    Mã đặt chỗ:
                    <strong>{' '}{booking.id}</strong>
                  </p>

                  <button
                    className="dashboard-primary-btn full"
                    type="button"
                    onClick={handleDepositPaid}
                    disabled={depositPaid || isSubmitting || depositSecondsRemaining === 0}
                  >
                    {depositPaid
                      ? 'Đã ghi nhận giao dịch mô phỏng'
                      : depositSecondsRemaining === 0
                        ? 'Đã hết thời gian giữ kho'
                        : isSubmitting
                          ? 'Đang ghi nhận...'
                          : 'Ghi nhận thanh toán mô phỏng'}
                  </button>
                  {!depositPaid && depositSecondsRemaining !== null && (
                    <p role="status">
                      {depositSecondsRemaining > 0
                        ? `Vui lòng thanh toán trong ${Math.floor(depositSecondsRemaining / 60)}:${String(depositSecondsRemaining % 60).padStart(2, '0')} phút.`
                        : 'Thời gian giữ kho đã hết. Vui lòng tạo đặt chỗ mới.'}
                    </p>
                  )}
                </div>

                <div className="deposit-payment-info">
                  <div className="payment-info-block">
                    <span>THÔNG TIN THANH TOÁN</span>

                    <div>
                      <small>Số tiền cọc</small>
                      <strong className="payment-highlight">{formatPrice(booking.deposit)}</strong>
                    </div>

                    <div>
                      <small>Mã đặt chỗ</small>
                      <strong>{booking.id}</strong>
                    </div>
                    {booking.paymentReference && <div><small>Mã giao dịch</small><strong>{booking.paymentReference}</strong></div>}
                  </div>

                  <div className="payment-booking-summary">
                    <span>ĐẶT KHO</span>
                    <strong>{booking.facility}</strong>
                    <p>{booking.unitId} · {booking.unitType} · {booking.size}</p>

                    <div>
                      <span>Ngày bắt đầu</span>
                      <strong>{booking.startDate}</strong>
                    </div>

                    <div>
                      <span>Ngày kết thúc</span>
                      <strong>{booking.endDate}</strong>
                    </div>

                    <div>
                      <span>Thời gian</span>
                      <strong>{booking.durationMonths} tháng</strong>
                    </div>

                    <div>
                      <span>Tổng tiền thuê</span>
                      <strong>{formatPrice(booking.totalRent)}</strong>
                    </div>

                    <div>
                      <span>Phương thức thuê</span>
                      <strong>
                        {booking.paymentMode === 'cycle'
                          ? `Chu kỳ ${booking.paymentCycle} tháng`
                          : 'Thanh toán toàn bộ'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="payment-warning">
                <strong>Lưu ý:</strong>
                <span>
                  Backend hiện chỉ hỗ trợ ghi nhận thanh toán mô phỏng, chưa xác minh giao dịch với ngân hàng. Trạng thái chỉ được cập nhật sau khi API xác nhận.
                </span>
              </div>

              <div className="deposit-status">
                <div className="deposit-status-dot" />
                <div>
                  <strong>
                    {depositPaid
                      ? 'API đã ghi nhận tiền cọc — đang chờ phân kho'
                      : 'Đang chờ thanh toán cọc'}
                  </strong>
                  <small>
                    Mã đặt chỗ: {booking.id}
                  </small>
                </div>
                <span>
                  {booking.status}
                </span>
              </div>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
const PRICE_FILTERS = [
  { value: 'under1', label: 'Dưới 1 triệu', match: p => p < 1000000 },
  { value: '1to2', label: '1 – 2 triệu', match: p => p >= 1000000 && p <= 2000000 },
  { value: 'over2', label: 'Trên 2 triệu', match: p => p > 2000000 }
]
const SIZE_FILTERS = [
  { value: 'S', label: 'Nhỏ' },
  { value: 'M', label: 'Vừa' },
  { value: 'L', label: 'Lớn' },
  { value: 'V', label: 'Rất lớn' }
]

function SearchPage() {
  const params = new URLSearchParams(window.location.search)
  const initial = params.get('q') || ''
  const filters = {
    q: initial.trim(),
    type: resolveTypeParam(params.get('type') || ''),
    district: params.get('district') || '',
    size: params.get('size') || '',
    price: params.get('price') || '',
    // Mặc định chỉ hiện kho còn trống; khách có thể xem cả kho đang được thuê.
    all: params.get('all') === '1'
  }
  const [query, setQuery] = useState(initial)
  const catalogTypeKeys = getCatalogTypeKeys()
  const districtGroups = getDistrictGroups()
  const activeDistrict = districtGroups.find(group => group.slug === filters.district)

  const buildUrl = changes => {
    const next = { ...filters, ...changes }
    const qs = new URLSearchParams()
    if (next.q) qs.set('q', next.q)
    if (next.district) qs.set('district', next.district)
    if (next.type) qs.set('type', next.type)
    if (next.size) qs.set('size', next.size)
    if (next.price) qs.set('price', next.price)
    if (next.all) qs.set('all', '1')
    const text = qs.toString()
    return text ? `/search?${text}` : '/search'
  }
  const go = changes => navigate(buildUrl(changes))

  // Lọc tới từng kho theo mọi tiêu chí khách đã chọn.
  const keyword = filters.q.toLowerCase()
  const priceRule = PRICE_FILTERS.find(item => item.value === filters.price)
  const unitMatches = (facility, unit, ignore = '') => {
    if (!filters.all && !unit.available) return false
    if (ignore !== 'district' && activeDistrict && facility.district?.slug !== filters.district) return false
    if (ignore !== 'type' && filters.type && getUnitTypeKey(unit.type) !== filters.type) return false
    if (ignore !== 'size' && filters.size && parseUnitSize(unit.size).sizeClass.key !== filters.size) return false
    if (ignore !== 'price' && priceRule && !priceRule.match(unit.price)) return false
    if (keyword) {
      const text = `${unit.id} ${unit.type} ${getUnitTypeStyle(unit.type).label} ${unit.size} ${facility.name} ${facility.location} ${facility.district?.label || ''}`.toLowerCase()
      if (!text.includes(keyword)) return false
    }
    return true
  }
  const groups = facilities
    .map(facility => ({
      facility,
      units: getStorageUnits(facility.name)
        .filter(unit => unitMatches(facility, unit))
        .sort((a, b) => Number(b.available) - Number(a.available) || a.price - b.price)
    }))
    .filter(group => group.units.length > 0)
  const totalUnits = groups.reduce((n, g) => n + g.units.length, 0)
  // Số kho cho từng lựa chọn (tính theo các bộ lọc còn lại) để khách biết trước kết quả.
  const countWith = (ignore, predicate) => facilities.reduce((n, facility) =>
    n + getStorageUnits(facility.name).filter(unit => unitMatches(facility, unit, ignore) && predicate(facility, unit)).length, 0)
  const hasFilter = filters.q || filters.type || activeDistrict || filters.size || filters.price

  const submit = e => {
    e.preventDefault()
    go({ q: query.trim() })
  }

  const chip = (active, label, onClick, count, style) => (
    <button
      type="button"
      className={active ? 'active' : ''}
      aria-pressed={active}
      style={style}
      onClick={onClick}
    >
      {label}{count !== undefined && <em>{count}</em>}
    </button>
  )

  return (
    <div className="app">
      <SiteHeader />
      <main className="listing-page">
        <div className="container">
          <div className="listing-heading"><div className="eyebrow">SEARCH STORAGE</div><h1>Tìm kho phù hợp với bạn.</h1><p>Chọn khu vực, loại kho, kích thước và mức giá. Kết quả là các kho cụ thể phù hợp với tất cả lựa chọn của bạn.</p></div>
          <form className="search-box listing-search" onSubmit={submit}><div className="search-input-wrap"><SearchIcon />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm mã kho, cơ sở, địa chỉ..." />
          </div>
            <button type="submit">Tìm kho</button></form>

          <div className="search-filters">
            <div className="search-filter-label">Khu vực</div>
            <DistrictPicker groups={districtGroups} active={activeDistrict ? filters.district : ''} onSelect={slug => go({ district: slug })} />

            <div className="search-filter-label">Loại kho</div>
            <div className="uc-type-filter" role="group" aria-label="Lọc theo loại kho">
              {chip(!filters.type, 'Tất cả loại', () => go({ type: '' }))}
              {catalogTypeKeys.map(key => {
                const style = UNIT_TYPE_STYLES[key]
                return (
                  <React.Fragment key={key}>
                    {chip(
                      filters.type === key,
                      <><UnitTypeIcon typeKey={key} size={18} /> {style.label}</>,
                      () => go({ type: filters.type === key ? '' : key }),
                      countWith('type', (f, u) => getUnitTypeKey(u.type) === key),
                      { '--ut-color': style.color, '--ut-soft': style.soft }
                    )}
                  </React.Fragment>
                )
              })}
            </div>

            <div className="search-filter-row">
              <div>
                <div className="search-filter-label">Kích thước</div>
                <div className="uc-type-filter" role="group" aria-label="Lọc theo kích thước">
                  {chip(!filters.size, 'Tất cả', () => go({ size: '' }))}
                  {SIZE_FILTERS.map(item => (
                    <React.Fragment key={item.value}>
                      {chip(filters.size === item.value, item.label, () => go({ size: filters.size === item.value ? '' : item.value }), countWith('size', (f, u) => parseUnitSize(u.size).sizeClass.key === item.value))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div>
                <div className="search-filter-label">Giá thuê / tháng</div>
                <div className="uc-type-filter" role="group" aria-label="Lọc theo giá">
                  {chip(!filters.price, 'Tất cả', () => go({ price: '' }))}
                  {PRICE_FILTERS.map(item => (
                    <React.Fragment key={item.value}>
                      {chip(filters.price === item.value, item.label, () => go({ price: filters.price === item.value ? '' : item.value }), countWith('price', (f, u) => item.match(u.price)))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
            <label className="search-available-toggle">
              <input type="checkbox" checked={!filters.all} onChange={e => go({ all: !e.target.checked })} />
              Chỉ hiện kho còn trống
            </label>
          </div>

          <div className="listing-top search-result-top">
            <h2>{totalUnits} kho phù hợp{groups.length ? ` tại ${groups.length} cơ sở` : ''}</h2>
            {hasFilter && <button type="button" className="inline-link" onClick={() => navigate(filters.all ? '/search?all=1' : '/search')}>Xóa bộ lọc</button>}
          </div>
          {hasFilter && (
            <div className="search-result-note">
              Đang lọc:
              {activeDistrict && <> khu vực <strong>{activeDistrict.label}</strong>;</>}
              {filters.type && <> loại <strong>{UNIT_TYPE_STYLES[filters.type].label}</strong>;</>}
              {filters.size && <> kích thước <strong>{SIZE_FILTERS.find(i => i.value === filters.size)?.label}</strong>;</>}
              {priceRule && <> giá <strong>{priceRule.label}</strong>;</>}
              {filters.q && <> từ khóa <strong>“{filters.q}”</strong></>}
            </div>
          )}

          {groups.map(({ facility, units }) => (
            <section className="search-facility-group" key={facility.facilityId}>
              <div className="search-facility-head">
                <div>
                  <h3>{facility.name}</h3>
                  <p><PinIcon /> {facility.location}{facility.district ? ` · ${facility.district.label}` : ''}</p>
                </div>
                <div className="search-facility-meta">
                  <span>{units.length} kho phù hợp</span>
                  <button type="button" className="text-link" onClick={() => navigate(`/facilities/${createSlug(facility.name)}${filters.type ? `?type=${filters.type}` : ''}`)}>Xem cơ sở <ArrowIcon /></button>
                </div>
              </div>
              <div className="uc-grid">
                {units.map(unit => <UnitCard key={unit.id} facility={facility} unit={unit} />)}
              </div>
            </section>
          ))}
          {totalUnits === 0 && (
            <div className="empty-state">
              Không có kho nào phù hợp với tất cả lựa chọn của bạn.
              {hasFilter && <> <button type="button" className="inline-link" onClick={() => navigate('/search')}>Bỏ bớt bộ lọc</button></>}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function AuthShell({ children, title, subtitle }) {
  return (
    <div className="auth-page">
      <div className="auth-background auth-bg-one" />
      <div className="auth-background auth-bg-two" />
      <div className="auth-card">
        <button className="auth-brand" type="button" onClick={() => navigate('/')}><span className="brand-mark">S</span><span><strong>StoreSpace</strong><small>Your Space. Your Freedom.</small></span></button>
        <div className="auth-heading"><div className="eyebrow"><span /> STORESPACE ACCOUNT</div><h1>{title}</h1><p>{subtitle}</p></div>
        {children}
      </div>
    </div>
  )
}

async function loginAndStoreUser(email, password) {
  const data = await apiPost('/api/auth/login', { email, password })
  const user = {
    name: data.fullName,
    email: data.email,
    role: mapBackendRole(data.roleName),
    userId: data.userID,
    token: data.token,
    tokenExpiresAt: data.tokenExpiresAt
  }
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  return user
}

/* Chuyển trang sau khi đăng nhập; nếu kho trong bản nháp đã hết thì báo bằng pop-up. */
async function goAfterAuth(dialog, user, nextPath) {
  const { path, notice } = resolvePostAuthPath(user, nextPath)
  if (notice) await dialog.alert(notice)
  navigate(path)
}

function LoginPage() {
  const dialog = useDialog()
  const { draft, nextPath, discard } = usePendingBooking()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const login = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsSubmitting(true)
    try {
      const user = await loginAndStoreUser(email.trim(), password)
      setSuccess(`Đăng nhập thành công. Chào ${user.name}!`)
      setTimeout(() => { void goAfterAuth(dialog, user, nextPath) }, 500)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <AuthShell title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục quản lý việc thuê kho của bạn.">
      <BookingDraftNote draft={draft} action="Đăng nhập để tiếp tục đặt kho." onClear={discard} />
      <form className="auth-form" onSubmit={login}>{error && <div className="auth-message error" role="alert">{error}</div>}{success && <div className="auth-message success">{success}</div>}<label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Mật khẩu<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" required /></label><button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button></form>
      <p className="auth-switch">Chưa có tài khoản? <button className="inline-link" type="button" onClick={() => navigate(withNext('/register', nextPath))}>Đăng ký ngay</button></p>
      <button className="back-home" type="button" onClick={() => navigate('/')}>← Quay lại trang chủ</button>
    </AuthShell>
  )
}

function RegisterPage() {
  const { draft, nextPath, discard } = usePendingBooking()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const sendRegistrationOtp = async e => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    const trimmedEmail = email.trim().toLowerCase()
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

    try {
      if (!firstName.trim() || !lastName.trim()) {
        throw new Error('Vui lòng nhập họ và tên.')
      }
      if (!trimmedEmail) {
        throw new Error('Vui lòng nhập email.')
      }
      if (password.length < 6) {
        throw new Error('Mật khẩu phải có ít nhất 6 ký tự.')
      }
      if (password !== confirm) {
        throw new Error('Mật khẩu xác nhận không khớp.')
      }

      const newOtp = generateOTP()
      await sendOTPEmail(trimmedEmail, newOtp, fullName)

      const expiresAt = Date.now() + OTP_EXPIRES_MS
      const resendAvailableAt = Date.now() + OTP_RESEND_MS

      sessionStorage.setItem('storespace_register_pending', JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        fullName,
        gender: gender || null,
        dateOfBirth: birthDate || null,
        phoneNumber: phoneNumber.trim() || null,
        email: trimmedEmail,
        password,
        otp: newOtp,
        expiresAt,
        resendAvailableAt,
        attempts: 0,
        nextPath: nextPath || ''
      }))

      // Chuyển hẳn sang trang OTP riêng.
      navigate('/verify-otp')
    } catch (err) {
      setError(err?.message || 'Không thể gửi mã OTP. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Tạo tài khoản"
      subtitle="Đăng ký tài khoản StoreSpace để bắt đầu hành trình thuê kho."
    >
      <BookingDraftNote draft={draft} action="Tạo tài khoản xong bạn sẽ quay lại trang đặt kho ngay." onClear={discard} />

      <form className="auth-form" onSubmit={sendRegistrationOtp}>
        {error && <div className="auth-message error" role="alert">{error}</div>}

        <div className="auth-two-columns">
          <label>Họ *
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nguyễn" autoComplete="given-name" required />
          </label>
          <label>Tên *
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Văn A" autoComplete="family-name" required />
          </label>
        </div>

        <fieldset className="auth-fieldset">
          <legend>Giới tính</legend>
          <div className="auth-radio-group">
            <label><input type="radio" name="gender" value="Male" checked={gender === 'Male'} onChange={e => setGender(e.target.value)} /> Nam</label>
            <label><input type="radio" name="gender" value="Female" checked={gender === 'Female'} onChange={e => setGender(e.target.value)} /> Nữ</label>
            <label><input type="radio" name="gender" value="Other" checked={gender === 'Other'} onChange={e => setGender(e.target.value)} /> Khác / Không muốn nói</label>
          </div>
        </fieldset>

        <div className="auth-two-columns">
          <label>Ngày sinh
            <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} autoComplete="bday" />
          </label>
          <label>Số điện thoại
            <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value.replace(/[^0-9+ ]/g, ''))} placeholder="0912345678" autoComplete="tel" inputMode="tel" />
          </label>
        </div>

        <label>Email *
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </label>

        <label>Mật khẩu *
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" autoComplete="new-password" required />
        </label>

        <label>Xác nhận mật khẩu *
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" required />
        </label>

        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang gửi mã OTP...' : 'Gửi mã xác thực'}
        </button>
      </form>

      <p className="auth-switch">Đã có tài khoản? <button className="inline-link" type="button" onClick={() => navigate(withNext('/login', nextPath))}>Đăng nhập</button></p>
      <button className="back-home" type="button" onClick={() => navigate('/')}>← Quay lại trang chủ</button>
    </AuthShell>
  )
}

function VerifyOtpPage() {
  const dialog = useDialog()
  const { nextPath } = usePendingBooking()
  const [pending, setPending] = useState(null)
  const [otp, setOtp] = useState('')
  const [secondsRemaining, setSecondsRemaining] = useState(0)
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadPending = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('storespace_register_pending') || 'null')
      setPending(saved)
      setOtp('')
      return saved
    } catch {
      setPending(null)
      return null
    }
  }

  useEffect(() => {
    loadPending()
  }, [])

  useEffect(() => {
    if (!pending?.expiresAt) return undefined

    const update = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((Number(pending.expiresAt) - Date.now()) / 1000)))
      setResendSecondsRemaining(Math.max(0, Math.ceil((Number(pending.resendAvailableAt || 0) - Date.now()) / 1000)))
    }

    update()
    const timerId = window.setInterval(update, 1000)
    return () => window.clearInterval(timerId)
  }, [pending])

  const clearPending = () => {
    sessionStorage.removeItem('storespace_register_pending')
  }

  const formatCountdown = totalSeconds => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  const verifyOtp = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const normalizedOtp = otp.replace(/\D/g, '')
    if (!pending) {
      setError('Phiên đăng ký không còn tồn tại. Vui lòng quay lại trang đăng ký.')
      return
    }
    if (normalizedOtp.length !== 6) {
      setError('Vui lòng nhập đủ 6 chữ số OTP.')
      return
    }
    if (Date.now() >= Number(pending.expiresAt)) {
      setError('Mã OTP đã hết hạn. Vui lòng gửi lại mã mới.')
      return
    }
    if (Number(pending.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      setError('Bạn đã nhập sai OTP quá số lần cho phép. Vui lòng gửi lại mã mới.')
      return
    }

    if (normalizedOtp !== pending.otp) {
      const attempts = Number(pending.attempts || 0) + 1
      const updated = { ...pending, attempts }
      sessionStorage.setItem('storespace_register_pending', JSON.stringify(updated))
      setPending(updated)
      setError(
        attempts >= OTP_MAX_ATTEMPTS
          ? 'OTP không đúng. Bạn đã hết số lần thử, hãy gửi lại mã mới.'
          : `OTP không đúng. Bạn còn ${OTP_MAX_ATTEMPTS - attempts} lần thử.`
      )
      return
    }

    setIsSubmitting(true)
    try {
      await apiPost('/api/auth/register', {
        fullName: pending.fullName,
        email: pending.email,
        password: pending.password,
        phoneNumber: pending.phoneNumber,
        gender: pending.gender,
        dateOfBirth: pending.dateOfBirth,
        roleName: 'Storage Customer'
      })

      clearPending()
      setSuccess('Xác thực email thành công. Tài khoản đã được tạo. Đang chuyển sang trang đăng nhập...')

      window.setTimeout(() => {
        navigate(withNext('/login', pending.nextPath || nextPath))
      }, 700)
    } catch (err) {
      setError(err?.message || 'Không thể tạo tài khoản. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resendOtp = async () => {
    if (!pending || resendSecondsRemaining > 0 || isSubmitting) return

    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      const newOtp = generateOTP()
      await sendOTPEmail(pending.email, newOtp, pending.fullName)

      const updated = {
        ...pending,
        otp: newOtp,
        expiresAt: Date.now() + OTP_EXPIRES_MS,
        resendAvailableAt: Date.now() + OTP_RESEND_MS,
        attempts: 0
      }

      sessionStorage.setItem('storespace_register_pending', JSON.stringify(updated))
      setPending(updated)
      setOtp('')
      setSuccess(`Mã OTP mới đã được gửi tới ${pending.email}.`)
    } catch (err) {
      setError(err?.message || 'Không thể gửi lại mã OTP. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const changeEmail = () => {
    clearPending()
    navigate(withNext('/register', pending?.nextPath || nextPath))
  }

  if (!pending) {
    return (
      <AuthShell title="Xác thực email" subtitle="Không tìm thấy thông tin đăng ký đang chờ.">
        <div className="auth-message error" role="alert">
          Phiên đăng ký OTP không còn tồn tại hoặc đã bị xóa. Vui lòng đăng ký lại từ đầu.
        </div>
        <button className="auth-submit" type="button" onClick={() => navigate(withNext('/register', nextPath))}>
          Quay lại đăng ký
        </button>
        <button className="back-home" type="button" onClick={() => navigate('/login')}>← Đến trang đăng nhập</button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Xác thực email"
      subtitle={`Nhập mã OTP 6 số đã được gửi tới ${pending.email}.`}
    >
      <form className="auth-form" onSubmit={verifyOtp}>
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {success && <div className="auth-message success" role="status">{success}</div>}

        <div className="auth-otp-box">
          <span className="auth-otp-label">Mã OTP</span>
          <input
            className="auth-otp-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            autoFocus
            required
          />
          <p>Mã có hiệu lực trong <strong>{formatCountdown(secondsRemaining)}</strong>.</p>
          {secondsRemaining === 0 && <p className="auth-otp-expired">Mã đã hết hạn.</p>}
        </div>

        <button
          className="auth-submit"
          type="submit"
          disabled={isSubmitting || secondsRemaining === 0 || otp.length !== 6}
        >
          {isSubmitting ? 'Đang xác thực...' : 'Xác nhận OTP'}
        </button>

        <div className="auth-otp-actions">
          <button className="inline-link" type="button" onClick={resendOtp} disabled={isSubmitting || resendSecondsRemaining > 0}>
            {resendSecondsRemaining > 0 ? `Gửi lại mã sau ${resendSecondsRemaining}s` : 'Gửi lại mã OTP'}
          </button>
          <button className="inline-link" type="button" onClick={changeEmail} disabled={isSubmitting}>Đổi email</button>
        </div>
      </form>

      <p className="auth-switch">Đã có tài khoản? <button className="inline-link" type="button" onClick={() => navigate(withNext('/login', pending.nextPath || nextPath))}>Đăng nhập</button></p>
      <button className="back-home" type="button" onClick={() => navigate('/')}>← Quay lại trang chủ</button>
    </AuthShell>
  )
}

function HomePage() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const availableUnitCount = Object.values(storageUnits).flat().filter(unit => unit.available).length
  const visible = facilities.filter(f => {
    const unitText = getStorageUnits(f.name)
      .map(unit => `${unit.id} ${unit.type} ${unit.size}`)
      .join(' ')
    return `${f.name} ${f.location} ${unitText}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  const search = e => {
    e.preventDefault()
    setSubmittedQuery(query.trim())
    document.getElementById('facilities')?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <div className="app">
      <SiteHeader />
      <main id="top">
        <section className="hero">
          <div className="hero-glow hero-glow-blue" /><div className="hero-glow hero-glow-yellow" />
          <div className="hero-inner container">
            <div className="hero-content">
              <div className="eyebrow"><span /> STORESPACE · SELF-STORAGE</div>
              <h1>Không gian lưu trữ<br /><em>theo cách của bạn.</em></h1>
              <p className="hero-description">Tìm kho phù hợp, xem thông tin trước khi đặt và theo dõi toàn bộ hành trình thuê kho một cách rõ ràng.</p>
              <form className="search-box" onSubmit={search}><div className="search-input-wrap"><SearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kho, cơ sở, loại kho..." /></div><button type="submit">Tìm kho</button></form>
              <div className="hero-benefits"><span><ShieldIcon /> Giá rõ ràng</span><span><ShieldIcon /> Theo dõi hợp đồng</span><span><ShieldIcon /> Hỗ trợ khi cần</span></div>
            </div>
            <div className="hero-visual">
              <div className="hero-photo-card"><img src="https://images.pexels.com/photos/4483610/pexels-photo-4483610.jpeg?auto=compress&cs=tinysrgb&w=1400" alt="Không gian kho lưu trữ hiện đại" /><div className="photo-overlay" /><div className="floating-label floating-label-top"><span className="live-dot" /> Đang có kho trống <strong>{availableUnitCount}</strong></div><div className="floating-label floating-label-bottom"><span className="mini-icon"><ShieldIcon /></span><div><strong>An tâm lưu trữ</strong><small>Kiểm soát ra vào & camera</small></div></div></div>
              <div className="hero-yellow-block" /><div className="hero-number">01<span>/03</span></div>
            </div>
          </div>
        </section>
        <section className="trust-strip"><div className="container trust-inner"><div><strong>{availableUnitCount}</strong><span>kho đang sẵn sàng</span></div><div><strong>{facilities.length}</strong><span>cơ sở đang hoạt động</span></div><div><strong>24/7</strong><span>hỗ trợ & an ninh</span></div><div><strong>100%</strong><span>minh bạch chi phí</span></div></div></section>
        <section className="district-home section" id="districts">
          <div className="container">
            <div className="section-heading">
              <div><div className="eyebrow green">FIND BY AREA</div><h2>Tìm kho theo khu vực</h2><p>Chọn quận gần bạn để xem các cơ sở và kho còn trống.</p></div>
              <button className="text-link" type="button" onClick={() => navigate('/facilities')}>Xem tất cả cơ sở <ArrowIcon /></button>
            </div>
            <DistrictPicker groups={getDistrictGroups()} showAll={false} large label="Chọn khu vực" onSelect={slug => navigate(`/search?district=${slug}`)} />
          </div>
        </section>
        <section className="facilities section" id="facilities"><div className="container"><div className="section-heading"><div><div className="eyebrow green">OUR FACILITIES</div><h2>Cơ sở lưu trữ</h2><p>Mỗi cơ sở có nhiều loại kho và kích thước để bạn lựa chọn.</p></div><button className="text-link" type="button" onClick={() => navigate('/facilities')}>Xem tất cả <ArrowIcon /></button></div>{submittedQuery && <div className="search-result-note">Đang hiển thị kết quả cho <strong>“{submittedQuery}”</strong></div>}<div className="facility-grid">{visible.map((f, i) => <FacilityCard key={f.name} facility={f} index={i} />)}</div>{visible.length === 0 && <div className="empty-state">Không tìm thấy cơ sở phù hợp. Hãy thử từ khóa khác.</div>}</div></section>
        <section className="types section" id="types"><div className="container types-layout"><div className="types-image-wrap"><img src="https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?auto=format&fit=crop&w=1300&q=90" alt="Các kho lưu trữ với nhiều kích thước" /><div className="image-caption"><span>SPACE THAT FITS</span><strong>Chọn đúng không gian<br />cho đúng nhu cầu.</strong></div></div><div className="types-content"><div className="eyebrow green">STORAGE TYPES</div><h2>Từ vài chiếc hộp<br />đến cả một căn phòng.</h2><p>Không cần thuê quá nhiều. Chọn loại kho và diện tích vừa đủ với đồ đạc, thời gian và ngân sách của bạn.</p><div className="type-list"><div className="type-item"><span>01</span><div><strong>Kho tiêu chuẩn</strong><small>Phù hợp đồ gia dụng, hồ sơ và vật dụng cá nhân.</small></div><ArrowIcon /></div><div className="type-item"><span>02</span><div><strong>Kho mát / Cool</strong><small>Kiểm soát nhiệt độ cho nhóm hàng cần môi trường ổn định.</small></div><ArrowIcon /></div><div className="type-item"><span>03</span><div><strong>Kho lạnh / Frozen</strong><small>Dành cho nhu cầu lưu trữ đặc thù với điều kiện nhiệt độ phù hợp.</small></div><ArrowIcon /></div></div></div></div></section>
        <section className="about section" id="about"><div className="container about-grid"><div><div className="eyebrow green">ABOUT STORESPACE</div><h2>Lưu trữ đơn giản,<br />quản lý rõ ràng.</h2></div><div className="about-copy"><p>StoreSpace kết nối khách hàng với các cơ sở lưu trữ và hỗ trợ toàn bộ vòng đời thuê kho — từ tìm kiếm, đặt kho, thanh toán đến bàn giao và theo dõi hợp đồng.</p><div className="process-list"><div><b>01</b><span>Chọn cơ sở, loại kho, kích thước và thời gian thuê.</span></div><div><b>02</b><span>Giá, tiền cọc, thanh toán và hợp đồng được theo dõi rõ ràng.</span></div><div><b>03</b><span>Quy trình kiểm tra, bàn giao và quản lý quyền truy cập.</span></div></div></div></div></section>
        <section className="support" id="support"><div className="container"><div className="support-card"><div><div className="eyebrow">NEED HELP?</div><h2>Bạn cần hỗ trợ về kho?</h2><p>Đội ngũ StoreSpace sẵn sàng hỗ trợ thông tin về cơ sở, loại kho, đặt kho và quy trình thuê.</p></div><a className="primary-dark-button" href="mailto:support@storespace.vn">Bắt đầu ngay <ArrowIcon /></a></div></div></section>
      </main>
      <SiteFooter />
    </div>
  )
}

function getRoute() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { type: 'home' }
  if (path === '/login') return { type: 'login' }
  if (path === '/register') return { type: 'register' }
  if (path === '/verify-otp') return { type: 'verify-otp' }
  if (path === '/search') return { type: 'search' }
  if (path === '/facilities') return { type: 'facilities' }
  if (path === '/customer') return { type: 'customer' }
  if (path === '/cart') return { type: 'cart' }

  //Đã cập nhật: Route /staff trong getRoute()
  if (path === '/staff') return { type: 'staff' }
  //Đã thêm: 05/10/2026

  //Đã cập nhật: Route /manager trong getRoute()
  if (path === '/manager') return { type: 'manager' }
  //Đã thêm 05/10/2026

  if (path === '/admin') return { type: 'admin' }
  if (path === '/business') return { type: 'business' }

  if (path.startsWith('/facilities/')) {
    const parts = path.replace('/facilities/', '').split('/')
    const facility = facilities.find(item => createSlug(item.name) === parts[0])
    if (!facility) return { type: 'home' }
    if (parts[1] === 'unit' && parts[2]) {
      const unit = getStorageUnits(facility.name).find(item => item.id.toLowerCase() === parts[2].toLowerCase())
      if (!unit) return { type: 'home' }

      //Đã cập nhật: Đường dẫn kho đã thuê thì quay về trang cơ sở
      if (!unit.available) {
        let activeHold = null
        try {
          activeHold = JSON.parse(sessionStorage.getItem(ACTIVE_BOOKING_HOLD_KEY) || 'null')
        } catch {
          activeHold = null
        }
        const user = getCurrentUser()
        const ownsActiveBooking = parts[3] === 'booking' &&
          activeHold?.unitNumber?.toLowerCase() === unit.id.toLowerCase() &&
          activeHold?.email?.toLowerCase() === user?.email?.toLowerCase() &&
          Date.parse(activeHold?.expiresAt) > Date.now()
        if (!ownsActiveBooking) return { type: 'detail', facility }
      }
      //Đã thêm: 05/10/2026


      if (parts[3] === 'booking') return { type: 'booking', facility, unit }
      return { type: 'unit-detail', facility, unit }
    }
    return { type: 'detail', facility }
  }
  return { type: 'home' }
}

//Đã cập nhật: Component chuyển hướng
function CartRoute() {
  const dialog = useDialog()
  return (
    <div className="app">
      <SiteHeader />
      <CartPage
        facilities={facilities}
        getStorageUnits={getStorageUnits}
        navigate={navigate}
        getCurrentUser={getCurrentUser}
        getUnitPath={getUnitPath}
        onRequireLogin={() => promptLoginForCart(dialog)}
      />
      <SiteFooter />
    </div>
  )
}

function RedirectTo({ path }) {
  useEffect(() => { navigate(path) }, [path])
  return null
}

function BookingLoginRedirect({ facility, unit }) {
  useEffect(() => {
    const bookingPath = getBookingPath(facility, unit)
    saveBookingDraft({
      facilityId: facility.facilityId,
      facilityName: facility.name,
      unitId: unit.id,
      unitType: unit.type,
      unitSize: unit.size,
      path: bookingPath
    })
    navigate(withNext('/login', bookingPath))
  }, [facility.facilityId, unit.id])
  return null
}
// Đã thêm: 05/10/2026

function formatDashboardDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

function mapCustomerReservation(reservation) {
  const start = new Date(`${String(reservation.startDate).slice(0, 10)}T00:00:00`)
  const end = new Date(`${String(reservation.endDate).slice(0, 10)}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const totalDays = Math.max(1, Math.floor((end - start) / 86400000) + 1)
  const elapsedDays = Math.max(0, Math.floor((today - start) / 86400000))
  const statusLabels = {
    'Pending Deposit': 'Chờ thanh toán cọc',
    Paid: 'Đã thanh toán cọc · Chờ phân kho',
    Confirmed: 'Đã phân kho · Chờ bàn giao',
    'Handed Over': 'Đang thuê',
    Cancelled: 'Đã hủy',
    Expired: 'Hết hạn giữ kho · Cần đặt lại'
  }
  const monthlyPrice = Number(reservation.monthlyPrice || 0)

  return {
    ...reservation,
    unitId: reservation.unitNumber,
    type: reservation.unitType,
    size: reservation.size || '',
    price: `${new Intl.NumberFormat('vi-VN').format(monthlyPrice)}đ/tháng`,
    startDate: formatDashboardDate(reservation.startDate),
    endDate: formatDashboardDate(reservation.endDate),
    totalDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    progress: Math.min(100, Math.round((Math.min(totalDays, elapsedDays) / totalDays) * 100)),
    statusLabel: reservation.status === 'Confirmed' && reservation.contractStatus === 'Pending Signature'
      ? 'Đã duyệt · Chờ ký hợp đồng'
      : reservation.status === 'Confirmed' && reservation.contractStatus === 'Signed'
        ? 'Đã ký hợp đồng · Chờ nhận kho'
        : statusLabels[reservation.status] || reservation.status
  }
}

function CustomerPage() {
  const [reservations, setReservations] = useState(null)
  const [error, setError] = useState('')
  const user = getCurrentUser()

  const loadReservations = () => {
    if (!user?.email) {
      setError('Phiên đăng nhập không có email. Hãy đăng nhập lại.')
      setReservations([])
      return
    }
    setError('')
    setReservations(null)
    apiGet(`/api/reservation/customer/${encodeURIComponent(user.email)}`)
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('Backend trả về danh sách đặt chỗ không hợp lệ.')
        }
        setReservations(data.map(mapCustomerReservation))
      })
      .catch(loadError => {
        setError(loadError.message)
        setReservations([])
      })
  }

  useEffect(() => {
    loadReservations()
  }, [user?.email])

  if (reservations === null) {
    return <div style={{ padding: 40 }}>Đang tải dữ liệu đặt chỗ từ backend...</div>
  }
  if (error) {
    return (
      <main className="listing-page">
        <div className="container">
          <div className="empty-state">
            <h1>Không tải được dữ liệu khách hàng</h1>
            <p>{error}</p>
            <button className="dashboard-primary-btn" type="button" onClick={loadReservations}>Thử lại</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <CustomerDashboard
      facilities={facilities}
      storageUnits={getAllStorageUnits()}
      customerRental={null}
      customerRentals={reservations}
      getCurrentUser={getCurrentUser}
      navigate={navigate}
      currentUserKey={CURRENT_USER_KEY}
    />
  )
}

function Router() {
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    const onPop = () => {
      setRoute(getRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.type, route.facility?.name, route.unit?.id])
  // Làm mới danh mục kho định kỳ (trước đây 2 giây/lần, gây tải nặng và render lại liên tục).
  // - 15 giây/lần, tạm dừng khi tab bị ẩn.
  // - Làm mới ngay khi quay lại tab hoặc chuyển trang.
  // - Chỉ render lại khi dữ liệu thực sự thay đổi.
  useEffect(() => {
    let refreshing = false
    let lastRefresh = Date.now()
    const refresh = async () => {
      if (refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        const changed = await loadDataFromApi()
        lastRefresh = Date.now()
        if (changed) setRoute(getRoute())
      } catch (error) {
        console.error('Không thể làm mới trạng thái danh mục.', error)
      } finally {
        refreshing = false
      }
    }
    const timerId = window.setInterval(refresh, CATALOG_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 3000) refresh()
    }
    const onNavigate = () => { if (Date.now() - lastRefresh > 3000) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('popstate', onNavigate)
    return () => {
      window.clearInterval(timerId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('popstate', onNavigate)
    }
  }, [])

  if (route.type === 'login') return <LoginPage />
  if (route.type === 'register') return <RegisterPage />
  if (route.type === 'verify-otp') return <VerifyOtpPage />
  if (route.type === 'search') return <SearchPage />
  if (route.type === 'facilities') return <FacilitiesPage />
  if (route.type === 'cart') {
    const user = getCurrentUser()
    if (user && user.role !== 'customer') return <RedirectTo path={roleHome(user.role)} />
    return <CartRoute />
  }

  // Chỉ đúng role mới được vào khu Admin / Business
  if (route.type === 'admin') {
    return getCurrentUser()?.role === 'SYSTEM_ADMIN' ? <Admin /> : <RedirectTo path="/login" />
  }
  if (route.type === 'business') {
    return getCurrentUser()?.role === 'BUSINESS_OPERATIONS'
      ? <BusinessOperations currentUser={getCurrentUser()} navigate={navigate} currentUserKey={CURRENT_USER_KEY} />
      : <RedirectTo path="/login" />
  }

  //Đã cập nhật: Router render StaffPortal
  if (route.type === 'staff') {
    const user = getCurrentUser()
    return user?.role === 'FACILITY_STAFF'
      ? <StaffPortal embedded currentUser={user} navigate={navigate} currentUserKey={CURRENT_USER_KEY} />
      : <RedirectTo path={user ? roleHome(user.role) : '/login'} />
  }
  //Đã thêm: 05/10/2026

  //Đã cập nhật: Router render FacilityManagerDashboard
  if (route.type === 'manager') {
    const user = getCurrentUser()
    return user?.role === 'FACILITY_MANAGER'
      ? <FacilityManagerDashboard embedded currentUser={user} navigate={navigate} currentUserKey={CURRENT_USER_KEY} />
      : <RedirectTo path={user ? roleHome(user.role) : '/login'} />
  }
  //Đã thêm: 05/10/2026

  if (route.type === 'customer') {

    //Đã cập nhật: Staff vào /customer thì chuyển sang /staff
    { const r = getCurrentUser()?.role; if (r && r !== 'customer') return <RedirectTo path={roleHome(r)} /> }
    //Đã thêm: 05/10/2026

    return getCurrentUser()
      ? <CustomerPage />
      : <RedirectTo path="/login" />
  }
  if (route.type === 'booking') {
    const user = getCurrentUser()
    // Mở thẳng link đặt kho khi chưa đăng nhập: lưu bản nháp rồi chuyển sang đăng nhập.
    if (!user) return <BookingLoginRedirect facility={route.facility} unit={route.unit} />
    // Tài khoản nhân viên / quản lý không đặt kho được: quay về trang chi tiết kho.
    if (user.role !== 'customer') return <RedirectTo path={getUnitPath(route.facility, route.unit)} />
    return <BookingPage facility={route.facility} unit={route.unit} />
  }
  if (route.type === 'unit-detail') return <UnitDetailPage facility={route.facility} unit={route.unit} />
  if (route.type === 'detail') return <FacilityDetailPage facility={route.facility} />
  return <HomePage />
}

const CATALOG_REFRESH_MS = 15000
let lastCatalogSignature = ''

/* Tải danh mục cơ sở + kho. Trả về true nếu dữ liệu khác lần tải trước. */
async function loadDataFromApi() {
  const catalog = await apiGet('/api/catalog/state')
  if (!Array.isArray(catalog?.facilities) || !Array.isArray(catalog?.units)) {
    throw new Error('Backend trả về dữ liệu danh mục không hợp lệ.')
  }
  const signature = JSON.stringify(catalog)
  if (signature === lastCatalogSignature) return false
  lastCatalogSignature = signature

  const nextFacilities = catalog.facilities.map((item, index) => {
    const facilityId = Number(item.id)
    if (!Number.isInteger(facilityId)) {
      throw new Error(`Mã cơ sở "${item.id}" từ backend không hợp lệ.`)
    }
    const units = catalog.units.filter(unit => Number(unit.facility) === facilityId)
    return {
      id: String(facilityId),
      facilityId,
      name: item.name,
      location: item.address,
      image: facilityImages[index % facilityImages.length],
      available: units.filter(unit => unit.status?.toLowerCase() === 'available').length,
      total: units.length,
      depositPercent: item.depositPercent,
      tags: [],
      typeKeys: getCatalogTypeKeys(units),
      district: getFacilityDistrict({ districtName: item.district, address: item.address, name: item.name })
    }
  })

  const nextStorageUnits = {}
  for (const item of catalog.facilities) {
    const key = String(item.id)
    const facility = nextFacilities.find(candidate => candidate.id === key)
    if (!facility) continue
    nextStorageUnits[facility.name] = catalog.units
      .filter(unit => String(unit.facility) === key)
      .map(unit => ({
        id: unit.id,
        unitId: unit.unitId,
        facilityId: facility.facilityId,
        unitTypeId: unit.unitTypeId,
        unitSizeId: unit.unitSizeId,
        type: unit.type,
        size: unit.size,
        price: Number(unit.price),
        status: unit.status,
        available: unit.status?.toLowerCase() === 'available'
      }))
  }

  facilities.splice(0, facilities.length, ...nextFacilities)
  Object.keys(storageUnits).forEach(key => delete storageUnits[key])
  Object.assign(storageUnits, nextStorageUnits)
  return true
}

function ApiStartupError({ error }) {
  return (
    <main className="listing-page">
      <div className="container">
        <div className="empty-state">
          <h1>Không thể tải dữ liệu từ backend</h1>
          <p>{error.message}</p>
          <button className="dashboard-primary-btn" type="button" onClick={() => window.location.reload()}>
            Thử kết nối lại
          </button>
        </div>
      </div>
    </main>
  )
}

const root = createRoot(document.getElementById('root'))
loadDataFromApi()
  .then(() => root.render(<DialogProvider><Router /></DialogProvider>))
  .catch(error => {
    console.error('Không tải được danh mục từ backend.', error)
    root.render(<ApiStartupError error={error} />)
  })
