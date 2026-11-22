/**
 * ======================================================================
 * FILE: src/features/facility/FacilityUnitsMap.jsx  —  BẢN ĐỒ CÁC KHO TRONG 1 CƠ SỞ (LEAFLET)
 * CHỨC NĂNG: Vẽ các kho BÊN TRONG một cơ sở thẳng trên bản đồ thật (Leaflet + OpenStreetMap). Lấy tọa độ cơ sở
 *   (Facility.Latitude/Longitude) làm "Cổng vào", dựng khu nhà kho ngay phía sau (phía bắc) cổng. Mỗi khu kích thước
 *   (S / M / L / xe) là 1 ô màu nhạt; mỗi kho là 1 chấm (đỏ = đã thuê, xanh = còn trống, xám = bảo trì).
 *   Rê chuột xem nhanh thông tin, bấm chấm -> onSelect(unit) (mở xem 3D). Kho không khớp bộ lọc bị làm mờ.
 *   Database chưa có tọa độ từng kho nên vị trí kho trong khu được xếp tự động (minh họa).
 * THÀNH PHẦN CHÍNH:
 *   - layoutUnits(units): tính vị trí (mét) của từng kho và từng khu quanh cổng vào.
 *   - FacilityUnitsMap (default export): component bản đồ.
 *   - BAND_LABELS: export lại từ utils/unitGeometry.
 * DÙNG Ở: features/facility/FacilityFloorPlan.jsx.
 * PHỤ THUỘC: ./FacilityMap (loadLeaflet), utils/unitGeometry, services/storageRules (formatVnd), FacilityUnitsMap.css.
 * API: Không gọi API backend (chỉ tải Leaflet và ô bản đồ OpenStreetMap).
 * LUỒNG: FacilityFloorPlan truyền units + point -> layoutUnits (mét) -> toLatLng đổi ra vĩ độ/kinh độ -> vẽ khu,
 *   chấm kho, ghim "Cổng vào" -> khách bấm chấm -> onSelect(unit) -> FacilityFloorPlan mở Unit3DViewer.
 * ======================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { loadLeaflet } from './FacilityMap'
import { formatVnd } from '../../services/storageRules'
import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'
import './FacilityUnitsMap.css'

/* Màu chấm theo trạng thái kho và màu ô theo khu kích thước. */
const COLORS = { free: '#22a35a', rented: '#e53935', off: '#9aa8b5' }
const ZONE_COLORS = { S: '#4c9be8', M: '#7b61d6', L: '#f08c2e', V: '#5b6b7a' }
const SPACING = { S: 3.2, M: 4.6, L: 6, V: 7.5 } // khoảng cách giữa 2 kho (m)
const ZONE_GAP = 6 // khoảng cách giữa các khu (m)
const SETBACK = 10 // từ cổng vào tới mép khu nhà kho (m)
/**
 * Escape ký tự đặc biệt HTML để chèn vào tooltip bản đồ.
 */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const STATUS_TEXT = { free: 'Còn trống', rented: 'Đã có người thuê', off: 'Đang bảo trì' }

/**
 * Tính bố cục các kho theo khu, đơn vị mét quanh cổng vào (x: hướng đông +, y: hướng bắc +):
 * mỗi khu là lưới gần vuông (số cột = ceil(√(số kho × 1,4)), hơi bè ngang), kho trong khu sắp theo diện tích rồi mã;
 * các khu đặt cạnh nhau theo thứ tự S, M, L, V, căn giữa quanh cổng, cách cổng SETBACK mét về phía bắc.
 * Gán thêm item.x, item.y (tâm chấm kho) cho từng kho.
 * @param {object[]} units danh sách kho.
 * @returns {{zones: object[], building: {x0,x1,y0,y1}}}
 */
