/**
 * ======================================================================
 * FILE: src/pages/business/BusinessCatalog.jsx  —  DANH MỤC LOẠI KHO & KÍCH THƯỚC KHO (CRUD, CHỈ BOM)
 * CHỨC NĂNG: Màn hình "Danh mục kho" của Business Operations: 2 tab Loại kho / Kích thước kho, cho thêm / sửa /
 *   xóa / ngừng dùng. Ràng buộc kiểm tra ngay trên form và kiểm tra lại ở backend:
 *    - Loại kho: tên 2–100 ký tự, không trùng (không phân biệt hoa thường), mô tả ≤ 255 ký tự.
 *    - Kích thước: chọn nhóm (Nhỏ / Vừa / Lớn / Xe); rộng, dài 0,5–50 m, tối đa 2 số lẻ; dài ≥ rộng;
 *      diện tích nằm trong khoảng của nhóm; không trùng số đo; tên hiển thị không trùng; mã size do hệ thống cấp.
 *    - Đang được kho / đơn / bảng giá dùng: không xóa được; kích thước thì khóa số đo và nhóm.
 * THÀNH PHẦN CHÍNH:
 *   - BusinessCatalog (export default): màn hình chính với 2 bảng DataGrid.
 *   - UnitTypeForm: modal thêm / sửa loại kho.
 *   - UnitSizeForm: modal thêm / sửa kích thước kho.
 *   - CatalogModal, Field: khung hộp thoại và 1 ô form dùng chung.
 * DÙNG Ở: src/pages/business/BusinessOperations.jsx (menu "Danh mục kho").
 *   (BusinessCatalog.css cũng được BusinessFacilityForm.jsx dùng lại các class .bc-*.)
 * PHỤ THUỘC: components/common/DataGrid, features/unit/unitTypes (chip loại kho), api/catalogApi, BusinessCatalog.css.
 * API (qua api/catalogApi.js, UnitTypesController / UnitSizesController):
 *   GET/POST /api/unit-types, PUT/DELETE /api/unit-types/{id},
 *   GET/POST /api/unit-sizes, PUT/DELETE /api/unit-sizes/{id}, GET /api/unit-sizes/categories.
 * LUỒNG: mở màn hình -> load (loại kho + kích thước + nhóm kích thước) -> bấm "+ Thêm" / "Sửa"
 *   -> form kiểm tra -> saveType / saveSize -> runSave gọi API -> afterChange đóng form, tải lại, báo thành công.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   fmtNum: Định dạng số kiểu Việt Nam (tối đa 2 chữ số thập phân) → dùng ở: UnitSizeForm, BusinessCatalog
 *   toNumber: Đổi chuỗi nhập (cho phép dấu phẩy) thành số; rỗng -> NaN → dùng ở: UnitSizeForm
 *   CatalogModal: Khung hộp thoại chung cho các form danh mục → dùng ở: UnitTypeForm, UnitSizeForm
 *   Field: 1 trường form: nhãn, ô nhập, câu lỗi hoặc gợi ý → dùng ở: UnitTypeForm, UnitSizeForm
 *   UnitTypeForm: Modal thêm / sửa loại kho: tên, mô tả, đang dùng → dùng ở: BusinessCatalog
 *   UnitSizeForm: Modal thêm / sửa kích thước: nhóm, rộng, dài, tên hiển thị, đang dùng → dùng ở: BusinessCatalog
 *   sideError: Kiểm tra 1 số đo (là số, 0,5–50 m, tối đa 2 số lẻ) → dùng ở: UnitSizeForm
 *   BusinessCatalog: Màn hình danh mục 2 tab → dùng ở: BusinessOperations.jsx
 *   load: Tải loại kho, kích thước, nhóm kích thước → dùng ở: BusinessCatalog, afterChange
 *   afterChange / runSave: Lưu xong thì đóng form, tải lại, báo kết quả; lỗi thì hiện pop-up → dùng ở: saveType, saveSize, deleteType, deleteSize
 *   saveType / deleteType / saveSize / deleteSize: Thêm, sửa, xóa từng mục → dùng ở: BusinessCatalog
 */
