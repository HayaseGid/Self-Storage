import { useCallback, useEffect, useMemo, useState } from 'react'
import { POLICY_TITLES, describePolicy, fmtDay } from './policies'
import { formatVnd } from './storageRules'

/*
 * THÔNG BÁO CHO KHÁCH HÀNG (chỉ frontend, không cần bảng / API mới).
 * Thông báo được tính từ dữ liệu sẵn có mỗi lần mở trang:
 *   - danh sách đặt chỗ của khách (GET /api/customer-reservations/mine)
 *   - thông tin gia hạn (GET /api/contract-renewals/mine)
 *   - chính sách hiện hành + chính sách sắp áp dụng (GET /api/policies)
 * Mỗi thông báo có id ổn định (vd "expiring:120:d7"). Khách mở đúng mục (Hợp đồng, Thanh toán...)
 * hoặc trang Thông báo thì các id đó được lưu là "đã xem" (localStorage theo email) -> số trên menu biến mất.
 * Mốc gần hơn (còn 14 / 7 / 3 ngày) là id mới nên thông báo hiện lại.
 *
 * section: mục trên menu trái mà thông báo thuộc về ('contract' | 'payment' | 'storage' | 'policy')
 * tone:    'danger' | 'warn' | 'info' | 'ok'
 */

const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
const DAY = 86400000
const isoDay = iso => (iso ? String(iso).slice(0, 10) : null)
const daysUntil = iso => {
  if (!iso) return null
  const [y, m, d] = isoDay(iso).split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / DAY)
}
const stageOf = days => (days <= 3 ? 'd3' : days <= 7 ? 'd7' : days <= 14 ? 'd14' : 'd30')
const unitsText = r => (r?.units?.length ? r.units.map(u => u.number).filter(Boolean).join(', ') : r?.unitId) || ''
const TONE_RANK = { danger: 0, warn: 1, info: 2, ok: 3 }

