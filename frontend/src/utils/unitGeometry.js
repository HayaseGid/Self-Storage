/**
 * ======================================================================
 * FILE: src/utils/unitGeometry.js  —  HÌNH HỌC KHO TỪ CHUỖI SIZE
 * CHỨC NĂNG: Đọc chuỗi size của kho do backend trả (vd "S2: Kho 2 x 2 m", "L1: Kho 4 x 6 m",
 *   "S1: Tủ nhỏ 1.5 x 1.5 m", "V1: Kho xe 8 x 4 m") và tính ra rộng, dài, cao, diện tích, thể tích để vẽ sơ đồ
 *   cơ sở, vẽ kho 3D và chạy thuật toán xếp thùng. Chiều cao chỉ dùng để VẼ 3D / xếp thử (không dùng tính giá):
 *   lấy theo chiều cao chuẩn của nhóm size.
 * THÀNH PHẦN CHÍNH:
 *   - BAND_LABELS, BAND_ORDER: nhãn và thứ tự 4 nhóm cỡ S / M / L / V.
 *   - unitGeometry(unit): kích thước hình học của 1 kho.
 *   - formatMeters(value): định dạng số mét kiểu Việt Nam.
 *   - unitPlanStatus(unit): trạng thái để tô màu trên sơ đồ (free / off / rented).
 * DÙNG Ở: features/unit/Unit3DViewer.jsx, useBoxFit.js.
 * PHỤ THUỘC: services/priceBands (getBandCode: lấy chữ nhóm S/M/L/V từ chuỗi size).
 * API: Không gọi API.
 * LUỒNG: component có object unit từ backend -> unitGeometry(unit) -> {width, length, height...}
 *   -> dùng để vẽ ô kho trên sơ đồ, dựng phòng 3D (room {w, h, l}) cho utils/packing.js.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   num: Đổi chuỗi số (cho phép dấu phẩy) thành Number → dùng ở: unitGeometry
 *   unitGeometry: Tính hình học 1 kho từ unit.size: nhóm (S/M/L/V), mã cỡ, nhãn, rộng, dài (dài luôn >= rộng), cao → dùng ở: FacilityUnitsMap.jsx (layoutUnits), Unit3DViewer.jsx (Unit3DViewer, byPrice +1), useBoxFit.js (useBoxFit, fits +2)
 *   formatMeters: Định dạng số mét để hiển thị (vd 2.5 -> "2,5 m") → dùng ở: FacilityUnitsMap.jsx (FacilityUnitsMap), Unit3DViewer.jsx (Unit3DViewer)
 *   unitPlanStatus: Trạng thái kho để tô màu trên sơ đồ: 'free' (unit.available = true, còn trống), 'off' (status maintenance / inactive: bảo trì, ngừng dùng) → dùng ở: FacilityUnitsMap.jsx (layoutUnits), Unit3DViewer.jsx (Unit3DViewer)
 */
import { getBandCode } from '../services/priceBands'

/* Chiều cao chuẩn (m) theo nhóm cỡ: kho thường 2,5 m, kho xe 3,5 m; tủ locker 2 m. */
const STANDARD_HEIGHT = { S: 2.5, M: 2.5, L: 2.5, V: 3.5 }
const LOCKER_HEIGHT = 2.0

/* Nhãn hiển thị của 4 nhóm cỡ kho; BAND_ORDER là thứ tự hiển thị (nhỏ -> lớn -> kho xe). */
export const BAND_LABELS = {
  S: 'Small · kho nhỏ',
  M: 'Medium · kho vừa',
  L: 'Large · kho lớn',
  V: 'Vehicle · kho xe'
}
export const BAND_ORDER = ['S', 'M', 'L', 'V']

/**
 * Đổi chuỗi số (cho phép dấu phẩy) thành Number.
 */
const num = value => Number(String(value).replace(',', '.'))

/**
 * Tính hình học 1 kho từ unit.size: nhóm (S/M/L/V), mã cỡ, nhãn, rộng, dài (dài luôn >= rộng),
 * cao (tủ locker 2 m, kho thường 2,5 m, kho xe 3,5 m), cờ isLocker, diện tích và thể tích.
 * Không đọc được kích thước thì mặc định 2 x 2 m. Kích thước được tìm bằng biểu thức "số x số" (chấp nhận x, X, ×
 * và dấu phẩy thập phân) trong phần nhãn sau dấu ":". Kho là tủ locker nếu nhãn có chữ "tủ" hoặc "locker".
 * @param {object} unit kho ({ size }).
 * @returns {{band, code, label, width, length, height, isLocker, area, volume}}
 */
export function unitGeometry(unit) {
  const text = String(unit?.size || '')
  const band = getBandCode(text) || 'S'
  const label = text.includes(':') ? text.slice(text.indexOf(':') + 1).trim() : text
  const code = text.includes(':') ? text.slice(0, text.indexOf(':')).trim() : band
  const rect = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)/.exec(label)
  let a = rect ? num(rect[1]) : 2
  let b = rect ? num(rect[2]) : 2
  if (!(a > 0)) a = 2
  if (!(b > 0)) b = 2
  // Chiều dài luôn >= chiều rộng.
  const length = Math.max(a, b)
  const width = Math.min(a, b)
  const isLocker = /tủ|locker/i.test(label)
  const height = isLocker ? LOCKER_HEIGHT : (STANDARD_HEIGHT[band] || 2.5)
  return {
    band,
    code,
    label,
    width,
    length,
    height,
    isLocker,
    area: Math.round(width * length * 100) / 100,
    volume: Math.round(width * length * height * 100) / 100
  }
}

/**
 * Định dạng số mét để hiển thị (vd 2.5 -> "2,5 m").
 */
export const formatMeters = value => `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m`

/**
 * Trạng thái kho để tô màu trên sơ đồ: 'free' (unit.available = true, còn trống), 'off' (status maintenance /
 * inactive: bảo trì, ngừng dùng), 'rented' (các trường hợp còn lại: đã thuê / đang giữ chỗ).
 * Được gọi bởi Unit3DViewer (nhãn trạng thái kho, lọc kho còn trống).
 * @param {object} unit kho ({ available, status }).
 * @returns {'free'|'off'|'rented'}
 */
export function unitPlanStatus(unit) {
  const status = String(unit?.status || '').toLowerCase()
  if (unit?.available) return 'free'
  if (status === 'maintenance' || status === 'inactive') return 'off'
  return 'rented'
}
