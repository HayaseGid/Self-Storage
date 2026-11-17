# utils

Thư mục `src/utils` chứa các **hàm tiện ích thuần JavaScript** của frontend: không vẽ giao diện, không gọi API backend. Đây là tầng "logic dùng chung" mà các component trong `features/` và `App.jsx` gọi tới: tách khu vực từ địa chỉ, tính kích thước hình học của kho, thuật toán xếp đồ 3D (Extreme Point) và bộ máy chạy thuật toán đó trong Web Worker để giao diện không bị đứng.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [districts.js](./districts.js) | Đoán khu vực (quận / huyện) từ địa chỉ cơ sở, gom cơ sở theo khu vực để lọc | `src/App.jsx`, `src/features/contract/ContractCard.jsx`, `src/pages/business/BusinessFacilityForm.jsx`, `src/pages/business/BusinessPanels.jsx` | Không |
| [unitGeometry.js](./unitGeometry.js) | Đọc chuỗi size kho ("S2: Kho 2 x 2 m") ra rộng / dài / cao / diện tích / thể tích; trạng thái kho để tô màu sơ đồ | `src/features/facility/FacilityFloorPlan.jsx`, `src/features/facility/FacilityUnitsMap.jsx`, `src/features/unit/Unit3DViewer.jsx`, `src/features/unit/useBoxFit.js` | Không |
| [packing.js](./packing.js) | Thuật toán xếp đồ 3D Extreme Point Best-Fit (Crainic, Perboli, Tadei 2007), danh mục loại đồ, lối đi, đồ mẫu | `src/App.jsx`, `src/features/unit/*` (ThreeUnitScene, Unit3DViewer, UnitPackPlanner, useBoxFit, boxCounts, ItemCountsInput), `src/utils/packing.worker.js` | Không |
| [packing.worker.js](./packing.worker.js) | Web Worker chạy thuật toán xếp ở luồng nền (op: autoPack, remainingCapacity, fitGroups, splitPack) | `src/utils/packingClient.js` (tạo bằng `new Worker`) | Không |
| [packingClient.js](./packingClient.js) | Gửi việc sang worker, trả Promise; tự hủy việc cũ khi có việc mới; hook `usePackChannel` | `src/features/unit/UnitPackPlanner.jsx`, `src/features/unit/useBoxFit.js` | Không |

## Các hàm / component chính

**districts.js**
- `slugifyDistrict(label)` – đổi tên khu vực thành slug không dấu ("Quận 7" → "quan-7").
- `extractDistrict(address, facilityName)` – đoán khu vực: đoạn có tiền tố Quận/Huyện/TP → đoạn cuối không phải số nhà/phường → tên cơ sở.
- `getFacilityDistrict(facility)` – ưu tiên `districtName` từ backend, không có thì tách từ địa chỉ.
- `groupFacilitiesByDistrict(list)` – gom cơ sở theo khu vực; Quận 1, 2... trước, tên chữ sau, "Khu vực khác" cuối.

**unitGeometry.js**
- `unitGeometry(unit)` – `{ band, code, label, width, length, height, isLocker, area, volume }` (dài luôn ≥ rộng; cao: locker 2 m, kho thường 2,5 m, kho xe 3,5 m).
- `formatMeters(value)` – "2,5 m".
- `unitPlanStatus(unit)` – `'free' | 'off' | 'rented'`.
- `BAND_LABELS`, `BAND_ORDER` – nhãn và thứ tự nhóm cỡ S / M / L / V.

