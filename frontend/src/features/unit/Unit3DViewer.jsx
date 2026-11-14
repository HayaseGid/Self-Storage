/**
 * ======================================================================
 * FILE: src/features/unit/Unit3DViewer.jsx  —  CỬA SỔ XEM KHO DẠNG 3D
 * 3 chế độ: "Kho trống" (CSS 3D, đúng tỉ lệ dài×rộng×cao, sàn kẻ ô 1 m, người cao 1,7 m để so sánh),
 * "Có đồ mẫu" (SampleRoom - Three.js), "Tự xếp thùng" (PackPlanner - Three.js).
 * Điều khiển: kéo chuột/vuốt để xoay, lăn chuột hoặc nút +/− để phóng to, phím mũi tên để xoay, Esc để đóng.
 * Không gọi API. Dùng ở: App.jsx (trang chi tiết cơ sở), FacilityFloorPlan.
 * ======================================================================
 */
import React, { useEffect, useRef, useState } from 'react'
import { getUnitTypeStyle } from './unitTypes'
import { formatVnd } from '../../services/storageRules'
import { formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'
import './Unit3DViewer.css'
import { PackPlanner, SampleRoom } from './UnitPackPlanner'
<<<<<<< HEAD
import { gridCapacity, itemType } from '../../utils/packing'
import { loadBoxCounts, saveBoxCounts } from './boxCounts'
import { useBoxFit } from './useBoxFit'
=======
>>>>>>> parent of 52945b8 (Update 3d)
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
<<<<<<< HEAD
 * @param {object} props unit (kho mở ban đầu), facilityName, onClose, onOpenDetail(unit) (mở chi tiết kho),
 *   onBook(unit) (đặt kho — chỉ hiện khi kho còn trống), units (các kho cùng cơ sở, để gợi ý kho vừa đồ của khách),
 *   otherUnits ([{ facility, unit }] kho ở cơ sở khác, gợi ý khi cơ sở này không có kho vừa),
 *   onOpenOther(facility, unit) (mở trang kho ở cơ sở khác).
 */
export default function Unit3DViewer({ unit: initialUnit, facilityName, onClose, onOpenDetail, onBook, units = [], otherUnits = [], onOpenOther }) {
  // Kho đang xem: ban đầu là kho được mở, đổi khi khách bấm một kho được gợi ý ở sidebar.
  const [unit, setUnit] = useState(initialUnit)
  const [counts, setCounts] = useState(loadBoxCounts) // nhớ số thùng khách đã nhập (trong tab đang mở)
  const [aisleOn, setAisleOn] = useState(true)
  const [autoRun, setAutoRun] = useState(false)
  const [packSlot, setPackSlot] = useState(null) // ô ở cột phải để PackPlanner vẽ danh sách đồ + nhập số thùng
  const [mode, setMode] = useState('empty') // empty | sample | pack
  useEffect(() => { saveBoxCounts(counts) }, [JSON.stringify(counts)])
  // Chỉ tính gợi ý khi đang ở tab "Tự xếp thùng" (tab khác truyền danh sách rỗng -> không chạy worker).
  const packActive = mode === 'pack'
  // Kho còn trống trong cơ sở xếp vừa đồ của khách (ước tính ngay, rồi xếp thử thật trong Web Worker), rẻ nhất trước.
  const freeUnits = units.filter(u => unitPlanStatus(u) === 'free')
  const fit = useBoxFit(packActive ? freeUnits : [], counts, aisleOn)
  const fitResults = freeUnits
    .filter(fit.fits)
    .map(u => ({ unit: u, geo: unitGeometry(u), usedPct: fit.usedPctOf(u) }))
    .sort((a, b) => a.unit.price - b.unit.price || a.geo.volume - b.geo.volume)
  // Cơ sở này không có kho vừa -> tìm ở cơ sở khác.
  const otherFree = otherUnits.filter(x => unitPlanStatus(x.unit) === 'free')
  const needOther = packActive && fit.total > 0 && !fit.pending && fitResults.length === 0 && otherFree.length > 0
  const otherFit = useBoxFit(needOther ? otherFree.map(x => x.unit) : [], counts, aisleOn)
  const otherResults = needOther
    ? otherFree
      .filter(x => otherFit.fits(x.unit))
      .map(x => ({ ...x, geo: unitGeometry(x.unit) }))
      .sort((a, b) => a.unit.price - b.unit.price || a.geo.volume - b.geo.volume)
    : []
=======
 * @param {object} props unit (kho), facilityName, onClose, onOpenDetail(unit) (mở chi tiết kho),
 *   onBook(unit) (đặt kho — chỉ hiện khi kho còn trống).
 */
export default function Unit3DViewer({ unit, facilityName, onClose, onOpenDetail, onBook }) {
>>>>>>> parent of 52945b8 (Update 3d)
  const geo = unitGeometry(unit)
  const status = unitPlanStatus(unit)
  const typeStyle = getUnitTypeStyle(unit.type)
  const [view, setView] = useState(DEFAULT_VIEW)
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
      <div className={`u3d-modal${mode === 'pack' ? ' is-pack' : ''}`} role="dialog" aria-modal="true" aria-labelledby="u3d-title">
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
<<<<<<< HEAD
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
                slot={packSlot}
              />
            </div>
          )}
=======
          {mode === 'pack' && <div className="u3d-three"><PackPlanner geo={geo} color={typeStyle.color || '#075a9f'} /></div>}
>>>>>>> parent of 52945b8 (Update 3d)
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
            {mode === 'pack' && <div ref={setPackSlot} className="u3d-pack-slot" />}
            <dl>
              <div><dt>Kích thước (rộng × dài)</dt><dd>{formatMeters(geo.width)} × {formatMeters(geo.length)}</dd></div>
              <div><dt>Diện tích</dt><dd>{geo.area.toLocaleString('vi-VN')} m²</dd></div>
              <div><dt>Chiều cao chuẩn</dt><dd>{formatMeters(geo.height)}</dd></div>
              <div><dt>Thể tích chứa</dt><dd>≈ {geo.volume.toLocaleString('vi-VN')} m³</dd></div>
              <div><dt>Loại kho</dt><dd>{unit.type}</dd></div>
              <div><dt>Giá thuê</dt><dd>{formatVnd(unit.price)}đ/tháng</dd></div>
            </dl>
            <p className="u3d-hint">{hintFor(geo)}</p>
<<<<<<< HEAD
            {mode === 'pack' && units.length > 0 && (
              <section className="u3d-fit" aria-live="polite">
                <h3>Kho vừa với đồ của bạn</h3>
                {!fit.total && <p>Nhập số thùng / đồ ở khung phía trên để xem kho nào trong cơ sở xếp vừa.</p>}
                {fit.total > 0 && fit.pending && !fitResults.length && <p>Đang xếp thử {fit.total.toLocaleString('vi-VN')} món vào các kho còn trống…</p>}
                {fit.total > 0 && !fit.pending && !fitResults.length && <p>Không kho trống nào ở cơ sở này chứa đủ {fit.total.toLocaleString('vi-VN')} món{aisleOn ? ' (đã chừa lối đi)' : ''}.</p>}
                {needOther && otherFit.pending && !otherResults.length && <p>Đang tìm kho vừa ở cơ sở khác…</p>}
                {needOther && !otherFit.pending && !otherResults.length && <p>Các cơ sở khác cũng chưa có kho trống đủ chỗ. Thử bớt đồ.</p>}
                {otherResults.length > 0 && (
                  <>
                    <p className="u3d-fit-sub">Kho {otherFit.estimated ? 'ước tính vừa' : 'xếp vừa'} ở cơ sở khác, rẻ nhất ở trên:</p>
                    <ul>
                      {otherResults.slice(0, 5).map(item => (
                        <li key={`${item.facility.facilityId}-${item.unit.id}`}>
                          <button type="button" disabled={!onOpenOther} onClick={() => onOpenOther?.(item.facility, item.unit)}>
                            <strong>Kho {item.unit.id}</strong>
                            <em>{formatVnd(item.unit.price)}đ/th</em>
                            <small>{item.facility.name}</small>
                            <small>{formatMeters(item.geo.width)} × {formatMeters(item.geo.length)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {otherResults.length > 5 && <span className="u3d-fit-more">và {otherResults.length - 5} kho khác.</span>}
                  </>
                )}
                {fit.total > 0 && fitResults.length > 0 && (
                  <>
                    <p>{fitResults.length} kho còn trống {fit.estimated ? 'ước tính chứa được' : 'xếp vừa'} {fit.total.toLocaleString('vi-VN')} món{aisleOn ? ', đã chừa lối đi' : ''}. Rẻ nhất ở trên:</p>
                    {fit.pending && <p className="u3d-fit-pending">Đang xếp thử để kiểm tra chính xác…</p>}
                    <ul>
                      {fitResults.slice(0, 6).map(item => (
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
                    {fitResults.length > 6 && <span className="u3d-fit-more">và {fitResults.length - 6} kho lớn hơn khác.</span>}
                  </>
                )}
              </section>
            )}
=======
>>>>>>> parent of 52945b8 (Update 3d)
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
<<<<<<< HEAD
  const boxes = gridCapacity({ w: geo.width, h: geo.height, l: geo.length }, itemType('box-m'))
  const use = geo.isLocker ? 'vali, thùng giấy, hồ sơ, đồ dùng cá nhân'
    : geo.area <= 5 ? 'đồ đạc của một phòng nhỏ'
      : geo.area <= 10 ? 'đồ đạc căn hộ 1 phòng ngủ: giường, tủ, bàn ghế, thùng đồ'
        : geo.area <= 20 ? 'đồ đạc căn hộ 2–3 phòng ngủ hoặc hàng hóa kinh doanh nhỏ'
          : 'đồ đạc cả căn nhà, hàng hóa, thiết bị văn phòng'
  return `Chất kín được khoảng ${boxes.toLocaleString('vi-VN')} thùng vừa (60×40×40 cm), chưa chừa lối đi. Phù hợp ${use}.`
=======
  if (geo.isLocker) return 'Tủ nhỏ: vali, thùng giấy, hồ sơ, đồ dùng cá nhân.'
  if (geo.area <= 5) return 'Khoảng 20–30 thùng giấy hoặc đồ đạc của một phòng nhỏ.'
  if (geo.area <= 10) return 'Đồ đạc căn hộ 1 phòng ngủ: giường, tủ, bàn ghế, thùng đồ.'
  if (geo.area <= 20) return 'Đồ đạc căn hộ 2–3 phòng ngủ hoặc hàng hóa kinh doanh nhỏ.'
  return 'Đồ đạc cả căn nhà, hàng hóa, thiết bị văn phòng.'
>>>>>>> parent of 52945b8 (Update 3d)
}
