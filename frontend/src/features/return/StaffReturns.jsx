/**
 * ======================================================================
 * FILE: src/features/return/StaffReturns.jsx  —  NHÂN VIÊN: TRẢ KHO & KIỂM KHO
 * CHỨC NĂNG: Mục "Trả kho" trong trang Nhân viên cơ sở. Liệt kê các yêu cầu trả kho của cơ sở theo nhóm
 *   (Hôm nay & quá hẹn / Sắp tới / Đang kiểm tra / Đã xong). Nhân viên được phân công bấm "Nhận lại kho"
 *   (kho sang "Đang kiểm tra", thu hồi mã ra vào), rồi nhập kết quả kiểm tra: tình trạng, ghi chú, ảnh
 *   (bắt buộc khi có vấn đề / có phí), các khoản phí và trạng thái kho sau trả. Form tự tính tiền trừ cọc /
 *   khách nợ thêm / hoàn cọc, có tính cả công nợ hợp đồng (tiền thuê chưa đóng, phí trễ hạn).
 *   Có phí kiểm kho thì CHƯA trừ cọc: khách xác nhận hoặc khiếu nại trong N ngày (quá hạn tự xác nhận),
 *   khiếu nại do Facility Manager quyết định (xem ReturnInspection.jsx). Công nợ hợp đồng vẫn trừ ngay.
 * THÀNH PHẦN CHÍNH:
 *   - money, todayIso (nội bộ): định dạng tiền, lấy "hôm nay" theo Demo Clock.
 *   - useStaffReturns (export): hook tải việc trả kho của nhân viên.
 *   - InspectForm (nội bộ): form "Hoàn tất kiểm tra kho".
 *   - StaffReturns (export default): trang danh sách trả kho của nhân viên.
 * DÙNG Ở: src/pages/staff/FacilityStaffAccount.jsx (mục "returns").
 * PHỤ THUỘC: components/common/listKit (Code, Pager, UnitCodes, useClientPaging), api/api (apiGet, apiPost),
 *   components/common/Dialog (useDialog), services/storageRules (formatVnd), services/policies (usePolicies),
 *   ./UnitReturn (fmtDay, UnitReturn.css), demoClock/demoClock (getTodayISO),
 *   ./ReturnInspection (INSPECTION, MAX_STAFF_PHOTOS, PhotoPicker, StaffInspectionStatus, useStaffInspections, parseReturnNotes).
 * API (backend UnitReturnsController, LateFeesController):
 *   GET  /api/unit-returns/staff                                -> việc trả kho của nhân viên + bảng phí + quy định
 *   POST /api/unit-returns/staff/{reservationId}/start          -> "Nhận lại kho": kho sang "Đang kiểm tra", thu hồi mã ra vào
 *   GET  /api/late-fees/returns/{reservationId}/preview         -> công nợ hợp đồng (tiền thuê chưa đóng, phí trễ hạn)
 *   POST /api/unit-returns/staff/{reservationId}/complete       -> { condition, notes, unitStatus, images, fees } hoàn tất kiểm tra
 *   (gián tiếp) GET /api/return-inspections/staff qua useStaffInspections; GET /api/policies qua usePolicies.
 * LUỒNG: khách báo trả kho -> việc hiện cho Staff được phân công -> bấm "Nhận lại kho & bắt đầu kiểm tra" (start)
 *   -> POST .../start -> bấm "Nhập kết quả kiểm tra" -> InspectForm tải công nợ (GET late-fees preview)
 *   -> nhập tình trạng, ảnh, phí -> "Hoàn tất kiểm tra" (submit) -> POST .../complete -> danh sách chuyển "Đã xong";
 *   có phí kiểm kho thì chờ Manager duyệt + khách xác nhận/khiếu nại; kho trở lại "Còn trống" hoặc "Bảo trì".
 * ======================================================================
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Code, Pager, UnitCodes, useClientPaging } from '../../components/common/listKit' // [THÊM] chia trang + mã nổi bật
import { apiGet, apiPost } from '../../api/api'
import { useDialog } from '../../components/common/Dialog'
import { formatVnd } from '../../services/storageRules'
import { usePolicies } from '../../services/policies'
import { fmtDay } from './UnitReturn'
import { getTodayISO } from '../../demoClock/demoClock'
import { INSPECTION, MAX_STAFF_PHOTOS, PhotoPicker, StaffInspectionStatus, useStaffInspections, parseReturnNotes } from './ReturnInspection'
import './UnitReturn.css'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi VND kèm "đ", vd 150000 -> "150.000đ".
 * @param {number|string} value số tiền.
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value || 0)))}đ`
// [THỜI GIAN THỰC]: const todayIso = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
// [DEMO CLOCK]: Đồng bộ ngày theo Demo Clock để test lịch trả kho
/**
 * Lấy "hôm nay" dạng 'YYYY-MM-DD' theo Demo Clock (đồng hồ giả lập để test), dùng để chia việc
 * "Hôm nay & quá hẹn" / "Sắp tới" và chặn nhận lại kho trước ngày hẹn.
 * @returns {string}
 */
