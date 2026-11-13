# GIẢI THÍCH CHI TIẾT 55 TEST CASE – MODULE 2 (CATALOG, BOOKING & PAYMENT)

File Excel: `SWT301_TestCase_StoreSpace_220TC.xls` → sheet **Module2** (TC056 → TC110)
Kết quả: **48 Pass / 7 Fail**

---

## 1. Các test case này có dựa đúng vào project StoreSpace không?

**Có.** Mỗi test case đều được đối chiếu với code và dữ liệu mẫu thật của project:

| Nguồn | Dùng để kiểm tra |
| :--- | :--- |
| `backend/Services/ReservationService.cs` | Tạo đơn giữ chỗ, kiểm tra số tháng, ngày bắt đầu, cùng cơ sở, cách nhận kho, khung giờ |
| `backend/Repositories/ReservationRepository.cs` | Kiểm tra trùng lịch (race condition), chính sách cọc/giữ chỗ, giảm giá |
| `backend/Services/PaymentService.cs` + `Controllers/PaymentController.cs` | Thanh toán cọc Simulator (`POST /api/payment/confirm`) |
| `backend/Controllers/VnPayController.cs` | Tạo link VNPay, kiểm tra chữ ký, số tiền, idempotent, `/api/vnpay/status` |
| `backend/Controllers/ReservationCancellationsController.cs` | Hủy đơn, mốc hoàn cọc, thử lại hoàn tiền |
| `backend/Controllers/ReservationConfirmationsController.cs` | Tự tạo hợp đồng sau khi trả cọc |
| `backend/Data/DatabaseSeeder.cs` | Dữ liệu mẫu: cơ sở, mã kho, loại kho, kích thước, giá, chính sách |
| `frontend/src/App.jsx`, `pages/customer/CartPage.jsx`, `store/cart.js`, `store/bookingDraft.js`, `services/pricing.js`, `features/payment/*`, `features/booking/CancelReservation.jsx` | Giao diện: bộ lọc, giỏ hàng, bản nháp, đồng hồ đếm ngược, popup hủy |

**Lưu ý về cách xác định Pass/Fail:**
- Kết quả được xác định bằng cách **đọc code** (code review), chưa chạy app thật. Các case cần môi trường thật (VNPay Sandbox, 2 trình duyệt, chờ 15 phút, Demo Clock) nên được nhóm chạy lại để xác nhận.
- 5 bug cũ của nhóm (BUG-007, 008, 009, 011, 012) được giữ nguyên vì là lỗi giao diện quan sát khi chạy. Riêng **BUG-011** thì code popup hủy đã dùng `formatVnd()` (định dạng `vi-VN`), nên có thể lỗi đã hết, cần chạy lại để chắc chắn.
- 2 bug mới (**BUG-025**, **BUG-026**) được phát hiện trực tiếp từ code.

**Các chỗ đã sửa cho khớp project** (bản cũ ghi sai so với dữ liệu thật):

| Bản cũ | Thực tế trong project |
| :--- | :--- |
| Cơ sở "Bình Tân", kho `BT-U01` | Không có. Cơ sở thật là **Tân Bình**, kho `TB-...` |
| Kho `TD-U02` đang thuê (Occupied) | `TD-U02` là **Available**. Kho đang thuê thật: `TB-U03`, `Q1-U04`. Kho bảo trì: `Q1-U09` |
| Loại kho "Điều hòa / Climate-controlled" | Tên thật: **Climate-Control Unit** |
| Trạng thái `Occupied`, `Reserved` | Trạng thái thật: `In Use`, `Maintenance`, `Pending Payment`, `Paid`, `Confirmed`, `Handed Over`, `Cancelled`, `Expired` |
| Mã đơn `RES-...` | Mã thật: **`RS-yyyy-xxxxx`**; hợp đồng `HD-yyyy-xxxxx`; gia hạn `GH-...` |
| "Nhận tại quầy (Counter)" + "Trả toàn bộ (Full)" | Giá trị thật: `InPerson` / `Online` và `Upfront` / `Monthly` |
| API `/api/payments/confirm` | API thật: **`/api/payment/confirm`** |
| Thuê 3 tháng | Giao diện chỉ cho chọn **6 hoặc 12 tháng** (`RENTAL_TERMS = [6, 12]`); API nhận 1, 3, 6, 12 |

