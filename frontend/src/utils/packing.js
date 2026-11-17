/**
 * ======================================================================
 * FILE: src/utils/packing.js  —  THUẬT TOÁN XẾP ĐỒ TRONG KHO (3D BIN PACKING)
 * CHỨC NĂNG: Tính toán cách xếp đồ (thùng carton, tủ lạnh, nệm, xe máy...) vào một kho hình hộp chữ nhật.
 *   Phục vụ: (1) bày "đồ mẫu" trong trình xem kho 3D để khách hình dung kho chứa được gì; (2) cho khách tự kéo thả /
 *   bấm "tự xếp" thùng và xem "còn xếp thêm được bao nhiêu thùng"; (3) kiểm tra số đồ khách nhập có vừa một cỡ kho
 *   không (gợi ý kho). Thuần tính toán: không gọi API, không dùng React, chạy được cả trong Web Worker.
 * THÀNH PHẦN CHÍNH:
 *   - PACK_ITEMS, itemType, customBoxType, BOX_KEYS / BIG_ITEM_KEYS / COUNT_KEYS: danh mục loại đồ khách chọn.
 *   - supportRatio, stackHeight, placeAt, magnetSnap: kiểm tra / đặt một món khi KÉO THẢ bằng tay.
 *   - buildExtremePoints, findPosition, sortClusteredAreaHeight, autoPack: thuật toán TỰ XẾP (EP-BFD).
 *   - remainingCapacity, gridCapacity, volumeOf, boxRequests: tính sức chứa / tổng thể tích / đổi số lượng thành yêu cầu.
 *   - aisleZones: tạo vùng lối đi (vật cản ảo); sampleFurniture, describeItems: bày đồ mẫu và mô tả bằng chữ.
 * DÙNG Ở: src/App.jsx, features/unit/ThreeUnitScene.jsx, Unit3DViewer.jsx, UnitPackPlanner.jsx, useBoxFit.js,
 *   boxCounts.js, ItemCountsInput.jsx, utils/packing.worker.js (chạy autoPack ở luồng nền).
 * PHỤ THUỘC: Không import gì (thuần JavaScript).
 * API: Không gọi API.
 * LUỒNG: component đưa vào kích thước kho room {w, h, l} + danh sách yêu cầu {loại, kích thước, count}
 *   -> autoPack sắp thứ tự món -> với từng món, findPosition chọn điểm cực phù hợp nhất -> trả danh sách vị trí
 *   {x, y, z, w, h, d} để ThreeUnitScene vẽ thành khối 3D, và danh sách món không xếp được (failed).
 *
 * ---------------------------------------------------------------------
 * NỀN TẢNG THUẬT TOÁN: Extreme Point Best-Fit (EP-BFD) theo bài báo
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
 * QUY ƯỚC TỌA ĐỘ: đơn vị mét. Trục x = rộng (W), y = cao (H), z = sâu/dài (L). Hai vách ở x = 0 và z = 0, sàn ở y = 0;
 *   phía z = L là phía trước kho (lối đi trước được chừa ở đây). Mỗi món: { id, x, y, z, w, h, d } với (x, y, z) là góc trái-dưới-trong cùng,
 *   w/h/d là kích thước theo x/y/z. Món vật cản (lối đi) có thêm obstacle: true.
 * ======================================================================
 */

/* Sai số so sánh số thực (1 phần triệu mét): tránh lỗi kiểu 0.1 + 0.2 !== 0.3 khi so tọa độ. */
const EPS = 1e-6
/**
 * TỈ LỆ ĐỠ TỐI THIỂU = 70%: một món không nằm trên sàn chỉ được đặt nếu ít nhất 70% diện tích đáy của nó
 * tựa lên nóc các món ngay bên dưới. Ý nghĩa thực tế: thùng không bị "lơ lửng" hay chìa ra quá nhiều,
 * chồng lên vẫn vững, không đổ khi đóng cửa kho. Dùng trong fitsAt() và được export cho kéo thả ở ThreeUnitScene.
 */
export const SUPPORT_RATIO = 0.7
const CLUSTER_DELTA = 10 // δ (%) cho thứ tự Clustered Area-Height: mỗi cụm rộng 10% diện tích sàn kho

