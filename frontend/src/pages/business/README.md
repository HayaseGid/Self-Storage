# business

Folder này chứa **trang làm việc của Business Operations Manager** (vai trò quản lý kinh doanh toàn hệ thống) và thuộc tầng **pages** (màn hình) của frontend.
`BusinessOperations.jsx` là khung trang (sidebar, topbar, tải dữ liệu). Các file còn lại là từng màn hình con:
cơ sở theo khu vực, khung giá theo nhóm kích thước, chính sách thuê chung, doanh thu & hiệu suất, và báo cáo / xuất CSV.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [BusinessOperations.jsx](./BusinessOperations.jsx) | Khung trang Business Operations: 6 mục menu, tải dữ liệu vận hành + báo cáo, thêm / sửa / ngừng hoạt động / xóa cơ sở, màn hình Tổng quan (`BusinessLiveDashboard`) | `src/App.jsx` (vai trò BUSINESS_OPERATIONS) | `GET /api/operations/state?email=`, `GET /api/operations/reports`, `POST /api/operations/facilities`, `PUT /api/operations/facilities/{id}`, `DELETE /api/operations/facilities/{id}` |
| [BusinessPanels.jsx](./BusinessPanels.jsx) | Các màn hình chỉ hiển thị: cơ sở theo khu vực, doanh thu & hiệu suất, trung tâm báo cáo + xuất CSV | `src/pages/business/BusinessOperations.jsx` | Không gọi API (nhận dữ liệu qua props) |
| [BusinessFacilityForm.jsx](./BusinessFacilityForm.jsx) | Modal sửa thông tin cơ sở (tên, địa chỉ, quản lý, trạng thái), có kiểm tra dữ liệu và tóm tắt thay đổi | `src/pages/business/BusinessOperations.jsx` | Không gọi API (trả dữ liệu qua `onSave`, cha gọi `PUT /api/operations/facilities/{id}`) |
| [BusinessPolicyEditor.jsx](./BusinessPolicyEditor.jsx) | Thiết lập chính sách chung (cọc, phí quá hạn & phụ phí, đặt chỗ & hủy, gia hạn & trả kho) theo phiên bản có ngày áp dụng | `src/pages/business/BusinessOperations.jsx` | `GET /api/policies`, `PUT /api/policies/{key}`, `GET /api/policies/{key}/history` |
| [BusinessPriceBands.jsx](./BusinessPriceBands.jsx) | Khung giá theo nhóm kích thước (S/M/L/V): khoảng diện tích và khoảng giá, quy tắc khóa | `src/pages/business/BusinessOperations.jsx` | `GET /api/price-bands`, `GET/POST /api/price-band-rules`, `PUT/DELETE /api/price-band-rules/{code}` |
| [BusinessCatalog.jsx](./BusinessCatalog.jsx) | CRUD danh mục Loại kho và Kích thước kho. **Hiện chưa được file nào import (code chưa dùng)** | (chưa có) | `GET/POST /api/unit-types`, `PUT/DELETE /api/unit-types/{id}`, `GET/POST /api/unit-sizes`, `PUT/DELETE /api/unit-sizes/{id}` (qua `api/catalogApi`) |
| [BusinessOperations.css](./BusinessOperations.css) | Giao diện khung trang, KPI, modal thêm cơ sở | `BusinessOperations.jsx` | — |
| [BusinessPanels.css](./BusinessPanels.css) | Giao diện các màn hình trong BusinessPanels.jsx (thẻ khu vực, thanh tỷ lệ, biểu đồ cột) | `BusinessPanels.jsx` | — |
| [BusinessCatalog.css](./BusinessCatalog.css) | Kiểu modal / ô nhập `.bc-*` dùng chung | `BusinessCatalog.jsx`, `BusinessFacilityForm.jsx` | — |
| [BusinessPolicyEditor.css](./BusinessPolicyEditor.css) | Giao diện form chính sách (`.pe-*`) | `BusinessPolicyEditor.jsx` | — |
| [BusinessPriceBands.css](./BusinessPriceBands.css) | Giao diện thẻ khung giá (`.pb-*`) | `BusinessPriceBands.jsx`, `src/pages/manager/ManagerPriceTable.jsx` | — |

## Các hàm / component chính

**BusinessOperations.jsx**
- `BusinessOperations({ currentUser, navigate, currentUserKey })` (export default): khung trang, giữ `activeMenu`, `operationState`, `reports`.
- `loadBusinessData({ silent })`: tải state và reports; `silent = true` thì tải ngầm sau mỗi thao tác.
- `runOperation(op, title)` / `showOperationError`: chạy 1 lệnh gọi API rồi tải lại ngầm, lỗi thì hiện pop-up.
- `updateFacility`, `deleteFacility`, `handleAddFacility`, `handleCloseAddFacility`, `handleLogout`.
- `autoUnitCodePrefix`: mã chi nhánh tự sinh từ tên cơ sở (`generateUnitCodePrefix`).
- `BusinessLiveDashboard` (nội bộ): màn hình Tổng quan (thẻ KPI + doanh thu theo tháng).

