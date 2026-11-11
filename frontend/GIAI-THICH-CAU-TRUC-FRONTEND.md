# GIẢI THÍCH CẤU TRÚC THƯ MỤC FRONTEND (React + Vite)

Tài liệu này mô tả cách `frontend/src` đã được **sắp xếp lại theo tầng**, giống cách backend chia
`Controllers / Services / Repositories / Models / DTOs / Constants`.

> Quy tắc khi sắp xếp lại: **giữ nguyên tên file và toàn bộ nội dung code**, không tách / gộp file,
> không đổi tên hàm hay logic. Thay đổi code duy nhất là **đường dẫn `import`** (xem `BAO-CAO-THAY-DOI-CODE.md`).
> Mọi file JS/JSX đều có **khối chú thích đầu file** (công dụng, nơi dùng, API) và **chú thích cho từng hàm**.

## 1. Sơ đồ thư mục

```
frontend/
├── index.html                 # Trang HTML gốc, nạp /src/App.jsx
├── vite.config.js             # Cấu hình Vite (cổng 8080)
├── vercel.json                # Rewrite mọi đường dẫn về index.html (SPA)
├── .env                       # VITE_API_URL, VITE_ALLOW_SIMULATED_PAYMENT, VITE_EMAILJS_*
├── GIAI-THICH-CAU-TRUC-FRONTEND.md   # (tài liệu này)
├── LUONG-API-FRONTEND.md             # Luồng gọi API Frontend → Backend
├── BAO-CAO-THAY-DOI-CODE.md          # Danh sách dòng import đã sửa khi chuyển thư mục
└── src/
    ├── App.jsx                # ENTRY: khởi động app, Router, trang công khai, đăng nhập/đăng ký, đặt kho
    ├── api/                   # Tầng gọi HTTP tới backend (≈ client của Controllers)
    ├── services/              # Quy tắc nghiệp vụ thuần (≈ Services / Constants)
    ├── mappers/               # Chuyển JSON backend → object frontend (≈ DTOs)
    ├── hooks/                 # React hook dùng chung (danh sách phân trang ở backend)
    ├── store/                 # Dữ liệu lưu ở trình duyệt (giỏ hàng, bản nháp đặt kho)
    ├── utils/                 # Tiện ích tính toán thuần (khu vực, hình học kho, thuật toán xếp đồ)
    ├── demoClock/             # Đồng hồ giả lập ngày (demo / kiểm thử)
    ├── components/common/     # Component giao diện dùng chung, không gắn nghiệp vụ
    ├── features/              # Khối nghiệp vụ dùng lại ở nhiều trang / nhiều vai trò
    │   ├── unit/              #   loại kho, xem kho 3D, xếp đồ
    │   ├── facility/          #   bản đồ cơ sở, sơ đồ kho trong cơ sở
    │   ├── booking/           #   cách nhận kho, hủy đặt kho
    │   ├── payment/           #   xác nhận đặt cọc, trung tâm thanh toán
    │   ├── contract/          #   văn bản hợp đồng, ký, chi tiết, gia hạn
    │   ├── return/            #   trả kho, kiểm kho (khách / staff / manager)
    │   └── notification/      #   thông báo khách hàng, chuông header
    ├── pages/                 # Trang làm việc theo từng VAI TRÒ (route)
    │   ├── customer/          #   /customer, /cart
    │   ├── payment/           #   /payment-result
    │   ├── staff/             #   /staff
    │   ├── manager/           #   /manager
    │   ├── business/          #   /business
    │   └── admin/             #   /admin
    └── styles/                # CSS dùng chung (toàn cục / theo vai trò)
```

## 2. Đối chiếu với kiến trúc backend

| Backend (ASP.NET Core) | Frontend (thư mục mới) | Ghi chú |
|---|---|---|
| `Controllers/` (điểm vào API) | `api/` | Mọi request đi qua `api/api.js` → `apiGet/apiPost/apiPut/apiDelete` |
| `Services/` (quy tắc nghiệp vụ) | `services/` | Tính giá, cọc, chính sách, khung giá, thông báo... (không gọi DOM) |
| `DTOs/` (hình dạng dữ liệu) | `mappers/` | `mapOperationsState`, `mapUnit`, `mapReservation`, `mapContract` |
| `Constants/` | hằng số trong `services/storageRules.js`, `services/policies.js` | Nhãn trạng thái, kỳ hạn thuê, số tháng cọc |
| `Middleware/JwtIdentityMiddleware` | `api/api.js` (gắn `Authorization: Bearer`) | Hết hạn token → về `/login` |
| `BusinessClock` (ngày nghiệp vụ) | `demoClock/` (header `X-Simulated-Date`) | Giả lập ngày để demo |
| (giao diện) | `components/`, `features/`, `pages/` | Chỉ có ở frontend |

