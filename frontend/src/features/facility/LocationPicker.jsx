/**
 * ======================================================================
 * FILE: src/features/facility/LocationPicker.jsx  —  CHỌN VỊ TRÍ CƠ SỞ TRÊN BẢN ĐỒ
 * CHỨC NĂNG: Khung bản đồ (Leaflet + OpenStreetMap) cho Business Operations chọn vị trí chính xác của cơ sở
 *   để cơ sở hiện ghim trên bản đồ của khách:
 *   - Bấm vào bản đồ để đặt ghim, kéo ghim để chỉnh.
 *   - Nút "Tìm theo địa chỉ": tra tọa độ từ ô địa chỉ (dịch vụ Nominatim của OpenStreetMap) rồi đặt ghim.
 *   - 2 ô vĩ độ / kinh độ để xem hoặc nhập tay (vd copy từ Google Maps).
 * THÀNH PHẦN CHÍNH: LocationPicker (export default).
 * DÙNG Ở: pages/business/BusinessOperations.jsx (form "Thêm cơ sở mới"), pages/business/BusinessFacilityForm.jsx (sửa cơ sở).
 * PHỤ THUỘC: ./FacilityMap (loadLeaflet), utils/geocode (geocodeAddress), FacilityMap.css (kiểu ghim fm-pin), LocationPicker.css.
 * API: Không gọi API backend. Tra địa chỉ: GET https://nominatim.openstreetmap.org/search (chỉ gửi địa chỉ cơ sở).
 * LUỒNG: value {latitude, longitude} -> vẽ ghim -> người dùng bấm / kéo / tìm địa chỉ / nhập số -> onChange({latitude, longitude}).
 * ======================================================================
 */
import React, { useEffect, useRef, useState } from 'react'
import { loadLeaflet } from './FacilityMap'
import { geocodeAddress } from '../../utils/geocode' // tra tọa độ từ địa chỉ (Nominatim)
import './FacilityMap.css'
import './LocationPicker.css'

/* Tâm mặc định: trung tâm TP. Hồ Chí Minh. */
const DEFAULT_CENTER = [10.7769, 106.7009]
/* Giới hạn lãnh thổ Việt Nam (khớp kiểm tra ở backend FacilityManagementService.ValidateLocation). */
const inVietnam = (lat, lng) => lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110

/** Làm tròn 6 chữ số thập phân (~10 cm), giống cột decimal(9,6) trong database. */
const round6 = n => Math.round(Number(n) * 1e6) / 1e6

/**
 * Khung chọn vị trí cơ sở.
 * @param {object} props
 * @param {{latitude:number|null, longitude:number|null}} props.value vị trí hiện tại (null = chưa chọn).
 * @param {Function} props.onChange ({latitude, longitude}) => void khi vị trí đổi.
 * @param {string} [props.address] địa chỉ đang nhập trong form, dùng cho nút "Tìm theo địa chỉ".
 * @param {string} [props.error] câu báo lỗi (vd chưa chọn vị trí) hiện dưới bản đồ.
 */
