-- Lưu chính sách BOM vào database (bảng PolicyVersion) cho DB ĐÃ TẠO trước đó. Chạy nhiều lần cũng không lỗi.
-- Backend cũng tự tạo bảng này khi khởi động (DatabaseSeeder.EnsurePolicyVersionTable), nên file này chỉ để chạy tay nếu cần.
-- DB tạo mới từ SelfStorageDB_test.sql đã có bảng này.
USE SelfStorageDB_test;
GO

IF OBJECT_ID(N'dbo.PolicyVersion', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PolicyVersion (
        PolicyVersionID INT IDENTITY(1,1) NOT NULL,
        PolicyKey NVARCHAR(40) NOT NULL,          -- deposit | overdue | reservation | renewal_return
        Version INT NOT NULL,
        Status NVARCHAR(20) NOT NULL,             -- Active | Scheduled | Superseded
        EffectiveFrom NVARCHAR(10) NOT NULL,      -- yyyy-MM-dd
        CreatedAt DATETIME2 NOT NULL,
        CreatedBy NVARCHAR(150) NOT NULL,
        Note NVARCHAR(500) NULL,
        ConfigJson NVARCHAR(MAX) NOT NULL,        -- toàn bộ nội dung chính sách (JSON)

        CONSTRAINT PK_PolicyVersion PRIMARY KEY (PolicyVersionID),
        CONSTRAINT UX_PolicyVersion_Key_Version UNIQUE (PolicyKey, Version),
        CONSTRAINT CK_PolicyVersion_Status CHECK (Status IN (N'Active', N'Scheduled', N'Superseded'))
    );
END;
GO
