/**
 * ======================================================================
 * FILE: src/features/unit/Unit3DViewer.jsx  —  CỬA SỔ XEM KHO DẠNG 3D
 * 3 chế độ: "Kho trống" (CSS 3D, đúng tỉ lệ dài×rộng×cao, sàn kẻ ô 1 m, người cao 1,7 m để so sánh),
 * "Có đồ mẫu" (SampleRoom - Three.js), "Tự xếp thùng" (PackPlanner - Three.js).
 * Điều khiển: kéo chuột/vuốt để xoay, lăn chuột hoặc nút +/− để phóng to, phím mũi tên để xoay, Esc để đóng.
 * Không gọi API. Dùng ở: App.jsx (trang chi tiết cơ sở), FacilityFloorPlan.
 * ======================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { getUnitTypeStyle } from './unitTypes'
import { formatVnd } from '../../services/storageRules'
import { formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'
import './Unit3DViewer.css'
import { PackPlanner, SampleRoom } from './UnitPackPlanner'
import { EXACT_PACK_LIMIT, PACK_EFFICIENCY, aisleZones, autoPack, boxRequests, gridCapacity, itemType, volumeOf } from '../../utils/packing'
import './UnitPackPlanner.css'

/*
 * Xem kho dạng 3D (CSS 3D, không cần thư viện / mạng).
 * - Hộp kho đúng tỉ lệ dài × rộng × cao, sàn kẻ ô 1 m, cửa cuốn ở mặt trước.
 * - Người cao 1,7 m đứng cạnh để khách hình dung độ lớn.
 * - Kéo chuột / vuốt để xoay, lăn chuột hoặc nút +/− để phóng to, phím mũi tên để xoay.
 */
const STATUS_TEXT = { free: 'Còn trống', rented: 'Đã có người thuê', off: 'Đang bảo trì' }
/**
 * Giới hạn giá trị trong khoảng [min, max].
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const DEFAULT_VIEW = { ry: -38, rx: -24, zoom: 1 }

/**
 * Component cửa sổ xem kho 3D.
 * @param {object} props unit (kho mở ban đầu), facilityName, onClose, onOpenDetail(unit) (mở chi tiết kho),
 *   onBook(unit) (đặt kho — chỉ hiện khi kho còn trống), units (các kho cùng cơ sở, để gợi ý kho vừa số thùng).
 */
