using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Data;

public static class DatabaseSeeder
{
    public static void SeedIfEmpty(SelfStorageDbContext context)
    {
        if (context.Facilities.Any(f => f.UnitCodePrefix == "Q1"))
        {
            SyncPostgresSequences(context);
            return;
        }

        ResetAndSeedFull(context);
    }

    public static void ResetAndSeedFull(SelfStorageDbContext context)
    {
        bool isNpgsql = context.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;

        if (isNpgsql)
        {
            context.Database.ExecuteSqlRaw(@"
                TRUNCATE TABLE 
                    ""StatusChangeLog"",
                    ""UserActivityLog"",
                    ""SupportRequest"",
                    ""HandoverTask"",
                    ""UnitAccess"",
                    ""Charge"",
                    ""PaymentCallbackLog"",
                    ""Payment"",
                    ""ContractSignature"",
                    ""Contract"",
                    ""ReservationUnit"",
                    ""ReservationItem"",
                    ""Reservation"",
                    ""StorageUnit"",
                    ""RentalRate"",
                    ""FacilityUnitSize"",
                    ""FacilityUnitType"",
                    ""FacilityStaff"",
                    ""CancellationRule"",
                    ""RentalPolicy"",
                    ""Facility"",
                    ""UnitSize"",
                    ""UnitType"",
                    ""FeePolicy"",
                    ""SizeCategory"",
                    ""ContractType"",
                    ""EmailVerificationCode"",
                    ""PendingRegistration"",
                    ""Users"",
                    ""Role"",
                    ""AppErrorMessage""
                RESTART IDENTITY CASCADE;
            ");
        }

        // 1. Roles
        var roleCustomer = new Role { RoleID = 1, RoleName = "Storage Customer", Description = "Reserve units, pay fees, check in, and manage rented units" };
        var roleStaff = new Role { RoleID = 2, RoleName = "Facility Staff", Description = "Support check-in, update unit status, and handle on-site problems" };
        var roleManager = new Role { RoleID = 3, RoleName = "Facility Manager", Description = "Manage storage units, staff, and contracts at an assigned facility" };
        var roleBOM = new Role { RoleID = 4, RoleName = "Business Operations Manager", Description = "Manage all facilities, general policies, pricing, and system-wide reports" };
        var roleAdmin = new Role { RoleID = 5, RoleName = "System Administrator", Description = "Manage user accounts and assign roles within the system" };

        context.Roles.AddRange(roleCustomer, roleStaff, roleManager, roleBOM, roleAdmin);
        context.SaveChanges();

        // 2. Users (Mật khẩu: 123456)
        var users = new List<User>
        {
            new User { UserID = 1, RoleID = 3, Username = "fac_manager1", PasswordHash = "$2a$11$WevdVfuB0NfM5FGAR424Ge5wnkFWyUDDB75hfeuFG20344kbTG60.", FullName = "Nguyễn Quản Lý Cơ Sở 1", Email = "fm1@test.com", EmailVerified = true, PhoneNumber = "0901000001", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 2, RoleID = 3, Username = "fac_manager2", PasswordHash = "$2a$11$V6p9aH0Sr2K9jWdtIPu8h.WsCXUWZH5xY1C.MIulFF4pwWpoz26Wy", FullName = "Trần Quản Lý Cơ Sở 2", Email = "fm2@test.com", EmailVerified = true, PhoneNumber = "0901000002", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 3, RoleID = 2, Username = "staff1", PasswordHash = "$2a$11$5vUNIDk.1IszB6hVO8b5/.1WdOb8kB20RNqXjwwcd8gD89rjFr1I6", FullName = "Lê Nhân Viên Một", Email = "staff1@test.com", EmailVerified = true, PhoneNumber = "0902000001", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 4, RoleID = 2, Username = "staff2", PasswordHash = "$2a$11$xIPRi/Har6SQwCAtelRbKuc786AWbZUt5HrqWD9Rrl9yIriBeta7O", FullName = "Phạm Nhân Viên Hai", Email = "staff2@test.com", EmailVerified = true, PhoneNumber = "0902000002", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 5, RoleID = 2, Username = "staff3", PasswordHash = "$2a$11$OD99/.KgkGK3VkbT/ELXieAHJ2TqTJyaxFwmb71u6YDzjftC3GRUi", FullName = "Hoàng Nhân Viên Ba", Email = "staff3@test.com", EmailVerified = true, PhoneNumber = "0902000003", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 6, RoleID = 1, Username = "customer1", PasswordHash = "$2a$11$ST0fSfq/YhEHebJwAvqeSe.nZnzuf9I62QysmaBrL8mZ2D/Wp5iGO", FullName = "Đinh Khách Hàng", Email = "cust1@test.com", EmailVerified = true, PhoneNumber = "0903000001", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 7, RoleID = 1, Username = "customer2", PasswordHash = "$2a$11$27bbRuD2nAlQcY.squQKcuN44mEpDndqJsq9EXHIIEP7mJPAjQsge", FullName = "Vũ Khách Hàng", Email = "cust2@test.com", EmailVerified = true, PhoneNumber = "0903000002", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 8, RoleID = 1, Username = "customer3", PasswordHash = "$2a$11$cr7/qLThxQP3MBNSbJ/bX.b27wOPowqPiqN.vHn5MS/sAZtkj4182", FullName = "Bùi Khách Hàng", Email = "cust3@test.com", EmailVerified = true, PhoneNumber = "0903000003", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 9, RoleID = 1, Username = "customer4", PasswordHash = "$2a$11$l5dxnygwHvNHkrE7u5ml0.E1MSLImWL/OPDjzKqhpqqSyiuJlF5Gi", FullName = "Đỗ Khách Hàng", Email = "cust4@test.com", EmailVerified = true, PhoneNumber = "0903000004", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 10, RoleID = 4, Username = "biz_ops_mgr", PasswordHash = "$2a$11$N2/L1iRkRbIAwLhubV71meEVZ9g.IZY5nD0HsjSekbaPtfvcI.W42", FullName = "Lý Vận Hành Tổng", Email = "ops@test.com", EmailVerified = true, PhoneNumber = "0904000001", Status = "Active", CreatedAt = DateTime.UtcNow },
            new User { UserID = 11, RoleID = 5, Username = "sys_admin", PasswordHash = "$2a$11$HDFjRM5RTirvAJ2/vEzwhuv5OQOjpw7wT/3ElFEbwmIUwI2pWmepS", FullName = "Quản Trị Viên", Email = "admin@test.com", EmailVerified = true, PhoneNumber = "0905000001", Status = "Active", CreatedAt = DateTime.UtcNow }
        };
        context.Users.AddRange(users);
        context.SaveChanges();

        // 3. ContractType
        var contractTypes = new List<ContractType>
        {
            new ContractType { ContractTypeID = 1, TypeName = "1 tháng", RentalMonths = 1, DiscountRate = 0m },
            new ContractType { ContractTypeID = 2, TypeName = "3 tháng", RentalMonths = 3, DiscountRate = 0m },
            new ContractType { ContractTypeID = 3, TypeName = "6 tháng", RentalMonths = 6, DiscountRate = 0m },
            new ContractType { ContractTypeID = 4, TypeName = "12 tháng", RentalMonths = 12, DiscountRate = 0m }
        };
        context.ContractTypes.AddRange(contractTypes);
        context.SaveChanges();

        // 4. SizeCategory
        var categories = new List<SizeCategory>
        {
            new SizeCategory { SizeCategoryID = 1, CategoryCode = "SMALL", CategoryName = "Small", CodePrefix = "S", StandardHeightM = 2.50m, MinVolumeM3 = 2.25m, MaxVolumeM3 = 24.00m, MinMonthlyPrice = 400000m, MaxMonthlyPrice = 1000000m, IsActive = true },
            new SizeCategory { SizeCategoryID = 2, CategoryCode = "MEDIUM", CategoryName = "Medium", CodePrefix = "M", StandardHeightM = 2.50m, MinVolumeM3 = 24.01m, MaxVolumeM3 = 48.00m, MinMonthlyPrice = 700000m, MaxMonthlyPrice = 1500000m, IsActive = true },
            new SizeCategory { SizeCategoryID = 3, CategoryCode = "LARGE", CategoryName = "Large", CodePrefix = "L", StandardHeightM = 2.50m, MinVolumeM3 = 48.01m, MaxVolumeM3 = 120.00m, MinMonthlyPrice = 1000000m, MaxMonthlyPrice = 2500000m, IsActive = true },
            new SizeCategory { SizeCategoryID = 4, CategoryCode = "VEHICLE", CategoryName = "Vehicle", CodePrefix = "V", StandardHeightM = 3.50m, MinVolumeM3 = 30.00m, MaxVolumeM3 = 200.00m, MinMonthlyPrice = 2000000m, MaxMonthlyPrice = 3500000m, IsActive = true }
        };
        context.SizeCategories.AddRange(categories);
        context.SaveChanges();

        // 5. FeePolicy
        var feePolicies = new List<FeePolicy>
        {
            new FeePolicy { FeeCode = "LATE_FEE_PER_DAY", FeeName = "Phí trễ hạn mỗi ngày", FeeCategory = "LateFee", ValueType = "Amount", MinValue = 0m, MaxValue = 200000m, IsActive = true },
            new FeePolicy { FeeCode = "CLEANING_FEE", FeeName = "Phí vệ sinh kho khi trả", FeeCategory = "ExtraFee", ValueType = "Amount", MinValue = 0m, MaxValue = 500000m, IsActive = true },
            new FeePolicy { FeeCode = "LOCK_REPLACEMENT", FeeName = "Phí thay khóa / thẻ bị mất", FeeCategory = "ExtraFee", ValueType = "Amount", MinValue = 0m, MaxValue = 1000000m, IsActive = true },
            new FeePolicy { FeeCode = "PROMO_DISCOUNT", FeeName = "Giảm giá khuyến mãi", FeeCategory = "Discount", ValueType = "Percentage", MinValue = 0m, MaxValue = 20m, IsActive = true },
            new FeePolicy { FeeCode = "FEE_WAIVER", FeeName = "Miễn phí theo duyệt", FeeCategory = "FeeWaiver", ValueType = "Percentage", MinValue = 0m, MaxValue = 100m, IsActive = true }
        };
        context.FeePolicies.AddRange(feePolicies);
        context.SaveChanges();

        // 6. Facilities (5 cơ sở theo SelfStorageDB_test.sql)
        var facilities = new List<Facility>
        {
            new Facility { FacilityID = 1, ManagerID = 1, FacilityName = "Cơ sở Lưu trữ Quận 1", UnitCodePrefix = "Q1", StreetAddress = "123 Lê Lợi", Ward = "Phường Bến Thành", District = "Quận 1", City = "TP. Hồ Chí Minh", Latitude = 10.773100m, Longitude = 106.700800m, ContactPhone = "0812345678", OpeningHours = "07:00 - 21:00 hằng ngày", Description = "Gần chợ Bến Thành, có kho điều hòa.", Status = "Active", CreatedAt = DateTime.UtcNow },
            new Facility { FacilityID = 2, ManagerID = 2, FacilityName = "Cơ sở Lưu trữ Tân Bình", UnitCodePrefix = "TB", StreetAddress = "456 Cộng Hòa", Ward = "Phường 13", District = "Tân Bình", City = "TP. Hồ Chí Minh", Latitude = 10.801500m, Longitude = 106.652000m, ContactPhone = "0812345679", OpeningHours = "07:00 - 21:00 hằng ngày", Description = "Gần sân bay Tân Sơn Nhất.", Status = "Active", CreatedAt = DateTime.UtcNow },
            new Facility { FacilityID = 3, ManagerID = 1, FacilityName = "Cơ sở Lưu trữ Thủ Đức", UnitCodePrefix = "TD", StreetAddress = "123 Võ Văn Ngân", Ward = "Phường Linh Chiểu", District = "Thủ Đức", City = "TP. Hồ Chí Minh", Latitude = 10.850600m, Longitude = 106.771900m, ContactPhone = "0812345680", OpeningHours = "06:00 - 22:00 hằng ngày", Description = "Bãi xe rộng, phù hợp kho xe.", Status = "Active", CreatedAt = DateTime.UtcNow },
            new Facility { FacilityID = 4, ManagerID = 2, FacilityName = "Cơ sở Lưu trữ Quận 2", UnitCodePrefix = "Q2", StreetAddress = "456 Trần Não", Ward = "Phường Bình An", District = "Quận 2", City = "TP. Hồ Chí Minh", Latitude = 10.796000m, Longitude = 106.734000m, ContactPhone = "0812345681", OpeningHours = "07:00 - 21:00 hằng ngày", Status = "Active", CreatedAt = DateTime.UtcNow },
            new Facility { FacilityID = 5, ManagerID = 1, FacilityName = "Cơ sở Lưu trữ Quận 3", UnitCodePrefix = "Q3", StreetAddress = "789 Cách Mạng Tháng 8", Ward = "Phường Võ Thị Sáu", District = "Quận 3", City = "TP. Hồ Chí Minh", Latitude = 10.784500m, Longitude = 106.684000m, ContactPhone = "0812345682", OpeningHours = "07:00 - 21:00 hằng ngày", Status = "Active", CreatedAt = DateTime.UtcNow }
        };
        context.Facilities.AddRange(facilities);
        context.SaveChanges();

        // 7. RentalPolicy & CancellationRules (Cho cả 5 cơ sở)
        for (int i = 1; i <= 5; i++)
        {
            var policy = new RentalPolicy
            {
                FacilityID = i,
                DepositMonths = 2,
                HoldMinutes = 15,
                LateFeePerDay = 50000m,
                GracePeriodDays = 3,
                RenewalNoticeDays = 30
            };
            context.RentalPolicies.Add(policy);
            context.SaveChanges();

            context.CancellationRules.AddRange(
                new CancellationRule { RentalPolicyID = policy.RentalPolicyID, DaysBeforeStart = 7, RefundPercent = 100 },
                new CancellationRule { RentalPolicyID = policy.RentalPolicyID, DaysBeforeStart = 3, RefundPercent = 50 },
                new CancellationRule { RentalPolicyID = policy.RentalPolicyID, DaysBeforeStart = 0, RefundPercent = 0 }
            );
            context.SaveChanges();
        }

        // 8. FacilityStaff
        context.FacilityStaffs.AddRange(
            new FacilityStaff { AssignmentID = 1, FacilityID = 1, UserID = 3, AssignedDate = new DateTime(2026, 1, 1), Status = "Active" },
            new FacilityStaff { AssignmentID = 2, FacilityID = 1, UserID = 4, AssignedDate = new DateTime(2026, 1, 15), Status = "Active" },
            new FacilityStaff { AssignmentID = 3, FacilityID = 2, UserID = 5, AssignedDate = new DateTime(2026, 2, 1), Status = "Active" }
        );
        context.SaveChanges();

        // 9. UnitTypes (4 loại)
        var unitTypes = new List<UnitType>
        {
            new UnitType { UnitTypeID = 1, TypeName = "Climate-Control Unit", Description = "Kho có thể điều chỉnh nhiệt độ, nằm trong nhà" },
            new UnitType { UnitTypeID = 2, TypeName = "Drive-up Unit", Description = "Kho ngoài trời, xe vào tận nơi" },
            new UnitType { UnitTypeID = 3, TypeName = "Basic Unit", Description = "Kho ngoài trời tiêu chuẩn" },
            new UnitType { UnitTypeID = 4, TypeName = "Indoor Unit", Description = "Kho trong nhà, có hành lang" }
        };
        context.UnitTypes.AddRange(unitTypes);
        context.SaveChanges();

        // 10. UnitSizes (10 sizes)
        var unitSizes = new List<UnitSize>
        {
            new UnitSize { UnitSizeID = 1, SizeCategoryID = 1, SizeCode = "S1", DisplayName = "Tủ nhỏ 1.5 x 1.5 m", WidthM = 1.50m, LengthM = 1.50m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 2, SizeCategoryID = 1, SizeCode = "S2", DisplayName = "Kho 2 x 2 m", WidthM = 2.00m, LengthM = 2.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 3, SizeCategoryID = 1, SizeCode = "S3", DisplayName = "Kho 2 x 4 m", WidthM = 2.00m, LengthM = 4.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 4, SizeCategoryID = 2, SizeCode = "M1", DisplayName = "Kho 2 x 6 m", WidthM = 2.00m, LengthM = 6.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 5, SizeCategoryID = 2, SizeCode = "M2", DisplayName = "Kho 4 x 4 m", WidthM = 4.00m, LengthM = 4.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 6, SizeCategoryID = 3, SizeCode = "L1", DisplayName = "Kho 4 x 6 m", WidthM = 4.00m, LengthM = 6.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 7, SizeCategoryID = 3, SizeCode = "L2", DisplayName = "Kho 4 x 8 m", WidthM = 4.00m, LengthM = 8.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 8, SizeCategoryID = 3, SizeCode = "L3", DisplayName = "Kho 4 x 10 m", WidthM = 4.00m, LengthM = 10.00m, HeightM = 2.50m },
            new UnitSize { UnitSizeID = 9, SizeCategoryID = 4, SizeCode = "V1", DisplayName = "Kho xe 8 x 4 m", WidthM = 8.00m, LengthM = 4.00m, HeightM = 3.50m },
            new UnitSize { UnitSizeID = 10, SizeCategoryID = 1, SizeCode = "S4", DisplayName = "Kho 2 x 4.5 m", WidthM = 2.00m, LengthM = 4.50m, HeightM = 2.50m, CreatedByUserID = 1 }
        };
        context.UnitSizes.AddRange(unitSizes);
        context.SaveChanges();

        // 11. FacilityUnitType & FacilityUnitSize
        for (int f = 1; f <= 5; f++)
        {
            for (int t = 1; t <= 4; t++)
            {
                context.FacilityUnitTypes.Add(new FacilityUnitType { FacilityID = f, UnitTypeID = t });
            }
            for (int s = 1; s <= 9; s++)
            {
                context.FacilityUnitSizes.Add(new FacilityUnitSize { FacilityID = f, UnitSizeID = s });
            }
        }
        // S4 tại Q1 (Facility 1) và Thủ Đức (Facility 3)
        context.FacilityUnitSizes.Add(new FacilityUnitSize { FacilityID = 1, UnitSizeID = 10, AddedByUserID = 1 });
        context.FacilityUnitSizes.Add(new FacilityUnitSize { FacilityID = 3, UnitSizeID = 10, AddedByUserID = 1 });
        context.SaveChanges();

        // 12. Danh sách 52 kho từ SelfStorageDB_test.sql
        var rawUnits = new (int UnitID, int FacilityID, int UnitTypeID, int UnitSizeID, string UnitNumber, decimal MonthlyPrice, string Status)[]
        {
            (1, 1, 1, 1, "Q1-U01", 400000m, "Available"),
            (2, 1, 1, 2, "Q1-U02", 500000m, "Available"),
            (3, 1, 4, 4, "Q1-U03", 800000m, "Available"),
            (4, 1, 4, 5, "Q1-U04", 1000000m, "In Use"),
            (5, 1, 3, 2, "Q1-U05", 400000m, "Available"),
            (6, 1, 3, 3, "Q1-U06", 600000m, "Available"),
            (7, 1, 2, 8, "Q1-U07", 2000000m, "Available"),
            (8, 1, 2, 9, "Q1-U08", 2500000m, "Available"),
            (9, 1, 1, 3, "Q1-U09", 700000m, "Maintenance"),
            (10, 1, 4, 6, "Q1-U10", 1200000m, "Available"),
            (11, 2, 1, 1, "TB-U01", 400000m, "Available"),
            (12, 2, 1, 2, "TB-U02", 450000m, "Available"),
            (13, 2, 3, 4, "TB-U03", 750000m, "In Use"),
            (14, 2, 4, 5, "TB-U04", 900000m, "Available"),
            (15, 2, 3, 2, "TB-U05", 400000m, "Available"),
            (16, 2, 3, 3, "TB-U06", 550000m, "Available"),
            (17, 2, 2, 8, "TB-U07", 1800000m, "Available"),
            (18, 2, 2, 9, "TB-U08", 2200000m, "Available"),
            (19, 2, 4, 6, "TB-U09", 1100000m, "Available"),
            (20, 2, 1, 3, "TB-U10", 650000m, "Available"),
            (21, 3, 1, 1, "TD-U01", 400000m, "Available"),
            (22, 3, 1, 2, "TD-U02", 500000m, "Available"),
            (23, 3, 4, 4, "TD-U03", 800000m, "Available"),
            (24, 3, 4, 5, "TD-U04", 1000000m, "Available"),
            (25, 3, 3, 2, "TD-U05", 400000m, "Available"),
            (26, 3, 3, 3, "TD-U06", 600000m, "Available"),
            (27, 3, 2, 8, "TD-U07", 2000000m, "Available"),
            (28, 3, 2, 9, "TD-U08", 2500000m, "Available"),
            (29, 3, 1, 3, "TD-U09", 700000m, "Available"),
            (30, 3, 4, 6, "TD-U10", 1200000m, "Available"),
            (31, 4, 1, 1, "Q2-U01", 400000m, "Available"),
            (32, 4, 1, 2, "Q2-U02", 550000m, "Available"),
            (33, 4, 4, 4, "Q2-U03", 850000m, "Available"),
            (34, 4, 4, 5, "Q2-U04", 1050000m, "Available"),
            (35, 4, 3, 2, "Q2-U05", 450000m, "Available"),
            (36, 4, 3, 3, "Q2-U06", 650000m, "Available"),
            (37, 4, 2, 8, "Q2-U07", 2100000m, "Available"),
            (38, 4, 2, 9, "Q2-U08", 2600000m, "Available"),
            (39, 4, 1, 3, "Q2-U09", 750000m, "Available"),
            (40, 4, 4, 6, "Q2-U10", 1250000m, "Available"),
            (41, 5, 1, 1, "Q3-U01", 400000m, "Available"),
            (42, 5, 1, 2, "Q3-U02", 600000m, "Available"),
            (43, 5, 4, 4, "Q3-U03", 900000m, "Available"),
            (44, 5, 4, 5, "Q3-U04", 1100000m, "Available"),
            (45, 5, 3, 2, "Q3-U05", 500000m, "Available"),
            (46, 5, 3, 3, "Q3-U06", 700000m, "Available"),
            (47, 5, 2, 8, "Q3-U07", 2200000m, "Available"),
            (48, 5, 2, 9, "Q3-U08", 2700000m, "Available"),
            (49, 5, 1, 3, "Q3-U09", 800000m, "Available"),
            (50, 5, 4, 6, "Q3-U10", 1300000m, "Available"),
            (51, 1, 1, 10, "Q1-U11", 900000m, "Available"),
            (52, 3, 3, 10, "TD-U11", 650000m, "Available")
        };

        // 13. RentalRate (nhóm distinct Facility, Type, Size)
        var rates = rawUnits
            .GroupBy(u => new { u.FacilityID, u.UnitTypeID, u.UnitSizeID })
            .Select(g => new RentalRate
            {
                FacilityID = g.Key.FacilityID,
                UnitTypeID = g.Key.UnitTypeID,
                UnitSizeID = g.Key.UnitSizeID,
                MonthlyPrice = g.Max(x => x.MonthlyPrice)
            })
            .ToList();
        context.RentalRates.AddRange(rates);
        context.SaveChanges();

        // 14. StorageUnits
        var storageUnits = rawUnits.Select(u => new StorageUnit
        {
            UnitID = u.UnitID,
            FacilityID = u.FacilityID,
            UnitTypeID = u.UnitTypeID,
            UnitSizeID = u.UnitSizeID,
            UnitNumber = u.UnitNumber,
            Floor = (u.UnitTypeID == 1 || u.UnitTypeID == 4) ? "Tầng 1" : (u.UnitTypeID == 3 ? "Ngoài trời" : "Bãi xe"),
            Zone = u.UnitTypeID == 1 ? "Dãy A" : (u.UnitTypeID == 4 ? "Dãy B" : (u.UnitTypeID == 3 ? "Dãy C" : "Dãy D")),
            LocationNote = u.UnitTypeID == 1 ? "Khu điều hòa" : (u.UnitTypeID == 4 ? "Trong nhà, có hành lang" : (u.UnitTypeID == 3 ? "Ngoài trời" : "Xe vào tận cửa kho")),
            Status = u.Status,
            CreatedAt = DateTime.UtcNow
        }).ToList();
        context.StorageUnits.AddRange(storageUnits);
        context.SaveChanges();

        // 15. Reservations (3 đơn mẫu)
        var res1 = new Reservation
        {
            ReservationID = 1,
            ReservationCode = "RS-2026-00001",
            CustomerID = 6,
            FacilityID = 1,
            StartDate = new DateTime(2026, 9, 1),
            RentalPeriod = 3,
            EndDate = new DateTime(2026, 11, 30),
            DepositMonths = 2,
            HoldExpiresAt = new DateTime(2026, 8, 29, 2, 15, 0),
            AppointmentDate = new DateTime(2026, 9, 1),
            AppointmentTime = new TimeSpan(9, 0, 0),
            Status = "Handed Over",
            CreatedAt = new DateTime(2026, 8, 29, 2, 0, 0),
            PaidAt = new DateTime(2026, 8, 29, 2, 6, 0),
            ConfirmedAt = new DateTime(2026, 8, 29, 3, 0, 0),
            ConfirmedByUserID = 1
        };

        var res2 = new Reservation
        {
            ReservationID = 2,
            ReservationCode = "RS-2026-00002",
            CustomerID = 7,
            FacilityID = 2,
            StartDate = new DateTime(2026, 9, 10),
            RentalPeriod = 12,
            EndDate = new DateTime(2027, 9, 9),
            DepositMonths = 2,
            HoldExpiresAt = new DateTime(2026, 9, 5, 7, 15, 0),
            AppointmentDate = new DateTime(2026, 9, 10),
            AppointmentTime = new TimeSpan(14, 0, 0),
            Status = "Handed Over",
            CreatedAt = new DateTime(2026, 9, 5, 7, 0, 0),
            PaidAt = new DateTime(2026, 9, 5, 7, 6, 0),
            ConfirmedAt = new DateTime(2026, 9, 5, 8, 0, 0),
            ConfirmedByUserID = 2
        };

        var res3 = new Reservation
        {
            ReservationID = 3,
            ReservationCode = "RS-2026-00003",
            CustomerID = 8,
            FacilityID = 1,
            StartDate = new DateTime(2026, 11, 15),
            RentalPeriod = 6,
            EndDate = new DateTime(2027, 5, 14),
            DepositMonths = 2,
            HoldExpiresAt = new DateTime(2026, 10, 20, 3, 15, 0),
            AppointmentDate = new DateTime(2026, 11, 15),
            AppointmentTime = new TimeSpan(10, 0, 0),
            Status = "Confirmed",
            CreatedAt = new DateTime(2026, 10, 20, 3, 0, 0),
            PaidAt = new DateTime(2026, 10, 20, 3, 5, 0),
            ConfirmedAt = new DateTime(2026, 10, 20, 4, 0, 0),
            ConfirmedByUserID = 1
        };

        context.Reservations.AddRange(res1, res2, res3);
        context.SaveChanges();

        // 16. ReservationItems
        var item1 = new ReservationItem { ReservationItemID = 1, ReservationID = 1, FacilityID = 1, UnitTypeID = 4, UnitSizeID = 5, Quantity = 1, MonthlyPrice = 1000000m, DiscountPercent = 0m, EffectiveMonthlyPrice = 1000000m, CreatedAt = res1.CreatedAt };
        var item2 = new ReservationItem { ReservationItemID = 2, ReservationID = 2, FacilityID = 2, UnitTypeID = 3, UnitSizeID = 4, Quantity = 1, MonthlyPrice = 750000m, DiscountPercent = 10m, EffectiveMonthlyPrice = 675000m, CreatedAt = res2.CreatedAt };
        var item3a = new ReservationItem { ReservationItemID = 3, ReservationID = 3, FacilityID = 1, UnitTypeID = 1, UnitSizeID = 2, Quantity = 1, MonthlyPrice = 500000m, DiscountPercent = 5m, EffectiveMonthlyPrice = 475000m, CreatedAt = res3.CreatedAt };
        var item3b = new ReservationItem { ReservationItemID = 4, ReservationID = 3, FacilityID = 1, UnitTypeID = 3, UnitSizeID = 2, Quantity = 1, MonthlyPrice = 400000m, DiscountPercent = 5m, EffectiveMonthlyPrice = 380000m, CreatedAt = res3.CreatedAt };

        context.ReservationItems.AddRange(item1, item2, item3a, item3b);
        context.SaveChanges();

        // 17. ReservationUnits
        var ru1 = new ReservationUnit { ReservationUnitID = 1, ReservationID = 1, ReservationItemID = 1, FacilityID = 1, UnitID = 4, UnitTypeID = 4, UnitSizeID = 5, Status = "Active", AssignedAt = res1.CreatedAt, HandedOverAt = new DateTime(2026, 9, 1, 3, 0, 0) };
        var ru2 = new ReservationUnit { ReservationUnitID = 2, ReservationID = 2, ReservationItemID = 2, FacilityID = 2, UnitID = 13, UnitTypeID = 3, UnitSizeID = 4, Status = "Active", AssignedAt = res2.CreatedAt, HandedOverAt = new DateTime(2026, 9, 10, 8, 0, 0) };
        var ru3a = new ReservationUnit { ReservationUnitID = 3, ReservationID = 3, ReservationItemID = 3, FacilityID = 1, UnitID = 2, UnitTypeID = 1, UnitSizeID = 2, Status = "Held", AssignedAt = res3.CreatedAt };
        var ru3b = new ReservationUnit { ReservationUnitID = 4, ReservationID = 3, ReservationItemID = 4, FacilityID = 1, UnitID = 5, UnitTypeID = 3, UnitSizeID = 2, Status = "Held", AssignedAt = res3.CreatedAt };

        context.ReservationUnits.AddRange(ru1, ru2, ru3a, ru3b);
        context.SaveChanges();

        // 18. Contracts
        var contract1 = new Contract { ContractID = 1, ContractNumber = "HD-2026-00001", ReservationID = 1, StartDate = new DateTime(2026, 9, 1), EndDate = new DateTime(2026, 11, 30), ContractStatus = "Active", CreatedAt = new DateTime(2026, 9, 1, 3, 0, 0), CreatedByUserID = 3 };
        var contract2 = new Contract { ContractID = 2, ContractNumber = "HD-2026-00002", ReservationID = 2, StartDate = new DateTime(2026, 9, 10), EndDate = new DateTime(2027, 9, 9), ContractStatus = "Active", CreatedAt = new DateTime(2026, 9, 10, 8, 0, 0), CreatedByUserID = 5 };
        context.Contracts.AddRange(contract1, contract2);
        context.SaveChanges();

        // 19. UnitAccess
        context.UnitAccesses.AddRange(
            new UnitAccess { AccessID = 1, ReservationUnitID = 1, ReservationID = 1, UnitID = 4, UserID = 6, AccessType = "Smart Lock", AccessValue = "123456", IssuedAt = ru1.HandedOverAt!.Value, IssuedByUserID = 3, Status = "Active" },
            new UnitAccess { AccessID = 2, ReservationUnitID = 2, ReservationID = 2, UnitID = 13, UserID = 7, AccessType = "Smart Lock", AccessValue = "654321", IssuedAt = ru2.HandedOverAt!.Value, IssuedByUserID = 5, Status = "Active" }
        );
        context.SaveChanges();

        // 20. HandoverTasks
        context.HandoverTasks.AddRange(
            new HandoverTask { TaskID = 1, TaskType = "Move In", FacilityID = 1, UnitID = 4, ReservationUnitID = 1, ReservationID = 1, AssignedStaffID = 3, AssignedByID = 1, ScheduledDate = res1.AppointmentDate, ScheduledTime = res1.AppointmentTime, ActualAt = ru1.HandedOverAt, UnitConditionNotes = "Kho đã được dọn sạch, hệ thống đèn hoạt động tốt", ConditionResult = "Good", Status = "Completed", CreatedAt = res1.ConfirmedAt ?? DateTime.UtcNow },
            new HandoverTask { TaskID = 2, TaskType = "Move In", FacilityID = 2, UnitID = 13, ReservationUnitID = 2, ReservationID = 2, AssignedStaffID = 5, AssignedByID = 2, ScheduledDate = res2.AppointmentDate, ScheduledTime = res2.AppointmentTime, ActualAt = ru2.HandedOverAt, UnitConditionNotes = "Bàn giao chìa khóa phụ và thẻ từ, kho sạch sẽ", ConditionResult = "Good", Status = "Completed", CreatedAt = res2.ConfirmedAt ?? DateTime.UtcNow },
            new HandoverTask { TaskID = 3, TaskType = "Move In", FacilityID = 1, UnitID = 2, ReservationUnitID = 3, ReservationID = 3, AssignedStaffID = 4, AssignedByID = 1, ScheduledDate = res3.AppointmentDate, ScheduledTime = res3.AppointmentTime, Status = "Scheduled", CreatedAt = res3.ConfirmedAt ?? DateTime.UtcNow },
            new HandoverTask { TaskID = 4, TaskType = "Move In", FacilityID = 1, UnitID = 5, ReservationUnitID = 4, ReservationID = 3, AssignedStaffID = 4, AssignedByID = 1, ScheduledDate = res3.AppointmentDate, ScheduledTime = res3.AppointmentTime, Status = "Scheduled", CreatedAt = res3.ConfirmedAt ?? DateTime.UtcNow }
        );
        context.SaveChanges();

        // 21. UserActivityLogs
        context.UserActivityLogs.AddRange(
            new UserActivityLog { LogID = 1, UserID = 6, Action = "Login", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 8, 29, 1, 58, 0) },
            new UserActivityLog { LogID = 2, UserID = 6, Action = "Created Reservation", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 8, 29, 2, 0, 0), Details = "Khách hàng tạo đơn RS-2026-00001 (Q1-U04)" },
            new UserActivityLog { LogID = 3, UserID = 1, Action = "Login", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 8, 29, 2, 55, 0) },
            new UserActivityLog { LogID = 4, UserID = 1, Action = "Confirmed Reservation", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 8, 29, 3, 0, 0), Details = "Quản lý cơ sở xác nhận đơn RS-2026-00001" },
            new UserActivityLog { LogID = 5, UserID = 3, Action = "Login", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 9, 1, 2, 50, 0) },
            new UserActivityLog { LogID = 6, UserID = 3, Action = "Completed Handover", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 9, 1, 3, 0, 0), Details = "Nhân viên bàn giao kho Q1-U04 cho khách" },
            new UserActivityLog { LogID = 7, UserID = 8, Action = "Login", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 10, 20, 2, 58, 0) },
            new UserActivityLog { LogID = 8, UserID = 8, Action = "Created Reservation", IPAddress = "127.0.0.1", Timestamp = new DateTime(2026, 10, 20, 3, 0, 0), Details = "Khách hàng tạo đơn RS-2026-00003 (2 kho)" }
        );
        context.SaveChanges();

        SyncPostgresSequences(context);
    }

    public static void SyncPostgresSequences(SelfStorageDbContext context)
    {
        bool isNpgsql = context.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
        if (!isNpgsql) return;

        var identityTables = new (string Table, string Column)[]
        {
            ("Role", "RoleID"),
            ("Users", "UserID"),
            ("ContractType", "ContractTypeID"),
            ("SizeCategory", "SizeCategoryID"),
            ("Facility", "FacilityID"),
            ("FacilityStaff", "AssignmentID"),
            ("UnitType", "UnitTypeID"),
            ("UnitSize", "UnitSizeID"),
            ("StorageUnit", "UnitID"),
            ("Reservation", "ReservationID"),
            ("ReservationItem", "ReservationItemID"),
            ("ReservationUnit", "ReservationUnitID"),
            ("Contract", "ContractID"),
            ("UnitAccess", "AccessID"),
            ("HandoverTask", "TaskID"),
            ("UserActivityLog", "LogID")
        };

        foreach (var (table, column) in identityTables)
        {
            try
            {
                context.Database.ExecuteSqlRaw($@"
                    SELECT setval(pg_get_serial_sequence('""{table}""', '{column}'), COALESCE((SELECT MAX(""{column}"") FROM ""{table}""), 1));
                ");
            }
            catch { }
        }
    }

    /// <summary>
    /// Postgres (Neon): EnsureCreated chỉ tạo bảng khi DB còn trống, nên DB đã có từ trước sẽ thiếu cột mới.
    /// Thêm cột Reservation.HandoverMethod (cách nhận kho) nếu chưa có. SQL Server: chạy database/Migrations/20261110_KhungGioVaCachNhanKho.sql.
    /// </summary>
    public static void EnsureHandoverMethodColumn(SelfStorageDbContext context)
    {
        bool isNpgsql = context.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
        if (!isNpgsql) return;

        try
        {
            context.Database.ExecuteSqlRaw(@"
                ALTER TABLE ""Reservation"" ADD COLUMN IF NOT EXISTS ""HandoverMethod"" VARCHAR(20) NOT NULL DEFAULT 'InPerson';
            ");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EnsureHandoverMethodColumn] Error: {ex.Message}");
        }
    }

    public static void EnsureReturnInspectionTables(SelfStorageDbContext context)
    {
        bool isNpgsql = context.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;
        if (!isNpgsql) return;

        try
        {
            context.Database.ExecuteSqlRaw(@"
                CREATE SCHEMA IF NOT EXISTS dbo;

                CREATE TABLE IF NOT EXISTS dbo.""ReturnInspection"" (
                    ""InspectionID"" SERIAL PRIMARY KEY,
                    ""ReservationID"" INT NOT NULL,
                    ""ConditionResult"" VARCHAR(20) NOT NULL,
                    ""StaffNotes"" VARCHAR(1000) NULL,
                    ""StaffImages"" TEXT NULL,
                    ""InspectedByUserID"" INT NOT NULL,
                    ""InspectedAt"" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""ConfirmDeadline"" TIMESTAMPTZ NOT NULL,
                    ""DepositRemaining"" NUMERIC(12,2) NOT NULL,
                    ""Status"" VARCHAR(30) NOT NULL,
                    ""RespondedAt"" TIMESTAMPTZ NULL,
                    ""DisputeReason"" VARCHAR(1000) NULL,
                    ""CustomerImages"" TEXT NULL,
                    ""ResolvedByUserID"" INT NULL,
                    ""ResolvedAt"" TIMESTAMPTZ NULL,
                    ""ResolutionNotes"" VARCHAR(1000) NULL,
                    ""SettledAt"" TIMESTAMPTZ NULL,
                    ""SettledBy"" VARCHAR(20) NULL
                );

                CREATE TABLE IF NOT EXISTS dbo.""ReturnInspectionFee"" (
                    ""FeeID"" SERIAL PRIMARY KEY,
                    ""InspectionID"" INT NOT NULL,
                    ""FeeCode"" VARCHAR(50) NULL,
                    ""FeePolicyID"" INT NULL,
                    ""Description"" VARCHAR(255) NOT NULL,
                    ""ProposedAmount"" NUMERIC(12,2) NOT NULL,
                    ""FinalAmount"" NUMERIC(12,2) NULL
                );

                CREATE TABLE IF NOT EXISTS public.""ReturnInspection"" (
                    ""InspectionID"" SERIAL PRIMARY KEY,
                    ""ReservationID"" INT NOT NULL,
                    ""ConditionResult"" VARCHAR(20) NOT NULL,
                    ""StaffNotes"" VARCHAR(1000) NULL,
                    ""StaffImages"" TEXT NULL,
                    ""InspectedByUserID"" INT NOT NULL,
                    ""InspectedAt"" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ""ConfirmDeadline"" TIMESTAMPTZ NOT NULL,
                    ""DepositRemaining"" NUMERIC(12,2) NOT NULL,
                    ""Status"" VARCHAR(30) NOT NULL,
                    ""RespondedAt"" TIMESTAMPTZ NULL,
                    ""DisputeReason"" VARCHAR(1000) NULL,
                    ""CustomerImages"" TEXT NULL,
                    ""ResolvedByUserID"" INT NULL,
                    ""ResolvedAt"" TIMESTAMPTZ NULL,
                    ""ResolutionNotes"" VARCHAR(1000) NULL,
                    ""SettledAt"" TIMESTAMPTZ NULL,
                    ""SettledBy"" VARCHAR(20) NULL
                );

                CREATE TABLE IF NOT EXISTS public.""ReturnInspectionFee"" (
                    ""FeeID"" SERIAL PRIMARY KEY,
                    ""InspectionID"" INT NOT NULL,
                    ""FeeCode"" VARCHAR(50) NULL,
                    ""FeePolicyID"" INT NULL,
                    ""Description"" VARCHAR(255) NOT NULL,
                    ""ProposedAmount"" NUMERIC(12,2) NOT NULL,
                    ""FinalAmount"" NUMERIC(12,2) NULL
                );
            ");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EnsureReturnInspectionTables] Error: {ex.Message}");
        }
    }
}