export default function LocationPicker({ value, onChange, address = '', error = '' }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const LRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const [searching, setSearching] = useState(false)
  const [note, setNote] = useState('')
  const [latText, setLatText] = useState(value?.latitude ?? '')
  const [lngText, setLngText] = useState(value?.longitude ?? '')
  const has = value?.latitude != null && value?.longitude != null

  /** Đặt / dời ghim tới (lat, lng); pan = true thì kéo bản đồ tới đó. */
  const placeMarker = (lat, lng, pan) => {
    const L = LRef.current, map = mapRef.current
    if (!L || !map) return
    if (!markerRef.current) {
      const icon = L.divIcon({ className: 'fm-pin-wrap', html: '<div class="fm-pin"><span></span></div>', iconSize: [36, 46], iconAnchor: [18, 44] })
      markerRef.current = L.marker([lat, lng], { icon, draggable: true }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current.getLatLng()
        onChangeRef.current?.({ latitude: round6(p.lat), longitude: round6(p.lng) })
      })
    } else markerRef.current.setLatLng([lat, lng])
    if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 16))
  }

  // Tạo bản đồ 1 lần khi mở; bấm vào bản đồ = đặt ghim. Gỡ bản đồ khi đóng form.
  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !boxRef.current || mapRef.current) return
      LRef.current = L
      const start = has ? [Number(value.latitude), Number(value.longitude)] : DEFAULT_CENTER
      const map = L.map(boxRef.current, { scrollWheelZoom: true }).setView(start, has ? 16 : 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map)
      map.on('click', event => onChangeRef.current?.({ latitude: round6(event.latlng.lat), longitude: round6(event.latlng.lng) }))
      mapRef.current = map
      if (has) placeMarker(Number(value.latitude), Number(value.longitude), false)
      setTimeout(() => map.invalidateSize(), 150) // bản đồ nằm trong hộp thoại vừa mở: tính lại kích thước
    }).catch(() => setNote('Không tải được bản đồ. Bạn vẫn có thể nhập vĩ độ / kinh độ bên dưới.'))
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; markerRef.current = null }
  }, [])

  // Vị trí đổi từ ngoài (bấm bản đồ, tìm địa chỉ...) -> dời ghim và cập nhật 2 ô số.
  useEffect(() => {
    if (!has) return
    setLatText(value.latitude)
    setLngText(value.longitude)
    placeMarker(Number(value.latitude), Number(value.longitude), false)
  }, [value?.latitude, value?.longitude])

  /** Tra tọa độ từ địa chỉ trong form (Nominatim, giới hạn Việt Nam) rồi đặt ghim + phóng to tới đó. */
  const searchAddress = async () => {
    const q = address.trim()
    if (q.length < 6) { setNote('Nhập địa chỉ cơ sở trước rồi bấm "Tìm theo địa chỉ".'); return }
    setSearching(true); setNote('')
    try {
      const hit = await geocodeAddress(q) // thử nhiều cách viết địa chỉ (xem utils/geocode)
      if (!hit) { setNote('Không tìm thấy địa chỉ này trên bản đồ. Hãy bấm trực tiếp vào vị trí cơ sở trên bản đồ.'); return }
      const lat = round6(hit.latitude), lng = round6(hit.longitude)
      onChangeRef.current?.({ latitude: lat, longitude: lng })
      placeMarker(lat, lng, true)
      setNote(hit.approximate
        ? 'Chỉ tìm được theo tên đường (vị trí gần đúng). Hãy kéo ghim tới đúng cổng cơ sở.'
        : 'Đã đặt ghim theo địa chỉ. Kiểm tra lại và kéo ghim nếu chưa đúng vị trí cổng cơ sở.')
    } catch {
      setNote('Không tra được địa chỉ (lỗi mạng). Hãy bấm trực tiếp vào vị trí trên bản đồ.')
    } finally { setSearching(false) }
  }

  /** Nhập tay vĩ độ / kinh độ: hợp lệ thì cập nhật ghim. */
  const applyTyped = (latStr, lngStr) => {
    const lat = Number(String(latStr).replace(',', '.')), lng = Number(String(lngStr).replace(',', '.'))
    if (String(latStr).trim() === '' || String(lngStr).trim() === '' || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (!inVietnam(lat, lng)) { setNote('Vị trí phải nằm trong lãnh thổ Việt Nam (vĩ độ 8–24, kinh độ 102–110).'); return }
    setNote('')
    onChangeRef.current?.({ latitude: round6(lat), longitude: round6(lng) })
    placeMarker(lat, lng, true)
  }

  return (
    <div className={`lp${error ? ' has-error' : ''}`}>
      <div className="lp-toolbar">
        <button type="button" className="lp-search" onClick={searchAddress} disabled={searching}>{searching ? 'Đang tìm...' : '⌕ Tìm theo địa chỉ'}</button>
        <span className="lp-hint">hoặc bấm vào bản đồ để đặt ghim, kéo ghim để chỉnh</span>
      </div>
      <div className="lp-map" ref={boxRef} role="application" aria-label="Bản đồ chọn vị trí cơ sở" />
      <div className="lp-coords">
        <label>Vĩ độ<input inputMode="decimal" value={latText} placeholder="10.776900" onChange={e => setLatText(e.target.value)} onBlur={() => applyTyped(latText, lngText)} /></label>
        <label>Kinh độ<input inputMode="decimal" value={lngText} placeholder="106.700900" onChange={e => setLngText(e.target.value)} onBlur={() => applyTyped(latText, lngText)} /></label>
        <span className={`lp-status${has ? ' ok' : ''}`}>{has ? '✓ Đã chọn vị trí' : 'Chưa chọn vị trí'}</span>
      </div>
      {(error || note) && <p className={`lp-note${error ? ' err' : ''}`} role={error ? 'alert' : undefined}>{error || note}</p>}
    </div>
  )
}
