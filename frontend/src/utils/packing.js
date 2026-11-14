/**
 * ======================================================================
 * FILE: src/utils/packing.js  —  THUẬT TOÁN XẾP ĐỒ TRONG KHO (3D BIN PACKING) CHO TRÌNH XEM KHO 3D
 * Thuật toán: Extreme Point Best-Fit (EP-BFD) theo bài báo Crainic, Perboli, Tadei (2007).
 * Công dụng: (1) bày "đồ mẫu" để khách hình dung kho chứa được gì; (2) cho khách tự kéo thả/tự xếp thùng,
 * tính "còn xếp thêm được bao nhiêu thùng". Thuần tính toán, không gọi API, không dùng React.
 * Đơn vị mét. Trục: x = rộng (w), y = cao (h), z = sâu/dài (d). Mỗi món { id, x, y, z, w, h, d }.
 * Dùng ở: features/unit/ThreeUnitScene.jsx, features/unit/UnitPackPlanner.jsx.
 * ======================================================================
 */
/*
 * XẾP ĐỒ TRONG KHO – thuật toán Extreme Point Best-Fit (EP-BFD) theo:
 *   T. G. Crainic, G. Perboli, R. Tadei, "Extreme Point-Based Heuristics for Three-Dimensional Bin Packing",
 *   CIRRELT-2007-41 (2007).
 *
 * Ý chính của bài báo, áp dụng ở đây:
 *  1. Điểm cực (Extreme Points – EP): mỗi món đặt vào sinh ra các góc ngoài (x+w, y, z), (x, y, z+d), (x, y+h, z),
 *     mỗi góc được CHIẾU theo các trục về phía vách / món gần nhất -> tối đa 6 EP mới (Thuật toán 1 trong bài).
 *     Món tiếp theo chỉ cần thử đặt góc trái-trong-dưới lên các EP này (~6n điểm thay vì ~n² điểm).
 *  2. Thứ tự xếp "Clustered Area-Height": gom món theo diện tích đáy (mỗi cụm δ% diện tích sàn), cụm lớn trước,
 *     trong cụm món cao trước (mục 4.1; bài báo cho thấy δ ≈ 5–25 cho kết quả tốt, ở đây dùng δ = 10).
 *  3. Chọn EP bằng "Residual Space": khoảng trống dư quanh EP theo 3 trục; đặt món vào EP có khoảng dư KHÍT
 *     nhất với kích thước món: min (RSx − w) + (RSz − d) + (RSy − h) (mục 4.3, là biến thể tốt nhất trong bài).
 *
 * Bổ sung cho kho thật (bài báo không xét):
 *  - Món phải được ĐỠ: đặt trên sàn, hoặc đáy tựa ≥ 70% diện tích lên nóc các món bên dưới (không lơ lửng).
 *  - Cho XOAY 90° trên mặt sàn (bài báo gợi ý: thêm bản xoay của mỗi món).
 *  - floorOnly: đồ to chỉ đặt trên sàn; noTop: không chồng gì lên (ghế, đèn, xe); maxTop: giới hạn chiều cao chồng;
 *    lối đi: vùng cấm (vật cản ảo cao tới trần).
 *
 * Đơn vị mét. Trục: x = rộng (W), y = cao (H), z = sâu/dài (L). Hai vách ở x = 0 và z = 0.
 * Mỗi món: { id, x, y, z, w, h, d } với (x, y, z) là góc trái-dưới-trong cùng.
 */

const EPS = 1e-6
export const SUPPORT_RATIO = 0.7
const CLUSTER_DELTA = 10 // δ (%) cho thứ tự Clustered Area-Height

