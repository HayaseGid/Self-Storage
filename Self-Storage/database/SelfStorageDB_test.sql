-- ==============================================================
-- DATABASE RIENG DE TEST: SelfStorageDB_test  (phien ban 2)
-- Script nay CHI tao/xoa database SelfStorageDB_test.
-- Chay lai bat ky luc nao de reset DB test ve du lieu mau ban dau.
--
-- QUYET DINH THIET KE CHINH
--  1. Dat nhieu kho: khach chon (loai + size + so luong) -> ReservationItem.
--     He thong giu ngay kho cu the -> ReservationUnit (chan trung o tang DB).
--     Facility Manager co the doi sang kho khac cung loai/size
--     (danh dau dong cu 'Released', them dong moi).
--     Hop dong 1-1 voi Reservation => kho cua hop dong = ReservationUnit
--     (bo bang ContractUnit vi trung lap).
--  2. Trang thai:
--     Reservation    : Pending Payment -> Paid -> Confirmed -> Handed Over -> Completed
--                      (+ Cancelled, Expired)
--     ReservationUnit: Held -> Active -> Returned   (+ Released)
--     StorageUnit    : CHI tinh trang vat ly (Available, In Use, Pending Inspection,
--                      Maintenance, Inactive). Con trong theo ky thue -> fn_AvailableUnits.
--     Payment        : Pending -> Completed | Failed | Cancelled
--     Charge         : Unpaid -> Paid | Waived | Cancelled
--  3. Tien:
--     Coc = DepositMonths (mac dinh 2) x gia thue/thang SAU giam cua tung kho.
--     Moi khoan phai tra la 1 dong Charge (Deposit, Rent tung thang, LateFee...).
--     Payment = dong tien thuc te, tat toan nhieu Charge.
--     Doanh thu = Charge da Paid, KHONG tinh Deposit (coc la tien phai hoan).
--  4. Thanh toan van la gia lap (Provider = 'Simulator') nhung du cot
--     de chong ghi nhan 2 lan: OrderCode, IdempotencyKey, ProviderTransactionId,
--     PaymentCallbackLog.
--  5. Loi:
--     - Trigger THROW so 51xxx, message = 'KEY: thong bao tieng Viet'.
--     - Loi UNIQUE/FK/CHECK (2627, 2601, 547): tra bang AppErrorMessage theo ten constraint.
--  6. UnitType va UnitSize la danh muc chung; gan cho nhieu co so qua
--     FacilityUnitType / FacilityUnitSize (nhieu - nhieu). RentalRate chi tao
--     duoc cho (loai, size) da gan vao co so do.
--  7. Ai thay doi trang thai: app goi
--     EXEC sp_set_session_context N'UserID', @userId;  truoc khi SaveChanges.
-- ==============================================================

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = N'SelfStorageDB_test')
BEGIN
    ALTER DATABASE SelfStorageDB_test SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE SelfStorageDB_test;
END
GO

CREATE DATABASE SelfStorageDB_test;
GO

-- Bat buoc cho filtered index va computed column
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE SelfStorageDB_test;
GO


-- =============================================
-- 1. ROLE / USERS / XAC THUC EMAIL
-- =============================================

CREATE TABLE Role (
    RoleID INT IDENTITY(1,1) NOT NULL,
    RoleName NVARCHAR(50) NOT NULL,
    Description NVARCHAR(255) NULL,
    CONSTRAINT PK_Role PRIMARY KEY (RoleID),
    CONSTRAINT UX_Role_RoleName UNIQUE (RoleName)
);
GO

CREATE TABLE Users (
    UserID INT IDENTITY(1,1) NOT NULL,
    RoleID INT NOT NULL,
    -- Dang nhap bang Email. Username khong bat buoc (giu cho tai khoan noi bo).
    Username NVARCHAR(100) NULL,
    -- Chi chap nhan hash BCrypt (60 ky tu, dang $2a$/$2b$/$2y$)
    PasswordHash NVARCHAR(100) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    Email NVARCHAR(150) NOT NULL,
    EmailVerified BIT NOT NULL CONSTRAINT DF_Users_EmailVerified DEFAULT 0,
    PhoneNumber NVARCHAR(30) NULL,
    Status NVARCHAR(30) NOT NULL,
    FailedLoginCount TINYINT NOT NULL CONSTRAINT DF_Users_FailedLoginCount DEFAULT 0,
    LockoutEndAt DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL,

    CONSTRAINT PK_Users PRIMARY KEY (UserID),
    CONSTRAINT FK_Users_Role FOREIGN KEY (RoleID) REFERENCES Role(RoleID),
    CONSTRAINT CK_Users_Status
        CHECK (Status IN (N'Active', N'Pending Approval', N'Locked', N'Rejected', N'Inactive')),
    CONSTRAINT CK_Users_PasswordHash
        CHECK (LEN(PasswordHash) = 60 AND PasswordHash LIKE N'$2[aby]$[0-9][0-9]$%'),
    CONSTRAINT CK_Users_Email CHECK (Email LIKE N'_%@_%._%')
);
GO

CREATE UNIQUE INDEX UX_Users_Email ON Users(Email);
CREATE UNIQUE INDEX UX_Users_Username ON Users(Username) WHERE Username IS NOT NULL;
GO

-- Dang ky: xac thuc OTP TRUOC, tao Users SAU.
-- Thong tin dang ky nam tam o day; nguoi bo do khong chiem email trong Users.
CREATE TABLE PendingRegistration (
    PendingRegistrationID BIGINT IDENTITY(1,1) NOT NULL,
    Email NVARCHAR(150) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    PhoneNumber NVARCHAR(30) NULL,
    PasswordHash NVARCHAR(100) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_PendingRegistration_CreatedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt DATETIME2 NOT NULL,
    RequestedIPAddress NVARCHAR(50) NULL,

    CONSTRAINT PK_PendingRegistration PRIMARY KEY (PendingRegistrationID),
    CONSTRAINT UX_PendingRegistration_Email UNIQUE (Email),
    CONSTRAINT CK_PendingRegistration_PasswordHash
        CHECK (LEN(PasswordHash) = 60 AND PasswordHash LIKE N'$2[aby]$[0-9][0-9]$%'),
    CONSTRAINT CK_PendingRegistration_Expiry CHECK (ExpiresAt > CreatedAt)
);
GO

CREATE TABLE EmailVerificationCode (
    VerificationCodeID BIGINT IDENTITY(1,1) NOT NULL,
    UserID INT NULL,                         -- EmailChange / PasswordReset
    PendingRegistrationID BIGINT NULL,       -- Registration
    Email NVARCHAR(150) NOT NULL,
    Purpose NVARCHAR(30) NOT NULL,
    CodeHash BINARY(32) NOT NULL,            -- SHA-256 cua OTP, khong luu OTP tho
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_EmailVerificationCode_CreatedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt DATETIME2 NOT NULL,
    FailedAttempts TINYINT NOT NULL CONSTRAINT DF_EmailVerificationCode_FailedAttempts DEFAULT 0,
    MaxAttempts TINYINT NOT NULL CONSTRAINT DF_EmailVerificationCode_MaxAttempts DEFAULT 5,
    -- Ma bi dong khi: xac thuc xong / gui ma moi / het han / sai qua so lan
    ClosedAt DATETIME2 NULL,
    CloseReason NVARCHAR(20) NULL,
    RequestedIPAddress NVARCHAR(50) NULL,

    CONSTRAINT PK_EmailVerificationCode PRIMARY KEY (VerificationCodeID),
    CONSTRAINT FK_EmailVerificationCode_User
        FOREIGN KEY (UserID) REFERENCES Users(UserID),
    CONSTRAINT FK_EmailVerificationCode_PendingRegistration
        FOREIGN KEY (PendingRegistrationID) REFERENCES PendingRegistration(PendingRegistrationID)
        ON DELETE SET NULL,
    CONSTRAINT CK_EmailVerificationCode_Purpose
        CHECK (Purpose IN (N'Registration', N'EmailChange', N'PasswordReset')),
    CONSTRAINT CK_EmailVerificationCode_Attempts
        CHECK (MaxAttempts BETWEEN 1 AND 10 AND FailedAttempts <= MaxAttempts),
    CONSTRAINT CK_EmailVerificationCode_Expiry CHECK (ExpiresAt > CreatedAt),
    CONSTRAINT CK_EmailVerificationCode_Closed
        CHECK ((ClosedAt IS NULL AND CloseReason IS NULL) OR
               (ClosedAt IS NOT NULL AND CloseReason IN (N'Verified', N'Replaced', N'Expired', N'TooManyAttempts')))
);
GO

-- Moi email + muc dich chi co 1 ma OTP dang mo
CREATE UNIQUE INDEX UX_EmailVerificationCode_Open
    ON EmailVerificationCode (Email, Purpose)
    WHERE ClosedAt IS NULL;
GO

CREATE TABLE UserActivityLog (
    LogID INT IDENTITY(1,1) NOT NULL,
    UserID INT NOT NULL,
    Action NVARCHAR(100) NOT NULL,           -- 'Login', 'Login Failed', 'Logout', ...
    IPAddress NVARCHAR(50) NULL,
    [Timestamp] DATETIME2 NOT NULL CONSTRAINT DF_UserActivityLog_Timestamp DEFAULT SYSUTCDATETIME(),
    Details NVARCHAR(500) NULL,

    CONSTRAINT PK_UserActivityLog PRIMARY KEY (LogID),
    CONSTRAINT FK_UserActivityLog_Users FOREIGN KEY (UserID) REFERENCES Users(UserID)
);
GO

CREATE INDEX IX_UserActivityLog_User_Action ON UserActivityLog (UserID, Action, [Timestamp] DESC);
GO


-- =============================================
-- 2. BANG THONG BAO LOI (cho popup FE)
-- ErrorKey = ten constraint/index. Backend bat SqlException 2627/2601/547,
-- lay ten constraint trong message roi tra MessageVi.
-- Loi trigger (51xxx) da co san tieng Viet trong message.
-- =============================================

CREATE TABLE AppErrorMessage (
    ErrorKey NVARCHAR(128) NOT NULL,
    HttpStatus SMALLINT NOT NULL CONSTRAINT DF_AppErrorMessage_HttpStatus DEFAULT 400,
    MessageVi NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_AppErrorMessage PRIMARY KEY (ErrorKey)
);
GO


-- =============================================
-- 3. FACILITY + CHINH SACH
-- =============================================

CREATE TABLE Facility (
    FacilityID INT IDENTITY(1,1) NOT NULL,
    ManagerID INT NOT NULL,                  -- 1 manager quan ly duoc nhieu co so
    FacilityName NVARCHAR(150) NOT NULL,
    UnitCodePrefix NVARCHAR(10) NOT NULL,    -- UnitNumber phai bat dau bang '<Prefix>-'
    -- Dia chi tach cot de loc theo khu vuc.
    -- Tu 01/07/2025 VN bo cap quan/huyen; District giu lai lam "khu vuc" de loc.
    StreetAddress NVARCHAR(255) NOT NULL,
    Ward NVARCHAR(100) NOT NULL,
    District NVARCHAR(100) NULL,
    City NVARCHAR(100) NOT NULL CONSTRAINT DF_Facility_City DEFAULT N'TP. Hồ Chí Minh',
    Latitude DECIMAL(9,6) NULL,
    Longitude DECIMAL(9,6) NULL,
    ContactPhone NVARCHAR(30) NULL,
    OpeningHours NVARCHAR(100) NULL,         -- vd: '07:00 - 21:00 hằng ngày'
    Description NVARCHAR(1000) NULL,
    ImageUrl NVARCHAR(500) NULL,
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_Facility_Status DEFAULT N'Active',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Facility_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL,
    UpdatedByUserID INT NULL,

    CONSTRAINT PK_Facility PRIMARY KEY (FacilityID),
    CONSTRAINT UX_Facility_UnitCodePrefix UNIQUE (UnitCodePrefix),
    CONSTRAINT UX_Facility_FacilityName UNIQUE (FacilityName),
    CONSTRAINT CK_Facility_Status CHECK (Status IN (N'Active', N'Inactive')),
    CONSTRAINT CK_Facility_UnitCodePrefix
        CHECK (LEN(UnitCodePrefix) BETWEEN 1 AND 10 AND UnitCodePrefix NOT LIKE N'%[^A-Z0-9]%'),
    CONSTRAINT CK_Facility_Coordinates
        CHECK ((Latitude IS NULL AND Longitude IS NULL) OR
               (Latitude BETWEEN -90 AND 90 AND Longitude BETWEEN -180 AND 180)),
    CONSTRAINT FK_Facility_Manager FOREIGN KEY (ManagerID) REFERENCES Users(UserID),
    CONSTRAINT FK_Facility_UpdatedBy FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID)
);
GO

CREATE INDEX IX_Facility_Area ON Facility (City, District, Ward) INCLUDE (Status);
GO

-- 4 size chuan do Business Operations Manager (BOM) dieu chinh.
-- Chieu cao co dinh theo nhom: Small/Medium/Large 2.5m, Vehicle 3.5m.
CREATE TABLE SizeCategory (
    SizeCategoryID INT IDENTITY(1,1) NOT NULL,
    CategoryCode NVARCHAR(20) NOT NULL,      -- SMALL, MEDIUM, LARGE, VEHICLE
    CategoryName NVARCHAR(50) NOT NULL,
    CodePrefix NCHAR(1) NOT NULL,            -- S, M, L, V : SizeCode phai bat dau bang ky tu nay
    StandardHeightM DECIMAL(5,2) NOT NULL,
    MinVolumeM3 DECIMAL(10,2) NOT NULL,
    MaxVolumeM3 DECIMAL(10,2) NOT NULL,
    MinMonthlyPrice DECIMAL(12,2) NOT NULL,  -- khung gia general
    MaxMonthlyPrice DECIMAL(12,2) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SizeCategory_IsActive DEFAULT 1,
    UpdatedAt DATETIME2 NULL,
    UpdatedByUserID INT NULL,

    CONSTRAINT PK_SizeCategory PRIMARY KEY (SizeCategoryID),
    CONSTRAINT UX_SizeCategory_Code UNIQUE (CategoryCode),
    CONSTRAINT UX_SizeCategory_Name UNIQUE (CategoryName),
    CONSTRAINT UX_SizeCategory_CodePrefix UNIQUE (CodePrefix),
    CONSTRAINT CK_SizeCategory_Height CHECK (StandardHeightM > 0 AND StandardHeightM <= 10),
    CONSTRAINT CK_SizeCategory_VolumeRange CHECK (MinVolumeM3 > 0 AND MaxVolumeM3 >= MinVolumeM3),
    CONSTRAINT CK_SizeCategory_PriceRange CHECK (MinMonthlyPrice > 0 AND MaxMonthlyPrice >= MinMonthlyPrice),
    CONSTRAINT FK_SizeCategory_UpdatedBy FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID)
);
GO

-- FacilityID NULL = chinh sach chung cua he thong (BOM dat).
-- Moi co so moi duoc trigger tu dong chep chinh sach chung.
-- UNIQUE tren cot cho phep dung 1 gia tri NULL => chi co 1 chinh sach chung.
CREATE TABLE RentalPolicy (
    RentalPolicyID INT IDENTITY(1,1) NOT NULL,
    FacilityID INT NULL,
    -- Tien coc = DepositMonths x tien thue 1 thang (sau giam gia) cua hop dong
    DepositMonths TINYINT NOT NULL CONSTRAINT DF_RentalPolicy_DepositMonths DEFAULT 2,
    -- So phut giu kho cho khach thanh toan
    HoldMinutes INT NOT NULL CONSTRAINT DF_RentalPolicy_HoldMinutes DEFAULT 15,
    LateFeePerDay DECIMAL(12,2) NOT NULL CONSTRAINT DF_RentalPolicy_LateFeePerDay DEFAULT 0,
    GracePeriodDays INT NOT NULL CONSTRAINT DF_RentalPolicy_GracePeriodDays DEFAULT 3,
    RenewalNoticeDays INT NOT NULL CONSTRAINT DF_RentalPolicy_RenewalNoticeDays DEFAULT 30,
    UpdatedAt DATETIME2 NULL,
    UpdatedByUserID INT NULL,

    CONSTRAINT PK_RentalPolicy PRIMARY KEY (RentalPolicyID),
    CONSTRAINT UX_RentalPolicy_Facility UNIQUE (FacilityID),
    CONSTRAINT CK_RentalPolicy_DepositMonths CHECK (DepositMonths BETWEEN 1 AND 2),
    CONSTRAINT CK_RentalPolicy_HoldMinutes CHECK (HoldMinutes BETWEEN 1 AND 60),
    CONSTRAINT CK_RentalPolicy_LateFee CHECK (LateFeePerDay >= 0),
    CONSTRAINT CK_RentalPolicy_Days CHECK (GracePeriodDays >= 0 AND RenewalNoticeDays >= 0),
    CONSTRAINT FK_RentalPolicy_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_RentalPolicy_UpdatedBy FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID)
);
GO

-- Huy truoc StartDate >= DaysBeforeStart ngay -> hoan RefundPercent.
-- Ap dung dong co DaysBeforeStart lon nhat ma van thoa.
CREATE TABLE CancellationRule (
    CancellationRuleID INT IDENTITY(1,1) NOT NULL,
    RentalPolicyID INT NOT NULL,
    DaysBeforeStart INT NOT NULL,
    RefundPercent DECIMAL(5,2) NOT NULL,

    CONSTRAINT PK_CancellationRule PRIMARY KEY (CancellationRuleID),
    CONSTRAINT UX_CancellationRule_Policy_Days UNIQUE (RentalPolicyID, DaysBeforeStart),
    CONSTRAINT CK_CancellationRule_Values
        CHECK (DaysBeforeStart >= 0 AND RefundPercent >= 0 AND RefundPercent <= 100),
    CONSTRAINT FK_CancellationRule_Policy
        FOREIGN KEY (RentalPolicyID) REFERENCES RentalPolicy(RentalPolicyID) ON DELETE CASCADE
);
GO

CREATE TABLE FacilityStaff (
    AssignmentID INT IDENTITY(1,1) NOT NULL,
    FacilityID INT NOT NULL,
    UserID INT NOT NULL,
    AssignedDate DATE NOT NULL,
    Status NVARCHAR(30) NOT NULL,

    CONSTRAINT PK_FacilityStaff PRIMARY KEY (AssignmentID),
    CONSTRAINT UX_FacilityStaff_Facility_User UNIQUE (FacilityID, UserID),
    CONSTRAINT CK_FacilityStaff_Status CHECK (Status IN (N'Active', N'Inactive')),
    CONSTRAINT FK_FacilityStaff_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_FacilityStaff_User FOREIGN KEY (UserID) REFERENCES Users(UserID)
);
GO


-- =============================================
-- 4. DANH MUC KHO: UnitType, UnitSize, RentalRate, StorageUnit
-- =============================================

