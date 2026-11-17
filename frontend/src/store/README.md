# store

Tầng **lưu trạng thái phía trình duyệt** (tầng nền). Chứa dữ liệu của khách cần sống qua các lần chuyển trang / đăng nhập mà chưa (hoặc không) lưu ở backend: **giỏ hàng thuê kho** và **bản nháp đặt kho** của khách chưa đăng nhập. Dữ liệu nằm trong localStorage / sessionStorage; giỏ hàng đồng bộ giữa các component và tab bằng sự kiện.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [cart.js](./cart.js) | Giỏ hàng (tối đa 10 kho, mỗi lần đặt ≤ 5 kho cùng cơ sở), hook `useCart`, trả kho về giỏ khi hủy cọc / hủy VNPay, hủy đơn đang giữ chỗ, lưu đơn đặt từ giỏ | `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/payment/PaymentResultPage.jsx` | `POST /api/reservation-cancellations/{id}` |
| [bookingDraft.js](./bookingDraft.js) | Bản nháp đặt kho của khách chưa đăng nhập (sống 24 giờ) + đọc / gắn `?next=` an toàn | `src/App.jsx` | Không |

## Các hàm / component chính

**cart.js**
- `CART_LIMIT` (10), `CHECKOUT_LIMIT` (5).
- `getCart()`, `isInCart(facilityId, unitId)`, `addToCart(facility, unit)` → `{ ok, reason }`.
- `removeFromCart`, `removeManyFromCart(keys)`, `clearCart()`.
- `useCart()` — hook trả danh sách giỏ, tự cập nhật (sự kiện `storespace-cart-changed` + `storage`).
- `toCartItem`, `restoreToCart(items)` — trả kho về giỏ.
- `rememberVnPayCartItems(items)`, `takeVnPayCartItems()` — nhớ kho đang thanh toán VNPay (sessionStorage).
- `cancelHeldReservations(ids, reason)` — hủy các đơn chờ cọc, trả số đơn hủy được.
- `saveCartOrder`, `getCartOrders`, `newOrderCode()` ("GH-yyMMdd-HHmmss").

**bookingDraft.js**
- `loadBookingDraft()`, `saveBookingDraft(partial)`, `clearBookingDraft()`.
- `draftMatchesUnit(draft, facilityId, unitId)`.
- `getSafeNextPath(search)` — chỉ chấp nhận đường dẫn nội bộ; `withNext(path, next)`.

## Kết nối với các phần khác

- **Import từ:** `src/api/api.js` (`apiPost`, trong `cart.js`); `react`.
- **Được import bởi:** `src/App.jsx` (thêm vào giỏ, badge giỏ, bản nháp khi chưa đăng nhập), `src/pages/customer/CartPage.jsx` (thanh toán giỏ), `src/pages/payment/PaymentResultPage.jsx` (trả kho về giỏ khi giao dịch hủy).
- **Key lưu trữ:** localStorage `storespace_cart`, `storespace_cart_orders`, `storespace_booking_draft`; sessionStorage `storespace_vnpay_cart_items`.

## Luồng hoạt động

1. **Thêm vào giỏ:** Khách bấm "Thêm vào giỏ" ở trang cơ sở (`App.jsx`) → `addToCart()` → lưu localStorage + phát sự kiện → `useCart()` cập nhật badge header và `CartPage`.
2. **Thanh toán giỏ / hủy:** `CartPage` tạo đơn giữ chỗ → `rememberVnPayCartItems()` → VNPay; khách hủy giao dịch → `PaymentResultPage` gọi `cancelHeldReservations()` (`POST /api/reservation-cancellations/{id}`) + `restoreToCart(takeVnPayCartItems())` → kho quay lại giỏ.
3. **Đặt kho khi chưa đăng nhập:** Bấm "Đặt kho" → `saveBookingDraft({ facilityId, unitId, path, ... })` → chuyển `withNext('/login', path)` → đăng nhập xong → `getSafeNextPath()` + `loadBookingDraft()` → quay lại trang đặt kho, điền sẵn form → đặt xong `clearBookingDraft()`.
