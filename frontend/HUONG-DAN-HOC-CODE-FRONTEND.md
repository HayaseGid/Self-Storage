# HƯỚNG DẪN HỌC CODE FRONTEND (React + Vite)

Tài liệu tổng để **học code frontend từ đầu**: thư mục nào chứa gì, file nào phục vụ file nào, các phần kết nối
với nhau ra sao, và **các luồng nghiệp vụ** đi qua những file / hàm nào.

> **Cách học đề xuất:** đọc mục 1 → 3 để nắm khung, sau đó chọn 1 luồng ở mục 5 và mở từng file theo thứ tự bước.
> Mỗi folder trong `src/` có **README.md** riêng (bảng file, hàm chính, kết nối, luồng), và mỗi file `.js/.jsx`
> có **khối mô tả đầu file** (`FILE: … CHỨC NĂNG / THÀNH PHẦN CHÍNH / DÙNG Ở / PHỤ THUỘC / API / LUỒNG`)
> cùng **chú thích cho từng hàm** (làm gì, tham số, trả về, gọi API nào, ai gọi / khi nào chạy).
>
> Tài liệu cũ vẫn còn: [GIAI-THICH-CAU-TRUC-FRONTEND.md](./GIAI-THICH-CAU-TRUC-FRONTEND.md) (cấu trúc, bản trước khi có
> các file 3D / Web Worker mới) và [LUONG-API-FRONTEND.md](./LUONG-API-FRONTEND.md) (bảng đầy đủ endpoint ↔ nơi gọi).

---

## 1. Bức tranh chung

- **Công nghệ:** React 18 (hàm + hook), Vite (dev server cổng 8080), không dùng React Router — tự viết `getRoute()`.
- **Điểm vào:** `index.html` nạp [`src/App.jsx`](./src/App.jsx). File này vừa là bộ khởi động, vừa là bộ định tuyến,
  vừa chứa các trang công khai.
- **Gọi backend:** mọi request đi qua [`src/api/api.js`](./src/api/api.js) (`apiGet / apiPost / apiPut / apiDelete`),
  tự gắn token JWT và ngày giả lập (`X-Simulated-Date`). Địa chỉ backend lấy từ `VITE_API_URL` trong `.env`.
- **Lưu ở trình duyệt:**
  - localStorage: người dùng đăng nhập (`storespace_current_user`), giỏ hàng (`storespace_cart`), ngày giả lập
    (`storespace_demo_date`), thông báo đã xem, nhãn "Mới" đã xem, chế độ xem bảng/thẻ...
  - sessionStorage: kho đang giữ khi đặt (`storespace_active_booking_hold`), đăng ký đang chờ OTP
    (`storespace_register_pending`), giao dịch VNPay đang chờ, số đồ khách nhập (`storespace.boxCounts`),
    yêu cầu mở tab / ký hợp đồng giữa các trang.

## 2. Sơ đồ thư mục `src/` (mỗi folder có README)

```
src/
├── App.jsx                 ĐIỂM VÀO + Router + trang công khai (chủ, cơ sở, kho, tìm kho, đặt kho, đăng nhập/đăng ký)
├── pages/        README    Trang theo VAI TRÒ
│   ├── customer/           /customer (tài khoản khách), /cart (giỏ hàng, đặt nhiều kho, đặt cọc)
│   ├── staff/              /staff   (nhân viên: việc được giao, bàn giao kho, trạng thái kho)
│   ├── manager/            /manager (quản lý 1 cơ sở: kho, đặc tính, giá, nhân sự, hợp đồng, công nợ, sự cố, kiểm kho)
│   ├── business/           /business (kinh doanh: cơ sở, khung giá, chính sách, báo cáo)
│   ├── admin/              /admin   (quản trị: duyệt / khóa / đổi vai trò tài khoản, nhật ký)
│   └── payment/            /payment-result (VNPay trả về)
├── features/     README    Khối NGHIỆP VỤ dùng lại ở nhiều trang
│   ├── unit/               loại kho & ảnh kho, xem kho 3D, tự xếp thùng, gợi ý kho vừa với đồ
│   ├── facility/           bản đồ cơ sở (Leaflet), sơ đồ kho trong cơ sở
│   ├── booking/            chọn cách nhận kho, hủy đặt kho & hoàn cọc
│   ├── payment/            xác nhận đặt cọc, thanh nhắc đơn chưa cọc, trung tâm thanh toán
│   ├── contract/           văn bản hợp đồng, ký tay, chi tiết, gia hạn
│   ├── return/             trả kho & kiểm kho (khách / nhân viên / quản lý)
│   └── notification/       thông báo khách hàng, chuông trên header
├── components/   README
│   └── common/             DataGrid, listKit (Pager 5 mục/trang...), Dialog, PriceInput, RentalCalendar
│   └── support/            liên hệ hỗ trợ: gửi tin nhắn qua email (Brevo)
├── api/          README    gọi HTTP: api.js (lõi), vnpay, otpService, contractEmail, lateFees, catalogApi
├── services/     README    quy tắc nghiệp vụ thuần: storageRules, policies, pricing, priceBands, priceBandRules,
│                           afterDeposit, customerNoticeData, contractSignatures
├── mappers/      README    operationsState.js: JSON /api/operations/state → object frontend
├── hooks/        README    opsLists.js: useOpsList (danh sách vận hành phân trang ở backend)
├── store/        README    cart.js (giỏ hàng), bookingDraft.js (bản nháp đặt kho khi chưa đăng nhập)
├── utils/        README    districts, unitGeometry, packing (thuật toán xếp đồ), packing.worker, packingClient
├── demoClock/    README    ngày giả lập cho demo (demoClock.js + DemoClockWidget)
└── styles/       README    CSS dùng chung: styles.css, fmanagerstyles.css, staffstyles.css
```

