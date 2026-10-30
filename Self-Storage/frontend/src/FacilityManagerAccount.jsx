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
import ContractDocument from './ContractDocument'
import { UnitTypeChip } from './unitTypes'
import './unitTypes.css'

/* Formatters */
const fmtMoney = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ'
const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')
const fmtDateTime = (s) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}
const pad = (n) => String(n).padStart(2, '0')

/* ===== SORT BẢNG KHO ===== */
// Thứ tự trạng thái theo mức cần chú ý (dùng khi sort cột Trạng thái)
const UNIT_STATUS_ORDER = {
  RESERVED: 1, BOOKING: 1,
  PENDING_INSPECTION: 2, NEEDS_INSPECTION: 2,
  MAINTENANCE: 3,
  AVAILABLE: 4,
  RENTED: 5, IN_USE: 5,
  INACTIVE: 6
}

// So sánh mã có số theo kiểu tự nhiên: Q1-U2 < Q1-U10
const compareNatural = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' })

// Size so theo diện tích thật, không theo chữ
const unitSizeValue = (u) => Number(u.areaM2 ?? 0) || Number(u.volumeM3 ?? u.sizeM2 ?? 0)

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const RES_STATUS_MAP = {
  PENDING_PAYMENT: { label: 'Chờ trả cọc', tone: 'warn' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận cọc', tone: 'warn' },
  PENDING_APPROVAL: { label: 'Đã cọc · Chờ bàn giao', tone: 'info' },
  CONFIRMED: { label: 'Đã cọc · Chờ bàn giao', tone: 'info' },
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
function UnitDetailModal({ unit, facility, lock, contract, onClose, onEdit, onDelete }) {
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
            className="dashboard-secondary-btn fm-btn-delete-unit"
            disabled={locked}
            title={locked ? lockMessage : 'Xóa kho khỏi cơ sở'}
            onClick={() => onDelete(unit)}
          >
            🗑 Xóa kho
          </button>
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
   THIẾT LẬP ĐẶC TÍNH KHO (Facility Manager)
   Loại kho + Kích thước kho tại cơ sở, gộp trong 1 màn hình.
   Dùng API sẵn có của backend:
     GET/POST/PUT/DELETE /api/unit-types   (?facilityId=...)
     GET/POST/PUT/DELETE /api/unit-sizes   (?facilityId=...)
     DELETE /api/operations/facilities/{fid}/rates/{typeId}/{sizeId}
   ========================================================= */

// Nhóm size theo DB (bảng SizeCategory). Dùng khi backend không gửi kèm.
const FP_SIZE_CATEGORIES = [
  { id: 1, name: 'Small', prefix: 'S', heightM: 2.5, minVolume: 2.25, maxVolume: 24 },
  { id: 2, name: 'Medium', prefix: 'M', heightM: 2.5, minVolume: 24.01, maxVolume: 48 },
  { id: 3, name: 'Large', prefix: 'L', heightM: 2.5, minVolume: 48.01, maxVolume: 120 },
  { id: 4, name: 'Vehicle', prefix: 'V', heightM: 3.5, minVolume: 30, maxVolume: 200 }
]

const fpNum = (v) => (v == null || v === '' ? 0 : Number(v))
const fpFmt = (v, d = 2) => fpNum(v).toLocaleString('vi-VN', { maximumFractionDigits: d })
const fpClean = (v) => String(v || '').trim().replace(/\s+/g, ' ')
const fpArray = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [])

/* ---------- Chuẩn hóa dữ liệu backend ---------- */
function normalizeType(raw = {}) {
  return {
    id: fpNum(raw.unitTypeID ?? raw.unitTypeId ?? raw.id),
    name: raw.typeName ?? raw.name ?? '',
    description: raw.description ?? '',
    isActive: Boolean(raw.isActive ?? raw.isActiveAtFacility ?? true), // trạng thái tại cơ sở
    reservationCount: fpNum(raw.reservationCount)
  }
}

function normalizeSize(raw = {}) {
  const code = raw.sizeCode ?? String(raw.dimensions || '').split(':')[0].trim()
  const name = raw.displayName ?? (String(raw.dimensions || '').split(':')[1] || '').trim()
  const w = fpNum(raw.widthM)
  const l = fpNum(raw.lengthM)
  const h = fpNum(raw.heightM)
  return {
    id: fpNum(raw.unitSizeID ?? raw.unitSizeId ?? raw.id),
    sizeCode: code,
    displayName: name || code,
    label: raw.dimensions ?? `${code}: ${name}`,
    widthM: w,
    lengthM: l,
    heightM: h,
    areaM2: raw.areaM2 != null ? fpNum(raw.areaM2) : w * l,
    volumeM3: raw.volumeM3 != null ? fpNum(raw.volumeM3) : raw.volume != null ? fpNum(raw.volume) : w * l * h,
    isActive: Boolean(raw.isActive ?? raw.isActiveAtFacility ?? true),
    reservationCount: fpNum(raw.reservationCount)
  }
}

/* Tải loại kho + kích thước kèm trạng thái tại cơ sở (parent gọi hàm này) */
async function loadFacilityCatalog(facilityId) {
  const [types, sizes] = await Promise.all([
    apiGet(`/api/unit-types?facilityId=${facilityId}`),
    apiGet(`/api/unit-sizes?facilityId=${facilityId}`)
  ])
  return {
    types: fpArray(types).map(normalizeType).sort((a, b) => a.id - b.id),
    sizes: fpArray(sizes).map(normalizeSize).sort((a, b) => a.sizeCode.localeCompare(b.sizeCode, 'en', { numeric: true }))
  }
}

const fpCategoryOf = (code, categories) =>
  categories.find(c => String(code || '').toUpperCase().startsWith(c.prefix)) || null

/* =========================================================
   MODAL LOẠI KHO
   ========================================================= */
function TypeModal({ editing, types, activeUnits, facilityName, onClose, onSave }) {
  const isNew = !editing
  const nextId = types.reduce((m, t) => Math.max(m, t.id), 0) + 1
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [isActive, setIsActive] = useState(editing ? editing.isActive : true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const lockPause = !isNew && editing.isActive && activeUnits > 0

  const submit = async (e) => {
    e.preventDefault()
    const n = fpClean(name)
    const d = description.trim()
    if (!n) return setError('Vui lòng nhập tên loại kho.')
    if (n.length > 100) return setError('Tên loại kho tối đa 100 ký tự.')
    if (d.length > 255) return setError('Mô tả tối đa 255 ký tự.')
    const dup = types.find(t => t.id !== editing?.id && t.name.trim().toLowerCase() === n.toLowerCase())
    if (dup) return setError(`Tên "${n}" đã tồn tại (loại #${dup.id}).`)
    if (!isActive && lockPause) return setError(`Còn ${activeUnits} kho tại ${facilityName} đang dùng loại này nên chưa thể ngừng.`)
    if (!isNew && n === editing.name && d === (editing.description || '') && isActive === editing.isActive) {
      return setError('Bạn chưa thay đổi thông tin nào.')
    }
    setError('')
    setSaving(true)
    try {
      await onSave({ typeName: n, description: d || null, isActive })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card fp-modal">
        <div className="fm-modal-header">
          <h2>{isNew ? 'Thêm loại kho' : `Sửa loại kho #${editing.id}`}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <form className="fm-modal-form" onSubmit={submit}>
          {error && <div className="auth-message error" role="alert">{error}</div>}

          <div className="fp-id-box">
            <span>Mã loại kho</span>
            <strong>#{isNew ? nextId : editing.id}</strong>
            <em>{isNew ? 'Dự kiến, do hệ thống tự cấp khi lưu' : 'Do hệ thống cấp, không đổi được'}</em>
          </div>

          <label>
            Tên loại kho
            <input type="text" value={name} maxLength={100} placeholder="VD: Kho để xe" autoFocus required
              onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            Mô tả
            <textarea rows={3} value={description} maxLength={255}
              placeholder="VD: Kho có lối dắt xe, phù hợp gửi xe máy dài hạn"
              onChange={(e) => setDescription(e.target.value)} />
            <small className="fm-field-note">{description.trim().length}/255 ký tự</small>
          </label>

          <label>
            Trạng thái tại {facilityName}
            <select value={isActive ? 'on' : 'off'} onChange={(e) => setIsActive(e.target.value === 'on')}>
              <option value="on">Active</option>
              <option value="off" disabled={lockPause}>
                Deactive{lockPause ? ` (còn ${activeUnits} kho đang dùng)` : ''}
              </option>
            </select>
            <small className="fm-field-note">Chỉ loại kho Active mới chọn được khi tạo hoặc sửa kho.</small>
          </label>

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn" disabled={saving}>
              {saving ? 'Đang lưu...' : isNew ? 'Thêm loại kho' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   MODAL KÍCH THƯỚC KHO
   ========================================================= */
function SizeModal({ editing, sizes, categories, activeUnits, hasRates, facilityName, onClose, onSave }) {
  const isNew = !editing
  const dimsLocked = !isNew && (hasRates || activeUnits > 0)
  const lockPause = !isNew && editing.isActive && activeUnits > 0

  const [prefix, setPrefix] = useState(isNew ? categories[0]?.prefix : fpCategoryOf(editing.sizeCode, categories)?.prefix)
  const [code, setCode] = useState(editing?.sizeCode ?? '')
  const [name, setName] = useState(editing?.displayName ?? '')
  const [width, setWidth] = useState(editing ? String(editing.widthM) : '')
  const [length, setLength] = useState(editing ? String(editing.lengthM) : '')
  const [isActive, setIsActive] = useState(editing ? editing.isActive : true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const cat = categories.find(c => c.prefix === prefix) || categories[0]
  // Chiều cao không hiển thị cho người dùng; chỉ dùng nội bộ để đổi khoảng thể tích của nhóm sang khoảng diện tích
  const h = cat?.heightM || 2.5
  const minArea = cat.minVolume / h
  const maxArea = cat.maxVolume / h
  const w = Number(width)
  const l = Number(length)
  const area = w > 0 && l > 0 ? w * l : 0
  const areaOk = area > 0 && area * h >= cat.minVolume && area * h <= cat.maxVolume

  const suggested = useMemo(() => {
    const max = sizes
      .filter(s => s.sizeCode.toUpperCase().startsWith(cat.prefix))
      .map(s => parseInt(s.sizeCode.slice(cat.prefix.length), 10) || 0)
      .reduce((a, b) => Math.max(a, b), 0)
    return `${cat.prefix}${max + 1}`
  }, [sizes, cat])

  const submit = async (e) => {
    e.preventDefault()
    const n = fpClean(name)
    const c = isNew ? (code.trim().toUpperCase() || suggested) : editing.sizeCode
    if (!n) return setError('Vui lòng nhập tên hiển thị.')
    if (n.length > 100) return setError('Tên hiển thị tối đa 100 ký tự.')
    if (isNew) {
      if (!new RegExp(`^${cat.prefix}[0-9]+$`).test(c)) return setError(`Mã size phải dạng ${cat.prefix} + số, ví dụ ${suggested}.`)
      if (sizes.some(s => s.sizeCode.toUpperCase() === c)) return setError(`Mã size "${c}" đã tồn tại.`)
    }
    if (!dimsLocked) {
      if (!(w >= 0.5 && w <= 50) || !(l >= 0.5 && l <= 50)) return setError('Chiều rộng và chiều dài phải từ 0,5 đến 50 m.')
      if (!areaOk) {
        return setError(`Diện tích ${fpFmt(area)} m² không thuộc nhóm ${cat.name}. ` +
          `Diện tích phải từ ${fpFmt(minArea)} đến ${fpFmt(maxArea)} m².`)
      }
    }
    if (!isActive && lockPause) return setError(`Còn ${activeUnits} kho tại ${facilityName} dùng kích thước này nên chưa thể ngừng.`)
    if (!isNew && n === editing.displayName && w === editing.widthM && l === editing.lengthM && isActive === editing.isActive) {
      return setError('Bạn chưa thay đổi thông tin nào.')
    }
    setError('')
    setSaving(true)
    try {
      const W = dimsLocked ? editing.widthM : w
      const L = dimsLocked ? editing.lengthM : l
      await onSave({
        sizeCode: c,
        displayName: n,
        dimensions: `${c}: ${n}`,
        widthM: W,
        lengthM: L,
        heightM: h,
        volume: Math.round(W * L * h * 100) / 100,
        isActive
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card fp-modal">
        <div className="fm-modal-header">
          <h2>{isNew ? 'Thêm kích thước kho' : `Sửa kích thước ${editing.sizeCode}`}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <form className="fm-modal-form" onSubmit={submit}>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          {dimsLocked && (
            <p className="fm-form-hint">Kích thước đã có kho hoặc bảng giá nên chỉ đổi được tên hiển thị và trạng thái. Muốn kích thước khác, hãy thêm size mới.</p>
          )}

          <div className="fm-form-row">
            <label>
              Nhóm size
              <select value={prefix} disabled={!isNew} onChange={(e) => { setPrefix(e.target.value); setCode('') }}>
                {categories.map(c => (
                  <option key={c.prefix} value={c.prefix}>
                    {c.name} ({c.prefix}) · {fpFmt(c.minVolume / (c.heightM || 2.5))}–{fpFmt(c.maxVolume / (c.heightM || 2.5))} m²
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mã size
              <input type="text" value={isNew ? code : editing.sizeCode} readOnly={!isNew} maxLength={10}
                placeholder={`Để trống = ${suggested}`} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
          </div>

          <label>
            Tên hiển thị cho khách
            <input type="text" value={name} maxLength={100} placeholder="VD: Kho 2 x 3 m" required
              onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="fm-form-row">
            <label>
              Rộng (m)
              <input type="number" min="0.5" max="50" step="0.01" value={width} readOnly={dimsLocked}
                onChange={(e) => setWidth(e.target.value)} required />
            </label>
            <label>
              Dài (m)
              <input type="number" min="0.5" max="50" step="0.01" value={length} readOnly={dimsLocked}
                onChange={(e) => setLength(e.target.value)} required />
            </label>
          </div>

          <div className={`fp-calc ${area > 0 && !areaOk && !dimsLocked ? 'bad' : ''}`}>
            <span>Diện tích <strong>{fpFmt(area)} m²</strong></span>
            <small>Nhóm {cat.name}: diện tích từ {fpFmt(minArea)} đến {fpFmt(maxArea)} m².</small>
          </div>

          <label>
            Trạng thái tại {facilityName}
            <select value={isActive ? 'on' : 'off'} onChange={(e) => setIsActive(e.target.value === 'on')}>
              <option value="on">Active</option>
              <option value="off" disabled={lockPause}>
                Deactive{lockPause ? ` (còn ${activeUnits} kho đang dùng)` : ''}
              </option>
            </select>
          </label>

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn" disabled={saving}>
              {saving ? 'Đang lưu...' : isNew ? 'Thêm kích thước' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   MÀN HÌNH CHÍNH
   ========================================================= */
function FacilityPropertiesTab({
  facilityId,
  facilityName,
  catalog = { types: [], sizes: [] },
  loading = false,
  error = '',
  facilityUnits = [],
  rentalRates = [],
  sizeCategories,
  dialog,
  showToast = () => {},
  onChanged = async () => {}
}) {
  const [view, setView] = useState('types')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // { kind: 'type' | 'size', row }

  const categories = sizeCategories?.length ? sizeCategories : FP_SIZE_CATEGORIES
  const isTypes = view === 'types'
  const rows = isTypes ? catalog.types : catalog.sizes

  /* Số liệu tại cơ sở, tính từ dữ liệu cơ sở (chính xác theo từng kho) */
  const facilityRates = useMemo(
    () => rentalRates.filter(r => Number(r.facilityId) === Number(facilityId)),
    [rentalRates, facilityId])

  const usage = (row) => {
    const key = isTypes ? 'unitTypeId' : 'unitSizeId'
    const units = facilityUnits.filter(u =>
      String(isTypes ? u.unitTypeId : (u.sizeId ?? u.unitSizeId)) === String(row.id))
    return {
      allUnits: units.length,
      activeUnits: units.filter(u => u.status !== 'INACTIVE').length,
      rates: facilityRates.filter(r => String(r[key]) === String(row.id))
    }
  }

  const stats = {
    all: rows.length,
    on: rows.filter(r => r.isActive).length,
    off: rows.filter(r => !r.isActive).length
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (filter === 'on' && !r.isActive) return false
      if (filter === 'off' && r.isActive) return false
      if (!q) return true
      const text = isTypes ? `${r.id} ${r.name} ${r.description}` : `${r.sizeCode} ${r.displayName}`
      return text.toLowerCase().includes(q)
    })
  }, [rows, filter, query, isTypes])

  const label = (row) => (isTypes ? `loại kho #${row.id} "${row.name}"` : `kích thước ${row.sizeCode} "${row.displayName}"`)
  const base = isTypes ? '/api/unit-types' : '/api/unit-sizes'

  const switchView = (v) => { setView(v); setFilter('all'); setQuery('') }

  /* ----- Body gửi backend (luôn kèm facilityID để BE chỉ đổi trạng thái tại cơ sở này) ----- */
  const typeBody = (t, patch = {}) => ({
    typeName: t.name, name: t.name, description: t.description || null, isActive: t.isActive, facilityID: facilityId, ...patch
  })
  const sizeBody = (s, patch = {}) => ({
    sizeCode: s.sizeCode, displayName: s.displayName, dimensions: `${s.sizeCode}: ${s.displayName}`,
    widthM: s.widthM, lengthM: s.lengthM, heightM: s.heightM, volume: s.volumeM3,
    isActive: s.isActive, facilityID: facilityId, ...patch
  })

  /* ----- Lưu từ modal ----- */
  const saveType = async (payload) => {
    const row = modal.row
    const body = { typeName: payload.typeName, name: payload.typeName, description: payload.description, isActive: payload.isActive, facilityID: facilityId }
    const saved = row ? await apiPut(`/api/unit-types/${row.id}`, body) : await apiPost('/api/unit-types', body)
    setModal(null)
    await onChanged()
    const id = row?.id ?? normalizeType(saved || {}).id
    showToast(row ? `Đã cập nhật loại kho #${row.id}.` : `Đã thêm loại kho #${id || '?'} "${payload.typeName}".`)
  }

  const saveSize = async (payload) => {
    const row = modal.row
    const body = { ...payload, facilityID: facilityId }
    const saved = row ? await apiPut(`/api/unit-sizes/${row.id}`, body) : await apiPost('/api/unit-sizes', body)
    setModal(null)
    await onChanged()
    const code = row?.sizeCode ?? normalizeSize(saved || {}).sizeCode
    showToast(row ? `Đã cập nhật kích thước ${row.sizeCode}.` : `Đã thêm kích thước ${code || ''} "${payload.displayName}".`)
  }

  /* ----- Ngừng / bật lại tại cơ sở ----- */
  const toggle = async (row) => {
    const u = usage(row)
    const turningOff = row.isActive
    if (turningOff && u.activeUnits > 0) {
      await dialog.alert({
        tone: 'warning',
        title: 'Chưa thể chuyển sang Deactive',
        message: `Còn ${u.activeUnits} kho tại ${facilityName} đang dùng ${label(row)}. Hãy đổi hoặc ngừng các kho đó trước.`
      })
      return
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: turningOff ? `Chuyển ${label(row)} sang Deactive?` : `Chuyển ${label(row)} sang Active?`,
      message: turningOff
        ? `Sẽ không còn chọn được khi tạo hoặc sửa kho tại ${facilityName}.`
        : `Sẽ chọn được trở lại khi tạo hoặc sửa kho tại ${facilityName}.`,
      confirmLabel: turningOff ? 'Deactive' : 'Active'
    })
    if (!ok) return
    try {
      const body = isTypes ? typeBody(row, { isActive: !turningOff }) : sizeBody(row, { isActive: !turningOff })
      await apiPut(`${base}/${row.id}`, body)
      await onChanged()
      showToast(turningOff ? `Đã chuyển ${label(row)} sang Deactive.` : `Đã chuyển ${label(row)} sang Active.`)
    } catch (err) {
      await dialog.alert({ tone: 'danger', title: 'Không cập nhật được', message: err.message })
    }
  }

  /* ----- Xóa: tự xóa mức giá của cơ sở trước, rồi mới xóa loại / size ----- */
  const remove = async (row) => {
    const u = usage(row)
    const reasons = []
    if (u.allUnits > 0) reasons.push(`Có ${u.allUnits} kho tại ${facilityName} thuộc ${isTypes ? 'loại' : 'kích thước'} này.`)
    if (row.reservationCount > 0) reasons.push(`Đã có ${row.reservationCount} đơn đặt chỗ sử dụng.`)
    if (reasons.length) {
      await dialog.alert({
        tone: 'warning',
        title: `Không thể xóa ${label(row)}`,
        message: `${reasons.join(' ')}\n\nNếu không muốn dùng nữa, hãy chuyển sang Deactive (sau khi đổi hoặc ngừng các kho liên quan).`
      })
      return
    }

    const rateText = u.rates.length
      ? `\n\nSẽ xóa luôn ${u.rates.length} mức giá liên quan tại ${facilityName}: ` +
        u.rates.map(r => `${isTypes ? r.size : r.unitType} (${fmtMoney(r.price)})`).join(', ') + '.'
      : ''
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Xóa ${label(row)}?`,
      message: `Thao tác này không hoàn tác được.${rateText}`,
      confirmLabel: u.rates.length ? 'Xóa cả mức giá' : 'Xóa'
    })
    if (!ok) return

    try {
      for (const r of u.rates) {
        await apiDelete(`/api/operations/facilities/${facilityId}/rates/${r.unitTypeId}/${r.unitSizeId}`)
      }
      await apiDelete(`${base}/${row.id}`)
      await onChanged()
      showToast(`Đã xóa ${label(row)}.`)
    } catch (err) {
      await onChanged()
      await dialog.alert({
        tone: 'danger',
        title: 'Không xóa được',
        message: `${err.message}\n\nNếu ${isTypes ? 'loại' : 'kích thước'} này còn kho hoặc mức giá ở cơ sở khác, chỉ Business Operations mới xóa được.`
      })
    }
  }

  if (facilityId == null) {
    return <div className="fm-section-card"><div className="empty-state">Tài khoản chưa được gán cơ sở.</div></div>
  }

  const StatusBadge = ({ row }) => row.isActive
    ? <span className="fp-badge fp-badge-active">● Active</span>
    : <span className="fp-badge fp-badge-deactive">● Deactive</span>

  const Actions = ({ row }) => {
    const u = usage(row)
    const locked = u.allUnits > 0 || row.reservationCount > 0
    return (
      <div className="fp-actions">
        <button type="button" className="fp-btn" onClick={() => setModal({ kind: isTypes ? 'type' : 'size', row })}>Sửa</button>
        <button type="button" className="fp-btn" onClick={() => toggle(row)}>{row.isActive ? 'Deactive' : 'Active'}</button>
        <button type="button" className={`fp-btn ${locked ? 'locked' : 'danger'}`}
          title={locked ? 'Bấm để xem lý do không xóa được' : 'Xóa'} onClick={() => remove(row)}>
          {locked ? '🔒 Xóa' : 'Xóa'}
        </button>
      </div>
    )
  }

  const UsageCell = ({ row }) => {
    const u = usage(row)
    return (
      <div className="fp-usage">
        <span>{u.activeUnits > 0 ? <strong>{u.activeUnits} kho</strong> : <span className="fm-muted">0 kho</span>}</span>
        <small>{u.rates.length} mức giá</small>
      </div>
    )
  }

  const editingRow = modal?.row
  const editingUsage = editingRow ? usage(editingRow) : { activeUnits: 0, rates: [] }

  return (
    <div className="fm-section-card fp-card">
      <div className="fp-head">
        <div>
          <h2>Thiết lập đặc tính kho</h2>
          <p>Loại kho và kích thước kho đang dùng tại {facilityName}. Thêm, sửa, chuyển Active / Deactive hoặc xóa ngay tại đây.</p>
        </div>
        <button type="button" className="dashboard-primary-btn" onClick={() => setModal({ kind: isTypes ? 'type' : 'size', row: null })}>
          {isTypes ? '+ Thêm loại kho' : '+ Thêm kích thước'}
        </button>
      </div>

      <div className="fp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={isTypes} className={isTypes ? 'active' : ''} onClick={() => switchView('types')}>
          Loại kho <span>{catalog.types.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={!isTypes} className={!isTypes ? 'active' : ''} onClick={() => switchView('sizes')}>
          Kích thước kho <span>{catalog.sizes.length}</span>
        </button>
      </div>

      <div className="fp-toolbar">
        <div className="fp-chips">
          {[['all', `Tất cả ${stats.all}`], ['on', `Active ${stats.on}`], ['off', `Deactive ${stats.off}`]].map(([v, t]) => (
            <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{t}</button>
          ))}
        </div>
        <input className="fm-input fp-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={isTypes ? 'Tìm theo mã, tên, mô tả...' : 'Tìm theo mã, tên size...'} />
      </div>

      {error && <div className="auth-message error" role="alert">Không tải được dữ liệu: {error}</div>}

      {loading && !rows.length ? (
        <div className="empty-state">Đang tải...</div>
      ) : (
        <div className="fm-table-wrap">
          <table className="fm-table fp-table">
            <thead>
              {isTypes ? (
                <tr><th>Mã</th><th>Loại kho</th><th>Trạng thái</th><th>Tại cơ sở</th><th className="fp-right">Thao tác</th></tr>
              ) : (
                <tr><th>Mã</th><th>Kích thước</th><th>Nhóm</th><th>Diện tích</th><th>Trạng thái</th><th>Tại cơ sở</th><th className="fp-right">Thao tác</th></tr>
              )}
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={isTypes ? 5 : 7} className="text-center fm-muted">Không có mục phù hợp.</td></tr>
              )}
              {visible.map(row => (
                <tr key={row.id} className={row.isActive ? '' : 'fp-row-off'}>
                  {isTypes ? (
                    <>
                      <td><span className="fp-code">#{row.id}</span></td>
                      <td>
                        <strong>{row.name}</strong>
                        <small className="fp-sub">{row.description || 'Chưa có mô tả'}</small>
                      </td>
                    </>
                  ) : (
                    <>
                      <td><span className="fp-code">{row.sizeCode}</span></td>
                      <td>
                        <strong>{row.displayName}</strong>
                        <small className="fp-sub">{fpFmt(row.widthM)} × {fpFmt(row.lengthM)} m</small>
                      </td>
                      <td>{fpCategoryOf(row.sizeCode, categories)?.name || '—'}</td>
                      <td>{fpFmt(row.areaM2)} m²</td>
                    </>
                  )}
                  <td><StatusBadge row={row} /></td>
                  <td><UsageCell row={row} /></td>
                  <td className="fp-right"><Actions row={row} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === 'type' && (
        <TypeModal key={editingRow?.id || 'new'} editing={editingRow} types={catalog.types}
          activeUnits={editingUsage.activeUnits} facilityName={facilityName}
          onClose={() => setModal(null)} onSave={saveType} />
      )}
      {modal?.kind === 'size' && (
        <SizeModal key={editingRow?.id || 'new'} editing={editingRow} sizes={catalog.sizes} categories={categories}
          activeUnits={editingUsage.activeUnits} hasRates={editingUsage.rates.length > 0}
          facilityName={facilityName} onClose={() => setModal(null)} onSave={saveSize} />
      )}
    </div>
  )
}

/* =========================================================
   NHÂN SỰ TẠI CƠ SỞ (Facility Manager)
   - Thêm nhân viên vào cơ sở: POST /api/operations/facilities/{id}/staff
   - Xem trạng thái thật, lịch sử bàn giao (state.activity), việc chờ bàn giao
   ========================================================= */
const STAFF_STATUS_MAP = {
  Active: { label: '● Active', className: 'fp-badge fp-badge-active' },
  Inactive: { label: '● Inactive', className: 'fp-badge fp-badge-deactive' }
}

function StaffStatusBadge({ status }) {
  const item = STAFF_STATUS_MAP[status] || { label: status || '—', className: 'fp-badge' }
  return <span className={item.className}>{item.label}</span>
}

// Ngày hẹn bàn giao của đơn (yyyy-mm-dd) và nhãn hiển thị
const appointmentKey = (r) => String(r.appointmentDate || r.startDate || '').slice(0, 10)

function AddStaffModal({ facilityName, candidates, onClose, onSave }) {
  const [email, setEmail] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = candidates.filter(c =>
    `${c.fullName} ${c.email}`.toLowerCase().includes(query.trim().toLowerCase()))
  const selected = candidates.find(c => c.email === email)

  const submit = async (e) => {
    e.preventDefault()
    if (!selected) return setError('Vui lòng chọn một nhân viên.')
    setError('')
    setSaving(true)
    try {
      await onSave(selected)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card fp-modal">
        <div className="fm-modal-header">
          <h2>Thêm nhân viên vào cơ sở</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <form className="fm-modal-form" onSubmit={submit}>
          {error && <div className="auth-message error" role="alert">{error}</div>}
          <p className="fm-form-hint">
            Chọn tài khoản Facility Staff để làm việc tại {facilityName}. Nhân viên sẽ thấy và xử lý được các đơn bàn giao của cơ sở.
          </p>

          {candidates.length === 0 ? (
            <div className="empty-state">Tất cả tài khoản Facility Staff đang Active đã thuộc {facilityName}.</div>
          ) : (
            <>
              <label>
                Tìm nhân viên
                <input type="search" value={query} placeholder="Tên hoặc email..." onChange={(e) => setQuery(e.target.value)} />
              </label>
              <label>
                Nhân viên
                <select value={email} onChange={(e) => setEmail(e.target.value)} required>
                  <option value="">-- Chọn nhân viên --</option>
                  {filtered.map(c => (
                    <option key={c.email} value={c.email}>
                      {c.fullName} · {c.email}{c.wasInactive ? ' (từng làm tại cơ sở, đang Inactive)' : ''}
                    </option>
                  ))}
                </select>
                {query && filtered.length === 0 && <small className="fm-field-note">Không tìm thấy nhân viên phù hợp.</small>}
              </label>
            </>
          )}

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn" disabled={saving || candidates.length === 0}>
              {saving ? 'Đang thêm...' : 'Thêm vào cơ sở'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StaffHistoryModal({ staff, items, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fm-modal-overlay" onClick={onClose}>
      <div className="fm-modal-card fp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fm-modal-header">
          <h2>Lịch sử công việc · {staff.fullName}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        {items.length === 0 ? (
          <div className="empty-state">Nhân viên chưa có lượt bàn giao nào tại cơ sở.</div>
        ) : (
          <ul className="fs-history">
            {items.map(item => (
              <li key={item.id}>
                <span className="fs-history-time">{fmtDateTime(item.at)}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="fm-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

function FacilityStaffTab({ facilityId, facilityName, staffList = [], staffUsers = [], activity = [], awaitingHandoverList = [], showToast = () => {}, onChanged = async () => {} }) {
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [historyStaff, setHistoryStaff] = useState(null)

  // Lịch sử bàn giao tại cơ sở, mới nhất trước
  const facilityActivity = useMemo(
    () => activity
      .filter(a => a.facilityId === facilityName)
      .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)),
    [activity, facilityName])

  const historyOf = (st) => facilityActivity.filter(a => a.staffName === st.fullName)

  const stats = {
    total: staffList.length,
    active: staffList.filter(s => s.status === 'Active').length,
    inactive: staffList.filter(s => s.status !== 'Active').length,
    handovers: facilityActivity.length
  }

  const visibleStaff = staffList
    .filter(s => filter === 'all' || (filter === 'active' ? s.status === 'Active' : s.status !== 'Active'))
    .sort((a, b) => Number(b.status === 'Active') - Number(a.status === 'Active') || a.fullName.localeCompare(b.fullName, 'vi'))

  // Nhân viên có thể thêm: Staff đang Active nhưng chưa làm (hoặc đang Inactive) tại cơ sở này
  const candidates = useMemo(() => {
    const byEmail = new Map(staffList.map(s => [String(s.email).toLowerCase(), s]))
    return staffUsers
      .filter(u => {
        const current = byEmail.get(String(u.email).toLowerCase())
        return !current || current.status !== 'Active'
      })
      .map(u => ({ ...u, wasInactive: Boolean(byEmail.get(String(u.email).toLowerCase())) }))
  }, [staffUsers, staffList])

  // Việc chờ bàn giao, sắp theo ngày hẹn gần nhất
  const today = todayStr()
  const upcoming = [...awaitingHandoverList].sort((a, b) => appointmentKey(a).localeCompare(appointmentKey(b)))

  const addStaff = async (candidate) => {
    try {
      await apiPost(`/api/operations/facilities/${facilityId}/staff`, { staffEmail: candidate.email })
    } catch (err) {
      // Backend trả 403 không kèm lời nhắn
      if (/403/.test(err.message)) throw new Error(`Bạn không có quyền phân công nhân viên cho ${facilityName}.`)
      throw err
    }
    setShowAdd(false)
    await onChanged()
    showToast(`Đã thêm ${candidate.fullName} vào ${facilityName}.`)
  }

  return (
    <div className="fm-section-card">
      <div className="fm-card-header-flex">
        <div>
          <h2>Đội ngũ Facility Staff tại {facilityName}</h2>
          <p>Phân công nhân viên vào cơ sở để hỗ trợ bàn giao, kiểm tra kho và xử lý sự cố.</p>
        </div>
        <button type="button" className="dashboard-primary-btn" onClick={() => setShowAdd(true)} disabled={facilityId == null}>
          + Thêm nhân viên
        </button>
      </div>

      <div className="fs-stats">
        <div><small>Tổng nhân viên</small><strong>{stats.total}</strong></div>
        <div><small>Đang Active</small><strong className="fs-ok">{stats.active}</strong></div>
        <div><small>Lượt bàn giao đã làm</small><strong>{stats.handovers}</strong></div>
        <div><small>Đơn chờ bàn giao</small><strong className={upcoming.length ? 'fs-warn' : ''}>{upcoming.length}</strong></div>
      </div>

      <div className="fp-toolbar">
        <div className="fp-chips">
          {[['all', `Tất cả ${stats.total}`], ['active', `Active ${stats.active}`], ['inactive', `Inactive ${stats.inactive}`]].map(([v, t]) => (
            <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{t}</button>
          ))}
        </div>
      </div>

      {visibleStaff.length === 0 ? (
        <div className="empty-state">
          {staffList.length === 0
            ? `${facilityName} chưa có nhân viên. Bấm "+ Thêm nhân viên" để phân công.`
            : 'Không có nhân viên phù hợp bộ lọc.'}
        </div>
      ) : (
        <div className="fm-staff-grid">
          {visibleStaff.map(st => {
            const history = historyOf(st)
            const last = history[0]
            return (
              <div key={st.staffId ?? st.id} className={`fm-staff-card${st.status === 'Active' ? '' : ' fs-card-off'}`}>
                <div className="fm-staff-avatar">{(st.fullName || '?').charAt(0)}</div>
                <div className="fm-staff-info">
                  <div className="fs-card-head">
                    <h3>{st.fullName}</h3>
                    <StaffStatusBadge status={st.status} />
                  </div>
                  <p>✉ {st.email}</p>
                  <div className="fm-shift-tag">
                    {history.length} lượt bàn giao{last ? ` · gần nhất ${fmtDateTime(last.at)}` : ''}
                  </div>
                  <div>
                    <button type="button" className="fs-link-btn" onClick={() => setHistoryStaff(st)}>Xem lịch sử công việc →</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="fs-section">
        <h3>Việc chờ bàn giao tại cơ sở ({upcoming.length})</h3>
        <p className="fm-muted">Đơn khách đã đặt cọc. Nhân viên đang Active tại cơ sở có thể nhận và bàn giao trực tiếp khi khách đến.</p>
        {upcoming.length === 0 ? (
          <div className="empty-state">Hiện không có đơn nào chờ bàn giao.</div>
        ) : (
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Ngày hẹn</th>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Kho</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(r => {
                  const key = appointmentKey(r)
                  const unitText = r.unitNumbers?.length ? r.unitNumbers.join(', ') : (r.assignedUnitId || '—')
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{fmtDate(key)}</strong>
                        {r.appointmentTime && <small className="fm-muted" style={{ display: 'block' }}>{r.appointmentTime}</small>}
                        {key === today && <span className="fs-tag-today">Hôm nay</span>}
                        {key && key < today && <span className="fs-tag-late">Quá hẹn</span>}
                      </td>
                      <td><strong>{formatReservationCode(r.id)}</strong></td>
                      <td>{r.customerName}<small className="fm-muted" style={{ display: 'block' }}>{r.customerPhone || r.customerEmail}</small></td>
                      <td>{unitText}</td>
                      <td><Badge map={RES_STATUS_MAP} value={r.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddStaffModal
          facilityName={facilityName}
          candidates={candidates}
          onClose={() => setShowAdd(false)}
          onSave={addStaff}
        />
      )}
      {historyStaff && (
        <StaffHistoryModal staff={historyStaff} items={historyOf(historyStaff)} onClose={() => setHistoryStaff(null)} />
      )}
    </div>
  )
}

/* =========================================================
   HỢP ĐỒNG TẠI CƠ SỞ (Facility Manager · chỉ xem)
   Dùng lại ContractDocument (văn bản hợp đồng của trang khách hàng)
   ========================================================= */
const DAY_MS = 24 * 60 * 60 * 1000
const EXPIRING_DAYS = 30

// Số ngày còn lại tới ngày kết thúc (âm = đã quá hạn)
function daysLeft(endDate) {
  const end = new Date(String(endDate || '').slice(0, 10) + 'T00:00:00')
  const today = new Date(todayStr() + 'T00:00:00')
  if (Number.isNaN(end.getTime())) return null
  return Math.round((end - today) / DAY_MS)
}

function contractPhase(c) {
  const left = daysLeft(c.endDate)
  if (left == null) return 'active'
  if (left < 0) return 'expired'
  if (left <= EXPIRING_DAYS) return 'expiring'
  return 'active'
}

const CONTRACT_PHASE_MAP = {
  active: { label: 'Đang hiệu lực', className: 'fm-badge fm-ok' },
  expiring: { label: 'Sắp hết hạn', className: 'fm-badge fm-warn' },
  expired: { label: 'Đã hết hạn', className: 'fp-badge fp-badge-deactive' }
}

// Chuyển dữ liệu hợp đồng của Manager sang dạng `group` mà ContractDocument cần
function buildContractGroup(c, r, facilityUnits, facilityName) {
  const numbers = (c.unitNumbers?.length ? c.unitNumbers : [c.unitId]).filter(Boolean)
  const units = numbers.map(number => {
    const u = facilityUnits.find(x => x.id === number)
    return { number, type: u?.type, size: u?.size, monthlyPrice: u?.pricePerMonth ?? null }
  })
  const monthly = units.reduce((sum, u) => sum + Number(u.monthlyPrice || 0), 0)
  const months = Number(r?.months) || 0
  return {
    key: `contract-${c.id}`,
    code: c.contractNumber || `HD-${c.id}`,
    title: `Hợp đồng ${c.contractNumber || `HD-${c.id}`}`,
    rentals: [{
      facility: facilityName,
      months,
      startDate: fmtDate(c.startDate),
      endDate: fmtDate(c.endDate),
      depositMonths: r?.depositMonths || 2,
      monthlyPrice: monthly,
      rentalAmount: Number(c.totalFee || r?.rentalFee || monthly * months),
      depositAmount: Number(c.deposit || r?.deposit || 0),
      reservationCode: r?.reservationCode || formatReservationCode(c.reservationId),
      reservationId: c.reservationId,
      units
    }]
  }
}

function ManagerContractModal({ contract, reservation, facility, facilityUnits, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [onClose])

  const group = buildContractGroup(contract, reservation, facilityUnits, facility?.name || '')
  const rental = group.rentals[0]
  const customer = {
    name: contract.customerName || reservation?.customerName,
    email: reservation?.customerEmail,
    phone: reservation?.customerPhone
  }
  const phase = contractPhase(contract)
  const left = daysLeft(contract.endDate)
  const phaseInfo = CONTRACT_PHASE_MAP[phase]

  return (
    <div className="csf-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="csf" role="dialog" aria-modal="true" aria-labelledby="fmc-title">
        <div className="csf-head">
          <div>
            <span className={phaseInfo.className}>{phaseInfo.label}</span>
            <h2 id="fmc-title">{group.title}</h2>
            <p>
              {customer.name} · {rental.units.length} kho · {rental.startDate} → {rental.endDate}
              {left != null && (left >= 0 ? ` · còn ${left} ngày` : ` · quá hạn ${-left} ngày`)}
            </p>
          </div>
          <button type="button" className="csf-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="csf-body">
          <div className="cdm-summary">
            <div><span>Tiền thuê / tháng</span><strong>{fmtMoney(rental.monthlyPrice)}</strong></div>
            <div><span>Tổng tiền thuê</span><strong>{fmtMoney(rental.rentalAmount)}</strong></div>
            <div><span>Tiền cọc đã trả</span><strong>{fmtMoney(rental.depositAmount)}</strong></div>
            <div><span>Thanh toán</span><strong>{reservation?.paymentStatus === 'PAID' ? 'Đã thanh toán cọc' : 'Chưa xác nhận'}</strong></div>
          </div>

          <div className="fmc-ops">
            <div><small>Mã đơn</small><strong>{rental.reservationCode}</strong></div>
            <div><small>Thông tin ra vào</small><strong>{contract.accessType ? `${contract.accessType}: ${contract.accessValue || '—'}` : 'Chưa cấp'}</strong></div>
            <div><small>Liên hệ khách</small><strong>{customer.phone || customer.email || '—'}</strong></div>
          </div>

          <p className="fmc-note">
            Bạn đang xem hợp đồng ở chế độ <strong>chỉ xem</strong>. Chữ ký điện tử của khách hiển thị ở trang khách hàng.
            Giá trong Phụ lục lấy theo giá hiện tại của từng kho.
          </p>

          <ContractDocument
            group={group}
            customer={customer}
            facilityAddress={facility?.address}
            showTerms
          />
        </div>

        <div className="csf-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={() => window.print()}>In / Lưu PDF</button>
          <span className="csf-spacer" />
          <button type="button" className="dashboard-primary-btn" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  )
}

function FacilityContractsTab({ facility, facilityName, contracts = [], reservations = [], facilityUnits = [] }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState(null)

  const reservationOf = (c) => reservations.find(x =>
    String(x.contractId ?? '') === String(c.id) ||
    (c.reservationId != null && String(x.id) === String(c.reservationId)))

  const counts = {
    all: contracts.length,
    active: contracts.filter(c => contractPhase(c) === 'active').length,
    expiring: contracts.filter(c => contractPhase(c) === 'expiring').length,
    expired: contracts.filter(c => contractPhase(c) === 'expired').length
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contracts
      .filter(c => filter === 'all' || contractPhase(c) === filter)
      .filter(c => {
        if (!q) return true
        const r = reservationOf(c)
        return [c.contractNumber, c.id, c.customerName, r?.customerEmail, r?.reservationCode, ...(c.unitNumbers || [])]
          .filter(Boolean).join(' ').toLowerCase().includes(q)
      })
      // Sắp hết hạn lên trước để Manager chú ý
      .sort((a, b) => (daysLeft(a.endDate) ?? 0) - (daysLeft(b.endDate) ?? 0))
  }, [contracts, reservations, filter, query])

  return (
    <div className="fm-section-card">
      <div className="fm-card-header">
        <h2>Hợp đồng thuê tại {facilityName}</h2>
        <p>Theo dõi khách thuê, kỳ thuê, thông tin ra vào và tình trạng thanh toán. Bấm "Xem hợp đồng" để đọc toàn văn.</p>
      </div>

      <div className="fp-toolbar">
        <div className="fp-chips">
          {[
            ['all', `Tất cả ${counts.all}`],
            ['active', `Đang hiệu lực ${counts.active}`],
            ['expiring', `Sắp hết hạn ${counts.expiring}`],
            ['expired', `Đã hết hạn ${counts.expired}`]
          ].map(([v, t]) => (
            <button key={v} type="button" className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>{t}</button>
          ))}
        </div>
        <input className="fm-input fp-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm mã hợp đồng, khách, mã kho..." aria-label="Tìm hợp đồng" />
      </div>

      <div className="fm-table-wrap">
        <table className="fm-table">
          <thead>
            <tr>
              <th>Mã HĐ</th>
              <th>Khách hàng</th>
              <th>Kho</th>
              <th>Kỳ thuê</th>
              <th>Thông tin ra vào</th>
              <th>Thanh toán</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center fm-muted">
                  {contracts.length === 0 ? 'Chưa có hợp đồng nào tại cơ sở này.' : 'Không có hợp đồng phù hợp.'}
                </td>
              </tr>
            )}
            {visible.map(c => {
              const r = reservationOf(c)
              const phase = contractPhase(c)
              const left = daysLeft(c.endDate)
              const phaseInfo = CONTRACT_PHASE_MAP[phase]
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.contractNumber || `HD-${c.id}`}</strong>
                    <small className="fm-muted" style={{ display: 'block' }}>Đơn {r?.reservationCode || formatReservationCode(c.reservationId)}</small>
                  </td>
                  <td>
                    {c.customerName}
                    {(r?.customerPhone || r?.customerEmail) && <small className="fm-muted" style={{ display: 'block' }}>{r.customerPhone || r.customerEmail}</small>}
                  </td>
                  <td><span className="fm-tag-blue">{c.unitNumbers?.length ? c.unitNumbers.join(', ') : (c.unitId || '—')}</span></td>
                  <td>
                    {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                    {left != null && (
                      <small className={`fmc-left${left < 0 ? ' late' : left <= EXPIRING_DAYS ? ' soon' : ''}`}>
                        {left >= 0 ? `Còn ${left} ngày` : `Quá hạn ${-left} ngày`}
                      </small>
                    )}
                  </td>
                  <td>{c.accessType ? <code>{c.accessType}: {c.accessValue || '—'}</code> : <span className="fm-muted">Chưa cấp</span>}</td>
                  <td>{r ? <Badge map={PAY_STATUS_MAP} value={r.paymentStatus} /> : '—'}</td>
                  <td><span className={phaseInfo.className}>{phaseInfo.label}</span></td>
                  <td>
                    <button type="button" className="dashboard-secondary-btn sm" onClick={() => setViewing(c)}>Xem hợp đồng</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ManagerContractModal
          contract={viewing}
          reservation={reservationOf(viewing)}
          facility={facility}
          facilityUnits={facilityUnits}
          onClose={() => setViewing(null)}
        />
      )}
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
  const [unitFilter, setUnitFilter] = useState('all')
  const [unitSort, setUnitSort] = useState({ key: null, dir: 'asc' })
  const [freshUnits, setFreshUnits] = useState([])
  const [highlightUnitId, setHighlightUnitId] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const [viewingUnitId, setViewingUnitId] = useState(null)
  const [facilityCatalog, setFacilityCatalog] = useState({ types: [], sizes: [] })
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState('')

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

    // Khách đã cọc xong (không còn bước Manager duyệt) → chờ nhân viên bàn giao
    const awaitingHandover = facilityReservations.filter(r => r.status === 'PENDING_APPROVAL' || r.status === 'CONFIRMED').length
    const pendingPayments = facilityReservations.filter(r => r.status === 'PENDING_PAYMENT').length

    return { totalUnits, rentedUnits, reservedUnits, availableUnits, occupancyRate, totalRevenue, awaitingHandover, pendingPayments }
  }, [facilityUnits, facilityReservations])

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

  // Đơn khách đã cọc, đang chờ nhân viên bàn giao (không cần Manager duyệt)
  const awaitingHandoverList = facilityReservations.filter(
    r => r.status === 'PENDING_APPROVAL' || r.status === 'CONFIRMED'
  )

  // Đơn mới đặt, khách chưa trả cọc (kho đang được giữ tạm)
  const awaitingPaymentList = facilityReservations.filter(
    r => r.status === 'PENDING_PAYMENT'
  )

  const staffList = db.staff.filter(staff => staff.facilityId === facilityName)

  const visibleUnits = useMemo(() => {
    const filtered = facilityUnits.filter(unit => {
      if (unitFilter === 'fresh') return freshIds.has(unit.id)
      if (unitFilter === 'booked') return unitLocks.get(unit.id)?.reservations.length > 0
      if (unitFilter === 'available') return unit.status === 'AVAILABLE' && !unitLocks.get(unit.id)?.locked
      return true
    })

    // Mã đơn nhỏ nhất đang giữ kho (null = kho chưa có đơn)
    const firstResId = (u) => {
      const ids = (unitLocks.get(u.id)?.reservations || []).map(r => Number(r.id)).filter(Number.isFinite)
      return ids.length ? Math.min(...ids) : null
    }

    const comparators = {
      code: (a, b) => compareNatural(a.id, b.id),
      type: (a, b) => compareNatural(a.type, b.type),
      size: (a, b) => unitSizeValue(a) - unitSizeValue(b),
      price: (a, b) => Number(a.pricePerMonth || 0) - Number(b.pricePerMonth || 0),
      status: (a, b) => (UNIT_STATUS_ORDER[a.status] ?? 99) - (UNIT_STATUS_ORDER[b.status] ?? 99),
      reservation: (a, b) => (firstResId(a) ?? 0) - (firstResId(b) ?? 0)
    }

    const { key, dir } = unitSort
    const sign = dir === 'desc' ? -1 : 1

    return [...filtered].sort((a, b) => {
      // Thứ tự mặc định: kho mới tạo ghim lên đầu, sau đó theo mã kho tăng dần
      if (!key) {
        const fresh = Number(freshIds.has(b.id)) - Number(freshIds.has(a.id))
        return fresh || compareNatural(a.id, b.id)
      }
      // Sort theo Mã đơn: kho chưa có đơn luôn nằm cuối, dù tăng hay giảm
      if (key === 'reservation') {
        const ra = firstResId(a)
        const rb = firstResId(b)
        if (ra == null && rb == null) return compareNatural(a.id, b.id)
        if (ra == null) return 1
        if (rb == null) return -1
      }
      // Giá trị bằng nhau thì xếp theo mã kho để thứ tự luôn ổn định
      return sign * comparators[key](a, b) || compareNatural(a.id, b.id)
    })
  }, [facilityUnits, unitFilter, freshIds, unitLocks, unitSort])

  // Bấm tiêu đề cột: tăng dần → giảm dần → về mặc định
  const toggleUnitSort = (key) => {
    setUnitSort(current => {
      if (current.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return { key: null, dir: 'asc' }
    })
  }

  const renderSortHeader = (key, label) => {
    const active = unitSort.key === key
    const icon = !active ? '↕' : unitSort.dir === 'asc' ? '▲' : '▼'
    const ariaSort = !active ? 'none' : unitSort.dir === 'asc' ? 'ascending' : 'descending'
    const nextHint = !active ? 'tăng dần' : unitSort.dir === 'asc' ? 'giảm dần' : 'mặc định'
    return (
      <th aria-sort={ariaSort}>
        <button
          type="button"
          className={`fm-sort-btn${active ? ' active' : ''}`}
          onClick={() => toggleUnitSort(key)}
          title={`Sắp xếp ${label.toLowerCase()} (${nextHint})`}
        >
          {label} <span className="fm-sort-icon" aria-hidden="true">{icon}</span>
        </button>
      </th>
    )
  }

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

  /* Xóa kho: chỉ kho chưa từng có đơn / bàn giao / hỗ trợ. Kho đã có lịch sử → chuyển "Ngừng sử dụng" */
  const handleDeleteUnit = async (unit) => {
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Xóa kho ${unit.id}?`,
      message: `Kho ${unit.id} sẽ bị xóa hẳn khỏi ${facilityName}. Thao tác này không hoàn tác được.\n` +
        'Chỉ xóa được kho chưa từng có đơn đặt chỗ, bàn giao hay yêu cầu hỗ trợ.',
      confirmLabel: 'Xóa kho'
    })
    if (!ok) return
    try {
      await apiDelete(`/api/storage-units/${unit.unitId}`)
      setViewingUnitId(null)
      dismissFreshUnit(unit.id)
      await loadState({ silent: true })
      showToast(`Đã xóa kho ${unit.id}.`)
    } catch (err) {
      await dialog.alert({
        tone: 'danger',
        title: `Không xóa được kho ${unit.id}`,
        message: `${err.message}\n\nNếu kho không dùng nữa, bấm "Sửa kho" và chọn trạng thái "Ngừng sử dụng".`
      })
    }
  }

  /* ===== THIẾT LẬP ĐẶC TÍNH KHO: loại kho + kích thước tại cơ sở ===== */
  const catalogFacilityId = managedFacility?.facilityId

  const reloadFacilityCatalog = async () => {
    if (catalogFacilityId == null) return
    setCatalogLoading(true)
    setCatalogError('')
    try {
      setFacilityCatalog(await loadFacilityCatalog(catalogFacilityId))
    } catch (err) {
      setCatalogError(err.message)
    } finally {
      setCatalogLoading(false)
    }
  }

  // Tải khi vào trang (form tạo kho cần danh sách) và mỗi lần mở tab
  useEffect(() => {
    if (catalogFacilityId != null) reloadFacilityCatalog()
  }, [catalogFacilityId, activeTab === 'unitTypes'])

  // Form Tạo / Sửa kho: chỉ loại kho Active tại cơ sở (giữ loại hiện tại của kho đang sửa)
  const unitTypesForUnitForm = useMemo(() => {
    if (!facilityCatalog.types.length) return db.unitTypes || []
    const currentId = String(editingUnit?.unitTypeId ?? '')
    return facilityCatalog.types
      .filter(t => t.isActive || String(t.id) === currentId)
      .map(t => ({ unitTypeId: t.id, name: t.isActive ? t.name : `${t.name} (ngừng dùng)`, description: t.description }))
  }, [facilityCatalog.types, db.unitTypes, editingUnit])

  // Form Tạo / Sửa kho: chỉ kích thước Active tại cơ sở
  const unitSizesForUnitForm = useMemo(() => {
    if (!facilityCatalog.sizes.length) return db.unitSizes || []
    const currentId = String(editingUnit?.unitSizeId ?? editingUnit?.sizeId ?? '')
    return facilityCatalog.sizes
      .filter(s => s.isActive || String(s.id) === currentId)
      .map(s => ({
        unitSizeId: s.id,
        dimensions: `${s.sizeCode}: ${s.displayName}${s.isActive ? '' : ' (ngừng dùng)'}`,
        volume: s.volumeM3
      }))
  }, [facilityCatalog.sizes, db.unitSizes, editingUnit])

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
          <button className={activeTab === 'units' ? 'active' : ''} onClick={() => setActiveTab('units')}>
            <span>▣</span> Quản lý kho cơ sở {freshUnitDetails.length > 0 && <span className="fm-count-badge fm-count-new">Mới {freshUnitDetails.length}</span>}
          </button>
          <button className={activeTab === 'unitTypes' ? 'active' : ''} onClick={() => setActiveTab('unitTypes')}>
            <span>▦</span> Thiết lập đặc tính kho
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
              {activeTab === 'units' && 'Danh mục kho tại cơ sở'}
              {activeTab === 'unitTypes' && 'Thiết lập đặc tính kho'}
              {activeTab === 'contracts' && 'Giám sát hợp đồng thuê'}
              {activeTab === 'staff' && 'Phân công nhân viên cơ sở'}
            </h1>
            <p>Quản lý vận hành kho, theo dõi đơn thuê và doanh thu cơ sở {facilityName}.</p>
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
                <small>Chờ bàn giao</small>
                <strong>{stats.awaitingHandover}</strong>
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

            {/* ĐƠN CẦN THEO DÕI */}
            {(awaitingHandoverList.length > 0 || awaitingPaymentList.length > 0) && (
              <section className="overview-panel">
                <div className="overview-panel-heading">
                  <div>
                    <span className="customer-eyebrow">RESERVATIONS</span>
                    <h2>Đơn đặt kho cần theo dõi ({awaitingHandoverList.length + awaitingPaymentList.length})</h2>
                  </div>
                </div>

                <div className="fm-pending-mini-list">
                  {[...awaitingHandoverList, ...awaitingPaymentList].map(r => {
                    const unitText = r.unitNumbers?.length ? r.unitNumbers.join(', ') : (r.assignedUnitId || '—')
                    return (
                      <div key={r.id} className="fm-pending-mini-item">
                        <div>
                          <strong>{formatReservationCode(r.id)} · {r.customerName}</strong>
                          <small>Kho {unitText} · {r.unitType} · Thuê {r.months} tháng · Từ {fmtDate(r.startDate)}</small>
                        </div>
                        <div className="fm-item-right">
                          <Badge map={RES_STATUS_MAP} value={r.status} />
                          {r.status === 'PENDING_PAYMENT'
                            ? <span className="fm-amount">Hết hạn giữ chỗ {fmtDateTime(r.depositExpiresAt)}</span>
                            : <span className="fm-amount">Cọc {fmtMoney(r.deposit)}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </div>
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
                      {renderSortHeader('code', 'Mã kho')}
                      {renderSortHeader('type', 'Loại kho')}
                      {renderSortHeader('size', 'Size')}
                      {renderSortHeader('price', 'Giá thuê / tháng')}
                      {renderSortHeader('status', 'Trạng thái')}
                      {renderSortHeader('reservation', 'Mã đơn')}
                      <th>
                        Thao tác
                        {unitSort.key && (
                          <button type="button" className="fm-sort-reset" onClick={() => setUnitSort({ key: null, dir: 'asc' })}>
                            Bỏ sắp xếp
                          </button>
                        )}
                      </th>
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

        {/* TAB 4: THIẾT LẬP ĐẶC TÍNH KHO (loại kho + kích thước) */}
        {activeTab === 'unitTypes' && (
          <FacilityPropertiesTab
            facilityId={managedFacility?.facilityId}
            facilityName={facilityName}
            catalog={facilityCatalog}
            loading={catalogLoading}
            error={catalogError}
            facilityUnits={facilityUnits}
            rentalRates={db.rentalRates || []}
            dialog={dialog}
            showToast={showToast}
            onChanged={() => Promise.all([reloadFacilityCatalog(), loadState({ silent: true })])}
          />
        )}

        {/* TAB 5: HỢP ĐỒNG & KHÁCH HÀNG (chỉ xem) */}
        {activeTab === 'contracts' && (
          <FacilityContractsTab
            facility={managedFacility}
            facilityName={facilityName}
            contracts={facilityContracts}
            reservations={db.reservations}
            facilityUnits={facilityUnits}
          />
        )}

        {/* TAB 6: NHÂN SỰ TẠI CƠ SỞ */}
        {activeTab === 'staff' && (
          <FacilityStaffTab
            facilityId={managedFacility?.facilityId}
            facilityName={facilityName}
            staffList={staffList}
            staffUsers={db.staffUsers || []}
            activity={db.activity || []}
            awaitingHandoverList={awaitingHandoverList}
            showToast={showToast}
            onChanged={() => loadState({ silent: true })}
          />
        )}
      </main>

      {/* POPUP CHI TIẾT KHO */}
      {viewingUnit && (
        <UnitDetailModal
          unit={viewingUnit}
          facility={managedFacility}
          lock={unitLocks.get(viewingUnit.id)}
          contract={viewingContract}
          onClose={() => setViewingUnitId(null)}
          onEdit={openEditFromDetail}
          onDelete={handleDeleteUnit}
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
          unitSizes={unitSizesForUnitForm}
          rentalRates={db.rentalRates || []}
          facilityUnits={facilityUnits}
          dialog={dialog}
        />
      )}
    </div>
  )
}