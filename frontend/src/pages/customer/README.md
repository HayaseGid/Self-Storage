# customer

Folder chứa các **trang (page) dành cho khách hàng** đã đăng nhập, thuộc tầng `pages/` của frontend React/Vite (tầng màn hình: ghép các component trong `features/` và `components/`, gọi API qua `api/` và `services/`). Gồm 2 màn hình:

- **Giỏ kho / đặt kho** (`/cart`): đặt nhiều kho cùng lúc từ giỏ hàng, giữ kho và trả tiền cọc (VNPay hoặc mô phỏng).
- **Khu tài khoản khách hàng** (`/customer`): tổng quan, kho của tôi, hợp đồng, thanh toán, thông báo, hồ sơ.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|------|-----------|---------------|---------|
| [CartPage.jsx](./CartPage.jsx) | Trang giỏ kho 2 bước: chọn kho + thông tin thuê → giữ kho → thanh toán cọc (VNPay / mô phỏng), hủy đặt | `src/App.jsx` (route `/cart`) | `POST /api/reservation`, `POST /api/vnpay/create`, `POST /api/payment/confirm`, `POST /api/reservation-confirmations/mine`, `POST /api/reservation-cancellations/{id}` |
| [CartPage.css](./CartPage.css) | Giao diện cho `CartPage.jsx` (đồng nhất với giao diện trang đặt kho BookingPage) | `CartPage.jsx` | — |
| [CustomerAccount.jsx](./CustomerAccount.jsx) | Khu tài khoản khách: menu trái + 6 tab (Tổng quan, Kho của tôi, Hợp đồng, Thanh toán, Thông báo, Hồ sơ) | `src/App.jsx` (route `/customer`, import với tên `CustomerDashboard`) | `GET/POST /api/contracts/{id}/signature`, `POST /api/reservation-confirmations/mine`, `POST /api/vnpay/create`, `POST /api/email/send-contract`; qua hook: `GET /api/contract-renewals/mine`, `GET /api/unit-returns/mine`, `GET /api/late-fees/mine`, `GET /api/return-inspections/mine`, `GET /api/policies` |
| [CustomerAccount.css](./CustomerAccount.css) | Giao diện cho `CustomerAccount.jsx` (menu, thẻ kho, thẻ ra vào, hồ sơ, tiến trình hoàn cọc...) | `CustomerAccount.jsx` | — |

## Các hàm / component chính

### CartPage.jsx
- `CartPage` (export default): component trang giỏ kho, giữ state 2 bước `'cart'` → `'payment'`.
- `checkout()`: kiểm tra đăng nhập / vai trò / số kho / ngày / khung giờ → tạo một đơn giữ kho cho từng kho (`POST /api/reservation`) → lưu "đơn giỏ" → sang bước trả cọc.
- `payDeposit()`: trả cọc qua VNPay (`startVnPayPayment`) hoặc mô phỏng (`POST /api/payment/confirm` từng đơn + `confirmAfterDeposit`) → mở tab Hợp đồng.
- `cancelOrder()`: hủy các đơn đang giữ (`cancelHeldReservations`) và trả kho về giỏ.
- `useEffect` dọn dẹp khi rời trang: rời bước trả cọc mà chưa trả (và không phải đi sang VNPay) → hủy đơn + trả kho về giỏ.
- `endDateFor(start, months)`: tính ngày kết thúc thuê. `toApiDate`, `fmtDate`, `money`: định dạng ngày / tiền. `ArrowIcon`: icon nút.

### CustomerAccount.jsx
- `CustomerDashboard` (export default): khung trang, menu + badge, tab Tổng quan ("Việc cần xử lý ngay", số liệu, kho chính, công nợ, hợp đồng, hoạt động gần đây), tính thông báo, điều hướng theo thông báo, đăng xuất.
- `MyStoragePage`: tab Kho của tôi — thẻ ra vào + mã PIN, bảng DataGrid / thẻ (5 thẻ/trang), hộp chi tiết kho, `renderUnitActions` (nút tác vụ theo trạng thái), `openReturnFor`, `copyPin`.
- `ContractPage`: tab Hợp đồng — 4 tab con `pending / active / returns / ended`; `signGroupContracts` (ký + gửi email), `createPendingContracts` (tạo hợp đồng sau cọc, thử lại), `payRent` (đóng tiền thuê + phí trễ hạn qua VNPay), `reloadSignature`, `handleSign` (luồng ký cũ ContractModal); các `useEffect` cuộn tới / mở ký / mở gia hạn theo yêu cầu.
- `RefundTimeline`: tiến trình hoàn cọc khi hủy đơn (dùng trong tab Thanh toán qua `renderRefund`).
- `ProfilePage`: tab Hồ sơ (chỉ xem) + mã ra vào cơ sở 6 chữ số.
- `NavIcon`, `dateSortValue`, `fmtUtc`, hằng `RENTAL_STATUS_TONES`, `RENTAL_STATUS_FILTERS`, `STORAGE_VIEW_KEY`.