-- Danh muc loai kho chung cua he thong.
-- 1 loai kho dung duoc o NHIEU co so: xem bang FacilityUnitType.
CREATE TABLE UnitType (
    UnitTypeID INT IDENTITY(1,1) NOT NULL,
    TypeName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    ImageUrl NVARCHAR(500) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_UnitType_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UnitType_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedByUserID INT NULL,

    CONSTRAINT PK_UnitType PRIMARY KEY (UnitTypeID),
    CONSTRAINT UX_UnitType_TypeName UNIQUE (TypeName),
    CONSTRAINT FK_UnitType_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID)
);
GO

-- Danh muc size chung cua he thong (S1, S2, ..., va size do Facility Manager tao them nhu S4).
-- Moi size phai nam trong 1 trong 4 SizeCategory (the tich + chieu cao).
-- 1 size dung duoc o NHIEU co so: xem bang FacilityUnitSize.
CREATE TABLE UnitSize (
    UnitSizeID INT IDENTITY(1,1) NOT NULL,
    SizeCategoryID INT NOT NULL,
    SizeCode NVARCHAR(10) NOT NULL,          -- S1, S2, M1, ... (bat dau bang SizeCategory.CodePrefix)
    DisplayName NVARCHAR(100) NOT NULL,      -- ten hien thi cho khach, vd 'Tủ nhỏ 1.5 x 1.5 m'
    WidthM DECIMAL(7,2) NOT NULL,
    LengthM DECIMAL(7,2) NOT NULL,
    HeightM DECIMAL(7,2) NOT NULL,           -- phai bang SizeCategory.StandardHeightM
    AreaM2 AS CAST(WidthM * LengthM AS DECIMAL(9,2)) PERSISTED,
    VolumeM3 AS CAST(WidthM * LengthM * HeightM AS DECIMAL(10,2)) PERSISTED,
    IsActive BIT NOT NULL CONSTRAINT DF_UnitSize_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_UnitSize_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedByUserID INT NULL,

    CONSTRAINT PK_UnitSize PRIMARY KEY (UnitSizeID),
    CONSTRAINT UX_UnitSize_SizeCode UNIQUE (SizeCode),
    CONSTRAINT FK_UnitSize_SizeCategory FOREIGN KEY (SizeCategoryID) REFERENCES SizeCategory(SizeCategoryID),
    CONSTRAINT FK_UnitSize_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_UnitSize_Dimensions CHECK (
        WidthM BETWEEN 0.10 AND 50 AND LengthM BETWEEN 0.10 AND 50 AND HeightM BETWEEN 0.10 AND 10),
    CONSTRAINT CK_UnitSize_Text CHECK (
        LEN(LTRIM(RTRIM(DisplayName))) > 0 AND LEN(LTRIM(RTRIM(SizeCode))) > 0)
);
GO

-- Co so nao dung loai kho nao (nhieu - nhieu)
CREATE TABLE FacilityUnitType (
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_FacilityUnitType_IsActive DEFAULT 1,
    AddedAt DATETIME2 NOT NULL CONSTRAINT DF_FacilityUnitType_AddedAt DEFAULT SYSUTCDATETIME(),
    AddedByUserID INT NULL,

    CONSTRAINT PK_FacilityUnitType PRIMARY KEY (FacilityID, UnitTypeID),
    CONSTRAINT FK_FacilityUnitType_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_FacilityUnitType_UnitType FOREIGN KEY (UnitTypeID) REFERENCES UnitType(UnitTypeID),
    CONSTRAINT FK_FacilityUnitType_AddedBy FOREIGN KEY (AddedByUserID) REFERENCES Users(UserID)
);
GO

CREATE INDEX IX_FacilityUnitType_UnitType ON FacilityUnitType (UnitTypeID);
GO

-- Co so nao dung size nao (nhieu - nhieu)
CREATE TABLE FacilityUnitSize (
    FacilityID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_FacilityUnitSize_IsActive DEFAULT 1,
    AddedAt DATETIME2 NOT NULL CONSTRAINT DF_FacilityUnitSize_AddedAt DEFAULT SYSUTCDATETIME(),
    AddedByUserID INT NULL,

    CONSTRAINT PK_FacilityUnitSize PRIMARY KEY (FacilityID, UnitSizeID),
    CONSTRAINT FK_FacilityUnitSize_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_FacilityUnitSize_UnitSize FOREIGN KEY (UnitSizeID) REFERENCES UnitSize(UnitSizeID),
    CONSTRAINT FK_FacilityUnitSize_AddedBy FOREIGN KEY (AddedByUserID) REFERENCES Users(UserID)
);
GO

CREATE INDEX IX_FacilityUnitSize_UnitSize ON FacilityUnitSize (UnitSizeID);
GO

-- Khung phi phu / phi tre / giam gia / mien phi do BOM dat
CREATE TABLE FeePolicy (
    FeePolicyID INT IDENTITY(1,1) NOT NULL,
    FeeCode NVARCHAR(30) NOT NULL,
    FeeName NVARCHAR(100) NOT NULL,
    FeeCategory NVARCHAR(20) NOT NULL,
    ValueType NVARCHAR(20) NOT NULL,
    MinValue DECIMAL(12,2) NOT NULL,
    MaxValue DECIMAL(12,2) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_FeePolicy_IsActive DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_FeePolicy_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_FeePolicy_UpdatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_FeePolicy PRIMARY KEY (FeePolicyID),
    CONSTRAINT UX_FeePolicy_FeeCode UNIQUE (FeeCode),
    CONSTRAINT CK_FeePolicy_Category CHECK (
        FeeCategory IN (N'ExtraFee', N'LateFee', N'Discount', N'FeeWaiver')),
    CONSTRAINT CK_FeePolicy_ValueType CHECK (ValueType IN (N'Amount', N'Percentage')),
    CONSTRAINT CK_FeePolicy_Range CHECK (
        MinValue >= 0 AND MaxValue >= MinValue AND
        (ValueType <> N'Percentage' OR MaxValue <= 100))
);
GO

-- NGUON GIA DUY NHAT: gia thue/thang theo (co so, loai, size).
-- StorageUnit khong luu gia nua.
CREATE TABLE RentalRate (
    RentalRateID INT IDENTITY(1,1) NOT NULL,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    MonthlyPrice DECIMAL(12,2) NOT NULL,
    UpdatedAt DATETIME2 NULL,
    UpdatedByUserID INT NULL,

    CONSTRAINT PK_RentalRate PRIMARY KEY (RentalRateID),
    CONSTRAINT UQ_RentalRate_Facility_Type_Size UNIQUE (FacilityID, UnitTypeID, UnitSizeID),
    CONSTRAINT CK_RentalRate_MonthlyPrice CHECK (MonthlyPrice > 0),
    CONSTRAINT FK_RentalRate_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_RentalRate_UnitType FOREIGN KEY (UnitTypeID) REFERENCES UnitType(UnitTypeID),
    CONSTRAINT FK_RentalRate_UnitSize FOREIGN KEY (UnitSizeID) REFERENCES UnitSize(UnitSizeID),
    -- Chi dat gia cho loai / size da duoc gan vao co so do
    CONSTRAINT FK_RentalRate_FacilityUnitType
        FOREIGN KEY (FacilityID, UnitTypeID) REFERENCES FacilityUnitType(FacilityID, UnitTypeID),
    CONSTRAINT FK_RentalRate_FacilityUnitSize
        FOREIGN KEY (FacilityID, UnitSizeID) REFERENCES FacilityUnitSize(FacilityID, UnitSizeID),
    CONSTRAINT FK_RentalRate_UpdatedBy FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID)
);
GO

CREATE TABLE StorageUnit (
    UnitID INT IDENTITY(1,1) NOT NULL,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    UnitNumber NVARCHAR(50) NOT NULL,        -- vd Q1-U01 (phai bat dau bang Facility.UnitCodePrefix + '-')
    Floor NVARCHAR(20) NULL,                 -- vd 'Tầng 1', 'Ngoài trời'
    Zone NVARCHAR(20) NULL,                  -- vd 'Dãy A'
    LocationNote NVARCHAR(200) NULL,
    -- CHI tinh trang vat ly; con trong theo ky thue tinh bang fn_AvailableUnits
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_StorageUnit_Status DEFAULT N'Available',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_StorageUnit_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NULL,
    UpdatedByUserID INT NULL,

    CONSTRAINT PK_StorageUnit PRIMARY KEY (UnitID),
    CONSTRAINT FK_StorageUnit_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_StorageUnit_UnitType FOREIGN KEY (UnitTypeID) REFERENCES UnitType(UnitTypeID),
    CONSTRAINT FK_StorageUnit_UnitSize FOREIGN KEY (UnitSizeID) REFERENCES UnitSize(UnitSizeID),
    -- Kho chi tao duoc khi da co gia cho (co so, loai, size) do
    CONSTRAINT FK_StorageUnit_RentalRate
        FOREIGN KEY (FacilityID, UnitTypeID, UnitSizeID)
        REFERENCES RentalRate(FacilityID, UnitTypeID, UnitSizeID),
    CONSTRAINT FK_StorageUnit_UpdatedBy FOREIGN KEY (UpdatedByUserID) REFERENCES Users(UserID),
    CONSTRAINT UX_StorageUnit_Facility_UnitNumber UNIQUE (FacilityID, UnitNumber),
    -- 'Pending Inspection': khach vua tra, cho nhan vien kiem tra
    -- 'Maintenance'       : hong / dang sua, khong cho thue
    CONSTRAINT CK_StorageUnit_Status CHECK (Status IN
        (N'Available', N'In Use', N'Pending Inspection', N'Maintenance', N'Inactive'))
);
GO

CREATE UNIQUE INDEX UX_StorageUnit_Facility_Unit ON StorageUnit (FacilityID, UnitID);
CREATE UNIQUE INDEX UX_StorageUnit_Facility_Unit_Type_Size ON StorageUnit (FacilityID, UnitID, UnitTypeID, UnitSizeID);
CREATE INDEX IX_StorageUnit_Search ON StorageUnit (FacilityID, UnitTypeID, UnitSizeID, Status);
GO


-- =============================================
-- 5. KY HAN THUE (chi 1, 3, 6, 12 thang)
-- =============================================

CREATE TABLE ContractType (
    ContractTypeID INT IDENTITY(1,1) NOT NULL,
    TypeName NVARCHAR(100) NOT NULL,
    RentalMonths INT NOT NULL,
    DiscountRate DECIMAL(5,2) NOT NULL CONSTRAINT DF_ContractType_DiscountRate DEFAULT 0,
    IsActive BIT NOT NULL CONSTRAINT DF_ContractType_IsActive DEFAULT 1,

    CONSTRAINT PK_ContractType PRIMARY KEY (ContractTypeID),
    CONSTRAINT UX_ContractType_TypeName UNIQUE (TypeName),
    CONSTRAINT UX_ContractType_RentalMonths UNIQUE (RentalMonths),
    CONSTRAINT CK_ContractType_RentalMonths CHECK (RentalMonths IN (1, 3, 6, 12)),
    CONSTRAINT CK_ContractType_Discount CHECK (DiscountRate >= 0 AND DiscountRate <= 100)
);
GO


-- =============================================
-- 6. DAT KHO: Reservation -> ReservationItem -> ReservationUnit
-- =============================================