import React, { useEffect, useState } from 'react'
import DataGrid from '../../components/common/DataGrid'
import { UnitTypeChip, getUnitTypeStyle } from '../../features/unit/unitTypes'
import { catalogApi, isMissingEndpoint } from '../../api/catalogApi'
import './BusinessCatalog.css'

/* Giới hạn số đo khi tạo kích thước (khớp backend UnitSizeService). */
const MIN_SIDE = 0.5
const MAX_SIDE = 50

/** Định dạng số kiểu Việt Nam, tối đa 2 chữ số thập phân. */
const fmtNum = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
/** Đổi chuỗi nhập (cho phép dấu phẩy) thành số; rỗng -> NaN. */
const toNumber = value => (String(value).trim() === '' ? NaN : Number(String(value).replace(',', '.')))
/** Gộp khoảng trắng thừa giống backend. */
const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ')

/* ---------- Modal chung ---------- */
/**
 * Khung hộp thoại chung cho các form danh mục: tiêu đề, nội dung, nút Hủy / Lưu; đóng bằng Esc, nút × hoặc bấm ra ngoài.
 */
function CatalogModal({ title, subtitle, children, onClose, onSubmit, submitLabel, saving }) {
  // Gắn phím Esc để đóng hộp thoại khi mở; gỡ khi đóng.
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="bc-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <form className="bc-modal" role="dialog" aria-modal="true" aria-labelledby="bc-modal-title" onSubmit={event => { event.preventDefault(); onSubmit() }} noValidate>
        <div className="bc-modal-head">
          <div>
            <h3 id="bc-modal-title">{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="bc-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="bc-modal-body">{children}</div>
        <div className="bc-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? 'Đang lưu...' : submitLabel}</button>
        </div>
      </form>
    </div>
  )
}

/** 1 trường form: nhãn (dấu * nếu bắt buộc), ô nhập, câu lỗi (ưu tiên) hoặc gợi ý. */
function Field({ label, error, hint, children, required }) {
  return (
    <label className={`bc-field${error ? ' has-error' : ''}`}>
      <span className="bc-field-label">{label}{required && <em aria-hidden="true"> *</em>}</span>
      {children}
      {error ? <span className="bc-field-error" role="alert">{error}</span> : hint ? <span className="bc-field-hint">{hint}</span> : null}
    </label>
  )
}

/* ---------- Form loại kho ---------- */
/**
 * Modal thêm / sửa loại kho: tên (2–100 ký tự, không trùng, không phân biệt hoa thường), mô tả (≤ 255 ký tự), đang dùng.
 * @param {object|null} props.item loại kho đang sửa (null khi thêm mới).
 * @param {Array} props.allTypes mọi loại kho (kiểm tra trùng tên).
 * @param {{units: number}} props.usage số kho đang dùng loại này.
 * @param {Function} props.onSave nhận { typeName, description, isActive }.
 */