export function buildCustomerNotifications({ rentals = [], renewals = null, policies = null, returns = null }) {
  const list = []
  const push = item => list.push({ priority: 50, ...item })
  const values = policies?.values || {}
  const rr = values.renewal_return || {}
  const returnNotice = rr.returnNoticeDays ?? 7
  const refundDays = rr.depositRefundWorkingDays ?? 7
  const renewalItems = Array.isArray(renewals?.items) ? renewals.items : []
  const rentalById = id => rentals.find(r => String(r.reservationId) === String(id))

  // 1) Đơn chờ thanh toán cọc / yêu cầu gia hạn chờ thanh toán
  rentals.filter(r => r.status === 'Pending Deposit' && r.paymentStatus !== 'Completed').forEach(r => {
    const left = r.depositExpiresAt ? Date.parse(r.depositExpiresAt) - Date.now() : 0
    if (left <= 0) return
    const minutes = Math.max(1, Math.ceil(left / 60000))
    push(r.isRenewal ? {
      id: `renewal-pay:${r.reservationId}`,
      section: 'contract', tone: 'warn', priority: 5,
      title: 'Yêu cầu gia hạn đang chờ thanh toán',
      message: `Gia hạn kho ${unitsText(r)} tại ${r.facility}: cần thanh toán ${money(r.depositAmount)} trong ${minutes} phút nữa để hoàn tất.`,
      action: { label: 'Thanh toán gia hạn', section: 'contract' }
    } : {
      id: `deposit:${r.reservationId}`,
      section: 'payment', tone: 'warn', priority: 5,
      title: 'Đơn đặt kho chờ thanh toán cọc',
      message: `Kho ${unitsText(r)} tại ${r.facility} đang được giữ cho bạn thêm ${minutes} phút. Thanh toán ${money(r.depositAmount)} tiền cọc để giữ kho.`,
      action: { label: 'Thanh toán cọc', section: 'payment' }
    })
  })

  // 2) Hợp đồng / phụ lục gia hạn chờ ký
  rentals.filter(r => r.contractId && r.contractStatus === 'Pending Signature' &&
    (r.status === 'Confirmed' || (r.status === 'Handed Over' && (r.isRenewal || r.renewedFrom)))).forEach(r => {
    const renewal = r.status === 'Handed Over'
    push({
      id: `sign:${r.contractId}`,
      section: 'contract', tone: 'warn', priority: 10,
      title: renewal ? 'Phụ lục gia hạn chờ bạn ký' : 'Hợp đồng chờ bạn ký',
      message: renewal
        ? `Bạn đã thanh toán gia hạn kho ${unitsText(r)}. Ký phụ lục ${r.contractNumber || ''} để hoàn tất (${r.startDate} → ${r.endDate}).`
        : `Hợp đồng ${r.contractNumber || ''} cho kho ${unitsText(r)} tại ${r.facility} đã sẵn sàng. Ký online để chuẩn bị nhận kho ngày ${r.startDate}.`,
      action: { label: renewal ? 'Ký phụ lục' : 'Ký hợp đồng', section: 'contract', signContractId: r.contractId, focusReservationId: r.reservationId }
    })
  })

  // 3) Lịch nhận kho (đã ký, chờ bàn giao)
  rentals.filter(r => r.status === 'Confirmed' && r.contractId && r.contractStatus === 'Signed').forEach(r => {
    push({
      id: `pickup:${r.reservationId}`,
      section: 'storage', tone: 'info', priority: 30,
      title: 'Lịch nhận kho',
      message: `Mời bạn đến ${r.facility} nhận kho ${unitsText(r)} vào ngày ${r.startDate}. Nhớ mang theo CCCD để nhân viên đối chiếu.`,
      action: { label: 'Xem kho', section: 'storage' }
    })
  })

  // 4) Kho sắp hết hạn / đã quá hạn (ưu tiên dữ liệu gia hạn từ backend)
  const handled = new Set()
  renewalItems.forEach(item => {
    if (item.renewedBy || item.pendingRenewal) return
    const r = rentalById(item.reservationId)
    if (r && r.status !== 'Handed Over') return
    const days = item.daysLeft ?? daysUntil(item.endDate)
    if (days == null || days > 30) return
    handled.add(String(item.reservationId))
    const units = unitsText(r) || item.contractNumber
    if (days < 0) {
      push({
        id: `overdue:${item.reservationId}`,
        section: 'contract', tone: 'danger', priority: 0,
        title: 'Hợp đồng đã quá hạn',
        message: `Hợp đồng ${item.contractNumber} (kho ${units}) đã hết hạn ngày ${fmtDay(item.endDate)}. Vui lòng liên hệ ${item.facility} để gia hạn hoặc trả kho. Phí trễ hạn: ${describePolicy('overdue', values.overdue).summary}`,
        action: { label: 'Xem hợp đồng', section: 'contract', focusReservationId: item.reservationId }
      })
      return
    }
    push({
      id: `expiring:${item.reservationId}:${stageOf(days)}`,
      section: 'contract', tone: days <= 7 ? 'danger' : 'warn', priority: days <= 7 ? 1 : 20,
      title: days === 0 ? 'Kho của bạn hết hạn hôm nay' : `Kho của bạn sắp hết hạn (còn ${days} ngày)`,
      message: item.eligible
        ? `Kho ${units} tại ${item.facility} hết hạn ngày ${fmtDay(item.endDate)}. Nếu cần dùng tiếp, bạn có thể gia hạn online trước ngày ${fmtDay(item.renewDeadline)}: chỉ trả trước tiền thuê tháng đầu, tiền cọc được chuyển sang kỳ mới. Nếu không gia hạn, vui lòng báo trả kho trước ít nhất ${returnNotice} ngày; tiền cọc được hoàn trong ${refundDays} ngày làm việc sau khi trả kho.`
        : `Kho ${units} tại ${item.facility} hết hạn ngày ${fmtDay(item.endDate)}. ${item.reason || ''} Nếu không gia hạn, vui lòng báo trả kho trước ít nhất ${returnNotice} ngày; tiền cọc được hoàn trong ${refundDays} ngày làm việc sau khi trả kho.`,
      action: item.eligible
        ? { label: 'Gia hạn ngay', section: 'contract', renewReservationId: item.reservationId }
        : { label: 'Xem hợp đồng', section: 'contract', focusReservationId: item.reservationId }
    })
  })
  // Không tải được dữ liệu gia hạn: vẫn nhắc theo ngày hết hạn của đơn.
  rentals.filter(r => r.status === 'Handed Over' && !handled.has(String(r.reservationId)) && !renewalItems.length).forEach(r => {
    if (r.remainingDays == null || r.remainingDays > 30) return
    push({
      id: `expiring:${r.reservationId}:${stageOf(r.remainingDays)}`,
      section: 'contract', tone: r.remainingDays <= 7 ? 'danger' : 'warn', priority: r.remainingDays <= 7 ? 1 : 20,
      title: `Kho của bạn sắp hết hạn (còn ${r.remainingDays} ngày)`,
      message: `Kho ${unitsText(r)} tại ${r.facility} hết hạn ngày ${r.endDate}. Bạn có thể gia hạn trong mục Hợp đồng, hoặc báo trả kho trước ít nhất ${returnNotice} ngày.`,
      action: { label: 'Xem hợp đồng', section: 'contract', focusReservationId: r.reservationId }
    })
  })

  // 4b) Hoàn cọc khi hủy đặt kho
  rentals.filter(r => r.status === 'Cancelled' && Number(r.refundAmount) > 0).forEach(r => {
    const cancelledAgo = r.cancelledAt ? -daysUntil(r.cancelledAt) : 0
    if (r.refundStatus === 'Pending') {
      push({
        id: `refund-pending:${r.reservationId}`,
        section: 'payment', tone: 'warn', priority: 8,
        title: 'Đang hoàn tiền cọc',
        message: `Đơn kho ${unitsText(r)} tại ${r.facility} đã hủy. Khoản hoàn ${money(r.refundAmount)} chưa xử lý xong, bạn có thể gửi lại yêu cầu hoàn trong mục Thanh toán.`,
        action: { label: 'Xem thanh toán', section: 'payment' }
      })
    } else if (cancelledAgo <= 14) {
      push({
        id: `refund-done:${r.reservationId}`,
        section: 'payment', tone: 'ok', priority: 45,
        title: 'Đã hoàn tiền cọc',
        message: `Đã hoàn ${money(r.refundAmount)} cho đơn kho ${unitsText(r)} đã hủy${r.refundProvider === 'VNPay' ? ', về thẻ / tài khoản bạn đã thanh toán qua VNPay (thường 1–3 ngày làm việc tùy ngân hàng)' : ''}.`,
        action: { label: 'Xem thanh toán', section: 'payment' }
      })
    }
  })

  // 4c) Trả kho: lịch hẹn, kết quả kiểm kho, quyết toán / hoàn cọc
  ;(Array.isArray(returns?.items) ? returns.items : []).filter(i => i.request).forEach(i => {
    const q = i.request
    const units = i.units.join(', ')
    if (q.status === 'Scheduled') {
      push({
        id: `return-scheduled:${i.reservationId}:${isoDay(q.scheduledDate)}`,
        section: 'contract', tone: 'info', priority: 25,
        title: 'Lịch trả kho',
        message: `Bạn hẹn trả kho ${units} tại ${i.facility} ngày ${fmtDay(q.scheduledDate)}${q.staffName ? `, nhân viên ${q.staffName} sẽ nhận lại kho` : ''}. Nhớ dọn hết đồ, vệ sinh kho và mang theo khóa / thẻ ra vào.`,
        action: { label: 'Xem trả kho', section: 'contract', focusReservationId: i.reservationId }
      })
    } else if (q.status === 'Completed') {
      const owed = Number(q.amountOwed) || 0
      const refund = Number(q.refundAmount) || 0
      if (owed > 0) {
        push({
          id: `return-owed:${i.reservationId}`,
          section: 'contract', tone: 'danger', priority: 3,
          title: 'Kiểm tra kho: cần đóng thêm phí',
          message: `Kho ${units} có phát sinh ${money(q.deductedFromDeposit + owed)} phí. Tiền cọc ${money(q.depositTotal)} đã được trừ hết, bạn cần đóng thêm ${money(owed)}.${q.notes ? ` Ghi chú: ${q.notes}` : ''}`,
          action: { label: 'Đóng phí', section: 'contract', focusReservationId: i.reservationId }
        })
      } else {
        push({
          id: `return-done:${i.reservationId}`,
          section: 'contract', tone: 'ok', priority: 35,
          title: q.conditionResult === 'Damaged' ? 'Kiểm tra kho xong: có phí trừ vào cọc' : 'Kiểm tra kho xong: không có vấn đề',
          message: `${Number(q.deductedFromDeposit) > 0 ? `Đã trừ ${money(q.deductedFromDeposit)} phí phát sinh vào tiền cọc. ` : ''}${refund > 0 ? `Bạn được hoàn ${money(refund)} tiền cọc, dự kiến ngày ${fmtDay(q.refundDueDate)}.` : 'Tiền cọc đã dùng hết để bù phí.'}`,
          action: { label: 'Xem chi tiết', section: 'contract', focusReservationId: i.reservationId }
        })
        if (refund > 0 && q.refundStatus === 'Completed') {
          push({
            id: `return-refunded:${i.reservationId}`,
            section: 'payment', tone: 'ok', priority: 36,
            title: 'Đã hoàn tiền cọc',
            message: `Đã chuyển ${money(refund)} tiền cọc của kho ${units} cho bạn.`,
            action: { label: 'Xem chi tiết', section: 'contract', focusReservationId: i.reservationId }
          })
        }
      }
    }
  })

  // 5) Gia hạn thành công
  renewalItems.filter(item => item.renewedBy?.isSigned && daysUntil(item.renewedBy.startDate) >= 0).forEach(item => {
    push({
      id: `renewed:${item.renewedBy.contractId}`,
      section: 'contract', tone: 'ok', priority: 40,
      title: 'Gia hạn thành công',
      message: `Hợp đồng ${item.contractNumber} đã được gia hạn bằng phụ lục ${item.renewedBy.contractNumber}, bạn tiếp tục thuê đến ${fmtDay(item.renewedBy.endDate)}.`,
      action: { label: 'Xem hợp đồng', section: 'contract', focusReservationId: item.renewedBy.reservationId }
    })
  })

  // 6) Chính sách: vừa cập nhật (30 ngày) hoặc sắp áp dụng
  const meta = policies?.meta || {}
  Object.entries(meta).forEach(([key, m]) => {
    if (!m?.effectiveFrom || m.isDefault || Number(m.version) <= 1) return
    const ago = -daysUntil(m.effectiveFrom)
    if (ago < 0 || ago > 30) return
    push({
      id: `policy:${key}:v${m.version}`,
      section: 'policy', tone: 'info', priority: 60,
      title: `Cập nhật ${POLICY_TITLES[key] || 'chính sách'}`,
      message: `Áp dụng từ ${fmtDay(m.effectiveFrom)}: ${describePolicy(key, values[key]).summary} Hợp đồng đã ký giữ nguyên điều khoản lúc ký.`,
      action: null
    })
  })
  ;(policies?.scheduled || []).forEach(s => {
    if (!s?.key || !s.effectiveFrom || daysUntil(s.effectiveFrom) < 0) return
    push({
      id: `policy-next:${s.key}:v${s.version}`,
      section: 'policy', tone: 'info', priority: 55,
      title: `${POLICY_TITLES[s.key] || 'Chính sách'} sẽ thay đổi`,
      message: `Từ ngày ${fmtDay(s.effectiveFrom)} áp dụng phiên bản mới: ${describePolicy(s.key, s.value || s.config).summary} Hợp đồng đã ký giữ nguyên điều khoản lúc ký.`,
      action: null
    })
  })

  return list.sort((a, b) => a.priority - b.priority || TONE_RANK[a.tone] - TONE_RANK[b.tone])
}

