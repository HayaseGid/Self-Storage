import React, { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from './api'
import PriceInput from './PriceInput'
import { formatVnd } from './storageRules'
import { formatArea, formatBandPrice } from './priceBands'
import './BusinessPriceBands.css'

/*
 * Business Operations: KHUNG GIÁ theo nhóm kích thước (S / M / L / V ...).
 * BO chỉ đặt khoảng diện tích + khoảng giá thuê/tháng cho mỗi nhóm.
 * Giá cụ thể của từng size (S1, S2...) tại từng cơ sở do Facility Manager tự đặt trong khoảng này.
 */

const money = value => `${formatVnd(value || 0)}đ`
const EMPTY = { code: '', name: '', minArea: '', maxArea: '', minPrice: '', maxPrice: '', recommendedPrice: '', isActive: true }
/* Danh mục kích thước chuẩn theo quy định: Small, Medium, Large, Vehicle */
const STANDARD_GROUPS = [['S', 'Small (nhỏ)'], ['M', 'Medium (vừa)'], ['L', 'Large (lớn)'], ['V', 'Vehicle (xe)']]

export default function BusinessPriceBands({ dialog }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // { mode: 'create' | 'edit', values }
  const [openIssues, setOpenIssues] = useState(null)

  const load = async () => {
    try {
      setError('')
      setData(await apiGet('/api/price-bands'))
    } catch (loadError) {
      setError(loadError.message)
    }
  }
  useEffect(() => { load() }, [])

  const remove = async band => {
    const ok = await dialog.confirm({
      tone: 'danger',
      title: `Xóa khung giá nhóm ${band.code}?`,
      message: band.sizes.length
        ? `Nhóm ${band.code} còn ${band.sizes.length} kích thước nên chưa xóa được.`
        : 'Khung giá sẽ bị xóa. Có thể tạo lại sau.',
      confirmLabel: 'Xóa khung giá'
    })
    if (!ok) return
    try {
      await apiDelete(`/api/price-bands/${band.code}`)
      await load()
    } catch (deleteError) {
      await dialog.alert({ tone: 'warning', title: 'Không xóa được', message: deleteError.message })
    }
  }

  const toggleActive = async band => {
    const next = !band.isActive
    const ok = await dialog.confirm({
      tone: next ? 'info' : 'warning',
      title: next ? `Dùng lại nhóm ${band.code}?` : `Ngừng sử dụng nhóm ${band.code}?`,
      message: next
        ? 'Facility Manager sẽ tạo được kích thước mới thuộc nhóm này.'
        : `Không tạo thêm kích thước mới trong nhóm ${band.code}. ${band.unitCount} kho hiện có vẫn cho thuê bình thường và giá vẫn phải nằm trong khung.`,
      confirmLabel: next ? 'Dùng lại' : 'Ngừng sử dụng'
    })
    if (!ok) return
    try {
      setData(await apiPut(`/api/price-bands/${band.code}`, { ...band, isActive: next }))
    } catch (toggleError) {
      await dialog.alert({ tone: 'warning', title: 'Không cập nhật được', message: toggleError.message })
    }
  }

  if (error && !data) {
    return (
      <section className="business-panel">
        <div className="auth-message error" role="alert">{error}</div>
        <button type="button" className="dashboard-primary-btn" onClick={load}>Thử lại</button>
      </section>
    )
  }
  if (!data) return <section className="business-panel"><p>Đang tải khung giá...</p></section>

  const bands = data.bands || []
  const issueCount = bands.reduce((n, band) => n + band.outOfRange.length, 0)

  return (
    <section className="business-panel pb-root">
      <div className="pb-head">
        <div>
          <h2>Quy chuẩn kích thước & khung giá</h2>
          <p>
            Business Operations đặt danh mục kích thước chuẩn (Small, Medium, Large, Vehicle), <strong>kích thước tối thiểu–tối đa</strong>, <strong>khoảng giá thuê/tháng</strong> và giá khuyến nghị cho mỗi nhóm.
            Facility Manager tự đặt giá cụ thể cho từng size (S1, S2...) tại cơ sở của mình, hệ thống chặn giá nằm ngoài khung.
          </p>
        </div>
        <button type="button" className="dashboard-primary-btn" onClick={() => setEditing({ mode: 'create', values: EMPTY })}>+ Thêm nhóm</button>
      </div>

      <div className="pb-flow">
        <div><span>1</span><strong>Business Operations</strong><small>Ví dụ nhóm Small: 10–20 m², 400.000–800.000đ</small></div>
        <i>→</i>
        <div><span>2</span><strong>Facility Manager</strong><small>Ví dụ: S1 (12 m²) giá 420.000đ</small></div>
        <i>→</i>
        <div><span>3</span><strong>Khách hàng</strong><small>Thấy giá của cơ sở khi tìm kho</small></div>
      </div>

      {issueCount > 0 && (
        <div className="pb-alert">
          ⚠ Có <strong>{issueCount} kho</strong> đang có giá nằm ngoài khung mới. Hệ thống không tự đổi giá; Facility Manager của cơ sở cần cập nhật lại ở mục Bảng giá.
        </div>
      )}
      {data.unassignedSizes?.length > 0 && (
        <div className="pb-alert info">
          Các kích thước chưa thuộc khung giá nào: {data.unassignedSizes.map(size => <code key={size.unitSizeId}>{size.dimensions}</code>)}. Hãy thêm nhóm tương ứng (ví dụ nhóm {data.unassignedSizes[0].code || 'mới'}).
        </div>
      )}

      {bands.length === 0
        ? <div className="pb-empty">Chưa có khung giá nào. Bấm “Thêm nhóm” để tạo nhóm S, M, L...</div>
        : (
          <div className="pb-grid">
            {bands.map(band => {
              const span = Number(band.maxPrice) - Number(band.minPrice) || 1
              const left = band.currentMinPrice != null ? Math.max(0, Math.min(100, (band.currentMinPrice - band.minPrice) / span * 100)) : null
              const right = band.currentMaxPrice != null ? Math.max(0, Math.min(100, (band.currentMaxPrice - band.minPrice) / span * 100)) : null
              return (
                <article key={band.code} className={`pb-card${band.outOfRange.length ? ' warn' : ''}${band.isActive === false ? ' inactive' : ''}`}>
                  <header>
                    <span className="pb-code">{band.code}</span>
                    <div>
                      <h3>{band.name}</h3>
                      <small>{band.sizes.length} kích thước · {band.unitCount} kho</small>
                    </div>
                    <span className={`pb-status${band.isActive === false ? '' : ' on'}`}>{band.isActive === false ? 'Ngừng sử dụng' : 'Đang dùng'}</span>
                  </header>

                  <dl className="pb-ranges">
                    <div><dt>Kích thước</dt><dd>{formatArea(band.minArea)} – {formatArea(band.maxArea)}</dd></div>
                    <div><dt>Giá thuê / tháng</dt><dd>{formatBandPrice(band)}</dd></div>
                    <div className="pb-rec"><dt>Giá khuyến nghị</dt><dd>{band.recommendedPrice != null ? money(band.recommendedPrice) : <span className="pb-muted">Chưa đặt</span>}</dd></div>
                  </dl>

                  <div className="pb-bar" aria-label="Giá đang dùng so với khung">
                    <div className="pb-bar-track">
                      {left != null && <div className="pb-bar-fill" style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }} />}
                    </div>
                    <div className="pb-bar-labels">
                      <span>{money(band.minPrice)}</span>
                      <span>{band.currentMinPrice != null ? `Đang dùng: ${money(band.currentMinPrice)} – ${money(band.currentMaxPrice)}` : 'Chưa có kho'}</span>
                      <span>{money(band.maxPrice)}</span>
                    </div>
                  </div>

                  <div className="pb-sizes">
                    {band.sizes.length
                      ? band.sizes.map(size => (
                        <span key={size.unitSizeId} className={size.areaOutOfRange ? 'bad' : ''} title={size.areaOutOfRange ? 'Diện tích nằm ngoài khung' : ''}>
                          {size.dimensions.split(':')[0]} · {formatArea(size.area)}
                        </span>
                      ))
                      : <em>Chưa có kích thước thuộc nhóm này</em>}
                  </div>

                  {band.outOfRange.length > 0 && (
                    <div className="pb-issues">
                      <button type="button" onClick={() => setOpenIssues(openIssues === band.code ? null : band.code)}>
                        {band.outOfRange.length} kho có giá ngoài khung {openIssues === band.code ? '▲' : '▼'}
                      </button>
                      {openIssues === band.code && (
                        <ul>
                          {band.outOfRange.map(item => (
                            <li key={item.unitNumber}><strong>{item.unitNumber}</strong> · {item.facilityName} · {item.size} · {money(item.price)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <footer>
                    <button type="button" className="dashboard-secondary-btn sm" onClick={() => setEditing({ mode: 'edit', values: { ...band } })}>Sửa khung</button>
                    <button type="button" className="dashboard-secondary-btn sm" onClick={() => toggleActive(band)}>{band.isActive === false ? 'Dùng lại' : 'Ngừng sử dụng'}</button>
                    {band.sizes.length === 0 && <button type="button" className="dashboard-secondary-btn sm danger" onClick={() => remove(band)}>Xóa</button>}
                  </footer>
                </article>
              )
            })}
          </div>
        )}

      {editing && (
        <PriceBandForm
          mode={editing.mode}
          initial={editing.values}
          bands={bands}
          dialog={dialog}
          onClose={() => setEditing(null)}
          onSaved={next => { setData(next); setEditing(null) }}
        />
      )}
    </section>
  )
}

function PriceBandForm({ mode, initial, bands, dialog, onClose, onSaved }) {
  const [values, setValues] = useState(() => ({
    code: initial.code || '',
    name: initial.name || '',
    minArea: initial.minArea === '' ? '' : String(Number(initial.minArea)),
    maxArea: initial.maxArea === '' ? '' : String(Number(initial.maxArea)),
    minPrice: initial.minPrice === '' ? '' : Number(initial.minPrice),
    maxPrice: initial.maxPrice === '' ? '' : Number(initial.maxPrice),
    recommendedPrice: initial.recommendedPrice === '' || initial.recommendedPrice == null ? '' : Number(initial.recommendedPrice),
    isActive: initial.isActive !== false
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }))

  const validate = () => {
    const code = values.code.trim().toUpperCase()
    if (mode === 'create' && !/^[A-Z]{1,3}$/.test(code)) return 'Mã nhóm gồm 1–3 chữ cái, ví dụ S, M, L, XL.'
    if (mode === 'create' && bands.some(band => band.code === code)) return `Nhóm ${code} đã có khung giá.`
    if (!values.name.trim()) return 'Vui lòng nhập tên nhóm.'
    const minArea = Number(String(values.minArea).replace(',', '.'))
    const maxArea = Number(String(values.maxArea).replace(',', '.'))
    if (values.minArea === '' || values.maxArea === '' || Number.isNaN(minArea) || Number.isNaN(maxArea) || minArea < 0 || maxArea <= 0) return 'Nhập khoảng diện tích hợp lệ.'
    if (minArea > maxArea) return 'Diện tích “từ” phải nhỏ hơn hoặc bằng “đến”.'
    if (!values.minPrice || !values.maxPrice) return 'Nhập giá thấp nhất và cao nhất.'
    if (Number(values.minPrice) > Number(values.maxPrice)) return 'Giá thấp nhất không được lớn hơn giá cao nhất.'
    if (values.recommendedPrice !== '' && (Number(values.recommendedPrice) < Number(values.minPrice) || Number(values.recommendedPrice) > Number(values.maxPrice))) return 'Giá khuyến nghị phải nằm trong khoảng giá thấp nhất – cao nhất.'
    return null
  }

  const submit = async event => {
    event.preventDefault()
    const message = validate()
    if (message) return setError(message)
    const payload = {
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      minArea: Number(String(values.minArea).replace(',', '.')),
      maxArea: Number(String(values.maxArea).replace(',', '.')),
      minPrice: Number(values.minPrice),
      maxPrice: Number(values.maxPrice),
      recommendedPrice: values.recommendedPrice === '' ? null : Number(values.recommendedPrice),
      isActive: values.isActive
    }
    if (mode === 'edit') {
      const narrower = payload.minPrice > Number(initial.minPrice) || payload.maxPrice < Number(initial.maxPrice)
      const ok = await dialog.confirm({
        tone: 'warning',
        title: `Lưu khung giá nhóm ${payload.code}?`,
        message: `Diện tích: ${formatArea(payload.minArea)} – ${formatArea(payload.maxArea)}\nGiá: ${formatVnd(payload.minPrice)}đ – ${formatVnd(payload.maxPrice)}đ/tháng` +
          (narrower ? '\n\nKhung mới hẹp hơn: giá đang dùng của các cơ sở KHÔNG tự thay đổi; kho nằm ngoài khung sẽ được đánh dấu để Facility Manager cập nhật.' : ''),
        confirmLabel: 'Lưu khung giá'
      })
      if (!ok) return
    }
    setSaving(true)
    setError('')
    try {
      const next = mode === 'create'
        ? await apiPost('/api/price-bands', payload)
        : await apiPut(`/api/price-bands/${payload.code}`, payload)
      onSaved(next)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form className="pb-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pb-form-title">
        <h3 id="pb-form-title">{mode === 'create' ? 'Thêm nhóm kích thước chuẩn' : `Sửa nhóm ${values.code}`}</h3>
        {mode === 'create' && (
          <div className="pb-presets">
            {STANDARD_GROUPS.filter(([code]) => !bands.some(b => b.code === code)).map(([code, name]) => (
              <button key={code} type="button" onClick={() => setValues(v => ({ ...v, code, name }))}>{code} · {name}</button>
            ))}
          </div>
        )}
        {error && <div className="auth-message error" role="alert">{error}</div>}
        <div className="pb-form-row">
          <label>Mã nhóm
            <input value={values.code} onChange={e => set('code', e.target.value.toUpperCase().slice(0, 3))} disabled={mode === 'edit'} placeholder="S" />
            <small>Size có mã bắt đầu bằng chữ này thuộc nhóm (S1, S2... → S).</small>
          </label>
          <label>Tên nhóm
            <input value={values.name} onChange={e => set('name', e.target.value)} placeholder="Kho nhỏ" maxLength={100} />
          </label>
        </div>
        <fieldset>
          <legend>Kích thước tối thiểu – tối đa (m²)</legend>
          <div className="pb-form-row">
            <label>Từ<input inputMode="decimal" value={values.minArea} onChange={e => set('minArea', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="10" /></label>
            <label>Đến<input inputMode="decimal" value={values.maxArea} onChange={e => set('maxArea', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="20" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Khoảng giá thuê (VNĐ/tháng)</legend>
          <div className="pb-form-row">
            <label>Thấp nhất<PriceInput value={values.minPrice} onChange={n => set('minPrice', n ?? '')} ariaLabel="Giá thấp nhất" placeholder="400.000" /></label>
            <label>Cao nhất<PriceInput value={values.maxPrice} onChange={n => set('maxPrice', n ?? '')} ariaLabel="Giá cao nhất" placeholder="800.000" /></label>
          </div>
          <div className="pb-form-row">
            <label>Giá khuyến nghị (không bắt buộc)<PriceInput value={values.recommendedPrice} onChange={n => set('recommendedPrice', n ?? '')} ariaLabel="Giá khuyến nghị" placeholder="600.000" /></label>
            <label className="pb-active"><input type="checkbox" checked={values.isActive} onChange={e => set('isActive', e.target.checked)} /> Đang sử dụng</label>
          </div>
        </fieldset>
        <div className="pb-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu khung giá'}</button>
        </div>
      </form>
    </div>
  )
}
