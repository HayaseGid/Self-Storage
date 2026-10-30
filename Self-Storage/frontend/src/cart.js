import { useEffect, useState } from 'react'

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

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // bỏ qua nếu trình duyệt chặn lưu trữ
  }
}

export function getCart() {
  const items = read(CART_KEY, [])
  return Array.isArray(items) ? items.filter(item => item && item.unitId && item.facilityId) : []
}

function saveCart(items) {
  write(CART_KEY, items)
  window.dispatchEvent(new Event(CART_EVENT))
}

export function isInCart(facilityId, unitId) {
  return getCart().some(item => String(item.facilityId) === String(facilityId) && item.unitId === unitId)
}

/* Trả về { ok, reason } */
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

export function removeFromCart(facilityId, unitId) {
  saveCart(getCart().filter(item => !(String(item.facilityId) === String(facilityId) && item.unitId === unitId)))
}

export function removeManyFromCart(keys) {
  const set = new Set(keys)
  saveCart(getCart().filter(item => !set.has(`${item.facilityId}|${item.unitId}`)))
}

export function clearCart() {
  saveCart([])
}

/* Hook: số lượng / danh sách giỏ hàng, tự cập nhật khi giỏ thay đổi (kể cả ở tab khác). */
export function useCart() {
  const [items, setItems] = useState(getCart)
  useEffect(() => {
    const update = () => setItems(getCart())
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

export function saveCartOrder(order) {
  const orders = read(ORDERS_KEY, [])
  orders.unshift(order)
  write(ORDERS_KEY, orders.slice(0, 50))
}

export function getCartOrders() {
  const orders = read(ORDERS_KEY, [])
  return Array.isArray(orders) ? orders : []
}

export function newOrderCode() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `GH-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
