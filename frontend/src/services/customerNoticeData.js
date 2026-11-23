/**
 * ======================================================================
 * FILE: src/services/customerNoticeData.js  —  TÍNH THÔNG BÁO CHO KHÁCH HÀNG (CHỈ Ở FRONTEND)
 * CHỨC NĂNG: Backend KHÔNG có bảng / API thông báo riêng: file này TÍNH LẠI danh sách thông báo mỗi lần
 *   dữ liệu thay đổi, từ các dữ liệu sẵn có của khách (đơn đặt kho, gia hạn, chính sách, trả kho, kiểm kho),
 *   và quản lý trạng thái "đã xem" (localStorage theo email) để hiện số badge trên menu và chuông thông báo.
 *   Mỗi thông báo có id ổn định (vd "expiring:120:d7"); tới mốc gần hơn (14/7/3 ngày) id đổi nên thông báo hiện lại.
 *   Thuộc tính: section = tab menu ('contract'|'payment'|'storage'|'policy'), tone = 'danger'|'warn'|'info'|'ok'.
 * THÀNH PHẦN CHÍNH:
 *   - buildCustomerNotifications : hàm thuần tạo mảng thông báo đã sắp theo độ ưu tiên.
 *   - useCustomerNotifications   : hook React bọc hàm trên + quản lý "đã xem" (markSection, markAll, countBySection).
 *   - Hàm phụ: money, isoDay, parseUtc, fmtTimeVn, daysUntil, stageOf, unitsText, seenKey/readSeen/writeSeen.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx, src/features/notification/HeaderNotificationBell.jsx
 *   (cả hai dùng useCustomerNotifications).
 * PHỤ THUỘC: react, ./policies (POLICY_TITLES, describePolicy, fmtDay), ./storageRules (formatVnd),
 *   src/demoClock/demoClock (getTodayDate: "hôm nay" theo Demo Clock); localStorage.
 * API: Không gọi API trực tiếp. Dữ liệu đầu vào do trang gọi trước rồi truyền vào:
 *   GET /api/customer-reservations/mine, GET /api/contract-renewals/mine, GET /api/policies,
 *   GET /api/unit-returns/mine, GET /api/return-inspections/mine.
 * LUỒNG: CustomerAccount / HeaderNotificationBell tải dữ liệu -> useCustomerNotifications({ email, rentals, ... })
 *   -> buildCustomerNotifications() tạo danh sách -> lọc id chưa xem (readSeen) -> countBySection hiện badge
 *   -> khách mở tab -> markSection(section) -> writeSeen() lưu localStorage -> badge biến mất.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng tiền làm tròn kèm "đ" (vd 1500000 -> "1.500.000đ") → dùng ở: buildCustomerNotifications
 *   isoDay: Cắt chuỗi ngày/giờ ISO lấy phần 'YYYY-MM-DD' → dùng ở: daysUntil, buildCustomerNotifications
 *   parseUtc: Parse thời điểm backend trả về theo giờ UTC → dùng ở: buildCustomerNotifications
 *   fmtTimeVn: Định dạng milisecond thành "HH:mm dd/MM" theo vi-VN → dùng ở: buildCustomerNotifications
 *   daysUntil: Tính số ngày từ "hôm nay" (theo Demo Clock) tới một ngày ISO (âm = đã qua) → dùng ở: buildCustomerNotifications
 *   stageOf: Phân mốc nhắc hạn theo số ngày còn lại: <=3 'd3', <=7 'd7', <=14 'd14', còn lại 'd30' → dùng ở: buildCustomerNotifications
 *   unitsText: Ghép danh sách số kho của 1 đơn thành chuỗi "A01, A02" để đưa vào câu thông báo → dùng ở: buildCustomerNotifications
 *   buildCustomerNotifications: Tạo danh sách thông báo cho khách từ dữ liệu đơn/gia hạn/chính sách/trả kho/kiểm kho → dùng ở: useCustomerNotifications
 *   push: Thêm 1 thông báo vào danh sách (priority mặc định 50 nếu không truyền) → dùng ở: buildCustomerNotifications
 *   rentalById: Tìm đơn đặt kho theo reservationId trong danh sách rentals → dùng ở: buildCustomerNotifications
 *   seenKey: Tạo key localStorage lưu danh sách thông báo đã xem theo email → dùng ở: readSeen, writeSeen
 *   readSeen: Đọc tập id thông báo đã xem của 1 email từ localStorage → dùng ở: useCustomerNotifications
 *   writeSeen: Ghi tập id thông báo đã xem (giữ tối đa 400 id gần nhất) vào localStorage → dùng ở: useCustomerNotifications
 *   useCustomerNotifications: Hook React: tính thông báo cho khách + quản lý trạng thái "đã xem" (đọc/ghi localStorage theo email) → dùng ở: HeaderNotificationBell.jsx (useHeaderNotices), CustomerAccount.jsx (CustomerDashboard)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { POLICY_TITLES, describePolicy, fmtDay } from './policies'
import { formatVnd } from './storageRules'
import { getTodayDate } from '../demoClock/demoClock'

/**
 * Định dạng tiền làm tròn kèm "đ" (vd 1500000 -> "1.500.000đ").
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
// Số milisecond trong 1 ngày.
const DAY = 86400000
/**
 * Cắt chuỗi ngày/giờ ISO lấy phần 'YYYY-MM-DD'.
 */
