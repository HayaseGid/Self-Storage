/**
 * ======================================================================
 * FILE: src/pages/customer/CartPage.jsx  —  TRANG GIỎ KHO (route /cart): ĐẶT NHIỀU KHO CÙNG LÚC
 * Luồng 2 bước:
 *  1. 'cart'    : chọn cơ sở (mỗi lần đặt chỉ 1 cơ sở, tối đa CHECKOUT_LIMIT kho), bỏ chọn kho, chọn ngày bắt đầu,
 *                 số tháng, hình thức trả (Monthly/Upfront), cách nhận kho + khung giờ -> "Giữ kho & đặt cọc".
 *                 -> Mỗi kho tạo 1 đơn: POST /api/reservation (ReservationController) -> đơn Pending Deposit (giữ chỗ có hạn).
 *  2. 'payment' : đếm ngược giờ giữ kho, tick xác nhận đặt cọc (DepositConfirm) rồi thanh toán:
 *                 - VNPay: POST /api/vnpay/create (qua startVnPayPayment) -> trang VNPay -> /payment-result;
 *                 - Mô phỏng (khi bật VITE_ALLOW_SIMULATED_PAYMENT): POST /api/payment/confirm (PaymentController) từng đơn,
 *                   rồi POST /api/reservation-confirmations/mine (qua confirmAfterDeposit) -> mở tab Hợp đồng để ký.
 *                 Hủy đặt / rời trang khi chưa trả: POST /api/reservation-cancellations/{id} + trả kho về giỏ.
 * Dùng ở: App.jsx (route /cart).
 * ======================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import RentalCalendar from '../../components/common/RentalCalendar'
import { UnitTypeArt, UnitTypeChip } from '../../features/unit/unitTypes'
import { CHECKOUT_LIMIT, cancelHeldReservations, newOrderCode, rememberVnPayCartItems, removeFromCart, removeManyFromCart, restoreToCart, saveCartOrder, useCart } from '../../store/cart'
import { RENTAL_TERMS, formatVnd } from '../../services/storageRules'
import { effectiveMonthly, holdMinutesFor, quote } from '../../services/pricing'
import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from '../../services/afterDeposit'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'
import DepositConfirm from '../../features/payment/DepositConfirm'
import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from '../../features/booking/HandoverChoice'
import { getTodayDate } from '../../demoClock/demoClock'
import './CartPage.css'

/**
 * Biểu tượng mũi tên (SVG).
 */
function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  )
}

/**
 * Định dạng tiền kèm "đ".
 */
const money = value => `${formatVnd(value || 0)}đ`
/**
 * Đổi Date thành chuỗi 'YYYY-MM-DD' để gửi lên API.
 */
const toApiDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
/**
 * Định dạng Date thành 'dd/MM/yyyy' (null -> '—').
 */
const fmtDate = date => date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '—'

/**
 * Tính ngày kết thúc thuê = ngày bắt đầu + số tháng - 1 ngày (tháng đích ngắn hơn thì lấy ngày cuối tháng).
 * @param {Date} start ngày bắt đầu.
 * @param {number} months số tháng.
 * @returns {Date|null}
 */
function endDateFor(start, months) {
  if (!start) return null
  const target = start.getMonth() + months
  const lastDay = new Date(start.getFullYear(), target + 1, 0).getDate()
  const date = new Date(start.getFullYear(), target, Math.min(start.getDate(), lastDay))
  date.setDate(date.getDate() - 1)
  return date
}

/**
 * Component trang giỏ kho.
 * @param {object} props facilities (danh sách cơ sở), getStorageUnits(facilityName) (lấy kho của cơ sở),
 *   navigate, getCurrentUser(), onRequireLogin() (chuyển đăng nhập), getUnitPath (đường dẫn trang kho).
 */
