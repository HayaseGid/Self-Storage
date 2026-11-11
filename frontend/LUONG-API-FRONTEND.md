# LUỒNG GỌI API: FRONTEND → BACKEND

Tài liệu tổng hợp **mọi lời gọi API** của frontend StoreSpace: đi qua đâu, gọi endpoint nào, thuộc Controller nào
của backend, và được dùng trong nghiệp vụ nào. Phần bảng ở mục 4 được lập bằng cách quét toàn bộ mã nguồn `src/`.

## 1. Cơ chế chung của mọi request (`src/api/api.js`)

```
Component / hook
   │  apiGet('/api/...') | apiPost(path, body) | apiPut(path, body) | apiDelete(path)
   ▼
apiRequest()  (src/api/api.js)
   ├─ Gắn "Authorization: Bearer <token>" (token lưu trong localStorage 'storespace_current_user')
   │    – phiên cũ chưa có token thì gắn "X-User-Email"; các API /api/auth/* không gắn danh tính
   ├─ Gắn "X-Simulated-Date: YYYY-MM-DD" nếu đang bật Demo Clock (src/demoClock)
   ├─ Content-Type: application/json, timeout 20 giây (AbortController)
   ▼
fetch(VITE_API_URL + path)            ← VITE_API_URL trong frontend/.env
   ▼
Backend: JwtIdentityMiddleware → Controller → Service → Repository → SelfStorageDbContext (PostgreSQL)
   ▼
JSON trả về → apiRequest parse JSON
   ├─ OK  → trả data cho component
   └─ Lỗi → ném ApiError { message (tiếng Việt), status, code, data }
            • 401 + code TOKEN_INVALID → xóa phiên, chuyển /login
```

Ngoài `api.js` chỉ có 2 lời gọi mạng khác: `api/contractEmail.js` (dự phòng gửi email qua EmailJS khi backend lỗi)
và việc nạp thư viện từ CDN (Leaflet cho bản đồ, Three.js cho xem kho 3D) — không phải API backend.

## 2. Vai trò ↔ nhóm API chính

| Vai trò | Trang | Nhóm API (Controller) |
|---|---|---|
| Khách (chưa đăng nhập) | Trang chủ, cơ sở, kho, tìm kiếm | Catalog, FacilityLocations |
| Khách hàng | Đặt kho, giỏ kho, /customer | Reservation, Payment, VnPay, ReservationConfirmations, ReservationCancellations, CustomerReservations, Contracts, Email, ContractRenewals, UnitReturns, ReturnInspections, LateFees, Policies |
| Facility Staff | /staff | Operations, StaffTools, ManagerTools (auto-assign), LateFees (sync), UnitReturns (staff), ReturnInspections (staff) |
| Facility Manager | /manager | Operations, ManagerTools, StaffTools, UnitTypes, UnitSizes, PriceBands, LateFees, ReturnInspections, StorageUnit |
| Business Operations | /business | Operations, PriceBands, PriceBandRules, Policies |
| System Admin | /admin | Admin |

## 3. Các luồng nghiệp vụ chính

### 3.1 Khởi động app & xem danh mục kho
1. `App.jsx › loadDataFromApi` → **GET `/api/catalog/state`** → lưu cơ sở + kho; `services/pricing.js › setCatalogPricing` nạp số tháng cọc / phút giữ chỗ.
2. `Router` làm mới lại API trên mỗi 15 giây (dừng khi tab ẩn, làm mới ngay khi quay lại tab / chuyển trang).
3. Bản đồ: `features/facility/FacilityMap.jsx › loadFacilityLocations` → **GET `/api/facility-locations`**.