/* Danh mục để khách tự xếp (kích thước thật, m). */
export const PACK_ITEMS = [
  { key: 'box-s', name: 'Thùng nhỏ', size: '40×30×30 cm', w: 0.4, h: 0.3, d: 0.3, color: '#d9a066' },
  { key: 'box-m', name: 'Thùng vừa', size: '60×40×40 cm', w: 0.6, h: 0.4, d: 0.4, color: '#c98b4f' },
  { key: 'box-l', name: 'Thùng lớn', size: '80×50×50 cm', w: 0.8, h: 0.5, d: 0.5, color: '#b5763c' },
  { key: 'mattress', name: 'Nệm đơn (dựng đứng)', size: '190×90×20 cm', w: 0.9, h: 1.9, d: 0.2, color: '#e8e3d9', floorOnly: true },
  { key: 'fridge', name: 'Tủ lạnh', size: '60×65×170 cm', w: 0.6, h: 1.7, d: 0.65, color: '#cfd8dc', floorOnly: true },
  { key: 'shelf', name: 'Kệ / tủ sách', size: '80×35×180 cm', w: 0.8, h: 1.8, d: 0.35, color: '#8d5a3b', floorOnly: true },
  { key: 'motorbike', name: 'Xe máy', size: '190×70×110 cm', w: 0.7, h: 1.1, d: 1.9, color: '#37474f', floorOnly: true, noTop: true }
]
/**
 * Tìm loại đồ trong danh mục PACK_ITEMS theo key.
 */
export const itemType = key => PACK_ITEMS.find(item => item.key === key)

/**
 * Kiểm tra 2 đoạn [a0,a1) và [b0,b1) có giao nhau không (có sai số EPS).
 */
const overlap1 = (a0, a1, b0, b1) => a0 < b1 - EPS && b0 < a1 - EPS
/**
 * Kiểm tra giá trị v có nằm trong đoạn [a0,a1) không (có sai số EPS).
 */
const inside1 = (v, a0, a1) => v >= a0 - EPS && v < a1 - EPS
/**
 * Làm tròn 3 chữ số thập phân (mm).
 */
const r3 = v => Math.round(v * 1000) / 1000
/* Món noTop chiếm cả cột phía trên nó (không được đặt đồ lên). */
/**
 * Độ cao nóc của món; món noTop (ghế, đèn, xe...) coi như chiếm cả cột tới trần để không chồng gì lên.
 */
const topOf = (it, room) => (it.noTop ? room.h : it.y + it.h)

/* ------------------------------------------------------------------ Kiểm tra một vị trí */

/**
 * Kiểm tra hộp (x,y,z,w,h,d) có va chạm với món nào khác trong kho không.
 * @param {string} excludeId bỏ qua món này (khi đang kéo chính nó).
 * @returns {boolean}
 */
function collides(items, room, x, y, z, w, h, d, excludeId) {
  for (const it of items) {
    if (it.id === excludeId) continue
    if (overlap1(x, x + w, it.x, it.x + it.w) && overlap1(z, z + d, it.z, it.z + it.d) && overlap1(y, y + h, it.y, topOf(it, room))) return true
  }
  return false
}

/* Tỉ lệ diện tích đáy được đỡ tại độ cao y (1 = trên sàn). */
/**
 * Tính tỉ lệ diện tích đáy của hộp được đỡ bởi nóc các món bên dưới ở độ cao y (trên sàn = 1).
 * @returns {number} 0..1
 */
export function supportRatio(items, x, y, z, w, d, excludeId = null) {
  if (y <= EPS) return 1
  let area = 0
  for (const it of items) {
    if (it.id === excludeId || it.noTop || it.obstacle) continue
    if (Math.abs(it.y + it.h - y) > 1e-4) continue
    const ox = Math.min(x + w, it.x + it.w) - Math.max(x, it.x)
    const oz = Math.min(z + d, it.z + it.d) - Math.max(z, it.z)
    if (ox > EPS && oz > EPS) area += ox * oz
  }
  return area / (w * d)
}

/**
 * Kiểm tra hộp có đặt hợp lệ tại vị trí cho trước: trong kho, không quá trần/maxTop, đồ floorOnly phải ở sàn,
 * không va chạm, và được đỡ >= SUPPORT_RATIO (70%).
 */