/**
 * Danh mục loại đồ khách tự xếp (kích thước thật, đơn vị m). Mỗi loại: key, name, size (chữ hiển thị),
 * w/h/d (rộng/cao/sâu), color (màu khối 3D), floorOnly (chỉ đặt trên sàn), noTop (không chồng gì lên).
 */
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
 * Tìm loại đồ trong danh mục PACK_ITEMS theo key (vd 'box-m' -> Thùng vừa).
 * @param {string} key
 * @returns {object|undefined} loại đồ, hoặc undefined nếu không có.
 */
export const itemType = key => PACK_ITEMS.find(item => item.key === key)

/**
 * Kiểm tra 2 đoạn [a0,a1) và [b0,b1) trên cùng một trục có giao nhau không (có sai số EPS).
 * Hai hộp 3D va chạm khi và chỉ khi chúng giao nhau trên CẢ 3 trục x, y, z (xem collides()).
 * Chạm mép (a1 === b0) không tính là giao, nên hai thùng được đặt sát nhau.
 */
const overlap1 = (a0, a1, b0, b1) => a0 < b1 - EPS && b0 < a1 - EPS
/**
 * Kiểm tra giá trị v có nằm trong đoạn [a0,a1) không (có sai số EPS).
 */
const inside1 = (v, a0, a1) => v >= a0 - EPS && v < a1 - EPS
/**
 * Làm tròn 3 chữ số thập phân (tức tới milimét), để các điểm gần như trùng nhau có cùng khóa và bị loại trùng.
 */
const r3 = v => Math.round(v * 1000) / 1000
/**
 * Độ cao nóc của món; món noTop (ghế, đèn, xe...) coi như chiếm cả cột tới trần để không chồng gì lên.
 * @param {object} it món đang xét.
 * @param {{h:number}} room kho (lấy chiều cao trần room.h).
 * @returns {number} độ cao nóc (m).
 */
const topOf = (it, room) => (it.noTop ? room.h : it.y + it.h)

/* ------------------------------------------------------------------ Kiểm tra một vị trí */

/**
 * Kiểm tra hộp (x,y,z,w,h,d) có va chạm với món nào khác trong kho không:
 * va chạm = giao nhau đồng thời trên trục x, trục z và trục y (trục y tính tới topOf, nên món noTop chặn cả cột).
 * @param {object[]} items các món đang có trong kho (kể cả vật cản lối đi).
 * @param {{w,h,l}} room kích thước kho.
 * @param {string} excludeId bỏ qua món này (khi đang kéo chính nó).
 * @returns {boolean} true nếu đụng.
 */
function collides(items, room, x, y, z, w, h, d, excludeId) {
  for (const it of items) {
    if (it.id === excludeId) continue
    if (overlap1(x, x + w, it.x, it.x + it.w) && overlap1(z, z + d, it.z, it.z + it.d) && overlap1(y, y + h, it.y, topOf(it, room))) return true
  }
  return false
}

/**
 * Tính TỈ LỆ ĐỠ: phần diện tích đáy của hộp được nóc các món bên dưới nâng đỡ, ở độ cao y.
 * Công thức: tỉ lệ = Σ (ox × oz) / (w × d), trong đó với mỗi món có nóc đúng bằng y (sai số 0,1 mm):
 *   ox = min(x + w, it.x + it.w) − max(x, it.x)   (chiều dài phần chồng lên nhau theo trục x)
 *   oz = min(z + d, it.z + it.d) − max(z, it.z)   (chiều dài phần chồng lên nhau theo trục z)
 * ox × oz là diện tích hình chữ nhật mà đáy hộp tựa lên nóc món đó. Món noTop / vật cản không tính là mặt đỡ.
 * Đặt trên sàn (y = 0) thì tỉ lệ = 1. Ví dụ: thùng 0,6 × 0,4 đặt lệch, chỉ tựa 0,3 × 0,4 lên thùng dưới -> 50% (< 70%, không hợp lệ).
 * @param {object[]} items các món trong kho.
 * @param {number} x @param {number} y @param {number} z góc trái-dưới-trong của hộp.
 * @param {number} w @param {number} d kích thước đáy hộp.
 * @param {string|null} excludeId bỏ qua món này (khi kéo chính nó).
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
 * Kiểm tra hộp có đặt hợp lệ tại vị trí cho trước. Lần lượt kiểm 5 điều kiện:
 *  1) nằm trong kho (không ra ngoài vách), 2) không cao quá trần hoặc maxTop (giới hạn chiều cao chồng),
 *  3) đồ floorOnly phải ở sàn, 4) không va chạm món khác, 5) được đỡ >= SUPPORT_RATIO (70%).
 * Được gọi bởi placeAt (kéo thả) và findPosition (tự xếp).
 * @returns {boolean}
 */