export function layoutUnits(units) {
  const groups = new Map()
  units.forEach(unit => {
    const geo = unitGeometry(unit)
    if (!groups.has(geo.band)) groups.set(geo.band, [])
    groups.get(geo.band).push({ unit, geo, status: unitPlanStatus(unit) })
  })
  // Thứ tự của nhóm size theo BAND_ORDER (nhóm lạ xếp cuối).
  const order = band => (BAND_ORDER.includes(band) ? BAND_ORDER.indexOf(band) : 99)
  const zones = [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([band, items]) => {
      items.sort((a, b) => a.geo.area - b.geo.area || String(a.unit.id).localeCompare(String(b.unit.id), 'vi', { numeric: true }))
      const sp = SPACING[band] || 5
      const cols = Math.max(1, Math.ceil(Math.sqrt(items.length * 1.4)))
      const rows = Math.ceil(items.length / cols)
      return { band, items, sp, cols, rows, width: cols * sp, depth: rows * sp }
    })
  const totalWidth = zones.reduce((n, z) => n + z.width, 0) + ZONE_GAP * Math.max(0, zones.length - 1)
  let x = -totalWidth / 2
  const maxDepth = Math.max(0, ...zones.map(z => z.depth))
  zones.forEach(zone => {
    zone.x0 = x
    zone.x1 = x + zone.width
    zone.y0 = SETBACK
    zone.y1 = SETBACK + zone.depth
    zone.items.forEach((item, i) => {
      const c = i % zone.cols
      const r = Math.floor(i / zone.cols)
      item.x = zone.x0 + zone.sp * (c + 0.5)
      item.y = zone.y0 + zone.sp * (r + 0.5)
    })
    x += zone.width + ZONE_GAP
  })
  return { zones, building: { x0: -totalWidth / 2 - 3, x1: totalWidth / 2 + 3, y0: SETBACK - 3, y1: SETBACK + maxDepth + 3 } }
}

/**
 * Component bản đồ các kho trong cơ sở: tạo bản đồ 1 lần, vẽ khu + chấm kho + cổng vào, làm mờ kho không khớp bộ lọc.
 * Trả null nếu cơ sở không có tọa độ hợp lệ. Được gọi bởi FacilityFloorPlan.
 * @param {object} props facility, units, point (tọa độ cơ sở), highlightIds (Set mã kho khớp bộ lọc),
 *   onSelect(unit) (bấm chấm kho), height (px).
 */