const isoDay = iso => (iso ? String(iso).slice(0, 10) : null)
/**
 * Parse thời điểm backend trả về theo giờ UTC. Backend có lúc trả không kèm "Z" (vd HoldExpiresAt),
 * khi đó Date.parse hiểu thành giờ máy (VN) và lệch 7 tiếng -> đơn chờ cọc bị coi là hết giờ giữ kho.
 * Vì vậy tự thêm "Z" khi chuỗi thiếu múi giờ.
 * @param {string} value chuỗi thời điểm từ backend.
 * @returns {number} milisecond (NaN nếu rỗng).
 */
const parseUtc = value => {
  if (!value) return NaN
  const text = String(value)
  return Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
}
/**
 * Định dạng milisecond thành "HH:mm dd/MM" theo vi-VN.
 */
const fmtTimeVn = ms => new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
/**
 * Tính số ngày từ "hôm nay" (theo Demo Clock) tới một ngày ISO (âm = đã qua).
 * @param {string} iso ngày đích.
 * @returns {number|null} số ngày, null nếu iso rỗng.
 */
const daysUntil = iso => {
  if (!iso) return null
  const [y, m, d] = isoDay(iso).split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  // [THỜI GIAN THỰC]:
  // const now = new Date()
  // const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  // [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock để tính thông báo hết hạn
  const todayDate = getTodayDate()
  const today = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate())
  return Math.round((target - today) / DAY)
}
/**
 * Phân mốc nhắc hạn theo số ngày còn lại: <=3 'd3', <=7 'd7', <=14 'd14', còn lại 'd30'.
 */
const stageOf = days => (days <= 3 ? 'd3' : days <= 7 ? 'd7' : days <= 14 ? 'd14' : 'd30')
/**
 * Ghép danh sách số kho của 1 đơn thành chuỗi "A01, A02" để đưa vào câu thông báo.
 */
const unitsText = r => (r?.units?.length ? r.units.map(u => u.number).filter(Boolean).join(', ') : r?.unitId) || ''
// Thứ tự phụ khi sắp xếp thông báo cùng priority: nguy hiểm trước, thành công sau.
const TONE_RANK = { danger: 0, warn: 1, info: 2, ok: 3 }

/**
 * Tạo danh sách thông báo cho khách từ dữ liệu đơn/gia hạn/chính sách/trả kho/kiểm kho.
 * Các loại: chờ trả cọc, chờ thanh toán gia hạn, hợp đồng/phụ lục chờ ký, lịch nhận kho, kho sắp hết hạn
 * / quá hạn, hoàn cọc khi hủy, trả kho & kết quả kiểm kho (chờ xác nhận, khiếu nại, đã quyết toán, còn nợ phí),
 * gia hạn thành công, chính sách vừa cập nhật / sắp áp dụng.
 * @param {{rentals, renewals, policies, returns, inspections}} data dữ liệu đã tải từ các API ở đầu file.
 * @returns {object[]} danh sách { id, section, tone, priority, title, message, action } đã sắp theo độ ưu tiên
 *   (priority nhỏ = quan trọng hơn). action mô tả nút bấm: { label, section, signContractId?, focusReservationId?, renewReservationId? }.
 * Được gọi bởi useCustomerNotifications (cùng file). Không gọi API.
 */
