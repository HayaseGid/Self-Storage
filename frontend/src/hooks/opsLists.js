/**
 * ======================================================================
 * FILE: src/hooks/opsLists.js  —  HOOK DANH SÁCH VẬN HÀNH CÓ PHÂN TRANG Ở BACKEND
 * CHỨC NĂNG: Cung cấp hook useOpsList để màn hình Staff / Manager lấy danh sách ĐƠN ĐẶT KHO, KHO hoặc
 *   HỢP ĐỒNG có tìm kiếm, lọc trạng thái, sắp xếp và phân trang do backend thực hiện. Mỗi dòng được map
 *   bằng đúng hàm của mappers/operationsState.js nên các màn hình cũ dùng lại được. Nếu backend chưa có
 *   API phân trang (404) thì tự lọc / sắp xếp / chia trang ở frontend từ fallbackRows (dữ liệu /state đang có).
 * THÀNH PHẦN CHÍNH:
 *   - RESERVATION_SORTS / UNIT_SORTS / CONTRACT_SORTS : các lựa chọn sắp xếp [giá trị, nhãn] cho ô chọn.
 *   - useOpsList : hook chính.
 *   - DEFAULT_MATCH / COMPARE (nội bộ): hàm tìm kiếm và so sánh dùng khi phải chia trang ở frontend.
 * DÙNG Ở: src/pages/manager/FacilityManagerAccount.jsx, src/pages/staff/FacilityStaffAccount.jsx.
 * PHỤ THUỘC: react (useMemo), src/components/common/listKit (useServerList, parseTime),
 *   src/mappers/operationsState (mapReservation, mapUnit, mapContract).
 * API: GET /api/operations/reservations | units | contracts
 *      ?page=&pageSize=&q=&status=&sort=&facilityId=&typeId=   (OperationsController), gọi qua useServerList.
 * LUỒNG: Manager gõ ô tìm kiếm / đổi trạng thái / sắp xếp -> state trang đổi -> useOpsList(kind, {...})
 *   -> useServerList gọi GET /api/operations/{kind}?... -> items map sang dạng frontend -> bảng + Pager hiển thị.
 * ======================================================================
 */
import { useMemo } from 'react'
import { parseTime, useServerList } from '../components/common/listKit'
import { mapContract, mapReservation, mapUnit } from '../mappers/operationsState'

// Các lựa chọn sắp xếp cho từng loại danh sách: [giá trị gửi backend (sort), nhãn hiển thị].
export const RESERVATION_SORTS = [
  ['newest', 'Mới đặt nhất'],
  ['appointment', 'Lịch hẹn gần nhất'],
  ['appointment_desc', 'Lịch hẹn xa nhất'],
  ['oldest', 'Cũ nhất'],
  ['code', 'Mã đơn A→Z']
]

export const UNIT_SORTS = [
  ['newest', 'Mới thêm nhất'],
  ['code', 'Mã kho A→Z'],
  ['code_desc', 'Mã kho Z→A'],
  ['updated', 'Mới cập nhật'],
  ['oldest', 'Cũ nhất']
]

export const CONTRACT_SORTS = [
  ['newest', 'Mới tạo nhất'],
  ['ending', 'Sắp hết hạn trước'],
  ['oldest', 'Cũ nhất'],
  ['code', 'Mã HĐ A→Z']
]

// Hàm map dòng backend -> object frontend tương ứng với từng loại danh sách.
const MAPPERS = { reservations: mapReservation, units: mapUnit, contracts: mapContract }

/**
 * Đổi giá trị bất kỳ thành chuỗi chữ thường (để so khớp từ khóa tìm kiếm).
 */
const text = v => String(v ?? '').toLowerCase()
/**
 * Hàm so sánh để sắp xếp theo thời gian giảm dần (mới nhất trước).
 */
const byTime = (a, b) => (parseTime(b) || 0) - (parseTime(a) || 0)
/**
 * Hàm so sánh chuỗi theo tiếng Việt, có so sánh số tự nhiên ("A2" < "A10").
 */
const byText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true })

// Hàm tìm kiếm mặc định theo từng loại (chỉ dùng khi chia trang ở frontend). q đã là chữ thường.
const DEFAULT_MATCH = {
  /**
   * Tìm kiếm đơn đặt kho: khớp mã đơn, tên/email/SĐT khách hoặc số kho.
   */
  reservations: (r, q) => [r.id, r.reservationCode, r.customerName, r.customerEmail, r.customerPhone, ...(r.unitNumbers || [])].some(v => text(v).includes(q)),
  /**
   * Tìm kiếm kho: khớp mã kho, loại, kích thước, khu, tầng, ghi chú vị trí.
   */
  units: (u, q) => [u.id, u.type, u.size, u.zone, u.floor, u.locationNote].some(v => text(v).includes(q)),
  /**
   * Tìm kiếm hợp đồng: khớp số HĐ, mã đơn, tên/email khách hoặc số kho.
   */
  contracts: (c, q) => [c.contractNumber, c.reservationCode, c.customerName, c.customerEmail, ...(c.unitNumbers || [])].some(v => text(v).includes(q))
}

