/**
 * ======================================================================
 * FILE: src/features/unit/UnitPackPlanner.jsx  —  2 CHẾ ĐỘ 3D TRONG CỬA SỔ XEM KHO
 * - SampleRoom: kho có đồ mẫu bày sẵn theo cỡ kho (dùng sampleFurniture trong utils/packing.js).
 * - PackPlanner: khách nhập số thùng thực tế, tự kéo thả, xoay, chồng lên nhau, hoặc bấm "Xếp thử vào kho này"
 *   (thuật toán Extreme Point Best-Fit). Hiển thị % thể tích đã dùng và còn chứa thêm bao nhiêu thùng.
 * Hình 3D vẽ bằng ThreeUnitScene.jsx. Không gọi API.
 * ======================================================================
 */
import React, { useEffect, useMemo, useState } from 'react'
import ThreeUnitScene from './ThreeUnitScene'
import { BOX_KEYS, EXACT_PACK_LIMIT, PACK_ITEMS, aisleZones, autoPack, boxRequests, describeItems, findPosition, itemType, placeAt, remainingCapacity, sampleFurniture, volumeOf } from '../../utils/packing'

/*
 * 2 chế độ 3D (Three.js) trong khung xem kho:
 *  - SampleRoom: kho có đồ mẫu bày sẵn theo cỡ kho.
 *  - PackPlanner: khách chọn thùng / đồ, tự kéo thả, xoay, chồng; hoặc bấm "Tự xếp giúp tôi".
 */
/**
 * Đổi hình học kho thành kích thước phòng { w: rộng, h: cao, l: dài }.
 */
const roomOf = geo => ({ w: geo.width, h: geo.height, l: geo.length })
/**
 * Tính phần trăm a/b (làm tròn 1 chữ số thập phân).
 */
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
/**
 * Định dạng phần trăm kiểu Việt Nam.
 */
const fmtPct = value => `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`

/**
 * Component "Có đồ mẫu": bày đồ mẫu theo cỡ kho và hiển thị % thể tích đã dùng.
 * @param {{geo:object, color:string}} props geo = unitGeometry(unit), color = màu của loại kho.
 */
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

/**
 * Định dạng thể tích m³ kiểu Việt Nam (2 chữ số thập phân).
 */
const fmtM3 = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

/**
 * Component "Tự xếp thùng": cho khách tự thêm/kéo/xoay/xóa đồ trong kho hoặc tự động xếp.
 * Số thùng thực tế (counts) và "chừa lối đi" (aisleOn) do Unit3DViewer giữ, để sidebar gợi ý kho vừa dùng chung.
 * @param {object} props geo, color, counts { 'box-s', 'box-m', 'box-l' }, onCountsChange(counts),
 *   aisleOn, onAisleChange(on), autoRun (true = tự xếp ngay khi mở, dùng khi khách chọn kho được gợi ý).
 */
