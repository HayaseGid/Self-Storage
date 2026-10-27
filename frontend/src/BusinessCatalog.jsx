import React, { useEffect, useMemo, useState } from 'react'
import DataGrid from './DataGrid'
import { SizeMeter, UnitTypeChip, getUnitTypeStyle } from './unitTypes'
import { catalogApi, composeDimensions, isMissingEndpoint, parseDimensions } from './catalogApi'
import './BusinessCatalog.css'

/*
 * Danh mục thiết lập (Facility Manager quản lý): CRUD Loại kho và Kích thước kho.
 * - Chặn xóa khi danh mục đang được kho / đơn / biểu giá sử dụng.
 * - Cảnh báo khi sửa danh mục đang dùng (thay đổi áp dụng cho mọi kho liên quan).
 * - Nếu backend chưa có API danh mục, tự chuyển sang chế độ chỉ xem.
 */

const SIZE_CODE_PATTERN = /^[SMLV]\d{1,2}$/
const fmtArea = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })

function suggestedSizeLetter(area) {
  if (!area) return null
  if (area <= 8) return 'S'
  if (area <= 16) return 'M'
  if (area <= 30) return 'L'
  return 'V'
}

/* ---------- Modal chung ---------- */
function CatalogModal({ title, subtitle, children, onClose, onSubmit, submitLabel, saving }) {
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
function UnitTypeForm({ item, allTypes, usage, onClose, onSave }) {
  const [name, setName] = useState(item?.name || '')
  const [description, setDescription] = useState(item?.description || '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const duplicate = allTypes.some(t => t.unitTypeId !== item?.unitTypeId && t.name.trim().toLowerCase() === trimmed.toLowerCase())
  const errors = {
    name: !trimmed ? 'Vui lòng nhập tên loại kho.'
      : trimmed.length < 2 ? 'Tên loại kho cần ít nhất 2 ký tự.'
        : trimmed.length > 100 ? 'Tên loại kho tối đa 100 ký tự.'
          : duplicate ? 'Đã có loại kho trùng tên.' : '',
    description: description.length > 255 ? `Mô tả tối đa 255 ký tự (đang có ${description.length}).` : ''
  }
  const valid = !errors.name && !errors.description
  const style = getUnitTypeStyle(trimmed)

  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      await onSave({ typeName: trimmed, description: description.trim() || null })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CatalogModal
      title={item ? `Sửa loại kho` : 'Thêm loại kho'}
      subtitle={item ? `Mã loại #${item.unitTypeId}` : 'Loại kho dùng để phân nhóm kho và đặt biểu giá.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={item ? 'Lưu thay đổi' : 'Thêm loại kho'}
      saving={saving}
    >
      {item && usage.units > 0 && (
        <div className="bc-note warn">Loại kho này đang được <strong>{usage.units} kho</strong> sử dụng. Đổi tên sẽ áp dụng cho tất cả các kho đó.</div>
      )}
      <Field label="Tên loại kho" required error={touched ? errors.name : ''} hint="Ví dụ: Kho lạnh, Kho mát, Climate-Control Unit">
        <input value={name} maxLength={120} onChange={e => setName(e.target.value)} onBlur={() => setTouched(true)} autoFocus />
      </Field>
      <Field label="Mô tả" error={errors.description} hint={`${description.length}/255 ký tự`}>
        <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ví dụ: Kho điều hòa nhiệt độ, phù hợp đồ điện tử, hồ sơ" />
      </Field>
      <div className="bc-preview">
        <span>Hiển thị cho khách:</span>
        <UnitTypeChip type={trimmed || 'Kho'} />
        <small>{trimmed ? style.description : 'Nhập tên để xem trước.'}</small>
      </div>
      <p className="bc-field-hint">Icon và màu được chọn tự động theo tên: tên chứa "lạnh/cold" là Kho lạnh, "mát/climate" là Kho mát, "indoor/trong nhà" là Kho trong nhà, "drive/xe" là Kho xe vào tận nơi, "basic/tiêu chuẩn" là Kho tiêu chuẩn.</p>
    </CatalogModal>
  )
}

/* ---------- Form kích thước kho ---------- */
function UnitSizeForm({ item, allSizes, usage, onClose, onSave }) {
  const initial = item ? parseDimensions(item.dimensions, item.volume) : { code: '', length: '', width: '', isLocker: false, lockerNote: '' }
  const [code, setCode] = useState(initial.code)
  const [isLocker, setIsLocker] = useState(initial.isLocker)
  const [length, setLength] = useState(initial.length === '' ? '' : String(initial.length))
  const [width, setWidth] = useState(initial.width === '' ? '' : String(initial.width))
  const [lockerNote, setLockerNote] = useState(initial.lockerNote || '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const codeUpper = code.trim().toUpperCase()
  const l = Number(String(length).replace(',', '.'))
  const w = Number(String(width).replace(',', '.'))
  const area = !isLocker && l > 0 && w > 0 ? Math.round(l * w * 10) / 10 : null
  const dimensions = codeUpper ? composeDimensions({ code: codeUpper, length: l, width: w, isLocker, lockerNote }) : ''
  const others = allSizes.filter(s => s.unitSizeId !== item?.unitSizeId)
  const sameCode = others.find(s => parseDimensions(s.dimensions).code === codeUpper)
  const sameDims = !isLocker && others.find(s => {
    const p = parseDimensions(s.dimensions)
    return !p.isLocker && ((p.length === l && p.width === w) || (p.length === w && p.width === l))
  })
  const dimError = value => {
    const n = Number(String(value).replace(',', '.'))
    if (value === '' || !Number.isFinite(n)) return 'Nhập số mét.'
    if (n < 0.5) return 'Tối thiểu 0,5 m.'
    if (n > 50) return 'Tối đa 50 m.'
    return ''
  }
  const errors = {
    code: !codeUpper ? 'Vui lòng nhập mã size.'
      : !SIZE_CODE_PATTERN.test(codeUpper) ? 'Mã gồm 1 chữ S/M/L/V và 1–2 chữ số, ví dụ S2, M1, L3.'
        : sameCode ? `Mã ${codeUpper} đã được dùng (${sameCode.dimensions}).` : '',
    length: isLocker ? '' : dimError(length),
    width: isLocker ? '' : dimError(width),
    dims: sameDims ? `Đã có kích thước giống hệt: ${sameDims.dimensions}.` : '',
    note: lockerNote.length > 30 ? 'Ghi chú tối đa 30 ký tự.' : ''
  }
  const valid = Object.values(errors).every(v => !v)
  const suggested = suggestedSizeLetter(area)
  const letterMismatch = area && SIZE_CODE_PATTERN.test(codeUpper) && codeUpper[0] !== suggested

  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      await onSave({ dimensions, volume: area })
    } finally {
      setSaving(false)
    }
  }

  return (
    <CatalogModal
      title={item ? 'Sửa kích thước kho' : 'Thêm kích thước kho'}
      subtitle={item ? `Mã kích thước #${item.unitSizeId}` : 'Kích thước được ghép thành dạng "S2: 2x2m" và tự tính diện tích.'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={item ? 'Lưu thay đổi' : 'Thêm kích thước'}
      saving={saving}
    >
      {item && usage.units > 0 && (
        <div className="bc-note warn">Kích thước này đang được <strong>{usage.units} kho</strong> sử dụng. Thay đổi sẽ áp dụng cho tất cả các kho đó.</div>
      )}
      <div className="bc-row">
        <Field label="Mã size" required error={touched ? errors.code : ''} hint="S = nhỏ, M = vừa, L = lớn, V = rất lớn">
          <input value={code} maxLength={3} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onBlur={() => setTouched(true)} placeholder="S2" autoFocus />
        </Field>
        <label className="bc-check">
          <input type="checkbox" checked={isLocker} onChange={e => setIsLocker(e.target.checked)} />
          <span>Tủ locker (không đo dài × rộng)</span>
        </label>
      </div>
      {isLocker ? (
        <Field label="Ghi chú kích thước locker" error={errors.note} hint='Ví dụ: "< 2.5m" (không bắt buộc)'>
          <input value={lockerNote} maxLength={40} onChange={e => setLockerNote(e.target.value)} placeholder="< 2.5m" />
        </Field>
      ) : (
        <div className="bc-row">
          <Field label="Dài (m)" required error={touched ? errors.length : ''}>
            <input type="number" inputMode="decimal" min="0.5" max="50" step="0.1" value={length} onChange={e => setLength(e.target.value)} placeholder="2" />
          </Field>
          <span className="bc-times" aria-hidden="true">×</span>
          <Field label="Rộng (m)" required error={touched ? errors.width : ''}>
            <input type="number" inputMode="decimal" min="0.5" max="50" step="0.1" value={width} onChange={e => setWidth(e.target.value)} placeholder="2" />
          </Field>
        </div>
      )}
      {errors.dims && <div className="bc-note error" role="alert">{errors.dims}</div>}
      <div className="bc-preview">
        <span>Sẽ lưu là:</span>
        <strong>{dimensions || '—'}</strong>
        {area && <span className="bc-area">{fmtArea(area)} m²</span>}
        {dimensions && <SizeMeter size={dimensions} />}
      </div>
      {letterMismatch && (
        <div className="bc-note warn">Diện tích {fmtArea(area)} m² thường thuộc hạng <strong>{suggested}</strong> ({{ S: 'nhỏ, tối đa 8 m²', M: 'vừa, 8–16 m²', L: 'lớn, 16–30 m²', V: 'rất lớn, trên 30 m²' }[suggested]}). Kiểm tra lại mã size.</div>
      )}
    </CatalogModal>
  )
}

/* ---------- Màn hình chính ---------- */
export default function BusinessCatalog({ operationState, dialog, onChanged }) {
  const [tab, setTab] = useState('types')
  const [types, setTypes] = useState(null)
  const [sizes, setSizes] = useState(null)
  const [readOnly, setReadOnly] = useState(false)
  const [modal, setModal] = useState(null) // { kind: 'type' | 'size', item }

  const units = operationState?.units || []
  const reservations = operationState?.reservations || []
  const rates = operationState?.rentalRates || []

  const typeUsage = useMemo(() => {
    const map = new Map()
    const get = id => { if (!map.has(id)) map.set(id, { units: 0, reservations: 0, rates: 0 }); return map.get(id) }
    units.forEach(u => { get(Number(u.unitTypeId)).units++ })
    reservations.forEach(r => { if (r.unitTypeId != null) get(Number(r.unitTypeId)).reservations++ })
    rates.forEach(r => { get(Number(r.unitTypeId)).rates++ })
    return map
  }, [units, reservations, rates])

  const sizeUsage = useMemo(() => {
    const map = new Map()
    const get = id => { if (!map.has(id)) map.set(id, { units: 0, rates: 0 }); return map.get(id) }
    units.forEach(u => { get(Number(u.sizeId ?? u.unitSizeId)).units++ })
    rates.forEach(r => { get(Number(r.unitSizeId)).rates++ })
    return map
  }, [units, rates])

  const usageOfType = item => ({
    units: item.unitCount ?? typeUsage.get(Number(item.unitTypeId))?.units ?? 0,
    reservations: item.reservationCount ?? typeUsage.get(Number(item.unitTypeId))?.reservations ?? 0,
    rates: item.rateCount ?? typeUsage.get(Number(item.unitTypeId))?.rates ?? 0
  })
  const usageOfSize = item => ({
    units: item.unitCount ?? sizeUsage.get(Number(item.unitSizeId))?.units ?? 0,
    rates: item.rateCount ?? sizeUsage.get(Number(item.unitSizeId))?.rates ?? 0
  })

  const load = async () => {
    try {
      const [typeData, sizeData] = await Promise.all([catalogApi.listUnitTypes(), catalogApi.listUnitSizes()])
      setTypes((typeData || []).map(t => ({ ...t, name: t.name ?? t.typeName })))
      setSizes(sizeData || [])
      setReadOnly(false)
    } catch (error) {
      // Backend chưa có API danh mục: hiển thị chỉ xem từ dữ liệu vận hành.
      setTypes((operationState?.unitTypes || []).map(t => ({ ...t, description: t.description ?? null })))
      setSizes(operationState?.unitSizes || [])
      setReadOnly(true)
      if (!isMissingEndpoint(error)) {
        await dialog.alert({ tone: 'danger', title: 'Không tải được danh mục', message: error.message })
      }
    }
  }

  useEffect(() => { load() }, [])

  const afterChange = async message => {
    setModal(null)
    await Promise.all([load(), onChanged?.()])
    if (message) await dialog.alert({ tone: 'success', title: 'Đã lưu', message })
  }

  const runSave = async (action, successMessage) => {
    try {
      await action()
      await afterChange(successMessage)
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Không lưu được', message: error.message })
    }
  }

  /* ----- Loại kho ----- */
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

  const deleteType = async item => {
    const usage = usageOfType(item)
    if (usage.units || usage.reservations || usage.rates) {
      const parts = [usage.units && `${usage.units} kho`, usage.reservations && `${usage.reservations} đơn đặt`, usage.rates && `${usage.rates} mức giá`].filter(Boolean).join(', ')
      await dialog.alert({
        tone: 'warning',
        title: `Không thể xóa "${item.name}"`,
        message: `Loại kho đang được dùng bởi ${parts}. Hãy chuyển các kho sang loại khác và xóa các mức giá liên quan trước.`
      })
      return
    }
    const ok = await dialog.confirm({ tone: 'danger', title: `Xóa loại kho "${item.name}"?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa loại kho' })
    if (!ok) return
    await runSave(() => catalogApi.deleteUnitType(item.unitTypeId), `Đã xóa loại kho "${item.name}".`)
  }

  /* ----- Kích thước ----- */
  const saveSize = async body => {
    const item = modal?.item
    if (item) {
      const usage = usageOfSize(item)
      if (usage.units > 0 && body.dimensions !== item.dimensions) {
        const ok = await dialog.confirm({
          tone: 'warning',
          title: 'Sửa kích thước đang được dùng?',
          message: `"${item.dimensions}" → "${body.dimensions}"\nÁp dụng cho ${usage.units} kho đang dùng kích thước này.`,
          confirmLabel: 'Lưu thay đổi'
        })
        if (!ok) return
      }
      await runSave(() => catalogApi.updateUnitSize(item.unitSizeId, body), `Đã cập nhật kích thước "${body.dimensions}".`)
    } else {
      await runSave(() => catalogApi.createUnitSize(body), `Đã thêm kích thước "${body.dimensions}".`)
    }
  }

  const deleteSize = async item => {
    const usage = usageOfSize(item)
    if (usage.units || usage.rates) {
      const parts = [usage.units && `${usage.units} kho`, usage.rates && `${usage.rates} mức giá`].filter(Boolean).join(', ')
      await dialog.alert({ tone: 'warning', title: `Không thể xóa "${item.dimensions}"`, message: `Kích thước đang được dùng bởi ${parts}.` })
      return
    }
    const ok = await dialog.confirm({ tone: 'danger', title: `Xóa kích thước "${item.dimensions}"?`, message: 'Thao tác này không thể hoàn tác.', confirmLabel: 'Xóa kích thước' })
    if (!ok) return
    await runSave(() => catalogApi.deleteUnitSize(item.unitSizeId), `Đã xóa kích thước "${item.dimensions}".`)
  }

  const actionButtons = (onEdit, onDelete, inUse) => (
    <div className="bc-actions">
      <button type="button" className="bc-btn" onClick={onEdit} disabled={readOnly}>Sửa</button>
      <button type="button" className={`bc-btn danger${inUse ? ' muted' : ''}`} onClick={onDelete} disabled={readOnly} title={inUse ? 'Đang được sử dụng, không xóa được' : undefined}>Xóa</button>
    </div>
  )

  if (!types || !sizes) return <section className="business-panel"><p>Đang tải danh mục...</p></section>

  return (
    <section className="business-panel bc-root">
      <div className="business-panel-header">
        <div>
          <h2>Danh mục thiết lập</h2>
          <p>Quản lý loại kho và kích thước kho dùng chung cho mọi cơ sở.</p>
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
        <div className="bc-note warn" role="status">
          Backend chưa có API danh mục (<code>/api/operations/unit-types</code>, <code>/api/operations/unit-sizes</code>) nên đang ở <strong>chế độ chỉ xem</strong>.
          Thêm file <code>backend/Controllers/CatalogSetupController.cs</code> vào backend để bật thêm / sửa / xóa.
        </div>
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
            { key: 'description', label: 'Mô tả', render: t => t.description || <span className="dg-cell-sub">{readOnly ? '(cần API danh mục để xem)' : '—'}</span> },
            { key: 'units', label: 'Số kho', align: 'right', sortValue: t => usageOfType(t).units, render: t => usageOfType(t).units },
            { key: 'rates', label: 'Mức giá', align: 'right', sortValue: t => usageOfType(t).rates, render: t => usageOfType(t).rates },
            {
              key: 'actions', label: '', sortable: false,
              render: t => {
                const u = usageOfType(t)
                return actionButtons(() => setModal({ kind: 'type', item: t }), () => deleteType(t), u.units || u.reservations || u.rates)
              }
            }
          ]}
        />
      )}

      {tab === 'sizes' && (
        <DataGrid
          rows={sizes}
          getRowId={s => s.unitSizeId}
          searchText={s => s.dimensions}
          searchPlaceholder="Tìm kích thước..."
          initialSort={{ key: 'unitSizeId', dir: 'asc' }}
          emptyText="Chưa có kích thước nào."
          columns={[
            { key: 'unitSizeId', label: 'Mã', sortValue: s => Number(s.unitSizeId), render: s => <span className="dg-cell-strong">#{s.unitSizeId}</span> },
            { key: 'dimensions', label: 'Kích thước', render: s => <strong>{s.dimensions}</strong> },
            {
              key: 'area', label: 'Diện tích', align: 'right',
              sortValue: s => parseDimensions(s.dimensions, s.volume).area,
              render: s => {
                const p = parseDimensions(s.dimensions, s.volume)
                return p.area ? `${fmtArea(p.area)} m²` : <span className="dg-cell-sub">{p.isLocker ? 'Locker' : '—'}</span>
              }
            },
            { key: 'class', label: 'Hạng', sortable: false, render: s => <SizeMeter size={s.dimensions} /> },
            {
              key: 'volume', label: 'Dữ liệu', sortable: false,
              render: s => (s.volume == null && !parseDimensions(s.dimensions).isLocker)
                ? <span className="dg-pill warn" title="Cột Volume trong DB đang trống. Mở Sửa rồi Lưu để hệ thống tự tính diện tích.">Thiếu diện tích</span>
                : <span className="dg-pill ok">Đủ</span>
            },
            { key: 'units', label: 'Số kho', align: 'right', sortValue: s => usageOfSize(s).units, render: s => usageOfSize(s).units },
            {
              key: 'actions', label: '', sortable: false,
              render: s => {
                const u = usageOfSize(s)
                return actionButtons(() => setModal({ kind: 'size', item: s }), () => deleteSize(s), u.units || u.rates)
              }
            }
          ]}
        />
      )}

      {modal?.kind === 'type' && (
        <UnitTypeForm item={modal.item} allTypes={types} usage={modal.item ? usageOfType(modal.item) : { units: 0 }} onClose={() => setModal(null)} onSave={saveType} />
      )}
      {modal?.kind === 'size' && (
        <UnitSizeForm item={modal.item} allSizes={sizes} usage={modal.item ? usageOfSize(modal.item) : { units: 0 }} onClose={() => setModal(null)} onSave={saveSize} />
      )}
    </section>
  )
}
