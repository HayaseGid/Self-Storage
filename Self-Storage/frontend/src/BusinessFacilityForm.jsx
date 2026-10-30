import React, { useEffect, useState } from 'react'
import { extractDistrict } from './districts'
import './BusinessCatalog.css'

/*
 * Form sửa thông tin cơ sở (Business Operations): tên, địa chỉ, Facility Manager, trạng thái.
 * Mã chi nhánh do hệ thống cấp nên chỉ hiển thị, không sửa (mã kho đã phát sinh theo mã này).
 * Gọi PUT /api/operations/facilities/{id} (backend đã có sẵn).
 */
export default function BusinessFacilityForm({ facility, facilities = [], managers = [], dialog, onClose, onSave }) {
  const original = {
    name: facility.name || '',
    address: facility.address || '',
    managerEmail: facility.managerEmail || facility.manager || '',
    status: facility.status === 'inactive' ? 'inactive' : 'active'
  }
  const [values, setValues] = useState(original)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = key => event => setValues(current => ({ ...current, [key]: event.target.value }))
  const name = values.name.trim()
  const address = values.address.trim()
  const duplicate = facilities.some(f => f.facilityId !== facility.facilityId && String(f.name).trim().toLowerCase() === name.toLowerCase())
  const managerOptions = managers.some(m => m.email === original.managerEmail) || !original.managerEmail
    ? managers
    : [{ userId: 'current', fullName: '(Quản lý hiện tại)', email: original.managerEmail }, ...managers]

  const errors = {
    name: !name ? 'Vui lòng nhập tên cơ sở.'
      : name.length < 3 ? 'Tên cơ sở cần ít nhất 3 ký tự.'
        : name.length > 100 ? 'Tên cơ sở tối đa 100 ký tự.'
          : duplicate ? 'Đã có cơ sở khác trùng tên.' : '',
    address: !address ? 'Vui lòng nhập địa chỉ.'
      : address.length < 8 ? 'Địa chỉ quá ngắn, cần có số nhà, đường và quận.'
        : address.length > 255 ? 'Địa chỉ tối đa 255 ký tự.' : '',
    managerEmail: !values.managerEmail ? 'Vui lòng chọn Facility Manager.' : ''
  }
  const valid = Object.values(errors).every(v => !v)
  const district = extractDistrict(address, name)

  const labels = { name: 'Tên cơ sở', address: 'Địa chỉ', managerEmail: 'Facility Manager', status: 'Trạng thái' }
  const statusLabel = s => (s === 'inactive' ? 'Ngừng hoạt động' : 'Đang hoạt động')
  const changes = Object.keys(labels)
    .filter(key => String(key === 'name' ? name : key === 'address' ? address : values[key]) !== String(original[key]))
    .map(key => [labels[key], key === 'status' ? statusLabel(original[key]) : original[key] || '—', key === 'status' ? statusLabel(values[key]) : key === 'name' ? name : key === 'address' ? address : values[key]])

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
      await onSave({ name, address, managerEmail: values.managerEmail, status: values.status })
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
