# booking

Folder `src/features/booking` chứa các phần giao diện **quanh việc đặt kho** của khách: chọn **cách nhận kho** (trực tiếp theo khung giờ hoặc bàn giao online) khi đặt, và **hủy đặt kho + hoàn cọc** theo chính sách. Đây là tầng *feature* của frontend: các component được trang Đặt kho (`src/App.jsx`), Giỏ kho (`src/pages/customer/CartPage.jsx`), trang tài khoản khách và trung tâm thanh toán ghép vào.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [HandoverChoice.jsx](./HandoverChoice.jsx) | Chọn cách nhận kho (InPerson / Online) + 4 khung giờ nhận kho; hằng số và hàm kiểm tra lựa chọn | `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/features/contract/ContractCard.jsx` (chỉ `ONLINE_HANDOVER_NOTE`) | Không gọi API (trang cha gửi giá trị khi tạo đơn) |
| [HandoverChoice.css](./HandoverChoice.css) | Giao diện cho `HandoverChoice.jsx` (khung giờ, lưu ý online) | `HandoverChoice.jsx` | — |
| [CancelReservation.jsx](./CancelReservation.jsx) | Hộp thoại hủy đặt kho: báo giá hoàn cọc, bảng mức hoàn, chọn lý do, xác nhận hủy; hàm gửi lại yêu cầu hoàn tiền | `src/pages/customer/CustomerAccount.jsx`, `src/features/payment/PendingPayments.jsx` | `GET /api/reservation-cancellations/{id}/quote`, `POST /api/reservation-cancellations/{id}`, `POST /api/reservation-cancellations/{id}/refund-retry` |
| [CancelReservation.css](./CancelReservation.css) | Giao diện cho hộp thoại hủy (class `cr-*`) | `CancelReservation.jsx` (và các nút `cr-link-btn` ở `ContractDetailModal`, `CustomerAccount`) | — |

## Các hàm / component chính

**HandoverChoice.jsx**
- `HandoverChoice` (default): 2 thẻ chọn cách nhận kho; chọn trực tiếp thì hiện 4 nút khung giờ (khung đã qua hôm nay bị khóa), chọn online thì hiện lưu ý.
- `HANDOVER_METHODS`: `{ InPerson, Online }` — giá trị khớp backend.
- `MOVE_IN_SLOTS`: 4 khung giờ `08:00`, `10:00`, `12:00`, `14:00` (mỗi khung 2 tiếng, có `endHour`).
- `ONLINE_HANDOVER_NOTE`: câu hướng dẫn nhận kho online (mã truy cập trong tài khoản, chìa ở lễ tân).
- `slotLabel(value)`: "08:00" → "08:00 – 10:00".
- `isSlotPast(slot, startDate)`: khung giờ đã qua chưa (nếu ngày nhận là hôm nay).
- `handoverChoiceError(method, slot, startDate)`: trả câu lỗi hoặc `null` — gọi trước khi đặt.

**CancelReservation.jsx**
- `CancelReservationModal` (default): hộp thoại hủy; hàm con `load` (tải báo giá), `submit` (xác nhận & hủy).
- `tierLabel(tiers, index)`: nhãn cho 1 mức hoàn cọc ("Hủy trước 3–6 ngày"...).
- `retryRefund(dialog, reservationId)`: gửi lại yêu cầu hoàn tiền khi lần hoàn qua VNPay trước bị lỗi.
- `REASONS`: danh sách lý do hủy.

## Kết nối với các phần khác

- **Folder này import từ:** `src/api/api` (`apiGet`, `apiPost`), `src/components/common/Dialog` (`useDialog`), `src/services/storageRules` (`formatVnd`), `src/features/contract/ContractSignFlow.css` (khung hộp thoại `csf-*`).
- **Ai import folder này:**
  - `src/App.jsx` và `src/pages/customer/CartPage.jsx`: `HandoverChoice`, `HANDOVER_METHODS`, `ONLINE_HANDOVER_NOTE`, `handoverChoiceError`, `slotLabel`.
  - `src/features/contract/ContractCard.jsx`: `ONLINE_HANDOVER_NOTE`.
  - `src/pages/customer/CustomerAccount.jsx`: `CancelReservationModal`, `retryRefund`.
  - `src/features/payment/PendingPayments.jsx`: `CancelReservationModal`, `retryRefund`.

## Luồng hoạt động

**1. Chọn cách nhận kho khi đặt**
1. Ở trang Đặt kho / Giỏ kho, khách bấm "Nhận trực tiếp" hoặc "Bàn giao online" → `onMethodChange` → trang cha lưu state.
2. Nếu nhận trực tiếp: bấm 1 khung giờ → `onSlotChange` (khung đã qua bị khóa nhờ `isSlotPast`).
3. Khi bấm đặt, trang cha gọi `handoverChoiceError()`; có lỗi thì báo, không thì gửi `handoverMethod` + `appointmentSlot` khi tạo đơn; backend (ReservationService) kiểm tra lại.

**2. Hủy đặt kho và hoàn cọc**
1. Khách bấm "Hủy đặt kho" (tab Hợp đồng / ContractDetailModal) hoặc "Hủy đặt chỗ" (trang Thanh toán) → mở `CancelReservationModal`.
2. `load()` → `GET /api/reservation-cancellations/{id}/quote` → hiện số ngày còn lại, tiền cọc, % và số tiền được hoàn, bảng mức hoàn.
3. Chọn lý do + tick đồng ý → bấm "Hủy & hoàn ..." → dialog xác nhận → `POST /api/reservation-cancellations/{id}` với `{ reason, expectedRefund }`.
4. Thành công → `onDone(result)` (cha tải lại) → dialog báo kết quả; nếu số tiền đã thay đổi, backend trả báo giá mới và khách phải tick lại.

**3. Gửi lại yêu cầu hoàn tiền**
1. Ở lịch sử giao dịch trang Thanh toán, khoản hoàn còn "Pending" có nút "Gửi lại yêu cầu hoàn tiền".
2. Bấm → `retryRefund()` → `POST /api/reservation-cancellations/{id}/refund-retry` → dialog báo đã hoàn / chưa hoàn được.