## 3. Chiều phụ thuộc (ai import ai)

```
App.jsx / pages/*                       (trang)
      │
      ▼
features/*                               (khối nghiệp vụ)
      │
      ▼
components/common                        (giao diện dùng chung)
      │
      ▼
services / mappers / hooks / store / utils   (logic, dữ liệu, tính toán)
      │
      ▼
api/api.js  ──(fetch + JWT + X-Simulated-Date)──►  Backend ASP.NET Core
      ▲
demoClock (ngày giả lập, gắn vào mọi request)
```

- File ở tầng trên chỉ import tầng dưới. Ngoại lệ có chủ đích: `api/contractEmail.js` dùng `contractUnits` của
  `features/contract/ContractDocument.jsx`; một số feature dùng lẫn nhau (vd `payment/` dùng `booking/CancelReservation`,
  `notification/` dùng `contract/`, `return/`, `payment/`).
- **File được dùng nhiều nhất:** `services/storageRules.js` (hằng số, nhãn trạng thái, định dạng tiền...),
  `api/api.js`, `components/common/Dialog.jsx` (`useDialog` thay `alert/confirm`), `components/common/listKit.jsx`.

### Bảng "folder này phục vụ ai"

| Folder | Được dùng bởi |
|---|---|
| `api/` | App.jsx, mọi trang trong `pages/`, các feature booking / contract / facility / payment / return, `services/afterDeposit`, `services/policies`, `store/cart`, `components/common/listKit` |
| `services/` | App.jsx, `api/contractEmail`, `mappers`, `components/common/PriceInput`, `utils/unitGeometry`, mọi trang, mọi feature |
| `store/` | App.jsx, `pages/customer/CartPage`, `pages/payment/PaymentResultPage` |
| `hooks/` | `pages/manager/FacilityManagerAccount`, `pages/staff/FacilityStaffAccount` |
| `mappers/` | `hooks/opsLists`, trang manager / staff / business |
| `utils/` | `features/unit`, `features/facility`, App.jsx, `features/contract`, `pages/business` |
| `demoClock/` | `api/api` (mọi request), `services/storageRules`, `services/customerNoticeData`, `RentalCalendar`, App.jsx, CartPage, trang manager / staff / business, ContractCard, StaffReturns |
| `components/common/` | Hầu hết trang và feature (xem README của folder) |
| `features/unit` | App.jsx (tìm kho, chi tiết kho), `features/facility`, trang customer / business / manager |
| `features/facility` | App.jsx (danh sách / chi tiết cơ sở) |
| `features/booking` | App.jsx, CartPage, CustomerAccount, `features/payment`, `features/contract` |
| `features/payment` | App.jsx, CartPage, CustomerAccount, `features/contract`, `features/notification` |
| `features/contract` | CustomerAccount, FacilityManagerAccount, `api/contractEmail`, `features/notification`, `features/payment` |
| `features/return` | CustomerAccount, FacilityStaffAccount, FacilityManagerAccount, `features/notification` |
| `features/notification` | App.jsx (chuông + thanh nhắc trên header), CustomerAccount |

## 4. Khởi động và định tuyến

1. `index.html` chạy `App.jsx`. `loadDataFromApi()` gọi **`GET /api/catalog/state`**, ghi danh sách cơ sở vào biến
   `facilities` và kho vào `storageUnits` (biến cấp module, không phải state React), gọi `setCatalogPricing()`.
2. Render `<DialogProvider><Router/><DemoClockWidget/></DialogProvider>`. Lỗi tải danh mục → màn hình `ApiStartupError`.
3. `Router()` tự làm mới danh mục **15 giây/lần** (dừng khi tab ẩn; làm mới ngay khi quay lại tab / chuyển trang nếu đã
   quá 3 giây). Dữ liệu đổi (so chuỗi JSON) thì gọi `setRoute(getRoute())` để vẽ lại.
4. `getRoute()` đọc URL; `navigate(path)` đổi URL bằng `history.pushState` rồi phát sự kiện `popstate`.

