import React, { useEffect, useRef, useState } from 'react'
import { apiGet } from './api'
import './FacilityMap.css'

/*
 * Bản đồ vị trí các cơ sở lưu trữ (Leaflet + bản đồ OpenStreetMap, miễn phí, không cần API key).
 * - Tọa độ lấy từ GET /api/facility-locations (cột Latitude/Longitude của bảng Facility).
 * - Leaflet được nạp từ CDN khi cần, nên không phải cài thêm package npm.
 * - Mỗi cơ sở là một ghim hiện số kho trống; bấm ghim -> tên, địa chỉ, nút "Xem kho" và "Chỉ đường" (Google Maps).
 */

const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
const DEFAULT_CENTER = [10.7769, 106.7009] // TP. Hồ Chí Minh

let leafletPromise = null
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Không tải được thư viện bản đồ.')))
    script.onerror = () => { leafletPromise = null; reject(new Error('Không tải được bản đồ. Kiểm tra kết nối Internet.')) }
    document.head.appendChild(script)
  })
  return leafletPromise
}

/* Tọa độ các cơ sở (tải 1 lần, dùng chung). */
let locationsPromise = null
export function loadFacilityLocations(force = false) {
  if (!locationsPromise || force) {
    locationsPromise = apiGet('/api/facility-locations')
      .then(list => (Array.isArray(list) ? list : []))
      .catch(error => { locationsPromise = null; throw error })
  }
  return locationsPromise
}

export function useFacilityLocations() {
  const [state, setState] = useState({ loading: true, error: '', locations: [] })
  useEffect(() => {
    let alive = true
    loadFacilityLocations()
      .then(locations => alive && setState({ loading: false, error: '', locations }))
      .catch(error => alive && setState({ loading: false, error: error.message, locations: [] }))
    return () => { alive = false }
  }, [])
  return state
}

export const directionsUrl = point => `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

/*
 * points: [{ id, name, address, latitude, longitude, available, total, phone, hours }]
 * onOpen(point): bấm "Xem kho" trong popup.  selectedId: cơ sở đang chọn (mở popup, bay tới).
 */
export default function FacilityMap({ points, onOpen, selectedId = null, height = 420, single = false }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const onOpenRef = useRef(onOpen)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  onOpenRef.current = onOpen

  const valid = points.filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && p.latitude !== null && p.longitude !== null)
  const key = valid.map(p => `${p.id}:${p.latitude},${p.longitude}:${p.available}`).join('|')
  const pointsRef = useRef(valid)
  pointsRef.current = valid

  // Tạo bản đồ một lần.
  useEffect(() => {
    let cancelled = false
    loadLeaflet()
      .then(L => {
        if (cancelled || !boxRef.current || mapRef.current) return
        const map = L.map(boxRef.current, { scrollWheelZoom: false, zoomControl: true }).setView(DEFAULT_CENTER, 12)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map)
        map.on('popupopen', event => {
          const button = event.popup.getElement()?.querySelector('[data-open-facility]')
          if (button) button.onclick = () => {
            const point = pointsRef.current.find(p => String(p.id) === button.dataset.openFacility)
            if (point) onOpenRef.current?.(point)
          }
        })
        mapRef.current = map
        setReady(true)
      })
      .catch(err => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markersRef.current.clear() }
    }
  }, [])

  // Vẽ lại ghim khi dữ liệu đổi.
  useEffect(() => {
    const map = mapRef.current
    const L = window.L
    if (!ready || !map || !L) return
    markersRef.current.forEach(marker => marker.remove())
    markersRef.current.clear()
    valid.forEach(point => {
      const icon = L.divIcon({
        className: 'fm-pin-wrap',
        html: `<div class="fm-pin${point.available ? '' : ' empty'}"><span>${single ? '' : esc(point.available ?? '')}</span></div>`,
        iconSize: [36, 46],
        iconAnchor: [18, 44],
        popupAnchor: [0, -40]
      })
      const popup = `
        <div class="fm-popup">
          <strong>${esc(point.name)}</strong>
          <p>${esc(point.address)}</p>
          ${point.total != null ? `<p class="fm-popup-units"><b>${esc(point.available)}</b> / ${esc(point.total)} kho còn trống</p>` : ''}
          ${point.hours ? `<p class="fm-popup-muted">Giờ mở cửa: ${esc(point.hours)}</p>` : ''}
          ${point.phone ? `<p class="fm-popup-muted">SĐT: ${esc(point.phone)}</p>` : ''}
          <div class="fm-popup-actions">
            ${single ? '' : `<button type="button" data-open-facility="${esc(point.id)}">Xem kho</button>`}
            <a href="${directionsUrl(point)}" target="_blank" rel="noopener noreferrer">Chỉ đường</a>
          </div>
        </div>`
      const marker = L.marker([Number(point.latitude), Number(point.longitude)], { icon, title: point.name, alt: point.name })
        .addTo(map)
        .bindPopup(popup, { maxWidth: 260 })
      markersRef.current.set(String(point.id), marker)
    })
    if (valid.length === 1) map.setView([Number(valid[0].latitude), Number(valid[0].longitude)], single ? 15 : 14)
    else if (valid.length > 1) map.fitBounds(L.latLngBounds(valid.map(p => [Number(p.latitude), Number(p.longitude)])), { padding: [40, 40], maxZoom: 14 })
    if (single && valid.length === 1) markersRef.current.get(String(valid[0].id))?.openPopup()
  }, [ready, key])

  // Mở popup cơ sở đang chọn.
  useEffect(() => {
    if (!ready || selectedId == null) return
    const marker = markersRef.current.get(String(selectedId))
    if (marker && mapRef.current) {
      mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 14))
      marker.openPopup()
    }
  }, [ready, selectedId, key])

  return (
    <div className="fm-wrap" style={{ height }}>
      <div ref={boxRef} className="fm-map" role="region" aria-label="Bản đồ vị trí các cơ sở" />
      {!ready && !error && <div className="fm-overlay">Đang tải bản đồ...</div>}
      {error && <div className="fm-overlay error">{error}</div>}
      {ready && valid.length === 0 && <div className="fm-overlay">Chưa có tọa độ của cơ sở để hiển thị trên bản đồ.</div>}
    </div>
  )
}
