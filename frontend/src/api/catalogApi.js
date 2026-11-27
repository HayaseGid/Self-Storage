/**
 * ======================================================================
 * FILE: src/api/catalogApi.js  —  API DANH MỤC LOẠI KHO / KÍCH THƯỚC KHO
 * CHỨC NĂNG: Gom các hàm gọi backend để thêm / sửa / xóa / liệt kê LOẠI KHO (UnitType) và
 *   KÍCH THƯỚC KHO (UnitSize), lấy nhóm kích thước, xóa một mức giá thuê. Dữ liệu backend được chuẩn hóa
 *   về 1 dạng thống nhất. Thêm / sửa / xóa chỉ Business Operations làm được (backend kiểm tra).
 * THÀNH PHẦN CHÍNH:
 *   - listUnitTypes / createUnitType / updateUnitType / deleteUnitType : CRUD loại kho.
 *   - listUnitSizes / createUnitSize / updateUnitSize / deleteUnitSize : CRUD kích thước kho.
 *   - deleteRentalRate : xóa 1 mức giá (cơ sở + loại + kích thước).
 *   - listSizeCategories : nhóm kích thước (Small / Medium / Large / Vehicle) + khoảng diện tích.
 *   - isMissingEndpoint : nhận biết lỗi "backend chưa có endpoint" để ẩn tính năng.
 *   - catalogApi : object gom các hàm CRUD ở trên.
 * DÙNG Ở: src/pages/business/BusinessCatalog.jsx (menu "Danh mục kho" của Business Operations).
 * PHỤ THUỘC: ./api (apiGet, apiPost, apiPut, apiDelete).
 * API: GET/POST /api/unit-types, PUT/DELETE /api/unit-types/{id},
 *   GET/POST /api/unit-sizes, PUT/DELETE /api/unit-sizes/{id}, GET /api/unit-sizes/categories,
 *   DELETE /api/operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}.
 * LUỒNG: Trang danh mục gọi catalogApi.listUnitTypes() -> GET /api/unit-types -> normalizeUnitType()
 *   -> mảng object thống nhất -> trang hiển thị bảng; bấm Lưu -> createUnitType/updateUnitType -> API.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   normalizeUnitType: Chuẩn hóa 1 bản ghi loại kho (UnitType) từ backend: gom các tên trường khác nhau → dùng ở: listUnitTypes, createUnitType, updateUnitType
 *   normalizeUnitSize: Chuẩn hóa 1 bản ghi kích thước kho (UnitSize) từ backend: id, mã cỡ, tên hiển thị, kích thước, thể tích, diện tích, dài/rộng/cao → dùng ở: listUnitSizes, createUnitSize, updateUnitSize
 *   listUnitTypes: Lấy danh sách loại kho (có thể lọc theo cơ sở) → dùng ở: (cấp file)
 *   createUnitType: Tạo loại kho mới. API: POST /api/unit-types (UnitTypesController) → dùng ở: (cấp file)
 *   updateUnitType: Cập nhật loại kho. API: PUT /api/unit-types/{id} (UnitTypesController) → dùng ở: (cấp file)
 *   deleteUnitType: Xóa loại kho. API: DELETE /api/unit-types/{id} (UnitTypesController) → dùng ở: (cấp file)
 *   listUnitSizes: Lấy danh sách kích thước kho (có thể lọc theo cơ sở) → dùng ở: (cấp file)
 *   createUnitSize: Tạo kích thước kho mới (nhóm, rộng, dài, tên hiển thị; mã size + chiều cao backend tự cấp) → dùng ở: (cấp file)
 *   updateUnitSize: Cập nhật kích thước kho. API: PUT /api/unit-sizes/{id} (UnitSizesController) → dùng ở: (cấp file)
 *   deleteUnitSize: Xóa kích thước kho. API: DELETE /api/unit-sizes/{id} (UnitSizesController) → dùng ở: (cấp file)
 *   deleteRentalRate: Xóa một mức giá thuê (theo cơ sở + loại kho + kích thước) → dùng ở: (cấp file)
 *   sizeBody: Dựng body gửi lên khi tạo / sửa kích thước → dùng ở: createUnitSize, updateUnitSize
 *   listSizeCategories: Lấy nhóm kích thước đang dùng. API: GET /api/unit-sizes/categories → dùng ở: BusinessCatalog.jsx (load)
 *   isMissingEndpoint: Kiểm tra lỗi có phải do backend chưa có endpoint này không (404/405/501 hoặc message "not found") → dùng ở: BusinessCatalog.jsx (load)
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
    rateCount: Number(item.rateCount ?? 0),
    sizeCategoryId: item.sizeCategoryID != null || item.sizeCategoryId != null ? Number(item.sizeCategoryID ?? item.sizeCategoryId) : null,
    categoryName: item.categoryName || ''
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
  const item = await apiPost('/api/unit-sizes', sizeBody(payload, true))
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
  const item = await apiPut(`/api/unit-sizes/${id}`, sizeBody(payload, false))
  return normalizeUnitSize(item)
}

/**
 * Body gửi lên khi tạo / sửa kích thước: nhóm, rộng, dài, tên hiển thị, đang dùng.
 * Mã size và chiều cao do backend tự cấp theo nhóm. Trường không gửi (undefined) thì backend giữ nguyên.
 * @param {{sizeCategoryId, widthM, lengthM, displayName, isActive}} payload dữ liệu form.
 * @param {boolean} isCreate tạo mới (isActive mặc định true).
 */
function sizeBody(payload, isCreate) {
  return {
    sizeCategoryID: payload?.sizeCategoryId ?? undefined,
    widthM: payload?.widthM ?? undefined,
    lengthM: payload?.lengthM ?? undefined,
    displayName: payload?.displayName ?? undefined,
    isActive: payload?.isActive ?? (isCreate ? true : undefined)
  }
}

/**
 * Lấy các nhóm kích thước đang dùng (Small / Medium / Large / Vehicle) kèm khoảng diện tích cho phép.
 * API: GET /api/unit-sizes/categories  (UnitSizesController)
 * @returns {Promise<object[]>} [{ sizeCategoryId, categoryName, codePrefix, standardHeightM, minAreaM2, maxAreaM2 }]
 */
export async function listSizeCategories() {
  const items = await apiGet('/api/unit-sizes/categories')
  return Array.isArray(items) ? items.map(c => ({
    sizeCategoryId: Number(c.sizeCategoryID ?? c.sizeCategoryId),
    categoryCode: c.categoryCode,
    categoryName: c.categoryName,
    codePrefix: c.codePrefix,
    standardHeightM: Number(c.standardHeightM),
    minAreaM2: Number(c.minAreaM2),
    maxAreaM2: Number(c.maxAreaM2)
  })) : []
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
  listSizeCategories,
  createUnitSize,
  updateUnitSize,
  deleteUnitSize,
  deleteRentalRate
}