### 3.2 Đăng ký (OTP) & đăng nhập
1. `App.jsx › RegisterPage.sendRegistrationOtp` → `api/otpService.js › startRegistration` → **POST `/api/auth/register/start`** (backend gửi mã OTP về email).
2. `VerifyOtpPage.verifyOtp` → **POST `/api/auth/register/verify`** (đúng mã → tạo tài khoản); gửi lại mã: **POST `/api/auth/register/resend`**.
3. `App.jsx › loginAndStoreUser` → **POST `/api/auth/login`** → lưu `{ name, email, role, token, ... }` vào localStorage → `resolvePostAuthPath` chuyển về trang theo vai trò / trang đặt kho đang dở.

### 3.3 Khách đặt 1 kho → đặt cọc → ký hợp đồng
1. `App.jsx › BookingPage.handleConfirmBooking`
   → **GET `/api/catalog/availability?facilityId=&unitTypeId=&startDate=&months=`** (kho còn trống trong kỳ thuê)
   → **POST `/api/reservation`** `{ unitID, unitNumber, startDate, months, paymentPlan, handoverMethod, appointmentSlot }`
   → đơn ở trạng thái *Pending Deposit* (giữ kho N phút).
2. `BookingPage.handleDepositPaid`:
   - VNPay: `api/vnpay.js › startVnPayPayment` → **POST `/api/vnpay/create`** → trình duyệt sang VNPay → quay về `/payment-result`
     → `pages/payment/PaymentResultPage.jsx` → **GET `/api/vnpay/return-verify?vnp_...`** (backend kiểm chữ ký, ghi nhận cọc).
   - Demo (khi `VITE_ALLOW_SIMULATED_PAYMENT=true`): **POST `/api/payment/confirm`**.
3. `services/afterDeposit.js › confirmAfterDeposit` → **POST `/api/reservation-confirmations/mine`** → xác nhận đơn + tạo hợp đồng (không còn bước Manager duyệt).
4. Mở tab Hợp đồng → ký (xem 3.6).

### 3.4 Đặt nhiều kho từ giỏ (`pages/customer/CartPage.jsx`)
1. Giỏ hàng lưu ở trình duyệt (`store/cart.js`), chưa giữ chỗ.
2. `CartPage.checkout` → mỗi kho 1 lần **POST `/api/reservation`** (cùng cơ sở, tối đa 5 kho).
3. `CartPage.payDeposit` → **POST `/api/vnpay/create`** (gộp nhiều đơn) hoặc demo **POST `/api/payment/confirm`** từng đơn + **POST `/api/reservation-confirmations/mine`**.
4. Hủy / rời trang khi chưa trả cọc: `store/cart.js › cancelHeldReservations` → **POST `/api/reservation-cancellations/{id}`** và trả kho về giỏ.

### 3.5 Khách hủy đặt kho & hoàn cọc (`features/booking/CancelReservation.jsx`)
1. **GET `/api/reservation-cancellations/{id}/quote`** → có hủy được không, hoàn bao nhiêu %.
2. **POST `/api/reservation-cancellations/{id}`** `{ reason, expectedRefund }` → hủy ngay, hoàn tiền (VNPay hoàn về thẻ).
3. Hoàn lỗi: **POST `/api/reservation-cancellations/{id}/refund-retry`**.

### 3.6 Ký hợp đồng & gửi email (`pages/customer/CustomerAccount.jsx › ContractPage`)
1. Tải trạng thái chữ ký: **GET `/api/contracts/{contractId}/signature`**.
2. `features/contract/ContractSignFlow.jsx` (xem → xác nhận điều khoản → ký tay) → `ContractPage.signGroupContracts`
   → **POST `/api/contracts/{contractId}/signature`** `{ signatureImage, termsVersion, acceptedTerms }`.
3. `api/contractEmail.js › sendContractEmail` → **POST `/api/email/send-contract`** (dự phòng: EmailJS).
4. Điều khoản hợp đồng lấy từ chính sách: `services/policies.js › loadPolicies` → **GET `/api/policies`**.

### 3.7 Bàn giao kho (Facility Staff / Manager)
1. `pages/staff/FacilityStaffAccount.jsx › StaffPortal.loadState`:
   **GET `/api/operations/state?email=`** → **POST `/api/manager-tools/facilities/{id}/auto-assign`** (tự phân công)
   → **POST `/api/late-fees/facilities/{id}/sync`** → **GET `/api/staff-tools/tasks`** (việc được giao).