CREATE TABLE Reservation (
    ReservationID INT IDENTITY(1,1) NOT NULL,
    ReservationCode NVARCHAR(20) NOT NULL,   -- ma hien thi, vd RS-2026-00001
    -- Ma QR gui cho khach, nhan vien quet khi khach den nhan kho
    CheckInToken UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_Reservation_CheckInToken DEFAULT NEWID(),
    CustomerID INT NOT NULL,
    FacilityID INT NOT NULL,
    StartDate DATE NOT NULL,
    RentalPeriod INT NOT NULL,               -- so thang: 1, 3, 6, 12 (FK -> ContractType)
    EndDate DATE NOT NULL,                   -- ngay cuoi cung duoc dung kho (tinh ca ngay nay)
    DepositMonths TINYINT NOT NULL,          -- snapshot chinh sach coc luc dat
    HoldExpiresAt DATETIME2 NOT NULL,        -- het han giu kho neu chua thanh toan
    AppointmentDate DATE NULL,               -- lich hen nhan kho
    AppointmentTime TIME(0) NULL,
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_Reservation_Status DEFAULT N'Pending Payment',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Reservation_CreatedAt DEFAULT SYSUTCDATETIME(),
    PaidAt DATETIME2 NULL,
    ConfirmedAt DATETIME2 NULL,
    ConfirmedByUserID INT NULL,
    CancelledAt DATETIME2 NULL,
    CancelledByUserID INT NULL,
    CancelReason NVARCHAR(500) NULL,
    CompletedAt DATETIME2 NULL,

    CONSTRAINT PK_Reservation PRIMARY KEY (ReservationID),
    CONSTRAINT UX_Reservation_Code UNIQUE (ReservationCode),
    CONSTRAINT UX_Reservation_CheckInToken UNIQUE (CheckInToken),
    CONSTRAINT FK_Reservation_Customer FOREIGN KEY (CustomerID) REFERENCES Users(UserID),
    CONSTRAINT FK_Reservation_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    CONSTRAINT FK_Reservation_ContractType
        FOREIGN KEY (RentalPeriod) REFERENCES ContractType(RentalMonths),
    CONSTRAINT FK_Reservation_ConfirmedBy FOREIGN KEY (ConfirmedByUserID) REFERENCES Users(UserID),
    CONSTRAINT FK_Reservation_CancelledBy FOREIGN KEY (CancelledByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_Reservation_RentalPeriod CHECK (RentalPeriod IN (1, 3, 6, 12)),
    -- EndDate tinh dung theo so thang: 01/09 + 3 thang -> 30/11
    CONSTRAINT CK_Reservation_EndDate
        CHECK (EndDate = DATEADD(DAY, -1, DATEADD(MONTH, RentalPeriod, StartDate))),
    CONSTRAINT CK_Reservation_DepositMonths CHECK (DepositMonths BETWEEN 1 AND 2),
    CONSTRAINT CK_Reservation_Hold CHECK (HoldExpiresAt > CreatedAt),
    CONSTRAINT CK_Reservation_Appointment
        CHECK (AppointmentDate IS NULL OR AppointmentDate BETWEEN StartDate AND EndDate),
    CONSTRAINT CK_Reservation_Status CHECK (Status IN
        (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over', N'Completed', N'Cancelled', N'Expired')),
    CONSTRAINT CK_Reservation_Cancel CHECK (
        (Status = N'Cancelled' AND CancelledAt IS NOT NULL) OR
        (Status <> N'Cancelled' AND CancelledAt IS NULL)),
    CONSTRAINT CK_Reservation_Completed CHECK (
        (Status = N'Completed' AND CompletedAt IS NOT NULL) OR
        (Status <> N'Completed' AND CompletedAt IS NULL))
);
GO

CREATE UNIQUE INDEX UX_Reservation_ID_Facility ON Reservation (ReservationID, FacilityID);
CREATE UNIQUE INDEX UX_Reservation_ID_Dates ON Reservation (ReservationID, StartDate, EndDate);
CREATE INDEX IX_Reservation_Customer ON Reservation (CustomerID, Status);
CREATE INDEX IX_Reservation_Facility_Status ON Reservation (FacilityID, Status, StartDate);
GO

-- Khach yeu cau gi: (loai, size, so luong) + gia snapshot luc dat
CREATE TABLE ReservationItem (
    ReservationItemID BIGINT IDENTITY(1,1) NOT NULL,
    ReservationID INT NOT NULL,
    FacilityID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    Quantity TINYINT NOT NULL,
    MonthlyPrice DECIMAL(12,2) NOT NULL,     -- gia niem yet luc dat (RentalRate)
    DiscountPercent DECIMAL(5,2) NOT NULL CONSTRAINT DF_ReservationItem_DiscountPercent DEFAULT 0,
    -- Gia thue thuc te / thang / 1 kho (sau giam). Coc va tien thue deu tinh tu cot nay.
    EffectiveMonthlyPrice AS CAST(ROUND(MonthlyPrice * (100 - DiscountPercent) / 100, 0) AS DECIMAL(12,2)) PERSISTED,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReservationItem_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_ReservationItem PRIMARY KEY (ReservationItemID),
    CONSTRAINT UX_ReservationItem_Reservation_Type_Size UNIQUE (ReservationID, UnitTypeID, UnitSizeID),
    CONSTRAINT FK_ReservationItem_Reservation
        FOREIGN KEY (ReservationID, FacilityID) REFERENCES Reservation(ReservationID, FacilityID),
    -- Chi dat duoc (loai, size) co gia tai dung co so do
    CONSTRAINT FK_ReservationItem_RentalRate
        FOREIGN KEY (FacilityID, UnitTypeID, UnitSizeID)
        REFERENCES RentalRate(FacilityID, UnitTypeID, UnitSizeID),
    CONSTRAINT CK_ReservationItem_Quantity CHECK (Quantity BETWEEN 1 AND 20),
    CONSTRAINT CK_ReservationItem_Money CHECK (MonthlyPrice > 0 AND DiscountPercent BETWEEN 0 AND 100)
);
GO

CREATE UNIQUE INDEX UX_ReservationItem_Key
    ON ReservationItem (ReservationItemID, ReservationID, FacilityID, UnitTypeID, UnitSizeID);
GO

-- Kho cu the duoc giu / ban giao cho tung dong ReservationItem
CREATE TABLE ReservationUnit (
    ReservationUnitID BIGINT IDENTITY(1,1) NOT NULL,
    ReservationID INT NOT NULL,
    ReservationItemID BIGINT NOT NULL,
    FacilityID INT NOT NULL,
    UnitID INT NOT NULL,
    UnitTypeID INT NOT NULL,
    UnitSizeID INT NOT NULL,
    -- Held: dang giu | Active: da ban giao | Returned: khach da tra | Released: huy / doi kho / het han
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ReservationUnit_Status DEFAULT N'Held',
    AssignedAt DATETIME2 NOT NULL CONSTRAINT DF_ReservationUnit_AssignedAt DEFAULT SYSUTCDATETIME(),
    AssignedByUserID INT NULL,               -- NULL = he thong tu giu luc dat
    HandedOverAt DATETIME2 NULL,
    ReturnedOn DATE NULL,                    -- ngay khach tra kho thuc te
    ReleasedAt DATETIME2 NULL,

    CONSTRAINT PK_ReservationUnit PRIMARY KEY (ReservationUnitID),
    CONSTRAINT UX_ReservationUnit_ID_Reservation UNIQUE (ReservationUnitID, ReservationID),
    CONSTRAINT UX_ReservationUnit_ID_Reservation_Unit UNIQUE (ReservationUnitID, ReservationID, UnitID),
    CONSTRAINT FK_ReservationUnit_ReservationItem
        FOREIGN KEY (ReservationItemID, ReservationID, FacilityID, UnitTypeID, UnitSizeID)
        REFERENCES ReservationItem(ReservationItemID, ReservationID, FacilityID, UnitTypeID, UnitSizeID),
    -- Kho phai cung co so, cung loai, cung size voi dong yeu cau
    CONSTRAINT FK_ReservationUnit_StorageUnit
        FOREIGN KEY (FacilityID, UnitID, UnitTypeID, UnitSizeID)
        REFERENCES StorageUnit(FacilityID, UnitID, UnitTypeID, UnitSizeID),
    CONSTRAINT FK_ReservationUnit_AssignedBy FOREIGN KEY (AssignedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_ReservationUnit_Status CHECK (Status IN (N'Held', N'Active', N'Returned', N'Released')),
    CONSTRAINT CK_ReservationUnit_Dates CHECK (
        (Status <> N'Active'   OR HandedOverAt IS NOT NULL) AND
        (Status <> N'Returned' OR (HandedOverAt IS NOT NULL AND ReturnedOn IS NOT NULL)) AND
        (Status <> N'Released' OR ReleasedAt IS NOT NULL))
);
GO

-- 1 don khong giu cung 1 kho 2 lan (tru dong da Released)
CREATE UNIQUE INDEX UX_ReservationUnit_Reservation_Unit
    ON ReservationUnit (ReservationID, UnitID) WHERE Status <> N'Released';
CREATE INDEX IX_ReservationUnit_Unit ON ReservationUnit (UnitID) INCLUDE (Status, ReservationID);
CREATE INDEX IX_ReservationUnit_Item ON ReservationUnit (ReservationItemID) INCLUDE (Status);
GO


-- =============================================
-- 7. HOP DONG (1-1 voi Reservation)
-- =============================================

CREATE TABLE Contract (
    ContractID INT IDENTITY(1,1) NOT NULL,
    ContractNumber NVARCHAR(30) NOT NULL,    -- vd HD-2026-00001
    ReservationID INT NOT NULL,
    StartDate DATE NOT NULL,                 -- bat buoc trung voi Reservation (FK 3 cot)
    EndDate DATE NOT NULL,
    ActualEndDate DATE NULL,                 -- ngay tra kho cuoi cung
    ContractStatus NVARCHAR(30) NOT NULL CONSTRAINT DF_Contract_Status DEFAULT N'Active',
    RenewedFromContractID INT NULL,          -- chuoi gia han (Flow 6)
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Contract_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedByUserID INT NULL,

    CONSTRAINT PK_Contract PRIMARY KEY (ContractID),
    CONSTRAINT UX_Contract_ContractNumber UNIQUE (ContractNumber),
    CONSTRAINT UX_Contract_Reservation UNIQUE (ReservationID),
    CONSTRAINT FK_Contract_Reservation
        FOREIGN KEY (ReservationID, StartDate, EndDate)
        REFERENCES Reservation(ReservationID, StartDate, EndDate),
    CONSTRAINT FK_Contract_RenewedFrom FOREIGN KEY (RenewedFromContractID) REFERENCES Contract(ContractID),
    CONSTRAINT FK_Contract_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_Contract_RenewedFrom CHECK (RenewedFromContractID IS NULL OR RenewedFromContractID <> ContractID),
    CONSTRAINT CK_Contract_ActualEndDate CHECK (ActualEndDate IS NULL OR ActualEndDate >= StartDate),
    CONSTRAINT CK_Contract_Status CHECK (ContractStatus IN
        (N'Active', N'Expiring Soon', N'Renewed', N'Overdue', N'Completed', N'Terminated'))
);
GO

CREATE TABLE ContractSignature (
    ContractID INT NOT NULL,
    UserID INT NOT NULL,
    SignerName NVARCHAR(100) NOT NULL,
    SignatureImage NVARCHAR(MAX) NOT NULL,
    TermsVersion NVARCHAR(50) NOT NULL,
    SignedAt DATETIMEOFFSET NOT NULL,

    CONSTRAINT PK_ContractSignature PRIMARY KEY (ContractID),
    CONSTRAINT FK_ContractSignature_Contract FOREIGN KEY (ContractID) REFERENCES Contract(ContractID),
    CONSTRAINT FK_ContractSignature_User FOREIGN KEY (UserID) REFERENCES Users(UserID)
);
GO


-- =============================================
-- 8. THANH TOAN (gia lap) + CAC KHOAN PHAI TRA
-- =============================================

-- Payment = 1 lan tien vao (Collection) hoac tien ra (Refund).
CREATE TABLE Payment (
    PaymentID INT IDENTITY(1,1) NOT NULL,
    ReservationID INT NOT NULL,
    OrderCode NVARCHAR(50) NOT NULL,         -- ma don do he thong sinh (dung tao QR)
    IdempotencyKey NVARCHAR(100) NOT NULL,   -- bam "Thanh toan" nhieu lan van chi 1 Payment
    Provider NVARCHAR(30) NOT NULL CONSTRAINT DF_Payment_Provider DEFAULT N'Simulator',
    ProviderTransactionId NVARCHAR(100) NULL,-- ma giao dich cong tra ve; chi ghi nhan 1 lan
    Direction NVARCHAR(20) NOT NULL CONSTRAINT DF_Payment_Direction DEFAULT N'Collection',
    RefundReason NVARCHAR(20) NULL,
    RefundOfPaymentID INT NULL,
    Amount DECIMAL(12,2) NOT NULL,           -- so tien phai thu / phai hoan
    ReceivedAmount DECIMAL(12,2) NULL,       -- so tien cong bao thuc nhan
    PaymentMethod NVARCHAR(50) NULL,         -- QR, Bank Transfer, Cash, ...
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Payment_Status DEFAULT N'Pending',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Payment_CreatedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt DATETIME2 NULL,                -- han cua ma QR
    ConfirmedAt DATETIME2 NULL,
    CreatedByUserID INT NULL,

    CONSTRAINT PK_Payment PRIMARY KEY (PaymentID),
    CONSTRAINT UX_Payment_OrderCode UNIQUE (OrderCode),
    CONSTRAINT UX_Payment_IdempotencyKey UNIQUE (IdempotencyKey),
    CONSTRAINT FK_Payment_Reservation FOREIGN KEY (ReservationID) REFERENCES Reservation(ReservationID),
    CONSTRAINT FK_Payment_RefundOf FOREIGN KEY (RefundOfPaymentID) REFERENCES Payment(PaymentID),
    CONSTRAINT FK_Payment_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_Payment_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payment_Direction CHECK (
        (Direction = N'Collection' AND RefundReason IS NULL AND RefundOfPaymentID IS NULL) OR
        (Direction = N'Refund' AND RefundReason IN (N'Cancellation', N'DepositReturn', N'Overpayment') AND
         (RefundReason <> N'Overpayment' OR RefundOfPaymentID IS NOT NULL))),
    CONSTRAINT CK_Payment_Status CHECK (Status IN (N'Pending', N'Completed', N'Failed', N'Cancelled')),
    CONSTRAINT CK_Payment_Completed CHECK (
        Status <> N'Completed' OR
        (ConfirmedAt IS NOT NULL AND ProviderTransactionId IS NOT NULL AND ReceivedAmount = Amount))
);
GO

CREATE UNIQUE INDEX UX_Payment_ProviderTransaction
    ON Payment (Provider, ProviderTransactionId)
    WHERE ProviderTransactionId IS NOT NULL;
CREATE INDEX IX_Payment_Reservation ON Payment (ReservationID, Status);
GO

-- Moi lan cong thanh toan (gia lap) goi ve deu luu lai.
-- Goi lai cung ket qua -> ProcessResult = 'Duplicate', khong ghi nhan them.
CREATE TABLE PaymentCallbackLog (
    CallbackID BIGINT IDENTITY(1,1) NOT NULL,
    PaymentID INT NULL,
    Provider NVARCHAR(30) NOT NULL,
    OrderCode NVARCHAR(50) NOT NULL,
    ProviderTransactionId NVARCHAR(100) NULL,
    ReportedStatus NVARCHAR(20) NULL,
    ReportedAmount DECIMAL(12,2) NULL,
    Payload NVARCHAR(MAX) NULL,
    SignatureValid BIT NOT NULL CONSTRAINT DF_PaymentCallbackLog_SignatureValid DEFAULT 0,
    ReceivedAt DATETIME2 NOT NULL CONSTRAINT DF_PaymentCallbackLog_ReceivedAt DEFAULT SYSUTCDATETIME(),
    ProcessResult NVARCHAR(20) NOT NULL,
    Note NVARCHAR(500) NULL,

    CONSTRAINT PK_PaymentCallbackLog PRIMARY KEY (CallbackID),
    CONSTRAINT FK_PaymentCallbackLog_Payment FOREIGN KEY (PaymentID) REFERENCES Payment(PaymentID),
    CONSTRAINT CK_PaymentCallbackLog_Result
        CHECK (ProcessResult IN (N'Applied', N'Duplicate', N'Rejected', N'Error'))
);
GO

CREATE INDEX IX_PaymentCallbackLog_OrderCode ON PaymentCallbackLog (OrderCode, ReceivedAt);
GO

-- Charge = 1 khoan phai tra: coc, tien thue tung thang, phi tre, phi phat sinh.
-- Payment Collection tat toan nhieu Charge (Charge.PaymentID).
CREATE TABLE Charge (
    ChargeID INT IDENTITY(1,1) NOT NULL,
    ReservationID INT NOT NULL,
    ReservationUnitID BIGINT NULL,           -- bat buoc voi Deposit/Rent (theo tung kho)
    ChargeType NVARCHAR(20) NOT NULL,
    Description NVARCHAR(255) NULL,
    PeriodStart DATE NULL,                   -- ky thue cua dong Rent
    PeriodEnd DATE NULL,
    Amount DECIMAL(12,2) NOT NULL,
    DueDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_Charge_Status DEFAULT N'Unpaid',
    PaymentID INT NULL,                      -- Payment tat toan khoan nay
    PaidAt DATETIME2 NULL,
    SettledFromDeposit BIT NOT NULL CONSTRAINT DF_Charge_SettledFromDeposit DEFAULT 0,
    RefundedAmount DECIMAL(12,2) NOT NULL CONSTRAINT DF_Charge_RefundedAmount DEFAULT 0,
    RefundPaymentID INT NULL,
    FeePolicyID INT NULL,
    WaivedByUserID INT NULL,
    WaivedAt DATETIME2 NULL,
    WaiveReason NVARCHAR(255) NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Charge_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedByUserID INT NULL,

    CONSTRAINT PK_Charge PRIMARY KEY (ChargeID),
    CONSTRAINT FK_Charge_Reservation FOREIGN KEY (ReservationID) REFERENCES Reservation(ReservationID),
    CONSTRAINT FK_Charge_ReservationUnit
        FOREIGN KEY (ReservationUnitID, ReservationID)
        REFERENCES ReservationUnit(ReservationUnitID, ReservationID),
    CONSTRAINT FK_Charge_Payment FOREIGN KEY (PaymentID) REFERENCES Payment(PaymentID),
    CONSTRAINT FK_Charge_RefundPayment FOREIGN KEY (RefundPaymentID) REFERENCES Payment(PaymentID),
    CONSTRAINT FK_Charge_FeePolicy FOREIGN KEY (FeePolicyID) REFERENCES FeePolicy(FeePolicyID),
    CONSTRAINT FK_Charge_WaivedBy FOREIGN KEY (WaivedByUserID) REFERENCES Users(UserID),
    CONSTRAINT FK_Charge_CreatedBy FOREIGN KEY (CreatedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_Charge_Type CHECK (ChargeType IN (N'Deposit', N'Rent', N'Renewal', N'LateFee', N'ExtraFee')),
    CONSTRAINT CK_Charge_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Charge_Status CHECK (Status IN (N'Unpaid', N'Paid', N'Waived', N'Cancelled')),
    CONSTRAINT CK_Charge_UnitRequired CHECK (
        ChargeType NOT IN (N'Deposit', N'Rent') OR ReservationUnitID IS NOT NULL),
    CONSTRAINT CK_Charge_RentPeriod CHECK (
        (ChargeType = N'Rent' AND PeriodStart IS NOT NULL AND PeriodEnd >= PeriodStart) OR
        (ChargeType <> N'Rent')),
    -- Da tra => co thoi diem tra va (co Payment HOAC tru vao tien coc)
    CONSTRAINT CK_Charge_Paid CHECK (
        Status <> N'Paid' OR
        (PaidAt IS NOT NULL AND
         ((PaymentID IS NOT NULL AND SettledFromDeposit = 0) OR
          (PaymentID IS NULL AND SettledFromDeposit = 1)))),
    -- Chi phi tre / phi phat sinh moi duoc tru vao coc
    CONSTRAINT CK_Charge_SettledFromDeposit CHECK (
        SettledFromDeposit = 0 OR ChargeType IN (N'LateFee', N'ExtraFee')),
    CONSTRAINT CK_Charge_Waived CHECK (
        (Status = N'Waived' AND WaivedByUserID IS NOT NULL AND WaivedAt IS NOT NULL) OR
        (Status <> N'Waived' AND WaivedByUserID IS NULL AND WaivedAt IS NULL)),
    CONSTRAINT CK_Charge_Refund CHECK (
        RefundedAmount >= 0 AND RefundedAmount <= Amount AND
        (RefundedAmount = 0 OR (Status = N'Paid' AND RefundPaymentID IS NOT NULL)))
);
GO

-- Moi kho chi co 1 dong coc; moi kho moi thang chi tinh tien 1 lan
CREATE UNIQUE INDEX UX_Charge_Deposit
    ON Charge (ReservationUnitID)
    WHERE ChargeType = N'Deposit' AND Status <> N'Cancelled';
CREATE UNIQUE INDEX UX_Charge_Rent_Period
    ON Charge (ReservationUnitID, PeriodStart)
    WHERE ChargeType = N'Rent' AND Status <> N'Cancelled';
CREATE INDEX IX_Charge_Reservation ON Charge (ReservationID, Status, DueDate);
CREATE INDEX IX_Charge_Payment ON Charge (PaymentID);
GO


-- =============================================
-- 9. VAN HANH: SupportRequest, HandoverTask, UnitAccess
-- =============================================

CREATE TABLE SupportRequest (
    RequestID INT IDENTITY(1,1) NOT NULL,
    CustomerID INT NOT NULL,
    FacilityID INT NOT NULL,
    UnitID INT NULL,
    ContractID INT NULL,
    Category NVARCHAR(30) NOT NULL,
    Description NVARCHAR(1000) NOT NULL,
    Status NVARCHAR(30) NOT NULL CONSTRAINT DF_SupportRequest_Status DEFAULT N'Open',
    AssignedStaffID INT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_SupportRequest_CreatedAt DEFAULT SYSUTCDATETIME(),
    ResolvedAt DATETIME2 NULL,
    ResolutionNotes NVARCHAR(1000) NULL,

    CONSTRAINT PK_SupportRequest PRIMARY KEY (RequestID),
    CONSTRAINT FK_SupportRequest_Customer FOREIGN KEY (CustomerID) REFERENCES Users(UserID),
    CONSTRAINT FK_SupportRequest_Facility FOREIGN KEY (FacilityID) REFERENCES Facility(FacilityID),
    -- Kho phai thuoc dung co so
    CONSTRAINT FK_SupportRequest_Unit FOREIGN KEY (FacilityID, UnitID) REFERENCES StorageUnit(FacilityID, UnitID),
    CONSTRAINT FK_SupportRequest_Contract FOREIGN KEY (ContractID) REFERENCES Contract(ContractID),
    CONSTRAINT FK_SupportRequest_Staff FOREIGN KEY (AssignedStaffID) REFERENCES Users(UserID),
    CONSTRAINT CK_SupportRequest_Category
        CHECK (Category IN (N'Unit', N'Lock', N'AccessCode', N'Payment', N'StoredItems', N'Other')),
    CONSTRAINT CK_SupportRequest_Status
        CHECK (Status IN (N'Open', N'In Progress', N'Resolved', N'Closed')),
    CONSTRAINT CK_SupportRequest_Resolved
        CHECK (ResolvedAt IS NULL OR Status IN (N'Resolved', N'Closed'))
);
GO

CREATE TABLE HandoverTask (
    TaskID INT IDENTITY(1,1) NOT NULL,
    TaskType NVARCHAR(20) NOT NULL,
    FacilityID INT NOT NULL,
    UnitID INT NOT NULL,
    ReservationUnitID BIGINT NULL,           -- bat buoc voi Move In / Move Out
    ReservationID INT NULL,
    SupportRequestID INT NULL,               -- bat buoc voi Support
    AssignedStaffID INT NOT NULL,            -- phai la nhan vien dang lam tai co so nay
    AssignedByID INT NULL,
    ScheduledDate DATE NULL,
    ScheduledTime TIME(0) NULL,
    ActualAt DATETIME2 NULL,
    UnitConditionNotes NVARCHAR(1000) NULL,
    ConditionResult NVARCHAR(20) NULL,       -- ket qua kiem tra khi tra kho
    EvidenceImages NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_HandoverTask_Status DEFAULT N'Scheduled',
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_HandoverTask_CreatedAt DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_HandoverTask PRIMARY KEY (TaskID),
    CONSTRAINT FK_HandoverTask_Unit FOREIGN KEY (FacilityID, UnitID) REFERENCES StorageUnit(FacilityID, UnitID),
    -- Kho cua task phai dung la kho cua don
    CONSTRAINT FK_HandoverTask_ReservationUnit
        FOREIGN KEY (ReservationUnitID, ReservationID, UnitID)
        REFERENCES ReservationUnit(ReservationUnitID, ReservationID, UnitID),
    CONSTRAINT FK_HandoverTask_SupportRequest FOREIGN KEY (SupportRequestID) REFERENCES SupportRequest(RequestID),
    CONSTRAINT FK_HandoverTask_AssignedStaff FOREIGN KEY (AssignedStaffID) REFERENCES Users(UserID),
    CONSTRAINT FK_HandoverTask_AssignedBy FOREIGN KEY (AssignedByID) REFERENCES Users(UserID),
    CONSTRAINT CK_HandoverTask_TaskType
        CHECK (TaskType IN (N'Move In', N'Move Out', N'Inspection', N'Support')),
    CONSTRAINT CK_HandoverTask_Status
        CHECK (Status IN (N'Scheduled', N'In Progress', N'Completed', N'Cancelled')),
    CONSTRAINT CK_HandoverTask_Links CHECK (
        (TaskType NOT IN (N'Move In', N'Move Out') OR (ReservationUnitID IS NOT NULL AND ReservationID IS NOT NULL)) AND
        (TaskType <> N'Support' OR SupportRequestID IS NOT NULL)),
    CONSTRAINT CK_HandoverTask_Completed CHECK (Status <> N'Completed' OR ActualAt IS NOT NULL),
    CONSTRAINT CK_HandoverTask_ConditionResult
        CHECK (ConditionResult IS NULL OR ConditionResult IN (N'Good', N'Damaged'))
);
GO

-- Moi kho trong don chi co 1 task nhan kho va 1 task tra kho (chua huy)
CREATE UNIQUE INDEX UX_HandoverTask_ReservationUnit_Type
    ON HandoverTask (ReservationUnitID, TaskType)
    WHERE ReservationUnitID IS NOT NULL AND Status <> N'Cancelled' AND TaskType IN (N'Move In', N'Move Out');
CREATE INDEX IX_HandoverTask_Daily ON HandoverTask (FacilityID, ScheduledDate, Status);
CREATE INDEX IX_HandoverTask_Staff ON HandoverTask (AssignedStaffID, ScheduledDate);
GO

CREATE TABLE UnitAccess (
    AccessID INT IDENTITY(1,1) NOT NULL,
    ReservationUnitID BIGINT NOT NULL,
    ReservationID INT NOT NULL,
    UnitID INT NOT NULL,
    UserID INT NOT NULL,                     -- khach cua don
    AccessType NVARCHAR(30) NOT NULL,
    AccessValue NVARCHAR(255) NULL,
    IssuedAt DATETIME2 NOT NULL CONSTRAINT DF_UnitAccess_IssuedAt DEFAULT SYSUTCDATETIME(),
    IssuedByUserID INT NULL,
    ClosedAt DATETIME2 NULL,                 -- luc tra / thu hoi / bao mat
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_UnitAccess_Status DEFAULT N'Active',

    CONSTRAINT PK_UnitAccess PRIMARY KEY (AccessID),
    CONSTRAINT FK_UnitAccess_ReservationUnit
        FOREIGN KEY (ReservationUnitID, ReservationID, UnitID)
        REFERENCES ReservationUnit(ReservationUnitID, ReservationID, UnitID),
    CONSTRAINT FK_UnitAccess_User FOREIGN KEY (UserID) REFERENCES Users(UserID),
    CONSTRAINT FK_UnitAccess_IssuedBy FOREIGN KEY (IssuedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_UnitAccess_Type
        CHECK (AccessType IN (N'Smart Lock', N'PIN Code', N'Key', N'Access Card', N'QR')),
    CONSTRAINT CK_UnitAccess_Status CHECK (Status IN (N'Active', N'Returned', N'Revoked', N'Lost')),
    CONSTRAINT CK_UnitAccess_Closed CHECK (
        (Status = N'Active' AND ClosedAt IS NULL) OR (Status <> N'Active' AND ClosedAt IS NOT NULL))
);
GO

-- 1 kho chi co 1 quyen truy cap dang hieu luc cho moi loai (khong cap 2 lan)
CREATE UNIQUE INDEX UX_UnitAccess_Active
    ON UnitAccess (UnitID, AccessType)
    WHERE Status = N'Active';
GO


-- =============================================
-- 10. NHAT KY THAY DOI TRANG THAI (Event Log)
-- Ghi tu dong bang trigger. Nguoi thay doi lay tu SESSION_CONTEXT('UserID').
-- =============================================

CREATE TABLE StatusChangeLog (
    LogID BIGINT IDENTITY(1,1) NOT NULL,
    EntityType NVARCHAR(50) NOT NULL,
    EntityID BIGINT NOT NULL,
    OldStatus NVARCHAR(30) NULL,
    NewStatus NVARCHAR(30) NOT NULL,
    ChangedByUserID INT NULL,
    ChangedAt DATETIME2 NOT NULL CONSTRAINT DF_StatusChangeLog_ChangedAt DEFAULT SYSUTCDATETIME(),
    Source NVARCHAR(200) NULL,

    CONSTRAINT PK_StatusChangeLog PRIMARY KEY (LogID),
    CONSTRAINT FK_StatusChangeLog_User FOREIGN KEY (ChangedByUserID) REFERENCES Users(UserID),
    CONSTRAINT CK_StatusChangeLog_EntityType CHECK (EntityType IN
        (N'Reservation', N'ReservationUnit', N'StorageUnit', N'Payment', N'Contract',
         N'Charge', N'SupportRequest', N'HandoverTask', N'UnitAccess'))
);
GO

CREATE INDEX IX_StatusChangeLog_Entity ON StatusChangeLog (EntityType, EntityID, ChangedAt);
GO

-- ==============================================================
-- TRIGGERS - KIEM TRA NGHIEP VU O TANG DB
-- Moi loi co 1 ma rieng; message dang 'KEY: thong bao tieng Viet'
-- de FE hien popup ro rang (bang ma loi o cuoi file).
-- ==============================================================

-- ---------- Users / dang ky ----------

CREATE TRIGGER dbo.TR_PendingRegistration_Validate
ON dbo.PendingRegistration
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted AS i JOIN dbo.Users AS u ON u.Email = i.Email)
        THROW 51062, N'EMAIL_ALREADY_REGISTERED: Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.', 1;
END;
GO


-- ---------- Facility ----------

CREATE TRIGGER dbo.TR_Facility_Validate
ON dbo.Facility
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Nguoi quan ly phai co role Facility Manager
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        LEFT JOIN deleted AS d ON d.FacilityID = i.FacilityID
        JOIN dbo.Users AS u ON u.UserID = i.ManagerID
        JOIN dbo.Role AS r ON r.RoleID = u.RoleID
        WHERE (d.FacilityID IS NULL OR d.ManagerID <> i.ManagerID)
          AND (r.RoleName <> N'Facility Manager' OR u.Status <> N'Active'))
        THROW 51010, N'FACILITY_MANAGER_ROLE: Người quản lý cơ sở phải là tài khoản Facility Manager đang hoạt động.', 1;

    -- Khong doi tien to ma kho khi co so da co kho (UnitNumber se sai)
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.FacilityID = i.FacilityID
        WHERE d.UnitCodePrefix <> i.UnitCodePrefix
          AND EXISTS (SELECT 1 FROM dbo.StorageUnit AS u WHERE u.FacilityID = i.FacilityID))
        THROW 51011, N'FACILITY_PREFIX_LOCKED: Không thể đổi tiền tố mã kho vì cơ sở đã có kho.', 1;
END;
GO

-- Co so moi tao tren web tu dong nhan chinh sach chung (coc, giu kho, huy, tre han)
CREATE TRIGGER dbo.TR_Facility_CreateDefaultPolicy
ON dbo.Facility
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.RentalPolicy WHERE FacilityID IS NULL)
        THROW 51014, N'DEFAULT_POLICY_MISSING: Chưa có chính sách thuê chung. Business Operations Manager cần cấu hình trước khi tạo cơ sở.', 1;

    INSERT INTO dbo.RentalPolicy (FacilityID, DepositMonths, HoldMinutes, LateFeePerDay,
                                  GracePeriodDays, RenewalNoticeDays)
    SELECT i.FacilityID, p.DepositMonths, p.HoldMinutes, p.LateFeePerDay,
           p.GracePeriodDays, p.RenewalNoticeDays
    FROM inserted AS i
    CROSS JOIN dbo.RentalPolicy AS p
    WHERE p.FacilityID IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.RentalPolicy AS x WHERE x.FacilityID = i.FacilityID);

    INSERT INTO dbo.CancellationRule (RentalPolicyID, DaysBeforeStart, RefundPercent)
    SELECT newPolicy.RentalPolicyID, rule0.DaysBeforeStart, rule0.RefundPercent
    FROM inserted AS i
    JOIN dbo.RentalPolicy AS newPolicy ON newPolicy.FacilityID = i.FacilityID
    CROSS JOIN dbo.RentalPolicy AS defaultPolicy
    JOIN dbo.CancellationRule AS rule0 ON rule0.RentalPolicyID = defaultPolicy.RentalPolicyID
    WHERE defaultPolicy.FacilityID IS NULL
      AND NOT EXISTS (SELECT 1 FROM dbo.CancellationRule AS x
                      WHERE x.RentalPolicyID = newPolicy.RentalPolicyID);
END;
GO

CREATE TRIGGER dbo.TR_FacilityStaff_Validate
ON dbo.FacilityStaff
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN dbo.Users AS u ON u.UserID = i.UserID
        JOIN dbo.Role AS r ON r.RoleID = u.RoleID
        WHERE r.RoleName <> N'Facility Staff')
        THROW 51012, N'FACILITY_STAFF_ROLE: Chỉ tài khoản Facility Staff mới được phân công vào cơ sở.', 1;
