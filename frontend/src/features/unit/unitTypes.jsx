/**
 * ======================================================================
 * FILE: src/features/unit/unitTypes.jsx  —  LOẠI KHO, HẠNG KÍCH THƯỚC & ẢNH KHO
 * CHỨC NĂNG: Nhận diện loại kho dùng chung cho toàn bộ giao diện: màu, icon, tên tiếng Việt, mô tả ngắn, ảnh
 *   cho từng loại (Kho lạnh, Kho mát, Kho tiêu chuẩn, Kho trong nhà, Kho xe vào tận nơi, Kho khác) và phân hạng
 *   kích thước (Nhỏ / Vừa / Lớn / Rất lớn). Tên loại kho trong database là tiếng Anh (Climate-Control Unit,
 *   Drive-up Unit, Basic Unit, Indoor Unit...); getUnitTypeKey() nhận diện theo từ khóa nên vẫn chạy đúng nếu sau
 *   này đổi tên hoặc thêm loại (vd "Kho lạnh").
 *   ẢNH THẬT: mỗi loại có danh sách `photos` (ảnh trong frontend/public/unit-types/, nguồn Unsplash miễn phí).
 *   Mỗi kho chọn 1 ảnh theo mã kho nên các kho cùng loại ít bị trùng ảnh; để mảng rỗng thì dùng ảnh SVG vẽ sẵn.
 * THÀNH PHẦN CHÍNH:
 *   - UNIT_TYPE_STYLES, UNIT_TYPE_ORDER: bộ style và thứ tự hiển thị của 6 loại kho.
 *   - getUnitTypeKey, getUnitTypeStyle: tên loại (DB) -> khóa / style.
 *   - parseUnitSize: chuỗi size -> mã, nhãn, diện tích, hạng kích thước.
 *   - UnitTypeIcon, UnitTypeChip, SizeMeter, UnitTypeArt: các component hiển thị icon, nhãn, thanh hạng, ảnh kho.
 * DÙNG Ở: src/App.jsx, features/unit/Unit3DViewer.jsx, pages/business/BusinessPanels.jsx,
 *   pages/customer/CartPage.jsx, CustomerAccount.jsx, pages/manager/FacilityManagerAccount.jsx.
 * PHỤ THUỘC: react (useId). CSS ở unitTypes.css (được import ở nơi khác).
 * API: Không gọi API.
 * LUỒNG: trang có object kho từ backend (unit.type, unit.size, unit.code) -> <UnitTypeChip type=...>,
 *   <UnitTypeArt type size unitCode> -> getUnitTypeStyle / parseUnitSize -> vẽ nhãn màu, ảnh thật hoặc ảnh SVG.
 * ======================================================================
 */
import React, { useId } from 'react'

/**
 * Bộ style của từng loại kho: key, label (tên đầy đủ), short (tên ngắn), description, feature (điểm nổi bật),
 * color (màu chính), soft (màu nền nhạt), gradient (2 màu nền ảnh SVG), photos (đường dẫn ảnh thật).
 */
export const UNIT_TYPE_STYLES = {
  cold: {
    key: 'cold',
    label: 'Kho lạnh',
    short: 'Lạnh',
    description: 'Giữ nhiệt độ thấp ổn định cho hàng cần bảo quản lạnh.',
    feature: 'Nhiệt độ 0–8°C',
    color: '#1d5fd1',
    soft: '#e6efff',
    gradient: ['#cfe2ff', '#8fb8f7'],
    photos: ['/unit-types/cold-1.jpg', '/unit-types/cold-2.jpg', '/unit-types/cold-3.jpg']
  },
  climate: {
    key: 'climate',
    label: 'Kho mát',
    short: 'Mát',
    description: 'Điều hòa nhiệt độ và độ ẩm, phù hợp đồ điện tử, hồ sơ, đồ gỗ.',
    feature: 'Điều hòa 18–25°C',
    color: '#0f8f86',
    soft: '#e2f6f3',
    gradient: ['#d3f3ee', '#8fd9cf'],
    photos: ['/unit-types/climate-1.jpg', '/unit-types/climate-2.jpg']
  },
  basic: {
    key: 'basic',
    label: 'Kho tiêu chuẩn',
    short: 'Thường',
    description: 'Kho thường, giá tiết kiệm cho đồ gia dụng và vật dụng cá nhân.',
    feature: 'Giá tiết kiệm',
    color: '#c27a00',
    soft: '#fff3d9',
    gradient: ['#fff0c9', '#ffd37a'],
    photos: ['/unit-types/basic-1.jpg', '/unit-types/basic-2.jpg', '/unit-types/basic-3.jpg', '/unit-types/basic-4.jpg']
  },
  indoor: {
    key: 'indoor',
    label: 'Kho trong nhà',
    short: 'Trong nhà',
    description: 'Nằm trong tòa nhà có hành lang, tránh nắng mưa trực tiếp.',
    feature: 'Có mái che, hành lang',
    color: '#6b4fd6',
    soft: '#efeaff',
    gradient: ['#e7e0ff', '#b9a8f5'],
    photos: ['/unit-types/indoor-1.jpg', '/unit-types/indoor-2.jpg', '/unit-types/indoor-3.jpg']
  },
  driveup: {
    key: 'driveup',
    label: 'Kho xe vào tận nơi',
    short: 'Xe vào',
    description: 'Ô tô, xe tải đỗ sát cửa kho, tiện bốc dỡ hàng cồng kềnh.',
    feature: 'Xe tải vào tận cửa',
    color: '#4a5b6d',
    soft: '#eaeff4',
    gradient: ['#e3e9ef', '#aebdcc'],
    photos: ['/unit-types/driveup-1.jpg', '/unit-types/driveup-2.jpg', '/unit-types/driveup-3.jpg']
  },
  other: {
    key: 'other',
    label: 'Kho khác',
    short: 'Khác',
    description: 'Loại kho đặc thù của cơ sở.',
    feature: 'Liên hệ để biết thêm',
    color: '#075a9f',
    soft: '#e9f5ff',
    gradient: ['#e2f0fd', '#a9cdef'],
    photos: ['/unit-types/other-1.jpg', '/unit-types/other-2.jpg']
  }
}

