# CẨM NANG BẢO VỆ ĐỒ ÁN SWP391 — CHUYÊN SÂU BACKEND (.NET CORE API)

> **Mục đích tài liệu:** Giúp bạn nắm vững **100% cấu trúc thư mục `backend`**, hiểu rõ từng file làm gì, chỉ tận tay từng dòng code (API, Endpoint, Kết nối Frontend-Backend, Kết nối Database, JWT Token, Phân quyền) và trang bị **bộ câu trả lời chuẩn chỉnh** để vượt qua vòng hỏi xoáy/loại trừ trực tiếp của giảng viên.

---

## PHẦN 1: KIẾN TRÚC TỔNG THỂ CỦA BACKEND (3-Tier + Repository Pattern)

Khi giảng viên hỏi câu đầu tiên: **"Kiến trúc Backend của nhóm em được thiết kế như thế nào?"**, hãy trả lời ngay:

> *"Dạ thưa thầy/cô, Backend của nhóm em được xây dựng trên nền tảng **ASP.NET Core Web API (.NET)** theo kiến trúc phân tầng **3-Tier Architecture kết hợp với Repository Pattern và Dependency Injection (DI)**. Luồng đi của một Request luôn tuân theo thứ tự một chiều:*
> **`Client (React) ➔ Middleware (JWT) ➔ Controller ➔ Service (Business Logic) ➔ Repository (Data Access) ➔ DbContext (EF Core) ➔ PostgreSQL Database`**."*

### Sơ đồ luồng đi của 1 Request trong Backend:
```
[Frontend React]
       │  (Gửi HTTP Request: GET/POST/PUT/DELETE + Header Authorization: Bearer <token>)
       ▼
[1. Program.cs & Middleware]  ──> Kiểm tra CORS (cho phép FE gọi) + Giải mã JWT Token, lấy Email/Role.
       │
       ▼
[2. Controllers/]             ──> Tiếp nhận Request tại các Endpoint URL, đọc dữ liệu đầu vào (DTO).
       │
       ▼
[3. Services/]                ──> Xử lý toàn bộ LOGIC NGHIỆP VỤ (kiểm tra quyền, tính tiền, kiểm tra kho trống...).
       │
       ▼
[4. Repositories/]            ──> Chuyên thực hiện truy vấn Database bằng LINQ / Entity Framework Core.
       │
       ▼
[5. Data/SelfStorageDbContext]──> Ánh xạ các class C# (Models) thành các bảng trong PostgreSQL (Neon Cloud).
```

---

## PHẦN 2: GIẢI THÍCH TOÀN BỘ CÁC THƯ MỤC & FILE TRONG `backend/`

Thư mục `backend/` bao gồm **8 thư mục con** và các file cấu hình ở gốc:

---

### 1. Các file ở gốc thư mục `backend/` (Trái tim khởi chạy)

| Tên file | Vai trò & Cách hoạt động |
| :--- | :--- |
| **`Program.cs`** | **File quan trọng số 1 của Backend.** Đây là điểm khởi chạy (`Entry Point`) của toàn bộ ứng dụng. Nó cấu hình: CORS (kết nối Frontend), kết nối Database (`SelfStorageDbContext`), đăng ký Dependency Injection (`AddScoped`), cấu hình xác thực JWT (`AddAuthentication().AddJwtBearer()`), và kích hoạt các Middleware. |
| **`appsettings.json`** & **`appsettings.Development.json`** | Chứa các thông số cấu hình hệ thống: Chuỗi kết nối Database (`DefaultConnection`), cấu hình khóa bí mật JWT (`Jwt:Key`, `Issuer`, `Audience`, `ExpiresMinutes`), cấu hình gửi mail (`SmtpSettings`), và cấu hình cổng thanh toán `VnPay`. |
| **`SelfStorageAPI.csproj`** | File cấu hình Project C# và danh sách các thư viện (NuGet Packages) đang dùng như: `Microsoft.EntityFrameworkCore`, `Npgsql.EntityFrameworkCore.PostgreSQL` (kết nối Postgres), `Microsoft.AspNetCore.Authentication.JwtBearer` (xử lý JWT). |
| **`Dockerfile`** | File kịch bản đóng gói Backend thành Docker Container để deploy lên máy chủ đám mây (Render / Railway). |

---

### 2. Thư mục `Middleware/` (Trạm gác cổng an ninh)

* **`JwtIdentityMiddleware.cs`**:
  * **Vai trò:** Chạy tự động trên **mọi Request** trước khi Request chạm tới Controller.
  * **Cách hoạt động:**
    1. Đọc header `Authorization: Bearer <token>`.
    2. Nếu Token hợp lệ: Trích xuất `Email` từ bên trong Token đã giải mã và ghi đè vào header `X-User-Email` (Dòng 37-47). Nhờ vậy, người dùng ở Frontend **tuyệt đối không thể giả mạo email của người khác**.
    3. Nếu có gửi Bearer Token nhưng Token bị sai hoặc hết hạn: Chặn ngay lập tức và trả về lỗi **`401 Unauthorized`** kèm mã `TOKEN_INVALID` (Dòng 49-52).

---

### 3. Thư mục `Controllers/` (27 files — Nơi định nghĩa các API & Endpoint)

> **Nguyên tắc:** Controller **không viết logic tính toán phức tạp** và **không gọi thẳng Database** (trừ một số controller chuyên biệt). Controller chỉ nhận Request từ Frontend, gọi `Service` xử lý, rồi trả mã HTTP (`200 OK`, `201 Created`, `400 BadRequest`, `401 Unauthorized`, `403 Forbid`, `404 NotFound`, `409 Conflict`) về cho Frontend.

