# Phân trang, làm nổi thông tin quan trọng, rà lại menu (10/11/2026)

## 1. Backend: API danh sách có phân trang

Các tham số dùng chung (`DTOs/PagingDTOs.cs` → `PageQuery`):

| Tham số | Ý nghĩa |
|---|---|
| `page` | Trang, bắt đầu từ 1. **Có gửi `page` thì mới trả dạng phân trang.** API cũ không gửi thì vẫn trả nguyên mảng như trước. |
| `pageSize` | Số dòng mỗi trang, mặc định 20, tối đa 100 |
| `q` | Từ khóa tìm kiếm |
| `status` | Nhiều trạng thái, cách nhau dấu phẩy |
| `sort` | Cách sắp xếp, mặc định `newest` (mới nhất lên đầu) |
| `facilityId`, `typeId` | Lọc theo cơ sở / loại kho |

Kết quả trả về: `{ items, total, page, pageSize, pageCount, statusCounts }`. Trong đó `statusCounts` là số dòng theo từng trạng thái, dùng để hiện số trên các nút lọc.

API mới / API được sửa:

| API | Ghi chú |
|---|---|
| `GET /api/operations/reservations` | Phạm vi dữ liệu giống `/state` (Staff: cơ sở mình; Manager: cơ sở mình quản lý; Business: tất cả). Sort: `newest`, `oldest`, `appointment`, `appointment_desc`, `start`, `code`. Status: `PENDING_PAYMENT`, `PENDING_APPROVAL`, `CONFIRMED`, `HANDED_OVER`, `COMPLETED`, `CANCELLED`, `EXPIRED` |
| `GET /api/operations/units` | Status: `AVAILABLE`, `RESERVED`, `RENTED`, `MAINTENANCE`, `INACTIVE`. Sort: `newest`, `code`, `code_desc`, `updated`, `oldest` |
| `GET /api/operations/contracts` | Status (giai đoạn): `ACTIVE`, `EXPIRING` (≤ 30 ngày), `EXPIRED`, `RENEWED`, `CLOSED`. Sort: `newest`, `ending`, `oldest`, `code` |
| `GET /api/admin/users?page=` | Thêm `role=`. Status: `ACTIVE`, `PENDING`, `LOCKED`, `REJECTED` |
| `GET /api/admin/activity?page=` | Status: `LOGIN`, `APPROVAL`, `ROLE`, `SECURITY` |
| `GET /api/customer-reservations/mine?page=` | Không gửi `page` thì vẫn trả mảng như cũ. Mặc định xếp đơn mới nhất lên đầu |

Lọc, đếm và Skip/Take đều chạy trong SQL, chỉ chiếu (Select) đúng trang đang xem. Mỗi dòng có cùng cấu trúc JSON với `/api/operations/state`, thêm trường `createdAt`. `/state` cũng được thêm `createdAt` cho kho, đơn, hợp đồng và cơ sở. Phần chiếu dữ liệu được tách thành `ProjectUnitsAsync` / `ProjectReservationsAsync` / `ProjectContractsAsync` để `/state` và API phân trang dùng chung một chỗ.

Việc được giao (`/api/staff-tools/tasks`, `/api/manager-tools/facilities/{id}/tasks`) có thêm `createdAt` để tô sáng việc mới giao.

> Lưu ý: chưa build được backend trên máy mình (không có dotnet). Nhớ chạy `dotnet build` / `dotnet run` rồi gọi thử 3 API `/api/operations/...`.

## 2. Frontend: bộ công cụ dùng chung (`listKit.jsx`, `opsLists.js`)

- **`<Pager>`**: thanh phân trang gồm số trang, dòng "Hiển thị 1–20 / 345" và ô chọn số dòng mỗi trang.
- **`useServerList` / `useOpsList`**: gọi API phân trang. Nếu backend chưa chạy bản mới (bị 404 hoặc trả về mảng), tự chia trang ngay ở frontend từ dữ liệu `/state`, nên trang vẫn chạy được.
- **`useClientPaging`**: chia trang cho các danh sách nhỏ (việc được giao, nhật ký, thông báo, lịch sử thanh toán…).
- **`<Code>` / `<UnitCodes>`**: hiển thị mã đơn (xanh), mã kho (vàng), mã HĐ (xanh lá) dạng thẻ chữ đậm.
- **`NewBadge` / `rowClass`**: bản ghi tạo trong vòng 48 giờ có nhãn **Mới** và nền vàng nhạt kèm vạch trái. Mặc định danh sách xếp mới nhất lên đầu.
- **`DataGrid`**: dùng `<Pager>` mới. Thêm prop `getCreatedAt` để mặc định xếp mới nhất lên đầu và tô sáng dòng mới.

