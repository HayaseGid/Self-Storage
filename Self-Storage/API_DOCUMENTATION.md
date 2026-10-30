# Tài Liệu API Hệ Thống Self-Storage (`SelfStorageAPI v1`)

Tài liệu này quy định **Hợp đồng giao tiếp (API Contract)** chuẩn giữa **Backend (.NET 10)** và **Frontend (React/Vite)** của dự án Self-Storage. Mọi thành viên trong nhóm dựa vào đúng đường dẫn, phương thức HTTP và cấu trúc JSON dưới đây để phát triển và tích hợp.

---

## 1. Cấu Hình Chung

- **Base URL (Local Development)**: `http://localhost:5046`
- **OpenAPI / Swagger JSON**: `http://localhost:5046/openapi/v1.json`
- **Database**: `SelfStorageDB_test` (`database/SelfStorageDB_test.sql`)
- **Headers mặc định khi gọi API**:
  ```http
  Content-Type: application/json
  X-User-Email: <email_của_user_đang_đăng_nhập>
  ```
  *(Lưu ý: Các API cần phân quyền sẽ đọc header `X-User-Email` để xác thực người dùng và vai trò).*

---

## 2. Tài Khoản Mẫu Để Test (Mật khẩu chung: `123456`)

| Vai trò (RoleName) | Email đăng nhập (`X-User-Email`) | Họ tên |
| :--- | :--- | :--- |
| **System Administrator** | `admin@test.com` | Quản Trị Viên |
| **Business Operations Manager** | `ops@test.com` | Lý Vận Hành Tổng |
| **Facility Manager** (Cơ sở 1 & 3) | `fm1@test.com` | Nguyễn Quản Lý Cơ Sở 1 |
| **Facility Manager** (Cơ sở 2) | `fm2@test.com` | Trần Quản Lý Cơ Sở 2 |
| **Facility Staff** | `staff1@test.com`, `staff2@test.com`, `staff3@test.com` | Lê Nhân Viên Một / Hai / Ba |
| **Storage Customer** | `cust1@test.com`, `cust2@test.com`, `cust3@test.com`, `cust4@test.com` | Đinh / Vũ / Bùi / Đỗ Khách Hàng |

---

## 3. Bảng Tổng Hợp Nhanh 36 API Endpoints