| Tên Controller | Đường dẫn gốc (Route) | Vai trò & Chức năng chính |
| :--- | :--- | :--- |
| **`AuthController.cs`** | `/api/Auth` | Đăng nhập (`POST /login`), cấp JWT Token, đăng ký tài khoản bằng mã OTP qua email (`POST /register/start`, `/verify`), đổi mật khẩu, quên mật khẩu. |
| **`CatalogController.cs`** | `/api/Catalog` | Lấy danh sách cơ sở, loại kho, kích thước, bảng giá (`GET /state`) và kiểm tra kho trống cho khách hàng (`GET /availability`). |
| **`ReservationController.cs`** | `/api/Reservation` | Khách hàng **tạo đơn đặt chỗ mới** (`POST /api/Reservation`), xem chi tiết đơn (`GET /{id}`), xem danh sách đơn của khách (`GET /customer/{email}`). |
| **`CustomerReservationsController.cs`** | `/api/customer-reservations` | Cho phép khách hàng chọn gán kho cụ thể hoặc đổi lịch hẹn nhận kho cho đơn đặt chỗ của mình. |
| **`ReservationConfirmationsController.cs`** | `/api/reservation-confirmations` | Xác nhận đơn đặt chỗ sau khi khách đã đóng tiền cọc. |
| **`ReservationCancellationsController.cs`** | `/api/reservation-cancellations` | Xử lý khách hủy đơn đặt chỗ, tính toán % tiền phạt hủy và số tiền cọc được hoàn lại theo `CancellationRule`. |
| **`PaymentController.cs`** | `/api/Payment` | Xác nhận thanh toán tiền cọc (`POST /confirm`). |
| **`VnPayController.cs`** | `/api/vnpay` | Tạo đường link thanh toán sang cổng ngân hàng VNPay (`POST /create-payment-url`) và nhận kết quả trả về từ VNPay (`GET /vnpay-return`). |
| **`RentPaymentsController.cs`** | `/api/rent-payments` | Thanh toán tiền thuê kho định kỳ (trả 1 lần toàn bộ kỳ hoặc trả theo từng tháng). |
| **`ContractsController.cs`** | `/api/contracts` | Kiểm tra và lưu chữ ký điện tử của khách hàng lên hợp đồng (`GET` & `POST /{contractId}/signature`). |
| **`ContractRenewalsController.cs`** | `/api/contract-renewals` | Gia hạn hợp đồng thuê kho khi sắp hết hạn (mở cổng gia hạn trước 7 ngày, tạo kỳ thu tiền mới). |
| **`HandoverController.cs`** | `/api/Handover` | Hoàn tất bàn giao kho cho khách, sinh mã khóa kho tự động `KEY-...` (`POST /complete`). |
| **`StaffToolsController.cs`** | `/api/staff-tools` | Dành riêng cho **Facility Staff**: Xem danh sách việc được giao (`GET /tasks`), bàn giao kho được phân công kèm ảnh chụp hiện trường (`POST /handover`), đổi trạng thái kho (`PUT /units/{unitId}/status`), báo cáo sự cố kho (`POST /unit-reports`). |
| **`UnitReturnsController.cs`** | `/api/unit-returns` | Luồng **Trả kho (Move Out)**: Khách đăng ký lịch trả kho (`POST /customer/{reservationId}/request`), Nhân viên nghiệm thu kho trả, ghi nhận hư hỏng, trừ tiền cọc hoặc hoàn cọc (`POST /staff/{reservationId}/complete`). |
| **`ReturnInspectionsController.cs`** | `/api/return-inspections` | Quản lý biên bản kiểm tra kho khi trả và đối soát phí hư hỏng. |
| **`ManagerToolsController.cs`** | `/api/manager-tools` | Dành cho **Facility Manager**: Phân công nhân viên nhận/trả kho, đổi nhân viên phụ trách, duyệt các yêu cầu tại cơ sở. |
| **`OperationsController.cs`** | `/api/Operations` | Quản lý vận hành: Lấy trạng thái tổng thể (`GET /state`), phân trang đơn/kho/hợp đồng, **tạo cơ sở mới** (`POST /facilities`), **tạo kho mới** (`POST /units`), cập nhật bảng giá thuê (`PUT /facilities/{id}/rates`), phân công nhân sự (`POST /facilities/{id}/staff`). |
| **`StorageUnitController.cs`** | `/api/storage-units` | Xóa kho (`DELETE /{unitId}`) — có kiểm tra ràng buộc nếu kho đã có lịch sử đơn thuê thì chặn không cho xóa (`409 Conflict`). |
| **`AdminController.cs`** | `/api/admin` | Dành riêng cho **System Admin**: Lấy danh sách toàn bộ tài khoản (`GET /users`), xem nhật ký hoạt động hệ thống (`GET /activity`), khóa/mở khóa hoặc đổi Role tài khoản (`PUT /users/{userId}`). |
| **`LateFeesController.cs`** | `/api/late-fees` | Tính toán và đồng bộ phí phạt trễ hạn đóng tiền thuê kho (`POST /facilities/{id}/sync`). |
| **`UnitTypesController.cs`** & **`UnitSizesController.cs`** | `/api/unit-types`, `/api/unit-sizes` | CRUD danh mục Loại kho (Kho tiêu chuẩn, Kho điều hòa...) và Kích thước kho (S, M, L, XL). |
| **`PriceBandsController.cs`**, **`PriceBandRulesController.cs`**, **`PoliciesController.cs`** | `/api/price-bands`, `/api/policies` | Quản lý chính sách giảm giá theo thời hạn thuê (thuê dài hạn được giảm %) và chính sách đặt cọc. |
| **`FacilityLocationsController.cs`** | `/api/facility-locations` | Trả về tọa độ bản đồ và địa chỉ các cơ sở kho. |
| **`EmailController.cs`** | `/api/email` | Gửi email thông báo hợp đồng, hóa đơn, mã OTP cho khách hàng. |