function fitsAt(items, room, x, y, z, w, h, d, { excludeId = null, floorOnly = false, maxTop = room.h } = {}) {
  if (x < -EPS || y < -EPS || z < -EPS) return false
  if (x + w > room.w + EPS || z + d > room.l + EPS || y + h > Math.min(room.h, maxTop) + EPS) return false
  if (floorOnly && y > EPS) return false
  if (collides(items, room, x, y, z, w, h, d, excludeId)) return false
  return supportRatio(items, x, y, z, w, d, excludeId) >= SUPPORT_RATIO - EPS
}

/*
 * Độ cao mặt đỡ (dùng khi KÉO THẢ): món "rơi" xuống nóc cao nhất bên dưới vùng (x, z, w, d).
 * Infinity nếu bên dưới có món không chồng được (noTop) hoặc lối đi.
 */
/**
 * Tìm độ cao mặt đỡ khi kéo thả: món "rơi" xuống nóc cao nhất bên dưới vùng (x,z,w,d).
 * Trả Infinity nếu bên dưới là món không được chồng (noTop) hoặc lối đi.
 */
export function stackHeight(items, x, z, w, d, excludeId = null) {
  let top = 0
  for (const it of items) {
    if (it.id === excludeId) continue
    if (overlap1(x, x + w, it.x, it.x + it.w) && overlap1(z, z + d, it.z, it.z + it.d)) {
      if (it.noTop || it.obstacle) return Infinity
      top = Math.max(top, it.y + it.h)
    }
  }
  return top
}

/* Đặt món tại (x, z) theo trọng lực: trả về vị trí hợp lệ (được đỡ ≥ 70%, không quá trần) hoặc null. */
/**
 * Đặt món tại (x,z) theo trọng lực: tính độ cao rơi xuống rồi kiểm tra hợp lệ.
 * @returns {{x,y,z,w,h,d}|null} vị trí hợp lệ hoặc null.
 */
export function placeAt(items, room, x, z, w, h, d, excludeId = null, { floorOnly = false, maxTop = room.h } = {}) {
  if (x < -EPS || z < -EPS || x + w > room.w + EPS || z + d > room.l + EPS) return null
  const y = stackHeight(items, x, z, w, d, excludeId)
  if (!Number.isFinite(y)) return null
  if (!fitsAt(items, room, x, y, z, w, h, d, { excludeId, floorOnly, maxTop })) return null
  return { x, y, z, w, h, d }
}

/* ------------------------------------------------------------------ Extreme Points */

/* Chiếu một điểm theo hướng âm của trục tới mặt món gần nhất (hoặc vách = 0). */
/**
 * Chiếu điểm theo hướng -y (xuống dưới) tới nóc món gần nhất hoặc sàn.
 */
function projectDown(items, room, px, py, pz) { // theo -y
  let best = 0
  for (const it of items) {
    const top = topOf(it, room)
    if (inside1(px, it.x, it.x + it.w) && inside1(pz, it.z, it.z + it.d) && top <= py + EPS) best = Math.max(best, top)
  }
  return best
}
/**
 * Chiếu điểm theo hướng -z (vào trong) tới mặt món gần nhất hoặc vách trong.
 */
function projectBack(items, room, px, py, pz) { // theo -z
  let best = 0
  for (const it of items) {
    if (inside1(px, it.x, it.x + it.w) && inside1(py, it.y, topOf(it, room)) && it.z + it.d <= pz + EPS) best = Math.max(best, it.z + it.d)
  }
  return best
}
/**
 * Chiếu điểm theo hướng -x (sang trái) tới mặt món gần nhất hoặc vách trái.
 */
function projectLeft(items, room, px, py, pz) { // theo -x
  let best = 0
  for (const it of items) {
    if (inside1(pz, it.z, it.z + it.d) && inside1(py, it.y, topOf(it, room)) && it.x + it.w <= px + EPS) best = Math.max(best, it.x + it.w)
  }
  return best
}

/* Thuật toán 1 (Update_3DEPL): EP mới sinh ra khi đặt món k. */
/**
 * Sinh các điểm cực (Extreme Points) mới khi vừa đặt món k (Thuật toán 1 "Update_3DEPL" trong bài báo):
 * lấy các góc phải / trước / trên của món rồi chiếu về các vách/món gần nhất.
 * @returns {number[][]} danh sách điểm [x,y,z].
 */