function fitsAt(items, room, x, y, z, w, h, d, { excludeId = null, floorOnly = false, maxTop = room.h } = {}) {
  if (x < -EPS || y < -EPS || z < -EPS) return false
  if (x + w > room.w + EPS || z + d > room.l + EPS || y + h > Math.min(room.h, maxTop) + EPS) return false
  if (floorOnly && y > EPS) return false
  if (collides(items, room, x, y, z, w, h, d, excludeId)) return false
  return supportRatio(items, x, y, z, w, d, excludeId) >= SUPPORT_RATIO - EPS
}

/**
 * Tìm độ cao mặt đỡ khi KÉO THẢ: mô phỏng trọng lực, món "rơi" xuống nóc cao nhất trong số các món
 * có hình chiếu đáy giao với vùng (x, z, w, d).
 * @returns {number} độ cao y (m); Infinity nếu bên dưới là món không được chồng (noTop) hoặc lối đi.
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

/**
 * Đặt món tại (x, z) theo trọng lực: tính độ cao rơi xuống (stackHeight) rồi kiểm tra hợp lệ (fitsAt:
 * được đỡ ≥ 70%, không quá trần, không va chạm). Được gọi khi khách kéo thả / thêm món bằng tay trong ThreeUnitScene.
 * @returns {{x,y,z,w,h,d}|null} vị trí hợp lệ hoặc null nếu không đặt được.
 */
export function placeAt(items, room, x, z, w, h, d, excludeId = null, { floorOnly = false, maxTop = room.h } = {}) {
  if (x < -EPS || z < -EPS || x + w > room.w + EPS || z + d > room.l + EPS) return null
  const y = stackHeight(items, x, z, w, d, excludeId)
  if (!Number.isFinite(y)) return null
  if (!fitsAt(items, room, x, y, z, w, h, d, { excludeId, floorOnly, maxTop })) return null
  return { x, y, z, w, h, d }
}

/* ------------------------------------------------------------------ Extreme Points */

/*
 * CHIẾU ĐIỂM (projection) là gì? Từ một góc của món vừa đặt, ta "bắn một tia" theo hướng âm của một trục
 * (xuống dưới, vào trong, sang trái) và dừng lại ở mặt đầu tiên gặp phải: nóc / mặt sau / mặt phải của món
 * gần nhất, hoặc sàn / vách (tọa độ 0) nếu không gặp món nào. Điểm dừng là tọa độ mới của góc đó.
 * Ý nghĩa thực tế: góc trên của một thùng thấp đặt cạnh thùng cao sẽ "trượt" xuống chỗ có mặt đỡ thật hoặc
 * áp sát vào vách, nên món sau được đặt sát vào, không chừa khe hở vô ích.
 * Ba hàm dưới cùng một khuôn: duyệt mọi món, chỉ xét món mà tia đi qua (điểm nằm trong hình chiếu của món
 * trên 2 trục còn lại) và nằm phía sau điểm, lấy mặt lớn nhất (gần điểm nhất).
 */
/**
 * Chiếu điểm theo hướng -y (xuống dưới) tới nóc món gần nhất hoặc sàn.
 * @returns {number} tọa độ y mới.
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
 * Chiếu điểm theo hướng -z (vào trong) tới mặt trước của món gần nhất hoặc vách trong.
 * @returns {number} tọa độ z mới.
 */