/* Thứ tự hiển thị trong menu và bộ lọc. */
export const UNIT_TYPE_ORDER = ['cold', 'climate', 'basic', 'indoor', 'driveup', 'other']

/**
 * Nhận diện khóa loại kho từ tên loại (không dấu, chữ thường, khớp từ khóa tiếng Anh/Việt).
 * Ví dụ "Climate-Control Unit" -> 'climate', "Kho lạnh" -> 'cold', không khớp -> 'other'.
 * Thứ tự kiểm tra quan trọng: lạnh trước mát, xe vào trước trong nhà, tiêu chuẩn sau cùng.
 * @param {string} typeName tên loại kho (từ DB).
 * @returns {'cold'|'climate'|'basic'|'indoor'|'driveup'|'other'}
 */
export function getUnitTypeKey(typeName) {
  const text = String(typeName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toLowerCase()
  if (!text) return 'other'
  if (/frozen|freez|cold|lanh|dong lanh/.test(text)) return 'cold'
  if (/climate|cool|mat|dieu hoa|nhiet do/.test(text)) return 'climate'
  if (/drive|xe vao|o to|xe tai/.test(text)) return 'driveup'
  if (/indoor|trong nha|hanh lang/.test(text)) return 'indoor'
  if (/basic|standard|tieu chuan|thuong|outdoor|ngoai troi/.test(text)) return 'basic'
  return 'other'
}

/**
 * Lấy bộ style (tên, màu, mô tả, ảnh...) của loại kho từ tên loại.
 * @param {string} typeName tên loại kho.
 * @returns {object} một phần tử của UNIT_TYPE_STYLES.
 */
export function getUnitTypeStyle(typeName) {
  return UNIT_TYPE_STYLES[getUnitTypeKey(typeName)]
}

/* ---------- Kích thước ---------- */

/* 4 hạng kích thước theo chữ nhóm trong mã size (S/M/L/V); level = số nấc sáng trên SizeMeter. */
const SIZE_CLASSES = {
  S: { key: 'S', label: 'Nhỏ', level: 1 },
  M: { key: 'M', label: 'Vừa', level: 2 },
  L: { key: 'L', label: 'Lớn', level: 3 },
  V: { key: 'V', label: 'Rất lớn', level: 4 }
}

/**
 * Đọc chuỗi kích thước trong DB (vd "S2: 2x2m", "L1: 4x6m", "S1: Locker (< 2.5m)") thành mã size, nhãn,
 * diện tích (m²), hạng kích thước (Nhỏ/Vừa/Lớn/Rất lớn) và cờ isLocker.
 * Không có mã nhóm thì xếp hạng theo diện tích (<= 8 m² Nhỏ, <= 16 Vừa, <= 30 Lớn, còn lại Rất lớn);
 * không có cả diện tích thì locker = Nhỏ, còn lại = Vừa.
 * @param {string} sizeText chuỗi size của kho.
 * @returns {{code:string, label:string, area:number|null, sizeClass:object, isLocker:boolean}}
 */
export function parseUnitSize(sizeText) {
  const text = String(sizeText || '')
  const codeMatch = /^\s*([SMLV])\d*\s*:/i.exec(text)
  const dimMatch = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m/i.exec(text)
  const area = dimMatch
    ? Math.round(Number(dimMatch[1].replace(',', '.')) * Number(dimMatch[2].replace(',', '.')) * 10) / 10
    : null
  let cls = codeMatch ? SIZE_CLASSES[codeMatch[1].toUpperCase()] : null
  if (!cls && area !== null) cls = area <= 8 ? SIZE_CLASSES.S : area <= 16 ? SIZE_CLASSES.M : area <= 30 ? SIZE_CLASSES.L : SIZE_CLASSES.V
  if (!cls) cls = /locker/i.test(text) ? SIZE_CLASSES.S : SIZE_CLASSES.M
  const label = text.includes(':') ? text.split(':').slice(1).join(':').trim() : text.trim()
  return {
    code: codeMatch ? text.split(':')[0].trim() : '',
    label: label || '—',
    area,
    sizeClass: cls,
    isLocker: /locker/i.test(text)
  }
}

/* ---------- Icon (SVG, nét vẽ theo currentColor) ---------- */

/* Các nét vẽ SVG (khung 24×24) của icon từng loại kho: bông tuyết, nhiệt kế, thùng, nhà, xe tải, hộp. */
const ICON_PATHS = {
  cold: (
    <>
      <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" />
      <path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5M3 9.6l3.4.9-.9 3.4M21 9.6l-3.4.9.9 3.4M3 14.4l3.4-.9M21 14.4l-3.4-.9" />
    </>
  ),
  climate: (
    <>
      <path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z" />
      <path d="M12 9v6.5" />
      <path d="M18 5.5h3M18 9h2" />
    </>
  ),
  basic: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
      <path d="m7.8 5.3 8.5 4.5" />
    </>
  ),
  indoor: (
    <>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M8 21v-7h8v7M8 17h8" />
    </>
  ),
  driveup: (
    <>
      <path d="M2 16V7h11v9M13 10h4.5l3.5 3.5V16h-8" />
      <circle cx="6.5" cy="17.5" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  ),
  other: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9h17M8 13h8M8 16.5h5" />
    </>
  )
}

