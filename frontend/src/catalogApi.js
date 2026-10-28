import { apiDelete, apiGet, apiPost, apiPut } from './api'

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

export async function listUnitTypes(facilityId = null) {
  const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ''
  const items = await apiGet(`/api/unit-types${query}`)
  return Array.isArray(items) ? items.map(normalizeUnitType).filter(Boolean) : []
}

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

export function deleteUnitType(id) {
  return apiDelete(`/api/unit-types/${id}`)
}

export async function listUnitSizes(facilityId = null) {
  const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ''
  const items = await apiGet(`/api/unit-sizes${query}`)
  return Array.isArray(items) ? items.map(normalizeUnitSize).filter(Boolean) : []
}

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

export function deleteUnitSize(id) {
  return apiDelete(`/api/unit-sizes/${id}`)
}

export function deleteRentalRate(facilityId, unitTypeId, unitSizeId) {
  return apiDelete(`/api/operations/facilities/${facilityId}/rates/${unitTypeId}/${unitSizeId}`)
}

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

export function composeDimensions({ code = '', length = '', width = '', isLocker = false, lockerNote = '' } = {}) {
  const cleanCode = String(code || '').trim().toUpperCase()
  if (!cleanCode) return ''
  if (isLocker) {
    const note = String(lockerNote || '').trim()
    return note ? `${cleanCode}: Locker (${note})` : `${cleanCode}: Locker`
  }
  const fmt = n => {
    const num = Number(String(n).replace(',', '.'))
    return Number.isFinite(num) && num > 0 ? String(Math.round(num * 10) / 10) : ''
  }
  const l = fmt(length)
  const w = fmt(width)
  if (!l || !w) return cleanCode
  return `${cleanCode}: ${l}x${w}m`
}

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