function projectBack(items, room, px, py, pz) { // theo -z
  let best = 0
  for (const it of items) {
    if (inside1(px, it.x, it.x + it.w) && inside1(py, it.y, topOf(it, room)) && it.z + it.d <= pz + EPS) best = Math.max(best, it.z + it.d)
  }
  return best
}
/**
 * Chiếu điểm theo hướng -x (sang trái) tới mặt phải của món gần nhất hoặc vách trái.
 * @returns {number} tọa độ x mới.
 */
function projectLeft(items, room, px, py, pz) { // theo -x
  let best = 0
  for (const it of items) {
    if (inside1(pz, it.z, it.z + it.d) && inside1(py, it.y, topOf(it, room)) && it.x + it.w <= px + EPS) best = Math.max(best, it.x + it.w)
  }
  return best
}

/**
 * Sinh các ĐIỂM CỰC (Extreme Points) mới khi vừa đặt món k (Thuật toán 1 "Update_3DEPL" trong bài báo).
 * Điểm cực = vị trí ứng viên để đặt góc trái-dưới-trong của món tiếp theo. Thay vì thử mọi tọa độ trong kho,
 * ta chỉ thử các điểm "nằm sát" đồ đã xếp, nên nhanh mà vẫn xếp khít.
 * Món k có 3 góc ngoài: góc phải (x+w, y, z), góc trước (x, y, z+d), góc trên (x, y+h, z).
 * Mỗi góc được CHIẾU theo 2 trục còn lại (xem projectDown/Back/Left) -> tối đa 6 điểm, ví dụ góc phải được
 * chiếu xuống (để món sau có mặt đỡ) và chiếu vào trong (để món sau sát vách). Món noTop / vật cản không sinh
 * điểm trên nóc vì không được chồng lên. Thêm cả góc chưa chiếu để có nhiều ứng viên hơn.
 * Chỉ giữ điểm còn nằm trong kho; tọa độ làm tròn tới mm.
 * @param {object[]} items các món đã đặt (kể cả k).
 * @param {{w,h,l}} room kích thước kho.
 * @param {object} k món vừa đặt.
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

/**
 * Dựng danh sách điểm cực cho các món đã có sẵn trong kho (giả lập đặt lần lượt từ thấp lên cao, trong ra ngoài,
 * trái sang phải), luôn có điểm gốc (0,0,0) = góc trong-trái-sàn. Điểm trùng (cùng khóa x|y|z) chỉ giữ 1.
 * Được gọi bởi findPosition (khi không truyền sẵn points) và packOnce (khởi tạo danh sách điểm).
 * @returns {number[][]} danh sách điểm [x,y,z].
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

/**
 * Tính KHOẢNG TRỐNG DƯ (Residual Space) quanh một điểm cực: đứng tại điểm (px, py, pz) nhìn theo hướng
 * +x (sang phải), +y (lên trên), +z (ra phía trước kho), đo khoảng cách tới vật đầu tiên chặn đường:
 *   rx = (mép trái của món gần nhất bên phải, hoặc vách phải room.w) − px
 *   ry = (đáy của món gần nhất bên trên, hoặc trần room.h) − py
 *   rz = (mặt trong của món gần nhất phía trước, hoặc vách cửa room.l) − pz
 * Ý nghĩa thực tế: đó là "cái hốc" còn trống tại điểm này. findPosition so kích thước món với cái hốc để chọn
 * chỗ vừa khít nhất (giống tìm ngăn tủ vừa đúng cỡ đồ, thay vì nhét đồ nhỏ vào ngăn to và lãng phí chỗ).
 * @returns {number[]} [rx, ry, rz] (m)
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

/**
 * Chọn vị trí (điểm cực) tốt nhất để đặt món kích thước (w, h, d), có thử XOAY 90° trên mặt sàn (đổi w và d;
 * không lật đứng vì chiều cao h giữ nguyên). Với mỗi điểm cực và mỗi hướng xoay, bỏ qua chỗ không hợp lệ (fitsAt),
 * rồi tính một "điểm số" dạng mảng và lấy chỗ có điểm số NHỎ NHẤT theo thứ tự từ điển (lexLess: so phần tử đầu,
 * hòa thì so phần tử tiếp theo...). Ba kiểu ưu tiên:
 *  - prefer = 'fit' (ĐIỂM BEST-FIT, theo bài báo – dùng khi tự xếp / xếp đồ mẫu):
 *      score = [ (rx − w) + (rz − d) + (ry − h),  y,  z,  x ]
 *    Phần tử đầu là tổng phần hốc còn thừa sau khi đặt món (rx, ry, rz từ residualSpace). Càng nhỏ = món càng
 *    vừa khít với hốc, ít để lại khe vụn khó dùng. Hòa thì chọn chỗ thấp hơn, rồi sâu bên trong hơn, rồi bên trái hơn.
 *  - prefer = 'floor': score = [y, z, x] – chỗ thấp nhất trước (giống EP-FFD trong bài): trải kín sàn rồi mới chồng.
 *  - prefer = 'back' : score = [z, x, y] – chỗ sát vách trong nhất trước: xếp từ trong ra, chừa trống phía trước.
 * @param {object[]} items món đã có. @param {{w,h,l}} room kho.
 * @param {number} w @param {number} h @param {number} d kích thước món (m).
 * @param {object} options allowRotate (cho xoay), floorOnly, prefer, maxTop (giới hạn chiều cao chồng),
 *   points (danh sách điểm cực tính sẵn; không truyền thì dựng lại bằng buildExtremePoints).
 * @returns {{x,y,z,w,h,d}|null} vị trí tốt nhất, hoặc null nếu không còn chỗ.
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
 * So sánh 2 mảng điểm số theo thứ tự từ điển: a < b nếu phần tử khác nhau đầu tiên của a nhỏ hơn (có sai số EPS).
 * Ví dụ [0.1, 0, 2] < [0.1, 0.4, 0] vì hòa phần tử đầu, phần tử thứ hai 0 < 0.4.
 * @returns {boolean}
 */