| URL | Component | Điều kiện |
|---|---|---|
| `/` (và URL lạ) | `HomePage` | — |
| `/login`, `/register`, `/verify-otp` | `LoginPage`, `RegisterPage`, `VerifyOtpPage` | — |
| `/search` | `SearchPage` | bộ lọc nằm trên URL |
| `/facilities` | `FacilitiesPage` | `?district=` lọc khu vực |
| `/facilities/{slug}` | `FacilityDetailPage` | — |
| `/facilities/{slug}/unit/{mã}` | `UnitDetailPage` | kho hết chỗ → về trang cơ sở |
| `/facilities/{slug}/unit/{mã}/booking` | `BookingPage` | phải đăng nhập là khách; kho hết chỉ vào được nếu chính khách đang giữ |
| `/cart` | `CartRoute` → `pages/customer/CartPage` | không phải khách → trang vai trò |
| `/customer` | `CustomerPage` → `pages/customer/CustomerAccount` | phải đăng nhập là khách |
| `/staff` | `pages/staff/FacilityStaffAccount` (`StaffPortal`) | FACILITY_STAFF |
| `/manager` | `pages/manager/FacilityManagerAccount` (`FacilityManagerDashboard`) | FACILITY_MANAGER |
| `/business` | `pages/business/BusinessOperations` | BUSINESS_OPERATIONS |
| `/admin` | `pages/admin/AdminAccount` | SYSTEM_ADMIN |
| `/payment-result` | `pages/payment/PaymentResultPage` | VNPay trả về |

## 5. Các luồng nghiệp vụ chính (file → hàm → API)

### 5.1 Xem danh mục và tìm kho
1. Trang chủ / Tìm kho (`App.jsx › HomePage, SearchPage`): bộ lọc nằm trên URL (`q, district, type, size, price, all, items, cs`).
2. Bấm ô lọc → `go()` → `buildUrl()` → `navigate()` → `Router` vẽ lại → `unitMatches()` lọc từng kho, `countWith()` đếm số trên ô lọc.
3. Lọc theo đồ cần gửi: `ItemCountsInput` (features/unit) → `useBoxFit()` (ước tính ngay, rồi xếp thử thật trong Web Worker
   `utils/packing.worker.js` qua `utils/packingClient.js`) → số đồ được nhớ bằng `saveBoxCounts()`.
4. Thẻ kho `UnitCard` (ảnh thật `UnitTypeArt`) → `UnitDetailPage`. Bản đồ: `features/facility/FacilityMap` (**`GET /api/facility-locations`**).

### 5.2 Xem kho 3D và tự xếp thùng (không gọi API)
`UnitDetailPage` / `FacilityFloorPlan` → `features/unit/Unit3DViewer` (3 tab) → tab "Tự xếp thùng" `PackPlanner`
→ nhập đồ (`ItemCountsInput`) → "Xếp thử" → `packChannel.run('autoPack')` → worker chạy `utils/packing.js › autoPack()`
(Extreme Point Best-Fit) → `ThreeUnitScene` vẽ lại. Sidebar: `useBoxFit` (kho vừa trong cơ sở / cơ sở khác) và
`useSplitPack` (bảng 2 lựa chọn: thuê thêm 1 kho hoặc đổi kho lớn hơn → `handleAddManyToCart` / đổi kho).

### 5.3 Đăng ký (OTP) và đăng nhập
1. `RegisterPage.sendRegistrationOtp` → `api/otpService` → **`POST /api/auth/register/start`** → sessionStorage `storespace_register_pending` → `/verify-otp`.
2. `VerifyOtpPage.verifyOtp` → **`POST /api/auth/register/verify`** (gửi lại: `/register/resend`) → `/login?next=`.
3. `LoginPage.login` → `loginAndStoreUser()` → **`POST /api/auth/login`** → lưu `storespace_current_user` → `goAfterAuth()`:
   nhân viên về trang vai trò (`roleHome`), khách quay lại trang đặt kho đang dở (bản nháp `store/bookingDraft`).

### 5.4 Đặt 1 kho → đặt cọc
1. `UnitDetailPage.handleBookClick` (chưa đăng nhập → `promptLoginForBooking` lưu nháp).
2. `BookingPage.handleConfirmBooking` → **`GET /api/catalog/availability`** → **`POST /api/reservation`** → đơn *Pending Deposit*, giữ kho N phút.
3. `BookingPage.handleDepositPaid` → `api/vnpay › startVnPayPayment` → **`POST /api/vnpay/create`** → sang VNPay →
   `/payment-result` → `PaymentResultPage` → **`GET /api/vnpay/return-verify`**. Demo: **`POST /api/payment/confirm`**.
4. `services/afterDeposit › confirmAfterDeposit` → **`POST /api/reservation-confirmations/mine`** (tạo hợp đồng) →
   `announceDepositSuccess` → `openCustomerSection('contract')` → CustomerAccount mở tab Hợp đồng.

### 5.5 Đặt nhiều kho từ giỏ hàng
`handleAddToCart` → `store/cart › addToCart` (lưu trình duyệt, tối đa 10 kho, mỗi lần đặt tối đa 5 kho cùng cơ sở)
→ `/cart` → `CartPage.checkout()` (mỗi kho **`POST /api/reservation`**) → `payDeposit()` (VNPay gộp / demo từng đơn)
→ như 5.4 bước 4. Rời trang khi chưa trả: `cancelHeldReservations` (**`POST /api/reservation-cancellations/{id}`**) + `restoreToCart`.

### 5.6 Hủy đặt kho và hoàn cọc
`features/booking/CancelReservation`: **`GET /api/reservation-cancellations/{id}/quote`** → chọn lý do →
**`POST /api/reservation-cancellations/{id}`** → hoàn tiền; lỗi hoàn → `retryRefund` (**`/refund-retry`**).

