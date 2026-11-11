/**
 * ======================================================================
 * FILE: src/App.jsx  —  ĐIỂM KHỞI ĐỘNG (ENTRY) + BỘ ĐỊNH TUYẾN + CÁC TRANG CÔNG KHAI / ĐĂNG NHẬP / ĐẶT KHO
 * index.html nạp file này (<script src="/src/App.jsx">). Cuối file: tải danh mục rồi render
 * <DialogProvider><Router/><DemoClockWidget/></DialogProvider> vào #root.
 * Nội dung chính:
 * - Tiện ích chung: điều hướng (navigate bằng History API), phiên đăng nhập (localStorage 'storespace_current_user'),
 *   ánh xạ vai trò backend -> frontend (mapBackendRole) và trang làm việc theo vai trò (roleHome).
 * - Trang công khai: Trang chủ, Danh sách cơ sở (theo khu vực + bản đồ), Chi tiết cơ sở, Chi tiết kho (xem 3D),
 *   Tìm kiếm, Đặt 1 kho (BookingPage), Giỏ kho (CartRoute -> pages/customer/CartPage).
 * - Xác thực: Đăng nhập, Đăng ký, Xác thực OTP.
 * - Router: chọn trang theo URL và vai trò; các dashboard theo vai trò nằm trong thư mục pages/.
 * Luồng API trong file:
 *   GET  /api/catalog/state                         (CatalogController) -> danh mục cơ sở + kho (tải lúc khởi động, làm mới 15 giây/lần)
 *   GET  /api/catalog/availability?facilityId=&unitTypeId=&startDate=&months=  -> kho còn trống trong kỳ thuê
 *   POST /api/reservation                           (ReservationController) -> tạo đơn giữ kho (Pending Deposit)
 *   POST /api/payment/confirm                       (PaymentController)     -> thanh toán cọc mô phỏng (chế độ demo)
 *   POST /api/vnpay/create                          (qua api/vnpay.js)      -> thanh toán cọc VNPay
 *   POST /api/reservation-confirmations/mine        (qua services/afterDeposit.js) -> xác nhận đơn + tạo hợp đồng
 *   POST /api/auth/login                            (AuthController)        -> đăng nhập, nhận JWT
 *   POST /api/auth/register/start | resend | verify (qua api/otpService.js) -> đăng ký bằng OTP
 *   GET  /api/customer-reservations/mine            (CustomerReservationsController; 404 thì dùng
 *        GET /api/reservation/customer/{email})     -> đơn của khách (trang /customer và chuông thông báo)
 *   GET  /api/facility-locations                    (qua FacilityMap.jsx)   -> tọa độ cơ sở cho bản đồ
 * Bảng route: / · /login · /register · /verify-otp · /search · /facilities · /facilities/{slug}
 *   · /facilities/{slug}/unit/{mã kho} · .../booking · /cart · /payment-result · /customer · /staff · /manager
 *   · /admin · /business
 * ======================================================================
 */
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/styles.css'
import { apiPost, apiGet } from './api/api'
import { DialogProvider, useDialog } from './components/common/Dialog'
import RentalCalendar from './components/common/RentalCalendar'
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
} from './features/unit/unitTypes'
import './features/unit/unitTypes.css'
import { getFacilityDistrict, groupFacilitiesByDistrict } from './utils/districts'
import { RENTAL_TERMS } from './services/storageRules'
import { effectiveMonthly, holdMinutesFor, quote, setCatalogPricing } from './services/pricing'
import FacilityMap, { directionsUrl, useFacilityLocations } from './features/facility/FacilityMap'
import CartPage from './pages/customer/CartPage'
import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from './services/afterDeposit'
import PaymentResultPage from './pages/payment/PaymentResultPage'
import DepositConfirm from './features/payment/DepositConfirm'
import FacilityFloorPlan from './features/facility/FacilityFloorPlan'
import Unit3DViewer from './features/unit/Unit3DViewer'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './api/vnpay'
import DemoClockWidget from './demoClock/DemoClockWidget'
import { getTodayDate } from './demoClock/demoClock'
import { CART_LIMIT, addToCart, isInCart, useCart } from './store/cart'
import HeaderNotificationBell, { HeaderPendingDepositBar } from './features/notification/HeaderNotificationBell' // [THÊM] chuông thông báo + nhắc đơn chưa đặt cọc
import {
  clearBookingDraft,
  draftMatchesUnit,
  getSafeNextPath,
  loadBookingDraft,
  saveBookingDraft,
  withNext
} from './store/bookingDraft'
import CustomerDashboard from './pages/customer/CustomerAccount'
import { startRegistration, resendRegistrationOtp, verifyRegistrationOtp } from './api/otpService'
import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from './features/booking/HandoverChoice'

import StaffPortal from './pages/staff/FacilityStaffAccount'
//Đã thêm: 04/10/2026

//Đã cập nhật: Thêm cho FqcilityManager
import FacilityManagerDashboard from './pages/manager/FacilityManagerAccount'
//Đã thêm: 05/10/2026

// Thêm: System Admin & Business Operations
import Admin from './pages/admin/AdminAccount'
import BusinessOperations from './pages/business/BusinessOperations'

// Đường dẫn trang làm việc theo role
/**
 * Trả về đường dẫn trang làm việc theo vai trò (SYSTEM_ADMIN -> /admin, BUSINESS_OPERATIONS -> /business,
 * FACILITY_MANAGER -> /manager, FACILITY_STAFF -> /staff, còn lại -> /customer).
 */
function roleHome(role) {
  switch (role) {
    case 'SYSTEM_ADMIN': return '/admin'
    case 'BUSINESS_OPERATIONS': return '/business'
    case 'FACILITY_MANAGER': return '/manager'
    case 'FACILITY_STAFF': return '/staff'
    default: return '/customer'
  }
}

/**
 * Đổi tên vai trò backend trả về khi đăng nhập ("Storage Customer", "Facility Staff"...) thành mã vai trò frontend.
 * Vai trò lạ -> ném lỗi.
 */
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

/**
 * Tạo slug URL từ tên cơ sở (bỏ dấu, chữ thường, nối bằng gạch ngang), vd "Kho Quận 7" -> "kho-quan-7".
 */
function createSlug(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/**
 * Điều hướng trong app (SPA): đổi URL bằng history.pushState rồi phát sự kiện popstate để Router vẽ lại.
 */
function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Đọc người dùng đang đăng nhập từ localStorage (lỗi -> null).
 */
function getCurrentUser() {
  try {
    const user = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || 'null')
    return user
  } catch {
    return null
  }
}

/**
 * Lấy danh sách kho của 1 cơ sở (theo tên) từ danh mục đã tải.
 */
function getStorageUnits(facilityName) {
  return storageUnits[facilityName] || []
}

/**
 * Lấy toàn bộ kho của mọi cơ sở (object: tên cơ sở -> danh sách kho).
 */
function getAllStorageUnits() {
  return storageUnits
}

/**
 * Định dạng tiền kiểu Việt Nam kèm "đ".
 */
function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0) + 'đ'
}

/* Các loại kho đang có trong hệ thống (lấy từ dữ liệu thật), theo thứ tự hiển thị. */
/**
 * Các loại kho đang có trong hệ thống (từ dữ liệu thật), theo thứ tự hiển thị UNIT_TYPE_ORDER.
 */
function getCatalogTypeKeys(unitList = Object.values(storageUnits).flat()) {
  const keys = new Set(unitList.map(unit => getUnitTypeKey(unit.type)))
  return UNIT_TYPE_ORDER.filter(key => keys.has(key))
}

