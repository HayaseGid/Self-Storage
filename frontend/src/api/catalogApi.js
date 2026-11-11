/**
 * ======================================================================
 * FILE: src/api/catalogApi.js  —  API DANH MỤC LOẠI KHO / KÍCH THƯỚC KHO / GIÁ THUÊ
 * Backend: UnitTypesController (/api/unit-types), UnitSizesController (/api/unit-sizes),
 *          OperationsController (/api/operations/facilities/{id}/rates/...).
 * ⚠ GHI CHÚ: file này hiện CHỈ được import bởi pages/business/BusinessCatalog.jsx, mà BusinessCatalog.jsx
 *    lại KHÔNG được file nào dùng -> đây là CODE CHƯA DÙNG (giữ nguyên, không xóa).
 * - normalize*: chuẩn hóa dữ liệu backend (nhiều kiểu đặt tên trường) về 1 dạng thống nhất.
 * - list/create/update/delete: CRUD loại kho và kích thước kho.
 * - parseDimensions/composeDimensions: tách/ghép chuỗi kích thước dạng "M2: 2x3m" hoặc "S1: Locker (...)".
 * ======================================================================
 */
import { apiDelete, apiGet, apiPost, apiPut } from './api'

/**
 * Chuẩn hóa 1 bản ghi loại kho (UnitType) từ backend: gom các tên trường khác nhau
 * (unitTypeId/unitTypeID/id, name/typeName...) về cùng một object thống nhất.
 * @returns {object|null}
 */
function normalizeUnitType(item) {
  if (!item) return null
  const id = Number(item.unitTypeId ?? item.unitTypeID ?? item.id ?? 0)
  const name = item.name || item.typeName || ''
  return {
    id,
    unitTypeId: id,
    name,
    typeName: name,
    description: item.description || '',
    isActive: item.isActive !== false,
    unitCount: Number(item.unitCount ?? item.storageUnitCount ?? 0),
    storageUnitCount: Number(item.storageUnitCount ?? item.unitCount ?? 0),
    reservationCount: Number(item.reservationCount ?? 0),
    rateCount: Number(item.rateCount ?? 0)
  }
}

/**
 * Chuẩn hóa 1 bản ghi kích thước kho (UnitSize) từ backend: id, mã cỡ, tên hiển thị, kích thước,
 * thể tích, diện tích, dài/rộng/cao, trạng thái và các bộ đếm (số kho, số đơn, số mức giá).
 * @returns {object|null}
 */
function normalizeUnitSize(item) {
  if (!item) return null
  const id = Number(item.unitSizeId ?? item.unitSizeID ?? item.id ?? 0)
  const dimensions = item.dimensions || [item.sizeCode, item.displayName].filter(Boolean).join(': ') || ''
  const volume = item.volume === null || item.volume === undefined ? null : Number(item.volume)
  return {
    id,
    unitSizeId: id,
    sizeCode: item.sizeCode || '',
    displayName: item.displayName || dimensions,
    dimensions,
    volume: Number.isFinite(volume) ? volume : null,
    areaM2: item.areaM2 != null ? Number(item.areaM2) : null,
    widthM: item.widthM != null ? Number(item.widthM) : null,
    lengthM: item.lengthM != null ? Number(item.lengthM) : null,
    heightM: item.heightM != null ? Number(item.heightM) : null,
    isActive: item.isActive !== false,
    unitCount: Number(item.unitCount ?? item.storageUnitCount ?? 0),
    storageUnitCount: Number(item.storageUnitCount ?? item.unitCount ?? 0),
    reservationCount: Number(item.reservationCount ?? 0),
    rateCount: Number(item.rateCount ?? 0)
  }
}

/**
 * Lấy danh sách loại kho (có thể lọc theo cơ sở).
 * API: GET /api/unit-types?facilityId=...  (UnitTypesController)
 * @param {number|null} facilityId
 * @returns {Promise<object[]>} danh sách loại kho đã chuẩn hóa.
 */
export async function listUnitTypes(facilityId = null) {
  const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ''
  const items = await apiGet(`/api/unit-types${query}`)
  return Array.isArray(items) ? items.map(normalizeUnitType).filter(Boolean) : []
}

