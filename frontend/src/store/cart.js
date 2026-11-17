/**
 * ======================================================================
 * FILE: src/store/cart.js  —  GIỎ HÀNG THUÊ KHO (LOCALSTORAGE, DÙNG ĐƯỢC KHI CHƯA ĐĂNG NHẬP)
 * CHỨC NĂNG: Lưu danh sách kho khách muốn thuê trên trình duyệt. Quy tắc: mỗi kho chỉ thêm 1 lần, tối đa
 *   CART_LIMIT (10) kho; mỗi lần đặt chỉ gồm các kho CÙNG MỘT CƠ SỞ, tối đa CHECKOUT_LIMIT (5) kho. Kho trong
 *   giỏ CHƯA được giữ chỗ; chỉ giữ chỗ khi khách bấm đặt cọc (backend tạo đơn Pending Deposit). Các component /
 *   tab đồng bộ qua sự kiện 'storespace-cart-changed' và sự kiện 'storage'. File cũng lo trả kho về giỏ khi
 *   khách hủy bước đặt cọc / hủy giao dịch VNPay, và lưu "đơn đặt từ giỏ" để gom hiển thị.
 * THÀNH PHẦN CHÍNH:
 *   - CART_LIMIT, CHECKOUT_LIMIT : giới hạn số kho.
 *   - getCart / isInCart / addToCart / removeFromCart / removeManyFromCart / clearCart : thao tác giỏ.
 *   - useCart : hook React trả danh sách giỏ, tự cập nhật.
 *   - toCartItem / restoreToCart : trả kho về giỏ.
 *   - rememberVnPayCartItems / takeVnPayCartItems : nhớ kho đang thanh toán VNPay (sessionStorage).
 *   - cancelHeldReservations : hủy các đơn đang giữ chỗ chờ cọc.
 *   - saveCartOrder / getCartOrders / newOrderCode : lưu đơn đặt từ giỏ + sinh mã "GH-...".
 * DÙNG Ở: src/App.jsx (useCart, addToCart, isInCart, CART_LIMIT), src/pages/customer/CartPage.jsx,
 *   src/pages/payment/PaymentResultPage.jsx (restoreToCart, takeVnPayCartItems, cancelHeldReservations).
 * PHỤ THUỘC: react, src/api/api (apiPost); localStorage 'storespace_cart', 'storespace_cart_orders';
 *   sessionStorage 'storespace_vnpay_cart_items'.
 * API: POST /api/reservation-cancellations/{id} (hủy đơn đang giữ chỗ khi khách bỏ bước đặt cọc).
 * LUỒNG: Khách bấm "Thêm vào giỏ" ở App -> addToCart() -> saveCart() phát sự kiện -> useCart() cập nhật badge
 *   -> CartPage chọn kho cùng cơ sở -> đặt cọc -> rememberVnPayCartItems() -> VNPay; nếu khách hủy giao dịch
 *   -> PaymentResultPage cancelHeldReservations() + restoreToCart(takeVnPayCartItems()).
 * ======================================================================
 */
import { useEffect, useState } from 'react'
import { apiPost } from '../api/api'

// Key localStorage của giỏ và danh sách đơn đặt từ giỏ, tên sự kiện báo giỏ thay đổi.
const CART_KEY = 'storespace_cart'
const ORDERS_KEY = 'storespace_cart_orders'
const CART_EVENT = 'storespace-cart-changed'
export const CART_LIMIT = 10
export const CHECKOUT_LIMIT = 5

/**
 * Đọc và parse JSON từ localStorage; lỗi hoặc không có thì trả giá trị mặc định.
 */
function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Ghi giá trị (dạng JSON) vào localStorage; bỏ qua nếu trình duyệt chặn lưu trữ.
 */
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // bỏ qua nếu trình duyệt chặn lưu trữ
  }
}

/**
 * Lấy danh sách kho trong giỏ (lọc bỏ phần tử hỏng thiếu unitId/facilityId).
 */
export function getCart() {
  const items = read(CART_KEY, [])
  return Array.isArray(items) ? items.filter(item => item && item.unitId && item.facilityId) : []
}

/**
 * Lưu giỏ hàng và phát sự kiện 'storespace-cart-changed' để các component đang dùng useCart() cập nhật.
 */
