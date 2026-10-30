import React, { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost, apiPut } from './api'
import PriceInput from './PriceInput'
import { formatVnd } from './storageRules'
import { formatArea, formatBandPrice } from './priceBands'
import { bandHints, validateBand } from './priceBandRules'
import './BusinessPriceBands.css'

/*
 * Business Operations: KHUNG GIÁ theo nhóm kích thước (S / M / L / V ...).
 * BO chỉ đặt khoảng diện tích + khoảng giá thuê/tháng cho mỗi nhóm.
 * Giá cụ thể của từng size (S1, S2...) tại từng cơ sở do Facility Manager tự đặt trong khoảng này.
 *
 * KHÓA CHẶT (priceBandRules.js + backend /api/price-band-rules):
 *  - diện tích các nhóm không chồng nhau; nhóm lớn hơn phải có giá sàn & giá trần cao hơn nhóm nhỏ hơn;
 *  - nhóm đang có kho được đặt / đang thuê: khóa khung, không ngừng sử dụng, không xóa (chỉ đổi tên);
 *  - nhóm đã có size: khung mới phải chứa hết diện tích size và giá đang áp dụng (không tự ép giá cơ sở).
 */

const money = value => `${formatVnd(value || 0)}đ`
const EMPTY = { code: '', name: '', minArea: '', maxArea: '', minPrice: '', maxPrice: '', isActive: true }
/* Danh mục kích thước chuẩn theo quy định: Small, Medium, Large, Vehicle */
const STANDARD_GROUPS = [['S', 'Small (nhỏ)'], ['M', 'Medium (vừa)'], ['L', 'Large (lớn)'], ['V', 'Vehicle (xe)']]

