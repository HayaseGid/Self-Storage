/**
 * ======================================================================
 * FILE: src/api/lateFees.js  —  API PHÍ TRỄ HẠN TIỀN THUÊ (PHÍA KHÁCH HÀNG)
 * CHỨC NĂNG: Tải danh sách phí trễ hạn của khách đang đăng nhập (backend tự tính phí tới hôm nay),
 *   cho phép đóng phí bằng giao dịch mô phỏng (demo) và cung cấp câu mô tả chính sách phí trễ.
 *   Đóng THẬT qua VNPay không cần file này: POST /api/vnpay/create đã thu kèm phí trễ hạn cùng tiền thuê.
 * THÀNH PHẦN CHÍNH:
 *   - useLateFees       : hook React tải phí trễ hạn, có reload() và byReservation(id).
 *   - payLateFeesDemo   : đóng mô phỏng toàn bộ phí trễ hạn chưa đóng của 1 đơn.
 *   - lateFeePolicyText : câu mô tả chính sách phí trễ để hiển thị.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx, src/features/payment/PendingPayments.jsx
 *   (useLateFees, payLateFeesDemo); src/features/contract/ContractCard.jsx (lateFeePolicyText).
 * PHỤ THUỘC: react (useState, useEffect, useCallback), ./api (apiGet, apiPost).
 * API: GET /api/late-fees/mine, POST /api/late-fees/{reservationId}/pay-demo (LateFeesController).
 * LUỒNG: Trang tài khoản khách mở -> useLateFees() -> GET /api/late-fees/mine -> state.items
 *   -> từng thẻ hợp đồng gọi byReservation(id) để hiện phí; bấm "Đóng phí (demo)" -> payLateFeesDemo(id)
 *   -> POST pay-demo -> gọi reload() để tải lại.
 * ======================================================================
 */
import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'

/**
 * Hook React: tải phí trễ hạn của khách đang đăng nhập (backend tự tính phí cập nhật tới hôm nay).
 * API: GET /api/late-fees/mine  -> { policy, items: [{ reservationId, ... }] }
 * @param {boolean} enabled false thì không gọi API (ví dụ khi chưa đăng nhập).
 * @returns {{loading:boolean, policy:object|null, items:any[], error:string, reload:Function, byReservation:Function}}
 */
export function useLateFees(enabled = true) {
  const [state, setState] = useState({ loading: enabled, policy: null, items: [], error: '' })
  // Gọi lại API GET /api/late-fees/mine và cập nhật state (lỗi 404 coi như chưa có dữ liệu, không báo lỗi).
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve()
    return apiGet('/api/late-fees/mine')
      .then(data => setState({ loading: false, policy: data?.policy || null, items: Array.isArray(data?.items) ? data.items : [], error: '' }))
      .catch(error => setState(s => ({ ...s, loading: false, error: error?.status === 404 ? '' : error.message })))
  }, [enabled])
  // Chạy khi mount và mỗi khi `enabled` đổi (reload đổi theo): tải phí trễ hạn lần đầu.
  useEffect(() => { reload() }, [reload])
  // Tìm khoản phí trễ hạn của một đơn đặt kho theo reservationId.
  const byReservation = id => state.items.find(i => String(i.reservationId) === String(id)) || null
  return { ...state, reload, byReservation }
}

/**
 * Đóng (mô phỏng) toàn bộ phí trễ hạn chưa đóng của 1 đơn đặt kho.
 * API: POST /api/late-fees/{reservationId}/pay-demo  (LateFeesController)
 * @param {number} reservationId mã đơn đặt kho cần đóng phí.
 * @returns {Promise<any>} kết quả backend; người gọi nên gọi reload() của useLateFees sau đó.
 * Được gọi khi khách bấm nút đóng phí trễ hạn (demo) ở CustomerAccount / PendingPayments.
 */
export const payLateFeesDemo = reservationId => apiPost(`/api/late-fees/${reservationId}/pay-demo`, {})

/**
 * Trả về câu mô tả chính sách phí trễ hạn để hiển thị cho khách / nhân viên
 * (lấy policy.summary từ backend, không có thì dùng câu mặc định).
 * @param {object|null} policy chính sách phí trễ (trường `policy` của useLateFees).
 * @returns {string} câu mô tả. Không gọi API.
 */
export const lateFeePolicyText = policy => policy?.summary || 'Quá hạn hơn 3 ngày: 0,05% số tiền quá hạn / ngày, tối đa 5% mỗi kỳ.'
