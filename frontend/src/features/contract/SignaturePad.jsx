/**
 * ======================================================================
 * FILE: src/features/contract/SignaturePad.jsx  —  KHUNG KÝ TAY (vẽ chữ ký bằng chuột / ngón tay trên canvas)
 * Kết quả trả ra dạng ảnh PNG base64 (data URL) qua onChange; nút "Xoá chữ ký" trả null. Không gọi API.
 * Dùng ở: ContractSignFlow, ContractModal.
 * ======================================================================
 */
import React from 'react'

/**
 * Component khung ký tay.
 * @param {{onChange: Function}} props onChange(dataUrl|null) được gọi khi ký xong một nét hoặc khi xóa.
 */
export default function SignaturePad({ onChange }) {
  const canvasRef = React.useRef(null)
  const drawingRef = React.useRef(false)
  const lastRef = React.useRef({ x: 0, y: 0 })

  // Đổi tọa độ con trỏ trên màn hình thành tọa độ trong canvas (tính theo tỉ lệ kích thước thật/hiển thị).
  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  // Bắt đầu nét ký: giữ con trỏ, ghi điểm đầu và chấm một điểm nhỏ.
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

  // Đang ký: vẽ đoạn thẳng từ điểm trước tới vị trí hiện tại.
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

  // Kết thúc nét ký: xuất ảnh chữ ký PNG (data URL) qua onChange.
  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  // Xóa toàn bộ chữ ký trên canvas và báo onChange(null).
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
