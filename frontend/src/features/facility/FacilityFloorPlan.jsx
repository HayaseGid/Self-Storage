/**
 * ======================================================================
 * FILE: src/features/facility/FacilityFloorPlan.jsx  —  SƠ ĐỒ MẶT BẰNG KHO TRONG CƠ SỞ
 * CHỨC NĂNG: Khối "Sơ đồ mặt bằng" ở trang chi tiết cơ sở, vẽ bằng SVG như bản đồ nhìn từ trên xuống, tỉ lệ
 *   1 m = 10 px: bãi cỏ + cây quanh khuôn viên, sân bê tông, nhà kho tường dày, đường phía trước và lối xe vào cổng.
 *   Trong nhà kho: khu L (kho lớn) và khu V (kho xe) phía trên, khu S (kho nhỏ) và khu M (kho vừa) phía dưới,
 *   LỐI ĐI CHÍNH ở giữa có vạch vàng; mỗi kho có CỬA CUỐN (vạch đậm) quay ra lối đi. Mỗi kho vẽ theo kích thước lớn
 *   nhất của nhóm (đọc từ chuỗi size bằng unitGeometry). Chấm góc kho: xanh = còn trống, đỏ = đã thuê, xám = bảo trì;
 *   kho đã thuê / bảo trì có gạch chéo. Rê chuột / focus 1 kho -> khung thông tin (mã, kích thước, diện tích, giá,
 *   trạng thái) hiện ngay trên kho đó; bấm kho -> mở Unit3DViewer xem 3D. Kho không khớp bộ lọc (highlightIds) bị mờ.
 *   Lưu ý: DB chưa có tọa độ từng kho nên vị trí kho được xếp tự động theo khu (minh họa).
 * THÀNH PHẦN CHÍNH:
 *   - SCALE, ZONE_SLOTS, ZONE_STYLE (nội bộ): tỉ lệ, vị trí 4 khu, màu từng khu.
 *   - cellSize, shortLabel, layoutPlan (nội bộ): kích thước 1 ô kho, nhãn ngắn, bố cục toàn bộ khuôn viên (mét).
 *   - FacilityFloorPlan (default export).
 * DÙNG Ở: src/App.jsx (trang chi tiết cơ sở, dưới thẻ "Bản đồ cơ sở").
 * PHỤ THUỘC: features/unit/Unit3DViewer, utils/unitGeometry, services/storageRules (formatVnd), FacilityFloorPlan.css.
 * API: Không gọi API (dữ liệu kho do App truyền vào; đặt kho / thêm giỏ qua callback onBook, onAddToCart).
 * LUỒNG: App truyền facility + units -> layoutPlan (useMemo) xếp kho vào 4 khu quanh lối đi -> vẽ SVG
 *   -> rê chuột: setHover(cell) hiện khung thông tin -> bấm: setSelected(unit) mở <Unit3DViewer> -> đóng: setSelected(null).
 * ======================================================================
 */
import React, { useMemo, useState } from 'react'
import { formatVnd } from '../../services/storageRules'
import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'
import Unit3DViewer from '../unit/Unit3DViewer'
import './FacilityFloorPlan.css'

/* Tỉ lệ vẽ: 1 mét = 10 px (đơn vị của viewBox SVG). */
const SCALE = 10
/* Kích thước bố cục (mét). */
const SIDE = 2          // lề trong tường hai bên
const END = 1.5         // lề trong tường trên / dưới
const LABEL = 5         // chỗ đặt nhãn khu (phía ngoài dãy kho)
const AISLE = 5.5       // lối đi chính
const COL_GAP = 6       // khoảng giữa cột khu trái và phải
const MAX_ROW = 48      // dãy kho dài hơn thì xuống dãy mới (xa lối đi hơn)
const LAWN = 3.5        // dải cỏ quanh khuôn viên
const YARD = 3.5        // sân quanh nhà kho
const FRONT = 7         // sân phía trước nhà kho (cổng vào, thước tỉ lệ)
const ROAD = 7          // đường phía trước
const GATE = 7          // bề rộng cổng (khoảng hở tường)
/* Vị trí khu theo nhóm size: [hàng, cột]. */
const ZONE_SLOTS = { L: ['top', 'left'], V: ['top', 'right'], S: ['bottom', 'left'], M: ['bottom', 'right'] }
/* Màu từng khu: nền ô, viền, chữ, nền nhãn khu. */
const ZONE_STYLE = {
  L: { fill: '#fbebe5', stroke: '#cf7a62', text: '#8f3a22', badge: '#9c3d1f' },
  V: { fill: '#efeeea', stroke: '#8f8d84', text: '#45433c', badge: '#5f5d56' },
  S: { fill: '#e6f5ec', stroke: '#4fa877', text: '#226b43', badge: '#1d6b45' },
  M: { fill: '#ecebfc', stroke: '#7c6fdc', text: '#3e32a3', badge: '#4e3fc0' },
  X: { fill: '#eef3f7', stroke: '#8fa6ba', text: '#2f4c64', badge: '#3f5a72' }
}
const STATUS_COLOR = { free: '#22a35a', rented: '#e53935', off: '#9aa8b5' }
const STATUS_TEXT = { free: 'Còn trống', rented: 'Đã có người thuê', off: 'Đang bảo trì' }