function UnitTypeForm({ item, allTypes, usage, onClose, onSave }) {
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [isActive, setIsActive] = useState(item ? item.isActive !== false : true)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const trimmed = normalizeName(name)
  const duplicate = allTypes.find(t => t.unitTypeId !== item?.unitTypeId && normalizeName(t.name).toLowerCase() === trimmed.toLowerCase())
  const errors = {
    name: !trimmed ? 'Vui lòng nhập tên loại kho.'
      : trimmed.length < 2 ? 'Tên loại kho cần ít nhất 2 ký tự.'
        : trimmed.length > 100 ? 'Tên loại kho tối đa 100 ký tự.'
          : duplicate ? `Đã có loại kho "${duplicate.name}".` : '',
    description: description.trim().length > 255 ? `Mô tả tối đa 255 ký tự (đang có ${description.trim().length}).` : ''
  }
  const valid = !errors.name && !errors.description
  const style = getUnitTypeStyle(trimmed)

  // Lưu: bật hiện lỗi, hợp lệ thì gửi dữ liệu lên component cha.
  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      await onSave({ typeName: trimmed, description: description.trim() || null, isActive })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CatalogModal
      title={item ? 'Sửa loại kho' : 'Thêm loại kho'}
      subtitle={item ? `Mã loại #${item.unitTypeId}` : 'Loại kho dùng để phân nhóm kho và đặt bảng giá.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={item ? 'Lưu thay đổi' : 'Thêm loại kho'}
      saving={saving}
    >
      {item && usage.units > 0 && (
        <div className="bc-note warn">Loại kho này đang được <strong>{usage.units} kho</strong> sử dụng. Đổi tên sẽ áp dụng cho tất cả các kho đó.</div>
      )}
      <Field label="Tên loại kho" required error={touched ? errors.name : ''} hint="Ví dụ: Kho lạnh, Indoor Unit (2–100 ký tự)">
        <input value={name} maxLength={120} onChange={e => setName(e.target.value)} onBlur={() => setTouched(true)} autoFocus />
      </Field>
      <Field label="Mô tả" error={errors.description} hint={`${description.trim().length}/255 ký tự`}>
        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ví dụ: Kho điều hòa nhiệt độ, phù hợp đồ điện tử, hồ sơ" />
      </Field>
      <label className="bc-check bc-check-inline">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
        <span>Đang dùng (bỏ chọn để ngừng dùng loại này cho kho mới)</span>
      </label>
      <div className="bc-preview">
        <span>Hiển thị cho khách:</span>
        <UnitTypeChip type={trimmed || 'Kho'} />
        <small>{trimmed ? style.description : 'Nhập tên để xem trước.'}</small>
      </div>
    </CatalogModal>
  )
}

/* ---------- Form kích thước kho ---------- */
/**
 * Kiểm tra 1 số đo: là số, từ 0,5 đến 50 m, tối đa 2 chữ số thập phân. Trả câu lỗi hoặc ''.
 */
function sideError(value, label) {
  const n = toNumber(value)
  if (!Number.isFinite(n)) return `Nhập ${label} (mét).`
  if (n < MIN_SIDE) return `${label[0].toUpperCase()}${label.slice(1)} tối thiểu ${fmtNum(MIN_SIDE)} m.`
  if (n > MAX_SIDE) return `${label[0].toUpperCase()}${label.slice(1)} tối đa ${MAX_SIDE} m.`
  if (Math.round(n * 100) !== n * 100) return 'Tối đa 2 chữ số thập phân.'
  return ''
}

/**
 * Modal thêm / sửa kích thước kho. BOM chọn nhóm, nhập rộng × dài (dài ≥ rộng), tên hiển thị (có thể để trống để
 * hệ thống tự đặt); chiều cao lấy theo nhóm, mã size do hệ thống cấp. Kích thước đang được dùng thì khóa số đo + nhóm.
 * @param {object|null} props.item kích thước đang sửa (null khi thêm mới).
 * @param {Array} props.allSizes mọi kích thước (kiểm tra trùng).
 * @param {Array} props.categories nhóm kích thước đang dùng (GET /api/unit-sizes/categories).
 * @param {{units: number, rates: number, reservations: number}} props.usage mức sử dụng.
 * @param {Function} props.onSave nhận { sizeCategoryId, widthM, lengthM, displayName, isActive }.
 */