---

## 2. Dữ liệu mẫu dùng trong test (từ `DatabaseSeeder.cs`)

**Cơ sở (5 cơ sở):** Quận 1 (`Q1`), Tân Bình (`TB`), Thủ Đức (`TD`), Quận 2 (`Q2`), Quận 3 (`Q3`)

**Loại kho:** Climate-Control Unit, Drive-up Unit, Basic Unit, Indoor Unit
**Nhóm kích thước:** Small (S1–S4), Medium (M1–M2), Large (L1–L3), Vehicle (V1)

**Các kho hay dùng trong test:**

| Mã kho | Cơ sở | Loại | Giá/tháng | Trạng thái |
| :--- | :--- | :--- | ---: | :--- |
| TD-U01 | Thủ Đức | Climate-Control, S1 | 400.000đ | Available |
| TD-U02 | Thủ Đức | Climate-Control, S2 | 500.000đ | Available |
| TD-U03 | Thủ Đức | Indoor, M1 | 800.000đ | Available |
| TD-U04 | Thủ Đức | Indoor, M2 | 1.000.000đ | Available |
| TB-U01 | Tân Bình | Climate-Control, S1 | 400.000đ | Available |
| TB-U03 | Tân Bình | Basic, M1 | 750.000đ | **In Use** |
| Q1-U09 | Quận 1 | Climate-Control, S3 | 700.000đ | **Maintenance** |

Thủ Đức có 11 kho (TD-U01 → TD-U11), đủ để test danh sách dài và giới hạn 5 kho/đơn.

**Quy tắc nghiệp vụ chính:**

| Quy tắc | Giá trị | Nguồn |
| :--- | :--- | :--- |
| Thời gian giữ chỗ chờ trả cọc | 15 phút | `RentalPolicy.HoldMinutes = 15` |
| Tiền cọc | 2 tháng tiền thuê | `RentalPolicy.DepositMonths = 2` |
| Lúc đặt chỉ thu | Tiền cọc. Tiền thuê đóng khi nhận kho (Upfront) hoặc đầu mỗi kỳ (Monthly) | `PaymentService.cs` |
| Giỏ hàng | Tối đa 10 kho; mỗi lần đặt tối đa **5 kho**, cùng **1 cơ sở** | `store/cart.js` |
| Hoàn cọc khi hủy | ≥ 7 ngày trước ngày nhận: 100% · ≥ 3 ngày: 50% · < 3 ngày: 0% | `CancellationRule` |
| Giảm giá dài hạn | Đang **tắt** (luôn 0%) | migration `20261029_TamBoGiamGia.sql` |

---

## 3. Giải thích từng test case

Cách đọc mỗi case:
- **Mục đích:** case kiểm tra điều gì, vì sao cần test.
- **Cách test:** tóm tắt các bước trong cột Procedure.
- **Căn cứ trong project:** chỗ code hoặc dữ liệu quyết định kết quả.
- **Kết quả:** Pass/Fail và lý do.

### Nhóm 1 – Catalog & Filters (Tra cứu & lọc kho) – TC056 → TC070

**TC056 – Hiển thị danh sách cơ sở và kho trống**
- **Mục đích:** đây là màn hình đầu tiên khách thấy. Nếu không hiện đúng cơ sở, kho, giá thì toàn bộ luồng đặt kho phía sau không làm được.
- **Cách test:** mở trang chủ → Find Storage → chọn Thủ Đức rồi Tân Bình → xem danh sách/sơ đồ kho.
- **Căn cứ:** dữ liệu lấy từ `GET /api/catalog/state` (`CatalogController`), mỗi kho có mã, trạng thái, kích thước, giá từ bảng `RentalRate`.
- **Kết quả:** Pass.

**TC057 – Lọc theo cơ sở**
- **Mục đích:** khách thường tìm kho gần nhà nên lọc theo cơ sở phải chính xác.
- **Cách test:** chọn cơ sở "Thu Duc" → chỉ còn kho mã `TD-...`.
- **Căn cứ:** mỗi cơ sở có tiền tố mã kho riêng (`UnitCodePrefix`): Thủ Đức = `TD`.
- **Kết quả:** Pass.

