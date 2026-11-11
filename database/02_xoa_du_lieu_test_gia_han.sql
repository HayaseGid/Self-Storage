/*
 * XÓA DỮ LIỆU TEST GIA HẠN  (chạy trong SSMS, database SelfStorageDB_test)
 *
 * Xóa đơn test 'RS-TEST-GIAHAN' và MỌI đơn gia hạn 'GH-...' tạo ra từ nó khi test
 * (đang chờ thanh toán, đã hủy, hết hạn hoặc đã gia hạn xong), kèm: hợp đồng, chữ ký, khoản phí,
 * giao dịch (thu / chuyển cọc / hoàn cọc), log VNPay, mã ra vào kho, việc bàn giao, log trạng thái.
 * Không động vào kho (StorageUnit), bảng giá, chính sách hay dữ liệu của khách / đơn khác.
 *
 * Chạy thử trước: để @DryRun = 1 sẽ chỉ LIỆT KÊ những gì sẽ bị xóa. Đổi thành 0 để xóa thật.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @DryRun BIT = 1;
DECLARE @Code NVARCHAR(20) = N'RS-TEST-GIAHAN';

DECLARE @RootID INT, @CustomerID INT, @RootStart DATE;
SELECT @RootID = ReservationID, @CustomerID = CustomerID, @RootStart = StartDate FROM Reservation WHERE ReservationCode = @Code;
IF @RootID IS NULL BEGIN PRINT N'Không có dữ liệu test để xóa.'; RETURN; END;

-- Đơn cần xóa: đơn test + các đơn gia hạn GH-... của cùng khách, cùng kho, bắt đầu sau đơn test
DECLARE @Res TABLE (ReservationID INT PRIMARY KEY);
INSERT INTO @Res VALUES (@RootID);
INSERT INTO @Res
SELECT DISTINCT r.ReservationID
FROM Reservation r
JOIN ReservationUnit ru ON ru.ReservationID = r.ReservationID
WHERE r.CustomerID = @CustomerID
  AND r.ReservationCode LIKE N'GH-%'
  AND r.StartDate > @RootStart
  AND ru.UnitID IN (SELECT UnitID FROM ReservationUnit WHERE ReservationID = @RootID)
  AND r.ReservationID <> @RootID;

DECLARE @RU TABLE (ID BIGINT PRIMARY KEY);       INSERT INTO @RU SELECT ReservationUnitID FROM ReservationUnit WHERE ReservationID IN (SELECT ReservationID FROM @Res);
DECLARE @Pay TABLE (ID INT PRIMARY KEY);         INSERT INTO @Pay SELECT PaymentID FROM Payment WHERE ReservationID IN (SELECT ReservationID FROM @Res);
DECLARE @Chg TABLE (ID INT PRIMARY KEY);         INSERT INTO @Chg SELECT ChargeID FROM Charge WHERE ReservationID IN (SELECT ReservationID FROM @Res);
DECLARE @Ctr TABLE (ID INT PRIMARY KEY);         INSERT INTO @Ctr SELECT ContractID FROM Contract WHERE ReservationID IN (SELECT ReservationID FROM @Res);
DECLARE @Acc TABLE (ID INT PRIMARY KEY);         INSERT INTO @Acc SELECT AccessID FROM UnitAccess WHERE ReservationID IN (SELECT ReservationID FROM @Res);
DECLARE @Task TABLE (ID INT PRIMARY KEY);        INSERT INTO @Task SELECT TaskID FROM HandoverTask WHERE ReservationID IN (SELECT ReservationID FROM @Res);

-- Không cho xóa nếu dữ liệu khác đang trỏ vào (an toàn: không bao giờ xảy ra với dữ liệu test)
IF EXISTS (SELECT 1 FROM Contract WHERE RenewedFromContractID IN (SELECT ID FROM @Ctr) AND ContractID NOT IN (SELECT ID FROM @Ctr))
   OR EXISTS (SELECT 1 FROM Payment WHERE RefundOfPaymentID IN (SELECT ID FROM @Pay) AND PaymentID NOT IN (SELECT ID FROM @Pay))
BEGIN
    RAISERROR(N'Có dữ liệu ngoài bộ test đang liên kết tới đơn test, dừng lại để kiểm tra.', 16, 1);
    RETURN;
END;

SELECT r.ReservationID, r.ReservationCode, r.Status, r.StartDate, r.EndDate,
       c.ContractNumber, c.ContractStatus
FROM Reservation r LEFT JOIN Contract c ON c.ReservationID = r.ReservationID
WHERE r.ReservationID IN (SELECT ReservationID FROM @Res)
ORDER BY r.StartDate;

SELECT (SELECT COUNT(*) FROM @Res) AS DonDatCho, (SELECT COUNT(*) FROM @Ctr) AS HopDong, (SELECT COUNT(*) FROM @Chg) AS KhoanPhi,
       (SELECT COUNT(*) FROM @Pay) AS GiaoDich, (SELECT COUNT(*) FROM @Acc) AS MaRaVao, (SELECT COUNT(*) FROM @Task) AS ViecBanGiao;

IF @DryRun = 1
BEGIN
    PRINT N'Chạy thử: chưa xóa gì. Đổi @DryRun = 0 rồi chạy lại để xóa.';
    RETURN;
END;

BEGIN TRANSACTION;
    DELETE FROM StatusChangeLog WHERE
           (EntityType = N'Reservation'     AND EntityID IN (SELECT ReservationID FROM @Res))
        OR (EntityType = N'ReservationUnit' AND EntityID IN (SELECT ID FROM @RU))
        OR (EntityType = N'Payment'         AND EntityID IN (SELECT ID FROM @Pay))
        OR (EntityType = N'Charge'          AND EntityID IN (SELECT ID FROM @Chg))
        OR (EntityType = N'Contract'        AND EntityID IN (SELECT ID FROM @Ctr))
        OR (EntityType = N'UnitAccess'      AND EntityID IN (SELECT ID FROM @Acc))
        OR (EntityType = N'HandoverTask'    AND EntityID IN (SELECT ID FROM @Task));

    DELETE FROM PaymentCallbackLog WHERE PaymentID IN (SELECT ID FROM @Pay);
    DELETE FROM UnitAccess        WHERE AccessID IN (SELECT ID FROM @Acc);
    DELETE FROM HandoverTask      WHERE TaskID IN (SELECT ID FROM @Task);
    DELETE FROM Charge            WHERE ChargeID IN (SELECT ID FROM @Chg);
    DELETE FROM Payment           WHERE PaymentID IN (SELECT ID FROM @Pay) AND RefundOfPaymentID IS NOT NULL;
    DELETE FROM Payment           WHERE PaymentID IN (SELECT ID FROM @Pay);
    DELETE FROM ContractSignature WHERE ContractID IN (SELECT ID FROM @Ctr);
    UPDATE Contract SET RenewedFromContractID = NULL WHERE ContractID IN (SELECT ID FROM @Ctr) AND RenewedFromContractID IS NOT NULL;
    DELETE FROM Contract          WHERE ContractID IN (SELECT ID FROM @Ctr);
    DELETE FROM ReservationUnit   WHERE ReservationUnitID IN (SELECT ID FROM @RU);
    DELETE FROM ReservationItem   WHERE ReservationID IN (SELECT ReservationID FROM @Res);
    DELETE FROM Reservation       WHERE ReservationID IN (SELECT ReservationID FROM @Res);
COMMIT TRANSACTION;

PRINT N'Đã xóa sạch dữ liệu test gia hạn.';