**Chiều phụ thuộc** (file ở trên chỉ import file ở dưới, không import ngược):

```
pages/*  →  features/*  →  components/common  →  services / mappers / hooks / store / utils  →  api/api.js  →  Backend
```

## 3. Luồng chạy khi mở trang

1. `index.html` nạp `src/App.jsx`.
2. `App.jsx` gọi `loadDataFromApi()` → `GET /api/catalog/state` → lưu danh sách cơ sở + kho.
3. Render `<DialogProvider><Router/><DemoClockWidget/></DialogProvider>`.
4. `Router` đọc URL (`getRoute()`) và vai trò người dùng (localStorage `storespace_current_user`), rồi hiển thị:
   - trang công khai (chủ, cơ sở, kho, tìm kiếm, đặt kho, giỏ kho, đăng nhập/đăng ký/OTP) — nằm trong `App.jsx`;
   - hoặc dashboard theo vai trò trong `pages/`:

| Vai trò (role frontend) | Route | Component |
|---|---|---|
| `customer` | `/customer` | `pages/customer/CustomerAccount.jsx` (`CustomerDashboard`) |
| `FACILITY_STAFF` | `/staff` | `pages/staff/FacilityStaffAccount.jsx` (`StaffPortal`) |
| `FACILITY_MANAGER` | `/manager` | `pages/manager/FacilityManagerAccount.jsx` (`FacilityManagerDashboard`) |
| `BUSINESS_OPERATIONS` | `/business` | `pages/business/BusinessOperations.jsx` |
| `SYSTEM_ADMIN` | `/admin` | `pages/admin/AdminAccount.jsx` |
| (mọi người) | `/payment-result` | `pages/payment/PaymentResultPage.jsx` (VNPay trả về) |
| (mọi người) | `/cart` | `pages/customer/CartPage.jsx` |

5. Danh mục kho được làm mới 15 giây/lần (dừng khi tab ẩn).

## 4. Code chưa dùng (giữ nguyên, chỉ ghi chú)

- `pages/business/BusinessCatalog.jsx` — không file nào import.
- `api/catalogApi.js` — chỉ được `BusinessCatalog.jsx` import, nên cũng chưa dùng.

Hai file vẫn build được bình thường; đầu mỗi file đã có dòng cảnh báo **⚠ CODE CHƯA DÙNG**.

## 5. Cách đọc chú thích trong code

- **Đầu mỗi file**: khối `/** ===== FILE: ... ===== */` mô tả công dụng, các API file đó gọi, file nào dùng nó.
- **Trước mỗi hàm / component / hook**: khối `/** ... */` (hàm cấp file) hoặc `// ...` (hàm nhỏ bên trong component)
  mô tả công dụng, tham số (`@param`), giá trị trả về (`@returns`) và **API** gọi tới (nếu có).
- **Đầu mỗi file CSS**: ghi file đó là CSS của component nào và được import ở đâu.
- Các chú thích cũ của nhóm (`[THÊM]`, `[SỬA]`, `[DEMO CLOCK]`...) được giữ nguyên.

## 6. Danh sách file theo thư mục

#### `src/`

| File | Công dụng |
|---|---|
| `App.jsx` | ĐIỂM KHỞI ĐỘNG (ENTRY) + BỘ ĐỊNH TUYẾN + CÁC TRANG CÔNG KHAI / ĐĂNG NHẬP / ĐẶT KHO |

#### `src/api/`

| File | Công dụng |
|---|---|
| `api.js` | TẦNG GỌI HTTP (HTTP CLIENT) DÙNG CHUNG CHO TOÀN BỘ FRONTEND |
| `catalogApi.js` | API DANH MỤC LOẠI KHO / KÍCH THƯỚC KHO / GIÁ THUÊ |
| `contractEmail.js` | GỬI HỢP ĐỒNG THUÊ KHO QUA EMAIL |
| `lateFees.js` | API PHÍ TRỄ HẠN TIỀN THUÊ (phía KHÁCH HÀNG) |
| `otpService.js` | API ĐĂNG KÝ TÀI KHOẢN BẰNG MÃ OTP QUA EMAIL |
| `vnpay.js` | API THANH TOÁN QUA CỔNG VNPAY (SANDBOX) |