### 5.7 Ký hợp đồng
CustomerAccount `ContractPage` → `features/contract/ContractSignFlow` (xem `ContractDocument` → tick điều khoản từ
`services/policies` → `SignaturePad` + họ tên) → `signGroupContracts` → **`POST /api/contracts/{id}/signature`** →
`api/contractEmail › sendContractEmail` (**`POST /api/email/send-contract`**) → `ContractDetailModal`.
*Lưu ý:* nút "✍ Ký hợp đồng" trên `ContractCard` vẫn mở `ContractModal` (giao diện cũ, điều khoản cố định).

### 5.8 Nhận bàn giao kho (nhân viên)
`pages/staff/FacilityStaffAccount › StaffPortal.loadState`: **`GET /api/operations/state`** → **`POST /api/manager-tools/facilities/{id}/auto-assign`**
→ **`POST /api/late-fees/facilities/{id}/sync`** → **`GET /api/staff-tools/tasks`** → chọn đơn → `checkHandover` →
**`POST /api/staff-tools/handover`** (backend tự sinh mã ra vào 6 số cho khách).

### 5.9 Tiền thuê định kỳ, phí trễ, gia hạn
- Tiền thuê: `api/lateFees › useLateFees` (**`GET /api/late-fees/mine`**) → `CustomerPaymentCenter` / `ContractCard.payRent`
  → **`POST /api/vnpay/create`** (kind `rent`).
- Gia hạn (chỉ **gói 6 hoặc 12 tháng**, backend `ContractRenewalsController.AllowedMonths`): `features/contract/ContractRenewal` → **`GET /api/contract-renewals/mine`** → `RenewalModal` →
  **`POST /api/contract-renewals`** → `payRenewal` (VNPay / pay-demo) → `finishRenewal` (**`/finalize`**) → ký phụ lục.

### 5.10 Trả kho và kiểm kho
1. Khách: `features/return/UnitReturn › ReturnRequestModal` → **`GET /api/unit-returns/{id}/slots`** → **`POST /api/unit-returns`**.
2. Nhân viên: `StaffReturns` → **`POST /api/unit-returns/staff/{id}/start`** → `InspectForm` (công nợ **`GET /api/late-fees/returns/{id}/preview`**) → **`/complete`**.
3. Quản lý: `ReturnInspection › ManagerReturnInspectionsTab` → **`POST /api/return-inspections/{id}/approve`** (hoặc `/resolve` khi khiếu nại).
4. Khách: `CustomerInspectionBox` → **`/accept`** hoặc **`/dispute`**; còn nợ → `payReturnFees` (VNPay kind `fee` / demo).

### 5.10b Trả kho sớm (hợp đồng còn hơn 30 ngày)
1. Khách: nút "Trả kho sớm" (khi `/api/unit-returns/mine` trả `mode = 'early'`) → `features/return/EarlyReturn › EarlyReturnModal`
   → tiền dự kiến **`GET /api/unit-returns/early/{id}/quote?date=`** → **`POST /api/unit-returns/early`** → thẻ "Chờ Quản lý duyệt" (`EarlyRequestCard`, rút đơn **`/early/{id}/cancel`**).
2. Manager: mục "Trả kho sớm" (`ManagerEarlyReturnsTab`) → **`POST /api/unit-returns/early/{id}/approve`** (hủy / hoàn kỳ sau ngày trả + tạo lịch trả kho) hoặc **`/reject`** (bắt buộc lý do).
3. Đã duyệt → đi tiếp luồng 5.10 từ bước 2 (nhân viên nhận lại kho). Không phí chấm dứt sớm; trả theo tháng gửi muộn hơn N ngày trước kỳ đóng tiền thì phải đóng cả kỳ đó.

### 5.11 Thông báo khách hàng (không có API riêng)
`services/customerNoticeData › useCustomerNotifications` tính thông báo từ dữ liệu đơn, gia hạn, chính sách, trả kho, kiểm kho.
`features/notification/HeaderNotificationBell` (chuông, bộ đệm 15 giây) → bấm → `openNoticeTarget` → `/customer` đúng tab.
Trạng thái "đã xem" lưu localStorage theo email.

### 5.12 Quản lý cơ sở / kinh doanh / quản trị
- Manager: `FacilityManagerAccount › loadState` (**`GET /api/operations/state`** → `mapOperationsState`), các bảng dùng
  `hooks/opsLists › useOpsList` (**`GET /api/operations/reservations | units | contracts`**); tạo kho **`POST /api/operations/units`**;
  bảng giá `ManagerPriceTable` (**`PUT /api/operations/facilities/{id}/rates`**); đổi người phụ trách **`PUT /api/manager-tools/reservations/{id}/owner`**.
- Business: `BusinessOperations` (cơ sở **`POST/PUT/DELETE /api/operations/facilities`**), `BusinessPolicyEditor` (**`PUT /api/policies/{key}`**),
  `BusinessPriceBands` (**`/api/price-band-rules`**), báo cáo xuất CSV.