const todayIso = () => getTodayISO()

/**
 * Hook: tải danh sách việc trả kho của nhân viên đang đăng nhập (tự tải khi mount) và hàm tải lại.
 * API: GET /api/unit-returns/staff  -> { items (yêu cầu trả kho), fees (bảng phí), rules (quy định) }
 * Được gọi bởi: StaffReturns.
 * @returns {{loading:boolean, error:string, data:object, items:object[], fees:object[], rules:object, reload:()=>Promise}}
 */
export function useStaffReturns() {
  const [state, setState] = useState({ loading: true, error: '', data: null })
  // Gọi lại API GET /api/unit-returns/staff và cập nhật state.
  const reload = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    return apiGet('/api/unit-returns/staff')
      .then(data => setState({ loading: false, error: '', data }))
      .catch(error => setState({ loading: false, data: null, error: error?.status === 404 ? 'Backend chưa có UnitReturnsController.cs (chép file rồi chạy lại backend).' : error.message }))
  }, [])
  // Chạy 1 lần khi mount: tải danh sách lần đầu.
  useEffect(() => { reload() }, [reload])
  return { ...state, items: state.data?.items || [], fees: state.data?.fees || [], rules: state.data?.rules || null, reload }
}

/**
 * Form "Hoàn tất kiểm tra kho": chọn tình trạng (Không có vấn đề / Có vấn đề), ghi chú, ảnh hiện trạng (bắt buộc
 * khi có vấn đề hoặc có phí), các khoản phí, trạng thái kho sau trả; tự tính số trừ cọc / khách nợ thêm / hoàn cọc
 * (đã trừ công nợ hợp đồng trước).
 * API: GET /api/late-fees/returns/{reservationId}/preview (khi mở form),
 *      POST /api/unit-returns/staff/{reservationId}/complete (khi bấm "Hoàn tất kiểm tra").
 * Được gọi bởi: StaffReturns, khi nhân viên bấm "Nhập kết quả kiểm tra" ở yêu cầu đang kiểm tra.
 * @param {object} props
 * @param {object} props.item yêu cầu trả kho (reservationId, depositPaid, units...).
 * @param {object[]} props.catalog danh mục phí để chọn nhanh: { key, feeCode, name, amount, label }.
 * @param {number} props.refundDays số ngày hoàn cọc sau khi trả kho.
 * @param {number} [props.confirmDays=3] số ngày khách được xác nhận / khiếu nại phí kiểm kho.
 * @param {Function} props.onDone gọi sau khi lưu thành công.
 * @param {Function} props.onCancel đóng form (bấm "Đóng").
 * @returns {JSX.Element}
 */
