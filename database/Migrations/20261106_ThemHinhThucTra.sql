-- Thêm cột hình thức trả tiền thuê vào Reservation (cho DB ĐÃ TẠO trước đó).
-- DB tạo mới từ script đã có cột PaymentPlan thì KHÔNG cần chạy file này. Chạy nhiều lần cũng không lỗi.
--   Monthly = trả theo tháng: ngày nhận kho đóng tháng đầu, các tháng sau đóng trước ngày đầu mỗi kỳ
--   Upfront = trả 1 lần:      ngày nhận kho đóng toàn bộ tiền thuê
USE SelfStorageDB_test;
GO

IF COL_LENGTH(N'dbo.Reservation', N'PaymentPlan') IS NULL
BEGIN
    ALTER TABLE dbo.Reservation
        ADD PaymentPlan NVARCHAR(30) NOT NULL
            CONSTRAINT DF_Reservation_PaymentPlan DEFAULT N'Monthly';   -- đơn cũ: trả theo tháng
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Reservation_PaymentPlan')
BEGIN
    ALTER TABLE dbo.Reservation
        ADD CONSTRAINT CK_Reservation_PaymentPlan CHECK (PaymentPlan IN (N'Monthly', N'Upfront'));
END;
GO

-- Hạn đóng tiền thuê theo luật mới (RentPaymentRules): đơn chưa bắt đầu kỳ thuê, tháng đầu đến hạn ngày bắt đầu thuê
-- (trước đây tháng đầu đến hạn ngay ngày đặt). Chỉ sửa khoản CHƯA đóng.
UPDATE c
SET c.DueDate = r.StartDate
FROM dbo.Charge AS c
JOIN dbo.Reservation AS r ON r.ReservationID = c.ReservationID
WHERE c.ChargeType = N'Rent' AND c.Status = N'Unpaid'
  AND c.PeriodStart = r.StartDate AND c.DueDate < r.StartDate;
GO
