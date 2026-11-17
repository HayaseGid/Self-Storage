# hooks

Tầng **hook React dùng chung** (tầng nền). Hiện có một hook: `useOpsList` — lấy danh sách vận hành (đơn đặt kho, kho, hợp đồng) có tìm kiếm / lọc / sắp xếp / phân trang ở backend cho màn hình Facility Manager và Facility Staff.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [opsLists.js](./opsLists.js) | Hook `useOpsList(kind, options)` + các lựa chọn sắp xếp; map dòng backend bằng `mappers/operationsState`; backend chưa hỗ trợ (404) thì chia trang ở frontend từ `fallbackRows` | `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/staff/FacilityStaffAccount.jsx` | `GET /api/operations/reservations`, `GET /api/operations/units`, `GET /api/operations/contracts` (`?page=&pageSize=&q=&status=&sort=&facilityId=&typeId=`) |

## Các hàm / component chính

**opsLists.js**
- `useOpsList(kind, { q, status, sort, facilityId, typeId, pageSize, reloadKey, enabled, fallbackRows, statusOf, match })` — `kind` là `'reservations' | 'units' | 'contracts'`; trả kết quả của `useServerList` (`items`, `total`, `page`, `statusCounts`, `pagerProps`, `reload`...) với `items` đã map sang dạng frontend.
- `RESERVATION_SORTS`, `UNIT_SORTS`, `CONTRACT_SORTS` — mảng `[giá trị, nhãn]` cho ô `SortSelect`.
- Nội bộ: `MAPPERS`, `DEFAULT_MATCH` (tìm kiếm khi chia trang ở frontend), `COMPARE` (sắp xếp khi chia trang ở frontend), `text`, `byTime`, `byText`.

## Kết nối với các phần khác

- **Import từ:** `src/components/common/listKit.jsx` (`useServerList`, `parseTime`), `src/mappers/operationsState.js` (`mapReservation`, `mapUnit`, `mapContract`), `react`.
- **Được import bởi:** `src/pages/manager/FacilityManagerAccount.jsx` (bảng Đơn / Kho / Hợp đồng), `src/pages/staff/FacilityStaffAccount.jsx`.

## Luồng hoạt động

1. **Manager lọc danh sách đơn:** Gõ ô tìm kiếm / chọn chip trạng thái / đổi sắp xếp → state trang đổi → `useOpsList('reservations', {...})` → `useServerList` (debounce 300ms) → `GET /api/operations/reservations?page=1&q=...` → `mapReservation` từng dòng → bảng + `<Pager>` hiển thị.
2. **Backend cũ chưa có API phân trang:** Request trả 404 hoặc mảng → `useServerList` chuyển `mode: 'client'` → lọc bằng `DEFAULT_MATCH`, sắp xếp bằng `COMPARE`, cắt trang từ `fallbackRows` (dữ liệu `/api/operations/state` trang đã có).
3. **Sau thao tác (bàn giao, sửa kho):** Trang tăng `reloadKey` → hook tải lại trang hiện tại.
