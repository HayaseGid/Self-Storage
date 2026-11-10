# Đợt 1 — sửa lỗi theo tài liệu "Chức năng còn thiếu"

## Cần làm sau khi chép code

1. **SQL Server**: chạy `database/Migrations/20261110_KhungGioVaCachNhanKho.sql` (thêm cột `Reservation.HandoverMethod`).
   DB tạo mới từ `SelfStorageDB_test.sql` đã có sẵn cột này. File `SelfStorageDB_test_cua_Bao.sql` CHƯA có cột, nếu dùng file đó thì chạy thêm migration.
2. **Postgres (Neon)**: không cần làm gì, lúc khởi động backend tự thêm cột (`DatabaseSeeder.EnsureHandoverMethodColumn`).
3. Không có bảng mới: OTP dùng 2 bảng có sẵn `PendingRegistration` và `EmailVerificationCode`.

## 5.1 OTP đăng ký — tạo và kiểm tra ở backend

| API | Việc |
|---|---|
| `POST /api/auth/register/start` `{ fullName, email, password, phoneNumber }` | Kiểm tra dữ liệu, lưu `PendingRegistration` (mật khẩu đã băm), tạo mã 6 số, lưu SHA-256 vào `EmailVerificationCode`, gửi Gmail |
| `POST /api/auth/register/resend` `{ email }` | Mã cũ đóng `Replaced`, gửi mã mới (cách nhau ≥ 60 giây) |
| `POST /api/auth/register/verify` `{ email, otp }` | Hết hạn 5 phút, sai tối đa 5 lần; đúng mã thì tạo tài khoản khách và xóa `PendingRegistration` |

- Trình duyệt không còn biết mã OTP và không lưu mật khẩu trong sessionStorage.
- `POST /api/auth/register` không còn nhận vai trò Storage Customer (phải qua OTP).
- `POST /api/email/send-otp` đã bỏ. `send-contract` chỉ gửi về email của người đang đăng nhập. `test` chỉ chạy ở Development.

## 4.1 Khung giờ nhận kho + cách nhận kho

- Lúc đặt kho (Giỏ kho và trang Đặt kho), khách chọn **Nhận trực tiếp** hoặc **Bàn giao online**.
  - Trực tiếp: chọn 1 trong 4 khung `08–10`, `10–12`, `12–14`, `14–16`. Lưu giờ bắt đầu khung vào `AppointmentTime`.
  - Online: không hẹn giờ (`AppointmentTime = NULL`). Khách được báo trước: mã truy cập hiện trong tài khoản, chìa khóa nhận ở quầy lễ tân.
- Phân công: mỗi nhân viên nhận tối đa 1 đơn / khung (4 đơn / ngày) thay vì 1 đơn / ngày như trước. Đơn online không gây trùng giờ.
- Nhân viên được tự phân công nhận **email** gồm mã đơn, kho, khung giờ / online và SĐT + email khách. Mục "Việc được giao" hiện khung giờ và liên hệ khách.
- Bàn giao online xong, khách nhận email "xem mã trong tài khoản, nhận chìa ở lễ tân" (email không ghi mã).
- Tiền thuê vẫn theo luật cũ: không phải điều kiện bàn giao (mục 7.2 không làm).

## 4.2 Job hằng ngày chốt kỳ thuê cũ sau gia hạn

- `RenewalSettleJob` (BackgroundService) chạy lúc khởi động và mỗi ngày 00:30 giờ VN.
- Logic chốt chuyển sang `RenewalTermSettler`, dùng chung cho job và trang gia hạn của khách (hành vi cũ giữ nguyên).
- Job dùng ngày thật, không theo Demo Clock. Đây là khung job để thêm nhắc tiền / khóa quyền ở nhóm 1.

## Chưa kiểm tra được ở đây

Backend chưa biên dịch / chạy (máy không có .NET). Frontend đã build thành công. Nên thử:
1. Đăng ký: nhận mail OTP, nhập sai 5 lần, gửi lại trước 60 giây, nhập đúng → đăng nhập được.
2. Đặt 3 đơn cùng ngày, cùng khung 08–10 với 2 nhân viên → đơn thứ 3 chưa phân công; đổi sang khung 10–12 → được phân công.
3. Đặt 1 đơn online → Staff bàn giao → khách nhận email.
4. Gia hạn 1 hợp đồng, tua ngày qua ngày kết thúc kỳ cũ, khởi động lại backend → đơn cũ chuyển Completed mà không cần mở trang gia hạn.