END;
GO


-- ---------- SizeCategory / UnitSize / RentalRate ----------

-- BOM sua khung the tich / gia: khong duoc loai bo size hoac gia dang ton tai
CREATE TRIGGER dbo.TR_SizeCategory_ValidateExistingData
ON dbo.SizeCategory
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM inserted AS c
        JOIN deleted AS d ON d.SizeCategoryID = c.SizeCategoryID
        WHERE (c.StandardHeightM <> d.StandardHeightM OR c.CodePrefix <> d.CodePrefix)
          AND EXISTS (SELECT 1 FROM dbo.UnitSize AS s WHERE s.SizeCategoryID = c.SizeCategoryID))
        THROW 51033, N'CATEGORY_STRUCTURE_LOCKED: Không thể đổi chiều cao chuẩn hoặc ký hiệu khi nhóm size đã có size.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS c
        JOIN dbo.UnitSize AS s ON s.SizeCategoryID = c.SizeCategoryID
        WHERE s.IsActive = 1
          AND (s.WidthM * s.LengthM * s.HeightM < c.MinVolumeM3 OR
               s.WidthM * s.LengthM * s.HeightM > c.MaxVolumeM3))
        THROW 51027, N'CATEGORY_VOLUME_EXCLUDES_SIZES: Khoảng thể tích mới loại bỏ size đang dùng. Hãy điều chỉnh hoặc ngừng các size đó trước.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS c
        JOIN dbo.UnitSize AS s ON s.SizeCategoryID = c.SizeCategoryID
        JOIN dbo.RentalRate AS rate ON rate.UnitSizeID = s.UnitSizeID
        WHERE rate.MonthlyPrice < c.MinMonthlyPrice OR rate.MonthlyPrice > c.MaxMonthlyPrice)
        THROW 51028, N'CATEGORY_PRICE_EXCLUDES_RATES: Khung giá mới không bao gồm giá thuê đang áp dụng. Hãy chỉnh giá các cơ sở trước.', 1;
END;
GO

CREATE TRIGGER dbo.TR_UnitSize_Validate
ON dbo.UnitSize
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Size moi (hoac doi nhom / bat lai) phai thuoc nhom dang hoat dong
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        LEFT JOIN deleted AS d ON d.UnitSizeID = i.UnitSizeID
        JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = i.SizeCategoryID
        WHERE c.IsActive = 0 AND i.IsActive = 1
          AND (d.UnitSizeID IS NULL OR d.SizeCategoryID <> i.SizeCategoryID OR d.IsActive = 0))
        THROW 51020, N'SIZE_CATEGORY_INACTIVE: Nhóm size này đang ngừng hoạt động, không thể tạo size mới.', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = i.SizeCategoryID
        WHERE i.HeightM <> c.StandardHeightM)
        THROW 51022, N'SIZE_HEIGHT_MISMATCH: Chiều cao phải bằng chiều cao chuẩn của nhóm (Small/Medium/Large 2.5m, Vehicle 3.5m).', 1;

    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = i.SizeCategoryID
        WHERE i.WidthM * i.LengthM * i.HeightM < c.MinVolumeM3
           OR i.WidthM * i.LengthM * i.HeightM > c.MaxVolumeM3)
        THROW 51021, N'SIZE_VOLUME_OUT_OF_RANGE: Thể tích (dài x rộng x cao) nằm ngoài khoảng cho phép của nhóm size.', 1;

    -- SizeCode bat dau bang ky hieu nhom (S1, M3, L2, V1...)
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = i.SizeCategoryID
        WHERE i.SizeCode NOT LIKE c.CodePrefix + N'[0-9]%')
        THROW 51023, N'SIZE_CODE_INVALID: Mã size phải bắt đầu bằng ký hiệu nhóm (S, M, L, V), ví dụ S4.', 1;

    -- Size dang duoc co so nao do dat gia thi khong doi kich thuoc / nhom
    -- (doi se anh huong ca nhung co so khac dang dung chung size nay)
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.UnitSizeID = i.UnitSizeID
        WHERE (d.WidthM <> i.WidthM OR d.LengthM <> i.LengthM OR d.HeightM <> i.HeightM
               OR d.SizeCategoryID <> i.SizeCategoryID)
          AND EXISTS (SELECT 1 FROM dbo.RentalRate AS r WHERE r.UnitSizeID = i.UnitSizeID))
        THROW 51029, N'SIZE_IN_USE_LOCKED: Size đã có cơ sở dùng, không thể đổi kích thước hoặc nhóm. Hãy tạo size mới.', 1;
END;
GO

CREATE TRIGGER dbo.TR_RentalRate_Validate
ON dbo.RentalRate
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Loai / size phai duoc gan vao co so: da chan bang FK_RentalRate_FacilityUnitType/Size.
    -- O day kiem tra them: loai, size va lien ket voi co so con hoat dong.
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.RentalRateID = i.RentalRateID
        JOIN dbo.UnitType AS t ON t.UnitTypeID = i.UnitTypeID
        JOIN dbo.UnitSize AS s ON s.UnitSizeID = i.UnitSizeID
        JOIN dbo.FacilityUnitType AS ft ON ft.FacilityID = i.FacilityID AND ft.UnitTypeID = i.UnitTypeID
        JOIN dbo.FacilityUnitSize AS fs ON fs.FacilityID = i.FacilityID AND fs.UnitSizeID = i.UnitSizeID
        WHERE d.RentalRateID IS NULL
          AND (t.IsActive = 0 OR s.IsActive = 0 OR ft.IsActive = 0 OR fs.IsActive = 0))
        THROW 51031, N'CATALOG_INACTIVE: Loại kho hoặc size đang ngừng hoạt động (hoặc đã ngừng tại cơ sở này).', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.UnitSize AS s ON s.UnitSizeID = i.UnitSizeID
        JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = s.SizeCategoryID
        WHERE i.MonthlyPrice < c.MinMonthlyPrice OR i.MonthlyPrice > c.MaxMonthlyPrice)
        THROW 51026, N'RATE_PRICE_OUT_OF_RANGE: Giá thuê nằm ngoài khung giá chung của nhóm size.', 1;
END;
GO


-- ---------- Lien ket co so <-> loai kho / size ----------

-- Khong ngung loai kho tai co so khi co so van con kho (chua Inactive) dung loai do
CREATE TRIGGER dbo.TR_FacilityUnitType_Validate
ON dbo.FacilityUnitType
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.FacilityID = i.FacilityID AND d.UnitTypeID = i.UnitTypeID
        WHERE i.IsActive = 0 AND d.IsActive = 1
          AND EXISTS (SELECT 1 FROM dbo.StorageUnit AS u
                      WHERE u.FacilityID = i.FacilityID AND u.UnitTypeID = i.UnitTypeID
                        AND u.Status <> N'Inactive'))
        THROW 51034, N'CATALOG_LINK_IN_USE: Cơ sở vẫn còn kho thuộc loại/size này. Hãy ngừng hoặc đổi các kho đó trước.', 1;
END;
GO

CREATE TRIGGER dbo.TR_FacilityUnitSize_Validate
ON dbo.FacilityUnitSize
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.FacilityID = i.FacilityID AND d.UnitSizeID = i.UnitSizeID
        WHERE i.IsActive = 0 AND d.IsActive = 1
          AND EXISTS (SELECT 1 FROM dbo.StorageUnit AS u
                      WHERE u.FacilityID = i.FacilityID AND u.UnitSizeID = i.UnitSizeID
                        AND u.Status <> N'Inactive'))
        THROW 51034, N'CATALOG_LINK_IN_USE: Cơ sở vẫn còn kho thuộc loại/size này. Hãy ngừng hoặc đổi các kho đó trước.', 1;
END;
GO


-- ---------- StorageUnit ----------

CREATE TRIGGER dbo.TR_StorageUnit_Validate
ON dbo.StorageUnit
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Facility AS f ON f.FacilityID = i.FacilityID
        WHERE i.UnitNumber NOT LIKE f.UnitCodePrefix + N'-%')
        THROW 51030, N'UNIT_NUMBER_PREFIX: Mã kho phải bắt đầu bằng tiền tố của cơ sở, ví dụ Q1-U11.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.UnitID = i.UnitID
        JOIN dbo.UnitType AS t ON t.UnitTypeID = i.UnitTypeID
        JOIN dbo.UnitSize AS s ON s.UnitSizeID = i.UnitSizeID
        JOIN dbo.FacilityUnitType AS ft ON ft.FacilityID = i.FacilityID AND ft.UnitTypeID = i.UnitTypeID
        JOIN dbo.FacilityUnitSize AS fs ON fs.FacilityID = i.FacilityID AND fs.UnitSizeID = i.UnitSizeID
        WHERE i.Status <> N'Inactive'
          AND (t.IsActive = 0 OR s.IsActive = 0 OR ft.IsActive = 0 OR fs.IsActive = 0)
          AND (d.UnitID IS NULL OR d.UnitTypeID <> i.UnitTypeID OR d.UnitSizeID <> i.UnitSizeID
               OR d.Status = N'Inactive'))
        THROW 51031, N'CATALOG_INACTIVE: Loại kho hoặc size đang ngừng hoạt động.', 1;

    -- Khong ngung kho khi con don dang giu / dang thue
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.UnitID = i.UnitID
        WHERE i.Status = N'Inactive' AND d.Status <> N'Inactive'
          AND EXISTS (
              SELECT 1
              FROM dbo.ReservationUnit AS ru
              JOIN dbo.Reservation AS r ON r.ReservationID = ru.ReservationID
              WHERE ru.UnitID = i.UnitID
                AND ru.Status IN (N'Held', N'Active')
                AND r.Status IN (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over')))
        THROW 51032, N'UNIT_HAS_ACTIVE_RESERVATIONS: Kho đang có đơn giữ hoặc đang cho thuê. Hãy đổi kho cho khách trước khi ngừng kho.', 1;
END;
GO


-- ---------- Reservation ----------

CREATE TRIGGER dbo.TR_Reservation_Insert
ON dbo.Reservation
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Users AS u ON u.UserID = i.CustomerID
        JOIN dbo.Role AS r ON r.RoleID = u.RoleID
        WHERE r.RoleName <> N'Storage Customer' OR u.Status <> N'Active')
        THROW 51006, N'RESERVATION_CUSTOMER_ROLE: Chỉ tài khoản khách hàng đang hoạt động mới được đặt kho.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Facility AS f ON f.FacilityID = i.FacilityID
        WHERE f.Status <> N'Active')
        THROW 51008, N'FACILITY_INACTIVE: Cơ sở này đang tạm ngừng hoạt động.', 1;