**TC058 – Lọc theo loại kho**
- **Mục đích:** khách cần đúng loại kho (vd đồ điện tử cần kho điều hòa).
- **Cách test:** chọn "Climate-Control Unit" → chỉ còn kho loại này.
- **Căn cứ:** project có 4 loại kho (bảng `UnitType`).
- **Kết quả:** Pass.

**TC059 – Lọc theo kích thước**
- **Mục đích:** khách chọn kho vừa với lượng đồ.
- **Cách test:** chọn "Medium" → chỉ còn kho M1/M2.
- **Căn cứ:** kích thước thuộc nhóm `SizeCategory` (Small / Medium / Large / Vehicle).
- **Kết quả:** Pass.

**TC060 – Kết hợp 3 bộ lọc**
- **Mục đích:** bộ lọc phải kết hợp theo kiểu "VÀ", không phải "HOẶC".
- **Cách test:** Thu Duc + Climate-Control Unit + Small → kết quả phải thỏa cả 3.
- **Căn cứ:** dữ liệu mẫu có TD-U01, TD-U02, TD-U09 thỏa cả 3 điều kiện nên sẽ có kết quả để kiểm tra.
- **Kết quả:** Pass.

**TC061 – Xóa bộ lọc**
- **Mục đích:** sau khi lọc, khách phải quay lại xem toàn bộ được.
- **Cách test:** áp dụng 2 bộ lọc → bấm "Clear filters" → danh sách đầy đủ trở lại, các ô lọc về mặc định.
- **Kết quả:** Pass.

**TC062 – Kho đang thuê (In Use) / đang bảo trì (Maintenance)**
- **Mục đích:** không cho khách đặt kho đã có người thuê hoặc đang sửa.
- **Cách test:** xem `TB-U03` (In Use) và `Q1-U09` (Maintenance) → không thêm được vào giỏ.
- **Căn cứ:** trạng thái lấy từ `UnitStatus`; backend còn chặn thêm một lớp nữa: kho `Maintenance`/`Inactive` trả 409 khi tạo đơn (`ReservationService.cs`).
- **Kết quả:** Pass.

**TC063 – Giảm giá khi thuê dài hạn** ❌ **Fail – BUG-025 (mới)**
- **Mục đích:** kiểm tra khung giá giảm khi thuê 6 hoặc 12 tháng.
- **Cách test:** thêm `TD-U04` (1.000.000đ/tháng) → chọn 6 tháng, rồi 12 tháng → so giá/tháng với giá niêm yết.
- **Căn cứ:**
  - Frontend `services/pricing.js`: `DISCOUNT_ENABLED = false`, `discountFor()` luôn trả 0.
  - Backend `ReservationRepository.GetReservationPolicyAndDiscountAsync()` luôn trả `DiscountRate = 0m`.
  - Seeder: mọi `ContractType` đều có `DiscountRate = 0`.
- **Kết quả:** Fail, giá vẫn 1.000.000đ/tháng ở mọi gói.
- **Lưu ý:** tính năng này được **cố ý tắt** bằng migration `20261029_TamBoGiamGia.sql`. Nếu nhóm xác nhận đây là yêu cầu mới (không giảm giá) thì đổi Expected thành "không giảm giá" và chuyển case sang Pass.

**TC064 – Tính tiền cọc**
- **Mục đích:** tiền cọc sai thì khách trả sai và hoàn sai, ảnh hưởng trực tiếp tới tiền.
- **Cách test:** thêm `TD-U04` (1.000.000đ) → chọn 6 tháng → xem tóm tắt.
- **Căn cứ:** công thức trong `pricing.js` và `ReservationService.cs`: cọc = giá/tháng × `DepositMonths` (2) = **2.000.000đ**; tiền thuê 6 tháng = 6.000.000đ hiển thị riêng.
- **Kết quả:** Pass.

**TC065 – Xem chi tiết kho trên sơ đồ**
- **Mục đích:** khách xem thông tin kho trước khi chọn.
- **Cách test:** mở sơ đồ Thủ Đức → bấm ô `TD-U01` → hiện popup mã kho, diện tích, loại, giá, nút thêm vào giỏ.
- **Căn cứ:** `features/facility/FacilityMap.jsx`, `FacilityUnitsMap.jsx`.
- **Kết quả:** Pass.

