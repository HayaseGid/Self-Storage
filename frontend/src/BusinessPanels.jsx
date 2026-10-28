import React, { useMemo, useState } from 'react'
import { getFacilityDistrict, groupFacilitiesByDistrict } from './districts'
import { UNIT_TYPE_ORDER, UNIT_TYPE_STYLES, UnitTypeChip, getUnitTypeKey, getUnitTypeStyle } from './unitTypes'
import { RESERVATION_STATUS_LABELS, formatVnd } from './storageRules'
import './BusinessPanels.css'

/*
 * Các màn hình của Business Operations Manager, đúng 5 nhóm chức năng:
 *  1. Quản lý danh sách cơ sở toàn hệ thống        -> BusinessFacilitiesByArea
 *  2. Thiết lập chính sách thuê chung               -> BusinessPolicyCenter
 *  3. Quản lý khung giá, phụ phí, phí quá hạn, giảm giá -> BusinessFeesPanel
 *  4. Theo dõi doanh thu, tỷ lệ sử dụng, hiệu suất  -> BusinessPerformance
 *  5. Xem và xuất báo cáo toàn hệ thống             -> BusinessReportsCenter
 */

const money = value => `${formatVnd(value || 0)}đ`
const percent = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0)

function PinIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>
}

function OccupancyBar({ value }) {
  const tone = value >= 85 ? 'high' : value >= 50 ? 'mid' : 'low'
  return (
    <span className="bp-occ" title={`Tỷ lệ sử dụng ${value}%`}>
      <span className="bp-occ-track"><span className={`bp-occ-fill ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></span>
      <em>{value}%</em>
    </span>
  )
}


/* ===================== 1. CƠ SỞ THEO KHU VỰC ===================== */

export function BusinessFacilitiesByArea({ facilities, units, onAdd, onEdit, onUpdateStatus, onDelete }) {
  const [district, setDistrict] = useState('')
  const [query, setQuery] = useState('')

  const withStats = useMemo(() => facilities.map(facility => {
    const own = units.filter(unit => unit.facilityDbId === facility.facilityId)
    const rented = own.filter(unit => unit.status === 'RENTED').length
    const available = own.filter(unit => unit.status === 'AVAILABLE').length
    const typeKeys = UNIT_TYPE_ORDER.filter(key => own.some(unit => getUnitTypeKey(unit.type) === key))
    return {
      ...facility,
      district: getFacilityDistrict({ address: facility.address, name: facility.name }),
      total: own.length,
      rented,
      available,
      occupancy: percent(rented, own.length),
      typeKeys
    }
  }), [facilities, units])

  const groups = groupFacilitiesByDistrict(withStats)
  const keyword = query.trim().toLowerCase()
  const searchResults = keyword
    ? withStats.filter(f => `${f.name} ${f.address} ${f.unitCodePrefix} ${f.manager || ''}`.toLowerCase().includes(keyword))
    : null
  const activeGroup = groups.find(group => group.slug === district)
  const shown = searchResults || activeGroup?.facilities || []

  return (
    <section className="business-panel bp-root">
      <div className="business-panel-header">
        <div>
          <h2>Danh sách cơ sở toàn hệ thống</h2>
          <p>{facilities.length} cơ sở tại {groups.length} khu vực. Chọn một khu vực để xem các cơ sở trong khu vực đó.</p>
        </div>
        <button className="dashboard-primary-btn" type="button" onClick={onAdd}>+ Thêm cơ sở</button>
      </div>

      <div className="bp-search">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm nhanh theo tên cơ sở, địa chỉ, mã chi nhánh, email quản lý..." aria-label="Tìm cơ sở" />
        {query && <button type="button" onClick={() => setQuery('')}>Xóa</button>}
      </div>

      {!searchResults && (
        <div className="bp-area-grid" role="group" aria-label="Chọn khu vực">
          {groups.map(group => {
            const total = group.facilities.reduce((n, f) => n + f.total, 0)
            const rented = group.facilities.reduce((n, f) => n + f.rented, 0)
            const inactive = group.facilities.filter(f => f.status === 'inactive').length
            return (
              <button
                key={group.slug}
                type="button"
                className={`bp-area${district === group.slug ? ' active' : ''}`}
                aria-pressed={district === group.slug}
                onClick={() => setDistrict(district === group.slug ? '' : group.slug)}
              >
                <span className="bp-area-name"><PinIcon /> {group.label}</span>
                <strong>{group.facilities.length} <small>cơ sở</small></strong>
                <span className="bp-area-meta">{total} kho · {percent(rented, total)}% đang thuê{inactive ? ` · ${inactive} tạm ngưng` : ''}</span>
              </button>
            )
          })}
        </div>
      )}

      {(searchResults || activeGroup) ? (
        <>
          <div className="bp-list-head">
            <h3>{searchResults ? `Kết quả tìm “${query.trim()}”` : <><PinIcon /> {activeGroup.label}</>}</h3>
            <span>{shown.length} cơ sở</span>
          </div>
          <div className="bp-facility-grid">
            {shown.map(f => (
              <article key={f.facilityId} className={`bp-facility${f.status === 'inactive' ? ' inactive' : ''}`}>
                <div className="bp-facility-top">
                  <div>
                    <span className="bp-code">{f.unitCodePrefix}</span>
                    <h4>{f.name}</h4>
                    <p>{f.address}</p>
                  </div>
                  <span className={`bp-status ${f.status === 'inactive' ? 'off' : 'on'}`}>{f.status === 'inactive' ? 'Tạm ngưng' : 'Hoạt động'}</span>
                </div>
                <dl className="bp-metrics">
                  <div><dt>Tổng kho</dt><dd>{f.total}</dd></div>
                  <div><dt>Đang thuê</dt><dd>{f.rented}</dd></div>
                  <div><dt>Còn trống</dt><dd>{f.available}</dd></div>
                </dl>
                <OccupancyBar value={f.occupancy} />
                <div className="bp-types">{f.typeKeys.map(key => <UnitTypeChip key={key} type={UNIT_TYPE_STYLES[key].label} compact />)}</div>
                <p className="bp-manager">Quản lý: <strong>{f.manager || '—'}</strong></p>
                <div className="bp-facility-actions">
                  <button type="button" className="bc-btn" onClick={() => onEdit(f)}>Sửa thông tin</button>
                  <button type="button" className="bc-btn" onClick={() => onUpdateStatus(f, f.status === 'inactive' ? 'active' : 'inactive')}>
                    {f.status === 'inactive' ? 'Mở lại' : 'Tạm ngưng'}
                  </button>
                  <button type="button" className="bc-btn danger" onClick={() => onDelete(f)}>Xóa</button>
                </div>
              </article>
            ))}
          </div>
          {shown.length === 0 && <div className="empty-state">Không tìm thấy cơ sở phù hợp.</div>}
        </>
      ) : (
        <div className="bp-hint">Chọn một khu vực ở trên để xem danh sách cơ sở.</div>
      )}
      <p className="bp-footnote">Quản lý từng kho (trạng thái, bảo trì, loại & kích thước kho) do Facility Manager của từng cơ sở thực hiện.</p>
    </section>
  )
}

/* ===================== DOANH THU & HIỆU SUẤT ===================== */

export function BusinessPerformance({ reports, facilities }) {
  const [sortKey, setSortKey] = useState('revenue')
  const rows = (reports?.facilities || []).map(f => ({
    ...f,
    district: getFacilityDistrict(facilities.find(x => x.facilityId === f.facilityId) || { name: f.name })?.label || '—',
    occupancy: Number(f.occupancyRate) || 0,
    revenue: Number(f.receivedRevenue) || 0
  }))
  const sorted = [...rows].sort((a, b) => sortKey === 'name' ? a.name.localeCompare(b.name, 'vi') : (b[sortKey] - a[sortKey]))
  const months = reports?.monthlyRevenue || []
  const maxMonth = Math.max(1, ...months.map(m => Number(m.receivedAmount) || 0))
  const best = [...rows].sort((a, b) => b.occupancy - a.occupancy)[0]
  const low = rows.filter(r => r.totalUnits > 0 && r.occupancy < 50)

  return (
    <div className="bp-root">
      <div className="business-kpi-grid">
        <div className="business-kpi-card"><span className="business-kpi-label">Doanh thu đã ghi nhận</span><div className="business-kpi-value">{money(reports?.totalRevenue)}</div></div>
        <div className="business-kpi-card"><span className="business-kpi-label">Tỷ lệ sử dụng toàn hệ thống</span><div className="business-kpi-value">{reports?.occupancyRate ?? 0}%</div><small>{reports?.handedOverUnits ?? 0} / {reports?.totalUnits ?? 0} kho đang thuê</small></div>
        <div className="business-kpi-card"><span className="business-kpi-label">Cơ sở hiệu suất cao nhất</span><div className="business-kpi-value bp-kpi-text">{best ? best.name : '—'}</div><small>{best ? `${best.occupancy}% sử dụng` : ''}</small></div>
        <div className="business-kpi-card"><span className="business-kpi-label">Cơ sở dưới 50% công suất</span><div className="business-kpi-value">{low.length}</div><small>Cần xem lại giá / khuyến mại</small></div>
      </div>

      <section className="business-panel">
        <div className="business-panel-header"><div><h2>Doanh thu theo tháng</h2><p>Tổng thanh toán hoàn tất (12 tháng gần nhất).</p></div></div>
        {!months.length ? <p className="bp-muted">Chưa có giao dịch thanh toán.</p> : (
          <div className="bp-bars" role="img" aria-label="Biểu đồ doanh thu theo tháng">
            {months.map(m => (
              <div key={`${m.year}-${m.month}`} className="bp-bar">
                <span className="bp-bar-value">{formatVnd(Math.round((Number(m.receivedAmount) || 0) / 1000))}k</span>
                <span className="bp-bar-col" style={{ height: `${Math.max(4, (Number(m.receivedAmount) / maxMonth) * 100)}%` }} title={money(m.receivedAmount)} />
                <span className="bp-bar-label">{m.month}/{String(m.year).slice(2)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="business-panel">
        <div className="business-panel-header">
          <div><h2>Hiệu suất từng cơ sở</h2><p>Tỷ lệ sử dụng = kho đang thuê / tổng kho.</p></div>
          <label className="bp-sort">Sắp xếp
            <select value={sortKey} onChange={e => setSortKey(e.target.value)}>
              <option value="revenue">Doanh thu cao nhất</option>
              <option value="occupancy">Tỷ lệ sử dụng cao nhất</option>
              <option value="totalUnits">Nhiều kho nhất</option>
              <option value="name">Tên cơ sở</option>
            </select>
          </label>
        </div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Cơ sở</th><th>Khu vực</th><th>Tổng kho</th><th>Đang thuê</th><th>Tỷ lệ sử dụng</th><th>Doanh thu</th><th>Đã bàn giao</th></tr></thead><tbody>
          {sorted.map(f => (
            <tr key={f.facilityId}>
              <td><strong>{f.name}</strong></td>
              <td>{f.district}</td>
              <td>{f.totalUnits}</td>
              <td>{f.handedOverUnits}</td>
              <td><OccupancyBar value={f.occupancy} /></td>
              <td>{money(f.revenue)}</td>
              <td>{f.handedOverCount}</td>
            </tr>
          ))}
        </tbody></table></div>
      </section>
    </div>
  )
}

/* ===================== 5. BÁO CÁO + XUẤT FILE ===================== */

/* Xuất CSV có BOM UTF-8 để Excel đọc đúng tiếng Việt. */
export function downloadCsv(filename, headers, rows) {
  const escape = value => {
    const text = value == null ? '' : String(value)
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BusinessReportsCenter({ reports, operationState, facilities }) {
  const [tab, setTab] = useState('facility')
  const units = operationState?.units || []
  const reservations = operationState?.reservations || []
  const today = new Date().toISOString().slice(0, 10)

  const reportsByKey = {
    facility: {
      title: 'Báo cáo theo cơ sở',
      headers: ['Cơ sở', 'Khu vực', 'Tổng kho', 'Đang thuê', 'Tỷ lệ sử dụng (%)', 'Doanh thu (đ)', 'Số lần bàn giao'],
      rows: (reports?.facilities || []).map(f => [
        f.name,
        getFacilityDistrict(facilities.find(x => x.facilityId === f.facilityId) || { name: f.name })?.label || '',
        f.totalUnits, f.handedOverUnits, Number(f.occupancyRate) || 0, Number(f.receivedRevenue) || 0, f.handedOverCount
      ])
    },
    type: {
      title: 'Báo cáo theo loại kho',
      headers: ['Loại kho', 'Tên trong hệ thống', 'Tổng kho', 'Đang thuê', 'Còn trống', 'Tỷ lệ sử dụng (%)', 'Giá thuê trung bình (đ/tháng)'],
      rows: [...new Set(units.map(u => u.type))].map(type => {
        const list = units.filter(u => u.type === type)
        const rented = list.filter(u => u.status === 'RENTED').length
        const available = list.filter(u => u.status === 'AVAILABLE').length
        const avg = list.length ? Math.round(list.reduce((n, u) => n + Number(u.pricePerMonth || 0), 0) / list.length) : 0
        return [getUnitTypeStyle(type).label, type, list.length, rented, available, percent(rented, list.length), avg]
      })
    },
    revenue: {
      title: 'Báo cáo doanh thu theo tháng',
      headers: ['Tháng', 'Năm', 'Doanh thu đã thu (đ)'],
      rows: (reports?.monthlyRevenue || []).map(m => [m.month, m.year, Number(m.receivedAmount) || 0])
    },
    status: {
      title: 'Báo cáo theo trạng thái thuê',
      headers: ['Trạng thái', 'Số đơn', 'Tổng giá trị thuê (đ)', 'Tổng tiền cọc (đ)'],
      rows: Object.entries(reservations.reduce((acc, r) => {
        const key = r.status
        acc[key] = acc[key] || { count: 0, rent: 0, deposit: 0 }
        acc[key].count += 1
        acc[key].rent += Number(r.rentalFee || 0)
        acc[key].deposit += Number(r.deposit || 0)
        return acc
      }, {})).map(([status, v]) => [RESERVATION_STATUS_LABELS[status] || status, v.count, v.rent, v.deposit])
    }
  }
  const current = reportsByKey[tab]
  const moneyCols = new Set(current.headers.map((h, i) => (/\(đ/.test(h) ? i : -1)).filter(i => i >= 0))

  const exportCurrent = () => downloadCsv(`storespace-${tab}-${today}.csv`, current.headers, current.rows)
  const exportAll = () => {
    Object.entries(reportsByKey).forEach(([key, report], index) => {
      setTimeout(() => downloadCsv(`storespace-${key}-${today}.csv`, report.headers, report.rows), index * 300)
    })
  }

  return (
    <section className="business-panel bp-root">
      <div className="business-panel-header">
        <div>
          <h2>Báo cáo toàn hệ thống</h2>
          <p>Xem theo cơ sở, loại kho, doanh thu và trạng thái thuê. Xuất file CSV mở được bằng Excel.</p>
        </div>
        <div className="bp-export">
          <button type="button" className="dashboard-secondary-btn" onClick={exportAll}>Xuất tất cả (4 file)</button>
          <button type="button" className="dashboard-primary-btn" onClick={exportCurrent}>Xuất báo cáo này</button>
        </div>
      </div>
      <div className="bc-tabs" role="tablist" aria-label="Loại báo cáo">
        {[['facility', 'Theo cơ sở'], ['type', 'Theo loại kho'], ['revenue', 'Doanh thu'], ['status', 'Trạng thái thuê']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      <h3 className="bp-report-title">{current.title} <small>· {current.rows.length} dòng · cập nhật {today.split('-').reverse().join('/')}</small></h3>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{current.headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {current.rows.length === 0 && <tr><td colSpan={current.headers.length} className="bp-muted">Chưa có dữ liệu.</td></tr>}
        {current.rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{moneyCols.has(j) ? money(cell) : cell}</td>)}</tr>
        ))}
      </tbody></table></div>
    </section>
  )
}
