/**
 * ======================================================================
 * FILE: src/utils/packing.worker.js  —  WEB WORKER XẾP THÙNG
 * CHỨC NĂNG: Chạy thuật toán xếp thùng (utils/packing.js) ở LUỒNG NỀN của trình duyệt. Thuật toán Extreme Point
 *   chạy lâu khi nhiều thùng (vài trăm thùng mất vài giây); chạy ở đây để giao diện không bị đứng khi tính.
 * THÀNH PHẦN CHÍNH: self.onmessage — nhận việc, gọi hàm xếp tương ứng, gửi kết quả về.
 * DÙNG Ở: utils/packingClient.js tạo worker bằng new Worker(new URL('./packing.worker.js', ...)); không import trực tiếp.
 * PHỤ THUỘC: utils/packing.js (autoPack, remainingCapacity, volumeOf).
 * API: Không gọi API.
 * LUỒNG: packingClient gửi { id, op, args } -> worker chạy thuật toán -> gửi { id, progress } (từng phần, nếu có)
 *   và cuối cùng { id, done: true, result | error } -> packingClient trả kết quả cho Promise của component.
 * CÁC THAO TÁC (op) HỖ TRỢ:
 *   op 'autoPack'          args { room, requests, startItems, options }       -> { placed, failed }
 *   op 'remainingCapacity' args { items, room, type, limit }                   -> số thùng còn chứa thêm
 *   op 'fitGroups'         args { requests, groups: [{ key, room, zones }] }   -> progress { key, fits } cho từng cỡ kho
 *   op 'splitPack'         args { room, zones, requests, prefer, candidates: [{ key, room, zones, roomVolume }] }
 *                          -> xếp vào kho đang xem, phần dư thử xếp vào từng cỡ kho khác:
 *                             { placedCount, placedVolume, leftoverCount, leftoverVolume, fits: [key cỡ kho chứa vừa phần dư] }
 * ======================================================================
 */
import { autoPack, remainingCapacity, volumeOf } from './packing'

/**
 * Nhận một việc từ luồng chính (packingClient.run) và xử lý theo op.
 * Mọi lỗi được bắt lại và gửi về dạng { id, done: true, error } để Promise bên client bị reject thay vì treo.
 * @param {{data: {id:number, op:string, args:object}}} event tin nhắn từ luồng chính.
 */

self.onmessage = ({ data }) => {
  const { id, op, args } = data
  try {
    if (op === 'autoPack') {
      const { room, requests, startItems = [], options = {} } = args
      self.postMessage({ id, done: true, result: autoPack(room, requests, startItems, options) })
    } else if (op === 'remainingCapacity') {
      const { items, room, type, limit } = args
      self.postMessage({ id, done: true, result: remainingCapacity(items, room, type, limit) })
    } else if (op === 'fitGroups') {
      // Xếp thử số thùng khách nhập vào từng cỡ kho (biến thể 'back': gọn, ít khe hở, chứa nhiều), báo kết quả từng cỡ ngay khi xong.
      const { requests, groups } = args
      groups.forEach(group => {
        const fits = !autoPack(group.room, requests, group.zones, { prefer: 'back' }).failed.length
        self.postMessage({ id, progress: { key: group.key, fits } })
      })
      self.postMessage({ id, done: true, result: true })
    } else if (op === 'splitPack') {
      // Xếp vào kho đang xem; phần không vừa (failed) gom lại rồi thử từng cỡ kho khác (lọc nhanh theo thể tích trước).
      const { room, zones, requests, prefer, candidates } = args
      const { placed, failed } = autoPack(room, requests, zones, { prefer })
      // Gom món dư theo loại (cùng kích thước) thành yêu cầu mới.
      const groups = new Map()
      failed.forEach(req => {
        const key = `${req.key}|${req.w}|${req.h}|${req.d}`
        const entry = groups.get(key)
        if (entry) entry.count += 1
        else groups.set(key, { ...req, count: 1 })
      })
      const leftover = [...groups.values()]
      const leftoverVolume = leftover.reduce((n, r) => n + r.count * r.w * r.h * r.d, 0)
      const fits = leftover.length
        ? candidates
          .filter(c => c.roomVolume >= leftoverVolume && !autoPack(c.room, leftover, c.zones, { prefer: 'back' }).failed.length)
          .map(c => c.key)
        : []
      self.postMessage({ id, done: true, result: { placedCount: placed.length, placedVolume: volumeOf(placed), leftoverCount: failed.length, leftoverVolume, fits } })
    } else {
      self.postMessage({ id, done: true, error: `Không hỗ trợ thao tác ${op}` })
    }
  } catch (err) {
    self.postMessage({ id, done: true, error: String(err?.message || err) })
  }
}