function lexLess(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i] - EPS) return true
    if (a[i] > b[i] + EPS) return false
  }
  return false
}

/**
 * Sắp thứ tự món theo "CLUSTERED AREA-HEIGHT" (mục 4.1 của bài báo):
 *   clusterSize = diện tích sàn × δ / 100            (δ = 10 -> mỗi cụm rộng 10% diện tích sàn)
 *   cụm của món = floor( (w × d) / clusterSize )      (số thứ tự cụm theo diện tích đáy)
 * Sắp: cụm lớn trước -> trong cùng cụm, món CAO hơn trước -> cuối cùng diện tích đáy lớn hơn trước.
 * Ý nghĩa thực tế: giống người dọn kho, đưa đồ to chiếm sàn vào trước, đồ nhỏ sau lấp vào khe; trong nhóm đồ
 * cỡ đáy tương tự thì dựng đồ cao trước để các cột cao đứng cạnh nhau, đồ thấp dồn lại tạo mặt phẳng để chồng thêm.
 * Gom cụm (thay vì sắp đúng theo diện tích) để hai món chênh nhau chút xíu diện tích vẫn được xét theo chiều cao.
 * @param {object[]} list danh sách món (mỗi món 1 phần tử). @param {{w,l}} room kho. @param {number} delta δ (%).
 * @returns {object[]} mảng mới đã sắp (không sửa mảng gốc).
 */
export function sortClusteredAreaHeight(list, room, delta = CLUSTER_DELTA) {
  const clusterSize = (room.w * room.l * delta) / 100
  return [...list].sort((a, b) => {
    const ca = Math.floor((a.w * a.d) / clusterSize)
    const cb = Math.floor((b.w * b.d) / clusterSize)
    return cb - ca || b.h - a.h || b.w * b.d - a.w * a.d
  })
}

