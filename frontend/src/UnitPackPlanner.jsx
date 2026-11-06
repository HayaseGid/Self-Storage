import React, { useEffect, useMemo, useState } from 'react'
import ThreeUnitScene from './ThreeUnitScene'
import { PACK_ITEMS, aisleZones, autoPack, describeItems, findPosition, itemType, placeAt, remainingCapacity, sampleFurniture, volumeOf } from './packing'

/*
 * 2 chế độ 3D (Three.js) trong khung xem kho:
 *  - SampleRoom: kho có đồ mẫu bày sẵn theo cỡ kho.
 *  - PackPlanner: khách chọn thùng / đồ, tự kéo thả, xoay, chồng; hoặc bấm "Tự xếp giúp tôi".
 */
const roomOf = geo => ({ w: geo.width, h: geo.height, l: geo.length })
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
const fmtPct = value => `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`

export function SampleRoom({ geo, color }) {
  const { items, aisles } = useMemo(() => sampleFurniture(geo), [geo.width, geo.length, geo.height, geo.band, geo.isLocker])
  const room = roomOf(geo)
  const used = pct(volumeOf(items), room.w * room.h * room.l)
  return (
    <div className="upp">
      <ThreeUnitScene geo={geo} color={color} mode="sample" items={items} zones={aisles} />
      <div className="upp-sample-note">
        <strong>Ví dụ kho này chứa được:</strong> {describeItems(items)}.
        <span> Đồ chiếm khoảng {fmtPct(used)} thể tích{aisles.length ? ', vẫn chừa lối đi (vạch vàng) để lấy đồ' : ''}. Đồ được xếp tự động bằng thuật toán Extreme Point (Crainic, Perboli & Tadei, 2007). Rê chuột lên từng món để xem tên và kích thước.</span>
      </div>
    </div>
  )
}