END;
GO

CREATE TRIGGER dbo.TR_Reservation_Update
ON dbo.Reservation
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- State machine
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.ReservationID = i.ReservationID
        WHERE i.Status <> d.Status
          AND NOT EXISTS (
              SELECT 1
              FROM (VALUES
                  (N'Pending Payment', N'Paid'),
                  (N'Pending Payment', N'Cancelled'),
                  (N'Pending Payment', N'Expired'),
                  (N'Paid',            N'Confirmed'),
                  (N'Paid',            N'Cancelled'),
                  (N'Confirmed',       N'Handed Over'),
                  (N'Confirmed',       N'Cancelled'),
                  (N'Handed Over',     N'Completed')) AS t(FromStatus, ToStatus)
              WHERE t.FromStatus = d.Status AND t.ToStatus = i.Status))
        THROW 51050, N'RESERVATION_STATUS_TRANSITION: Thao tác không hợp lệ với trạng thái hiện tại của đơn đặt kho.', 1;

    -- -> Paid: moi khoan coc phai da thanh toan (Payment da xac nhan, khong dua vao trinh duyet)
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.ReservationID = i.ReservationID
        WHERE i.Status = N'Paid' AND d.Status <> N'Paid'
          AND (NOT EXISTS (SELECT 1 FROM dbo.Charge AS c
                           WHERE c.ReservationID = i.ReservationID AND c.ChargeType = N'Deposit'
                             AND c.Status <> N'Cancelled')
               OR EXISTS (SELECT 1 FROM dbo.Charge AS c
                          WHERE c.ReservationID = i.ReservationID AND c.ChargeType = N'Deposit'
                            AND c.Status NOT IN (N'Paid', N'Cancelled'))))
        THROW 51053, N'RESERVATION_DEPOSIT_NOT_PAID: Tiền cọc chưa được xác nhận thanh toán.', 1;

    -- -> Confirmed: moi dong yeu cau da du kho
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.ReservationID = i.ReservationID
        JOIN dbo.ReservationItem AS item ON item.ReservationID = i.ReservationID
        WHERE i.Status = N'Confirmed' AND d.Status <> N'Confirmed'
          AND item.Quantity <> (SELECT COUNT(*) FROM dbo.ReservationUnit AS ru
                                WHERE ru.ReservationItemID = item.ReservationItemID
                                  AND ru.Status <> N'Released'))
        THROW 51054, N'RESERVATION_NOT_FULLY_ASSIGNED: Chưa phân đủ kho cho đơn đặt.', 1;

    -- -> Handed Over: moi kho cua don da ban giao
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.ReservationID = i.ReservationID
        WHERE i.Status = N'Handed Over' AND d.Status <> N'Handed Over'
          AND EXISTS (SELECT 1 FROM dbo.ReservationUnit AS ru
                      WHERE ru.ReservationID = i.ReservationID AND ru.Status = N'Held'))
        THROW 51059, N'RESERVATION_HANDOVER_INCOMPLETE: Còn kho trong đơn chưa bàn giao.', 1;

    -- -> Completed: moi kho da tra
    IF EXISTS (
        SELECT 1
        FROM inserted AS i
        JOIN deleted AS d ON d.ReservationID = i.ReservationID
        WHERE i.Status = N'Completed' AND d.Status <> N'Completed'
          AND EXISTS (SELECT 1 FROM dbo.ReservationUnit AS ru
                      WHERE ru.ReservationID = i.ReservationID AND ru.Status IN (N'Held', N'Active')))
        THROW 51060, N'RESERVATION_RETURN_INCOMPLETE: Còn kho trong đơn chưa trả.', 1;

    -- Huy / het han: tu dong giai phong kho dang giu va huy cac khoan chua tra
    UPDATE ru
    SET Status = N'Released', ReleasedAt = SYSUTCDATETIME()
    FROM dbo.ReservationUnit AS ru
    JOIN inserted AS i ON i.ReservationID = ru.ReservationID
    JOIN deleted AS d ON d.ReservationID = i.ReservationID
    WHERE i.Status IN (N'Cancelled', N'Expired') AND d.Status <> i.Status
      AND ru.Status = N'Held';

    UPDATE c
    SET Status = N'Cancelled'
    FROM dbo.Charge AS c
    JOIN inserted AS i ON i.ReservationID = c.ReservationID
    JOIN deleted AS d ON d.ReservationID = i.ReservationID
    WHERE i.Status IN (N'Cancelled', N'Expired') AND d.Status <> i.Status
      AND c.Status = N'Unpaid';

    -- Chong trung ky thue khi doi ngay / trang thai / han giu
    IF UPDATE(StartDate) OR UPDATE(EndDate) OR UPDATE(Status) OR UPDATE(HoldExpiresAt)
    BEGIN
        DECLARE @today DATE = CAST(SYSUTCDATETIME() AS DATE),
                @now DATETIME2 = SYSUTCDATETIME(),
                @conflicts INT;

        WITH Blocking AS (
            SELECT ru.ReservationUnitID, ru.ReservationID, ru.UnitID, r.StartDate,
                   CASE WHEN ru.Status = N'Active' AND r.EndDate < @today
                        THEN CAST('9999-12-31' AS DATE)   -- qua han chua tra: kho van bi chiem
                        ELSE r.EndDate END AS BlockEnd
            FROM dbo.ReservationUnit AS ru WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.Reservation AS r WITH (UPDLOCK, HOLDLOCK) ON r.ReservationID = ru.ReservationID
            WHERE ru.UnitID IN (SELECT x.UnitID FROM dbo.ReservationUnit AS x
                                JOIN inserted AS i ON i.ReservationID = x.ReservationID)
              AND ru.Status IN (N'Held', N'Active')
              AND r.Status IN (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over')
              AND NOT (r.Status = N'Pending Payment' AND r.HoldExpiresAt <= @now))
        SELECT @conflicts = COUNT(*)
        FROM Blocking AS mine
        JOIN Blocking AS other
          ON other.UnitID = mine.UnitID
         AND other.ReservationUnitID <> mine.ReservationUnitID
         AND mine.StartDate <= other.BlockEnd
         AND other.StartDate <= mine.BlockEnd
        WHERE mine.ReservationID IN (SELECT ReservationID FROM inserted);

        IF @conflicts > 0
            THROW 51001, N'RESERVATION_OVERLAP: Kho đã có người đặt trong khoảng thời gian này. Vui lòng chọn kho hoặc thời gian khác.', 1;
    END;
END;
GO


-- ---------- ReservationUnit ----------

CREATE TRIGGER dbo.TR_ReservationUnit_Validate
ON dbo.ReservationUnit
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Doi kho = Released dong cu + them dong moi; khong sua kho tren dong cu
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.ReservationUnitID = i.ReservationUnitID
        WHERE d.UnitID <> i.UnitID OR d.ReservationItemID <> i.ReservationItemID)
        THROW 51058, N'RESERVATION_UNIT_IMMUTABLE: Không sửa trực tiếp kho đã gán. Hãy giải phóng kho cũ và gán kho mới.', 1;

    -- State machine
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.ReservationUnitID = i.ReservationUnitID
        WHERE i.Status <> d.Status
          AND NOT EXISTS (
              SELECT 1
              FROM (VALUES (N'Held', N'Active'),
                           (N'Held', N'Released'),
                           (N'Active', N'Returned')) AS t(FromStatus, ToStatus)
              WHERE t.FromStatus = d.Status AND t.ToStatus = i.Status))
        THROW 51052, N'RESERVATION_UNIT_STATUS_TRANSITION: Kho này đã được bàn giao/trả/giải phóng trước đó.', 1;

    -- Ban giao chi khi don da Confirmed (da xac nhan thanh toan + du kho)
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.ReservationUnitID = i.ReservationUnitID
        JOIN dbo.Reservation AS r ON r.ReservationID = i.ReservationID
        WHERE i.Status = N'Active' AND (d.ReservationUnitID IS NULL OR d.Status <> N'Active')
          AND r.Status NOT IN (N'Confirmed', N'Handed Over'))
        THROW 51051, N'HANDOVER_NOT_ALLOWED: Đơn chưa được xác nhận thanh toán và phân kho, không thể bàn giao.', 1;

    -- Kho duoc gan phai dang cho thue duoc
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.ReservationUnitID = i.ReservationUnitID
        JOIN dbo.StorageUnit AS u ON u.UnitID = i.UnitID
        WHERE d.ReservationUnitID IS NULL
          AND u.Status IN (N'Maintenance', N'Inactive'))
        THROW 51007, N'UNIT_NOT_RENTABLE: Kho đang bảo trì hoặc ngừng hoạt động.', 1;

    -- Khong gan qua so luong khach yeu cau
    IF EXISTS (
        SELECT 1
        FROM dbo.ReservationItem AS item
        WHERE item.ReservationItemID IN (SELECT ReservationItemID FROM inserted)
          AND item.Quantity < (SELECT COUNT(*) FROM dbo.ReservationUnit AS ru
                               WHERE ru.ReservationItemID = item.ReservationItemID
                                 AND ru.Status <> N'Released'))
        THROW 51002, N'RESERVATION_ITEM_QUANTITY_EXCEEDED: Số kho được gán vượt quá số lượng khách đã đặt.', 1;

    -- Chong trung ky thue (thay cho EXCLUDE constraint cua PostgreSQL).
    -- UPDLOCK + HOLDLOCK khoa dai (UnitID) => 2 request dong thoi cho cung 1 kho
    -- se phai cho nhau; request sau thay request truoc va bi tu choi
    -- (hoac bi chon lam nan nhan deadlock 1205 -> backend bao "het kho").
    DECLARE @today DATE = CAST(SYSUTCDATETIME() AS DATE),
            @now DATETIME2 = SYSUTCDATETIME(),
            @conflicts INT;

    WITH Blocking AS (
        SELECT ru.ReservationUnitID, ru.UnitID, r.StartDate,
               CASE WHEN ru.Status = N'Active' AND r.EndDate < @today
                    THEN CAST('9999-12-31' AS DATE)
                    ELSE r.EndDate END AS BlockEnd
        FROM dbo.ReservationUnit AS ru WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.Reservation AS r WITH (UPDLOCK, HOLDLOCK) ON r.ReservationID = ru.ReservationID
        WHERE ru.UnitID IN (SELECT UnitID FROM inserted)
          AND ru.Status IN (N'Held', N'Active')
          AND r.Status IN (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over')
          AND NOT (r.Status = N'Pending Payment' AND r.HoldExpiresAt <= @now))
    SELECT @conflicts = COUNT(*)
    FROM Blocking AS mine
    JOIN Blocking AS other
      ON other.UnitID = mine.UnitID
     AND other.ReservationUnitID <> mine.ReservationUnitID
     AND mine.StartDate <= other.BlockEnd
     AND other.StartDate <= mine.BlockEnd
    WHERE mine.ReservationUnitID IN (SELECT ReservationUnitID FROM inserted);

    IF @conflicts > 0
        THROW 51001, N'RESERVATION_OVERLAP: Kho đã có người đặt trong khoảng thời gian này. Vui lòng chọn kho hoặc thời gian khác.', 1;
END;
GO


-- ---------- Contract ----------

CREATE TRIGGER dbo.TR_Contract_Insert
ON dbo.Contract
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Reservation AS r ON r.ReservationID = i.ReservationID
        WHERE r.Status NOT IN (N'Confirmed', N'Handed Over'))
        THROW 51055, N'CONTRACT_NOT_ALLOWED: Chỉ tạo hợp đồng cho đơn đã xác nhận thanh toán và phân kho.', 1;
END;
GO


-- ---------- Payment / Charge ----------

CREATE TRIGGER dbo.TR_Payment_Validate
ON dbo.Payment
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Payment moi luon bat dau o Pending (ket qua chi den tu cong thanh toan)
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.PaymentID = i.PaymentID
        WHERE d.PaymentID IS NULL AND i.Status <> N'Pending')
        THROW 51043, N'PAYMENT_STATUS_TRANSITION: Giao dịch mới phải ở trạng thái chờ xác nhận.', 1;

    -- Pending -> Completed | Failed | Cancelled; sau do khong doi nua
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.PaymentID = i.PaymentID
        WHERE i.Status <> d.Status
          AND NOT (d.Status = N'Pending' AND i.Status IN (N'Completed', N'Failed', N'Cancelled')))
        THROW 51043, N'PAYMENT_STATUS_TRANSITION: Giao dịch này đã được xử lý trước đó.', 1;

    -- Khong sua so tien / ma giao dich sau khi hoan tat
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.PaymentID = i.PaymentID
        WHERE d.Status = N'Completed'
          AND (i.Amount <> d.Amount OR ISNULL(i.ProviderTransactionId, N'') <> ISNULL(d.ProviderTransactionId, N'')))
        THROW 51043, N'PAYMENT_STATUS_TRANSITION: Không thể sửa giao dịch đã hoàn tất.', 1;

    -- Thu tien: tong cac khoan duoc tat toan = so tien
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.PaymentID = i.PaymentID
        WHERE i.Status = N'Completed' AND d.Status <> N'Completed' AND i.Direction = N'Collection'
          AND i.Amount <> ISNULL((SELECT SUM(c.Amount) FROM dbo.Charge AS c WHERE c.PaymentID = i.PaymentID), 0))
        THROW 51040, N'PAYMENT_AMOUNT_MISMATCH: Số tiền thanh toán không khớp với các khoản phải trả.', 1;

    -- Hoan tien (huy don / tra coc): tong phan hoan tren cac khoan = so tien
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.PaymentID = i.PaymentID
        WHERE i.Status = N'Completed' AND d.Status <> N'Completed'
          AND i.Direction = N'Refund' AND i.RefundReason IN (N'Cancellation', N'DepositReturn')
          AND i.Amount <> ISNULL((SELECT SUM(c.RefundedAmount) FROM dbo.Charge AS c
                                  WHERE c.RefundPaymentID = i.PaymentID), 0))
        THROW 51040, N'PAYMENT_AMOUNT_MISMATCH: Số tiền hoàn không khớp với các khoản được hoàn.', 1;

    -- Hoan tien thua: khong vuot giao dich goc, cung don
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Payment AS original ON original.PaymentID = i.RefundOfPaymentID
        WHERE i.Direction = N'Refund'
          AND (original.ReservationID <> i.ReservationID OR original.Direction <> N'Collection'
               OR i.Amount > original.Amount))
        THROW 51045, N'REFUND_EXCEEDS_ORIGINAL: Số tiền hoàn vượt quá giao dịch gốc.', 1;
END;
GO

CREATE TRIGGER dbo.TR_Charge_Validate
ON dbo.Charge
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Unpaid -> Paid | Waived | Cancelled; khoan da Paid chi duoc cap nhat phan hoan tien
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.ChargeID = i.ChargeID
        WHERE i.Status <> d.Status
          AND NOT (d.Status = N'Unpaid' AND i.Status IN (N'Paid', N'Waived', N'Cancelled')))
        THROW 51044, N'CHARGE_STATUS_TRANSITION: Khoản phí này đã được xử lý trước đó.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN deleted AS d ON d.ChargeID = i.ChargeID
        WHERE d.Status <> N'Unpaid' AND (i.Amount <> d.Amount OR i.ChargeType <> d.ChargeType))
        THROW 51044, N'CHARGE_STATUS_TRANSITION: Không thể sửa số tiền của khoản đã xử lý.', 1;

    -- Payment gan vao phai cung don va dung chieu tien
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Payment AS p ON p.PaymentID = i.PaymentID
        WHERE p.ReservationID <> i.ReservationID OR p.Direction <> N'Collection')
        THROW 51042, N'CHARGE_PAYMENT_MISMATCH: Giao dịch thanh toán không thuộc đơn đặt kho này.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Payment AS p ON p.PaymentID = i.RefundPaymentID
        WHERE p.ReservationID <> i.ReservationID OR p.Direction <> N'Refund')
        THROW 51042, N'CHARGE_PAYMENT_MISMATCH: Giao dịch hoàn tiền không thuộc đơn đặt kho này.', 1;

    -- Chi danh dau Paid khi Payment da Completed
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Payment AS p ON p.PaymentID = i.PaymentID
        WHERE i.Status = N'Paid' AND p.Status <> N'Completed')
        THROW 51041, N'CHARGE_PAYMENT_NOT_COMPLETED: Thanh toán chưa được cổng thanh toán xác nhận.', 1;
END;
GO


-- ---------- HandoverTask / UnitAccess ----------

CREATE TRIGGER dbo.TR_HandoverTask_Validate
ON dbo.HandoverTask
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted AS i
        LEFT JOIN deleted AS d ON d.TaskID = i.TaskID
        WHERE (d.TaskID IS NULL OR d.AssignedStaffID <> i.AssignedStaffID OR d.FacilityID <> i.FacilityID)
          AND NOT EXISTS (
            SELECT 1 FROM dbo.FacilityStaff AS fs
            WHERE fs.FacilityID = i.FacilityID AND fs.UserID = i.AssignedStaffID AND fs.Status = N'Active'))
        THROW 51013, N'TASK_STAFF_NOT_IN_FACILITY: Nhân viên được giao không làm việc tại cơ sở này.', 1;
END;
GO

CREATE TRIGGER dbo.TR_UnitAccess_Validate
ON dbo.UnitAccess
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.ReservationUnit AS ru ON ru.ReservationUnitID = i.ReservationUnitID
        WHERE i.Status = N'Active' AND ru.Status <> N'Active')
        THROW 51056, N'ACCESS_REQUIRES_HANDOVER: Chỉ cấp khóa/thẻ/mã khi kho đã được bàn giao.', 1;

    IF EXISTS (
        SELECT 1 FROM inserted AS i
        JOIN dbo.Reservation AS r ON r.ReservationID = i.ReservationID
        WHERE i.UserID <> r.CustomerID)
        THROW 51057, N'ACCESS_WRONG_CUSTOMER: Quyền truy cập phải cấp cho đúng khách hàng của đơn.', 1;
END;
GO


-- ---------- Event log: tu dong ghi moi thay doi trang thai ----------

CREATE TRIGGER dbo.TR_Reservation_LogStatus ON dbo.Reservation AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'Reservation', i.ReservationID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.ReservationID = i.ReservationID
    WHERE d.ReservationID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_ReservationUnit_LogStatus ON dbo.ReservationUnit AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'ReservationUnit', i.ReservationUnitID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.ReservationUnitID = i.ReservationUnitID
    WHERE d.ReservationUnitID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_StorageUnit_LogStatus ON dbo.StorageUnit AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'StorageUnit', i.UnitID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.UnitID = i.UnitID
    WHERE d.UnitID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_Payment_LogStatus ON dbo.Payment AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'Payment', i.PaymentID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.PaymentID = i.PaymentID
    WHERE d.PaymentID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_Contract_LogStatus ON dbo.Contract AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'Contract', i.ContractID, d.ContractStatus, i.ContractStatus,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.ContractID = i.ContractID
    WHERE d.ContractID IS NULL OR d.ContractStatus <> i.ContractStatus;
