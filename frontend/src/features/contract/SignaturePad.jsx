/**
 * ======================================================================
 * FILE: src/features/contract/SignaturePad.jsx  —  KHUNG KÝ TAY / TẢI ẢNH CHỮ KÝ
 * CHỨC NĂNG: Khung <canvas> để khách ký hợp đồng theo 1 trong 2 cách:
 *   - Ký tay: vẽ chữ ký bằng chuột / bút / ngón tay (Pointer Events nên chạy cả trên điện thoại).
 *   - Tải ảnh chữ ký: chọn ảnh PNG / JPG / WEBP (kể cả ảnh chụp chữ ký trên giấy). Ảnh được làm trong suốt nền
 *     (bỏ nền giấy trắng / xám), co cho vừa khung rồi vẽ vào chính canvas để khách xem trước.
 *   Mỗi khi có chữ ký (ký xong 1 nét hoặc tải ảnh xong), chữ ký được xuất thành ảnh PNG base64 (data URL) qua onChange;
 *   nút "Xoá chữ ký" xóa canvas và gửi null. Ảnh gửi đi luôn là PNG và nhỏ hơn 200 KB (giới hạn của backend).
 * THÀNH PHẦN CHÍNH:
 *   - SignaturePad (default export): component khung ký.
 *   - getPos / start / move / end / clear: xử lý ký tay; pickFile / handleFile: xử lý tải ảnh.
 *   - cleanSignatureImage(): làm trong suốt nền ảnh chữ ký và co vừa khung (hàm thuần, chạy trên canvas phụ).
 * DÙNG Ở: src/features/contract/ContractSignFlow.jsx, src/features/contract/ContractModal.jsx.
 * PHỤ THUỘC: chỉ React (style viết trực tiếp, không có file CSS riêng).
 * API: Không gọi API. Ảnh chữ ký được component cha gửi lên backend (POST /api/contracts/{id}/signature, PNG ≤ 200 KB).
 * LUỒNG:
 *   - Ký tay: nhấn xuống (start) -> kéo (move) -> nhả / rời khung (end) -> canvas.toDataURL('image/png') -> onChange(dataUrl).
 *   - Tải ảnh: bấm "Tải ảnh chữ ký" -> chọn file -> handleFile kiểm tra loại / dung lượng -> đọc ảnh
 *     -> cleanSignatureImage (bỏ nền, co vừa khung) -> vẽ vào canvas -> toDataURL('image/png') -> kiểm tra ≤ 200 KB -> onChange(dataUrl).
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   cleanSignatureImage: Làm sạch ảnh chữ ký tải lên: bỏ nền giấy (trắng / xám) thành trong suốt, giữ nét mực, rồi co vừa khung ký → dùng ở: handleFile
 *   SignaturePad: Khung ký 640×200 (hiển thị co giãn theo chiều rộng): ký tay hoặc tải ảnh chữ ký → dùng ở: ContractModal.jsx, ContractSignFlow.jsx (ContractSignFlow)
 *   getPos: Đổi tọa độ con trỏ trên màn hình thành tọa độ trong canvas (tính theo tỉ lệ kích thước thật/hiển thị) → dùng ở: start, move
 *   start: Chạy khi nhấn xuống canvas (onPointerDown): bắt đầu nét ký, giữ con trỏ, ghi điểm đầu và chấm một điểm nhỏ → dùng ở: SignaturePad
 *   move: Chạy khi di chuyển con trỏ (onPointerMove): nếu đang ký thì vẽ đoạn thẳng từ điểm trước tới vị trí hiện tại → dùng ở: SignaturePad
 *   end: Chạy khi nhả / rời khung / hủy chạm (onPointerUp, onPointerLeave, onPointerCancel): kết thúc nét ký và xuất toàn bộ chữ ký thành ảnh PNG → dùng ở: SignaturePad
 *   clear: Chạy khi bấm nút "Xoá chữ ký": xóa toàn bộ canvas, xóa thông báo và báo onChange(null) để cha biết chưa có chữ ký → dùng ở: SignaturePad
 *   pickFile: Bấm "Tải ảnh chữ ký": mở hộp chọn file của trình duyệt → dùng ở: SignaturePad
 *   handleFile: Sau khi chọn file: kiểm tra loại / dung lượng, đọc ảnh, làm sạch nền, vẽ vào khung, xuất PNG (≤ 200 KB) qua onChange → dùng ở: SignaturePad
 */
import React from 'react'