/**
 * TỰ XẾP danh sách món vào kho (EP-BFD). Đồ chỉ-đặt-sàn xếp trước, rồi theo Clustered Area-Height (xem packOnce).
 * prefer = 'fit' | 'floor' | 'back': chạy 1 lần với kiểu ưu tiên đó (xem findPosition).
 * prefer = 'best': chạy cả 3 biến thể rồi chọn lời giải tốt nhất theo thứ tự tiêu chí:
 *   1) tổng thể tích xếp được lớn hơn; 2) hòa thể tích thì nhiều món hơn;
 *   3) vẫn hòa thì CHỌN CÁCH XẾP GỌN NHẤT: khối bao ngoài (envelopeOf) nhỏ hơn, tức đồ dồn sát góc trong,
 *      để lại khoảng trống liền một khối phía trước, dễ đi lại và dễ xếp thêm.
 * Được gọi bởi: packing.worker.js (Tự xếp trong UnitPackPlanner, gợi ý cỡ kho), remainingCapacity, sampleFurniture.
 * @param {{w,h,l}} room kích thước kho.
 * @param {object[]} requests các loại món cần xếp kèm count.
 * @param {object[]} startItems món / vật cản (lối đi) đã có sẵn.
 * @param {object} options prefer (kiểu ưu tiên), maxTop (giới hạn chiều cao chồng).
 * @returns {{placed: object[], failed: object[]}} placed gồm món cũ + món mới (không gồm vật cản); failed là món không xếp được.
 */
export function autoPack(room, requests, startItems = [], { prefer = 'fit', maxTop = room.h } = {}) {
  // prefer = 'best': giống C-EPBFD trong bài báo – chạy vài biến thể rồi giữ lời giải xếp được nhiều nhất.
  // Hòa (cùng thể tích, cùng số món) thì giữ cách xếp GỌN nhất (khối bao ngoài nhỏ nhất): biến thể 'fit' hay trộn
  // 2 hướng xoay thùng nên để lại khe hẹp giữa các hàng, không nên được chọn chỉ vì chạy trước.
  if (prefer === 'best') {
    let best = null
    for (const variant of ['fit', 'floor', 'back']) {
      const result = packOnce(room, requests, startItems, variant, maxTop)
      const vol = volumeOf(result.placed)
      const spread = envelopeOf(result.placed)
      const better = !best
        || vol > best.vol + EPS
        || (Math.abs(vol - best.vol) <= EPS && (result.placed.length > best.result.placed.length
          || (result.placed.length === best.result.placed.length && spread < best.spread - EPS)))
      if (better) best = { result, vol, spread }
    }
    return best.result
  }
  return packOnce(room, requests, startItems, prefer, maxTop)
}

/**
 * Thể tích KHỐI BAO NGOÀI của các món, tính từ góc trong-trái-sàn (0,0,0):
 *   envelope = max(x + w) × max(y + h) × max(z + d)   (lấy trên tất cả các món)
 * Hai cách xếp cùng số đồ: cách nào có khối bao nhỏ hơn là đồ dồn sát hơn, ít khe hở. Dùng làm tiêu chí hòa trong autoPack('best').
 * @returns {number} m³ (0 nếu không có món).
 */
function envelopeOf(items) {
  if (!items.length) return 0
  let mx = 0, my = 0, mz = 0
  items.forEach(it => { mx = Math.max(mx, it.x + it.w); my = Math.max(my, it.y + it.h); mz = Math.max(mz, it.z + it.d) })
  return mx * my * mz
}

/**
 * Xếp 1 lần theo 1 biến thể prefer. Các bước:
 *  1) Bung requests thành từng món (count = 3 -> 3 phần tử); xếp hàng đợi: đồ floorOnly trước, mỗi nhóm sắp theo
 *     Clustered Area-Height.
 *  2) Dựng danh sách điểm cực ban đầu từ startItems (gồm cả lối đi).
 *  3) Với từng món: findPosition chọn chỗ -> thêm món vào kho -> bỏ điểm cực vừa dùng -> thêm điểm cực mới do
 *     món sinh ra (newExtremePoints). Cập nhật dần như vậy nhanh hơn dựng lại từ đầu.
 *  4) Mẹo tăng tốc: nếu một cỡ đồ đã không còn chỗ thì các món cùng cỡ phía sau chắc chắn cũng không vừa
 *     (kho chỉ đầy thêm), nên đánh dấu failed ngay mà không tìm lại.
 * @returns {{placed: object[], failed: object[]}}
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
 * Tính tổng thể tích các món: Σ w × h × d (m³).
 */