END;
GO

CREATE TRIGGER dbo.TR_Charge_LogStatus ON dbo.Charge AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'Charge', i.ChargeID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.ChargeID = i.ChargeID
    WHERE d.ChargeID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_HandoverTask_LogStatus ON dbo.HandoverTask AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'HandoverTask', i.TaskID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.TaskID = i.TaskID
    WHERE d.TaskID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_SupportRequest_LogStatus ON dbo.SupportRequest AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'SupportRequest', i.RequestID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.RequestID = i.RequestID
    WHERE d.RequestID IS NULL OR d.Status <> i.Status;
END;
GO

CREATE TRIGGER dbo.TR_UnitAccess_LogStatus ON dbo.UnitAccess AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.StatusChangeLog (EntityType, EntityID, OldStatus, NewStatus, ChangedByUserID, Source)
    SELECT N'UnitAccess', i.AccessID, d.Status, i.Status,
           TRY_CAST(SESSION_CONTEXT(N'UserID') AS INT), TRY_CAST(SESSION_CONTEXT(N'Source') AS NVARCHAR(200))
    FROM inserted AS i LEFT JOIN deleted AS d ON d.AccessID = i.AccessID
    WHERE d.AccessID IS NULL OR d.Status <> i.Status;
END;
GO

-- ==============================================================
-- VIEWS / FUNCTION - phuc vu tim kho, bao cao, doi soat
-- ==============================================================

-- Khoang thoi gian moi kho dang bi chiem (giu hoac dang thue).
-- Don cho thanh toan da qua HoldExpiresAt KHONG con chiem kho,
-- ke ca khi job chua kip chuyen sang 'Expired'.
CREATE VIEW dbo.vw_UnitBlocking
AS
SELECT ru.ReservationUnitID, ru.ReservationID, ru.UnitID,
       ru.Status AS UnitBookingStatus, r.Status AS ReservationStatus,
       r.StartDate,
       CASE WHEN ru.Status = N'Active' AND r.EndDate < CAST(SYSUTCDATETIME() AS DATE)
            THEN CAST('9999-12-31' AS DATE)   -- qua han chua tra
            ELSE r.EndDate END AS BlockEnd