| STT | Nhóm | Method | Endpoint Path | Quyền hạn (Role) | Mô tả chức năng |
| :-: | :--- | :---: | :--- | :--- | :--- |
| 1 | **Auth** | `POST` | `/api/Auth/login` | Public | Đăng nhập bằng Email & Mật khẩu |
| 2 | **Auth** | `POST` | `/api/Auth/register` | Public | Đăng ký tài khoản mới |
| 3 | **Admin** | `GET` | `/api/admin/users` | System Admin | Lấy danh sách toàn bộ người dùng |
| 4 | **Admin** | `GET` | `/api/admin/activity` | System Admin | Xem lịch sử hoạt động (200 log gần nhất) |
| 5 | **Admin** | `PUT` | `/api/admin/users/{userId}` | System Admin | Cập nhật Role hoặc trạng thái tài khoản |
| 6 | **Catalog** | `GET` | `/api/Catalog/state` | Public | Lấy dữ liệu danh mục cơ sở, kho, loại kho, bảng giá |
| 7 | **Catalog** | `GET` | `/api/Catalog/availability` | Public | Kiểm tra kho trống theo cơ sở, loại kho, ngày thuê |
| 8 | **Reservation** | `POST` | `/api/Reservation` | Customer | Tạo đơn đặt chỗ & giữ kho (Hold 15 phút) |
| 9 | **Reservation** | `GET` | `/api/Reservation/{id}` | Customer | Xem chi tiết một đơn đặt chỗ theo ID |
| 10 | **Reservation** | `GET` | `/api/Reservation/customer/{email}` | Customer | Lấy danh sách đơn đặt chỗ của khách hàng |
| 11 | **Payment** | `POST` | `/api/Payment/confirm` | Customer | Xác nhận thanh toán tiền cọc cho đơn đặt chỗ |
| 12 | **Contracts** | `GET` | `/api/contracts/{contractId}/signature` | Customer | Kiểm tra trạng thái chữ ký điện tử của hợp đồng |
| 13 | **Contracts** | `POST` | `/api/contracts/{contractId}/signature` | Customer | Ký tên điện tử (lưu ảnh chữ ký PNG base64) |
| 14 | **Handover** | `POST` | `/api/Handover/complete` | Staff / Manager | Hoàn tất bàn giao kho và cấp mã khóa/thẻ từ |
| 15 | **Operations** | `GET` | `/api/Operations/state` | Staff / FM / BOM | Lấy toàn bộ trạng thái vận hành (kho, đơn, hợp đồng, nhân sự) |
| 16 | **Operations** | `GET` | `/api/Operations/reports` | FM / BOM | Lấy báo cáo doanh thu, tỷ lệ lấp đầy |
| 17 | **Operations** | `POST` | `/api/Operations/reservations/{reservationId}/assign` | FM / BOM | Duyệt đơn đặt chỗ & gán mã kho cụ thể |
| 18 | **Operations** | `PUT` | `/api/Operations/facilities/{facilityId}/policy` | BOM | Cập nhật chính sách đặt cọc của cơ sở |
| 19 | **Operations** | `POST` | `/api/Operations/facilities` | BOM | Tạo cơ sở kho mới |
| 20 | **Operations** | `PUT` | `/api/Operations/facilities/{facilityId}` | BOM | Cập nhật thông tin cơ sở kho |
| 21 | **Operations** | `DELETE` | `/api/Operations/facilities/{facilityId}` | BOM | Xóa cơ sở kho (chỉ khi chưa phát sinh dữ liệu) |
| 22 | **Operations** | `POST` | `/api/Operations/facilities/{facilityId}/staff` | FM / BOM | Phân công nhân viên (`Facility Staff`) vào cơ sở |
| 23 | **Operations** | `POST` | `/api/Operations/units` | FM / BOM | Tạo kho mới tại cơ sở (tự sinh mã `<Prefix>-U<Số>`) |
| 24 | **Operations** | `PUT` | `/api/Operations/units/{unitNumber}` | FM / BOM | Cập nhật thông tin/trạng thái một kho |
| 25 | **Operations** | `PUT` | `/api/Operations/facilities/{facilityId}/rates` | BOM | Tạo hoặc cập nhật đơn giá thuê tháng (`RentalRate`) |
| 26 | **Operations** | `DELETE` | `/api/Operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}` | BOM | Xóa mức giá thuê (chỉ khi chưa có kho sử dụng) |
| 27 | **UnitTypes** | `GET` | `/api/unit-types` | Public / All | Lấy danh sách tất cả loại kho |
| 28 | **UnitTypes** | `GET` | `/api/unit-types/{id}` | Public / All | Xem chi tiết một loại kho theo ID |
| 29 | **UnitTypes** | `POST` | `/api/unit-types` | BOM | Thêm loại kho mới |
| 30 | **UnitTypes** | `PUT` | `/api/unit-types/{id}` | BOM | Cập nhật tên/mô tả loại kho |
| 31 | **UnitTypes** | `DELETE` | `/api/unit-types/{id}` | BOM | Xóa loại kho |
| 32 | **UnitSizes** | `GET` | `/api/unit-sizes` | Public / All | Lấy danh sách tất cả kích thước kho |
| 33 | **UnitSizes** | `GET` | `/api/unit-sizes/{id}` | Public / All | Xem chi tiết một kích thước kho theo ID |
| 34 | **UnitSizes** | `POST` | `/api/unit-sizes` | BOM | Thêm kích thước kho mới |
| 35 | **UnitSizes** | `PUT` | `/api/unit-sizes/{id}` | BOM | Cập nhật kích thước kho |
| 36 | **UnitSizes** | `DELETE` | `/api/unit-sizes/{id}` | BOM | Xóa kích thước kho |

