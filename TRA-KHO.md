# Trả kho & kiểm kho

## Luồng
1. **Khách** (Hợp đồng → nút "⇦ Trả kho"): chọn ngày trả (báo trước ≥ N ngày theo chính sách "Gia hạn & trả kho", muộn nhất ngày hết hạn), đồng ý quy trình.
   Việc kiểm kho tự giao cho **Staff đã bàn giao kho** cho khách (việc "Move In"); Staff đó nghỉ thì giao Staff khác của cơ sở.
2. **Staff** (Staff Portal → "Trả kho & kiểm kho"):
   - "Nhận lại kho & bắt đầu kiểm tra": kho chuyển **Đang kiểm tra** (Pending Inspection), mã / thẻ ra vào của khách bị thu hồi.
   - "Nhập kết quả kiểm tra": Không có vấn đề / Có vấn đề (bắt buộc ghi chú), các khoản phí (chọn từ chính sách / FeePolicy hoặc tự nhập),
     kho sau kiểm tra (Còn trống / Bảo trì). Hệ thống tự quyết toán:
     - phí trừ vào tiền cọc trước (Charge ExtraFee, SettledFromDeposit = 1);
     - cọc không đủ → khách đóng thêm phần thiếu (Charge Unpaid, hạn 7 ngày; khách trả qua VNPay hoặc mô phỏng);
     - cọc còn dư → hoàn sau N ngày (Payment Refund DepositReturn, ngày hoàn dự kiến lưu ở ExpiresAt; tới ngày tự ghi nhận "đã chuyển").
   - Đơn chuyển Completed, hợp đồng Completed (ActualEndDate = ngày trả).
3. **Khách** thấy tiến trình 4 bước + bảng quyết toán trong mục "Trả kho" (trang Hợp đồng), có thông báo, nút "Đóng …đ" nếu thiếu.

## API (backend/Controllers/UnitReturnsController.cs - file mới)
| Method | URL | Ai | Body |
|---|---|---|---|
| GET | /api/unit-returns/mine | Khách | |
| POST | /api/unit-returns | Khách | `{ reservationId, returnDate: "yyyy-MM-dd", note }` |
| POST | /api/unit-returns/{id}/cancel | Khách | (khi Staff chưa nhận lại kho) |
| POST | /api/unit-returns/{id}/pay-demo | Khách | đóng phí thiếu (mô phỏng); thật: POST /api/vnpay/create `{ reservationIds: [id] }` |
| GET | /api/unit-returns/staff | Staff | |
| POST | /api/unit-returns/staff/{id}/start | Staff | |
| POST | /api/unit-returns/staff/{id}/complete | Staff | `{ condition: "Good"\|"Damaged", notes, unitStatus: "Available"\|"Maintenance", fees: [{ feeCode, description, amount }] }` |

Không sửa database, không sửa Program.cs, không sửa code backend của nhóm. Frontend Staff chỉ THÊM 1 mục menu + 1 dòng render trong FacilityStaffAccount.jsx; giao diện nằm ở StaffReturns.jsx (file mới).