#### `src/services/`

| File | Công dụng |
|---|---|
| `afterDeposit.js` | XỬ LÝ SAU KHI ĐẶT CỌC / GIA HẠN & ĐIỀU HƯỚNG GIỮA CÁC TAB KHÁCH HÀNG |
| `contractSignatures.js` | TIỆN ÍCH HIỂN THỊ CHỮ KÝ HỢP ĐỒNG |
| `customerNoticeData.js` | TÍNH DANH SÁCH THÔNG BÁO CHO KHÁCH HÀNG (chỉ ở frontend) |
| `policies.js` | CHÍNH SÁCH KINH DOANH (CỌC, PHÍ QUÁ HẠN, ĐẶT CHỖ/HỦY, GIA HẠN/TRẢ KHO) |
| `priceBandRules.js` | QUY TẮC KIỂM TRA KHI TẠO/SỬA KHUNG GIÁ (NHÓM SIZE) |
| `priceBands.js` | KHUNG GIÁ THEO NHÓM KÍCH THƯỚC (S / M / L / V ...) |
| `pricing.js` | TÍNH TIỀN THUÊ & TIỀN CỌC Ở FRONTEND (để báo giá hiển thị) |
| `storageRules.js` | QUY TẮC NGHIỆP VỤ DÙNG CHUNG (KHÔNG GỌI API) |

#### `src/mappers/`

| File | Công dụng |
|---|---|
| `operationsState.js` | CHUYỂN ĐỔI DỮ LIỆU VẬN HÀNH TỪ BACKEND SANG DẠNG FRONTEND DÙNG |

#### `src/hooks/`

| File | Công dụng |
|---|---|
| `opsLists.js` | HOOK DANH SÁCH VẬN HÀNH CÓ PHÂN TRANG Ở BACKEND (Staff / Manager dùng chung) |

#### `src/store/`

| File | Công dụng |
|---|---|
| `bookingDraft.js` | BẢN NHÁP ĐẶT KHO CỦA KHÁCH CHƯA ĐĂNG NHẬP (localStorage, sống 24 giờ) |
| `cart.js` | GIỎ HÀNG THUÊ KHO (lưu ở localStorage, dùng được cả khi chưa đăng nhập) |

#### `src/utils/`

| File | Công dụng |
|---|---|
| `districts.js` | TÁCH KHU VỰC (QUẬN / HUYỆN / TP. THỦ ĐỨC...) TỪ ĐỊA CHỈ CƠ SỞ |
| `packing.js` | THUẬT TOÁN XẾP ĐỒ TRONG KHO (3D BIN PACKING) CHO TRÌNH XEM KHO 3D |
| `unitGeometry.js` | TÍNH KÍCH THƯỚC HÌNH HỌC CỦA KHO TỪ CHUỖI SIZE |

#### `src/demoClock/`

| File | Công dụng |
|---|---|
| `DemoClockWidget.jsx` | NÚT NỔI "GIẢ LẬP NGÀY HỆ THỐNG" (DEMO TIME TRAVEL) |
| `demoClock.js` | TIỆN ÍCH "ĐỒNG HỒ GIẢ LẬP" (DEMO CLOCK / TIME TRAVEL) |
| `DemoClockWidget.css` | CSS của component cùng tên |

#### `src/components/common/`

| File | Công dụng |
|---|---|
| `DataGrid.jsx` | BẢNG DỮ LIỆU DÙNG CHUNG (sắp xếp, tìm kiếm, lọc, phân trang ở frontend) |
| `Dialog.jsx` | HỘP THOẠI (POP-UP) THÔNG BÁO / XÁC NHẬN DÙNG CHUNG TOÀN APP |
| `PriceInput.jsx` | Ô NHẬP GIÁ THUÊ THEO THÁNG (VNĐ) |
| `RentalCalendar.jsx` | LỊCH CHỌN NGÀY BẮT ĐẦU THUÊ KHO |
| `listKit.jsx` | BỘ CÔNG CỤ DANH SÁCH DÙNG CHUNG CHO MỌI VAI TRÒ |
| `DataGrid.css` | CSS của component cùng tên |
| `Dialog.css` | CSS của component cùng tên |
| `PriceInput.css` | CSS của component cùng tên |
| `RentalCalendar.css` | CSS của component cùng tên |
| `listKit.css` | CSS của component cùng tên |

