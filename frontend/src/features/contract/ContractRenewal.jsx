/**
 * ======================================================================
 * FILE: src/features/contract/ContractRenewal.jsx  —  GIA HẠN HỢP ĐỒNG (PHÍA KHÁCH HÀNG)
 * CHỨC NĂNG: Toàn bộ giao diện + logic gia hạn hợp đồng của khách: tải điều kiện & báo giá gia hạn (backend tính,
 *   frontend chỉ hiển thị), khối nhắc "Gia hạn hợp đồng" đầu tab Hợp đồng, hộp thoại chọn kỳ gia hạn + hình thức trả,
 *   thanh toán (VNPay hoặc mô phỏng), hoàn tất và mở màn hình ký phụ lục gia hạn.
 *   Khi gia hạn: trả ngay tiền thuê THÁNG ĐẦU của kỳ mới (Monthly) hoặc TOÀN BỘ kỳ mới (Upfront), cộng cọc bổ sung nếu
 *   giá tăng; cọc cũ được chuyển sang kỳ mới. Khách tiếp tục dùng kho, không cần bàn giao lại.
 * THÀNH PHẦN CHÍNH:
 *   - fmtIsoDate (export): đổi ngày ISO -> 'dd/MM/yyyy' (nhiều file khác import).
 *   - useContractRenewals (export hook): tải dữ liệu gia hạn của khách.
 *   - payRenewal (export): thanh toán 1 yêu cầu gia hạn (mô phỏng hoặc VNPay).
 *   - finishRenewal (export): báo "Gia hạn thành công" rồi yêu cầu mở màn hình ký phụ lục.
 *   - RenewalSection (export component): khối nhắc gia hạn (chờ thanh toán / sắp hết hạn / đã gia hạn chờ ký).
 *   - RenewalModal (export component): hộp thoại gia hạn 3 bước.
 *   - money, addMonthsIso, minutesLeft: hàm tiện ích nội bộ.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx (useContractRenewals, RenewalSection, RenewalModal, fmtIsoDate),
 *   src/features/notification/HeaderNotificationBell.jsx (useContractRenewals),
 *   src/features/contract/ContractCard.jsx và src/features/payment/PendingPayments.jsx (fmtIsoDate).
 * PHỤ THUỘC: api/api (apiGet, apiPost), services/storageRules (formatVnd), components/common/Dialog (useDialog),
 *   ../payment/DepositConfirm, api/vnpay (SIMULATED_PAYMENT_ENABLED, startVnPayPayment),
 *   services/afterDeposit (announceRenewalSuccess, focusContract, requestContractSign), ContractSignFlow.css,
 *   ContractRenewal.css.
 * API (ContractRenewalsController, + VnPayController khi trả qua VNPay):
 *   GET  /api/contract-renewals/mine           -> { items, rules }: điều kiện + báo giá từng hợp đồng
 *   POST /api/contract-renewals                -> { reservationId, months, paymentPlan, expectedAmount } tạo yêu cầu chờ thanh toán
 *        paymentPlan: "Monthly" (trả ngay tháng đầu kỳ mới) | "Upfront" (trả ngay toàn bộ kỳ mới) — mặc định giữ hình thức cũ
 *   POST /api/vnpay/create                     -> thanh toán qua VNPay (kind 'renewal')
 *   POST /api/contract-renewals/{id}/pay-demo  -> thanh toán mô phỏng (chỉ khi VITE_ALLOW_SIMULATED_PAYMENT=true)
 *   POST /api/contract-renewals/{id}/finalize  -> hoàn tất gia hạn khi đã trả tiền
 *   POST /api/contract-renewals/{id}/cancel    -> hủy yêu cầu gia hạn chưa thanh toán
 * LUỒNG: bấm "Gia hạn" -> RenewalModal: chọn số tháng + hình thức trả -> "Tiếp tục" -> tick 2 ô DepositConfirm
 *   -> "Thanh toán" -> submit(): POST /api/contract-renewals -> payRenewal() (VNPay: chuyển trang; mô phỏng: pay-demo)
 *   -> finishRenewal(): dialog "Gia hạn thành công, vui lòng ký phụ lục" -> requestContractSign(contractId)
 *   (ghi sessionStorage + phát sự kiện mở tab Hợp đồng) -> CustomerAccount mở ContractSignFlow để ký phụ lục.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ" → dùng ở: finishRenewal, RenewalSection, RenewalModal
 *   fmtIsoDate: Đổi ngày ISO ('2026-05-01...') thành 'dd/MM/yyyy' (rỗng -> '—') → dùng ở: RenewalSection, RenewalModal; ContractCard.jsx, PendingPayments.jsx (CustomerPaymentCenter), CustomerAccount.jsx
 *   addMonthsIso: Tính ngày kết thúc sau `months` tháng kể từ ngày ISO (trừ 1 ngày), dùng hiển thị hết tháng đầu của kỳ gia hạn → dùng ở: RenewalModal
 *   minutesLeft: Số phút còn lại tới một thời điểm ISO (không âm), dùng hiện "còn N phút" giữ yêu cầu gia hạn chờ thanh toán → dùng ở: RenewalSection, submit
 *   useContractRenewals: Hook: tải thông tin gia hạn của khách (điều kiện, báo giá, yêu cầu đang chờ, đã gia hạn) một lần khi mount → dùng ở: HeaderNotificationBell.jsx (useHeaderNotices), CustomerAccount.jsx (MyStoragePage, ContractPage +1)
 *   byReservation: Tìm thông tin gia hạn của 1 hợp đồng theo reservationId → dùng ở: useContractRenewals
 *   payRenewal: Thanh toán 1 yêu cầu gia hạn đang chờ: nếu bật chế độ demo thì hỏi khách chọn "Mô phỏng" hay "Qua VNPay" → dùng ở: continuePay, submit
 *   finishRenewal: Sau khi gia hạn xong: hiện thông báo "Gia hạn thành công, vui lòng ký phụ lục gia hạn" (announceRenewalSuccess) → dùng ở: continuePay, submit
 *   RenewalSection: Khối "Gia hạn hợp đồng" đầu tab Hợp đồng, gồm 3 loại thẻ: yêu cầu gia hạn chờ thanh toán (nút Hủy / Thanh toán / Hoàn tất) → dùng ở: CustomerAccount.jsx (ContractPage)
 *   refresh: Tải lại dữ liệu gia hạn và báo cha tải lại dữ liệu đơn → dùng ở: continuePay, cancelPending
 *   continuePay: Tiếp tục yêu cầu gia hạn đang chờ: đã trả thì hoàn tất, chưa trả thì thanh toán → dùng ở: RenewalSection
 *   cancelPending: Hủy yêu cầu gia hạn chưa thanh toán (hỏi xác nhận trước) → dùng ở: RenewalSection
 *   RenewalModal: Hộp thoại gia hạn 3 bước: 1) 'plan' chọn kỳ (số tháng) + hình thức trả, xem bảng giá từng kho; 2) 'pay' xác nhận bằng DepositConfirm → dùng ở: CustomerAccount.jsx (MyStoragePage, ContractPage)
 *   dueOf: Số tiền phải trả ngay của 1 báo giá theo hình thức trả đang chọn → dùng ở: RenewalModal
 *   submit: Tạo yêu cầu gia hạn rồi thanh toán ngay → dùng ở: RenewalModal
 */
