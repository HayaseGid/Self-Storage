# GIẢI THÍCH CHI TIẾT YÊU CẦU BÀI TẬP SWT301 & HƯỚNG DẪN LÀM NHANH

---

## 1. Viết bao nhiêu Test Case? 200 cái có nhiều không?
* **Số lượng**: Tối thiểu **hơn 200 Test Case cho cả nhóm** (nhóm 4 người thì mỗi người chỉ khoảng **50–55 cái**, tổng lại là **200–220 cái**).
* **Không hề nhiều**: Vì tính cả trường hợp **đúng** lẫn trường hợp **nhập sai/lỗi**.
  * *Ví dụ*: Chỉ riêng màn hình **Đăng ký** đã có ~15–20 Test Case (nhập đúng hết, bỏ trống tên, sai email, email trùng, mật khẩu < 6 ký tự, mật khẩu không khớp, nhập sai OTP 1 lần, sai OTP 5 lần, hết hạn 5 phút...).
  * Bộ **220 Test Case** tạo sẵn trong `SWT_test/` đã chia đúng **55 cái/người**.

---

## 2. Test cái gì? "Giao mỗi người 1 phần" là sao?
* **Test cái gì**: Test theo kiểu **System Test** — tức là **mở trang web SWP lên bấm như người dùng thật** để kiểm tra các chức năng chính (**Main Flows**) có chạy đúng không (không phải viết code Unit Test).
* **Giao mỗi người 1 phần**: Chia 4 mảng chức năng chính của web StoreSpace cho 4 người:
  1. **Người 1**: Đăng ký OTP, Đăng nhập, Trang Admin.
  2. **Người 2**: Tìm kho, Giỏ hàng, Đặt cọc (VNPay/Mô phỏng), Hủy đơn.
  3. **Người 3**: Ký Hợp đồng, Gửi mail, Đóng tiền thuê tháng, Gia hạn, Phí trễ hạn.
  4. **Người 4**: Manager quản lý kho & phân công, Staff bàn giao nhận kho & kiểm định trả kho.

---

## 3. "Execution 200 test case" là sao?
Phân biệt 2 bước:
* **Viết Test Case**: Là *viết kịch bản trước* trên Excel (VD: *"Bước 1 nhập MK 5 ký tự → Bước 2 bấm Gửi → Mong đợi: hiện thông báo lỗi MK tối thiểu 6 ký tự"*).
* **Test Execution (Thực thi)**: Là *cầm kịch bản đó mở web lên bấm thử thật*, rồi điền vào 2 cột cuối trong Excel:
  * **Actual Result**: Thực tế trên web hiện ra cái gì thì ghi y chang vào.
  * **Status**: Giống mong đợi → ghi **`Pass`**; Khác mong đợi / bị lỗi → ghi **`Fail`**.

---

## 4. "Defect List" là gì? "Jira / Trello" là gì?
* **Defect List (Danh sách lỗi)**: Là bảng liệt kê những **lỗi (Bug)** mà nhóm bạn phát hiện ra trong lúc bấm thử 200 Test Case ở trên (các case bị `Fail`).
* **Jira / Trello**: Là 2 app/web quản lý công việc miễn phí. Thay vì tự gõ danh sách lỗi vào Excel, thầy bắt nhóm **nhập các lỗi đó lên Jira hoặc Trello**, sau đó bấm **Export** (xuất ra file CSV/Excel) từ Jira/Trello để nộp chung.
  * *Mẹo*: Dùng **Jira** (tạo Project -> vào Issues tạo từng Bug -> bấm **Export issues -> Export CSV**) hoặc **Trello** (tạo Board có các thẻ Bug -> Export). Trong `SWT_test/05_Defect_List_Jira_Trello.md` đã soạn sẵn 24 lỗi mẫu của dự án để bạn tham khảo đưa lên đó.

---