function newExtremePoints(items, room, k) {
  const pts = []
  // Thêm 1 điểm vào danh sách nếu còn nằm trong kho.
  const add = (x, y, z) => {
    if (x < room.w - EPS && z < room.l - EPS && y < room.h - EPS) pts.push([r3(x), r3(y), r3(z)])
  }
  const xr = k.x + k.w, zf = k.z + k.d, yt = k.y + k.h
  // Góc phải (x+w, y, z): chiếu xuống và chiếu về vách trong
  add(xr, projectDown(items, room, xr, k.y, k.z), k.z)
  add(xr, k.y, projectBack(items, room, xr, k.y, k.z))
  // Góc trước (x, y, z+d): chiếu xuống và chiếu về vách trái
  add(k.x, projectDown(items, room, k.x, k.y, zf), zf)
  add(projectLeft(items, room, k.x, k.y, zf), k.y, zf)
  // Góc trên (x, y+h, z): chiếu về vách trái và vách trong (món noTop không sinh điểm trên nóc)
  if (!k.noTop && !k.obstacle) {
    add(projectLeft(items, room, k.x, yt, k.z), yt, k.z)
    add(k.x, yt, projectBack(items, room, k.x, yt, k.z))
    add(k.x, yt, k.z)
  }
  // Giữ cả các góc chưa chiếu (thêm ứng viên, không ảnh hưởng tính đúng)
  add(xr, k.y, k.z)
  add(k.x, k.y, zf)
  return pts
}

/**
 * Tạo khóa chuỗi "x|y|z" cho 1 điểm (để loại điểm trùng).
 */
function epKey(p) { return `${p[0]}|${p[1]}|${p[2]}` }

/* Dựng danh sách EP cho các món đã có (đặt lần lượt theo thứ tự thấp -> cao). */
/**
 * Dựng danh sách điểm cực cho các món đã có (đặt lần lượt từ thấp lên cao), luôn có điểm gốc (0,0,0).
 */
export function buildExtremePoints(items, room) {
  const map = new Map([['0|0|0', [0, 0, 0]]])
  const placed = []
  ;[...items].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x).forEach(it => {
    placed.push(it)
    newExtremePoints(placed, room, it).forEach(p => map.set(epKey(p), p))
  })
  return [...map.values()]
}

/* Residual Space quanh EP theo +x, +y, +z (tới vách hoặc món gần nhất). */
/**
 * Tính "khoảng trống dư" (Residual Space) quanh một điểm cực theo +x, +y, +z tới vách hoặc món gần nhất.
 * @returns {number[]} [rx, ry, rz]
 */
function residualSpace(items, room, px, py, pz) {
  let rx = room.w - px, ry = room.h - py, rz = room.l - pz
  for (const it of items) {
    const top = topOf(it, room)
    if (inside1(py, it.y, top) && inside1(pz, it.z, it.z + it.d) && it.x >= px - EPS) rx = Math.min(rx, it.x - px)
    if (inside1(py, it.y, top) && inside1(px, it.x, it.x + it.w) && it.z >= pz - EPS) rz = Math.min(rz, it.z - pz)
    if (inside1(px, it.x, it.x + it.w) && inside1(pz, it.z, it.z + it.d) && it.y >= py - EPS) ry = Math.min(ry, it.y - py)
  }
  return [rx, ry, rz]
}

/*
 * Chọn EP cho món (w, h, d):
 *  prefer = 'fit'   : Residual Space best-fit (theo bài báo) – dùng khi tự xếp / xếp đồ mẫu.
 *  prefer = 'back'  : EP sát vách trong nhất, rồi trái, rồi thấp (xếp từ trong ra, chừa phía cửa).
 *  prefer = 'floor' : EP thấp nhất trước (giống EP-FFD trong bài: z, y, x thấp nhất – trải sàn).
 */
/**
 * Chọn vị trí (điểm cực) tốt nhất để đặt món kích thước (w,h,d), có thử xoay 90° trên mặt sàn.
 * prefer: 'fit' = khít khoảng trống dư nhất (theo bài báo); 'back' = sát vách trong trước; 'floor' = thấp nhất trước.
 * @returns {{x,y,z,w,h,d}|null}
 */
