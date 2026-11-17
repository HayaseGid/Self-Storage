# manager

Folder này chứa **trang làm việc của Quản lý cơ sở (Facility Manager)**, thuộc tầng `pages` (màn hình) của frontend.
Một Facility Manager quản lý đúng 1 cơ sở kho: xem tổng quan và doanh thu, quản lý danh mục kho, xử lý sự cố kho,
phân công nhân viên, theo dõi đơn đặt chỗ, hợp đồng, công nợ, khiếu nại kiểm kho, thiết lập loại/kích thước kho và bảng giá.
`App.jsx` hiển thị trang này cho tài khoản có role `FACILITY_MANAGER`.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|------|-----------|---------------|---------|
| [FacilityManagerAccount.jsx](./FacilityManagerAccount.jsx) | Toàn bộ trang Manager: tải dữ liệu, menu + các tab, tạo/sửa/xóa kho, các hộp thoại và tab con | `src/App.jsx` | `GET /api/operations/state`, `POST/PUT /api/operations/units`, `DELETE /api/storage-units/{id}`, `/api/unit-types`, `/api/unit-sizes`, `/api/price-bands`, `/api/manager-tools/...`, `/api/late-fees/...`, `PUT /api/staff-tools/units/{id}/status`, `POST /api/operations/facilities/{id}/staff`, `DELETE /api/operations/facilities/{id}/rates/...`, danh sách phân trang `/api/operations/reservations\|units\|contracts` |
| [ManagerNav.jsx](./ManagerNav.jsx) | Menu trái chia nhóm, hiện số việc đang chờ trên từng mục | `src/pages/manager/FacilityManagerAccount.jsx` | `GET /api/manager-tools/facilities/{id}/unit-reports`, `GET /api/late-fees/facilities/{id}`, `GET /api/return-inspections/facilities/{id}` |
| [ManagerNav.css](./ManagerNav.css) | Giao diện menu trái (nhóm, icon, số đỏ, cuộn) cho `ManagerNav.jsx` | `src/pages/manager/ManagerNav.jsx` | — |
| [ManagerPriceTable.jsx](./ManagerPriceTable.jsx) | Mục "Bảng giá": đặt giá thuê cho từng cặp loại + size, phải nằm trong khung giá do Business đặt | `src/pages/manager/FacilityManagerAccount.jsx` | `PUT /api/operations/facilities/{id}/rates` |

Giao diện chung của trang nằm ở `src/styles/fmanagerstyles.css`; `ManagerPriceTable` dùng lại `src/pages/business/BusinessPriceBands.css`.

## Các hàm / component chính

### FacilityManagerAccount.jsx
- `FacilityManagerDashboard` (export default): component trang. Gọi `loadState()` để tải dữ liệu, chọn cơ sở của Manager, vẽ `ManagerNav` và tab theo `activeTab`.
  - `loadState({ silent })`: `GET /api/operations/state?email=` -> `mapOperationsState()` -> state `db`.
  - `handleSaveUnit(unitData)`: tạo (`POST /api/operations/units`) hoặc sửa (`PUT /api/operations/units/{unitNumber}`) kho.
  - `handleDeleteUnit(unit)`: `DELETE /api/storage-units/{unitId}` (chỉ kho chưa có lịch sử).
  - `reloadFacilityCatalog()`: tải lại loại kho + kích thước qua `loadFacilityCatalog`.
  - Các `useEffect`: báo cáo thực thu (`/reports?months=6`), tự phân công (`POST .../auto-assign`), khung giá (`GET /api/price-bands`).