/* Nhận cả mã loại mới (?type=climate) lẫn tên cũ (?type=Kho mát / Cool). */
/**
 * Đọc tham số ?type= trên URL: nhận cả mã loại mới (climate) lẫn tên cũ ("Kho mát" / "Cool").
 */
function resolveTypeParam(value) {
  if (!value) return ''
  return UNIT_TYPE_STYLES[value] ? value : getUnitTypeKey(value)
}

/**
 * Đường dẫn trang đặt kho: /facilities/{slug}/unit/{mã kho}/booking.
 */
function getBookingPath(facility, unit) {
  return `/facilities/${createSlug(facility.name)}/unit/${unit.id}/booking`
}

/**
 * Đường dẫn trang chi tiết kho: /facilities/{slug}/unit/{mã kho}.
 */
function getUnitPath(facility, unit) {
  return `/facilities/${createSlug(facility.name)}/unit/${unit.id}`
}

/*
 * Hỏi khách đăng nhập / đăng ký trước khi đặt kho.
 * Thông tin đang chọn được lưu vào bản nháp để khôi phục sau khi đăng nhập.
 */
/**
 * Hỏi khách đăng nhập / đăng ký trước khi đặt kho; lưu lựa chọn hiện tại vào bản nháp (bookingDraft) để khôi phục
 * sau khi đăng nhập, rồi chuyển tới /login hoặc /register kèm ?next=.
 * @returns {Promise<'login'|'register'|null>} lựa chọn của khách.
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
/**
 * Thêm kho vào giỏ hàng (khách chưa đăng nhập vẫn thêm được); báo giỏ đầy / đã có; hỏi "Xem giỏ hàng".
 * Tài khoản không phải khách hàng thì báo không đặt được.
 */
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
    message: `${getUnitTypeStyle(unit.type).label} · ${unit.size} · ${formatMoney(unit.price)}/tháng tại ${facility.name}.\nCác kho cùng cơ sở có thể đặt cùng lúc (mỗi kho một hợp đồng riêng).`,
    dismissValue: null,
    actions: [
      { label: 'Tiếp tục xem kho', value: null, variant: 'secondary' },
      { label: 'Xem giỏ hàng', value: 'cart', variant: 'primary' }
    ]
  })
  if (choice === 'cart') navigate('/cart')
}

/**
 * Hỏi khách đăng nhập / đăng ký để đặt kho từ giỏ hàng (giỏ được giữ nguyên), quay lại /cart sau khi đăng nhập.
 */
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

/**
 * Biểu tượng giỏ hàng (SVG).
 */
function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" /><circle cx="9.5" cy="19.5" r="1.4" /><circle cx="17" cy="19.5" r="1.4" /></svg>
}

/**
 * Báo "Tài khoản này không đặt kho được" (chỉ tài khoản khách hàng mới đặt kho).
 */
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
/**
 * Xác định trang cần chuyển tới sau khi đăng nhập / đăng ký: nhân viên -> trang theo vai trò; khách -> quay lại
 * trang đặt kho đang dở (?next= hoặc bản nháp); kho đó đã hết thì về trang cơ sở kèm thông báo.
 * @returns {{path:string, notice?:object}}
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

/**
 * Component dải thông báo "Bạn đang đặt kho X tại Y..." trên trang đăng nhập/đăng ký, có nút bỏ đặt kho này.
 */
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
/**
 * Hook: bản nháp đặt kho + tham số ?next= dùng chung cho trang đăng nhập và đăng ký.
 * @returns {{draft, nextPath, discard}}
 */
function usePendingBooking() {
  const [draft, setDraft] = useState(() => loadBookingDraft())
  const [nextPath, setNextPath] = useState(() => getSafeNextPath())
  // Bỏ bản nháp đặt kho (và bỏ ?next= nếu trỏ tới trang đặt kho đó).
  const discard = () => {
    if (draft && nextPath === draft.path) setNextPath(null)
    clearBookingDraft()
    setDraft(null)
  }
  return { draft, nextPath, discard }
}

/**
 * Biểu tượng kính lúp (SVG).
 */
function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></svg>
}

/**
 * Biểu tượng mũi tên (SVG).
 */
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>
}

/**
 * Biểu tượng mũi tên xuống (SVG).
 */
function ChevronIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

/**
 * Biểu tượng menu (SVG).
 */
function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
}

/**
 * Biểu tượng ghim vị trí (SVG).
 */
function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

/**
 * Biểu tượng khiên bảo vệ (SVG).
 */
function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.3 8.3-8 10-4.7-1.7-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>
}

/**
 * Biểu tượng ngôi nhà (SVG).
 */
function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-7 8 7" /><path d="M6 9v11h12V9" /><path d="M10 20v-6h4v6" /></svg>
}

/* [THÊM] Danh sách đơn của khách cho chuông thông báo trên header: cùng API + cùng cách lọc / đổi dữ liệu với trang khách (CustomerPage). */
/**
 * Tải danh sách đơn của khách cho chuông thông báo trên header (cùng API, cùng cách lọc với trang khách).
 * API: GET /api/customer-reservations/mine (404 -> GET /api/reservation/customer/{email})
 * @returns {Promise<object[]>} đơn đã map bằng mapCustomerReservation, bỏ đơn bỏ dở.
 */
function fetchCustomerRentals() {
  const user = getCurrentUser()
  if (!user?.email) return Promise.resolve([])
  return apiGet('/api/customer-reservations/mine')
    .catch(fastError => {
      if (fastError?.status !== 404) throw fastError
      return apiGet(`/api/reservation/customer/${encodeURIComponent(user.email)}`)
    })
    .then(data => {
      if (!Array.isArray(data)) return []
      // Đơn "bỏ dở" cần ẩn: hết hạn giữ kho, hoặc đã hủy khi chưa cọc (không hợp đồng, không hoàn tiền).
      const abandoned = r => r.status === 'Expired' ||
        (r.status === 'Cancelled' && !r.contractId && !(Number(r.refundAmount) > 0))
      return data.filter(r => !abandoned(r)).map(mapCustomerReservation)
    })
}

/**
 * Component header các trang công khai: logo, menu loại kho, cơ sở, tìm kiếm, giỏ hàng, chuông thông báo,
 * đăng nhập / tài khoản / đăng xuất, menu điện thoại, thanh nhắc đơn chưa đặt cọc.
 */
