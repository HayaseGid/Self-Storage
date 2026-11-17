# src — mã nguồn frontend (React + Vite)

Điểm vào là [`App.jsx`](./App.jsx) (được `index.html` nạp). Code chia theo **tầng**, giống backend
(`Controllers / Services / Repositories / Models`). Muốn học code từ đầu, đọc
[**HUONG-DAN-HOC-CODE-FRONTEND.md**](../HUONG-DAN-HOC-CODE-FRONTEND.md) (cấu trúc, kết nối giữa các file, các luồng).

## Các folder

| Folder | Tầng / vai trò | README |
|---|---|---|
| [`App.jsx`](./App.jsx) | Điểm khởi động, Router, các trang công khai (chủ, cơ sở, kho, tìm kho, đặt kho, đăng nhập/đăng ký) | — |
| [pages/](./pages/) | Trang theo vai trò: khách hàng, nhân viên, quản lý, kinh doanh, quản trị, kết quả thanh toán | [README](./pages/README.md) |
| [features/](./features/) | Khối nghiệp vụ dùng lại: kho & 3D, cơ sở, đặt kho, thanh toán, hợp đồng, trả kho, thông báo | [README](./features/README.md) |
| [components/](./components/) | Component giao diện dùng chung (bảng, phân trang, hộp thoại, lịch) | [README](./components/README.md) |
| [api/](./api/) | Gọi HTTP tới backend (`apiGet/apiPost/...`), VNPay, OTP, email, phí trễ | [README](./api/README.md) |
| [services/](./services/) | Quy tắc nghiệp vụ thuần (giá, cọc, chính sách, thông báo...), không vẽ giao diện | [README](./services/README.md) |
| [mappers/](./mappers/) | Chuyển JSON backend → object frontend | [README](./mappers/README.md) |
| [hooks/](./hooks/) | React hook dùng chung (danh sách vận hành phân trang ở backend) | [README](./hooks/README.md) |
| [store/](./store/) | Dữ liệu lưu ở trình duyệt (giỏ hàng, bản nháp đặt kho) | [README](./store/README.md) |
| [utils/](./utils/) | Tính toán thuần: khu vực, hình học kho, thuật toán xếp đồ (+ Web Worker) | [README](./utils/README.md) |
| [demoClock/](./demoClock/) | Đồng hồ giả lập ngày cho demo / kiểm thử | [README](./demoClock/README.md) |
| [styles/](./styles/) | CSS dùng chung (toàn cục, theo vai trò) | [README](./styles/README.md) |

## Chiều phụ thuộc (import)

```
App.jsx / pages/*  →  features/*  →  components/common  →  services / mappers / hooks / store / utils  →  api/api.js  →  Backend
```
File ở tầng trên import tầng dưới; tầng dưới không import ngược lên.
