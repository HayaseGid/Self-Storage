# facility

Thư mục `src/features/facility` chứa các **component hiển thị cơ sở lưu trữ trên bản đồ** (tầng tính năng – feature – của frontend): bản đồ vị trí các cơ sở (Leaflet + OpenStreetMap) ở trang chủ / trang chi tiết, và sơ đồ các kho bên trong một cơ sở (vẽ trên bản đồ thật hoặc dạng lưới). Leaflet được nạp từ CDN khi cần, không cài package npm và không cần API key.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [FacilityMap.jsx](./FacilityMap.jsx) | Bản đồ vị trí các cơ sở: ghim hiện số kho trống, popup "Xem kho" / "Chỉ đường"; nạp Leaflet, tải tọa độ cơ sở | `src/App.jsx`, `src/features/facility/FacilityUnitsMap.jsx` | `GET /api/facility-locations` |
| [FacilityFloorPlan.jsx](./FacilityFloorPlan.jsx) | Khối "Sơ đồ / Bản đồ kho tại cơ sở": chấm kho theo khu S/M/L/xe, bấm chấm mở cửa sổ 3D | `src/App.jsx` | Không |
| [FacilityUnitsMap.jsx](./FacilityUnitsMap.jsx) | Vẽ khu nhà kho và chấm từng kho trên bản đồ thật quanh cổng vào (tọa độ cơ sở) | `src/features/facility/FacilityFloorPlan.jsx` | Không |
| [FacilityMap.css](./FacilityMap.css) | Giao diện bản đồ cơ sở (ghim, popup, lớp phủ) cho `FacilityMap.jsx` | `FacilityMap.jsx` | – |
| [FacilityFloorPlan.css](./FacilityFloorPlan.css) | Giao diện sơ đồ lưới, chú thích, chấm kho, tooltip cho `FacilityFloorPlan.jsx` | `FacilityFloorPlan.jsx` | – |
| [FacilityUnitsMap.css](./FacilityUnitsMap.css) | Giao diện nhãn khu, chấm kho, cổng vào trên bản đồ cho `FacilityUnitsMap.jsx` | `FacilityUnitsMap.jsx` | – |

## Các hàm / component chính

**FacilityMap.jsx**
- `loadLeaflet()` – nạp Leaflet 1.9.4 (CSS + JS) từ unpkg một lần, trả `window.L`.
- `loadFacilityLocations(force)` – gọi `GET /api/facility-locations`, cache kết quả dùng chung.
- `useFacilityLocations()` – hook trả `{ loading, error, locations }`.
- `directionsUrl(point)` – link chỉ đường Google Maps.
- `FacilityMap` (default) – props `points`, `onOpen(point)`, `selectedId`, `height`, `single`; vẽ ghim, căn khung nhìn, mở popup cơ sở đang chọn.

**FacilityFloorPlan.jsx**
- `FacilityFloorPlan` (default) – props `facility`, `units`, `point`, `highlightIds`, `onOpenDetail`, `onBook`, `otherUnits`, `onOpenOther`, `onAddToCart`; gom kho theo khu, đếm trạng thái, chọn bản đồ hay lưới, mở `Unit3DViewer` khi bấm chấm.

**FacilityUnitsMap.jsx**
- `layoutUnits(units)` – tính vị trí (mét) từng khu và từng kho quanh cổng vào: mỗi khu là lưới gần vuông, các khu đặt cạnh nhau, cách cổng 10 m.
- `FacilityUnitsMap` (default) – đổi mét ra vĩ độ/kinh độ, vẽ khu, chấm kho (màu theo trạng thái), ghim "Cổng vào"; làm mờ kho không khớp bộ lọc.

## Kết nối với các phần khác

- **Import từ:** `api/api` (`apiGet`), `utils/unitGeometry` (kích thước, trạng thái kho, nhãn nhóm cỡ), `services/storageRules` (`formatVnd`), `features/unit/Unit3DViewer` (cửa sổ xem kho 3D); thư viện Leaflet và ô bản đồ OpenStreetMap qua Internet.
- **Ai import:** `src/App.jsx` dùng `FacilityMap`, `useFacilityLocations`, `directionsUrl`, `FacilityFloorPlan`. Bên trong folder: `FacilityFloorPlan` → `FacilityUnitsMap` → `loadLeaflet` của `FacilityMap`.

## Luồng hoạt động

1. **Xem bản đồ cơ sở ở trang chủ:** App gọi `useFacilityLocations` → `GET /api/facility-locations` → ghép tọa độ với danh sách cơ sở → `<FacilityMap points>` → `loadLeaflet` → vẽ ghim → khách bấm ghim, bấm "Xem kho" → `onOpen(point)` → App mở trang chi tiết cơ sở.
2. **Xem sơ đồ kho trong cơ sở:** trang chi tiết render `<FacilityFloorPlan units point>` → có tọa độ thì `<FacilityUnitsMap>` (`layoutUnits` → vẽ chấm), không có thì sơ đồ lưới → khách bấm chấm kho → `setSelected(unit)` → mở `Unit3DViewer`.
3. **Từ cửa sổ 3D đặt kho / thêm giỏ:** trong `Unit3DViewer` khách bấm "Đặt kho này" hoặc "Thêm cả 2 kho vào giỏ" → callback `onBook` / `onAddToCart` truyền qua `FacilityFloorPlan` → App xử lý (giỏ hàng / đặt kho).