---

### 4. Thư mục `Services/` (24 files — Bộ não xử lý Logic Nghiệp Vụ)

> **Nguyên tắc:** Mọi quy tắc nghiệp vụ (Business Rules) đều nằm ở đây. Nếu giảng viên hỏi *"Logic tính tiền ở đâu? Logic kiểm tra kho trống ở đâu? Logic tạo mã KEY ở đâu?"* ➔ Tất cả đều nằm trong `Services/`!

* **`AuthService.cs`**: Kiểm tra đăng nhập (so khớp email, mật khẩu, kiểm tra tài khoản có bị `Locked` không), xử lý đổi mật khẩu.
* **`JwtTokenService.cs`**: Chuyên tạo chuỗi JWT Token bằng thuật toán ký số `HmacSha256`, nhét `UserID`, `Email`, `FullName`, `RoleName` vào trong Claims của Token.
* **`RegistrationOtpService.cs`**: Sinh mã OTP 6 chữ số ngẫu nhiên khi khách đăng ký tài khoản, lưu tạm vào DB và gửi mail xác thực.
* **`ReservationService.cs`**: Xử lý logic **Tạo đơn đặt chỗ**: kiểm tra từng kho xem có đang `Available` không, có bị người khác giữ chỗ (`ReservationHold`) không, tính tiền thuê theo bảng giá và chính sách giảm giá, tạo bản ghi `Reservation` với hạn giữ chỗ 15 phút.
* **`ReservationHoldService.cs`**: Cơ chế giữ chỗ tạm thời (Hold) để chống 2 khách hàng bấm đặt cùng 1 kho vào cùng 1 thời điểm.
* **`PaymentService.cs`**: Xử lý thanh toán tiền cọc, ghi nhận giao dịch vào bảng `Payment`, tự động tạo `Contract` (Hợp đồng) và tự động phân công nhân viên nhận kho.
* **`HandoverService.cs`**: Xử lý bàn giao kho: Kiểm tra đơn đã thanh toán chưa, khách đã ký hợp đồng chưa, đã tới ngày bắt đầu thuê chưa; tự động sinh mã mở kho `KEY-xxxx-xxxx`; lưu ảnh chụp kho nguyên vẹn (`EvidenceImages`) và chuyển trạng thái kho sang `Occupied` (Đang thuê).
* **`StaffToolsService.cs`**: Xử lý các tác vụ của nhân viên: Lấy danh sách công việc được giao (`GetMyTasksAsync`), xác nhận đơn đã cọc, bàn giao kho được phân công, báo cáo hỏng kho (tự động chuyển kho sang `Maintenance`).
* **`StaffAssignmentPolicy.cs`**: Thuật toán thông minh tự động chọn nhân viên rảnh nhất trong ca và không bị trùng khung giờ hẹn để giao việc.
* **`FacilityManagementService.cs`**: Xử lý tạo cơ sở kho mới, **tạo kho mới** (tự động sinh mã kho theo quy tắc `<Mã Cơ Sở>-U<Số thứ tự>`, ví dụ `Q1-U01`), cập nhật đơn giá thuê, gán nhân viên vào cơ sở.
* **`OperationsStateService.cs`**: Tổng hợp dữ liệu toàn cảnh (kho, đơn, hợp đồng, báo cáo doanh thu, tỷ lệ lấp đầy) theo đúng phạm vi quyền hạn của người đang đăng nhập.
* **`AdminService.cs`**: Kiểm tra quyền `System Administrator` (RoleID = 5), quản lý danh sách người dùng, tạo/cập nhật Role, ghi log kiểm toán (`UserActivityLog`).
* **`ContractSignatureService.cs`**: Lưu chữ ký điện tử (ảnh base64) của khách hàng và cập nhật trạng thái hợp đồng sang `Signed`.
* **`ContractRenewalFinalizer.cs`, `RenewalTermSettler.cs`, `RenewalSettleJob.cs`**: Xử lý logic gia hạn hợp đồng và Background Job chạy ngầm hằng ngày để chốt kỳ thuê cũ khi bước sang kỳ gia hạn mới.
* **`LateFeeService.cs` & `LateFeeRules.cs`**: Tính phí phạt trả chậm khi khách quá hạn đóng tiền thuê tháng.
* **`ReturnInspectionService.cs`**: Xử lý biên bản kiểm tra kho khi khách trả kho.

---

### 5. Thư mục `Repositories/` (14 files — Tầng giao tiếp Database)

> **Nguyên tắc:** Repository là nơi duy nhất viết các câu lệnh truy vấn `LINQ` (`_context.Reservations.Include(...).Where(...).ToListAsync()`). Việc tách Repository ra khỏi Service giúp code sạch, dễ bảo trì và quản lý Transaction (`BeginTransactionAsync`) an toàn.

* Các file tiêu biểu: `UserRepository.cs`, `ReservationRepository.cs`, `PaymentRepository.cs`, `HandoverRepository.cs`, `StaffToolsRepository.cs`, `FacilityManagementRepository.cs`, `OperationsStateRepository.cs`, `AdminRepository.cs`, `CatalogRepository.cs`...

---

### 6. Thư mục `Interfaces/` (28 files — Hợp đồng giao tiếp nội bộ C#)

