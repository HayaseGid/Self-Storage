-- Tạm bỏ giảm giá theo gói thuê (yêu cầu của cô 29/10/2026, phần giảm giá làm sau).
-- Chỉ đổi DỮ LIỆU, không đổi cấu trúc bảng / code backend.
-- Sau khi chạy: đặt kho 6 hay 12 tháng đều tính đúng giá niêm yết, tiền cọc khớp với giá hiển thị.
USE SelfStorageDB_test;
GO
UPDATE ContractType SET DiscountRate = 0;
GO
-- Khi làm lại giảm giá, trả về giá trị cũ:
-- UPDATE ContractType SET DiscountRate = 5  WHERE RentalMonths = 6;
-- UPDATE ContractType SET DiscountRate = 10 WHERE RentalMonths = 12;
