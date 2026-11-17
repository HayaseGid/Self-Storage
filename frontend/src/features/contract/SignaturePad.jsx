/**
 * ======================================================================
 * FILE: src/features/contract/SignaturePad.jsx  —  KHUNG KÝ TAY
 * CHỨC NĂNG: Khung <canvas> để khách vẽ chữ ký bằng chuột / bút / ngón tay (dùng Pointer Events nên chạy cả trên
 *   điện thoại). Mỗi khi ký xong một nét, chữ ký được xuất thành ảnh PNG base64 (data URL) và gửi lên qua onChange;
 *   nút "Xoá chữ ký" xóa canvas và gửi null.
 * THÀNH PHẦN CHÍNH:
 *   - SignaturePad (default export): component khung ký.
 *   - getPos / start / move / end / clear: các hàm xử lý vẽ bên trong component.
 * DÙNG Ở: src/features/contract/ContractSignFlow.jsx, src/features/contract/ContractModal.jsx.
 * PHỤ THUỘC: chỉ React (style viết trực tiếp, không có file CSS riêng).
 * API: Không gọi API. Ảnh chữ ký được component cha gửi lên backend.
 * LUỒNG: nhấn xuống (start) -> kéo (move: vẽ đoạn thẳng) -> nhả / rời khung (end) -> canvas.toDataURL('image/png')
 *   -> onChange(dataUrl) -> cha lưu vào state chữ ký.
 * ======================================================================
 */
import React from 'react'

/**
 * Khung ký tay trên canvas 640×200 (hiển thị co giãn theo chiều rộng).
 * @param {object} props
 * @param {Function} props.onChange onChange(dataUrl|null): gọi khi kết thúc một nét ký (ảnh PNG base64) hoặc khi xóa (null).
 * @returns {JSX.Element}
 * Được gọi bởi: ContractSignFlow (bước 3 "Ký hợp đồng"), ContractModal (mục "Chữ ký của bên thuê").
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = React.useRef(null) // phần tử <canvas>
  const drawingRef = React.useRef(false) // đang giữ chuột / ngón tay để vẽ hay không (dùng ref để không render lại)
  const lastRef = React.useRef({ x: 0, y: 0 }) // điểm vẽ trước đó, làm đầu đoạn thẳng tiếp theo

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
    ctx.fillStyle = '#0b2a4a'
    ctx.fill()
  }

  // Chạy khi di chuyển con trỏ (onPointerMove): nếu đang ký thì vẽ đoạn thẳng từ điểm trước tới vị trí hiện tại.
  const move = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.strokeStyle = '#0b2a4a'
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

  // Chạy khi bấm nút "Xoá chữ ký": xóa toàn bộ canvas và báo onChange(null) để cha biết chưa có chữ ký.
  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    onChange(null)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={640}
        height={200}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: '#5b7089' }}>
        <span>Dùng chuột hoặc ngón tay để ký vào khung trên</span>
        <button type="button" onClick={clear} style={{ background: 'none', border: 'none', color: '#d64545', cursor: 'pointer', fontWeight: 600 }}>
          Xoá chữ ký
        </button>
      </div>
    </div>
  )
}
