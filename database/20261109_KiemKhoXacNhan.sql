/* =====================================================================
   20261109_KiemKhoXacNhan.sql  -  GÓP Ý 14: KIỂM KHO KHI TRẢ CÓ ẢNH + KHÁCH XÁC NHẬN TRƯỚC KHI TRỪ CỌC
   ---------------------------------------------------------------------
   Chạy 1 lần trên database đang dùng (mở New Query, chạy cả file). Chạy lại nhiều lần không sao.
   Không sửa bảng cũ nào, chỉ THÊM:
     - ReturnInspection     : 1 dòng / 1 đơn trả kho. Kết quả kiểm tra + ảnh của Staff, hạn khách xác nhận,
                              khiếu nại của khách (+ ảnh), quyết định của Facility Manager, cách quyết toán.
     - ReturnInspectionFee  : các khoản phí kiểm kho Staff đề xuất (ProposedAmount) và số chốt cuối (FinalAmount).
   Luồng trạng thái:
     Không có phí kiểm kho  -> 'Settled' ngay (SettledBy = 'NoFee'), quyết toán cọc như cũ.
     Có phí kiểm kho        -> 'Awaiting Customer' (chưa trừ cọc, chưa hoàn cọc)
         khách Đồng ý        -> 'Settled' (SettledBy = 'Customer')
         quá hạn không trả lời -> 'Settled' (SettledBy = 'Auto')
         khách Khiếu nại     -> 'Disputed' -> Facility Manager xem ảnh, giữ / giảm phí -> 'Settled' (SettledBy = 'Manager')
   Số tiền chốt (FinalAmount) chỉ được GIẢM so với đề xuất, không tăng.
   ===================================================================== */

USE SelfStorageDB_test;
GO

