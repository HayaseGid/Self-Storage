/**
 * ======================================================================
 * FILE: src/pages/business/BusinessFacilityForm.jsx  —  FORM SỬA THÔNG TIN CƠ SỞ
 * CHỨC NĂNG: Hộp thoại (modal) để Business Operations sửa tên, địa chỉ, Facility Manager phụ trách và
 *   trạng thái hoạt động của 1 cơ sở. Mã chi nhánh do hệ thống cấp nên chỉ hiển thị (các mã kho đã phát sinh
 *   theo mã này). Có kiểm tra dữ liệu (độ dài, trùng tên), hiện khu vực (quận) nhận diện từ địa chỉ,
 *   và hỏi xác nhận kèm bảng tóm tắt thay đổi trước khi lưu.
 * THÀNH PHẦN CHÍNH:
 *   - BusinessFacilityForm (export default): component form sửa cơ sở.
 *     + submit: kiểm tra, hỏi xác nhận, gọi onSave.
 * DÙNG Ở: src/pages/business/BusinessOperations.jsx (khi bấm "Sửa thông tin" một cơ sở).
 * PHỤ THUỘC: features/facility/LocationPicker (chọn vị trí trên bản đồ), utils/districts (extractDistrict), BusinessCatalog.css (kiểu modal / ô nhập .bc-*).
 * API: Không gọi API trực tiếp. Dữ liệu được trả qua onSave(); BusinessOperations gọi
 *   PUT /api/operations/facilities/{id} (OperationsController).
 * LUỒNG: mở form với dữ liệu gốc -> người dùng sửa ô -> bấm "Lưu thay đổi" -> submit kiểm tra lỗi
 *   -> hộp thoại liệt kê thay đổi -> xác nhận -> onSave(values) -> cha gọi API, thành công thì đóng form.
 * ======================================================================
 */
import React, { useEffect, useState } from 'react'
import { extractDistrict } from '../../utils/districts'
import LocationPicker from '../../features/facility/LocationPicker' // chọn vị trí cơ sở trên bản đồ
import './BusinessCatalog.css'

/**
 * Form (hộp thoại) sửa thông tin 1 cơ sở, tự kiểm tra hợp lệ và tóm tắt thay đổi trước khi lưu.
 * Được gọi bởi: BusinessOperations khi state editingFacility khác null.
 * @param {object} props
 * @param {object} props.facility cơ sở đang sửa (facilityId, name, address, managerEmail/manager, status, unitCodePrefix).
 * @param {Array} [props.facilities] mọi cơ sở, dùng để kiểm tra trùng tên.
 * @param {Array} [props.managers] danh sách Facility Manager { userId, fullName, email } cho ô chọn.
 * @param {object} props.dialog đối tượng hộp thoại (useDialog) để alert / confirm.
 * @param {Function} props.onClose đóng form (bấm Hủy, ×, Esc hoặc bấm ra ngoài).
 * @param {Function} props.onSave nhận { name, address, managerEmail, status } khi người dùng xác nhận lưu.
 * @returns {JSX.Element} modal form.
 */
