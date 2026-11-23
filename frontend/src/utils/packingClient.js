/**
 * ======================================================================
 * FILE: src/utils/packingClient.js  —  CLIENT ĐIỀU PHỐI WEB WORKER XẾP THÙNG
 * CHỨC NĂNG: Gửi việc xếp thùng sang Web Worker (packing.worker.js) và nhận kết quả dưới dạng Promise.
 *   Mỗi "kênh" (channel) có 1 worker riêng và chỉ chạy 1 việc một lúc: gửi việc mới khi việc cũ chưa xong thì
 *   dừng hẳn worker cũ (terminate) và trả CANCELLED cho việc cũ, nên kết quả cũ (đã lỗi thời) không ghi đè kết quả mới.
 * THÀNH PHẦN CHÍNH:
 *   - CANCELLED: giá trị đặc biệt báo việc đã bị hủy.
 *   - createPackChannel(): tạo kênh { run, dispose }.
 *   - usePackChannel(): hook React, kênh gắn với vòng đời component.
 * DÙNG Ở: features/unit/UnitPackPlanner.jsx, features/unit/useBoxFit.js.
 * PHỤ THUỘC: react (useEffect, useRef), utils/packing.worker.js (nạp bằng new Worker).
 * API: Không gọi API.
 * LUỒNG: component gọi channel.run('autoPack', args) -> tạo worker (nếu chưa có) -> postMessage
 *   -> worker trả progress (gọi onProgress) / kết quả -> Promise resolve -> component cập nhật state.
 *   Nếu component gọi run lần nữa trước khi xong -> worker cũ bị dừng, Promise cũ resolve CANCELLED (component bỏ qua).
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   createPackChannel: Tạo 1 kênh gửi việc cho worker. Worker chỉ được tạo khi chạy việc đầu tiên (lười tạo) → dùng ở: usePackChannel
 *   stop: Dừng worker đang chạy và báo việc đang chờ là đã hủy → dùng ở: run, createPackChannel
 *   run: Gửi 1 việc (op, args) cho worker; hủy việc cũ nếu còn chạy → dùng ở: createPackChannel
 *   usePackChannel: Hook: 1 kênh worker gắn với vòng đời component → dùng ở: UnitPackPlanner.jsx (PackPlanner), useBoxFit.js (useBoxFit, useSplitPack)
 */
import { useEffect, useRef } from 'react'

/* Giá trị trả về khi việc bị hủy (có việc mới thay thế, hoặc component đã đóng). */
export const CANCELLED = Symbol('cancelled')

let nextId = 0 // bộ đếm tăng dần để đánh số mỗi việc, giúp bỏ qua tin nhắn của việc cũ

/**
 * Tạo 1 kênh gửi việc cho worker. Worker chỉ được tạo khi chạy việc đầu tiên (lười tạo).
 * Được gọi bởi usePackChannel.
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

  // Gửi 1 việc (op, args) cho worker; hủy việc cũ nếu còn chạy. onProgress nhận kết quả từng phần (vd fitGroups).
  // Trả Promise: resolve(kết quả) / resolve(CANCELLED) khi bị thay thế / reject(Error) khi worker báo lỗi.
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
 * Hook: 1 kênh worker gắn với vòng đời component. Kênh được tạo 1 lần (lưu trong useRef) và
 * useEffect cleanup gọi dispose() khi component bị gỡ, để worker không chạy tiếp vô ích.
 * Được gọi bởi UnitPackPlanner và useBoxFit.
 * @returns {{run: function, dispose: function}}
 */
export function usePackChannel() {
  const ref = useRef(null)
  if (!ref.current) ref.current = createPackChannel()
  useEffect(() => () => ref.current?.dispose(), [])
  return ref.current
}
