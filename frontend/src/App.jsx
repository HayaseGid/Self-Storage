import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { apiPost, apiGet } from './api'
import CustomerDashboard from './CustomerAccount'

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
              <button type="button" onClick={() => go('/search?type=Kho%20tiêu%20chuẩn')}>Kho tiêu chuẩn</button>
              <button type="button" onClick={() => go('/search?type=Kho%20mát%20%2F%20Cool')}>Kho mát / Cool</button>
              <button type="button" onClick={() => go('/search?type=Kho%20lạnh%20%2F%20Frozen')}>Kho lạnh / Frozen</button>
              <button type="button" onClick={() => go('/search?type=Kho%20lớn')}>Kho lớn</button>
            </div>
          )}
        </nav>
        <div className="header-actions">
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
                    <button type="button" onClick={() => go('/search?type=Kho%20tiêu%20chuẩn')}>Kho tiêu chuẩn</button>
                    <button type="button" onClick={() => go('/search?type=Kho%20mát%20%2F%20Cool')}>Kho mát / Cool</button>
                    <button type="button" onClick={() => go('/search?type=Kho%20lạnh%20%2F%20Frozen')}>Kho lạnh / Frozen</button>
                    <button type="button" onClick={() => go('/search?type=Kho%20lớn')}>Kho lớn</button>
                  </div>
                )}
                <button className="mobile-menu-item" type="button" onClick={() => go('/facilities')}>⌖ <span>Cơ sở lưu trữ</span></button>
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

function FacilityCard({ facility, index }) {
  return (
    <article className="facility-card">
      <button className="facility-card-link" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)} aria-label={`Xem chi tiết ${facility.name}`}>
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
          <div className="tag-row">{facility.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="facility-footer"><span>{facility.available} / {facility.total} kho còn trống</span><span className="facility-arrow"><ArrowIcon /></span></div>
        </div>
      </button>
    </article>
  )
}