const CANVAS_W = 640
const CANVAS_H = 200
const INK = '#0b2a4a' // màu mực khi ký tay
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // ảnh tải lên tối đa 10 MB
const MAX_SIGNATURE_BYTES = 200 * 1024 // backend chỉ nhận PNG ≤ 200 KB
const ACCEPT = 'image/png,image/jpeg,image/webp'

/**
 * Làm sạch ảnh chữ ký tải lên: bỏ nền giấy (trắng / xám) thành trong suốt, giữ nét mực, rồi co vừa khung ký.
 * Cách làm: đo độ sáng nền (mức sáng mà 85% điểm ảnh đạt tới) -> điểm nào gần sáng bằng nền thì trong suốt,
 * điểm càng tối hơn nền thì càng đậm (độ trong suốt tỉ lệ với độ tối) -> làm tròn độ trong suốt cho ảnh PNG nhẹ hơn.
 * @param {HTMLImageElement} img ảnh đã tải xong.
 * @returns {{canvas: HTMLCanvasElement, inkPixels: number}} canvas CANVAS_W×CANVAS_H chứa chữ ký đã làm sạch, số điểm mực.
 * Được gọi bởi: handleFile() trong SignaturePad.
 */
function cleanSignatureImage(img) {
  const pad = 12
  const scale = Math.min((CANVAS_W - pad * 2) / img.naturalWidth, (CANVAS_H - pad * 2) / img.naturalHeight, 3)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const wctx = work.getContext('2d', { willReadFrequently: true })
  wctx.drawImage(img, 0, 0, w, h)
  const data = wctx.getImageData(0, 0, w, h)
  const px = data.data

  // Độ sáng từng điểm (bỏ qua điểm vốn đã trong suốt), dùng để đoán độ sáng của nền giấy.
  const lums = []
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue
    lums.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
  }
  lums.sort((a, b) => a - b)
  const background = lums.length ? lums[Math.floor(lums.length * 0.85)] : 255
  const range = Math.max(40, background * 0.55) // chênh lệch độ sáng để nét mực đạt độ đậm tối đa

  let inkPixels = 0
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    let alpha = Math.min(1, Math.max(0, (background - 12 - lum) / range)) * (px[i + 3] / 255)
    alpha = Math.round(alpha * 8) / 8 // làm tròn 8 mức: PNG nhẹ hơn, mắt thường không thấy khác
    px[i + 3] = Math.round(alpha * 255)
    if (alpha >= 0.5) inkPixels++
  }
  wctx.putImageData(data, 0, 0)

  const out = document.createElement('canvas')
  out.width = CANVAS_W
  out.height = CANVAS_H
  out.getContext('2d').drawImage(work, Math.round((CANVAS_W - w) / 2), Math.round((CANVAS_H - h) / 2))
  return { canvas: out, inkPixels }
}