IF OBJECT_ID(N'dbo.ReturnInspection', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReturnInspection (
        InspectionID INT IDENTITY(1,1) NOT NULL,
        ReservationID INT NOT NULL,
        ConditionResult NVARCHAR(20) NOT NULL,       -- Good | Damaged
        StaffNotes NVARCHAR(1000) NULL,
        StaffImages NVARCHAR(MAX) NULL,              -- JSON mảng ảnh data:image/... (tối đa 5, BE kiểm)
        InspectedByUserID INT NOT NULL,
        InspectedAt DATETIME2 NOT NULL CONSTRAINT DF_ReturnInspection_InspectedAt DEFAULT SYSUTCDATETIME(),
        ConfirmDeadline DATETIME2 NOT NULL,          -- quá hạn khách chưa trả lời -> tự xác nhận
        DepositRemaining DECIMAL(12,2) NOT NULL,     -- cọc còn lại sau khi trừ công nợ hợp đồng (7b), dùng để quyết toán
        Status NVARCHAR(30) NOT NULL,
        RespondedAt DATETIME2 NULL,                  -- lúc khách bấm Đồng ý / Khiếu nại
        DisputeReason NVARCHAR(1000) NULL,
        CustomerImages NVARCHAR(MAX) NULL,           -- JSON ảnh khách gửi kèm khiếu nại (tối đa 3, BE kiểm)
        ResolvedByUserID INT NULL,
        ResolvedAt DATETIME2 NULL,
        ResolutionNotes NVARCHAR(1000) NULL,
        SettledAt DATETIME2 NULL,
        SettledBy NVARCHAR(20) NULL,                 -- NoFee | Customer | Auto | Manager

        CONSTRAINT PK_ReturnInspection PRIMARY KEY (InspectionID),
        CONSTRAINT FK_ReturnInspection_Reservation FOREIGN KEY (ReservationID) REFERENCES dbo.Reservation(ReservationID),
        CONSTRAINT FK_ReturnInspection_InspectedBy FOREIGN KEY (InspectedByUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT FK_ReturnInspection_ResolvedBy FOREIGN KEY (ResolvedByUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT CK_ReturnInspection_Status CHECK (Status IN (N'Awaiting Customer', N'Disputed', N'Settled')),
        CONSTRAINT CK_ReturnInspection_Condition CHECK (ConditionResult IN (N'Good', N'Damaged')),
        -- Kho hư hỏng bắt buộc có ảnh làm bằng chứng
        CONSTRAINT CK_ReturnInspection_Evidence CHECK (ConditionResult = N'Good' OR StaffImages IS NOT NULL),
        CONSTRAINT CK_ReturnInspection_Deposit CHECK (DepositRemaining >= 0),
        CONSTRAINT CK_ReturnInspection_Deadline CHECK (ConfirmDeadline >= InspectedAt),
        CONSTRAINT CK_ReturnInspection_SettledBy CHECK (SettledBy IS NULL OR SettledBy IN (N'NoFee', N'Customer', N'Auto', N'Manager')),
        -- Đã quyết toán <=> có thời điểm + cách quyết toán
        CONSTRAINT CK_ReturnInspection_Settled CHECK (
            (Status = N'Settled' AND SettledAt IS NOT NULL AND SettledBy IS NOT NULL) OR
            (Status <> N'Settled' AND SettledAt IS NULL AND SettledBy IS NULL)),
        -- Khiếu nại phải có lý do (>= 10 ký tự) và thời điểm khách gửi
        CONSTRAINT CK_ReturnInspection_Dispute CHECK (
            (DisputeReason IS NULL OR (LEN(LTRIM(RTRIM(DisputeReason))) >= 10 AND RespondedAt IS NOT NULL)) AND
            (Status <> N'Disputed' OR DisputeReason IS NOT NULL)),
        CONSTRAINT CK_ReturnInspection_CustomerImages CHECK (CustomerImages IS NULL OR DisputeReason IS NOT NULL),
        -- Manager quyết định <=> đã có khiếu nại + người / lúc / nội dung quyết định
        CONSTRAINT CK_ReturnInspection_Resolved CHECK (
            (SettledBy = N'Manager' AND DisputeReason IS NOT NULL AND ResolvedByUserID IS NOT NULL AND ResolvedAt IS NOT NULL
                AND ResolutionNotes IS NOT NULL) OR
            (ISNULL(SettledBy, N'') <> N'Manager' AND ResolvedByUserID IS NULL AND ResolvedAt IS NULL AND ResolutionNotes IS NULL)),
        -- Khách đồng ý: có lúc trả lời, không có khiếu nại. Tự xác nhận / không phí: không có khiếu nại
        CONSTRAINT CK_ReturnInspection_Accepted CHECK (
            (ISNULL(SettledBy, N'') <> N'Customer' OR (RespondedAt IS NOT NULL AND DisputeReason IS NULL)) AND
            (ISNULL(SettledBy, N'') NOT IN (N'Auto', N'NoFee') OR (DisputeReason IS NULL AND RespondedAt IS NULL)))
    );
END;
GO

-- Mỗi đơn chỉ trả kho / kiểm kho 1 lần
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_ReturnInspection_Reservation' AND object_id = OBJECT_ID(N'dbo.ReturnInspection'))
    CREATE UNIQUE INDEX UX_ReturnInspection_Reservation ON dbo.ReturnInspection (ReservationID);
-- Tìm nhanh các kết quả chờ khách / quá hạn cần tự xác nhận
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ReturnInspection_Status' AND object_id = OBJECT_ID(N'dbo.ReturnInspection'))
    CREATE INDEX IX_ReturnInspection_Status ON dbo.ReturnInspection (Status, ConfirmDeadline);
GO

IF OBJECT_ID(N'dbo.ReturnInspectionFee', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ReturnInspectionFee (
        FeeID INT IDENTITY(1,1) NOT NULL,
        InspectionID INT NOT NULL,
        FeeCode NVARCHAR(50) NULL,                   -- mã trong FeePolicy (nếu chọn từ danh mục)
        FeePolicyID INT NULL,
        Description NVARCHAR(255) NOT NULL,
        ProposedAmount DECIMAL(12,2) NOT NULL,       -- Staff đề xuất
        FinalAmount DECIMAL(12,2) NULL,              -- số chốt khi quyết toán (0 = miễn)

        CONSTRAINT PK_ReturnInspectionFee PRIMARY KEY (FeeID),
        CONSTRAINT FK_ReturnInspectionFee_Inspection FOREIGN KEY (InspectionID) REFERENCES dbo.ReturnInspection(InspectionID),
        CONSTRAINT FK_ReturnInspectionFee_FeePolicy FOREIGN KEY (FeePolicyID) REFERENCES dbo.FeePolicy(FeePolicyID),
        CONSTRAINT CK_ReturnInspectionFee_Description CHECK (LEN(LTRIM(RTRIM(Description))) > 0),
        CONSTRAINT CK_ReturnInspectionFee_Proposed CHECK (ProposedAmount > 0 AND ProposedAmount <= 100000000),
        -- Chỉ được giữ nguyên hoặc giảm, không tăng
        CONSTRAINT CK_ReturnInspectionFee_Final CHECK (FinalAmount IS NULL OR (FinalAmount >= 0 AND FinalAmount <= ProposedAmount))
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ReturnInspectionFee_Inspection' AND object_id = OBJECT_ID(N'dbo.ReturnInspectionFee'))
    CREATE INDEX IX_ReturnInspectionFee_Inspection ON dbo.ReturnInspectionFee (InspectionID);
GO

/* ---------- Trigger: luồng trạng thái + không sửa bằng chứng ---------- */
CREATE OR ALTER TRIGGER dbo.TR_ReturnInspection_Validate
ON dbo.ReturnInspection
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Tạo mới: chờ khách xác nhận, hoặc quyết toán ngay khi không có phí kiểm kho
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE d.InspectionID IS NULL
          AND NOT (i.Status = N'Awaiting Customer' OR (i.Status = N'Settled' AND i.SettledBy = N'NoFee')))
        THROW 51070, N'INSPECTION_STATUS_TRANSITION: Kết quả kiểm kho mới phải ở trạng thái chờ khách xác nhận.', 1;

    -- Chỉ đơn đã bàn giao / đã trả kho mới có kết quả kiểm kho
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Reservation AS r ON r.ReservationID = i.ReservationID
        WHERE r.Status NOT IN (N'Handed Over', N'Completed'))
        THROW 51071, N'INSPECTION_RESERVATION_STATE: Đơn này chưa bàn giao kho nên không có kết quả kiểm kho.', 1;

    -- Awaiting -> Disputed | Settled(Customer, Auto); Disputed -> Settled(Manager); Settled thì không đổi nữa
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE i.Status <> d.Status
          AND NOT (
              (d.Status = N'Awaiting Customer' AND i.Status = N'Disputed') OR
              (d.Status = N'Awaiting Customer' AND i.Status = N'Settled' AND i.SettledBy IN (N'Customer', N'Auto')) OR
              (d.Status = N'Disputed' AND i.Status = N'Settled' AND i.SettledBy = N'Manager')))
        THROW 51070, N'INSPECTION_STATUS_TRANSITION: Kết quả kiểm kho này đã được xử lý trước đó.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE d.Status = N'Settled'
          AND (i.SettledBy <> d.SettledBy OR i.SettledAt <> d.SettledAt OR ISNULL(i.ResolutionNotes, N'') <> ISNULL(d.ResolutionNotes, N'')))
        THROW 51070, N'INSPECTION_STATUS_TRANSITION: Kết quả kiểm kho đã quyết toán, không sửa được.', 1;

    -- Bằng chứng và số liệu của Staff không sửa sau khi gửi khách
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE i.ReservationID <> d.ReservationID OR i.ConditionResult <> d.ConditionResult
           OR ISNULL(i.StaffNotes, N'') <> ISNULL(d.StaffNotes, N'')
           OR ISNULL(i.StaffImages, N'') <> ISNULL(d.StaffImages, N'')
           OR i.InspectedByUserID <> d.InspectedByUserID OR i.InspectedAt <> d.InspectedAt
           OR i.ConfirmDeadline <> d.ConfirmDeadline OR i.DepositRemaining <> d.DepositRemaining)
        THROW 51072, N'INSPECTION_EVIDENCE_LOCKED: Kết quả kiểm tra và ảnh đã gửi cho khách nên không sửa được.', 1;

    -- Khiếu nại đã gửi thì không sửa / rút
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE d.DisputeReason IS NOT NULL
          AND (ISNULL(i.DisputeReason, N'') <> d.DisputeReason OR ISNULL(i.CustomerImages, N'') <> ISNULL(d.CustomerImages, N'')
               OR i.RespondedAt <> d.RespondedAt))
        THROW 51072, N'INSPECTION_EVIDENCE_LOCKED: Khiếu nại đã gửi nên không sửa được.', 1;

    -- Khách chỉ được khiếu nại trước hạn xác nhận
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE d.Status = N'Awaiting Customer' AND i.Status = N'Disputed' AND i.RespondedAt > i.ConfirmDeadline)
        THROW 51073, N'INSPECTION_DEADLINE_PASSED: Đã quá hạn xác nhận nên không gửi khiếu nại được.', 1;

    -- Quyết toán từ trạng thái chờ / khiếu nại: phải có phí, mọi phí đã chốt số tiền
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.InspectionID = i.InspectionID
        WHERE i.Status = N'Settled' AND d.Status <> N'Settled'
          AND (NOT EXISTS (SELECT 1 FROM dbo.ReturnInspectionFee AS f WHERE f.InspectionID = i.InspectionID)
               OR EXISTS (SELECT 1 FROM dbo.ReturnInspectionFee AS f WHERE f.InspectionID = i.InspectionID AND f.FinalAmount IS NULL)))
        THROW 51074, N'INSPECTION_FEES_NOT_FINAL: Chưa chốt số tiền cho tất cả khoản phí kiểm kho.', 1;

    -- Khách đồng ý / tự xác nhận: giữ nguyên số tiền Staff đề xuất (chỉ Manager được giảm sau khiếu nại)
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.ReturnInspectionFee AS f ON f.InspectionID = i.InspectionID
        WHERE i.Status = N'Settled' AND i.SettledBy IN (N'Customer', N'Auto') AND f.FinalAmount <> f.ProposedAmount)
        THROW 51074, N'INSPECTION_FEES_NOT_FINAL: Chỉ Facility Manager được điều chỉnh phí khi giải quyết khiếu nại.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_ReturnInspectionFee_Validate