function UnitSizeForm({ item, allSizes, categories, usage, onClose, onSave }) {
  const inUse = Boolean(item && (usage.units || usage.rates || usage.reservations))
  const [categoryId, setCategoryId] = useState(item ? String(item.sizeCategoryId || '') : '')
  const [width, setWidth] = useState(item?.widthM != null ? String(item.widthM) : '')
  const [length, setLength] = useState(item?.lengthM != null ? String(item.lengthM) : '')
  const [displayName, setDisplayName] = useState(item?.displayName || '')
  const [isActive, setIsActive] = useState(item ? item.isActive !== false : true)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const category = categories.find(c => String(c.sizeCategoryId) === categoryId)
    // Nhóm của kích thước đang sửa có thể đã ngừng dùng (không có trong danh sách) -> vẫn hiện tên.
    || (item && String(item.sizeCategoryId) === categoryId ? { sizeCategoryId: item.sizeCategoryId, categoryName: item.categoryName, standardHeightM: item.heightM, minAreaM2: null, maxAreaM2: null, codePrefix: item.sizeCode?.[0] } : null)
  const w = toNumber(width)
  const l = toNumber(length)
  const area = Number.isFinite(w) && Number.isFinite(l) ? Math.round(w * l * 100) / 100 : null
  const height = category?.standardHeightM ?? null
  const isVehicle = String(category?.codePrefix || '').toUpperCase() === 'V'
  const defaultName = area ? `${isVehicle ? 'Kho xe' : 'Kho'} ${fmtNum(w).replace(',', '.')} x ${fmtNum(l).replace(',', '.')} m` : ''
  const finalName = normalizeName(displayName) || defaultName
  const others = allSizes.filter(s => s.unitSizeId !== item?.unitSizeId)
  const sameDims = area && height != null && others.find(s =>
    Number(s.heightM) === Number(height) &&
    ((Number(s.widthM) === w && Number(s.lengthM) === l) || (Number(s.widthM) === l && Number(s.lengthM) === w)))
  const sameName = finalName && others.find(s => normalizeName(s.displayName).toLowerCase() === finalName.toLowerCase())
  const dimsChanged = item && (categoryId !== String(item.sizeCategoryId) || w !== Number(item.widthM) || l !== Number(item.lengthM))

  const errors = {
    category: !category ? 'Vui lòng chọn nhóm kích thước.' : '',
    width: sideError(width, 'chiều rộng'),
    length: sideError(length, 'chiều dài'),
    order: '',
    range: '',
    dims: '',
    name: ''
  }
  if (!errors.width && !errors.length && l < w) errors.order = `Chiều dài (${fmtNum(l)} m) phải lớn hơn hoặc bằng chiều rộng (${fmtNum(w)} m). Hãy đổi chỗ 2 số đo.`
  if (!errors.width && !errors.length && !errors.order && category?.minAreaM2 != null && (area < category.minAreaM2 || area > category.maxAreaM2))
    errors.range = `Diện tích ${fmtNum(area)} m² không thuộc nhóm ${category.categoryName} (nhận từ ${fmtNum(category.minAreaM2)} đến ${fmtNum(category.maxAreaM2)} m²). Hãy đổi số đo hoặc chọn nhóm khác.`
  if (!errors.width && !errors.length && sameDims && (!item || dimsChanged)) errors.dims = `Đã có kích thước ${sameDims.sizeCode} "${sameDims.displayName}" cùng số đo.`
  if (normalizeName(displayName).length === 1) errors.name = 'Tên hiển thị cần ít nhất 2 ký tự.'
  else if (finalName.length > 100) errors.name = 'Tên hiển thị tối đa 100 ký tự.'
  else if (sameName) errors.name = `Tên "${finalName}" đã được kích thước ${sameName.sizeCode} dùng.`
  if (inUse) { errors.category = ''; errors.width = ''; errors.length = ''; errors.order = ''; errors.range = ''; errors.dims = '' }
  if (item && !normalizeName(displayName)) errors.name = 'Tên hiển thị không được để trống.'
  const valid = Object.values(errors).every(v => !v)

  // Lưu: bật hiện lỗi, hợp lệ thì gửi dữ liệu lên component cha (đang dùng thì không gửi số đo).
  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      await onSave(inUse
        ? { displayName: normalizeName(displayName), isActive }
        : { sizeCategoryId: Number(categoryId), widthM: w, lengthM: l, displayName: normalizeName(displayName) || null, isActive })
    } finally {
      setSaving(false)
    }
  }

  const blockError = errors.order || errors.range || errors.dims
  return (
    <CatalogModal
      title={item ? `Sửa kích thước ${item.sizeCode}` : 'Thêm kích thước kho'}
      subtitle={item ? `Mã kích thước #${item.unitSizeId}` : 'Mã size (S5, M3...) và chiều cao được hệ thống tự cấp theo nhóm.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={item ? 'Lưu thay đổi' : 'Thêm kích thước'}
      saving={saving}
    >
      {inUse && (
        <div className="bc-note warn">
          Kích thước này đang được dùng ({[usage.units && `${usage.units} kho`, usage.reservations && `${usage.reservations} đơn đặt`, usage.rates && `${usage.rates} mức giá`].filter(Boolean).join(', ')}),
          nên <strong>không đổi được số đo hay nhóm</strong>. Chỉ đổi được tên hiển thị và trạng thái; nếu cần số đo khác, hãy tạo kích thước mới.
        </div>
      )}
      <Field label="Nhóm kích thước" required error={touched ? errors.category : ''}
        hint={category?.minAreaM2 != null ? `Diện tích cho phép: ${fmtNum(category.minAreaM2)}–${fmtNum(category.maxAreaM2)} m², cao ${fmtNum(category.standardHeightM)} m` : 'Nhỏ / Vừa / Lớn / Xe; quyết định chiều cao và chữ đầu mã size'}>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={inUse}>
          <option value="">-- Chọn nhóm --</option>
          {categories.map(c => (
            <option key={c.sizeCategoryId} value={c.sizeCategoryId}>
              {c.categoryName} ({c.codePrefix}) · {fmtNum(c.minAreaM2)}–{fmtNum(c.maxAreaM2)} m²
            </option>
          ))}
          {category && !categories.some(c => String(c.sizeCategoryId) === categoryId) && (
            <option value={categoryId}>{category.categoryName} (đang ngừng dùng)</option>
          )}
        </select>
      </Field>
      <div className="bc-row">
        <Field label="Rộng (m)" required error={touched ? errors.width : ''}>
          <input type="number" inputMode="decimal" min={MIN_SIDE} max={MAX_SIDE} step="0.01" value={width} onChange={e => setWidth(e.target.value)} placeholder="2" disabled={inUse} />
        </Field>
        <span className="bc-times" aria-hidden="true">×</span>
        <Field label="Dài (m)" required error={touched ? errors.length : ''} hint="Dài ≥ rộng">
          <input type="number" inputMode="decimal" min={MIN_SIDE} max={MAX_SIDE} step="0.01" value={length} onChange={e => setLength(e.target.value)} placeholder="4" disabled={inUse} />
        </Field>
      </div>
      {blockError && (touched || area) && <div className="bc-note error" role="alert">{blockError}</div>}
      <Field label="Tên hiển thị" required={Boolean(item)} error={touched || displayName ? errors.name : ''}
        hint={item ? '2–100 ký tự, không trùng' : `Để trống sẽ tự đặt: "${defaultName || 'Kho R x D m'}"`}>
        <input value={displayName} maxLength={110} onChange={e => setDisplayName(e.target.value)} placeholder={defaultName || 'Kho 2 x 4 m'} />
      </Field>
      <label className="bc-check bc-check-inline">
        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
        <span>Đang dùng (bỏ chọn để ngừng dùng kích thước này cho kho mới)</span>
      </label>
      <div className="bc-preview">
        <span>Sẽ lưu là:</span>
        <strong>{item && !(dimsChanged && category && String(item.sizeCategoryId) !== categoryId) ? item.sizeCode : category ? `${category.codePrefix}? (tự cấp)` : '—'}</strong>
        <span>{finalName || '—'}</span>
        {area && height != null && <span className="bc-area">{fmtNum(w)} × {fmtNum(l)} × {fmtNum(height)} m · {fmtNum(area)} m²</span>}
      </div>
    </CatalogModal>
  )
}