* Chứa các interface bắt đầu bằng chữ `I` (`IAuthService.cs`, `IReservationService.cs`, `IReservationRepository.cs`...).
* **Ý nghĩa để trả lời giảng viên:** Dùng để áp dụng nguyên lý **Dependency Inversion (chữ D trong SOLID)** và **Dependency Injection**. Controller chỉ gọi thông qua `IService`, Service chỉ gọi thông qua `IRepository`, giúp giảm sự phụ thuộc chặt (Loose Coupling) và dễ dàng nâng cấp hoặc viết Unit Test.

---

### 7. Thư mục `DTOs/` (12 files — Data Transfer Objects)

* Chứa các class định nghĩa khuôn mẫu dữ liệu JSON gửi lên (Request) và trả về (Response) giữa Frontend và Backend (ví dụ: `LoginRequestDTO`, `AuthResponseDTO`, `CreateReservationDTO`, `CompleteHandoverDTO`...).
* **Tại sao không trả thẳng `Models` (Entity DB) ra cho Frontend mà phải dùng `DTO`?**
  1. **Bảo mật:** Tránh lộ các cột nhạy cảm trong DB (như `PasswordHash` của bảng `User`).
  2. **Tránh lỗi vòng lặp JSON (Circular Reference):** Các bảng trong DB nối khóa ngoại vòng tròn với nhau (`User` -> `Reservation` -> `User`), trả thẳng Entity sẽ gây lỗi khi serialize JSON.
  3. **Tối ưu băng thông:** Chỉ gửi đúng những trường mà màn hình Frontend cần hiển thị.

---

### 8. Thư mục `Models/` (29 files) & `Data/` (2 files) & `Constants/` (6 files)

* **`Models/`**: Mỗi file `.cs` đại diện cho **1 bảng (Table)** trong cơ sở dữ liệu PostgreSQL (ví dụ: `User.cs`, `Role.cs`, `Facility.cs`, `StorageUnit.cs`, `Reservation.cs`, `Contract.cs`, `Payment.cs`, `HandoverTask.cs`...).
* **`Data/SelfStorageDbContext.cs`**: Lớp kế thừa từ `DbContext` của Entity Framework Core, khai báo các `DbSet<T>` và cấu hình khóa chính, khóa ngoại, индексы (Indexes), ràng buộc Unique giữa các bảng.
* **`Data/DatabaseSeeder.cs`**: Tự động tạo dữ liệu mẫu (5 cơ sở, các tài khoản Admin/Manager/Staff/Customer, danh mục kho) nếu Database trống.
* **`Constants/`**: Chứa các hằng số dùng chung toàn hệ thống (`RoleNames.cs`, `ReservationStatus.cs`, `UnitStatus.cs`, `BusinessClock.cs` hỗ trợ đồng hồ giả lập ngày để demo).

---

## PHẦN 3: CHỈ TẬN TAY TỪNG CHỖ TRONG CODE KHI GIẢNG VIÊN YÊU CẦU MỞ FILE

Khi ngồi trước mặt giảng viên, nếu thầy/cô hỏi: **"Đâu, mở code chỗ đó ra chỉ cho thầy xem!"**, bạn mở đúng file và dòng dưới đây:

---

### 1. Chỗ nào biểu thị API và Endpoint trong code?

Mở bất kỳ file nào trong thư mục `backend/Controllers/`, ví dụ mở **`backend/Controllers/ReservationController.cs`**:

* **Dòng 7-9:**
  ```csharp
  [ApiController]
  [Route("api/[controller]")]
  public class ReservationController : ControllerBase
  ```
  * `[ApiController]`: Đánh dấu class này là một RESTful Web API Controller.
  * `[Route("api/[controller]")]`: Tự động lấy tên class bỏ chữ `Controller` để làm đường dẫn gốc ➔ URL gốc là **`/api/Reservation`**.
* **Dòng 18:** `[HttpPost]` ➔ Biểu thị phương thức `POST /api/Reservation`.
* **Dòng 45:** `[HttpGet("{id:int}")]` ➔ Biểu thị phương thức `GET /api/Reservation/123` (nhận tham số `id` kiểu số nguyên trên URL).
* **Dòng 64:** `[HttpGet("customer/{email}")]` ➔ Biểu thị phương thức `GET /api/Reservation/customer/cust1@test.com`.

---

### 2. Chỗ nào biểu thị kết nối Frontend với Backend (CORS & API_URL)?

Việc kết nối giữa Frontend (React chạy ở cổng `5173` hoặc trên `vercel.app`) và Backend (.NET chạy ở cổng `5046`/`6868` hoặc trên `onrender.com`) nằm ở **2 điểm đối xứng**:

1. **Ở phía Backend (`backend/Program.cs`):**
   * **Dòng 28-37 (Khai báo chính sách CORS):**
     ```csharp
     builder.Services.AddCors(options =>
     {
         options.AddPolicy("AllowFrontend",
             policy =>
             {
                 policy.AllowAnyOrigin()
                       .AllowAnyHeader()
                       .AllowAnyMethod();
             });
     });
     ```
   * **Dòng 192 (Kích hoạt CORS vào Pipeline):**
     ```csharp
     app.UseCors("AllowFrontend");
     ```
   * **Giải thích với giảng viên:** *"Vì Frontend và Backend chạy ở 2 tên miền/cổng (Port) khác nhau, trình duyệt sẽ chặn theo chính sách Same-Origin Policy. Nhóm em cấu hình `AddCors("AllowFrontend")` tại `Program.cs` dòng 28 và `UseCors` tại dòng 192 để cho phép Frontend gửi các request `GET, POST, PUT, DELETE` kèm Header `Authorization` sang Backend."*