- Admin: `AdminAccount` (**`GET /api/admin/users`**, **`PUT /api/admin/users/{id}`**, đặt lại mật khẩu **`PUT /api/admin/users/{id}/password`**).

### 5.13 Liên hệ hỗ trợ (gửi tin nhắn qua email Brevo)
1. Khách bấm **Liên hệ** (menu trái trang tài khoản, nhóm "Hỗ trợ"; hoặc mục "Liên hệ" trên menu điện thoại) → `features/support/ContactSupport`.
2. Chọn chủ đề, nhập nội dung → `submit()` → **`POST /api/support/contact`** `{ subject, message }`.
3. Backend `SupportController` (chặn gửi dồn 30 giây) → `EmailService.SendSupportMessageAsync` → Brevo API gửi tới **storespacevn101@gmail.com**
   (`BrevoSettings:SupportInboxEmail`), Reply-To = email khách → bộ phận hỗ trợ bấm "Trả lời" trong Gmail là trả lời thẳng cho khách.
4. Lịch sử gửi xem ở Brevo: Transactional → Email → Logs. Không còn dùng EmailJS.

## 6. Những điểm đáng chú ý khi đọc code (chưa sửa, chỉ ghi lại)

Các agent ghi lại trong lúc đọc code — hữu ích khi học, và là gợi ý nếu sau này muốn dọn code:

- **Code chưa dùng:** `pages/business/BusinessCatalog.jsx` và `api/catalogApi.js` (không file nào import trang này);
  nhiều export không ai dùng trong `services/` và `store/cart.js` (`getCartOrders`, `clearCart`...); một số import thừa
  trong `CustomerAccount.jsx`, `PendingPayments.jsx`; `filteredUsers/filteredLogs` trong `AdminAccount.jsx`.
- **Code lặp:** hàm định dạng tiền / ngày (`money`, `fmtIso`, `fmtDay`, `parseUtc`) viết lại ở rất nhiều file; `compressImage`
  có 2 bản; 4 hook trả kho / kiểm kho gần giống nhau; luật đếm "Cần xử lý" / "Đang nợ" lặp giữa `ManagerNav` và các tab.
- **2 luồng ký hợp đồng song song:** `ContractSignFlow` (điều khoản từ chính sách) và `ContractModal` (5 điều cố định, hiện
  giá bằng `rental.price` nên có thể ra "Chưa cập nhật").
- **Lỗi tiềm ẩn:**
  - `otpService.js`, `contractEmail.js` truyền `{ timeout: 35000 }` cho `apiPost` nhưng `apiPost` không nhận tham số này
    → thực tế vẫn 20 giây.
  - `FacilityStaffAccount › TaskDetailModal` gọi `useMemo` sau `return` sớm (vi phạm quy tắc hook, hiện chưa lỗi).
  - `storageRules.isReservationActive` parse giờ UTC không thêm "Z" → có thể lệch 7 giờ.
  - Trang manager lọc dữ liệu theo **tên** cơ sở / tên nhân viên thay vì mã.
  - Cửa cuốn trong cảnh 3D vẽ ở vách trái, còn lối đi chừa ở phía z = L (không nằm trước cửa đang vẽ).
- **Thiết kế cần biết:** `facilities` / `storageUnits` trong `App.jsx` là biến cấp module bị ghi đè, giao diện cập nhật nhờ
  `setRoute`; vị trí kho trên bản đồ và quận/huyện là **ước đoán** vì database chưa có cột tương ứng; Three.js và Leaflet
  tải từ CDN nên cần Internet.

## 7. Mẹo tra cứu nhanh

- Tìm nơi dùng 1 hàm / file: trong VS Code bấm **Ctrl+Shift+F**, gõ tên hàm hoặc `from '.../tên-file'`.
- Tìm nơi gọi 1 API: tìm chuỗi đường dẫn, ví dụ `/api/reservation`.
- Mở file theo tên: **Ctrl+P**; nhảy tới dòng: **Ctrl+G**; danh sách hàm trong file: **Ctrl+Shift+O**.
- Đọc khối `FILE:` đầu file trước, rồi đọc JSDoc của component chính, cuối cùng mới đọc chi tiết các hàm con.

## 8. Bảng tra: FILE → LÀM GÌ → PHỤC VỤ LUỒNG NÀO

Cột "Luồng" ghi số mục ở **phần 5** (vd `5.7` = Ký hợp đồng). "Nền" = dùng chung cho gần như mọi luồng.

### Điểm vào
| File | Làm gì | Luồng |
|---|---|---|
| `App.jsx` | Khởi động app, tải danh mục kho (`loadDataFromApi`), định tuyến URL → trang (`getRoute`, `Router`); chứa các trang công khai: trang chủ, danh sách / chi tiết cơ sở, chi tiết kho, tìm kho, đặt kho (`BookingPage`), đăng nhập / đăng ký / OTP; header có giỏ hàng, chuông thông báo, menu "Liên hệ" | 4, 5.1, 5.3, 5.4, 5.5, 5.13 |