2. Xác nhận đơn đã cọc (nếu cần): **POST `/api/staff-tools/reservations/{id}/confirm`**.
3. Bàn giao: **POST `/api/staff-tools/handover`** `{ reservationID, notes, unitConditionConfirmed, conditionResult, evidenceImages }`
   (backend HandoverService kiểm tra lại toàn bộ điều kiện, tự sinh mã truy cập).
4. Manager giao / đổi người phụ trách: **GET `/api/manager-tools/facilities/{id}/workload?date=`** → **PUT `/api/manager-tools/reservations/{id}/owner`**.

### 3.8 Tiền thuê định kỳ & phí trễ hạn
- Khách: `api/lateFees.js › useLateFees` → **GET `/api/late-fees/mine`**; đóng tiền thuê + phí trễ → **POST `/api/vnpay/create`** (kind `rent`); demo: **POST `/api/late-fees/{id}/pay-demo`**.
- Staff/Manager: đồng bộ **POST `/api/late-fees/facilities/{id}/sync`**; xem công nợ **GET `/api/late-fees/facilities/{id}`**;
  miễn phí trễ **PUT `/api/late-fees/charges/{chargeId}/waive`**.

### 3.9 Gia hạn hợp đồng (`features/contract/ContractRenewal.jsx`)
1. **GET `/api/contract-renewals/mine`** → điều kiện + báo giá.
2. **POST `/api/contract-renewals`** `{ reservationId, months, paymentPlan, expectedAmount }` → yêu cầu chờ thanh toán.
3. Thanh toán: **POST `/api/vnpay/create`** (kind `renewal`) → `/payment-result` → **POST `/api/contract-renewals/{id}/finalize`**;
   demo: **POST `/api/contract-renewals/{id}/pay-demo`**; hủy yêu cầu: **POST `/api/contract-renewals/{id}/cancel`**.
4. Ký phụ lục gia hạn như 3.6.

### 3.10 Trả kho & kiểm kho
1. Khách (`features/return/UnitReturn.jsx`): **GET `/api/unit-returns/mine`** → **GET `/api/unit-returns/{id}/slots?date=`**
   → **POST `/api/unit-returns`** `{ reservationId, returnDate, returnTime, note }`; hủy: **POST `/api/unit-returns/{id}/cancel`**.
2. Staff (`features/return/StaffReturns.jsx`): **GET `/api/unit-returns/staff`** → **POST `/api/unit-returns/staff/{id}/start`**
   → xem công nợ **GET `/api/late-fees/returns/{id}/preview`** → **POST `/api/unit-returns/staff/{id}/complete`** (tình trạng, ảnh, phí).
3. Manager duyệt (`features/return/ReturnInspection.jsx`): **GET `/api/return-inspections/facilities/{id}`** → **GET `/api/return-inspections/{id}`**
   → **POST `/api/return-inspections/{id}/approve`** (hoặc **`/resolve`** khi có khiếu nại).
4. Khách xác nhận: **GET `/api/return-inspections/mine`** → **POST `/api/return-inspections/{id}/accept`** hoặc **`/dispute`**.
5. Còn nợ phí: **POST `/api/vnpay/create`** (kind `fee`) hoặc demo **POST `/api/unit-returns/{id}/pay-demo`**.

