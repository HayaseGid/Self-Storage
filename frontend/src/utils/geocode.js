/**
 * ======================================================================
 * FILE: src/utils/geocode.js  —  ĐỔI ĐỊA CHỈ THÀNH TỌA ĐỘ + TÍNH KHOẢNG CÁCH
 * CHỨC NĂNG:
 *   - geocodeAddress: tra tọa độ từ địa chỉ bằng Nominatim (OpenStreetMap), thử nhiều cách viết địa chỉ.
 *   - suggestAddresses: gợi ý địa chỉ khi khách đang gõ (dịch vụ Photon, dữ liệu OpenStreetMap, làm riêng cho gợi ý khi gõ).
 *   - distanceKm: khoảng cách đường chim bay giữa 2 tọa độ (công thức Haversine).
 * DÙNG Ở: features/facility/LocationPicker.jsx (BOM chọn vị trí cơ sở),
 *         features/facility/NearestFacilityFinder.jsx (khách tìm cơ sở gần nhất).
 * API: GET https://nominatim.openstreetmap.org/search và GET https://photon.komoot.io/api (chỉ gửi chuỗi địa chỉ, không gửi gì khác).
 *   Lưu ý: Nominatim cấm dùng để gợi ý trong lúc gõ, nên phần gợi ý dùng Photon.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   noAccent: Bỏ dấu tiếng Việt (OpenStreetMap tìm địa chỉ không dấu tốt hơn) → dùng ở: addressCandidates
 *   wait: Chờ ms mili-giây (Promise), dùng giãn cách giữa các lần gọi Nominatim → dùng ở: geocodeAddress
 *   addressCandidates: Các cách viết địa chỉ để thử lần lượt (OpenStreetMap thường không nhận "Quận..." sau đợt sáp nhập hành chính 2025) → dùng ở: geocodeAddress
 *   geocodeAddress: Tra tọa độ từ địa chỉ (giới hạn Việt Nam) → dùng ở: LocationPicker.jsx (searchAddress), NearestFacilityFinder.jsx (searchAddress)
 *   suggestAddresses: Gợi ý tối đa 5 địa điểm khớp với chữ khách đang gõ (Photon) → dùng ở: NearestFacilityFinder.jsx
 *   distanceKm: Khoảng cách đường chim bay (km) giữa 2 điểm, công thức Haversine (bán kính Trái Đất 6371 km) → dùng ở: NearestFacilityFinder.jsx (NearestFacilityFinder)
 *   rad: Đổi độ sang radian (dùng trong công thức Haversine) → dùng ở: distanceKm
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

/**
 * Gợi ý địa điểm khi khách đang gõ (Photon, giới hạn khung Việt Nam, ưu tiên gần trung tâm TP.HCM).
 * @param {string} text chữ khách đang gõ. @param {AbortSignal} [signal] để hủy khi khách gõ tiếp.
 * @returns {Promise<{main:string, sub:string, label:string, latitude:number, longitude:number}[]>}
 *   main = tên / số nhà + đường (dòng đậm), sub = phường, quận, thành phố (dòng nhạt), label = cả địa chỉ.
 */
export async function suggestAddresses(text, signal) {
  const res = await fetch(`https://photon.komoot.io/api/?limit=8&lang=default&lat=10.7769&lon=106.7009&bbox=102,8,110,24&q=${encodeURIComponent(text)}`, { signal })
  const data = await res.json()
  const seen = new Set()
  return (data.features || [])
    .filter(f => f.properties?.countrycode === 'VN')
    .map(({ properties: p, geometry }) => {
      const road = [p.housenumber, p.street].filter(Boolean).join(' ')
      const main = p.name || road || p.district || p.city || ''
      const sub = [p.name && road, p.locality, p.district, p.city].filter(s => s && s !== main).join(', ')
      return { main, sub, label: sub ? `${main}, ${sub}` : main, latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] }
    })
    .filter(s => s.main && !seen.has(s.label) && seen.add(s.label))
    .slice(0, 5)
}

/**
 * Khoảng cách đường chim bay (km) giữa 2 điểm, công thức Haversine (bán kính Trái Đất 6371 km).
 * @param {{latitude:number, longitude:number}} a @param {{latitude:number, longitude:number}} b
 * @returns {number} số km.
 */
export function distanceKm(a, b) {
  const rad = d => (Number(d) * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