export const volumeOf = items => items.reduce((n, it) => n + it.w * it.h * it.d, 0)

/* 3 loại thùng khách nhập số lượng thực tế (nhỏ / vừa / lớn). */
export const BOX_KEYS = ['box-s', 'box-m', 'box-l']
/* Đồ lớn khách nhập số lượng (chỉ đặt trên sàn). */
export const BIG_ITEM_KEYS = ['mattress', 'fridge', 'shelf', 'motorbike']
/* Thùng khách tự nhập kích thước. */
export const CUSTOM_BOX_KEY = 'box-custom'
export const DEFAULT_CUSTOM_SIZE = { w: 50, d: 40, h: 30 } // cm: dài × rộng × cao
/* Mọi loại đồ khách nhập số lượng (thứ tự hiển thị). */
export const COUNT_KEYS = [...BOX_KEYS, CUSTOM_BOX_KEY, ...BIG_ITEM_KEYS]

/**
 * Tạo loại "thùng tự nhập" theo kích thước khách nhập (cm). w = dài, d = rộng, h = cao (chia 100 đổi ra m).
 * Giá trị trống / không hợp lệ thì dùng DEFAULT_CUSTOM_SIZE.
 * @param {{w,d,h}} size kích thước cm.
 * @returns {object} loại đồ cùng dạng với PACK_ITEMS.
 */
export function customBoxType(size = DEFAULT_CUSTOM_SIZE) {
  const w = Number(size?.w) || DEFAULT_CUSTOM_SIZE.w
  const d = Number(size?.d) || DEFAULT_CUSTOM_SIZE.d
  const h = Number(size?.h) || DEFAULT_CUSTOM_SIZE.h
  return { key: CUSTOM_BOX_KEY, name: 'Thùng tự nhập', size: `${w}×${d}×${h} cm`, w: w / 100, h: h / 100, d: d / 100, color: '#a8885a' }
}

/**
 * Đổi đồ khách nhập (counts, xem features/unit/boxCounts.js) thành danh sách yêu cầu cho autoPack,
 * kèm tổng số món, số thùng, số đồ lớn và tổng thể tích (m³). Chỉ giữ loại có số lượng > 0.
 * Được gọi bởi App.jsx, useBoxFit, UnitPackPlanner, boxCounts...
 * @param {object} counts { 'box-s': 3, 'box-m': 2, ..., customSize: {w,d,h} }
 * @returns {{requests: object[], total: number, boxes: number, big: number, volume: number}}
 */
export function boxRequests(counts) {
  const typeOf = key => (key === CUSTOM_BOX_KEY ? customBoxType(counts?.customSize) : itemType(key))
  const requests = COUNT_KEYS
    .map(key => ({ ...typeOf(key), count: Math.max(0, Math.floor(Number(counts?.[key]) || 0)) }))
    .filter(r => r.count > 0)
  const sum = list => list.reduce((n, r) => n + r.count, 0)
  return {
    requests,
    total: sum(requests),
    boxes: sum(requests.filter(r => !BIG_ITEM_KEYS.includes(r.key))),
    big: sum(requests.filter(r => BIG_ITEM_KEYS.includes(r.key))),
    volume: requests.reduce((n, r) => n + r.count * r.w * r.h * r.d, 0)
  }
}

/* Trên số thùng này, xếp thử đầy đủ (Extreme Point) chạy quá lâu: chỉ chạy 1 biến thể hoặc ước tính theo thể tích. */
export const EXACT_PACK_LIMIT = 300
/* Hiệu suất xếp dùng để ước tính khi số thùng lớn (thùng giấy chất trong kho thường đạt 80–90%). */
export const PACK_EFFICIENCY = 0.8

/**
 * Số thùng cùng cỡ chất kín được trong phòng nếu xếp thẳng hàng theo lưới (chưa chừa lối đi):
 *   số tầng = floor(H / h);  mỗi tầng = max( floor(W/w) × floor(L/d),  floor(W/d) × floor(L/w) )
 * (thử cả 2 hướng xoay thùng trên sàn, lấy hướng chứa nhiều hơn). Dùng cho câu gợi ý sức chứa, thay cho con số viết cứng.
 * @param {{w,h,l}} room kho. @param {{w,h,d}} type loại thùng.
 * @returns {number}
 */