2. **Ở phía biến cấu hình nối vào Database (`backend/Program.cs`):**
   * **Dòng 67-101:** Đọc `DATABASE_URL` hoặc `DefaultConnection` trong `appsettings.json` và khởi tạo `AddDbContext<SelfStorageDbContext>(options => options.UseNpgsql(...))`.

---

### 3. Chỉ tận nơi các API Nghiệp Vụ Quan Trọng Nhất

#### A. API Đăng nhập & Sinh JWT Token
* **Controller:** `backend/Controllers/AuthController.cs` (Dòng **31 - 61**):
  * Endpoint: `[HttpPost("login")]` ➔ `POST /api/Auth/login`.
  * Dòng 36: Gọi `_authService.LoginAsync(request)` để kiểm tra Email & Password.
  * Dòng 56-58: Gọi `_jwtTokenService.CreateToken(user)` để sinh chuỗi JWT Token và gán vào `user.Token`, trả về `200 OK`.
* **Nơi tạo Token:** `backend/Services/JwtTokenService.cs` (Dòng **36 - 61**):
  * Đóng gói `UserID`, `Email`, `FullName`, `RoleName` vào `List<Claim>` (Dòng 40-49).
  * Ký bằng khóa bí mật `SymmetricSecurityKey` với thuật toán `SecurityAlgorithms.HmacSha256` (Dòng 51-58).

#### B. API Tạo Đơn Đặt Chỗ (Khách hàng đặt kho)
* **Controller:** `backend/Controllers/ReservationController.cs` (Dòng **18 - 43**):
  * Endpoint: `[HttpPost]` ➔ `POST /api/Reservation`.
  * Nhận dữ liệu đầu vào: `[FromBody] CreateReservationDTO request` (gồm `FacilityID`, danh sách `Items` loại kho/cỡ kho/số lượng, `StartDate`, `DurationMonths`, `PaymentPlan`, `HandoverMethod`).
* **Service xử lý:** `backend/Services/ReservationService.cs` (Hàm `CreateReservationAsync` — Dòng **25 - 245**):
  * Kiểm tra tài khoản phải có quyền `Storage Customer`.
  * Kiểm tra ngày thuê hợp lệ và tìm kho trống (`Available`).
  * Tính tiền thuê (`TotalRentalAmount`) và tiền đặt cọc (`DepositAmount`).
  * Mở Database Transaction, tạo bản ghi `Reservation` với mã `RS-2026-xxxxx`, giữ chỗ kho trong 15 phút để khách thanh toán.

#### C. API Tạo Kho Mới (`StorageUnit`) & Tạo Cơ Sở (`Facility`)
* **Controller:** `backend/Controllers/OperationsController.cs`:
  * **Tạo Cơ Sở Mới:** Dòng **125 - 133** (`[HttpPost("facilities")]` ➔ `POST /api/Operations/facilities`).
  * **Tạo Kho Mới:** Dòng **167 - 175** (`[HttpPost("units")]` ➔ `POST /api/Operations/units`).
* **Service xử lý:** `backend/Services/FacilityManagementService.cs`:
  * Hàm `CreateUnitAsync` (Dòng **299 - 375**):
    * Kiểm tra người gọi phải là `Business Operations Manager` hoặc `Facility Manager` quản lý đúng cơ sở đó.
    * Tự động lấy tiền tố cơ sở (ví dụ `Q1`, `Q7`, `TD`) và đánh số thứ tự tiếp theo để sinh mã kho tự động (ví dụ `Q1-U31`) nếu người dùng không tự nhập mã.
    * Lưu kho mới với trạng thái mặc định là `Available`.

#### D. API Bàn Giao Kho & Lưu Ảnh Chụp Kho Nguyên Vẹn
* **Controller:** `backend/Controllers/StaffToolsController.cs` (Dòng **58 - 66**):
  * Endpoint: `[HttpPost("handover")]` ➔ `POST /api/staff-tools/handover`.
* **Service xử lý:** `backend/Services/HandoverService.cs` (Hàm `CompleteHandoverAsync` — Dòng **45 - 165**):
  * Kiểm tra kho không nằm trong trạng thái bảo trì/đang thuê.
  * Tự động sinh mã khóa truy cập kho `KEY-<MãKho>-<4KýTựNgẫuNhiên>` (ví dụ `KEY-Q1U05-8F2A`).
  * Lưu ảnh chụp kho nguyên vẹn (`EvidenceImages`) và ghi chú tình trạng kho (`UnitConditionNotes`) vào bảng `HandoverTask` với `ConditionResult = "Good"`.
  * Đổi trạng thái kho sang `Occupied` và đơn đặt chỗ sang `Active`.

---

## PHẦN 4: CÁCH SHOW "LOGIN THÀNH CÔNG, TOKEN SHOW ĐƯỢC, PHÂN QUYỀN RÕ RÀNG" TRƯỚC GIẢNG VIÊN

Để vượt qua yêu cầu gắt gao của giảng viên một cách thuyết phục nhất, bạn hãy kết hợp **Show trên Trình duyệt** và **Show trong Code Backend**:

### Bước 1: Show Login & Token thực tế (30 giây)
1. Mở trình duyệt, bấm **`F12` ➔ Tab `Network`**.
2. Đăng nhập bằng tài khoản `staff1@test.com` / `123456`.
3. Bấm vào dòng request **`login`** trong tab Network ➔ Mở tab **`Response`**:
   * Chỉ cho giảng viên thấy JSON trả về từ Backend có:
     * `"email": "staff1@test.com"`
     * `"roleName": "Facility Staff"`
     * `"token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`
     * `"tokenExpiresAt": "..."`