export default function CartPage({ facilities, getStorageUnits, navigate, getCurrentUser, onRequireLogin, getUnitPath }) {
  const dialog = useDialog()
  const items = useCart()
  const [step, setStep] = useState('cart')
  const [facilityId, setFacilityId] = useState(null)
  const [excluded, setExcluded] = useState(() => new Set())
  const [startDate, setStartDate] = useState(null)
  const [months, setMonths] = useState(RENTAL_TERMS[0])
  const [paymentPlan, setPaymentPlan] = useState('Monthly') // 'Monthly' | 'Upfront'
  const [handoverMethod, setHandoverMethod] = useState(HANDOVER_METHODS.InPerson) // 'InPerson' | 'Online'
  const [appointmentSlot, setAppointmentSlot] = useState('') // '08:00' | '10:00' | '12:00' | '14:00'
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [depositAgreed, setDepositAgreed] = useState(false)

  const leaveRef = useRef({ step: 'cart', order: null, toVnPay: false })
  leaveRef.current.step = step
  leaveRef.current.order = order

  useEffect(() => () => {
    const { step: lastStep, order: lastOrder, toVnPay } = leaveRef.current
    if (lastStep !== 'payment' || !lastOrder || toVnPay) return
    const unpaid = lastOrder.entries.filter(entry => !entry.paid)
    if (!unpaid.length) return
    restoreToCart(unpaid.map(entry => entry.item))
    cancelHeldReservations(unpaid.map(entry => entry.reservation.reservationId), 'Khách rời trang thanh toán cọc')
  }, [])

  // Trạng thái hiện tại của từng kho trong giỏ (còn trống hay đã có người đặt).
  const enriched = items.map(item => {
    const facility = facilities.find(f => String(f.facilityId) === String(item.facilityId))
    const unit = facility && getStorageUnits(facility.name).find(u => u.id === item.unitId)
    return {
      ...item,
      key: `${item.facilityId}|${item.unitId}`,
      facility,
      unit,
      price: unit ? Number(unit.price) : item.price,
      available: Boolean(unit?.available && facility)
    }
  })

  // Gom các kho trong giỏ theo cơ sở.
  const groups = useMemo(() => {
    const map = new Map()
    enriched.forEach(item => {
      if (!map.has(item.facilityId)) map.set(item.facilityId, { facilityId: item.facilityId, name: item.facility?.name || item.facilityName, facility: item.facility, items: [] })
      map.get(item.facilityId).items.push(item)
    })
    return [...map.values()]
  }, [items, facilities])

  // Chọn sẵn cơ sở đầu tiên còn kho trống.
  useEffect(() => {
    if (facilityId && groups.some(g => String(g.facilityId) === String(facilityId))) return
    const first = groups.find(g => g.items.some(i => i.available)) || groups[0]
    setFacilityId(first ? first.facilityId : null)
  }, [groups.length])

  useEffect(() => {
    if (step !== 'payment') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [step])

  const activeGroup = groups.find(g => String(g.facilityId) === String(facilityId))
  const selected = (activeGroup?.items || []).filter(item => item.available && !excluded.has(item.key))
  const cartQuote = quote(selected.map(item => item.price), months, activeGroup?.facilityId)
  const monthlyTotal = cartQuote.monthly
  const rentTotal = cartQuote.rent
  const depositTotal = cartQuote.deposit
  const rentAtHandover = paymentPlan === 'Upfront' ? rentTotal : monthlyTotal
  const planLabel = paymentPlan === 'Upfront' ? 'Trả 1 lần' : 'Trả theo tháng'
  const depositMonths = cartQuote.depositMonths
  const holdMinutes = holdMinutesFor(activeGroup?.facilityId)
  const endDate = endDateFor(startDate, months)
  // [THỜI GIAN THỰC]:
  // const today = new Date()
  // today.setHours(0, 0, 0, 0)
  // [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock
  const today = getTodayDate()
  today.setHours(0, 0, 0, 0)

  // Chọn / bỏ chọn 1 kho trong nhóm cơ sở đang đặt.
  const toggleItem = key => setExcluded(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  // Bỏ 1 kho khỏi giỏ (hỏi xác nhận).
  const removeItem = async item => {
    const ok = await dialog.confirm({ tone: 'warning', title: `Bỏ kho ${item.unitId} khỏi giỏ?`, message: `${item.type} · ${item.size} tại ${item.facility?.name || item.facilityName}.`, confirmLabel: 'Bỏ khỏi giỏ' })
    if (ok) removeFromCart(item.facilityId, item.unitId)
  }

  /**
   * "Giữ kho & đặt cọc": kiểm tra đăng nhập + vai trò khách hàng, số kho, ngày bắt đầu, khung giờ nhận kho;
   * hỏi xác nhận rồi tạo từng đơn giữ kho; lưu "đơn giỏ hàng", bỏ các kho đã giữ khỏi giỏ và chuyển sang bước thanh toán.
   * API: POST /api/reservation  body { unitID, unitNumber, units, startDate, months, paymentPlan, handoverMethod, appointmentSlot }
   */
  const checkout = async () => {
    const user = getCurrentUser()
    if (!user?.email) {
      await onRequireLogin()
      return
    }
    if (user.role !== 'customer') {
      await dialog.alert({ tone: 'warning', title: 'Tài khoản này không đặt kho được', message: 'Chỉ tài khoản khách hàng mới đặt kho được.' })
      return
    }
    if (!selected.length) {
      await dialog.alert({ tone: 'warning', title: 'Chưa chọn kho', message: 'Hãy chọn ít nhất 1 kho còn trống để đặt.' })
      return
    }
    if (selected.length > CHECKOUT_LIMIT) {
      await dialog.alert({ tone: 'warning', title: 'Quá số kho cho một lần đặt', message: `Mỗi lần đặt tối đa ${CHECKOUT_LIMIT} kho. Hãy bỏ chọn bớt rồi đặt phần còn lại ở lần sau.` })
      return
    }
    if (!startDate || startDate < today) {
      await dialog.alert({ tone: 'warning', title: 'Chưa chọn ngày bắt đầu', message: 'Hãy chọn ngày bắt đầu thuê trên lịch.' })
      return
    }
    const handoverError = handoverChoiceError(handoverMethod, appointmentSlot, startDate)
    if (handoverError) {
      await dialog.alert({ tone: 'warning', title: 'Chưa chọn khung giờ nhận kho', message: handoverError })
      return
    }
    const isOnline = handoverMethod === HANDOVER_METHODS.Online
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Đặt ${selected.length} kho tại ${activeGroup.name}?`,
      message: (
        <>
          <p>Thuê từ <strong>{fmtDate(startDate)}</strong> đến <strong>{fmtDate(endDate)}</strong> ({months} tháng).</p>
          <p>Kho: <strong>{selected.map(i => i.unitId).join(', ')}</strong></p>
          <p>Tổng tiền cọc cần thanh toán: <strong>{money(depositTotal)}</strong> ({depositMonths} tháng tiền thuê mỗi kho).</p>
          <p>Nhận kho: {isOnline
            ? <><strong>Bàn giao online</strong> — {ONLINE_HANDOVER_NOTE}</>
            : <><strong>Nhận trực tiếp</strong> ngày {fmtDate(startDate)}, khung <strong>{slotLabel(appointmentSlot)}</strong>.</>}</p>
          <p>Hình thức trả tiền thuê: <strong>{planLabel}</strong> — sau khi nhận kho đóng <strong>{money(rentAtHandover)}</strong>{paymentPlan === 'Upfront' ? ' (toàn bộ kỳ thuê)' : ' (tháng đầu), các tháng sau đóng trước ngày đầu mỗi kỳ'}.</p>
          {selected.length > 1 && (
            <p><strong>Lưu ý đơn gộp:</strong> Tất cả {selected.length} kho trong đợt đặt này áp dụng chung hình thức <strong>{planLabel}</strong>.</p>
          )}
          <p>Mỗi kho được làm <strong>một hợp đồng riêng</strong>{selected.length > 1 ? ` (${selected.length} hợp đồng, ký lần lượt)` : ''}. Các kho được giữ cho bạn {holdMinutes} phút để thanh toán cọc.</p>
        </>
      ),
      confirmLabel: 'Giữ kho & đặt cọc'
    })
    if (!ok) return

    setSubmitting(true)
    const created = []
    const failures = []
    for (const item of selected) {
      try {
        const reservation = await apiPost('/api/reservation', {
          unitID: item.unit.unitId,
          unitNumber: item.unitId,
          units: [{ unitID: item.unit.unitId, unitNumber: item.unitId }],
          startDate: toApiDate(startDate),
          months,
          paymentPlan,
          handoverMethod,
          appointmentSlot: isOnline ? null : appointmentSlot
        })
        created.push({ item, reservation, paid: false })
      } catch (error) {
        failures.push(`${item.unitId}: ${error.message}`)
      }
    }
    setSubmitting(false)

    if (!created.length) {
      await dialog.alert({ tone: 'danger', title: 'Chưa giữ được kho', message: `${failures.join('\n')}\nCác kho vẫn nằm trong giỏ, bạn có thể bỏ kho bị trùng rồi đặt lại.` })
      return
    }
    if (failures.length) {
      await dialog.alert({
        tone: 'warning',
        title: `Đã giữ ${created.length}/${selected.length} kho`,
        message: `Không giữ được:\n${failures.join('\n')}\nCác kho này vẫn nằm trong giỏ. Bạn có thể tiếp tục đặt cọc cho ${created.length} kho đã giữ.`
      })
    }

    const code = created[0].reservation.reservationCode || newOrderCode()
    saveCartOrder({
      code,
      facilityId: activeGroup.facilityId,
      facilityName: activeGroup.name,
      reservationIds: created.map(entry => entry.reservation.reservationId),
      startDate: toApiDate(startDate),
      months,
      paymentPlan,
      handoverMethod,
      appointmentSlot: isOnline ? null : appointmentSlot,
      createdAt: new Date().toISOString()
    })
    removeManyFromCart(created.map(entry => entry.item.key))
    setOrder({
      code,
      entries: created,
      items: created.map(entry => entry.item),
      startDate,
      endDate,
      months,
      depositMonths,
      paymentPlan,
      handoverMethod,
      appointmentSlot: isOnline ? null : appointmentSlot,
      facilityName: activeGroup.name
    })
    setStep('payment')
  }

  // Thời hạn giữ kho: lấy hạn sớm nhất trong các đơn.
  const expiresAt = order ? Math.min(...order.entries.map(entry => Date.parse(entry.reservation.depositExpiresAt)).filter(Number.isFinite)) : null
  const secondsLeft = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null
  // Tính tổng 1 trường tiền (depositAmount, monthlyPrice, rentalAmount) của các đơn vừa tạo.
  const sumOf = field => (order ? order.entries.reduce((n, entry) => n + Number(entry.reservation[field] || 0), 0) : 0)
  const orderDeposit = sumOf('depositAmount')
  const orderMonthly = sumOf('monthlyPrice')
  const orderRent = sumOf('rentalAmount')

  /**
   * Thanh toán tiền cọc cho các đơn chưa trả: hết giờ giữ kho thì báo; mặc định chuyển sang VNPay;
   * chế độ demo cho chọn thanh toán mô phỏng rồi xác nhận đơn và mở tab Hợp đồng.
   * API: POST /api/vnpay/create | POST /api/payment/confirm + POST /api/reservation-confirmations/mine
   */
  const payDeposit = async () => {
    if (!depositAgreed) return
    if (secondsLeft === 0) {
      await dialog.alert({ tone: 'warning', title: 'Hết thời gian giữ kho', message: 'Thời gian giữ kho đã hết, các kho đã được trả lại. Vui lòng đặt lại.' })
      return
    }
    const unpaid = order.entries.filter(entry => !entry.paid)
    if (!SIMULATED_PAYMENT_ENABLED || !(await dialog.confirm({
      tone: 'info',
      title: 'Chọn cách thanh toán',
      message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
      confirmLabel: 'Mô phỏng',
      cancelLabel: 'Qua VNPay'
    }))) {
      setSubmitting(true)
      leaveRef.current.toVnPay = true
      rememberVnPayCartItems(unpaid.map(entry => entry.item))
      try {
        await startVnPayPayment(unpaid.map(entry => entry.reservation.reservationId), {
          amount: unpaid.reduce((n, entry) => n + Number(entry.reservation.depositAmount || 0), 0),
          count: unpaid.length,
          label: order.code
        })
      } catch (error) {
        leaveRef.current.toVnPay = false
        setSubmitting(false)
        await dialog.alert({ tone: 'danger', title: 'Chưa mở được trang thanh toán VNPay', message: error.message })
      }
      return
    }

    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Xác nhận đã thanh toán tiền cọc?',
      message: `Bạn xác nhận đã chuyển ${money(orderDeposit)} tiền cọc cho đơn ${order.code} (${order.items.length} kho).`,
      confirmLabel: 'Tôi đã thanh toán',
      cancelLabel: 'Chưa'
    })
    if (!ok) return
    setSubmitting(true)
    const entries = order.entries.map(entry => ({ ...entry }))
    try {
      for (const entry of entries) {
        if (entry.paid) continue
        await apiPost('/api/payment/confirm', { reservationID: entry.reservation.reservationId, amount: Number(entry.reservation.depositAmount || 0), paymentType: 'QR' })
        entry.paid = true
      }
    } catch (error) {
      setOrder(current => ({ ...current, entries }))
      setSubmitting(false)
      const paidCount = entries.filter(entry => entry.paid).length
      await dialog.alert({
        tone: 'danger',
        title: 'Chưa ghi nhận được tiền cọc',
        message: `${error.message}${paidCount ? `\nĐã ghi nhận cọc cho ${paidCount}/${entries.length} kho. Bấm thanh toán lại để ghi nhận các kho còn lại.` : ''}`
      })
      return
    }
    setOrder(current => ({ ...current, entries }))

    const confirmation = await confirmAfterDeposit(entries.map(entry => entry.reservation.reservationId))
    setSubmitting(false)
    await announceDepositSuccess(dialog, {
      count: entries.length,
      amountText: money(orderDeposit),
      failed: Boolean(confirmation.error) || confirmation.failed?.length > 0
    })
    openCustomerSection(navigate, 'contract')
  }

  /**
   * Hủy đặt kho ở bước thanh toán: hủy các đơn đang giữ (chưa trả cọc), trả kho về giỏ và quay lại bước giỏ.
   * API: POST /api/reservation-cancellations/{id} (qua cancelHeldReservations)
   */
  const cancelOrder = async () => {
    const unpaid = order.entries.filter(entry => !entry.paid)
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Hủy đặt kho?',
      message: `Các kho ${unpaid.map(entry => entry.item.unitId).join(', ')} sẽ không còn được giữ cho bạn và được trả về giỏ hàng. Bạn chưa thanh toán nên không mất phí.`,
      confirmLabel: 'Hủy đặt kho',
      cancelLabel: 'Tiếp tục thanh toán'
    })
    if (!ok) return
    setSubmitting(true)
    await cancelHeldReservations(unpaid.map(entry => entry.reservation.reservationId))
    restoreToCart(unpaid.map(entry => entry.item))
    setSubmitting(false)
    setDepositAgreed(false)
    setOrder(null)
    setStep('cart')
  }

  /* ================== RENDER ================== */
  return (
    <div className="booking-page cart-booking-page">
      <div className="container">
        <button
          type="button"
          className="booking-back-link"
          onClick={() => {
            if (step === 'payment') {
              cancelOrder()
            } else {
              navigate('/search')
            }
          }}
        >
          {step === 'payment' ? '← Hủy và quay lại giỏ hàng' : '← Quay lại tìm kho'}
        </button>

        <div className="customer-page-heading">
          <div>
            <span className="customer-eyebrow">BOOK STORAGE</span>
            <h1>{step === 'cart' ? 'Đặt kho' : 'Thanh toán tiền cọc'}</h1>
            <p>
              {step === 'cart'
                ? 'Đặt kho trực tuyến · Chọn kho từ giỏ hàng, kỳ hạn thuê và phương thức thanh toán.'
                : `Mã đơn ${order?.code || ''} · ${order?.facilityName || ''} · ${order?.entries?.length || 1} hợp đồng độc lập`}
            </p>
          </div>

          <div className="booking-step-indicator">
            <div className={`step-item ${step === 'cart' ? 'active' : 'completed'}`}>
              <div className="step-number">1</div>
              <span>Thông tin đặt kho</span>
            </div>
            <div className="step-line" />
            <div className={`step-item ${step === 'payment' ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <span>Thanh toán cọc</span>
            </div>
          </div>
        </div>

        {/* TRƯỜNG HỢP GIỎ HÀNG TRỐNG */}
        {items.length === 0 && step === 'cart' && (
          <div className="booking-empty-cart-card">
            <div className="booking-empty-icon">🛒</div>
            <h2>Giỏ hàng của bạn đang trống</h2>
            <p>Hiện chưa có kho lưu trữ nào trong giỏ hàng. Hãy khám phá các cơ sở và chọn ô kho phù hợp với nhu cầu của bạn.</p>
            <button type="button" className="dashboard-primary-btn" onClick={() => navigate('/search')}>
              Tìm kho lưu trữ ngay <ArrowIcon />
            </button>
          </div>
        )}

        {/* BƯỚC 1: CHỌN KHO & ĐIỀN THÔNG TIN THUÊ (UI ĐỒNG NHẤT VỚI BOOKINGPAGE) */}
        {step === 'cart' && items.length > 0 && activeGroup && (
          <div className="booking-layout">
            {/* CỘT TRÁI: TÓM TẮT ĐƠN VỊ KHO & CHỌN KHO TRONG CART */}
            <section className="booking-unit-summary">
              {/* Nếu có nhiều cơ sở trong giỏ hàng: switcher chọn cơ sở */}
              {groups.length > 1 && (
                <div className="cart-facility-pills" role="tablist" aria-label="Chọn cơ sở để đặt kho">
                  {groups.map(group => {
                    const active = String(group.facilityId) === String(facilityId)
                    const avail = group.items.filter(i => i.available).length
                    return (
                      <button
                        key={group.facilityId}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`cart-facility-pill${active ? ' active' : ''}`}
                        onClick={() => setFacilityId(group.facilityId)}
                      >
                        <strong>{group.name}</strong>
                        <span>{group.items.length} kho ({avail} trống)</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Hình ảnh đại diện (ảnh kho đầu tiên trong danh sách chọn) */}
              <div className="booking-unit-image">
                {selected[0]?.type ? (
                  <UnitTypeArt type={selected[0].type} size={selected[0].size} unitCode={selected[0].unitId} />
                ) : (
                  <div className="booking-unit-placeholder-art">
                    <span>StoreSpace Storage</span>
                  </div>
                )}
              </div>

              <div className="booking-unit-summary-body">
                <span className="storage-facility-name">{activeGroup.name}</span>
                <h2>{selected.length ? `${selected.length} kho đã chọn` : 'Chưa chọn kho'}</h2>
                <p>Mỗi kho được lập một hợp đồng riêng. Bạn có thể chọn hoặc bỏ chọn kho bên dưới:</p>

                {/* Danh sách các kho trong cơ sở với checkbox chọn kho */}
                <div className="booking-cart-unit-list" role="group" aria-label="Danh sách kho trong giỏ">
                  {activeGroup.items.map(item => {
                    const checked = item.available && !excluded.has(item.key)
                    return (
                      <div
                        key={item.key}
                        className={`booking-cart-unit-row${checked ? ' checked' : ''}${!item.available ? ' unavailable' : ''}`}
                      >
                        <input
                          type="checkbox"
                          id={`unit-${item.key}`}
                          checked={checked}
                          disabled={!item.available}
                          onChange={() => toggleItem(item.key)}
                          aria-label={`Chọn kho ${item.unitId}`}
                        />
                        <div className="booking-cart-unit-thumb">
                          <UnitTypeArt type={item.type} size={item.size} unitCode={item.unitId} />
                        </div>
                        <div className="booking-cart-unit-details">
                          <div className="booking-cart-unit-head">
                            <button
                              type="button"
                              className="booking-cart-unit-id"
                              onClick={() => item.facility && item.unit && navigate(getUnitPath(item.facility, item.unit))}
                              title="Xem chi tiết kho"
                            >
                              {item.unitId}
                            </button>
                            <span className="booking-cart-unit-price">{money(item.price)}<small>/th</small></span>
                          </div>
                          <div className="booking-cart-unit-meta">
                            <UnitTypeChip type={item.type} compact />
                            <span>{item.size}</span>
                            {!item.available && <span className="cart-pill bad">Đã có người đặt</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="booking-cart-remove-btn"
                          onClick={() => removeItem(item)}
                          aria-label={`Bỏ kho ${item.unitId} khỏi giỏ`}
                          title="Bỏ khỏi giỏ"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>

                <div className="booking-summary-info">
                  <div>
                    <small>SỐ KHO ĐANG CHỌN</small>
                    <strong className={selected.length ? 'available-text' : ''}>
                      {selected.length} / {activeGroup.items.length} kho
                    </strong>
                  </div>
                  <div>
                    <small>TỔNG TIỀN THUÊ / THÁNG</small>
                    <strong className="available-text">{money(monthlyTotal)}/tháng</strong>
                  </div>
                </div>

                <div className="booking-features">
                  <span>✓ Camera giám sát 24/7</span>
                  <span>✓ Kiểm soát ra vào thẻ từ & mã PIN</span>
                  <span>✓ Hỗ trợ khách hàng chuyên nghiệp</span>
                  <span>✓ Giá thuê niêm yết minh bạch</span>
                </div>
              </div>
            </section>

            {/* CỘT PHẢI: FORM CHỌN THÔNG TIN THUÊ (Y HỆT BOOKINGPAGE) */}
            <section className="booking-form-card">
              <div className="booking-form-heading">
                <span>01</span>
                <div>
                  <h2>Thông tin thuê</h2>
                  <p>Điền đầy đủ thông tin để hệ thống tính tiền tự động cho các kho đã chọn.</p>
                </div>
              </div>

              {/* Ngày bắt đầu thuê */}
              <div className="booking-large-field">
                <label id="rental-start-label">Ngày bắt đầu thuê</label>
                <RentalCalendar
                  value={startDate}
                  endDate={endDate}
                  durationMonths={months}
                  onChange={date => setStartDate(date)}
                />
              </div>

              {/* Thời hạn thuê (gói 6 tháng / 12 tháng) */}
              <div className="booking-large-field">
                <label id="rental-duration-label">Thời hạn thuê</label>
                <div className="duration-packages" role="radiogroup" aria-labelledby="rental-duration-label">
                  {RENTAL_TERMS.map(term => {
                    const active = months === term
                    const packageEnd = startDate ? endDateFor(startDate, term) : null
                    const termQuote = quote(selected.map(item => item.price), term, activeGroup?.facilityId)
                    return (
                      <button
                        key={term}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`duration-package${active ? ' active' : ''}`}
                        onClick={() => setMonths(term)}
                      >
                        <span className="duration-package-months"><strong>{term}</strong> tháng</span>
                        <span className="duration-package-total">{money(termQuote.rent)}</span>
                        <span className="duration-package-end">
                          {packageEnd ? `Đến ${fmtDate(packageEnd)}` : term === 6 ? 'Nửa năm' : 'Một năm'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="duration-note">
                  Hợp đồng thuê mới áp dụng gói <strong>6 tháng</strong> hoặc <strong>12 tháng</strong>. Tiền cọc <strong>{depositMonths} tháng tiền thuê</strong> ({money(depositTotal)}), hoàn lại khi trả kho. Gia hạn hợp đồng trong mục Hợp đồng khi sắp hết hạn.
                </p>
              </div>

              {/* Tóm tắt chu kỳ thuê */}
              <div className="booking-period-summary">
                <div>
                  <small>Ngày bắt đầu</small>
                  <strong>{fmtDate(startDate)}</strong>
                </div>

                <div>
                  <small>Ngày kết thúc dự kiến</small>
                  <strong>{fmtDate(endDate)}</strong>
                </div>

                <div>
                  <small>Thời gian thuê</small>
                  <strong>{months} tháng</strong>
                </div>
              </div>

              {/* Phương thức thanh toán tiền thuê */}
              <div className="booking-large-field">
                <label>Phương thức thanh toán tiền thuê</label>
                <div className="payment-mode-grid">
                  <button
                    type="button"
                    className={paymentPlan === 'Monthly' ? 'payment-mode-card active' : 'payment-mode-card'}
                    onClick={() => setPaymentPlan('Monthly')}
                  >
                    <span className="payment-mode-icon">↻</span>
                    <strong>Trả theo tháng</strong>
                    <small>Sau khi nhận kho đóng tiền tháng đầu, các tháng sau đóng trước ngày đầu mỗi kỳ.</small>
                  </button>

                  <button
                    type="button"
                    className={paymentPlan === 'Upfront' ? 'payment-mode-card active' : 'payment-mode-card'}
                    onClick={() => setPaymentPlan('Upfront')}
                  >
                    <span className="payment-mode-icon">✓</span>
                    <strong>Trả 1 lần</strong>
                    <small>Sau khi nhận kho đóng toàn bộ tiền thuê của cả kỳ thuê ({months} tháng).</small>
                  </button>
                </div>

                {selected.length >= 2 && (
                  <div className="cart-bundle-banner" role="note" style={{ marginTop: 14 }}>
                    <span className="cart-bundle-icon" aria-hidden="true">ℹ</span>
                    <div className="cart-bundle-body">
                      <strong>Đơn thuê gộp {selected.length} kho:</strong>
                      <p>Các kho trong đơn gộp áp dụng chung hình thức <strong>{planLabel}</strong> để đồng bộ hóa đơn hàng kỳ.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Cách nhận kho + khung giờ (4.1) */}
              <HandoverChoice
                method={handoverMethod}
                onMethodChange={setHandoverMethod}
                slot={appointmentSlot}
                onSlotChange={setAppointmentSlot}
                startDate={startDate}
              />

              {/* Bảng chi tiết giá tiền */}
              <div className="booking-price-breakdown">
                <div>
                  <span>Số lượng kho</span>
                  <strong>{selected.length} kho</strong>
                </div>

                <div>
                  <span>Giá thuê / tháng (tất cả kho)</span>
                  <strong>{money(cartQuote.monthlyBase ?? monthlyTotal)}</strong>
                </div>

                <div>
                  <span>Thời gian thuê</span>
                  <strong>{months} tháng</strong>
                </div>

                <div>
                  <span>Hình thức thanh toán</span>
                  <strong>{planLabel}</strong>
                </div>

                <div className="price-divider" />

                <div>
                  <span>Tổng tiền thuê ({money(cartQuote.monthlyBase ?? monthlyTotal)} × {months} tháng)</span>
                  <strong className="main-price">{money((cartQuote.monthlyBase ?? monthlyTotal) * months)}</strong>
                </div>

                {cartQuote.saving > 0 && (
                  <div className="discount-row">
                    <span>Giảm giá gói {months} tháng ({cartQuote.discountPercent}%)</span>
                    <strong>−{money(cartQuote.saving)}</strong>
                  </div>
                )}

                <div>
                  <span>Đóng sau khi nhận kho</span>
                  <strong>{money(rentAtHandover)} {paymentPlan === 'Upfront' ? '(toàn bộ kỳ thuê)' : '(tháng đầu tiên)'}</strong>
                </div>

                <div className="price-divider" />

                <div className="deposit-row">
                  <div>
                    <span>Cần thanh toán khi đặt kho: tiền cọc</span>
                    <small>{depositMonths} tháng tiền thuê · hoàn lại khi trả kho</small>
                  </div>
                  <strong className="deposit-price main-price">{money(depositTotal)}</strong>
                </div>
              </div>

              {/* Thông báo 4 bước */}
              <div className="deposit-notice">
                <div className="deposit-notice-icon">$</div>
                <div>
                  <strong>Quy trình thanh toán</strong>
                  <p>Bước 1: thanh toán tiền cọc {money(depositTotal)} ({selected.length} kho).</p>
                  <p>Bước 2: đặt cọc xong, các kho được giữ và bạn ký hợp đồng online ngay cho từng kho.</p>
                  <p>{handoverMethod === HANDOVER_METHODS.Online
                    ? 'Bước 3: ngày bắt đầu, nhân viên bàn giao online: mã truy cập hiện trong tài khoản, chìa khóa nhận tại quầy lễ tân.'
                    : `Bước 3: cơ sở phân nhân viên bàn giao, bạn đến nhận kho ngày bắt đầu${appointmentSlot ? ` (khung ${slotLabel(appointmentSlot)})` : ''}.`}</p>
                  <p>Bước 4: thanh toán tiền thuê theo hình thức đã chọn ({planLabel.toLowerCase()}).</p>
                </div>
              </div>

              {/* Nút hành động */}
              <div className="booking-actions">
                <button
                  className="dashboard-secondary-btn"
                  type="button"
                  onClick={() => navigate('/search')}
                >
                  Tìm thêm kho
                </button>

                <button
                  className="dashboard-primary-btn booking-submit"
                  type="button"
                  disabled={submitting || !selected.length}
                  onClick={checkout}
                >
                  {submitting ? 'Đang giữ kho...' : `Xác nhận đặt ${selected.length} kho`} <ArrowIcon />
                </button>
              </div>
            </section>
          </div>
        )}

        {/* BƯỚC 2: THANH TOÁN TIỀN CỌC (UI ĐỒNG NHẤT VỚI BOOKINGPAGE) */}
        {step === 'payment' && order && (
          <div className="deposit-payment-page">
            <div className="deposit-payment-header">
              <span className="customer-eyebrow">DEPOSIT PAYMENT</span>
              <h2>Thanh toán tiền cọc</h2>
              <p>
                Đơn <strong>{order.code}</strong> · {order.facilityName} · {order.entries.length} hợp đồng (mỗi kho một hợp đồng riêng).
              </p>
            </div>

            <div className="deposit-payment-layout">
              {/* Cột trái: Cổng thanh toán VNPay & danh sách kho cọc */}
              <div className="deposit-qr-card">
                <div className="deposit-qr-title">
                  <strong>Xác nhận thanh toán tiền cọc</strong>
                  <span>Thanh toán an toàn qua cổng VNPay</span>
                </div>

                <ol className="vnpay-steps" aria-label="Các bước thanh toán qua VNPay">
                  <li><strong>Bấm “Thanh toán cọc qua VNPay”</strong><span>Trình duyệt chuyển sang cổng VNPay an toàn.</span></li>
                  <li><strong>Chọn phương thức trả</strong><span>Quét mã QR VNPay, thẻ ATM hoặc ví điện tử.</span></li>
                  <li><strong>Tự quay lại StoreSpace</strong><span>Hệ thống ghi nhận tiền cọc cho {order.entries.length} hợp đồng ngay lập tức.</span></li>
                </ol>

                <div className="admin-table-wrap" style={{ margin: '18px 0' }}>
                  <table className="cart-table">
                    <thead>
                      <tr>
                        <th>Kho</th>
                        <th>Mã đơn</th>
                        <th>Loại · Kích thước</th>
                        <th>Tiền cọc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.entries.map(({ item, reservation, paid }) => (
                        <tr key={item.key}>
                          <td><strong>{item.unitId}</strong></td>
                          <td>{reservation.reservationCode || `#${reservation.reservationId}`}{paid ? <span className="cart-paid-tag"> · đã cọc</span> : null}</td>
                          <td>{item.type} · {item.size}</td>
                          <td><strong>{money(reservation.depositAmount)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="3">Tổng ({order.entries.length} kho)</td>
                        <td><strong>{money(orderDeposit)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <DepositConfirm
                  rows={[
                    ['Cơ sở', order.facilityName],
                    ['Danh sách kho', order.entries.map(entry => entry.item.unitId).join(', ')],
                    ['Thời gian thuê', `${fmtDate(order.startDate)} → ${fmtDate(order.endDate)} (${order.months} tháng)`],
                    ['Nhận kho', order.handoverMethod === HANDOVER_METHODS.Online ? 'Bàn giao online (mã trên tài khoản, chìa ở lễ tân)' : `Trực tiếp ngày ${fmtDate(order.startDate)}, khung ${slotLabel(order.appointmentSlot)}`],
                    ['Hợp đồng', `${order.entries.length} hợp đồng (mỗi kho một hợp đồng riêng)`]
                  ]}
                  lines={[
                    ['Giá thuê / tháng (tất cả kho)', orderMonthly],
                    [`Tổng tiền thuê (${order.paymentPlan === 'Upfront' ? 'trả 1 lần' : 'trả theo tháng'}, sau khi nhận kho)`, orderRent],
                    [`Tiền cọc (${order.depositMonths} tháng tiền thuê / kho)`, orderDeposit]
                  ]}
                  amount={order.entries.filter(entry => !entry.paid).reduce((n, entry) => n + Number(entry.reservation.depositAmount || 0), 0)}
                  onChange={setDepositAgreed}
                />

                <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                  <button
                    type="button"
                    className="dashboard-primary-btn full"
                    disabled={submitting || secondsLeft === 0 || !depositAgreed}
                    onClick={payDeposit}
                  >
                    {submitting ? 'Đang chuyển sang VNPay...' : 'Thanh toán cọc qua VNPay'}
                  </button>

                  <button
                    type="button"
                    className="dashboard-secondary-btn full"
                    disabled={submitting}
                    onClick={cancelOrder}
                  >
                    Hủy đặt, quay lại giỏ hàng
                  </button>
                </div>

                {secondsLeft !== null && (
                  <p className={`cart-countdown${secondsLeft === 0 ? ' expired' : ''}`} style={{ marginTop: 14 }}>
                    {secondsLeft === 0 ? 'Đã hết thời gian giữ kho. Vui lòng quay lại đặt lại.' : `Thời gian giữ kho còn lại: ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                  </p>
                )}
              </div>

              {/* Cột phải: Tóm tắt thanh toán & thông tin đặt kho */}
              <div className="deposit-payment-info">
                <div className="payment-info-block">
                  <span>THÔNG TIN THANH TOÁN</span>
                  <div>
                    <small>Tổng tiền cọc cần đóng</small>
                    <strong className="payment-highlight">{money(orderDeposit)}</strong>
                  </div>
                  <div>
                    <small>Mã đơn đặt</small>
                    <strong>{order.code}</strong>
                  </div>
                  <div>
                    <small>Số hợp đồng độc lập</small>
                    <strong>{order.entries.length} hợp đồng</strong>
                  </div>
                </div>

                <div className="payment-booking-summary">
                  <span>CƠ SỞ LƯU TRỮ</span>
                  <strong>{order.facilityName}</strong>
                  <p>{order.entries.map(e => e.item.unitId).join(', ')}</p>

                  <div>
                    <span>Ngày bắt đầu</span>
                    <strong>{fmtDate(order.startDate)}</strong>
                  </div>
                  <div>
                    <span>Ngày kết thúc dự kiến</span>
                    <strong>{fmtDate(order.endDate)}</strong>
                  </div>
                  <div>
                    <span>Thời gian thuê</span>
                    <strong>{order.months} tháng</strong>
                  </div>
                  <div>
                    <span>Hình thức thanh toán</span>
                    <strong>{order.paymentPlan === 'Upfront' ? 'Trả 1 lần' : 'Trả theo tháng'}</strong>
                  </div>
                  <div>
                    <span>Tổng tiền thuê</span>
                    <strong>{money(orderRent)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
