import React, { useMemo, useState } from 'react'
import { formatVnd } from './storageRules'
import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from './unitGeometry'
import Unit3DViewer from './Unit3DViewer'
import FacilityUnitsMap from './FacilityUnitsMap'
import './FacilityFloorPlan.css'

/*
 * Sơ đồ kho bên trong một cơ sở (trang chi tiết cơ sở).
 * - Chia khu theo nhóm size (Khu S, M, L, xe). Mỗi kho là một chấm: đỏ = đã thuê, xanh = còn trống, xám = bảo trì.
 * - Bấm chấm -> xem kho 3D (Unit3DViewer).
 * - Cơ sở có tọa độ: vẽ các chấm kho NGAY TRÊN BẢN ĐỒ (FacilityUnitsMap), quanh vị trí thật của cơ sở.
 * - Cơ sở chưa có tọa độ: hiện sơ đồ dạng lưới như cũ.
 * Lưu ý: database chưa có tọa độ thật của từng kho, nên vị trí kho được xếp tự động theo khu (minh họa).
 */
export default function FacilityFloorPlan({ facility, units, point = null, highlightIds = null, onOpenDetail, onBook }) {
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)

  const zones = useMemo(() => {
    const map = new Map()
    units.forEach(unit => {
      const geo = unitGeometry(unit)
      if (!map.has(geo.band)) map.set(geo.band, [])
      map.get(geo.band).push({ unit, geo, status: unitPlanStatus(unit) })
    })
    const order = band => (BAND_ORDER.includes(band) ? BAND_ORDER.indexOf(band) : 99)
    return [...map.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([band, items]) => ({
        band,
        items: items.sort((a, b) => a.geo.area - b.geo.area || String(a.unit.id).localeCompare(String(b.unit.id), 'vi', { numeric: true }))
      }))
  }, [units])

  const counts = units.reduce((acc, unit) => {
    acc[unitPlanStatus(unit)] += 1
    return acc
  }, { free: 0, rented: 0, off: 0 })

  if (!units.length) return null
  const hasMap = point && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && point.latitude !== null && point.longitude !== null

  return (
    <section className="fp-plan" aria-labelledby="fp-plan-title">
      <div className="fp-plan-head">
        <div>
          <div className="eyebrow">FLOOR PLAN</div>
          <h2 id="fp-plan-title">{hasMap ? 'Bản đồ kho tại cơ sở' : 'Sơ đồ kho tại cơ sở'}</h2>
          <p>Mỗi chấm là một kho. Bấm vào chấm để xem kho dạng 3D.</p>
        </div>
        <ul className="fp-legend" aria-label="Chú thích">
          <li><span className="fp-dot free" aria-hidden="true" /> Còn trống <b>{counts.free}</b></li>
          <li><span className="fp-dot rented" aria-hidden="true" /> Đã thuê <b>{counts.rented}</b></li>
          {counts.off > 0 && <li><span className="fp-dot off" aria-hidden="true" /> Bảo trì <b>{counts.off}</b></li>}
        </ul>
      </div>

      {hasMap ? (
        <>
          <FacilityUnitsMap facility={facility} units={units} point={point} highlightIds={highlightIds} onSelect={setSelected} />
          <p className="fp-note">Vị trí các kho được xếp theo khu kích thước quanh vị trí thật của cơ sở (minh họa). Phóng to bản đồ để thấy rõ từng chấm.</p>
        </>
      ) : (
      <div className="fp-site">
        <div className="fp-entrance" aria-hidden="true">Cổng vào · Quầy lễ tân</div>
        <div className="fp-zones">
          {zones.map(zone => (
            <div key={zone.band} className={`fp-zone band-${zone.band}`}>
              <div className="fp-zone-head">
                <strong>Khu {zone.band}</strong>
                <span>{BAND_LABELS[zone.band] || 'Nhóm khác'} · {zone.items.length} kho</span>
              </div>
              <div className="fp-zone-floor">
                {zone.items.map(({ unit, geo, status }) => {
                  const dimmed = highlightIds && !highlightIds.has(unit.id)
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      className={`fp-unit ${status}${dimmed ? ' dim' : ''}${selected?.id === unit.id ? ' active' : ''}`}
                      onClick={() => setSelected(unit)}
                      onMouseEnter={() => setHover(unit.id)}
                      onMouseLeave={() => setHover(current => (current === unit.id ? null : current))}
                      onFocus={() => setHover(unit.id)}
                      onBlur={() => setHover(current => (current === unit.id ? null : current))}
                      aria-label={`Kho ${unit.id}, ${geo.width} x ${geo.length} m, ${status === 'free' ? 'còn trống' : status === 'rented' ? 'đã thuê' : 'bảo trì'}, ${formatVnd(unit.price)} đồng mỗi tháng. Bấm để xem 3D.`}
                    >
                      <span className={`fp-dot ${status}`} aria-hidden="true" />
                      <span className="fp-unit-id">{unit.id}</span>
                      {hover === unit.id && (
                        <span className="fp-tip" role="tooltip">
                          <strong>{unit.id}</strong> · {geo.code}
                          <br />{formatMeters(geo.width)} × {formatMeters(geo.length)} · {geo.area.toLocaleString('vi-VN')} m²
                          <br />{formatVnd(unit.price)}đ/tháng
                          <br /><em>{status === 'free' ? 'Còn trống' : status === 'rented' ? 'Đã có người thuê' : 'Đang bảo trì'} · bấm để xem 3D</em>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="fp-note">Sơ đồ minh họa: các kho được xếp theo khu kích thước, vị trí thực tế có thể khác.</p>
      </div>
      )}

      {selected && (
        <Unit3DViewer
          unit={selected}
          facilityName={facility.name}
          onClose={() => setSelected(null)}
          onOpenDetail={onOpenDetail}
          onBook={onBook}
        />
      )}
    </section>
  )
}