#### `src/features/unit/`

| File | Công dụng |
|---|---|
| `ThreeUnitScene.jsx` | CẢNH 3D CỦA MỘT KHO BẰNG THƯ VIỆN THREE.JS |
| `Unit3DViewer.jsx` | CỬA SỔ XEM KHO DẠNG 3D |
| `UnitPackPlanner.jsx` | 2 CHẾ ĐỘ 3D TRONG CỬA SỔ XEM KHO |
| `unitTypes.jsx` | NHẬN DIỆN LOẠI KHO & KÍCH THƯỚC KHO DÙNG CHUNG CHO GIAO DIỆN |
| `Unit3DViewer.css` | CSS của component cùng tên |
| `UnitPackPlanner.css` | CSS của component cùng tên |
| `unitTypes.css` | CSS của component cùng tên |

#### `src/features/facility/`

| File | Công dụng |
|---|---|
| `FacilityFloorPlan.jsx` | SƠ ĐỒ KHO BÊN TRONG MỘT CƠ SỞ (trang chi tiết cơ sở) |
| `FacilityMap.jsx` | BẢN ĐỒ VỊ TRÍ CÁC CƠ SỞ LƯU TRỮ (Leaflet + OpenStreetMap) |
| `FacilityUnitsMap.jsx` | BẢN ĐỒ CÁC KHO BÊN TRONG 1 CƠ SỞ (vẽ trên bản đồ thật Leaflet) |
| `FacilityFloorPlan.css` | CSS của component cùng tên |
| `FacilityMap.css` | CSS của component cùng tên |
| `FacilityUnitsMap.css` | CSS của component cùng tên |

#### `src/features/booking/`

| File | Công dụng |
|---|---|
| `CancelReservation.jsx` | KHÁCH HỦY ĐẶT KHO (đã cọc, chưa nhận kho) + HOÀN CỌC |
| `HandoverChoice.jsx` | CHỌN CÁCH NHẬN KHO + KHUNG GIỜ NHẬN KHO |
| `CancelReservation.css` | CSS của component cùng tên |
| `HandoverChoice.css` | CSS của component cùng tên |

#### `src/features/payment/`

| File | Công dụng |
|---|---|
| `DepositConfirm.jsx` | KHUNG "XÁC NHẬN ĐẶT CỌC" ĐẶT NGAY TRÊN NÚT THANH TOÁN |
| `PendingPayments.jsx` | TRUNG TÂM THANH TOÁN & HÓA ĐƠN CỦA KHÁCH HÀNG |
| `DepositConfirm.css` | CSS của component cùng tên |
| `PendingPayments.css` | CSS của component cùng tên |

#### `src/features/contract/`

| File | Công dụng |
|---|---|
| `ContractCard.jsx` | THẺ HỢP ĐỒNG Ở TAB "HỢP ĐỒNG" CỦA KHÁCH |
| `ContractDetailModal.jsx` | CHI TIẾT HỢP ĐỒNG CHO KHÁCH (xem ở mọi trạng thái) |
| `ContractDocument.jsx` | VĂN BẢN HỢP ĐỒNG THUÊ KHO (dùng chung cho màn hình ký & xem chi tiết) |
| `ContractModal.jsx` | HỘP THOẠI HỢP ĐỒNG THUÊ KHO (bản giao diện cũ, dạng các mục thu gọn) |
| `ContractRenewal.jsx` | GIA HẠN HỢP ĐỒNG (phía KHÁCH HÀNG) |
| `ContractSignFlow.jsx` | KÝ HỢP ĐỒNG / PHỤ LỤC GIA HẠN ONLINE (3 BƯỚC) |
| `SignaturePad.jsx` | KHUNG KÝ TAY (vẽ chữ ký bằng chuột / ngón tay trên canvas) |
| `ContractCard.css` | CSS của component cùng tên |
| `ContractRenewal.css` | CSS của component cùng tên |
| `ContractSignFlow.css` | CSS của component cùng tên |

#### `src/features/return/`

