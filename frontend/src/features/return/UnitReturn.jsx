/**
 * ======================================================================
 * FILE: src/features/return/UnitReturn.jsx  —  TRẢ KHO (phía KHÁCH HÀNG)
 * CHỨC NĂNG: Toàn bộ giao diện trả kho của khách: hộp thoại "Báo trả kho" (chọn ngày, khung giờ còn nhân viên
 *   rảnh, ghi chú, đồng ý quy trình), khối "Trả kho" ở trang Hợp đồng hiển thị tiến trình 4 bước của từng yêu cầu,
 *   bảng quyết toán tiền cọc, hủy lịch và đóng phí phát sinh còn thiếu. Phần kiểm kho có phí (xem ảnh, đồng ý /
 *   khiếu nại) dùng CustomerInspectionBox của ReturnInspection.jsx.
 * THÀNH PHẦN CHÍNH:
 *   - money, toInput (nội bộ), fmtDay (export): hàm định dạng tiền / ngày.
 *   - useUnitReturns (export): hook tải dữ liệu trả kho của khách.
 *   - returnStage (export): xác định bước hiện tại của 1 yêu cầu trả kho.
 *   - payReturnFees (export): đóng phí phát sinh (mô phỏng hoặc VNPay).
 *   - ReturnProgress (nội bộ): thẻ tiến trình 1 yêu cầu trả kho.
 *   - ReturnSection (export): khối "Trả kho" đầu trang Hợp đồng.
 *   - ReturnRequestModal (export): hộp thoại báo trả kho.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx (useUnitReturns, ReturnSection, ReturnRequestModal),
 *   src/features/notification/HeaderNotificationBell.jsx (useUnitReturns), src/features/return/StaffReturns.jsx (fmtDay).
 * PHỤ THUỘC: api/api (apiGet, apiPost), components/common/Dialog (useDialog), services/storageRules (formatVnd),
 *   services/policies (usePolicies), api/vnpay (SIMULATED_PAYMENT_ENABLED, startVnPayPayment),
 *   services/afterDeposit (focusContract), ./ReturnInspection, ContractSignFlow.css, UnitReturn.css.
 * API (backend UnitReturnsController):
 *   GET  /api/unit-returns/mine                         -> các hợp đồng có thể trả + yêu cầu trả kho + quy định + bảng phí
 *   GET  /api/unit-returns/{reservationId}/slots?date=  -> khung giờ còn nhân viên rảnh trong ngày
 *   POST /api/unit-returns                              -> { reservationId, returnDate, returnTime, note } đặt lịch trả kho
 *   POST /api/unit-returns/{reservationId}/cancel       -> hủy lịch trả kho
 *   POST /api/unit-returns/{reservationId}/pay-demo     -> đóng (mô phỏng) phí phát sinh còn thiếu; thật thì qua VNPay
 *   (gián tiếp) GET /api/return-inspections/mine qua useMyInspections; POST /api/vnpay/create qua startVnPayPayment.
 * LUỒNG: khách bấm "Báo trả kho" ở thẻ hợp đồng -> ReturnRequestModal tải khung giờ (slots) -> bấm "Đặt lịch"
 *   -> POST /api/unit-returns -> Staff nhận lại & kiểm tra kho (StaffReturns.jsx) -> Manager duyệt kết quả
 *   -> không phí: hoàn cọc sau N ngày; có phí: khách xem ảnh, Đồng ý/Khiếu nại (ReturnInspection.jsx) -> trừ vào cọc,
 *   thiếu thì khách bấm "Đóng ..." -> payReturnFees.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng số tiền (làm tròn) thành chuỗi VND kèm "đ", vd 150000 -> "150.000đ" → dùng ở: ReturnProgress, ReturnRequestModal
 *   fmtDay: Đổi ngày ISO ('2026-11-17T...') thành 'dd/MM/yyyy' để hiển thị (rỗng -> '—') → dùng ở: ReturnProgress, ReturnRequestModal; StaffReturns.jsx (InspectForm, StaffReturns)
 *   toInput: Cắt ngày ISO về 'YYYY-MM-DD' để gán vào ô input type="date" → dùng ở: ReturnRequestModal
 *   useUnitReturns: Hook: tải dữ liệu trả kho của khách đang đăng nhập (tự tải khi mount) và cung cấp hàm tải lại → dùng ở: HeaderNotificationBell.jsx (useHeaderNotices), CustomerAccount.jsx (MyStoragePage, ContractPage +1)
 *   returnStage: Xác định bước hiện tại của 1 yêu cầu trả kho (dựa vào trạng thái yêu cầu + kết quả kiểm kho): 'scheduled' (đã hẹn), 'inspecting' → dùng ở: ReturnProgress, ReturnSection
 *   payReturnFees: Đóng phí phát sinh còn thiếu khi trả kho: nếu bật chế độ demo thì hỏi khách chọn "Mô phỏng" hay "Qua VNPay"; mô phỏng gọi API pay-demo → dùng ở: pay
 *   ReturnProgress: Thẻ tiến trình của 1 yêu cầu trả kho: thanh 4 bước (Báo trả kho -> Nhận lại & kiểm tra -> Quản lý duyệt & quyết toán -> Hoàn cọc) → dùng ở: ReturnSection
 *   cancel: Khi bấm "Hủy lịch trả kho": hỏi xác nhận, rồi hủy lịch và gọi onChanged() để tải lại → dùng ở: ReturnProgress
 *   pay: Khi bấm "Đóng <số tiền>": đóng phí phát sinh còn thiếu (qua payReturnFees) → dùng ở: ReturnProgress
 *   ReturnSection: Khối "Trả kho" đầu trang Hợp đồng: liệt kê các yêu cầu trả kho đang xử lý hoặc mới xong trong 30 ngày, mỗi yêu cầu là 1 ReturnProgress → dùng ở: CustomerAccount.jsx (ContractPage)
 *   ReturnRequestModal: Hộp thoại "Báo trả kho": khách chọn ngày (trong khoảng min/max cho phép), khung giờ còn nhân viên rảnh, ghi chú cho nhân viên → dùng ở: CustomerAccount.jsx (MyStoragePage, ContractPage)
 *   submit: Khi bấm "Đặt lịch trả kho": gửi yêu cầu, gọi onDone, đóng hộp thoại và báo thành công; lỗi thì hiện trong hộp thoại → dùng ở: ReturnRequestModal
 */