### pages/ — trang theo vai trò
| File | Làm gì | Luồng |
|---|---|---|
| `pages/customer/CustomerAccount.jsx` | Khu tài khoản khách: menu trái, Tổng quan, **Kho của tôi** (thẻ ra vào, mã PIN), **Hợp đồng** (danh sách, ký, gia hạn), **Thanh toán**, **Thông báo**, **Hồ sơ** (mã ra vào 6 số), **Liên hệ** | 5.7, 5.9, 5.10, 5.11, 5.13 |
| `pages/customer/CartPage.jsx` | Giỏ hàng: chọn kho cùng cơ sở, ngày bắt đầu, gói 6/12 tháng, cách nhận kho → tạo đơn từng kho → trả cọc (VNPay / demo) | 5.5 |
| `pages/payment/PaymentResultPage.jsx` | Trang VNPay trả về: gửi backend kiểm chữ ký giao dịch, rồi điều hướng theo loại khoản (cọc → ký hợp đồng; gia hạn → ký phụ lục; tiền thuê / phí → tab Hợp đồng); khách hủy thì nhả kho về giỏ | 5.4, 5.5, 5.9, 5.10 |
| `pages/staff/FacilityStaffAccount.jsx` | Trang nhân viên: việc được giao, **bàn giao kho** (kiểm tra điều kiện, ảnh, xác nhận), xác nhận đơn đã cọc, đổi trạng thái kho, báo sự cố kho | 5.8, 5.10 |
| `pages/manager/FacilityManagerAccount.jsx` | Trang quản lý 1 cơ sở: tổng quan, CRUD kho, đặc tính kho (loại / size), nhân sự & phân công, hợp đồng, đơn đặt chỗ, công nợ & miễn phí trễ, sự cố kho, duyệt kiểm kho | 5.12, 5.10 |
| `pages/manager/ManagerNav.jsx` | Menu trái trang quản lý, đếm số việc chờ (số đỏ) cho từng mục | 5.12 |
| `pages/manager/ManagerPriceTable.jsx` | Bảng giá theo cặp loại + size, kiểm giá nằm trong khung giá của Business | 5.12 |
| `pages/business/BusinessOperations.jsx` | Khung trang kinh doanh: tải dữ liệu, 6 mục menu, thêm / sửa / tạm ngưng / xóa cơ sở, bảng tổng quan | 5.12 |
| `pages/business/BusinessPanels.jsx` | Màn hình con kinh doanh: cơ sở theo khu vực, hiệu suất, trung tâm báo cáo (xuất CSV) — chỉ hiển thị | 5.12 |
| `pages/business/BusinessFacilityForm.jsx` | Hộp thoại sửa thông tin cơ sở | 5.12 |
| `pages/business/BusinessPolicyEditor.jsx` | Sửa chính sách theo phiên bản: cọc, phí quá hạn, đặt chỗ & hủy, gia hạn & trả kho | 5.12 (ảnh hưởng 5.6, 5.7, 5.9, 5.10) |
| `pages/business/BusinessPriceBands.jsx` | Khung giá theo nhóm size S / M / L / V và quy tắc khóa giá | 5.12 |
| `pages/business/BusinessCatalog.jsx` | CRUD loại kho / kích thước — **chưa được dùng** (không file nào import) | — |
| `pages/admin/AdminAccount.jsx` | Trang quản trị: duyệt / từ chối tài khoản, khóa, đổi vai trò, đặt lại mật khẩu, nhật ký hoạt động | 5.12 |