---

## 4. Chi Tiết Request & Response Từng Nhóm API

### 4.1. Nhóm Xác Thực (`AuthController` - `/api/Auth`)

#### `POST /api/Auth/login`
- **Request Body (`LoginRequestDTO`)**:
  ```json
  {
    "email": "cust1@test.com",
    "password": "123456"
  }
  ```
- **Response `200 OK` (`AuthResponseDTO`)**:
  ```json
  {
    "userID": 6,
    "fullName": "Đinh Khách Hàng",
    "email": "cust1@test.com",
    "roleName": "Storage Customer",
    "status": "Active"
  }
  ```

#### `POST /api/Auth/register`
- **Request Body (`RegisterRequestDTO`)**:
  ```json
  {
    "fullName": "Nguyễn Văn A",
    "email": "nguyenvana@test.com",
    "password": "123456",
    "roleName": "Storage Customer"
  }
  ```
  *(Lưu ý: Nếu `roleName` là `"Storage Customer"`, tài khoản được kích hoạt `"Active"` ngay. Nếu là role nội bộ, trạng thái sẽ là `"Pending Approval"` chờ Admin duyệt).*

---

### 4.2. Nhóm Quản Trị Hệ Thống (`AdminController` - `/api/admin`)
> Yêu cầu Header: `X-User-Email: admin@test.com`

#### `GET /api/admin/users`
- Trả về danh sách người dùng kèm thông tin cơ sở phụ trách và lần đăng nhập cuối.

#### `GET /api/admin/activity`
- Trả về tối đa 200 bản ghi hoạt động hệ thống gần nhất.

#### `PUT /api/admin/users/{userId}`
- **Request Body (`UpdateAdminUserDTO`)**:
  ```json
  {
    "roleName": "Facility Staff",
    "status": "Active"
  }
  ```
  *(Giá trị `status` hợp lệ: `"Active"`, `"Pending"`, `"Pending Approval"`, `"Locked"`, `"Rejected"`, `"Inactive"`).*

---

### 4.3. Nhóm Danh Mục & Tìm Kho (`CatalogController` - `/api/Catalog`)

#### `GET /api/Catalog/state`
- Không cần tham số. Trả về danh sách cơ sở (`facilities`), danh sách kho (`units`), loại kho (`unitTypes`), kích thước (`unitSizes`) và bảng giá (`rentalRates`).

#### `GET /api/Catalog/availability`
- **Query Parameters**:
  - `facilityId` (int): ID cơ sở
  - `unitTypeId` (int): ID loại kho
  - `startDate` (string/date): Ngày bắt đầu thuê (VD: `2026-11-01`)
  - `months` (int): Thời hạn thuê (`1`, `3`, `6` hoặc `12` tháng)
- **Ví dụ gọi**:
  ```http
  GET /api/Catalog/availability?facilityId=1&unitTypeId=1&startDate=2026-11-01&months=3
  ```

---

### 4.4. Nhóm Đặt Chỗ Thuê Kho (`ReservationController` - `/api/Reservation`)
> Yêu cầu Header: `X-User-Email: <email_khách_hàng>`

#### `POST /api/Reservation`
- **Request Body (`CreateReservationDTO`)**:
  ```json
  {
    "unitID": 3,
    "unitNumber": "TD-U03",
    "startDate": "2026-11-01T00:00:00",
    "months": 3
  }
  ```
  *(Lưu ý: `months` chỉ nhận `1`, `3`, `6` hoặc `12` theo ràng buộc database).*
- **Response `201 Created`**:
  ```json
  {
    "reservationId": 5,
    "unitId": 3,
    "unitNumber": "TD-U03",
    "facilityId": 1,
    "facilityName": "Kho Thủ Đức - Linh Trung",
    "startDate": "2026-11-01",
    "endDate": "2027-01-31",
    "months": 3,
    "monthlyRate": 800000,
    "depositPercent": 2,
    "depositAmount": 1600000,
    "totalPrice": 2400000,
    "status": "Pending Payment",
    "expiresAt": "2026-10-27T15:30:00Z"
  }
  ```