/**
 * Component icon SVG của loại kho (nét vẽ theo màu chữ hiện tại - currentColor).
 * Có title thì icon được đọc bởi trình đọc màn hình (role="img"), không có thì ẩn (aria-hidden).
 * @param {object} props type (tên loại) hoặc typeKey (khóa sẵn), size (px), className, title.
 * @returns {JSX.Element}
 */
export function UnitTypeIcon({ type, typeKey, size = 18, className = '', title }) {
  const key = typeKey || getUnitTypeKey(type)
  return (
    <svg
      className={`ut-icon ${className}`.trim()}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      {ICON_PATHS[key] || ICON_PATHS.other}
    </svg>
  )
}

/**
 * Component nhãn loại kho: icon + tên tiếng Việt, tô màu theo loại qua biến CSS --ut-color / --ut-soft.
 * Dùng trong thẻ kho, giỏ hàng, bảng quản lý...
 * @param {object} props type (tên loại từ DB), compact (true = chỉ hiện tên ngắn, icon nhỏ hơn), className.
 */
export function UnitTypeChip({ type, compact = false, className = '' }) {
  const style = getUnitTypeStyle(type)
  return (
    <span
      className={`ut-chip${compact ? ' ut-chip-compact' : ''} ${className}`.trim()}
      style={{ '--ut-color': style.color, '--ut-soft': style.soft }}
      title={type ? `${style.label} (${type})` : style.label}
    >
      <UnitTypeIcon typeKey={style.key} size={compact ? 14 : 16} />
      <span>{compact ? style.short : style.label}</span>
    </span>
  )
}

/**
 * Component thanh hạng kích thước gồm 4 nấc (Nhỏ / Vừa / Lớn / Rất lớn) kèm nhãn; số nấc sáng = sizeClass.level.
 * @param {object} props size (chuỗi size của kho, đọc bằng parseUnitSize).
 */
export function SizeMeter({ size }) {
  const info = parseUnitSize(size)
  return (
    <span className="ut-size-meter" title={`Hạng kích thước: ${info.sizeClass.label}`}>
      {[1, 2, 3, 4].map(level => <i key={level} className={level <= info.sizeClass.level ? 'on' : ''} />)}
      <em>{info.sizeClass.label}</em>
    </span>
  )
}

