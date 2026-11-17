# components/common

Tầng **component giao diện dùng chung** (tầng nền). Các mảnh UI không gắn với nghiệp vụ cụ thể nào, được mọi vai trò (khách, staff, manager, business, admin) dùng để giao diện thống nhất: hộp thoại thông báo / xác nhận, bảng dữ liệu, bộ công cụ danh sách (phân trang, nhãn "Mới", thẻ mã), ô nhập giá, lịch chọn ngày thuê.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [Dialog.jsx](./Dialog.jsx) | `DialogProvider` + `useDialog()` thay cho `window.alert/confirm`, trả Promise, xếp hàng đợi | `src/App.jsx` (Provider) và `useDialog` ở `src/pages` (customer/CartPage, customer/CustomerAccount, manager/FacilityManagerAccount, staff/FacilityStaffAccount, admin/AdminAccount, business/BusinessOperations, payment/PaymentResultPage), `src/features` (booking/CancelReservation, contract/ContractRenewal, payment/PendingPayments, return/ReturnInspection, return/StaffReturns, return/UnitReturn) | Không |
| [Dialog.css](./Dialog.css) | Định dạng giao diện cho `Dialog.jsx` (lớp phủ, thẻ hộp thoại, màu theo tone, nút) | `src/components/common/Dialog.jsx` | — |
| [listKit.jsx](./listKit.jsx) | Bộ công cụ danh sách: `Pager`, `useClientPaging`, `useServerList`, nhãn "Mới", `Code`/`UnitCodes`, `FilterChips`, `SortSelect`, tiện ích thời gian | `src/components/common/DataGrid.jsx`, `src/hooks/opsLists.js`, `src/pages` (admin/AdminAccount, business/BusinessPanels, customer/CustomerAccount, manager/FacilityManagerAccount, staff/FacilityStaffAccount), `src/features` (contract/ContractCard, notification/CustomerNotifications, payment/PendingPayments, return/ReturnInspection, return/StaffReturns) | `GET {path}?page=&pageSize=&q=&status=&sort=...` (chỉ `useServerList`, path do nơi dùng truyền) |
| [listKit.css](./listKit.css) | Định dạng giao diện cho `listKit.jsx` (thanh phân trang, nhãn Mới, dòng tô sáng, thẻ mã, chip lọc, ô sắp xếp) | `src/components/common/listKit.jsx` | — |
| [DataGrid.jsx](./DataGrid.jsx) | Bảng dữ liệu có tìm kiếm / lọc / sắp xếp cột / phân trang ở frontend | `src/pages/customer/CustomerAccount.jsx`, `src/pages/business/BusinessCatalog.jsx` (trang chưa được dùng) | Không |
| [DataGrid.css](./DataGrid.css) | Định dạng giao diện cho `DataGrid.jsx` (thanh công cụ, bảng, nút sắp xếp) | `src/components/common/DataGrid.jsx` | — |
| [PriceInput.jsx](./PriceInput.jsx) | Ô nhập giá thuê/tháng: phân cách hàng nghìn, làm tròn 1.000đ, báo lỗi / cảnh báo lệch giá tham chiếu | `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/manager/ManagerPriceTable.jsx`, `src/pages/business/BusinessPolicyEditor.jsx`, `src/pages/business/BusinessPriceBands.jsx` | Không |
| [PriceInput.css](./PriceInput.css) | Định dạng giao diện cho `PriceInput.jsx` (ô nhập, đơn vị, dòng gợi ý lỗi / cảnh báo) | `src/components/common/PriceInput.jsx` | — |
| [RentalCalendar.jsx](./RentalCalendar.jsx) | Lịch chọn ngày bắt đầu thuê: chặn ngày quá khứ (Demo Clock), tô kỳ thuê, chọn nhanh, điều khiển bằng phím | `src/App.jsx`, `src/pages/customer/CartPage.jsx` | Không |
| [RentalCalendar.css](./RentalCalendar.css) | Định dạng giao diện cho `RentalCalendar.jsx` (lưới ngày, ngày bắt đầu / kết thúc / trong kỳ, chú thích) | `src/components/common/RentalCalendar.jsx` | — |

