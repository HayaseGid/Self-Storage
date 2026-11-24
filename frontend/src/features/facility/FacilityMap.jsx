/**
 * ======================================================================
 * FILE: src/features/facility/FacilityMap.jsx  —  BẢN ĐỒ CÁC CƠ SỞ (LEAFLET)
 * CHỨC NĂNG: Hiển thị bản đồ vị trí các cơ sở lưu trữ bằng Leaflet + bản đồ OpenStreetMap (miễn phí, không cần
 *   API key). Leaflet được nạp từ CDN khi cần nên không phải cài package npm. Mỗi cơ sở là 1 ghim hiện số kho trống;
 *   bấm ghim -> popup tên, địa chỉ, số kho trống, giờ mở cửa, SĐT, nút "Xem kho" và link "Chỉ đường" (Google Maps).
 *   Tọa độ lấy từ API (cột Latitude/Longitude của bảng Facility, FacilityLocationsController ở backend).
 * THÀNH PHẦN CHÍNH:
 *   - loadLeaflet(): nạp Leaflet (CSS + JS) 1 lần.
 *   - loadFacilityLocations(force), useFacilityLocations(): tải tọa độ cơ sở (cache 1 lần) / hook kèm loading, error.
 *   - directionsUrl(point): link chỉ đường Google Maps.
 *   - FacilityMap (default export): component bản đồ.
 * DÙNG Ở: src/App.jsx (trang chủ / danh sách cơ sở, trang chi tiết cơ sở).
 * PHỤ THUỘC: react, api/api (apiGet), FacilityMap.css, Leaflet 1.9.4 từ https://unpkg.com (window.L), tile OpenStreetMap.
 * API: GET /api/facility-locations -> [{ id, name, address, latitude, longitude, ... }].
 * LUỒNG: App gọi useFacilityLocations -> GET /api/facility-locations -> ghép với danh sách cơ sở thành points
 *   -> <FacilityMap points onOpen selectedId> -> loadLeaflet -> tạo bản đồ -> vẽ ghim -> khách bấm "Xem kho" trong popup
 *   -> onOpen(point) -> App mở trang chi tiết cơ sở.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   loadLeaflet: Nạp thư viện bản đồ Leaflet (CSS + JS) từ CDN một lần duy nhất, trả về window.L → dùng ở: FacilityMap; FacilityUnitsMap.jsx (FacilityUnitsMap), LocationPicker.jsx (LocationPicker)
 *   loadFacilityLocations: Tải tọa độ các cơ sở (gọi 1 lần, dùng chung kết quả cho mọi nơi) → dùng ở: useFacilityLocations
 *   invalidateFacilityLocations: Xóa cache tọa độ: gọi sau khi BOM tạo / sửa / xóa cơ sở để mọi bản đồ tải lại vị trí mới ở lần hiển thị kế tiếp → dùng ở: BusinessOperations.jsx (updateFacility, deleteFacility +1)
 *   useFacilityLocations: Hook React: lấy danh sách tọa độ cơ sở kèm trạng thái loading/error → dùng ở: App.jsx (FacilitiesMapSection, FacilityLocationCard +2)
 *   directionsUrl: Tạo link Google Maps chỉ đường tới tọa độ của cơ sở (dùng trong popup bản đồ và trang chi tiết cơ sở ở App.jsx) → dùng ở: App.jsx (FacilityLocationCard)
 *   esc: Escape ký tự đặc biệt HTML để chèn vào nội dung popup của bản đồ → dùng ở: FacilityMap
 *   FacilityMap: Component bản đồ các cơ sở: tạo bản đồ 1 lần, vẽ lại ghim khi dữ liệu đổi, bay tới cơ sở đang chọn → dùng ở: App.jsx (FacilitiesMapSection, FacilityLocationCard)
 */
import React, { useEffect, useRef, useState } from 'react'
import { apiGet } from '../../api/api'
import './FacilityMap.css'

