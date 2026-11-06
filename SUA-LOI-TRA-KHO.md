# Sửa luồng trả kho – mục 2, 5, 6

Chép đè các file trong gói này vào project (giữ nguyên đường dẫn), dừng backend rồi `dotnet run` lại.
Không sửa database, không sửa Program.cs. Cần đã chép bản sửa P1 trước đó.

## Nguyên tắc
- Luật chọn nhân viên nằm DUY NHẤT ở `backend/Services/StaffAssignmentPolicy.cs`, dùng chung cho nhận kho và trả kho.
- Dữ liệu nhân viên + lịch việc lấy từ cùng một nơi (`IManagerToolsRepository`), nên tự phân công và trả kho luôn thấy cùng một lịch.

## Mục 5 – Phân công trả kho
Khách chọn ngày + **khung giờ** (08:00–16:00). Danh sách giờ chỉ hiện các khung còn ít nhất 1 nhân viên rảnh.
Chọn người theo thứ tự:
1. Loại người trùng giờ (cách nhau dưới 60 phút) trong ngày.
2. Ưu tiên người đã bàn giao kho, nếu không trùng giờ và số lần hẹn trong ngày không hơn người rảnh nhất quá 1.
3. Còn lại: ít việc nhất trong ngày → trong tuần → theo tên.
4. Không còn ai rảnh → từ chối, báo các khung giờ còn trống (đọc lịch + ghi việc trong transaction Serializable, 2 khách đặt cùng giờ không bị giao chồng).

## Mục 2 – Hợp đồng quá hạn mà khách không báo trả
- Mỗi khi trang Manager / Staff tải (auto-assign), hệ thống tìm đơn đang thuê, hết hạn, **không gia hạn**, chưa có việc trả kho
  → tự tạo việc trả kho ngày hôm nay (không giờ cố định, nhân viên liên hệ khách), ưu tiên người đã bàn giao.
- Khách không tự hủy lịch trả kho khi hợp đồng đã hết hạn (backend chặn + ẩn nút).
- Khách và Staff đều thấy nhãn "Quá hạn".

## Mục 6 – Kiểm xong chuyển "Bảo trì"
- Tự ghi báo cáo sự cố (hiện ở mục "Báo cáo sự cố kho" của Manager, cùng cơ chế với báo cáo Staff tự gửi).
- Nếu kho đã có đơn khác giữ cho kỳ sau: báo cáo ghi "CẦN XỬ LÝ: đơn … đang giữ kho này từ …".
  Staff thấy cảnh báo này trước khi bấm hoàn tất. Đơn đó sẽ bị chặn bàn giao (vì kho Bảo trì) tới khi Manager xử lý.
- Staff báo kho "Tốt" (mục báo cáo kho) thì kho mở lại "Còn trống" như cũ.

## File thay đổi
- backend/Services/StaffAssignmentPolicy.cs (mới) – luật phân công dùng chung
- backend/Services/ManagerToolsService.cs – tự phân công dùng luật chung + tự tạo việc trả kho khi quá hạn
- backend/Repositories/ManagerToolsRepository.cs, backend/Interfaces/IManagerToolsRepository.cs – truy vấn đơn quá hạn
- backend/Controllers/UnitReturnsController.cs – khung giờ, phân công theo luật chung, chặn hủy khi quá hạn, báo cáo Bảo trì
- backend/Services/StaffToolsService.cs – dùng ngày theo giờ VN
- frontend/src/UnitReturn.jsx – chọn khung giờ, nhãn quá hạn, ẩn nút hủy khi không được hủy
- frontend/src/StaffReturns.jsx – hiện giờ hẹn, nhãn quá hạn, cảnh báo kho đã có đơn sau
- frontend/src/FacilityManagerAccount.jsx – bảng "chưa có người phụ trách" gồm cả việc trả kho
- TRA-KHO.md – cập nhật tài liệu

## Chưa làm (cần chốt luật)
- Phí trả kho trễ (khách dùng kho quá ngày hết hạn): chưa tự tính.
- Manager đổi kho cho đơn đã Confirmed (P2 mục 3) – cần để xử lý trường hợp kho Bảo trì đã có đơn giữ.