// Hàm so sánh để sắp xếp theo từng loại (chỉ dùng khi chia trang ở frontend), nhận thêm tham số sort.
const COMPARE = {
  /**
   * Sắp xếp đơn đặt kho theo lựa chọn: lịch hẹn gần/xa nhất, cũ nhất, mã đơn, mặc định mới đặt nhất.
   */
  reservations: (a, b, sort) => {
    // Tạo khóa sắp xếp theo lịch hẹn = ngày hẹn + khung giờ (chưa có ngày thì xếp cuối).
    const appt = r => `${r.appointmentDate || '9999'}${r.appointmentTime || ''}`
    if (sort === 'appointment') return byText(appt(a), appt(b))
    if (sort === 'appointment_desc') return byText(appt(b), appt(a))
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || a.id - b.id
    if (sort === 'code') return byText(a.reservationCode, b.reservationCode)
    return byTime(a.createdAt, b.createdAt) || b.id - a.id
  },
  /**
   * Sắp xếp kho theo lựa chọn: mã kho A→Z / Z→A, cũ nhất, mặc định mới thêm nhất.
   */
  units: (a, b, sort) => {
    if (sort === 'code') return byText(a.id, b.id)
    if (sort === 'code_desc') return byText(b.id, a.id)
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || (a.unitId || 0) - (b.unitId || 0)
    return byTime(a.createdAt, b.createdAt) || (b.unitId || 0) - (a.unitId || 0)
  },
  /**
   * Sắp xếp hợp đồng theo lựa chọn: sắp hết hạn trước, cũ nhất, số HĐ, mặc định mới tạo nhất.
   */
  contracts: (a, b, sort) => {
    if (sort === 'ending') return byText(a.endDate, b.endDate)
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || a.id - b.id
    if (sort === 'code') return byText(a.contractNumber, b.contractNumber)
    return byTime(a.createdAt, b.createdAt) || b.id - a.id
  }
}

/**
 * Hook lấy 1 danh sách vận hành có tìm kiếm / lọc / sắp xếp / phân trang.
 * Ví dụ: useOpsList('reservations', { q, status, sort, facilityId, pageSize, reloadKey, fallbackRows }).
 * API: GET /api/operations/{kind}?page=&pageSize=&q=&status=&sort=&facilityId=&typeId=
 * Được dùng bởi các bảng Đơn / Kho / Hợp đồng trong FacilityManagerAccount và FacilityStaffAccount.
 * @param {'reservations'|'units'|'contracts'} kind loại danh sách.
 * @param {object} options q (từ khóa), status, sort, facilityId, typeId, pageSize, reloadKey (đổi để tải lại),
 *   enabled, fallbackRows (dữ liệu dự phòng khi backend chưa hỗ trợ), statusOf (lấy mã trạng thái của dòng
 *   khi chia trang ở frontend, mặc định row.status), match (hàm tìm kiếm riêng).
 * @returns {object} kết quả của useServerList (page, total, setPage...) với items đã map sang dạng frontend.
 */
export function useOpsList(kind, {
  q = '',
  status = '',
  sort = 'newest',
  facilityId,
  typeId,
  pageSize = 20,
  reloadKey = 0,
  enabled = true,
  fallbackRows = [],
  statusOf = row => row.status,
  match = null
} = {}) {
  const mapper = MAPPERS[kind]
  const list = useServerList({
    path: `/api/operations/${kind}`,
    q,
    status,
    sort,
    extra: { facilityId, typeId },
    pageSize,
    reloadKey,
    enabled,
    fallback: {
      rows: fallbackRows,
      // Hàm lọc theo từ khóa khi phải chia trang ở frontend (dùng match riêng hoặc DEFAULT_MATCH).
      match: (row, { q: keyword }) => !keyword || (match || DEFAULT_MATCH[kind])(row, keyword),
      compare: COMPARE[kind],
      statusOf
    }
  })
  // Map từng dòng backend trả về (chế độ 'server') sang dạng frontend; chế độ dự phòng thì giữ nguyên.
  const items = useMemo(
    () => (list.mode === 'server' ? list.items.map(mapper) : list.items),
    [list.items, list.mode, mapper]
  )
  return { ...list, items }
}