/** Số mét kiểu Việt Nam, không kèm đơn vị (vd 4.5 -> "4,5"). */
const num = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

/**
 * Kích thước 1 ô kho trên sơ đồ (mét): w = cạnh có cửa (dọc theo lối đi), d = chiều sâu vào trong.
 * @param {{width:number, length:number}} geo kết quả unitGeometry (kích thước lớn nhất của nhóm).
 */
const cellSize = geo => ({ w: geo.width, d: geo.length })

/**
 * Nhãn ngắn trong ô kho: phần sau dấu "-" cuối (vd "Q1-U12" -> "U12"); ô hẹp chỉ hiện số.
 * @param {string} id mã kho. @param {number} widthPx bề ngang ô (px).
 */
function shortLabel(id, widthPx) {
  const text = String(id)
  const tail = text.includes('-') ? text.slice(text.lastIndexOf('-') + 1) : text
  if (widthPx >= 34) return tail
  const digits = tail.replace(/\D/g, '')
  return digits || tail.slice(-2)
}

/**
 * Tính bố cục khuôn viên (đơn vị mét): gom kho theo nhóm size thành khu, đặt 4 khu quanh lối đi trong nhà kho,
 * rồi tính nhà kho, sân, bãi cỏ, đường. Nhóm lạ xếp thêm vào cột trái hàng dưới.
 * @param {object[]} units danh sách kho.
 */
function layoutPlan(units) {
  const groups = new Map()
  units.forEach(unit => {
    const geo = unitGeometry(unit)
    if (!groups.has(geo.band)) groups.set(geo.band, [])
    groups.get(geo.band).push({ unit, geo, status: unitPlanStatus(unit) })
  })
  const order = band => (BAND_ORDER.includes(band) ? BAND_ORDER.indexOf(band) : 99)
  const zones = [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([band, items]) => {
      items.sort((a, b) => String(a.unit.id).localeCompare(String(b.unit.id), 'vi', { numeric: true }))
      const big = items.reduce((m, it) => (it.geo.area > m.geo.area ? it : m), items[0])
      const cell = cellSize(big.geo)
      const perRow = Math.max(1, Math.min(items.length, Math.floor(MAX_ROW / cell.w)))
      const rows = Math.ceil(items.length / perRow)
      const [row, col] = ZONE_SLOTS[band] || ['bottom', 'left']
      return { band, items, cell, code: big.geo.code, perRow, rows, row, col, w: perRow * cell.w, h: rows * cell.d }
    })

  const slot = (row, col) => zones.filter(z => z.row === row && z.col === col)
  const slotWidth = (row, col) => slot(row, col).reduce((s, z, i) => s + z.w + (i ? COL_GAP : 0), 0)
  const slotDepth = row => Math.max(0, ...zones.filter(z => z.row === row).map(z => z.h))
  const leftW = Math.max(slotWidth('top', 'left'), slotWidth('bottom', 'left'), 14)
  const rightW = Math.max(slotWidth('top', 'right'), slotWidth('bottom', 'right'))
  const topD = slotDepth('top')
  const bottomD = slotDepth('bottom')

  // Nhà kho (tọa độ trong khuôn viên)
  const bx = LAWN + YARD
  const by = LAWN + YARD
  const bw = SIDE * 2 + leftW + (rightW ? COL_GAP + rightW : 0)
  const aisleY = by + END + (topD ? LABEL + topD : 0)
  const bh = (aisleY - by) + AISLE + (bottomD ? bottomD + LABEL : 0) + END
  // Sân, đường, toàn khuôn viên
  const yard = { x: LAWN, y: LAWN, w: bw + YARD * 2, h: bh + YARD + FRONT }
  const roadY = yard.y + yard.h + 2.5
  const width = bw + (LAWN + YARD) * 2
  const height = roadY + ROAD + 2

  const cells = []
  ;['top', 'bottom'].forEach(row => ['left', 'right'].forEach(col => {
    let x = bx + SIDE + (col === 'right' ? leftW + COL_GAP : 0)
    slot(row, col).forEach(zone => {
      zone.x = x
      zone.y = row === 'top' ? aisleY - zone.h : aisleY + AISLE
      zone.items.forEach((it, i) => {
        const r = Math.floor(i / zone.perRow)
        const c = i % zone.perRow
        const y = row === 'top' ? aisleY - (r + 1) * zone.cell.d : aisleY + AISLE + r * zone.cell.d
        cells.push({ ...it, band: zone.band, row, firstRow: r === 0, x: x + c * zone.cell.w, y, w: zone.cell.w, d: zone.cell.d })
      })
      x += zone.w + COL_GAP
    })
  }))
  return { width, height, bx, by, bw, bh, aisleY, yard, roadY, zones, cells, leftW, rightW }
}