FROM dbo.ReservationUnit AS ru
JOIN dbo.Reservation AS r ON r.ReservationID = ru.ReservationID
WHERE ru.Status IN (N'Held', N'Active')
  AND r.Status IN (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over')
  AND NOT (r.Status = N'Pending Payment' AND r.HoldExpiresAt <= SYSUTCDATETIME());
GO

-- Tim kho con trong cho ca ky thue (dung cho trang tim kho cua khach).
-- @FacilityID NULL = tim tat ca co so; loc khu vuc bang City/District/Ward.
-- Vi du: SELECT * FROM dbo.fn_AvailableUnits(NULL, '2026-11-01', '2027-01-31')
--        WHERE District = N'Quận 1' AND CategoryCode = N'SMALL';
CREATE FUNCTION dbo.fn_AvailableUnits (@FacilityID INT, @StartDate DATE, @EndDate DATE)
RETURNS TABLE
AS
RETURN
SELECT f.FacilityID, f.FacilityName, f.City, f.District, f.Ward, f.StreetAddress,
       f.Latitude, f.Longitude,
       u.UnitID, u.UnitNumber, u.Floor, u.Zone, u.LocationNote,
       t.UnitTypeID, t.TypeName,
       s.UnitSizeID, s.SizeCode, s.DisplayName AS SizeName, s.WidthM, s.LengthM, s.HeightM,
       s.AreaM2, s.VolumeM3,
       c.CategoryCode, c.CategoryName,
       rate.MonthlyPrice
FROM dbo.StorageUnit AS u
JOIN dbo.Facility AS f ON f.FacilityID = u.FacilityID
JOIN dbo.UnitType AS t ON t.UnitTypeID = u.UnitTypeID
JOIN dbo.UnitSize AS s ON s.UnitSizeID = u.UnitSizeID
JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = s.SizeCategoryID
JOIN dbo.RentalRate AS rate
  ON rate.FacilityID = u.FacilityID AND rate.UnitTypeID = u.UnitTypeID AND rate.UnitSizeID = u.UnitSizeID
JOIN dbo.FacilityUnitType AS ft ON ft.FacilityID = u.FacilityID AND ft.UnitTypeID = u.UnitTypeID
JOIN dbo.FacilityUnitSize AS fs ON fs.FacilityID = u.FacilityID AND fs.UnitSizeID = u.UnitSizeID
WHERE (@FacilityID IS NULL OR u.FacilityID = @FacilityID)
  AND f.Status = N'Active'
  AND u.Status NOT IN (N'Maintenance', N'Inactive')
  AND t.IsActive = 1 AND s.IsActive = 1 AND c.IsActive = 1
  AND ft.IsActive = 1 AND fs.IsActive = 1
  AND NOT EXISTS (
      SELECT 1 FROM dbo.vw_UnitBlocking AS b
      WHERE b.UnitID = u.UnitID
        AND b.StartDate <= @EndDate
        AND @StartDate <= b.BlockEnd);
GO

-- Danh muc gia (co so x loai x size) de hien thi bang gia cho khach
CREATE VIEW dbo.vw_FacilityCatalog
AS
SELECT f.FacilityID, f.FacilityName, f.City, f.District, f.Ward,
       t.UnitTypeID, t.TypeName, s.UnitSizeID, s.SizeCode, s.DisplayName AS SizeName,
       s.AreaM2, s.VolumeM3, c.CategoryCode, c.CategoryName,
       rate.MonthlyPrice,
       (SELECT COUNT(*) FROM dbo.StorageUnit AS u
        WHERE u.FacilityID = rate.FacilityID AND u.UnitTypeID = rate.UnitTypeID
          AND u.UnitSizeID = rate.UnitSizeID AND u.Status <> N'Inactive') AS TotalUnits
FROM dbo.RentalRate AS rate
JOIN dbo.Facility AS f ON f.FacilityID = rate.FacilityID
JOIN dbo.UnitType AS t ON t.UnitTypeID = rate.UnitTypeID
JOIN dbo.UnitSize AS s ON s.UnitSizeID = rate.UnitSizeID
JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = s.SizeCategoryID
JOIN dbo.FacilityUnitType AS ft ON ft.FacilityID = rate.FacilityID AND ft.UnitTypeID = rate.UnitTypeID
JOIN dbo.FacilityUnitSize AS fs ON fs.FacilityID = rate.FacilityID AND fs.UnitSizeID = rate.UnitSizeID
WHERE f.Status = N'Active' AND t.IsActive = 1 AND s.IsActive = 1
  AND ft.IsActive = 1 AND fs.IsActive = 1;
GO

-- Size nao dang duoc dung o nhung co so nao (cho man hinh quan ly danh muc)
CREATE VIEW dbo.vw_UnitSizeFacilities
AS
SELECT s.UnitSizeID, s.SizeCode, s.DisplayName, c.CategoryName, s.VolumeM3, s.IsActive AS SizeActive,
       f.FacilityID, f.FacilityName, fs.IsActive AS ActiveAtFacility,
       (SELECT COUNT(*) FROM dbo.StorageUnit AS u
        WHERE u.FacilityID = fs.FacilityID AND u.UnitSizeID = fs.UnitSizeID AND u.Status <> N'Inactive') AS UnitCount
FROM dbo.UnitSize AS s
JOIN dbo.SizeCategory AS c ON c.SizeCategoryID = s.SizeCategoryID
LEFT JOIN dbo.FacilityUnitSize AS fs ON fs.UnitSizeID = s.UnitSizeID
LEFT JOIN dbo.Facility AS f ON f.FacilityID = fs.FacilityID;
GO

-- Loai kho nao dang duoc dung o nhung co so nao
CREATE VIEW dbo.vw_UnitTypeFacilities
AS
SELECT t.UnitTypeID, t.TypeName, t.IsActive AS TypeActive,
       f.FacilityID, f.FacilityName, ft.IsActive AS ActiveAtFacility,
       (SELECT COUNT(*) FROM dbo.StorageUnit AS u
        WHERE u.FacilityID = ft.FacilityID AND u.UnitTypeID = ft.UnitTypeID AND u.Status <> N'Inactive') AS UnitCount
FROM dbo.UnitType AS t
LEFT JOIN dbo.FacilityUnitType AS ft ON ft.UnitTypeID = t.UnitTypeID
LEFT JOIN dbo.Facility AS f ON f.FacilityID = ft.FacilityID;
GO

-- Tong tien cua don (khong luu tong o bang cha de tranh lech voi chi tiet)
CREATE VIEW dbo.vw_ReservationTotals
AS
SELECT r.ReservationID, r.ReservationCode, r.CustomerID, r.FacilityID,
       r.StartDate, r.EndDate, r.RentalPeriod, r.DepositMonths, r.Status,
       SUM(CAST(item.Quantity AS INT)) AS UnitCount,
       SUM(item.Quantity * item.EffectiveMonthlyPrice) AS MonthlyTotal,
       SUM(item.Quantity * item.EffectiveMonthlyPrice) * r.RentalPeriod AS RentTotal,
       SUM(item.Quantity * item.EffectiveMonthlyPrice) * r.DepositMonths AS DepositTotal
FROM dbo.Reservation AS r
JOIN dbo.ReservationItem AS item ON item.ReservationID = r.ReservationID
GROUP BY r.ReservationID, r.ReservationCode, r.CustomerID, r.FacilityID,
         r.StartDate, r.EndDate, r.RentalPeriod, r.DepositMonths, r.Status;
GO

-- Cac kho thuoc hop dong (hop dong 1-1 voi don)
CREATE VIEW dbo.vw_ContractUnits
AS
SELECT c.ContractID, c.ContractNumber, c.ContractStatus, c.StartDate, c.EndDate,
       r.CustomerID, r.FacilityID,
       ru.ReservationUnitID, ru.UnitID, u.UnitNumber, ru.Status AS UnitBookingStatus,
       ru.HandedOverAt, ru.ReturnedOn,
       item.UnitTypeID, item.UnitSizeID, item.EffectiveMonthlyPrice
FROM dbo.Contract AS c
JOIN dbo.Reservation AS r ON r.ReservationID = c.ReservationID
JOIN dbo.ReservationUnit AS ru ON ru.ReservationID = c.ReservationID AND ru.Status <> N'Released'
JOIN dbo.ReservationItem AS item ON item.ReservationItemID = ru.ReservationItemID
JOIN dbo.StorageUnit AS u ON u.UnitID = ru.UnitID;
GO

-- DOANH THU: chi tinh khoan da thu, KHONG tinh tien coc, tru phan da hoan
CREATE VIEW dbo.vw_Revenue
AS
SELECT r.FacilityID, c.ReservationID, c.ChargeID, c.ChargeType,
       u.UnitTypeID,
       CAST(c.PaidAt AS DATE) AS RevenueDate,
       c.Amount - c.RefundedAmount AS NetAmount
FROM dbo.Charge AS c
JOIN dbo.Reservation AS r ON r.ReservationID = c.ReservationID
LEFT JOIN dbo.ReservationUnit AS ru ON ru.ReservationUnitID = c.ReservationUnitID
LEFT JOIN dbo.StorageUnit AS u ON u.UnitID = ru.UnitID
WHERE c.Status = N'Paid' AND c.ChargeType <> N'Deposit';
GO

-- Tien coc dang giu cua tung kho: da thu - da tru phi - da hoan
CREATE VIEW dbo.vw_DepositLedger
AS
SELECT dep.ReservationID, dep.ReservationUnitID, ru.UnitID, ru.Status AS UnitBookingStatus,
       dep.Amount AS DepositAmount, dep.Status AS DepositStatus,
       ISNULL(ded.Deducted, 0) AS Deducted,
       dep.RefundedAmount AS Refunded,
       CASE WHEN dep.Status = N'Paid'
            THEN dep.Amount - ISNULL(ded.Deducted, 0) - dep.RefundedAmount
            ELSE 0 END AS Held
FROM dbo.Charge AS dep
JOIN dbo.ReservationUnit AS ru ON ru.ReservationUnitID = dep.ReservationUnitID
OUTER APPLY (
    SELECT SUM(x.Amount) AS Deducted
    FROM dbo.Charge AS x
    WHERE x.ReservationUnitID = dep.ReservationUnitID
      AND x.SettledFromDeposit = 1 AND x.Status = N'Paid') AS ded
WHERE dep.ChargeType = N'Deposit' AND dep.Status <> N'Cancelled';
GO

-- Ty le su dung hom nay theo co so
CREATE VIEW dbo.vw_FacilityUsageToday
AS
SELECT f.FacilityID, f.FacilityName,
       COUNT(u.UnitID) AS TotalUnits,
       SUM(CASE WHEN occ.IsOccupied = 1 THEN 1 ELSE 0 END) AS OccupiedUnits,
       SUM(CASE WHEN u.Status = N'Maintenance' THEN 1 ELSE 0 END) AS MaintenanceUnits
FROM dbo.Facility AS f
LEFT JOIN dbo.StorageUnit AS u ON u.FacilityID = f.FacilityID AND u.Status <> N'Inactive'
OUTER APPLY (
    SELECT TOP (1) 1 AS IsOccupied
    FROM dbo.vw_UnitBlocking AS b
    WHERE b.UnitID = u.UnitID
      AND b.StartDate <= CAST(SYSUTCDATETIME() AS DATE)
      AND CAST(SYSUTCDATETIME() AS DATE) <= b.BlockEnd) AS occ
GROUP BY f.FacilityID, f.FacilityName;
GO

-- Doi soat: phat hien giao dich "mo coi" / lech trang thai
CREATE VIEW dbo.vw_PaymentReconciliation
AS
-- Tien da ve nhung khoan phai tra chua danh dau Paid
SELECT N'COMPLETED_PAYMENT_UNSETTLED_CHARGE' AS Issue, p.PaymentID, c.ChargeID, p.ReservationID
FROM dbo.Payment AS p
JOIN dbo.Charge AS c ON c.PaymentID = p.PaymentID
WHERE p.Status = N'Completed' AND c.Status <> N'Paid'
UNION ALL
-- Tien da ve cho don da huy / het han ma chua co giao dich hoan
SELECT N'PAYMENT_ON_CLOSED_RESERVATION', p.PaymentID, NULL, p.ReservationID
FROM dbo.Payment AS p
JOIN dbo.Reservation AS r ON r.ReservationID = p.ReservationID
WHERE p.Direction = N'Collection' AND p.Status = N'Completed'
  AND r.Status IN (N'Cancelled', N'Expired')
  AND NOT EXISTS (SELECT 1 FROM dbo.Payment AS rf
                  WHERE rf.ReservationID = p.ReservationID AND rf.Direction = N'Refund'
                    AND rf.Status IN (N'Pending', N'Completed'))
UNION ALL
-- Don van cho thanh toan du coc da duoc thanh toan
SELECT N'RESERVATION_NOT_UPDATED_AFTER_PAYMENT', NULL, NULL, r.ReservationID
FROM dbo.Reservation AS r
WHERE r.Status = N'Pending Payment'
  AND EXISTS (SELECT 1 FROM dbo.Charge AS c
              WHERE c.ReservationID = r.ReservationID AND c.ChargeType = N'Deposit')
  AND NOT EXISTS (SELECT 1 FROM dbo.Charge AS c
                  WHERE c.ReservationID = r.ReservationID AND c.ChargeType = N'Deposit'
                    AND c.Status <> N'Paid');
GO


-- ==============================================================
-- BANG MA LOI CHO POPUP
-- ==============================================================

INSERT INTO AppErrorMessage (ErrorKey, HttpStatus, MessageVi) VALUES
-- Tai khoan
(N'UX_Users_Email', 409, N'Email này đã được sử dụng.'),
(N'UX_Users_Username', 409, N'Tên đăng nhập đã tồn tại.'),
(N'CK_Users_PasswordHash', 500, N'Mật khẩu chưa được mã hóa đúng chuẩn.'),
(N'CK_Users_Email', 400, N'Email không hợp lệ.'),
(N'UX_PendingRegistration_Email', 409, N'Email này đang chờ xác thực. Vui lòng kiểm tra hộp thư hoặc gửi lại mã.'),
(N'UX_EmailVerificationCode_Open', 409, N'Đã có mã xác thực đang hiệu lực. Vui lòng kiểm tra email.'),
-- Co so / danh muc
(N'UX_Facility_UnitCodePrefix', 409, N'Tiền tố mã kho đã được cơ sở khác sử dụng.'),
(N'UX_Facility_FacilityName', 409, N'Tên cơ sở đã tồn tại.'),
(N'CK_Facility_UnitCodePrefix', 400, N'Tiền tố mã kho chỉ gồm chữ và số, tối đa 10 ký tự.'),
(N'UX_FacilityStaff_Facility_User', 409, N'Nhân viên đã được phân công vào cơ sở này.'),
(N'UX_UnitType_TypeName', 409, N'Tên loại kho đã tồn tại. Hãy gán loại có sẵn cho cơ sở thay vì tạo mới.'),
(N'UX_UnitSize_SizeCode', 409, N'Mã size đã tồn tại. Hãy gán size có sẵn cho cơ sở hoặc dùng mã khác.'),
(N'PK_FacilityUnitType', 409, N'Loại kho này đã được gán cho cơ sở.'),
(N'PK_FacilityUnitSize', 409, N'Size này đã được gán cho cơ sở.'),
(N'FK_RentalRate_FacilityUnitType', 400, N'Loại kho chưa được gán cho cơ sở này, hoặc đang có bảng giá nên không thể gỡ.'),
(N'FK_RentalRate_FacilityUnitSize', 400, N'Size chưa được gán cho cơ sở này, hoặc đang có bảng giá nên không thể gỡ.'),
(N'CK_UnitSize_Dimensions', 400, N'Kích thước kho không hợp lệ.'),
(N'UQ_RentalRate_Facility_Type_Size', 409, N'Cơ sở đã có giá cho loại và size này.'),
(N'CK_RentalRate_MonthlyPrice', 400, N'Giá thuê phải lớn hơn 0.'),
(N'UX_StorageUnit_Facility_UnitNumber', 409, N'Mã kho đã tồn tại tại cơ sở này.'),
(N'FK_StorageUnit_RentalRate', 400, N'Chưa có giá thuê cho loại và size này tại cơ sở. Hãy tạo giá trước khi tạo kho.'),
(N'FK_RentalRate_UnitSize', 409, N'Size đang được dùng trong bảng giá, không thể xóa.'),
(N'FK_ReservationUnit_StorageUnit', 409, N'Kho đang có đơn đặt, không thể xóa hoặc đổi loại/size. Hãy chuyển sang Ngừng hoạt động.'),
(N'FK_ReservationItem_RentalRate', 400, N'Loại và size này không có tại cơ sở đã chọn.'),
(N'CK_SizeCategory_VolumeRange', 400, N'Khoảng thể tích không hợp lệ.'),
(N'CK_SizeCategory_PriceRange', 400, N'Khung giá không hợp lệ.'),
(N'CK_RentalPolicy_DepositMonths', 400, N'Tiền cọc chỉ được là 1 hoặc 2 tháng tiền thuê.'),
-- Dat kho
(N'CK_Reservation_RentalPeriod', 400, N'Thời hạn thuê chỉ được chọn 1, 3, 6 hoặc 12 tháng.'),
(N'FK_Reservation_ContractType', 400, N'Thời hạn thuê chỉ được chọn 1, 3, 6 hoặc 12 tháng.'),
(N'CK_Reservation_EndDate', 400, N'Ngày kết thúc không khớp với thời hạn thuê.'),
(N'CK_Reservation_Appointment', 400, N'Lịch hẹn nhận kho phải nằm trong kỳ thuê.'),
(N'CK_ReservationItem_Quantity', 400, N'Số lượng kho mỗi loại phải từ 1 đến 20.'),
(N'UX_ReservationItem_Reservation_Type_Size', 409, N'Loại và size này đã có trong đơn.'),
(N'UX_ReservationUnit_Reservation_Unit', 409, N'Kho này đã có trong đơn.'),
-- Hop dong / ban giao
(N'UX_Contract_Reservation', 409, N'Đơn này đã được bàn giao và tạo hợp đồng trước đó.'),
(N'UX_Contract_ContractNumber', 409, N'Số hợp đồng đã tồn tại.'),
(N'FK_Contract_Reservation', 400, N'Ngày hợp đồng phải trùng với kỳ thuê của đơn.'),
(N'UX_HandoverTask_ReservationUnit_Type', 409, N'Kho này đã có lịch bàn giao/trả kho.'),
(N'FK_HandoverTask_ReservationUnit', 400, N'Kho không thuộc đơn đặt kho này.'),
(N'UX_UnitAccess_Active', 409, N'Kho đã được cấp quyền truy cập loại này.'),
(N'FK_UnitAccess_ReservationUnit', 400, N'Kho không thuộc đơn đặt kho này.'),
-- Thanh toan
(N'UX_Payment_OrderCode', 409, N'Mã đơn thanh toán đã tồn tại.'),
(N'UX_Payment_IdempotencyKey', 409, N'Yêu cầu thanh toán này đã được gửi trước đó.'),
(N'UX_Payment_ProviderTransaction', 409, N'Giao dịch này đã được ghi nhận trước đó.'),
(N'CK_Payment_Completed', 400, N'Giao dịch chưa đủ thông tin xác nhận từ cổng thanh toán.'),
(N'UX_Charge_Deposit', 409, N'Kho này đã có khoản cọc.'),
(N'UX_Charge_Rent_Period', 409, N'Kỳ thuê này đã được tính tiền.');
GO

-- =============================================
-- SEED DATA
-- Moi tai khoan mau co mat khau: 123456 (luu dang hash BCrypt)
-- Thoi gian luu theo UTC (gio VN = UTC + 7)
-- =============================================

USE SelfStorageDB_test;
GO

EXEC sp_set_session_context N'Source', N'seed';
GO

-- 1. Role
SET IDENTITY_INSERT Role ON;
INSERT INTO Role (RoleID, RoleName, Description) VALUES
(1, N'Storage Customer', N'Reserve units, pay fees, check in, and manage rented units'),
(2, N'Facility Staff', N'Support check-in, update unit status, and handle on-site problems'),
(3, N'Facility Manager', N'Manage storage units, staff, and contracts at an assigned facility'),
(4, N'Business Operations Manager', N'Manage all facilities, general policies, pricing, and system-wide reports'),
(5, N'System Administrator', N'Manage user accounts and assign roles within the system');
SET IDENTITY_INSERT Role OFF;
GO

-- 2. Users (PasswordHash = BCrypt cost 11 cua '123456')
SET IDENTITY_INSERT Users ON;
INSERT INTO Users (UserID, RoleID, Username, PasswordHash, FullName, Email, EmailVerified, PhoneNumber, Status) VALUES
(1, 3, N'fac_manager1', N'$2a$11$WevdVfuB0NfM5FGAR424Ge5wnkFWyUDDB75hfeuFG20344kbTG60.', N'Nguyễn Quản Lý Cơ Sở 1', N'fm1@test.com', 1, N'0901000001', N'Active'),
(2, 3, N'fac_manager2', N'$2a$11$V6p9aH0Sr2K9jWdtIPu8h.WsCXUWZH5xY1C.MIulFF4pwWpoz26Wy', N'Trần Quản Lý Cơ Sở 2', N'fm2@test.com', 1, N'0901000002', N'Active'),
(3, 2, N'staff1', N'$2a$11$5vUNIDk.1IszB6hVO8b5/.1WdOb8kB20RNqXjwwcd8gD89rjFr1I6', N'Lê Nhân Viên Một', N'staff1@test.com', 1, N'0902000001', N'Active'),
(4, 2, N'staff2', N'$2a$11$xIPRi/Har6SQwCAtelRbKuc786AWbZUt5HrqWD9Rrl9yIriBeta7O', N'Phạm Nhân Viên Hai', N'staff2@test.com', 1, N'0902000002', N'Active'),
(5, 2, N'staff3', N'$2a$11$OD99/.KgkGK3VkbT/ELXieAHJ2TqTJyaxFwmb71u6YDzjftC3GRUi', N'Hoàng Nhân Viên Ba', N'staff3@test.com', 1, N'0902000003', N'Active'),
(6, 1, N'customer1', N'$2a$11$ST0fSfq/YhEHebJwAvqeSe.nZnzuf9I62QysmaBrL8mZ2D/Wp5iGO', N'Đinh Khách Hàng', N'cust1@test.com', 1, N'0903000001', N'Active'),
(7, 1, N'customer2', N'$2a$11$27bbRuD2nAlQcY.squQKcuN44mEpDndqJsq9EXHIIEP7mJPAjQsge', N'Vũ Khách Hàng', N'cust2@test.com', 1, N'0903000002', N'Active'),
(8, 1, N'customer3', N'$2a$11$cr7/qLThxQP3MBNSbJ/bX.b27wOPowqPiqN.vHn5MS/sAZtkj4182', N'Bùi Khách Hàng', N'cust3@test.com', 1, N'0903000003', N'Active'),
(9, 1, N'customer4', N'$2a$11$l5dxnygwHvNHkrE7u5ml0.E1MSLImWL/OPDjzKqhpqqSyiuJlF5Gi', N'Đỗ Khách Hàng', N'cust4@test.com', 1, N'0903000004', N'Active'),
(10, 4, N'biz_ops_mgr', N'$2a$11$N2/L1iRkRbIAwLhubV71meEVZ9g.IZY5nD0HsjSekbaPtfvcI.W42', N'Lý Vận Hành Tổng', N'ops@test.com', 1, N'0904000001', N'Active'),
(11, 5, N'sys_admin', N'$2a$11$HDFjRM5RTirvAJ2/vEzwhuv5OQOjpw7wT/3ElFEbwmIUwI2pWmepS', N'Quản Trị Viên', N'admin@test.com', 1, N'0905000001', N'Active');
SET IDENTITY_INSERT Users OFF;
GO

-- 3. Ky han thue: chi 1 / 3 / 6 / 12 thang
SET IDENTITY_INSERT ContractType ON;
INSERT INTO ContractType (ContractTypeID, TypeName, RentalMonths, DiscountRate) VALUES
(1, N'1 tháng', 1, 0),
(2, N'3 tháng', 3, 0),
(3, N'6 tháng', 6, 5),
(4, N'12 tháng', 12, 10);
SET IDENTITY_INSERT ContractType OFF;
GO

-- 4. 4 nhom size chuan (BOM chinh khung the tich va khung gia)
SET IDENTITY_INSERT SizeCategory ON;
INSERT INTO SizeCategory (SizeCategoryID, CategoryCode, CategoryName, CodePrefix, StandardHeightM,
                          MinVolumeM3, MaxVolumeM3, MinMonthlyPrice, MaxMonthlyPrice, IsActive) VALUES
(1, N'SMALL',   N'Small',   N'S', 2.50,  2.25,  24.00,  400000, 1000000, 1),
(2, N'MEDIUM',  N'Medium',  N'M', 2.50, 24.01,  48.00,  700000, 1500000, 1),
(3, N'LARGE',   N'Large',   N'L', 2.50, 48.01, 120.00, 1000000, 2500000, 1),
(4, N'VEHICLE', N'Vehicle', N'V', 3.50, 30.00, 200.00, 2000000, 3500000, 1);
SET IDENTITY_INSERT SizeCategory OFF;
GO

-- 5. Chinh sach chung (FacilityID NULL): coc 2 thang, giu kho 15 phut
INSERT INTO RentalPolicy (FacilityID, DepositMonths, HoldMinutes, LateFeePerDay, GracePeriodDays, RenewalNoticeDays)
VALUES (NULL, 2, 15, 50000, 3, 30);

-- Huy >= 7 ngay truoc ngay bat dau: hoan 100%; 3-6 ngay: 50%; duoi 3 ngay: khong hoan
INSERT INTO CancellationRule (RentalPolicyID, DaysBeforeStart, RefundPercent)
SELECT RentalPolicyID, v.DaysBeforeStart, v.RefundPercent
FROM RentalPolicy
CROSS JOIN (VALUES (7, 100), (3, 50), (0, 0)) AS v(DaysBeforeStart, RefundPercent)
WHERE FacilityID IS NULL;
GO

INSERT INTO FeePolicy (FeeCode, FeeName, FeeCategory, ValueType, MinValue, MaxValue) VALUES
(N'LATE_FEE_PER_DAY', N'Phí trễ hạn mỗi ngày', N'LateFee', N'Amount', 0, 200000),
(N'CLEANING_FEE', N'Phí vệ sinh kho khi trả', N'ExtraFee', N'Amount', 0, 500000),
(N'LOCK_REPLACEMENT', N'Phí thay khóa / thẻ bị mất', N'ExtraFee', N'Amount', 0, 1000000),
(N'PROMO_DISCOUNT', N'Giảm giá khuyến mãi', N'Discount', N'Percentage', 0, 20),
(N'FEE_WAIVER', N'Miễn phí theo duyệt', N'FeeWaiver', N'Percentage', 0, 100);
GO

-- 6. Facility (trigger tu tao RentalPolicy + CancellationRule cho tung co so)
-- Dia chi la du lieu mau
SET IDENTITY_INSERT Facility ON;
INSERT INTO Facility (FacilityID, ManagerID, FacilityName, UnitCodePrefix, StreetAddress, Ward, District, City,
                      Latitude, Longitude, ContactPhone, OpeningHours, Description, Status) VALUES
(1, 1, N'Cơ sở Lưu trữ Quận 1', N'Q1', N'123 Lê Lợi', N'Phường Bến Thành', N'Quận 1', N'TP. Hồ Chí Minh',
    10.773100, 106.700800, N'0812345678', N'07:00 - 21:00 hằng ngày', N'Gần chợ Bến Thành, có kho điều hòa.', N'Active'),
(2, 2, N'Cơ sở Lưu trữ Tân Bình', N'TB', N'456 Cộng Hòa', N'Phường 13', N'Tân Bình', N'TP. Hồ Chí Minh',
    10.801500, 106.652000, N'0812345679', N'07:00 - 21:00 hằng ngày', N'Gần sân bay Tân Sơn Nhất.', N'Active'),
(3, 1, N'Cơ sở Lưu trữ Thủ Đức', N'TD', N'123 Võ Văn Ngân', N'Phường Linh Chiểu', N'Thủ Đức', N'TP. Hồ Chí Minh',
    10.850600, 106.771900, N'0812345680', N'06:00 - 22:00 hằng ngày', N'Bãi xe rộng, phù hợp kho xe.', N'Active'),
(4, 2, N'Cơ sở Lưu trữ Quận 2', N'Q2', N'456 Trần Não', N'Phường Bình An', N'Quận 2', N'TP. Hồ Chí Minh',
    10.796000, 106.734000, N'0812345681', N'07:00 - 21:00 hằng ngày', NULL, N'Active'),
(5, 1, N'Cơ sở Lưu trữ Quận 3', N'Q3', N'789 Cách Mạng Tháng 8', N'Phường Võ Thị Sáu', N'Quận 3', N'TP. Hồ Chí Minh',
    10.784500, 106.684000, N'0812345682', N'07:00 - 21:00 hằng ngày', NULL, N'Active');
SET IDENTITY_INSERT Facility OFF;
GO

-- 7. FacilityStaff
SET IDENTITY_INSERT FacilityStaff ON;
INSERT INTO FacilityStaff (AssignmentID, FacilityID, UserID, AssignedDate, Status) VALUES
(1, 1, 3, '2026-01-01', N'Active'),
(2, 1, 4, '2026-01-15', N'Active'),
(3, 2, 5, '2026-02-01', N'Active');
SET IDENTITY_INSERT FacilityStaff OFF;
GO

-- 8. UnitType (dung chung)
SET IDENTITY_INSERT UnitType ON;
INSERT INTO UnitType (UnitTypeID, TypeName, Description) VALUES
(1, N'Climate-Control Unit', N'Kho có thể điều chỉnh nhiệt độ, nằm trong nhà'),
(2, N'Drive-up Unit', N'Kho ngoài trời, xe vào tận nơi'),
(3, N'Basic Unit', N'Kho ngoài trời tiêu chuẩn'),
(4, N'Indoor Unit', N'Kho trong nhà, có hành lang');
SET IDENTITY_INSERT UnitType OFF;
GO

-- 9. UnitSize (danh muc chung). Chieu cao theo nhom: S/M/L 2.5m, V 3.5m.
-- S4 do Facility Manager Q1 tao them (nhom Small, 22.5 m3), sau do Thu Duc cung dung.
SET IDENTITY_INSERT UnitSize ON;
INSERT INTO UnitSize (UnitSizeID, SizeCategoryID, SizeCode, DisplayName, WidthM, LengthM, HeightM, CreatedByUserID) VALUES
(1,  1, N'S1', N'Tủ nhỏ 1.5 x 1.5 m', 1.50,  1.50, 2.50, NULL),   --   5.63 m3
(2,  1, N'S2', N'Kho 2 x 2 m',        2.00,  2.00, 2.50, NULL),   --  10.00 m3
(3,  1, N'S3', N'Kho 2 x 4 m',        2.00,  4.00, 2.50, NULL),   --  20.00 m3
(4,  2, N'M1', N'Kho 2 x 6 m',        2.00,  6.00, 2.50, NULL),   --  30.00 m3
(5,  2, N'M2', N'Kho 4 x 4 m',        4.00,  4.00, 2.50, NULL),   --  40.00 m3
(6,  3, N'L1', N'Kho 4 x 6 m',        4.00,  6.00, 2.50, NULL),   --  60.00 m3
(7,  3, N'L2', N'Kho 4 x 8 m',        4.00,  8.00, 2.50, NULL),   --  80.00 m3
(8,  3, N'L3', N'Kho 4 x 10 m',       4.00, 10.00, 2.50, NULL),   -- 100.00 m3
(9,  4, N'V1', N'Kho xe 8 x 4 m',     8.00,  4.00, 3.50, NULL),   -- 112.00 m3
(10, 1, N'S4', N'Kho 2 x 4.5 m',      2.00,  4.50, 2.50, 1);      --  22.50 m3
SET IDENTITY_INSERT UnitSize OFF;
GO

-- Gan loai kho / size cho co so (nhieu - nhieu)
-- Moi co so dung ca 4 loai kho va 9 size chuan
INSERT INTO FacilityUnitType (FacilityID, UnitTypeID)
SELECT f.FacilityID, t.UnitTypeID FROM Facility AS f CROSS JOIN UnitType AS t;

INSERT INTO FacilityUnitSize (FacilityID, UnitSizeID)
SELECT f.FacilityID, s.UnitSizeID FROM Facility AS f CROSS JOIN UnitSize AS s
WHERE s.UnitSizeID <= 9;

-- S4 dung chung o 2 co so: Quan 1 (tao ra) va Thu Duc
INSERT INTO FacilityUnitSize (FacilityID, UnitSizeID, AddedByUserID) VALUES
(1, 10, 1),
(3, 10, 1);
GO

-- 10. Bang gia + kho. Gia chi nam o RentalRate.
CREATE TABLE #SeedUnit (
    UnitID INT, FacilityID INT, UnitTypeID INT, UnitSizeID INT,
    UnitNumber NVARCHAR(50), MonthlyPrice DECIMAL(12,2), Status NVARCHAR(30));