**TC066 – Lọc không có kết quả** ❌ **Fail – BUG-007**
- **Mục đích:** khi không có kho phù hợp phải báo rõ ràng, giao diện không bị vỡ.
- **Cách test:** Tan Binh + Climate-Control Unit + Large. Tân Bình không có kho Climate-Control cỡ Large nên kết quả rỗng.
- **Căn cứ:** `App.jsx` có hiện thông báo "Không tìm thấy kho phù hợp với bộ lọc."
- **Kết quả:** Fail. Thông báo có hiện, nhưng khung kết quả bị co lại sát thanh lọc làm giật giao diện (lỗi bố cục nhóm ghi nhận khi chạy).

**TC067 – Khách chưa đăng nhập xem catalog**
- **Mục đích:** khách vãng lai phải xem được kho và giá thì mới có động lực đăng ký.
- **Cách test:** mở cửa sổ ẩn danh → xem danh sách, giá, sơ đồ.
- **Căn cứ:** `GET /api/catalog/state` và `/availability` không yêu cầu đăng nhập.
- **Kết quả:** Pass.

**TC068 – Danh sách dài**
- **Mục đích:** cơ sở nhiều kho không được mất hay trùng kho khi hiển thị.
- **Cách test:** Thủ Đức có 11 kho → cuộn hết danh sách → so với danh sách ở trang Manager.
- **Kết quả:** Pass.

**TC069 – Hết 15 phút giữ chỗ, kho tự trống lại**
- **Mục đích:** khách giữ kho mà không trả cọc thì kho không được bị "khóa" mãi.
- **Cách test:** khách A đặt `TD-U01` không trả → chờ quá 15 phút → khách B đặt lại được.
- **Căn cứ:** mỗi lần tạo đơn, backend gọi `ReleaseExpiredReservationsAsync()` để giải phóng đơn quá hạn; kiểm tra trùng lịch bỏ qua đơn `Pending Payment` đã quá `HoldExpiresAt`.
- **Kết quả:** Pass.

**TC070 – Chọn ngày bắt đầu trong quá khứ**
- **Mục đích:** không cho tạo hợp đồng bắt đầu từ ngày đã qua.
- **Cách test:** thử chọn ngày hôm qua trên lịch, rồi gửi thẳng API với ngày hôm qua.
- **Căn cứ:** `ReservationService.cs`: `if (startDate < BusinessClock.Today)` trả 400 "Ngày bắt đầu thuê không được ở trong quá khứ."
- **Kết quả:** Pass.

### Nhóm 2 – Cart & Reservation Hold (Giỏ hàng & giữ chỗ 15 phút) – TC071 → TC090

**TC071 – Thêm 1 kho vào giỏ**
- **Mục đích:** chức năng cơ bản nhất của giỏ hàng.
- **Cách test:** thêm `TD-U01` → mở `/cart`.
- **Căn cứ:** `store/cart.js` (lưu ở trình duyệt), thông báo "Đã thêm TD-U01 vào giỏ hàng" trong `App.jsx`.
- **Kết quả:** Pass.

**TC072 – Thêm nhiều kho cùng cơ sở**
- **Mục đích:** tổng tiền cọc phải cộng đúng khi thuê nhiều kho.
- **Cách test:** thêm `TD-U01` (400.000đ) và `TD-U03` (800.000đ) → tổng cọc = (400.000 + 800.000) × 2 = 2.400.000đ.
- **Căn cứ:** hàm `quote()` trong `pricing.js` cộng giá các kho rồi nhân số tháng cọc.
- **Kết quả:** Pass.

**TC073 – Thêm trùng 1 kho**
- **Mục đích:** tránh đặt 1 kho 2 lần.
- **Căn cứ:** `cart.js` "mỗi kho chỉ thêm 1 lần" (trả `reason: 'exists'`); nút đổi thành "Đã có trong giỏ".
- **Kết quả:** Pass.

**TC074 – Xóa kho khỏi giỏ**
- **Mục đích:** xóa xong thì tổng tiền phải tính lại.
- **Cách test:** giỏ có `TD-U01` + `TD-U03` → xóa `TD-U01` → tổng cọc còn 1.600.000đ (chỉ `TD-U03`).
- **Kết quả:** Pass.