function saveCart(items) {
  write(CART_KEY, items)
  window.dispatchEvent(new Event(CART_EVENT))
}

/**
 * Kiểm tra 1 kho (theo cơ sở + mã kho) đã có trong giỏ chưa. App.jsx dùng để đổi nút "Thêm vào giỏ".
 * @param {number|string} facilityId mã cơ sở. @param {string} unitId mã kho (vd "Q7-U01").
 * @returns {boolean}
 */
export function isInCart(facilityId, unitId) {
  return getCart().some(item => String(item.facilityId) === String(facilityId) && item.unitId === unitId)
}

/**
 * Thêm 1 kho vào giỏ. Được gọi khi khách bấm "Thêm vào giỏ" ở App.jsx.
 * @param {object} facility cơ sở ({ facilityId, name }).
 * @param {object} unit kho ({ id, unitId, unitTypeId, type, size, price }).
 * @returns {{ok:boolean, reason?:'exists'|'full'}} exists = đã có trong giỏ, full = giỏ đầy.
 */
export function addToCart(facility, unit) {
  const items = getCart()
  if (items.some(item => String(item.facilityId) === String(facility.facilityId) && item.unitId === unit.id)) {
    return { ok: false, reason: 'exists' }
  }
  if (items.length >= CART_LIMIT) return { ok: false, reason: 'full' }
  items.push({
    facilityId: facility.facilityId,
    facilityName: facility.name,
    unitId: unit.id,
    unitDbId: unit.unitId,
    unitTypeId: unit.unitTypeId,
    type: unit.type,
    size: unit.size,
    price: Number(unit.price),
    addedAt: new Date().toISOString()
  })
  saveCart(items)
  return { ok: true }
}

/**
 * Xóa 1 kho khỏi giỏ (CartPage: bấm nút xóa trên dòng kho).
 * @param {number|string} facilityId mã cơ sở. @param {string} unitId mã kho.
 */
export function removeFromCart(facilityId, unitId) {
  saveCart(getCart().filter(item => !(String(item.facilityId) === String(facilityId) && item.unitId === unitId)))
}

/**
 * Xóa nhiều kho khỏi giỏ theo danh sách khóa "facilityId|unitId" (CartPage: sau khi đặt thành công các kho đã chọn).
 * @param {string[]} keys danh sách khóa.
 */
export function removeManyFromCart(keys) {
  const set = new Set(keys)
  saveCart(getCart().filter(item => !set.has(`${item.facilityId}|${item.unitId}`)))
}

/**
 * Xóa toàn bộ giỏ hàng.
 */
export function clearCart() {
  saveCart([])
}

/* Các trường được lưu cho 1 phần tử giỏ (dùng khi trả kho về giỏ sau khi hủy bước đặt cọc). */
const CART_FIELDS = ['facilityId', 'facilityName', 'unitId', 'unitDbId', 'unitTypeId', 'type', 'size', 'price', 'addedAt']
/**
 * Lấy ra các trường cần lưu của 1 phần tử giỏ (bỏ các trường thừa).
 */
export function toCartItem(item) {
  return Object.fromEntries(CART_FIELDS.filter(key => item?.[key] !== undefined).map(key => [key, item[key]]))
}
/**
 * Trả các kho về lại giỏ (khi khách hủy ở bước đặt cọc); bỏ qua kho đã có hoặc khi giỏ đầy.
 * Được gọi bởi CartPage (hủy hộp thoại đặt cọc) và PaymentResultPage (hủy giao dịch VNPay).
 * @param {object[]} items các kho cần trả về.
 */
export function restoreToCart(items) {
  const cart = getCart()
  ;(items || []).map(toCartItem).forEach(item => {
    if (!item.facilityId || !item.unitId) return
    if (cart.some(c => String(c.facilityId) === String(item.facilityId) && c.unitId === item.unitId)) return
    if (cart.length < CART_LIMIT) cart.push(item)
  })
  saveCart(cart)
}

/* Key sessionStorage lưu kho của lần đặt cọc đang chuyển sang VNPay. */
const VNPAY_CART_KEY = 'storespace_vnpay_cart_items'
/**
 * Ghi nhớ các kho của lần đặt cọc đang chuyển sang VNPay (sessionStorage) để nếu khách hủy giao dịch
 * thì trang kết quả trả lại vào giỏ. Được gọi bởi CartPage ngay trước khi chuyển sang VNPay.
 * @param {object[]} items các kho đang thanh toán.
 */
