import React, { useState, useEffect, useMemo, useRef } from 'react'
import './styles.css'
import './fmanagerstyles.css'
import { apiGet, apiPost, apiPut, apiDelete } from './api'
import { mapOperationsState } from './operationsState'
import { useDialog } from './Dialog'
import {
  EDITABLE_UNIT_STATUSES,
  RESERVATION_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  formatReservationCode,
  formatVnd,
  getUnitLock,
  medianPrice,
  validateMonthlyPrice
} from './storageRules'
import PriceInput from './PriceInput'
import { UnitTypeChip } from './unitTypes'
import './unitTypes.css'
import { getCartOrders } from './cart'
import BusinessCatalog from './BusinessCatalog'

/* Formatters */
const fmtMoney = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ'
const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')
const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const RES_STATUS_MAP = {
  PENDING_PAYMENT: { label: 'Chờ trả cọc', tone: 'warn' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận cọc', tone: 'warn' },
  PENDING_APPROVAL: { label: 'Chờ Manager duyệt', tone: 'info' },
  CONFIRMED: { label: 'Đã phân kho', tone: 'info' },
  HANDED_OVER: { label: 'Đã bàn giao', tone: 'ok' }
}

const UNIT_STATUS_MAP = {
  AVAILABLE: { label: 'Còn trống', tone: 'ok' },
  BOOKING: { label: 'Đang giữ chỗ chờ cọc', tone: 'warn' },
  RESERVED: { label: 'Đã giữ chỗ', tone: 'info' },
  RENTED: { label: 'Đang thuê', tone: 'ok' },
  NEEDS_INSPECTION: { label: 'Cần kiểm tra', tone: 'warn' },
  MAINTENANCE: { label: 'Bảo trì', tone: 'warn' },
  INACTIVE: { label: 'Ngừng sử dụng', tone: 'warn' }
}

const PAY_STATUS_MAP = {
  PENDING: { label: 'Chưa thanh toán', tone: 'warn' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'warn' },
  PAID: { label: 'Đã thanh toán cọc', tone: 'ok' }
}

/* Kho vừa tạo được nhớ trong phiên làm việc (theo từng cơ sở) để hiển thị nổi bật. */
const FRESH_UNITS_KEY = 'storespace_fresh_units'
const FRESH_TTL_MS = 12 * 60 * 60 * 1000

function loadFreshUnits(facilityKey) {
  try {
    const all = JSON.parse(sessionStorage.getItem(FRESH_UNITS_KEY) || '{}')
    return (all[facilityKey] || []).filter(item => Date.now() - Date.parse(item.createdAt) < FRESH_TTL_MS)
  } catch {
    return []
  }
}

function saveFreshUnits(facilityKey, list) {
  try {
    const all = JSON.parse(sessionStorage.getItem(FRESH_UNITS_KEY) || '{}')
    all[facilityKey] = list
    sessionStorage.setItem(FRESH_UNITS_KEY, JSON.stringify(all))
  } catch {
    // bỏ qua nếu trình duyệt chặn lưu trữ
  }
}

/* Mã kho dự kiến (chỉ để xem trước, hệ thống cấp mã thật khi lưu vào DB). */
function previewNextUnitCode(prefix, units) {
  if (!prefix) return null
  const codePrefix = `${String(prefix).trim().toUpperCase()}-U`
  const max = units
    .map(unit => String(unit.id || ''))
    .filter(code => code.toUpperCase().startsWith(codePrefix))
    .map(code => Number.parseInt(code.slice(codePrefix.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${codePrefix}${String(max + 1).padStart(2, '0')}`
}

/* Badge Component */
function Badge({ map, value }) {
  const item = map[value] || { label: value, tone: 'info' }
  return <span className={`fm-badge fm-${item.tone}`}>{item.label}</span>
}

/* Modal Tạo/Chỉnh Sửa Kho */
function UnitFormModal({ facilityDbId, nextUnitCode, editingUnit, onClose, onSave, unitTypes, unitSizes, rentalRates, facilityUnits = [], dialog }) {
  const currentType = unitTypes.find(item => item.name === editingUnit?.type)
  const currentSize = unitSizes.find(item => item.dimensions === editingUnit?.size)

  // Giá trị ban đầu của kho đang sửa: dùng để điền sẵn form và so sánh thay đổi.
  const original = useMemo(() => editingUnit ? {
    typeId: String(editingUnit.unitTypeId ?? currentType?.unitTypeId ?? ''),
    sizeId: String(editingUnit.unitSizeId ?? editingUnit.sizeId ?? currentSize?.unitSizeId ?? ''),
    price: String(editingUnit.pricePerMonth ?? ''),
    status: editingUnit.status
  } : null, [editingUnit])

  const [typeId, setTypeId] = useState(original?.typeId || String(unitTypes[0]?.unitTypeId ?? ''))
  const [sizeId, setSizeId] = useState(original?.sizeId || String(unitSizes[0]?.unitSizeId ?? ''))
  const [pricePerMonth, setPricePerMonth] = useState(original?.price ?? '')
  const [status, setStatus] = useState(original?.status || 'AVAILABLE')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedType = unitTypes.find(item => String(item.unitTypeId) === typeId)
  const selectedSize = unitSizes.find(item => String(item.unitSizeId) === sizeId)

  // Nếu cơ sở đã có biểu giá cho loại + size này thì backend luôn lưu theo biểu giá,
  // nên form hiển thị đúng giá đó (chỉ đọc) để giá trị nhìn thấy = giá trị được lưu.
  const rate = rentalRates.find(item =>
    Number(item.facilityId) === Number(facilityDbId) &&
    String(item.unitTypeId) === typeId &&
    String(item.unitSizeId) === sizeId)
  const effectivePrice = rate ? String(Number(rate.price)) : String(pricePerMonth ?? '')

  // Giá tham chiếu khi chưa có biểu giá: trung vị các kho cùng loại + size (hoặc cùng loại) tại cơ sở.
  const peers = facilityUnits.filter(unit => unit.id !== editingUnit?.id)
  const sameTypeSize = peers.filter(unit => String(unit.unitTypeId) === typeId && String(unit.sizeId ?? unit.unitSizeId) === sizeId)
  const sameType = peers.filter(unit => String(unit.unitTypeId) === typeId)
  const referencePrice = rate ? null : (medianPrice(sameTypeSize.map(u => u.pricePerMonth)) ?? medianPrice(sameType.map(u => u.pricePerMonth)))
  const referenceLabel = sameTypeSize.length ? 'giá kho cùng loại & size' : 'giá kho cùng loại'

  const statusOptions = EDITABLE_UNIT_STATUSES.includes(status)
    ? EDITABLE_UNIT_STATUSES
    : [status, ...EDITABLE_UNIT_STATUSES]

  const changes = original ? [
    typeId !== original.typeId && ['Loại kho', unitTypes.find(t => String(t.unitTypeId) === original.typeId)?.name || '—', selectedType?.name || '—'],
    sizeId !== original.sizeId && ['Size', unitSizes.find(s => String(s.unitSizeId) === original.sizeId)?.dimensions || '—', selectedSize?.dimensions || '—'],
    Number(effectivePrice) !== Number(original.price) && ['Giá thuê', fmtMoney(Number(original.price)), fmtMoney(Number(effectivePrice))],
    status !== original.status && ['Trạng thái', UNIT_STATUS_LABELS[original.status] || original.status, UNIT_STATUS_LABELS[status] || status]
  ].filter(Boolean) : []
  const changedField = label => changes.some(change => change[0] === label)

  const resetToOriginal = () => {
    if (!original) return
    setTypeId(original.typeId)
    setSizeId(original.sizeId)
    setPricePerMonth(original.price)
    setStatus(original.status)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedType || !selectedSize) return setError('Vui lòng chọn loại và kích thước kho hợp lệ.')
    const priceCheck = rate ? { ok: true, warning: '' } : validateMonthlyPrice(Number(effectivePrice), referencePrice)
    if (!priceCheck.ok) {
      setError(priceCheck.error)
      await dialog.alert({ tone: 'warning', title: 'Giá thuê chưa hợp lệ', message: priceCheck.error })
      return
    }
    setError('')
    if (!editingUnit && priceCheck.warning) {
      const ok = await dialog.confirm({
        tone: 'warning',
        title: 'Giá thuê lệch nhiều so với kho cùng loại',
        message: `${priceCheck.warning.replace('giá tham chiếu', referenceLabel)}\nBạn có chắc muốn tạo kho với giá ${formatVnd(effectivePrice)}đ/tháng?`,
        confirmLabel: 'Vẫn tạo kho'
      })
      if (!ok) return
    }

    if (editingUnit) {
      if (!changes.length) {
        await dialog.alert({ tone: 'info', title: 'Chưa có thay đổi', message: `Thông tin kho ${editingUnit.id} vẫn giữ nguyên, không có gì để lưu.` })
        return
      }
      const confirmed = await dialog.confirm({
        tone: 'warning',
        title: `Lưu thay đổi cho kho ${editingUnit.id}?`,
        message: (
          <>
            <ul className="fm-change-list">
              {changes.map(([label, from, to]) => (
                <li key={label}><strong>{label}:</strong> {from} → <strong>{to}</strong></li>
              ))}
            </ul>
            {priceCheck.warning && <p className="fm-price-warning">⚠ {priceCheck.warning.replace('giá tham chiếu', referenceLabel)}</p>}
          </>
        ),
        confirmLabel: 'Lưu thay đổi'
      })
      if (!confirmed) return
    }

    setSaving(true)
    try {
      await onSave({
        type: selectedType.name,
        unitTypeId: selectedType.unitTypeId,
        size: selectedSize.dimensions,
        unitSizeId: selectedSize.unitSizeId,
        sizeM2: selectedSize.volume,
        pricePerMonth: Number(effectivePrice),
        status
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card">
        <div className="fm-modal-header">
          <h2>{editingUnit ? `Chỉnh sửa kho ${editingUnit.id}` : 'Tạo kho mới'}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <form onSubmit={handleSubmit} className="fm-modal-form">
          {error && <div className="auth-message error" role="alert">{error}</div>}

          <div className="fm-code-preview">
            <small>Mã kho</small>
            {editingUnit
              ? <strong>{editingUnit.id}</strong>
              : <strong>{nextUnitCode || '—'} <em>(dự kiến)</em></strong>}
            <span>
              {editingUnit
                ? 'Mã kho do hệ thống cấp, không thay đổi được.'
                : 'Mã kho do hệ thống tự cấp khi lưu vào database, không nhập tay.'}
            </span>
          </div>

          <div className="fm-form-row">
            <label className={changedField('Loại kho') ? 'fm-field-changed' : ''}>
              Loại kho
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                {unitTypes.map(item => <option key={item.unitTypeId} value={item.unitTypeId}>{item.name}</option>)}
              </select>
            </label>

            <label className={changedField('Size') ? 'fm-field-changed' : ''}>
              Size
              <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} required>
                {unitSizes.map(item => <option key={item.unitSizeId} value={item.unitSizeId}>{item.dimensions}</option>)}
              </select>
            </label>
          </div>

          <div className="fm-form-row">
            <label className={changedField('Giá thuê') ? 'fm-field-changed' : ''}>
              Giá thuê (VNĐ/tháng)
              <PriceInput
                value={effectivePrice === '' ? '' : Number(effectivePrice)}
                onChange={number => setPricePerMonth(number == null ? '' : String(number))}
                readOnly={Boolean(rate)}
                reference={referencePrice}
                referenceLabel={referenceLabel}
                ariaLabel="Giá thuê theo tháng"
              />
              {rate && <small className="fm-field-note">Theo biểu giá của cơ sở cho loại + size này. Muốn đổi giá, cập nhật ở mục Giá &amp; phí (Business Operations).</small>}
            </label>

            <label className={changedField('Trạng thái') ? 'fm-field-changed' : ''}>
              Trạng thái
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map(value => (
                  <option key={value} value={value} disabled={!EDITABLE_UNIT_STATUSES.includes(value)}>
                    {UNIT_STATUS_LABELS[value] || value}
                  </option>
                ))}
              </select>
              <small className="fm-field-note">"Giữ chỗ" và "Đang thuê" do hệ thống tự đặt theo đơn, không chọn tay.</small>
            </label>
          </div>

          {editingUnit && (
            <div className="fm-original-box">
              <div>
                <strong>Giá trị ban đầu:</strong>{' '}
                {editingUnit.type} · {editingUnit.size} · {fmtMoney(editingUnit.pricePerMonth)} · {UNIT_STATUS_LABELS[editingUnit.status] || editingUnit.status}
              </div>
              {changes.length > 0
                ? <button type="button" className="dashboard-secondary-btn sm" onClick={resetToOriginal}>Khôi phục giá trị ban đầu</button>
                : <span className="fm-muted">Chưa thay đổi</span>}
            </div>
          )}

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? 'Đang lưu...' : editingUnit ? 'Lưu thay đổi' : 'Tạo kho'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   POPUP CHI TIẾT KHO
   ========================================================= */
function UnitDetailModal({ unit, facility, lock, contract, onClose, onEdit }) {
  // Nhấn Esc để đóng
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isRented = unit.status === 'RENTED' || Boolean(contract)
  const locked = isRented || Boolean(lock?.locked)
  const lockTitle = isRented ? 'Kho đang được thuê' : 'Kho đang có đơn đặt chỗ'
  const lockMessage = isRented
    ? 'Kho đang được thuê nên không thể sửa. Bạn chỉ có thể chỉnh sửa sau khi khách trả kho.'
    : (lock?.reason || 'Kho đang có đơn đặt chỗ nên không thể sửa.')
  const reservations = lock?.reservations || []

  const Tile = ({ label, children }) => (
    <div className="fm-detail-tile">
      <small>{label}</small>
      <div className="fm-detail-value">{children || '—'}</div>
    </div>
  )

  return (
    <div className="fm-modal-overlay" onClick={onClose}>
      <div
        className="fm-detail-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fm-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="fm-detail-header">
          <div>
            <span className="customer-eyebrow">STORAGE UNIT DETAILS</span>
            <h2 id="fm-detail-title">Chi tiết kho {unit.id}</h2>
            <p>Thông tin kho lưu trữ thuộc cơ sở bạn quản lý.</p>
          </div>
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>✕ Đóng</button>
        </div>

        {/* THÔNG TIN CƠ SỞ */}
        <div className="fm-detail-facility">
          <span className="customer-eyebrow">FACILITY INFORMATION</span>
          <h3>{facility?.name || 'Chưa cập nhật cơ sở'}</h3>
          <p>Địa chỉ: {facility?.address || facility?.location || '—'}</p>
          {facility?.contactPhone && <p>Điện thoại: {facility.contactPhone}</p>}
        </div>

        {/* THÔNG TIN ĐƠN VỊ KHO */}
        <section className="fm-detail-section">
          <h3>Thông tin đơn vị kho</h3>
          <div className="fm-detail-grid">
            <Tile label="Mã kho">{unit.id}</Tile>
            <Tile label="Loại kho"><UnitTypeChip type={unit.type} compact /></Tile>
            <Tile label="Diện tích / kích thước">{unit.size}</Tile>
            <Tile label="Giá thuê">{fmtMoney(unit.pricePerMonth)}/tháng</Tile>
            <Tile label="Trạng thái"><Badge map={UNIT_STATUS_MAP} value={unit.status} /></Tile>
          </div>
        </section>

        {/* HỢP ĐỒNG ĐANG HIỆU LỰC */}
        {contract && (
          <section className="fm-detail-section">
            <h3>Hợp đồng thuê hiện tại</h3>
            <div className="fm-detail-grid">
              <Tile label="Khách hàng">{contract.customerName}</Tile>
              <Tile label="Mã hợp đồng">{contract.id}</Tile>
              <Tile label="Mã đơn">{formatReservationCode(contract.reservationId)}</Tile>
              <Tile label="Ngày bắt đầu">{fmtDate(contract.startDate)}</Tile>
              <Tile label="Ngày kết thúc">{fmtDate(contract.endDate)}</Tile>
              <Tile label="Truy cập">{contract.accessType ? `${contract.accessType}: ${contract.accessValue}` : null}</Tile>
            </div>
          </section>
        )}

        {/* ĐƠN ĐẶT CHỖ LIÊN QUAN */}
        {reservations.length > 0 && (
          <section className="fm-detail-section">
            <h3>Đơn đặt chỗ liên quan ({reservations.length})</h3>
            <div className="fm-detail-grid">
              {reservations.map(r => (
                <div key={r.id} className="fm-detail-tile">
                  <small>{formatReservationCode(r.id)}</small>
                  <div className="fm-detail-value">{r.customerName || '—'}</div>
                  <small>{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</small>
                  <div style={{ marginTop: 6 }}>
                    <span className="fm-badge fm-info">{RESERVATION_STATUS_LABELS[r.status] || r.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CẢNH BÁO KHÓA SỬA */}
        {locked && (
          <div className="fm-detail-lock" role="status">
            <span aria-hidden="true">🔒</span>
            <div>
              <strong>{lockTitle}</strong>
              <p>{lockMessage}</p>
            </div>
          </div>
        )}

        {/* NÚT THAO TÁC */}
        <div className="fm-detail-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Đóng</button>
          <button
            type="button"
            className="dashboard-primary-btn"
            disabled={locked}
            title={locked ? lockMessage : 'Chỉnh sửa thông tin kho'}
            onClick={() => onEdit(unit)}
          >
            ✎ Sửa kho
          </button>
        </div>
      </div>
    </div>
  )
}

/* =========================================================
   LOẠI KHO  (/api/unit-types)
   ========================================================= */
// Chuẩn hóa dữ liệu trả về, chấp nhận nhiều kiểu đặt tên trường
function normalizeUnitType(raw) {
  const active = raw.isActive ?? raw.IsActive ??
    (typeof raw.status === 'string' ? raw.status.toLowerCase() === 'active' : true)
  return {
    id: raw.unitTypeID ?? raw.unitTypeId ?? raw.id,
    name: raw.typeName ?? raw.name ?? '',
    description: raw.description ?? '',
    facilityId: raw.facilityID ?? raw.facilityId ?? null,
    isActive: Boolean(active)
  }
}

/* =========================================================
   MODAL TẠO / SỬA LOẠI KHO
   ========================================================= */
function UnitTypeFormModal({ editingType, existingTypes, nextId, unitCount = 0, onClose, onSave }) {
  const [name, setName] = useState(editingType?.name || '')
  const [description, setDescription] = useState(editingType?.description || '')
  const [isActive, setIsActive] = useState(editingType ? editingType.isActive : true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanDesc = description.trim()

    if (!cleanName) return setError('Vui lòng nhập tên loại kho.')
    if (cleanName.length > 100) return setError('Tên loại kho tối đa 100 ký tự.')
    if (cleanDesc.length > 255) return setError('Mô tả tối đa 255 ký tự.')

    // Không trùng tên với loại hệ thống hoặc loại khác của cơ sở (không phân biệt hoa thường)
    const duplicate = existingTypes.find(t =>
      t.id !== editingType?.id && t.name.trim().toLowerCase() === cleanName.toLowerCase())
    if (duplicate) {
      const scope = duplicate.facilityId == null ? 'loại hệ thống' : 'loại của cơ sở'
      return setError(duplicate.isActive
        ? `Tên "${cleanName}" đã tồn tại (${scope} #${duplicate.id}).`
        : `Tên "${cleanName}" trùng với loại #${duplicate.id} đang "Không hoạt động". Hãy sửa loại đó và bật lại "Hoạt động" thay vì tạo mới.`)
    }

    // Còn kho đang dùng thì không được ngừng hoạt động (trigger DB sẽ chặn cập nhật các kho đó)
    if (!isActive && unitCount > 0) {
      return setError(`Còn ${unitCount} kho đang dùng loại này nên chưa thể chuyển sang "Không hoạt động". Hãy đổi loại cho các kho đó trước.`)
    }

    if (editingType &&
        cleanName === editingType.name &&
        cleanDesc === (editingType.description || '').trim() &&
        isActive === editingType.isActive) {
      return setError('Bạn chưa thay đổi thông tin nào.')
    }

    setError('')
    setSaving(true)
    try {
      await onSave({ typeName: cleanName, description: cleanDesc || null, isActive })
    } catch (err) {
      // Lỗi từ backend hiện ngay trong form, không đẩy lên đầu trang
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card">
        <div className="fm-modal-header">
          <h2>{editingType ? `Sửa loại kho #${editingType.id}` : 'Tạo loại kho mới'}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <form onSubmit={handleSubmit} className="fm-modal-form">
          {error && <div className="auth-message error" role="alert">{error}</div>}

          {/* ID: hệ thống tự cấp, không nhập tay */}
          <div className="fm-code-preview">
            <small>Mã loại kho (ID)</small>
            {editingType
              ? <strong>#{editingType.id}</strong>
              : <strong>#{nextId ?? '—'} <em>(dự kiến)</em></strong>}
            <span>
              {editingType
                ? 'ID do hệ thống cấp, không thay đổi được.'
                : 'ID do database tự cấp khi lưu, không nhập tay. Số thực tế có thể khác nếu có loại kho khác vừa được tạo.'}
            </span>
          </div>

          <label>
            Tên loại kho
            <input
              type="text"
              value={name}
              maxLength={100}
              placeholder="VD: Kho để xe"
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
            <small className="fm-field-note">{name.trim().length}/100 ký tự</small>
          </label>

          <label>
            Mô tả
            <textarea
              rows={3}
              value={description}
              maxLength={255}
              placeholder="VD: Kho có lối dắt xe, phù hợp gửi xe máy dài hạn"
              onChange={(e) => setDescription(e.target.value)}
            />
            <small className="fm-field-note">{description.trim().length}/255 ký tự</small>
          </label>

          <label>
            Trạng thái
            <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
              <option value="active">Hoạt động</option>
              <option value="inactive" disabled={unitCount > 0}>
                Không hoạt động{unitCount > 0 ? ` (còn ${unitCount} kho đang dùng)` : ''}
              </option>
            </select>
            <small className="fm-field-note">Chỉ loại "Hoạt động" mới xuất hiện khi tạo hoặc sửa kho.</small>
          </label>

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn" disabled={saving}>
              {saving ? 'Đang lưu...' : editingType ? 'Lưu thay đổi' : 'Tạo loại kho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   MAIN DASHBOARD COMPONENT
   ========================================================= */
export default function FacilityManagerDashboard({ embedded = false, currentUser = null, navigate = null, currentUserKey = 'storespace_current_user' }) {
  const dialog = useDialog()
  const [db, setDb] = useState({ facilities: [], units: [], reservations: [], contracts: [], staff: [], unitTypes: [], unitSizes: [], rentalRates: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [editingUnit, setEditingUnit] = useState(null)
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [selectedResId, setSelectedResId] = useState(null)
  const [selectedUnitForAssign, setSelectedUnitForAssign] = useState('')
  const [cartOrderUnitSelections, setCartOrderUnitSelections] = useState({})
  const [assigningCartOrderCode, setAssigningCartOrderCode] = useState(null)
  const [unitFilter, setUnitFilter] = useState('all')
  const [freshUnits, setFreshUnits] = useState([])
  const [highlightUnitId, setHighlightUnitId] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [viewingUnitId, setViewingUnitId] = useState(null)
  const [unitTypeList, setUnitTypeList] = useState([])
  const [nextUnitTypeId, setNextUnitTypeId] = useState(null)
  const [unitTypesLoading, setUnitTypesLoading] = useState(false)
  const [unitTypesError, setUnitTypesError] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [editingType, setEditingType] = useState(null)
  const [showTypeModal, setShowTypeModal] = useState(false)

  const manager = currentUser
  const loadState = async ({ silent = false } = {}) => {
    if (!manager?.email) {
      setError('Phiên đăng nhập không có email Facility Manager.')
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await apiGet(`/api/operations/state?email=${encodeURIComponent(manager.email)}`)
      const mapped = mapOperationsState(data)
      setDb(mapped)
      if (!mapped.facilities.length) setError('Tài khoản chưa được gán cơ sở trong database.')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadState()
  }, [manager?.email])

  const managedFacility = db.facilities.find(facility =>
    facility.managerEmail?.toLowerCase() === manager?.email?.toLowerCase()
  ) || db.facilities[0]
  const facilityName = managedFacility?.name || 'Chưa được gán cơ sở'
  const facilityKey = String(managedFacility?.facilityId ?? '')

  useEffect(() => {
    if (facilityKey) setFreshUnits(loadFreshUnits(facilityKey))
  }, [facilityKey])

  // Cuộn tới và nháy sáng dòng kho vừa tạo.
  useEffect(() => {
    if (!highlightUnitId || activeTab !== 'units') return
    const timer = window.setTimeout(() => {
      document.getElementById(`fm-unit-row-${highlightUnitId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)
    const clear = window.setTimeout(() => setHighlightUnitId(null), 4000)
    return () => { window.clearTimeout(timer); window.clearTimeout(clear) }
  }, [highlightUnitId, activeTab])

  const showToast = message => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  /* Dữ liệu đã lọc theo Cơ sở của Manager */
  const facilityUnits = useMemo(() => db.units.filter(u => u.facilityId === facilityName), [db, facilityName])
  const facilityReservations = useMemo(() => db.reservations.filter(r => r.facilityId === facilityName), [db, facilityName])
  const facilityContracts = useMemo(() => db.contracts.filter(c => c.facilityId === facilityName), [db, facilityName])
  const freshIds = useMemo(() => new Set(freshUnits.map(item => item.unitNumber)), [freshUnits])
  const unitLocks = useMemo(() => new Map(facilityUnits.map(unit => [unit.id, getUnitLock(unit, facilityReservations)])), [facilityUnits, facilityReservations])
  const nextUnitCode = previewNextUnitCode(managedFacility?.unitCodePrefix, facilityUnits)

  /* Thống kê Báo cáo (Reports & Analytics) */
  const stats = useMemo(() => {
    const totalUnits = facilityUnits.length
    const rentedUnits = facilityUnits.filter(u => u.status === 'RENTED').length
    const reservedUnits = facilityUnits.filter(u => u.status === 'RESERVED' || u.status === 'BOOKING').length
    const availableUnits = facilityUnits.filter(u => u.status === 'AVAILABLE').length
    const occupancyRate = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0

    const totalRevenue = facilityReservations
      .filter(r => r.status === 'HANDED_OVER' && r.paymentStatus === 'PAID')
      .reduce((sum, r) => sum + (r.rentalFee || 0), 0)

    const pendingApprovals = facilityReservations.filter(r => r.status === 'PENDING_APPROVAL').length
    const pendingPayments = facilityReservations.filter(r => r.status === 'PENDING_PAYMENT').length

    return { totalUnits, rentedUnits, reservedUnits, availableUnits, occupancyRate, totalRevenue, pendingApprovals, pendingPayments }
  }, [facilityUnits, facilityReservations])

  /* Xử lý Cập nhật DB */
  const handleApproveAndAssign = async (resId, unitId) => {
    if (!unitId) {
      setError('Vui lòng chọn một kho trống để phân bổ.')
      await dialog.alert({ tone: 'warning', title: 'Chưa chọn kho', message: 'Vui lòng chọn một kho trống để phân bổ cho đơn này.' })
      return
    }
    const confirmed = await dialog.confirm({
      tone: 'warning',
      title: `Phân kho ${unitId} cho đơn ${formatReservationCode(resId)}?`,
      message: 'Sau khi duyệt, kho sẽ được giữ cho khách và chuyển sang chờ bàn giao.',
      confirmLabel: 'Duyệt & phân kho'
    })
    if (!confirmed) return
    setError('')
    try {
      await apiPost(`/api/operations/reservations/${resId}/assign`, { unitNumber: unitId })
      await loadState({ silent: true })
      setSelectedResId(null)
      setSelectedUnitForAssign('')
      showToast(`Đã phân kho ${unitId} cho đơn ${formatReservationCode(resId)}.`)
    } catch (actionError) {
      setError(actionError.message)
      await dialog.alert({ tone: 'danger', title: 'Không phân được kho', message: actionError.message })
    }
  }

  // Duyệt một đơn giỏ hàng có nhiều kho.
// Mỗi reservation vẫn được phân bổ qua API hiện có.
const handleApproveCartOrder = async (order) => {
  const reservations = order.reservations || []

  if (!reservations.length) {
    await dialog.alert({
      tone: 'warning',
      title: 'Không có kho chờ duyệt',
      message: 'Đơn này không còn reservation nào đang chờ duyệt.'
    })
    return
  }

  // Kiểm tra Manager đã chọn kho cho tất cả các reservation chưa.
  const assignments = reservations.map(res => ({
    reservation: res,
    unitId:
      cartOrderUnitSelections[String(res.id)] ??
      res.assignedUnitId ??
      res.unitId ??
      ''
  }))

  const missing = assignments.filter(item => !item.unitId)

  if (missing.length > 0) {
    await dialog.alert({
      tone: 'warning',
      title: 'Chưa chọn đủ kho',
      message:
        'Vui lòng chọn kho phân bổ cho tất cả các dòng trước khi duyệt đơn.'
    })
    return
  }

  // Không cho hai reservation trong cùng đơn chọn trùng một kho.
  const selectedUnitIds = assignments.map(item => String(item.unitId))
  if (new Set(selectedUnitIds).size !== selectedUnitIds.length) {
    await dialog.alert({
      tone: 'warning',
      title: 'Kho bị chọn trùng',
      message:
        'Mỗi reservation phải được phân bổ vào một kho khác nhau. Vui lòng kiểm tra lại.'
    })
    return
  }

  const confirmed = await dialog.confirm({
    tone: 'warning',
    title: `Duyệt đơn ${order.code}?`,
    message:
      `Đơn này có ${assignments.length} kho. ` +
      'Hệ thống sẽ lần lượt gửi yêu cầu phân bổ từng kho. ' +
      'Nếu một yêu cầu lỗi, những kho đã xử lý trước đó có thể vẫn được phân bổ.',
    confirmLabel: 'Duyệt đơn'
  })

  if (!confirmed) return

  setError('')
  setAssigningCartOrderCode(order.code)

  const succeeded = []
  const failures = []

  try {
    // Gọi API riêng cho từng reservation theo đúng backend hiện tại.
    for (const item of assignments) {
      try {
        await apiPost(
          `/api/operations/reservations/${item.reservation.id}/assign`,
          { unitNumber: item.unitId }
        )

        succeeded.push({
          reservationId: item.reservation.id,
          unitId: item.unitId
        })
      } catch (actionError) {
        failures.push(
          `${formatReservationCode(item.reservation.id)}: ${actionError.message}`
        )

        // Dừng ở lỗi đầu tiên để Manager kiểm tra trước khi tiếp tục.
        break
      }
    }

    await loadState({ silent: true })

    if (failures.length > 0) {
      await dialog.alert({
        tone: 'warning',
        title: 'Đơn mới được xử lý một phần',
        message:
          `Đã phân bổ thành công ${succeeded.length}/${assignments.length} kho.\n` +
          (succeeded.length
            ? 'Đã xử lý: ' +
              succeeded.map(item =>
                `${formatReservationCode(item.reservationId)} → ${item.unitId}`
              ).join(', ') +
              '\n'
            : '') +
          'Lỗi: ' + failures.join('\n') +
          '\nVui lòng tải lại danh sách và kiểm tra trạng thái từng kho trước khi thao tác tiếp.'
      })
    } else {
      setCartOrderUnitSelections(current => {
        const next = { ...current }
        assignments.forEach(item => {
          delete next[String(item.reservation.id)]
        })
        return next
      })

      showToast(`Đã phân bổ đủ ${succeeded.length} kho của đơn ${order.code}.`)

      await dialog.alert({
        tone: 'success',
        title: 'Đã gửi yêu cầu duyệt đơn',
        message:
          `Đã phân bổ thành công ${succeeded.length} kho thuộc đơn ${order.code}.`
      })
    }
  } finally {
    setAssigningCartOrderCode(null)
  }
}

  const openEditUnit = async unit => {
    const lock = unitLocks.get(unit.id)
    if (lock?.locked) {
      await dialog.alert({ tone: 'warning', title: `Không thể sửa kho ${unit.id}`, message: lock.reason })
      return
    }
    setEditingUnit(unit)
    setShowUnitModal(true)
  }

  const dismissFreshUnit = unitNumber => {
    const next = freshUnits.filter(item => item.unitNumber !== unitNumber)
    setFreshUnits(next)
    saveFreshUnits(facilityKey, next)
  }

  const handleSaveUnit = async (unitData) => {
    const request = {
      facilityID: managedFacility?.facilityId,
      unitTypeID: unitData.unitTypeId,
      unitSizeID: unitData.unitSizeId,
      unitType: unitData.type,
      size: unitData.size,
      sizeM2: unitData.sizeM2 ?? undefined,
      basePrice: Number(unitData.pricePerMonth),
      status: unitData.status
    }
    if (!Number.isInteger(request.facilityID) || !request.unitTypeID || !request.unitSizeID) {
      setError('Thiếu cơ sở, loại kho hoặc size hợp lệ từ database. Hãy tải lại dữ liệu.')
      await dialog.alert({ tone: 'danger', title: 'Thiếu dữ liệu', message: 'Thiếu cơ sở, loại kho hoặc size hợp lệ từ database. Hãy tải lại dữ liệu.' })
      return
    }
    setError('')
    try {
      if (editingUnit) {
        const result = await apiPut(`/api/operations/units/${encodeURIComponent(editingUnit.id)}`, request)
        await loadState({ silent: true })
        setShowUnitModal(false)
        setEditingUnit(null)
        if (result?.basePrice != null && Number(result.basePrice) !== request.basePrice) {
          await dialog.alert({
            tone: 'warning',
            title: 'Giá được lưu theo biểu giá',
            message: `Kho ${editingUnit.id} đã được lưu với giá ${fmtMoney(result.basePrice)}/tháng theo biểu giá của cơ sở.`
          })
        } else {
          showToast(`Đã lưu thay đổi cho kho ${editingUnit.id}.`)
        }
        return
      }

      const created = await apiPost('/api/operations/units', request)
      await loadState({ silent: true })
      setShowUnitModal(false)
      setEditingUnit(null)

      const unitNumber = created?.unitNumber || created?.unitCode
      if (unitNumber) {
        const entry = {
          unitNumber,
          type: unitData.type,
          size: unitData.size,
          price: Number(created?.basePrice ?? request.basePrice),
          createdAt: new Date().toISOString()
        }
        const next = [entry, ...freshUnits.filter(item => item.unitNumber !== unitNumber)]
        setFreshUnits(next)
        saveFreshUnits(facilityKey, next)
        setActiveTab('units')
        setHighlightUnitId(unitNumber)
      }

      const choice = await dialog.open({
        tone: 'success',
        title: unitNumber ? `Đã tạo kho ${unitNumber}` : 'Đã tạo kho mới',
        message: `${unitData.type} · ${unitData.size} · ${fmtMoney(created?.basePrice ?? request.basePrice)}/tháng.\nMã kho được hệ thống cấp khi lưu vào database. Kho mới được ghim ở đầu danh sách với nhãn "Mới".`,
        dismissValue: 'view',
        actions: [
          { label: 'Tạo thêm kho', value: 'more', variant: 'secondary' },
          { label: 'Xem kho vừa tạo', value: 'view', variant: 'primary' }
        ]
      })
      if (choice === 'more') {
        setEditingUnit(null)
        setShowUnitModal(true)
      }
    } catch (actionError) {
      // Form tạo/sửa kho đang mở và che dòng lỗi ở đầu trang, nên báo bằng pop-up.
      setError(actionError.message)
      await dialog.alert({ tone: 'danger', title: 'Không lưu được kho', message: actionError.message })
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(currentUserKey)
    navigate?.('/')
  }

  const pendingList = facilityReservations.filter(
    r => r.status === 'PENDING_APPROVAL'
  )

  const awaitingPaymentList = facilityReservations.filter(
    r => r.status === 'PENDING_PAYMENT'
  )

  // Đọc các đơn giỏ hàng đã được Customer lưu trong localStorage.
  const cartOrders = getCartOrders()

  // Ghép reservation trong đơn giỏ hàng với reservation đang chờ Manager duyệt.
  const groupedCartOrders = cartOrders
    .map(order => {
      const orderReservationIds = (order.reservationIds || []).map(String)

      const reservations = pendingList.filter(r =>
        orderReservationIds.includes(String(r.id))
      )

      return {
        ...order,
        reservations
      }
    })
    .filter(order => order.reservations.length > 1)

  // Những reservation đã thuộc đơn nhiều kho sẽ không hiện thêm ở danh sách đơn lẻ.
  const groupedReservationIds = new Set(
    groupedCartOrders.flatMap(order =>
      order.reservations.map(r => String(r.id))
    )
  )

  const individualPendingList = pendingList.filter(
    r => !groupedReservationIds.has(String(r.id))
  )

  const staffList = db.staff.filter(staff => staff.facilityId === facilityName)

  const visibleUnits = useMemo(() => {
    const filtered = facilityUnits.filter(unit => {
      if (unitFilter === 'fresh') return freshIds.has(unit.id)
      if (unitFilter === 'booked') return unitLocks.get(unit.id)?.reservations.length > 0
      if (unitFilter === 'available') return unit.status === 'AVAILABLE' && !unitLocks.get(unit.id)?.locked
      return true
    })
    // Kho mới tạo luôn được ghim lên đầu.
    return [...filtered].sort((a, b) => Number(freshIds.has(b.id)) - Number(freshIds.has(a.id)))
  }, [facilityUnits, unitFilter, freshIds, unitLocks])

  const freshUnitDetails = freshUnits
    .map(item => ({ ...item, unit: facilityUnits.find(unit => unit.id === item.unitNumber) }))
    .filter(item => item.unit)

  /* Popup chi tiết kho */
  const viewingUnit = viewingUnitId ? facilityUnits.find(u => u.id === viewingUnitId) : null
  const viewingContract = viewingUnit
    ? facilityContracts.find(c => c.unitId === viewingUnit.id && String(c.endDate || '').slice(0, 10) >= todayStr())
    : null

  const openEditFromDetail = (unit) => {
    setViewingUnitId(null)
    openEditUnit(unit)
  }

    /* ===== THIẾT LẬP LOẠI KHO ===== */
  const facilityDbId = managedFacility?.facilityId

  const loadUnitTypes = async () => {
    if (facilityDbId == null) return
    setUnitTypesLoading(true)
    setUnitTypesError('')
    try {
      const data = await apiGet(`/api/unit-types?facilityId=${facilityDbId}`)
      const all = (Array.isArray(data) ? data : []).map(normalizeUnitType)
      // ID dự kiến = ID lớn nhất đang có + 1 (DB dùng IDENTITY nên chỉ là dự kiến)
      const maxId = all.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0)
      setNextUnitTypeId(maxId + 1)
      // Loại kho có tại cơ sở = loại hệ thống + loại riêng của cơ sở (cả hoạt động lẫn không hoạt động)
      setUnitTypeList(all.filter(t => t.facilityId == null || Number(t.facilityId) === Number(facilityDbId)))
    } catch (err) {
      setUnitTypesError(err.message)
    } finally {
      setUnitTypesLoading(false)
    }
  }

  // Tải ngay khi vào trang (để form tạo kho có danh sách loại) và mỗi lần mở tab loại kho
  useEffect(() => {
    if (facilityDbId != null && (activeTab === 'unitTypes' || unitTypeList.length === 0)) loadUnitTypes()
  }, [facilityDbId, activeTab])

  // Đếm số kho (chưa ngừng sử dụng) của cơ sở đang dùng từng loại
  const typeUnitCounts = useMemo(() => {
    const byId = new Map()
    const byName = new Map()
    facilityUnits.forEach(u => {
      if (u.status === 'INACTIVE') return
      const idKey = String(u.unitTypeId ?? '')
      if (idKey) byId.set(idKey, (byId.get(idKey) || 0) + 1)
      const nameKey = String(u.type || '').toLowerCase()
      byName.set(nameKey, (byName.get(nameKey) || 0) + 1)
    })
    return { byId, byName }
  }, [facilityUnits])

  const countUnitsOfType = (t) =>
    typeUnitCounts.byId.get(String(t.id)) ?? typeUnitCounts.byName.get(t.name.toLowerCase()) ?? 0

  const typeStats = {
    all: unitTypeList.length,
    system: unitTypeList.filter(t => t.facilityId == null).length,
    own: unitTypeList.filter(t => t.facilityId != null).length,
    active: unitTypeList.filter(t => t.isActive).length,
    inactive: unitTypeList.filter(t => !t.isActive).length
  }

  const visibleTypes = useMemo(() => {
    const filtered = unitTypeList.filter(t => {
      if (typeFilter === 'system') return t.facilityId == null
      if (typeFilter === 'own') return t.facilityId != null
      if (typeFilter === 'active') return t.isActive
      if (typeFilter === 'inactive') return !t.isActive
      return true
    })
    return [...filtered].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
  }, [unitTypeList, typeFilter])

  // Danh sách loại kho cho form "Tạo / Sửa kho": chỉ loại đang Hoạt động
  const unitTypesForUnitForm = useMemo(() => {
    if (!unitTypeList.length) return db.unitTypes || []
    const active = unitTypeList.filter(t => t.isActive)
    // Kho đang sửa mà thuộc loại đã ngừng hoạt động: vẫn giữ loại đó để form hiển thị đúng
    const currentId = editingUnit?.unitTypeId
    const extra = currentId != null && !active.some(t => String(t.id) === String(currentId))
      ? unitTypeList.filter(t => String(t.id) === String(currentId))
      : []
    return [...active, ...extra].map(t => ({
      unitTypeId: t.id,
      name: t.isActive ? t.name : `${t.name} (không hoạt động)`,
      description: t.description
    }))
  }, [unitTypeList, db.unitTypes, editingUnit])

  const openCreateType = () => { setEditingType(null); setShowTypeModal(true) }
  const openEditType = (t) => { setEditingType(t); setShowTypeModal(true) }

  const handleSaveType = async (payload) => {
    const isEdit = Boolean(editingType)
    const body = { ...payload, facilityId: facilityDbId }
    const saved = isEdit
      ? await apiPut(`/api/unit-types/${editingType.id}`, body)
      : await apiPost('/api/unit-types', body)
    setShowTypeModal(false)
    setEditingType(null)
    // Tải lại loại kho + dữ liệu cơ sở để form "Tạo kho mới" cập nhật ngay
    await Promise.all([loadUnitTypes(), loadState({ silent: true })])
    const savedId = saved ? normalizeUnitType(saved).id : null
    showToast(isEdit
      ? `Đã cập nhật loại kho #${editingType.id} "${payload.typeName}".`
      : `Đã tạo loại kho #${savedId ?? '?'} "${payload.typeName}".`)
  }

  const handleDeleteType = async (t) => {
    if (t.facilityId == null) {
      await dialog.alert({
        tone: 'warning',
        title: `Không thể xóa loại hệ thống #${t.id}`,
        message: 'Loại kho hệ thống dùng chung cho mọi cơ sở và do Business Operations quản lý.'
      })
      return
    }
    const count = countUnitsOfType(t)
    if (count > 0) {
      await dialog.alert({
        tone: 'warning',
        title: `Không thể xóa "${t.name}"`,
        message: `Còn ${count} kho tại ${facilityName} đang dùng loại này. Hãy đổi loại hoặc chuyển các kho đó sang "Ngừng sử dụng" trước.`
      })
      return
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Xóa loại kho #${t.id} "${t.name}"?`,
      message: 'Loại kho sẽ không còn xuất hiện khi tạo kho mới. Đơn và hợp đồng cũ vẫn giữ nguyên tên loại.',
      confirmLabel: 'Xóa loại kho'
    })
    if (!ok) return
    try {
      await apiDelete(`/api/unit-types/${t.id}`)
      await Promise.all([loadUnitTypes(), loadState({ silent: true })])
      showToast(`Đã xóa loại kho #${t.id} "${t.name}".`)
    } catch (err) {
      await dialog.alert({ tone: 'danger', title: 'Không xóa được loại kho', message: err.message })
    }
  }

  if (loading) return <div className="customer-main" style={{ padding: 32 }}>Đang tải dữ liệu cơ sở từ backend...</div>
  if (error && !db.facilities.length) {
    return <main className="customer-main" style={{ padding: 32 }}>
      <div className="auth-message error" role="alert">{error}</div>
      <button className="dashboard-primary-btn" type="button" onClick={() => loadState()}>Thử lại</button>
    </main>
  }
  const managerName = manager?.name || manager?.fullName || 'Facility Manager'

  const renderReservationCodes = unit => {
    const lock = unitLocks.get(unit.id)
    if (!lock?.reservations.length) return <span className="fm-muted">—</span>
    return (
      <div className="fm-res-codes">
        {lock.reservations.map(r => (
          <span key={r.id} className="fm-res-code" title={`${r.customerName} · ${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}`}>
            <strong>{formatReservationCode(r.id)}</strong>
            <small>{RESERVATION_STATUS_LABELS[r.status] || r.status}{r.status === 'PENDING_PAYMENT' && r.depositExpiresAt ? ` · hết hạn ${fmtDateTime(r.depositExpiresAt)}` : ''}</small>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="customer-layout fm-root">
      {/* SIDEBAR */}
      <aside className="customer-sidebar">
        <div className="customer-brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>StoreSpace</strong>
            <small>Manager Portal</small>
          </div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">
            {managerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{managerName}</strong>
            <small>Facility Manager</small>
          </div>
        </div>

        <nav className="customer-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <span>⌂</span> Tổng quan & Báo cáo
          </button>
          <button className={activeTab === 'approvals' ? 'active' : ''} onClick={() => setActiveTab('approvals')}>
            <span>◷</span> Xét duyệt đặt chỗ {(stats.pendingApprovals + stats.pendingPayments) > 0 && <span className="fm-count-badge">{stats.pendingApprovals + stats.pendingPayments}</span>}
          </button>
          <button className={activeTab === 'units' ? 'active' : ''} onClick={() => setActiveTab('units')}>
            <span>▣</span> Quản lý kho cơ sở {freshUnitDetails.length > 0 && <span className="fm-count-badge fm-count-new">Mới {freshUnitDetails.length}</span>}
          </button>
          <button className={activeTab === 'unitTypes' ? 'active' : ''} onClick={() => setActiveTab('unitTypes')}>
            <span>▦</span> Thiết lập loại kho
          </button>
          <button className={activeTab === 'contracts' ? 'active' : ''} onClick={() => setActiveTab('contracts')}>
            <span>▤</span> Hợp đồng & Khách hàng
          </button>
          <button className={activeTab === 'staff' ? 'active' : ''} onClick={() => setActiveTab('staff')}>
            <span>👥</span> Nhân sự tại cơ sở
          </button>
        </nav>

        <div className="customer-sidebar-bottom">
          <button onClick={handleLogout}>
            <span>↪</span> Đăng xuất
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="customer-main">
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {toast && <div className="fm-toast" role="status">✓ {toast}</div>}
        {/* TOPBAR */}
        <div className="customer-topbar">
          <div>
            <span className="customer-eyebrow">FACILITY MANAGER · {facilityName.toUpperCase()}</span>
            <h1>
              {activeTab === 'overview' && 'Tổng quan & Báo cáo cơ sở'}
              {activeTab === 'approvals' && 'Xét duyệt & Phân bổ kho'}
              {activeTab === 'units' && 'Danh mục kho tại cơ sở'}
              {activeTab === 'unitTypes' && 'Thiết lập loại kho'}
              {activeTab === 'contracts' && 'Giám sát hợp đồng thuê'}
              {activeTab === 'staff' && 'Phân công nhân viên cơ sở'}
            </h1>
            <p>Quản lý vận hành, xét duyệt đặt kho và giám sát doanh thu cơ sở {facilityName}.</p>
          </div>
          <div className="fm-facility-chip">
            📍 <strong>{facilityName}</strong>
          </div>
        </div>

        {/* TAB 1: OVERVIEW & REPORTS */}
        {activeTab === 'overview' && (
          <div className="overview-page">
            <section className="customer-stats">
              <div className="customer-stat-card">
                <span className="stat-icon blue">▣</span>
                <small>Tổng số kho</small>
                <strong>{stats.totalUnits}</strong>
                <span className="stat-note">Tại {facilityName}</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">📈</span>
                <small>Tỷ lệ lấp đầy</small>
                <strong>{stats.occupancyRate}%</strong>
                <span className="stat-note">{stats.rentedUnits} kho đang thuê</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon yellow">⏳</span>
                <small>Chờ duyệt & Phân kho</small>
                <strong>{stats.pendingApprovals}</strong>
                <span className="stat-note warning">{stats.pendingPayments} đơn đang chờ khách trả cọc</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon blue">₫</span>
                <small>Doanh thu ghi nhận</small>
                <strong>{fmtMoney(stats.totalRevenue)}</strong>
                <span className="stat-note">Hợp đồng đã bàn giao</span>
              </div>
            </section>

            {/* BÁO CÁO NHANH TRẠNG THÁI KHO */}
            <section className="overview-panel">
              <div className="overview-panel-heading">
                <div>
                  <span className="customer-eyebrow">FACILITY OCCUPANCY</span>
                  <h2>Báo cáo trạng thái kho cơ sở</h2>
                </div>
              </div>

              <div className="fm-progress-bar-container">
                <div className="fm-progress-bar">
                  <div className="fm-bar-rented" style={{ width: `${(stats.rentedUnits / (stats.totalUnits || 1)) * 100}%` }} title="Đang thuê" />
                  <div className="fm-bar-reserved" style={{ width: `${(stats.reservedUnits / (stats.totalUnits || 1)) * 100}%` }} title="Đã giữ chỗ" />
                  <div className="fm-bar-available" style={{ width: `${(stats.availableUnits / (stats.totalUnits || 1)) * 100}%` }} title="Còn trống" />
                </div>
                <div className="fm-progress-legend">
                  <span><i className="dot rented" /> Đang thuê ({stats.rentedUnits})</span>
                  <span><i className="dot reserved" /> Đã giữ chỗ ({stats.reservedUnits})</span>
                  <span><i className="dot available" /> Còn trống ({stats.availableUnits})</span>
                </div>
              </div>
            </section>

            {/* CẦN XỬ LÝ NGAY */}
            {(pendingList.length > 0 || awaitingPaymentList.length > 0) && (
              <section className="overview-panel">
                <div className="overview-panel-heading">
                  <div>
                    <span className="customer-eyebrow">ACTION REQUIRED</span>
                    <h2>Đơn đặt kho mới ({pendingList.length + awaitingPaymentList.length})</h2>
                  </div>
                  <button className="overview-text-button" onClick={() => setActiveTab('approvals')}>Xem tất cả →</button>
                </div>

                <div className="fm-pending-mini-list">
                  {[...pendingList, ...awaitingPaymentList].map(r => (
                    <div key={r.id} className="fm-pending-mini-item">
                      <div>
                        <strong>{formatReservationCode(r.id)} · {r.customerName}</strong>
                        <small>Kho {r.assignedUnitId || '—'} · {r.unitType} · Thuê {r.months} tháng</small>
                      </div>
                      <div className="fm-item-right">
                        <Badge map={RES_STATUS_MAP} value={r.status} />
                        {r.status === 'PENDING_APPROVAL'
                          ? <button className="dashboard-primary-btn" onClick={() => setActiveTab('approvals')}>Duyệt ngay</button>
                          : <span className="fm-amount">Hết hạn giữ chỗ {fmtDateTime(r.depositExpiresAt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: XÉT DUYỆT & PHÂN KHO */}
        {activeTab === 'approvals' && (
          <>
            {/* ĐƠN GIỎ HÀNG GỒM NHIỀU KHO */}
            {groupedCartOrders.length > 0 && (
              <div className="fm-section-card">
                <div className="fm-card-header">
                  <h2>Đơn đặt nhiều kho ({groupedCartOrders.length})</h2>
                  <p>
                    Các kho thuộc cùng một lần checkout của khách hàng.
                    Kiểm tra từng kho, chọn kho phân bổ rồi duyệt đơn.
                  </p>
                </div>

                <div className="fm-approval-grid">
                  {groupedCartOrders.map(order => {
                    const isAssigning = assigningCartOrderCode === order.code

                    return (
                      <div className="fm-approval-card" key={order.code}>
                        <div className="fm-approval-head">
                          <div>
                            <span className="customer-eyebrow">
                              MÃ ĐƠN GIỎ HÀNG
                            </span>
                            <h3>{order.code}</h3>
                            <p>{order.facilityName || facilityName}</p>
                          </div>

                          <span className="fm-badge fm-info">
                            {order.reservations.length} kho chờ duyệt
                          </span>
                        </div>

                        <div className="rental-info-grid">
                          <div>
                            <small>Ngày bắt đầu</small>
                            <strong>{fmtDate(order.startDate)}</strong>
                          </div>

                          <div>
                            <small>Thời hạn thuê</small>
                            <strong>{order.months} tháng</strong>
                          </div>

                          <div>
                            <small>Số kho</small>
                            <strong>{order.reservations.length}</strong>
                          </div>
                        </div>

                        <div className="fm-table-wrap">
                          <table className="fm-table">
                            <thead>
                              <tr>
                                <th>Mã reservation</th>
                                <th>Loại kho</th>
                                <th>Kho khách chọn</th>
                                <th>Tiền cọc</th>
                                <th>Chọn kho phân bổ</th>
                              </tr>
                            </thead>

                            <tbody>
                              {order.reservations.map(res => {
                                const currentSelection =
                                  cartOrderUnitSelections[String(res.id)] ??
                                  res.assignedUnitId ??
                                  res.unitId ??
                                  ''

                                return (
                                  <tr key={res.id}>
                                    <td>
                                      <strong>
                                        {formatReservationCode(res.id)}
                                      </strong>
                                    </td>

                                    <td>{res.unitType || '—'}</td>

                                    <td>{res.unitId || 'Tự động'}</td>

                                    <td>{fmtMoney(res.deposit)}</td>

                                    <td>
                                      <select
                                        className="fm-input"
                                        value={currentSelection}
                                        disabled={isAssigning}
                                        onChange={e => {
                                          const value = e.target.value

                                          setCartOrderUnitSelections(current => ({
                                            ...current,
                                            [String(res.id)]: value
                                          }))
                                        }}
                                      >
                                        <option value="">
                                          -- Chọn kho --
                                        </option>

                                        {facilityUnits
                                          .filter(unit =>
                                            unit.status === 'AVAILABLE' ||
                                            unit.id === currentSelection
                                          )
                                          .map(unit => (
                                            <option
                                              key={unit.id}
                                              value={unit.id}
                                            >
                                              {unit.id} - {unit.type}
                                              {' '}({unit.size})
                                              {' '} - {fmtMoney(unit.pricePerMonth)}/tháng
                                            </option>
                                          ))}
                                      </select>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="fm-actions-row">
                          <button
                            type="button"
                            className="dashboard-primary-btn"
                            disabled={isAssigning}
                            onClick={() => handleApproveCartOrder(order)}
                          >
                            {isAssigning
                              ? 'Đang xử lý đơn...'
                              : `✓ Duyệt và phân bổ ${order.reservations.length} kho`}
                          </button>
                        </div>

                        <p className="fm-muted">
                          Mỗi dòng tương ứng với một reservation riêng.
                          Kiểm tra trạng thái sau khi duyệt để bảo đảm tất cả
                          các kho đã được phân bổ.
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="fm-section-card">
              <div className="fm-card-header">
                <h2>Đơn đặt kho chờ duyệt & Phân kho cụ thể</h2>
                <p>Khách hàng đã thanh toán tiền cọc. Hãy đối chiếu và chọn kho cụ thể còn trống để phân bổ.</p>
              </div>

              {individualPendingList.length === 0 ? (
                <div className="empty-state">Hiện không có đơn đặt kho nào đang chờ xét duyệt.</div>
              ) : (
                <div className="fm-approval-grid">
                  {individualPendingList.map(res => {
                    const isSelected = selectedResId === res.id

                    return (
                      <div key={res.id} className="fm-approval-card">
                        <div className="fm-approval-head">
                          <div>
                            <span className="customer-eyebrow">MÃ ĐƠN: {formatReservationCode(res.id)}</span>
                            <h3>{res.customerName}</h3>
                            <p>✉ {res.customerEmail}</p>
                          </div>
                          <Badge map={RES_STATUS_MAP} value={res.status} />
                        </div>

                        <div className="rental-info-grid">
                          <div>
                            <small>Loại kho yêu cầu</small>
                            <strong>{res.unitType}</strong>
                          </div>
                          <div>
                            <small>Kho khách chọn</small>
                            <strong>{res.unitNumbers?.length > 1 ? res.unitNumbers.join(', ') : (res.unitId || 'Tự động')}</strong>
                          </div>
                          <div>
                            <small>Ngày bắt đầu</small>
                            <strong>{fmtDate(res.startDate)}</strong>
                          </div>
                          <div>
                            <small>Thời gian thuê</small>
                            <strong>{res.months} tháng</strong>
                          </div>
                          <div>
                            <small>Tiền cọc</small>
                            <strong className="available-text">{fmtMoney(res.deposit)}</strong>
                          </div>
                          <div>
                            <small>Tổng giá trị</small>
                            <strong>{fmtMoney(res.rentalFee)}</strong>
                          </div>
                        </div>

                        <div className="fm-assign-box">
                          <label><strong>Chọn kho cụ thể tại {facilityName} để gán:</strong></label>
                          <select
                            className="fm-input"
                            value={isSelected ? selectedUnitForAssign : (res.assignedUnitId || res.unitId || '')}
                            onChange={(e) => {
                              setSelectedResId(res.id)
                              setSelectedUnitForAssign(e.target.value)
                            }}
                          >
                            <option value="">-- Chọn kho phù hợp --</option>
                            {facilityUnits.filter(u => u.status === 'AVAILABLE' || u.id === (res.assignedUnitId || res.unitId)).map(u => (
                              <option key={u.id} value={u.id}>
                                {u.id} - {u.type} ({u.size}) - {fmtMoney(u.pricePerMonth)}/tháng
                              </option>
                            ))}
                          </select>

                          <div className="fm-actions-row">
                            <button
                              className="dashboard-primary-btn"
                              onClick={() => handleApproveAndAssign(res.id, isSelected ? selectedUnitForAssign : (res.assignedUnitId || res.unitId))}
                            >
                              ✓ Duyệt đơn & Phân gán kho
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Đơn vừa đặt, khách chưa trả cọc: trước đây không hiện ở đâu nên Manager không biết mã đơn */}
            <div className="fm-section-card">
              <div className="fm-card-header">
                <h2>Đơn mới đặt · Đang chờ khách trả cọc ({awaitingPaymentList.length})</h2>
                <p>Kho đang được giữ tạm cho khách trong thời gian chờ cọc. Đơn hết hạn sẽ tự trả kho.</p>
              </div>
              {awaitingPaymentList.length === 0 ? (
                <div className="empty-state">Không có đơn nào đang chờ trả cọc.</div>
              ) : (
                <div className="fm-table-wrap">
                  <table className="fm-table">
                    <thead>
                      <tr>
                        <th>Mã đơn</th>
                        <th>Khách hàng</th>
                        <th>Kho giữ chỗ</th>
                        <th>Kỳ thuê</th>
                        <th>Tiền cọc</th>
                        <th>Hết hạn giữ chỗ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {awaitingPaymentList.map(r => (
                        <tr key={r.id}>
                          <td><strong>{formatReservationCode(r.id)}</strong></td>
                          <td>{r.customerName}<br /><small className="fm-muted">{r.customerEmail}</small></td>
                          <td><span className="fm-tag-blue">{r.assignedUnitId || '—'}</span></td>
                          <td>{fmtDate(r.startDate)} → {fmtDate(r.endDate)}</td>
                          <td>{fmtMoney(r.deposit)}</td>
                          <td>{fmtDateTime(r.depositExpiresAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 3: QUẢN LÝ KHO CƠ SỞ */}
        {activeTab === 'units' && (
          <>
            {freshUnitDetails.length > 0 && (
              <section className="fm-fresh-panel">
                <div className="fm-fresh-head">
                  <div>
                    <span className="customer-eyebrow">KHO VỪA TẠO</span>
                    <h2>{freshUnitDetails.length} kho mới trong phiên làm việc này</h2>
                  </div>
                  <button type="button" className="overview-text-button" onClick={() => setUnitFilter('fresh')}>Chỉ xem kho mới →</button>
                </div>
                <div className="fm-fresh-grid">
                  {freshUnitDetails.map(({ unitNumber, createdAt, unit }) => (
                    <article key={unitNumber} className={`fm-fresh-card${highlightUnitId === unitNumber ? ' fm-flash' : ''}`}>
                      <div className="fm-fresh-card-top">
                        <span className="fm-new-tag">Mới</span>
                        <button type="button" className="fm-fresh-dismiss" onClick={() => dismissFreshUnit(unitNumber)} aria-label={`Bỏ ghim kho ${unitNumber}`}>×</button>
                      </div>
                      <strong className="fm-fresh-code">{unitNumber}</strong>
                      <p>{unit.type}</p>
                      <dl>
                        <div><dt>Size</dt><dd>{unit.size}</dd></div>
                        <div><dt>Giá/tháng</dt><dd>{fmtMoney(unit.pricePerMonth)}</dd></div>
                        <div><dt>Trạng thái</dt><dd><Badge map={UNIT_STATUS_MAP} value={unit.status} /></dd></div>
                        <div><dt>Tạo lúc</dt><dd>{fmtDateTime(createdAt)}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <div className="fm-section-card">
              <div className="fm-card-header-flex">
                <div>
                  <h2>Danh mục kho tại {facilityName}</h2>
                  <p>Thêm mới, điều chỉnh và cập nhật trạng thái kho. Kho đã có đơn sẽ bị khóa chỉnh sửa.</p>
                </div>
                <button className="dashboard-primary-btn" onClick={() => { setEditingUnit(null); setShowUnitModal(true) }}>
                  + Tạo kho mới
                </button>
              </div>

              <div className="fm-filter-chips" role="tablist" aria-label="Lọc kho">
                {[
                  ['all', `Tất cả (${facilityUnits.length})`],
                  ['fresh', `Kho mới tạo (${freshUnitDetails.length})`],
                  ['booked', `Đã có đơn (${facilityUnits.filter(u => unitLocks.get(u.id)?.reservations.length).length})`],
                  ['available', `Sửa được (${facilityUnits.filter(u => u.status === 'AVAILABLE' && !unitLocks.get(u.id)?.locked).length})`]
                ].map(([value, label]) => (
                  <button key={value} type="button" role="tab" aria-selected={unitFilter === value} className={unitFilter === value ? 'active' : ''} onClick={() => setUnitFilter(value)}>{label}</button>
                ))}
              </div>

              <div className="fm-table-wrap">
                <table className="fm-table">
                  <thead>
                    <tr>
                      <th>Mã kho</th>
                      <th>Loại kho</th>
                      <th>Size</th>
                      <th>Giá thuê / tháng</th>
                      <th>Trạng thái</th>
                      <th>Mã đơn</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUnits.length === 0 && (
                      <tr><td colSpan="7" className="text-center">Không có kho phù hợp bộ lọc.</td></tr>
                    )}
                    {visibleUnits.map(unit => {
                      const lock = unitLocks.get(unit.id)
                      const isFresh = freshIds.has(unit.id)
                      return (
                        <tr
                          key={unit.id}
                          id={`fm-unit-row-${unit.id}`}
                          className={['fm-row-click', isFresh ? 'fm-row-fresh' : '', highlightUnitId === unit.id ? 'fm-flash' : '', lock?.locked ? 'fm-row-locked' : ''].join(' ').trim()}
                          tabIndex={0}
                          onClick={() => setViewingUnitId(unit.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') setViewingUnitId(unit.id) }}
                        >
                          <td><strong>{unit.id}</strong>{isFresh && <span className="fm-new-tag">Mới</span>}</td>
                          <td><UnitTypeChip type={unit.type} compact /><small className="fm-muted" style={{ display: 'block', marginTop: 4 }}>{unit.type}</small></td>
                          <td>{unit.size}</td>
                          <td><strong>{fmtMoney(unit.pricePerMonth)}</strong></td>
                          <td><Badge map={UNIT_STATUS_MAP} value={unit.status} /></td>
                          <td>{renderReservationCodes(unit)}</td>
                          <td>
                            <button
                              type="button"
                              className="dashboard-secondary-btn sm"
                              onClick={(e) => { e.stopPropagation(); setViewingUnitId(unit.id) }}
                            >
                              {lock?.locked || unit.status === 'RENTED' ? '🔒 Xem chi tiết' : 'Xem chi tiết'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB 4: THIẾT LẬP LOẠI KHO */}
        {activeTab === 'unitTypes' && (
          <div className="fm-section-card">
            <div className="fm-card-header-flex">
              <div>
                <h2>Loại kho tại {facilityName}</h2>
                <p>Tất cả loại kho có thể dùng tại cơ sở, gồm loại hệ thống và loại riêng của cơ sở.</p>
              </div>
              <button className="dashboard-primary-btn" onClick={openCreateType}>+ Tạo loại kho</button>
            </div>

            <div className="fm-type-note">
              <span aria-hidden="true">ℹ</span>
              <p>
                <strong>Loại hệ thống</strong> (🔒) dùng chung cho mọi cơ sở, đang được kho, bảng giá và đơn thuê sử dụng,
                nên chỉ Business Operations được sửa hoặc xóa. <strong>Loại của cơ sở</strong> do bạn tạo và quản lý tại {facilityName}.
                Chỉ loại <strong>Hoạt động</strong> mới chọn được khi tạo hoặc sửa kho.
              </p>
            </div>

            <div className="fm-filter-chips" role="tablist" aria-label="Lọc loại kho">
              {[
                ['all', `Tất cả (${typeStats.all})`],
                ['system', `Hệ thống (${typeStats.system})`],
                ['own', `Của cơ sở (${typeStats.own})`],
                ['active', `Hoạt động (${typeStats.active})`],
                ['inactive', `Không hoạt động (${typeStats.inactive})`]
              ].map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={typeFilter === value}
                  className={typeFilter === value ? 'active' : ''} onClick={() => setTypeFilter(value)}>
                  {label}
                </button>
              ))}
            </div>

            {unitTypesError && (
              <div className="auth-message error" role="alert">
                Không tải được loại kho: {unitTypesError}{' '}
                <button type="button" className="dashboard-secondary-btn sm" onClick={loadUnitTypes}>Thử lại</button>
              </div>
            )}

            {unitTypesLoading && !unitTypeList.length ? (
              <div className="empty-state">Đang tải danh sách loại kho...</div>
            ) : (
              <div className="fm-table-wrap">
                <table className="fm-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Tên loại kho</th>
                      <th>Mô tả</th>
                      <th>Phạm vi</th>
                      <th>Trạng thái</th>
                      <th>Số kho đang dùng</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTypes.length === 0 && (
                      <tr><td colSpan="7" className="text-center">
                        {typeFilter === 'own'
                          ? 'Cơ sở chưa có loại kho riêng. Bấm "+ Tạo loại kho" để thêm.'
                          : 'Không có loại kho phù hợp bộ lọc.'}
                      </td></tr>
                    )}
                    {visibleTypes.map(t => {
                      const isSystem = t.facilityId == null
                      const count = countUnitsOfType(t)
                      return (
                        <tr key={t.id} className={isSystem ? 'fm-row-locked' : ''}>
                          <td><span className="fm-type-id">#{t.id}</span></td>
                          <td><strong>{t.name}</strong></td>
                          <td className="fm-type-desc">{t.description || <span className="fm-muted">—</span>}</td>
                          <td>
                            {isSystem
                              ? <span className="fm-badge fm-info">🔒 Hệ thống</span>
                              : <span className="fm-badge fm-ok">Cơ sở</span>}
                          </td>
                          <td>
                            {t.isActive
                              ? <span className="fm-badge fm-ok">Hoạt động</span>
                              : <span className="fm-badge fm-warn">Không hoạt động</span>}
                          </td>
                          <td>{count > 0 ? <strong>{count} kho</strong> : <span className="fm-muted">Chưa dùng</span>}</td>
                          <td>
                            {isSystem ? (
                              <span className="fm-muted" title="Loại hệ thống do Business Operations quản lý">🔒 Chỉ xem</span>
                            ) : (
                              <div className="fm-type-actions">
                                <button type="button" className="dashboard-secondary-btn sm" onClick={() => openEditType(t)}>Sửa</button>
                                <button
                                  type="button"
                                  className="dashboard-secondary-btn sm fm-btn-danger"
                                  title={count > 0 ? `Còn ${count} kho đang dùng loại này` : 'Xóa loại kho'}
                                  onClick={() => handleDeleteType(t)}
                                >
                                  Xóa
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              <BusinessCatalog
                operationState={db}
                dialog={dialog}
                onChanged={() => Promise.all([loadUnitTypes(), loadState({ silent: true })])}
              />
            </div>
          </div>
        )}

        {/* TAB 5: HỢP ĐỒNG & KHÁCH HÀNG */}
        {activeTab === 'contracts' && (
          <div className="fm-section-card">
            <div className="fm-card-header">
              <h2>Hợp đồng thuê đang hoạt động tại {facilityName}</h2>
              <p>Giám sát thời hạn hợp đồng, mã truy cập và nghĩa vụ thanh toán của khách hàng.</p>
            </div>

            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Mã HĐ</th>
                    <th>Mã đơn</th>
                    <th>Khách hàng</th>
                    <th>Kho</th>
                    <th>Ngày bắt đầu</th>
                    <th>Ngày kết thúc</th>
                    <th>Thông tin ra vào</th>
                    <th>Thanh toán</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {facilityContracts.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="text-center">Chưa có hợp đồng nào được khởi tạo tại cơ sở này.</td>
                    </tr>
                  ) : (
                    facilityContracts.map(c => {
                      // Hợp đồng nối với đặt chỗ gốc qua mã đặt chỗ (hoặc mã hợp đồng ghi trên đặt chỗ)
                      const r = db.reservations.find(x =>
                        String(x.contractId ?? '') === String(c.id) ||
                        (c.reservationId != null && String(x.id) === String(c.reservationId)))
                      const expired = String(c.endDate).slice(0, 10) < todayStr()
                      return (
                        <tr key={c.id}>
                          <td><strong>{c.id}</strong></td>
                          <td>{formatReservationCode(c.reservationId ?? r?.id)}</td>
                          <td>{c.customerName}</td>
                          <td><span className="fm-tag-blue">{c.unitNumbers?.length > 1 ? c.unitNumbers.join(', ') : c.unitId}</span></td>
                          <td>{fmtDate(c.startDate)}</td>
                          <td>{fmtDate(c.endDate)}</td>
                          <td><code>{c.accessType}: {c.accessValue}</code></td>
                          <td>{r ? <Badge map={PAY_STATUS_MAP} value={r.paymentStatus} /> : '—'}</td>
                          <td>
                            {expired
                              ? <span className="fm-badge fm-warn">Đã hết hạn</span>
                              : <span className="fm-badge fm-ok">Đang hiệu lực</span>}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: PHÂN CÔNG NHÂN VIÊN */}
        {activeTab === 'staff' && (
          <div className="fm-section-card">
            <div className="fm-card-header">
              <h2>Đội ngũ Facility Staff tại {facilityName}</h2>
              <p>Danh sách nhân viên vận hành phụ trách kiểm tra kho và hỗ trợ check-in bàn giao cho khách.</p>
            </div>

            <div className="fm-staff-grid">
              {staffList.map(st => (
                <div key={st.id} className="fm-staff-card">
                  <div className="fm-staff-avatar">{st.fullName.charAt(0)}</div>
                  <div className="fm-staff-info">
                    <h3>{st.fullName}</h3>
                    <p>✉ {st.email}</p>
                    <p>📞 —</p>
                    <div className="fm-shift-tag">Trạng thái: {st.status}</div>
                  </div>
                  <div className="fm-staff-status">
                    <span className="fm-badge fm-ok">Đang làm việc</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL TẠO/SỬA LOẠI KHO */}
      {showTypeModal && (
        <UnitTypeFormModal
          key={editingType?.id || 'new-type'}
          editingType={editingType}
          existingTypes={unitTypeList}
          nextId={nextUnitTypeId}
          unitCount={editingType ? countUnitsOfType(editingType) : 0}
          onClose={() => { setShowTypeModal(false); setEditingType(null) }}
          onSave={handleSaveType}
        />
      )}

      {/* POPUP CHI TIẾT KHO */}
      {viewingUnit && (
        <UnitDetailModal
          unit={viewingUnit}
          facility={managedFacility}
          lock={unitLocks.get(viewingUnit.id)}
          contract={viewingContract}
          onClose={() => setViewingUnitId(null)}
          onEdit={openEditFromDetail}
        />
      )}

      {/* MODAL TẠO/SỬA KHO */}
      {showUnitModal && (
        <UnitFormModal
          key={editingUnit?.id || 'new-unit'}
          facilityDbId={managedFacility?.facilityId}
          nextUnitCode={nextUnitCode}
          editingUnit={editingUnit}
          onClose={() => { setShowUnitModal(false); setEditingUnit(null) }}
          onSave={handleSaveUnit}
          unitTypes={unitTypesForUnitForm}
          unitSizes={db.unitSizes}
          rentalRates={db.rentalRates || []}
          facilityUnits={facilityUnits}
          dialog={dialog}
        />
      )}
    </div>
  )
}
