# facility

Thư mục `src/features/facility` chứa các **component hiển thị cơ sở lưu trữ trên bản đồ** (tầng tính năng – feature – của frontend): bản đồ vị trí các cơ sở (Leaflet + OpenStreetMap) ở trang chủ / trang chi tiết, và sơ đồ các kho bên trong một cơ sở (vẽ trên bản đồ thật hoặc dạng lưới). Leaflet được nạp từ CDN khi cần, không cài package npm và không cần API key.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [FacilityMap.jsx](./FacilityMap.jsx) | Bản đồ vị trí các cơ sở: ghim hiện số kho trống, popup "Xem kho" / "Chỉ đường"; nạp Leaflet, tải tọa độ cơ sở | `src/App.jsx` | `GET /api/facility-locations` |
| [FacilityFloorPlan.jsx](./FacilityFloorPlan.jsx) | Khối "Sơ đồ mặt bằng": SVG nhìn từ trên xuống, tỉ lệ 1 m = 10 px — bãi cỏ, sân, nhà kho tường dày, đường và lối xe vào cổng; khu L, V phía trên, S, M phía dưới, lối đi chính có vạch vàng, cửa cuốn quay ra lối đi; rê chuột vào kho hiện khung thông tin (kích thước, diện tích, giá, trạng thái); bấm kho mở cửa sổ 3D | `src/App.jsx` | Không |
| [FacilityMap.css](./FacilityMap.css) | Giao diện bản đồ cơ sở (ghim, popup, lớp phủ) cho `FacilityMap.jsx` | `FacilityMap.jsx` | – |
| [FacilityFloorPlan.css](./FacilityFloorPlan.css) | Giao diện sơ đồ mặt bằng (cỏ, sân, tường, cửa cuốn, nhãn khu), chú thích, khung thông tin khi rê chuột | `FacilityFloorPlan.jsx` | – |

## Các hàm / component chính

**FacilityMap.jsx**
- `loadLeaflet()` – nạp Leaflet 1.9.4 (CSS + JS) từ unpkg một lần, trả `window.L`.
- `loadFacilityLocations(force)` – gọi `GET /api/facility-locations`, cache kết quả dùng chung.
- `useFacilityLocations()` – hook trả `{ loading, error, locations }`.
- `directionsUrl(point)` – link chỉ đường Google Maps.
- `FacilityMap` (default) – props `points`, `onOpen(point)`, `selectedId`, `height`, `single`; vẽ ghim, căn khung nhìn, mở popup cơ sở đang chọn.

**FacilityFloorPlan.jsx**
- `layoutPlan(units)` – xếp kho vào 4 khu quanh lối đi chính (mét): mỗi khu là các dãy kho sát nhau (dãy dài quá 48 m thì xuống dãy mới), ô kho theo kích thước lớn nhất của nhóm (`cellSize`: kho xe quay cạnh dài ra lối đi). `shortLabel(id, width)` – nhãn ngắn trong ô.
- `FacilityFloorPlan` (default) – props `facility`, `units`, `highlightIds`, `onOpenDetail`, `onBook`, `otherUnits`, `onOpenOther`, `onAddToCart`; gom kho theo khu (`layoutPlan`), đếm trạng thái, vẽ sơ đồ mặt bằng SVG, hiện khung thông tin khi rê chuột (`hover`), mở `Unit3DViewer` khi bấm kho.

## Kết nối với các phần khác

- **Import từ:** `api/api` (`apiGet`), `utils/unitGeometry` (kích thước, trạng thái kho, nhãn nhóm cỡ), `services/storageRules` (`formatVnd`), `features/unit/Unit3DViewer` (cửa sổ xem kho 3D); thư viện Leaflet và ô bản đồ OpenStreetMap qua Internet.
- **Ai import:** `src/App.jsx` dùng `FacilityMap`, `useFacilityLocations`, `directionsUrl`, `FacilityFloorPlan`. Bên trong folder: `FacilityFloorPlan` không dùng bản đồ thật (chỉ vẽ SVG).

## Luồng hoạt động

1. **Xem bản đồ cơ sở ở trang chủ:** App gọi `useFacilityLocations` → `GET /api/facility-locations` → ghép tọa độ với danh sách cơ sở → `<FacilityMap points>` → `loadLeaflet` → vẽ ghim → khách bấm ghim, bấm "Xem kho" → `onOpen(point)` → App mở trang chi tiết cơ sở.
2. **Xem sơ đồ kho trong cơ sở:** trang chi tiết hiện thẻ "Bản đồ cơ sở" (`FacilityLocationCard` → `FacilityMap`, vị trí thật của cơ sở) và bên dưới là `<FacilityFloorPlan units>` → `layoutPlan` xếp kho vào 4 khu quanh lối đi → rê chuột vào kho: khung thông tin hiện ngay trên kho → bấm kho: `setSelected` → `<Unit3DViewer>`.
3. **Từ cửa sổ 3D đặt kho / thêm giỏ:** trong `Unit3DViewer` khách bấm "Đặt kho này" hoặc "Thêm cả 2 kho vào giỏ" → callback `onBook` / `onAddToCart` truyền qua `FacilityFloorPlan` → App xử lý (giỏ hàng / đặt kho).
