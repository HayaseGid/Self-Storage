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
import { createPortal } from 'react-dom'
import ThreeUnitScene from './ThreeUnitScene'
import { CUSTOM_BOX_KEY, EXACT_PACK_LIMIT, PACK_EFFICIENCY, PACK_ITEMS, aisleZones, boxRequests, customBoxType, describeItems, findPosition, itemType, placeAt, sampleFurniture, volumeOf } from '../../utils/packing'
import { CANCELLED, usePackChannel } from '../../utils/packingClient'
import ItemCountsInput from './ItemCountsInput'

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
 *   aisleOn, onAisleChange(on), autoRun (true = tự xếp ngay khi mở, dùng khi khách chọn kho được gợi ý),
 *   slot (phần tử DOM ở cột phải của Unit3DViewer: danh sách đồ + khối nhập số thùng được vẽ vào đó,
 *   để cảnh 3D bên trái luôn nhìn thấy khi thêm đồ; không có slot thì vẽ ngay dưới cảnh 3D).
 */
export function PackPlanner({ geo, color, counts, onCountsChange, aisleOn, onAisleChange, autoRun = false, slot = null }) {
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
  // Thuật toán xếp chạy trong Web Worker: 1 kênh cho "Xếp thử", 1 kênh cho "Còn chứa thêm".
  const packChannel = usePackChannel()
  const capacityChannel = usePackChannel()
  const [packing, setPacking] = useState(false)
  // "Còn chứa thêm" (thùng vừa): hiện ước tính ngay (≈), rồi thay bằng số xếp thử thật từ worker. Không giới hạn số thùng.
  const [capacity, setCapacity] = useState({ value: null, exact: false })
  useEffect(() => {
    const box = itemType('box-m')
    const boxVolume = box.w * box.h * box.d
    const free = Math.max(0, roomVolume - volumeOf(items) - volumeOf(zones))
    setCapacity({ value: Math.floor((free * PACK_EFFICIENCY) / boxVolume), exact: false })
    let cancelled = false
    // limit = số thùng tối đa theo thể tích + 1, nên kết quả luôn là số thật (không bị chặn).
    const timer = setTimeout(() => {
      capacityChannel.run('remainingCapacity', { items: withZones(items), room, type: box, limit: Math.floor(free / boxVolume) + 1 })
        .then(value => { if (!cancelled && value !== CANCELLED) setCapacity({ value, exact: true }) })
        .catch(() => {})
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [items, zones])

  /**
   * Thêm 1 món loại `key`: nếu đang chọn 1 món thì ưu tiên chồng lên trên món đó, không thì tìm chỗ
   * từ vách trong ra; hết chỗ thì báo lỗi.
   */
  const add = key => {
    const type = key === CUSTOM_BOX_KEY ? customBoxType(counts.customSize) : itemType(key)
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
      setMessage({ tone: 'err', text: 'Nhập số thùng / đồ muốn xếp.' })
      return
    }
    setMessage({ tone: 'ok', text: `Đang xếp ${total.toLocaleString('vi-VN')} món${total > EXACT_PACK_LIMIT ? ', số lượng lớn nên có thể mất vài giây' : ''}…` })
    setPacking(true)
    // Thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei 2007) chạy trong worker: thử vài biến thể, giữ cách
    // xếp được nhiều nhất; số thùng lớn thì chỉ chạy 1 biến thể cho nhanh.
    packChannel.run('autoPack', { room, requests, startItems: zones, options: { prefer: total > EXACT_PACK_LIMIT ? 'fit' : 'best' } })
      .then(result => {
        if (result === CANCELLED) return
        const { placed, failed } = result
        seq.current += placed.length
        setItems(placed)
        setSelectedId(null)
        setPacking(false)
        setMessage(failed.length
          ? { tone: 'err', text: `Kho này chỉ xếp được ${placed.length}/${total} món. ${failed.length} món không vừa — nên chọn kho lớn hơn.` }
          : { tone: 'ok', text: `Đã xếp gọn ${placed.length} món, dùng ${fmtPct(pct(volumeOf(placed), roomVolume))} thể tích kho.` })
      })
      .catch(() => {
        setPacking(false)
        setMessage({ tone: 'err', text: 'Không xếp thử được, vui lòng thử lại.' })
      })
  }
  // Mở từ gợi ý ở sidebar: xếp luôn số thùng khách đã nhập vào kho vừa chọn.
  useEffect(() => { if (autoRun) runAutoPack() }, [])

  // Danh sách đồ + khối nhập số thùng (vẽ ở cột phải nếu có slot).
  const controls = (
    <div className="upp-controls">
      <section className="upp-add">
        <h4>Thêm đồ vào kho</h4>
        <p className="upp-tip">
          Bấm một thùng trong kho để chọn rồi bấm loại đồ bên dưới để <strong>chồng lên</strong> nó · kéo thùng đè lên thùng khác để chồng.
        </p>
        <div className="upp-palette" role="group" aria-label="Thêm thùng / đồ vào kho">
          {[...PACK_ITEMS, customBoxType(counts.customSize)].map(type => (
            <button key={type.key} type="button" onClick={() => add(type.key)}>
              <i style={{ background: type.color }} aria-hidden="true" />
              <span><strong>{type.name}</strong><small>{type.size}</small></span>
            </button>
          ))}
        </div>
      </section>

      <div className="upp-boxes">
        <div className="upp-boxes-head">
          <strong>Bạn có những đồ gì?</strong>
          <small>Nhập số thùng / đồ thực tế (được nhớ khi xem kho khác), danh sách bên dưới sẽ gợi ý các kho còn trống xếp vừa.</small>
        </div>
        <ItemCountsInput counts={counts} onChange={onCountsChange} />
        <button type="button" className="dashboard-primary-btn upp-pack-btn" onClick={runAutoPack} disabled={packing}>{packing ? 'Đang xếp…' : 'Xếp thử vào kho này'}</button>
        <p className="upp-boxes-sum">
          {boxes.total
            ? <>Tổng <strong>{boxes.total.toLocaleString('vi-VN')} món</strong>{boxes.big ? ` (${boxes.boxes.toLocaleString('vi-VN')} thùng, ${boxes.big} đồ lớn)` : ''} · <strong>{fmtM3(boxes.volume)} m³</strong> · bằng <strong>{fmtPct(pct(boxes.volume, roomVolume))}</strong> thể tích kho này{boxes.volume > roomVolume ? ' (vượt sức chứa)' : ''}</>
            : 'Chưa nhập thùng / đồ nào.'}
        </p>
        <small>Xếp theo thuật toán Extreme Point Best-Fit (Crainic, Perboli & Tadei, 2007): nhét thùng vào khe trống khít nhất, mỗi thùng được đỡ ít nhất 70% đáy, chồng tối đa tới trần{aisleOn ? ', chừa lối đi' : ''}.</small>
      </div>
    </div>
  )

  return (
    <div className="upp">
      {/* Cảnh 3D + số liệu + nút thao tác (cột trái). */}
      <div className="upp-stage">
        <ThreeUnitScene geo={geo} color={color} mode="pack" items={items} zones={zones} selectedId={selectedId} onSelect={setSelectedId} onMove={move} />
        <div className="upp-stats" aria-live="polite">
          <div><span>Số món</span><strong>{items.length}</strong></div>
          <div><span>Đã dùng</span><strong>{fmtPct(pct(used, roomVolume))} thể tích</strong></div>
          <div><span>Còn chứa thêm</span><strong title={capacity.exact ? undefined : 'Ước tính, đang xếp thử để ra số chính xác'}>{capacity.value == null ? 'đang tính…' : `${capacity.exact ? '' : '≈ '}${capacity.value.toLocaleString('vi-VN')} thùng vừa`}</strong></div>
        </div>
        <div className="upp-meter" aria-hidden="true"><div style={{ width: `${Math.min(100, pct(used, roomVolume))}%` }} /></div>
        <div className="upp-actions">
          <span className="upp-selected">{selected ? <>Đang chọn: <strong>{selected.name}</strong></> : 'Bấm vào một món trong kho để chọn, kéo để di chuyển.'}</span>
          <button type="button" disabled={!selected} onClick={rotate}>↻ Xoay</button>
          <button type="button" disabled={!selected} onClick={remove}>Xóa món</button>
          <button type="button" disabled={!items.length} onClick={clearAll}>Xóa hết</button>
          {!geo.isLocker && (
            <label className="upp-aisle"><input type="checkbox" checked={aisleOn} onChange={e => toggleAisle(e.target.checked)} /> Chừa lối đi 80 cm</label>
          )}
        </div>
        {message && <p className={`upp-msg ${message.tone}`}>{message.text}</p>}
      </div>

      {slot ? createPortal(controls, slot) : controls}
    </div>
  )
}