export function findPosition(items, room, w, h, d, { allowRotate = true, floorOnly = false, prefer = 'fit', maxTop = room.h, points = null } = {}) {
  const eps = points || buildExtremePoints(items, room)
  const sizes = allowRotate && Math.abs(w - d) > EPS ? [[w, d], [d, w]] : [[w, d]]
  let best = null
  let bestScore = null
  for (const [px, py, pz] of eps) {
    if (floorOnly && py > EPS) continue
    for (const [ww, dd] of sizes) {
      if (!fitsAt(items, room, px, py, pz, ww, h, dd, { floorOnly, maxTop })) continue
      let score
      if (prefer === 'fit') {
        const [rx, ry, rz] = residualSpace(items, room, px, py, pz)
        score = [(rx - ww) + (rz - dd) + (ry - h), py, pz, px]
      } else if (prefer === 'floor') score = [py, pz, px, 0]
      else score = [pz, px, py, 0]
      if (!bestScore || lexLess(score, bestScore)) { bestScore = score; best = { x: px, y: py, z: pz, w: ww, h, d: dd } }
    }
  }
  return best
}

/**
 * So sánh 2 mảng điểm số theo thứ tự từ điển (a < b?), có sai số EPS.
 */
function lexLess(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i] - EPS) return true
    if (a[i] > b[i] + EPS) return false
  }
  return false
}

/* Thứ tự Clustered Area-Height (mục 4.1 của bài báo). */
/**
 * Sắp thứ tự món theo "Clustered Area-Height": gom theo diện tích đáy (mỗi cụm δ% diện tích sàn),
 * cụm lớn trước, trong cụm món cao trước.
 */
export function sortClusteredAreaHeight(list, room, delta = CLUSTER_DELTA) {
  const clusterSize = (room.w * room.l * delta) / 100
  return [...list].sort((a, b) => {
    const ca = Math.floor((a.w * a.d) / clusterSize)
    const cb = Math.floor((b.w * b.d) / clusterSize)
    return cb - ca || b.h - a.h || b.w * b.d - a.w * a.d
  })
}

/*
 * Tự xếp danh sách món (EP-BFD). Đồ chỉ-đặt-sàn xếp trước, rồi theo Clustered Area-Height.
 * startItems: món / vật cản (lối đi) đã có. Trả về { placed (không gồm vật cản), failed }.
 */
/**
 * Tự xếp danh sách món vào kho. prefer = 'best' thì chạy 3 biến thể (fit/floor/back) rồi giữ lời giải
 * xếp được thể tích lớn nhất.
 * @param {{w,h,l}} room kích thước kho.
 * @param {object[]} requests các loại món cần xếp kèm count.
 * @param {object[]} startItems món / vật cản (lối đi) đã có sẵn.
 * @returns {{placed: object[], failed: object[]}}
 */
export function autoPack(room, requests, startItems = [], { prefer = 'fit', maxTop = room.h } = {}) {
  // prefer = 'best': giống C-EPBFD trong bài báo – chạy vài biến thể rồi giữ lời giải xếp được nhiều nhất.
  if (prefer === 'best') {
    let best = null
    for (const variant of ['fit', 'floor', 'back']) {
      const result = packOnce(room, requests, startItems, variant, maxTop)
      const vol = volumeOf(result.placed)
      if (!best || vol > best.vol + EPS || (Math.abs(vol - best.vol) <= EPS && result.placed.length > best.result.placed.length)) best = { result, vol }
    }
    return best.result
  }
  return packOnce(room, requests, startItems, prefer, maxTop)
}

/**
 * Xếp 1 lần theo 1 biến thể prefer: đồ chỉ-đặt-sàn trước, cập nhật dần danh sách điểm cực,
 * bỏ qua nhanh các món cùng cỡ khi cỡ đó đã hết chỗ.
 */
