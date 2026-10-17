import React from 'react'

export default function SignaturePad({ onChange }) {
  const canvasRef = React.useRef(null)
  const drawingRef = React.useRef(false)
  const lastRef = React.useRef({ x: 0, y: 0 })

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

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

  const end = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

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