/**
 * Tạo loại kho mới.
 * API: POST /api/unit-types  (UnitTypesController)
 * @param {{typeName|name, description, isActive, facilityId}} payload
 */
export async function createUnitType(payload) {
  const name = (payload?.typeName || payload?.name || '').trim()
  const item = await apiPost('/api/unit-types', {
    typeName: name,
    name,
    description: payload?.description ?? '',
    isActive: payload?.isActive ?? true,
    facilityID: payload?.facilityId ?? payload?.facilityID ?? undefined
  })
  return normalizeUnitType(item)
}

/**
 * Cập nhật loại kho.
 * API: PUT /api/unit-types/{id}  (UnitTypesController)
 */
export async function updateUnitType(id, payload) {
  const name = (payload?.typeName || payload?.name || '').trim()
  const item = await apiPut(`/api/unit-types/${id}`, {
    typeName: name,
    name,
    description: payload?.description ?? '',
    isActive: payload?.isActive,
    facilityID: payload?.facilityId ?? payload?.facilityID ?? undefined
  })
  return normalizeUnitType(item)
}

/**
 * Xóa loại kho.
 * API: DELETE /api/unit-types/{id}  (UnitTypesController)
 */
export function deleteUnitType(id) {
  return apiDelete(`/api/unit-types/${id}`)
}

/**
 * Lấy danh sách kích thước kho (có thể lọc theo cơ sở).
 * API: GET /api/unit-sizes?facilityId=...  (UnitSizesController)
 */
export async function listUnitSizes(facilityId = null) {
  const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ''
  const items = await apiGet(`/api/unit-sizes${query}`)
  return Array.isArray(items) ? items.map(normalizeUnitSize).filter(Boolean) : []
}

/**
 * Tạo kích thước kho mới (mã cỡ, tên, thể tích, dài/rộng/cao...).
 * API: POST /api/unit-sizes  (UnitSizesController)
 */
export async function createUnitSize(payload) {
  const item = await apiPost('/api/unit-sizes', {
    dimensions: payload?.dimensions,
    sizeCode: payload?.sizeCode,
    displayName: payload?.displayName,
    volume: payload?.volume === '' || payload?.volume === null || payload?.volume === undefined
      ? null
      : Number(payload.volume),
    widthM: payload?.widthM ? Number(payload.widthM) : undefined,
    lengthM: payload?.lengthM ? Number(payload.lengthM) : undefined,
    heightM: payload?.heightM ? Number(payload.heightM) : undefined,
    isActive: payload?.isActive ?? true,
    facilityID: payload?.facilityId ?? payload?.facilityID ?? undefined
  })
  return normalizeUnitSize(item)
}

/**
 * Cập nhật kích thước kho.
 * API: PUT /api/unit-sizes/{id}  (UnitSizesController)
 */
export async function updateUnitSize(id, payload) {
  const item = await apiPut(`/api/unit-sizes/${id}`, {
    dimensions: payload?.dimensions,
    sizeCode: payload?.sizeCode,
    displayName: payload?.displayName,
    volume: payload?.volume === '' || payload?.volume === null || payload?.volume === undefined
      ? null
      : Number(payload.volume),
    widthM: payload?.widthM ? Number(payload.widthM) : undefined,
    lengthM: payload?.lengthM ? Number(payload.lengthM) : undefined,
    heightM: payload?.heightM ? Number(payload.heightM) : undefined,
    isActive: payload?.isActive,
    facilityID: payload?.facilityId ?? payload?.facilityID ?? undefined
  })
  return normalizeUnitSize(item)
}

/**
 * Xóa kích thước kho.
 * API: DELETE /api/unit-sizes/{id}  (UnitSizesController)
 */
export function deleteUnitSize(id) {
  return apiDelete(`/api/unit-sizes/${id}`)
}

/**
 * Xóa một mức giá thuê (theo cơ sở + loại kho + kích thước).
 * API: DELETE /api/operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}  (OperationsController)
 */
