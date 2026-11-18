# support

Khối nghiệp vụ **Liên hệ hỗ trợ**: khách đang đăng nhập gửi tin nhắn cho bộ phận hỗ trợ ngay trên trang tài khoản.
Tin nhắn đi qua backend và được gửi bằng email (Brevo) tới hộp thư **storespacevn101@gmail.com**; email có Reply-To
là email của khách nên bộ phận hỗ trợ trả lời thẳng cho khách từ Gmail. Không còn dùng EmailJS.

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [ContactSupport.jsx](./ContactSupport.jsx) | Trang "Liên hệ": chọn chủ đề, nhập nội dung, gửi; hiện kết quả đã gửi / lỗi; khung thông tin liên hệ | `src/pages/customer/CustomerAccount.jsx` (mục "Liên hệ" ở menu trái) | `POST /api/support/contact` |
| [ContactSupport.css](./ContactSupport.css) | Giao diện trang Liên hệ (`cs-*`) | `ContactSupport.jsx` | — |

## Các hàm / component chính
- `ContactSupport({ user })` (export default): form gửi tin nhắn. `submit()` kiểm tra nội dung ≥ 5 ký tự rồi gọi API.
- `SUPPORT_EMAIL`: hộp thư hỗ trợ (dùng cho liên kết gửi email trực tiếp).
- `TOPICS`: chủ đề gợi ý, gửi làm tiêu đề email.

## Kết nối với các phần khác
- Import: `src/api/api.js` (`apiPost`).
- Được import bởi: `src/pages/customer/CustomerAccount.jsx` (`activeSection === 'contact'`).
- Menu điện thoại trên header (`App.jsx › SiteHeader`, mục "Liên hệ"): khách đã đăng nhập → mở thẳng trang này
  (`openCustomerSection(navigate, 'contact')`); chưa đăng nhập → mở ứng dụng email gửi tới storespacevn101@gmail.com.

## Luồng hoạt động
1. Khách bấm **Liên hệ** (menu trái trang tài khoản, nhóm "Hỗ trợ") → `CustomerDashboard` đặt `activeSection = 'contact'` → hiện `ContactSupport`.
2. Chọn chủ đề → nhập nội dung → bấm **Gửi tin nhắn** → `submit()` → `POST /api/support/contact` `{ subject, message }`.
3. Backend `SupportController.Contact`: lấy email người đang đăng nhập (JWT), chặn gửi dồn (1 tin / 30 giây), lấy họ tên →
   `EmailService.SendSupportMessageAsync` → Brevo API (`https://api.brevo.com/v3/smtp/email`) gửi tới
   `BrevoSettings:SupportInboxEmail` (mặc định storespacevn101@gmail.com), Reply-To = email khách.
4. Thành công: xóa ô nhập, hiện "✓ Đã gửi tin nhắn…". Lỗi (chưa đăng nhập, gửi dồn, lỗi máy chủ email): hiện câu lỗi.
5. Lịch sử email gửi đi xem ở Brevo: **Transactional → Email → Logs** (https://app.brevo.com/).