/* ---------- Màn hình chính ---------- */
/**
 * Màn hình danh mục: 2 tab (Loại kho / Kích thước kho) bằng DataGrid, nút Thêm / Sửa / Xóa; đếm mức sử dụng để chặn xóa.
 * @param {object} props.operationState dữ liệu vận hành (dự phòng khi không tải được danh mục).
 * @param {object} props.dialog hộp thoại (alert / confirm).
 * @param {Function} [props.onChanged] gọi sau mỗi thay đổi để component cha tải lại dữ liệu.
 */
export default function BusinessCatalog({ operationState, dialog, onChanged }) {
  const [tab, setTab] = useState('types') // 'types' | 'sizes'
  const [types, setTypes] = useState(null)
  const [sizes, setSizes] = useState(null)
  const [categories, setCategories] = useState([])
  const [readOnly, setReadOnly] = useState(false) // true khi không tải được API danh mục
  const [modal, setModal] = useState(null) // { kind: 'type' | 'size', item }

  // Mức sử dụng (backend trả kèm mỗi dòng).
  const usageOfType = item => ({ units: item.unitCount || 0, reservations: item.reservationCount || 0, rates: item.rateCount || 0 })
  const usageOfSize = item => ({ units: item.unitCount || 0, reservations: item.reservationCount || 0, rates: item.rateCount || 0 })
  const isUsed = u => Boolean(u.units || u.reservations || u.rates)
  const usageText = u => [u.units && `${u.units} kho`, u.reservations && `${u.reservations} đơn đặt`, u.rates && `${u.rates} mức giá`].filter(Boolean).join(', ')

  /**
   * Tải loại kho, kích thước, nhóm kích thước; lỗi thì dùng dữ liệu vận hành và chuyển sang chỉ xem.
   * API: GET /api/unit-types + GET /api/unit-sizes + GET /api/unit-sizes/categories
   */
  const load = async () => {
    try {
      const [typeData, sizeData, categoryData] = await Promise.all([catalogApi.listUnitTypes(), catalogApi.listUnitSizes(), catalogApi.listSizeCategories()])
      setTypes(typeData || [])
      setSizes(sizeData || [])
      setCategories(categoryData || [])
      setReadOnly(false)
    } catch (error) {
      setTypes((operationState?.unitTypes || []).map(t => ({ ...t, description: t.description ?? null })))
      setSizes(operationState?.unitSizes || [])
      setReadOnly(true)
      if (!isMissingEndpoint(error)) {
        await dialog.alert({ tone: 'danger', title: 'Không tải được danh mục', message: error.message })
      }
    }
  }

  // Chạy 1 lần khi mở màn hình.
  useEffect(() => { load() }, [])

  // Sau khi lưu: đóng form, tải lại danh mục + dữ liệu cha, báo thành công.
  const afterChange = async message => {
    setModal(null)
    await Promise.all([load(), onChanged?.()])
    if (message) await dialog.alert({ tone: 'success', title: 'Đã lưu', message })
  }

  // Chạy 1 thao tác lưu/xóa; lỗi (kể cả lỗi ràng buộc từ backend) thì hiện pop-up.
  const runSave = async (action, successMessage) => {
    try {
      await action()
      await afterChange(successMessage)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Không lưu được', message: error.message })
    }
  }

  /* ----- Loại kho ----- */
  /** Thêm hoặc sửa loại kho (hỏi xác nhận khi đổi tên loại đang được kho dùng). API: POST / PUT /api/unit-types */
  const saveType = async body => {
    const item = modal?.item
    if (item) {
      const usage = usageOfType(item)
      if (usage.units > 0 && body.typeName !== item.name) {
        const ok = await dialog.confirm({
          tone: 'warning',
          title: `Đổi tên loại kho "${item.name}"?`,
          message: `Tên mới "${body.typeName}" sẽ hiển thị cho ${usage.units} kho đang dùng loại này.`,
          confirmLabel: 'Đổi tên'
        })
        if (!ok) return
      }
      await runSave(() => catalogApi.updateUnitType(item.unitTypeId, body), `Đã cập nhật loại kho "${body.typeName}".`)
    } else {
      await runSave(() => catalogApi.createUnitType(body), `Đã thêm loại kho "${body.typeName}".`)
    }
  }

  /** Xóa loại kho: đang được dùng thì chặn và báo lý do, ngược lại hỏi xác nhận rồi xóa. API: DELETE /api/unit-types/{id} */
  const deleteType = async item => {
    const usage = usageOfType(item)
    if (isUsed(usage)) {
      await dialog.alert({
        tone: 'warning',
        title: `Không thể xóa "${item.name}"`,
        message: `Loại kho đang được dùng bởi ${usageText(usage)}. Có thể sửa và bỏ chọn "Đang dùng" để ngừng dùng loại này.`
      })
      return
    }
    const ok = await dialog.confirm({ tone: 'danger', title: `Xóa loại kho "${item.name}"?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa loại kho' })
    if (!ok) return
    await runSave(() => catalogApi.deleteUnitType(item.unitTypeId), `Đã xóa loại kho "${item.name}".`)
  }

  /* ----- Kích thước ----- */
  /** Thêm hoặc sửa kích thước. API: POST / PUT /api/unit-sizes */
  const saveSize = async body => {
    const item = modal?.item
    if (item) {
      await runSave(() => catalogApi.updateUnitSize(item.unitSizeId, body), `Đã cập nhật kích thước ${item.sizeCode}.`)
    } else {
      let created = null
      await runSave(async () => { created = await catalogApi.createUnitSize(body) }, null)
      if (created) await dialog.alert({ tone: 'success', title: 'Đã lưu', message: `Đã thêm kích thước ${created.sizeCode} "${created.displayName}".` })
    }
  }

  /** Xóa kích thước: đang được dùng thì chặn, ngược lại hỏi xác nhận rồi xóa. API: DELETE /api/unit-sizes/{id} */
  const deleteSize = async item => {
    const usage = usageOfSize(item)
    if (isUsed(usage)) {
      await dialog.alert({ tone: 'warning', title: `Không thể xóa ${item.sizeCode}`, message: `Kích thước đang được dùng bởi ${usageText(usage)}. Có thể sửa và bỏ chọn "Đang dùng" để ngừng dùng kích thước này.` })
      return
    }
    const ok = await dialog.confirm({ tone: 'danger', title: `Xóa kích thước ${item.sizeCode} "${item.displayName}"?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa kích thước' })
    if (!ok) return
    await runSave(() => catalogApi.deleteUnitSize(item.unitSizeId), `Đã xóa kích thước ${item.sizeCode}.`)
  }

  // Cặp nút Sửa / Xóa cho 1 dòng (khóa khi chỉ xem; nút Xóa mờ khi đang được dùng).
  const actionButtons = (onEdit, onDelete, inUse) => (
    <div className="bc-actions">
      <button type="button" className="bc-btn" onClick={onEdit} disabled={readOnly}>Sửa</button>
      <button type="button" className={`bc-btn danger${inUse ? ' muted' : ''}`} onClick={onDelete} disabled={readOnly} title={inUse ? 'Đang được sử dụng, không xóa được' : undefined}>Xóa</button>
    </div>
  )
  const statusPill = active => active !== false ? <span className="dg-pill ok">Đang dùng</span> : <span className="dg-pill warn">Ngừng dùng</span>

  if (!types || !sizes) return <section className="business-panel"><p>Đang tải danh mục...</p></section>

  return (
    <section className="business-panel bc-root">
      <div className="business-panel-header">
        <div>
          <h2>Danh mục kho</h2>
          <p>Loại kho và kích thước kho dùng chung cho mọi cơ sở. Chỉ Business Operations được thêm, sửa, xóa.</p>
        </div>
        <button
          type="button"
          className="dashboard-primary-btn"
          disabled={readOnly}
          onClick={() => setModal({ kind: tab === 'types' ? 'type' : 'size', item: null })}
        >
          + {tab === 'types' ? 'Thêm loại kho' : 'Thêm kích thước'}
        </button>
      </div>

      {readOnly && (
        <div className="bc-note warn" role="status">Không tải được danh mục từ máy chủ nên đang ở <strong>chế độ chỉ xem</strong>. Bấm làm mới để thử lại.</div>
      )}

      <div className="bc-tabs" role="tablist" aria-label="Loại danh mục">
        <button type="button" role="tab" aria-selected={tab === 'types'} className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>Loại kho <em>{types.length}</em></button>
        <button type="button" role="tab" aria-selected={tab === 'sizes'} className={tab === 'sizes' ? 'active' : ''} onClick={() => setTab('sizes')}>Kích thước kho <em>{sizes.length}</em></button>
      </div>

      {tab === 'types' && (
        <DataGrid
          rows={types}
          getRowId={t => t.unitTypeId}
          searchText={t => `${t.name} ${t.description || ''} ${getUnitTypeStyle(t.name).label}`}
          searchPlaceholder="Tìm loại kho..."
          initialSort={{ key: 'unitTypeId', dir: 'asc' }}
          emptyText="Chưa có loại kho nào."
          columns={[
            { key: 'unitTypeId', label: 'Mã', sortValue: t => Number(t.unitTypeId), render: t => <span className="dg-cell-strong">#{t.unitTypeId}</span> },
            { key: 'name', label: 'Tên loại kho', render: t => <><strong>{t.name}</strong><span className="dg-cell-sub"><UnitTypeChip type={t.name} compact /></span></> },
            { key: 'description', label: 'Mô tả', render: t => t.description || <span className="dg-cell-sub">—</span> },
            { key: 'status', label: 'Trạng thái', sortValue: t => (t.isActive !== false ? 0 : 1), render: t => statusPill(t.isActive) },
            { key: 'units', label: 'Số kho', align: 'right', sortValue: t => usageOfType(t).units, render: t => usageOfType(t).units },
            { key: 'rates', label: 'Mức giá', align: 'right', sortValue: t => usageOfType(t).rates, render: t => usageOfType(t).rates },
            { key: 'actions', label: '', sortable: false, render: t => actionButtons(() => setModal({ kind: 'type', item: t }), () => deleteType(t), isUsed(usageOfType(t))) }
          ]}
        />
      )}

      {tab === 'sizes' && (
        <DataGrid
          rows={sizes}
          getRowId={s => s.unitSizeId}
          searchText={s => `${s.sizeCode} ${s.displayName} ${s.categoryName || ''}`}
          searchPlaceholder="Tìm kích thước..."
          initialSort={{ key: 'sizeCode', dir: 'asc' }}
          emptyText="Chưa có kích thước nào."
          columns={[
            { key: 'sizeCode', label: 'Mã size', sortValue: s => `${String(s.sizeCategoryId || 9).padStart(2, '0')}-${String(parseInt(s.sizeCode.slice(1), 10) || 0).padStart(3, '0')}`, render: s => <span className="dg-cell-strong">{s.sizeCode}</span> },
            { key: 'displayName', label: 'Tên hiển thị', render: s => <strong>{s.displayName}</strong> },
            { key: 'category', label: 'Nhóm', sortValue: s => s.sizeCategoryId, render: s => s.categoryName || <span className="dg-cell-sub">—</span> },
            { key: 'dims', label: 'Rộng × Dài × Cao', sortable: false, render: s => s.widthM != null ? `${fmtNum(s.widthM)} × ${fmtNum(s.lengthM)} × ${fmtNum(s.heightM)} m` : '—' },
            { key: 'area', label: 'Diện tích', align: 'right', sortValue: s => Number(s.areaM2 || 0), render: s => s.areaM2 != null ? `${fmtNum(s.areaM2)} m²` : '—' },
            { key: 'status', label: 'Trạng thái', sortValue: s => (s.isActive !== false ? 0 : 1), render: s => statusPill(s.isActive) },
            { key: 'units', label: 'Số kho', align: 'right', sortValue: s => usageOfSize(s).units, render: s => usageOfSize(s).units },
            { key: 'actions', label: '', sortable: false, render: s => actionButtons(() => setModal({ kind: 'size', item: s }), () => deleteSize(s), isUsed(usageOfSize(s))) }
          ]}
        />
      )}

      {modal?.kind === 'type' && (
        <UnitTypeForm item={modal.item} allTypes={types} usage={modal.item ? usageOfType(modal.item) : { units: 0 }} onClose={() => setModal(null)} onSave={saveType} />
      )}
      {modal?.kind === 'size' && (
        <UnitSizeForm item={modal.item} allSizes={sizes} categories={categories} usage={modal.item ? usageOfSize(modal.item) : { units: 0, rates: 0, reservations: 0 }} onClose={() => setModal(null)} onSave={saveSize} />
      )}
    </section>
  )
}