export function PackPlanner({ geo, color, counts, onCountsChange, aisleOn, onAisleChange, autoRun = false }) {
  const room = roomOf(geo)
  const roomVolume = room.w * room.h * room.l
  const [items, setItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [message, setMessage] = useState(null) // { tone, text }
  // Danh sách vùng lối đi (khi bật "chừa lối đi").
  const zones = useMemo(() => (aisleOn ? aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' }) : []), [aisleOn, room.w, room.l, room.h, geo.isLocker, geo.band])
  // Ghép danh sách món với các vùng lối đi (để tính va chạm).
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

  /**
   * Thêm 1 món loại `key`: nếu đang chọn 1 món thì ưu tiên chồng lên trên món đó, không thì tìm chỗ
   * từ vách trong ra; hết chỗ thì báo lỗi.
   */
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

  // Cập nhật vị trí món sau khi kéo thả.
  const move = (id, pos) => {
    setItems(list => list.map(it => (it.id === id ? { ...it, ...pos } : it)))
    setMessage(null)
  }

  // Xoay món đang chọn 90° (đổi rộng/sâu), tìm chỗ khác nếu tại chỗ không đủ.
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

  // Xóa món đang chọn; các món nằm phía trên sẽ "rơi" xuống theo trọng lực.
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

  // Xóa toàn bộ đồ trong kho.
  const clearAll = () => { setItems([]); setSelectedId(null); setMessage(null) }

  // Bật/tắt chừa lối đi; khi bật mà có món nằm trên lối đi thì báo lỗi và không bật.
  const toggleAisle = on => {
    if (on) {
      const next = aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' })
      const blocked = items.filter(it => next.some(z => it.x < z.x + z.w - 1e-6 && z.x < it.x + it.w - 1e-6 && it.z < z.z + z.d - 1e-6 && z.z < it.z + it.d - 1e-6))
      if (blocked.length) {
        setMessage({ tone: 'err', text: `Có ${blocked.length} món đang nằm trên lối đi. Dời chúng đi rồi bật lại.` })
        return
      }
    }
    onAisleChange(on)
  }

  /**
   * "Tự xếp giúp tôi": xếp số thùng nhỏ/vừa/lớn khách nhập bằng autoPack (chọn biến thể tốt nhất),
   * báo số thùng xếp được và % thể tích kho đã dùng.
   */
  const boxes = boxRequests(counts)
  const runAutoPack = () => {
    const { requests, total } = boxes
    if (!total) {
      setMessage({ tone: 'err', text: 'Nhập số lượng thùng muốn xếp.' })
      return
    }
    // Báo "đang xếp" trước rồi mới chạy (thuật toán chạy đồng bộ, nhiều thùng có thể mất vài giây).
    setMessage({ tone: 'ok', text: `Đang xếp ${total.toLocaleString('vi-VN')} thùng${total > EXACT_PACK_LIMIT ? ', số lượng lớn nên có thể mất vài giây' : ''}…` })
    setTimeout(() => {
      // Thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei 2007): thử vài biến thể, giữ cách xếp được nhiều nhất.
      // Số thùng lớn thì chỉ chạy 1 biến thể cho nhanh.
      const { placed, failed } = autoPack(room, requests, zones, { prefer: total > EXACT_PACK_LIMIT ? 'fit' : 'best' })
      seq.current += placed.length
      setItems(placed)
      setSelectedId(null)
      setMessage(failed.length
        ? { tone: 'err', text: `Kho này chỉ xếp được ${placed.length}/${total} thùng. ${failed.length} thùng không vừa — nên chọn kho lớn hơn.` }
        : { tone: 'ok', text: `Đã xếp gọn ${placed.length} thùng, dùng ${fmtPct(pct(volumeOf(placed), roomVolume))} thể tích kho.` })
    }, 30)
  }
  // Mở từ gợi ý ở sidebar: xếp luôn số thùng khách đã nhập vào kho vừa chọn.
  useEffect(() => { if (autoRun) runAutoPack() }, [])

  return (
    <div className="upp">
      <ThreeUnitScene geo={geo} color={color} mode="pack" items={items} zones={zones} selectedId={selectedId} onSelect={setSelectedId} onMove={move} />
      <p className="upp-tip">
        Bấm một thùng để chọn rồi bấm loại thùng bên dưới để <strong>chồng lên</strong> nó · kéo thùng đè lên thùng khác để chồng · rê chuột xem kích thước.
      </p>

      <div className="upp-boxes">
        <div className="upp-boxes-head">
          <strong>Bạn có bao nhiêu thùng?</strong>
          <small>Nhập số thùng thực tế. Cột bên phải sẽ gợi ý các kho còn trống xếp vừa.</small>
        </div>
        <div className="upp-auto-row">
          {BOX_KEYS.map(key => (
            <label key={key}>
              {itemType(key).name} <small>{itemType(key).size}</small>
              <input type="number" min="0" step="1" inputMode="numeric" value={counts[key]} onChange={e => onCountsChange({ ...counts, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            </label>
          ))}
          <button type="button" className="dashboard-primary-btn" onClick={runAutoPack}>Xếp thử vào kho này</button>
        </div>
        <p className="upp-boxes-sum">
          {boxes.total
            ? <>Tổng <strong>{boxes.total.toLocaleString('vi-VN')} thùng</strong> · <strong>{fmtM3(boxes.volume)} m³</strong> · bằng <strong>{fmtPct(pct(boxes.volume, roomVolume))}</strong> thể tích kho này{boxes.volume > roomVolume ? ' (vượt sức chứa)' : ''}</>
            : 'Chưa nhập thùng nào.'}
        </p>
        <small>Xếp theo thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei, 2007): nhét thùng vào khe trống khít nhất, mỗi thùng được đỡ ít nhất 70% đáy, chồng tối đa tới trần{aisleOn ? ', chừa lối đi' : ''}.</small>
      </div>

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

    </div>
  )
}
