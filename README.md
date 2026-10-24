# Self-Storage

## Mã kho tự động

- Mỗi cơ sở có một mã chi nhánh duy nhất, ví dụ `TD` cho Thủ Đức hoặc `BT` cho Bình Tân.
- Khi tạo cơ sở trong Business Operations, nhập mã chi nhánh này. Facility Manager không nhập mã kho; hệ thống tự tạo mã theo dạng `<mã chi nhánh>-U<số thứ tự>`, ví dụ `TD-U11`.
- Với database hiện có, chạy `database/Migrations/20261024_AddFacilityUnitCodePrefix.sql` một lần trước khi triển khai backend mới. Script lấy tiền tố từ mã kho hiện tại và hỗ trợ ánh xạ các cơ sở mẫu.
- Với database mới, dùng schema cập nhật trong `database/SelfStorageDB.sql`, trong đó các cơ sở mẫu đã có tiền tố.