import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/api'
import { formatVnd } from '../../services/storageRules'
import { useDialog } from '../../components/common/Dialog'
import DepositConfirm from '../payment/DepositConfirm'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'
import { announceRenewalSuccess, focusContract, requestContractSign } from '../../services/afterDeposit'
import './ContractSignFlow.css'
import './ContractRenewal.css'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ".
 * @param {number|string} value số tiền.
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/**
 * Đổi ngày ISO ('2026-05-01...') thành 'dd/MM/yyyy' (rỗng -> '—').
 * @param {string} iso ngày dạng ISO.
 * @returns {string}
 * Được dùng bởi: file này, ContractCard, PendingPayments, CustomerAccount.
 */
export const fmtIsoDate = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
/**
 * Tính ngày kết thúc sau `months` tháng kể từ ngày ISO (trừ 1 ngày), dùng hiển thị hết tháng đầu của kỳ gia hạn.
 * Tính theo UTC để không bị lệch múi giờ.
 * @param {string} iso ngày bắt đầu dạng ISO.
 * @param {number} months số tháng cộng thêm.
 * @returns {string|null} ngày 'yyyy-MM-dd', null nếu không có ngày bắt đầu.
 */
const addMonthsIso = (iso, months) => {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}
/**
 * Số phút còn lại tới một thời điểm ISO (không âm), dùng hiện "còn N phút" giữ yêu cầu gia hạn chờ thanh toán.
 * @param {string} iso thời điểm hết hạn.
 * @returns {number}
 */
const minutesLeft = iso => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60000))

