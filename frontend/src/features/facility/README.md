# facility

Thư mục `src/features/facility` chứa các **component hiển thị cơ sở lưu trữ trên bản đồ** (tầng tính năng – feature – của frontend): bản đồ vị trí các cơ sở (Leaflet + OpenStreetMap) ở trang chủ / trang chi tiết, và sơ đồ các kho bên trong một cơ sở (vẽ trên bản đồ thật hoặc dạng lưới). Leaflet được nạp từ CDN khi cần, không cài package npm và không cần API key.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [FacilityMap.jsx](./FacilityMap.jsx) | Bản đồ vị trí các cơ sở: ghim hiện số kho trống, popup "Xem kho" / "Chỉ đường"; nạp Leaflet, tải tọa độ cơ sở | `src/App.jsx` | `GET /api/facility-locations` |
| [FacilityMap.css](./FacilityMap.css) | Giao diện bản đồ cơ sở (ghim, popup, lớp phủ) cho `FacilityMap.jsx` | `FacilityMap.jsx` | – |

## Các hàm / component chính

**FacilityMap.jsx**
- `loadLeaflet()` – nạp Leaflet 1.9.4 (CSS + JS) từ unpkg một lần, trả `window.L`.
- `loadFacilityLocations(force)` – gọi `GET /api/facility-locations`, cache kết quả dùng chung.
- `useFacilityLocations()` – hook trả `{ loading, error, locations }`.
- `directionsUrl(point)` – link chỉ đường Google Maps.
- `FacilityMap` (default) – props `points`, `onOpen(point)`, `selectedId`, `height`, `single`; vẽ ghim, căn khung nhìn, mở popup cơ sở đang chọn.

## Kết nối với các phần khác

- **Import từ:** `api/api` (`apiGet`), `utils/unitGeometry` (kích thước, trạng thái kho, nhãn nhóm cỡ), `services/storageRules` (`formatVnd`), `features/unit/Unit3DViewer` (cửa sổ xem kho 3D); thư viện Leaflet và ô bản đồ OpenStreetMap qua Internet.
- **Ai import:** `src/App.jsx` dùng `FacilityMap`, `useFacilityLocations`, `directionsUrl`.

## Luồng hoạt động

1. **Xem bản đồ cơ sở ở trang chủ:** App gọi `useFacilityLocations` → `GET /api/facility-locations` → ghép tọa độ với danh sách cơ sở → `<FacilityMap points>` → `loadLeaflet` → vẽ ghim → khách bấm ghim, bấm "Xem kho" → `onOpen(point)` → App mở trang chi tiết cơ sở.
3. **Từ cửa sổ 3D đặt kho / thêm giỏ:** trong `Unit3DViewer` khách bấm "Đặt kho này" hoặc "Thêm cả 2 kho vào giỏ" → callback `onBook` / `onAddToCart` → App xử lý (giỏ hàng / đặt kho).
