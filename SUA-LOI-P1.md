# Sửa lỗi P1 – Bàn giao & trả kho

Chép đè các file trong gói này vào project (giữ nguyên đường dẫn), dừng backend rồi `dotnet run` lại.
Không sửa database, không sửa Program.cs.

## Nguyên tắc
Mọi điều kiện bàn giao nằm ở MỘT chỗ duy nhất: `backend/Services/HandoverService.cs`.
Cả hai API bàn giao (`/api/staff-tools/handover` và API cũ `/api/Handover/complete`) đều đi qua đây.
Frontend chỉ hiển thị trước các điều kiện, không phải nơi quyết định.

## Điều kiện bàn giao (backend kiểm tra theo thứ tự)
1. Là Facility Staff đang hoạt động tại cơ sở của đơn
2. Đơn ở trạng thái Confirmed, còn kho đang giữ
3. Đã ghi nhận thanh toán: có giao dịch thu Completed + mọi khoản cọc Paid
4. Có hợp đồng và khách đã ký online
5. Hôm nay (giờ VN) nằm trong kỳ thuê: không bàn giao trước ngày bắt đầu, không bàn giao khi kỳ thuê đã hết
6. Là người được phân công: mọi kho của đơn có việc "Move In" đang mở giao cho chính người này
7. Kho sẵn sàng: không ở trạng thái Đang thuê / Chờ kiểm tra / Bảo trì / Ngừng hoạt động, và không bị đơn khác đang dùng
8. Loại quyền truy cập hợp lệ, mã truy cập không rỗng

Bàn giao xong: giữ nguyên người được phân công (không ghi đè), không tự tạo việc mới.

## Điều kiện trả kho (UnitReturnsController)
- Chỉ người được phân công mới "Nhận lại kho" và "Hoàn tất kiểm tra" (không tự đổi người)
- Chỉ nhận lại kho từ ngày khách hẹn trả trở đi
- Muốn đổi người: Facility Manager đổi người phụ trách (PUT /api/manager-tools/reservations/{id}/owner)

## File thay đổi
- backend/Constants/BusinessClock.cs (mới) – "hôm nay" theo giờ VN, dùng chung
- backend/Services/HandoverService.cs – viết lại, chứa toàn bộ điều kiện bàn giao
- backend/Repositories/HandoverRepository.cs, backend/Interfaces/IHandoverRepository.cs
- backend/Controllers/HandoverController.cs – trả lỗi kèm message tiếng Việt
- backend/Services/StaffToolsService.cs – chỉ chuyển tiếp sang HandoverService (bỏ bản kiểm tra trùng)
- backend/Repositories/StaffToolsRepository.cs, backend/Interfaces/IStaffToolsRepository.cs, IStaffToolsService.cs – bỏ hàm không còn dùng
- backend/Controllers/UnitReturnsController.cs – chặn người không được phân công, chặn nhận kho sớm
- frontend/src/FacilityStaffAccount.jsx – checklist bàn giao khớp backend (thêm ngày thuê, trạng thái kho, ký hợp đồng chặt hơn)
- frontend/src/StaffReturns.jsx – ẩn nút với người không được phân công, chưa tới ngày hẹn trả

## Lưu ý khi demo
Đơn có ngày bắt đầu thuê ở tương lai sẽ KHÔNG bàn giao được (đúng luật mới).
Muốn demo bàn giao thì đặt kho với ngày bắt đầu là hôm nay.
