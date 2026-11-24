/**
 * ======================================================================
 * FILE: src/utils/geocode.js  —  ĐỔI ĐỊA CHỈ THÀNH TỌA ĐỘ
 * CHỨC NĂNG:
 *   - geocodeAddress: tra tọa độ từ địa chỉ bằng Nominatim (OpenStreetMap), thử nhiều cách viết địa chỉ.
 * DÙNG Ở: features/facility/LocationPicker.jsx (BOM chọn vị trí cơ sở).
 * API: GET https://nominatim.openstreetmap.org/search (chỉ gửi chuỗi địa chỉ, không gửi gì khác).
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   noAccent: Bỏ dấu tiếng Việt (OpenStreetMap tìm địa chỉ không dấu tốt hơn) → dùng ở: addressCandidates
 *   wait: Chờ ms mili-giây (Promise), dùng giãn cách giữa các lần gọi Nominatim → dùng ở: geocodeAddress
 *   addressCandidates: Các cách viết địa chỉ để thử lần lượt (OpenStreetMap thường không nhận "Quận..." sau đợt sáp nhập hành chính 2025) → dùng ở: geocodeAddress
 *   geocodeAddress: Tra tọa độ từ địa chỉ (giới hạn Việt Nam) → dùng ở: LocationPicker.jsx (searchAddress)
 */

/** Bỏ dấu tiếng Việt (OpenStreetMap tìm địa chỉ không dấu tốt hơn). */
const noAccent = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Các cách viết địa chỉ để thử lần lượt (OpenStreetMap thường không nhận "Quận..." sau đợt sáp nhập hành chính 2025):
 * nguyên văn -> không dấu -> bỏ quận/phường -> bỏ số nhà -> chỉ tên đường + thành phố.
 */
function addressCandidates(address) {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean)
  const street = (parts[0] || '').replace(/^(số\s*)?[\d/]+[a-zA-Z]?\s+/i, '')
  const city = parts.length > 1 ? parts[parts.length - 1] : 'Hồ Chí Minh'
  const noDistrict = parts.filter(p => !/^(quận|q\.|huyện|phường|p\.|xã)\s/i.test(p)).join(', ')
  return [...new Set([address, noAccent(address), noAccent(noDistrict), noAccent([street, ...parts.slice(1)].join(', ')), noAccent(`${street}, ${city}`)]
    .map(s => s.trim()).filter(s => s.length >= 4))].slice(0, 5)
}

/**
 * Tra tọa độ từ địa chỉ (giới hạn Việt Nam). Thử lần lượt các cách viết, cách nhau ~1 giây (quy định của Nominatim).
 * @param {string} address địa chỉ người dùng gõ.
 * @returns {Promise<{latitude:number, longitude:number, approximate:boolean}|null>} null = không tìm thấy;
 *   approximate = true khi chỉ tìm được theo tên đường (vị trí gần đúng). Lỗi mạng thì ném lỗi.
 */
export async function geocodeAddress(address) {
  const candidates = addressCandidates(address.trim())
  for (let i = 0; i < candidates.length; i++) {
    if (i > 0) await wait(1100)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=vn&accept-language=vi&q=${encodeURIComponent(candidates[i])}`, { headers: { Accept: 'application/json' } })
    const list = await res.json()
    if (Array.isArray(list) && list.length) return { latitude: Number(list[0].lat), longitude: Number(list[0].lon), approximate: i >= 3 }
  }
  return null
}
