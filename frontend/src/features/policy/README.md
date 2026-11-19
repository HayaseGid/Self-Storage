# policy

Trang **"Về StoreSpace"** (đường dẫn `/about`, mục "Về StoreSpace" trên menu máy tính và menu điện thoại): giới thiệu ngắn và
**toàn bộ chính sách chung** cho khách đọc — đặt kho & giữ chỗ, tiền cọc, thanh toán, phí quá hạn, hủy đặt chỗ, nhận kho,
gia hạn, trả kho, trả kho sớm, liên hệ.

Các con số (số tháng cọc, phút giữ chỗ, mức phí trễ, mức hoàn cọc khi hủy, số ngày báo trước, phí trả kho...) **không viết cứng**:
lấy từ chính sách hiện hành do Business Operations Manager chỉnh (`GET /api/policies` qua `usePolicies`). BOM lưu chính sách mới
(trang Chính sách) thì trang này tự hiện số mới; có bản hẹn ngày thì trang báo "sắp áp dụng".

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [PolicyGuide.jsx](./PolicyGuide.jsx) | Nội dung trang: mục lục + 10 mục chính sách, bảng thông số dựng bằng `describePolicy` | `src/App.jsx › AboutPage` | `GET /api/policies` (qua `usePolicies`, không cần đăng nhập) |
| [PolicyGuide.css](./PolicyGuide.css) | Giao diện trang (`pg-*`) | `PolicyGuide.jsx` | — |

## Kết nối với các phần khác
- Import: `services/policies` (`usePolicies`, `describePolicy`, `fmtDay`), `services/storageRules` (`RENTAL_TERMS`, `MAX_ADVANCE_BOOKING_DAYS`).
- Dòng "Trả kho sớm" trong nhóm "Gia hạn & trả kho" nằm ở `services/policies › describePolicy` nên cũng hiện trong điều khoản hợp đồng và trang Chính sách của BOM.

## Luồng hoạt động
1. Người dùng bấm "Về StoreSpace" (header) hoặc "Xem toàn bộ chính sách thuê kho →" ở khối About trang chủ → `navigate('/about')`.
2. `getRoute` trả `{ type: 'about' }` → `AboutPage` (SiteHeader + `PolicyGuide` + SiteFooter).
3. `usePolicies` tải chính sách (dùng cache chung) → các mục hiển thị theo số liệu hiện hành.