export default function BusinessFacilityForm({ facility, facilities = [], managers = [], dialog, onClose, onSave }) {
  // Giá trị gốc của cơ sở, dùng làm giá trị ban đầu và để so sánh tìm thay đổi.
  const original = {
    name: facility.name || '',
    address: facility.address || '',
    managerEmail: facility.managerEmail || facility.manager || '',
    status: facility.status === 'inactive' ? 'inactive' : 'active',
    latitude: facility.latitude ?? null,
    longitude: facility.longitude ?? null
  }
  const [values, setValues] = useState(original)
  const [touched, setTouched] = useState(false) // đã bấm Lưu ít nhất 1 lần -> bắt đầu hiện lỗi dưới ô nhập
  const [saving, setSaving] = useState(false)

  // Gắn phím tắt khi form mở (chạy lại nếu onClose đổi): nhấn Esc để đóng form; gỡ sự kiện khi form đóng.
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Tạo hàm xử lý onChange cho 1 trường của form (trả về hàm nhận event).
  const set = key => event => setValues(current => ({ ...current, [key]: event.target.value }))
  const name = values.name.trim()
  const address = values.address.trim()
  // Có cơ sở KHÁC trùng tên (không phân biệt hoa thường) hay không.
  const duplicate = facilities.some(f => f.facilityId !== facility.facilityId && String(f.name).trim().toLowerCase() === name.toLowerCase())
  // Nếu quản lý hiện tại không còn trong danh sách managers thì thêm 1 lựa chọn "(Quản lý hiện tại)" lên đầu để không mất giá trị.
  const managerOptions = managers.some(m => m.email === original.managerEmail) || !original.managerEmail
    ? managers
    : [{ userId: 'current', fullName: '(Quản lý hiện tại)', email: original.managerEmail }, ...managers]

  // Thông báo lỗi cho từng ô (chuỗi rỗng = hợp lệ).
  const errors = {
    name: !name ? 'Vui lòng nhập tên cơ sở.'
      : name.length < 3 ? 'Tên cơ sở cần ít nhất 3 ký tự.'
        : name.length > 100 ? 'Tên cơ sở tối đa 100 ký tự.'
          : duplicate ? 'Đã có cơ sở khác trùng tên.' : '',
    address: !address ? 'Vui lòng nhập địa chỉ.'
      : address.length < 8 ? 'Địa chỉ quá ngắn, cần có số nhà, đường và quận.'
        : address.length > 255 ? 'Địa chỉ tối đa 255 ký tự.' : '',
    managerEmail: !values.managerEmail ? 'Vui lòng chọn Facility Manager.' : '',
    location: values.latitude == null || values.longitude == null ? 'Vui lòng chọn vị trí cơ sở trên bản đồ để cơ sở hiện trên bản đồ của khách.' : ''
  }
  const valid = Object.values(errors).every(v => !v)
  const district = extractDistrict(address, name)

  const labels = { name: 'Tên cơ sở', address: 'Địa chỉ', managerEmail: 'Facility Manager', status: 'Trạng thái' }
  // Vị trí dạng chữ "vĩ độ, kinh độ" để so sánh và hiện trong hộp thoại xác nhận.
  const locText = (lat, lng) => (lat == null || lng == null ? 'Chưa có' : `${lat}, ${lng}`)
  // Đổi mã trạng thái thành nhãn tiếng Việt ("Đang hoạt động" / "Ngừng hoạt động").
  const statusLabel = s => (s === 'inactive' ? 'Ngừng hoạt động' : 'Đang hoạt động')
  // Danh sách thay đổi so với giá trị gốc, mỗi phần tử là [nhãn, giá trị cũ, giá trị mới] để hiện trong hộp thoại xác nhận.
  const changes = Object.keys(labels)
    .filter(key => String(key === 'name' ? name : key === 'address' ? address : values[key]) !== String(original[key]))
    .map(key => [labels[key], key === 'status' ? statusLabel(original[key]) : original[key] || '—', key === 'status' ? statusLabel(values[key]) : key === 'name' ? name : key === 'address' ? address : values[key]])
  if (locText(values.latitude, values.longitude) !== locText(original.latitude, original.longitude))
    changes.push(['Vị trí trên bản đồ', locText(original.latitude, original.longitude), locText(values.latitude, values.longitude)])

  /**
   * Lưu form (submit khi bấm "Lưu thay đổi"): kiểm tra hợp lệ, báo nếu không có thay đổi, hỏi xác nhận kèm
   * danh sách thay đổi (tông đỏ + cảnh báo khi chuyển sang ngừng hoạt động), rồi gọi onSave và bật/tắt cờ saving.
   * @param {Event} event sự kiện submit của form.
   */
  const submit = async event => {
    event.preventDefault()
    setTouched(true)
    if (!valid) return
    if (!changes.length) {
      await dialog.alert({ tone: 'info', title: 'Chưa có thay đổi', message: `Thông tin cơ sở "${facility.name}" vẫn giữ nguyên.` })
      return
    }
    const ok = await dialog.confirm({
      tone: values.status === 'inactive' && original.status !== 'inactive' ? 'danger' : 'warning',
      title: `Lưu thay đổi cho "${facility.name}"?`,
      message: (
        <>
          <ul className="bc-changes">
            {changes.map(([label, from, to]) => <li key={label}><strong>{label}:</strong> {from} → <strong>{to}</strong></li>)}
          </ul>
          {values.status === 'inactive' && original.status !== 'inactive' && <p>Khách hàng sẽ không đặt được kho mới tại cơ sở này.</p>}
        </>
      ),
      confirmLabel: 'Lưu thay đổi'
    })
    if (!ok) return
    setSaving(true)
    try {
      await onSave({ name, address, managerEmail: values.managerEmail, status: values.status, latitude: values.latitude, longitude: values.longitude })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bc-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <form className="bc-modal" role="dialog" aria-modal="true" aria-labelledby="bf-title" onSubmit={submit} noValidate>
        <div className="bc-modal-head">
          <div>
            <h3 id="bf-title">Sửa thông tin cơ sở</h3>
            <p>{facility.name}</p>
          </div>
          <button type="button" className="bc-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="bc-modal-body">
          <label className={`bc-field${touched && errors.name ? ' has-error' : ''}`}>
            <span className="bc-field-label">Tên cơ sở<em aria-hidden="true"> *</em></span>
            <input value={values.name} maxLength={110} onChange={set('name')} autoFocus />
            {touched && errors.name && <span className="bc-field-error" role="alert">{errors.name}</span>}
          </label>
          <label className="bc-field">
            <span className="bc-field-label">Mã chi nhánh</span>
            <input value={facility.unitCodePrefix || ''} readOnly />
            <span className="bc-field-hint">Do hệ thống cấp, không sửa được vì các mã kho ({facility.unitCodePrefix}-U01…) đã phát sinh theo mã này.</span>
          </label>
          <label className={`bc-field${touched && errors.address ? ' has-error' : ''}`}>
            <span className="bc-field-label">Địa chỉ<em aria-hidden="true"> *</em></span>
            <input value={values.address} maxLength={260} onChange={set('address')} placeholder="Ví dụ: 123 Lê Lợi, Quận 1, TP.HCM" />
            {touched && errors.address
              ? <span className="bc-field-error" role="alert">{errors.address}</span>
              : <span className="bc-field-hint">Khu vực nhận diện: <strong>{district?.label || 'chưa xác định, nên ghi rõ quận'}</strong> (dùng cho bộ lọc khu vực của khách).</span>}
          </label>
          <div className="bc-field">
            <span className="bc-field-label">Vị trí trên bản đồ<em aria-hidden="true"> *</em></span>
            <LocationPicker
              value={{ latitude: values.latitude, longitude: values.longitude }}
              address={values.address}
              error={touched ? errors.location : ''}
              onChange={({ latitude, longitude }) => setValues(current => ({ ...current, latitude, longitude }))}
            />
          </div>
          <div className="bc-row">
            <label className={`bc-field${touched && errors.managerEmail ? ' has-error' : ''}`}>
              <span className="bc-field-label">Facility Manager<em aria-hidden="true"> *</em></span>
              <select value={values.managerEmail} onChange={set('managerEmail')}>
                <option value="">Chọn Facility Manager</option>
                {managerOptions.map(m => <option key={m.userId} value={m.email}>{m.fullName} · {m.email}</option>)}
              </select>
              {touched && errors.managerEmail && <span className="bc-field-error" role="alert">{errors.managerEmail}</span>}
            </label>
            <label className="bc-field">
              <span className="bc-field-label">Trạng thái</span>
              <select value={values.status} onChange={set('status')}>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Ngừng hoạt động</option>
              </select>
            </label>
          </div>
        </div>
        <div className="bc-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </form>
    </div>
  )
}