export default function BusinessPriceBands({ dialog }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // { mode: 'create' | 'edit', values }
  const [openIssues, setOpenIssues] = useState(null)
  const [rules, setRules] = useState(null) // { rules: [...], bands: [...] } từ /api/price-band-rules
  const [rulesError, setRulesError] = useState('')

  const load = async () => {
    try {
      setError('')
      const [bandsData, rulesData] = await Promise.all([
        apiGet('/api/price-bands'),
        apiGet('/api/price-band-rules').catch(rulesLoadError => ({ __error: rulesLoadError }))
      ])
      setData(bandsData)
      if (rulesData?.__error) {
        setRules(null)
        setRulesError(rulesData.__error.status === 404
          ? 'Backend chưa có kiểm tra khung giá (PriceBandRulesController.cs). Hãy chép file vào backend/Controllers và chạy lại backend. Tạm khóa chỉnh sửa để tránh sai dữ liệu.'
          : `Không tải được điều kiện khóa khung giá: ${rulesData.__error.message}. Tạm khóa chỉnh sửa.`)
      } else {
        setRules(rulesData)
        setRulesError('')
      }
    } catch (loadError) {
      setError(loadError.message)
    }
  }
  const ruleBands = rules?.bands || []
  const ruleOf = code => ruleBands.find(rule => rule.code === code) || null
  const canEdit = Boolean(rules)
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
      await apiDelete(`/api/price-band-rules/${band.code}`)
      await load()
    } catch (deleteError) {
      await dialog.alert({ tone: 'warning', title: 'Không xóa được', message: deleteError.message })
    }
  }

  const toggleActive = async band => {
    const next = !band.isActive
    const rule = ruleOf(band.code)
    const problems = validateBand({ code: band.code, minArea: Number(band.minArea), maxArea: Number(band.maxArea), minPrice: Number(band.minPrice), maxPrice: Number(band.maxPrice), isActive: next }, ruleBands, rule)
    if (problems.length) {
      await dialog.alert({ tone: 'warning', title: next ? `Chưa dùng lại được nhóm ${band.code}` : `Không ngừng sử dụng được nhóm ${band.code}`, message: problems.join('\n') })
      return
    }
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
      await apiPut(`/api/price-band-rules/${band.code}`, { ...band, isActive: next })
      await load()
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
        <button type="button" className="dashboard-primary-btn" disabled={!canEdit} onClick={() => setEditing({ mode: 'create', values: EMPTY })}>+ Thêm nhóm</button>
      </div>

      <div className="pb-flow">
        <div><span>1</span><strong>Business Operations</strong><small>Ví dụ nhóm Small: 10–20 m², 400.000–800.000đ</small></div>
        <i>→</i>
        <div><span>2</span><strong>Facility Manager</strong><small>Ví dụ: S1 (12 m²) giá 420.000đ</small></div>
        <i>→</i>
        <div><span>3</span><strong>Khách hàng</strong><small>Thấy giá của cơ sở khi tìm kho</small></div>
      </div>

      {rulesError && <div className="pb-alert" role="alert">⚠ {rulesError}</div>}
      {rules && (
        <details className="pb-rules">
          <summary>Quy tắc khóa khung giá (để số liệu luôn nhất quán)</summary>
          <ul>{rules.rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
        </details>
      )}

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
              const rule = ruleOf(band.code)
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
                    <span className={`pb-status${band.isActive === false ? '' : ' on'}`}>{band.isActive === false ? 'Deactive' : 'Active'}</span>
                  </header>

                  {rule?.locked && (
                    <div className="pb-lock" title={rule.lockReason}>
                      🔒 Đang khóa khung · {rule.bookedUnitCount} kho đang được đặt / đang thuê
                    </div>
                  )}

                  <dl className="pb-ranges">
                    <div><dt>Kích thước</dt><dd>{formatArea(band.minArea)} – {formatArea(band.maxArea)}</dd></div>
                    <div><dt>Giá thuê / tháng</dt><dd>{formatBandPrice(band)}</dd></div>
                    <div className="pb-rec"><dt>Giá khuyến nghị (giữa khung)</dt><dd>{band.recommendedPrice != null ? money(band.recommendedPrice) : <span className="pb-muted">Chưa đặt</span>}</dd></div>
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
                    <button type="button" className="dashboard-secondary-btn sm" disabled={!canEdit} onClick={() => setEditing({ mode: 'edit', values: { ...band } })}>{rule?.locked ? 'Đổi tên' : 'Sửa khung'}</button>
                    <button
                      type="button"
                      className="dashboard-secondary-btn sm"
                      disabled={!canEdit || (band.isActive !== false && rule?.locked)}
                      title={band.isActive !== false && rule?.locked ? rule.lockReason : ''}
                      onClick={() => toggleActive(band)}
                    >
                      {band.isActive === false ? 'Dùng lại' : 'Ngừng sử dụng'}
                    </button>
                    {band.sizes.length === 0 && <button type="button" className="dashboard-secondary-btn sm danger" disabled={!canEdit} onClick={() => remove(band)}>Xóa</button>}
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
          ruleBands={ruleBands}
          dialog={dialog}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load() }}
        />
      )}
    </section>
  )
}