ON dbo.ReturnInspectionFee
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Đã quyết toán: không thêm / sửa / xóa phí
    IF EXISTS (
        SELECT 1 FROM (SELECT InspectionID FROM inserted UNION SELECT InspectionID FROM deleted) AS x
        JOIN dbo.ReturnInspection AS ri ON ri.InspectionID = x.InspectionID
        WHERE ri.Status = N'Settled')
        THROW 51075, N'INSPECTION_FEE_LOCKED: Kết quả kiểm kho đã quyết toán, không sửa phí được.', 1;

    -- Phí chỉ được thêm lúc Staff gửi kết quả (chờ khách), không xóa
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.FeeID = i.FeeID
        JOIN dbo.ReturnInspection AS ri ON ri.InspectionID = i.InspectionID
        WHERE d.FeeID IS NULL AND (ri.Status <> N'Awaiting Customer' OR ri.RespondedAt IS NOT NULL))
        THROW 51075, N'INSPECTION_FEE_LOCKED: Không thêm phí sau khi khách đã trả lời.', 1;

    IF EXISTS (SELECT 1 FROM deleted AS d LEFT JOIN inserted AS i ON i.FeeID = d.FeeID WHERE i.FeeID IS NULL)
        THROW 51075, N'INSPECTION_FEE_LOCKED: Không xóa khoản phí đã gửi khách.', 1;

    -- Nội dung và số tiền đề xuất không đổi
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.FeeID = i.FeeID
        WHERE i.InspectionID <> d.InspectionID OR i.ProposedAmount <> d.ProposedAmount OR i.Description <> d.Description
           OR ISNULL(i.FeeCode, N'') <> ISNULL(d.FeeCode, N'') OR ISNULL(i.FeePolicyID, 0) <> ISNULL(d.FeePolicyID, 0))
        THROW 51075, N'INSPECTION_FEE_LOCKED: Không sửa nội dung / số tiền phí đã gửi khách.', 1;

    -- Giảm phí (khác đề xuất) chỉ khi đang giải quyết khiếu nại
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.ReturnInspection AS ri ON ri.InspectionID = i.InspectionID
        WHERE i.FinalAmount IS NOT NULL AND i.FinalAmount <> i.ProposedAmount AND ri.Status <> N'Disputed')
        THROW 51075, N'INSPECTION_FEE_LOCKED: Chỉ được giảm phí khi Facility Manager giải quyết khiếu nại.', 1;
