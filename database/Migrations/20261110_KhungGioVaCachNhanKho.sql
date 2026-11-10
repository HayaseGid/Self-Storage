-- Khung giờ nhận kho + cách nhận kho (cho DB ĐÃ TẠO trước đó). Chạy nhiều lần cũng không lỗi.
-- DB tạo mới từ SelfStorageDB_test.sql đã có cột HandoverMethod thì KHÔNG cần chạy file này.
--   HandoverMethod = InPerson: khách đến cơ sở trong khung giờ đã chọn (AppointmentTime = 08:00 | 10:00 | 12:00 | 14:00, khung 2 tiếng)
--   HandoverMethod = Online  : không hẹn giờ (AppointmentTime = NULL); mã truy cập hiện trong tài khoản, chìa khóa để ở lễ tân
USE SelfStorageDB_test;
GO

IF COL_LENGTH(N'dbo.Reservation', N'HandoverMethod') IS NULL
BEGIN
    ALTER TABLE dbo.Reservation
        ADD HandoverMethod NVARCHAR(20) NOT NULL
            CONSTRAINT DF_Reservation_HandoverMethod DEFAULT N'InPerson';   -- đơn cũ: nhận trực tiếp
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Reservation_HandoverMethod')
BEGIN
    ALTER TABLE dbo.Reservation
        ADD CONSTRAINT CK_Reservation_HandoverMethod CHECK (HandoverMethod IN (N'InPerson', N'Online'));
END;
GO