INSERT INTO #SeedUnit VALUES
(1, 1, 1, 1, N'Q1-U01', 400000, N'Available'),
(2, 1, 1, 2, N'Q1-U02', 500000, N'Available'),
(3, 1, 4, 4, N'Q1-U03', 800000, N'Available'),
(4, 1, 4, 5, N'Q1-U04', 1000000, N'In Use'),
(5, 1, 3, 2, N'Q1-U05', 400000, N'Available'),
(6, 1, 3, 3, N'Q1-U06', 600000, N'Available'),
(7, 1, 2, 8, N'Q1-U07', 2000000, N'Available'),
(8, 1, 2, 9, N'Q1-U08', 2500000, N'Available'),
(9, 1, 1, 3, N'Q1-U09', 700000, N'Maintenance'),
(10, 1, 4, 6, N'Q1-U10', 1200000, N'Available'),
(11, 2, 1, 1, N'TB-U01', 400000, N'Available'),
(12, 2, 1, 2, N'TB-U02', 450000, N'Available'),
(13, 2, 3, 4, N'TB-U03', 750000, N'In Use'),
(14, 2, 4, 5, N'TB-U04', 900000, N'Available'),
(15, 2, 3, 2, N'TB-U05', 400000, N'Available'),
(16, 2, 3, 3, N'TB-U06', 550000, N'Available'),
(17, 2, 2, 8, N'TB-U07', 1800000, N'Available'),
(18, 2, 2, 9, N'TB-U08', 2200000, N'Available'),
(19, 2, 4, 6, N'TB-U09', 1100000, N'Available'),
(20, 2, 1, 3, N'TB-U10', 650000, N'Available'),
(21, 3, 1, 1, N'TD-U01', 400000, N'Available'),
(22, 3, 1, 2, N'TD-U02', 500000, N'Available'),
(23, 3, 4, 4, N'TD-U03', 800000, N'Available'),
(24, 3, 4, 5, N'TD-U04', 1000000, N'Available'),
(25, 3, 3, 2, N'TD-U05', 400000, N'Available'),
(26, 3, 3, 3, N'TD-U06', 600000, N'Available'),
(27, 3, 2, 8, N'TD-U07', 2000000, N'Available'),
(28, 3, 2, 9, N'TD-U08', 2500000, N'Available'),
(29, 3, 1, 3, N'TD-U09', 700000, N'Available'),
(30, 3, 4, 6, N'TD-U10', 1200000, N'Available'),
(31, 4, 1, 1, N'Q2-U01', 400000, N'Available'),
(32, 4, 1, 2, N'Q2-U02', 550000, N'Available'),
(33, 4, 4, 4, N'Q2-U03', 850000, N'Available'),
(34, 4, 4, 5, N'Q2-U04', 1050000, N'Available'),
(35, 4, 3, 2, N'Q2-U05', 450000, N'Available'),
(36, 4, 3, 3, N'Q2-U06', 650000, N'Available'),
(37, 4, 2, 8, N'Q2-U07', 2100000, N'Available'),
(38, 4, 2, 9, N'Q2-U08', 2600000, N'Available'),
(39, 4, 1, 3, N'Q2-U09', 750000, N'Available'),
(40, 4, 4, 6, N'Q2-U10', 1250000, N'Available'),
(41, 5, 1, 1, N'Q3-U01', 400000, N'Available'),
(42, 5, 1, 2, N'Q3-U02', 600000, N'Available'),
(43, 5, 4, 4, N'Q3-U03', 900000, N'Available'),
(44, 5, 4, 5, N'Q3-U04', 1100000, N'Available'),
(45, 5, 3, 2, N'Q3-U05', 500000, N'Available'),
(46, 5, 3, 3, N'Q3-U06', 700000, N'Available'),
(47, 5, 2, 8, N'Q3-U07', 2200000, N'Available'),
(48, 5, 2, 9, N'Q3-U08', 2700000, N'Available'),
(49, 5, 1, 3, N'Q3-U09', 800000, N'Available'),
(50, 5, 4, 6, N'Q3-U10', 1300000, N'Available'),
(51, 1, 1, 10, N'Q1-U11', 900000, N'Available'),   -- size S4 tai Quan 1
(52, 3, 3, 10, N'TD-U11', 650000, N'Available');   -- cung size S4 tai Thu Duc

INSERT INTO RentalRate (FacilityID, UnitTypeID, UnitSizeID, MonthlyPrice)
SELECT FacilityID, UnitTypeID, UnitSizeID, MAX(MonthlyPrice)
FROM #SeedUnit
GROUP BY FacilityID, UnitTypeID, UnitSizeID;

SET IDENTITY_INSERT StorageUnit ON;
INSERT INTO StorageUnit (UnitID, FacilityID, UnitTypeID, UnitSizeID, UnitNumber, Floor, Zone, LocationNote, Status)
SELECT UnitID, FacilityID, UnitTypeID, UnitSizeID, UnitNumber,
       CASE UnitTypeID WHEN 1 THEN N'Tầng 1' WHEN 4 THEN N'Tầng 1'
                       WHEN 3 THEN N'Ngoài trời' ELSE N'Bãi xe' END,
       CASE UnitTypeID WHEN 1 THEN N'Dãy A' WHEN 4 THEN N'Dãy B'
                       WHEN 3 THEN N'Dãy C' ELSE N'Dãy D' END,
       CASE UnitTypeID WHEN 1 THEN N'Khu điều hòa' WHEN 4 THEN N'Trong nhà, có hành lang'
                       WHEN 3 THEN N'Ngoài trời' ELSE N'Xe vào tận cửa kho' END,
       Status
FROM #SeedUnit;
SET IDENTITY_INSERT StorageUnit OFF;

DROP TABLE #SeedUnit;
GO

-- 11. Reservation
-- #1: 1 kho Q1-U04 (Indoor M2), 3 thang, 1.000.000/thang, khong giam
--     -> thue 3.000.000, coc 2 thang = 2.000.000. Da ban giao.
-- #2: 1 kho TB-U03 (Basic M1), 12 thang, 750.000 giam 10% = 675.000/thang
--     -> thue 8.100.000, coc 2 thang = 1.350.000. Da ban giao.
-- #3: 2 kho Q1-U02 (Climate S2) + Q1-U05 (Basic S2), 6 thang, giam 5%
--     -> 475.000 + 380.000 = 855.000/thang, thue 5.130.000, coc 1.710.000.
--     Da thanh toan coc + thang dau, da phan kho, cho ban giao 15/11.
SET IDENTITY_INSERT Reservation ON;
INSERT INTO Reservation (ReservationID, ReservationCode, CustomerID, FacilityID, StartDate, RentalPeriod, EndDate,
                         DepositMonths, HoldExpiresAt, AppointmentDate, AppointmentTime, Status,
                         CreatedAt, PaidAt, ConfirmedAt, ConfirmedByUserID) VALUES
(1, N'RS-2026-00001', 6, 1, '2026-09-01', 3,  '2026-11-30', 2, '2026-08-29 02:15', '2026-09-01', '09:00', N'Handed Over',
    '2026-08-29 02:00', '2026-08-29 02:06', '2026-08-29 03:00', 1),
(2, N'RS-2026-00002', 7, 2, '2026-09-10', 12, '2027-09-09', 2, '2026-09-05 07:15', '2026-09-10', '14:00', N'Handed Over',
    '2026-09-05 07:00', '2026-09-05 07:06', '2026-09-05 08:00', 2),
(3, N'RS-2026-00003', 8, 1, '2026-11-15', 6,  '2027-05-14', 2, '2026-10-20 03:15', '2026-11-15', '10:00', N'Confirmed',
    '2026-10-20 03:00', '2026-10-20 03:05', '2026-10-20 04:00', 1);
SET IDENTITY_INSERT Reservation OFF;
GO

-- Gia snapshot lay tu RentalRate, giam gia lay tu ContractType theo so thang
INSERT INTO ReservationItem (ReservationID, FacilityID, UnitTypeID, UnitSizeID, Quantity,
                             MonthlyPrice, DiscountPercent, CreatedAt)
SELECT r.ReservationID, r.FacilityID, v.UnitTypeID, v.UnitSizeID, v.Quantity,
       rate.MonthlyPrice, ct.DiscountRate, r.CreatedAt
FROM (VALUES (1, 4, 5, 1),
             (2, 3, 4, 1),
             (3, 1, 2, 1),
             (3, 3, 2, 1)) AS v(ReservationID, UnitTypeID, UnitSizeID, Quantity)
JOIN Reservation AS r ON r.ReservationID = v.ReservationID
JOIN RentalRate AS rate
  ON rate.FacilityID = r.FacilityID AND rate.UnitTypeID = v.UnitTypeID AND rate.UnitSizeID = v.UnitSizeID
JOIN ContractType AS ct ON ct.RentalMonths = r.RentalPeriod;
GO

INSERT INTO ReservationUnit (ReservationID, ReservationItemID, FacilityID, UnitID, UnitTypeID, UnitSizeID,
                             Status, AssignedAt, HandedOverAt)
SELECT r.ReservationID, item.ReservationItemID, u.FacilityID, u.UnitID, u.UnitTypeID, u.UnitSizeID,
       v.Status, r.CreatedAt, v.HandedOverAt
FROM (VALUES (1, 4,  N'Active', CAST('2026-09-01 03:00' AS DATETIME2)),
             (2, 13, N'Active', CAST('2026-09-10 08:00' AS DATETIME2)),
             (3, 2,  N'Held',   CAST(NULL AS DATETIME2)),
             (3, 5,  N'Held',   CAST(NULL AS DATETIME2))) AS v(ReservationID, UnitID, Status, HandedOverAt)
JOIN Reservation AS r ON r.ReservationID = v.ReservationID
JOIN StorageUnit AS u ON u.UnitID = v.UnitID
JOIN ReservationItem AS item
  ON item.ReservationID = r.ReservationID AND item.UnitTypeID = u.UnitTypeID AND item.UnitSizeID = u.UnitSizeID;
GO

-- 12. Charge: coc (DepositMonths x gia/thang sau giam) + tien thue tung thang cho tung kho
INSERT INTO Charge (ReservationID, ReservationUnitID, ChargeType, Description, Amount, DueDate, CreatedAt)
SELECT ru.ReservationID, ru.ReservationUnitID, N'Deposit',
       CONCAT(N'Tiền cọc ', r.DepositMonths, N' tháng - kho ', u.UnitNumber),
       item.EffectiveMonthlyPrice * r.DepositMonths,
       CAST(r.CreatedAt AS DATE), r.CreatedAt
FROM ReservationUnit AS ru
JOIN Reservation AS r ON r.ReservationID = ru.ReservationID
JOIN ReservationItem AS item ON item.ReservationItemID = ru.ReservationItemID
JOIN StorageUnit AS u ON u.UnitID = ru.UnitID
WHERE ru.Status <> N'Released';

INSERT INTO Charge (ReservationID, ReservationUnitID, ChargeType, Description,
                    PeriodStart, PeriodEnd, Amount, DueDate, CreatedAt)
SELECT ru.ReservationID, ru.ReservationUnitID, N'Rent',
       CONCAT(N'Tiền thuê tháng ', m.n + 1, N' - kho ', u.UnitNumber),
       DATEADD(MONTH, m.n, r.StartDate),
       DATEADD(DAY, -1, DATEADD(MONTH, m.n + 1, r.StartDate)),
       item.EffectiveMonthlyPrice,
       CASE WHEN m.n = 0 THEN CAST(r.CreatedAt AS DATE) ELSE DATEADD(MONTH, m.n, r.StartDate) END,
       r.CreatedAt
FROM ReservationUnit AS ru
JOIN Reservation AS r ON r.ReservationID = ru.ReservationID
JOIN ReservationItem AS item ON item.ReservationItemID = ru.ReservationItemID
JOIN StorageUnit AS u ON u.UnitID = ru.UnitID
JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) AS m(n) ON m.n < r.RentalPeriod
WHERE ru.Status <> N'Released';
GO

-- 13. Payment (gia lap): tao Pending -> gan Charge -> cong bao Completed -> Charge Paid
-- Luc dat kho khach tra: toan bo tien coc + tien thue thang dau.
CREATE TABLE #SeedPay (
    PaymentID INT, ReservationID INT, IncludeDeposit BIT, RentPeriodStart DATE,
    CreatedAt DATETIME2, ConfirmedAt DATETIME2, ProviderTxn NVARCHAR(100), Method NVARCHAR(50));

INSERT INTO #SeedPay VALUES
(1, 1, 1, '2026-09-01', '2026-08-29 02:05', '2026-08-29 02:06', N'SIM-20260829-000001', N'QR'),
(2, 2, 1, '2026-09-10', '2026-09-05 07:05', '2026-09-05 07:06', N'SIM-20260905-000002', N'QR'),
(3, 1, 0, '2026-10-01', '2026-10-01 02:00', '2026-10-01 02:01', N'SIM-20261001-000003', N'QR'),
(4, 2, 0, '2026-10-10', '2026-10-10 02:00', '2026-10-10 02:01', N'SIM-20261010-000004', N'QR'),
(5, 3, 1, '2026-11-15', '2026-10-20 03:04', '2026-10-20 03:05', N'SIM-20261020-000005', N'QR');

SET IDENTITY_INSERT Payment ON;
INSERT INTO Payment (PaymentID, ReservationID, OrderCode, IdempotencyKey, Provider, Direction,
                     Amount, PaymentMethod, Status, CreatedAt, ExpiresAt)
SELECT p.PaymentID, p.ReservationID,
       CONCAT(N'ORD-', RIGHT(CONCAT(N'000000', p.PaymentID), 6)),
       CONCAT(N'PAY-', p.ReservationID, N'-', p.PaymentID),
       N'Simulator', N'Collection',
       (SELECT SUM(c.Amount) FROM Charge AS c
        WHERE c.ReservationID = p.ReservationID
          AND ((c.ChargeType = N'Deposit' AND p.IncludeDeposit = 1) OR
               (c.ChargeType = N'Rent' AND c.PeriodStart = p.RentPeriodStart))),
       p.Method, N'Pending', p.CreatedAt, DATEADD(MINUTE, 15, p.CreatedAt)
FROM #SeedPay AS p;
SET IDENTITY_INSERT Payment OFF;

UPDATE c
SET PaymentID = p.PaymentID
FROM Charge AS c
JOIN #SeedPay AS p ON p.ReservationID = c.ReservationID
WHERE (c.ChargeType = N'Deposit' AND p.IncludeDeposit = 1)
   OR (c.ChargeType = N'Rent' AND c.PeriodStart = p.RentPeriodStart);

UPDATE pay
SET Status = N'Completed', ProviderTransactionId = p.ProviderTxn,
    ReceivedAmount = pay.Amount, ConfirmedAt = p.ConfirmedAt
FROM Payment AS pay
JOIN #SeedPay AS p ON p.PaymentID = pay.PaymentID;

UPDATE c
SET Status = N'Paid', PaidAt = pay.ConfirmedAt
FROM Charge AS c
JOIN Payment AS pay ON pay.PaymentID = c.PaymentID
WHERE pay.Status = N'Completed';

DROP TABLE #SeedPay;
GO

-- Nhat ky callback: cong gui ket qua cua giao dich #5 hai lan -> lan 2 la Duplicate
INSERT INTO PaymentCallbackLog (PaymentID, Provider, OrderCode, ProviderTransactionId, ReportedStatus,
                                ReportedAmount, Payload, SignatureValid, ReceivedAt, ProcessResult, Note)
SELECT p.PaymentID, p.Provider, p.OrderCode, p.ProviderTransactionId, N'Completed', p.Amount,
       NULL, 1, v.ReceivedAt, v.Result, v.Note
FROM Payment AS p
CROSS JOIN (VALUES (CAST('2026-10-20 03:05' AS DATETIME2), N'Applied',   N'Ghi nhận thanh toán'),
                   (CAST('2026-10-20 03:07' AS DATETIME2), N'Duplicate', N'Đã ghi nhận trước đó, bỏ qua')) AS v(ReceivedAt, Result, Note)
WHERE p.PaymentID = 5;
GO

-- 14. Contract (tao luc ban giao)
SET IDENTITY_INSERT Contract ON;
INSERT INTO Contract (ContractID, ContractNumber, ReservationID, StartDate, EndDate, ContractStatus, CreatedAt, CreatedByUserID) VALUES
(1, N'HD-2026-00001', 1, '2026-09-01', '2026-11-30', N'Active', '2026-09-01 03:00', 3),
(2, N'HD-2026-00002', 2, '2026-09-10', '2027-09-09', N'Active', '2026-09-10 08:00', 5);
SET IDENTITY_INSERT Contract OFF;
GO

-- 15. UnitAccess (cap sau khi ban giao)
INSERT INTO UnitAccess (ReservationUnitID, ReservationID, UnitID, UserID, AccessType, AccessValue,
                        IssuedAt, IssuedByUserID, Status)
SELECT ru.ReservationUnitID, ru.ReservationID, ru.UnitID, r.CustomerID, N'Smart Lock', v.AccessValue,
       ru.HandedOverAt, v.IssuedBy, N'Active'
FROM (VALUES (1, 4, N'123456', 3), (2, 13, N'654321', 5)) AS v(ReservationID, UnitID, AccessValue, IssuedBy)
JOIN ReservationUnit AS ru ON ru.ReservationID = v.ReservationID AND ru.UnitID = v.UnitID
JOIN Reservation AS r ON r.ReservationID = ru.ReservationID;
GO

-- 16. HandoverTask
INSERT INTO HandoverTask (TaskType, FacilityID, UnitID, ReservationUnitID, ReservationID,
                          AssignedStaffID, AssignedByID, ScheduledDate, ScheduledTime, ActualAt,
                          UnitConditionNotes, ConditionResult, Status, CreatedAt)
SELECT N'Move In', ru.FacilityID, ru.UnitID, ru.ReservationUnitID, ru.ReservationID,
       v.StaffID, v.ManagerID, r.AppointmentDate, r.AppointmentTime, ru.HandedOverAt,
       v.Notes, v.Result, v.Status, r.ConfirmedAt
FROM (VALUES
        (1, 4,  3, 1, N'Kho đã được dọn sạch, hệ thống đèn hoạt động tốt', N'Good', N'Completed'),
        (2, 13, 5, 2, N'Bàn giao chìa khóa phụ và thẻ từ, kho sạch sẽ',    N'Good', N'Completed'),
        (3, 2,  4, 1, NULL, NULL, N'Scheduled'),
        (3, 5,  4, 1, NULL, NULL, N'Scheduled')) AS v(ReservationID, UnitID, StaffID, ManagerID, Notes, Result, Status)
JOIN ReservationUnit AS ru ON ru.ReservationID = v.ReservationID AND ru.UnitID = v.UnitID
JOIN Reservation AS r ON r.ReservationID = ru.ReservationID;
GO

-- 17. SupportRequest mau (Flow 7)
INSERT INTO SupportRequest (CustomerID, FacilityID, UnitID, ContractID, Category, Description, Status, CreatedAt)
VALUES (6, 1, 4, 1, N'Lock', N'Khóa thông minh phản hồi chậm khi nhập mã.', N'Open', '2026-10-25 02:30');
GO

-- 18. UserActivityLog (lich su dang nhap doc tu Action = 'Login')
SET IDENTITY_INSERT UserActivityLog ON;
INSERT INTO UserActivityLog (LogID, UserID, Action, IPAddress, [Timestamp], Details) VALUES
(1, 6, N'Login', N'127.0.0.1', '2026-08-29 01:58', NULL),
(2, 6, N'Created Reservation', N'127.0.0.1', '2026-08-29 02:00', N'Khách hàng tạo đơn RS-2026-00001 (Q1-U04)'),
(3, 1, N'Login', N'127.0.0.1', '2026-08-29 02:55', NULL),
(4, 1, N'Confirmed Reservation', N'127.0.0.1', '2026-08-29 03:00', N'Quản lý cơ sở xác nhận đơn RS-2026-00001'),
(5, 3, N'Login', N'127.0.0.1', '2026-09-01 02:50', NULL),
(6, 3, N'Completed Handover', N'127.0.0.1', '2026-09-01 03:00', N'Nhân viên bàn giao kho Q1-U04 cho khách'),
(7, 8, N'Login', N'127.0.0.1', '2026-10-20 02:58', NULL),
(8, 8, N'Created Reservation', N'127.0.0.1', '2026-10-20 03:00', N'Khách hàng tạo đơn RS-2026-00003 (2 kho)');
SET IDENTITY_INSERT UserActivityLog OFF;
GO

EXEC sp_set_session_context N'Source', NULL;
GO