### 3.11 Facility Manager quản lý cơ sở (`pages/manager/`)
- Dữ liệu: **GET `/api/operations/state?email=`**; danh sách phân trang **GET `/api/operations/reservations | units | contracts`** (qua `hooks/opsLists.js`).
- Kho: **POST `/api/operations/units`**, **PUT `/api/operations/units/{unitNumber}`**, **DELETE `/api/storage-units/{unitId}`**.
- Đặc tính kho: **GET/POST/PUT `/api/unit-types`**, **`/api/unit-sizes`** (kèm `facilityId`); xóa mức giá **DELETE `/api/operations/facilities/{id}/rates/{typeId}/{sizeId}`**.
- Bảng giá: **GET `/api/price-bands`** → **PUT `/api/operations/facilities/{id}/rates`**.
- Nhân sự: **POST `/api/operations/facilities/{id}/staff`**, **DELETE `/api/manager-tools/facilities/{id}/staff/{userId}`**, **GET `/api/manager-tools/facilities/{id}/tasks`**.
- Sự cố kho: **GET `/api/manager-tools/facilities/{id}/unit-reports`** → mở lại kho **PUT `/api/staff-tools/units/{unitId}/status`**.
- Báo cáo: **GET `/api/manager-tools/facilities/{id}/reports?months=6`**.

### 3.12 Business Operations (`pages/business/`)
- **GET `/api/operations/state?email=`** + **GET `/api/operations/reports`**.
- Cơ sở: **POST `/api/operations/facilities`**, **PUT / DELETE `/api/operations/facilities/{id}`**.
- Khung giá: **GET `/api/price-bands`**, **GET/POST/PUT/DELETE `/api/price-band-rules[/{code}]`**.
- Chính sách: **GET `/api/policies`**, **PUT `/api/policies/{key}`**, **GET `/api/policies/{key}/history`**.

### 3.13 System Admin (`pages/admin/AdminAccount.jsx`)
- **GET `/api/admin/users`**, **GET `/api/admin/activity`** (có phân trang qua `useServerList`).
- **PUT `/api/admin/users/{id}`** `{ roleName, status }` (duyệt / từ chối / khóa / đổi vai trò), **PUT `/api/admin/users/{id}/password`**.

### 3.14 Thông báo khách hàng (không có API riêng)
`services/customerNoticeData.js` tính thông báo ngay ở frontend từ dữ liệu của:
**GET `/api/customer-reservations/mine`**, **`/api/contract-renewals/mine`**, **`/api/policies`**, **`/api/unit-returns/mine`**, **`/api/return-inspections/mine`**.
Trạng thái "đã xem" lưu ở localStorage theo email.

## 4. Bảng đầy đủ: endpoint ↔ Controller ↔ nơi gọi trong frontend

Ký hiệu `{…}` là tham số động trong đường dẫn (id, mã...). "Được gọi ở" ghi `file → hàm` (hàm bên trong component ghi dạng `Component › hàm`).
<!-- 91 endpoint, 119 lời gọi -->
### AdminController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/admin/activity` | `pages/admin/AdminAccount.jsx` → Admin › loadAdminData<br>`pages/admin/AdminAccount.jsx` → Admin |
| GET | `/api/admin/users` | `pages/admin/AdminAccount.jsx` → Admin › loadAdminData<br>`pages/admin/AdminAccount.jsx` → Admin |
| PUT | `/api/admin/users/{…}` | `pages/admin/AdminAccount.jsx` → Admin › updateUser |
| PUT | `/api/admin/users/{…}/password` | `pages/admin/AdminAccount.jsx` → Admin › resetPassword |

### AuthController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/auth/login` | `App.jsx` → loginAndStoreUser |
| POST | `/api/auth/register/resend` | `api/otpService.js` → resendRegistrationOtp |
| POST | `/api/auth/register/start` | `api/otpService.js` → startRegistration |
| POST | `/api/auth/register/verify` | `api/otpService.js` → verifyRegistrationOtp |

### CatalogController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/catalog/availability` | `App.jsx` → BookingPage › handleConfirmBooking |
| GET | `/api/catalog/state` | `App.jsx` → loadDataFromApi |

### ContractRenewalsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/contract-renewals` | `features/contract/ContractRenewal.jsx` → RenewalModal › submit |
| POST | `/api/contract-renewals/{…}/cancel` | `features/contract/ContractRenewal.jsx` → RenewalSection › cancelPending |
| POST | `/api/contract-renewals/{…}/finalize` | `features/contract/ContractRenewal.jsx` → RenewalSection › continuePay<br>`pages/payment/PaymentResultPage.jsx` → PaymentResultPage |
| POST | `/api/contract-renewals/{…}/pay-demo` | `features/contract/ContractRenewal.jsx` → payRenewal |
| GET | `/api/contract-renewals/mine` | `features/contract/ContractRenewal.jsx` → useContractRenewals › reload |

### ContractsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/contracts/{…}/signature` | `features/contract/ContractDetailModal.jsx` → ContractDetailModal<br>`pages/customer/CustomerAccount.jsx` → ContractPage › reloadSignature<br>`pages/customer/CustomerAccount.jsx` → ContractPage |
| POST | `/api/contracts/{…}/signature` | `pages/customer/CustomerAccount.jsx` → ContractPage › signGroupContracts<br>`pages/customer/CustomerAccount.jsx` → ContractPage › handleSign |

### CustomerReservationsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/customer-reservations/mine` | `App.jsx` → fetchCustomerRentals<br>`App.jsx` → CustomerPage › loadReservations |

### EmailController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/email/send-contract` | `api/contractEmail.js` → sendContractEmail |

### FacilityLocationsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/facility-locations` | `features/facility/FacilityMap.jsx` → loadFacilityLocations |

### LateFeesController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/late-fees/{…}/pay-demo` | `api/lateFees.js` → payLateFeesDemo |
| PUT | `/api/late-fees/charges/{…}/waive` | `pages/manager/FacilityManagerAccount.jsx` → LateFeesTab › submitWaive |
| GET | `/api/late-fees/facilities/{…}` | `pages/manager/FacilityManagerAccount.jsx` → LateFeesTab › load<br>`pages/manager/ManagerNav.jsx` → useManagerBadges › load |
| POST | `/api/late-fees/facilities/{…}/sync` | `pages/staff/FacilityStaffAccount.jsx` → StaffPortal › loadState |
| GET | `/api/late-fees/mine` | `api/lateFees.js` → useLateFees › reload |
| GET | `/api/late-fees/returns/{…}/preview` | `features/return/StaffReturns.jsx` → InspectForm |

### ManagerToolsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/manager-tools/facilities/{…}/auto-assign` | `pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard<br>`pages/staff/FacilityStaffAccount.jsx` → StaffPortal › loadState |
| GET | `/api/manager-tools/facilities/{…}/reports` | `pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard |
| DELETE | `/api/manager-tools/facilities/{…}/staff/{…}` | `pages/manager/FacilityManagerAccount.jsx` → FacilityStaffTab › removeStaff |
| GET | `/api/manager-tools/facilities/{…}/tasks` | `pages/manager/FacilityManagerAccount.jsx` → FacilityStaffTab › loadTasks |
| GET | `/api/manager-tools/facilities/{…}/unit-reports` | `pages/manager/FacilityManagerAccount.jsx` → UnitReportsTab › load<br>`pages/manager/ManagerNav.jsx` → useManagerBadges › load |
| GET | `/api/manager-tools/facilities/{…}/workload` | `pages/manager/FacilityManagerAccount.jsx` → OwnerModal |
| PUT | `/api/manager-tools/reservations/{…}/owner` | `pages/manager/FacilityManagerAccount.jsx` → FacilityStaffTab › changeOwner |

### OperationsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/operations/{reservations / units / contracts}` | `hooks/opsLists.js` → useOpsList |
| POST | `/api/operations/facilities` | `pages/business/BusinessOperations.jsx` → BusinessOperations › handleAddFacility |
| DELETE | `/api/operations/facilities/{…}` | `pages/business/BusinessOperations.jsx` → BusinessOperations › deleteFacility |
| PUT | `/api/operations/facilities/{…}` | `pages/business/BusinessOperations.jsx` → BusinessOperations › updateFacility |
| PUT | `/api/operations/facilities/{…}/rates` | `pages/manager/ManagerPriceTable.jsx` → ManagerPriceTable › save |
| DELETE | `/api/operations/facilities/{…}/rates/{…}/{…}` | `api/catalogApi.js` → deleteRentalRate<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityPropertiesTab › remove |
| POST | `/api/operations/facilities/{…}/staff` | `pages/manager/FacilityManagerAccount.jsx` → FacilityStaffTab › addStaff |
| GET | `/api/operations/reports` | `pages/business/BusinessOperations.jsx` → BusinessOperations › loadBusinessData |
| GET | `/api/operations/state` | `pages/business/BusinessOperations.jsx` → BusinessOperations › loadBusinessData<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard › loadState<br>`pages/staff/FacilityStaffAccount.jsx` → StaffPortal › loadState |
| POST | `/api/operations/units` | `pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard › handleSaveUnit |
| PUT | `/api/operations/units/{…}` | `pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard › handleSaveUnit |

