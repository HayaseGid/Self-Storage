# admin

Folder này chứa **trang quản trị hệ thống** dành cho vai trò **System Administrator** và thuộc tầng **pages** (màn hình) của frontend.
Admin dùng trang này để duyệt hoặc từ chối tài khoản nhân sự đăng ký mới, xem và lọc toàn bộ tài khoản,
khóa hoặc mở khóa tài khoản, đổi vai trò, đặt lại mật khẩu, và xem nhật ký hoạt động.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [AdminAccount.jsx](./AdminAccount.jsx) | Trang quản trị: sidebar 5 mục (Tổng quan, Duyệt tài khoản, Tất cả tài khoản, Vai trò & quyền, Nhật ký hoạt động) và các thao tác trên tài khoản | `src/App.jsx` (vai trò SYSTEM_ADMIN) | `GET /api/admin/users`, `GET /api/admin/activity`, `PUT /api/admin/users/{id}`, `PUT /api/admin/users/{id}/password` |
| [AdminAccount.css](./AdminAccount.css) | Giao diện của AdminAccount.jsx (bảng, thẻ KPI, khung chi tiết, toast...) | `AdminAccount.jsx` | — |

## Các hàm / component chính

**AdminAccount.jsx**
- `roleOptions`: danh sách vai trò có thể gán (Storage Customer, Facility Staff, Facility Manager, Business Operations Manager).
- `Admin()` (export default): component trang quản trị.
  - `loadAdminData()`: tải song song danh sách tài khoản và nhật ký (`GET /api/admin/users` + `GET /api/admin/activity`).
  - `updateUser(id, role, status, msg)`: `PUT /api/admin/users/{id}` với body `{ roleName, status }`, sau đó tải lại dữ liệu và hiện toast.
  - `loadRoleCheck(id)`: `GET /api/admin/users/{id}/role-eligibility` -> `{ canChangeRole, blockers[] }`. Ô "Thay đổi role" chỉ mở khi tài khoản **trống hoàn toàn**; còn vướng thì khóa ô và hiện khung cam liệt kê lý do (backend cũng chặn, trả 409 kèm `blockers`). Khóa / mở khóa không bị chặn.
  - `approveUser` / `rejectUser` / `toggleLock` / `changeRole`: thao tác trên 1 tài khoản (hỏi xác nhận khi cần) rồi gọi `updateUser`.
  - `resetPassword(user)`: kiểm tra mật khẩu mới (ít nhất 6 ký tự, khớp ô xác nhận) rồi gọi `PUT /api/admin/users/{id}/password` với body `{ password }`.
  - `userList` / `logList` (dùng `useServerList`): phân trang ở backend; nếu backend trả cả mảng thì tự chia trang ở frontend.
  - `selectUser`, `showToast`, `logout` (xóa phiên trong localStorage).
  - `renderDashboard` / `renderPending` / `renderUsers` / `renderUserDetail` / `renderRoles` / `renderLogs`: vẽ từng màn hình con.

## Kết nối với các phần khác

- **Import từ:**
  - `src/api/api`: `apiGet`, `apiPut`
  - `src/components/common/Dialog`: `useDialog` (hộp thoại xác nhận và báo lỗi)
  - `src/components/common/listKit`: `useServerList`, `Pager`, `NewBadge`, `newestFirst`, `parseTime`, `rowClass`, `timeAgo`
- **Được import bởi:** `src/App.jsx`.

## Luồng hoạt động

1. **Duyệt tài khoản:** menu "Duyệt tài khoản" → bấm vào 1 dòng (`selectUser`) → bấm "Duyệt tài khoản" → `approveUser` → `updateUser` → `PUT /api/admin/users/{id}` `{ status: "Active" }` → `loadAdminData` → toast "Đã duyệt...".
2. **Đổi vai trò (chỉ khi tài khoản trống hoàn toàn):** chọn tài khoản → `loadRoleCheck` → nếu còn vướng (khách: đơn chưa kết thúc, còn nợ, chờ hoàn tiền, kiểm kho chưa xong, đơn trả kho sớm chờ duyệt, mã/thẻ kho còn hiệu lực; nhân viên: đang được phân công, còn việc chưa xong; quản lý: đang quản lý cơ sở; BOM: BOM hoạt động cuối cùng) thì ô bị khóa và hiện lý do; trống thì chọn vai trò mới → xác nhận → `updateUser`. Khách đổi sang vai trò khác thì mã ra vào cơ sở chuyển Hết hiệu lực.
3. **Khóa tài khoản:** menu "Tất cả tài khoản" → chọn tài khoản → bấm "Khóa tài khoản" → `toggleLock` → hộp thoại xác nhận → `PUT /api/admin/users/{id}` `{ status: "Locked" }` → tải lại dữ liệu.
3. **Đặt lại mật khẩu:** trong khung chi tiết, nhập mật khẩu mới và xác nhận → submit form → `resetPassword` → xác nhận → `PUT /api/admin/users/{id}/password` → xóa 2 ô mật khẩu và hiện toast.