## 3. Thay đổi theo actor

**Facility Staff**
- Menu: "Nhận kho" đổi thành **Bàn giao kho**, "Tất cả đặt chỗ" đổi thành **Đơn đặt chỗ**. Có số việc chờ ở Bàn giao kho và Việc được giao.
- Đơn đặt chỗ: phân trang ở backend, nút lọc có số đếm, chọn cách sắp xếp, mã đơn và mã kho dạng thẻ.
- Chi tiết đơn: mã đơn và mã kho nổi bật ở đầu, ô "Lịch hẹn nhận kho" và "Tiền cọc" được làm nổi, có thêm ngày đặt.
- Kho tại cơ sở: phân trang ở backend, có tìm kiếm, nút lọc trạng thái và cột vị trí.
- Bàn giao kho, Trả kho, Việc được giao, Nhật ký: chia trang và tô sáng bản ghi mới.

**Facility Manager**
- Menu: thêm mục **Đơn đặt chỗ** (trước đây Manager không có danh sách đơn). Có số việc chờ ở Đơn đặt chỗ và Hợp đồng.
- Đơn đặt chỗ (mới): phân trang ở backend, lọc theo trạng thái, bấm vào dòng để xem chi tiết.
- Hợp đồng: phân trang ở backend, lọc theo giai đoạn, sắp xếp (mới tạo / sắp hết hạn trước…).
- Kho cơ sở: phân trang ở backend, nút lọc trạng thái, tìm kiếm, sắp xếp. Bỏ sắp xếp bằng cách bấm tiêu đề cột và bỏ 2 nút lọc "Đã có đơn" / "Sửa được"; thay bằng nút lọc theo trạng thái.
- Công nợ, Sự cố kho, Khiếu nại kiểm kho, Nhân sự: chia trang, mã nổi bật, tô sáng mục mới.
- Thêm nhãn trạng thái đơn còn thiếu (Đã trả kho / Đã hủy / Hết hạn giữ chỗ).

**Customer**
- Kho của tôi: mới nhất lên đầu, mã dạng thẻ, kiểu thẻ có chia trang.
- Hợp đồng: thêm khu **Danh sách hợp đồng** gồm ô tìm kiếm, nút lọc (Đang thuê / Đã trả kho), mới nhất lên đầu, 5 hợp đồng mỗi trang. Các hợp đồng chờ ký vẫn nằm trên cùng.
- Thanh toán: lịch sử giao dịch có chia trang và mã giao dịch nổi bật. Thông báo: có chia trang.
- Menu: "Đặt kho" đổi thành "Tìm & đặt kho thêm ↗", vì mục này chuyển sang trang tìm kho.

**Business Operations**
- Cơ sở toàn hệ thống: mặc định hiện **Tất cả khu vực**, cơ sở mới thêm lên đầu và có nhãn "Mới thêm", chia trang 12 cơ sở / trang.

**System Admin**
- Tất cả tài khoản và Nhật ký hoạt động: phân trang ở backend. Thêm cột ngày tạo; tài khoản mới tạo và tài khoản chờ duyệt mới được tô sáng.
- Menu đổi tên cho rõ: Tổng quan / Duyệt tài khoản / Tất cả tài khoản / Vai trò & quyền / Nhật ký hoạt động.

## 4. Chưa làm / cần biết

- `/api/operations/state` vẫn tải toàn bộ dữ liệu, vì trang Tổng quan, số đếm trên menu và điều kiện bàn giao cần dữ liệu đầy đủ. Các danh sách lớn đã chuyển sang API phân trang. Nếu sau này dữ liệu thật rất lớn, nên tách thêm API thống kê riêng rồi bỏ bớt mảng trong `/state`.
- Các danh sách nhỏ theo cơ sở (công nợ, sự cố, khiếu nại, việc được giao, trả kho) vẫn chia trang ở frontend.
