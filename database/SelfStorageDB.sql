-- =============================================
-- SELF-STORAGE MANAGEMENT SYSTEM
-- SQL Server Database
-- =============================================

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'SelfStorageDB')
BEGIN
    -- Ngắt toàn bộ kết nối đang sử dụng DB này trước khi xóa
    ALTER DATABASE SelfStorageDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE SelfStorageDB;
END
GO

CREATE DATABASE SelfStorageDB;
GO

USE SelfStorageDB;
GO


-- =============================================
-- 1. ROLE
-- =============================================

CREATE TABLE Role (
    RoleID INT IDENTITY(1,1) PRIMARY KEY,
    RoleName NVARCHAR(50) NOT NULL,
    Description NVARCHAR(255)
);
GO


-- =============================================
-- 2. USERS
-- =============================================

CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    RoleID INT NOT NULL,
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    Email NVARCHAR(150),
    PhoneNumber NVARCHAR(30),
    Status NVARCHAR(30),

    CONSTRAINT FK_Users_Role
        FOREIGN KEY (RoleID)
        REFERENCES Role(RoleID)
);
GO


-- =============================================
-- 3. USER ACTIVITY LOG
-- =============================================

CREATE TABLE UserActivityLog (
    LogID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    Action NVARCHAR(100) NOT NULL,
    IPAddress NVARCHAR(50),
    [Timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
    Details NVARCHAR(500),

    CONSTRAINT FK_UserActivityLog_Users
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
);
GO


-- =============================================
-- 4. FACILITY
-- ManagerID references Users
-- A Manager can manage multiple facilities
-- =============================================

CREATE TABLE Facility (
    FacilityID INT IDENTITY(1,1) PRIMARY KEY,
    ManagerID INT NOT NULL,
    FacilityName NVARCHAR(150) NOT NULL,
    UnitCodePrefix NVARCHAR(10) NOT NULL,
    Address NVARCHAR(255) NOT NULL,
    ContactPhone NVARCHAR(30),
    Status NVARCHAR(30),

    CONSTRAINT UQ_Facility_UnitCodePrefix UNIQUE (UnitCodePrefix),
    CONSTRAINT FK_Facility_Manager
        FOREIGN KEY (ManagerID)
        REFERENCES Users(UserID)
);
GO

CREATE TABLE RentalPolicy (
    RentalPolicyID INT IDENTITY(1,1) PRIMARY KEY,
    FacilityID INT NOT NULL UNIQUE,
    DepositPercent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    CONSTRAINT CK_RentalPolicy_DepositPercent
        CHECK (DepositPercent >= 0 AND DepositPercent <= 100),
    CONSTRAINT FK_RentalPolicy_Facility
        FOREIGN KEY (FacilityID)
        REFERENCES Facility(FacilityID)
);
GO

-- =============================================
-- 5. FACILITY STAFF
-- =============================================

CREATE TABLE FacilityStaff (
    StaffID INT IDENTITY(1,1) PRIMARY KEY,
    FacilityID INT NOT NULL,
    UserID INT NOT NULL,
    AssignedDate DATE NOT NULL,
    Status NVARCHAR(30),

    CONSTRAINT FK_FacilityStaff_Facility
        FOREIGN KEY (FacilityID)
        REFERENCES Facility(FacilityID),

    CONSTRAINT FK_FacilityStaff_User
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
);
GO


-- =============================================
-- 6. UNIT TYPE
-- =============================================

CREATE TABLE UnitType (
    UnitTypeID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255)
);
GO


-- =============================================
-- 7. UNIT SIZE
-- =============================================

CREATE TABLE UnitSize (
    UnitSizeID INT IDENTITY(1,1) PRIMARY KEY,
    Dimensions NVARCHAR(50) NOT NULL,
    Volume DECIMAL(10,2)
);
GO

CREATE TABLE RentalRate (
    RentalRateID INT IDENTITY(1,1) PRIMARY KEY,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    MonthlyPrice DECIMAL(12,2) NOT NULL,
    CONSTRAINT UQ_RentalRate_Facility_Type_Size
        UNIQUE (FacilityID, UnitTypeID, UnitSizeID),
    CONSTRAINT CK_RentalRate_MonthlyPrice
        CHECK (MonthlyPrice > 0),
    CONSTRAINT FK_RentalRate_Facility
        FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_RentalRate_UnitType
        FOREIGN KEY (UnitTypeID) REFERENCES UnitType(UnitTypeID),
    CONSTRAINT FK_RentalRate_UnitSize
        FOREIGN KEY (UnitSizeID) REFERENCES UnitSize(UnitSizeID)
);
GO