import React, { useCallback, useEffect, useState } from 'react'
import { apiGet, apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import { formatVnd } from '../../services/storageRules'
import { usePolicies } from '../../services/policies'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'
import { focusContract } from '../../services/afterDeposit'
import '../contract/ContractSignFlow.css'
import './UnitReturn.css'
import { CustomerInspectionBox, INSPECTION, useMyInspections, parseReturnNotes } from './ReturnInspection'
import { EarlyRequestCard } from './EarlyReturn' // thẻ đơn trả kho sớm (chờ duyệt / bị từ chối)

/**
 * Định dạng số tiền (làm tròn) thành chuỗi VND kèm "đ", vd 150000 -> "150.000đ".
 * @param {number|string} value số tiền (rỗng coi là 0).
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
/**
 * Đổi ngày ISO ('2026-11-17T...') thành 'dd/MM/yyyy' để hiển thị (rỗng -> '—').
 * Dùng trong file này và StaffReturns.jsx.
 * @param {string} iso ngày dạng ISO.
 * @returns {string}
 */
export const fmtDay = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—')
/**
 * Cắt ngày ISO về 'YYYY-MM-DD' để gán vào ô input type="date".
 * @param {string} iso ngày dạng ISO.
 * @returns {string} chuỗi rỗng nếu không có ngày.
 */
const toInput = iso => (iso ? String(iso).slice(0, 10) : '')

/**
 * Hook: tải dữ liệu trả kho của khách đang đăng nhập (tự tải khi mount) và cung cấp hàm tải lại.
 * API: GET /api/unit-returns/mine  -> { items (hợp đồng + request trả kho), rules (quy định), fees (bảng phí) }
 * Được gọi bởi: CustomerAccount.jsx (trang Hợp đồng, thông báo), HeaderNotificationBell.jsx (useHeaderNotices).
 * @returns {{loading:boolean, error:string, data:object, items:object[], rules:object, fees:object[],
 *   byReservation:(id)=>object|null, reload:()=>Promise}}
 */
export function useUnitReturns() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  // Gọi lại API GET /api/unit-returns/mine và cập nhật state (404 -> báo backend chưa có chức năng trả kho).
  const reload = useCallback(() => {
    setState(current => ({ ...current, loading: true }))
    return apiGet('/api/unit-returns/mine')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({
        loading: false,
        data: null,
        error: error?.status === 404 ? 'Backend chưa có chức năng trả kho (UnitReturnsController.cs). Chép file rồi chạy lại backend.' : error.message
      }))
  }, [])
  // Chạy 1 lần khi mount: tải dữ liệu trả kho lần đầu.
  useEffect(() => { reload() }, [reload])
  const items = Array.isArray(state.data?.items) ? state.data.items : []
  return {
    ...state,
    items,
    rules: state.data?.rules || null,
    fees: state.data?.fees || [],
    // Tìm thông tin trả kho của 1 hợp đồng theo reservationId.
    byReservation: id => items.find(i => String(i.reservationId) === String(id)) || null,
    reload
  }
}

