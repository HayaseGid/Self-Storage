/**
 * ======================================================================
 * FILE: src/features/facility/NearestFacilityFinder.jsx  —  TÌM CƠ SỞ GẦN BẠN NHẤT
 * CHỨC NĂNG: Khách gõ địa chỉ -> hiện danh sách địa điểm gợi ý (kiểu Shopee) -> khách chọn 1 địa điểm
 *   (hoặc bấm "Dùng vị trí hiện tại") -> web xếp các cơ sở theo khoảng cách
 *   đường chim bay và gợi ý 3 cơ sở gần nhất (khoảng cách, số kho trống, nút xem cơ sở / chỉ đường).
 *   Vị trí của khách chỉ dùng trên trình duyệt, không gửi về backend và không lưu lại.
 * THÀNH PHẦN CHÍNH: NearestFacilityFinder (export default).
 * DÙNG Ở: src/App.jsx (HomePage, khối "Tìm cơ sở gần bạn").
 * PHỤ THUỘC: utils/geocode (suggestAddresses, geocodeAddress, distanceKm), ./FacilityMap (directionsUrl), NearestFacilityFinder.css.
 * API: Không gọi backend. Gợi ý địa chỉ qua Photon, tra dự phòng qua Nominatim (trong utils/geocode).
 * LUỒNG: khách gõ (chờ ngừng gõ 0,4 giây) -> gợi ý -> khách chọn / bấm định vị -> tọa độ khách -> distanceKm tới từng cơ sở có tọa độ -> sắp xếp -> 3 cơ sở đầu.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   formatDistance: Hiện khoảng cách: dưới 1 km thì ghi mét (làm tròn 50 m), còn lại ghi km 1 chữ số thập phân → dùng ở: row
 *   NearestFacilityFinder: Khối tìm cơ sở gần nhất → dùng ở: App.jsx (HomePage)
 *   choose: Chọn 1 địa điểm gợi ý làm vị trí của khách → dùng ở: NearestFacilityFinder
 *   searchAddress: Bấm "Tìm": dùng gợi ý đang chọn / gợi ý đầu tiên, không có thì tra địa chỉ (Nominatim) → dùng ở: NearestFacilityFinder
 *   onKeyDown: Phím lên / xuống / Enter / Esc trong danh sách gợi ý → dùng ở: NearestFacilityFinder
 *   useCurrentLocation: Lấy vị trí hiện tại từ trình duyệt (khách phải cho phép định vị) → dùng ở: NearestFacilityFinder
 *   row: 1 dòng kết quả → dùng ở: NearestFacilityFinder
 */
import React, { useEffect, useRef, useState } from 'react'
import { suggestAddresses, geocodeAddress, distanceKm } from '../../utils/geocode'
import { directionsUrl } from './FacilityMap'
import './NearestFacilityFinder.css'