/**
 * Hook: tải thông tin gia hạn của khách (điều kiện, báo giá, yêu cầu đang chờ, đã gia hạn) một lần khi mount.
 * API: GET /api/contract-renewals/mine  -> { items: [...], rules }
 * @returns {{loading, error, data, items, rules, byReservation, reload}}
 *   items: mảng thông tin gia hạn theo từng hợp đồng; rules: luật gia hạn; byReservation(id): tìm item theo đơn;
 *   reload(): gọi lại API.
 * Được gọi bởi: CustomerAccount (tab Hợp đồng, truyền vào RenewalSection / ContractCard), HeaderNotificationBell (nhắc gia hạn).
 */
export function useContractRenewals() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  // Gọi lại API GET /api/contract-renewals/mine và cập nhật state (404 -> báo backend chưa có chức năng gia hạn).
  const reload = useCallback(() => {
    setState(current => ({ ...current, loading: true }))
    return apiGet('/api/contract-renewals/mine')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({
        loading: false,
        data: null,
        // 404 = backend đang chạy chưa có ContractRenewalsController.cs (chưa chép file hoặc chưa chạy lại backend).
        error: error?.status === 404
          ? 'Backend chưa có chức năng gia hạn. Hãy chép ContractRenewalsController.cs vào backend/Controllers rồi dừng và chạy lại backend (dotnet run).'
          : error.message
      }))
  }, [])
  // Chạy 1 lần khi component dùng hook được mount: tải dữ liệu gia hạn.
  useEffect(() => { reload() }, [reload])

  const items = Array.isArray(state.data?.items) ? state.data.items : []
  // Tìm thông tin gia hạn của 1 hợp đồng theo reservationId.
  const byReservation = id => items.find(item => String(item.reservationId) === String(id)) || null
  return { ...state, items, rules: state.data?.rules || null, byReservation, reload }
}

/**
 * Thanh toán 1 yêu cầu gia hạn đang chờ: nếu bật chế độ demo thì hỏi khách chọn "Mô phỏng" hay "Qua VNPay",
 * không thì chuyển thẳng sang VNPay (VNPay sẽ chuyển về /payment-result).
 * API: POST /api/contract-renewals/{reservationId}/pay-demo  (mô phỏng)  |  POST /api/vnpay/create (VNPay, kind 'renewal')
 * @param {object} dialog đối tượng từ useDialog() (confirm/alert).
 * @param {{reservationId:number, amount:number, label:string}} info đơn gia hạn, số tiền, nhãn hiện ở trang VNPay.
 * @returns {Promise<object>} { redirected: true } nếu đã chuyển sang VNPay; { contractId, ... } nếu thanh toán mô phỏng
 *   xong (gia hạn đã hoàn tất).
 * Được gọi bởi: RenewalModal.submit, RenewalSection.continuePay.
 */
export async function payRenewal(dialog, { reservationId, amount, label }) {
  const demo = SIMULATED_PAYMENT_ENABLED && await dialog.confirm({
    tone: 'info',
    title: 'Chọn cách thanh toán',
    message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
    confirmLabel: 'Mô phỏng',
    cancelLabel: 'Qua VNPay'
  })
  if (demo) return apiPost(`/api/contract-renewals/${reservationId}/pay-demo`, {})
  await startVnPayPayment([reservationId], { amount, count: 1, label, kind: 'renewal' })
  return { redirected: true }
}

/**
 * Sau khi gia hạn xong: hiện thông báo "Gia hạn thành công, vui lòng ký phụ lục gia hạn" (announceRenewalSuccess),
 * khách bấm OK -> requestContractSign(contractId) ghi sessionStorage + phát sự kiện để CustomerAccount mở màn hình ký.
 * @param {object} dialog từ useDialog().
 * @param {{contractId, contractNumber, renewedFromContractNumber}} result kết quả gia hạn từ backend.
 * @param {number} [amount] số tiền đã trả (0/rỗng thì không hiện).
 * Được gọi bởi: RenewalModal.submit, RenewalSection.continuePay (khi thanh toán mô phỏng / hoàn tất thành công).
 */
export async function finishRenewal(dialog, result, amount) {
  await announceRenewalSuccess(dialog, {
    contractNumber: result.contractNumber,
    renewedFromContractNumber: result.renewedFromContractNumber,
    amountText: amount ? money(amount) : ''
  })
  if (result.contractId) requestContractSign(result.contractId)
}

