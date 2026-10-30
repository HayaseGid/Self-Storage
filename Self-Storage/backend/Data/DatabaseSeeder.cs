using System;
using System.Linq;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Data;

public static class DatabaseSeeder
{
    public static void SeedIfEmpty(SelfStorageDbContext context)
    {
        if (context.Roles.Any())
        {
            return;
        }

        // 1. Roles
        var roleCustomer = new Role { RoleName = "Storage Customer", Description = "Reserve units, pay fees, check in, and manage rented units" };
        var roleStaff = new Role { RoleName = "Facility Staff", Description = "Support check-in, update unit status, and handle on-site problems" };
        var roleManager = new Role { RoleName = "Facility Manager", Description = "Manage storage units, staff, and contracts at an assigned facility" };
        var roleBOM = new Role { RoleName = "Business Operations Manager", Description = "Manage all facilities, general policies, pricing, and system-wide reports" };
        var roleAdmin = new Role { RoleName = "System Administrator", Description = "Manage user accounts and assign roles within the system" };

        context.Roles.AddRange(roleCustomer, roleStaff, roleManager, roleBOM, roleAdmin);
        context.SaveChanges();

        // 2. Users (Password: 123456)
        var userAdmin = new User
        {
            RoleID = roleAdmin.RoleID,
            Username = "sys_admin",
            PasswordHash = "$2a$11$HDFjRM5RTirvAJ2/vEzwhuv5OQOjpw7wT/3ElFEbwmIUwI2pWmepS",
            FullName = "Quản Trị Viên",
            Email = "admin@test.com",
            EmailVerified = true,
            PhoneNumber = "0905000001",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        var userOps = new User
        {
            RoleID = roleBOM.RoleID,
            Username = "biz_ops_mgr",
            PasswordHash = "$2a$11$N2/L1iRkRbIAwLhubV71meEVZ9g.IZY5nD0HsjSekbaPtfvcI.W42",
            FullName = "Lý Vận Hành Tổng",
            Email = "ops@test.com",
            EmailVerified = true,
            PhoneNumber = "0904000001",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        var userManager = new User
        {
            RoleID = roleManager.RoleID,
            Username = "fac_manager1",
            PasswordHash = "$2a$11$WevdVfuB0NfM5FGAR424Ge5wnkFWyUDDB75hfeuFG20344kbTG60.",
            FullName = "Nguyễn Quản Lý Cơ Sở 1",
            Email = "fm1@test.com",
            EmailVerified = true,
            PhoneNumber = "0901000001",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        var userStaff = new User
        {
            RoleID = roleStaff.RoleID,
            Username = "staff1",
            PasswordHash = "$2a$11$5vUNIDk.1IszB6hVO8b5/.1WdOb8kB20RNqXjwwcd8gD89rjFr1I6",
            FullName = "Lê Nhân Viên Một",
            Email = "staff1@test.com",
            EmailVerified = true,
            PhoneNumber = "0902000001",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        var userCustomer = new User
        {
            RoleID = roleCustomer.RoleID,
            Username = "customer1",
            PasswordHash = "$2a$11$ST0fSfq/YhEHebJwAvqeSe.nZnzuf9I62QysmaBrL8mZ2D/Wp5iGO",
            FullName = "Đinh Khách Hàng",
            Email = "cust1@test.com",
            EmailVerified = true,
            PhoneNumber = "0903000001",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        context.Users.AddRange(userAdmin, userOps, userManager, userStaff, userCustomer);
        context.SaveChanges();

        // 3. ContractTypes
        context.ContractTypes.AddRange(
            new ContractType { TypeName = "1 tháng", RentalMonths = 1, DiscountRate = 0m },
            new ContractType { TypeName = "3 tháng", RentalMonths = 3, DiscountRate = 0.05m },
            new ContractType { TypeName = "6 tháng", RentalMonths = 6, DiscountRate = 0.10m },
            new ContractType { TypeName = "12 tháng", RentalMonths = 12, DiscountRate = 0.15m }
        );

        // 4. SizeCategories
        var catSmall = new SizeCategory
        {
            CategoryCode = "SMALL",
            CategoryName = "Kho nhỏ",
            CodePrefix = "S",
            StandardHeightM = 2.50m,
            MinVolumeM3 = 1.00m,
            MaxVolumeM3 = 10.00m,
            MinMonthlyPrice = 500000m,
            MaxMonthlyPrice = 2000000m
        };
        var catMedium = new SizeCategory
        {
            CategoryCode = "MEDIUM",
            CategoryName = "Kho vừa",
            CodePrefix = "M",
            StandardHeightM = 2.50m,
            MinVolumeM3 = 10.01m,
            MaxVolumeM3 = 25.00m,
            MinMonthlyPrice = 2000000m,
            MaxMonthlyPrice = 5000000m
        };
        var catLarge = new SizeCategory
        {
            CategoryCode = "LARGE",
            CategoryName = "Kho lớn",
            CodePrefix = "L",
            StandardHeightM = 2.50m,
            MinVolumeM3 = 25.01m,
            MaxVolumeM3 = 60.00m,
            MinMonthlyPrice = 5000000m,
            MaxMonthlyPrice = 12000000m
        };
        context.SizeCategories.AddRange(catSmall, catMedium, catLarge);
        context.SaveChanges();

        // 5. UnitTypes
        var typeStandard = new UnitType { TypeName = "Tiêu chuẩn (Standard)", Description = "Kho nhiệt độ phòng, thông thoáng tự nhiên" };
        var typeClimate = new UnitType { TypeName = "Máy lạnh (Climate Controlled)", Description = "Kiểm soát nhiệt độ 22-25°C và độ ẩm < 60%" };
        context.UnitTypes.AddRange(typeStandard, typeClimate);
        context.SaveChanges();

        // 6. UnitSizes
        var sizeS1 = new UnitSize
        {
            SizeCode = "S1",
            SizeCategoryID = catSmall.SizeCategoryID,
            DisplayName = "Kho Mini 1.5m²",
            WidthM = 1.00m,
            LengthM = 1.50m,
            HeightM = 2.50m,
            CreatedByUserID = userOps.UserID
        };
        var sizeM1 = new UnitSize
        {
            SizeCode = "M1",
            SizeCategoryID = catMedium.SizeCategoryID,
            DisplayName = "Kho Vừa 6m²",
            WidthM = 2.00m,
            LengthM = 3.00m,
            HeightM = 2.50m,
            CreatedByUserID = userOps.UserID
        };
        var sizeL1 = new UnitSize
        {
            SizeCode = "L1",
            SizeCategoryID = catLarge.SizeCategoryID,
            DisplayName = "Kho Lớn 15m²",
            WidthM = 3.00m,
            LengthM = 5.00m,
            HeightM = 2.50m,
            CreatedByUserID = userOps.UserID
        };
        context.UnitSizes.AddRange(sizeS1, sizeM1, sizeL1);
        context.SaveChanges();

        // 7. Facilities
        var facilityTD = new Facility
        {
            ManagerID = userManager.UserID,
            FacilityName = "StoreSpace Thủ Đức",
            UnitCodePrefix = "TD",
            StreetAddress = "Số 1 Võ Văn Ngân",
            Ward = "Linh Chiểu",
            District = "Thủ Đức",
            City = "TP. Hồ Chí Minh",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };
        var facilityBT = new Facility
        {
            ManagerID = userManager.UserID,
            FacilityName = "StoreSpace Bình Tân",
            UnitCodePrefix = "BT",
            StreetAddress = "Số 10 Đường Tên Lửa",
            Ward = "An Lạc",
            District = "Bình Tân",
            City = "TP. Hồ Chí Minh",
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };
        context.Facilities.AddRange(facilityTD, facilityBT);
        context.SaveChanges();

        // 8. RentalPolicy & CancellationRule
        var policyTD = new RentalPolicy
        {
            FacilityID = facilityTD.FacilityID,
            DepositMonths = 2,
            HoldMinutes = 30,
            LateFeePerDay = 50000m,
            GracePeriodDays = 3,
            RenewalNoticeDays = 7
        };
        var policyBT = new RentalPolicy
        {
            FacilityID = facilityBT.FacilityID,
            DepositMonths = 2,
            HoldMinutes = 30,
            LateFeePerDay = 50000m,
            GracePeriodDays = 3,
            RenewalNoticeDays = 7
        };
        context.RentalPolicies.AddRange(policyTD, policyBT);
        context.SaveChanges();

        // 9. FacilityUnitType & FacilityUnitSize
        context.FacilityUnitTypes.AddRange(
            new FacilityUnitType { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID },
            new FacilityUnitType { FacilityID = facilityTD.FacilityID, UnitTypeID = typeClimate.UnitTypeID },
            new FacilityUnitType { FacilityID = facilityBT.FacilityID, UnitTypeID = typeStandard.UnitTypeID }
        );
        context.FacilityUnitSizes.AddRange(
            new FacilityUnitSize { FacilityID = facilityTD.FacilityID, UnitSizeID = sizeS1.UnitSizeID },
            new FacilityUnitSize { FacilityID = facilityTD.FacilityID, UnitSizeID = sizeM1.UnitSizeID },
            new FacilityUnitSize { FacilityID = facilityTD.FacilityID, UnitSizeID = sizeL1.UnitSizeID },
            new FacilityUnitSize { FacilityID = facilityBT.FacilityID, UnitSizeID = sizeS1.UnitSizeID }
        );
        context.SaveChanges();

        // 10. RentalRates
        context.RentalRates.AddRange(
            new RentalRate { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, MonthlyPrice = 800000m },
            new RentalRate { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeM1.UnitSizeID, MonthlyPrice = 2500000m },
            new RentalRate { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeL1.UnitSizeID, MonthlyPrice = 6000000m },
            new RentalRate { FacilityID = facilityTD.FacilityID, UnitTypeID = typeClimate.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, MonthlyPrice = 1200000m },
            new RentalRate { FacilityID = facilityBT.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, MonthlyPrice = 750000m }
        );
        context.SaveChanges();

        // 11. StorageUnits
        context.StorageUnits.AddRange(
            new StorageUnit { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, UnitNumber = "TD-U01", Status = "Available" },
            new StorageUnit { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, UnitNumber = "TD-U02", Status = "Available" },
            new StorageUnit { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeM1.UnitSizeID, UnitNumber = "TD-U03", Status = "Available" },
            new StorageUnit { FacilityID = facilityTD.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeL1.UnitSizeID, UnitNumber = "TD-U04", Status = "Available" },
            new StorageUnit { FacilityID = facilityBT.FacilityID, UnitTypeID = typeStandard.UnitTypeID, UnitSizeID = sizeS1.UnitSizeID, UnitNumber = "BT-U01", Status = "Available" }
        );
        context.SaveChanges();
    }
}