function SiteHeader() {
  const [storageOpen, setStorageOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileStorageOpen, setMobileStorageOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(getCurrentUser())
  const catalogTypeKeys = getCatalogTypeKeys()
  const cartItems = useCart()
  const showCart = !currentUser || currentUser.role === 'customer'

  // Đóng các menu đang mở rồi điều hướng tới đường dẫn.
  const go = path => {
    setMenuOpen(false)
    setStorageOpen(false)
    setMobileStorageOpen(false)
    navigate(path)
  }

  // Đăng xuất: xóa phiên khỏi localStorage và về trang chủ.
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
          {currentUser?.role === 'customer' && <HeaderNotificationBell user={currentUser} loadRentals={fetchCustomerRentals} navigate={go} />}
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
      {/* [THÊM] Nhắc đơn chưa đặt cọc (khách thoát VNPay giữa chừng) - ẩn ở giỏ hàng / trang đặt kho / kết quả thanh toán vì ở đó đã có đồng hồ riêng */}
      {currentUser?.role === 'customer' && !['/cart', '/payment-result'].includes(window.location.pathname) && !window.location.pathname.includes('/unit/') && (
        <HeaderPendingDepositBar user={currentUser} loadRentals={fetchCustomerRentals} navigate={go} />
      )}
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
                {currentUser?.role === 'customer' && <HeaderNotificationBell variant="menu" user={currentUser} loadRentals={fetchCustomerRentals} navigate={go} />}
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

/**
 * Component chân trang (footer).
 */
function SiteFooter() {
  return <footer className="footer"><div className="container footer-inner"><div className="footer-brand"><span className="footer-mark">S</span><strong>StoreSpace</strong><span>Self-Storage Facility Rental & Management System</span></div><span>© 2026 StoreSpace</span></div></footer>
}

/**
 * Component thẻ cơ sở: ảnh, tên, khu vực, địa chỉ, số kho trống / tổng, các loại kho; bấm để mở trang cơ sở.
 * @param {object} props facility, index, typeKey (loại kho đang lọc, để mở trang cơ sở kèm bộ lọc).
 */
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
/**
 * Danh sách khu vực có cơ sở, kèm số cơ sở và tổng số kho còn trống.
 */
function getDistrictGroups(facilityList = facilities) {
  return groupFacilitiesByDistrict(facilityList).map(group => ({
    ...group,
    availableUnits: group.facilities.reduce((sum, f) => sum + (f.available || 0), 0)
  }))
}

/* Bộ chọn khu vực dạng chip (dùng ở trang chủ, danh sách cơ sở, tìm kiếm). */
/**
 * Component bộ chọn khu vực dạng chip (trang chủ, danh sách cơ sở, tìm kiếm).
 * @param {object} props groups, active, onSelect(slug), showAll, large, label.
 */
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

/* Gộp danh sách cơ sở với tọa độ từ /api/facility-locations để vẽ bản đồ. */
/**
 * Gộp danh sách cơ sở với tọa độ từ /api/facility-locations thành các điểm để vẽ bản đồ.
 */
function toMapPoints(list, locations) {
  return list.map(f => {
    const loc = locations.find(item => Number(item.facilityId) === Number(f.facilityId))
    return {
      id: f.facilityId,
      name: f.name,
      address: f.location || loc?.address,
      latitude: loc?.latitude ?? null,
      longitude: loc?.longitude ?? null,
      available: f.available,
      total: f.total,
      phone: loc?.contactPhone,
      hours: loc?.openingHours,
      facility: f
    }
  })
}

/**
 * Component khối "Bản đồ cơ sở": bản đồ các cơ sở (ẩn/hiện được), số cơ sở có tọa độ, bấm ghim để mở trang cơ sở.
 * API: GET /api/facility-locations (qua useFacilityLocations)
 */
function FacilitiesMapSection({ list }) {
  const { loading, error, locations } = useFacilityLocations()
  const [show, setShow] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const points = toMapPoints(list, locations)
  const mapped = points.filter(p => p.latitude != null && p.longitude != null).length
  return (
    <section className="facility-map-section" aria-label="Bản đồ các cơ sở">
      <div className="facility-map-head">
        <div>
          <h2>Bản đồ cơ sở</h2>
          <p>{loading ? 'Đang tải vị trí...' : error ? `Chưa tải được vị trí: ${error}` : `${mapped}/${points.length} cơ sở có vị trí trên bản đồ · bấm ghim để xem kho hoặc chỉ đường`}</p>
        </div>
        <button type="button" className="facility-map-toggle" onClick={() => setShow(v => !v)}>{show ? 'Ẩn bản đồ' : 'Xem bản đồ'}</button>
      </div>
      {show && !error && (
        <div className="facility-map-layout">
          <FacilityMap points={points} selectedId={selectedId} onOpen={point => navigate(`/facilities/${createSlug(point.name)}`)} />
          <div className="facility-map-list">
            {points.map(point => (
              <button
                key={point.id}
                type="button"
                className={`facility-map-item${selectedId === point.id ? ' active' : ''}${point.latitude == null ? ' no-geo' : ''}`}
                onClick={() => (point.latitude == null ? navigate(`/facilities/${createSlug(point.name)}`) : setSelectedId(point.id))}
              >
                <strong>{point.name}</strong>
                <span>{point.address}</span>
                <em>{point.available} kho trống{point.latitude == null ? ' · chưa có vị trí' : ''}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Component thẻ vị trí cơ sở (địa chỉ, chỉ đường Google Maps, bản đồ 1 điểm).
 */
function FacilityLocationCard({ facility, hideMap = false }) {
  const { error, locations } = useFacilityLocations()
  const [point] = toMapPoints([facility], locations)
  if (error || !point || point.latitude == null) return null
  return (
    <div className={`facility-location-card${hideMap ? ' no-map' : ''}`}>
      {!hideMap && <FacilityMap points={[point]} single height={260} />}
      <div className="facility-location-info">
        <h3>Vị trí cơ sở</h3>
        <p><PinIcon /> {point.address}</p>
        {point.hours && <p>Giờ mở cửa: {point.hours}</p>}
        {point.phone && <p>Điện thoại: {point.phone}</p>}
        <a href={directionsUrl(point)} target="_blank" rel="noopener noreferrer">Chỉ đường (Google Maps)</a>
      </div>
    </div>
  )
}

/**
 * Component trang "Danh sách cơ sở" (/facilities): lọc theo khu vực (?district=), bản đồ, danh sách theo khu vực.
 */
function FacilitiesPage() {
  const district = new URLSearchParams(window.location.search).get('district') || ''
  const groups = getDistrictGroups()
  const activeGroup = groups.find(group => group.slug === district)
  // Chọn khu vực: đổi URL ?district= (bỏ chọn thì về /facilities).
  const selectDistrict = slug => navigate(slug ? `/facilities?district=${slug}` : '/facilities')
  let index = 0
  return (
    <div className="app">
      <SiteHeader />
      <main className="listing-page">
        <div className="container">
          <div className="listing-heading"><div className="eyebrow">OUR FACILITIES</div><h1>Các cơ sở lưu trữ</h1><p>Chọn khu vực gần bạn, rồi chọn cơ sở để xem các kho đang có sẵn.</p></div>
          <DistrictPicker groups={groups} active={activeGroup ? district : ''} onSelect={selectDistrict} />
          {facilities.length > 0 && <FacilitiesMapSection list={activeGroup ? activeGroup.facilities : facilities} />}
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

/**
 * Component thẻ kho trong trang cơ sở: ảnh minh họa loại kho, mã kho, size, giá, trạng thái, nút Đặt / Thêm vào giỏ.
 */
function UnitCard({ facility, unit }) {
  const dialog = useDialog()
  useCart() // vẽ lại khi giỏ hàng thay đổi
  const inCart = isInCart(facility.facilityId, unit.id)
  const style = getUnitTypeStyle(unit.type)
  const sizeInfo = parseUnitSize(unit.size)
  const isBooking = unit.status?.toLowerCase() === 'booking'
  const statusLabel = unit.available ? 'Còn trống' : isBooking ? 'Đang giữ chỗ' : 'Không khả dụng'
  // Bấm thẻ kho (còn trống) để mở trang chi tiết kho.
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

/**
 * Component trang chi tiết cơ sở: thông tin, vị trí, sơ đồ kho (FacilityFloorPlan), bộ lọc kho (từ khóa, loại, size,
 * trạng thái, giá), danh sách thẻ kho (kho trống lên trước).
 */
function FacilityDetailPage({ facility }) {
  const units = getStorageUnits(facility.name)
  const { locations: facilityLocations } = useFacilityLocations()
  const [facilityPoint] = toMapPoints([facility], facilityLocations)
  const hasUnitsMap = Boolean(units.length && facilityPoint && facilityPoint.latitude != null && facilityPoint.longitude != null)
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
  // Xóa toàn bộ bộ lọc kho.
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
          <FacilityLocationCard facility={facility} hideMap={hasUnitsMap} />
          <FacilityFloorPlan
            facility={facility}
            units={units}
            point={facilityPoint}
            highlightIds={filteredUnits.length === units.length ? null : new Set(filteredUnits.map(unit => unit.id))}
            onOpenDetail={unit => navigate(getUnitPath(facility, unit))}
            onBook={unit => navigate(getBookingPath(facility, unit))}
          />
          <div className="cart-note" role="note" style={{ margin: '18px 0', padding: '14px 16px', borderRadius: 12, background: '#eef5ff', border: '1px solid #c9dcf7' }}>
            <strong>Cần kho lớn hơn các kho đang có, hoặc kích thước đặc biệt?</strong>{' '}
            Kho quá lớn không bán sẵn mà nhận theo đơn đặt riêng: liên hệ cơ sở để được báo giá
            {facilityPoint?.phone ? <> qua số <a href={`tel:${String(facilityPoint.phone).replace(/\s/g, '')}`}>{facilityPoint.phone}</a> hoặc</> : ''}{' '}
            qua email <a href={`mailto:support@storespace.vn?subject=${encodeURIComponent(`Đặt kho theo yêu cầu - ${facility.name}`)}`}>support@storespace.vn</a>.
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

/**
 * Component trang chi tiết kho: thông tin, giá, đặc điểm loại kho, xem 3D, nút Đặt kho / Thêm vào giỏ.
 */
function UnitDetailPage({ facility, unit }) {
  const dialog = useDialog()
  useCart()
  const [show3D, setShow3D] = useState(false)

  // Bấm "Đặt kho": chưa đăng nhập thì hỏi đăng nhập (lưu bản nháp); không phải khách hàng thì báo; ngược lại mở trang đặt kho.
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
                <button className="dashboard-secondary-btn" type="button" onClick={() => setShow3D(true)}>Xem kho 3D</button>
                <button className="dashboard-secondary-btn" type="button" onClick={() => navigate(`/facilities/${createSlug(facility.name)}`)}>Xem các kho khác</button>
              </div>
            </div>
          </div>
          {show3D && <Unit3DViewer unit={unit} facilityName={facility.name} onClose={() => setShow3D(false)} onBook={unit.available ? () => { setShow3D(false); handleBookClick() } : null} />}
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

/**
 * Khôi phục form đặt kho từ bản nháp (nếu đúng kho): ngày bắt đầu (bỏ nếu đã qua), số tháng, hình thức trả, chu kỳ.
 * @returns {object|null}
 */
function getRestoredBookingForm(facility, unit) {
  const draft = loadBookingDraft()
  if (!draftMatchesUnit(draft, facility.facilityId, unit.id)) return null

  const form = { restored: false, pastDate: false }
  if (/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate || '')) {
    const [year, month, day] = draft.startDate.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    // [THỜI GIAN THỰC]:
    // const today = new Date()
    // today.setHours(0, 0, 0, 0)
    // [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock
    const today = getTodayDate()
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

/**
 * Component trang đặt 1 kho (2 bước):
 *  1. Chọn ngày bắt đầu, số tháng, hình thức trả, cách nhận kho -> kiểm tra kho còn trống trong kỳ -> tạo đơn giữ kho.
 *  2. Đếm ngược giờ giữ kho, tick xác nhận cọc -> thanh toán VNPay (hoặc mô phỏng) -> xác nhận đơn -> tab Hợp đồng.
 * API: GET /api/catalog/availability, POST /api/reservation, POST /api/vnpay/create, POST /api/payment/confirm,
 *      POST /api/reservation-confirmations/mine
 * @param {object} props facility, unit.
 */
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
  const [handoverMethod, setHandoverMethod] = useState(HANDOVER_METHODS.InPerson) // 'InPerson' | 'Online'
  const [appointmentSlot, setAppointmentSlot] = useState('') // '08:00' | '10:00' | '12:00' | '14:00'
  const [paymentCycle, setPaymentCycle] = useState(restoredForm?.paymentCycle || 1)
  const [showRestoredNote, setShowRestoredNote] = useState(Boolean(restoredForm?.restored || restoredForm?.pastDate))

  const [error, setError] = useState('')
  const [booking, setBooking] = useState(null)
  const [depositPaid, setDepositPaid] = useState(false)
  const [depositAgreed, setDepositAgreed] = useState(false)
  const [depositSecondsRemaining, setDepositSecondsRemaining] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (step !== 2 || booking?.status !== 'Pending Deposit' || !booking.depositExpiresAt) {
      setDepositSecondsRemaining(null)
      return
    }

    // Cập nhật số giây còn lại của thời gian giữ kho chờ đặt cọc.
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
  // Giá xem trước theo đúng công thức backend: giảm giá theo gói (ContractType) và số tháng cọc của cơ sở.
  // Sau khi tạo đặt chỗ thì dùng số backend trả về.
  const priceQuote = quote(monthlyPrice, totalMonths, facility.facilityId)
  const totalRent = priceQuote.rent
  const depositMonths = priceQuote.depositMonths
  const holdMinutes = holdMinutesFor(facility.facilityId)
  const deposit = booking?.deposit ?? priceQuote.deposit

  const years = Array.from(
    { length: 6 },
    (_, index) => new Date().getFullYear() + index
  )


  // Định dạng tiền kiểu Việt Nam kèm "đ".
  const formatPrice = value =>
    new Intl.NumberFormat('vi-VN').format(value) + 'đ'

  // Định dạng Date thành 'dd/MM/yyyy' (không hợp lệ -> '—').
  const formatDate = date => {
    if (!date || Number.isNaN(date.getTime())) return '—'

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
  }

  // Định dạng Date thành 'YYYY-MM-DD' để gửi API.
  const toApiDate = date => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Ghép ngày/tháng/năm khách chọn thành Date; ngày không tồn tại (vd 31/02) -> null.
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

  // Tính ngày kết thúc thuê = ngày bắt đầu + số tháng - 1 ngày (tháng đích ngắn hơn thì lấy ngày cuối tháng).
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
  // Tính ngày kết thúc dự kiến cho một gói bất kỳ (cùng quy tắc với calculateEndDate).
  const getEndDateFor = months => {
    if (!startDate) return null
    const targetMonth = startDate.getMonth() + months
    const targetLastDay = new Date(startDate.getFullYear(), targetMonth + 1, 0).getDate()
    const date = new Date(startDate.getFullYear(), targetMonth, Math.min(startDate.getDate(), targetLastDay))
    date.setDate(date.getDate() - 1)
    return date
  }

  // [THỜI GIAN THỰC]:
  // const today = new Date()
  // today.setHours(0, 0, 0, 0)
  // [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock
  const today = getTodayDate()
  today.setHours(0, 0, 0, 0)

  const isValidStartDate =
    !!startDate && startDate.getTime() >= today.getTime()

  const canConfirm =
    !!startDate &&
    isValidStartDate &&
    RENTAL_TERMS.includes(duration)

  // Hiện lỗi cả ở đầu trang và bằng pop-up để khách không bỏ sót.
  // Hiện lỗi đặt kho cả ở đầu trang và bằng pop-up.
  const showBookingError = (message, title = 'Chưa thể đặt kho', tone = 'danger') => {
    setError(message)
    return dialog.alert({ tone, title, message })
  }

  // Lấy các lựa chọn hiện tại của form (ngày bắt đầu, số tháng, hình thức trả...) để lưu vào bản nháp.
  const currentFormDraft = () => ({
    startDate: startDate ? toApiDate(startDate) : undefined,
    duration: totalMonths,
    paymentMode,
    paymentCycle: Number(paymentCycle)
  })

  /**
   * "Xác nhận đặt kho": kiểm tra đăng nhập/vai trò/ngày/khung giờ; kiểm tra kho còn trống trong kỳ (không còn thì gợi ý
   * kho cùng loại khác); tạo đơn giữ kho; lưu thông tin giữ kho vào sessionStorage; chuyển sang bước đặt cọc.
   * API: GET /api/catalog/availability?...  rồi  POST /api/reservation
   */
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

    const handoverError = handoverChoiceError(handoverMethod, appointmentSlot, startDate)
    if (handoverError) {
      await showBookingError(handoverError, 'Chưa chọn khung giờ nhận kho', 'warning')
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
        months: totalMonths,
        // Khớp CK_Reservation_PaymentPlan: trả theo tháng / trả 1 lần (tiền thuê đóng sau khi nhận kho)
        paymentPlan: paymentMode === 'full' ? 'Upfront' : 'Monthly',
        handoverMethod,
        appointmentSlot: handoverMethod === HANDOVER_METHODS.Online ? null : appointmentSlot
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
        paymentCycle: paymentMode === 'cycle' ? 1 : totalMonths,
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

  /**
   * Thanh toán tiền cọc: hết giờ giữ kho thì báo; mặc định chuyển sang VNPay; chế độ demo cho thanh toán mô phỏng
   * rồi xác nhận đơn + tạo hợp đồng và mở tab Hợp đồng.
   * API: POST /api/vnpay/create | POST /api/payment/confirm + POST /api/reservation-confirmations/mine
   */
  const handleDepositPaid = async () => {
    if (!booking || !depositAgreed) return

    if (Date.parse(booking.depositExpiresAt) <= Date.now()) {
      setDepositSecondsRemaining(0)
      await showBookingError(
        `Thời gian giữ kho ${holdMinutes} phút đã hết nên kho đã được trả lại. Vui lòng tạo đặt chỗ mới.`,
        'Hết thời gian giữ kho',
        'warning'
      )
      return
    }

    // Thanh toán thật qua VNPay (sandbox): chuyển sang trang VNPay, VNPay chuyển về /payment-result.
    if (!SIMULATED_PAYMENT_ENABLED || !(await dialog.confirm({
      tone: 'info',
      title: 'Chọn cách thanh toán',
      message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
      confirmLabel: 'Mô phỏng',
      cancelLabel: 'Qua VNPay'
    }))) {
      setIsSubmitting(true)
      try {
        await startVnPayPayment([booking.reservationId], { amount: booking.deposit, count: 1, label: booking.id })
      } catch (err) {
        setIsSubmitting(false)
        await showBookingError(err.message, 'Chưa mở được trang thanh toán VNPay')
      }
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
      // Không còn bước Manager duyệt: xác nhận đơn + tạo hợp đồng ngay, rồi mở tab Hợp đồng để ký.
      const confirmation = await confirmAfterDeposit([booking.reservationId])
      setIsSubmitting(false)
      await announceDepositSuccess(dialog, {
        count: 1,
        amountText: formatPrice(booking.deposit),
        failed: Boolean(confirmation.error) || confirmation.failed?.length > 0
      })
      openCustomerSection(navigate, 'contract')
    } catch (err) {
      await showBookingError(err.message, 'Chưa ghi nhận được tiền cọc')
    } finally {
      setIsSubmitting(false)
    }
  }

  const paymentCycleOptions = [1, 3, 6, 12].filter(
    value => value <= totalMonths
  )

  // Đổi số tháng thuê (giới hạn 1..12); nếu chu kỳ thanh toán lớn hơn số tháng thì đưa về 1.
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
                    : `Tiền cọc bằng ${depositMonths} tháng tiền thuê, hoàn lại khi trả kho nếu không phát sinh chi phí.`}
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
                          <span className="duration-package-total">{formatPrice(quote(monthlyPrice, months, facility.facilityId).rent)}</span>
                          <span className="duration-package-end">{packageEnd ? `Đến ${formatDate(packageEnd)}` : DURATION_PACKAGE_NOTES[months]}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="duration-note">
                    Hợp đồng thuê mới áp dụng gói <strong>6 tháng</strong> hoặc <strong>12 tháng</strong>. Tiền cọc <strong>{depositMonths} tháng tiền thuê</strong> ({formatPrice(priceQuote.deposit)}), hoàn lại khi trả kho. Gia hạn hợp đồng trong mục Hợp đồng khi sắp hết hạn.
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
                      <strong>Trả theo tháng</strong>
                      <small>Sau khi nhận kho đóng tiền tháng đầu, các tháng sau đóng trước ngày đầu mỗi kỳ.</small>
                    </button>

                    <button
                      type="button"
                      className={paymentMode === 'full' ? 'payment-mode-card active' : 'payment-mode-card'}
                      onClick={() => setPaymentMode('full')}
                    >
                      <span className="payment-mode-icon">✓</span>
                      <strong>Trả 1 lần</strong>
                      <small>Sau khi nhận kho đóng toàn bộ tiền thuê của cả kỳ thuê.</small>
                    </button>
                  </div>
                </div>

                <HandoverChoice
                  method={handoverMethod}
                  onMethodChange={setHandoverMethod}
                  slot={appointmentSlot}
                  onSlotChange={setAppointmentSlot}
                  startDate={startDate}
                />

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
                      {paymentMode === 'cycle' ? 'Trả theo tháng' : 'Trả 1 lần'}
                    </strong>
                  </div>

                  <div className="price-divider" />

                  <div>
                    <span>Tổng tiền thuê ({formatPrice(monthlyPrice)} × {totalMonths} tháng)</span>
                    <strong className="main-price">{formatPrice(totalRent)}</strong>
                  </div>
                  {priceQuote.discountPercent > 0 && (
                    <div className="discount-row">
                      <span>Giảm giá gói {totalMonths} tháng ({priceQuote.discountPercent}%)</span>
                      <strong>−{formatPrice(priceQuote.saving)}</strong>
                    </div>
                  )}
                  <div>
                    <span>Đóng sau khi nhận kho</span>
                    <strong>{formatPrice(paymentMode === 'full' ? totalRent : (priceQuote.monthly ?? monthlyPrice))}{paymentMode === 'full' ? ' (cả kỳ)' : ' (tháng đầu)'}</strong>
                  </div>

                  <div className="price-divider" />

                  <div className="deposit-row">
                    <div>
                      <span>Cần thanh toán khi đặt kho: tiền cọc</span>
                      <small>{depositMonths} tháng tiền thuê · hoàn lại khi trả kho</small>
                    </div>
                    <strong className="deposit-price main-price">{formatPrice(deposit)}</strong>
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
                      Bước 2: đặt cọc xong, kho được giữ cho bạn và bạn ký hợp đồng online ngay.
                    </p>
                    <p>
                      {handoverMethod === HANDOVER_METHODS.Online
                        ? `Bước 3: ngày bắt đầu, nhân viên bàn giao online. ${ONLINE_HANDOVER_NOTE}`
                        : `Bước 3: cơ sở phân nhân viên bàn giao, bạn đến nhận kho và chìa khóa vào ngày bắt đầu${appointmentSlot ? ` (khung ${slotLabel(appointmentSlot)})` : ''}.`}
                    </p>
                    <p>
                      Bước 4: thanh toán tiền thuê theo hình thức đã chọn.
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
                    <span>Thanh toán an toàn qua cổng VNPay</span>
                  </div>

                  <ol className="vnpay-steps" aria-label="Các bước thanh toán qua VNPay">
                    <li><strong>Bấm “Thanh toán cọc qua VNPay”</strong><span>Trình duyệt chuyển sang trang VNPay (môi trường thử nghiệm).</span></li>
                    <li><strong>Chọn cách trả</strong><span>Quét mã QR, thẻ ATM nội địa hoặc ví điện tử. Mã QR hiện trên trang VNPay.</span></li>
                    <li><strong>Tự quay lại StoreSpace</strong><span>Hệ thống xác nhận tiền cọc, bạn ký hợp đồng ngay.</span></li>
                  </ol>

                  {!depositPaid && (
                    <DepositConfirm
                      rows={[
                        ['Mã đặt chỗ', booking.id],
                        ['Cơ sở', booking.facility],
                        ['Kho', `${booking.unitId} · ${booking.size || ''}`],
                        ['Thời gian thuê', `${booking.startDate} → ${booking.endDate} (${booking.durationMonths} tháng)`]
                      ]}
                      lines={[
                        ['Giá thuê / tháng', Number(booking.monthlyPrice || 0)],
                        [`Tổng tiền thuê (${booking.durationMonths} tháng, đóng sau khi nhận kho)`, Number(booking.totalRent || 0)],
                        [`Tiền cọc (${depositMonths} tháng tiền thuê)`, Number(booking.deposit || 0)]
                      ]}
                      amount={booking.deposit}
                      onChange={setDepositAgreed}
                    />
                  )}

                  <button
                    className="dashboard-primary-btn full"
                    type="button"
                    onClick={handleDepositPaid}
                    disabled={depositPaid || isSubmitting || depositSecondsRemaining === 0 || !depositAgreed}
                  >
                    {depositPaid
                      ? 'Đã ghi nhận tiền cọc'
                      : depositSecondsRemaining === 0
                        ? 'Đã hết thời gian giữ kho'
                        : isSubmitting
                          ? 'Đang chuyển sang VNPay...'
                          : 'Thanh toán cọc qua VNPay'}
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
                        {booking.paymentMode === 'cycle' ? 'Trả theo tháng' : 'Trả 1 lần'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="payment-warning">
                <strong>Lưu ý:</strong>
                <span>
                  Tiền cọc chỉ được ghi nhận khi VNPay xác nhận giao dịch và hệ thống kiểm tra đúng chữ ký, số tiền. Không đóng trình duyệt khi đang ở trang VNPay.
                </span>
              </div>

              <div className="deposit-status">
                <div className="deposit-status-dot" />
                <div>
                  <strong>
                    {depositPaid
                      ? 'Đã ghi nhận tiền cọc — vui lòng ký hợp đồng'
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

/**
 * Component trang tìm kiếm (/search): lọc kho theo từ khóa, khu vực, loại kho, hạng size, khoảng giá, chỉ kho trống;
 * bộ lọc lưu trên URL; hiện số kết quả cho từng lựa chọn.
 */
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

  // Tạo URL /search?... từ bộ lọc hiện tại cộng các thay đổi.
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
  // Điều hướng tới URL tìm kiếm với bộ lọc mới.
  const go = changes => navigate(buildUrl(changes))

  // Lọc tới từng kho theo mọi tiêu chí khách đã chọn.
  const keyword = filters.q.toLowerCase()
  const priceRule = PRICE_FILTERS.find(item => item.value === filters.price)
  // Kiểm tra 1 kho có khớp các bộ lọc không (ignore = bỏ qua 1 bộ lọc để đếm số lượng cho lựa chọn đó).
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
  // Đếm số kho khớp các bộ lọc còn lại và điều kiện predicate (hiện số trên từng chip lọc).
  const countWith = (ignore, predicate) => facilities.reduce((n, facility) =>
    n + getStorageUnits(facility.name).filter(unit => unitMatches(facility, unit, ignore) && predicate(facility, unit)).length, 0)
  const hasFilter = filters.q || filters.type || activeDistrict || filters.size || filters.price

  // Gửi ô tìm kiếm: cập nhật từ khóa trên URL.
  const submit = e => {
    e.preventDefault()
    go({ q: query.trim() })
  }

  // Vẽ 1 chip lọc (đang chọn, nhãn, số lượng).
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

/**
 * Component khung chung cho trang đăng nhập / đăng ký / OTP (logo, tiêu đề, phụ đề, nội dung).
 */
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

/**
 * Đăng nhập và lưu phiên vào localStorage ({ name, email, role, userId, accessCode, token, tokenExpiresAt }).
 * API: POST /api/auth/login  body { email, password }
 * @returns {Promise<object>} người dùng đã lưu.
 */
async function loginAndStoreUser(email, password) {
  const data = await apiPost('/api/auth/login', { email, password })
  const user = {
    name: data.fullName,
    email: data.email,
    role: mapBackendRole(data.roleName),
    userId: data.userID,
    accessCode: data.accessCode,
    accessCodeStatus: data.accessCodeStatus,
    token: data.token,
    tokenExpiresAt: data.tokenExpiresAt
  }
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  return user
}

/* Chuyển trang sau khi đăng nhập; nếu kho trong bản nháp đã hết thì báo bằng pop-up. */
/**
 * Chuyển trang sau khi đăng nhập (resolvePostAuthPath); nếu kho trong bản nháp đã hết thì báo bằng pop-up trước.
 */
async function goAfterAuth(dialog, user, nextPath) {
  const { path, notice } = resolvePostAuthPath(user, nextPath)
  if (notice) await dialog.alert(notice)
  navigate(path)
}

/**
 * Component trang đăng nhập (/login).
 */
function LoginPage() {
  const dialog = useDialog()
  const { draft, nextPath, discard } = usePendingBooking()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Gửi form đăng nhập: gọi loginAndStoreUser, báo thành công rồi chuyển trang.
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

/**
 * Component trang đăng ký (/register): họ tên, giới tính, ngày sinh, SĐT, email, mật khẩu.
 */
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

  /**
   * Gửi form đăng ký: kiểm tra dữ liệu, gọi backend tạo bản đăng ký + gửi OTP, lưu email + thời hạn vào sessionStorage
   * (không lưu mật khẩu hay mã OTP), chuyển sang /verify-otp.
   * API: POST /api/auth/register/start (qua startRegistration)
   */
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

      // Backend lưu thông tin đăng ký (mật khẩu đã băm), tạo mã OTP và gửi email.
      // Trình duyệt chỉ giữ email + thời hạn để đếm ngược, KHÔNG giữ mật khẩu hay mã OTP.
      const { expiresAt, resendAvailableAt } = await startRegistration({
        fullName,
        email: trimmedEmail,
        password,
        phoneNumber: phoneNumber.trim() || null
      })

      sessionStorage.setItem('storespace_register_pending', JSON.stringify({
        fullName,
        email: trimmedEmail,
        expiresAt,
        resendAvailableAt,
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

/**
 * Component trang nhập mã OTP (/verify-otp): đếm ngược hạn mã và thời gian được gửi lại, xác thực, gửi lại mã, đổi email.
 */
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

  // Đọc phiên đăng ký đang chờ từ sessionStorage.
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

    // Cập nhật số giây còn lại của mã OTP và của thời gian chờ gửi lại.
    const update = () => {
      setSecondsRemaining(Math.max(0, Math.ceil((Number(pending.expiresAt) - Date.now()) / 1000)))
      setResendSecondsRemaining(Math.max(0, Math.ceil((Number(pending.resendAvailableAt || 0) - Date.now()) / 1000)))
    }

    update()
    const timerId = window.setInterval(update, 1000)
    return () => window.clearInterval(timerId)
  }, [pending])

  // Xóa phiên đăng ký đang chờ khỏi sessionStorage.
  const clearPending = () => {
    sessionStorage.removeItem('storespace_register_pending')
  }

  // Định dạng số giây thành "mm:ss".
  const formatCountdown = totalSeconds => {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  /**
   * Xác thực mã OTP (6 chữ số, chưa hết hạn); đúng thì tài khoản được tạo và chuyển sang đăng nhập.
   * API: POST /api/auth/register/verify (qua verifyRegistrationOtp)
   */
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

    setIsSubmitting(true)
    try {
      // Backend so mã, đếm số lần sai và tạo tài khoản khi đúng mã.
      await verifyRegistrationOtp(pending.email, normalizedOtp)

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

  /**
   * Gửi lại mã OTP mới (khi hết thời gian chờ) và cập nhật thời hạn.
   * API: POST /api/auth/register/resend (qua resendRegistrationOtp)
   */
  const resendOtp = async () => {
    if (!pending || resendSecondsRemaining > 0 || isSubmitting) return

    setError('')
    setSuccess('')
    setIsSubmitting(true)

    try {
      const { expiresAt, resendAvailableAt } = await resendRegistrationOtp(pending.email)

      const updated = { ...pending, expiresAt, resendAvailableAt }

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

  // Bỏ phiên đăng ký hiện tại và quay lại trang đăng ký để đổi email.
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

/**
 * Component trang chủ: ô tìm kiếm, số kho trống, loại kho, khu vực, danh sách cơ sở, bản đồ.
 */
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
  // Gửi ô tìm kiếm trang chủ: lọc danh sách cơ sở và cuộn tới phần cơ sở.
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
        <section className="facilities section" id="facilities"><div className="container"><div className="section-heading"><div><div className="eyebrow green">OUR FACILITIES</div><h2>Cơ sở lưu trữ</h2><p>Mỗi cơ sở có nhiều loại kho và kích thước để bạn lựa chọn.</p></div><button className="text-link" type="button" onClick={() => navigate('/facilities')}>Xem tất cả <ArrowIcon /></button></div>{submittedQuery && <div className="search-result-note">Đang hiển thị kết quả cho <strong>“{submittedQuery}”</strong></div>}<div className="facility-grid">{visible.map((f, i) => <FacilityCard key={f.name} facility={f} index={i} />)}</div>{visible.length === 0 && <div className="empty-state">Không tìm thấy cơ sở phù hợp. Hãy thử từ khóa khác.</div>}{facilities.length > 0 && <FacilitiesMapSection list={visible.length ? visible : facilities} />}</div></section>
        <section className="types section" id="types"><div className="container types-layout"><div className="types-image-wrap"><img src="https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?auto=format&fit=crop&w=1300&q=90" alt="Các kho lưu trữ với nhiều kích thước" /><div className="image-caption"><span>SPACE THAT FITS</span><strong>Chọn đúng không gian<br />cho đúng nhu cầu.</strong></div></div><div className="types-content"><div className="eyebrow green">STORAGE TYPES</div><h2>Từ vài chiếc hộp<br />đến cả một căn phòng.</h2><p>Không cần thuê quá nhiều. Chọn loại kho và diện tích vừa đủ với đồ đạc, thời gian và ngân sách của bạn.</p><div className="type-list"><div className="type-item"><span>01</span><div><strong>Kho tiêu chuẩn</strong><small>Phù hợp đồ gia dụng, hồ sơ và vật dụng cá nhân.</small></div><ArrowIcon /></div><div className="type-item"><span>02</span><div><strong>Kho mát / Cool</strong><small>Kiểm soát nhiệt độ cho nhóm hàng cần môi trường ổn định.</small></div><ArrowIcon /></div><div className="type-item"><span>03</span><div><strong>Kho lạnh / Frozen</strong><small>Dành cho nhu cầu lưu trữ đặc thù với điều kiện nhiệt độ phù hợp.</small></div><ArrowIcon /></div></div></div></div></section>
        <section className="about section" id="about"><div className="container about-grid"><div><div className="eyebrow green">ABOUT STORESPACE</div><h2>Lưu trữ đơn giản,<br />quản lý rõ ràng.</h2></div><div className="about-copy"><p>StoreSpace kết nối khách hàng với các cơ sở lưu trữ và hỗ trợ toàn bộ vòng đời thuê kho — từ tìm kiếm, đặt kho, thanh toán đến bàn giao và theo dõi hợp đồng.</p><div className="process-list"><div><b>01</b><span>Chọn cơ sở, loại kho, kích thước và thời gian thuê.</span></div><div><b>02</b><span>Giá, tiền cọc, thanh toán và hợp đồng được theo dõi rõ ràng.</span></div><div><b>03</b><span>Quy trình kiểm tra, bàn giao và quản lý quyền truy cập.</span></div></div></div></div></section>
        <section className="support" id="support"><div className="container"><div className="support-card"><div><div className="eyebrow">NEED HELP?</div><h2>Bạn cần hỗ trợ về kho?</h2><p>Đội ngũ StoreSpace sẵn sàng hỗ trợ thông tin về cơ sở, loại kho, đặt kho và quy trình thuê.</p></div><a className="primary-dark-button" href="mailto:support@storespace.vn">Bắt đầu ngay <ArrowIcon /></a></div></div></section>
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * Phân tích URL hiện tại thành route { type, facility?, unit? }. Kho đã có người thuê thì về trang cơ sở,
 * trừ khi chính khách đang giữ kho đó ở bước đặt cọc (thông tin giữ kho trong sessionStorage).
 */
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
  if (path === '/payment-result') return { type: 'payment-result' }

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
/**
 * Component route /cart: hiển thị CartPage với các hàm dùng chung của App.
 */
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

/**
 * Component chuyển hướng tới đường dẫn khác ngay khi hiển thị.
 */
function RedirectTo({ path }) {
  useEffect(() => { navigate(path) }, [path])
  return null
}

/**
 * Component chuyển hướng tới đăng nhập khi khách chưa đăng nhập mở trang đặt kho (lưu bản nháp trước).
 */
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

/**
 * Đổi ngày 'YYYY-MM-DD' thành 'dd/MM/yyyy' để hiển thị trên dashboard khách.
 */
function formatDashboardDate(value) {
  if (!value) return '—'
  const [year, month, day] = String(value).slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/**
 * Chuẩn hóa 1 đơn của khách từ backend cho trang khách: nhãn trạng thái tiếng Việt, ngày hiển thị, tiến độ sử dụng,
 * số ngày còn lại, tiền thuê/cọc, kho, hợp đồng, chữ ký, hoàn tiền, gia hạn, mã truy cập...
 */
function mapCustomerReservation(reservation) {
  const start = new Date(`${String(reservation.startDate).slice(0, 10)}T00:00:00`)
  const end = new Date(`${String(reservation.endDate).slice(0, 10)}T00:00:00`)
  const today = getTodayDate()
  const totalDays = Math.max(1, Math.floor((end - start) / 86400000) + 1)
  const elapsedDays = Math.max(0, Math.floor((today - start) / 86400000))
  const statusLabels = {
    'Pending Deposit': 'Chờ thanh toán cọc',
    Paid: 'Đã thanh toán cọc · Đang tạo hợp đồng',
    Confirmed: 'Đã cọc · Chờ ký hợp đồng',
    'Handed Over': 'Đang thuê',
    Completed: 'Đã trả kho',
    Cancelled: 'Đã hủy',
    Expired: 'Hết hạn giữ kho · Cần đặt lại'
  }
  const monthlyPrice = Number(reservation.monthlyPrice || 0)
  // Backend mới dùng "Pending Payment"; giao diện khách vẫn dùng mã "Pending Deposit".
  const status = reservation.status === 'Pending Payment' ? 'Pending Deposit' : reservation.status
  // Một đơn (một hợp đồng) có thể gồm nhiều kho: bổ sung loại, kích thước, giá từng kho từ danh mục.
  const facilityUnits = getStorageUnits(reservation.facility) || []
  const unitNumbers = Array.isArray(reservation.unitNumbers) && reservation.unitNumbers.length
    ? reservation.unitNumbers
    : String(reservation.unitNumber || '').split(',').map(x => x.trim()).filter(Boolean)
  const units = unitNumbers.map(number => {
    const unit = facilityUnits.find(item => item.id === number)
    return {
      number,
      type: unit?.type || (unitNumbers.length === 1 ? reservation.unitType : ''),
      size: unit?.size || (unitNumbers.length === 1 ? reservation.size : ''),
      listPrice: unit ? Number(unit.price) : null,
      monthlyPrice: unit ? effectiveMonthly(unit.price, reservation.months) : (unitNumbers.length === 1 ? monthlyPrice : null)
    }
  })

  // Đơn gia hạn (mã GH-...) đang chờ thanh toán: số tiền phải trả ngay là tiền thuê tháng đầu + cọc bổ sung, không phải tiền cọc.
  const renewalPending = reservation.isRenewal && status === 'Pending Deposit' && reservation.amountDueNow != null
  const renewalToSign = reservation.isRenewal && status === 'Handed Over' && reservation.contractStatus === 'Pending Signature'

  return {
    ...reservation,
    ...(renewalPending ? { depositAmount: Number(reservation.amountDueNow) } : {}),
    status,
    units,
    unitId: reservation.unitNumber,
    type: reservation.unitType,
    size: reservation.size || '',
    price: `${new Intl.NumberFormat('vi-VN').format(monthlyPrice)}đ/tháng`,
    startDate: formatDashboardDate(reservation.startDate),
    endDate: formatDashboardDate(reservation.endDate),
    totalDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
    progress: Math.min(100, Math.round((Math.min(totalDays, elapsedDays) / totalDays) * 100)),
    statusLabel: status === 'Cancelled' && reservation.refundAmount > 0
      ? `Đã hủy · ${reservation.refundStatus === 'Completed' ? 'Đã hoàn' : 'Đang hoàn'} ${new Intl.NumberFormat('vi-VN').format(reservation.refundAmount)}đ`
      : renewalPending
      ? 'Gia hạn · Chờ thanh toán'
      : renewalToSign
        ? 'Đang thuê · Chờ ký phụ lục gia hạn'
        : status === 'Handed Over' && reservation.startRentPaid === false
          ? 'Đang thuê · Cần đóng tiền thuê'
        : status === 'Confirmed' && reservation.contractStatus === 'Pending Signature'
      ? 'Đã cọc · Chờ ký hợp đồng'
      : status === 'Confirmed' && reservation.contractStatus === 'Signed'
        ? 'Đã ký hợp đồng · Chờ nhận kho'
        : statusLabels[status] || status
  }
}

/**
 * Component route /customer: tải đơn của khách rồi hiển thị CustomerDashboard.
 */
function CustomerPage() {
  const [reservations, setReservations] = useState(null)
  const [error, setError] = useState('')
  const user = getCurrentUser()

  /**
   * Tải đơn của khách (bỏ đơn bỏ dở); silent = true thì tải ngầm và giữ dữ liệu cũ khi lỗi.
   * API: GET /api/customer-reservations/mine (404 -> GET /api/reservation/customer/{email})
   */
  const loadReservations = ({ silent = false } = {}) => {
    if (!user?.email) {
      setError('Phiên đăng nhập không có email. Hãy đăng nhập lại.')
      setReservations([])
      return
    }
    setError('')
    if (!silent) setReservations(null)
    // API nhanh (CustomerReservationsController.cs). Backend chưa có file đó (404) thì dùng API cũ.
    apiGet('/api/customer-reservations/mine')
      .catch(fastError => {
        if (fastError?.status !== 404) throw fastError
        return apiGet(`/api/reservation/customer/${encodeURIComponent(user.email)}`)
      })
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('Backend trả về danh sách đặt chỗ không hợp lệ.')
        }
        // Ẩn đơn bỏ dở ở bước đặt cọc: hết hạn giữ kho, hoặc đã hủy khi chưa cọc (không hợp đồng, không hoàn tiền)
        // Đơn "bỏ dở" cần ẩn: hết hạn giữ kho, hoặc đã hủy khi chưa cọc (không hợp đồng, không hoàn tiền).
        const abandoned = r => r.status === 'Expired' ||
          (r.status === 'Cancelled' && !r.contractId && !(Number(r.refundAmount) > 0))
        setReservations(data.filter(r => !abandoned(r)).map(mapCustomerReservation))
      })
      .catch(loadError => {
        if (silent) return // tải lại ngầm (vd sau khi gia hạn) lỗi thì giữ dữ liệu cũ
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
            <button className="dashboard-primary-btn" type="button" onClick={() => loadReservations()}>Thử lại</button>
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
      onReloadRentals={() => loadReservations({ silent: true })}
    />
  )
}

/**
 * Component bộ định tuyến: theo dõi URL (popstate), làm mới danh mục kho định kỳ 15 giây (dừng khi tab ẩn),
 * kiểm tra vai trò và hiển thị đúng trang.
 */
function Router() {
  const [route, setRoute] = useState(getRoute())
  useEffect(() => {
    // Khi URL đổi (popstate): tính lại route và cuộn lên đầu trang.
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
    /**
     * Làm mới danh mục kho từ backend; chỉ vẽ lại khi dữ liệu thực sự thay đổi.
     * API: GET /api/catalog/state (qua loadDataFromApi)
     */
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
    // Khi quay lại tab (đã hơn 3 giây kể từ lần làm mới trước) thì làm mới danh mục ngay.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 3000) refresh()
    }
    // Khi chuyển trang thì làm mới danh mục.
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

  if (route.type === 'payment-result') {
    return (
      <div className="app">
        <SiteHeader />
        <PaymentResultPage navigate={navigate} />
      </div>
    )
  }
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
/**
 * Tải danh mục cơ sở + kho từ backend, nạp cấu hình tính giá, chuẩn hóa dữ liệu cơ sở (khu vực, số kho trống, loại kho)
 * và kho của từng cơ sở vào biến dùng chung `facilities` / `storageUnits`.
 * API: GET /api/catalog/state  (CatalogController)
 * @returns {Promise<boolean>} true nếu dữ liệu khác lần tải trước.
 */
async function loadDataFromApi() {
  const catalog = await apiGet('/api/catalog/state')
  if (!Array.isArray(catalog?.facilities) || !Array.isArray(catalog?.units)) {
    throw new Error('Backend trả về dữ liệu danh mục không hợp lệ.')
  }
  // Giảm giá theo gói + số tháng cọc của từng cơ sở để tính tiền xem trước (pricing.js).
  setCatalogPricing(catalog)
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

/**
 * Component màn hình lỗi khi không tải được dữ liệu từ backend lúc khởi động (nút "Thử kết nối lại").
 */
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
  .then(() => root.render(<DialogProvider><Router /><DemoClockWidget /></DialogProvider>))
  .catch(error => {
    console.error('Không tải được danh mục từ backend.', error)
    root.render(<ApiStartupError error={error} />)
  })