function FacilitiesPage() {
  return (
    <div className="app">
      <SiteHeader />
      <main className="listing-page">
        <div className="container">
          <div className="listing-heading"><div className="eyebrow">OUR FACILITIES</div><h1>Các cơ sở lưu trữ</h1><p>Chọn cơ sở phù hợp để xem các kho đang có sẵn.</p></div>
          <div className="facility-grid">{facilities.map((f, i) => <FacilityCard key={f.name} facility={f} index={i} />)}</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function FacilityDetailPage({ facility }) {

  //Đã cập nhật: Trang cơ sở lấy trạng thái kho đã cập nhật
  const units = getStorageUnits(facility.name)
  //Đã thêm: 05/10/2026


  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [size, setSize] = useState('all')
  const [availability, setAvailability] = useState('all')
  const [priceRange, setPriceRange] = useState('all')
  const types = [...new Set(units.map(unit => unit.type))]
  const sizes = [...new Set(units.map(unit => unit.size))]
  const filteredUnits = units.filter(unit => {
    const q = query.trim().toLowerCase()
    const price = unit.price
    const matchSearch = !q || `${unit.id} ${unit.type} ${unit.size}`.toLowerCase().includes(q)
    const matchType = type === 'all' || unit.type === type
    const matchSize = size === 'all' || unit.size === size
    const matchAvailability = availability === 'all' || (availability === 'available' ? unit.available : !unit.available)
    const matchPrice = priceRange === 'all' || (priceRange === 'under1' ? price < 1000000 : priceRange === '1to2' ? price >= 1000000 && price <= 2000000 : price > 2000000)
    return matchSearch && matchType && matchSize && matchAvailability && matchPrice
  })
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
              <div className="tag-row">{facility.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
              <p>Hiện có <strong>{facility.available}</strong> kho đang sẵn sàng cho thuê.</p>
            </div>
          </div>
          <div className="units-heading">
            <div><div className="eyebrow">AVAILABLE UNITS</div><h2>Các kho tại {facility.name}</h2></div>
            <span>{filteredUnits.length} / {units.length} kho phù hợp</span>
          </div>
          <div className="unit-filter-panel">
            <div className="unit-filter-search"><SearchIcon /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm mã kho, loại kho, diện tích..." /></div>
            <div className="unit-filter-row">
              <select value={type} onChange={e => setType(e.target.value)}><option value="all">Tất cả loại kho</option>{types.map(item => <option key={item} value={item}>{item}</option>)}</select>
              <select value={size} onChange={e => setSize(e.target.value)}><option value="all">Tất cả diện tích</option>{sizes.map(item => <option key={item} value={item}>{item}</option>)}</select>
              <select value={availability} onChange={e => setAvailability(e.target.value)}><option value="all">Tất cả tình trạng</option><option value="available">Còn trống</option><option value="rented">Không khả dụng</option></select>
              <select value={priceRange} onChange={e => setPriceRange(e.target.value)}><option value="all">Tất cả mức giá</option><option value="under1">Dưới 1 triệu</option><option value="1to2">1 - 2 triệu</option><option value="over2">Trên 2 triệu</option></select>
              <button type="button" className="filter-reset" onClick={resetFilters}>Đặt lại</button>
            </div>
          </div>
          <div className="unit-grid">
            {filteredUnits.map(unit => (
              <article className="unit-card" key={unit.id}>
                <div className="unit-card-top"><span className="unit-id">{unit.id}</span><span className={unit.available ? 'unit-status available' : 'unit-status'}>{unit.available ? 'Còn trống' : unit.status?.toLowerCase() === 'booking' ? 'Booking · Đang giữ chỗ' : 'Không khả dụng'}</span></div>
                <h3>{unit.type}</h3>
                <div className="unit-info"><span>Diện tích</span><strong>{unit.size}</strong></div>
                <div className="unit-info"><span>Giá thuê</span><strong>{formatMoney(unit.price)}/tháng</strong></div>
                <button className="unit-button" type="button" disabled={!unit.available} onClick={() => unit.available && navigate(`/facilities/${createSlug(facility.name)}/unit/${unit.id}`)}>{unit.available ? 'Xem kho' : 'Không khả dụng'}{unit.available && <ArrowIcon />}</button>
              </article>
            ))}
          </div>
          {filteredUnits.length === 0 && <div className="empty-state unit-empty-state">Không tìm thấy kho phù hợp với bộ lọc.</div>}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function UnitDetailPage({ facility, unit }) {
  return (
    <div className="app">
      <SiteHeader />
      <main className="unit-detail-page">
        <div className="container">
          <button className="back-link" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)}>← Quay lại {facility.name}</button>
          <div className="unit-detail-layout">
            <div className="unit-detail-image"><img src={facility.image} alt={unit.id} /><span className="unit-detail-status">● Còn trống</span></div>
            <div className="unit-detail-content">
              <span className="customer-eyebrow">STORAGE UNIT</span>
              <h1>{unit.id}</h1>
              <h2>{unit.type}</h2>
              <p className="unit-detail-location"><PinIcon /> {facility.name} · {facility.location}</p>
              <div className="unit-detail-price"><small>Giá thuê</small><strong>{formatMoney(unit.price)}/tháng</strong></div>
              <div className="unit-detail-info-grid">
                <div><small>Diện tích</small><strong>{unit.size}</strong></div>
                <div><small>Tình trạng</small><strong className="available-text">Còn trống</strong></div>
                <div><small>An ninh</small><strong>24/7</strong></div>
                <div><small>Ra vào</small><strong>Access Card</strong></div>
              </div>
              <div className="unit-detail-features"><div><span>✓</span>Camera giám sát 24/7</div><div><span>✓</span>Kiểm soát ra vào</div><div><span>✓</span>Hỗ trợ khách hàng</div><div><span>✓</span>Giá thuê minh bạch</div></div>
              <div className="unit-detail-actions">
                <button className="dashboard-primary-btn" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}/unit/${unit.id}/booking`)}>Đặt kho này <ArrowIcon /></button>
                <button className="dashboard-secondary-btn" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)}>Xem các kho khác</button>
              </div>
            </div>
          </div>
          <section className="unit-detail-description"><span className="customer-eyebrow">ABOUT THIS UNIT</span><h2>Thông tin về kho</h2><p>{unit.type} tại {facility.name} phù hợp cho nhu cầu lưu trữ cá nhân, hồ sơ, đồ gia dụng và các vật dụng cần không gian riêng biệt. Kho được quản lý và kiểm soát ra vào theo tiêu chuẩn của StoreSpace.</p></section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}

function BookingPage({ facility, unit }) {
  const [step, setStep] = useState(1)
  const [availableUnits, setAvailableUnits] = useState([])
  const [selectedUnitNumber, setSelectedUnitNumber] = useState(unit.id)

  const [startDay, setStartDay] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [startYear, setStartYear] = useState('')

  const [duration, setDuration] = useState(1)
  const [paymentMode, setPaymentMode] = useState('cycle')
  const [paymentCycle, setPaymentCycle] = useState(1)

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
  const deposit = booking?.deposit ?? Math.round(totalRent * (facility.depositPercent ?? 20) / 100)

  const years = Array.from(
    { length: 6 },
    (_, index) => new Date().getFullYear() + index
  )

  const months = Array.from({ length: 12 }, (_, index) => index + 1)
  const days = Array.from({ length: 31 }, (_, index) => index + 1)

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

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const isValidStartDate =
    !!startDate && startDate.getTime() >= today.getTime()

  const canConfirm =
    !!startDate &&
    isValidStartDate &&
    duration >= 1 &&
    duration <= 12

  const handleConfirmBooking = async () => {
    setError('')
    setAvailableUnits([])

    if (!facility.facilityId || !unit.unitTypeId) {
      setError('Thiếu mã cơ sở hoặc loại kho từ dữ liệu backend.')
      return
    }

    if (!startDate) {
      setError('Vui lòng chọn đầy đủ ngày, tháng và năm bắt đầu thuê.')
      return
    }

    if (!isValidStartDate) {
      setError('Ngày bắt đầu thuê không được ở trong quá khứ.')
      return
    }

    const currentUser = getCurrentUser()

    if (!currentUser) {
      setError('Vui lòng đăng nhập trước khi đặt kho.')
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
          setError(`Kho ${unit.id} đã có đặt chỗ trùng kỳ thuê. Hệ thống đã hiển thị các kho còn trống cùng loại; hãy chọn kho muốn đặt và xác nhận lại.`)
        } else {
          setError('Hiện không có kho cùng loại còn trống trong toàn bộ kỳ thuê đã chọn. Hãy chọn ngày khác hoặc quay lại chọn loại kho khác.')
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
      setBooking(bookingData)
      setDepositPaid(false)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDepositPaid = async () => {
    if (!booking) return

    if (Date.parse(booking.depositExpiresAt) <= Date.now()) {
      setDepositSecondsRemaining(0)
      setError('Thời gian giữ kho 10 phút đã hết. Vui lòng tạo đặt chỗ mới.')
      return
    }

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
      setError(err.message)
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
                    : `Tiền cọc ${booking?.depositPercent ?? facility.depositPercent}% được tính theo chính sách của cơ sở.`}
              </p>
            </div>

            <div className="booking-step-indicator">
              <span className="active">1</span>
              <i />
              <span className={step >= 2 ? 'active' : ''}>2</span>
            </div>
          </div>

          {error && (
            <div className="auth-message error booking-page-message">
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
                  <img src={facility.image} alt={facility.name} />
                </div>

                <div className="booking-unit-summary-body">
                  <span className="storage-facility-name">{facility.name}</span>
                  <h2>{selectedUnit.id}</h2>
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
                  <label>Ngày bắt đầu thuê</label>

                  <div className="date-select-grid">
                    <select
                      value={startDay}
                      onChange={e => {
                        setStartDay(e.target.value)
                        setError('')
                      }}
                    >
                      <option value="">Ngày</option>
                      {days.map(day => (
                        <option key={day} value={day}>
                          {String(day).padStart(2, '0')}
                        </option>
                      ))}
                    </select>

                    <select
                      value={startMonth}
                      onChange={e => {
                        setStartMonth(e.target.value)
                        setError('')
                      }}
                    >
                      <option value="">Tháng</option>
                      {months.map(month => (
                        <option key={month} value={month}>
                          {String(month).padStart(2, '0')}
                        </option>
                      ))}
                    </select>

                    <select
                      value={startYear}
                      onChange={e => {
                        setStartYear(e.target.value)
                        setError('')
                      }}
                    >
                      <option value="">Năm</option>
                      {years.map(year => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>

                  {startDate && (
                    <div className="selected-date-preview">
                      Ngày bắt đầu:
                      <strong>{formatDate(startDate)}</strong>
                    </div>
                  )}
                </div>

                <div className="booking-large-field">
                  <label>Thời gian thuê</label>

                  <div className="duration-picker">
                    <button
                      type="button"
                      onClick={() => handleDurationChange(duration - 1)}
                      aria-label="Giảm thời gian thuê"
                    >
                      −
                    </button>

                    <div className="duration-value">
                      <strong>{duration}</strong>
                      <span>tháng</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDurationChange(duration + 1)}
                      aria-label="Tăng thời gian thuê"
                    >
                      +
                    </button>
                  </div>

                  <div className="duration-slider-wrap">
                    <input
                      type="range"
                      min="1"
                      max="12"
                      value={duration}
                      onChange={e => handleDurationChange(Number(e.target.value))}
                    />

                    <div className="duration-slider-label">
                      <span>1 tháng</span>
                      <span>12 tháng</span>
                    </div>
                  </div>
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
                      <small>{facility.depositPercent ?? 20}% tổng giá thuê</small>
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
                      Bước 3: chỉ sau khi được duyệt, bạn mới thanh toán tiền thuê theo hình thức đã chọn.
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
                    disabled={!canConfirm || isSubmitting}
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
function SearchPage() {
  const params = new URLSearchParams(window.location.search)
  const initial = params.get('q') || ''
  const type = params.get('type') || ''
  const [query, setQuery] = useState(initial)
  const results = facilities.filter(f => {
    const unitText = getStorageUnits(f.name)
      .map(unit => `${unit.id} ${unit.type} ${unit.size}`)
      .join(' ')
    const text = `${f.name} ${f.location} ${unitText}`.toLowerCase()
    const keywordOK = !query || text.includes(query.trim().toLowerCase())

    //Đã cập nhật: Trang tìm kiếm lấy trạng thái kho đã cập nhật
    const typeOK = !type || getStorageUnits(f.name).some(u => u.type.toLowerCase() === type.toLowerCase())
    //Đã thêm: 05/10/2026

    return keywordOK && typeOK
  })
  const search = e => {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
  }
  return (
    <div className="app">
      <SiteHeader />
      <main className="listing-page">
        <div className="container">
          <div className="listing-heading"><div className="eyebrow">SEARCH STORAGE</div><h1>Tìm kho phù hợp với bạn.</h1><p>Tìm kiếm cơ sở, vị trí hoặc loại kho bạn đang cần.</p></div>
          <form className="search-box listing-search" onSubmit={search}><div className="search-input-wrap"><SearchIcon />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kho, cơ sở, loại kho..." />
          </div>
            <button type="submit">Tìm kho</button></form>
          {type && <div className="search-result-note">Loại kho: <strong>{type}</strong></div>}
          <div className="listing-top"><h2>{results.length} cơ sở phù hợp</h2></div>
          <div className="facility-grid">{results.map((f, i) => <FacilityCard key={f.name} facility={f} index={i} />)}</div>
          {results.length === 0 && <div className="empty-state">Không tìm thấy cơ sở phù hợp.</div>}
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

function LoginPage() {
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
      const data = await apiPost('/api/auth/login', { email: email.trim(), password })

      const user = {
        name: data.fullName,
        email: data.email,
        role: mapBackendRole(data.roleName),
        userId: data.userID
      }
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
      setSuccess(`Đăng nhập thành công. Chào ${user.name}!`)
      setTimeout(() => navigate(roleHome(user.role)), 500)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }
  return (
    <AuthShell title="Chào mừng trở lại" subtitle="Đăng nhập để tiếp tục quản lý việc thuê kho của bạn.">
      <form className="auth-form" onSubmit={login}>{error && <div className="auth-message error">{error}</div>}{success && <div className="auth-message success">{success}</div>}<label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label><label>Mật khẩu<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Nhập mật khẩu" required /></label><button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}</button></form>
      <p className="auth-switch">Chưa có tài khoản? <button className="inline-link" type="button" onClick={() => navigate('/register')}>Đăng ký ngay</button></p>
      <button className="back-home" type="button" onClick={() => navigate('/')}>← Quay lại trang chủ</button>
    </AuthShell>
  )
}

function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const register = async e => {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Mật khẩu phải có ít nhất 6 ký tự.')
    if (password !== confirm) return setError('Mật khẩu xác nhận không khớp.')
    try {
      await apiPost('/api/auth/register', {
        fullName: name.trim(),
        email: email.trim(),
        password,
        roleName: 'Storage Customer'
      })
      navigate('/login')
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <AuthShell title="Tạo tài khoản" subtitle="Đăng ký tài khoản StoreSpace để bắt đầu hành trình thuê kho.">
      <form className="auth-form" onSubmit={register}>{error && <div className="auth-message error">{error}</div>}<label>Họ và tên<input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nguyễn Văn A" required /></label>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <label>Mật khẩu<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" required /></label>
        <label>Xác nhận mật khẩu<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Nhập lại mật khẩu" required /></label>
        <button className="auth-submit" type="submit">Tạo tài khoản</button></form>
      <p className="auth-switch">Đã có tài khoản? <button className="inline-link" type="button" onClick={() => navigate('/login')}>Đăng nhập</button></p>
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
  if (path === '/search') return { type: 'search' }
  if (path === '/facilities') return { type: 'facilities' }
  if (path === '/customer') return { type: 'customer' }

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
function RedirectTo({ path }) {
  useEffect(() => { navigate(path) }, [path])
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
    statusLabel: statusLabels[reservation.status] || reservation.status
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
  useEffect(() => {
    let refreshing = false
    const timerId = window.setInterval(async () => {
      if (refreshing) return
      refreshing = true
      try {
        await loadDataFromApi()
        setRoute(getRoute())
      } catch (error) {
        console.error('Không thể làm mới trạng thái danh mục.', error)
      } finally {
        refreshing = false
      }
    }, 2000)
    return () => window.clearInterval(timerId)
  }, [])

  if (route.type === 'login') return <LoginPage />
  if (route.type === 'register') return <RegisterPage />
  if (route.type === 'search') return <SearchPage />
  if (route.type === 'facilities') return <FacilitiesPage />

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
  if (route.type === 'booking') return <BookingPage facility={route.facility} unit={route.unit} />
  if (route.type === 'unit-detail') return <UnitDetailPage facility={route.facility} unit={route.unit} />
  if (route.type === 'detail') return <FacilityDetailPage facility={route.facility} />
  return <HomePage />
}

async function loadDataFromApi() {
  const catalog = await apiGet('/api/catalog/state')
  if (!Array.isArray(catalog?.facilities) || !Array.isArray(catalog?.units)) {
    throw new Error('Backend trả về dữ liệu danh mục không hợp lệ.')
  }

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
      tags: []
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
  .then(() => root.render(<Router />))
  .catch(error => {
    console.error('Không tải được danh mục từ backend.', error)
    root.render(<ApiStartupError error={error} />)
  })