export default function FacilityUnitsMap({ facility, units, point, highlightIds = null, onSelect, height = 480 }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef([])
  const markersRef = useRef(new Map())
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  onSelectRef.current = onSelect

  const lat = Number(point?.latitude)
  const lng = Number(point?.longitude)
  // Tính bố cục kho (chỉ tính lại khi danh sách kho đổi).
  const plan = useMemo(() => layoutUnits(units), [units])
  const unitsKey = units.map(u => `${u.id}:${u.status}:${u.available}`).join('|')

  // Tạo bản đồ một lần khi mount (cho phóng to tới mức 21, ảnh tile phóng từ mức 19). Cleanup: xóa bản đồ.
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then(L => {
        if (cancelled || !boxRef.current || mapRef.current) return
        const map = L.map(boxRef.current, { scrollWheelZoom: false, zoomControl: true, maxZoom: 21 })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 21,
          maxNativeZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map)
        mapRef.current = map
        setReady(true)
      })
      .catch(err => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      layersRef.current = []
      markersRef.current.clear()
    }
  }, [])

  // Vẽ khu nhà kho + chấm kho + cổng vào. Chạy khi bản đồ sẵn sàng, tọa độ cơ sở hoặc trạng thái kho đổi;
  // xóa lớp cũ rồi vẽ lại, cuối cùng căn khung nhìn vừa cả khu nhà kho.
  useEffect(() => {
    const map = mapRef.current
    const L = window.L
    if (!ready || !map || !L || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    layersRef.current.forEach(layer => layer.remove())
    layersRef.current = []
    markersRef.current.clear()

    const mPerDegLat = 111320
    const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180)
    // Đổi tọa độ mét (x,y) quanh cổng vào thành [vĩ độ, kinh độ]: 1 độ vĩ ≈ 111.320 m; 1 độ kinh ≈ 111.320 × cos(vĩ độ) m
    // (kinh tuyến hẹp dần về phía cực). Đủ chính xác cho khoảng cách vài chục mét.
    const toLatLng = (x, y) => [lat + y / mPerDegLat, lng + x / mPerDegLng]
    // Thêm 1 lớp (hình chữ nhật/chấm/ghim) lên bản đồ và ghi nhớ để xóa khi vẽ lại.
    const add = layer => { layer.addTo(map); layersRef.current.push(layer); return layer }

    const b = plan.building
    add(L.rectangle([toLatLng(b.x0, b.y0), toLatLng(b.x1, b.y1)], { color: '#073d70', weight: 2, dashArray: '6 4', fillColor: '#ffffff', fillOpacity: 0.55, interactive: false }))

    plan.zones.forEach(zone => {
      const color = ZONE_COLORS[zone.band] || '#5b6b7a'
      add(L.rectangle([toLatLng(zone.x0, zone.y0), toLatLng(zone.x1, zone.y1)], { color, weight: 1.5, fillColor: color, fillOpacity: 0.12, interactive: false }))
        .bindTooltip(`Khu ${esc(zone.band)} · ${zone.items.length} kho`, { permanent: true, direction: 'top', className: 'fum-zone-label', offset: [0, -2] })
      zone.items.forEach(({ unit, geo, status, x, y }) => {
        const marker = add(L.circleMarker(toLatLng(x, y), {
          radius: zone.band === 'S' ? 6 : 8,
          color: '#ffffff',
          weight: 2,
          fillColor: COLORS[status],
          fillOpacity: 0.95,
          className: `fum-dot ${status}`
        }))
        marker.bindTooltip(
          `<strong>${esc(unit.id)}</strong> · ${esc(geo.code)}<br>${esc(formatMeters(geo.width))} × ${esc(formatMeters(geo.length))} · ${esc(geo.area.toLocaleString('vi-VN'))} m²<br>${esc(formatVnd(unit.price))}đ/tháng<br><em>${STATUS_TEXT[status]} · bấm để xem 3D</em>`,
          { direction: 'top', className: 'fum-tip', offset: [0, -6] }
        )
        marker.on('click', () => onSelectRef.current?.(unit))
        markersRef.current.set(String(unit.id), marker)
      })
    })

    // Cổng vào = vị trí thật của cơ sở.
    add(L.marker([lat, lng], {
      icon: L.divIcon({ className: 'fum-gate-wrap', html: '<div class="fum-gate">Cổng vào</div>', iconSize: [76, 26], iconAnchor: [38, 13] }),
      title: `Cổng vào ${facility.name}`,
      alt: `Cổng vào ${facility.name}`
    }))

    map.fitBounds(L.latLngBounds([toLatLng(b.x0 - 4, -4), toLatLng(b.x1 + 4, b.y1 + 4)]), { padding: [24, 24], maxZoom: 20 })
  }, [ready, lat, lng, unitsKey])

  // Làm mờ kho không khớp bộ lọc: chạy khi highlightIds hoặc danh sách kho đổi, chỉ đổi style chấm (không vẽ lại).
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const dim = highlightIds && !highlightIds.has(id)
      marker.setStyle?.({ fillOpacity: dim ? 0.2 : 0.95, opacity: dim ? 0.3 : 1 })
    })
  }, [ready, unitsKey, highlightIds])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  return (
    <div className="fum-wrap" style={{ height }}>
      <div ref={boxRef} className="fum-map" role="region" aria-label={`Bản đồ các kho tại ${facility.name}`} />
      {!ready && !error && <div className="fum-overlay">Đang tải bản đồ...</div>}
      {error && <div className="fum-overlay error">{error}</div>}
    </div>
  )
}

export { BAND_LABELS }