/* Phiên bản và địa chỉ CDN của Leaflet; tâm bản đồ mặc định khi chưa có ghim nào. */
const LEAFLET_VERSION = '1.9.4'
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`
const DEFAULT_CENTER = [10.7769, 106.7009] // TP. Hồ Chí Minh

let leafletPromise = null
/**
 * Nạp thư viện bản đồ Leaflet (CSS + JS) từ CDN một lần duy nhất, trả về window.L.
 * Chèn <link> CSS (nếu chưa có) và <script> vào <head>; lỗi thì xóa Promise để lần sau thử lại.
 * Được gọi bởi FacilityMap khi tạo bản đồ.
 * @returns {Promise<object>}
 */
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

let locationsPromise = null // Promise tọa độ các cơ sở (dùng chung giữa các bản đồ)
let locationsLoadedAt = 0 // lúc bắt đầu tải lần gần nhất
const LOCATIONS_TTL_MS = 30000 // dùng lại kết quả tối đa 30 giây rồi tải lại
/**
 * Tải tọa độ các cơ sở (gọi 1 lần, dùng chung kết quả cho mọi nơi). Lỗi thì xóa cache để lần sau gọi lại.
 * API: GET /api/facility-locations  -> [{ id, name, address, latitude, longitude, ... }]
 * @param {boolean} force true để tải lại.
 * @returns {Promise<object[]>}
 */
export function loadFacilityLocations(force = false) {
  // Cache chỉ dùng trong LOCATIONS_TTL_MS: quá hạn (vd BOM vừa sửa vị trí cơ sở) thì tải lại để bản đồ không giữ tọa độ cũ.
  if (!locationsPromise || force || Date.now() - locationsLoadedAt > LOCATIONS_TTL_MS) {
    locationsLoadedAt = Date.now()
    locationsPromise = apiGet('/api/facility-locations')
      .then(list => (Array.isArray(list) ? list : []))
      .catch(error => { locationsPromise = null; throw error })
  }
  return locationsPromise
}

/**
 * Xóa cache tọa độ: gọi sau khi BOM tạo / sửa / xóa cơ sở để mọi bản đồ tải lại vị trí mới ở lần hiển thị kế tiếp.
 * Được gọi bởi: pages/business/BusinessOperations.jsx.
 */
export function invalidateFacilityLocations() {
  locationsPromise = null
}

/**
 * Hook React: lấy danh sách tọa độ cơ sở kèm trạng thái loading/error (gọi loadFacilityLocations khi mount;
 * cờ alive tránh setState sau khi component đã gỡ). API: GET /api/facility-locations. Được gọi bởi App.jsx.
 * @returns {{loading:boolean, error:string, locations:object[]}}
 */
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

/**
 * Tạo link Google Maps chỉ đường tới tọa độ của cơ sở (dùng trong popup bản đồ và trang chi tiết cơ sở ở App.jsx).
 * @param {{latitude:number, longitude:number}} point @returns {string}
 */
export const directionsUrl = point => `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`

/**
 * Escape ký tự đặc biệt HTML để chèn vào nội dung popup của bản đồ (popup Leaflet là chuỗi HTML,
 * nên phải escape tên / địa chỉ để tránh chèn mã độc - XSS).
 */
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])

/**
 * Component bản đồ các cơ sở: tạo bản đồ 1 lần, vẽ lại ghim khi dữ liệu đổi, bay tới cơ sở đang chọn.
 * Bỏ qua cơ sở không có tọa độ hợp lệ. Được gọi bởi App.jsx.
 * @param {object} props points ([{ id, name, address, latitude, longitude, available, total, phone, hours }]),
 *   onOpen(point) (bấm "Xem kho" trong popup), selectedId (cơ sở đang chọn), height, single (chỉ 1 cơ sở).
 */
export default function FacilityMap({ points, onOpen, selectedId = null, height = 420, single = false }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const onOpenRef = useRef(onOpen)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  onOpenRef.current = onOpen

  // Chỉ giữ cơ sở có vĩ độ / kinh độ là số; key = chuỗi tóm tắt để biết khi nào cần vẽ lại ghim.
  const valid = points.filter(p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && p.latitude !== null && p.longitude !== null)
  const key = valid.map(p => `${p.id}:${p.latitude},${p.longitude}:${p.available}`).join('|')
  const pointsRef = useRef(valid)
  pointsRef.current = valid

  // Tạo bản đồ một lần khi mount: nạp Leaflet, thêm lớp tile OpenStreetMap, gắn xử lý nút "Xem kho" mỗi khi popup mở.
  // Cleanup khi gỡ component: xóa bản đồ.
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

  // Vẽ lại ghim khi bản đồ sẵn sàng hoặc dữ liệu đổi (key): xóa ghim cũ, tạo ghim + popup mới, rồi căn khung nhìn
  // (1 cơ sở: phóng tới; nhiều cơ sở: fitBounds vừa tất cả). Chế độ single: tự mở popup.
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

  // Khi selectedId đổi (vd khách bấm 1 cơ sở trong danh sách bên cạnh): di chuyển tới ghim đó và mở popup.
  useEffect(() => {
    if (!ready || selectedId == null) return
    const marker = markersRef.current.get(String(selectedId))
    if (marker && mapRef.current) {
      mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 14))
      marker.openPopup()
    }
  }, [ready, selectedId, key])

  // Khung bản đồ các cơ sở
  return (
    <div className="fm-wrap" style={{ height }}>
      <div ref={boxRef} className="fm-map" role="region" aria-label="Bản đồ vị trí các cơ sở" />
      {!ready && !error && <div className="fm-overlay">Đang tải bản đồ...</div>}
      {error && <div className="fm-overlay error">{error}</div>}
      {ready && valid.length === 0 && <div className="fm-overlay">Chưa có tọa độ của cơ sở để hiển thị trên bản đồ.</div>}
    </div>
  )
}
