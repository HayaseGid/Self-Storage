# KẾ HOẠCH THỰC HIỆN & PHÂN CÔNG BÀI TẬP SWT301
**Dự án áp dụng:** StoreSpace – Self-Storage Management System (SWP391)  
**Tổng số lượng Test Cases:** **220 Test Cases** (Yêu cầu tối thiểu: 200 Test Cases)  
**Quy mô nhóm:** 4 thành viên (55 Test Cases / thành viên)

---

## 1. Danh sách tài liệu trong thư mục `SWT_test`

| STT | Tên file | Nội dung |
| :-: | :--- | :--- |
| 0 | `00_KE_HOACH_VA_PHAN_CONG_SWT301.md` | Kế hoạch 4 giai đoạn, quy tắc Test Execution, bảng phân công 4 người, kịch bản Demo 5 phút. |
| 1 | `01_ThanhVien1_Auth_OTP_Admin_55TC.md` | **55 Test Cases** (`TC001`–`TC055`): Đăng ký OTP, Đăng nhập & Phân quyền, Quản trị Admin. |
| 2 | `02_ThanhVien2_Catalog_Booking_Payment_55TC.md` | **55 Test Cases** (`TC056`–`TC110`): Tra cứu kho, Đặt giữ chỗ 15p, Thanh toán cọc & Hủy đơn. |
| 3 | `03_ThanhVien3_Contract_Rent_Renewal_LateFee_55TC.md` | **55 Test Cases** (`TC111`–`TC165`): Ký Hợp đồng & Email, Đóng tiền thuê, Gia hạn & Phí trễ hạn. |
| 4 | `04_ThanhVien4_Manager_Handover_Return_55TC.md` | **55 Test Cases** (`TC166`–`TC220`): Manager quản lý kho & Phân công, Bàn giao Move-In, Trả kho Move-Out. |
| 5 | `05_Defect_List_Jira_Trello.md` | **24 Defect mẫu** (`BUG-001`–`BUG-024`, mỗi người 6 lỗi) để đưa lên Jira/Trello. |
| 6 | `SWT301_All_220_TestCases.csv` | File CSV (UTF-8 BOM) mở trực tiếp bằng Excel gồm đủ 220 Test Cases để điền kết quả kiểm thử. |
| 7 | `SWT301_Defect_List_Jira_Trello.csv` | File CSV (UTF-8 BOM) danh sách 24 lỗi chuẩn định dạng Jira/Trello. |

---

## 2. Phân công công việc cho 4 thành viên

| Thành viên | Luồng chính phụ trách | Dải mã TC | Số lượng | Defect phụ trách |
| :--- | :--- | :---: | :-: | :---: |
| **Thành viên 1** | Đăng ký OTP Email, Đăng nhập/Phân quyền, Admin (Cơ sở, Loại kho, Kích thước, Chính sách) | `TC001` – `TC055` | 55 | `BUG-001` – `BUG-006` |
| **Thành viên 2** | Catalog lọc kho, Giỏ hàng & Giữ chỗ 15p, Thanh toán cọc (Simulator/VNPay) & Hủy đơn | `TC056` – `TC110` | 55 | `BUG-007` – `BUG-012` |
| **Thành viên 3** | Ký Hợp đồng điện tử & Gửi mail Brevo, Đóng tiền thuê định kỳ, Gia hạn HĐ & Phí trễ hạn | `TC111` – `TC165` | 55 | `BUG-013` – `BUG-018` |
| **Thành viên 4** | Manager quản lý kho & Phân công Staff, Bàn giao nhận kho (Move-In), Trả kho & Kiểm định (Move-Out) | `TC166` – `TC220` | 55 | `BUG-019` – `BUG-024` |

---

## 3. Kế hoạch thực hiện (6 ngày)

1. **Ngày 1 – Chuẩn bị môi trường & Công cụ**:
   * Mở file `SWT301_All_220_TestCases.csv` trên Google Sheets / Excel để cả nhóm dùng chung.
   * Tạo Board trên **Jira** hoặc **Trello** gồm 4 cột: `Open` → `In Progress` → `Fixed / Ready to Retest` → `Closed`.
   * Chuẩn bị sẵn 4 tài khoản test cố định theo 4 vai trò: `Customer`, `Staff`, `Facility Manager`, `Business Admin`.
2. **Ngày 2–3 – Review & Tinh chỉnh Test Case**:
   * Mỗi thành viên rà lại 55 Test Cases của mình đối chiếu với giao diện thực tế, điền tên mình vào cột `Tester`.
3. **Ngày 4–5 – Test Execution & Log Defect**:
   * Chạy từng Test Case trên hệ thống, ghi `Actual Result` và đánh dấu `Pass` / `Fail`.
   * Nếu `Fail`: tạo thẻ lỗi trên Jira/Trello (có Steps to Reproduce, ảnh chụp, Severity) và điền mã `BUG-xxx` vào cột `Defect ID`.
   * Nếu lỗi đã sửa trong code SWP: chuyển thẻ Jira/Trello sang `Closed`, retest và cập nhật Excel thành `Pass` (giữ nguyên `Defect ID` để chứng minh từng có lỗi). Export file danh sách lỗi từ Jira/Trello để nộp.
4. **Ngày 6 – Diễn tập Demo 5 phút**:
   * Chạy thử bản Local (`dotnet run` + `npm run dev`) và bản Web (Vercel + Render), chuẩn bị sẵn tab trình duyệt cho các vai trò.

---

## 4. Kịch bản Demo 5 phút trên lớp

* **Chuẩn bị trước khi lên bảng**:
  1. Cửa sổ 1: Đăng nhập sẵn **Customer**.
  2. Cửa sổ 2 (Ẩn danh): Đăng nhập sẵn **Facility Manager / Staff**.
  3. Cửa sổ 3: Mở file `SWT301_All_220_TestCases.csv` và bảng **Jira/Trello**.
* **Xử lý khi giảng viên bốc ngẫu nhiên Test Case**:
  * **TC kiểm tra lỗi (Validation / Negative)**: Chạy trực tiếp trên form và đối chiếu thông báo lỗi tiếng Việt khớp `Expected Result`.
  * **TC phụ thuộc ngày tháng** (tới ngày nhận kho, tới kỳ đóng tiền tháng, quá hạn trả kho tính Late Fee): Dùng **Demo Clock** trên giao diện chỉnh ngày giả lập đúng với `Pre-condition` rồi thao tác.
  * **TC gửi Email** (OTP đăng ký, gửi hợp đồng, bàn giao online): Mở sẵn Gmail nhận thư để cho thấy email từ StoreSpace Support (qua Brevo) gửi về trong 1–2 giây.

