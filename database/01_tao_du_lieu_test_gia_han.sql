/*
 * DỮ LIỆU TEST GIA HẠN HỢP ĐỒNG  (chạy trong SSMS, database SelfStorageDB_test)
 *
 * Tạo 1 đơn thuê kho ĐANG THUÊ (đã cọc, đã ký, đã nhận kho) sắp hết hạn để test nút "Gia hạn".
 * Database chỉ cho thuê theo tháng (1/3/6/12), nên đơn test là đơn 1 tháng, bắt đầu từ ~3 tuần trước
 * và hết hạn sau @DaysLeft ngày.
 *   - @DaysLeft = 10 (mặc định): còn trong hạn gia hạn (chính sách mặc định: gia hạn trước hạn ít nhất 7 ngày).
 *   - @DaysLeft = 1..6        : để test trường hợp "Chưa thể gia hạn" (quá hạn chót).
 *
 * Mọi bản ghi được đánh dấu bằng mã đơn 'RS-TEST-GIAHAN' / hợp đồng 'HD-TEST-GIAHAN'.
 * Xóa sạch bằng file 02_xoa_du_lieu_test_gia_han.sql (xóa cả các đơn gia hạn GH-... tạo ra khi test).
 * Không sửa bảng kho (StorageUnit), bảng giá, chính sách hay dữ liệu của khách khác.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @CustomerEmail NVARCHAR(255) = NULL;   -- email khách để test; NULL = lấy khách đầu tiên đang hoạt động
DECLARE @UnitNumber    NVARCHAR(50)  = NULL;   -- mã kho muốn dùng (vd 'TD-U05'); NULL = tự chọn kho trống
DECLARE @DaysLeft      INT           = 10;     -- số ngày còn lại trước khi hết hạn

DECLARE @Code NVARCHAR(20) = N'RS-TEST-GIAHAN', @ContractNumber NVARCHAR(30) = N'HD-TEST-GIAHAN';

IF EXISTS (SELECT 1 FROM Reservation WHERE ReservationCode = @Code)
BEGIN
    RAISERROR(N'Đã có dữ liệu test. Chạy 02_xoa_du_lieu_test_gia_han.sql trước rồi tạo lại.', 16, 1);
    RETURN;
END;

-- Khách
DECLARE @CustomerID INT, @CustomerName NVARCHAR(100);
SELECT TOP 1 @CustomerID = u.UserID, @CustomerEmail = u.Email, @CustomerName = u.FullName
FROM Users u JOIN Role r ON r.RoleID = u.RoleID
WHERE r.RoleName = N'Storage Customer' AND u.Status = N'Active'
  AND (@CustomerEmail IS NULL OR u.Email = @CustomerEmail)
ORDER BY u.UserID;
IF @CustomerID IS NULL BEGIN RAISERROR(N'Không tìm thấy tài khoản khách hàng đang hoạt động (kiểm tra @CustomerEmail).', 16, 1); RETURN; END;

-- Ngày: đơn 1 tháng, hết hạn sau khoảng @DaysLeft ngày (đúng CK_Reservation_EndDate)
DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
DECLARE @Start DATE = DATEADD(MONTH, -1, DATEADD(DAY, @DaysLeft + 1, @Today));
DECLARE @End   DATE = DATEADD(DAY, -1, DATEADD(MONTH, 1, @Start));

-- Kho: đang hoạt động, cơ sở đang hoạt động, không có đơn nào đang giữ / đang thuê (kể cả sau này, để gia hạn được)
DECLARE @UnitID INT, @FacilityID INT, @UnitTypeID INT, @UnitSizeID INT, @Price DECIMAL(12,2), @UnitNo NVARCHAR(50);
SELECT TOP 1 @UnitID = su.UnitID, @FacilityID = su.FacilityID, @UnitTypeID = su.UnitTypeID,
       @UnitSizeID = su.UnitSizeID, @Price = rr.MonthlyPrice, @UnitNo = su.UnitNumber
FROM StorageUnit su
JOIN Facility f ON f.FacilityID = su.FacilityID AND f.Status = N'Active'
JOIN RentalRate rr ON rr.FacilityID = su.FacilityID AND rr.UnitTypeID = su.UnitTypeID AND rr.UnitSizeID = su.UnitSizeID
JOIN UnitType t ON t.UnitTypeID = su.UnitTypeID AND t.IsActive = 1
JOIN UnitSize s ON s.UnitSizeID = su.UnitSizeID AND s.IsActive = 1
WHERE su.Status = N'Available'
  AND (@UnitNumber IS NULL OR su.UnitNumber = @UnitNumber)
  AND NOT EXISTS (
      SELECT 1 FROM ReservationUnit ru JOIN Reservation r ON r.ReservationID = ru.ReservationID
      WHERE ru.UnitID = su.UnitID AND ru.Status IN (N'Held', N'Active')
        AND r.Status IN (N'Pending Payment', N'Paid', N'Confirmed', N'Handed Over'))
  AND NOT EXISTS (SELECT 1 FROM UnitAccess ua WHERE ua.UnitID = su.UnitID AND ua.Status = N'Active')
ORDER BY rr.MonthlyPrice, su.UnitID;
IF @UnitID IS NULL BEGIN RAISERROR(N'Không tìm được kho trống phù hợp (kiểm tra @UnitNumber).', 16, 1); RETURN; END;

-- Số tháng cọc theo chính sách của cơ sở (không có thì 2 tháng)
DECLARE @DepositMonths TINYINT = ISNULL((
    SELECT TOP 1 CAST(p.DepositMonths AS TINYINT) FROM RentalPolicy p
    WHERE p.FacilityID = @FacilityID OR p.FacilityID IS NULL
    ORDER BY CASE WHEN p.FacilityID IS NULL THEN 1 ELSE 0 END), 2);
IF @DepositMonths NOT BETWEEN 1 AND 2 SET @DepositMonths = 2;

DECLARE @CreatedAt DATETIME2 = DATEADD(HOUR, 9, CAST(DATEADD(DAY, -1, @Start) AS DATETIME2));
DECLARE @Deposit DECIMAL(12,2) = @Price * @DepositMonths;

BEGIN TRANSACTION;

    -- 1) Đơn chờ thanh toán + dòng yêu cầu + kho giữ + khoản cọc, tiền thuê
    INSERT INTO Reservation (ReservationCode, CustomerID, FacilityID, StartDate, RentalPeriod, EndDate, DepositMonths,
                             HoldExpiresAt, Status, CreatedAt)
    VALUES (@Code, @CustomerID, @FacilityID, @Start, 1, @End, @DepositMonths,
            DATEADD(MINUTE, 15, @CreatedAt), N'Pending Payment', @CreatedAt);
    DECLARE @ReservationID INT = SCOPE_IDENTITY();

    INSERT INTO ReservationItem (ReservationID, FacilityID, UnitTypeID, UnitSizeID, Quantity, MonthlyPrice, DiscountPercent, CreatedAt)
    VALUES (@ReservationID, @FacilityID, @UnitTypeID, @UnitSizeID, 1, @Price, 0, @CreatedAt);
    DECLARE @ItemID BIGINT = SCOPE_IDENTITY();

    INSERT INTO ReservationUnit (ReservationID, ReservationItemID, FacilityID, UnitID, UnitTypeID, UnitSizeID, Status, AssignedAt)
    VALUES (@ReservationID, @ItemID, @FacilityID, @UnitID, @UnitTypeID, @UnitSizeID, N'Held', @CreatedAt);
    DECLARE @RUID BIGINT = SCOPE_IDENTITY();

    INSERT INTO Charge (ReservationID, ReservationUnitID, ChargeType, Description, Amount, DueDate, Status, CreatedAt)
    VALUES (@ReservationID, @RUID, N'Deposit', CONCAT(N'[TEST] Tiền cọc ', @DepositMonths, N' tháng - kho ', @UnitNo), @Deposit, @Start, N'Unpaid', @CreatedAt);
    INSERT INTO Charge (ReservationID, ReservationUnitID, ChargeType, Description, PeriodStart, PeriodEnd, Amount, DueDate, Status, CreatedAt)
    VALUES (@ReservationID, @RUID, N'Rent', CONCAT(N'[TEST] Tiền thuê tháng 1 - kho ', @UnitNo), @Start, @End, @Price, @Start, N'Unpaid', @CreatedAt);

    -- 2) Thanh toán (mô phỏng): Pending -> gắn khoản -> Completed -> khoản Paid  (đúng thứ tự trigger)
    INSERT INTO Payment (ReservationID, OrderCode, IdempotencyKey, Provider, Direction, Amount, PaymentMethod, Status, CreatedAt)
    VALUES (@ReservationID, N'TEST-GIAHAN-PAY', N'TEST-GIAHAN-PAY', N'Simulator', N'Collection', @Deposit + @Price, N'QR', N'Pending', @CreatedAt);
    DECLARE @PaymentID INT = SCOPE_IDENTITY();

    UPDATE Charge SET PaymentID = @PaymentID WHERE ReservationID = @ReservationID;
    UPDATE Payment SET Status = N'Completed', ProviderTransactionId = N'TEST-GIAHAN-TXN', ReceivedAmount = Amount,
                       ConfirmedAt = DATEADD(MINUTE, 3, @CreatedAt)
    WHERE PaymentID = @PaymentID;
    UPDATE Charge SET Status = N'Paid', PaidAt = DATEADD(MINUTE, 3, @CreatedAt) WHERE ReservationID = @ReservationID;

    -- 3) Paid -> Confirmed -> hợp đồng -> bàn giao kho -> Handed Over
    UPDATE Reservation SET Status = N'Paid', PaidAt = DATEADD(MINUTE, 3, @CreatedAt) WHERE ReservationID = @ReservationID;
    UPDATE Reservation SET Status = N'Confirmed', ConfirmedAt = DATEADD(MINUTE, 4, @CreatedAt) WHERE ReservationID = @ReservationID;

    INSERT INTO Contract (ContractNumber, ReservationID, StartDate, EndDate, ContractStatus, CreatedAt)
    VALUES (@ContractNumber, @ReservationID, @Start, @End, N'Active', DATEADD(MINUTE, 4, @CreatedAt));
    DECLARE @ContractID INT = SCOPE_IDENTITY();

    INSERT INTO ContractSignature (ContractID, UserID, SignerName, SignatureImage, TermsVersion, SignedAt)
    VALUES (@ContractID, @CustomerID, @CustomerName,
            N'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            N'storage-rental-v1', DATEADD(MINUTE, 10, CAST(@CreatedAt AS DATETIMEOFFSET)));

    UPDATE ReservationUnit SET Status = N'Active', HandedOverAt = CAST(@Start AS DATETIME2) WHERE ReservationUnitID = @RUID;
    UPDATE Reservation SET Status = N'Handed Over' WHERE ReservationID = @ReservationID;

    INSERT INTO UnitAccess (ReservationUnitID, ReservationID, UnitID, UserID, AccessType, AccessValue, IssuedAt, Status)
    VALUES (@RUID, @ReservationID, @UnitID, @CustomerID, N'PIN Code', N'246810', CAST(@Start AS DATETIME2), N'Active');

COMMIT TRANSACTION;

SELECT N'Đã tạo dữ liệu test' AS KetQua, @CustomerEmail AS EmailKhach, @UnitNo AS Kho, @Price AS GiaThang,
       @Deposit AS TienCoc, @Start AS BatDau, @End AS HetHan, DATEDIFF(DAY, @Today, @End) AS ConLaiNgay,
       @Code AS MaDon, @ContractNumber AS SoHopDong;