**TC075 – Khách chưa đăng nhập bấm đặt kho** ❌ **Fail – BUG-008**
- **Mục đích:** khách chưa đăng nhập phải được dẫn đi đăng nhập mà không mất lựa chọn, và phải biết kho chỉ được giữ 15 phút sau khi tạo đơn.
- **Căn cứ:** `store/bookingDraft.js` lưu bản nháp 24 giờ, chuyển tới `/login?next=...`; trang login hiện `BookingDraftNote`.
- **Kết quả:** Fail. Có lưu nháp và chuyển trang, nhưng ghi chú quá ngắn, không nhắc về thời gian giữ chỗ 15 phút.

**TC076 – Khôi phục bản nháp sau khi đăng nhập**
- **Mục đích:** đăng nhập xong khách không phải chọn lại từ đầu.
- **Phụ thuộc:** chạy sau TC075 (cần có bản nháp).
- **Căn cứ:** `App.jsx` gọi `loadBookingDraft()` sau khi đăng nhập để quay về trang đặt kho và điền sẵn dữ liệu.
- **Kết quả:** Pass.

**TC077 – Tạo đơn: nhận trực tiếp + trả 1 lần**
- **Mục đích:** kiểm tra luồng đặt kho chính với 1 tổ hợp lựa chọn.
- **Cách test:** `TD-U01`, ngày mai, 6 tháng, "In person" khung 08:00–10:00, "Upfront" → bấm đặt.
- **Căn cứ:**
  - `HandoverMethod`: `InPerson` / `Online`; `PaymentPlan`: `Upfront` / `Monthly`.
  - Nhận trực tiếp bắt buộc chọn 1 trong 4 khung giờ 08–10, 10–12, 12–14, 14–16.
  - Đơn tạo ra có mã `RS-yyyy-xxxxx`, trạng thái `Pending Payment`, `HoldExpiresAt` = hiện tại + 15 phút.
- **Kết quả:** Pass.

**TC078 – Tạo đơn: bàn giao online + trả theo tháng**
- **Mục đích:** kiểm tra tổ hợp lựa chọn còn lại.
- **Căn cứ:** online không cần khung giờ (`AppointmentTime = null`); lưu `HandoverMethod = Online`, `PaymentPlan = Monthly`.
- **Kết quả:** Pass.

**TC079 – Lúc đặt chỉ phải trả tiền cọc**
- **Mục đích:** đảm bảo không thu tiền thuê sớm.
- **Phụ thuộc:** TC077.
- **Căn cứ:** khi tạo đơn, backend sinh khoản `Deposit` và các khoản `Rent` theo từng tháng; `PaymentService` chỉ thu các khoản `Deposit`. Hạn đóng tiền thuê theo `RentPaymentRules`: Upfront = ngày nhận kho, Monthly = đầu mỗi kỳ.
- **Kết quả:** Pass.

**TC080 – Hai khách đặt cùng 1 kho gần như cùng lúc**
- **Mục đích:** không được để 2 người cùng giữ 1 kho (lỗi nghiêm trọng nếu xảy ra).
- **Căn cứ:** tạo đơn chạy trong transaction mức **Serializable** và kiểm tra `HasConflictingReservationsAsync()`; người đặt sau nhận 409 "Kho TD-U01 đang được giữ để thanh toán hoặc đã có đặt chỗ trùng kỳ thuê."
- **Kết quả:** Pass.

**TC081 – Số tháng thuê = 0 hoặc âm**
- **Mục đích:** chặn dữ liệu sai gửi thẳng vào API (vượt qua giao diện).
- **Căn cứ:** `ReservationService.cs`: chỉ nhận `Months` là 1, 3, 6, 12; còn lại trả 400 "Thời hạn thuê chỉ được chọn 1, 3, 6 hoặc 12 tháng."
- **Kết quả:** Pass.

**TC082 – Ngày bắt đầu quá xa** ❌ **Fail – BUG-026 (mới)**
- **Mục đích:** không cho giữ kho trước quá lâu (vd 1 năm sau), tránh khóa kho vô lý.
- **Cách test:** chọn ngày 13/11/2027 → bấm đặt.
- **Căn cứ:**
  - `App.jsx`: lịch cho chọn tới 31/12 của **năm hiện tại + 5** (`years` có 6 năm).
  - `ReservationService.cs` chỉ kiểm tra ngày không ở quá khứ, **không có giới hạn trên**.
- **Kết quả:** Fail, đơn vẫn được tạo (201 Created).