export function rememberVnPayCartItems(items) {
  try { sessionStorage.setItem(VNPAY_CART_KEY, JSON.stringify((items || []).map(toCartItem))) } catch { /* bỏ qua */ }
}
/**
 * Đọc và xóa danh sách kho đã ghi nhớ khi chuyển sang VNPay (PaymentResultPage gọi khi giao dịch bị hủy / lỗi).
 * @returns {object[]} danh sách kho (rỗng nếu không có).
 */
export function takeVnPayCartItems() {
  try {
    const items = JSON.parse(sessionStorage.getItem(VNPAY_CART_KEY) || '[]')
    sessionStorage.removeItem(VNPAY_CART_KEY)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

/**
 * Hủy các đơn đang "chờ thanh toán cọc" (chưa cọc nên không hoàn tiền), gọi tuần tự từng đơn.
 * API: POST /api/reservation-cancellations/{id}  body { reason }  (ReservationCancellationsController)
 * Đơn đã hết hạn giữ / đã hủy thì backend báo lỗi -> bỏ qua.
 * Được gọi bởi CartPage (khách đóng bước đặt cọc) và PaymentResultPage (khách hủy giao dịch VNPay).
 * @param {number[]} reservationIds các đơn cần hủy.
 * @param {string} reason lý do hủy gửi lên backend.
 * @returns {Promise<number>} số đơn hủy được.
 */
export async function cancelHeldReservations(reservationIds, reason = 'Khách hủy ở bước thanh toán cọc') {
  let cancelled = 0
  for (const id of (reservationIds || []).map(Number).filter(Boolean)) {
    try {
      await apiPost(`/api/reservation-cancellations/${id}`, { reason })
      cancelled += 1
    } catch { /* đã hết hạn giữ hoặc đã hủy */ }
  }
  return cancelled
}

/**
 * Hook React: trả về danh sách kho trong giỏ, tự cập nhật khi giỏ thay đổi (kể cả ở tab trình duyệt khác).
 * Được dùng bởi App.jsx (badge số kho trên header) và CartPage (danh sách giỏ).
 * @returns {object[]} danh sách kho trong giỏ.
 */
export function useCart() {
  const [items, setItems] = useState(getCart)
  // Chạy 1 lần khi mount: lắng nghe sự kiện giỏ đổi (cùng tab) và 'storage' (tab khác); gỡ khi unmount.
  useEffect(() => {
    // Đọc lại giỏ và cập nhật state.
    const update = () => setItems(getCart())
    // Khi tab khác sửa localStorage key giỏ hàng thì cập nhật lại.
    const onStorage = event => { if (event.key === CART_KEY) update() }
    window.addEventListener(CART_EVENT, update)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(CART_EVENT, update)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return items
}

/* ---------- Đơn đặt từ giỏ hàng (để gom các đặt chỗ thành một hợp đồng khi hiển thị) ---------- */

/**
 * Lưu 1 "đơn đặt từ giỏ" (gom nhiều đặt chỗ thành 1 nhóm để hiển thị như 1 hợp đồng); giữ tối đa 50 đơn.
 * Được gọi bởi CartPage sau khi tạo đơn thành công.
 * @param {object} order thông tin đơn (mã GH-..., danh sách đặt chỗ...).
 */
export function saveCartOrder(order) {
  const orders = read(ORDERS_KEY, [])
  orders.unshift(order)
  write(ORDERS_KEY, orders.slice(0, 50))
}

/**
 * Lấy danh sách đơn đặt từ giỏ đã lưu (hiện chưa có file nào gọi).
 * @returns {object[]}
 */
export function getCartOrders() {
  const orders = read(ORDERS_KEY, [])
  return Array.isArray(orders) ? orders : []
}

/**
 * Sinh mã đơn giỏ hàng dạng "GH-yyMMdd-HHmmss".
 */
export function newOrderCode() {
  const d = new Date()
  // Thêm số 0 phía trước cho đủ 2 chữ số.
  const pad = n => String(n).padStart(2, '0')
  return `GH-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
