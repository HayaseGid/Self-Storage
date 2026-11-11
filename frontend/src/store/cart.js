/**
 * ======================================================================
 * FILE: src/store/cart.js  —  GIỎ HÀNG THUÊ KHO (lưu ở localStorage, dùng được cả khi chưa đăng nhập)
 * Quy tắc:
 * - Mỗi kho chỉ thêm 1 lần; tối đa CART_LIMIT (10) kho trong giỏ.
 * - Mỗi lần đặt chỉ gồm các kho CÙNG MỘT CƠ SỞ, tối đa CHECKOUT_LIMIT (5) kho.
 * - Kho trong giỏ CHƯA được giữ chỗ; chỉ giữ chỗ khi khách bấm đặt cọc (backend tạo đơn Pending Deposit).
 * Đồng bộ giữa các component/tab bằng sự kiện 'storespace-cart-changed' và sự kiện 'storage'.
 * API duy nhất: POST /api/reservation-cancellations/{id} (hủy đơn đang giữ chỗ khi khách bỏ bước đặt cọc).
 * Dùng ở: App.jsx, CartPage, PaymentResultPage.
 * ======================================================================
 */
import { useEffect, useState } from 'react'
import { apiPost } from '../api/api'

/*
 * Giỏ hàng thuê kho (lưu trên trình duyệt, giữ được khi chưa đăng nhập).
 *
 * Quy tắc:
 * - Mỗi kho chỉ thêm 1 lần; tối đa CART_LIMIT kho trong giỏ.
 * - Mỗi lần đặt chỉ gồm các kho CÙNG MỘT CƠ SỞ (một hợp đồng / một cơ sở), tối đa CHECKOUT_LIMIT kho.
 * - Kho trong giỏ KHÔNG được giữ chỗ; chỉ giữ chỗ (10 phút) khi khách bấm đặt cọc.
 */

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
 * Kiểm tra 1 kho (theo cơ sở + mã kho) đã có trong giỏ chưa.
 */
export function isInCart(facilityId, unitId) {
  return getCart().some(item => String(item.facilityId) === String(facilityId) && item.unitId === unitId)
}

/* Trả về { ok, reason } */
/**
 * Thêm 1 kho vào giỏ.
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
 * Xóa 1 kho khỏi giỏ.
 */
export function removeFromCart(facilityId, unitId) {
  saveCart(getCart().filter(item => !(String(item.facilityId) === String(facilityId) && item.unitId === unitId)))
}

/**
 * Xóa nhiều kho khỏi giỏ theo danh sách khóa "facilityId|unitId".
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

/* Hủy đơn giữ kho ở bước đặt cọc -> trả các kho về giỏ (bỏ qua kho đã có trong giỏ). */
const CART_FIELDS = ['facilityId', 'facilityName', 'unitId', 'unitDbId', 'unitTypeId', 'type', 'size', 'price', 'addedAt']
/**
 * Lấy ra các trường cần lưu của 1 phần tử giỏ (bỏ các trường thừa).
 */
export function toCartItem(item) {
  return Object.fromEntries(CART_FIELDS.filter(key => item?.[key] !== undefined).map(key => [key, item[key]]))
}
/**
 * Trả các kho về lại giỏ (khi khách hủy ở bước đặt cọc); bỏ qua kho đã có hoặc khi giỏ đầy.
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

/* Kho của lần đặt cọc đang chuyển sang VNPay: để trang kết quả trả lại giỏ nếu khách hủy giao dịch. */
const VNPAY_CART_KEY = 'storespace_vnpay_cart_items'
/**
 * Ghi nhớ các kho của lần đặt cọc đang chuyển sang VNPay (sessionStorage) để nếu khách hủy giao dịch
 * thì trang kết quả trả lại vào giỏ.
 */
export function rememberVnPayCartItems(items) {
  try { sessionStorage.setItem(VNPAY_CART_KEY, JSON.stringify((items || []).map(toCartItem))) } catch { /* bỏ qua */ }
}
/**
 * Đọc và xóa danh sách kho đã ghi nhớ khi chuyển sang VNPay.
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

/* Hủy các đơn còn "chờ thanh toán cọc" (POST /api/reservation-cancellations/{id}, đơn chưa cọc nên không hoàn tiền).
   Đơn đã hết hạn giữ / đã hủy thì backend báo lỗi -> bỏ qua. Trả về số đơn hủy được. */
/**
 * Hủy các đơn đang "chờ thanh toán cọc" (chưa cọc nên không hoàn tiền).
 * API: POST /api/reservation-cancellations/{id}  body { reason }  (ReservationCancellationsController)
 * Đơn đã hết hạn giữ / đã hủy thì backend báo lỗi -> bỏ qua.
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

/* Hook: số lượng / danh sách giỏ hàng, tự cập nhật khi giỏ thay đổi (kể cả ở tab khác). */
/**
 * Hook React: trả về danh sách kho trong giỏ, tự cập nhật khi giỏ thay đổi (kể cả ở tab trình duyệt khác).
 */
export function useCart() {
  const [items, setItems] = useState(getCart)
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
 */
export function saveCartOrder(order) {
  const orders = read(ORDERS_KEY, [])
  orders.unshift(order)
  write(ORDERS_KEY, orders.slice(0, 50))
}

/**
 * Lấy danh sách đơn đặt từ giỏ đã lưu.
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
