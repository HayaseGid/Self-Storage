# StoreSpace – Web app hoàn chỉnh

## Chạy frontend và backend

Backend phải được cấu hình kết nối tới SQL Server/database của project trước khi chạy.

```bash
cd backend
dotnet run --launch-profile http
```

Mặc định frontend gọi API tại `http://localhost:5046`. Nếu backend chạy ở địa chỉ khác,
tạo `frontend/.env.local` và cấu hình:

```env
VITE_API_URL=http://localhost:5046
```

Sau đó chạy frontend:

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # xuất bản production (thư mục dist)
```

Đăng nhập và đăng ký sử dụng API/backend; các tài khoản và dữ liệu demo trong frontend
không phải dữ liệu đăng nhập của project.

Danh mục cơ sở/kho được tải từ `GET /api/catalog/state`. Khi đặt kho, frontend kiểm tra
`GET /api/catalog/availability` rồi tạo đặt chỗ qua `POST /api/reservation`; backend tự
tính tiền thuê và tiền cọc theo chính sách trong database.

Backend hiện chưa tích hợp cổng thanh toán ngân hàng. Nút xác nhận ở bước tiền cọc chỉ
ghi nhận một giao dịch mô phỏng vào database; không thực hiện hoặc xác minh chuyển khoản
thật.

Các dashboard nhân viên, quản lý cơ sở, vận hành doanh nghiệp và quản trị viên đọc dữ
liệu qua API/backend, không dùng bản ghi nghiệp vụ trong localStorage. Sau khi đăng nhập,
frontend lưu email và role ở localStorage rồi gửi email qua header `X-User-Email` khi gọi
API. Giao diện vẫn điều hướng theo role nhưng backend không dùng JWT hoặc phân quyền API.
Đây là cấu hình đơn giản chỉ để trình diễn đồ án local; không dùng để triển khai lên
Internet hoặc lưu dữ liệu thật.

Khi deploy, cấu hình rewrite mọi đường dẫn về `index.html` (app dùng History API).

## Cấu trúc
- `src/App.jsx` – entry, router, trang công khai, đăng nhập/đăng ký, phân quyền theo role
- `src/CustomerAccount.jsx`, `FacilityManagerAccount.jsx`, `FacilityStaffAccount.jsx`, `AdminAccount.jsx`, `BusinessOperations.jsx` – các dashboard theo role
- CSS: `styles.css` (chung), `fmanagerstyles.css`, `staffstyles.css`, `AdminAccount.css`, `BusinessOperations.css`

## Font
- Tiêu đề: **Be Vietnam Pro** (thay Manrope – font này bị dính chữ khi gõ tiếng Việt kèm letter-spacing âm). Nội dung: DM Sans (fallback Be Vietnam Pro cho dấu tiếng Việt).
- Muốn đổi font, sửa dòng `@import` đầu `src/styles.css` và thay `'Be Vietnam Pro'` trong các file CSS.
