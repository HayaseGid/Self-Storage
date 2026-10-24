USE SelfStorageDB;
GO

IF COL_LENGTH('dbo.Facility', 'UnitCodePrefix') IS NULL
BEGIN
    ALTER TABLE dbo.Facility ADD UnitCodePrefix NVARCHAR(10) NULL;
END
GO

UPDATE facility
SET UnitCodePrefix = COALESCE(
    (
        SELECT TOP (1) LEFT(unit.UnitNumber, CHARINDEX('-U', unit.UnitNumber) - 1)
        FROM dbo.StorageUnit AS unit
        WHERE unit.FacilityID = facility.FacilityID
            AND CHARINDEX('-U', unit.UnitNumber) > 1
        ORDER BY unit.UnitID
    ),
    CASE
        WHEN facility.FacilityName LIKE N'%Quận 1%' THEN 'Q1'
        WHEN facility.FacilityName LIKE N'%Tân Bình%' THEN 'TB'
        WHEN facility.FacilityName LIKE N'%Thủ Đức%' THEN 'TD'
        WHEN facility.FacilityName LIKE N'%Quận 2%' THEN 'Q2'
        WHEN facility.FacilityName LIKE N'%Quận 3%' THEN 'Q3'
        WHEN facility.FacilityName LIKE N'%Bình Tân%' THEN 'BT'
    END
)
WHERE facility.UnitCodePrefix IS NULL;
GO

IF EXISTS (SELECT 1 FROM dbo.Facility WHERE UnitCodePrefix IS NULL)
BEGIN
    THROW 50001, 'Set UnitCodePrefix for every facility before applying this migration.', 1;
END
GO

ALTER TABLE dbo.Facility ALTER COLUMN UnitCodePrefix NVARCHAR(10) NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UQ_Facility_UnitCodePrefix'
        AND object_id = OBJECT_ID('dbo.Facility')
)
BEGIN
    CREATE UNIQUE INDEX UQ_Facility_UnitCodePrefix
        ON dbo.Facility(UnitCodePrefix);
END
GO