-- =============================================
-- 8. STORAGE UNIT
-- =============================================

CREATE TABLE StorageUnit (
    UnitID INT IDENTITY(1,1) PRIMARY KEY,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    UnitNumber NVARCHAR(50) NOT NULL,
    BasePrice DECIMAL(12,2) NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    StatusBeforeBooking NVARCHAR(30) NULL,

    CONSTRAINT FK_StorageUnit_Facility
        FOREIGN KEY (FacilityID)
        REFERENCES Facility(FacilityID),

    CONSTRAINT FK_StorageUnit_UnitType
        FOREIGN KEY (UnitTypeID)
        REFERENCES UnitType(UnitTypeID),

    CONSTRAINT FK_StorageUnit_UnitSize
        FOREIGN KEY (UnitSizeID)
        REFERENCES UnitSize(UnitSizeID),

    CONSTRAINT UQ_StorageUnit_Facility_UnitNumber
        UNIQUE (FacilityID, UnitNumber)
);
GO


-- =============================================
-- 9. CONTRACT TYPE
-- =============================================

CREATE TABLE ContractType (
    ContractTypeID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(100) NOT NULL,
    MinDays INT NOT NULL,
    MaxDays INT NOT NULL,
    DiscountRate DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT CK_ContractType_Days
        CHECK (MinDays >= 0 AND MaxDays >= MinDays),

    CONSTRAINT CK_ContractType_Discount
        CHECK (DiscountRate >= 0 AND DiscountRate <= 100)
);
GO


-- =============================================
-- 10. RESERVATION
-- =============================================

CREATE TABLE Reservation (
    ReservationID INT IDENTITY(1,1) PRIMARY KEY,
    CustomerID INT NOT NULL,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    AssignedUnitID INT NULL,
    StartDate DATE NOT NULL,
    RentalPeriod INT NOT NULL,
    EndDate DATE NOT NULL,
    TotalEstimatedCost DECIMAL(12,2),
    DepositAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    DepositExpiresAt DATETIME2 NOT NULL DEFAULT (DATEADD(MINUTE, 10, SYSUTCDATETIME())),
    Status NVARCHAR(30) NOT NULL,

    CONSTRAINT FK_Reservation_Customer
        FOREIGN KEY (CustomerID)
        REFERENCES Users(UserID),

    CONSTRAINT FK_Reservation_Facility
        FOREIGN KEY (FacilityID)
        REFERENCES Facility(FacilityID),

    CONSTRAINT FK_Reservation_UnitType
        FOREIGN KEY (UnitTypeID)
        REFERENCES UnitType(UnitTypeID),

    CONSTRAINT FK_Reservation_AssignedUnit
        FOREIGN KEY (AssignedUnitID)
        REFERENCES StorageUnit(UnitID),

    CONSTRAINT CK_Reservation_RentalPeriod
        CHECK (RentalPeriod > 0),

    CONSTRAINT CK_Reservation_Date
        CHECK (EndDate >= StartDate)
);
GO


-- =============================================
-- 11. CONTRACT
-- =============================================

CREATE TABLE Contract (
    ContractID INT IDENTITY(1,1) PRIMARY KEY,
    ReservationID INT NOT NULL UNIQUE,
    ContractTypeID INT NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    DepositAmount DECIMAL(12,2) NOT NULL DEFAULT 0,
    TotalFee DECIMAL(12,2) NOT NULL DEFAULT 0,
    ContractStatus NVARCHAR(30) NOT NULL,

    CONSTRAINT FK_Contract_Reservation
        FOREIGN KEY (ReservationID)
        REFERENCES Reservation(ReservationID),

    CONSTRAINT FK_Contract_Type
        FOREIGN KEY (ContractTypeID)
        REFERENCES ContractType(ContractTypeID),

    CONSTRAINT CK_Contract_Date
        CHECK (EndDate >= StartDate),

    CONSTRAINT CK_Contract_Deposit
        CHECK (DepositAmount >= 0),

    CONSTRAINT CK_Contract_TotalFee
        CHECK (TotalFee >= 0)
);
GO

CREATE TABLE ContractSignature (
    ContractID INT PRIMARY KEY,
    UserID INT NOT NULL,
    SignerName NVARCHAR(100) NOT NULL,
    SignatureImage NVARCHAR(MAX) NOT NULL,
    TermsVersion NVARCHAR(50) NOT NULL,
    SignedAt DATETIMEOFFSET NOT NULL,

    CONSTRAINT FK_ContractSignature_Contract
        FOREIGN KEY (ContractID)
        REFERENCES Contract(ContractID),

    CONSTRAINT FK_ContractSignature_User
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID)
);
GO