### features/ — khối nghiệp vụ
| File | Làm gì | Luồng |
|---|---|---|
| `features/unit/unitTypes.jsx` | Nhận diện loại kho từ tên (lạnh, mát, tiêu chuẩn, trong nhà, xe vào...), màu / icon, **ảnh thật của kho** (`UnitTypeArt`), thanh hạng kích thước | 5.1, 5.2 (và mọi nơi hiện thẻ kho) |
| `features/unit/Unit3DViewer.jsx` | Cửa sổ xem kho 3D (3 tab), sidebar gợi ý kho vừa với đồ, kho ở cơ sở khác, **bảng 2 lựa chọn** (thuê thêm kho / kho lớn hơn) | 5.2 |
| `features/unit/UnitPackPlanner.jsx` | Tab "Có đồ mẫu" và "Tự xếp thùng": thêm / chồng / kéo / xoay / xóa món, nút "Xếp thử", số thùng còn chứa thêm | 5.2 |
| `features/unit/ThreeUnitScene.jsx` | Vẽ cảnh 3D bằng Three.js (tường, cửa, sàn, thùng, lối đi), kéo thả món bằng chuột | 5.2 |
| `features/unit/ItemCountsInput.jsx` | Khối nhập "đồ của bạn": thùng nhỏ / vừa / lớn, thùng tự nhập kích thước, đồ lớn | 5.1, 5.2 |
| `features/unit/boxCounts.js` | Nhớ số đồ khách nhập (sessionStorage), đọc / ghi tham số URL `items`, `cs` | 5.1, 5.2 |
| `features/unit/useBoxFit.js` | Tính kho nào xếp vừa đồ (ước tính ngay rồi xếp thử thật trong worker); tính 2 lựa chọn khi kho thiếu chỗ | 5.1, 5.2 |
| `features/facility/FacilityMap.jsx` | Bản đồ các cơ sở (Leaflet), tải tọa độ, link chỉ đường Google Maps | 5.1 |
| `features/facility/FacilityFloorPlan.jsx` | Sơ đồ kho trong 1 cơ sở theo khu kích thước; bấm kho → mở cửa sổ 3D | 5.1, 5.2 |
| `features/facility/FacilityUnitsMap.jsx` | Vẽ các chấm kho quanh vị trí cơ sở trên bản đồ (vị trí minh họa) | 5.1 |
| `features/booking/HandoverChoice.jsx` | Chọn cách nhận kho (trực tiếp / online) và khung giờ hẹn khi đặt kho | 5.4, 5.5 |
| `features/booking/CancelReservation.jsx` | Hộp thoại hủy đặt kho: báo giá hoàn cọc, chọn lý do, gửi hủy, gửi lại hoàn tiền | 5.6 |
| `features/payment/DepositConfirm.jsx` | Khung xác nhận trước khi trả cọc / gia hạn: tóm tắt tiền + 2 ô tick bắt buộc | 5.4, 5.5, 5.9 |
| `features/payment/PendingPayments.jsx` | Thanh nhắc đơn chưa cọc (đếm ngược), trang "Thanh toán & Hóa đơn" (cọc, tiền thuê, phí trễ, lịch sử) | 5.4, 5.9, 5.6 |
| `features/contract/ContractCard.jsx` | **Thẻ hợp đồng** ở tab Hợp đồng: kho, thời hạn, chi phí, tiền thuê & phí trễ, chữ ký, các nút (ký, gia hạn, đóng tiền, trả kho) | 5.7, 5.9, 5.10 |
| `features/contract/ContractDocument.jsx` | **Văn bản hợp đồng / phụ lục gia hạn** (điều khoản lấy từ chính sách) — dùng khi ký, khi xem chi tiết, khi gửi email | 5.7, 5.9 |
| `features/contract/ContractSignFlow.jsx` | **Luồng ký 3 bước**: đọc hợp đồng → đồng ý điều khoản → ký tay + gõ họ tên | 5.7, 5.9 (ký phụ lục) |
| `features/contract/SignaturePad.jsx` | **Khung ký**: ký tay trên màn hình (canvas) **hoặc tải ảnh chữ ký** (PNG / JPG / WEBP, tự bỏ nền giấy, co vừa khung, nén PNG ≤ 200 KB); trả về ảnh chữ ký PNG | 5.7 |
| `features/contract/ContractDetailModal.jsx` | Hộp thoại **xem chi tiết hợp đồng** ở mọi giai đoạn, **hiển thị chữ ký đã ký**, nút gửi lại hợp đồng qua email | 5.7 |
| `features/contract/ContractModal.jsx` | Hộp thoại hợp đồng kiểu cũ (1 đơn, 5 điều cố định) — vẫn được nút "✍ Ký hợp đồng" trên thẻ mở | 5.7 |
| `features/contract/ContractRenewal.jsx` | **Gia hạn hợp đồng** (gói 6 hoặc 12 tháng): báo giá, chọn trả tháng / trả 1 lần, thanh toán, hủy yêu cầu, chuyển sang ký phụ lục | 5.9 |
| `features/return/UnitReturn.jsx` | Phía khách: **báo trả kho** (ngày, khung giờ), tiến trình 4 bước, đóng phí còn thiếu | 5.10 |
| `features/return/StaffReturns.jsx` | Phía nhân viên: danh sách lịch trả kho, **form kiểm kho** (tình trạng, ảnh, phí, trừ cọc / hoàn cọc) | 5.10 |
| `features/return/ReturnInspection.jsx` | Kết quả kiểm kho dùng chung: khách đồng ý / khiếu nại, quản lý duyệt / giải quyết, ảnh minh chứng | 5.10 |
| `features/notification/CustomerNotifications.jsx` | Trang "Thông báo" của khách và khung xem nhanh 3 thông báo ở Tổng quan | 5.11 |
| `features/notification/HeaderNotificationBell.jsx` | Chuông thông báo trên header + thanh nhắc đơn chưa cọc; bấm thông báo → mở đúng tab | 5.11, 5.4 |
| `features/return/EarlyReturn.jsx` | **Trả kho sớm**: form gửi đơn của khách (tiền dự kiến, cảnh báo gửi muộn), thẻ đơn chờ duyệt, mục duyệt của Manager | 5.10b |
| `features/policy/PolicyGuide.jsx` | Trang **"Về StoreSpace"** (/about): toàn bộ chính sách chung cho khách, số liệu lấy từ chính sách BOM | 4, 5.12 |
| `features/support/ContactSupport.jsx` | Trang **"Liên hệ"**: chọn chủ đề, nhập tin nhắn, gửi tới bộ phận hỗ trợ qua email (Brevo) | 5.13 |

