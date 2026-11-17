# staff

Folder `pages/staff` là tầng "trang" (page) của frontend cho vai trò **Nhân viên cơ sở (Facility Staff)**, route `/staff`. Chỉ có 1 file lớn chứa toàn bộ cổng làm việc của nhân viên: tổng quan, bàn giao kho cho khách, danh sách đơn đặt chỗ, quản lý trạng thái kho và báo cáo sự cố, việc được giao, nhật ký. Riêng mục "Trả kho & kiểm kho" được tách sang `features/return/StaffReturns.jsx`.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [FacilityStaffAccount.jsx](./FacilityStaffAccount.jsx) | Trang làm việc của nhân viên cơ sở (export default `StaffPortal`) | `src/App.jsx` (route `/staff`, role `FACILITY_STAFF`) | `GET /api/operations/state?email=`, `POST /api/manager-tools/facilities/{id}/auto-assign`, `POST /api/late-fees/facilities/{id}/sync`, `GET /api/staff-tools/tasks`, `POST /api/staff-tools/handover`, `POST /api/staff-tools/reservations/{id}/confirm`, `POST /api/staff-tools/unit-reports`, `PUT /api/staff-tools/units/{unitId}/status`, `GET /api/operations/reservations` và `GET /api/operations/units` (qua `useOpsList`) |

Giao diện dùng chung `src/styles/styles.css` và `src/styles/staffstyles.css` (không có file CSS riêng trong folder này).

## Các hàm / component chính

**FacilityStaffAccount.jsx**
- Hàm tiện ích: `pad`, `fmtISO`, `todayStr` (theo Demo Clock), `addMonths`, `fmtDate`, `fmtMoney`, `fmtDateTime`, `compressImage` (nén ảnh), `endOf`, `overlaps`, `unitsOf`, `resCode`, `dayGroup`, `sumCounts`.
- Bảng hằng số: `RES_STATUS`, `PAY_STATUS`, `UNIT_STATUS`, `ACCESS_TYPES`, `TASK_TYPE`, `TASK_STATUS`, `STAFF_UNIT_STATUS_OPTIONS`, `AWAITING`, `HOLDING`, `UNIT_NOT_READY`, `NAV`, các bộ lọc / sắp xếp.
- `findClashes`, `myMoveInTasks`, `isAssignedToMe`: kiểm tra trùng lịch và phân công.
- `checkHandover(res, staff, db)`: danh sách điều kiện bàn giao (chỉ để hiển thị trước; backend `HandoverService` quyết định cuối cùng).
- `Badge`, `Info`, `DayTag`, `AuthFrame`, `NoAccess`: component giao diện nhỏ.
- `ReservationDetail`: chi tiết đơn + bàn giao (tick đối chiếu, ảnh, xác nhận đơn đã cọc, bàn giao, thử bàn giao lại để kiểm tra chống trùng).
- `UnitReportModal`: hộp thoại báo cáo tình trạng / sự cố kho.
- `TaskDetailModal`: chi tiết 1 việc được giao.
- `ReservationItem`, `Workspace`: dòng đơn và bố cục danh sách + chi tiết.
- `Portal`: giao diện chính (menu, các mục, lọc / phân trang, đổi trạng thái kho).
- `StaffPortal` (export default): tải dữ liệu (`loadState`), chọn cơ sở (lưu `localStorage`), cung cấp các hàm `handover`, `confirmReservation`, `reportUnitCondition`, `updateUnitStatus` cho `Portal`.

## Kết nối với các phần khác

- **Import từ:** `api/api` (`apiGet`, `apiPost`, `apiPut`), `features/return/StaffReturns`, `mappers/operationsState` (`mapOperationsState`), `hooks/opsLists` (`useOpsList`, `RESERVATION_SORTS`, `UNIT_SORTS`), `components/common/Dialog` (`useDialog`), `components/common/listKit` (phân trang, lọc, nhãn "Mới"), `services/storageRules` (`formatReservationCode`), `demoClock/demoClock` (`getTodayISO`).
- **Được import bởi:** `src/App.jsx` (`import StaffPortal from './pages/staff/FacilityStaffAccount'`).

## Luồng hoạt động

1. **Mở trang:** `StaffPortal` → `loadState` → `GET /api/operations/state` → `mapOperationsState` → tự phân công đơn đã cọc (`POST .../auto-assign`) và cập nhật phí trễ hạn (`POST .../late-fees/.../sync`) ở các cơ sở của mình → `GET /api/staff-tools/tasks` → lưu `db` → `Portal` hiện mục Tổng quan.
2. **Bàn giao kho cho khách:** mục "Bàn giao kho" → chọn 1 đơn → `ReservationDetail` hiện điều kiện (`checkHandover`) → nếu đơn chưa xác nhận: bấm "Xác nhận đơn đã cọc" → `POST /api/staff-tools/reservations/{id}/confirm` → tick đối chiếu giấy tờ + kho nguyên vẹn, thêm ảnh → "Xác nhận bàn giao" → `POST /api/staff-tools/handover` (hệ thống tự cấp mã truy cập và `KEY-<mã kho>`) → `loadState({ silent: true })`.
3. **Kho tại cơ sở:** mục "Kho tại cơ sở" (danh sách từ `GET /api/operations/units`) → chọn trạng thái mới → `changeUnitStatus` → `PUT /api/staff-tools/units/{unitId}/status`; hoặc bấm "Báo cáo" → `UnitReportModal` → `POST /api/staff-tools/unit-reports` (hư hỏng thì kho trống chuyển Bảo trì).
