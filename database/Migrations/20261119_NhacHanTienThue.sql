-- Nhắc hạn đóng tiền thuê: bảng chống gửi trùng email (cho DB ĐÃ TẠO trước đó). Chạy nhiều lần cũng không lỗi.
-- Backend cũng tự tạo bảng này khi khởi động (DatabaseSeeder.EnsureRentReminderTable).
USE SelfStorageDB_test;
GO

IF OBJECT_ID(N'dbo.RentReminderLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RentReminderLog (
        RentReminderLogID INT IDENTITY(1,1) NOT NULL,
        CustomerID INT NOT NULL,
        DueDate DATETIME2 NOT NULL,
        Kind NVARCHAR(10) NOT NULL,               -- D3 = nhắc trước 3 ngày | D0 = đúng ngày đến hạn
        SentAt DATETIME2 NOT NULL,

        CONSTRAINT PK_RentReminderLog PRIMARY KEY (RentReminderLogID),
        CONSTRAINT UX_RentReminderLog UNIQUE (CustomerID, DueDate, Kind)
    );
END;
GO