4. Copy chuỗi `token` đó, dán vào trang **[https://jwt.io](https://jwt.io)** (hoặc giải mã ngay trong Console) để show phần **Payload** chứa đúng `role: "Facility Staff"`, `email: "staff1@test.com"`.
5. Mở sang file **`backend/Services/JwtTokenService.cs` (Dòng 36-61)** trên VS Code và nói:
   > *"Dạ đây chính là hàm `CreateToken` ở Backend đã đóng gói các thông tin đó vào Claims và ký bằng HMAC-SHA256 ạ."*

### Bước 2: Show Phân Quyền Rõ Ràng (Cả ở Code lẫn Thực Tế)
1. **Chỉ vào Code Backend để chứng minh phân quyền chặt chẽ:**
   * Mở `backend/Middleware/JwtIdentityMiddleware.cs` (Dòng 37-48):
     > *"Mọi request gửi lên đều đi qua Middleware này đầu tiên. Middleware đọc Token đã được xác thực, rút `ClaimTypes.Email` từ Token ra và ghi đè vào Header `X-User-Email`. Client không thể sửa header để mạo danh người khác."*
   * Mở `backend/Services/AdminService.cs` (Dòng 21-22):
     ```csharp
     var admin = await _adminRepository.GetActiveAdministratorByEmailAsync(adminEmail, cancellationToken);
     if (admin == null) return new AdminServiceResponse(false, null, 403, null);
     ```
     > *"Ở tầng Service, hệ thống kiểm tra chính xác Role của user trong Database. Ví dụ ở `AdminService`, nếu không phải `System Administrator` (RoleID = 5) thì trả về mã lỗi `403 Forbidden`."*
   * Mở `backend/Services/StaffToolsService.cs` (Dòng 131-135):
     ```csharp
     if (user.RoleID != StaffRoleId)
         return Fail(403, "Chỉ Facility Staff mới xem được danh sách việc được giao.");
     if (facilityId.HasValue && !await _repo.IsActiveStaffOfFacilityAsync(user.UserID, facilityId.Value, cancellationToken))
         return Fail(403, "Bạn không làm việc tại cơ sở này.");
     ```
     > *"Thậm chí cùng là Staff, nhưng nhân viên của Cơ sở 1 cũng không thể thao tác lên kho của Cơ sở 2 vì hàm `IsActiveStaffOfFacilityAsync` kiểm tra bảng `FacilityStaff` và chặn bằng lỗi `403`."*

2. **Test chặn quyền 403 ngay trên Console cho giảng viên xem:**
   * Lưu ý: Phải gọi qua biến địa chỉ Backend thật (hoặc dùng Swagger UI tại `http://localhost:5046/swagger`).
   * Nếu đang mở web, mở F12 Console và dán đoạn lệnh này (đoạn lệnh này tự tìm đúng URL Backend hoặc gọi thẳng vào Backend):
     ```javascript
     // Lấy user hiện tại đang đăng nhập (ví dụ đang là Staff hoặc Customer)
     const u = JSON.parse(localStorage.getItem('storespace_current_user'));
     // Điền URL Backend (hoặc lấy từ biến môi trường nếu chạy local là http://localhost:5046 hoặc http://localhost:6868)
     const apiBase = 'http://localhost:5046'; 
     fetch(`${apiBase}/api/admin/users`, {
       headers: { 'Authorization': 'Bearer ' + u.token }
     }).then(r => console.log('HTTP Status:', r.status));
     // Kết quả in ra: HTTP Status: 403
     ```

---

## PHẦN 5: NGÂN HÀNG CÂU HỎI PHỎNG VẤN CHUYÊN SÂU CỦA GIẢNG VIÊN & CÁCH ĐỐI PHÓ

Trong buổi chấm loại trừ trực tiếp, giảng viên thường hỏi xoáy vào **4 nhóm câu hỏi** sau để kiểm tra xem sinh viên có thực sự hiểu code hay chỉ copy/AI viết. Hãy đọc kỹ từng câu:

---

### NHÓM A: Câu hỏi về Kiến trúc & C# .NET Core

#### Câu 1: *"Tại sao trong `Program.cs` (dòng 104-140) em lại dùng `builder.Services.AddScoped<...>()` mà không dùng `AddTransient` hay `AddSingleton`?"*
* **Cách trả lời chuẩn điểm 10:**
  > *"Dạ thưa thầy/cô, trong ASP.NET Core có 3 vòng đời (Lifetime) cho Dependency Injection:*
  > *- `Singleton`: Chỉ tạo 1 instance duy nhất dùng chung cho toàn bộ ứng dụng từ lúc bật tới lúc tắt.*
  > *- `Transient`: Mỗi lần được yêu cầu là tạo mới 1 instance.*
  > *- `Scoped`: Tạo 1 instance duy nhất trong phạm vi **1 HTTP Request**.*
  > *Vì các `Repository` và `Service` của em làm việc với `SelfStorageDbContext` (mà `AddDbContext` mặc định có vòng đời là `Scoped` để quản lý kết nối và Transaction trên từng HTTP Request), nên các `Service` và `Repository` cũng phải dùng `AddScoped` để dùng chung đúng 1 `DbContext` trong suốt 1 Request đó và tự động giải phóng bộ nhớ khi Request kết thúc ạ."*

#### Câu 2: *"Từ khóa `async / await` và `CancellationToken` trong các hàm Controller/Service để làm gì? Bỏ đi có chạy được không?"*
* **Cách trả lời:**
  > *"Dạ bỏ đi và viết đồng bộ (Synchronous) thì vẫn chạy được, nhưng dùng `async / await` giúp xử lý **Bất đồng bộ (Asynchronous I/O)** khi chờ truy vấn Database hoặc gửi Email. Trong lúc chờ Database phản hồi, luồng (Thread) của Server không bị treo (block) mà được giải phóng để phục vụ các request của người dùng khác, giúp hệ thống chịu tải cao hơn.*
  > *Còn `CancellationToken` giúp hủy ngay câu lệnh truy vấn Database nếu người dùng đột ngột tắt trình duyệt hoặc hủy request giữa chừng, tránh lãng phí tài nguyên của Database ạ."*

#### Câu 3: *"Tại sao phải chia ra `Controller`, `Service`, `Repository`? Viết hết code vào `Controller` cho nhanh có được không?"*
* **Cách trả lời:**
  > *"Dạ nếu viết hết vào Controller (Fat Controller) thì khi dự án lớn lên code sẽ bị rối, lặp lại câu lệnh truy vấn DB ở nhiều nơi và rất khó sửa lỗi. Nhóm em tách thành 3 tầng theo nguyên lý **Separation of Concerns (Phân tách trách nhiệm)**:*
  > *- `Controller`: Chỉ lo giao tiếp HTTP (nhận Request, trả Status Code).*
  > *- `Service`: Chứa toàn bộ quy tắc nghiệp vụ (Business Logic).*
  > *- `Repository`: Chứa các câu lệnh LINQ truy vấn Database.*
  > *Nhờ vậy, nhiều Service có thể tái sử dụng lại cùng một hàm trong Repository và khi thay đổi logic nghiệp vụ thì không ảnh hưởng đến tầng truy xuất dữ liệu ạ."*

---

### NHÓM B: Câu hỏi về Bảo mật, JWT & Phân quyền

#### Câu 4: *"Khi người dùng bấm Đăng xuất (Logout), Token cũ có bị xóa trên Server không? JWT hoạt động như thế nào?"*
* **Cách trả lời:**
  > *"Dạ vì JWT là **Stateless Token** (Server không lưu danh sách Token trong RAM hay Database mà kiểm tra bằng chữ ký số HMAC-SHA256 và thời gian hết hạn `exp`), nên khi bấm Logout, Frontend sẽ xóa Token khỏi `localStorage`. Còn ở phía Server, mỗi khi nhận Token, Server sẽ tự tính toán lại chữ ký bằng `Secret Key` trong `appsettings.json` (tối thiểu 32 ký tự). Nếu bất kỳ ai sửa đổi nội dung Payload (ví dụ sửa Role từ Customer thành Admin), chữ ký sẽ không khớp và bị chặn ngay với lỗi `401 Unauthorized`."*

#### Câu 5: *"Tại sao trong các Controller anh lại thấy lấy `Request.Headers["X-User-Email"]`? Nhỡ người dùng dùng Postman tự điền `X-User-Email: admin@test.com` vào thì sao?"*
* **Câu này RẤT HAY BỊ HỎI! Hãy trả lời tự tin:**
  > *"Dạ thưa thầy/cô, nhóm em đã chặn lỗ hổng đó ở file **`Middleware/JwtIdentityMiddleware.cs` (dòng 37-57)**!*
  > *Trước khi Request vào tới bất kỳ Controller nào, `JwtIdentityMiddleware` sẽ chạy trước:*
  > *- Nếu Request có JWT hợp lệ: Middleware sẽ lấy Email thật từ trong JWT đã giải mã và **ghi đè (overwrite)** lên header `X-User-Email` (dòng 46).*
  > *- Nếu Request không có JWT và cấu hình `AllowLegacyEmailHeader = false`: Middleware sẽ **xóa sạch (`headers.Remove`)** header `X-User-Email` do client tự gửi lên (dòng 56).*
  > *Do đó, client dùng Postman tự bịa `X-User-Email: admin@test.com` cũng sẽ bị Middleware xóa đi hoặc bị ghi đè bằng email thật trong Token, hoàn toàn không thể giả mạo được ạ!"*

---

### NHÓM C: Câu hỏi về Nghiệp vụ Đặt chỗ, Thanh toán & Chống trùng kho

#### Câu 6: *"Giả sử cơ sở chỉ còn đúng 1 kho trống `Q1-U01`. Có 2 khách hàng cùng bấm nút Đặt chỗ ở cùng 1 giây thì hệ thống xử lý thế nào để không bị bán trùng 1 kho cho 2 người?"*
* **Cách trả lời:**
  > *"Dạ nhóm em xử lý bài toán Race Condition này bằng **2 cơ chế kết hợp** trong `ReservationService.cs` và `ReservationRepository.cs`:*
  > *1. **Database Transaction (`ExecuteInTransactionAsync`)**: Toàn bộ quá trình kiểm tra kho trống, tạo đơn `Reservation`, gán kho vào `ReservationUnit` và tạo bản ghi giữ chỗ `ReservationHold` được bọc trong một Transaction duy nhất. Nếu kho vừa bị người khác giữ, thao tác sẽ báo lỗi `409 Conflict` và Rollback toàn bộ.*
  > *2. **Cơ chế Giữ chỗ 15 phút (`HoldExpiresAt` & `ReservationHold`)**: Ngay khi người thứ nhất tạo đơn, kho đó lập tức được đưa vào danh sách đang giữ chỗ (`Hold`) trong 15 phút để chờ thanh toán VNPay. Người thứ hai bấm sau vài mili-giây sẽ thấy kho đó không còn khả dụng nữa. Nếu sau 15 phút người thứ nhất không thanh toán, hệ thống tự động giải phóng kho (`ReleaseExpiredHoldsAsync`) để người khác đặt ạ."*

#### Câu 7: *"Luồng thanh toán VNPay hoạt động như thế nào trong Backend của em?"*
* **Cách trả lời:**
  > *"Dạ luồng VNPay nằm ở **`Controllers/VnPayController.cs`** gồm 2 bước:*
  > *1. **Tạo URL thanh toán (`POST /api/vnpay/create-payment-url`)**: Backend nhận `ReservationId` và số tiền, ghép các tham số chuẩn của VNPay (`vnp_TmnCode`, `vnp_Amount` nhân 100, `vnp_TxnRef`, `vnp_ReturnUrl`), sắp xếp theo thứ tự bảng chữ cái và băm chữ ký bảo mật **`HMAC-SHA512`** bằng `vnp_HashSecret`, sau đó trả URL về cho Frontend chuyển hướng sang cổng VNPay.*
  > *2. **Xác nhận kết quả (`GET /api/vnpay/vnpay-return`)**: Khi khách thanh toán xong trên VNPay, VNPay gọi về kèm chữ ký `vnp_SecureHash`. Backend kiểm tra lại chữ ký `HMAC-SHA512` để chống giả mạo giao dịch, kiểm tra `vnp_ResponseCode == "00"` và gọi `PaymentService.ConfirmDepositPaymentAsync` để chuyển trạng thái đơn sang đã thanh toán (`Paid`), tạo Hợp đồng (`Contract`) và tự động phân công nhân viên bàn giao kho ạ."*

---

### NHÓM D: Câu hỏi "Thử Thách Sửa Code Tại Chỗ" (Live Coding)

Giảng viên rất hay yêu cầu sửa nhẹ 1 chỗ trong code để xem bạn có biết code nằm ở đâu không. Đây là 3 yêu cầu phổ biến nhất và cách làm ngay trong 10 giây:

1. **Tình huống 1:** *"Em hãy đổi thời gian giữ chỗ đơn đặt kho từ 15 phút thành 30 phút cho thầy xem."*
   * **Mở ngay:** `backend/Services/ReservationService.cs` ➔ Tìm dòng `AddMinutes(15)` (khoảng dòng 142) ➔ Đổi số `15` thành `30`.
2. **Tình huống 2:** *"Em hãy đổi thời hạn sống của JWT Token từ 7 ngày xuống còn 60 phút cho thầy xem."*
   * **Mở ngay:** `backend/appsettings.json` (hoặc `backend/Services/JwtTokenService.cs` dòng 19) ➔ Đổi `"ExpiresMinutes": 10080` thành `"ExpiresMinutes": 60`.
3. **Tình huống 3:** *"Em hãy chỉ cho thầy chỗ nào giới hạn nhân viên chỉ được làm tối đa bao nhiêu việc trong 1 ngày / 1 khung giờ?"*
   * **Mở ngay:** `backend/Services/StaffAssignmentPolicy.cs` ➔ Chỉ vào hằng số `MaxTasksPerDay = 6` và hàm `ChooseBestStaff` (ưu tiên nhân viên chưa bị trùng khung giờ hẹn và có ít việc nhất trong ngày).

---

## BẢNG TRA CỨU NHANH (CHEAT SHEET) ĐỂ MỞ FILE TRONG 3 GIÂY

| Khi giảng viên hỏi về... | Mở ngay file này trong `backend/` |
| :--- | :--- |
| **Cấu hình CORS, Kết nối DB, Khởi tạo JWT** | `Program.cs` (Dòng 28, 91, 150, 192) |
| **Đăng nhập & Đăng ký OTP** | `Controllers/AuthController.cs` & `Services/AuthService.cs` |
| **Nơi sinh ra chuỗi JWT Token** | `Services/JwtTokenService.cs` (Dòng 36) |
| **Nơi kiểm tra Token & Chống giả mạo Email** | `Middleware/JwtIdentityMiddleware.cs` (Dòng 30) |
| **Khách hàng Tạo đơn đặt chỗ** | `Controllers/ReservationController.cs` & `Services/ReservationService.cs` |
| **Thanh toán cọc & VNPay** | `Controllers/VnPayController.cs` & `Services/PaymentService.cs` |
| **Ký hợp đồng điện tử (Chữ ký Base64)** | `Controllers/ContractsController.cs` & `Services/ContractSignatureService.cs` |
| **Bàn giao kho, Sinh mã KEY, Lưu ảnh kho** | `Controllers/StaffToolsController.cs` & `Services/HandoverService.cs` |
| **Tự động phân công việc cho Staff** | `Services/StaffAssignmentPolicy.cs` |
| **Tạo kho mới (Sinh mã Q1-Uxx), Tạo cơ sở** | `Controllers/OperationsController.cs` & `Services/FacilityManagementService.cs` |
| **Khách trả kho, Kiểm tra hư hỏng, Hoàn cọc** | `Controllers/UnitReturnsController.cs` & `Services/ReturnInspectionService.cs` |
| **Gia hạn hợp đồng thuê kho** | `Controllers/ContractRenewalsController.cs` |
| **Tính phí phạt trễ hạn tiền thuê** | `Controllers/LateFeesController.cs` & `Services/LateFeeService.cs` |
| **Admin quản lý User & Phân quyền Role** | `Controllers/AdminController.cs` & `Services/AdminService.cs` |
| **Khai báo bảng và khóa ngoại Database** | `Data/SelfStorageDbContext.cs` & thư mục `Models/` |