function InspectForm({ item, catalog, refundDays, confirmDays = 3, onDone, onCancel }) {
  const dialog = useDialog()
  const [condition, setCondition] = useState('Good') // 'Good' | 'Damaged'
  const [notes, setNotes] = useState('')
  const [unitStatus, setUnitStatus] = useState('Available') // trạng thái kho sau trả: 'Available' | 'Maintenance'
  const [fees, setFees] = useState([]) // các khoản phí kiểm kho: { feeCode, description, amount }
  const [busy, setBusy] = useState(false)
  const [images, setImages] = useState([]) // ảnh hiện trạng kho (data URL từ PhotoPicker)
  // Công nợ còn lại của hợp đồng (tiền thuê chưa đóng, phí trễ hạn...) - backend trừ vào cọc TRƯỚC phí kiểm kho
  const [debt, setDebt] = useState(null)
  // Chạy khi mở form (hoặc đổi hợp đồng): tải công nợ hợp đồng; lỗi thì coi như không có công nợ.
  useEffect(() => {
    let cancelled = false
    apiGet(`/api/late-fees/returns/${item.reservationId}/preview`)
      .then(data => { if (!cancelled) setDebt(data) })
      .catch(() => { if (!cancelled) setDebt(null) })
    return () => { cancelled = true }
  }, [item.reservationId])
  const debtTotal = Number(debt?.debtTotal || 0)

  // Tính quyết toán: total = tổng phí kiểm kho; fromDeposit = phần trừ vào cọc; owed = khách phải đóng thêm;
  // refund = cọc còn dư được hoàn (công nợ hợp đồng luôn được trừ trước).
  const total = fees.reduce((n, f) => n + (Number(f.amount) || 0), 0)
  const deposit = Number(item.depositPaid || 0)
  const fromDeposit = Math.min(debtTotal + total, deposit)
  const owed = Math.max(0, debtTotal + total - deposit)
  const refund = Math.max(0, deposit - debtTotal - total)
  // Có vấn đề / có phí -> bắt buộc ảnh; có phí kiểm kho -> chờ khách xác nhận rồi mới trừ cọc
  const photosRequired = condition === 'Damaged' || total > 0
  const debtFromDeposit = Math.min(debtTotal, deposit)

  // Khi chọn 1 mục trong ô "+ Thêm khoản phí...": thêm khoản phí đó (hoặc dòng trống nếu "Khoản khác") vào danh sách.
  const addFee = key => {
    const f = catalog.find(c => c.key === key)
    setFees(list => [...list, { feeCode: f?.feeCode || null, description: f?.name || '', amount: f?.amount ?? '' }])
  }
  // Khi gõ vào ô tên / số tiền của 1 khoản phí: sửa khoản phí ở vị trí i.
  const update = (i, patch) => setFees(list => list.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  /**
   * Khi bấm "Hoàn tất kiểm tra": bắt buộc mô tả khi có vấn đề, bắt buộc ảnh khi có vấn đề/có phí, hỏi xác nhận
   * (nêu rõ số trừ cọc / hoàn cọc) rồi lưu; thành công thì gọi onDone().
   * API: POST /api/unit-returns/staff/{reservationId}/complete  body { condition, notes, unitStatus, images, fees }
   */
  const submit = async () => {
    if (condition === 'Damaged' && !notes.trim()) {
      await dialog.alert({ tone: 'warning', title: 'Thiếu mô tả', message: 'Kho có vấn đề: ghi rõ tình trạng để gửi cho khách.' })
      return
    }
    if (photosRequired && images.length === 0) {
      await dialog.alert({ tone: 'warning', title: 'Thiếu ảnh', message: 'Kho có vấn đề hoặc có phí phát sinh: chụp ít nhất 1 ảnh làm bằng chứng gửi khách.' })
      return
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: 'Hoàn tất kiểm tra?',
      message: total > 0 // có phí kiểm kho: báo phí chờ khách xác nhận, chưa trừ cọc
        ? `${condition === 'Good' ? 'Kho không có vấn đề.' : 'Kho có vấn đề.'}${debtTotal > 0 ? ` Công nợ hợp đồng ${money(debtTotal)} trừ vào cọc ngay.` : ''}\nPhí kiểm kho ${money(total)} kèm ${images.length} ảnh sẽ gửi khách xác nhận trong ${confirmDays} ngày, CHƯA trừ cọc cho tới khi khách đồng ý / quá hạn / Manager giải quyết khiếu nại.\nKết quả và ảnh không sửa lại được.`
        : `${condition === 'Good' ? 'Kho không có vấn đề.' : 'Kho có vấn đề.'}${debtTotal > 0 ? ` Công nợ hợp đồng: ${money(debtTotal)}.` : ''} Không có phí kiểm kho.\n${owed > 0 ? `Khách cần đóng thêm ${money(owed)}.` : `Hoàn cọc cho khách: ${money(refund)} sau ${refundDays} ngày.`}\nKết quả sẽ gửi cho khách và không sửa lại được.`,
      confirmLabel: 'Hoàn tất', cancelLabel: 'Xem lại'
    })
    if (!ok) return
    setBusy(true)
    try {
      const result = await apiPost(`/api/unit-returns/staff/${item.reservationId}/complete`, {
        condition, notes, unitStatus, images, // gửi kèm ảnh hiện trạng
        fees: fees.filter(f => Number(f.amount) > 0).map(f => ({ feeCode: f.feeCode, description: f.description, amount: Number(f.amount) }))
      })
      await dialog.alert({ tone: 'success', title: 'Đã hoàn tất kiểm tra', message: result.message })
      onDone()
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa lưu được', message: error.message })
      setBusy(false)
    }
  }

  return (
    <div className="sr-form">
      <div className="sr-radio" role="radiogroup" aria-label="Tình trạng kho">
        <label><input type="radio" checked={condition === 'Good'} onChange={() => setCondition('Good')} /> Không có vấn đề</label>
        <label><input type="radio" checked={condition === 'Damaged'} onChange={() => { setCondition('Damaged') }} /> Có vấn đề / hư hỏng</label>
      </div>
      <label>Ghi chú tình trạng {condition === 'Damaged' && <em>(bắt buộc)</em>}
        <textarea className="st-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ví dụ: tường trầy 2 vết, mất 1 thẻ từ, còn rác..." />
      </label>

      {/* Ảnh hiện trạng kho (PhotoPicker của ReturnInspection.jsx) */}
      <PhotoPicker images={images} onChange={setImages} max={MAX_STAFF_PHOTOS} required={photosRequired} disabled={busy}
        hint={photosRequired ? 'Chụp rõ chỗ hư hỏng / bẩn / thiếu đồ: khách và Facility Manager sẽ xem ảnh này trước khi trừ cọc.' : 'Nên chụp vài ảnh kho trống để lưu bằng chứng tình trạng lúc nhận lại.'} />

      <div>
        <strong>Phí phát sinh</strong>
        {fees.map((f, i) => (
          <div key={i} className="sr-fee-row">
            <input className="st-input" value={f.description} onChange={e => update(i, { description: e.target.value })} placeholder="Tên khoản phí" />
            <input className="st-input" type="number" min="0" step="10000" value={f.amount} onChange={e => update(i, { amount: e.target.value })} placeholder="Số tiền" />
            <button type="button" onClick={() => setFees(list => list.filter((_, j) => j !== i))} aria-label="Xóa">×</button>
          </div>
        ))}
        <select className="st-input" value="" onChange={e => { if (e.target.value) addFee(e.target.value) }}>
          <option value="">+ Thêm khoản phí...</option>
          {catalog.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          <option value="custom">Khoản khác (tự nhập)</option>
        </select>
      </div>

      <label>Kho sau khi kiểm tra
        <select className="st-input" value={unitStatus} onChange={e => setUnitStatus(e.target.value)}>
          <option value="Available">Sẵn sàng cho thuê (Còn trống)</option>
          <option value="Maintenance">Cần bảo trì / sửa chữa</option>
        </select>
      </label>
      {unitStatus === 'Maintenance' && (
        <div className="st-alert st-warn">
          Hệ thống sẽ ghi báo cáo sự cố gửi Facility Manager.
          {item.units.filter(u => u.nextBooking).map(u => ` Kho ${u.unitNumber} đã có đơn ${u.nextBooking.reservationCode} giữ từ ${fmtDay(u.nextBooking.startDate)} - khách này sẽ không nhận được kho cho tới khi Manager đổi kho hoặc kho sửa xong.`).join('')}
        </div>
      )}

      {debt && (debtTotal > 0 || debt.futureRents?.length > 0) && (
        <div className="st-alert st-warn">
          <strong>Công nợ của hợp đồng sẽ trừ vào cọc trước phí kiểm kho:</strong>
          {(debt.rentDebts || []).map((d, i) => (
            <div key={`r${i}`}>• Tiền thuê kỳ {fmtDay(d.periodStart)}–{fmtDay(d.periodEnd)}{d.unitNumber ? ` (kho ${d.unitNumber})` : ''} chưa đóng: <b>{money(d.amount)}</b></div>
          ))}
          {(debt.fees || []).map((f, i) => (
            <div key={`f${i}`}>• {f.description}: <b>{money(f.amount)}</b></div>
          ))}
          {debt.futureRents?.length > 0 && (
            <div>• {debt.futureRents.length} kỳ tiền thuê chưa tới (khách trả trước hạn) sẽ được hủy, không thu.</div>
          )}
        </div>
      )}

      <div className="sr-summary">
        <div><span>Tiền cọc khách đã đóng</span><b>{money(deposit)}</b></div>
        {debtTotal > 0 && <div><span>Công nợ hợp đồng (tiền thuê, phí trễ hạn)</span><b>{money(debtTotal)}</b></div>}
        <div><span>Tổng phí phát sinh</span><b>{money(total)}</b></div>
        {total > 0 ? (
          /* Có phí kiểm kho: chỉ công nợ hợp đồng trừ ngay, phí kiểm kho chờ khách xác nhận */
          <>
            <div><span>Trừ vào cọc ngay (công nợ hợp đồng)</span><b>{money(debtFromDeposit)}</b></div>
            <div><span>Phí kiểm kho chờ khách xác nhận ({confirmDays} ngày)</span><b>{money(total)}</b></div>
            {owed > 0
              ? <div className="bad"><span>Nếu khách đồng ý: cần đóng thêm</span><b>{money(owed)}</b></div>
              : <div className="ok"><span>Nếu khách đồng ý: hoàn cọc</span><b>{money(refund)}</b></div>}
          </>
        ) : (
          <>
            <div><span>Trừ vào cọc</span><b>{money(fromDeposit)}</b></div>
            {owed > 0
              ? <div className="bad"><span>Khách cần đóng thêm</span><b>{money(owed)}</b></div>
              : <div className="ok"><span>Hoàn cọc sau {refundDays} ngày</span><b>{money(refund)}</b></div>}
          </>
        )}
      </div>

      <div className="sr-actions">
        <button type="button" className="dashboard-secondary-btn" onClick={onCancel} disabled={busy}>Đóng</button>
        <button type="button" className="dashboard-primary-btn" onClick={submit} disabled={busy}>{busy ? 'Đang lưu...' : 'Hoàn tất kiểm tra'}</button>
      </div>
    </div>
  )
}

/**
 * Trang "Trả kho" của nhân viên: lọc yêu cầu theo Hôm nay & quá hẹn / Sắp tới / Đang kiểm tra / Đã xong, phân trang,
 * hiện nút "Nhận lại kho", form kiểm tra (InspectForm) và kết quả quyết toán. Chỉ người được phân công mới thao tác
 * được (backend cũng chặn).
 * API: GET /api/unit-returns/staff (useStaffReturns), POST /api/unit-returns/staff/{id}/start (start),
 *   GET /api/return-inspections/staff (useStaffInspections), GET /api/policies (usePolicies).
 * Được gọi bởi: FacilityStaffAccount.jsx khi nhân viên chọn mục "Trả kho".
 * @param {object} props
 * @param {object} props.staff thông tin nhân viên (dùng staff.facilityId để lọc theo cơ sở).
 * @returns {JSX.Element}
 */
export default function StaffReturns({ staff }) {
  const dialog = useDialog()
  const data = useStaffReturns()
  const inspections = useStaffInspections() // kết quả kiểm kho (trạng thái chờ duyệt / xác nhận / khiếu nại)
  const policies = usePolicies()
  const [filter, setFilter] = useState('todo') // nhóm đang xem: 'todo' | 'upcoming' | 'inspecting' | 'done'
  const [inspecting, setInspecting] = useState(null) // reservationId đang mở form kiểm tra
  const [busy, setBusy] = useState(null) // reservationId đang gọi API "Nhận lại kho"

  // Chia yêu cầu của cơ sở thành 4 nhóm theo trạng thái và ngày hẹn so với "hôm nay".
  const today = todayIso()
  const atFacility = data.items.filter(i => !staff?.facilityId || i.facility === staff.facilityId)
  const groups = {
    todo: atFacility.filter(i => i.requestStatus === 'Scheduled' && String(i.scheduledDate).slice(0, 10) <= today),
    upcoming: atFacility.filter(i => i.requestStatus === 'Scheduled' && String(i.scheduledDate).slice(0, 10) > today),
    inspecting: atFacility.filter(i => i.requestStatus === 'In Progress'),
    done: atFacility.filter(i => i.requestStatus === 'Completed')
  }
  const shown = groups[filter]
  const paging = useClientPaging(shown, { resetKey: filter })

  // Danh mục phí cho form kiểm tra: phí trong chính sách "renewal_return" + bảng phí từ backend.
  const catalog = [
    ...(policies.values?.renewal_return?.returnFees || []).map((f, i) => ({ key: `p${i}`, name: f.name, amount: f.amount ?? '', label: `${f.name}${f.amount ? ` · ${money(f.amount)}` : ' · theo thực tế'}` })),
    ...data.fees.map(f => ({ key: f.feeCode, feeCode: f.feeCode, name: f.name, amount: f.valueType === 'Amount' && f.maxValue === f.minValue ? f.maxValue : '', label: `${f.name}${f.valueType === 'Amount' ? ` · ${f.minValue === f.maxValue ? money(f.maxValue) : `${money(f.minValue)}–${money(f.maxValue)}`}` : ''}` }))
  ]

  /**
   * Khi bấm "Nhận lại kho & bắt đầu kiểm tra": hỏi xác nhận, gọi API, tải lại danh sách, chuyển sang nhóm
   * "Đang kiểm tra" và mở luôn form kiểm tra cho yêu cầu đó.
   * API: POST /api/unit-returns/staff/{reservationId}/start
   */
  const start = async item => {
    const ok = await dialog.confirm({
      tone: 'info', title: 'Nhận lại kho?',
      message: `Nhận lại kho ${item.units.map(u => u.unitNumber).join(', ')} của ${item.customerName}. Kho chuyển sang "Đang kiểm tra" và mã / thẻ ra vào của khách bị thu hồi.`,
      confirmLabel: 'Nhận lại kho', cancelLabel: 'Chưa'
    })
    if (!ok) return
    setBusy(item.reservationId)
    try {
      await apiPost(`/api/unit-returns/staff/${item.reservationId}/start`, {})
      await data.reload()
      setFilter('inspecting'); setInspecting(item.reservationId)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa nhận lại kho được', message: error.message })
    } finally { setBusy(null) }
  }

  if (data.loading && !data.data) return <div className="st-card">Đang tải lịch trả kho...</div>
  if (data.error) return <div className="st-card"><div className="st-alert st-warn" role="alert">{data.error}</div><button type="button" className="dashboard-primary-btn" onClick={data.reload}>Thử lại</button></div>

  return (
    <div className="sr-wrap">
      <div className="sr-chips">
        {[['todo', `Hôm nay & quá hẹn ${groups.todo.length}`], ['upcoming', `Sắp tới ${groups.upcoming.length}`], ['inspecting', `Đang kiểm tra ${groups.inspecting.length}`], ['done', `Đã xong ${groups.done.length}`]].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && <div className="st-card st-empty">Không có yêu cầu trả kho nào trong mục này.</div>}

      {paging.pageRows.map(item => {
        const req = item.request
        return (
          <article key={item.reservationId} className="sr-item">
            <div className="sr-item-head">
              <div>
                <h3>
                  {item.customerName}
                  {item.assignedToMe ? <span className="sr-mine">Giao cho bạn</span> : <span className="sr-other">NV {req.staffName}</span>}
                </h3>
                <p className="sr-codes"><Code kind="contract">{item.contractNumber}</Code><UnitCodes units={item.units.map(u => u.unitNumber)} max={4} /><span>{item.customerPhone || item.customerEmail}</span></p>
                <p>Hẹn trả <b>{item.scheduledTime ? `${item.scheduledTime} ` : ''}{fmtDay(item.scheduledDate)}</b> · hết hạn {fmtDay(item.endDate)}</p>
                {req.overdue && <span className="sr-other">Quá hạn · hệ thống tự lên lịch, liên hệ khách</span>}
              </div>
              <div><small>Tiền cọc đang giữ</small><br /><strong>{money(item.depositPaid)}</strong></div>
            </div>
            <div className="sr-units">
              {item.units.map(u => <span key={u.unitNumber}><b>{u.unitNumber}</b> · {u.type} · {u.size}{u.access ? ` · ${u.access}` : ''}{u.nextBooking ? ` · đã có đơn ${u.nextBooking.reservationCode} từ ${fmtDay(u.nextBooking.startDate)}` : ''}</span>)}
            </div>
            {(() => {
              const { customerNote } = parseReturnNotes(req.notes)
              if (!customerNote) return null
              return (
                <div className="sr-cust-note">
                  <span className="sr-cust-note-tag">Khách ghi chú</span>
                  <span className="sr-cust-note-text">{customerNote}</span>
                </div>
              )
            })()}

            {/* Chỉ người được phân công mới thao tác (backend cũng chặn). Muốn đổi người: báo Facility Manager. */}
            {item.requestStatus !== 'Completed' && !item.assignedToMe && (
              <div className="st-alert st-info">Yêu cầu này do NV {req.staffName} phụ trách nên bạn không thao tác được. Nếu cần đổi người, báo Facility Manager.</div>
            )}
            {item.requestStatus === 'Scheduled' && item.assignedToMe && (
              <div className="sr-actions">
                {String(item.scheduledDate || '').slice(0, 10) > todayIso()
                  ? <div className="st-alert st-info">Khách hẹn trả ngày {fmtDay(item.scheduledDate)}. Từ ngày đó mới nhận lại kho được.</div>
                  : <button type="button" className="dashboard-primary-btn" disabled={busy === item.reservationId} onClick={() => start(item)}>
                      {busy === item.reservationId ? 'Đang xử lý...' : 'Nhận lại kho & bắt đầu kiểm tra'}
                    </button>}
              </div>
            )}
            {item.requestStatus === 'In Progress' && item.assignedToMe && (inspecting === item.reservationId
              ? <InspectForm item={item} catalog={catalog} refundDays={data.rules?.depositRefundDays ?? 7} confirmDays={inspections.confirmDays} onCancel={() => setInspecting(null)} onDone={() => { setInspecting(null); data.reload(); inspections.reload(); setFilter('done') }} />
              : <div className="sr-actions"><button type="button" className="dashboard-primary-btn" onClick={() => setInspecting(item.reservationId)}>Nhập kết quả kiểm tra</button></div>)}
            {item.requestStatus === 'Completed' && (() => {
              // Phí kiểm kho đang chờ khách xác nhận / khiếu nại thì chưa có số hoàn cọc
              const insp = inspections.byReservation(item.reservationId)
              const pending = insp && insp.status !== INSPECTION.SETTLED
              const { staffNote } = parseReturnNotes(req.notes)
              return (
                <>
                  <div className="sr-summary">
                    <div>
                      <span>Hiện trạng kho</span>
                      <b className={req.conditionResult === 'Damaged' ? 'bad' : 'ok'}>
                        {req.conditionResult === 'Damaged' ? '⚠️ Có vấn đề' : '✓ Kho bình thường'}
                      </b>
                    </div>
                    <div><span>Trừ vào cọc{pending ? ' (công nợ hợp đồng)' : ''}</span><b>{money(req.deductedFromDeposit)}</b></div>
                    {Number(req.amountOwed) > 0 && <div className="bad"><span>Khách còn nợ</span><b>{money(req.amountOwed)}</b></div>}
                    {pending
                      ? <div><span>Phí kiểm kho chờ quyết toán</span><b>{money(insp?.proposedTotal ?? 0)}</b></div>
                      : <div className="ok"><span>Hoàn cọc</span><b>{money(req.refundAmount)}{Number(req.refundAmount) > 0 ? (req.refundStatus === 'Completed' ? ' · đã chuyển' : ` · ${fmtDay(req.refundDueDate)}`) : ''}</b></div>}
                  </div>
                  <StaffInspectionStatus inspection={insp} fallbackNote={staffNote} />
                </>
              )
            })()}
          </article>
        )
      })}
      <Pager {...paging.pagerProps} unit="yêu cầu" />
    </div>
  )
}
