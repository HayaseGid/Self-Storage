# unit

Thư mục `src/features/unit` chứa các **tính năng liên quan tới từng kho (unit)** ở tầng tính năng (feature) của frontend: nhận diện loại kho và ảnh kho dùng chung cho mọi trang; cửa sổ xem kho 3D (kho trống, có đồ mẫu, tự xếp thùng); khối nhập "đồ của bạn"; và hook gợi ý kho nào vừa với đồ của khách. Thuật toán xếp đồ nằm ở `src/utils/packing.js` và chạy trong Web Worker qua `src/utils/packingClient.js`.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [unitTypes.jsx](./unitTypes.jsx) | Loại kho (lạnh, mát, tiêu chuẩn, trong nhà, xe vào, khác): màu, icon, tên, ảnh; hạng kích thước; component chip / icon / thanh hạng / ảnh kho | `src/App.jsx`, `src/features/unit/Unit3DViewer.jsx`, `src/pages/business/BusinessCatalog.jsx`, `src/pages/business/BusinessPanels.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/manager/FacilityManagerAccount.jsx` | Không |
| [Unit3DViewer.jsx](./Unit3DViewer.jsx) | Cửa sổ xem kho 3D 3 tab; gợi ý kho vừa đồ, kho ở cơ sở khác, phương án thuê thêm / đổi kho lớn hơn | `src/App.jsx` (trang chi tiết kho) | Không (đặt kho / giỏ qua callback) |
| [UnitPackPlanner.jsx](./UnitPackPlanner.jsx) | `SampleRoom` (đồ mẫu) và `PackPlanner` (tự thêm / kéo / xoay / xóa đồ, "Xếp thử vào kho này") | `src/features/unit/Unit3DViewer.jsx` | Không |
| [ThreeUnitScene.jsx](./ThreeUnitScene.jsx) | Cảnh 3D Three.js (nạp từ CDN): sàn, vách, cửa, số đo, đồ, lối đi; xoay / phóng to / chọn / kéo món | `src/features/unit/UnitPackPlanner.jsx` | Không |
| [ItemCountsInput.jsx](./ItemCountsInput.jsx) | Khối nhập số lượng thùng nhỏ/vừa/lớn, thùng tự nhập kích thước, đồ lớn | `src/App.jsx`, `src/features/unit/UnitPackPlanner.jsx` | Không |
| [boxCounts.js](./boxCounts.js) | Chuẩn hóa / lưu sessionStorage / đọc-ghi tham số URL cho số đồ khách nhập | `src/App.jsx`, `src/features/unit/ItemCountsInput.jsx`, `src/features/unit/Unit3DViewer.jsx` | Không |
| [useBoxFit.js](./useBoxFit.js) | Hook `useBoxFit` (kho nào vừa đồ) và `useSplitPack` (kho đang xem chứa hết không, phần dư vừa kho nào) | `src/App.jsx`, `src/features/unit/Unit3DViewer.jsx` | Không |
| [unitTypes.css](./unitTypes.css) | Giao diện chip, icon, thanh hạng, ảnh kho của `unitTypes.jsx` | `src/App.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/business/BusinessOperations.jsx` | – |
| [Unit3DViewer.css](./Unit3DViewer.css) | Giao diện cửa sổ 3D, chế độ CSS 3D "Kho trống" của `Unit3DViewer.jsx` | `Unit3DViewer.jsx` | – |
| [UnitPackPlanner.css](./UnitPackPlanner.css) | Giao diện khung 3D, bảng thêm đồ, số liệu, sidebar gợi ý của `UnitPackPlanner.jsx` / `ThreeUnitScene.jsx` / `ItemCountsInput.jsx` | `Unit3DViewer.jsx` | – |

## Các hàm / component chính

**unitTypes.jsx**
- `UNIT_TYPE_STYLES`, `UNIT_TYPE_ORDER` – bộ style và thứ tự 6 loại kho.
- `getUnitTypeKey(typeName)`, `getUnitTypeStyle(typeName)` – tên loại trong DB (tiếng Anh) → khóa / style, nhận diện theo từ khóa.
- `parseUnitSize(sizeText)` – mã size, nhãn, diện tích, hạng Nhỏ / Vừa / Lớn / Rất lớn, cờ locker.
- `UnitTypeIcon`, `UnitTypeChip`, `SizeMeter`, `UnitTypeArt` – icon SVG, nhãn màu, thanh 4 nấc, ảnh thật (chọn theo mã kho) hoặc ảnh SVG cửa cuốn.

