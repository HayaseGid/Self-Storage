/**
 * ======================================================================
 * FILE: src/utils/packingClient.js  —  GỬI VIỆC XẾP THÙNG SANG WEB WORKER (packing.worker.js)
 * Mỗi "kênh" (channel) có 1 worker riêng và chỉ chạy 1 việc một lúc: gửi việc mới khi việc cũ chưa xong thì
 * dừng hẳn worker cũ (terminate) và trả CANCELLED cho việc cũ, nên kết quả cũ không ghi đè kết quả mới.
 * Dùng ở: features/unit/UnitPackPlanner.jsx, features/unit/useBoxFit.js.
 * ======================================================================
 */
import { useEffect, useRef } from 'react'

/* Giá trị trả về khi việc bị hủy (có việc mới thay thế, hoặc component đã đóng). */
export const CANCELLED = Symbol('cancelled')

let nextId = 0

/**
 * Tạo 1 kênh gửi việc cho worker.
 * @returns {{ run: (op:string, args:object, onProgress?:function) => Promise<any>, dispose: () => void }}
 */
export function createPackChannel() {
  let worker = null
  let current = null // { id, resolve }

  // Dừng worker đang chạy và báo việc đang chờ là đã hủy.
  const stop = () => {
    worker?.terminate()
    worker = null
    if (current) { current.resolve(CANCELLED); current = null }
  }

  const run = (op, args, onProgress) => {
    if (current) stop()
    if (!worker) worker = new Worker(new URL('./packing.worker.js', import.meta.url), { type: 'module' })
    const id = ++nextId
    return new Promise((resolve, reject) => {
      current = { id, resolve }
      worker.onmessage = ({ data }) => {
        if (!current || data.id !== current.id) return
        if (data.progress) { onProgress?.(data.progress); return }
        current = null
        if (data.error) reject(new Error(data.error))
        else resolve(data.result)
      }
      worker.onerror = event => {
        if (!current || current.id !== id) return
        current = null
        worker?.terminate()
        worker = null
        reject(new Error(event.message || 'Worker lỗi'))
      }
      worker.postMessage({ id, op, args })
    })
  }

  return { run, dispose: stop }
}

/**
 * Hook: 1 kênh worker gắn với vòng đời component (tự dừng worker khi component đóng).
 */
export function usePackChannel() {
  const ref = useRef(null)
  if (!ref.current) ref.current = createPackChannel()
  useEffect(() => () => ref.current?.dispose(), [])
  return ref.current
}