function packOnce(room, requests, startItems, prefer, maxTop) {
  const items = [...startItems]
  const failed = []
  const expanded = requests.flatMap(req => Array.from({ length: Math.max(0, Number(req.count) || 0) }, () => req))
  const queue = [
    ...sortClusteredAreaHeight(expanded.filter(r => r.floorOnly), room),
    ...sortClusteredAreaHeight(expanded.filter(r => !r.floorOnly), room)
  ]
  // Danh sách EP được cập nhật dần (Thuật toán 1), không dựng lại từ đầu mỗi lần.
  const epMap = new Map(buildExtremePoints(items, room).map(p => [epKey(p), p]))
  let seq = items.length
  const noRoom = new Set() // cỡ đã hết chỗ -> món cùng cỡ phía sau chắc chắn không vừa
  for (const req of queue) {
    const sizeKey = `${req.w}|${req.h}|${req.d}|${req.floorOnly ? 1 : 0}`
    if (noRoom.has(sizeKey)) { failed.push(req); continue }
    const spot = findPosition(items, room, req.w, req.h, req.d, { floorOnly: Boolean(req.floorOnly), prefer, maxTop, points: [...epMap.values()] })
    if (!spot) { noRoom.add(sizeKey); failed.push(req); continue }
    const item = { ...req, ...spot, id: `${req.key || 'item'}-${++seq}`, count: undefined }
    items.push(item)
    epMap.delete(epKey([spot.x, spot.y, spot.z]))
    newExtremePoints(items, room, item).forEach(p => epMap.set(epKey(p), p))
  }
  return { placed: items.filter(it => !it.obstacle), failed }
}

/**
 * Tính tổng thể tích các món.
 */
export const volumeOf = items => items.reduce((n, it) => n + it.w * it.h * it.d, 0)

/* 3 loại thùng khách nhập số lượng thực tế (nhỏ / vừa / lớn). */
export const BOX_KEYS = ['box-s', 'box-m', 'box-l']

/**
 * Đổi số thùng khách nhập { 'box-s': n, ... } thành danh sách yêu cầu cho autoPack, kèm tổng số thùng và tổng thể tích (m³).
 */
export function boxRequests(counts) {
  const requests = BOX_KEYS.map(key => ({ ...itemType(key), count: Math.max(0, Math.floor(Number(counts?.[key]) || 0)) }))
  return {
    requests,
    total: requests.reduce((n, r) => n + r.count, 0),
    volume: requests.reduce((n, r) => n + r.count * r.w * r.h * r.d, 0)
  }
}

/* Trên số thùng này, xếp thử đầy đủ (Extreme Point) chạy quá lâu: chỉ chạy 1 biến thể hoặc ước tính theo thể tích. */
export const EXACT_PACK_LIMIT = 300
/* Hiệu suất xếp dùng để ước tính khi số thùng lớn (thùng giấy chất trong kho thường đạt 80–90%). */
export const PACK_EFFICIENCY = 0.8

/**
 * Số thùng cùng cỡ chất kín được trong phòng nếu xếp thẳng hàng theo lưới (chưa chừa lối đi).
 * Dùng cho câu gợi ý sức chứa, thay cho con số viết cứng.
 */
export function gridCapacity(room, type) {
  const fit = (a, b) => Math.floor((a + EPS) / b)
  return fit(room.h, type.h) * Math.max(fit(room.w, type.w) * fit(room.l, type.d), fit(room.w, type.d) * fit(room.l, type.w))
}

/* Còn xếp thêm được bao nhiêu thùng loại `type` – xếp thử thật bằng EP-BFD (có giới hạn số lượng). */
/**
 * Ước lượng còn xếp thêm được bao nhiêu món loại `type` (xếp thử thật, tối đa `limit` món).
 */
export function remainingCapacity(items, room, type, limit = 300) {
  const { placed } = autoPack(room, [{ ...type, key: 'sim', count: limit }], items, { prefer: 'floor' })
  return placed.length - items.filter(it => !it.obstacle).length
}

/*
 * Hít vào mép (khi kéo thả): nếu x / z gần mép vách hoặc mép món khác trong `radius` m thì khớp vào đúng mép,
 * để thùng xếp sát nhau không bị hở vài cm.
 */