## Các hàm / component chính

**Dialog.jsx**
- `DialogProvider({ children })` — quản lý hàng đợi, cung cấp `{ open, alert, confirm }`.
- `useDialog()` — `alert(opts)` → true; `confirm(opts)` → true/false; `open({ actions })` → `value` của nút bấm. Ngoài Provider dùng `window.alert/confirm`.
- Nội bộ: `DialogView` (vẽ hộp thoại, Esc, Tab xoay vòng, khóa cuộn, tự focus nút chính).

**listKit.jsx**
- `NEW_HOURS` (48), `DEFAULT_PAGE_SIZE` (5).
- Nhãn mới: `getSeenSet`, `isItemSeen`, `markItemSeen`, `markAllItemsSeen`, `isNewItem`, `NewBadge`, `rowClass`.
- Thời gian: `parseTime`, `newestFirst`, `fmtDateTimeShort`, `timeAgo`.
- Hiển thị mã: `Code`, `UnitCodes`.
- Phân trang: `Pager`, `useClientPaging(rows, { pageSize, resetKey })`, `useServerList({ path, q, status, sort, extra, reloadKey, fallback })`.
- Lọc / sắp xếp: `FilterChips`, `SortSelect`.
- Nội bộ: `pageWindow`, `useDebounced`, `toQuery`.

**DataGrid.jsx**
- `DataGrid` (default) — props `columns`, `rows`, `getRowId`, `searchText`, `filters`, `pageSize`, `initialSort`, `onRowClick`, `getCreatedAt`...

**PriceInput.jsx**
- `PriceInput` (default) — props `value`, `onChange(number|null)`, `reference`, `referenceLabel`, `readOnly`, `showErrorsBeforeTouch`...

**RentalCalendar.jsx**
- `RentalCalendar` (default) — props `value`, `onChange(Date)`, `endDate`, `minDate`, `maxDate`, `durationMonths`.
- Nội bộ: `buildMonth`, `startOfDay`, `sameDay`, `addDays`, `fmt`, `keyOf`.

## Kết nối với các phần khác

- **Import từ:** `src/api/api.js` (`apiGet`, trong `listKit.jsx`), `src/services/storageRules.js` (quy tắc giá, trong `PriceInput.jsx`), `src/demoClock/demoClock.js` (`getTodayDate`, trong `RentalCalendar.jsx`). Trong folder: `DataGrid.jsx` dùng `Pager`, `newestFirst`, `rowClass`, `DEFAULT_PAGE_SIZE` của `listKit.jsx`.
- **Được import bởi:** `src/App.jsx`, `src/hooks/opsLists.js`, tất cả trang vai trò trong `src/pages/*` và nhiều feature trong `src/features/*` (xem bảng). Đối tượng `dialog` từ `useDialog()` còn được truyền vào `src/services/afterDeposit.js`.

## Luồng hoạt động

1. **Xác nhận trước khi xóa:** Component gọi `const ok = await dialog.confirm({ title, tone: 'danger' })` → `open()` thêm vào hàng đợi → `DialogView` hiện → người dùng bấm → `close(value)` resolve Promise → component tiếp tục (gọi API xóa nếu `ok`).
2. **Danh sách phân trang ở backend:** Trang gọi `useServerList({ path: '/api/admin/users', q })` → `GET path?page=1&pageSize=5&q=...` → `items`, `total` → vẽ bảng + `<Pager {...pagerProps}/>` → bấm trang 2 → `setPage(2)` → gọi lại API.
3. **Chọn ngày thuê:** Khách bấm ngày trên `RentalCalendar` → `select(date)` → `onChange(date)` → trang tính ngày kết thúc (`calculateEndDate`) và truyền `endDate` → lịch tô kỳ thuê.