- Hộp thoại: `UnitFormModal` (tạo/sửa kho), `UnitDetailModal` (chi tiết kho), `TypeModal` / `SizeModal` (loại / kích thước kho), `AddStaffModal`, `StaffHistoryModal`, `OwnerModal` (giao người phụ trách, `GET .../workload`), `ManagerContractModal` (xem văn bản hợp đồng).
- Tab con: `FacilityPropertiesTab` (Đặc tính kho), `LateFeesTab` (Công nợ & phí trễ), `UnitReportsTab` (Sự cố kho), `FacilityStaffTab` (Nhân sự), `FacilityContractsTab` (Hợp đồng), `FacilityReservationsTab` (Đơn đặt chỗ).
- Hàm hỗ trợ: `fmtMoney`, `fmtDate`, `fmtDateTime`, `compareNatural`, `unitSizeValue`, `formatUnitLocation`, `previewNextUnitCode`, `loadFreshUnits` / `saveFreshUnits` (sessionStorage), `normalizeType` / `normalizeSize`, `loadFacilityCatalog`, `daysLeft`, `contractPhase`, `buildContractGroup`, `toMinutes`, `isOpenTask`.

### ManagerNav.jsx
- `ManagerNav` (export default): vẽ các nhóm/mục trong `GROUPS`, đánh dấu mục đang chọn, gọi `onSelect(key)` khi bấm; nhớ trạng thái mở nhóm "Thiết lập" trong localStorage.
- `useManagerBadges(facilityId, activeTab)` (export): gọi song song 3 API để đếm việc chờ; tải lại khi đổi mục, khi tab trình duyệt hiện lại, và mỗi 2 phút.

### ManagerPriceTable.jsx
- `ManagerPriceTable` (export default): gộp biểu giá + kho thực tế thành các dòng "loại|size", nhập giá mới, `save()` kiểm tra khung giá rồi `PUT .../rates`; `addRow()` thêm giá cho cặp loại + size mới.

## Kết nối với các phần khác
- **Import từ:** `api/api.js` (apiGet/Post/Put/Delete), `mappers/operationsState.js`, `components/common/` (`Dialog` -> `useDialog`, `PriceInput`, `listKit` -> phân trang, `Code`, `NewBadge`, `Pager`...), `services/storageRules.js`, `services/priceBands.js`, `features/contract/ContractDocument`, `features/unit/unitTypes`, `features/return/ReturnInspection` (`ManagerReturnInspectionsTab`), `hooks/opsLists.js` (`useOpsList`), `demoClock/demoClock.js` (ngày "hôm nay" giả lập).
- **Được dùng bởi:** `src/App.jsx` (import `FacilityManagerDashboard` từ `./pages/manager/FacilityManagerAccount`). `ManagerNav` và `ManagerPriceTable` chỉ được dùng nội bộ trong folder.

## Luồng hoạt động

1. **Mở trang và chọn mục**
   - Manager đăng nhập -> `App.jsx` hiện `FacilityManagerDashboard` -> `loadState()` gọi `GET /api/operations/state?email=` -> `mapOperationsState()` -> lọc kho/đơn/hợp đồng theo cơ sở.
   - `ManagerNav` gọi `useManagerBadges` (3 API) để hiện số đỏ -> bấm mục -> `setActiveTab(key)` -> hiện tab tương ứng.
2. **Tạo kho mới**
   - Mục "Kho cơ sở" -> bấm "Tạo kho" -> `UnitFormModal` (giá khóa theo biểu giá nếu có, không thì so với giá trung vị) -> `handleSubmit` kiểm tra + xác nhận.
   - -> `handleSaveUnit` -> `POST /api/operations/units` -> `loadState({ silent: true })` -> ghi kho vào sessionStorage (nhãn "Mới"), cuộn tới dòng mới và nháy sáng.
3. **Giao người phụ trách đơn**
   - Khi trang tải dữ liệu -> `POST /api/manager-tools/facilities/{id}/auto-assign` tự giao đơn đã cọc.
   - Muốn đổi: tab "Nhân sự" -> "Đổi người" -> `OwnerModal` tải `GET .../workload?date=`, xếp hạng nhân viên (không trùng giờ, ít việc) -> bấm "Đổi người" -> `changeOwner` -> `PUT /api/manager-tools/reservations/{id}/owner` -> tải lại danh sách việc.