**Unit3DViewer.jsx**
- `Unit3DViewer` (default) – props `unit`, `facilityName`, `onClose`, `onOpenDetail`, `onBook`, `units`, `otherUnits`, `onOpenOther`, `onAddToCart`; tab "Kho trống" (CSS 3D, người 1,7 m), "Có đồ mẫu", "Tự xếp thùng"; tính phương án A (thuê thêm 1 kho) / B (đổi kho lớn hơn).
- `hintFor(geo)` – câu gợi ý sức chứa ("chất kín được khoảng N thùng vừa...").

**UnitPackPlanner.jsx**
- `SampleRoom` – bày đồ mẫu (`sampleFurniture`) và mô tả.
- `PackPlanner` – `add` (thêm / chồng món), `move`, `rotate`, `remove` (món trên rơi xuống), `clearAll`, `toggleAisle`, `runAutoPack` (worker `autoPack`); ô "Còn chứa thêm" dùng worker `remainingCapacity`.

**ThreeUnitScene.jsx**
- `loadThree()` – nạp Three.js r128 từ unpkg một lần.
- `ThreeUnitScene` (default) – props `geo`, `color`, `mode`, `items`, `zones`, `selectedId`, `onSelect`, `onMove`, `height`; kéo món: bám lưới 5 cm → `magnetSnap` → `placeAt`, đỏ nếu không hợp lệ.
- `sizeText(item)` – "Rộng × Sâu × Cao cm".

**ItemCountsInput.jsx** – `ItemCountsInput` (default): props `counts`, `onChange(next)`.

**boxCounts.js** – `DEFAULT_BOX_COUNTS`, `normalizeBoxCounts`, `loadBoxCounts` / `saveBoxCounts` (sessionStorage `storespace.boxCounts`), `countsFromParams` / `writeCountsParams` (URL `?items=box-m.500,fridge.1&cs=50x40x30`).

**useBoxFit.js** – `geoKey(geo)`, `useBoxFit(units, counts, aisleOn)` → `{ total, volume, pending, estimated, fits(unit), usedPctOf(unit) }`, `useSplitPack(unit, others, counts, aisleOn, enabled)` → `{ pending, result }`.

## Kết nối với các phần khác

- **Import từ:** `utils/packing.js` (thuật toán, danh mục đồ, lối đi), `utils/packingClient.js` (Web Worker), `utils/unitGeometry.js` (kích thước kho), `services/storageRules` (`formatVnd`), `react`, `react-dom` (`createPortal`), Three.js qua CDN.
- **Ai import:** `src/App.jsx` (trang Tìm kho, chi tiết cơ sở), các trang `pages/customer`, `pages/business`, `pages/manager` (dùng `unitTypes`).

## Luồng hoạt động

1. **Xem kho 3D và tự xếp thùng:** khách bấm "Xem kho 3D" ở trang chi tiết kho → `<Unit3DViewer>` → tab "Tự xếp thùng" → nhập số đồ ở `ItemCountsInput` → `counts` đổi, `saveBoxCounts` → bấm "Xếp thử vào kho này" → `runAutoPack` → worker `autoPack` → `setItems` → `ThreeUnitScene` vẽ lại, hiện % thể tích và "còn chứa thêm".
2. **Gợi ý kho vừa / thuê thêm:** khi `counts` đổi → `useBoxFit` ước tính rồi worker `fitGroups` → sidebar "Kho vừa với đồ của bạn" (bấm → `setUnit` + `autoRun` xếp ngay); `useSplitPack` → worker `splitPack` → nếu kho thiếu chỗ hiện phương án A (bấm "Thêm cả 2 kho vào giỏ" → `onAddToCart`) và B (bấm "Xem kho này").
3. **Hiển thị loại kho ở mọi trang:** trang có `unit.type`, `unit.size` → `<UnitTypeChip>`, `<UnitTypeArt>`, `<SizeMeter>` → `getUnitTypeStyle` / `parseUnitSize` → nhãn màu, ảnh kho, thanh hạng kích thước.