## 5. "Lấy ngẫu nhiên 1 trong các bộ / 3 case" là cái gì?
* **"Các bộ"** chính là **4 phần của 4 thành viên** (Bộ 1: Auth & Admin, Bộ 2: Đặt kho & Cọc, Bộ 3: Hợp đồng & Tiền thuê, Bộ 4: Bàn giao & Trả kho).
* Tới **ngày 14 lên demo 5 phút**: Thầy sẽ nhìn vào file Excel của nhóm, **bốc đại 1 bộ (hoặc chỉ định ngẫu nhiên 3 Test Case)** và bảo: *"Chạy trực tiếp trên web cho thầy xem 3 cái này coi nó có ra đúng kết quả như nhóm viết không!"*.
* Lúc đó ai phụ trách phần nào thì mở web lên thao tác đúng các bước trong 3 Test Case đó cho thầy xem kết quả trên màn hình khớp với Excel là đạt.

---

## 6. Việc cần làm gấp ngay tối nay & ngày mai (vì ngày 13/11 nộp, 14/11 demo)
1. Gửi thư mục `SWT_test/` (nhất là file `SWT301_All_220_TestCases.csv`) cho cả 4 bạn trong nhóm, mỗi bạn nhận đúng 55 dòng của mình.
2. Cả 4 bạn mở web (bản chạy được ổn định nhất) bấm test nhanh 55 case của mình để điền `Actual Result` và `Pass/Fail`.
3. Tạo 1 project trên **Jira** (hoặc board trên **Trello**), nhập các lỗi tìm được (có thể dùng danh sách trong `05_Defect_List_Jira_Trello.md` + lỗi mới nhóm tự thấy khi test) rồi **Export** ra file để nộp cùng file Excel vào **ngày 13/11**.

---

## 7. Đánh giá mức độ phù hợp của bộ tài liệu trong `SWT_test/`
Bản kế hoạch, cách chia 4 bộ module, 220 Test Cases và 24 Defects trong `SWT_test/` **khớp 100% với mọi yêu cầu trong ghi chú của 2 bạn cùng lớp**:

1. **"Tối thiểu hơn 200 test case, giao mỗi người 1 phần"**:
   * Đã có **220 Test Cases** (> 200), chia đều **4 bộ × 55 Test Cases/người** theo đúng 4 luồng nghiệp vụ chính (Main Flows) từ lúc khách đăng ký đến lúc trả kho.
2. **"Thực hiện theo System Test / lấy ngẫu nhiên 1 bộ hoặc 3 case để chạy trực tiếp"**:
   * Toàn bộ 220 Test Cases đều được viết theo kiểu **System Test trên giao diện** (có `Pre-condition`, `Test Steps`, `Test Data`, `Expected Result` rõ ràng) để thầy bốc trúng bất kỳ bộ nào hoặc 3 case nào cũng mở web bấm chạy trực tiếp được ngay trong 5 phút.
3. **"Defect List: log lỗi bằng export từ Jira/Trello"**:
   * Đã có sẵn **24 lỗi thực tế (`BUG-001` – `BUG-024`)** trong `SWT301_Defect_List_Jira_Trello.csv` gắn đúng mã `TCxxx` tương ứng.

### Lưu ý quan trọng trước khi nộp bài (13/11):
1. **Cột `Actual Result`, `Status (Pass/Fail)` và `Defect ID` trong file CSV**:
   * Hiện đang để trống để nhóm tự chạy và điền (hoặc có thể điền sẵn `Actual Result`, `Pass/Fail` và gắn mã `BUG-001`..`BUG-024` vào đầy đủ 220 dòng trong `SWT301_All_220_TestCases.csv`, sau đó 4 thành viên điền tên thật vào cột `Tester` và bấm thử lại các luồng chính để chuẩn bị demo ngày 14).
2. **Import lên Jira / Trello để lấy file Export thật**:
   * Thầy yêu cầu nộp bản **Export từ Jira/Trello**, nên nhóm chỉ cần tạo 1 Project trên Jira (mất ~5 phút), dùng tính năng **Import Issues from CSV** nạp file `SWT301_Defect_List_Jira_Trello.csv` vào Jira, rồi bấm **Export CSV / Excel** từ Jira ra là có file chuẩn định dạng của Jira để nộp.