#### `GET /api/Reservation/{id}`
- Xem chi tiết đơn đặt chỗ theo `ReservationID`.

#### `GET /api/Reservation/customer/{email}`
- Lấy toàn bộ danh sách đơn đặt chỗ của khách hàng có địa chỉ `{email}`.

---

### 4.5. Nhóm Thanh Toán (`PaymentController` - `/api/Payment`)
> Yêu cầu Header: `X-User-Email: <email_khách_hàng>`

#### `POST /api/Payment/confirm`
- **Request Body (`CreatePaymentDTO`)**:
  ```json
  {
    "reservationID": 5,
    "amount": 1600000,
    "paymentType": "Deposit"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "message": "Thanh toán tiền cọc thành công.",
    "paymentId": 5,
    "transactionReference": "SIM-20261027150500-5",
    "amount": 1600000,
    "reservationStatus": "Paid"
  }
  ```

---

### 4.6. Nhóm Ký Hợp Đồng Điện Tử (`ContractsController` - `/api/contracts`)
> Yêu cầu Header: `X-User-Email: <email_khách_hàng>`

#### `GET /api/contracts/{contractId}/signature`
- Kiểm tra hợp đồng đã được ký hay chưa.

#### `POST /api/contracts/{contractId}/signature`
- **Request Body (`CreateContractSignatureRequest`)**:
  ```json
  {
    "signatureImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "termsVersion": "2026-04-v1",
    "acceptedTerms": true
  }
  ```
  *(Lưu ý: `signatureImage` bắt buộc là chuỗi PNG base64 hợp lệ ≤ 200KB, `termsVersion` là `"2026-04-v1"`).*

---

### 4.7. Nhóm Bàn Giao Kho (`HandoverController` - `/api/Handover`)
> Yêu cầu Header: `X-User-Email: <email_staff_hoặc_manager>`

#### `POST /api/Handover/complete`
- **Request Body (`CompleteHandoverDTO`)**:
  ```json
  {
    "reservationID": 2,
    "accessType": "PIN Code",
    "accessValue": "654321",
    "notes": "Kho sạch sẽ, ổ khóa hoạt động tốt"
  }
  ```
  *(Giá trị `accessType` hợp lệ: `"PIN Code"`, `"Key"`, `"Card"`, `"Padlock"`).*

---

### 4.8. Nhóm Vận Hành Cơ Sở & Kho (`OperationsController` - `/api/Operations`)
> Yêu cầu Header: `X-User-Email: <email_nhân_sự>`

#### `GET /api/Operations/state?email=<optional>`
- Trả về toàn bộ trạng thái vận hành (danh sách cơ sở, kho, đơn đặt chỗ, hợp đồng, nhân viên, loại kho, kích thước, bảng giá).

#### `GET /api/Operations/reports`
- Trả về dữ liệu báo cáo thống kê vận hành và doanh thu.

#### `POST /api/Operations/reservations/{reservationId}/assign`
- Duyệt đơn đặt chỗ đang ở trạng thái `"Paid"` và gán kho cụ thể, chuyển đơn sang `"Confirmed"`.
- **Request Body (`AssignReservationDTO`)**:
  ```json
  {
    "unitNumber": "TD-U03"
  }
  ```

#### `PUT /api/Operations/facilities/{facilityId}/policy`
- **Request Body (`UpdateRentalPolicyDTO`)**:
  ```json
  {
    "depositPercent": 2
  }
  ```
  *(Tương ứng số tháng tiền cọc: `1` hoặc `2` tháng).*