export function PackPlanner({ geo, color }) {
  const room = roomOf(geo)
  const roomVolume = room.w * room.h * room.l
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [message, setMessage] = useState(null) // { tone, text }
  const [counts, setCounts] = useState({ 'box-s': 0, 'box-m': 10, 'box-l': 0 })
  const [aisleOn, setAisleOn] = useState(true)
  const zones = useMemo(() => (aisleOn ? aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' }) : []), [aisleOn, room.w, room.l, room.h, geo.isLocker, geo.band])
  const withZones = list => [...list, ...zones]
  const seq = React.useRef(0)

  const selected = items.find(it => it.id === selectedId) || null
  const used = volumeOf(items)
  // Ước lượng nhanh (hiệu suất xếp ~85%) để không phải mô phỏng lại mỗi lần kéo thả.
  // "Còn chứa thêm": xếp thử thật bằng Extreme Point (chạy sau khi thay đổi, không làm giật lúc kéo thả).
  const [capacityM, setCapacityM] = useState(null)
  useEffect(() => {
    setCapacityM(null)
    const timer = setTimeout(() => setCapacityM(remainingCapacity(withZones(items), room, itemType('box-m'), 250)), 60)
    return () => clearTimeout(timer)
  }, [items, zones])

  const add = key => {
    const type = itemType(key)
    const all = withZones(items)
    // Đang chọn một món -> ưu tiên CHỒNG món mới lên trên món đó.
    let spot = null
    let stackedOn = null
    if (selected && !selected.noTop && !type.floorOnly) {
      const sizes = [[type.w, type.d], [type.d, type.w]]
      for (const [w, d] of sizes) {
        const x = Math.min(selected.x, Math.max(0, room.w - w))
        const z = Math.min(selected.z, Math.max(0, room.l - d))
        const s = placeAt(all, room, x, z, w, type.h, d)
        if (s && s.y >= selected.y + selected.h - 1e-6) { spot = s; stackedOn = selected; break }
      }
    }
    if (!spot) spot = findPosition(all, room, type.w, type.h, type.d, { floorOnly: Boolean(type.floorOnly), prefer: 'back' })
    if (!spot) {
      setMessage({ tone: 'err', text: `Không còn chỗ cho ${type.name.toLowerCase()} trong kho này${zones.length ? ' (đã chừa lối đi)' : ''}. Thử xếp lại hoặc chọn kho lớn hơn.` })
      return
    }
    const id = `${key}-${++seq.current}`
    setItems(list => [...list, { ...type, ...spot, id }])
    setSelectedId(id)
    setMessage({ tone: 'ok', text: stackedOn
      ? `Đã chồng ${type.name.toLowerCase()} lên ${stackedOn.name.toLowerCase()}. Bấm tiếp để chồng thêm.`
      : `Đã thêm ${type.name.toLowerCase()} (xếp từ vách trong ra, chồng lên khi có thể). Kéo để đổi chỗ — kéo đè lên thùng khác để chồng.` })
  }

  const move = (id, pos) => {
    setItems(list => list.map(it => (it.id === id ? { ...it, ...pos } : it)))
    setMessage(null)
  }

  const rotate = () => {
    if (!selected) return
    const w = selected.d
    const d = selected.w
    const spot = placeAt(withZones(items), room, selected.x, selected.z, w, selected.h, d, selected.id, { floorOnly: Boolean(selected.floorOnly) })
      || findPosition(withZones(items.filter(it => it.id !== selected.id)), room, w, selected.h, d, { allowRotate: false, floorOnly: Boolean(selected.floorOnly) })
    if (!spot) {
      setMessage({ tone: 'err', text: 'Không đủ chỗ để xoay món này.' })
      return
    }
    setItems(list => list.map(it => (it.id === selected.id ? { ...it, ...spot, w, d } : it)))
  }

  const remove = () => {
    if (!selected) return
    // Món nằm trên món bị xóa sẽ "rơi" xuống: xếp lại theo thứ tự độ cao.
    const rest = items.filter(it => it.id !== selected.id).sort((a, b) => a.y - b.y)
    const settled = []
    rest.forEach(it => {
      const spot = placeAt(withZones(settled), room, it.x, it.z, it.w, it.h, it.d)
      settled.push(spot ? { ...it, y: spot.y } : it)
    })
    setItems(settled)
    setSelectedId(null)
  }

  const clearAll = () => { setItems([]); setSelectedId(null); setMessage(null) }

  const toggleAisle = on => {
    if (on) {
      const next = aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' })
      const blocked = items.filter(it => next.some(z => it.x < z.x + z.w - 1e-6 && z.x < it.x + it.w - 1e-6 && it.z < z.z + z.d - 1e-6 && z.z < it.z + it.d - 1e-6))
      if (blocked.length) {
        setMessage({ tone: 'err', text: `Có ${blocked.length} món đang nằm trên lối đi. Dời chúng đi rồi bật lại.` })
        return
      }
    }
    setAisleOn(on)
  }

  const runAutoPack = () => {
    const requests = Object.entries(counts).map(([key, count]) => ({ ...itemType(key), count }))
    const total = requests.reduce((n, r) => n + (Number(r.count) || 0), 0)
    if (!total) {
      setMessage({ tone: 'err', text: 'Nhập số lượng thùng muốn xếp.' })
      return
    }
    // Thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei 2007): thử vài biến thể, giữ cách xếp được nhiều nhất.
    const { placed, failed } = autoPack(room, requests, zones, { prefer: 'best' })
    seq.current += placed.length
    setItems(placed)
    setSelectedId(null)
    setMessage(failed.length
      ? { tone: 'err', text: `Kho này chỉ xếp được ${placed.length}/${total} thùng. ${failed.length} thùng không vừa — nên chọn kho lớn hơn.` }
      : { tone: 'ok', text: `Đã xếp gọn ${placed.length} thùng, dùng ${fmtPct(pct(volumeOf(placed), roomVolume))} thể tích kho.` })
  }

  return (
    <div className="upp">
      <ThreeUnitScene geo={geo} color={color} mode="pack" items={items} zones={zones} selectedId={selectedId} onSelect={setSelectedId} onMove={move} />
      <p className="upp-tip">
        Bấm một thùng để chọn rồi bấm loại thùng bên dưới để <strong>chồng lên</strong> nó · kéo thùng đè lên thùng khác để chồng · rê chuột xem kích thước.
      </p>

      <div className="upp-stats" aria-live="polite">
        <div><span>Số món</span><strong>{items.length}</strong></div>
        <div><span>Đã dùng</span><strong>{fmtPct(pct(used, roomVolume))} thể tích</strong></div>
        <div><span>Còn chứa thêm</span><strong>{capacityM == null ? 'đang tính…' : `${capacityM}${capacityM >= 250 ? '+' : ''} thùng vừa`}</strong></div>
      </div>
      <div className="upp-meter" aria-hidden="true"><div style={{ width: `${Math.min(100, pct(used, roomVolume))}%` }} /></div>

      {message && <p className={`upp-msg ${message.tone}`}>{message.text}</p>}

      <div className="upp-palette" role="group" aria-label="Thêm thùng / đồ vào kho">
        {PACK_ITEMS.map(type => (
          <button key={type.key} type="button" onClick={() => add(type.key)}>
            <i style={{ background: type.color }} aria-hidden="true" />
            <span><strong>{type.name}</strong><small>{type.size}</small></span>
          </button>
        ))}
      </div>

      <div className="upp-actions">
        <span className="upp-selected">{selected ? <>Đang chọn: <strong>{selected.name}</strong></> : 'Bấm vào một món trong kho để chọn, kéo để di chuyển.'}</span>
        <button type="button" disabled={!selected} onClick={rotate}>↻ Xoay</button>
        <button type="button" disabled={!selected} onClick={remove}>Xóa món</button>
        <button type="button" disabled={!items.length} onClick={clearAll}>Xóa hết</button>
        {!geo.isLocker && (
          <label className="upp-aisle"><input type="checkbox" checked={aisleOn} onChange={e => toggleAisle(e.target.checked)} /> Chừa lối đi 80 cm</label>
        )}
      </div>

      <details className="upp-auto">
        <summary>Tự xếp giúp tôi</summary>
        <div className="upp-auto-row">
          {['box-s', 'box-m', 'box-l'].map(key => (
            <label key={key}>
              {itemType(key).name} <small>{itemType(key).size}</small>
              <input type="number" min="0" max="500" value={counts[key]} onChange={e => setCounts(c => ({ ...c, [key]: Math.max(0, Math.min(500, Number(e.target.value) || 0)) }))} />
            </label>
          ))}
          <button type="button" className="dashboard-primary-btn" onClick={runAutoPack}>Xếp thử</button>
        </div>
        <small>Xếp theo thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei, 2007): nhét thùng vào khe trống khít nhất, mỗi thùng được đỡ ít nhất 70% đáy, chồng tối đa tới trần{aisleOn ? ', chừa lối đi' : ''}.</small>
      </details>
    </div>
  )
}