/**
 * Khung ký 640×200 (hiển thị co giãn theo chiều rộng): ký tay hoặc tải ảnh chữ ký.
 * @param {object} props
 * @param {Function} props.onChange onChange(dataUrl|null): gọi khi có chữ ký mới (ảnh PNG base64) hoặc khi xóa (null).
 * @returns {JSX.Element}
 * Được gọi bởi: ContractSignFlow (bước 3 "Ký hợp đồng"), ContractModal (mục "Chữ ký của bên thuê").
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = React.useRef(null) // phần tử <canvas>
  const fileRef = React.useRef(null) // ô chọn file ẩn (mở khi bấm "Tải ảnh chữ ký")
  const drawingRef = React.useRef(false) // đang giữ chuột / ngón tay để vẽ hay không (dùng ref để không render lại)
  const lastRef = React.useRef({ x: 0, y: 0 }) // điểm vẽ trước đó, làm đầu đoạn thẳng tiếp theo
  const [note, setNote] = React.useState(null) // { tone: 'ok' | 'err', text } thông báo dưới khung khi tải ảnh
  const [loading, setLoading] = React.useState(false) // đang xử lý ảnh tải lên

  // Đổi tọa độ con trỏ trên màn hình thành tọa độ trong canvas (tính theo tỉ lệ kích thước thật/hiển thị).
  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  // Chạy khi nhấn xuống canvas (onPointerDown): bắt đầu nét ký, giữ con trỏ, ghi điểm đầu và chấm một điểm nhỏ.
  const start = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawingRef.current = true
    lastRef.current = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(lastRef.current.x, lastRef.current.y, 1, 0, Math.PI * 2)
    ctx.fillStyle = INK
    ctx.fill()
  }

  // Chạy khi di chuyển con trỏ (onPointerMove): nếu đang ký thì vẽ đoạn thẳng từ điểm trước tới vị trí hiện tại.
  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.strokeStyle = INK
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastRef.current = pos
  }

  // Chạy khi nhả / rời khung / hủy chạm (onPointerUp, onPointerLeave, onPointerCancel):
  // kết thúc nét ký và xuất toàn bộ chữ ký thành ảnh PNG (data URL) qua onChange.
  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  // Chạy khi bấm nút "Xoá chữ ký": xóa toàn bộ canvas, xóa thông báo và báo onChange(null) để cha biết chưa có chữ ký.
  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setNote(null)
    onChange(null)
  }

  // Bấm "Tải ảnh chữ ký": mở hộp chọn file của trình duyệt.
  const pickFile = () => fileRef.current?.click()

  // Sau khi chọn file: kiểm tra loại / dung lượng, đọc ảnh, làm sạch nền, vẽ vào khung, xuất PNG (≤ 200 KB) qua onChange.
  const handleFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // cho phép chọn lại cùng một file
    if (!file) return
    if (!ACCEPT.split(',').includes(file.type)) {
      setNote({ tone: 'err', text: 'Chỉ nhận ảnh PNG, JPG hoặc WEBP.' })
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setNote({ tone: 'err', text: 'Ảnh quá lớn (tối đa 10 MB). Hãy chọn ảnh nhỏ hơn.' })
      return
    }
    setLoading(true)
    setNote(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const { canvas: cleaned, inkPixels } = cleanSignatureImage(img)
        if (inkPixels < 30) {
          setNote({ tone: 'err', text: 'Không nhận ra nét chữ ký trong ảnh. Hãy chụp chữ ký mực đậm trên nền giấy sáng.' })
          return
        }
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(cleaned, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        const bytes = Math.ceil((dataUrl.length - 'data:image/png;base64,'.length) * 3 / 4)
        if (bytes > MAX_SIGNATURE_BYTES) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          onChange(null)
          setNote({ tone: 'err', text: 'Ảnh chữ ký quá nhiều chi tiết (vượt 200 KB). Hãy chụp lại rõ hơn, nền giấy trơn.' })
          return
        }
        onChange(dataUrl)
        setNote({ tone: 'ok', text: `Đã dùng ảnh "${file.name}". Kiểm tra chữ ký trong khung; bấm "Xoá chữ ký" nếu muốn tải ảnh khác hoặc ký tay.` })
      } catch {
        setNote({ tone: 'err', text: 'Không xử lý được ảnh này. Hãy thử ảnh khác.' })
      } finally {
        URL.revokeObjectURL(url)
        setLoading(false)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      setLoading(false)
      setNote({ tone: 'err', text: 'Không đọc được file ảnh. Hãy thử ảnh khác.' })
    }
    img.src = url
  }

  // Khung ký tay
  return (
    <div>
      {/* Vùng vẽ chữ ký */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        style={{
          width: '100%',
          height: 170,
          border: '2px dashed #9db4cc',
          borderRadius: 12,
          background: '#f8fbff',
          touchAction: 'none',
          cursor: 'crosshair',
          display: 'block'
        }}
      />
      <input ref={fileRef} type="file" accept={ACCEPT} onChange={handleFile} style={{ display: 'none' }} />
      {/* Nút tải ảnh chữ ký / xóa chữ ký */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, fontSize: 13, color: '#5b7089' }}>
        <span>Ký bằng chuột / ngón tay vào khung trên, hoặc tải ảnh chữ ký có sẵn</span>
        <span style={{ display: 'inline-flex', gap: 12 }}>
          <button type="button" onClick={pickFile} disabled={loading} style={{ background: 'none', border: 'none', color: '#0877cf', cursor: loading ? 'wait' : 'pointer', fontWeight: 700, padding: 0 }}>
            {loading ? 'Đang xử lý ảnh…' : '⬆ Tải ảnh chữ ký'}
          </button>
          <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#d64545', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
            Xoá chữ ký
          </button>
        </span>
      </div>
      {/* Thông báo (lỗi ảnh, dung lượng) */}
      {note && (
        <p role={note.tone === 'err' ? 'alert' : 'status'} style={{ margin: '6px 0 0', padding: '7px 10px', borderRadius: 8, fontSize: 12.5, lineHeight: 1.45, background: note.tone === 'err' ? '#fff3f3' : '#f0fdf4', color: note.tone === 'err' ? '#b13b3b' : '#166534' }}>
          {note.text}
        </p>
      )}
    </div>
  )
}