-- =============================================
-- 12. PAYMENT
-- =============================================

CREATE TABLE Payment (
    PaymentID INT IDENTITY(1,1) PRIMARY KEY,
    ReservationID INT NOT NULL,
    TransactionReference NVARCHAR(100),
    Amount DECIMAL(12,2) NOT NULL,
    PaymentType NVARCHAR(50),
    PaymentDate DATE NOT NULL,
    PaymentStatus NVARCHAR(30),

    CONSTRAINT FK_Payment_Reservation
        FOREIGN KEY (ReservationID)
        REFERENCES Reservation(ReservationID),

    CONSTRAINT CK_Payment_Amount
        CHECK (Amount > 0)
);
GO


-- =============================================
-- 13. UNIT ACCESS
-- =============================================

CREATE TABLE UnitAccess (
    AccessID INT IDENTITY(1,1) PRIMARY KEY,
    ContractID INT NOT NULL,
    UserID INT NOT NULL,
    UnitID INT NOT NULL,
    AccessType NVARCHAR(50),
    AccessValue NVARCHAR(255),
    IssueDate DATE NOT NULL,
    ReturnDate DATE NULL,
    Status NVARCHAR(30),

    CONSTRAINT FK_UnitAccess_Contract
        FOREIGN KEY (ContractID)
        REFERENCES Contract(ContractID),

    CONSTRAINT FK_UnitAccess_User
        FOREIGN KEY (UserID)
        REFERENCES Users(UserID),

    CONSTRAINT FK_UnitAccess_Unit
        FOREIGN KEY (UnitID)
        REFERENCES StorageUnit(UnitID),

    CONSTRAINT CK_UnitAccess_Date
        CHECK (ReturnDate IS NULL OR ReturnDate >= IssueDate)
);
GO


-- =============================================
-- 14. HANDOVER TASK
-- =============================================

CREATE TABLE HandoverTask (
    TaskID INT IDENTITY(1,1) PRIMARY KEY,
    StaffID INT NOT NULL,
    TaskType NVARCHAR(50),
    ScheduledDate DATE,
    ActualDate DATE,
    UnitConditionNotes NVARCHAR(1000),
    Status NVARCHAR(30),
    ReservationID INT NOT NULL,
    CustomerID INT NOT NULL,
    UnitID INT NOT NULL,
    EvidenceImages NVARCHAR(MAX),

    CONSTRAINT FK_HandoverTask_Staff
        FOREIGN KEY (StaffID)
        REFERENCES Users(UserID),

    CONSTRAINT FK_HandoverTask_Reservation
        FOREIGN KEY (ReservationID)
        REFERENCES Reservation(ReservationID),

    CONSTRAINT FK_HandoverTask_Customer
        FOREIGN KEY (CustomerID)
        REFERENCES Users(UserID),

    CONSTRAINT FK_HandoverTask_Unit
        FOREIGN KEY (UnitID)
        REFERENCES StorageUnit(UnitID)
);
GO
-- =============================================
-- SEED DATA FOR SELF-STORAGE MANAGEMENT SYSTEM
-- Chạy file này SAU KHI đã chạy file SelfStorageDB.sql
-- =============================================

USE SelfStorageDB;
GO

-- 1. Role
SET IDENTITY_INSERT Role ON;
INSERT INTO Role (RoleID, RoleName, Description) VALUES
(1, 'Storage Customer', 'Reserve units, pay fees, check in, and manage rented units'),
(2, 'Facility Staff', 'Support check-in, update unit status, and handle on-site problems'),
(3, 'Facility Manager', 'Manage storage units, staff, and contracts at an assigned facility'),
(4, 'Business Operations Manager', 'Manage all facilities, general policies, pricing, and system-wide reports'),
(5, 'System Administrator', 'Manage user accounts and assign roles within the system');
SET IDENTITY_INSERT Role OFF;
GO

