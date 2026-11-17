# pages

Các **trang làm việc theo từng vai trò** (mỗi folder ứng với 1 route / 1 nhóm route). Đây là tầng trên cùng của
frontend: trang ghép các khối nghiệp vụ trong `features/`, component dùng chung trong `components/common/`,
và gọi backend qua `api/` + `hooks/` + `services/`.

> Các trang **công khai** (trang chủ, danh sách cơ sở, chi tiết cơ sở/kho, tìm kho, đặt kho, đăng nhập / đăng ký / OTP)
> KHÔNG nằm ở đây mà nằm trong [`src/App.jsx`](../App.jsx).

| Folder | Vai trò người dùng | Route | Component chính | README |
|---|---|---|---|---|
| [customer/](./customer/) | Khách hàng (`customer`) | `/customer`, `/cart` | `CustomerAccount.jsx` (khu tài khoản), `CartPage.jsx` (giỏ hàng / đặt kho) | [README](./customer/README.md) |
| [staff/](./staff/) | Nhân viên cơ sở (`FACILITY_STAFF`) | `/staff` | `FacilityStaffAccount.jsx` | [README](./staff/README.md) |
| [manager/](./manager/) | Quản lý cơ sở (`FACILITY_MANAGER`) | `/manager` | `FacilityManagerAccount.jsx` | [README](./manager/README.md) |
| [business/](./business/) | Kinh doanh (`BUSINESS_OPERATIONS`) | `/business` | `BusinessOperations.jsx` | [README](./business/README.md) |
| [admin/](./admin/) | Quản trị hệ thống (`SYSTEM_ADMIN`) | `/admin` | `AdminAccount.jsx` | [README](./admin/README.md) |
| [payment/](./payment/) | Mọi người (VNPay trả về) | `/payment-result` | `PaymentResultPage.jsx` | [README](./payment/README.md) |

## Trang được mở thế nào

1. `src/App.jsx › getRoute()` đọc URL (`window.location.pathname`) → trả về `{ type: 'customer' | 'staff' | ... }`.
2. `App.jsx › Router()` kiểm tra người dùng đã đăng nhập chưa và có đúng vai trò không
   (người dùng lưu ở localStorage `storespace_current_user` sau khi đăng nhập), rồi render component trang tương ứng.
3. Sai vai trò / chưa đăng nhập → chuyển về `/login` hoặc trang chủ của vai trò đó (`roleHome()` trong `App.jsx`).

## Chiều phụ thuộc

```
pages/*  →  features/*  →  components/common  →  services / mappers / hooks / store / utils  →  api/api.js  →  Backend
```
Trang chỉ import xuống dưới, không file nào ở tầng dưới import ngược lại `pages/`
(ngoại lệ: `App.jsx` import các trang để định tuyến).
