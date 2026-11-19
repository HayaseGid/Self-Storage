# return

Folder `features/return` chứa toàn bộ nghiệp vụ **trả kho** và **kiểm kho khi trả** ở tầng "feature" (tính năng) của frontend. Các file ở đây không phải là trang riêng mà là component + hook được các trang (`pages/customer`, `pages/staff`, `pages/manager`) và chuông thông báo nhúng vào. Dùng cho 3 vai trò: khách hàng báo trả kho và xác nhận / khiếu nại phí, nhân viên nhận lại và kiểm tra kho, quản lý cơ sở duyệt kết quả và giải quyết khiếu nại.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [UnitReturn.jsx](./UnitReturn.jsx) | Phía KHÁCH: hộp thoại "Báo trả kho", khối "Trả kho" với tiến trình 4 bước, bảng quyết toán cọc, hủy lịch, đóng phí còn thiếu | `src/pages/customer/CustomerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx`, `src/features/return/StaffReturns.jsx` (chỉ `fmtDay`) | `GET /api/unit-returns/mine`, `GET /api/unit-returns/{id}/slots?date=`, `POST /api/unit-returns`, `POST /api/unit-returns/{id}/cancel`, `POST /api/unit-returns/{id}/pay-demo`, `POST /api/vnpay/create` (qua `startVnPayPayment`) |
| [StaffReturns.jsx](./StaffReturns.jsx) | Phía NHÂN VIÊN: danh sách yêu cầu trả kho theo nhóm, "Nhận lại kho", form kiểm tra (tình trạng, ảnh, phí, trạng thái kho sau trả) | `src/pages/staff/FacilityStaffAccount.jsx` | `GET /api/unit-returns/staff`, `POST /api/unit-returns/staff/{id}/start`, `GET /api/late-fees/returns/{id}/preview`, `POST /api/unit-returns/staff/{id}/complete` |
| [ReturnInspection.jsx](./ReturnInspection.jsx) | Kết quả kiểm kho dùng chung 3 vai trò: chọn / xem ảnh, hộp xác nhận / khiếu nại của khách, trạng thái cho nhân viên, tab duyệt / giải quyết khiếu nại của quản lý | `src/features/return/UnitReturn.jsx`, `src/features/return/StaffReturns.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx` | `GET /api/return-inspections/mine`, `/staff`, `/facilities/{facilityId}`, `/{inspectionId}`; `POST /api/return-inspections/{id}/accept`, `/dispute`, `/approve`, `/resolve` |
| [EarlyReturn.jsx](./EarlyReturn.jsx) | **Trả kho sớm** (hợp đồng còn > 30 ngày): form gửi đơn của khách (ngày, giờ, lý do, bảng tiền dự kiến, cảnh báo gửi muộn), thẻ đơn chờ duyệt / bị từ chối, mục duyệt của Manager | `src/pages/customer/CustomerAccount.jsx` (`EarlyReturnModal`), `UnitReturn.jsx` (`EarlyRequestCard`), `src/pages/manager/FacilityManagerAccount.jsx` (`ManagerEarlyReturnsTab`) | `GET /api/unit-returns/early/{reservationId}/quote?date=`, `POST /api/unit-returns/early`, `POST /api/unit-returns/early/{id}/cancel`, `GET /api/unit-returns/early/manager`, `GET /api/unit-returns/early/{id}/slots?date=`, `POST /api/unit-returns/early/{id}/approve`, `/reject` |
| [EarlyReturn.css](./EarlyReturn.css) | Giao diện trả kho sớm (`er-*`) | `EarlyReturn.jsx` | — |
| [UnitReturn.css](./UnitReturn.css) | Giao diện khối trả kho của khách (`ur-*`) và trang trả kho của nhân viên (`sr-*`) | `UnitReturn.jsx`, `StaffReturns.jsx`, `src/features/contract/ContractCard.jsx` | — |
| [ReturnInspection.css](./ReturnInspection.css) | Giao diện ảnh, hộp kiểm kho, hộp thoại khiếu nại, bảng phí (`ri-*`) | `ReturnInspection.jsx` | — |

## Các hàm / component chính

**UnitReturn.jsx**
- `fmtDay(iso)` (export): đổi ngày ISO thành `dd/MM/yyyy`.
- `useUnitReturns()` (export): hook tải dữ liệu trả kho của khách (`items`, `rules`, `fees`, `byReservation`, `reload`).
- `returnStage(req, inspection)` (export): trả về bước hiện tại (`scheduled`, `inspecting`, `pending_manager`, `confirm`, `disputed`, `owed`, `refunding`, `done`).
- `payReturnFees(dialog, item)` (export): đóng phí phát sinh còn thiếu (mô phỏng hoặc VNPay).
- `ReturnProgress` (nội bộ): thẻ tiến trình 1 yêu cầu trả kho, có nút Hủy lịch / Đóng phí.
- `ReturnSection` (export): khối "Trả kho" ở đầu trang Hợp đồng của khách.
- `ReturnRequestModal` (export): hộp thoại báo trả kho (ngày, khung giờ, ghi chú, đồng ý quy trình).

**StaffReturns.jsx**
- `useStaffReturns()` (export): hook tải việc trả kho của nhân viên.
- `InspectForm` (nội bộ): form "Hoàn tất kiểm tra kho", tự tính trừ cọc / nợ thêm / hoàn cọc (đã trừ công nợ hợp đồng trước).
- `StaffReturns` (export default): trang "Trả kho" với 4 nhóm Hôm nay & quá hẹn / Sắp tới / Đang kiểm tra / Đã xong.