**packing.js** (đơn vị mét; x = rộng, y = cao, z = dài; mỗi món `{ id, x, y, z, w, h, d }`)
- `PACK_ITEMS`, `itemType(key)`, `customBoxType(size)`, `BOX_KEYS`, `BIG_ITEM_KEYS`, `COUNT_KEYS` – danh mục đồ khách chọn.
- `SUPPORT_RATIO` (0,7) và `supportRatio(...)` – tỉ lệ đáy được đỡ; món không ở sàn phải được đỡ ≥ 70%.
- `stackHeight`, `placeAt`, `magnetSnap` – đặt món theo trọng lực và "hít mép" khi kéo thả.
- `buildExtremePoints` – dựng danh sách điểm cực (vị trí ứng viên đặt món).
- `findPosition(items, room, w, h, d, opts)` – chọn điểm cực tốt nhất theo `prefer`: `'fit'` (khít khoảng trống dư nhất), `'floor'` (thấp nhất), `'back'` (sát vách trong nhất); có thử xoay 90°.
- `sortClusteredAreaHeight` – thứ tự xếp: cụm diện tích đáy lớn trước, trong cụm món cao trước.
- `autoPack(room, requests, startItems, { prefer, maxTop })` – tự xếp; `'best'` chạy 3 biến thể, chọn cách xếp được thể tích lớn nhất, hòa thì chọn cách gọn nhất (khối bao ngoài nhỏ nhất).
- `remainingCapacity`, `gridCapacity`, `volumeOf`, `boxRequests(counts)` – sức chứa còn lại, sức chứa lưới, tổng thể tích, đổi số lượng khách nhập thành yêu cầu xếp.
- `aisleZones(room, opts)` – vùng lối đi (vật cản ảo): dải phía trước rộng 0,8 m, kho rộng ≥ 3 m thêm lối giữa.
- `sampleFurniture(geo)`, `describeItems(items)` – bày đồ mẫu theo cỡ kho và mô tả bằng chữ.
- `EXACT_PACK_LIMIT` (300), `PACK_EFFICIENCY` (0,8) – ngưỡng chuyển sang chạy nhanh / hiệu suất dùng để ước tính.

**packing.worker.js**
- `self.onmessage` – nhận `{ id, op, args }`, chạy `autoPack` / `remainingCapacity` / `fitGroups` / `splitPack`, gửi `{ id, progress }` và `{ id, done, result | error }`.

**packingClient.js**
- `createPackChannel()` – kênh `{ run(op, args, onProgress), dispose() }`; 1 việc một lúc, việc cũ trả `CANCELLED`.
- `usePackChannel()` – hook: kênh gắn với vòng đời component.
- `CANCELLED` – giá trị báo việc đã bị hủy.

## Kết nối với các phần khác

- **Import từ ngoài:** `unitGeometry.js` dùng `services/priceBands` (`getBandCode`); `packingClient.js` dùng `react`. Các file còn lại không import gì ngoài nhau (`packing.worker.js` → `packing.js`, `packingClient.js` → `packing.worker.js`).
- **Ai dùng:** `features/unit` (toàn bộ cửa sổ xem kho 3D và gợi ý kho), `features/facility` (sơ đồ kho dùng `unitGeometry`), `App.jsx` (lọc khu vực, đếm đồ), `features/contract`, `pages/business` (hiển thị khu vực).

## Luồng hoạt động

1. **Khách bấm "Xếp thử vào kho này"** (UnitPackPlanner) → `packChannel.run('autoPack', ...)` (packingClient) → worker gọi `autoPack` (packing.js): sắp thứ tự Clustered Area-Height → mỗi món `findPosition` chọn điểm cực → cập nhật điểm cực mới → trả `{ placed, failed }` → giao diện vẽ lại 3D.
2. **Khách nhập số đồ để tìm kho vừa** (useBoxFit) → ước tính ngay theo thể tích × 80% → sau 250 ms `run('fitGroups')` → worker xếp thử từng cỡ kho bằng `autoPack('back')`, báo `progress` từng cỡ → danh sách "Kho vừa với đồ của bạn".
3. **Lọc cơ sở theo khu vực** (App.jsx) → `groupFacilitiesByDistrict` → `getFacilityDistrict` / `extractDistrict` cho từng cơ sở → nhóm `{ slug, label, facilities }` → khách chọn khu vực → lọc theo slug.
