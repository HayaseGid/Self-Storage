/**
 * ======================================================================
 * FILE: src/api/catalogApi.js  —  API DANH MỤC LOẠI KHO / KÍCH THƯỚC KHO
 * CHỨC NĂNG: Gom các hàm gọi backend để thêm / sửa / xóa / liệt kê LOẠI KHO (UnitType) và
 *   KÍCH THƯỚC KHO (UnitSize), xóa một mức giá thuê, kèm các hàm tách/ghép chuỗi kích thước
 *   ("M2: 2x3m", "S1: Locker (...)"). Dữ liệu backend được chuẩn hóa về 1 dạng thống nhất.
 *   ⚠ Hiện CHỈ được import bởi pages/business/BusinessCatalog.jsx, mà trang này lại KHÔNG được
 *   file nào dùng -> đây là CODE CHƯA DÙNG (giữ nguyên, không xóa).
 * THÀNH PHẦN CHÍNH:
 *   - listUnitTypes / createUnitType / updateUnitType / deleteUnitType : CRUD loại kho.
 *   - listUnitSizes / createUnitSize / updateUnitSize / deleteUnitSize : CRUD kích thước kho.
 *   - deleteRentalRate : xóa 1 mức giá (cơ sở + loại + kích thước).
 *   - parseDimensions / composeDimensions : tách / ghép chuỗi kích thước.
 *   - isMissingEndpoint : nhận biết lỗi "backend chưa có endpoint" để ẩn tính năng.
 *   - catalogApi : object gom các hàm CRUD ở trên.
 * DÙNG Ở: src/pages/business/BusinessCatalog.jsx (trang chưa được gắn vào ứng dụng).
 * PHỤ THUỘC: ./api (apiGet, apiPost, apiPut, apiDelete).
 * API: GET/POST /api/unit-types, PUT/DELETE /api/unit-types/{id},
 *   GET/POST /api/unit-sizes, PUT/DELETE /api/unit-sizes/{id},
 *   DELETE /api/operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}.
 * LUỒNG: Trang danh mục gọi catalogApi.listUnitTypes() -> GET /api/unit-types -> normalizeUnitType()
 *   -> mảng object thống nhất -> trang hiển thị bảng; bấm Lưu -> createUnitType/updateUnitType -> API.
 * ======================================================================
 */
import { apiDelete, apiGet, apiPost, apiPut } from './api'

/**
 * Chuẩn hóa 1 bản ghi loại kho (UnitType) từ backend: gom các tên trường khác nhau
 * (unitTypeId/unitTypeID/id, name/typeName...) về cùng một object thống nhất.
 * Được gọi bởi listUnitTypes / createUnitType / updateUnitType.
 * @param {object} item bản ghi thô backend trả về.
 * @returns {object|null} loại kho đã chuẩn hóa, null nếu item rỗng.
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
 * Được gọi bởi listUnitSizes / createUnitSize / updateUnitSize.
 * @param {object} item bản ghi thô backend trả về.
 * @returns {object|null} kích thước kho đã chuẩn hóa, null nếu item rỗng.
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
 * @param {{typeName|name, description, isActive, facilityId}} payload dữ liệu form loại kho.
 * @returns {Promise<object|null>} loại kho vừa tạo (đã chuẩn hóa).
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
 * @param {number} id mã loại kho cần sửa.
 * @param {object} payload dữ liệu mới (typeName/name, description, isActive, facilityId).
 * @returns {Promise<object|null>} loại kho sau khi cập nhật (đã chuẩn hóa).
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
 * @param {number} id mã loại kho cần xóa.
 * @returns {Promise<any>} kết quả từ backend.
 */
export function deleteUnitType(id) {
  return apiDelete(`/api/unit-types/${id}`)
}

/**
 * Lấy danh sách kích thước kho (có thể lọc theo cơ sở).
 * API: GET /api/unit-sizes?facilityId=...  (UnitSizesController)
 * @param {number|null} facilityId mã cơ sở cần lọc (null = tất cả).
 * @returns {Promise<object[]>} danh sách kích thước đã chuẩn hóa.
 */
export async function listUnitSizes(facilityId = null) {
  const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ''
  const items = await apiGet(`/api/unit-sizes${query}`)
  return Array.isArray(items) ? items.map(normalizeUnitSize).filter(Boolean) : []
}

/**
 * Tạo kích thước kho mới (mã cỡ, tên, thể tích, dài/rộng/cao...).
 * API: POST /api/unit-sizes  (UnitSizesController)
 * @param {object} payload dữ liệu form kích thước (dimensions, sizeCode, displayName, volume, widthM...).
 * @returns {Promise<object|null>} kích thước vừa tạo (đã chuẩn hóa).
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
 * @param {number} id mã kích thước cần sửa.
 * @param {object} payload dữ liệu mới (giống createUnitSize).
 * @returns {Promise<object|null>} kích thước sau khi cập nhật (đã chuẩn hóa).
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
 * @param {number} id mã kích thước cần xóa.
 * @returns {Promise<any>} kết quả từ backend.
 */
export function deleteUnitSize(id) {
  return apiDelete(`/api/unit-sizes/${id}`)
}

/**
 * Xóa một mức giá thuê (theo cơ sở + loại kho + kích thước).
 * API: DELETE /api/operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}  (OperationsController)
 * @param {number} facilityId mã cơ sở.
 * @param {number} unitTypeId mã loại kho.
 * @param {number} unitSizeId mã kích thước.
 * @returns {Promise<any>} kết quả từ backend.
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
 * @returns {{code:string, length:number|'', width:number|'', area:number|null, isLocker:boolean, lockerNote:string}}
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
 * ví dụ { code:'M2', length:2, width:3 } -> "M2: 2x3m"; locker -> "S1: Locker (ghi chú)".
 * @param {{code, length, width, isLocker, lockerNote}} parts các phần kích thước từ form.
 * @returns {string} chuỗi kích thước ('' nếu thiếu mã cỡ; chỉ mã cỡ nếu thiếu dài/rộng).
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
 * @param {Error|ApiError} error lỗi bắt được khi gọi API.
 * @returns {boolean} true nếu là lỗi thiếu endpoint.
 */
export function isMissingEndpoint(error) {
  if (!error) return false
  const status = Number(error.status || error.statusCode || 0)
  if (status === 404 || status === 405 || status === 501) return true
  const msg = String(error.message || '')
  return /404|not found|chưa hỗ trợ/i.test(msg)
}

/** Object gom các hàm CRUD danh mục, để trang gọi gọn dạng catalogApi.listUnitTypes(). */
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