**ReturnInspection.jsx**
- `INSPECTION`, `MAX_STAFF_PHOTOS`, `MAX_CUSTOMER_PHOTOS` (export): hằng số trạng thái và số ảnh tối đa.
- `parseReturnNotes(notes)` (export): tách chuỗi ghi chú thành ghi chú khách / ghi chú nhân viên / câu về phí.
- `compressImage(file)`, `PhotoPicker`, `PhotoGallery` (export): nén ảnh, ô chọn ảnh, lưới ảnh có phóng to.
- `useInspectionDetail(id, enabled)` (export): tải chi tiết kèm ảnh khi cần.
- `useMyInspections()`, `CustomerInspectionBox` (export) + `DisputeModal` (nội bộ): phía khách.
- `useStaffInspections()`, `StaffInspectionStatus` (export): phía nhân viên.
- `ManagerReturnInspectionsTab` (export) + `ResolveModal` (nội bộ): phía quản lý.
- `InspectionPhotos`, `FeeTable`, `ManagerApprovalBadge` (nội bộ): ảnh, bảng phí, khối quyết định của quản lý.

## Kết nối với các phần khác

- **Import từ:** `api/api` (`apiGet`, `apiPost`), `api/vnpay`, `components/common/Dialog` (`useDialog`), `components/common/listKit` (phân trang, mã nổi bật), `services/storageRules` (`formatVnd`), `services/policies` (`usePolicies`), `services/afterDeposit` (`focusContract`), `demoClock/demoClock` (`getTodayISO`), `features/contract/ContractSignFlow.css`.
- **Được import bởi:** `pages/customer/CustomerAccount.jsx`, `pages/staff/FacilityStaffAccount.jsx`, `pages/manager/FacilityManagerAccount.jsx`, `features/notification/HeaderNotificationBell.jsx`, `features/contract/ContractCard.jsx` (chỉ CSS).
- Bên trong folder: `StaffReturns.jsx` và `UnitReturn.jsx` cùng dùng `ReturnInspection.jsx`; `StaffReturns.jsx` lấy `fmtDay` từ `UnitReturn.jsx`.

## Luồng hoạt động

0. **Trả kho sớm (hợp đồng còn hơn 30 ngày):** nút ở thẻ kho / thẻ hợp đồng đổi thành "Trả kho sớm" (`/mine` trả `mode = 'early'`) → `EarlyReturnModal`: chọn ngày (từ hôm nay + N ngày báo trước), giờ, lý do; bảng tiền tải lại theo ngày (`/quote`) → "Gửi đơn trả kho sớm" (`POST /api/unit-returns/early`) → `EarlyRequestCard` "Chờ Quản lý duyệt" (rút đơn được). Manager mở mục "Trả kho sớm" (`ManagerEarlyReturnsTab` → `DecisionModal`) → **Duyệt**: backend hủy các kỳ chưa đóng sau ngày trả, hoàn đủ các kỳ đã đóng sau ngày trả (trả 1 lần), tạo lịch trả kho cho nhân viên → đi tiếp bước 2 bên dưới; **Từ chối**: bắt buộc ghi lý do, khách thấy trên thẻ. Không có phí chấm dứt sớm; tháng đang dở tính tròn tháng; trả theo tháng mà gửi muộn hơn N ngày trước kỳ đóng tiền tới thì phải đóng cả kỳ đó (form cảnh báo rõ).

1. **Khách báo trả kho:** khách bấm "Báo trả kho" ở thẻ hợp đồng (CustomerAccount) → `ReturnRequestModal` gọi `GET /api/unit-returns/{id}/slots?date=` mỗi lần đổi ngày → tick đồng ý, bấm "Đặt lịch trả kho" → `POST /api/unit-returns` → `ReturnSection` hiện thẻ `ReturnProgress` ở bước "Đã hẹn trả kho".
2. **Nhân viên nhận lại và kiểm tra:** mục "Trả kho" (`StaffReturns`) → bấm "Nhận lại kho & bắt đầu kiểm tra" → `POST /api/unit-returns/staff/{id}/start` → `InspectForm` tải công nợ (`GET /api/late-fees/returns/{id}/preview`) → nhập tình trạng, ảnh, phí → "Hoàn tất kiểm tra" → `POST /api/unit-returns/staff/{id}/complete`. Không có phí: quyết toán ngay (hoàn cọc sau N ngày). Có phí: tạo kết quả kiểm kho trạng thái "Pending Manager".
3. **Duyệt, xác nhận hoặc khiếu nại phí kiểm kho:** quản lý mở `ManagerReturnInspectionsTab` → "Duyệt kết quả" → `ResolveModal` → `POST /api/return-inspections/{id}/approve` → khách thấy `CustomerInspectionBox` ("Chờ bạn xác nhận") → "Đồng ý & quyết toán" (`POST .../accept`, trừ cọc, thiếu thì đóng thêm bằng `payReturnFees`) hoặc "Khiếu nại" (`DisputeModal` → `POST .../dispute`) → quản lý "Giải quyết khiếu nại" → `POST .../resolve` → "Settled". Quá hạn mà khách không phản hồi thì backend tự xác nhận khi gọi `GET /api/return-inspections/mine`.