/** Hiện khoảng cách: dưới 1 km thì ghi mét (làm tròn 50 m), còn lại ghi km 1 chữ số thập phân. */
const formatDistance = km => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km.toFixed(1).replace('.', ',')} km`)

/**
 * Khối tìm cơ sở gần nhất.
 * @param {object} props
 * @param {object[]} props.points các cơ sở dạng điểm { id, name, address, latitude, longitude, available } (từ toMapPoints).
 * @param {Function} props.onOpen (point) => void khi khách bấm "Xem cơ sở".
 */
export default function NearestFacilityFinder({ points, onOpen }) {
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState('') // '' | 'address' | 'gps': đang tra theo cách nào
  const [origin, setOrigin] = useState(null) // { latitude, longitude, label, approximate } vị trí của khách
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([]) // địa điểm gợi ý cho chữ đang gõ
  const [open, setOpen] = useState(false) // đang mở danh sách gợi ý
  const [active, setActive] = useState(-1) // dòng gợi ý đang được chọn bằng phím
  const pickedRef = useRef('') // địa chỉ vừa chọn từ gợi ý: không tra gợi ý lại cho chính chữ này

  // Khách gõ -> chờ ngừng gõ 0,4 giây rồi lấy gợi ý; gõ tiếp thì hủy lần tra cũ.
  useEffect(() => {
    const q = address.trim()
    if (q.length < 3 || q === pickedRef.current) { setSuggestions([]); return }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      suggestAddresses(q, ctrl.signal)
        .then(list => { setSuggestions(list); setActive(-1); setOpen(true) })
        .catch(() => {}) // lỗi mạng / bị hủy: bỏ qua, khách vẫn bấm "Tìm" được
    }, 400)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [address])

  // Chỉ xét cơ sở đã có tọa độ; xếp theo khoảng cách tới vị trí khách.
  const ranked = origin
    ? points
        .filter(p => p.latitude != null && p.longitude != null)
        .map(p => ({ ...p, km: distanceKm(origin, p) }))
        .sort((a, b) => a.km - b.km)
    : []
  const top = ranked.slice(0, 3)
  // Cơ sở gần nhất hết kho trống -> gợi ý thêm cơ sở gần nhất còn kho (nếu nằm ngoài top 3).
  const nearestWithStock = ranked.find(p => p.available > 0)
  const extra = top[0] && top[0].available === 0 && nearestWithStock && !top.includes(nearestWithStock) ? nearestWithStock : null

  /** Chọn 1 địa điểm gợi ý làm vị trí của khách. */
  const choose = s => {
    pickedRef.current = s.label
    setAddress(s.label)
    setSuggestions([]); setOpen(false); setError('')
    setOrigin({ latitude: s.latitude, longitude: s.longitude, label: s.main, approximate: false })
  }

  /** Bấm "Tìm": dùng gợi ý đang chọn (hoặc gợi ý đầu tiên); chưa có gợi ý thì tra địa chỉ như cũ. */
  const searchAddress = async event => {
    event.preventDefault()
    const pick = suggestions[active] || suggestions[0]
    if (pick) { choose(pick); return }
    const q = address.trim()
    if (q.length < 4) { setError('Nhập địa chỉ của bạn, ví dụ: 268 Lý Thường Kiệt, Quận 10.'); return }
    setBusy('address'); setError('')
    try {
      const hit = await geocodeAddress(q)
      if (!hit) { setError('Không tìm thấy địa chỉ này. Hãy ghi rõ hơn (số nhà, tên đường, quận) hoặc bấm "Dùng vị trí hiện tại".'); return }
      setOrigin({ ...hit, label: q })
    } catch {
      setError('Không tra được địa chỉ (lỗi mạng). Vui lòng thử lại.')
    } finally { setBusy('') }
  }

  /** Phím trong ô nhập: lên / xuống để chọn gợi ý, Esc để đóng (Enter = gửi form -> searchAddress). */
  const onKeyDown = event => {
    if (!open || !suggestions.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => (i + 1) % suggestions.length) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => (i <= 0 ? suggestions.length - 1 : i - 1)) }
    else if (event.key === 'Escape') setOpen(false)
  }

  /** Lấy vị trí hiện tại từ trình duyệt (khách phải cho phép định vị). */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Trình duyệt không hỗ trợ định vị. Hãy nhập địa chỉ của bạn.'); return }
    setBusy('gps'); setError('')
    navigator.geolocation.getCurrentPosition(
      pos => { setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, label: 'Vị trí hiện tại của bạn', approximate: false }); setBusy('') },
      err => {
        setBusy('')
        setError(err.code === 1 ? 'Bạn chưa cho phép định vị. Hãy cho phép trong trình duyệt hoặc nhập địa chỉ.' : 'Không lấy được vị trí hiện tại. Hãy nhập địa chỉ của bạn.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  /** 1 dòng kết quả. */
  const row = (p, index, badge) => (
    <li key={p.id} className={`nf-item${index === 0 ? ' nearest' : ''}`}>
      <span className="nf-rank">{index + 1}</span>
      <div className="nf-info">
        <strong>{p.name}{badge && <em className="nf-badge">{badge}</em>}</strong>
        <span>{p.address}</span>
        <small className={p.available > 0 ? 'ok' : 'out'}>{p.available > 0 ? `${p.available} kho trống` : 'Hết kho trống'}</small>
      </div>
      <div className="nf-side">
        <b>{formatDistance(p.km)}</b>
        <div className="nf-actions">
          <button type="button" onClick={() => onOpen(p)}>Xem cơ sở</button>
          <a href={directionsUrl(p)} target="_blank" rel="noreferrer">Chỉ đường</a>
        </div>
      </div>
    </li>
  )

  // Ô nhập địa chỉ / dùng vị trí + 3 cơ sở gần nhất
  return (
    <div className="nf">
      <form className="nf-form" onSubmit={searchAddress}>
        <div className="nf-input-wrap">
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setOpen(false)}
            placeholder="Nhập địa chỉ của bạn, ví dụ: 268 Lý Thường Kiệt, Quận 10"
            aria-label="Địa chỉ của bạn"
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-autocomplete="list"
            autoComplete="off"
          />
          {open && suggestions.length > 0 && (
            <ul className="nf-suggest" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s.label}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onMouseDown={e => { e.preventDefault(); choose(s) }} // mousedown: chọn trước khi ô nhập mất focus
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="nf-suggest-pin">⌖</span>
                  <span><strong>{s.main}</strong>{s.sub && <small>{s.sub}</small>}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className="nf-primary" disabled={!!busy}>{busy === 'address' ? 'Đang tìm...' : 'Tìm cơ sở gần tôi'}</button>
        <button type="button" className="nf-gps" onClick={useCurrentLocation} disabled={!!busy}>{busy === 'gps' ? 'Đang định vị...' : '◎ Dùng vị trí hiện tại'}</button>
      </form>
      {error && <p className="nf-error" role="alert">{error}</p>}
      {origin && !error && (
        <div className="nf-result">
          <p className="nf-origin">
            Gần <strong>{origin.label}</strong> nhất
            {origin.approximate && ' (vị trí gần đúng theo tên đường)'} · khoảng cách đường chim bay
          </p>
          {top.length === 0
            ? <p className="nf-error">Hiện chưa có cơ sở nào có vị trí trên bản đồ.</p>
            : <ol className="nf-list">
                {top.map((p, i) => row(p, i, i === 0 ? 'Gần nhất' : ''))}
                {extra && row(extra, ranked.indexOf(extra), 'Gần nhất còn kho')}
              </ol>}
        </div>
      )}
    </div>
  )
}