### PaymentController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/payment/confirm` | `App.jsx` → BookingPage › handleDepositPaid<br>`pages/customer/CartPage.jsx` → CartPage › payDeposit |

### PoliciesController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/policies` | `pages/business/BusinessPolicyEditor.jsx` → BusinessPolicyEditor › load<br>`services/policies.js` → loadPolicies |
| PUT | `/api/policies/{…}` | `pages/business/BusinessPolicyEditor.jsx` → PolicyForm › save |
| GET | `/api/policies/{…}/history` | `pages/business/BusinessPolicyEditor.jsx` → PolicyForm › toggleHistory |

### PriceBandRulesController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/price-band-rules` | `pages/business/BusinessPriceBands.jsx` → BusinessPriceBands › load |
| POST | `/api/price-band-rules` | `pages/business/BusinessPriceBands.jsx` → PriceBandForm › submit |
| DELETE | `/api/price-band-rules/{…}` | `pages/business/BusinessPriceBands.jsx` → BusinessPriceBands › remove |
| PUT | `/api/price-band-rules/{…}` | `pages/business/BusinessPriceBands.jsx` → BusinessPriceBands › toggleActive<br>`pages/business/BusinessPriceBands.jsx` → PriceBandForm › submit |

### PriceBandsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/price-bands` | `pages/business/BusinessPriceBands.jsx` → BusinessPriceBands › load<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard |

### ReservationCancellationsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/reservation-cancellations/{…}` | `features/booking/CancelReservation.jsx` → CancelReservationModal › submit<br>`store/cart.js` → cancelHeldReservations |
| GET | `/api/reservation-cancellations/{…}/quote` | `features/booking/CancelReservation.jsx` → CancelReservationModal › load |
| POST | `/api/reservation-cancellations/{…}/refund-retry` | `features/booking/CancelReservation.jsx` → retryRefund |

### ReservationConfirmationsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/reservation-confirmations/mine` | `services/afterDeposit.js` → confirmAfterDeposit |

### ReservationController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/reservation` | `App.jsx` → BookingPage › handleConfirmBooking<br>`pages/customer/CartPage.jsx` → CartPage › checkout |
| GET | `/api/reservation/customer/{…}` | `App.jsx` → fetchCustomerRentals<br>`App.jsx` → CustomerPage › loadReservations |

### ReturnInspectionsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/return-inspections/{…}` | `features/return/ReturnInspection.jsx` → useInspectionDetail › load |
| POST | `/api/return-inspections/{…}/accept` | `features/return/ReturnInspection.jsx` → CustomerInspectionBox › accept |
| POST | `/api/return-inspections/{…}/approve` | `features/return/ReturnInspection.jsx` → ResolveModal › submit |
| POST | `/api/return-inspections/{…}/dispute` | `features/return/ReturnInspection.jsx` → DisputeModal › submit |
| POST | `/api/return-inspections/{…}/resolve` | `features/return/ReturnInspection.jsx` → ResolveModal › submit |
| GET | `/api/return-inspections/facilities/{…}` | `features/return/ReturnInspection.jsx` → ManagerReturnInspectionsTab › load<br>`pages/manager/ManagerNav.jsx` → useManagerBadges › load |
| GET | `/api/return-inspections/mine` | `features/return/ReturnInspection.jsx` → useMyInspections › reload |
| GET | `/api/return-inspections/staff` | `features/return/ReturnInspection.jsx` → useStaffInspections › reload |

### StaffToolsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/staff-tools/handover` | `pages/staff/FacilityStaffAccount.jsx` → StaffPortal › handover |
| POST | `/api/staff-tools/reservations/{…}/confirm` | `pages/staff/FacilityStaffAccount.jsx` → StaffPortal › confirmReservation |
| GET | `/api/staff-tools/tasks` | `pages/staff/FacilityStaffAccount.jsx` → StaffPortal › loadState |
| POST | `/api/staff-tools/unit-reports` | `pages/staff/FacilityStaffAccount.jsx` → StaffPortal › reportUnitCondition |
| PUT | `/api/staff-tools/units/{…}/status` | `pages/manager/FacilityManagerAccount.jsx` → UnitReportsTab › reopenUnit<br>`pages/staff/FacilityStaffAccount.jsx` → StaffPortal › updateUnitStatus |

### StorageUnitController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| DELETE | `/api/storage-units/{…}` | `pages/manager/FacilityManagerAccount.jsx` → FacilityManagerDashboard › handleDeleteUnit |

### UnitReturnsController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/unit-returns` | `features/return/UnitReturn.jsx` → ReturnRequestModal › submit |
| POST | `/api/unit-returns/{…}/cancel` | `features/return/UnitReturn.jsx` → ReturnProgress › cancel |
| POST | `/api/unit-returns/{…}/pay-demo` | `features/return/UnitReturn.jsx` → payReturnFees |
| GET | `/api/unit-returns/{…}/slots` | `features/return/UnitReturn.jsx` → ReturnRequestModal |
| GET | `/api/unit-returns/mine` | `features/return/UnitReturn.jsx` → useUnitReturns › reload |
| GET | `/api/unit-returns/staff` | `features/return/StaffReturns.jsx` → useStaffReturns › reload |
| POST | `/api/unit-returns/staff/{…}/complete` | `features/return/StaffReturns.jsx` → InspectForm › submit |
| POST | `/api/unit-returns/staff/{…}/start` | `features/return/StaffReturns.jsx` → StaffReturns › start |

### UnitSizesController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/unit-sizes` | `api/catalogApi.js` → listUnitSizes<br>`pages/manager/FacilityManagerAccount.jsx` → loadFacilityCatalog |
| POST | `/api/unit-sizes` | `api/catalogApi.js` → createUnitSize<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityPropertiesTab › saveSize |
| DELETE | `/api/unit-sizes/{…}` | `api/catalogApi.js` → deleteUnitSize |
| PUT | `/api/unit-sizes/{…}` | `api/catalogApi.js` → updateUnitSize<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityPropertiesTab › saveSize |

### UnitTypesController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| GET | `/api/unit-types` | `api/catalogApi.js` → listUnitTypes<br>`pages/manager/FacilityManagerAccount.jsx` → loadFacilityCatalog |
| POST | `/api/unit-types` | `api/catalogApi.js` → createUnitType<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityPropertiesTab › saveType |
| DELETE | `/api/unit-types/{…}` | `api/catalogApi.js` → deleteUnitType |
| PUT | `/api/unit-types/{…}` | `api/catalogApi.js` → updateUnitType<br>`pages/manager/FacilityManagerAccount.jsx` → FacilityPropertiesTab › saveType |

### VnPayController

| Method | Endpoint | Được gọi ở (file → hàm) |
|---|---|---|
| POST | `/api/vnpay/create` | `api/vnpay.js` → startVnPayPayment |
| GET | `/api/vnpay/return-verify` | `pages/payment/PaymentResultPage.jsx` → PaymentResultPage |