/* ---------- Trạng thái "đã xem" (localStorage theo tài khoản) ---------- */
const seenKey = email => `storespace_seen_notifications:${String(email || 'guest').toLowerCase()}`
const readSeen = email => {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(email)) || '[]')) } catch { return new Set() }
}
const writeSeen = (email, set) => {
  try { localStorage.setItem(seenKey(email), JSON.stringify([...set].slice(-400))) } catch { /* bỏ qua */ }
}

export function useCustomerNotifications({ email, rentals, renewals, policies, returns }) {
  const notifications = useMemo(
    () => buildCustomerNotifications({ rentals, renewals, policies, returns }),
    [rentals, renewals, policies, returns]
  )
  const [seen, setSeen] = useState(() => readSeen(email))
  useEffect(() => { setSeen(readSeen(email)) }, [email])

  const markSeen = useCallback(ids => {
    setSeen(current => {
      const fresh = ids.filter(id => !current.has(id))
      if (!fresh.length) return current
      const next = new Set(current)
      fresh.forEach(id => next.add(id))
      writeSeen(email, next)
      return next
    })
  }, [email])

  const unseen = notifications.filter(n => !seen.has(n.id))
  const countBySection = unseen.reduce((acc, n) => ({ ...acc, [n.section]: (acc[n.section] || 0) + 1 }), {})
  const markSection = useCallback(section => {
    markSeen(notifications.filter(n => n.section === section).map(n => n.id))
  }, [notifications, markSeen])
  const markAll = useCallback(() => markSeen(notifications.map(n => n.id)), [notifications, markSeen])

  return { notifications, seen, unseenCount: unseen.length, countBySection, markSection, markAll, isSeen: id => seen.has(id) }
}
