# Hướng dẫn chạy thanh toán VNPay (sandbox)

Sandbox là môi trường thử nghiệm của VNPay: **miễn phí, không trừ tiền thật, không cần hủy sau khi dùng**.
Code đã có sẵn (`backend/Controllers/VnPayController.cs`), chỉ cần lấy mã và cấu hình trên máy.

---

## Bước 1. Đăng ký tài khoản sandbox (5 phút)

1. Mở **https://sandbox.vnpayment.vn/devreg/** và điền form:
   - Tên website: `StoreSpace`
   - Địa chỉ website: `http://localhost:8080` (cổng frontend bạn đang chạy)
   - Email: email của bạn (VNPay gửi mã về đây)
2. Mở email từ VNPay, lấy 2 giá trị:
   - **vnp_TmnCode** (Mã website, 8 ký tự), ví dụ `2QXUI4B4`
   - **vnp_HashSecret** (Chuỗi bí mật), một chuỗi dài chữ hoa
   Email cũng có tài khoản đăng nhập trang quản trị sandbox (xem lịch sử giao dịch).

> ⚠️ HashSecret là bí mật: **không commit lên GitHub**, không gửi vào nhóm chat.

## Bước 2. Cấu hình cho backend (chọn 1 cách)

### Cách A (khuyên dùng): biến môi trường Windows, không sửa file nào trong repo
Mở **PowerShell** (hoặc CMD), chạy (thay mã của bạn):
```powershell
setx VnPay__TmnCode "MA_TMNCODE_CUA_BAN"
setx VnPay__HashSecret "CHUOI_HASHSECRET_CUA_BAN"
setx VnPay__ReturnUrl "http://localhost:8080/payment-result"
```
(Hai dấu gạch dưới `__` là đúng cú pháp của ASP.NET Core.)
Sau đó **đóng hết terminal / Visual Studio / VS Code rồi mở lại** (biến mới chỉ có ở cửa sổ mở sau khi setx).

### Cách B: sửa `backend/appsettings.Development.json`, nhớ KHÔNG commit file này
```json
{
  "Jwt": { "AllowLegacyEmailHeader": true },
  "VnPay": {
    "TmnCode": "MA_TMNCODE_CUA_BAN",
    "HashSecret": "CHUOI_HASHSECRET_CUA_BAN",
    "BaseUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    "ReturnUrl": "http://localhost:8080/payment-result"
  },
  "Logging": { "LogLevel": { "Default": "Information", "Microsoft.AspNetCore": "Warning" } }
}
```
Trước khi commit, bỏ thay đổi file này đi (GitHub Desktop: chuột phải vào file, chọn Discard changes).

## Bước 3. Chạy lại backend và kiểm tra

1. Tắt backend (Ctrl+C) rồi `dotnet run` lại.
2. Mở **http://localhost:6868/api/vnpay/status**:
   - `"configured": true` → OK, sang bước 4.
   - `"configured": false` → backend chưa đọc được mã: kiểm tra lại bước 2 (Cách A: đã mở lại terminal chưa?).

## Bước 4. Frontend dùng VNPay thật

Trong `frontend/.env` (hoặc `.env.local`) **không** để `VITE_ALLOW_SIMULATED_PAYMENT=true`
(xóa dòng đó hoặc để `false`), rồi tắt `npm run dev` và chạy lại.
Khi để `true`, mỗi lần thanh toán sẽ hỏi "Mô phỏng / Qua VNPay" (tiện để demo khi không có mạng).

## Bước 5. Thanh toán thử

1. Đặt 1 kho (hoặc giỏ hàng nhiều kho), tick xác nhận đặt cọc, bấm **Thanh toán qua VNPay**.
2. Trang VNPay mở ra: chọn **Thẻ nội địa và tài khoản ngân hàng**, chọn ngân hàng **NCB**.
3. Nhập thẻ test:

   | Trường | Giá trị |
   |---|---|
   | Số thẻ | `9704198526191432198` |
   | Tên chủ thẻ | `NGUYEN VAN A` |
   | Ngày phát hành | `07/15` |
   | OTP | `123456` |

4. VNPay chuyển về `http://localhost:8080/payment-result`, hiện **"Đặt cọc thành công"**, bấm OK để ký hợp đồng.
5. Gia hạn hợp đồng cũng thanh toán y như vậy (VNPay thu tiền thuê tháng đầu + cọc bổ sung nếu có),
   xong hiện "Gia hạn thành công, vui lòng ký phụ lục gia hạn".

**Thử trường hợp lỗi:** trên trang VNPay bấm **Hủy thanh toán** → về trang "Chưa thanh toán được · Bạn đã hủy giao dịch",
kho vẫn được giữ đến hết thời gian giữ chỗ, có nút "Thanh toán lại".

## Kiểm tra trong database (SSMS)
```sql
SELECT TOP 10 PaymentID, ReservationID, OrderCode, Provider, Amount, Status, ProviderTransactionId, ConfirmedAt
FROM Payment WHERE Provider = N'VNPay' ORDER BY PaymentID DESC;

SELECT TOP 10 CallbackID, OrderCode, ReportedStatus, ReportedAmount, SignatureValid, ProcessResult, Note, ReceivedAt
FROM PaymentCallbackLog ORDER BY CallbackID DESC;
```

## Gặp lỗi?

| Hiện tượng | Nguyên nhân / cách sửa |
|---|---|
| "Chưa cấu hình VNPay..." | Backend chưa đọc được mã, làm lại bước 2 và 3 (`/api/vnpay/status`). |
| Trang VNPay báo **"Sai chữ ký"** | HashSecret sai hoặc dính khoảng trắng; copy lại từ email. TmnCode và HashSecret phải cùng một bộ. |
| VNPay báo **website / merchant không hợp lệ hoặc chưa được phê duyệt** | TmnCode sai. |
| VNPay báo **"Giao dịch đã quá thời gian chờ"** | Quá thời gian giữ kho (link VNPay hết hạn cùng lúc). Đặt lại hoặc bấm thanh toán lại. |
| Về trang kết quả báo "Số tiền thanh toán không khớp" | Đơn bị đổi trong lúc đang trả. Xem `PaymentCallbackLog.Note`. |
| Đã trả tiền nhưng báo "hệ thống chưa ghi nhận được đơn" | Đơn đã hết giờ giữ kho trước khi VNPay báo về; giao dịch ghi `Failed` trong DB, cần hoàn tiền thủ công (sandbox thì bỏ qua). |
| Về trang `/payment-result` bị 404 / trắng | `VnPay:ReturnUrl` sai cổng; phải trùng cổng frontend (8080 hoặc 5173). |

## Về IPN (không bắt buộc khi chạy localhost)
VNPay còn gọi **IPN** (máy chủ VNPay → máy chủ mình) để báo kết quả kể cả khi khách đóng trình duyệt.
VNPay không gọi được `localhost`, nên khi chạy trên máy, hệ thống ghi nhận qua trang `/payment-result` (gọi
`/api/vnpay/return-verify`). Hai đường dùng chung một hàm và chỉ ghi nhận 1 lần.
Muốn thử IPN: chạy `ngrok http 6868`, vào trang quản trị sandbox, mục cấu hình IPN URL, đặt
`https://<địa-chỉ-ngrok>/api/vnpay/ipn`.

Tài liệu VNPay: https://sandbox.vnpayment.vn/apis/docs/gioi-thieu/
