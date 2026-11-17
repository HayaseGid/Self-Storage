# notification

Folder `features/notification` chứa phần **thông báo cho khách hàng** ở tầng "feature" của frontend: trang "Thông báo" trong trang tài khoản khách, khối "Thông báo mới" ở Tổng quan, và chuông thông báo trên header các trang công khai. Folder này không có API thông báo riêng: danh sách thông báo được tính sẵn ở frontend bởi `useCustomerNotifications` (`services/customerNoticeData.js`) từ dữ liệu đơn, gia hạn, chính sách, trả kho và kiểm kho.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [CustomerNotifications.jsx](./CustomerNotifications.jsx) | Trang "Thông báo" (lọc theo nhóm, phân trang 10 dòng, nhãn "Mới") và khối xem nhanh 3 thông báo | `src/pages/customer/CustomerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx` | Không gọi API |
| [HeaderNotificationBell.jsx](./HeaderNotificationBell.jsx) | Nút chuông + popup trên header (chỉ với khách), số đỏ, ghim đơn chưa đặt cọc, thanh nhắc đơn chưa đặt cọc dưới header | `src/App.jsx` | Gián tiếp: `GET /api/customer-reservations/mine` (qua `loadRentals` App truyền vào), `GET /api/contract-renewals/mine`, `GET /api/policies`, `GET /api/unit-returns/mine`, `GET /api/return-inspections/mine` |
| [CustomerNotifications.css](./CustomerNotifications.css) | Giao diện danh sách thông báo, nút lọc, khối xem nhanh (`cn-*`) | `CustomerNotifications.jsx` | — |
| [HeaderNotificationBell.css](./HeaderNotificationBell.css) | Giao diện nút chuông, popup, mục "Cần làm ngay" (`header-bell-*`) | `HeaderNotificationBell.jsx` | — |

## Các hàm / component chính

**CustomerNotifications.jsx**
- `ICON`, `FILTERS`: biểu tượng theo mức độ và danh sách nút lọc nhóm.
- `NotificationItem` (nội bộ): vẽ 1 dòng thông báo (biểu tượng, tiêu đề, nhãn "Mới", nút hành động).
- `CustomerNotificationsPage` (export default): trang "Thông báo"; mở trang thì `center.markAll()` đánh dấu đã xem nhưng vẫn giữ nhãn "Mới" trong lần xem này.
- `NotificationsPreview` (export): khối tối đa 3 thông báo + nút "Xem tất cả".

**HeaderNotificationBell.jsx**
- `shared`, `fetchShared`, `useSharedRentals` (nội bộ): bộ nhớ đệm cấp module để chuông và thanh nhắc chỉ tải danh sách đơn 1 lần (dùng lại trong 15 giây).
- `BellIcon` (export): biểu tượng chuông SVG.
- `useHeaderNotices(user, loadRentals)` (export): gom dữ liệu và gọi `useCustomerNotifications`; tải lại khi quay lại tab trình duyệt.
- `HeaderPendingDepositBar` (export): thanh nhắc đơn chưa đặt cọc dưới header.
- `openNoticeTarget(item, navigate)` (nội bộ): ghi yêu cầu (ký / gia hạn / cuộn tới hợp đồng) vào sessionStorage qua `services/afterDeposit` rồi chuyển sang `/customer` đúng tab.
- `HeaderNotificationBell` (export default): nút chuông (`variant="icon"`) hoặc dòng trong menu điện thoại (`variant="menu"`).

## Kết nối với các phần khác

- **Import từ:** `components/common/listKit` (`Pager`, `useClientPaging`), `services/customerNoticeData` (`useCustomerNotifications`), `services/policies` (`usePolicies`), `services/afterDeposit`, `services/storageRules` (`formatReservationCode`), `features/contract/ContractRenewal` (`useContractRenewals`), `features/return/UnitReturn` (`useUnitReturns`), `features/return/ReturnInspection` (`useMyInspections`), `features/payment/PendingPayments` (`PendingDepositBar`, `fmtLeft`, `usePendingDeposits`).
- **Được import bởi:** `src/App.jsx` (chuông + thanh nhắc trên header), `src/pages/customer/CustomerAccount.jsx` (trang Thông báo + khối xem nhanh).
- Trạng thái "đã xem" dùng chung qua `useCustomerNotifications`, nên số đỏ trên header luôn khớp trang Thông báo.

## Luồng hoạt động

1. **Hiện số đỏ trên chuông:** App.jsx vẽ `HeaderNotificationBell` khi người dùng là khách → `useHeaderNotices` tải đơn (`loadRentals`), gia hạn, chính sách, trả kho, kiểm kho → `useCustomerNotifications` tính danh sách + trạng thái đã xem → số đỏ = thông báo chưa xem + đơn chờ cọc (gộp theo id, không đếm 2 lần).
2. **Bấm 1 thông báo trong popup:** bấm chuông → popup mở → bấm thông báo → `goTo` → `openNoticeTarget` ghi yêu cầu vào sessionStorage → chuyển sang `/customer` ở tab hợp đồng / thanh toán / thông báo → trang khách đọc yêu cầu và mở đúng hộp thoại.
3. **Xem trang Thông báo:** khách mở tab "Thông báo" trong CustomerAccount → `CustomerNotificationsPage` đánh dấu tất cả đã xem (`markAll`) → chọn nút lọc nhóm → lọc + phân trang → bấm nút hành động → `onAction(item)` (CustomerAccount điều hướng).