/**
 * Xác định bước hiện tại của 1 yêu cầu trả kho (dựa vào trạng thái yêu cầu + kết quả kiểm kho):
 * 'scheduled' (đã hẹn), 'inspecting' (đang kiểm tra), 'pending_manager' (chờ Quản lý duyệt),
 * 'confirm' (chờ khách xác nhận phí), 'disputed' (đang khiếu nại), 'owed' (còn nợ phí),
 * 'refunding' (đang hoàn cọc), 'done' (xong).
 * Được gọi bởi: ReturnProgress (chọn nhãn, bước, nút) và ReturnSection (lọc yêu cầu còn hiển thị).
 * @param {object} req yêu cầu trả kho (status, amountOwed, refundAmount, refundStatus...).
 * @param {object} [inspection] kết quả kiểm kho của hợp đồng này (nếu có).
 * @returns {string|null} mã bước, hoặc null nếu không có yêu cầu.
 */
export function returnStage(req, inspection) {
  if (!req) return null
  if (req.status === 'Scheduled') return 'scheduled'
  if (req.status === 'In Progress') return 'inspecting'
  if (inspection?.status === INSPECTION.PENDING_MANAGER) return 'pending_manager'
  if (inspection?.status === INSPECTION.AWAITING) return 'confirm' // chờ khách xác nhận phí kiểm kho
  if (inspection?.status === INSPECTION.DISPUTED) return 'disputed' // đang giải quyết khiếu nại
  if (Number(req.amountOwed) > 0) return 'owed'
  if (Number(req.refundAmount) > 0 && req.refundStatus !== 'Completed') return 'refunding'
  return 'done'
}

/**
 * Đóng phí phát sinh còn thiếu khi trả kho: nếu bật chế độ demo thì hỏi khách chọn "Mô phỏng" hay "Qua VNPay";
 * mô phỏng gọi API pay-demo, còn lại chuyển trình duyệt sang VNPay (kind 'fee').
 * API: POST /api/unit-returns/{reservationId}/pay-demo  |  POST /api/vnpay/create (qua startVnPayPayment)
 * Được gọi bởi: hàm pay trong ReturnProgress (khi khách bấm nút "Đóng ...").
 * @param {object} dialog đối tượng từ useDialog() để hiện hộp thoại xác nhận.
 * @param {object} item hợp đồng trả kho (reservationId, contractNumber, request.amountOwed).
 * @returns {Promise<object>} kết quả API pay-demo, hoặc { redirected: true } nếu đã chuyển sang VNPay.
 */
export async function payReturnFees(dialog, item) {
  const amount = item.request?.amountOwed
  const demo = SIMULATED_PAYMENT_ENABLED && await dialog.confirm({
    tone: 'info', title: 'Chọn cách thanh toán', message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
    confirmLabel: 'Mô phỏng', cancelLabel: 'Qua VNPay'
  })
  if (demo) return apiPost(`/api/unit-returns/${item.reservationId}/pay-demo`, {})
  await startVnPayPayment([item.reservationId], { amount, count: 1, label: item.contractNumber, kind: 'fee' })
  return { redirected: true }
}

/**
 * Thẻ tiến trình của 1 yêu cầu trả kho: thanh 4 bước (Báo trả kho -> Nhận lại & kiểm tra -> Quản lý duyệt &
 * quyết toán -> Hoàn cọc), bảng quyết toán tiền cọc, hộp xác nhận/khiếu nại kiểm kho (CustomerInspectionBox),
 * nút "Hủy lịch trả kho" / "Đóng ...". Bấm vào thẻ (ngoài nút) thì cuộn tới thẻ hợp đồng (focusContract).
 * Được gọi bởi: ReturnSection (mỗi yêu cầu trả kho đang hiển thị).
 * @param {object} props
 * @param {object} props.item hợp đồng trả kho kèm item.request (yêu cầu trả kho).
 * @param {object} [props.inspection] kết quả kiểm kho của hợp đồng (nếu có).
 * @param {Function} props.onChanged gọi sau khi hủy lịch / đóng phí để cha tải lại dữ liệu.
 * @returns {JSX.Element}
 */