/**
 * Khối "Gia hạn hợp đồng" đầu tab Hợp đồng, gồm 3 loại thẻ: yêu cầu gia hạn chờ thanh toán (nút Hủy / Thanh toán /
 * Hoàn tất), hợp đồng sắp hết hạn (nút Gia hạn), hợp đồng đã gia hạn (nút Ký phụ lục nếu chưa ký).
 * Bấm vào thẻ -> focusContract() cuộn tới thẻ hợp đồng tương ứng. Không có gì để hiện thì trả null.
 * @param {object} props
 * @param {object} props.renewals kết quả useContractRenewals().
 * @param {Function} props.onRenew onRenew(item): bấm "Gia hạn hợp đồng" -> cha mở RenewalModal.
 * @param {Function} [props.onChanged] gọi sau khi thanh toán / hủy để cha tải lại danh sách đơn.
 * API: POST /api/contract-renewals/{id}/finalize, POST /api/contract-renewals/{id}/cancel, payRenewal().
 * Được gọi bởi: CustomerAccount (đầu tab Hợp đồng).
 */
export function RenewalSection({ renewals, onRenew, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(null)
  if (renewals.loading && !renewals.data) return null
  if (renewals.error) {
    return (
      <div className="rn-error" role="alert">
        Không tải được thông tin gia hạn: {renewals.error}
        <button type="button" onClick={renewals.reload}>Thử lại</button>
      </div>
    )
  }
  const rules = renewals.rules
  // Tải lại dữ liệu gia hạn và báo cha tải lại dữ liệu đơn.
  const refresh = () => { renewals.reload(); onChanged?.() }

  // Chia item thành 3 nhóm: pending (yêu cầu gia hạn chờ thanh toán/hoàn tất), active (sắp hết hạn, có thể gia hạn
  // hoặc bị chặn kèm lý do), renewed (đã gia hạn bằng phụ lục, còn hiệu lực).
  const pending = renewals.items.filter(item => item.pendingRenewal && !item.renewedBy)
  // Chỉ nhắc các hợp đồng sắp hết hạn; hợp đồng còn xa vẫn gia hạn được bằng nút "Gia hạn" trên thẻ hợp đồng.
  const soonDays = Math.max(30, Number(rules?.renewalNoticeDays || 0) + 30)
  const active = renewals.items.filter(item =>
    !item.renewedBy && !item.pendingRenewal && item.daysLeft >= 0 && item.daysLeft <= soonDays &&
    (item.eligible || (item.reason && item.contractStatus !== 'Renewed' && !/kết thúc|chỉ gia hạn/i.test(item.reason))))
  const renewed = renewals.items.filter(item => item.renewedBy && item.daysLeft >= 0)
  if (pending.length === 0 && active.length === 0 && renewed.length === 0) return null

  /**
   * Tiếp tục yêu cầu gia hạn đang chờ: đã trả thì hoàn tất, chưa trả thì thanh toán.
   * Chạy khi bấm nút "Thanh toán ..." / "Hoàn tất gia hạn" trên thẻ chờ thanh toán.
   * API: POST /api/contract-renewals/{id}/finalize  hoặc  payRenewal() (pay-demo / VNPay).
   * Thành công -> refresh() + finishRenewal() (mở ký phụ lục); lỗi -> dialog báo lỗi.
   */
  const continuePay = async item => {
    const p = item.pendingRenewal
    setBusy(p.reservationId)
    try {
      const result = p.paid
        ? await apiPost(`/api/contract-renewals/${p.reservationId}/finalize`, {})
        : await payRenewal(dialog, { reservationId: p.reservationId, amount: p.amountDue, label: p.reservationCode })
      if (result.redirected) return
      refresh()
      await finishRenewal(dialog, result, p.paid ? 0 : p.amountDue)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa gia hạn được', message: error.message })
      refresh()
    } finally {
      setBusy(null)
    }
  }

  /**
   * Hủy yêu cầu gia hạn chưa thanh toán (hỏi xác nhận trước). Chạy khi bấm nút "Hủy" trên thẻ chờ thanh toán.
   * API: POST /api/contract-renewals/{id}/cancel; xong thì refresh() dữ liệu.
   */
  const cancelPending = async item => {
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Hủy yêu cầu gia hạn?',
      message: `Hủy yêu cầu gia hạn ${item.pendingRenewal.months} tháng của hợp đồng ${item.contractNumber}. Bạn có thể gia hạn lại sau.`,
      confirmLabel: 'Hủy yêu cầu',
      cancelLabel: 'Không'
    })
    if (!ok) return
    setBusy(item.pendingRenewal.reservationId)
    try {
      await apiPost(`/api/contract-renewals/${item.pendingRenewal.reservationId}/cancel`, {})
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa hủy được', message: error.message })
    } finally {
      setBusy(null)
      refresh()
    }
  }

  // Khối "Gia hạn hợp đồng" đầu tab Hợp đồng
  return (
    <section className="rn-section" aria-label="Gia hạn hợp đồng">
      {/* Tiêu đề khối */}
      <div className="rn-section-head">
        <h2>Gia hạn hợp đồng</h2>
        {rules && (
          <p>
            Gia hạn trong khoảng <strong>{Number(rules.renewalNoticeDays) + 30} đến {rules.renewalNoticeDays} ngày</strong> trước ngày hết hạn · kỳ gia hạn {rules.minRenewalMonths}–{rules.maxRenewalMonths} tháng
            {rules.requireNoOverdue ? ' · không còn khoản phí quá hạn' : ''}. Khi gia hạn bạn trả trước tiền thuê tháng đầu của kỳ mới, tiền cọc được chuyển sang kỳ mới.
          </p>
        )}
      </div>
      {/* Thẻ: chờ thanh toán / sắp hết hạn / đã gia hạn */}
      <div className="rn-list">
        {pending.map(item => {
          const p = item.pendingRenewal
          // Thẻ yêu cầu gia hạn chờ thanh toán
          return (
            <article key={`p-${item.reservationId}`} className="rn-card soon clickable" role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }}>
              <div>
                <span className="sign-badge todo">{p.paid ? 'Đã thanh toán · Chưa hoàn tất' : `Chờ thanh toán · còn ${minutesLeft(p.holdExpiresAt)} phút`}</span>
                <h3>Gia hạn hợp đồng {item.contractNumber} thêm {p.months} tháng</h3>
                <p>
                  {fmtIsoDate(p.startDate)} → {fmtIsoDate(p.endDate)} · Mã {p.reservationCode}
                  {!p.paid && <> · cần thanh toán <strong>{money(p.amountDue)}</strong></>}
                </p>
              </div>
              <div className="sign-actions">
                {!p.paid && <button type="button" className="dashboard-secondary-btn" disabled={busy === p.reservationId} onClick={() => cancelPending(item)}>Hủy</button>}
                <button type="button" className="dashboard-primary-btn" disabled={busy === p.reservationId} onClick={() => continuePay(item)}>
                  {busy === p.reservationId ? 'Đang xử lý...' : p.paid ? 'Hoàn tất gia hạn' : `Thanh toán ${money(p.amountDue)}`}
                </button>
              </div>
            </article>
          )
        })}
        {active.map(item => ( // Thẻ hợp đồng sắp hết hạn
          <article key={item.reservationId} className={`rn-card clickable${item.eligible ? '' : ' blocked'}${item.eligible && item.daysLeft <= 30 ? ' soon' : ''}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }} title="Bấm để xem hợp đồng">
            <div>
              <span className={`sign-badge ${item.eligible ? (item.daysLeft <= 30 ? 'todo' : 'done') : 'wait'}`}>
                {item.eligible ? (item.daysLeft <= 30 ? `Sắp hết hạn · còn ${item.daysLeft} ngày` : `Còn ${item.daysLeft} ngày`) : 'Chưa thể gia hạn'}
              </span>
              <h3>Hợp đồng {item.contractNumber}</h3>
              <p>
                {item.facility} · hết hạn <strong>{fmtIsoDate(item.endDate)}</strong>
                {item.eligible ? <> · gia hạn từ {item.renewOpensOn ? fmtIsoDate(item.renewOpensOn) : 'nay'} đến <strong>{fmtIsoDate(item.renewDeadline)}</strong></> : null}
              </p>
              {!item.eligible && item.reason && <p className="rn-reason">{item.reason}</p>}
              <span className="go-contract">Xem hợp đồng ↓</span>
            </div>
            {item.eligible && (
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => onRenew(item)}>Gia hạn hợp đồng</button>
              </div>
            )}
          </article>
        ))}
        {renewed.map(item => ( // Thẻ đã gia hạn (chờ ký phụ lục)
          <article key={item.reservationId} className={`rn-card clickable${item.renewedBy.isSigned === false ? ' soon' : ' done'}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.renewedBy.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.renewedBy.reservationId) }} title="Bấm để xem phụ lục gia hạn">
            <div>
              <span className={`sign-badge ${item.renewedBy.isSigned === false ? 'todo' : 'done'}`}>
                {item.renewedBy.isSigned === false ? 'Đã gia hạn · Chờ ký phụ lục' : 'Đã gia hạn'}
              </span>
              <h3>Hợp đồng {item.contractNumber} → phụ lục gia hạn {item.renewedBy.contractNumber}</h3>
              <p>Tiếp tục thuê từ <strong>{fmtIsoDate(item.renewedBy.startDate)}</strong> đến <strong>{fmtIsoDate(item.renewedBy.endDate)}</strong> ({item.renewedBy.months} tháng).</p>
              <span className="go-contract">Xem phụ lục gia hạn ↓</span>
            </div>
            {item.renewedBy.isSigned === false && (
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => requestContractSign(item.renewedBy.contractId)}>Ký phụ lục gia hạn</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

/**
 * Hộp thoại gia hạn 3 bước: 1) 'plan' chọn kỳ (số tháng) + hình thức trả, xem bảng giá từng kho;
 * 2) 'pay' xác nhận bằng DepositConfirm (tick 2 ô) & thanh toán; 3) ký phụ lục (mở màn hình ký sau khi thanh toán,
 * không nằm trong hộp thoại này). Nhấn Esc hoặc bấm nền tối để đóng.
 * @param {object} props
 * @param {object} props.item thông tin gia hạn của 1 hợp đồng (reservationId, contractNumber, facility, endDate,
 *   daysLeft, paymentPlan, quotes: [{ months, monthly, rent, amountDueMonthly, amountDueUpfront, units, ... }]).
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onDone] onDone(result) sau khi gia hạn xong; onDone(null) khi đã tạo yêu cầu nhưng thanh toán lỗi.
 * API: POST /api/contract-renewals, rồi payRenewal() (pay-demo hoặc POST /api/vnpay/create).
 * Được gọi bởi: CustomerAccount (khi bấm "Gia hạn" trên ContractCard hoặc RenewalSection).
 */
export function RenewalModal({ item, onClose, onDone }) {
  const dialog = useDialog()
  const quotes = Array.isArray(item.quotes) ? item.quotes : []
  // Số tháng gia hạn đang chọn: mặc định bằng số tháng của hợp đồng hiện tại (nếu có báo giá), không thì báo giá đầu.
  const [months, setMonths] = useState(() => (quotes.find(q => q.months === item.months) || quotes[0])?.months ?? null)
  const [step, setStep] = useState('plan') // 'plan' (chọn kỳ) | 'pay' (xác nhận & thanh toán)
  // Khách chọn lại hình thức trả; chọn sẵn hình thức của hợp đồng hiện tại
  const [paymentPlan, setPaymentPlan] = useState(item.paymentPlan === 'Upfront' ? 'Upfront' : 'Monthly')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [override, setOverride] = useState(null) // báo giá mới nếu bảng giá vừa đổi
  // Báo giá đang áp dụng: ưu tiên báo giá mới backend trả về (override) nếu cùng số tháng.
  const quote = (override && override.months === months ? override : null) || quotes.find(q => q.months === months) || null
  // Số tiền phải trả ngay của 1 báo giá theo hình thức trả đang chọn (backend tính sẵn:
  // Upfront -> amountDueUpfront = cả kỳ; Monthly -> amountDueMonthly = tháng đầu).
  const dueOf = q => (q ? Number(paymentPlan === 'Upfront' ? (q.amountDueUpfront ?? q.amountDue) : (q.amountDueMonthly ?? q.amountDue)) : 0)
  const amountDue = dueOf(quote)

  // Chạy khi mở hộp thoại và khi submitting đổi: gắn phím Esc để đóng; gỡ khi đóng.
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại (khi không đang gửi).
    const onKey = event => { if (event.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  /**
   * Tạo yêu cầu gia hạn rồi thanh toán ngay. Chạy khi bấm nút "Thanh toán ..." ở bước 'pay'.
   * API: POST /api/contract-renewals  body { reservationId, months, paymentPlan, expectedAmount }, sau đó payRenewal().
   * Nếu giá vừa đổi, backend trả báo giá mới -> cập nhật và bắt xác nhận lại; nếu đã tạo yêu cầu nhưng thanh toán lỗi
   * thì báo yêu cầu vẫn được giữ trong thời gian giữ chỗ.
   */
  const submit = async () => {
    if (!quote || !agreed) return
    setSubmitting(true)
    setError('')
    let created = null
    try {
      created = await apiPost('/api/contract-renewals', { reservationId: item.reservationId, months: quote.months, paymentPlan, expectedAmount: amountDue })
      const result = await payRenewal(dialog, { reservationId: created.reservationId, amount: created.amountDue, label: created.reservationCode })
      if (result.redirected) return // đang chuyển sang VNPay
      onDone?.(result)
      onClose()
      await finishRenewal(dialog, result, created.amountDue)
    } catch (err) {
      if (err?.data?.quote) {
        setOverride(err.data.quote)
        setAgreed(false)
      }
      // Đã tạo yêu cầu nhưng chưa thanh toán được: yêu cầu vẫn được giữ, khách thanh toán tiếp trong mục Gia hạn hợp đồng.
      setError(created ? `${err.message} Yêu cầu gia hạn được giữ ${minutesLeft(created.holdExpiresAt)} phút, bạn có thể thanh toán lại.` : err.message)
      if (created) onDone?.(null)
      setSubmitting(false)
    }
  }

  // Dữ liệu cho thanh bước và bảng tiền: firstMonthEnd = ngày cuối tháng đầu kỳ mới; laterMonths = số tháng trả sau.
  const steps = [['plan', 'Chọn kỳ gia hạn'], ['pay', 'Xác nhận & thanh toán'], ['sign', 'Ký phụ lục gia hạn']]
  const stepIndex = steps.findIndex(([key]) => key === step)
  const firstMonthEnd = quote ? addMonthsIso(quote.startDate, 1) : null
  const laterMonths = quote ? Number(quote.laterMonths ?? Math.max(0, quote.months - 1)) : 0

  // Hộp thoại gia hạn 3 bước
  return (
    <div className="csf-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <div className="csf rn-modal" role="dialog" aria-modal="true" aria-labelledby="rn-title">
        {/* Tiêu đề hộp thoại */}
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Gia hạn hợp đồng</span>
            <h2 id="rn-title">Hợp đồng {item.contractNumber}</h2>
            <p>{item.facility} · đang thuê đến {fmtIsoDate(item.endDate)} · còn {item.daysLeft} ngày</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={submitting} aria-label="Đóng">×</button>
        </div>
        {/* Thanh bước */}
        <ol className="csf-steps">
          {steps.map(([key, label], index) => (
            <li key={key} className={index < stepIndex ? 'done' : index === stepIndex ? 'active' : ''}>{label}</li>
          ))}
        </ol>

        {/* Chọn số tháng, hình thức trả, bảng giá, xác nhận */}
        <div className="csf-body">
          {error && <div className="auth-message error rn-modal-error" role="alert">{error}</div>}

          {step === 'plan' && (
            <>
              <p className="csf-lead">Chọn thời gian muốn thuê thêm. Kỳ gia hạn bắt đầu ngay sau ngày hết hạn hiện tại, các kho giữ nguyên, bạn tiếp tục sử dụng kho mà không cần đến cơ sở.</p>
              <div className="rn-plans" role="radiogroup" aria-label="Kỳ gia hạn">
                {quotes.map(q => (
                  <button
                    key={q.months}
                    type="button"
                    role="radio"
                    aria-checked={q.months === months}
                    className={`rn-plan${q.months === months ? ' active' : ''}`}
                    onClick={() => { setMonths(q.months); setError(''); setAgreed(false) }}
                  >
                    <strong>{q.months} tháng</strong>
                    <span>{money(q.monthly)}/tháng</span>
                    <small>đến {fmtIsoDate(q.endDate)}</small>
                  </button>
                ))}
              </div>

              {quote && (
                <>
                  <p className="csf-label">Hình thức trả tiền thuê kỳ mới</p>
                  <div className="rn-plans" role="radiogroup" aria-label="Hình thức trả">
                    {[['Monthly', 'Trả theo tháng', `Trả ngay ${money(quote.amountDueMonthly ?? quote.amountDue)}, các tháng sau trả hằng tháng`],
                      ['Upfront', 'Trả 1 lần', `Trả ngay ${money(quote.amountDueUpfront ?? quote.rent)} (toàn bộ ${quote.months} tháng)`]].map(([value, label, note]) => (
                      <button key={value} type="button" role="radio" aria-checked={paymentPlan === value}
                        className={`rn-plan${paymentPlan === value ? ' active' : ''}`}
                        onClick={() => { setPaymentPlan(value); setError(''); setAgreed(false) }}>
                        <strong>{label}</strong>
                        <small>{note}</small>
                      </button>
                    ))}
                  </div>
                  <div className="cdm-summary rn-summary">
                    <div><span>Thời gian gia hạn</span><strong>{fmtIsoDate(quote.startDate)} → {fmtIsoDate(quote.endDate)}</strong></div>
                    <div><span>Tiền thuê / tháng</span><strong>{money(quote.monthly)}</strong></div>
                    <div><span>Tổng tiền thuê {quote.months} tháng</span><strong>{money(quote.rent)}</strong></div>
                    <div><span>Trả ngay khi gia hạn</span><strong>{money(amountDue)}</strong></div>
                  </div>
                  <div className="csf-table-wrap">
                    <table className="csf-table">
                      <thead><tr><th>Kho</th><th>Loại · Kích thước</th><th>Giá niêm yết</th><th>Giá gia hạn / tháng</th></tr></thead>
                      <tbody>
                        {quote.units.map(u => (
                          <tr key={u.unitId}>
                            <td><strong>{u.unitNumber}</strong></td>
                            <td>{u.type || '—'} · {u.size || '—'}</td>
                            <td>{money(u.listPrice)}</td>
                            <td>{money(u.monthlyPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {step === 'pay' && quote && (
            <div className="rn-pay">
              <DepositConfirm
                key={`${quote.months}-${paymentPlan}-${amountDue}`}
                title="Xác nhận gia hạn"
                rows={[
                  ['Hợp đồng gốc', `${item.contractNumber} · ${item.facility}`],
                  ['Kho', quote.units.map(u => u.unitNumber).join(', ')],
                  ['Thời gian gia hạn', `${quote.months} tháng · ${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(quote.endDate)}`],
                  ['Hình thức trả', paymentPlan === 'Upfront' ? 'Trả 1 lần' : 'Trả theo tháng']
                ]}
                lines={[
                  paymentPlan === 'Upfront'
                    ? [`Tiền thuê toàn bộ ${quote.months} tháng (${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(quote.endDate)})`, Number(quote.rent)]
                    : [`Tiền thuê tháng đầu (${fmtIsoDate(quote.startDate)} → ${fmtIsoDate(firstMonthEnd)})`, Number(quote.firstMonth ?? quote.monthly)],
                  [`Tiền cọc ${money(quote.depositTransfer ?? quote.oldDeposit)}`, 'Chuyển từ hợp đồng cũ'],
                  ...(Number(quote.depositTopUp) > 0 ? [['Bổ sung tiền cọc (giá thuê tăng)', Number(quote.depositTopUp)]] : []),
                  ...(Number(quote.refundAmount) > 0 ? [['Tiền cọc dư được hoàn lại', `${money(quote.refundAmount)} (hoàn sau)`]] : []),
                  ...(paymentPlan === 'Monthly' && laterMonths > 0 ? [[`Tháng 2 → ${quote.months}`, `${money(quote.monthly)}/tháng, trả hằng tháng`]] : [])
                ]}
                amount={amountDue}
                onChange={setAgreed}
                infoText={<>Tôi đã kiểm tra đúng <strong>kho, thời gian gia hạn và giá thuê</strong> ở trên.</>}
                policyText={<>Tôi đồng ý gia hạn với <strong>các điều khoản của hợp đồng {item.contractNumber}</strong>, áp dụng giá thuê hiện hành, và sẽ <strong>ký điện tử phụ lục gia hạn</strong> ngay sau khi thanh toán.</>}
                hint="Tick đủ 2 ô để thanh toán và gia hạn."
              />
              <p className="csf-hint">
                {SIMULATED_PAYMENT_ENABLED
                  ? 'Đang bật chế độ demo: bạn có thể chọn thanh toán mô phỏng hoặc qua VNPay.'
                  : 'Bạn sẽ được chuyển sang cổng VNPay (môi trường thử nghiệm) để thanh toán. Yêu cầu gia hạn được giữ 15 phút.'}
              </p>
            </div>
          )}
        </div>

        {/* Nút quay lại / thanh toán */}
        <div className="csf-actions">
          {step === 'pay' && <button type="button" className="dashboard-secondary-btn" disabled={submitting} onClick={() => { setStep('plan'); setAgreed(false); setError('') }}>Quay lại</button>}
          <span className="csf-spacer" />
          {step === 'plan' && (
            <button type="button" className="dashboard-primary-btn" disabled={!quote} onClick={() => { setError(''); setAgreed(false); setStep('pay') }}>
              Tiếp tục
            </button>
          )}
          {step === 'pay' && (
            <button type="button" className="dashboard-primary-btn" disabled={submitting || !agreed} onClick={submit}>
              {submitting ? 'Đang xử lý...' : `Thanh toán ${money(amountDue)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