| File | Công dụng |
|---|---|
| `ReturnInspection.jsx` | KIỂM KHO KHI TRẢ: ẢNH + KHÁCH XÁC NHẬN / KHIẾU NẠI TRƯỚC KHI TRỪ CỌC |
| `StaffReturns.jsx` | NHÂN VIÊN: TRẢ KHO & KIỂM KHO |
| `UnitReturn.jsx` | TRẢ KHO (phía KHÁCH HÀNG) |
| `ReturnInspection.css` | CSS của component cùng tên |
| `UnitReturn.css` | CSS của component cùng tên |

#### `src/features/notification/`

| File | Công dụng |
|---|---|
| `CustomerNotifications.jsx` | TRANG "THÔNG BÁO" CỦA KHÁCH + KHỐI "THÔNG BÁO MỚI" |
| `HeaderNotificationBell.jsx` | CHUÔNG THÔNG BÁO Ở HEADER (chỉ với tài khoản KHÁCH HÀNG) |
| `CustomerNotifications.css` | CSS của component cùng tên |
| `HeaderNotificationBell.css` | CSS của component cùng tên |

#### `src/pages/customer/`

| File | Công dụng |
|---|---|
| `CartPage.jsx` | TRANG GIỎ KHO (route /cart): ĐẶT NHIỀU KHO CÙNG LÚC |
| `CustomerAccount.jsx` | TRANG TÀI KHOẢN KHÁCH HÀNG (route /customer) |
| `CartPage.css` | CSS của component cùng tên |
| `CustomerAccount.css` | CSS của component cùng tên |

#### `src/pages/payment/`

| File | Công dụng |
|---|---|
| `PaymentResultPage.jsx` | TRANG KẾT QUẢ THANH TOÁN VNPAY (/payment-result?vnp_...) |
| `PaymentResultPage.css` | CSS của component cùng tên |

#### `src/pages/staff/`

| File | Công dụng |
|---|---|
| `FacilityStaffAccount.jsx` | TRANG LÀM VIỆC CỦA NHÂN VIÊN CƠ SỞ (Facility Staff, route /staff) |

#### `src/pages/manager/`

| File | Công dụng |
|---|---|
| `FacilityManagerAccount.jsx` | TRANG LÀM VIỆC CỦA QUẢN LÝ CƠ SỞ (Facility Manager, route /manager) |
| `ManagerNav.jsx` | MENU TRÁI CỦA FACILITY MANAGER (gom nhóm theo loại việc + số việc chờ) |
| `ManagerPriceTable.jsx` | FACILITY MANAGER: BẢNG GIÁ CỦA CƠ SỞ |
| `ManagerNav.css` | CSS của component cùng tên |

#### `src/pages/business/`

| File | Công dụng |
|---|---|
| `BusinessCatalog.jsx` | DANH MỤC LOẠI KHO & KÍCH THƯỚC KHO (CRUD) |
| `BusinessFacilityForm.jsx` | FORM SỬA THÔNG TIN CƠ SỞ (Business Operations) |
| `BusinessOperations.jsx` | TRANG LÀM VIỆC CỦA BUSINESS OPERATIONS MANAGER (route /business) |
| `BusinessPanels.jsx` | CÁC MÀN HÌNH CỦA BUSINESS OPERATIONS MANAGER (phần hiển thị) |
| `BusinessPolicyEditor.jsx` | BUSINESS OPERATIONS: THIẾT LẬP CHÍNH SÁCH CHUNG |
| `BusinessPriceBands.jsx` | BUSINESS OPERATIONS: KHUNG GIÁ THEO NHÓM KÍCH THƯỚC (S/M/L/V...) |
| `BusinessCatalog.css` | CSS của component cùng tên |
| `BusinessOperations.css` | CSS của component cùng tên |
| `BusinessPanels.css` | CSS của component cùng tên |
| `BusinessPolicyEditor.css` | CSS của component cùng tên |
| `BusinessPriceBands.css` | CSS của component cùng tên |

#### `src/pages/admin/`

| File | Công dụng |
|---|---|
| `AdminAccount.jsx` | TRANG QUẢN TRỊ HỆ THỐNG (System Admin, route /admin) |
| `AdminAccount.css` | CSS của component cùng tên |

#### `src/styles/`

| File | Công dụng |
|---|---|
| `fmanagerstyles.css` | CSS dùng chung |
| `staffstyles.css` | CSS dùng chung |
| `styles.css` | CSS dùng chung |