export function gridCapacity(room, type) {
  const fit = (a, b) => Math.floor((a + EPS) / b)
  return fit(room.h, type.h) * Math.max(fit(room.w, type.w) * fit(room.l, type.d), fit(room.w, type.d) * fit(room.l, type.w))
}

/**
 * Tính còn xếp thêm được bao nhiêu món loại `type`: xếp thử thật bằng autoPack (kiểu 'floor') với `limit` món
 * trên nền các món đang có, rồi trừ đi số món cũ. Chạy qua packing.worker.js (op 'remainingCapacity').
 * @param {object[]} items món đang có (kể cả lối đi). @param {{w,h,l}} room kho.
 * @param {object} type loại thùng. @param {number} limit số món tối đa thử (giới hạn thời gian chạy).
 * @returns {number}
 */
export function remainingCapacity(items, room, type, limit = 300) {
  const { placed } = autoPack(room, [{ ...type, key: 'sim', count: limit }], items, { prefer: 'floor' })
  return placed.length - items.filter(it => !it.obstacle).length
}

/**
 * "Hít mép" khi kéo thả: nếu x / z gần mép vách hoặc mép món khác trong bán kính `radius` m (mặc định 12 cm)
 * thì khớp vào đúng mép, để thùng xếp sát nhau không bị hở vài cm. Các mép ứng viên của mỗi món: sát bên phải,
 * sát bên trái, thẳng mép trái, thẳng mép phải (tương tự cho trục z). Được gọi khi kéo thả trong ThreeUnitScene.
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

/**
 * Tạo VÙNG LỐI ĐI: các hộp "vật cản ảo" (obstacle + noTop, cao tới trần) để thuật toán không đặt đồ vào.
 *  - Lối trước: dải phía trước kho (z từ L − width tới L), rộng hết chiều ngang kho, sâu `width` m (mặc định 0,8 m).
 *  - Lối giữa: chỉ khi kho rộng >= 3 m và dài > 2,5 m (và không phải kho xe): dải rộng `width` chạy dọc giữa kho
 *    từ vách trong tới lối trước, tâm tại x = W / 2.
 *  - Tủ locker / kho nhỏ < 3 m² không cần lối đi (với tay lấy được); kho xe chỉ chừa phía trước.
 * Ý nghĩa thực tế: khách cần chỗ bước vào và lối để lấy đồ ở sâu bên trong mà không phải dỡ hết đồ phía ngoài.
 * @returns {object[]} danh sách vùng lối đi dạng món { id, x, y, z, w, h, d, obstacle, noTop, name }.
 */
export function aisleZones(room, { width = 0.8, isLocker = false, vehicle = false } = {}) {
  if (isLocker || room.w * room.l < 3) return []
  const zones = [{ id: 'aisle-front', x: 0, z: Math.max(0, room.l - width), w: room.w, d: Math.min(width, room.l) }]
  if (!vehicle && room.w >= 3 && room.l > 2.5) zones.push({ id: 'aisle-mid', x: room.w / 2 - width / 2, z: 0, w: width, d: Math.max(0, room.l - width) })
  return zones.map(z => ({ ...z, y: 0, h: room.h, obstacle: true, noTop: true, name: 'Lối đi' }))
}

/* ------------------------------------------------------------------ Đồ mẫu bày sẵn */

/* Danh mục đồ dùng gia đình để bày mẫu (kích thước thật, m), dùng trong sampleFurniture. */

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
 * Được gọi khi mở trình xem 3D ở chế độ "đồ mẫu" (ThreeUnitScene).
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

/**
 * Gom tên đồ theo loại thành câu mô tả, ví dụ "Kệ sách, 4 thùng vừa, Ghế".
 */
export function describeItems(items) {
  const counts = new Map()
  items.forEach(it => counts.set(it.name, (counts.get(it.name) || 0) + 1))
  return [...counts.entries()].map(([name, n]) => (n > 1 ? `${n} ${name.toLowerCase()}` : name)).join(', ')
}
