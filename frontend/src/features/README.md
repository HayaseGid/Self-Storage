# features

Các **khối nghiệp vụ dùng lại** ở nhiều trang / nhiều vai trò. Mỗi folder gom code của 1 nghiệp vụ
(giao diện + logic riêng của nghiệp vụ đó). Trang trong `pages/` và `App.jsx` ghép các khối này lại.

| Folder | Nghiệp vụ | Được dùng chủ yếu ở | README |
|---|---|---|---|
| [unit/](./unit/) | Nhận diện loại kho & ảnh kho, cửa sổ xem kho 3D, tự xếp thùng, gợi ý kho vừa với đồ, khối nhập đồ | `App.jsx` (tìm kho, chi tiết kho), `CartPage`, trang quản lý | [README](./unit/README.md) |
| [facility/](./facility/) | Bản đồ cơ sở (Leaflet), sơ đồ kho trong cơ sở | `App.jsx` (danh sách / chi tiết cơ sở) | [README](./facility/README.md) |
| [booking/](./booking/) | Chọn cách nhận kho (trực tiếp / online), hủy đặt kho & hoàn cọc | `App.jsx` (đặt kho), `CartPage`, `CustomerAccount` | [README](./booking/README.md) |
| [payment/](./payment/) | Xác nhận đặt cọc, trung tâm thanh toán (cọc, tiền thuê, phí trễ) | `App.jsx`, `CartPage`, `CustomerAccount` | [README](./payment/README.md) |
| [contract/](./contract/) | Văn bản hợp đồng, luồng ký tay, chi tiết hợp đồng, gia hạn | `CustomerAccount`, trang staff / manager | [README](./contract/README.md) |
| [return/](./return/) | Trả kho, kiểm kho (khách đặt lịch → staff kiểm → manager duyệt → khách xác nhận) | `CustomerAccount`, `FacilityStaffAccount`, `FacilityManagerAccount` | [README](./return/README.md) |
| [policy/](./policy/) | Trang "Về StoreSpace": trình bày toàn bộ chính sách chung cho khách, số liệu đọc từ chính sách BOM | `App.jsx › AboutPage` (đường dẫn `/about`) | [README](./policy/README.md) |
| [support/](./support/) | Liên hệ hỗ trợ: khách gửi tin nhắn, backend gửi email (Brevo) tới storespacevn101@gmail.com | `CustomerAccount` (mục "Liên hệ") | [README](./support/README.md) |
| [notification/](./notification/) | Thông báo khách hàng, chuông thông báo trên header | `App.jsx` (header), `CustomerAccount` | [README](./notification/README.md) |

## Quy ước

- Feature được import bởi `pages/*` hoặc `App.jsx`; feature có thể import `components/common`, `services`, `api`,
  `store`, `utils`, `hooks`, `mappers` — **không** import `pages/`.
- Feature có thể dùng lẫn nhau khi cần (vd `unit/` dùng `utils/packing.js`; `payment/` dùng `api/vnpay.js`).