-- 2. Users
SET IDENTITY_INSERT Users ON;
INSERT INTO Users (UserID, RoleID, Username, PasswordHash, FullName, Email, PhoneNumber, Status) VALUES
(1, 3, 'fac_manager1', '123456', N'Nguyễn Quản Lý Cơ Sở 1', 'fm1@test.com', '0901000001', 'Active'),
(2, 3, 'fac_manager2', '123456', N'Trần Quản Lý Cơ Sở 2', 'fm2@test.com', '0901000002', 'Active'),
(3, 2, 'staff1', '123456', N'Lê Nhân Viên Một', 'staff1@test.com', '0902000001', 'Active'),
(4, 2, 'staff2', '123456', N'Phạm Nhân Viên Hai', 'staff2@test.com', '0902000002', 'Active'),
(5, 2, 'staff3', '123456', N'Hoàng Nhân Viên Ba', 'staff3@test.com', '0902000003', 'Active'),
(6, 1, 'customer1', '123456', N'Đinh Khách Hàng', 'cust1@test.com', '0903000001', 'Active'),
(7, 1, 'customer2', '123456', N'Vũ Khách Hàng', 'cust2@test.com', '0903000002', 'Active'),
(8, 1, 'customer3', '123456', N'Bùi Khách Hàng', 'cust3@test.com', '0903000003', 'Active'),
(9, 1, 'customer4', '123456', N'Đỗ Khách Hàng', 'cust4@test.com', '0903000004', 'Active'),
(10, 4, 'biz_ops_mgr', '123456', N'Lý Vận Hành Tổng', 'ops@test.com', '0904000001', 'Active'),
(11, 5, 'sys_admin', '123456', N'Quản Trị Viên', 'admin@test.com', '0905000001', 'Active');
SET IDENTITY_INSERT Users OFF;
GO

-- 3. Facility
SET IDENTITY_INSERT Facility ON;
INSERT INTO Facility (FacilityID, ManagerID, FacilityName, UnitCodePrefix, Address, ContactPhone, Status) VALUES
(1, 1, N'Cơ sở Lưu trữ Quận 1', 'Q1', N'123 Lê Lợi, Quận 1, TP.HCM', '0812345678', 'Active'),
(2, 2, N'Cơ sở Lưu trữ Tân Bình', 'TB', N'456 Cộng Hòa, Tân Bình, TP.HCM', '0812345679', 'Active'),
(3, 1, N'Cơ sở Lưu trữ Thủ Đức', 'TD', N'123 Võ Văn Ngân, Thủ Đức, TP.HCM', '0812345680', 'Active'),
(4, 2, N'Cơ sở Lưu trữ Quận 2', 'Q2', N'456 Trần Não, Quận 2, TP.HCM', '0812345681', 'Active'),
(5, 1, N'Cơ sở Lưu trữ Quận 3', 'Q3', N'789 Cách Mạng Tháng 8, Quận 3, TP.HCM', '0812345682', 'Active');
SET IDENTITY_INSERT Facility OFF;
GO

INSERT INTO RentalPolicy (FacilityID, DepositPercent)
SELECT FacilityID, 20.00 FROM Facility;
GO

-- 4. FacilityStaff
SET IDENTITY_INSERT FacilityStaff ON;
INSERT INTO FacilityStaff (StaffID, FacilityID, UserID, AssignedDate, Status) VALUES
(1, 1, 3, '2026-01-01', 'Active'),
(2, 1, 4, '2026-01-15', 'Active'),
(3, 2, 5, '2026-02-01', 'Active');
SET IDENTITY_INSERT FacilityStaff OFF;
GO

-- 5. UnitSize
SET IDENTITY_INSERT UnitSize ON;
INSERT INTO UnitSize (UnitSizeID, Dimensions, Volume) VALUES
(1, 'S1: Locker (< 2.5m)', NULL),
(2, 'S2: 2x2m', NULL),
(3, 'S3: 2x4m', NULL),
(4, 'M1: 2x6m', NULL),
(5, 'M2: 4x4m', NULL),
(6, 'L1: 4x6m', NULL),
(7, 'L2: 4x8m', NULL),
(8, 'L3: 4x10m', NULL),
(9, 'V1: 8x4m', NULL);
SET IDENTITY_INSERT UnitSize OFF;
GO

-- 6. UnitType
SET IDENTITY_INSERT UnitType ON;
INSERT INTO UnitType (UnitTypeID, TypeName, Description) VALUES
(1, 'Climate-Control Unit', N'Kho có thể điều chỉnh nhiệt độ, nằm trong nhà'),
(2, 'Drive-up Unit', N'Kho ngoài trời, xe vào tận nơi (L3, V1)'),
(3, 'Basic Unit', N'Kho ngoài trời tiêu chuẩn'),
(4, 'Indoor Unit', N'Kho trong nhà, có hành lang (Size trung)');
SET IDENTITY_INSERT UnitType OFF;
GO

