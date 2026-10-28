import React, { useEffect, useMemo, useState } from 'react'
import { apiPost } from './api'
import { useDialog } from './Dialog'
import RentalCalendar from './RentalCalendar'
import { UnitTypeArt, UnitTypeChip } from './unitTypes'
import { CHECKOUT_LIMIT, newOrderCode, removeFromCart, removeManyFromCart, saveCartOrder, useCart } from './cart'
import { RENTAL_TERMS, formatVnd } from './storageRules'
import { effectiveMonthly, holdMinutesFor, quote } from './pricing'
import './CartPage.css'

/*
 * Giỏ hàng: thuê nhiều kho trong một lần đặt.
 * Một lần đặt = MỘT đơn đặt chỗ (POST /api/reservation với units: [...]) = MỘT hợp đồng gồm nhiều kho.
 * Bước 1 – Giỏ hàng: chọn cơ sở, chọn kho, ngày bắt đầu, gói 6/12 tháng.
 * Bước 2 – Đặt cọc: hệ thống giữ các kho theo thời hạn giữ chỗ của cơ sở, khách thanh toán tiền cọc một lần.
 * Bước 3 – Hoàn tất: chờ Manager duyệt, sau đó ký hợp đồng online trong mục Hợp đồng.
 */

const money = value => `${formatVnd(value || 0)}đ`
const toApiDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fmtDate = date => date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` : '—'

function endDateFor(start, months) {
  if (!start) return null
  const target = start.getMonth() + months
  const lastDay = new Date(start.getFullYear(), target + 1, 0).getDate()
  const date = new Date(start.getFullYear(), target, Math.min(start.getDate(), lastDay))
  date.setDate(date.getDate() - 1)
  return date
}

export default function CartPage({ facilities, getStorageUnits, navigate, getCurrentUser, onRequireLogin, getUnitPath }) {
  const dialog = useDialog()
  const items = useCart()
  const [step, setStep] = useState('cart')
  const [facilityId, setFacilityId] = useState(null)
  const [excluded, setExcluded] = useState(() => new Set())
  const [startDate, setStartDate] = useState(null)
  const [months, setMonths] = useState(RENTAL_TERMS[0])
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState(null) // { code, reservation, items, startDate, endDate, months, facilityName, paid }
  const [now, setNow] = useState(Date.now())

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
  // Giá xem trước: giảm giá theo gói + số tháng cọc của cơ sở (giống backend).
  const cartQuote = quote(selected.map(item => item.price), months, activeGroup?.facilityId)
  const monthlyTotal = cartQuote.monthly
  const rentTotal = cartQuote.rent
  const depositTotal = cartQuote.deposit
  const depositMonths = cartQuote.depositMonths
  const holdMinutes = holdMinutesFor(activeGroup?.facilityId)
  const endDate = endDateFor(startDate, months)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const toggleItem = key => setExcluded(current => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const removeItem = async item => {
    const ok = await dialog.confirm({ tone: 'warning', title: `Bỏ kho ${item.unitId} khỏi giỏ?`, message: `${item.type} · ${item.size} tại ${item.facility?.name || item.facilityName}.`, confirmLabel: 'Bỏ khỏi giỏ' })
    if (ok) removeFromCart(item.facilityId, item.unitId)
  }

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
      await dialog.alert({ tone: 'warning', title: 'Quá số kho cho một hợp đồng', message: `Mỗi hợp đồng tối đa ${CHECKOUT_LIMIT} kho. Hãy bỏ chọn bớt rồi đặt phần còn lại ở lần sau.` })
      return
    }
    if (!startDate || startDate < today) {
      await dialog.alert({ tone: 'warning', title: 'Chưa chọn ngày bắt đầu', message: 'Hãy chọn ngày bắt đầu thuê trên lịch.' })
      return
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Đặt ${selected.length} kho tại ${activeGroup.name}?`,
      message: (
        <>
          <p>Thuê từ <strong>{fmtDate(startDate)}</strong> đến <strong>{fmtDate(endDate)}</strong> ({months} tháng).</p>
          <p>Kho: <strong>{selected.map(i => i.unitId).join(', ')}</strong></p>
          <p>Tổng tiền cọc cần thanh toán: <strong>{money(depositTotal)}</strong> ({depositMonths} tháng tiền thuê mỗi kho).</p>
          <p>Tất cả kho được làm chung <strong>một hợp đồng</strong> và giữ cho bạn {holdMinutes} phút để thanh toán cọc.</p>
        </>
      ),
      confirmLabel: 'Giữ kho & đặt cọc'
    })
    if (!ok) return

    setSubmitting(true)
    let reservation
    try {
      // Một đơn gồm nhiều kho -> backend tạo một Reservation (nhiều ReservationUnit) và sau này một hợp đồng.
      reservation = await apiPost('/api/reservation', {
        unitID: selected[0].unit.unitId,
        unitNumber: selected[0].unitId,
        units: selected.map(item => ({ unitID: item.unit.unitId, unitNumber: item.unitId })),
        startDate: toApiDate(startDate),
        months
      })
    } catch (error) {
      setSubmitting(false)
      await dialog.alert({ tone: 'danger', title: 'Chưa giữ được kho', message: `${error.message}\nCác kho vẫn nằm trong giỏ, bạn có thể bỏ kho bị trùng rồi đặt lại.` })
      return
    }
    setSubmitting(false)

    const code = reservation.reservationCode || newOrderCode()
    saveCartOrder({
      code,
      facilityId: activeGroup.facilityId,
      facilityName: activeGroup.name,
      reservationIds: [reservation.reservationId],
      startDate: toApiDate(startDate),
      months,
      createdAt: new Date().toISOString()
    })
    removeManyFromCart(selected.map(item => item.key))
    setOrder({ code, reservation, items: selected, startDate, endDate, months, depositMonths, facilityName: activeGroup.name, paid: false })
    setStep('payment')
  }

  const expiresAt = order ? Date.parse(order.reservation.depositExpiresAt) : null
  const secondsLeft = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null
  const orderDeposit = order ? Number(order.reservation.depositAmount || 0) : 0

  const payDeposit = async () => {
    if (secondsLeft === 0) {
      await dialog.alert({ tone: 'warning', title: 'Hết thời gian giữ kho', message: 'Thời gian giữ kho đã hết, các kho đã được trả lại. Vui lòng đặt lại.' })
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
    try {
      // Backend yêu cầu số tiền đúng bằng tổng tiền cọc của đơn.
      await apiPost('/api/payment/confirm', { reservationID: order.reservation.reservationId, amount: orderDeposit, paymentType: 'QR' })
      setOrder(current => ({ ...current, paid: true }))
      setStep('done')
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa ghi nhận được tiền cọc', message: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  /* ---------- Bước 3: hoàn tất ---------- */
  if (step === 'done' && order) {
    return (
      <main className="cart-page">
        <div className="container">
          <section className="cart-done">
            <span className="cart-done-icon" aria-hidden="true">✓</span>
            <h1>Đã ghi nhận tiền cọc cho {order.items.length} kho</h1>
            <p>Mã đơn <strong>{order.code}</strong> · {order.facilityName} · {fmtDate(order.startDate)} → {fmtDate(order.endDate)}</p>
            <ol className="cart-next-steps">
              <li className="done">Đặt cọc <span>Đã xong</span></li>
              <li>Facility Manager duyệt và phân kho <span>Đang chờ</span></li>
              <li>Ký hợp đồng online (mục Hợp đồng) <span>Sau khi được duyệt</span></li>
              <li>Nhận kho tại cơ sở, đối chiếu CCCD</li>
            </ol>
            <div className="cart-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={() => navigate('/search')}>Tìm thêm kho</button>
              <button type="button" className="dashboard-primary-btn" onClick={() => navigate('/customer')}>Xem đơn của tôi</button>
            </div>
          </section>
        </div>
      </main>
    )
  }

  /* ---------- Bước 2: đặt cọc ---------- */
  if (step === 'payment' && order) {
    return (
      <main className="cart-page">
        <div className="container">
          <div className="cart-heading">
            <div><span className="customer-eyebrow">DEPOSIT</span><h1>Thanh toán tiền cọc</h1><p>Mã đơn <strong>{order.code}</strong> · {order.facilityName}</p></div>
            <ol className="cart-steps"><li className="done">Giỏ hàng</li><li className="active">Đặt cọc</li><li>Chờ duyệt & ký hợp đồng</li></ol>
          </div>
          <div className="cart-layout">
            <section className="cart-card">
              <h2>Kho đã được giữ cho bạn · 1 hợp đồng</h2>
              <div className="admin-table-wrap"><table className="cart-table"><thead><tr><th>Kho</th><th>Loại · Kích thước</th><th>Giá / tháng</th><th>Tiền cọc</th></tr></thead><tbody>
                {order.items.map(item => {
                  const monthly = effectiveMonthly(item.price, order.months)
                  return (
                    <tr key={item.key}>
                      <td><strong>{item.unitId}</strong></td>
                      <td>{item.type} · {item.size}</td>
                      <td>{money(monthly)}</td>
                      <td>{money(monthly * order.depositMonths)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr><td colSpan="2">Tổng ({order.items.length} kho)</td><td>{money(order.reservation.monthlyPrice)}</td><td><strong>{money(orderDeposit)}</strong></td></tr></tfoot>
              </table></div>
              <p className="cart-note">Mã đơn <strong>{order.code}</strong> · thuê từ <strong>{fmtDate(order.startDate)}</strong> đến <strong>{fmtDate(order.endDate)}</strong> ({order.months} tháng). Tổng tiền thuê {money(order.reservation.rentalAmount)}. Tiền cọc hoàn lại khi trả kho.</p>
            </section>
            <aside className="cart-summary">
              <h2>Tổng tiền cọc</h2>
              <strong className="cart-total">{money(orderDeposit)}</strong>
              <p className={`cart-countdown${secondsLeft === 0 ? ' expired' : ''}`}>
                {secondsLeft === 0 ? 'Đã hết thời gian giữ kho.' : `Thanh toán trong ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
              </p>
              <p className="cart-note">Nội dung chuyển khoản: <strong>{order.code}</strong></p>
              <button type="button" className="dashboard-primary-btn full" disabled={submitting || secondsLeft === 0} onClick={payDeposit}>
                {submitting ? 'Đang ghi nhận...' : 'Tôi đã thanh toán tiền cọc'}
              </button>
              <p className="cart-note small">Thanh toán hiện là mô phỏng: hệ thống ghi nhận khi bạn bấm xác nhận.</p>
            </aside>
          </div>
        </div>
      </main>
    )
  }

  /* ---------- Bước 1: giỏ hàng ---------- */
  return (
    <main className="cart-page">
      <div className="container">
        <div className="cart-heading">
          <div><span className="customer-eyebrow">MY CART</span><h1>Giỏ hàng thuê kho</h1><p>Thuê nhiều kho cùng lúc. Mỗi lần đặt gồm các kho của <strong>một cơ sở</strong> và được làm chung <strong>một hợp đồng</strong>.</p></div>
          <ol className="cart-steps"><li className="active">Giỏ hàng</li><li>Đặt cọc</li><li>Chờ duyệt & ký hợp đồng</li></ol>
        </div>

        {items.length === 0 ? (
          <div className="empty-state cart-empty">
            <p>Giỏ hàng đang trống.</p>
            <button type="button" className="dashboard-primary-btn" onClick={() => navigate('/search')}>Tìm kho để thêm vào giỏ</button>
          </div>
        ) : (
          <div className="cart-layout">
            <div className="cart-main">
              {groups.map(group => {
                const active = String(group.facilityId) === String(facilityId)
                const availableCount = group.items.filter(i => i.available).length
                return (
                  <section key={group.facilityId} className={`cart-card cart-group${active ? ' active' : ''}`}>
                    <label className="cart-group-head">
                      <input type="radio" name="cart-facility" checked={active} onChange={() => setFacilityId(group.facilityId)} disabled={!availableCount} />
                      <div>
                        <h2>{group.name}</h2>
                        <p>{group.items.length} kho trong giỏ · {availableCount} còn trống{!active && availableCount ? ' · chọn để đặt các kho này' : ''}</p>
                      </div>
                    </label>
                    <ul className="cart-items">
                      {group.items.map(item => {
                        const checked = active && item.available && !excluded.has(item.key)
                        return (
                          <li key={item.key} className={`cart-item${item.available ? '' : ' unavailable'}${active ? '' : ' muted'}`}>
                            <input
                              type="checkbox"
                              aria-label={`Chọn kho ${item.unitId}`}
                              checked={checked}
                              disabled={!active || !item.available}
                              onChange={() => toggleItem(item.key)}
                            />
                            <div className="cart-item-art"><UnitTypeArt type={item.type} size={item.size} unitCode={item.unitId} /></div>
                            <div className="cart-item-info">
                              <button type="button" className="cart-item-code" onClick={() => item.facility && item.unit && navigate(getUnitPath(item.facility, item.unit))}>{item.unitId}</button>
                              <div className="cart-item-tags"><UnitTypeChip type={item.type} compact /> <span>{item.size}</span></div>
                              {!item.available && <span className="cart-pill bad">Không còn trống</span>}
                            </div>
                            <div className="cart-item-price">
                              <strong>{money(item.price)}</strong><small>/tháng</small>
                              {effectiveMonthly(item.price, months) < item.price && <span className="cart-item-discount">Gói {months} tháng: {money(effectiveMonthly(item.price, months))}/tháng</span>}
                            </div>
                            <button type="button" className="cart-remove" onClick={() => removeItem(item)} aria-label={`Bỏ kho ${item.unitId} khỏi giỏ`}>×</button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}

              {activeGroup && (
                <section className="cart-card">
                  <h2>Thời gian thuê (áp dụng cho cả hợp đồng)</h2>
                  <div className="cart-terms" role="radiogroup" aria-label="Gói thời hạn thuê">
                    {RENTAL_TERMS.map(term => (
                      <button key={term} type="button" role="radio" aria-checked={months === term} className={`duration-package${months === term ? ' active' : ''}`} onClick={() => setMonths(term)}>
                        <span className="duration-package-months"><strong>{term}</strong> tháng</span>
                        <span className="duration-package-total">{money(quote(selected.map(item => item.price), term, activeGroup?.facilityId).rent)}</span>
                        {quote([1000000], term, activeGroup?.facilityId).discountPercent > 0 && <span className="duration-package-saving">Giảm {quote([1000000], term, activeGroup?.facilityId).discountPercent}%</span>}
                        <span className="duration-package-end">{startDate ? `Đến ${fmtDate(endDateFor(startDate, term))}` : term === 6 ? 'Nửa năm' : 'Một năm'}</span>
                      </button>
                    ))}
                  </div>
                  <RentalCalendar value={startDate} endDate={endDate} durationMonths={months} onChange={setStartDate} />
                </section>
              )}
            </div>

            <aside className="cart-summary">
              <h2>Tóm tắt đơn</h2>
              <p className="cart-summary-facility">{activeGroup ? activeGroup.name : 'Chưa chọn cơ sở'}</p>
              <dl>
                <div><dt>Số kho</dt><dd>{selected.length}{selected.length > CHECKOUT_LIMIT ? ` (tối đa ${CHECKOUT_LIMIT})` : ''}</dd></div>
                <div><dt>Tiền thuê / tháng{cartQuote.discountPercent ? ` (đã giảm ${cartQuote.discountPercent}%)` : ''}</dt><dd>{money(monthlyTotal)}</dd></div>
                <div><dt>Thời hạn</dt><dd>{months} tháng</dd></div>
                <div><dt>Tổng tiền thuê</dt><dd>{money(rentTotal)}</dd></div>
                {cartQuote.saving > 0 && <div className="cart-sum-saving"><dt>Tiết kiệm nhờ gói {months} tháng</dt><dd>−{money(cartQuote.saving)}</dd></div>}
                <div className="cart-sum-deposit"><dt>Tiền cọc ({depositMonths} tháng / kho)</dt><dd>{money(depositTotal)}</dd></div>
              </dl>
              <p className="cart-note">Thanh toán ngay: <strong>tiền cọc</strong>. Tiền thuê thanh toán sau khi ký hợp đồng.</p>
              <button type="button" className="dashboard-primary-btn full" disabled={submitting || !selected.length} onClick={checkout}>
                {submitting ? 'Đang giữ kho...' : selected.length ? `Đặt cọc ${selected.length} kho` : 'Chọn kho để đặt'}
              </button>
              <p className="cart-note small">Kho trong giỏ chưa được giữ chỗ. Sau khi bấm đặt cọc, các kho được giữ {holdMinutes} phút và làm chung một hợp đồng.</p>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