export function deleteRentalRate(facilityId, unitTypeId, unitSizeId) {
  return apiDelete(`/api/operations/facilities/${facilityId}/rates/${unitTypeId}/${unitSizeId}`)
}

/**
 * Tách chuỗi kích thước kho thành các phần riêng.
 * Ví dụ "M2: 2x3m" -> { code:'M2', length:2, width:3, area:6, isLocker:false }
 *       "S1: Locker (tủ nhỏ)" -> { code:'S1', isLocker:true, lockerNote:'tủ nhỏ' }
 * @param {string} dimensions chuỗi kích thước.
 * @param {number|null} volume diện tích/thể tích có sẵn (ưu tiên hơn diện tích tự tính).
 */
export function parseDimensions(dimensions = '', volume = null) {
  const raw = String(dimensions || '').trim()
  const [leftPart = '', rightPart = ''] = raw.split(':').map(part => part.trim())
  const codeMatch = leftPart.match(/^([SMLV]\d{1,2})$/i) || raw.match(/^([SMLV]\d{1,2})\b/i)
  const code = codeMatch ? codeMatch[1].toUpperCase() : ''
  const rest = rightPart || raw.replace(/^[SMLV]\d{1,2}\s*:?\s*/i, '').trim()

  const isLocker = /locker|tủ/i.test(rest)
  if (isLocker) {
    const noteMatch = rest.match(/\(([^)]+)\)/)
    const lockerNote = noteMatch
      ? noteMatch[1].trim()
      : rest.replace(/locker|tủ/gi, '').replace(/^[\s\-:]+|[\s\-:]+$/g, '').trim()
    return {
      code,
      length: '',
      width: '',
      area: null,
      isLocker: true,
      lockerNote
    }
  }

  const dimMatch = rest.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i)
  const length = dimMatch ? Number(dimMatch[1].replace(',', '.')) : ''
  const width = dimMatch ? Number(dimMatch[2].replace(',', '.')) : ''
  const computedArea = Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0
    ? Math.round(length * width * 10) / 10
    : null
  const numericVolume = volume !== null && volume !== undefined && volume !== '' && Number.isFinite(Number(volume))
    ? Number(volume)
    : null

  return {
    code,
    length,
    width,
    area: numericVolume ?? computedArea,
    isLocker: false,
    lockerNote: ''
  }
}

/**
 * Ghép các phần kích thước thành chuỗi chuẩn (ngược lại với parseDimensions),
 * ví dụ { code:'M2', length:2, width:3 } -> "M2: 2x3m".
 */
export function composeDimensions({ code = '', length = '', width = '', isLocker = false, lockerNote = '' } = {}) {
  const cleanCode = String(code || '').trim().toUpperCase()
  if (!cleanCode) return ''
  if (isLocker) {
    const note = String(lockerNote || '').trim()
    return note ? `${cleanCode}: Locker (${note})` : `${cleanCode}: Locker`
  }
  // Chuẩn hóa một số đo (chấp nhận dấu phẩy), làm tròn 1 chữ số thập phân; không hợp lệ -> ''.
  const fmt = n => {
    const num = Number(String(n).replace(',', '.'))
    return Number.isFinite(num) && num > 0 ? String(Math.round(num * 10) / 10) : ''
  }
  const l = fmt(length)
  const w = fmt(width)
  if (!l || !w) return cleanCode
  return `${cleanCode}: ${l}x${w}m`
}

/**
 * Kiểm tra lỗi có phải do backend chưa có endpoint này không (404/405/501 hoặc message "not found").
 * Dùng để giao diện ẩn tính năng thay vì báo lỗi.
 */
export function isMissingEndpoint(error) {
  if (!error) return false
  const status = Number(error.status || error.statusCode || 0)
  if (status === 404 || status === 405 || status === 501) return true
  const msg = String(error.message || '')
  return /404|not found|chưa hỗ trợ/i.test(msg)
}

export const catalogApi = {
  listUnitTypes,
  createUnitType,
  updateUnitType,
  deleteUnitType,
  listUnitSizes,
  createUnitSize,
  updateUnitSize,
  deleteUnitSize,
  deleteRentalRate
}
