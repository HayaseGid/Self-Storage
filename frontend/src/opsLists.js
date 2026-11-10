import { useMemo } from 'react'
import { parseTime, useServerList } from './listKit'
import { mapContract, mapReservation, mapUnit } from './operationsState'

/*
 * DANH SÁCH VẬN HÀNH CÓ PHÂN TRANG Ở BACKEND (file THÊM MỚI) - Staff / Manager / Business dùng chung.
 *   GET /api/operations/reservations | units | contracts ?page=&pageSize=&q=&status=&sort=&facilityId=&typeId=
 * Mỗi dòng được chuyển đổi bằng đúng hàm của /state (mapReservation / mapUnit / mapContract) nên các màn hình cũ dùng lại được.
 * Backend chưa chạy bản mới (404) -> tự chia trang ở frontend từ fallbackRows (dữ liệu /state đang có).
 */

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

const MAPPERS = { reservations: mapReservation, units: mapUnit, contracts: mapContract }

const text = v => String(v ?? '').toLowerCase()
const byTime = (a, b) => (parseTime(b) || 0) - (parseTime(a) || 0)
const byText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true })

const DEFAULT_MATCH = {
  reservations: (r, q) => [r.id, r.reservationCode, r.customerName, r.customerEmail, r.customerPhone, ...(r.unitNumbers || [])].some(v => text(v).includes(q)),
  units: (u, q) => [u.id, u.type, u.size, u.zone, u.floor, u.locationNote].some(v => text(v).includes(q)),
  contracts: (c, q) => [c.contractNumber, c.reservationCode, c.customerName, c.customerEmail, ...(c.unitNumbers || [])].some(v => text(v).includes(q))
}

const COMPARE = {
  reservations: (a, b, sort) => {
    const appt = r => `${r.appointmentDate || '9999'}${r.appointmentTime || ''}`
    if (sort === 'appointment') return byText(appt(a), appt(b))
    if (sort === 'appointment_desc') return byText(appt(b), appt(a))
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || a.id - b.id
    if (sort === 'code') return byText(a.reservationCode, b.reservationCode)
    return byTime(a.createdAt, b.createdAt) || b.id - a.id
  },
  units: (a, b, sort) => {
    if (sort === 'code') return byText(a.id, b.id)
    if (sort === 'code_desc') return byText(b.id, a.id)
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || (a.unitId || 0) - (b.unitId || 0)
    return byTime(a.createdAt, b.createdAt) || (b.unitId || 0) - (a.unitId || 0)
  },
  contracts: (a, b, sort) => {
    if (sort === 'ending') return byText(a.endDate, b.endDate)
    if (sort === 'oldest') return -byTime(a.createdAt, b.createdAt) || a.id - b.id
    if (sort === 'code') return byText(a.contractNumber, b.contractNumber)
    return byTime(a.createdAt, b.createdAt) || b.id - a.id
  }
}

/*
 * useOpsList('reservations', { q, status, sort, facilityId, typeId, pageSize, reloadKey, fallbackRows, statusOf, match })
 *   statusOf(row): mã trạng thái của dòng khi chia trang ở frontend (mặc định row.status)
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
      match: (row, { q: keyword }) => !keyword || (match || DEFAULT_MATCH[kind])(row, keyword),
      compare: COMPARE[kind],
      statusOf
    }
  })
  const items = useMemo(
    () => (list.mode === 'server' ? list.items.map(mapper) : list.items),
    [list.items, list.mode, mapper]
  )
  return { ...list, items }
}
