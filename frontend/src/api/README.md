# api

Tầng **gọi HTTP** của frontend (tầng nền, dùng chung). Đây là nơi duy nhất frontend gọi `fetch()` tới backend ASP.NET Core: `api.js` là HTTP client lõi (gắn token, header ngày giả lập, timeout, đổi lỗi thành câu tiếng Việt); các file còn lại gói từng nhóm nghiệp vụ (VNPay, OTP đăng ký, email hợp đồng, phí trễ hạn, danh mục kho) thành hàm gọn để trang / feature dùng.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [api.js](./api.js) | HTTP client lõi: `apiRequest`, `apiGet/apiPost/apiPut/apiDelete`, lớp `ApiError`; gắn `Authorization: Bearer` / `X-User-Email`, `X-Simulated-Date`, timeout 20s; 401 `TOKEN_INVALID` -> xóa phiên, về `/login` | `src/App.jsx`, các file khác trong `src/api`, `src/services/afterDeposit.js`, `src/services/policies.js`, `src/store/cart.js`, `src/components/common/listKit.jsx`, hầu hết `src/pages/*` và `src/features/*` | Bất kỳ đường dẫn nào được truyền vào |
| [contractEmail.js](./contractEmail.js) | Dựng HTML hợp đồng và nhờ backend gửi email cho khách | `src/features/contract/ContractDetailModal.jsx`, `src/pages/customer/CustomerAccount.jsx` | `POST /api/email/send-contract` |
| [lateFees.js](./lateFees.js) | Hook tải phí trễ hạn của khách, đóng phí mô phỏng, câu mô tả chính sách phí trễ | `src/pages/customer/CustomerAccount.jsx`, `src/features/payment/PendingPayments.jsx`, `src/features/contract/ContractCard.jsx` | `GET /api/late-fees/mine`, `POST /api/late-fees/{id}/pay-demo` |
| [otpService.js](./otpService.js) | Đăng ký tài khoản bằng OTP email (bắt đầu, gửi lại, xác nhận) | `src/App.jsx` | `POST /api/auth/register/start`, `/resend`, `/verify` |
| [vnpay.js](./vnpay.js) | Tạo giao dịch VNPay rồi chuyển trang; lưu / đọc / xóa giao dịch chờ trong sessionStorage | `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/payment/PaymentResultPage.jsx`, `src/features/payment/PendingPayments.jsx`, `src/features/contract/ContractRenewal.jsx`, `src/features/return/UnitReturn.jsx` | `POST /api/vnpay/create` |

## Các hàm / component chính

**api.js**
- `apiRequest(path, { method, body, headers, timeout })` — hàm lõi gửi request, trả JSON hoặc ném `ApiError`.
- `apiGet(path)`, `apiPost(path, body)`, `apiPut(path, body)`, `apiDelete(path)` — 4 hàm tắt.
- `ApiError` — lỗi có `message` tiếng Việt, `status`, `code` (`NETWORK`, `TIMEOUT`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`, `SERVER`, `HTTP`), `data`.
- Nội bộ: `getCurrentUser`, `getErrorMessage`, `translateValidationMessage`, `codeForStatus`.

**contractEmail.js**
- `buildContractEmailHtml({ group, customer, facilityAddress, signature, policies })` — trả chuỗi HTML hợp đồng.
- `sendContractEmail(...)` — gửi email, trả `{ sentTo }`.

**lateFees.js**
- `useLateFees(enabled)` — hook trả `{ loading, policy, items, error, reload, byReservation }`.
- `payLateFeesDemo(reservationId)` — đóng phí mô phỏng.
- `lateFeePolicyText(policy)` — câu mô tả chính sách.

**otpService.js**
- `startRegistration(data)`, `resendRegistrationOtp(email)`, `verifyRegistrationOtp(email, otp)`.

**vnpay.js**
- `startVnPayPayment(reservationIds, { amount, count, label, kind })` — tạo giao dịch + chuyển sang VNPay.
- `readPendingVnPay()`, `clearPendingVnPay()` — đọc / xóa giao dịch chờ.
- `SIMULATED_PAYMENT_ENABLED`, `VNPAY_PENDING_KEY`, `PAYMENT_RESULT_PATH`.

## Kết nối với các phần khác

- **Import từ:** `src/demoClock/demoClock.js` (header ngày giả lập, trong `api.js`); `src/services/policies.js`, `src/services/storageRules.js`, `src/features/contract/ContractDocument.jsx` (trong `contractEmail.js`).
- **Được import bởi:** gần như toàn bộ frontend — `src/App.jsx`, `src/pages/*` (customer, manager, staff, business, admin, payment), `src/features/*` (booking, contract, facility, payment, return), và các tầng nền `src/services`, `src/store`, `src/components/common/listKit.jsx`.

## Luồng hoạt động

1. **Một request bất kỳ:** Component gọi `apiGet('/api/...')` → `apiRequest()` đọc phiên từ localStorage `storespace_current_user`, gắn `Authorization: Bearer <JWT>` + `X-Simulated-Date` → `fetch(VITE_API_URL + path)` → backend trả JSON → parse → trả data; lỗi → ném `ApiError` có câu tiếng Việt → component hiển thị (thường qua `useDialog().alert`).
2. **Thanh toán VNPay:** Khách bấm "Thanh toán" → `startVnPayPayment(ids)` → `POST /api/vnpay/create` → lưu giao dịch chờ vào sessionStorage → chuyển sang VNPay → VNPay trả về `/payment-result` → `PaymentResultPage` gọi `/api/vnpay/return-verify`, đọc `readPendingVnPay()` rồi `clearPendingVnPay()`.
3. **Đăng ký tài khoản:** Điền form → `startRegistration()` → backend gửi OTP → nhập mã → `verifyRegistrationOtp()` → tạo tài khoản (có `resendRegistrationOtp()` sau 60 giây).
