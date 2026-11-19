-- Trả kho sớm: bảng đơn chờ Facility Manager duyệt (cho DB ĐÃ TẠO trước đó). Chạy nhiều lần cũng không lỗi.
-- Backend cũng tự tạo bảng này khi khởi động (DatabaseSeeder.EnsureEarlyReturnTable).
USE SelfStorageDB_test;
GO

IF OBJECT_ID(N'dbo.EarlyReturnRequest', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EarlyReturnRequest (
        EarlyReturnRequestID INT IDENTITY(1,1) NOT NULL,
        ReservationID INT NOT NULL,
        CustomerID INT NOT NULL,
        ReturnDate DATETIME2 NOT NULL,
        ReturnTime NVARCHAR(5) NOT NULL,          -- HH:mm
        Reason NVARCHAR(30) NOT NULL,             -- moving | no_need | other_unit | price | service | other
        Note NVARCHAR(500) NULL,
        Status NVARCHAR(20) NOT NULL,             -- Pending | Approved | Rejected | Cancelled
        RefundAmount DECIMAL(12,2) NOT NULL,      -- tiền thuê được hoàn (kỳ đã đóng sau ngày trả kho)
        CancelledPeriods INT NOT NULL,
        LateNotice BIT NOT NULL,                  -- trả theo tháng, gửi muộn -> phải đóng kỳ tới
        CreatedAt DATETIME2 NOT NULL,
        DecidedByUserID INT NULL,
        DecidedAt DATETIME2 NULL,
        ManagerNote NVARCHAR(500) NULL,

        CONSTRAINT PK_EarlyReturnRequest PRIMARY KEY (EarlyReturnRequestID),
        CONSTRAINT FK_EarlyReturnRequest_Reservation FOREIGN KEY (ReservationID) REFERENCES Reservation(ReservationID),
        CONSTRAINT CK_EarlyReturnRequest_Status CHECK (Status IN (N'Pending', N'Approved', N'Rejected', N'Cancelled'))
    );
    CREATE INDEX IX_EarlyReturnRequest_Reservation_Status ON dbo.EarlyReturnRequest (ReservationID, Status);
END;
GO
