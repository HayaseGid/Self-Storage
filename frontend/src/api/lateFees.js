/**
 * ======================================================================
 * FILE: src/api/lateFees.js  —  API PHÍ TRỄ HẠN TIỀN THUÊ (phía KHÁCH HÀNG)
 * Backend: LateFeesController (/api/late-fees/...).
 * Dùng ở: CustomerAccount, ContractCard, PendingPayments.
 * - useLateFees(): hook tải danh sách phí trễ hạn của khách đang đăng nhập.
 * - payLateFeesDemo(): đóng phí trễ hạn bằng giao dịch mô phỏng (demo, không qua VNPay).
 * - Thanh toán thật qua VNPay đã gộp phí trễ hạn vào tiền thuê (xem api/vnpay.js).
 * ======================================================================
 */
import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'

/*
 * PHÍ TRỄ HẠN TIỀN THUÊ (file THÊM MỚI) - backend: LateFeesController /api/late-fees.
 *   useLateFees()       khách: GET /api/late-fees/mine (backend tự cập nhật phí tới hôm nay)
 *   payLateFeesDemo(id) khách: đóng mô phỏng phí trễ hạn chưa đóng của 1 đơn
 * Đóng thật qua VNPay: POST /api/vnpay/create đã thu kèm phí trễ hạn cùng tiền thuê, không cần gọi gì thêm.
 */
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
  useEffect(() => { reload() }, [reload])
  // Tìm khoản phí trễ hạn của một đơn đặt kho theo reservationId.
  const byReservation = id => state.items.find(i => String(i.reservationId) === String(id)) || null
  return { ...state, reload, byReservation }
}

/**
 * Đóng (mô phỏng) toàn bộ phí trễ hạn chưa đóng của 1 đơn đặt kho.
 * API: POST /api/late-fees/{reservationId}/pay-demo  (LateFeesController)
 * @param {number} reservationId
 */
export const payLateFeesDemo = reservationId => apiPost(`/api/late-fees/${reservationId}/pay-demo`, {})

/* Câu mô tả chính sách để hiện cho khách / nhân viên. */
/**
 * Trả về câu mô tả chính sách phí trễ hạn để hiển thị (lấy policy.summary từ backend,
 * không có thì dùng câu mặc định).
 */
export const lateFeePolicyText = policy => policy?.summary || 'Quá hạn hơn 3 ngày: 0,05% số tiền quá hạn / ngày, tối đa 5% mỗi kỳ.'
