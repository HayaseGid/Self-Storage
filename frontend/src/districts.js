/*
 * Tách khu vực (quận / huyện / TP. Thủ Đức...) từ địa chỉ cơ sở để lọc theo khu vực.
 *
 * Đây là giải pháp TẠM ở frontend: database chưa có cột khu vực riêng.
 * Địa chỉ mẫu có dạng "123 Lê Lợi, Quận 1, TP.HCM" / "456 Cộng Hòa, Tân Bình, TP.HCM".
 * Khi backend thêm cột District cho Facility, chỉ cần trả về trường `district`
 * trong /api/catalog/state, hàm getFacilityDistrict() sẽ ưu tiên dùng giá trị đó.
 */

const CITY_PATTERN = /^(?:tp\.?|thành phố|thanh pho)?\s*(?:hcm|hồ chí minh|ho chi minh|sài gòn|sai gon|hà nội|ha noi|đà nẵng|da nang|cần thơ|can tho|hải phòng|hai phong)\.?$/i
const COUNTRY_PATTERN = /^(?:việt nam|viet nam|vietnam|vn)$/i
const WARD_PATTERN = /^(?:phường|phuong|p\.|xã|xa|thị trấn|thi tran)\s/i
const DISTRICT_PREFIX = /^(quận|quan|q\.?|huyện|huyen|h\.|thị xã|thi xa|tx\.?|thành phố|thanh pho|tp\.?)\s*(.+)$/i

export function slugifyDistrict(label) {
  return String(label || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeLabel(prefix, rest) {
  const name = rest.trim().replace(/\.$/, '')
  if (/^\d+$/.test(name)) return `Quận ${Number(name)}`
  const p = prefix.toLowerCase()
  if (p.startsWith('huy') || p === 'h.') return `Huyện ${name}`
  return name
}

/* Trả về { label, slug } hoặc null nếu không xác định được. */
export function extractDistrict(address, facilityName = '') {
  const segments = String(address || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !CITY_PATTERN.test(part) && !COUNTRY_PATTERN.test(part))

  // 1. Ưu tiên đoạn có tiền tố Quận / Huyện / TP. (kể cả viết tắt Q.7, Q7)
  for (let i = segments.length - 1; i >= 0; i--) {
    const compact = /^q\.?\s*(\d+)$/i.exec(segments[i])
    if (compact) {
      const label = `Quận ${Number(compact[1])}`
      return { label, slug: slugifyDistrict(label) }
    }
    const match = DISTRICT_PREFIX.exec(segments[i])
    if (match && match[2] && !/^\d+\s+\S/.test(segments[i])) {
      const label = normalizeLabel(match[1], match[2])
      return { label, slug: slugifyDistrict(label) }
    }
  }

  // 2. Không có tiền tố: lấy đoạn cuối không phải số nhà / phường (ví dụ "Tân Bình", "Thủ Đức")
  if (segments.length >= 2) {
    for (let i = segments.length - 1; i >= 1; i--) {
      const part = segments[i]
      if (!/^\d/.test(part) && !WARD_PATTERN.test(part)) return { label: part, slug: slugifyDistrict(part) }
    }
  }

  // 3. Dự phòng: đọc từ tên cơ sở, ví dụ "Cơ sở Lưu trữ Quận 3", "StoreSpace Tân Bình", "Thủ Đức"
  const fromName = /quận\s*(\d+)/i.exec(facilityName || '')
  if (fromName) {
    const label = `Quận ${Number(fromName[1])}`
    return { label, slug: slugifyDistrict(label) }
  }
  const stripped = String(facilityName || '')
    .replace(/^(cơ sở lưu trữ|cơ sở|chi nhánh|kho lưu trữ|kho|storespace)\s+/i, '')
    .replace(/^(cơ sở lưu trữ|cơ sở|chi nhánh|kho)\s+/i, '')
    .trim()
  if (stripped && stripped.length <= 30 && !/\d{2,}/.test(stripped)) {
    const match = DISTRICT_PREFIX.exec(stripped)
    const label = match && match[2] ? normalizeLabel(match[1], match[2]) : stripped
    return { label, slug: slugifyDistrict(label) }
  }
  return null
}

export function getFacilityDistrict(facility) {
  if (facility?.districtName) return { label: facility.districtName, slug: slugifyDistrict(facility.districtName) }
  return extractDistrict(facility?.location || facility?.address, facility?.name)
}

/*
 * Gom danh sách cơ sở theo khu vực, sắp theo tên (Quận 1, Quận 2... trước, rồi tên chữ).
 * Trả về [{ slug, label, facilities: [...] }]. Cơ sở không xác định được khu vực vào nhóm "Khác".
 */
export function groupFacilitiesByDistrict(facilityList) {
  const groups = new Map()
  for (const facility of facilityList) {
    const district = facility.district || getFacilityDistrict(facility) || { label: 'Khu vực khác', slug: 'khac' }
    if (!groups.has(district.slug)) groups.set(district.slug, { ...district, facilities: [] })
    groups.get(district.slug).facilities.push(facility)
  }
  return [...groups.values()].sort((a, b) => {
    if (a.slug === 'khac') return 1
    if (b.slug === 'khac') return -1
    const na = /^Quận (\d+)$/.exec(a.label)
    const nb = /^Quận (\d+)$/.exec(b.label)
    if (na && nb) return Number(na[1]) - Number(nb[1])
    if (na) return -1
    if (nb) return 1
    return a.label.localeCompare(b.label, 'vi')
  })
}