END;
GO

/* ---------- Thông báo lỗi tiếng Việt cho các ràng buộc mới (cùng cơ chế AppErrorMessage) ---------- */
MERGE dbo.AppErrorMessage AS t
USING (VALUES
    (N'UX_ReturnInspection_Reservation', 409, N'Đơn này đã có kết quả kiểm kho.'),
    (N'CK_ReturnInspection_Evidence', 400, N'Kho có vấn đề: cần ít nhất 1 ảnh làm bằng chứng.'),
    (N'CK_ReturnInspection_Dispute', 400, N'Vui lòng ghi rõ lý do khiếu nại (ít nhất 10 ký tự).'),
    (N'CK_ReturnInspection_Resolved', 400, N'Giải quyết khiếu nại cần ghi nội dung quyết định.'),
    (N'CK_ReturnInspectionFee_Proposed', 400, N'Số tiền phí kiểm kho không hợp lệ.'),
    (N'CK_ReturnInspectionFee_Final', 400, N'Số tiền chốt chỉ được giữ nguyên hoặc giảm so với đề xuất.')
) AS s (ErrorKey, HttpStatus, MessageVi)
ON t.ErrorKey = s.ErrorKey
WHEN MATCHED THEN UPDATE SET HttpStatus = s.HttpStatus, MessageVi = s.MessageVi
WHEN NOT MATCHED THEN INSERT (ErrorKey, HttpStatus, MessageVi) VALUES (s.ErrorKey, s.HttpStatus, s.MessageVi);
GO

PRINT N'Đã tạo ReturnInspection + ReturnInspectionFee (góp ý 14).';
GO