export function buildCustomerNotifications({ rentals = [], renewals = null, policies = null, returns = null, inspections = null }) {
  const list = []
  // Thêm 1 thông báo vào danh sách (priority mặc định 50 nếu không truyền).
  const push = item => list.push({ priority: 50, ...item })
  const values = policies?.values || {}
  const rr = values.renewal_return || {}
  const returnNotice = rr.returnNoticeDays ?? 7
  const refundDays = rr.depositRefundWorkingDays ?? 7
  const renewalItems = Array.isArray(renewals?.items) ? renewals.items : []
  // Tìm đơn đặt kho theo reservationId trong danh sách rentals.
  const rentalById = id => rentals.find(r => String(r.reservationId) === String(id))

  // 1) Đơn chờ thanh toán cọc / yêu cầu gia hạn chờ thanh toán
  rentals.filter(r => r.status === 'Pending Deposit' && r.paymentStatus !== 'Completed').forEach(r => {
    const expiresAt = parseUtc(r.depositExpiresAt) // giờ UTC (xem parseUtc)
    const left = Number.isNaN(expiresAt) ? 0 : expiresAt - Date.now()
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
      message: `Kho ${unitsText(r)} tại ${r.facility} đang được giữ cho bạn đến ${fmtTimeVn(expiresAt)} (còn ${minutes} phút). Thanh toán ${money(r.depositAmount)} tiền cọc để giữ kho, quá giờ đơn tự hủy và kho mở lại cho khách khác.${r.paymentStatus === 'Pending' ? ' Lần trước bạn đã mở VNPay nhưng chưa hoàn tất.' : ''}`,
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

  // 3b) Tiền thuê: quá hạn (đỏ) hoặc sắp đến hạn trong 7 ngày tới (vàng; hôm nay = đến hạn). Email nhắc do backend gửi (RentReminderJob).
  rentals.filter(r => r.status === 'Handed Over').forEach(r => {
    if (Number(r.rentOverdue) > 0) {
      push({
        id: `rent-overdue:${r.reservationId}`,
        section: 'payment', tone: 'danger', priority: 4,
        title: 'Tiền thuê đã quá hạn',
        message: `Kho ${unitsText(r)} tại ${r.facility} đang nợ ${money(r.rentOverdue)} tiền thuê quá hạn. Vui lòng đóng sớm để tránh phí trễ hạn.`,
        action: { label: 'Đóng tiền thuê', section: 'payment' }
      })
      return
    }
    const days = r.nextRentDueDate ? daysUntil(r.nextRentDueDate) : null
    if (days == null || days < 0 || days > 7) return
    push({
      id: `rent-due:${r.reservationId}:${String(r.nextRentDueDate).slice(0, 10)}`,
      section: 'payment', tone: 'warn', priority: days === 0 ? 6 : 15,
      title: days === 0 ? 'Hôm nay là hạn đóng tiền thuê' : `Sắp đến hạn đóng tiền thuê (còn ${days} ngày)`,
      message: `Kho ${unitsText(r)} tại ${r.facility}: cần đóng ${money(r.nextRentDueAmount)} trước hạn ${fmtDay(r.nextRentDueDate)}.`,
      action: { label: 'Đóng tiền thuê', section: 'payment' }
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
  const inspectionItems = Array.isArray(inspections?.items) ? inspections.items : []
  ;(Array.isArray(returns?.items) ? returns.items : []).filter(i => i.request).forEach(i => {
    const q = i.request
    const units = i.units.join(', ')
    // Có phí kiểm kho: chưa trừ cọc cho tới khi khách xác nhận / khiếu nại được giải quyết
    const insp = inspectionItems.find(x => String(x.reservationId) === String(i.reservationId))
    if (q.status === 'Completed' && insp && insp.settledBy !== 'NoFee') {
      const deadline = parseUtc(insp.confirmDeadline)
      if (insp.status === 'Awaiting Customer') {
        const hoursLeft = Number.isNaN(deadline) ? null : Math.ceil((deadline - Date.now()) / 3600000)
        push({
          // Còn dưới 24 giờ là id mới -> nhắc lại dù khách đã xem
          id: `inspection-confirm:${insp.inspectionId}:${hoursLeft != null && hoursLeft <= 24 ? 'h24' : 'new'}`,
          section: 'contract', tone: 'danger', priority: 2,
          title: hoursLeft != null && hoursLeft <= 24 ? 'Sắp hết hạn xác nhận kết quả kiểm kho' : 'Kết quả kiểm kho chờ bạn xác nhận',
          message: `Nhân viên ghi nhận phí kiểm kho ${money(insp.proposedTotal)} cho kho ${units}${insp.staffImageCount ? ` kèm ${insp.staffImageCount} ảnh` : ''}. Tiền cọc CHƯA bị trừ: vui lòng xem ảnh rồi đồng ý hoặc khiếu nại trước ${Number.isNaN(deadline) ? 'hạn' : fmtTimeVn(deadline)}. Quá hạn hệ thống tự xác nhận và trừ vào cọc.`,
          action: { label: 'Xem & xác nhận', section: 'contract', focusReservationId: i.reservationId }
        })
        return
      }
      if (insp.status === 'Disputed') {
        push({
          id: `inspection-disputed:${insp.inspectionId}`,
          section: 'contract', tone: 'info', priority: 24,
          title: 'Khiếu nại kiểm kho đang được xem xét',
          message: `Facility Manager đang đối chiếu ảnh và khiếu nại của bạn về phí kiểm kho ${money(insp.proposedTotal)} (kho ${units}). Tiền cọc chưa bị trừ cho tới khi có quyết định.`,
          action: { label: 'Xem trả kho', section: 'contract', focusReservationId: i.reservationId }
        })
        return
      }
      if (insp.settledBy === 'Manager') {
        push({
          id: `inspection-resolved:${insp.inspectionId}`,
          section: 'contract', tone: Number(insp.finalTotal) < Number(insp.proposedTotal) ? 'ok' : 'info', priority: 6,
          title: 'Đã có quyết định khiếu nại kiểm kho',
          message: `Phí kiểm kho chốt ${money(insp.finalTotal)} (đề xuất ${money(insp.proposedTotal)}).${insp.resolutionNotes ? ` ${insp.resolutionNotes}` : ''}`,
          action: { label: 'Xem chi tiết', section: 'contract', focusReservationId: i.reservationId }
        })
      } else if (insp.settledBy === 'Auto') {
        push({
          id: `inspection-auto:${insp.inspectionId}`,
          section: 'contract', tone: 'info', priority: 6,
          title: 'Hệ thống đã tự xác nhận kết quả kiểm kho',
          message: `Quá hạn xác nhận nên phí kiểm kho ${money(insp.finalTotal)} của kho ${units} đã được trừ vào tiền cọc theo đề xuất của nhân viên.`,
          action: { label: 'Xem chi tiết', section: 'contract', focusReservationId: i.reservationId }
        })
      }
    }
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
/**
 * Tạo key localStorage lưu danh sách thông báo đã xem theo email.
 */
const seenKey = email => `storespace_seen_notifications:${String(email || 'guest').toLowerCase()}`
/**
 * Đọc tập id thông báo đã xem của 1 email từ localStorage.
 */
const readSeen = email => {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(email)) || '[]')) } catch { return new Set() }
}
/**
 * Ghi tập id thông báo đã xem (giữ tối đa 400 id gần nhất) vào localStorage.
 */
const writeSeen = (email, set) => {
  try { localStorage.setItem(seenKey(email), JSON.stringify([...set].slice(-400))) } catch { /* bỏ qua */ }
}

/**
 * Hook React: tính thông báo cho khách + quản lý trạng thái "đã xem" (đọc/ghi localStorage theo email).
 * Được gọi bởi CustomerAccount (badge menu, trang Thông báo) và HeaderNotificationBell (chuông trên header).
 * @param {{email, rentals, renewals, policies, returns, inspections}} args email khách + dữ liệu đã tải từ API.
 * @returns {{notifications, seen, unseenCount, countBySection, markSection, markAll, isSeen}}
 *   countBySection = số thông báo chưa xem theo từng tab (để hiện badge trên menu).
 */
export function useCustomerNotifications({ email, rentals, renewals, policies, returns, inspections }) {
  // Tính lại danh sách thông báo mỗi khi dữ liệu đầu vào thay đổi (useMemo).
  const notifications = useMemo(
    () => buildCustomerNotifications({ rentals, renewals, policies, returns, inspections }),
    [rentals, renewals, policies, returns, inspections]
  )
  const [seen, setSeen] = useState(() => readSeen(email))
  // Khi đổi tài khoản (email đổi): đọc lại tập "đã xem" của tài khoản mới.
  useEffect(() => { setSeen(readSeen(email)) }, [email])

  // Đánh dấu một danh sách id thông báo là đã xem và lưu xuống localStorage.
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
  // Đánh dấu tất cả thông báo thuộc 1 tab (section) là đã xem (khi khách mở tab đó).
  const markSection = useCallback(section => {
    markSeen(notifications.filter(n => n.section === section).map(n => n.id))
  }, [notifications, markSeen])
  // Đánh dấu toàn bộ thông báo là đã xem.
  const markAll = useCallback(() => markSeen(notifications.map(n => n.id)), [notifications, markSeen])

  return { notifications, seen, unseenCount: unseen.length, countBySection, markSection, markAll, isSeen: id => seen.has(id) }
}