export default function Unit3DViewer({ unit: initialUnit, facilityName, onClose, onOpenDetail, onBook, units = [] }) {
  // Kho đang xem: ban đầu là kho được mở, đổi khi khách bấm một kho được gợi ý ở sidebar.
  const [unit, setUnit] = useState(initialUnit)
  const [counts, setCounts] = useState({ 'box-s': 0, 'box-m': 10, 'box-l': 0 })
  const [aisleOn, setAisleOn] = useState(true)
  const [autoRun, setAutoRun] = useState(false)
  const fit = useFittingUnits(units, counts, aisleOn)
  const geo = unitGeometry(unit)
  const status = unitPlanStatus(unit)
  const typeStyle = getUnitTypeStyle(unit.type)
  const [view, setView] = useState(DEFAULT_VIEW)
  const [mode, setMode] = useState('empty') // empty | sample | pack
  const drag = useRef(null)
  const sceneRef = useRef(null)
  const closeRef = useRef(null)
  const [sceneSize, setSceneSize] = useState({ w: 600, h: 420 })

  // Theo dõi kích thước khung để mô hình luôn vừa màn hình (cả điện thoại).
  useEffect(() => {
    const el = sceneRef.current
    if (!el) return undefined
    // Đo lại kích thước khung vẽ để mô hình luôn vừa màn hình (kể cả điện thoại).
    const update = () => setSceneSize({ w: el.clientWidth || 600, h: el.clientHeight || 420 })
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [mode])

  useEffect(() => {
    closeRef.current?.focus()
    // Phím tắt: Esc đóng cửa sổ; mũi tên trái/phải xoay ngang; lên/xuống đổi góc nhìn dọc.
    const onKey = event => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setView(v => ({ ...v, ry: v.ry - 10 }))
      if (event.key === 'ArrowRight') setView(v => ({ ...v, ry: v.ry + 10 }))
      if (event.key === 'ArrowUp') setView(v => ({ ...v, rx: clamp(v.rx - 6, -75, -4) }))
      if (event.key === 'ArrowDown') setView(v => ({ ...v, rx: clamp(v.rx + 6, -75, -4) }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Lăn chuột để phóng to (gắn thủ công để chặn cuộn trang).
  useEffect(() => {
    const el = sceneRef.current
    if (!el) return undefined
    // Lăn chuột để phóng to/thu nhỏ (chặn cuộn trang).
    const onWheel = event => {
      event.preventDefault()
      setView(v => ({ ...v, zoom: clamp(v.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.55, 2.2) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [mode])

  // Bắt đầu kéo để xoay: ghi lại vị trí con trỏ và góc nhìn hiện tại.
  const onPointerDown = event => {
    drag.current = { x: event.clientX, y: event.clientY, view }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  // Đang kéo: tính góc xoay mới theo khoảng chuột đã di chuyển.
  const onPointerMove = event => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setView({ ...drag.current.view, ry: drag.current.view.ry + dx * 0.45, rx: clamp(drag.current.view.rx - dy * 0.35, -75, -4) })
  }
  // Thả chuột: kết thúc thao tác kéo.
  const onPointerUp = () => { drag.current = null }

  // Tỉ lệ: cạnh lớn nhất (kể cả người 1,7 m) vừa khung.
  // Bề ngang cần chỗ cho cả người đứng bên trái (~0,9 m).
  const s = (sceneSize.w < 520 ? Math.min(sceneSize.w * 0.5, sceneSize.h * 0.55) : Math.min(sceneSize.w * 0.7, sceneSize.h * 0.78)) / Math.max(geo.length, geo.width + 0.9, geo.height * 1.15, 2)
  const W = geo.width * s
  const D = geo.length * s
  const H = geo.height * s
  const person = 1.7 * s
  const doorW = geo.isLocker ? W * 0.86 : Math.min(W * 0.78, 2.6 * s)
  const doorH = geo.isLocker ? H * 0.9 : Math.min(H * 0.84, 2.3 * s)
  /**
   * Vẽ một mặt của hộp kho (sàn/tường/cửa) bằng thẻ div có transform CSS 3D.
   * @param {number} w rộng (px), h cao (px), transform chuỗi transform CSS, className, children nội dung bên trong.
   */
  const face = (w, h, transform, className, children) => (
    <div className={`u3d-face ${className}`} style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform }}>{children}</div>
  )

  return (
    <div className="u3d-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="u3d-modal" role="dialog" aria-modal="true" aria-labelledby="u3d-title">
        <div className="u3d-head">
          <div>
            <span className={`u3d-status ${status}`}>{STATUS_TEXT[status]}</span>
            <h2 id="u3d-title">Kho {unit.id}</h2>
            <p>{facilityName} · {unit.type} · {geo.code}</p>
          </div>
          <button ref={closeRef} type="button" className="u3d-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="u3d-tabs" role="tablist" aria-label="Chế độ xem kho">
          {[['empty', 'Kho trống'], ['sample', 'Có đồ mẫu'], ['pack', 'Tự xếp thùng']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{label}</button>
          ))}
        </div>

        <div className={`u3d-body mode-${mode}`}>
          {mode === 'sample' && <div className="u3d-three"><SampleRoom geo={geo} color={typeStyle.color || '#075a9f'} /></div>}
          {mode === 'pack' && (
            <div className="u3d-three">
              <PackPlanner
                key={unit.id}
                geo={geo}
                color={typeStyle.color || '#075a9f'}
                counts={counts}
                onCountsChange={next => { setCounts(next); setAutoRun(false) }}
                aisleOn={aisleOn}
                onAisleChange={setAisleOn}
                autoRun={autoRun}
              />
            </div>
          )}
          {mode === 'empty' && (
          <div
            ref={sceneRef}
            className="u3d-scene"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label={`Mô hình 3D kho ${unit.id}: rộng ${formatMeters(geo.width)}, dài ${formatMeters(geo.length)}, cao ${formatMeters(geo.height)}`}
            style={{ '--u3d-color': typeStyle.color || '#075a9f', '--u3d-cell': `${s}px` }}
          >
            <div className="u3d-world" style={{ transform: `translateY(${H * 0.12}px) rotateX(${view.rx}deg) rotateY(${view.ry}deg) scale3d(${view.zoom}, ${view.zoom}, ${view.zoom})` }}>
              {/* Sàn kẻ ô 1 m + số đo */}
              {face(W, D, `rotateX(90deg) translateZ(${-H / 2}px)`, 'u3d-floor')}
              {face(W, H, `translateZ(${-D / 2}px)`, 'u3d-wall u3d-back')}
              {face(D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, 'u3d-wall u3d-side')}
              {face(D, H, `rotateY(90deg) translateZ(${W / 2}px)`, 'u3d-wall u3d-side')}
              {face(W, H, `translateZ(${D / 2}px)`, 'u3d-front', (
                <div className="u3d-door" style={{ width: doorW, height: doorH }}>
                  <span className="u3d-door-label">{unit.id}</span>
                </div>
              ))}
              {/* Số đo luôn quay về phía người xem (billboard) */}
              {[
                [formatMeters(geo.width), 0, H / 2 + 12, D / 2 + 16],
                [formatMeters(geo.length), W / 2 + 22, H / 2 + 12, 0],
                [formatMeters(geo.height), W / 2 + 24, 0, D / 2]
              ].map(([text, x, y, z]) => (
                <span key={`${text}-${x}-${z}`} className="u3d-dim" style={{ transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${-view.ry}deg) rotateX(${-view.rx}deg) translate(-50%, -50%)` }}>{text}</span>
              ))}
              {/* Người cao 1,7 m để so sánh, luôn quay mặt về phía người xem */}
              <div
                className="u3d-person"
                style={{
                  width: person * 0.32,
                  height: person,
                  marginLeft: -(person * 0.16),
                  marginTop: -person / 2,
                  transform: `translate3d(${-W / 2 - 0.55 * s}px, ${H / 2 - person / 2}px, ${D / 2 + 0.35 * s}px) rotateY(${-view.ry}deg)`
                }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 32 170" preserveAspectRatio="none">
                  <circle cx="16" cy="13" r="11" />
                  <path d="M5 30 Q16 24 27 30 L29 92 L23 92 L22 168 L17 168 L16 100 L15 168 L10 168 L9 92 L3 92 Z" />
                </svg>
                <small>1,7 m</small>
              </div>
            </div>
            <p className="u3d-tip">Kéo để xoay · lăn chuột để phóng to</p>
          </div>
          )}

          <aside className="u3d-info">
            <dl>
              <div><dt>Kích thước (rộng × dài)</dt><dd>{formatMeters(geo.width)} × {formatMeters(geo.length)}</dd></div>
              <div><dt>Diện tích</dt><dd>{geo.area.toLocaleString('vi-VN')} m²</dd></div>
              <div><dt>Chiều cao chuẩn</dt><dd>{formatMeters(geo.height)}</dd></div>
              <div><dt>Thể tích chứa</dt><dd>≈ {geo.volume.toLocaleString('vi-VN')} m³</dd></div>
              <div><dt>Loại kho</dt><dd>{unit.type}</dd></div>
              <div><dt>Giá thuê</dt><dd>{formatVnd(unit.price)}đ/tháng</dd></div>
            </dl>
            <p className="u3d-hint">{hintFor(geo)}</p>
            {mode === 'pack' && units.length > 0 && (
              <section className="u3d-fit" aria-live="polite">
                <h3>Kho vừa với số thùng của bạn</h3>
                {!fit.total && <p>Nhập số thùng ở khung bên trái để xem kho nào trong cơ sở xếp vừa.</p>}
                {fit.total > 0 && fit.pending && <p>{fit.estimated ? 'Đang ước tính' : 'Đang xếp thử'} {fit.total.toLocaleString('vi-VN')} thùng vào các kho còn trống…</p>}
                {fit.estimated && !fit.pending && <p>Trên {EXACT_PACK_LIMIT} thùng nên chỉ ước tính theo thể tích (hiệu suất xếp {Math.round(PACK_EFFICIENCY * 100)}%). Bấm một kho rồi "Xếp thử" để xếp thật.</p>}
                {fit.total > 0 && !fit.pending && !fit.results.length && <p>Không kho trống nào ở cơ sở này chứa đủ {fit.total.toLocaleString('vi-VN')} thùng{aisleOn ? ' (đã chừa lối đi)' : ''}. Thử bớt thùng hoặc xem cơ sở khác.</p>}
                {fit.total > 0 && !fit.pending && fit.results.length > 0 && (
                  <>
                    <p>{fit.results.length} kho còn trống {fit.estimated ? 'ước tính chứa được' : 'xếp vừa'} {fit.total.toLocaleString('vi-VN')} thùng{aisleOn ? ', đã chừa lối đi' : ''}. Rẻ nhất ở trên:</p>
                    <ul>
                      {fit.results.slice(0, 6).map(item => (
                        <li key={item.unit.id}>
                          <button
                            type="button"
                            className={item.unit.id === unit.id ? 'current' : ''}
                            onClick={() => { if (item.unit.id !== unit.id) { setUnit(item.unit); setAutoRun(true) } }}
                          >
                            <strong>Kho {item.unit.id}</strong>
                            <em>{formatVnd(item.unit.price)}đ/th</em>
                            <small>{formatMeters(item.geo.width)} × {formatMeters(item.geo.length)} · {getUnitTypeStyle(item.unit.type).label}</small>
                            <small>{item.unit.id === unit.id ? 'Đang xem' : `dùng ~${item.usedPct}%`}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {fit.results.length > 6 && <span className="u3d-fit-more">và {fit.results.length - 6} kho lớn hơn khác.</span>}
                  </>
                )}
              </section>
            )}
            {mode === 'empty' && <div className="u3d-controls" role="group" aria-label="Điều khiển góc nhìn">
              <button type="button" onClick={() => setView(v => ({ ...v, ry: v.ry - 30 }))} aria-label="Xoay trái">⟲</button>
              <button type="button" onClick={() => setView(v => ({ ...v, ry: v.ry + 30 }))} aria-label="Xoay phải">⟳</button>
              <button type="button" onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom * 1.15, 0.55, 2.2) }))} aria-label="Phóng to">+</button>
              <button type="button" onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom / 1.15, 0.55, 2.2) }))} aria-label="Thu nhỏ">−</button>
              <button type="button" onClick={() => setView(v => ({ ...v, rx: -72, ry: 0 }))}>Nhìn từ trên</button>
              <button type="button" onClick={() => setView(DEFAULT_VIEW)}>Đặt lại</button>
            </div>}
            <div className="u3d-actions">
              {onOpenDetail && <button type="button" className="dashboard-secondary-btn" onClick={() => onOpenDetail(unit)}>Xem chi tiết kho</button>}
              {status === 'free' && onBook && <button type="button" className="dashboard-primary-btn" onClick={() => onBook(unit)}>Đặt kho này</button>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/* Gợi ý sức chứa (ước lượng) cho khách dễ hình dung. */
/**
 * Gợi ý sức chứa ước lượng theo kích thước kho để khách dễ hình dung (vd "Đồ đạc căn hộ 1 phòng ngủ...").
 */
function hintFor(geo) {
  if (geo.band === 'V') return 'Phù hợp gửi ô tô / xe máy, có lối vào rộng.'
  const boxes = gridCapacity({ w: geo.width, h: geo.height, l: geo.length }, itemType('box-m'))
  const use = geo.isLocker ? 'vali, thùng giấy, hồ sơ, đồ dùng cá nhân'
    : geo.area <= 5 ? 'đồ đạc của một phòng nhỏ'
      : geo.area <= 10 ? 'đồ đạc căn hộ 1 phòng ngủ: giường, tủ, bàn ghế, thùng đồ'
        : geo.area <= 20 ? 'đồ đạc căn hộ 2–3 phòng ngủ hoặc hàng hóa kinh doanh nhỏ'
          : 'đồ đạc cả căn nhà, hàng hóa, thiết bị văn phòng'
  return `Chất kín được khoảng ${boxes.toLocaleString('vi-VN')} thùng vừa (60×40×40 cm), chưa chừa lối đi. Phù hợp ${use}.`
}

/**
 * Tìm các kho còn trống trong danh sách xếp vừa toàn bộ số thùng khách nhập.
 * - Đến EXACT_PACK_LIMIT thùng: xếp thử thật bằng autoPack (biến thể 'fit'; nếu 'fit' xếp hết thì nút "Xếp thử" cũng xếp hết).
 * - Nhiều hơn: ước tính theo thể tích dùng được (trừ lối đi) × PACK_EFFICIENCY, vì xếp thử thật mất quá lâu.
 * Mỗi cỡ kho chỉ tính 1 lần, chạy từng cỡ một (setTimeout) để không làm đứng giao diện; chờ 250 ms khi khách đang gõ.
 * @returns {{ total:number, pending:boolean, estimated:boolean, results: Array<{unit, geo, usedPct}> }} results sắp theo giá tăng dần.
 */
function useFittingUnits(units, counts, aisleOn) {
  const [state, setState] = useState({ total: 0, pending: false, estimated: false, results: [] })
  const unitsKey = units.map(u => `${u.id}:${unitPlanStatus(u)}`).join('|')
  const countsKey = JSON.stringify(counts)
  const unitsRef = useRef(units)
  unitsRef.current = units
  const groups = useMemo(() => {
    const map = new Map()
    unitsRef.current.filter(u => unitPlanStatus(u) === 'free').forEach(u => {
      const g = unitGeometry(u)
      const key = `${g.width}|${g.length}|${g.height}|${g.isLocker}|${g.band}`
      if (!map.has(key)) map.set(key, { geo: g, units: [] })
      map.get(key).units.push(u)
    })
    return [...map.values()].sort((a, b) => a.geo.volume - b.geo.volume)
  }, [unitsKey])

  useEffect(() => {
    const { requests, total, volume } = boxRequests(counts)
    const estimated = total > EXACT_PACK_LIMIT
    if (!total || !groups.length) { setState({ total, pending: false, estimated, results: [] }); return undefined }
    setState({ total, pending: true, estimated, results: [] })
    const out = []
    let i = 0
    let timer
    const step = () => {
      if (i >= groups.length) {
        out.sort((a, b) => a.unit.price - b.unit.price || a.geo.volume - b.geo.volume)
        setState({ total, pending: false, estimated, results: out })
        return
      }
      const { geo: g, units: list } = groups[i++]
      const room = { w: g.width, h: g.height, l: g.length }
      const roomVolume = room.w * room.h * room.l
      if (volume <= roomVolume) { // thể tích đồ lớn hơn kho thì chắc chắn không vừa, khỏi xếp thử
        const zones = aisleOn ? aisleZones(room, { isLocker: g.isLocker, vehicle: g.band === 'V' }) : []
        const fits = estimated
          ? volume <= (roomVolume - volumeOf(zones)) * PACK_EFFICIENCY
          : !autoPack(room, requests, zones, { prefer: 'fit' }).failed.length
        if (fits) list.forEach(u => out.push({ unit: u, geo: g, usedPct: Math.round((volume / roomVolume) * 100) }))
      }
      timer = setTimeout(step, 0)
    }
    timer = setTimeout(step, 250)
    return () => clearTimeout(timer)
  }, [groups, countsKey, aisleOn])

  return state
}