## Kết nối với các phần khác

**Folder này import từ:**
- `src/api/`: `api.js` (apiGet, apiPost), `vnpay.js` (startVnPayPayment, SIMULATED_PAYMENT_ENABLED), `lateFees.js` (useLateFees), `contractEmail.js` (sendContractEmail).
- `src/store/cart.js`: giỏ hàng (useCart, removeFromCart, restoreToCart, saveCartOrder, cancelHeldReservations, CHECKOUT_LIMIT...).
- `src/services/`: `afterDeposit.js` (sau khi cọc, sự kiện mở tab, yêu cầu ký / gia hạn / cuộn tới hợp đồng qua sessionStorage), `pricing.js`, `storageRules.js`, `policies.js`, `customerNoticeData.js`, `contractSignatures.js`.
- `src/features/`: `contract/` (ContractSignFlow, ContractDetailModal, ContractCard, ContractModal, ContractRenewal), `return/` (UnitReturn, ReturnInspection), `payment/` (PendingPayments, DepositConfirm), `booking/` (HandoverChoice, CancelReservation), `notification/` (CustomerNotifications), `unit/` (unitTypes).
- `src/components/common/`: Dialog, DataGrid, RentalCalendar, listKit.
- `src/demoClock/demoClock.js`: ngày "hôm nay" giả lập.

**Ai import folder này:** chỉ `src/App.jsx` (`CartPage` cho `/cart`; `CustomerDashboard` từ `CustomerAccount.jsx` cho `/customer`). App.jsx tải danh sách đơn của khách (`GET /api/customer-reservations/mine`) và truyền vào qua props `customerRentals`, kèm `onReloadRentals` để tải lại.

## Luồng hoạt động

### 1. Đặt nhiều kho từ giỏ và đặt cọc
1. Khách bỏ kho vào giỏ ở trang tìm kho / chi tiết kho → vào `/cart`.
2. Chọn cơ sở (mỗi lần chỉ 1 cơ sở), tick các kho, chọn ngày bắt đầu, gói 6/12 tháng, hình thức trả (theo tháng / 1 lần), cách nhận kho + khung giờ.
3. Bấm **"Xác nhận đặt N kho"** → `checkout()` → `POST /api/reservation` cho từng kho (đơn ở trạng thái *Pending Deposit*, được giữ có thời hạn) → bỏ kho đã giữ khỏi giỏ → bước 2.
4. Tick xác nhận cọc → bấm **"Thanh toán cọc qua VNPay"** → `payDeposit()`:
   - VNPay: `POST /api/vnpay/create` → trang VNPay → quay về `/payment-result` (PaymentResultPage xác nhận và mở tab Hợp đồng).
   - Mô phỏng (chế độ demo): `POST /api/payment/confirm` từng đơn → `POST /api/reservation-confirmations/mine` (tạo hợp đồng) → mở `/customer` tab Hợp đồng.
5. Bấm **"Hủy"** hoặc rời trang khi chưa trả → `POST /api/reservation-cancellations/{id}` + trả kho về giỏ.

### 2. Ký hợp đồng
1. Tab **Hợp đồng** → tab con *Đã cọc · chờ nhận kho* liệt kê hợp đồng chờ ký (đơn *Confirmed*, hoặc phụ lục gia hạn chưa ký).
2. Đơn *Paid* chưa có hợp đồng → `createPendingContracts` tự gọi `POST /api/reservation-confirmations/mine` (hoặc khách bấm "Tạo hợp đồng ngay").
3. Bấm **"Xem & ký hợp đồng"** → `ContractSignFlow` → `signGroupContracts` → `POST /api/contracts/{id}/signature` → gửi email (`POST /api/email/send-contract`) → mở chi tiết hợp đồng + báo thành công → `onReloadRentals()`.

### 3. Kho của tôi, đóng tiền thuê, hồ sơ & mã ra vào
1. Tab **Kho của tôi**: thẻ ra vào cho kho đang thuê (mã PIN, nút sao chép), bảng / thẻ mọi đơn; bấm 1 dòng → hộp chi tiết với nút tác vụ (đóng cọc, ký HĐ, đóng phí, gia hạn, báo trả kho).
2. Đóng tiền thuê: tab **Thanh toán** (`CustomerPaymentCenter`) hoặc nút đóng tiền trên thẻ hợp đồng → `payRent` → `POST /api/vnpay/create` (kind `rent`, gộp phí trễ hạn) → VNPay → `/payment-result`.
3. Tab **Hồ sơ**: xem thông tin tài khoản và mã ra vào cơ sở 6 chữ số (cấp khi nhận bàn giao, tạm khóa khi nợ quá hạn); không có API sửa hồ sơ.