function PriceBandForm({ mode, initial, bands, ruleBands, dialog, onClose, onSaved }) {
  const current = mode === 'edit' ? ruleBands.find(rule => rule.code === initial.code) || null : null
  const locked = Boolean(current?.locked)
  const [values, setValues] = useState(() => ({
    code: initial.code || '',
    name: initial.name || '',
    minArea: initial.minArea === '' ? '' : String(Number(initial.minArea)),
    maxArea: initial.maxArea === '' ? '' : String(Number(initial.maxArea)),
    minPrice: initial.minPrice === '' ? '' : Number(initial.minPrice),
    maxPrice: initial.maxPrice === '' ? '' : Number(initial.maxPrice),
    isActive: initial.isActive !== false
  }))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const set = (key, value) => { setTouched(true); setValues(current => ({ ...current, [key]: value })) }
  const num = value => Number(String(value).replace(',', '.'))

  const candidate = {
    code: values.code.trim().toUpperCase(),
    minArea: values.minArea === '' ? NaN : num(values.minArea),
    maxArea: values.maxArea === '' ? NaN : num(values.maxArea),
    minPrice: values.minPrice === '' ? NaN : Number(values.minPrice),
    maxPrice: values.maxPrice === '' ? NaN : Number(values.maxPrice),
    isActive: values.isActive
  }
  const problems = [
    ...(!values.name.trim() ? ['Vui lòng nhập tên nhóm.'] : []),
    ...validateBand(candidate, ruleBands, current)
  ]
  const hints = bandHints(candidate, ruleBands, current)

  const submit = async event => {
    event.preventDefault()
    setTouched(true)
    if (problems.length) return setError(problems[0])
    const payload = {
      code: candidate.code,
      name: values.name.trim(),
      minArea: candidate.minArea,
      maxArea: candidate.maxArea,
      minPrice: candidate.minPrice,
      maxPrice: candidate.maxPrice,
      isActive: values.isActive
    }
    if (mode === 'edit') {
      const ok = await dialog.confirm({
        tone: 'warning',
        title: `Lưu nhóm ${payload.code}?`,
        message: `Tên: ${payload.name}\nDiện tích: ${formatArea(payload.minArea)} – ${formatArea(payload.maxArea)}\nGiá: ${formatVnd(payload.minPrice)}đ – ${formatVnd(payload.maxPrice)}đ/tháng\n\nKhung mới đã được kiểm tra: không chồng nhóm khác, chứa hết size và giá đang áp dụng.`,
        confirmLabel: 'Lưu'
      })
      if (!ok) return
    }
    setSaving(true)
    setError('')
    try {
      if (mode === 'create') await apiPost('/api/price-band-rules', payload)
      else await apiPut(`/api/price-band-rules/${payload.code}`, payload)
      await onSaved()
    } catch (saveError) {
      setError(saveError.data?.errors?.join('\n') || saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pb-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form className="pb-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="pb-form-title">
        <h3 id="pb-form-title">{mode === 'create' ? 'Thêm nhóm kích thước chuẩn' : locked ? `Đổi tên nhóm ${values.code}` : `Sửa nhóm ${values.code}`}</h3>
        {mode === 'create' && (
          <div className="pb-presets">
            {STANDARD_GROUPS.filter(([code]) => !bands.some(b => b.code === code)).map(([code, name]) => (
              <button key={code} type="button" onClick={() => { setTouched(true); setValues(v => ({ ...v, code, name })) }}>{code} · {name}</button>
            ))}
          </div>
        )}
        {locked && <div className="pb-lock big">🔒 {current.lockReason} Chỉ được đổi tên nhóm.</div>}
        {error && <div className="auth-message error pb-error" role="alert">{error}</div>}
        <div className="pb-form-row">
          <label>Mã nhóm
            <input value={values.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))} disabled={mode === 'edit'} placeholder="S" />
            <small>Size có mã bắt đầu bằng chữ này thuộc nhóm (S1, S2... → S).</small>
          </label>
          <label>Tên nhóm
            <input value={values.name} onChange={e => set('name', e.target.value)} placeholder="Kho nhỏ" maxLength={50} />
          </label>
        </div>
        <fieldset disabled={locked}>
          <legend>Diện tích tối thiểu – tối đa (m²)</legend>
          <div className="pb-form-row">
            <label>Từ<input inputMode="decimal" value={values.minArea} onChange={e => set('minArea', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="10" /></label>
            <label>Đến<input inputMode="decimal" value={values.maxArea} onChange={e => set('maxArea', e.target.value.replace(/[^\d.,]/g, ''))} placeholder="20" /></label>
          </div>
        </fieldset>
        <fieldset disabled={locked}>
          <legend>Khoảng giá thuê (VNĐ/tháng)</legend>
          <div className="pb-form-row">
            <label>Thấp nhất<PriceInput value={values.minPrice} onChange={n => set('minPrice', n ?? '')} ariaLabel="Giá thấp nhất" placeholder="400.000" disabled={locked} /></label>
            <label>Cao nhất<PriceInput value={values.maxPrice} onChange={n => set('maxPrice', n ?? '')} ariaLabel="Giá cao nhất" placeholder="800.000" disabled={locked} /></label>
          </div>
          <label className="pb-active">
            <input type="checkbox" checked={values.isActive} onChange={e => set('isActive', e.target.checked)} disabled={locked && values.isActive} /> Active (Facility Manager được tạo size thuộc nhóm này)
          </label>
        </fieldset>
        {hints.length > 0 && (
          <ul className="pb-hints">{hints.map(hint => <li key={hint}>{hint}</li>)}</ul>
        )}
        {touched && problems.length > 0 && (
          <ul className="pb-problems" aria-live="polite">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>
        )}
        <div className="pb-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose} disabled={saving}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving || (touched && problems.length > 0)}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
        </div>
      </form>
    </div>
  )
}
