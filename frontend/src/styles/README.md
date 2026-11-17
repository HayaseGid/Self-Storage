# styles

Tầng **CSS dùng chung theo trang** (tầng nền giao diện). Chứa các file CSS toàn cục: `styles.css` là bộ style gốc của toàn ứng dụng (header, trang khách hàng, trang đặt kho, thẻ, nút, form...); hai file còn lại bổ sung style riêng cho màn hình Facility Manager và Facility Staff. Các component dùng chung khác có CSS đi kèm ngay cạnh file JSX (vd `src/components/common/Dialog.css`), không nằm ở đây. Folder không có file JavaScript, không gọi API.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [styles.css](./styles.css) | Style gốc toàn ứng dụng (khoảng 92 KB): bố cục chung, header, trang chủ / cơ sở / đặt kho, trang tài khoản khách, thẻ, nút, form, bảng | `src/App.jsx`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/staff/FacilityStaffAccount.jsx` | — |
| [fmanagerstyles.css](./fmanagerstyles.css) | Style riêng màn hình Facility Manager (bảng điều khiển, danh sách kho, đơn, hợp đồng, bảng giá) | `src/pages/manager/FacilityManagerAccount.jsx` | — |
| [staffstyles.css](./staffstyles.css) | Style riêng màn hình Facility Staff (việc được giao, bàn giao / nhận lại kho) | `src/pages/staff/FacilityStaffAccount.jsx` | — |

## Các hàm / component chính

Không có (chỉ là file CSS). Các file được nạp bằng `import '.../styles/xxx.css'` nên áp dụng toàn cục cho mọi phần tử có class tương ứng sau khi trang đó được tải.

## Kết nối với các phần khác

- **Import từ:** không import gì.
- **Được import bởi:** `src/App.jsx` (`styles.css`), `src/pages/manager/FacilityManagerAccount.jsx` (`styles.css` + `fmanagerstyles.css`), `src/pages/staff/FacilityStaffAccount.jsx` (`styles.css` + `staffstyles.css`).
- Lưu ý: vì là CSS toàn cục (không phải CSS module), class trong `fmanagerstyles.css` / `staffstyles.css` có thể ảnh hưởng tới trang khác một khi đã được nạp — đặt tên class có tiền tố riêng khi thêm style mới.

## Luồng hoạt động

1. Trình duyệt mở app → `App.jsx` được tải → `import './styles/styles.css'` nạp style gốc.
2. Người dùng vai trò Manager vào trang quản lý → `FacilityManagerAccount.jsx` được tải → nạp thêm `fmanagerstyles.css`.
3. Người dùng vai trò Staff vào trang nhân viên → `FacilityStaffAccount.jsx` → nạp thêm `staffstyles.css`.