/**
 * "Hít mép" khi kéo thả: nếu x/z gần mép vách hoặc mép món khác trong bán kính `radius` m thì khớp vào mép.
 * @returns {{x:number, z:number}}
 */
export function magnetSnap(items, room, x, z, w, d, excludeId = null, radius = 0.12) {
  const xs = [0, room.w - w]
  const zs = [0, room.l - d]
  items.forEach(it => {
    if (it.id === excludeId) return
    xs.push(it.x + it.w, it.x - w, it.x, it.x + it.w - w)
    zs.push(it.z + it.d, it.z - d, it.z, it.z + it.d - d)
  })
  // Tìm giá trị trong danh sách gần v nhất (trong bán kính radius); không có thì giữ v.
  const near = (v, list) => {
    let best = v, dist = radius
    list.forEach(c => { const dd = Math.abs(c - v); if (dd < dist) { dist = dd; best = c } })
    return best
  }
  return { x: r3(near(x, xs)), z: r3(near(z, zs)) }
}

/*
 * Lối đi chừa lại (vật cản ảo, không đặt đồ lên): dải phía trước kho rộng `width` m;
 * kho rộng từ 3 m có thêm lối giữa chạy dọc kho. Tủ locker nhỏ không cần lối đi; kho xe chỉ chừa phía trước.
 */
/**
 * Tạo vùng lối đi (vật cản ảo cao tới trần): dải phía cửa; kho rộng >= 3 m thêm lối giữa.
 * Tủ locker / kho nhỏ < 3 m² không cần lối đi; kho xe chỉ chừa phía trước.
 */
export function aisleZones(room, { width = 0.8, isLocker = false, vehicle = false } = {}) {
  if (isLocker || room.w * room.l < 3) return []
  const zones = [{ id: 'aisle-front', x: 0, z: Math.max(0, room.l - width), w: room.w, d: Math.min(width, room.l) }]
  if (!vehicle && room.w >= 3 && room.l > 2.5) zones.push({ id: 'aisle-mid', x: room.w / 2 - width / 2, z: 0, w: width, d: Math.max(0, room.l - width) })
  return zones.map(z => ({ ...z, y: 0, h: room.h, obstacle: true, noTop: true, name: 'Lối đi' }))
}

/* ------------------------------------------------------------------ Đồ mẫu bày sẵn */

const FURNITURE = {
  shelf: { name: 'Kệ sách', w: 0.8, h: 1.8, d: 0.35, color: '#8d5a3b', floorOnly: true },
  boxL: { name: 'Thùng lớn', w: 0.8, h: 0.5, d: 0.5, color: '#b5763c' },
  boxM: { name: 'Thùng vừa', w: 0.6, h: 0.4, d: 0.4, color: '#c98b4f' },
  boxS: { name: 'Thùng nhỏ', w: 0.4, h: 0.3, d: 0.3, color: '#d9a066' },
  chair: { name: 'Ghế', w: 0.55, h: 0.9, d: 0.55, color: '#90a4ae', floorOnly: true, noTop: true },
  lamp: { name: 'Đèn cây', w: 0.35, h: 1.5, d: 0.35, color: '#f5f0e6', floorOnly: true, noTop: true },
  suitcase: { name: 'Vali', w: 0.45, h: 0.7, d: 0.28, color: '#455a64', floorOnly: true },
  mattress: { name: 'Nệm', w: 1.6, h: 0.25, d: 2.0, color: '#e8e3d9', floorOnly: true },
  wardrobe: { name: 'Tủ quần áo', w: 1.2, h: 1.9, d: 0.6, color: '#a1887f', floorOnly: true },
  bike: { name: 'Xe đạp', w: 0.5, h: 1.0, d: 1.7, color: '#26a69a', floorOnly: true, noTop: true },
  sofa: { name: 'Sofa', w: 2.0, h: 0.85, d: 0.9, color: '#5c6bc0', floorOnly: true },
  fridge: { name: 'Tủ lạnh', w: 0.6, h: 1.7, d: 0.65, color: '#cfd8dc', floorOnly: true },
  table: { name: 'Bàn ăn', w: 1.4, h: 0.75, d: 0.8, color: '#a1887f', floorOnly: true },
  washer: { name: 'Máy giặt', w: 0.6, h: 0.85, d: 0.6, color: '#eceff1', floorOnly: true },
  tv: { name: 'Tivi (thùng)', w: 1.2, h: 0.75, d: 0.18, color: '#263238', floorOnly: true },
  car: { name: 'Ô tô', w: 1.8, h: 1.5, d: 4.4, color: '#e53935', floorOnly: true, noTop: true },
  motorbike: { name: 'Xe máy', w: 0.7, h: 1.1, d: 1.9, color: '#37474f', floorOnly: true, noTop: true }
}

