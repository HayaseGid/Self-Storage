import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from './api'

/*
 * PHÍ TRỄ HẠN TIỀN THUÊ (file THÊM MỚI) - backend: LateFeesController /api/late-fees.
 *   useLateFees()       khách: GET /api/late-fees/mine (backend tự cập nhật phí tới hôm nay)
 *   payLateFeesDemo(id) khách: đóng mô phỏng phí trễ hạn chưa đóng của 1 đơn
 * Đóng thật qua VNPay: POST /api/vnpay/create đã thu kèm phí trễ hạn cùng tiền thuê, không cần gọi gì thêm.
 */
export function useLateFees(enabled = true) {
  const [state, setState] = useState({ loading: enabled, policy: null, items: [], error: '' })
  const reload = useCallback(() => {
    if (!enabled) return Promise.resolve()
    return apiGet('/api/late-fees/mine')
      .then(data => setState({ loading: false, policy: data?.policy || null, items: Array.isArray(data?.items) ? data.items : [], error: '' }))
      .catch(error => setState(s => ({ ...s, loading: false, error: error?.status === 404 ? '' : error.message })))
  }, [enabled])
  useEffect(() => { reload() }, [reload])
  const byReservation = id => state.items.find(i => String(i.reservationId) === String(id)) || null
  return { ...state, reload, byReservation }
}

export const payLateFeesDemo = reservationId => apiPost(`/api/late-fees/${reservationId}/pay-demo`, {})

/* Câu mô tả chính sách để hiện cho khách / nhân viên. */
export const lateFeePolicyText = policy => policy?.summary || 'Quá hạn hơn 3 ngày: 0,05% số tiền quá hạn / ngày, tối đa 5% mỗi kỳ.'
