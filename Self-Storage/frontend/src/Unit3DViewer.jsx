import React, { useEffect, useRef, useState } from 'react'
import { getUnitTypeStyle } from './unitTypes'
import { formatVnd } from './storageRules'
import { formatMeters, unitGeometry, unitPlanStatus } from './unitGeometry'
import './Unit3DViewer.css'

/*
 * Xem kho dạng 3D (CSS 3D, không cần thư viện / mạng).
 * - Hộp kho đúng tỉ lệ dài × rộng × cao, sàn kẻ ô 1 m, cửa cuốn ở mặt trước.
 * - Người cao 1,7 m đứng cạnh để khách hình dung độ lớn.
 * - Kéo chuột / vuốt để xoay, lăn chuột hoặc nút +/− để phóng to, phím mũi tên để xoay.
 */
const STATUS_TEXT = { free: 'Còn trống', rented: 'Đã có người thuê', off: 'Đang bảo trì' }
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const DEFAULT_VIEW = { ry: -38, rx: -24, zoom: 1 }

export default function Unit3DViewer({ unit, facilityName, onClose, onOpenDetail, onBook }) {
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
    const update = () => setSceneSize({ w: el.clientWidth || 600, h: el.clientHeight || 420 })
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
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
    const onWheel = event => {
      event.preventDefault()
      setView(v => ({ ...v, zoom: clamp(v.zoom * (event.deltaY < 0 ? 1.08 : 0.92), 0.55, 2.2) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = event => {
    drag.current = { x: event.clientX, y: event.clientY, view }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = event => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setView({ ...drag.current.view, ry: drag.current.view.ry + dx * 0.45, rx: clamp(drag.current.view.rx - dy * 0.35, -75, -4) })
  }
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

        <div className="u3d-body">
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
            <div className="u3d-controls" role="group" aria-label="Điều khiển góc nhìn">
              <button type="button" onClick={() => setView(v => ({ ...v, ry: v.ry - 30 }))} aria-label="Xoay trái">⟲</button>
              <button type="button" onClick={() => setView(v => ({ ...v, ry: v.ry + 30 }))} aria-label="Xoay phải">⟳</button>
              <button type="button" onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom * 1.15, 0.55, 2.2) }))} aria-label="Phóng to">+</button>
              <button type="button" onClick={() => setView(v => ({ ...v, zoom: clamp(v.zoom / 1.15, 0.55, 2.2) }))} aria-label="Thu nhỏ">−</button>
              <button type="button" onClick={() => setView(v => ({ ...v, rx: -72, ry: 0 }))}>Nhìn từ trên</button>
              <button type="button" onClick={() => setView(DEFAULT_VIEW)}>Đặt lại</button>
            </div>
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
function hintFor(geo) {
  if (geo.band === 'V') return 'Phù hợp gửi ô tô / xe máy, có lối vào rộng.'
  if (geo.isLocker) return 'Tủ nhỏ: vali, thùng giấy, hồ sơ, đồ dùng cá nhân.'
  if (geo.area <= 5) return 'Khoảng 20–30 thùng giấy hoặc đồ đạc của một phòng nhỏ.'
  if (geo.area <= 10) return 'Đồ đạc căn hộ 1 phòng ngủ: giường, tủ, bàn ghế, thùng đồ.'
  if (geo.area <= 20) return 'Đồ đạc căn hộ 2–3 phòng ngủ hoặc hàng hóa kinh doanh nhỏ.'
  return 'Đồ đạc cả căn nhà, hàng hóa, thiết bị văn phòng.'
}