**TC083 – Đặt kho của 2 cơ sở trong 1 đơn**
- **Mục đích:** 1 hợp đồng chỉ thuộc 1 cơ sở.
- **Cách test:** `TD-U01` (Thủ Đức) + `TB-U01` (Tân Bình).
- **Căn cứ:** giỏ hàng chỉ cho đặt 1 cơ sở mỗi lần; backend trả 400 "Các kho trong cùng 1 hợp đồng phải thuộc cùng một cơ sở."
- **Kết quả:** Pass.

**TC084 – Đơn tự hết hạn sau 15 phút** ❌ **Fail – BUG-009**
- **Mục đích:** khi hết giờ giữ chỗ, giao diện phải báo ngay để khách không cố thanh toán.
- **Căn cứ:** backend trả trạng thái `Expired` khi `HoldExpiresAt <= now`, nhưng chỉ khi trang gọi lại API.
- **Kết quả:** Fail. Ở tab Đơn đặt chỗ, đồng hồ dừng ở 00:00 và trạng thái vẫn là "Pending Payment"; phải F5 mới thấy "Expired".

**TC085 – Thanh toán đơn đã hết hạn**
- **Mục đích:** không cho trả tiền cho kho đã bị giải phóng.
- **Căn cứ:** `PaymentService.cs`: đơn `Expired` trả 409 "Thời gian giữ kho đã hết. Vui lòng tạo đặt chỗ mới."; VNPay cũng chặn tương tự.
- **Kết quả:** Pass.

**TC086 – Xem danh sách đơn trong /account**
- **Mục đích:** khách theo dõi được đơn của mình.
- **Căn cứ:** `GET /api/reservation/customer/{email}` trả mã `RS-...`, cơ sở, danh sách kho, trạng thái, tiền cọc.
- **Kết quả:** Pass.

**TC087 – Giới hạn số kho trong 1 đơn**
- **Mục đích:** kiểm tra giá trị biên của số kho tối đa.
- **Cách test:** đặt 5 kho Thủ Đức → thành công; thêm kho thứ 6 → bị chặn.
- **Căn cứ:** `cart.js`: `CHECKOUT_LIMIT = 5`; `CartPage.jsx` báo "Mỗi lần đặt tối đa 5 kho".
- **Kết quả:** Pass.

**TC088 – Không xem được đơn của khách khác**
- **Mục đích:** bảo mật dữ liệu khách hàng.
- **Căn cứ:** `GetReservationByIdAndCustomerAsync()` lọc theo cả `ReservationID` và `CustomerID`, nên khách B gọi đơn của A nhận 404. Email lấy từ JWT, không giả mạo được (`JwtIdentityMiddleware`).
- **Kết quả:** Pass.

**TC089 – Ngày bắt đầu = hôm nay**
- **Mục đích:** giá trị biên của ngày bắt đầu (hôm nay là ngày hợp lệ nhỏ nhất).
- **Căn cứ:** chỉ chặn ngày < hôm nay. Nếu chọn nhận trực tiếp thì khung giờ chưa được kết thúc.
- **Kết quả:** Pass.

**TC090 – Đồng hồ đếm ngược**
- **Mục đích:** khách biết chính xác còn bao lâu để trả cọc.
- **Căn cứ:** `CartPage.jsx` tính thời gian còn lại từ `depositExpiresAt`, cập nhật mỗi giây (`useNow(1000)`), hiển thị `mm:ss`.
- **Kết quả:** Pass.

### Nhóm 3 – Deposit Payment (Thanh toán cọc) – TC091 → TC100

**TC091 – Trả cọc bằng Simulator thành công**
- **Mục đích:** luồng trả tiền chính dùng khi demo.
- **Căn cứ:** `PaymentService.cs` chạy 5 bước: tạo Payment `Pending` → gán vào khoản cọc → Payment `Completed` → khoản cọc `Paid` → đơn `Paid`. Sau đó `confirmAfterDeposit()` gọi `POST /api/reservation-confirmations/mine` để xác nhận đơn và tạo hợp đồng.
- **Kết quả:** Pass.