function ReturnProgress({ item, inspection, onChanged }) {
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const req = item.request
  const stage = returnStage(req, inspection)
  const held = stage === 'pending_manager' || stage === 'confirm' || stage === 'disputed' // phí kiểm kho chưa quyết toán xong
  // steps: [tên bước, dòng ghi chú] cho 4 bước; current: chỉ số bước hiện tại (4 = đã xong hết).
  const steps = [
    ['Báo trả kho', `Hẹn ${req.scheduledTime ? `${req.scheduledTime} ` : ''}ngày ${fmtDay(req.scheduledDate)}${req.staffName ? ` · NV ${req.staffName}` : ''}`],
    ['Nhận lại & kiểm tra kho', stage === 'scheduled' ? 'Chờ đến ngày hẹn' : stage === 'inspecting' ? 'Nhân viên đang kiểm tra' : (req.conditionResult === 'Damaged' ? 'Có vấn đề' : 'Không có vấn đề')],
    ['Quản lý duyệt & Quyết toán', stage === 'pending_manager' ? 'Đang chờ Quản lý duyệt kết quả' : stage === 'confirm' ? `Chờ bạn xác nhận phí ${money(inspection?.proposedTotal)}` : stage === 'disputed' ? 'Đang giải quyết khiếu nại' : stage === 'owed' ? `Cần đóng thêm ${money(req.amountOwed)}` : ['scheduled', 'inspecting'].includes(stage) ? 'Sau khi kiểm tra' : Number(req.refundAmount) > 0 ? `Hoàn ${money(req.refundAmount)}` : 'Cọc đã bù hết phí'],
    ['Hoàn cọc', held ? 'Sau khi quyết toán' : Number(req.refundAmount) > 0
      ? req.refundStatus === 'Completed' ? `Đã chuyển ${fmtDay(req.refundedAt)}` : req.refundDueDate ? `Dự kiến ${fmtDay(req.refundDueDate)}` : 'Sau khi kiểm tra'
      : ['scheduled', 'inspecting'].includes(stage) ? `Sau kiểm tra ${req.refundDays} ngày` : 'Không có']
  ]
  const current = { scheduled: 0, inspecting: 1, pending_manager: 2, confirm: 2, disputed: 2, owed: 2, refunding: 3, done: 4 }[stage]

  /**
   * Khi bấm "Hủy lịch trả kho": hỏi xác nhận, rồi hủy lịch và gọi onChanged() để tải lại.
   * API: POST /api/unit-returns/{reservationId}/cancel
   */
  const cancel = async () => {
    const ok = await dialog.confirm({ tone: 'warning', title: 'Hủy lịch trả kho?', message: 'Bạn tiếp tục thuê kho như bình thường đến hết hợp đồng.', confirmLabel: 'Hủy lịch', cancelLabel: 'Không' })
    if (!ok) return
    setBusy(true)
    try { await apiPost(`/api/unit-returns/${item.reservationId}/cancel`, {}); onChanged() }
    catch (error) { await dialog.alert({ tone: 'danger', title: 'Chưa hủy được', message: error.message }) }
    finally { setBusy(false) }
  }
  // Khi bấm "Đóng <số tiền>": đóng phí phát sinh còn thiếu (qua payReturnFees); nếu mô phỏng thành công
  // thì tải lại dữ liệu và báo đã thanh toán, nếu chuyển sang VNPay thì dừng ở đây.
  const pay = async () => {
    setBusy(true)
    try {
      const result = await payReturnFees(dialog, item)
      if (result.redirected) return
      onChanged()
      await dialog.alert({ tone: 'success', title: 'Đã thanh toán', message: result.message })
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa thanh toán được', message: error.message })
    } finally { setBusy(false) }
  }

  // Thẻ tiến trình trả kho
  return (
    <article className={`ur-card clickable ${stage}`} role="link" tabIndex={0} onClick={e => { if (!e.target.closest('button, a, input')) focusContract(item.reservationId) }} onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) focusContract(item.reservationId) }} title="Bấm để xem hợp đồng">
      {/* Đầu thẻ: kho, ngày hẹn */}
      <div className="ur-card-head">
        <div>
          <span className="ur-eyebrow">TRẢ KHO</span>
          <h3>Hợp đồng {item.contractNumber} · {item.units.join(', ')}</h3>
          <p>{item.facility}</p>
        </div>
        <span className={`ur-badge ${stage}`}>
          {{ scheduled: 'Đã hẹn trả kho', inspecting: 'Đang kiểm tra kho', pending_manager: 'Chờ Quản lý duyệt', confirm: 'Chờ bạn xác nhận', disputed: 'Đang xử lý khiếu nại', owed: 'Cần đóng thêm phí', refunding: 'Chờ hoàn cọc', done: 'Hoàn tất' }[stage]}
        </span>
      </div>

      {/* Bước đã xong (✓ xanh lá) / bước hiện tại (số xanh dương + "Bạn đang ở bước này") / bước chưa tới (xám) */}
      <ol className="ur-steps">
        {steps.map(([label, note], i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={label} className={state} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="ur-dot" aria-hidden="true">{state === 'done' ? '✓' : i + 1}</span>
              <div>
                {state === 'current' && <em>Bạn đang ở bước này</em>}
                {state === 'done' && <em>Đã xong</em>}
                <b>{label}</b>
                <small>{note}</small>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Phí kiểm kho đang chờ duyệt / xác nhận / khiếu nại: hiện hộp xác nhận thay cho bảng quyết toán (chưa có số hoàn).
          Đã quyết toán xong: hiện bảng tiền cọc - các khoản phí - số cần đóng thêm / được hoàn. */}
      {item.earlyRequest?.status === 'Approved' && (
        <p className="ur-help">Trả kho sớm đã được Quản lý duyệt{Number(item.earlyRequest.refundAmount) > 0 ? <> · hoàn <strong>{money(item.earlyRequest.refundAmount)}</strong> tiền thuê các tháng chưa dùng</> : ''}{item.earlyRequest.cancelledPeriods > 0 && Number(item.earlyRequest.refundAmount) === 0 ? ` · đã hủy ${item.earlyRequest.cancelledPeriods} kỳ tiền thuê sau ngày trả kho` : ''}.{item.earlyRequest.managerNote ? ` Ghi chú: ${item.earlyRequest.managerNote}` : ''}</p>
      )}
      {held && <CustomerInspectionBox inspection={inspection} depositTotal={req.depositTotal} debtDeducted={req.deductedFromDeposit} onChanged={onChanged} />}
      {/* Bảng quyết toán cọc + nút đóng phí thiếu */}
      {req.inspectedAt && !held && (
        <div className={`ur-result ${req.conditionResult === 'Damaged' ? 'bad' : 'ok'}`}>
          <div className="ur-result-header">
            <strong>{req.conditionResult === 'Damaged' ? '⚠️ Kết quả kiểm tra: Có vấn đề' : '✓ Kết quả kiểm tra: Kho bình thường'}</strong>
          </div>
          {(() => {
            const { customerNote, staffNote } = parseReturnNotes(req.notes)
            return (
              <>
                {customerNote && <p className="ur-note-line"><b>Ghi chú khi hẹn:</b> {customerNote}</p>}
                {!inspection && staffNote && <p className="ur-note-line"><b>Ghi chú hiện trạng:</b> “{staffNote}”</p>}
              </>
            )
          })()}
          <table className="ur-table">
            <tbody>
              <tr><td>Tiền cọc đã đóng</td><td>{money(req.depositTotal)}</td></tr>
              {req.fees.map((f, i) => (
                <tr key={i}><td>{f.description}{f.fromDeposit ? '' : f.status === 'Paid' ? ' · đã đóng' : ' · chưa đóng'}</td><td>− {money(f.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              {Number(req.amountOwed) > 0 && <tr className="owed"><td>Cần đóng thêm</td><td>{money(req.amountOwed)}</td></tr>}
              <tr><td>Tiền cọc được hoàn</td><td>{money(req.refundAmount)}{Number(req.refundAmount) > 0 ? (req.refundStatus === 'Completed' ? ' · đã chuyển' : ` · dự kiến ${fmtDay(req.refundDueDate)}`) : ''}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      {!held && inspection && <CustomerInspectionBox inspection={inspection} onChanged={onChanged} />}
      {stage === 'scheduled' && req.overdue && (
        <div className="auth-message error" role="alert">Hợp đồng đã hết hạn ngày {fmtDay(item.endDate)}. Cơ sở đã lên lịch thu hồi kho, nhân viên sẽ liên hệ bạn. Muốn đổi ngày giờ, vui lòng liên hệ cơ sở.</div>
      )}
      {stage === 'scheduled' && (
        <p className="ur-help ur-next"><b className="ur-next-label">Việc bạn cần làm</b><span>Dọn hết đồ, vệ sinh kho và mang theo khóa / thẻ ra vào, đến trả kho {req.scheduledTime ? <>lúc <strong>{req.scheduledTime}</strong> </> : ''}ngày <strong>{fmtDay(req.scheduledDate)}</strong>.</span></p>
      )}

      <div className="ur-actions">
        {stage === 'scheduled' && req.canCancel && <button type="button" className="dashboard-secondary-btn" disabled={busy} onClick={cancel}>Hủy lịch trả kho</button>}
        {stage === 'owed' && <button type="button" className="dashboard-primary-btn" disabled={busy} onClick={pay}>{busy ? 'Đang xử lý...' : `Đóng ${money(req.amountOwed)}`}</button>}
      </div>
    </article>
  )
}

/**
 * Khối "Trả kho" đầu trang Hợp đồng: liệt kê các yêu cầu trả kho đang xử lý hoặc mới xong trong 30 ngày,
 * mỗi yêu cầu là 1 ReturnProgress. Tự tải kết quả kiểm kho (useMyInspections -> GET /api/return-inspections/mine).
 * Đang tải lần đầu hoặc không có yêu cầu nào thì không vẽ gì.
 * Được gọi bởi: CustomerAccount.jsx (tab Hợp đồng).
 * @param {object} props
 * @param {object} props.returns kết quả useUnitReturns() do trang cha tạo.
 * @param {Function} [props.onChanged] gọi thêm khi dữ liệu trả kho đổi (cha tải lại danh sách đơn).
 * @returns {JSX.Element|null}
 */
export function ReturnSection({ returns, onChanged }) {
  // Kết quả kiểm kho (ảnh, xác nhận / khiếu nại). Lần tải này cũng tự xác nhận các kết quả quá hạn -> tải lại trả kho.
  const inspections = useMyInspections()
  const { reload: reloadReturns } = returns
  // Chạy khi dữ liệu kiểm kho đổi: nếu backend vừa tự xác nhận kết quả quá hạn (autoSettled > 0) thì tải lại trả kho.
  useEffect(() => { if (inspections.autoSettled > 0) reloadReturns() }, [inspections.data, inspections.autoSettled, reloadReturns])

  if (returns.loading && !returns.data) return null
  if (returns.error) return <div className="rn-error" role="alert">Không tải được thông tin trả kho: {returns.error} <button type="button" onClick={returns.reload}>Thử lại</button></div>
  const active = returns.items.filter(i => i.request && (returnStage(i.request, inspections.byReservation(i.reservationId)) !== 'done' || (i.request.inspectedAt && Date.now() - Date.parse(i.request.inspectedAt) < 30 * 86400000)))
  // Đơn trả kho sớm chưa thành lịch trả kho: đang chờ duyệt, hoặc bị từ chối trong 14 ngày gần đây
  const earlyCards = returns.items.filter(i => !i.request && i.earlyRequest && (i.earlyRequest.status === 'Pending' ||
    (i.earlyRequest.status === 'Rejected' && Date.now() - Date.parse(i.earlyRequest.decidedAt || i.earlyRequest.createdAt) < 14 * 86400000)))
  if (!active.length && !earlyCards.length) return null
  // Khối "Trả kho" ở trang Hợp đồng
  return (
    <section className="ur-section" aria-label="Trả kho">
      <h2>Trả kho</h2>
      {earlyCards.map(item => <EarlyRequestCard key={`early-${item.reservationId}`} item={item} onChanged={() => { returns.reload(); onChanged?.() }} />)}
      {active.map(item => (
        <ReturnProgress key={item.reservationId} item={item} inspection={inspections.byReservation(item.reservationId)}
          onChanged={() => { returns.reload(); inspections.reload(); onChanged?.() }} />
      ))}
    </section>
  )
}

/**
 * Hộp thoại "Báo trả kho": khách chọn ngày (trong khoảng min/max cho phép), khung giờ còn nhân viên rảnh,
 * ghi chú cho nhân viên, tick đồng ý quy trình, rồi bấm "Đặt lịch trả kho". Hiện quy trình và các khoản phí
 * có thể phát sinh (lấy từ chính sách renewal_return + bảng phí backend).
 * API: GET /api/unit-returns/{reservationId}/slots?date=... (mỗi lần đổi ngày), POST /api/unit-returns (khi gửi).
 * Được gọi bởi: CustomerAccount.jsx (khi khách bấm "Báo trả kho" ở thẻ hợp đồng / thông báo).
 * @param {object} props
 * @param {object} props.item hợp đồng muốn trả (reservationId, contractNumber, units, endDate, minReturnDate, maxReturnDate...).
 * @param {object} props.rules quy định trả kho từ backend (returnNoticeDays, depositRefundDays).
 * @param {object[]} props.fees bảng phí trả kho từ backend.
 * @param {Function} props.onClose đóng hộp thoại.
 * @param {Function} [props.onDone] (result) => void, gọi sau khi đặt lịch thành công.
 * @returns {JSX.Element}
 */
export function ReturnRequestModal({ item, rules, fees, onClose, onDone }) {
  const dialog = useDialog()
  const policies = usePolicies()
  const rr = policies.values?.renewal_return || {} // chính sách "Gia hạn & trả kho" (yêu cầu, phí trả kho)
  const [date, setDate] = useState(toInput(item.minReturnDate)) // ngày trả, mặc định ngày sớm nhất được phép
  const [time, setTime] = useState('') // khung giờ đã chọn
  const [slots, setSlots] = useState({ loading: false, list: [], error: '' }) // khung giờ còn trống của ngày đã chọn
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false) // đã tick đồng ý quy trình chưa (bắt buộc để gửi)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Đăng ký phím Esc để đóng hộp thoại; đăng ký lại khi busy / onClose đổi.
  useEffect(() => {
    // Nhấn Esc để đóng hộp thoại (khi không đang gửi).
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Chạy mỗi khi đổi ngày: gọi GET /api/unit-returns/{id}/slots?date= để lấy khung giờ còn nhân viên rảnh
  // (backend tính bằng luật phân công chung); giữ giờ đang chọn nếu còn trống, không thì chọn giờ đầu tiên.
  // Biến cancelled bỏ qua kết quả cũ nếu người dùng đổi ngày nhanh.
  useEffect(() => {
    if (!date) { setSlots({ loading: false, list: [], error: '' }); setTime(''); return }
    let cancelled = false
    setSlots(current => ({ ...current, loading: true, error: '' }))
    apiGet(`/api/unit-returns/${item.reservationId}/slots?date=${date}`)
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data?.slots) ? data.slots : []
        setSlots({ loading: false, list, error: '' })
        setTime(current => (list.includes(current) ? current : list[0] || ''))
      })
      .catch(err => { if (!cancelled) { setSlots({ loading: false, list: [], error: err.message }); setTime('') } })
    return () => { cancelled = true }
  }, [date, item.reservationId])

  const early = date && toInput(item.endDate) > date // trả trước ngày hết hạn -> nhắc không hoàn tiền thuê còn lại
  /**
   * Khi bấm "Đặt lịch trả kho": gửi yêu cầu, gọi onDone, đóng hộp thoại và báo thành công; lỗi thì hiện trong hộp thoại.
   * API: POST /api/unit-returns  body { reservationId, returnDate, returnTime, note }
   */
  const submit = async () => {
    setBusy(true); setError('')
    try {
      const result = await apiPost('/api/unit-returns', { reservationId: item.reservationId, returnDate: date, returnTime: time, note })
      onDone?.(result)
      onClose()
      await dialog.alert({ tone: 'success', title: 'Đã đặt lịch trả kho', message: result.message })
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  // Danh sách chuỗi mô tả phí có thể phát sinh: phí trong chính sách trước, rồi phí trong bảng phí backend chưa trùng tên.
  const feeList = [
    ...(rr.returnFees || []).map(f => `${f.name}${f.amount ? `: ${money(f.amount)}` : ''}${f.condition ? ` (${f.condition})` : ''}`),
    ...fees.filter(f => !(rr.returnFees || []).some(x => x.name === f.name)).map(f => `${f.name}: ${f.valueType === 'Percentage' ? `${f.minValue}–${f.maxValue}%` : f.minValue === f.maxValue ? money(f.maxValue) : `${money(f.minValue)}–${money(f.maxValue)}`}`)
  ]

  // Hộp thoại báo trả kho
  return (
    <div className="csf-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      {/* Chọn ngày, khung giờ, ghi chú, đồng ý quy trình */}
      <div className="csf ur-modal" role="dialog" aria-modal="true" aria-labelledby="ur-title">
        <div className="csf-head">
          <div>
            <span className="sign-badge todo">Trả kho</span>
            <h2 id="ur-title">Hợp đồng {item.contractNumber}</h2>
            <p>{item.facility} · kho {item.units.join(', ')} · hết hạn {fmtDay(item.endDate)}</p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} disabled={busy} aria-label="Đóng">×</button>
        </div>
        <div className="csf-body">
          {error && <div className="auth-message error" role="alert">{error}</div>}
          <label className="csf-label" htmlFor="ur-date">Ngày trả kho</label>
          <input id="ur-date" type="date" className="csf-input" value={date} min={toInput(item.minReturnDate)} max={toInput(item.maxReturnDate)} onChange={e => setDate(e.target.value)} />
          <p className="csf-hint">
            Chọn từ {fmtDay(item.minReturnDate)} đến {fmtDay(item.maxReturnDate)} · theo chính sách cần báo trước ít nhất {rules?.returnNoticeDays ?? 7} ngày.
            {early && ' Trả kho trước ngày hết hạn không được hoàn tiền thuê của những ngày còn lại.'}
          </p>

          <label className="csf-label" htmlFor="ur-time">Giờ trả kho</label>
          {slots.loading ? <p className="csf-hint">Đang tải khung giờ còn trống...</p>
            : slots.error ? <p className="csf-hint" role="alert">{slots.error}</p>
            : slots.list.length === 0 ? <p className="csf-hint" role="alert">Ngày này đã kín lịch nhân viên. Vui lòng chọn ngày khác.</p>
            : (
              <select id="ur-time" className="csf-input" value={time} onChange={e => setTime(e.target.value)}>
                {slots.list.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}

          <div className="ur-policy">
            <h4>Quy trình trả kho</h4>
            <ol>
              <li>Đến cơ sở đúng ngày giờ hẹn, nhân viên được phân công (ưu tiên người đã bàn giao kho cho bạn) sẽ nhận lại và kiểm tra kho.</li>
              <li>{rr.returnRequirements || 'Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập.'}</li>
              <li>Không có vấn đề: tiền cọc được hoàn sau <strong>{rules?.depositRefundDays ?? 7} ngày</strong>.</li>
              <li>Có hư hỏng / phát sinh: nhân viên chụp ảnh và gửi bạn các khoản phí. Bạn có thời hạn để <strong>đồng ý hoặc khiếu nại</strong> trước khi trừ vào tiền cọc (quá hạn hệ thống tự xác nhận); nếu tiền cọc không đủ, bạn đóng thêm phần còn thiếu.</li>
            </ol>
            {feeList.length > 0 && <><h4>Các khoản phí có thể phát sinh</h4><ul>{feeList.map(f => <li key={f}>{f}</li>)}</ul></>}
          </div>

          <label className="csf-label" htmlFor="ur-note">Ghi chú cho nhân viên (không bắt buộc)</label>
          <textarea id="ur-note" className="csf-input ur-note" rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: cần xe đẩy, có 2 người phụ chuyển đồ..." />

          <label className={`csf-term ur-agree${agreed ? ' checked' : ''}`}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <div>
              <strong>Tôi đồng ý quy trình trả kho và quyết toán tiền cọc ở trên</strong>
              <p>Sau khi nhân viên nhận lại kho, mã / thẻ ra vào của tôi sẽ bị thu hồi.</p>
            </div>
          </label>
        </div>
        <div className="csf-actions">
          <span className="csf-spacer" />
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={busy}>Để sau</button>
          <button type="button" className="dashboard-primary-btn" disabled={!agreed || !date || !time || busy} onClick={submit}>{busy ? 'Đang gửi...' : `Đặt lịch trả kho ${time ? `${time} ` : ''}${date ? fmtDay(date) : ''}`}</button>
        </div>
      </div>
    </div>
  )
}
