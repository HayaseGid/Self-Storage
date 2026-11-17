# payment

Folder này chứa **trang kết quả thanh toán VNPay** (`/payment-result`) và thuộc tầng **pages** (màn hình) của frontend.
Sau khi khách trả tiền trên cổng VNPay, VNPay chuyển trình duyệt về trang này kèm các tham số `vnp_...` trên URL.
Trang gửi các tham số đó cho backend kiểm tra chữ ký, ghi nhận giao dịch, rồi cho khách đi tiếp tùy loại khoản thu:
tiền cọc, gia hạn, tiền thuê hoặc phí phát sinh khi trả kho.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [PaymentResultPage.jsx](./PaymentResultPage.jsx) | Trang kết quả thanh toán VNPay: xác minh giao dịch, báo kết quả, chuyển sang tab Hợp đồng hoặc trả kho về giỏ | `src/App.jsx` (route `/payment-result`) | `GET /api/vnpay/return-verify?vnp_...`, `POST /api/contract-renewals/{reservationId}/finalize`, `POST /api/reservation-cancellations/{id}` (gọi gián tiếp qua `store/cart`) |
| [PaymentResultPage.css](./PaymentResultPage.css) | Giao diện của PaymentResultPage.jsx (thẻ kết quả, vòng xoay chờ, icon) | `PaymentResultPage.jsx` | — |

## Các hàm / component chính

**PaymentResultPage.jsx**
- `PaymentResultPage({ navigate })` (export default): component trang. Khi mở trang, nó tự xác minh giao dịch đúng 1 lần (dùng `useRef started` để không gọi 2 lần trong StrictMode).
- `releaseHeld()`: hủy các đơn đang giữ kho, trả kho về giỏ, xóa giao dịch chờ trong sessionStorage. Hàm chạy khi VNPay trả mã 24 (khách bấm Hủy) hoặc khi khách bấm nút "Hủy đặt kho".
- `useEffect` chạy 1 lần: gọi `GET /api/vnpay/return-verify`, rồi xử lý lần lượt theo thứ tự: tiền thuê → gia hạn → phí → tiền cọc.

## Kết nối với các phần khác

- **Import từ:**
  - `src/api/api`: `apiGet`, `apiPost`
  - `src/api/vnpay`: `readPendingVnPay`, `clearPendingVnPay` (giao dịch chờ lưu trong sessionStorage trước khi chuyển sang VNPay)
  - `src/components/common/Dialog`: `useDialog`
  - `src/services/afterDeposit`: `announceDepositSuccess`, `announceRenewalSuccess`, `openCustomerSection`, `requestContractSign`
  - `src/services/storageRules`: `formatVnd`
  - `src/store/cart`: `cancelHeldReservations`, `restoreToCart`, `takeVnPayCartItems`
- **Được import bởi:** `src/App.jsx`.

## Luồng hoạt động

1. **Đặt cọc thành công:** VNPay chuyển về `/payment-result?vnp_...` → `useEffect` → `GET /api/vnpay/return-verify` → `result.success` → `clearPendingVnPay()` → hộp thoại "Đặt cọc thành công" (`announceDepositSuccess`) → `openCustomerSection(navigate, 'contract')` mở tab Hợp đồng để khách ký.
2. **Khách hủy trên VNPay (mã 24):** `return-verify` trả `success = false` và `vnp_ResponseCode = 24` → `releaseHeld()` → `cancelHeldReservations` (`POST /api/reservation-cancellations/{id}`) → `restoreToCart` → trang hiện "Đã hủy thanh toán" kèm nút "Về giỏ hàng".
3. **Gia hạn hợp đồng:** `return-verify` trả `kind = 'renewal'` → `POST /api/contract-renewals/{reservationId}/finalize` → `announceRenewalSuccess` → `requestContractSign(contractId)` → mở tab Hợp đồng để ký phụ lục. Nếu bước finalize lỗi thì báo "Đã nhận thanh toán", và hệ thống sẽ tự hoàn tất khi khách mở trang Hợp đồng.