**TC092 – Trả sai số tiền cọc**
- **Mục đích:** không ghi nhận số tiền thiếu hoặc thừa.
- **Cách test:** đơn `TD-U04` cọc 2.000.000đ → gửi 1.000.000 rồi 3.000.000.
- **Căn cứ:** `if (request.Amount != depositSum)` trả 400 "Số tiền thanh toán phải đúng bằng tiền cọc (2.000.000đ)..."
- **Kết quả:** Pass.

**TC093 – Trả cọc 2 lần (2 tab)** ❌ **Fail – BUG-012**
- **Mục đích:** không thu tiền 2 lần, và giao diện phải tự cập nhật.
- **Căn cứ:**
  - Backend đúng: đơn không còn `Pending Payment` thì trả 409.
  - Frontend `CartPage.jsx`: khi lỗi chỉ hiện thông báo, không tải lại trạng thái đơn.
- **Kết quả:** Fail. Tab 2 báo lỗi 409 nhưng vẫn giữ nút "Thanh toán" cũ cho tới khi F5.

**TC094 – Tạo link VNPay cho 1 đơn**
- **Căn cứ:** `POST /api/vnpay/create` tạo URL `https://sandbox.vnpayment.vn/...` có chữ ký `vnp_SecureHash`. Nếu chưa cấu hình VNPay thì trả 503.
- **Kết quả:** Pass.

**TC095 – 1 link VNPay cho nhiều đơn**
- **Mục đích:** khách trả cọc nhiều đơn trong 1 lần.
- **Căn cứ:** API nhận `reservationIds` (mảng), cộng tổng tiền cọc các đơn thành 1 giao dịch.
- **Kết quả:** Pass.

**TC096 – Trả VNPay thành công (mã 00)**
- **Cách test:** thẻ test NCB `9704198526191432198`, NGUYEN VAN A, 07/15, OTP `123456` (thông tin thẻ test công khai của VNPay Sandbox).
- **Căn cứ:** `return-verify` kiểm tra `vnp_ResponseCode = 00` và `vnp_TransactionStatus = 00`, rồi ghi nhận cọc.
- **Kết quả:** Pass. BUG-010 (màn hình trống khi mạng chậm) đã được sửa và test lại.

**TC097 – Khách hủy trên VNPay (mã 24)**
- **Căn cứ:** mã khác 00 thì Payment chuyển `Failed`, đơn vẫn `Pending Payment` nên khách có thể thử lại trong thời gian giữ chỗ.
- **Kết quả:** Pass.

**TC098 – Sửa chữ ký / số tiền trên URL**
- **Mục đích:** chống giả mạo kết quả thanh toán (bảo mật).
- **Căn cứ:** `VerifySignature()` tính lại HMAC; sai thì trả mã 97 "Chữ ký VNPay không hợp lệ" và ghi log `Rejected`. Số tiền không khớp trả mã 04.
- **Kết quả:** Pass.

**TC099 – F5 trang kết quả nhiều lần**
- **Mục đích:** idempotent, chỉ ghi nhận tiền 1 lần.
- **Căn cứ:** nếu mọi Payment đã `Completed` thì trả mã 02 "Đã ghi nhận tiền cọc", không ghi thêm.
- **Kết quả:** Pass.

**TC100 – API kiểm tra cấu hình VNPay**
- **Căn cứ:** `GET /api/vnpay/status` trả `configured`, `tmnCode` đã che (`ab***yz`), và chỉ `hashSecretLength`, không lộ `HashSecret`.
- **Kết quả:** Pass.

### Nhóm 4 – Cancellation & Deposit Refund (Hủy đơn & hoàn cọc) – TC101 → TC107

**TC101 – Hủy đơn chưa trả cọc**
- **Căn cứ:** `Pending Payment` nằm trong danh sách được hủy; chưa có tiền cọc nên số tiền hoàn = 0, không tạo giao dịch hoàn.
- **Kết quả:** Pass.

**TC102 – Hủy sớm, hoàn 100%**
- **Căn cứ:** mốc hoàn: ≥ 7 ngày = 100%. Tạo giao dịch hoàn (`Direction = Refund`), đơn `Cancelled`, kho trả lại, hợp đồng chấm dứt.
- **Kết quả:** Pass.