/**
 * Component sơ đồ mặt bằng kho của cơ sở: header + chú thích, sơ đồ SVG kèm khung thông tin khi rê chuột,
 * và cửa sổ 3D của kho đang chọn. Trả null nếu cơ sở không có kho nào.
 * @param {object} props facility, units (danh sách kho), highlightIds (Set mã kho khớp bộ lọc, kho khác bị làm mờ),
 *   onOpenDetail(unit), onBook(unit), otherUnits + onOpenOther (truyền cho cửa sổ 3D để gợi ý kho ở cơ sở khác),
 *   onAddToCart(units) (thêm nhiều kho vào giỏ từ cửa sổ 3D).
 */
export default function FacilityFloorPlan({ facility, units, highlightIds = null, onOpenDetail, onBook, otherUnits = [], onOpenOther, onAddToCart }) {
  const [selected, setSelected] = useState(null) // kho đang mở trong cửa sổ 3D (null = đóng)
  const [hover, setHover] = useState(null) // ô kho đang rê chuột / focus (hiện khung thông tin)
  const plan = useMemo(() => layoutPlan(units), [units])

  // Đếm số kho theo trạng thái để hiện ở chú thích.
  const counts = units.reduce((acc, unit) => {
    acc[unitPlanStatus(unit)] += 1
    return acc
  }, { free: 0, rented: 0, off: 0 })

  if (!units.length) return null
  const px = m => m * SCALE
  const W = px(plan.width)
  const H = px(plan.height)
  const bx = px(plan.bx)
  const by = px(plan.by)
  const bw = px(plan.bw)
  const bh = px(plan.bh)
  const gateX = bx + bw / 2
  const gateHalf = px(GATE) / 2
  const aisleY = px(plan.aisleY)
  const aisleH = px(AISLE)
  const roadY = px(plan.roadY)
  // Cây dọc 2 dải cỏ trái / phải
  const trees = []
  for (let y = px(LAWN) + 30; y < roadY - 30; y += 90) trees.push(y)

  // Khung thông tin khi rê chuột: đặt trên ô kho (ô sát mép trên thì đặt dưới), canh trái / phải ở 2 mép.
  const tip = hover && (() => {
    const cx = px(hover.x + hover.w / 2)
    const above = px(hover.y) > H * 0.3
    const left = (cx / W) * 100
    return {
      style: { left: `${left}%`, top: `${((above ? px(hover.y) : px(hover.y + hover.d)) / H) * 100}%` },
      cls: `${above ? 'above' : 'below'}${left < 18 ? ' edge-left' : left > 82 ? ' edge-right' : ''}`
    }
  })()

  return (
    <section className="fp-plan" aria-labelledby="fp-plan-title">
      <div className="fp-plan-head">
        <div>
          <div className="eyebrow">FLOOR PLAN</div>
          <h2 id="fp-plan-title">Sơ đồ mặt bằng</h2>
          <p>Nhìn từ trên xuống, tỉ lệ 1 m = 10 px. Rê chuột vào kho để xem kích thước và giá, bấm để xem kho dạng 3D.</p>
        </div>
        <ul className="fp-legend" aria-label="Chú thích">
          <li><span className="fp-dot free" aria-hidden="true" /> Còn trống <b>{counts.free}</b></li>
          <li><span className="fp-dot rented" aria-hidden="true" /> Đã thuê <b>{counts.rented}</b></li>
          {counts.off > 0 && <li><span className="fp-dot off" aria-hidden="true" /> Bảo trì <b>{counts.off}</b></li>}
        </ul>
      </div>

      <div className="fp-canvas">
        <div className="fp-stage" style={{ minWidth: Math.min(W, 680) }} onMouseLeave={() => setHover(null)}>
          <svg className="fp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sơ đồ mặt bằng ${facility.name}`}>
            <defs>
              <pattern id="fp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#6f7c88" strokeWidth="1.2" opacity=".3" />
              </pattern>
              <marker id="fp-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill="#7d8790" />
              </marker>
            </defs>

            {/* Bãi cỏ + cây */}
            <rect className="fp-lawn" x="0" y="0" width={W} height={H} rx="22" />
            {trees.map(y => (
              <g key={y} className="fp-tree">
                <circle cx={px(LAWN) / 2} cy={y} r="12" />
                <circle cx={W - px(LAWN) / 2} cy={y} r="12" />
              </g>
            ))}

            {/* Sân bê tông + lối xe từ cổng ra đường */}
            <rect className="fp-yard" x={px(plan.yard.x)} y={px(plan.yard.y)} width={px(plan.yard.w)} height={px(plan.yard.h)} rx="10" />
            <rect className="fp-yard" x={gateX - gateHalf - 30} y={px(plan.yard.y + plan.yard.h) - 4} width={px(GATE) + 60} height={roadY - px(plan.yard.y + plan.yard.h) + 8} />

            {/* Đường phía trước */}
            <rect className="fp-road" x="0" y={roadY} width={W} height={px(ROAD)} />
            <line className="fp-road-line" x1="0" y1={roadY + px(ROAD) / 2} x2={W} y2={roadY + px(ROAD) / 2} />

            {/* Nền nhà kho + lối đi chính có vạch vàng */}
            <rect className="fp-floor" x={bx} y={by} width={bw} height={bh} />
            <rect className="fp-aisle" x={bx} y={aisleY} width={bw} height={aisleH} />
            <line className="fp-aisle-line" x1={bx + 10} y1={aisleY + aisleH / 2} x2={bx + bw - 10} y2={aisleY + aisleH / 2} />
            <text className="fp-aisle-text" x={bx + 12} y={aisleY + 14}>Lối đi chính · rộng {num(AISLE)} m</text>

            {/* Từng kho + cửa cuốn quay ra lối đi */}
            {plan.cells.map(cell => {
              const style = ZONE_STYLE[cell.band] || ZONE_STYLE.X
              const dimmed = highlightIds && !highlightIds.has(cell.unit.id)
              const x = px(cell.x)
              const y = px(cell.y)
              const w = px(cell.w)
              const h = px(cell.d)
              const label = shortLabel(cell.unit.id, w)
              const isActive = selected?.id === cell.unit.id || hover?.unit.id === cell.unit.id
              const doorY = cell.row === 'top' ? y + h - 5 : y
              const dotY = cell.row === 'top' ? y + 7 : y + h - 7
              const badge = w >= 34 && h >= 34
              const r = Math.min(13, w * 0.3)
              return (
                <g
                  key={cell.unit.id}
                  className={`fp-cell ${cell.status}${dimmed ? ' dim' : ''}${isActive ? ' active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Kho ${cell.unit.id}, ${num(cell.geo.width)} x ${num(cell.geo.length)} m, ${STATUS_TEXT[cell.status].toLowerCase()}, ${formatVnd(cell.unit.price)} đồng mỗi tháng. Bấm để xem 3D.`}
                  onClick={() => setSelected(cell.unit)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(cell.unit) } }}
                  onMouseEnter={() => setHover(cell)}
                  onFocus={() => setHover(cell)}
                  onBlur={() => setHover(cur => (cur?.unit.id === cell.unit.id ? null : cur))}
                >
                  <rect className="fp-cell-box" x={x} y={y} width={w} height={h} fill={style.fill} stroke={style.stroke} />
                  {cell.status !== 'free' && <rect x={x} y={y} width={w} height={h} fill="url(#fp-hatch)" pointerEvents="none" />}
                  {cell.firstRow && <rect className="fp-door" x={x + Math.min(5, w * 0.12)} y={doorY} width={w - Math.min(10, w * 0.24)} height="5" rx="1" />}
                  {badge && <circle cx={x + w / 2} cy={y + h / 2} r={r} fill="#fff" />}
                  <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fill={style.text} className="fp-cell-text" style={{ fontSize: badge ? Math.min(12, r * 0.95) : Math.max(8.5, Math.min(11, w / 2.4)) }}>{label}</text>
                  <circle cx={x + w - 6} cy={dotY} r={w < 26 ? 2.6 : 3.4} fill={STATUS_COLOR[cell.status]} stroke="#fff" strokeWidth="1" />
                </g>
              )
            })}

            {/* Nhãn khu dạng thẻ màu: hàng trên ở phía trên dãy kho, hàng dưới ở phía dưới */}
            {plan.zones.map(zone => {
              const style = ZONE_STYLE[zone.band] || ZONE_STYLE.X
              const title = `Khu ${zone.band} · ${zone.items.length} kho`
              const sub = `Kho ${num(zone.cell.w)} × ${num(zone.cell.d)} m (${zone.code})`
              const bw2 = Math.max(title.length * 8.2, sub.length * 6.6) + 26
              const cx = px(zone.x + zone.w / 2)
              const cy = zone.row === 'top' ? px(zone.y - LABEL / 2) : px(zone.y + zone.h + LABEL / 2)
              return (
                <g key={zone.band} className="fp-zone-badge" pointerEvents="none">
                  <rect x={cx - bw2 / 2} y={cy - 19} width={bw2} height="38" rx="9" fill={style.badge} />
                  <text x={cx} y={cy - 5} textAnchor="middle" className="fp-zone-title">{title}</text>
                  <text x={cx} y={cy + 11} textAnchor="middle" className="fp-zone-sub">{sub}</text>
                </g>
              )
            })}

            {/* Tường nhà kho (dày), chừa khoảng hở ở cổng */}
            <path className="fp-wall" d={`M ${gateX - gateHalf} ${by + bh} H ${bx} V ${by} H ${bx + bw} V ${by + bh} H ${gateX + gateHalf}`} />

            {/* Cổng vào + mũi tên vào lối đi */}
            <line x1={gateX} y1={by + bh + 24} x2={gateX} y2={aisleY + aisleH / 2 + 12} stroke="#7d8790" strokeWidth="1.5" markerEnd="url(#fp-arrow)" />
            <g className="fp-gate" pointerEvents="none">
              <rect x={gateX - 48} y={by + bh + 22} width="96" height="30" rx="15" />
              <text x={gateX} y={by + bh + 37} textAnchor="middle" dominantBaseline="central">Cổng vào</text>
            </g>

            {/* Thước tỉ lệ 10 m */}
            <g className="fp-scale" pointerEvents="none">
              <path d={`M ${bx} ${by + bh + 37} v -8 M ${bx} ${by + bh + 33} H ${bx + px(10)} M ${bx + px(10)} ${by + bh + 29} v 8`} />
              <text x={bx + px(10) + 10} y={by + bh + 33} dominantBaseline="central">10 m</text>
            </g>
          </svg>

          {/* Khung thông tin kho đang rê chuột (đặt ngay trên ô kho) */}
          {hover && (
            <div className={`fp-tip ${tip.cls}`} style={tip.style} role="tooltip">
              <div className="fp-tip-head">
                <strong>Kho {hover.unit.id}</strong>
                <span className={`fp-tip-status ${hover.status}`}>{STATUS_TEXT[hover.status]}</span>
              </div>
              <div className="fp-tip-row"><span>Loại</span><b>{BAND_LABELS[hover.band] || hover.geo.code} · {hover.geo.code}</b></div>
              <div className="fp-tip-row"><span>Kích thước</span><b>{formatMeters(hover.geo.width)} × {formatMeters(hover.geo.length)}</b></div>
              <div className="fp-tip-row"><span>Diện tích</span><b>{hover.geo.area.toLocaleString('vi-VN')} m²</b></div>
              <div className="fp-tip-price">{formatVnd(hover.unit.price)}đ<small>/tháng</small></div>
              <em>Bấm để xem kho 3D</em>
            </div>
          )}
        </div>
      </div>
      <p className="fp-swipe">↔ Vuốt ngang để xem hết sơ đồ</p>
      <p className="fp-note">Sơ đồ minh họa: các kho được xếp theo khu kích thước, vị trí thực tế có thể khác.</p>

      {selected && (
        <Unit3DViewer
          unit={selected}
          facilityName={facility.name}
          units={units}
          otherUnits={otherUnits}
          onOpenOther={onOpenOther}
          onAddToCart={onAddToCart ? list => { setSelected(null); onAddToCart(list) } : undefined}
          onClose={() => setSelected(null)}
          onOpenDetail={onOpenDetail}
          onBook={onBook}
        />
      )}
    </section>
  )
}
