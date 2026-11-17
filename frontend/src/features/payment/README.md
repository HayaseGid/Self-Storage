# payment

Folder `src/features/payment` chứa các phần giao diện **thanh toán phía khách hàng**: khung **xác nhận đặt cọc** đặt trước nút thanh toán, **thanh nhắc đơn chưa đặt cọc** có đồng hồ đếm ngược, và trang **"Thanh toán & Hóa đơn"** (cọc giữ kho, tiền thuê định kỳ, phí trễ hạn, lịch sử giao dịch, hoàn cọc). Đây là tầng *feature* của frontend; việc chuyển sang cổng VNPay do `src/api/vnpay.js` đảm nhận.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [DepositConfirm.jsx](./DepositConfirm.jsx) | Khung "Xác nhận đặt cọc": tóm tắt thông tin, các dòng tiền, tổng cần trả và 2 ô tick bắt buộc | `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/features/contract/ContractRenewal.jsx` | Gián tiếp `GET /api/policies` (usePolicies, có cache) |
| [DepositConfirm.css](./DepositConfirm.css) | Giao diện cho `DepositConfirm.jsx` (class `dc-*`) | `DepositConfirm.jsx` | — |
| [PendingPayments.jsx](./PendingPayments.jsx) | Thanh nhắc đơn chưa đặt cọc + trang "Thanh toán & Hóa đơn" + các hàm thời gian dùng chung | `src/pages/customer/CustomerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx` | `POST /api/vnpay/create` (qua `startVnPayPayment`), `GET /api/late-fees/mine` (qua `useLateFees`), `/api/reservation-cancellations/...` (qua `CancelReservationModal`, `retryRefund`) |
| [PendingPayments.css](./PendingPayments.css) | Giao diện cho thanh nhắc (`pd-*`) và trang thanh toán (`cp-*`) | `PendingPayments.jsx` | — |

## Các hàm / component chính

**DepositConfirm.jsx**
- `DepositConfirm` (default): khung xác nhận; nhận `rows`, `lines`, `amount`, `onChange(agreed)`, và `infoText` / `policyText` / `hint` để đổi chữ (dùng cho gia hạn). Hàm con `toggle` báo cha khi đủ 2 ô.

**PendingPayments.jsx**
- `parseUtc(value)`: đọc giờ UTC từ backend (tự thêm "Z").
- `fmtLeft(ms)`: định dạng thời gian còn lại ("mm:ss" / "H giờ mm phút").
- `useNow(intervalMs, enabled)`: hook thời điểm hiện tại, tự cập nhật (đồng hồ đếm ngược).
- `pendingDepositsOf(rentals, now)`: lọc đơn `Pending Deposit` còn hạn giữ kho, sắp theo hạn sớm nhất.
- `usePendingDeposits(rentals)`: hook trả `{ list, now }`.
- `PendingDepositBar`: thanh nhắc đơn chưa đặt cọc (variant `header` / `inline`), đỏ khi còn dưới 5 phút.
- `CustomerPaymentCenter`: trang "Thanh toán & Hóa đơn"; hàm con `payWithVnPay` (cọc / gia hạn), `payRentBill` (tiền thuê + phí trễ), `retry` (gửi lại hoàn tiền), `lateFeeOf`, `lateUnpaidOf`.
- Hàm nội bộ: `money`, `fmtTime`, `fmtDate`, `abandonedNote`, `unitsOf`, `historyStatus`.

## Kết nối với các phần khác

- **Folder này import từ:**
  - `src/api/vnpay` (`startVnPayPayment`), `src/api/lateFees` (`useLateFees`, `lateFeePolicyText`).
  - `src/services/policies` (`describePolicy`, `usePolicies`), `src/services/storageRules` (`formatVnd`, `formatReservationCode`).
  - `src/components/common/Dialog` (`useDialog`), `src/components/common/listKit` (`Code`, `NewBadge`, `Pager`, `rowClass`, `useClientPaging`).
  - `src/features/contract/ContractRenewal` (`fmtIsoDate`), `src/features/booking/CancelReservation` (`CancelReservationModal`, `retryRefund`).
- **Ai import folder này:**
  - `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/features/contract/ContractRenewal.jsx`: `DepositConfirm`.
  - `src/pages/customer/CustomerAccount.jsx`: `CustomerPaymentCenter`, `PendingDepositBar`, `pendingDepositsOf`.
  - `src/features/notification/HeaderNotificationBell.jsx`: `PendingDepositBar`, `fmtLeft`, `usePendingDeposits`.

## Luồng hoạt động

**1. Xác nhận và thanh toán tiền cọc khi đặt kho**
1. Trang Đặt kho / Giỏ kho hiện `DepositConfirm` với thông tin kho và số tiền cọc.
2. Khách tick đủ 2 ô → `toggle()` → `onChange(true)` → trang cha mở nút thanh toán.
3. Bấm thanh toán → trang cha gọi `startVnPayPayment()` → `POST /api/vnpay/create` → chuyển sang VNPay → quay về `/payment-result`.

**2. Nhắc và hoàn tất đơn chưa đặt cọc**
1. `usePendingDeposits()` lọc đơn `Pending Deposit` còn hạn giữ kho; `PendingDepositBar` hiện dưới header (qua `HeaderNotificationBell`) và trong trang tài khoản, đếm ngược mỗi giây.
2. Bấm "Xem & thanh toán" → mở mục Thanh toán (`CustomerPaymentCenter`).
3. Bấm "Thanh toán qua VNPay" / "Thanh toán tất cả" → `payWithVnPay()` → `POST /api/vnpay/create` (kind `deposit` hoặc `renewal`). Hoặc bấm "Hủy đặt chỗ" → `CancelReservationModal`.

**3. Đóng tiền thuê định kỳ và phí trễ hạn**
1. `useLateFees()` gọi `GET /api/late-fees/mine`; trang liệt kê hợp đồng có `rentPayableNow > 0` hoặc phí trễ chưa đóng.
2. Bấm "Đóng ..." → `payRentBill()` → dialog xác nhận số tiền (tiền thuê + phí trễ).
3. Đồng ý → `startVnPayPayment([id], { kind: 'rent' })` → `POST /api/vnpay/create` → chuyển sang VNPay.