**TC103 – Hủy sát ngày, hoàn một phần** ❌ **Fail – BUG-011**
- **Cách test:** đơn `TD-U02` (500.000đ/tháng, cọc 1.000.000đ) → chỉnh Demo Clock tới 5 ngày trước ngày nhận (mốc 50%) → hủy.
- **Căn cứ:** mốc 50% tính đúng (500.000đ).
- **Kết quả:** Fail theo ghi nhận của nhóm: popup hiện "500000" không có dấu chấm.
- **Lưu ý:** code hiện tại của popup dùng `formatVnd()` (`Intl.NumberFormat('vi-VN')`), nên nên chạy lại case này. Nếu hiển thị đúng "500.000đ" thì đổi sang Pass và đóng BUG-011.

**TC104 – Hủy đơn đã nhận kho**
- **Căn cứ:** `Handed Over` không nằm trong danh sách được hủy, API trả 409 "Bạn đã nhận kho nên không thể hủy đặt kho. Muốn ngừng thuê, vui lòng báo trả kho với cơ sở."
- **Kết quả:** Pass.

**TC105 – Hủy lại đơn đã hủy**
- **Căn cứ:** trả 409 "Đơn này đã được hủy."
- **Kết quả:** Pass.

**TC106 – Thử lại hoàn tiền**
- **Mục đích:** khi VNPay hoàn tiền lỗi, khách/nhân viên phải thử lại được.
- **Căn cứ:** `POST /api/reservation-cancellations/{id}/refund-retry` gửi lại các khoản hoàn đang `Pending`; nếu không còn khoản nào thì báo "Không còn khoản hoàn nào đang chờ."
- **Kết quả:** Pass.

**TC107 – Hủy đơn nhiều kho**
- **Căn cứ:** khi đơn `Cancelled`, trigger DB tự trả mọi kho đang giữ về `Available`.
- **Kết quả:** Pass.

### Nhóm 5 – Deposit Payment & Contract (Cọc & hợp đồng) – TC108 → TC110

**TC108 – Tự tạo hợp đồng sau khi trả cọc**
- **Phụ thuộc:** TC091.
- **Căn cứ:** từ 29/10/2026 không còn bước Manager duyệt; `ReservationConfirmationsController` tạo hợp đồng `HD-yyyy-xxxxx` ngay, khách vào tab Hợp đồng để ký online (trạng thái "Pending Signature").
- **Kết quả:** Pass.

**TC109 – Trả đơn gia hạn bằng API cọc thường**
- **Mục đích:** đơn gia hạn có luồng thanh toán riêng, không được lẫn với cọc.
- **Căn cứ:** `PaymentService.cs`: `ContractRenewalFinalizer.IsRenewal()` trả 409 "Đơn gia hạn thanh toán ở mục Gia hạn hợp đồng."
- **Kết quả:** Pass.

**TC110 – Lịch sử giao dịch**
- **Căn cứ:** Trung tâm Thanh toán trong `/account` có nút "Xem hóa đơn & lịch sử giao dịch"; mỗi giao dịch có mã (`OrderCode`), số tiền, phương thức (VNPay/Simulator), thời gian.
- **Kết quả:** Pass.

---

## 4. Tổng hợp 7 case Fail

| TC | Bug | Mức độ | Nguồn phát hiện | Tóm tắt |
| :--- | :--- | :--- | :--- | :--- |
| TC063 | BUG-025 | Major | Code (mới) | Không áp dụng giảm giá dài hạn. Có thể do tính năng đang cố ý tắt |
| TC066 | BUG-007 | Minor | Nhóm chạy UI | Khung kết quả rỗng bị co, giật giao diện |
| TC075 | BUG-008 | Minor | Nhóm chạy UI | Không nhắc thời gian giữ chỗ 15 phút |
| TC082 | BUG-026 | Major | Code (mới) | Không giới hạn ngày đặt trước (cho tới 5 năm) |
| TC084 | BUG-009 | Major | Nhóm chạy UI | Hết 15 phút không tự đổi sang Expired, phải F5 |
| TC093 | BUG-012 | Minor | Nhóm chạy UI + code xác nhận | Tab 2 báo 409 nhưng không tải lại |
| TC103 | BUG-011 | Minor | Nhóm chạy UI | Số tiền hoàn chưa có dấu phân cách. Cần chạy lại |

Chi tiết từng bug (các bước tái hiện, kết quả mong đợi / thực tế) nằm trong file `SWT301_Defect_List_Jira_Trello.csv` để import vào Jira.
