# mappers

Tầng **chuyển đổi dữ liệu** (tầng nền, tương đương DTO ở backend). Nhận JSON thô backend trả về và đổi thành object frontend thống nhất: điền giá trị mặc định, ép kiểu số, cắt ngày về `YYYY-MM-DD`, gom các tên trường khác nhau — để mọi màn hình vận hành (Staff, Manager, Business) dùng chung một dạng dữ liệu.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [operationsState.js](./operationsState.js) | Map toàn bộ dữ liệu `/api/operations/state` và từng dòng kho / đơn / hợp đồng (dùng chung cho API phân trang) | `src/hooks/opsLists.js`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/staff/FacilityStaffAccount.jsx`, `src/pages/business/BusinessOperations.jsx` | Không (dữ liệu từ `GET /api/operations/state` và `GET /api/operations/reservations|units|contracts` do nơi dùng tải) |

## Các hàm / component chính

**operationsState.js**
- `mapOperationsState(raw)` — trả `{ facilities, units, reservations, contracts, payments, staff, unitTypes, unitSizes, rentalRates, priceBands, managers, staffUsers, policies, activity }`.
- `mapUnit(u)` — 1 kho: mã, cơ sở, loại, kích thước, diện tích, giá/tháng, tầng/khu, trạng thái (mặc định `AVAILABLE`).
- `mapReservation(r)` — 1 đơn: khách, kho được gán, ngày, số tháng, lịch hẹn bàn giao, cọc/tiền thuê, tiền thuê lúc nhận kho, trạng thái thanh toán / đơn, hợp đồng & chữ ký.
- `mapContract(c)` — 1 hợp đồng: số HĐ (mặc định `HD-{id}`), đơn, khách, kho, ngày hiệu lực, cọc/tổng phí, chữ ký, thông tin truy cập kho.
- Nội bộ: `cleanDate(value)`.

## Kết nối với các phần khác

- **Import từ:** `src/services/storageRules.js` (`DEPOSIT_MONTHS` làm giá trị mặc định).
- **Được import bởi:** `src/hooks/opsLists.js` (map từng dòng danh sách phân trang), các trang vận hành `FacilityManagerAccount`, `FacilityStaffAccount`, `BusinessOperations` (map dữ liệu `/state`).

## Luồng hoạt động

1. **Tải trang Manager / Staff / Business:** Trang gọi `apiGet('/api/operations/state?...')` → `mapOperationsState(raw)` → lưu vào state → các tab (kho, đơn, hợp đồng, giá, nhân viên) đọc object đã chuẩn hóa.
2. **Danh sách phân trang:** `useOpsList('units')` → `GET /api/operations/units?...` → mỗi dòng qua `mapUnit` → cùng dạng với dữ liệu `/state` nên các component bảng cũ dùng lại được.