/**
 * Chọn 1 ảnh trong danh sách theo mã kho: tính hash chuỗi mã (hash = hash × 31 + mã ký tự) rồi lấy phần dư
 * cho số ảnh, nên cùng mã luôn ra cùng ảnh (không đổi ảnh mỗi lần tải lại trang).
 * @param {string[]} photos danh sách ảnh. @param {string} unitCode mã kho.
 * @returns {string|null} đường dẫn ảnh, hoặc null nếu không có ảnh.
 */
function pickUnitPhoto(photos, unitCode) {
  if (!photos || photos.length === 0) return null
  const code = String(unitCode || '')
  let hash = 0
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0
  return photos[hash % photos.length]
}

/**
 * Component ảnh minh họa kho. Nếu loại có `photos`: hiện ảnh thật (chọn theo mã kho, tải lười) kèm biển số kho
 * và icon loại. Không có ảnh: vẽ SVG mặt tiền + cửa cuốn có độ rộng theo hạng kích thước (92–210 px),
 * cửa thấp hơn nếu là locker, màu theo loại, kèm biển số kho. useId tạo id gradient riêng cho mỗi ảnh
 * để nhiều ảnh trên cùng trang không dùng nhầm gradient của nhau.
 * @param {object} props type (tên loại), size (chuỗi size), unitCode (mã kho), className.
 */
export function UnitTypeArt({ type, size, unitCode, className = '' }) {
  const style = getUnitTypeStyle(type)
  const info = parseUnitSize(size)
  const reactId = useId()
  const photo = pickUnitPhoto(style.photos, unitCode)
  if (photo) {
    return (
      <div className={`ut-art ut-art-photo ${className}`.trim()}>
        <img src={photo} alt={`${style.label}${unitCode ? ` ${unitCode}` : ''}`} loading="lazy" />
        {unitCode && <span className="ut-art-code" style={{ color: style.color }}>{unitCode}</span>}
        <span className="ut-art-icon" style={{ color: style.color }}>
          <UnitTypeIcon typeKey={style.key} size={22} />
        </span>
      </div>
    )
  }
  const gradientId = `ut-g-${reactId.replace(/:/g, '')}`
  const doorWidth = { 1: 92, 2: 130, 3: 170, 4: 210 }[info.sizeClass.level] || 130
  const doorHeight = info.isLocker ? 70 : 104
  const doorX = 160 - doorWidth / 2
  const doorY = 150 - doorHeight
  const slats = Math.floor((doorHeight - 10) / 9)

  return (
    <div className={`ut-art ${className}`.trim()} role="img" aria-label={`Ảnh minh họa ${style.label}, kích thước ${info.sizeClass.label.toLowerCase()}`}>
      <svg viewBox="0 0 320 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={style.gradient[0]} />
            <stop offset="1" stopColor={style.gradient[1]} />
          </linearGradient>
        </defs>
        <rect width="320" height="190" fill={`url(#${gradientId})`} />
        {/* Mặt tiền tòa nhà */}
        <rect x="0" y="34" width="320" height="130" fill="#ffffff" opacity=".28" />
        <rect x="0" y="150" width="320" height="40" fill="#0b3967" opacity=".08" />
        {/* Các cửa kho bên cạnh (mờ) */}
        {[-1, 1].map(side => (
          <g key={side} opacity=".35">
            <rect x={side < 0 ? doorX - 70 : doorX + doorWidth + 18} y="70" width="52" height="80" rx="3" fill="#ffffff" />
          </g>
        ))}
        {/* Cửa cuốn chính */}
        <rect x={doorX - 6} y={doorY - 8} width={doorWidth + 12} height={doorHeight + 8} rx="5" fill={style.color} opacity=".9" />
        <rect x={doorX} y={doorY} width={doorWidth} height={doorHeight} rx="2" fill="#f7fbff" />
        {Array.from({ length: slats }).map((_, i) => (
          <line key={i} x1={doorX + 4} x2={doorX + doorWidth - 4} y1={doorY + 9 + i * 9} y2={doorY + 9 + i * 9} stroke={style.color} strokeOpacity=".25" strokeWidth="2" />
        ))}
        <rect x={160 - 12} y={150 - 14} width="24" height="6" rx="3" fill={style.color} opacity=".55" />
        {/* Biển số kho */}
        {unitCode && (
          <g>
            <rect x={160 - 30} y={doorY - 30} width="60" height="18" rx="4" fill="#ffffff" />
            <text x="160" y={doorY - 17} textAnchor="middle" fontFamily="'Be Vietnam Pro', sans-serif" fontWeight="800" fontSize="11" fill={style.color}>{unitCode}</text>
          </g>
        )}
      </svg>
      <span className="ut-art-icon" style={{ color: style.color }}>
        <UnitTypeIcon typeKey={style.key} size={22} />
      </span>
    </div>
  )
}