/**
 * Bày đồ mẫu phù hợp kích thước kho (kho xe: ô tô; tủ: kệ, vali...; kho lớn: sofa, nệm, tủ...),
 * xếp bằng autoPack rồi chất thêm thùng carton cho đầy tới ~2 m (vẫn chừa lối đi).
 * @param {object} geo kết quả unitGeometry().
 * @returns {{items: object[], aisles: object[]}}
 */
export function sampleFurniture(geo) {
  const room = { w: geo.width, h: geo.height, l: geo.length }
  let list
  if (geo.band === 'V') list = [['car', 1], ['boxL', 2]]
  else if (geo.isLocker) list = [['shelf', 1], ['suitcase', 1], ['boxM', 3], ['boxS', 4], ['lamp', 1]]
  else if (geo.area <= 5) list = [['shelf', 1], ['chair', 1], ['lamp', 1], ['boxL', 2], ['boxM', 4], ['boxS', 4]]
  else if (geo.area <= 12) list = [['mattress', 1], ['wardrobe', 1], ['shelf', 1], ['bike', 1], ['chair', 2], ['boxL', 4], ['boxM', 6], ['boxS', 6]]
  else if (geo.area <= 20) list = [['sofa', 1], ['mattress', 1], ['wardrobe', 1], ['fridge', 1], ['washer', 1], ['table', 1], ['shelf', 2], ['bike', 1], ['tv', 1], ['boxL', 6], ['boxM', 8], ['boxS', 8]]
  else list = [['sofa', 2], ['mattress', 2], ['wardrobe', 2], ['fridge', 1], ['washer', 1], ['table', 1], ['shelf', 3], ['bike', 2], ['tv', 1], ['motorbike', 1], ['boxL', 10], ['boxM', 12], ['boxS', 10]]
  const requests = list.map(([key, count]) => ({ key, count, ...FURNITURE[key] }))
  const aisles = aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' })
  // 1) Đồ to + đồ trong danh sách: EP-BFD (đồ chỉ-đặt-sàn xếp trước).
  const { placed } = autoPack(room, requests, aisles, { prefer: 'fit' })
  // 2) Chất thêm thùng carton cho đầy kho tới ~2 m (EP-BFD), vẫn chừa lối đi.
  if (geo.band === 'V') return { items: placed, aisles }
  const fillTop = Math.min(room.h - 0.3, 2.0)
  const cap = Math.round(room.w * room.l * 6) // đủ để lấp đầy, không chạy quá lâu
  const filler = [{ key: 'boxL', count: cap, ...FURNITURE.boxL }, { key: 'boxM', count: cap, ...FURNITURE.boxM }, { key: 'boxS', count: cap, ...FURNITURE.boxS }]
  const filled = autoPack(room, filler, [...aisles, ...placed], { prefer: 'fit', maxTop: fillTop }).placed
  return { items: filled, aisles }
}

/* Tên đồ mẫu gom theo loại, ví dụ "Kệ sách, 4 thùng vừa, ghế". */
/**
 * Gom tên đồ theo loại thành câu mô tả, ví dụ "Kệ sách, 4 thùng vừa, Ghế".
 */
export function describeItems(items) {
  const counts = new Map()
  items.forEach(it => counts.set(it.name, (counts.get(it.name) || 0) + 1))
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${n} ${name.toLowerCase()}` : name)).join(', ')
}