-- 7. StorageUnit
SET IDENTITY_INSERT StorageUnit ON;
INSERT INTO StorageUnit (UnitID, FacilityID, UnitTypeID, UnitSizeID, UnitNumber, BasePrice, Status) VALUES
(1, 1, 1, 1, 'Q1-U01', 300000, 'Available'),
(2, 1, 1, 2, 'Q1-U02', 500000, 'Available'),
(3, 1, 4, 4, 'Q1-U03', 800000, 'Available'),
(4, 1, 4, 5, 'Q1-U04', 1000000, 'In Use'),
(5, 1, 3, 2, 'Q1-U05', 400000, 'Available'),
(6, 1, 3, 3, 'Q1-U06', 600000, 'Available'),
(7, 1, 2, 8, 'Q1-U07', 2000000, 'Available'),
(8, 1, 2, 9, 'Q1-U08', 2500000, 'Available'),
(9, 1, 1, 3, 'Q1-U09', 700000, 'Maintenance'),
(10, 1, 4, 6, 'Q1-U10', 1200000, 'Available'),
(11, 2, 1, 1, 'TB-U01', 280000, 'Available'),
(12, 2, 1, 2, 'TB-U02', 450000, 'Available'),
(13, 2, 3, 4, 'TB-U03', 750000, 'In Use'),
(14, 2, 4, 5, 'TB-U04', 900000, 'Available'),
(15, 2, 3, 2, 'TB-U05', 380000, 'Available'),
(16, 2, 3, 3, 'TB-U06', 550000, 'Available'),
(17, 2, 2, 8, 'TB-U07', 1800000, 'Available'),
(18, 2, 2, 9, 'TB-U08', 2200000, 'Available'),
(19, 2, 4, 6, 'TB-U09', 1100000, 'Available'),
(20, 2, 1, 3, 'TB-U10', 650000, 'Available'),

-- Cơ sở Thủ Đức (FacilityID = 3)
(21, 3, 1, 1, 'TD-U01', 300000, 'Available'),
(22, 3, 1, 2, 'TD-U02', 500000, 'Available'),
(23, 3, 4, 4, 'TD-U03', 800000, 'Available'),
(24, 3, 4, 5, 'TD-U04', 1000000, 'Available'),
(25, 3, 3, 2, 'TD-U05', 400000, 'Available'),
(26, 3, 3, 3, 'TD-U06', 600000, 'Available'),
(27, 3, 2, 8, 'TD-U07', 2000000, 'Available'),
(28, 3, 2, 9, 'TD-U08', 2500000, 'Available'),
(29, 3, 1, 3, 'TD-U09', 700000, 'Available'),
(30, 3, 4, 6, 'TD-U10', 1200000, 'Available'),

-- Cơ sở Quận 2 (FacilityID = 4)
(31, 4, 1, 1, 'Q2-U01', 350000, 'Available'),
(32, 4, 1, 2, 'Q2-U02', 550000, 'Available'),
(33, 4, 4, 4, 'Q2-U03', 850000, 'Available'),
(34, 4, 4, 5, 'Q2-U04', 1050000, 'Available'),
(35, 4, 3, 2, 'Q2-U05', 450000, 'Available'),
(36, 4, 3, 3, 'Q2-U06', 650000, 'Available'),
(37, 4, 2, 8, 'Q2-U07', 2100000, 'Available'),
(38, 4, 2, 9, 'Q2-U08', 2600000, 'Available'),
(39, 4, 1, 3, 'Q2-U09', 750000, 'Available'),
(40, 4, 4, 6, 'Q2-U10', 1250000, 'Available'),

-- Cơ sở Quận 3 (FacilityID = 5)
(41, 5, 1, 1, 'Q3-U01', 400000, 'Available'),
(42, 5, 1, 2, 'Q3-U02', 600000, 'Available'),
(43, 5, 4, 4, 'Q3-U03', 900000, 'Available'),
(44, 5, 4, 5, 'Q3-U04', 1100000, 'Available'),
(45, 5, 3, 2, 'Q3-U05', 500000, 'Available'),
(46, 5, 3, 3, 'Q3-U06', 700000, 'Available'),
(47, 5, 2, 8, 'Q3-U07', 2200000, 'Available'),
(48, 5, 2, 9, 'Q3-U08', 2700000, 'Available'),
(49, 5, 1, 3, 'Q3-U09', 800000, 'Available'),
(50, 5, 4, 6, 'Q3-U10', 1300000, 'Available');
SET IDENTITY_INSERT StorageUnit OFF;
GO