### components/common/ — giao diện dùng chung
| File | Làm gì | Luồng |
|---|---|---|
| `components/common/Dialog.jsx` | Hộp thoại thay `alert / confirm` (`useDialog`): xác nhận, báo lỗi, báo thành công | Nền |
| `components/common/listKit.jsx` | Thanh phân trang `Pager` (5 mục/trang), chia trang ở frontend / backend, nhãn "Mới", thẻ mã đơn / mã kho, nút lọc, ô sắp xếp | Nền (mọi danh sách) |
| `components/common/DataGrid.jsx` | Bảng có tìm kiếm, lọc, sắp xếp, phân trang (vd danh sách kho trong "Kho của tôi") | 5.7, 5.12 |
| `components/common/PriceInput.jsx` | Ô nhập giá thuê có kiểm tra quy tắc giá | 5.12 |
| `components/common/RentalCalendar.jsx` | Lịch chọn ngày bắt đầu thuê (không cho chọn trước "hôm nay" của ngày giả lập) | 5.4, 5.5 |

### api/ — gọi backend
| File | Làm gì | Luồng |
|---|---|---|
| `api/api.js` | Gửi mọi request: gắn token JWT + ngày giả lập, giới hạn 20 giây, dịch lỗi sang tiếng Việt, hết phiên thì về /login | Nền |
| `api/vnpay.js` | Tạo giao dịch VNPay và chuyển sang trang thanh toán; nhớ giao dịch đang chờ | 5.4, 5.5, 5.9, 5.10 |
| `api/otpService.js` | Gửi / gửi lại / xác thực mã OTP khi đăng ký | 5.3 |
| `api/contractEmail.js` | Dựng nội dung hợp đồng và nhờ backend gửi email (backend gửi bằng Brevo) | 5.7 |
| `api/lateFees.js` | Lấy tiền thuê đến hạn và phí trễ của khách, đóng phí (demo) | 5.9 |
| `api/catalogApi.js` | CRUD loại kho / size — **chưa được dùng** | — |

### services/ — quy tắc nghiệp vụ
| File | Làm gì | Luồng |
|---|---|---|
| `services/storageRules.js` | Hằng số và quy tắc chung: gói thuê 6/12 tháng, số tháng cọc, nhãn trạng thái kho / đơn, định dạng tiền, mã đơn, kiểm tra giá | Nền |
| `services/policies.js` | 4 nhóm chính sách (cọc, quá hạn, đặt chỗ / hủy, gia hạn / trả kho): giá trị mặc định, mô tả, dựng điều khoản hợp đồng | 5.6, 5.7, 5.9, 5.10, 5.12 |
| `services/pricing.js` | Tính tiền thuê và tiền cọc xem trước khi đặt kho | 5.4, 5.5 |
| `services/priceBands.js` | Khung giá theo nhóm size, kiểm giá có nằm trong khung không | 5.12 |
| `services/priceBandRules.js` | Kiểm tra hợp lệ khi tạo / sửa khung giá | 5.12 |
| `services/afterDeposit.js` | Sau khi trả cọc / gia hạn: xác nhận đơn (tạo hợp đồng), hộp thoại thành công, mở đúng tab trong tài khoản khách, yêu cầu ký / cuộn tới hợp đồng | 5.4, 5.5, 5.7, 5.9, 5.11 |
| `services/customerNoticeData.js` | Tính danh sách thông báo cho khách ngay ở frontend, đánh dấu đã xem | 5.11 |
| `services/contractSignatures.js` | Định dạng thời điểm ký hợp đồng để hiển thị | 5.7 |

### store/, hooks/, mappers/, utils/, demoClock/
| File | Làm gì | Luồng |
|---|---|---|
| `store/cart.js` | Giỏ hàng lưu ở trình duyệt (tối đa 10 kho), trả kho về giỏ khi hủy, nhả kho đang giữ | 5.5 |
| `store/bookingDraft.js` | Bản nháp đặt kho khi khách chưa đăng nhập (giữ 24 giờ), đường dẫn quay lại sau đăng nhập | 5.3, 5.4 |
| `hooks/opsLists.js` | Danh sách đơn / kho / hợp đồng phân trang ở backend cho trang nhân viên và quản lý | 5.8, 5.12 |
| `mappers/operationsState.js` | Chuyển dữ liệu `/api/operations/state` từ backend sang dạng frontend dùng | 5.8, 5.12 |
| `utils/districts.js` | Đoán quận / huyện từ địa chỉ, gom cơ sở theo khu vực | 5.1 |
| `utils/unitGeometry.js` | Đọc chuỗi kích thước kho ra rộng / dài / cao / diện tích / thể tích; trạng thái trống / đã thuê / bảo trì | 5.1, 5.2 |
| `utils/packing.js` | **Thuật toán xếp đồ** Extreme Point Best-Fit, danh mục đồ, lối đi, đồ mẫu, sức chứa | 5.2 |
| `utils/packing.worker.js` | Chạy thuật toán xếp đồ ở luồng nền (Web Worker) để giao diện không bị đứng | 5.1, 5.2 |
| `utils/packingClient.js` | Gửi việc cho worker, hủy việc cũ khi có việc mới | 5.1, 5.2 |
| `demoClock/demoClock.js` | Ngày giả lập cho demo (lưu trình duyệt, gắn vào mọi request) | Nền |
| `demoClock/DemoClockWidget.jsx` | Nút nổi "Hôm nay dd/mm/yyyy" để chọn ngày giả lập | Nền |