**BusinessPanels.jsx**
- `BusinessFacilitiesByArea`: gom cơ sở theo quận, tìm nhanh, phân trang 12 cơ sở / trang, nút Sửa / Tạm ngưng / Xóa.
- `BusinessPerformance`: thẻ KPI, biểu đồ cột doanh thu, bảng hiệu suất có ô sắp xếp.
- `BusinessReportsCenter`: 4 báo cáo (cơ sở, loại kho, doanh thu, trạng thái thuê), xuất 1 hoặc cả 4 file CSV.
- `downloadCsv(filename, headers, rows)`: tạo file CSV có BOM UTF-8 rồi tải về.
- `money`, `percent`, `PinIcon`, `OccupancyBar`: các hàm và thành phần hiển thị phụ trợ.

**BusinessFacilityForm.jsx**
- `BusinessFacilityForm` (export default): modal sửa cơ sở. `submit` kiểm tra dữ liệu → hỏi xác nhận kèm danh sách thay đổi → `onSave`.

**BusinessPolicyEditor.jsx**
- `BusinessPolicyEditor` (export): thanh tab và `load()` (`GET /api/policies` + `loadPolicies(true)`).
- `PolicyForm`: `validate`, `save` (`PUT`), `toggleHistory` (`GET history`).
- `DepositFields`, `OverdueFields`, `ReservationFields`, `RenewalReturnFields`: các ô nhập riêng của từng nhóm chính sách.
- `NumField`, `Choice`: ô nhập số và nhóm nút chọn. `TABS`, `today`, `clone`, `toNumber`: hằng số và hàm tiện ích.

**BusinessPriceBands.jsx**
- `BusinessPriceBands` (export default): `load`, `remove`, `toggleActive`. `canEdit` chỉ bật khi tải được điều kiện khóa.
- `PriceBandForm`: modal thêm / sửa nhóm, dùng `validateBand` và `bandHints` để kiểm tra ngay khi nhập.

**BusinessCatalog.jsx** (chưa dùng)
- `BusinessCatalog` (export default), `UnitTypeForm`, `UnitSizeForm`, `CatalogModal`, `Field`, `suggestedSizeLetter`.

## Kết nối với các phần khác

- **Import từ:**
  - `src/api/api` (apiGet / apiPost / apiPut / apiDelete), `src/api/catalogApi` (chỉ BusinessCatalog dùng)
  - `src/mappers/operationsState` (`mapOperationsState`)
  - `src/components/common/`: `Dialog`, `PriceInput`, `listKit`, `DataGrid`
  - `src/services/`: `storageRules`, `policies`, `priceBands`, `priceBandRules`
  - `src/utils/districts` (nhận diện và gom khu vực), `src/features/unit/unitTypes` (loại kho), `src/demoClock/demoClock` (ngày hiện tại theo đồng hồ demo)
- **Được import bởi:**
  - `src/App.jsx` import `BusinessOperations`
  - `src/pages/manager/ManagerPriceTable.jsx` import `BusinessPriceBands.css`
  - Các file khác trong folder chỉ được `BusinessOperations.jsx` import

## Luồng hoạt động

1. **Thêm cơ sở mới:** menu "Cơ sở toàn hệ thống" → "+ Thêm cơ sở" (`onAdd`) → nhập tên (mã chi nhánh tự sinh qua `autoUnitCodePrefix`), địa chỉ, chọn quản lý → "Tạo cơ sở" → `handleAddFacility` → `POST /api/operations/facilities` → `loadBusinessData` → đóng modal.
2. **Sửa / tạm ngưng cơ sở:** bấm "Sửa thông tin" → `BusinessFacilityForm` → `submit` (kiểm tra + xác nhận) → `onSave` → `updateFacility(..., { skipConfirm: true })` → `runOperation` → `PUT /api/operations/facilities/{id}` → tải lại ngầm. Nút "Tạm ngưng" gọi thẳng `updateFacility` và có hỏi xác nhận.
3. **Lưu phiên bản chính sách:** menu "Chính sách" → chọn tab → sửa ô (bật `dirty`) → chọn ngày áp dụng → "Lưu phiên bản mới" → `validate` → xác nhận → `PUT /api/policies/{key}` → `load()` tải lại và làm mới cache `services/policies`.
4. **Sửa khung giá:** menu "Kích thước & giá" → "Sửa khung" → `PriceBandForm` (kiểm tra bằng `validateBand`) → `PUT /api/price-band-rules/{code}` → `load()`.
5. **Xuất báo cáo:** menu "Báo cáo & xuất file" → chọn tab → "Xuất báo cáo này" → `downloadCsv` → trình duyệt tải về `storespace-<loại>-<ngày>.csv`.