#### `POST /api/Operations/facilities`
- **Request Body (`CreateFacilityDTO`)**:
  ```json
  {
    "facilityName": "Kho Quận 7 - Phú Mỹ Hưng",
    "unitCodePrefix": "Q7",
    "address": "100 Nguyễn Văn Linh, Phường Tân Phong, Quận 7, TP.HCM",
    "contactPhone": "02838001122",
    "managerEmail": "fm1@test.com",
    "status": "Active"
  }
  ```

#### `PUT /api/Operations/facilities/{facilityId}`
- **Request Body (`UpdateFacilityDTO`)**:
  ```json
  {
    "facilityName": "Kho Quận 7 - Phú Mỹ Hưng",
    "address": "100 Nguyễn Văn Linh, Phường Tân Phong, Quận 7, TP.HCM",
    "managerEmail": "fm1@test.com",
    "status": "Active"
  }
  ```

#### `DELETE /api/Operations/facilities/{facilityId}`
- Xóa cơ sở kho (trả về `204 No Content` nếu thành công, hoặc `409 Conflict` nếu cơ sở đang có kho/dữ liệu liên quan).

#### `POST /api/Operations/facilities/{facilityId}/staff`
- **Request Body (`AssignFacilityStaffDTO`)**:
  ```json
  {
    "staffEmail": "staff1@test.com"
  }
  ```

#### `POST /api/Operations/units`
- Tạo kho mới (mã kho tự động sinh theo `<UnitCodePrefix>-U<Số thứ tự>`).
- **Request Body (`CreateStorageUnitDTO`)**:
  ```json
  {
    "facilityID": 1,
    "unitTypeID": 1,
    "unitSizeID": 2,
    "unitType": "Standard",
    "size": "S2: 2x2m",
    "sizeM2": 4,
    "basePrice": 800000,
    "status": "AVAILABLE"
  }
  ```

#### `PUT /api/Operations/units/{unitNumber}`
- Cập nhật thông tin hoặc trạng thái kho `{unitNumber}` (body dùng `CreateStorageUnitDTO` giống trên).

#### `PUT /api/Operations/facilities/{facilityId}/rates`
- **Request Body (`UpdateRentalRateDTO`)**:
  ```json
  {
    "unitTypeID": 1,
    "unitSizeID": 2,
    "basePrice": 850000
  }
  ```

#### `DELETE /api/Operations/facilities/{facilityId}/rates/{unitTypeId}/{unitSizeId}`
- Xóa mức giá thuê của cặp `(unitTypeId, unitSizeId)` tại cơ sở `{facilityId}`.

---

### 4.9. Nhóm Danh Mục Loại Kho (`UnitTypesController` - `/api/unit-types`)

- `GET /api/unit-types`: Lấy danh sách tất cả loại kho.
- `GET /api/unit-types/{id}`: Lấy chi tiết một loại kho.
- `POST /api/unit-types` & `PUT /api/unit-types/{id}` (Yêu cầu quyền BOM `ops@test.com`):
  - **Request Body (`UpsertUnitTypeDTO`)**:
    ```json
    {
      "typeName": "Climate Controlled",
      "description": "Kho kiểm soát nhiệt độ và độ ẩm"
    }
    ```
- `DELETE /api/unit-types/{id}`: Xóa loại kho (chỉ xóa được khi chưa có kho nào sử dụng).

---

### 4.10. Nhóm Danh Mục Kích Thước Kho (`UnitSizesController` - `/api/unit-sizes`)

- `GET /api/unit-sizes`: Lấy danh sách tất cả kích thước kho.
- `GET /api/unit-sizes/{id}`: Lấy chi tiết một kích thước kho.
- `POST /api/unit-sizes` & `PUT /api/unit-sizes/{id}` (Yêu cầu quyền BOM `ops@test.com`):
  - **Request Body (`UpsertUnitSizeDTO`)**:
    ```json
    {
      "dimensions": "M2: 3x4m",
      "volume": 30.0
    }
    ```
- `DELETE /api/unit-sizes/{id}`: Xóa kích thước kho (chỉ xóa được khi chưa có kho/bảng giá nào sử dụng).