INSERT INTO RentalRate (FacilityID, UnitTypeID, UnitSizeID, MonthlyPrice)
SELECT FacilityID, UnitTypeID, UnitSizeID, MAX(BasePrice)
FROM StorageUnit
GROUP BY FacilityID, UnitTypeID, UnitSizeID;
GO

-- 8. ContractType
SET IDENTITY_INSERT ContractType ON;
INSERT INTO ContractType (ContractTypeID, TypeName, MinDays, MaxDays, DiscountRate) VALUES
(1, 'Monthly', 30, 365, 0),
(2, 'Yearly', 365, 3650, 10);
SET IDENTITY_INSERT ContractType OFF;
GO

-- 9. Reservation
SET IDENTITY_INSERT Reservation ON;
INSERT INTO Reservation (ReservationID, CustomerID, FacilityID, UnitTypeID, AssignedUnitID, StartDate, RentalPeriod, EndDate, TotalEstimatedCost, Status) VALUES
(1, 6, 1, 4, 4, '2026-09-01', 3, '2026-12-01', 3000000, 'Confirmed'),
(2, 7, 2, 3, 13, '2026-09-10', 12, '2027-09-10', 9000000, 'Confirmed');
SET IDENTITY_INSERT Reservation OFF;
GO

-- 10. Contract
SET IDENTITY_INSERT Contract ON;
INSERT INTO Contract (ContractID, ReservationID, ContractTypeID, StartDate, EndDate, DepositAmount, TotalFee, ContractStatus) VALUES
(1, 1, 1, '2026-09-01', '2026-12-01', 500000, 2400000, 'Active'),
(2, 2, 2, '2026-09-10', '2027-09-10', 750000, 9000000, 'Active');
SET IDENTITY_INSERT Contract OFF;
GO

-- 11. Payment
SET IDENTITY_INSERT Payment ON;
INSERT INTO Payment (PaymentID, ReservationID, TransactionReference, Amount, PaymentType, PaymentDate, PaymentStatus) VALUES
(1, 1, 'TXN001', 500000, 'Bank Transfer', '2026-08-30', 'Completed'),
(2, 2, 'TXN002', 750000, 'Credit Card', '2026-09-08', 'Completed');
SET IDENTITY_INSERT Payment OFF;
GO

-- 12. UnitAccess
SET IDENTITY_INSERT UnitAccess ON;
INSERT INTO UnitAccess (AccessID, ContractID, UserID, UnitID, AccessType, AccessValue, IssueDate, ReturnDate, Status) VALUES
(1, 1, 6, 4, 'Smart Lock', '123456', '2026-09-01', '2026-12-01', 'Active'),
(2, 2, 7, 13, 'Smart Lock', '654321', '2026-09-10', '2027-09-10', 'Active');
SET IDENTITY_INSERT UnitAccess OFF;
GO

-- 13. HandoverTask
SET IDENTITY_INSERT HandoverTask ON;
INSERT INTO HandoverTask (TaskID, StaffID, TaskType, ScheduledDate, ActualDate, UnitConditionNotes, Status, ReservationID, CustomerID, UnitID) VALUES
(1, 3, 'Move In', '2026-09-01', '2026-09-01', N'Kho đã được dọn sạch, hệ thống đèn hoạt động tốt', 'Completed', 1, 6, 4),
(2, 5, 'Move In', '2026-09-10', '2026-09-10', N'Bàn giao chìa khóa phụ và thẻ từ, kho sạch sẽ', 'Completed', 2, 7, 13);
SET IDENTITY_INSERT HandoverTask OFF;
GO

-- 14. UserActivityLog
SET IDENTITY_INSERT UserActivityLog ON;
INSERT INTO UserActivityLog (LogID, UserID, Action, IPAddress, [Timestamp], Details) VALUES
(1, 6, 'Created Reservation', '127.0.0.1', '2026-08-29 09:00:00', N'Khách hàng (UserID 6) tạo yêu cầu đặt kho F1-U04'),
(2, 1, 'Assigned Unit', '127.0.0.1', '2026-08-29 10:00:00', N'Quản lý cơ sở (UserID 1) xác nhận xếp kho cho yêu cầu #1'),
(3, 3, 'Completed Task', '127.0.0.1', '2026-09-01 10:30:00', N'Nhân viên (StaffID 1) hoàn tất bàn giao kho cho Khách hàng');
SET IDENTITY_INSERT UserActivityLog OFF;
GO
