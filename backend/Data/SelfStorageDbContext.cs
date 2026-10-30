using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Data;

public class SelfStorageDbContext : DbContext
{
    public SelfStorageDbContext(DbContextOptions<SelfStorageDbContext> options) : base(options)
    {
    }

    public DbSet<Role> Roles { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<PendingRegistration> PendingRegistrations { get; set; } = null!;
    public DbSet<EmailVerificationCode> EmailVerificationCodes { get; set; } = null!;
    public DbSet<UserActivityLog> UserActivityLogs { get; set; } = null!;
    public DbSet<AppErrorMessage> AppErrorMessages { get; set; } = null!;
    public DbSet<Facility> Facilities { get; set; } = null!;
    public DbSet<SizeCategory> SizeCategories { get; set; } = null!;
    public DbSet<RentalPolicy> RentalPolicies { get; set; } = null!;
    public DbSet<CancellationRule> CancellationRules { get; set; } = null!;
    public DbSet<FacilityStaff> FacilityStaffs { get; set; } = null!;
    public DbSet<UnitType> UnitTypes { get; set; } = null!;
    public DbSet<UnitSize> UnitSizes { get; set; } = null!;
    public DbSet<FacilityUnitType> FacilityUnitTypes { get; set; } = null!;
    public DbSet<FacilityUnitSize> FacilityUnitSizes { get; set; } = null!;
    public DbSet<FeePolicy> FeePolicies { get; set; } = null!;
    public DbSet<RentalRate> RentalRates { get; set; } = null!;
    public DbSet<StorageUnit> StorageUnits { get; set; } = null!;
    public DbSet<ContractType> ContractTypes { get; set; } = null!;
    public DbSet<Reservation> Reservations { get; set; } = null!;
    public DbSet<ReservationItem> ReservationItems { get; set; } = null!;
    public DbSet<ReservationUnit> ReservationUnits { get; set; } = null!;
    public DbSet<Contract> Contracts { get; set; } = null!;
    public DbSet<ContractSignature> ContractSignatures { get; set; } = null!;
    public DbSet<Payment> Payments { get; set; } = null!;
    public DbSet<PaymentCallbackLog> PaymentCallbackLogs { get; set; } = null!;
    public DbSet<Charge> Charges { get; set; } = null!;
    public DbSet<SupportRequest> SupportRequests { get; set; } = null!;
    public DbSet<HandoverTask> HandoverTasks { get; set; } = null!;
    public DbSet<UnitAccess> UnitAccesses { get; set; } = null!;
    public DbSet<StatusChangeLog> StatusChangeLogs { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        bool isNpgsql = Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;

        // 1. Role
        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("Role");
            entity.HasKey(r => r.RoleID);
            entity.HasIndex(r => r.RoleName).IsUnique();
            entity.Property(r => r.RoleName).HasMaxLength(50);
            entity.Property(r => r.Description).HasMaxLength(255);
        });

        // 2. Users
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(u => u.UserID);
            entity.HasIndex(u => u.Email).IsUnique();
            if (isNpgsql)
                entity.HasIndex(u => u.Username).IsUnique().HasFilter("\"Username\" IS NOT NULL");
            else
                entity.HasIndex(u => u.Username).IsUnique().HasFilter("[Username] IS NOT NULL");
            entity.Property(u => u.Username).HasMaxLength(100);
            entity.Property(u => u.PasswordHash).HasMaxLength(100);
            entity.Property(u => u.FullName).HasMaxLength(150);
            entity.Property(u => u.Email).HasMaxLength(150);
            entity.Property(u => u.PhoneNumber).HasMaxLength(30);
            entity.Property(u => u.Status).HasMaxLength(30);

            entity.HasOne(u => u.Role)
                .WithMany(r => r.Users)
                .HasForeignKey(u => u.RoleID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 3. PendingRegistration
        modelBuilder.Entity<PendingRegistration>(entity =>
        {
            entity.ToTable("PendingRegistration", tb => tb.HasTrigger("TR_PendingRegistration_Validate"));
            entity.HasKey(p => p.PendingRegistrationID);
            entity.HasIndex(p => p.Email).IsUnique();
            entity.Property(p => p.Email).HasMaxLength(150);
            entity.Property(p => p.FullName).HasMaxLength(150);
            entity.Property(p => p.PhoneNumber).HasMaxLength(30);
            entity.Property(p => p.PasswordHash).HasMaxLength(100);
            entity.Property(p => p.RequestedIPAddress).HasMaxLength(50);
        });

        // 4. EmailVerificationCode
        modelBuilder.Entity<EmailVerificationCode>(entity =>
        {
            entity.ToTable("EmailVerificationCode");
            entity.HasKey(e => e.VerificationCodeID);
            entity.Property(e => e.Email).HasMaxLength(150);
            entity.Property(e => e.Purpose).HasMaxLength(30);
            if (isNpgsql)
                entity.Property(e => e.CodeHash).HasColumnType("bytea");
            else
                entity.Property(e => e.CodeHash).HasColumnType("binary(32)");
            entity.Property(e => e.CloseReason).HasMaxLength(20);
            entity.Property(e => e.RequestedIPAddress).HasMaxLength(50);

            entity.HasOne(e => e.User)
                .WithMany(u => u.EmailVerificationCodes)
                .HasForeignKey(e => e.UserID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.PendingRegistration)
                .WithMany(p => p.EmailVerificationCodes)
                .HasForeignKey(e => e.PendingRegistrationID)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // 5. UserActivityLog
        modelBuilder.Entity<UserActivityLog>(entity =>
        {
            entity.ToTable("UserActivityLog");
            entity.HasKey(l => l.LogID);
            entity.Property(l => l.Action).HasMaxLength(100);
            entity.Property(l => l.IPAddress).HasMaxLength(50);
            entity.Property(l => l.Details).HasMaxLength(500);

            entity.HasOne(l => l.User)
                .WithMany(u => u.UserActivityLogs)
                .HasForeignKey(l => l.UserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 6. AppErrorMessage
        modelBuilder.Entity<AppErrorMessage>(entity =>
        {
            entity.ToTable("AppErrorMessage");
            entity.HasKey(e => e.ErrorKey);
            entity.Property(e => e.ErrorKey).HasMaxLength(128);
            entity.Property(e => e.MessageVi).HasMaxLength(500);
        });

        // 7. Facility
        modelBuilder.Entity<Facility>(entity =>
        {
            entity.ToTable("Facility", tb =>
            {
                tb.HasTrigger("TR_Facility_Validate");
                tb.HasTrigger("TR_Facility_CreateDefaultPolicy");
            });
            entity.HasKey(f => f.FacilityID);
            entity.HasIndex(f => f.UnitCodePrefix).IsUnique();
            entity.HasIndex(f => f.FacilityName).IsUnique();
            entity.Property(f => f.FacilityName).HasMaxLength(150);
            entity.Property(f => f.UnitCodePrefix).HasMaxLength(10);
            entity.Property(f => f.StreetAddress).HasMaxLength(255);
            entity.Property(f => f.Ward).HasMaxLength(100);
            entity.Property(f => f.District).HasMaxLength(100);
            entity.Property(f => f.City).HasMaxLength(100);
            entity.Property(f => f.Latitude).HasColumnType("decimal(9,6)");
            entity.Property(f => f.Longitude).HasColumnType("decimal(9,6)");
            entity.Property(f => f.ContactPhone).HasMaxLength(30);
            entity.Property(f => f.OpeningHours).HasMaxLength(100);
            entity.Property(f => f.Description).HasMaxLength(1000);
            entity.Property(f => f.ImageUrl).HasMaxLength(500);
            entity.Property(f => f.Status).HasMaxLength(30);

            entity.HasOne(f => f.Manager)
                .WithMany(u => u.ManagedFacilities)
                .HasForeignKey(f => f.ManagerID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(f => f.UpdatedByUser)
                .WithMany()
                .HasForeignKey(f => f.UpdatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 8. SizeCategory
        modelBuilder.Entity<SizeCategory>(entity =>
        {
            entity.ToTable("SizeCategory", tb => tb.HasTrigger("TR_SizeCategory_ValidateExistingData"));
            entity.HasKey(c => c.SizeCategoryID);
            entity.HasIndex(c => c.CategoryCode).IsUnique();
            entity.HasIndex(c => c.CategoryName).IsUnique();
            entity.HasIndex(c => c.CodePrefix).IsUnique();
            entity.Property(c => c.CategoryCode).HasMaxLength(20);
            entity.Property(c => c.CategoryName).HasMaxLength(50);
            entity.Property(c => c.CodePrefix).HasMaxLength(1).IsFixedLength();
            entity.Property(c => c.StandardHeightM).HasColumnType("decimal(5,2)");
            entity.Property(c => c.MinVolumeM3).HasColumnType("decimal(10,2)");
            entity.Property(c => c.MaxVolumeM3).HasColumnType("decimal(10,2)");
            entity.Property(c => c.MinMonthlyPrice).HasColumnType("decimal(12,2)");
            entity.Property(c => c.MaxMonthlyPrice).HasColumnType("decimal(12,2)");

            entity.HasOne(c => c.UpdatedByUser)
                .WithMany()
                .HasForeignKey(c => c.UpdatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 9. RentalPolicy
        modelBuilder.Entity<RentalPolicy>(entity =>
        {
            entity.ToTable("RentalPolicy");
            entity.HasKey(p => p.RentalPolicyID);
            entity.HasIndex(p => p.FacilityID).IsUnique();
            entity.Property(p => p.LateFeePerDay).HasColumnType("decimal(12,2)");

            entity.HasOne(p => p.Facility)
                .WithOne(f => f.RentalPolicy)
                .HasForeignKey<RentalPolicy>(p => p.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.UpdatedByUser)
                .WithMany()
                .HasForeignKey(p => p.UpdatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 10. CancellationRule
        modelBuilder.Entity<CancellationRule>(entity =>
        {
            entity.ToTable("CancellationRule");
            entity.HasKey(c => c.CancellationRuleID);
            entity.HasIndex(c => new { c.RentalPolicyID, c.DaysBeforeStart }).IsUnique();
            entity.Property(c => c.RefundPercent).HasColumnType("decimal(5,2)");

            entity.HasOne(c => c.RentalPolicy)
                .WithMany(p => p.CancellationRules)
                .HasForeignKey(c => c.RentalPolicyID)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // 11. FacilityStaff
        modelBuilder.Entity<FacilityStaff>(entity =>
        {
            entity.ToTable("FacilityStaff", tb => tb.HasTrigger("TR_FacilityStaff_Validate"));
            entity.HasKey(fs => fs.AssignmentID);
            entity.HasIndex(fs => new { fs.FacilityID, fs.UserID }).IsUnique();
            entity.Property(fs => fs.AssignedDate).HasColumnType("date");
            entity.Property(fs => fs.Status).HasMaxLength(30);

            entity.HasOne(fs => fs.Facility)
                .WithMany(f => f.FacilityStaffs)
                .HasForeignKey(fs => fs.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(fs => fs.User)
                .WithMany(u => u.FacilityStaffs)
                .HasForeignKey(fs => fs.UserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 12. UnitType
        modelBuilder.Entity<UnitType>(entity =>
        {
            entity.ToTable("UnitType");
            entity.HasKey(t => t.UnitTypeID);
            entity.HasIndex(t => t.TypeName).IsUnique();
            entity.Property(t => t.TypeName).HasMaxLength(100);
            entity.Property(t => t.Description).HasMaxLength(255);
            entity.Property(t => t.ImageUrl).HasMaxLength(500);

            entity.HasOne(t => t.CreatedByUser)
                .WithMany()
                .HasForeignKey(t => t.CreatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 13. UnitSize
        modelBuilder.Entity<UnitSize>(entity =>
        {
            entity.ToTable("UnitSize", tb => tb.HasTrigger("TR_UnitSize_Validate"));
            entity.HasKey(s => s.UnitSizeID);
            entity.HasIndex(s => s.SizeCode).IsUnique();
            entity.Property(s => s.SizeCode).HasMaxLength(10);
            entity.Property(s => s.DisplayName).HasMaxLength(100);
            entity.Property(s => s.WidthM).HasColumnType("decimal(7,2)");
            entity.Property(s => s.LengthM).HasColumnType("decimal(7,2)");
            entity.Property(s => s.HeightM).HasColumnType("decimal(7,2)");
            entity.Property(s => s.AreaM2)
                .HasColumnType("decimal(9,2)")
                .HasComputedColumnSql(isNpgsql ? "ROUND(\"WidthM\" * \"LengthM\", 2)" : "CAST([WidthM]*[LengthM] AS DECIMAL(9,2))", stored: true);
            entity.Property(s => s.VolumeM3)
                .HasColumnType("decimal(10,2)")
                .HasComputedColumnSql(isNpgsql ? "ROUND(\"WidthM\" * \"LengthM\" * \"HeightM\", 2)" : "CAST([WidthM]*[LengthM]*[HeightM] AS DECIMAL(10,2))", stored: true);

            entity.HasOne(s => s.SizeCategory)
                .WithMany(c => c.UnitSizes)
                .HasForeignKey(s => s.SizeCategoryID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.CreatedByUser)
                .WithMany()
                .HasForeignKey(s => s.CreatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 14. FacilityUnitType
        modelBuilder.Entity<FacilityUnitType>(entity =>
        {
            entity.ToTable("FacilityUnitType", tb => tb.HasTrigger("TR_FacilityUnitType_Validate"));
            entity.HasKey(ft => new { ft.FacilityID, ft.UnitTypeID });

            entity.HasOne(ft => ft.Facility)
                .WithMany(f => f.FacilityUnitTypes)
                .HasForeignKey(ft => ft.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ft => ft.UnitType)
                .WithMany(t => t.FacilityUnitTypes)
                .HasForeignKey(ft => ft.UnitTypeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ft => ft.AddedByUser)
                .WithMany()
                .HasForeignKey(ft => ft.AddedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 15. FacilityUnitSize
        modelBuilder.Entity<FacilityUnitSize>(entity =>
        {
            entity.ToTable("FacilityUnitSize", tb => tb.HasTrigger("TR_FacilityUnitSize_Validate"));
            entity.HasKey(fs => new { fs.FacilityID, fs.UnitSizeID });

            entity.HasOne(fs => fs.Facility)
                .WithMany(f => f.FacilityUnitSizes)
                .HasForeignKey(fs => fs.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(fs => fs.UnitSize)
                .WithMany(s => s.FacilityUnitSizes)
                .HasForeignKey(fs => fs.UnitSizeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(fs => fs.AddedByUser)
                .WithMany()
                .HasForeignKey(fs => fs.AddedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 16. FeePolicy
        modelBuilder.Entity<FeePolicy>(entity =>
        {
            entity.ToTable("FeePolicy");
            entity.HasKey(f => f.FeePolicyID);
            entity.HasIndex(f => f.FeeCode).IsUnique();
            entity.Property(f => f.FeeCode).HasMaxLength(30);
            entity.Property(f => f.FeeName).HasMaxLength(100);
            entity.Property(f => f.FeeCategory).HasMaxLength(20);
            entity.Property(f => f.ValueType).HasMaxLength(20);
            entity.Property(f => f.MinValue).HasColumnType("decimal(12,2)");
            entity.Property(f => f.MaxValue).HasColumnType("decimal(12,2)");
        });

        // 17. RentalRate
        modelBuilder.Entity<RentalRate>(entity =>
        {
            entity.ToTable("RentalRate", tb => tb.HasTrigger("TR_RentalRate_Validate"));
            entity.HasKey(r => r.RentalRateID);
            entity.HasIndex(r => new { r.FacilityID, r.UnitTypeID, r.UnitSizeID }).IsUnique();
            entity.Property(r => r.MonthlyPrice).HasColumnType("decimal(12,2)");

            entity.HasOne(r => r.Facility)
                .WithMany(f => f.RentalRates)
                .HasForeignKey(r => r.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.UnitType)
                .WithMany(t => t.RentalRates)
                .HasForeignKey(r => r.UnitTypeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.UnitSize)
                .WithMany(s => s.RentalRates)
                .HasForeignKey(r => r.UnitSizeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.FacilityUnitType)
                .WithMany(ft => ft.RentalRates)
                .HasForeignKey(r => new { r.FacilityID, r.UnitTypeID })
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.FacilityUnitSize)
                .WithMany(fs => fs.RentalRates)
                .HasForeignKey(r => new { r.FacilityID, r.UnitSizeID })
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.UpdatedByUser)
                .WithMany()
                .HasForeignKey(r => r.UpdatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 18. StorageUnit
        modelBuilder.Entity<StorageUnit>(entity =>
        {
            entity.ToTable("StorageUnit", tb =>
            {
                tb.HasTrigger("TR_StorageUnit_Validate");
                tb.HasTrigger("TR_StorageUnit_LogStatus");
            });
            entity.HasKey(u => u.UnitID);
            entity.HasIndex(u => new { u.FacilityID, u.UnitNumber }).IsUnique();
            entity.Property(u => u.UnitNumber).HasMaxLength(50);
            entity.Property(u => u.Floor).HasMaxLength(20);
            entity.Property(u => u.Zone).HasMaxLength(20);
            entity.Property(u => u.LocationNote).HasMaxLength(200);
            entity.Property(u => u.Status).HasMaxLength(30);

            entity.HasOne(u => u.Facility)
                .WithMany(f => f.StorageUnits)
                .HasForeignKey(u => u.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(u => u.UnitType)
                .WithMany(t => t.StorageUnits)
                .HasForeignKey(u => u.UnitTypeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(u => u.UnitSize)
                .WithMany(s => s.StorageUnits)
                .HasForeignKey(u => u.UnitSizeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(u => u.RentalRate)
                .WithMany(r => r.StorageUnits)
                .HasPrincipalKey(r => new { r.FacilityID, r.UnitTypeID, r.UnitSizeID })
                .HasForeignKey(u => new { u.FacilityID, u.UnitTypeID, u.UnitSizeID })
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(u => u.UpdatedByUser)
                .WithMany()
                .HasForeignKey(u => u.UpdatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 19. ContractType
        modelBuilder.Entity<ContractType>(entity =>
        {
            entity.ToTable("ContractType");
            entity.HasKey(ct => ct.ContractTypeID);
            entity.HasIndex(ct => ct.TypeName).IsUnique();
            entity.HasIndex(ct => ct.RentalMonths).IsUnique();
            entity.Property(ct => ct.TypeName).HasMaxLength(100);
            entity.Property(ct => ct.DiscountRate).HasColumnType("decimal(5,2)");
        });

        // 20. Reservation
        modelBuilder.Entity<Reservation>(entity =>
        {
            entity.ToTable("Reservation", tb =>
            {
                tb.HasTrigger("TR_Reservation_Insert");
                tb.HasTrigger("TR_Reservation_Update");
                tb.HasTrigger("TR_Reservation_LogStatus");
            });
            entity.HasKey(r => r.ReservationID);
            entity.HasIndex(r => r.ReservationCode).IsUnique();
            entity.HasIndex(r => r.CheckInToken).IsUnique();
            entity.Property(r => r.ReservationCode).HasMaxLength(20);
            entity.Property(r => r.StartDate).HasColumnType("date");
            entity.Property(r => r.EndDate).HasColumnType("date");
            entity.Property(r => r.AppointmentDate).HasColumnType("date");
            entity.Property(r => r.AppointmentTime).HasColumnType("time(0)");
            entity.Property(r => r.Status).HasMaxLength(30);
            entity.Property(r => r.CancelReason).HasMaxLength(500);

            entity.HasOne(r => r.Customer)
                .WithMany(u => u.Reservations)
                .HasForeignKey(r => r.CustomerID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.Facility)
                .WithMany(f => f.Reservations)
                .HasForeignKey(r => r.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.ContractType)
                .WithMany(ct => ct.Reservations)
                .HasPrincipalKey(ct => ct.RentalMonths)
                .HasForeignKey(r => r.RentalPeriod)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.ConfirmedByUser)
                .WithMany()
                .HasForeignKey(r => r.ConfirmedByUserID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.CancelledByUser)
                .WithMany()
                .HasForeignKey(r => r.CancelledByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 21. ReservationItem
        modelBuilder.Entity<ReservationItem>(entity =>
        {
            entity.ToTable("ReservationItem");
            entity.HasKey(ri => ri.ReservationItemID);
            entity.HasIndex(ri => new { ri.ReservationID, ri.UnitTypeID, ri.UnitSizeID }).IsUnique();
            entity.Property(ri => ri.MonthlyPrice).HasColumnType("decimal(12,2)");
            entity.Property(ri => ri.DiscountPercent).HasColumnType("decimal(5,2)");
            entity.Property(ri => ri.EffectiveMonthlyPrice)
                .HasColumnType("decimal(12,2)")
                .HasComputedColumnSql(isNpgsql ? "ROUND(\"MonthlyPrice\" * (100 - \"DiscountPercent\") / 100, 2)" : "CAST(ROUND([MonthlyPrice]*(100-[DiscountPercent])/100, 0) AS DECIMAL(12,2))", stored: true);

            entity.HasOne(ri => ri.Reservation)
                .WithMany(r => r.ReservationItems)
                .HasForeignKey(ri => ri.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ri => ri.Facility)
                .WithMany()
                .HasForeignKey(ri => ri.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ri => ri.UnitType)
                .WithMany(t => t.ReservationItems)
                .HasForeignKey(ri => ri.UnitTypeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ri => ri.UnitSize)
                .WithMany(s => s.ReservationItems)
                .HasForeignKey(ri => ri.UnitSizeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ri => ri.RentalRate)
                .WithMany(r => r.ReservationItems)
                .HasPrincipalKey(r => new { r.FacilityID, r.UnitTypeID, r.UnitSizeID })
                .HasForeignKey(ri => new { ri.FacilityID, ri.UnitTypeID, ri.UnitSizeID })
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 22. ReservationUnit
        modelBuilder.Entity<ReservationUnit>(entity =>
        {
            entity.ToTable("ReservationUnit", tb =>
            {
                tb.HasTrigger("TR_ReservationUnit_Validate");
                tb.HasTrigger("TR_ReservationUnit_LogStatus");
            });
            entity.HasKey(ru => ru.ReservationUnitID);
            entity.Property(ru => ru.Status).HasMaxLength(20);
            entity.Property(ru => ru.ReturnedOn).HasColumnType("date");

            entity.HasOne(ru => ru.Reservation)
                .WithMany(r => r.ReservationUnits)
                .HasForeignKey(ru => ru.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.ReservationItem)
                .WithMany(ri => ri.ReservationUnits)
                .HasForeignKey(ru => ru.ReservationItemID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.Facility)
                .WithMany()
                .HasForeignKey(ru => ru.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.Unit)
                .WithMany(u => u.ReservationUnits)
                .HasForeignKey(ru => ru.UnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.UnitType)
                .WithMany()
                .HasForeignKey(ru => ru.UnitTypeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.UnitSize)
                .WithMany()
                .HasForeignKey(ru => ru.UnitSizeID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ru => ru.AssignedByUser)
                .WithMany()
                .HasForeignKey(ru => ru.AssignedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 23. Contract (1-1 with Reservation)
        modelBuilder.Entity<Contract>(entity =>
        {
            entity.ToTable("Contract", tb =>
            {
                tb.HasTrigger("TR_Contract_Insert");
                tb.HasTrigger("TR_Contract_LogStatus");
            });
            entity.HasKey(c => c.ContractID);
            entity.HasIndex(c => c.ContractNumber).IsUnique();
            entity.HasIndex(c => c.ReservationID).IsUnique();
            entity.Property(c => c.ContractNumber).HasMaxLength(30);
            entity.Property(c => c.StartDate).HasColumnType("date");
            entity.Property(c => c.EndDate).HasColumnType("date");
            entity.Property(c => c.ActualEndDate).HasColumnType("date");
            entity.Property(c => c.ContractStatus).HasMaxLength(30);

            entity.HasOne(c => c.Reservation)
                .WithOne(r => r.Contract)
                .HasForeignKey<Contract>(c => c.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.RenewedFromContract)
                .WithMany(c => c.RenewedContracts)
                .HasForeignKey(c => c.RenewedFromContractID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.CreatedByUser)
                .WithMany()
                .HasForeignKey(c => c.CreatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 24. ContractSignature
        modelBuilder.Entity<ContractSignature>(entity =>
        {
            entity.ToTable("ContractSignature");
            entity.HasKey(s => s.ContractID);
            entity.Property(s => s.SignerName).HasMaxLength(100);
            entity.Property(s => s.SignatureImage).HasColumnType(isNpgsql ? "text" : "nvarchar(max)");
            entity.Property(s => s.TermsVersion).HasMaxLength(50);

            entity.HasOne(s => s.Contract)
                .WithOne(c => c.Signature)
                .HasForeignKey<ContractSignature>(s => s.ContractID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 25. Payment
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("Payment", tb =>
            {
                tb.HasTrigger("TR_Payment_Validate");
                tb.HasTrigger("TR_Payment_LogStatus");
            });
            entity.HasKey(p => p.PaymentID);
            entity.HasIndex(p => p.OrderCode).IsUnique();
            entity.HasIndex(p => p.IdempotencyKey).IsUnique();
            entity.Property(p => p.OrderCode).HasMaxLength(50);
            entity.Property(p => p.IdempotencyKey).HasMaxLength(100);
            entity.Property(p => p.Provider).HasMaxLength(30);
            entity.Property(p => p.ProviderTransactionId).HasMaxLength(100);
            entity.Property(p => p.Direction).HasMaxLength(20);
            entity.Property(p => p.RefundReason).HasMaxLength(20);
            entity.Property(p => p.Amount).HasColumnType("decimal(12,2)");
            entity.Property(p => p.ReceivedAmount).HasColumnType("decimal(12,2)");
            entity.Property(p => p.PaymentMethod).HasMaxLength(50);
            entity.Property(p => p.Status).HasMaxLength(20);

            entity.HasOne(p => p.Reservation)
                .WithMany(r => r.Payments)
                .HasForeignKey(p => p.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.RefundOfPayment)
                .WithMany(p => p.RefundPayments)
                .HasForeignKey(p => p.RefundOfPaymentID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(p => p.CreatedByUser)
                .WithMany()
                .HasForeignKey(p => p.CreatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 26. PaymentCallbackLog
        modelBuilder.Entity<PaymentCallbackLog>(entity =>
        {
            entity.ToTable("PaymentCallbackLog");
            entity.HasKey(cb => cb.CallbackID);
            entity.Property(cb => cb.Provider).HasMaxLength(30);
            entity.Property(cb => cb.OrderCode).HasMaxLength(50);
            entity.Property(cb => cb.ProviderTransactionId).HasMaxLength(100);
            entity.Property(cb => cb.ReportedStatus).HasMaxLength(20);
            entity.Property(cb => cb.ReportedAmount).HasColumnType("decimal(12,2)");
            entity.Property(cb => cb.ProcessResult).HasMaxLength(20);
            entity.Property(cb => cb.Note).HasMaxLength(500);

            entity.HasOne(cb => cb.Payment)
                .WithMany(p => p.CallbackLogs)
                .HasForeignKey(cb => cb.PaymentID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 27. Charge
        modelBuilder.Entity<Charge>(entity =>
        {
            entity.ToTable("Charge", tb =>
            {
                tb.HasTrigger("TR_Charge_Validate");
                tb.HasTrigger("TR_Charge_LogStatus");
            });
            entity.HasKey(c => c.ChargeID);
            entity.Property(c => c.ChargeType).HasMaxLength(20);
            entity.Property(c => c.Description).HasMaxLength(255);
            entity.Property(c => c.PeriodStart).HasColumnType("date");
            entity.Property(c => c.PeriodEnd).HasColumnType("date");
            entity.Property(c => c.Amount).HasColumnType("decimal(12,2)");
            entity.Property(c => c.DueDate).HasColumnType("date");
            entity.Property(c => c.Status).HasMaxLength(20);
            entity.Property(c => c.RefundedAmount).HasColumnType("decimal(12,2)");
            entity.Property(c => c.WaiveReason).HasMaxLength(255);

            entity.HasOne(c => c.Reservation)
                .WithMany(r => r.Charges)
                .HasForeignKey(c => c.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.ReservationUnit)
                .WithMany(ru => ru.Charges)
                .HasForeignKey(c => c.ReservationUnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.Payment)
                .WithMany(p => p.Charges)
                .HasForeignKey(c => c.PaymentID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.RefundPayment)
                .WithMany(p => p.RefundedCharges)
                .HasForeignKey(c => c.RefundPaymentID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.FeePolicy)
                .WithMany(f => f.Charges)
                .HasForeignKey(c => c.FeePolicyID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.WaivedByUser)
                .WithMany()
                .HasForeignKey(c => c.WaivedByUserID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(c => c.CreatedByUser)
                .WithMany()
                .HasForeignKey(c => c.CreatedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 28. SupportRequest
        modelBuilder.Entity<SupportRequest>(entity =>
        {
            entity.ToTable("SupportRequest", tb => tb.HasTrigger("TR_SupportRequest_LogStatus"));
            entity.HasKey(sr => sr.RequestID);
            entity.Property(sr => sr.Category).HasMaxLength(30);
            entity.Property(sr => sr.Description).HasMaxLength(1000);
            entity.Property(sr => sr.Status).HasMaxLength(30);
            entity.Property(sr => sr.ResolutionNotes).HasMaxLength(1000);

            entity.HasOne(sr => sr.Customer)
                .WithMany(u => u.SupportRequestsAsCustomer)
                .HasForeignKey(sr => sr.CustomerID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(sr => sr.Facility)
                .WithMany(f => f.SupportRequests)
                .HasForeignKey(sr => sr.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(sr => sr.Unit)
                .WithMany(u => u.SupportRequests)
                .HasForeignKey(sr => sr.UnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(sr => sr.Contract)
                .WithMany(c => c.SupportRequests)
                .HasForeignKey(sr => sr.ContractID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(sr => sr.AssignedStaff)
                .WithMany(u => u.SupportRequestsAsStaff)
                .HasForeignKey(sr => sr.AssignedStaffID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 29. HandoverTask
        modelBuilder.Entity<HandoverTask>(entity =>
        {
            entity.ToTable("HandoverTask", tb =>
            {
                tb.HasTrigger("TR_HandoverTask_Validate");
                tb.HasTrigger("TR_HandoverTask_LogStatus");
            });
            entity.HasKey(ht => ht.TaskID);
            entity.Property(ht => ht.TaskType).HasMaxLength(20);
            entity.Property(ht => ht.ScheduledDate).HasColumnType("date");
            entity.Property(ht => ht.ScheduledTime).HasColumnType("time(0)");
            entity.Property(ht => ht.UnitConditionNotes).HasMaxLength(1000);
            entity.Property(ht => ht.ConditionResult).HasMaxLength(20);
            entity.Property(ht => ht.Status).HasMaxLength(20);

            entity.HasOne(ht => ht.Facility)
                .WithMany(f => f.HandoverTasks)
                .HasForeignKey(ht => ht.FacilityID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.Unit)
                .WithMany(u => u.HandoverTasks)
                .HasForeignKey(ht => ht.UnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.ReservationUnit)
                .WithMany(ru => ru.HandoverTasks)
                .HasForeignKey(ht => ht.ReservationUnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.Reservation)
                .WithMany(r => r.HandoverTasks)
                .HasForeignKey(ht => ht.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.SupportRequest)
                .WithMany(sr => sr.HandoverTasks)
                .HasForeignKey(ht => ht.SupportRequestID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.AssignedStaff)
                .WithMany(u => u.HandoverTasksAsStaff)
                .HasForeignKey(ht => ht.AssignedStaffID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ht => ht.AssignedByUser)
                .WithMany()
                .HasForeignKey(ht => ht.AssignedByID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 30. UnitAccess
        modelBuilder.Entity<UnitAccess>(entity =>
        {
            entity.ToTable("UnitAccess", tb =>
            {
                tb.HasTrigger("TR_UnitAccess_Validate");
                tb.HasTrigger("TR_UnitAccess_LogStatus");
            });
            entity.HasKey(ua => ua.AccessID);
            entity.Property(ua => ua.AccessType).HasMaxLength(30);
            entity.Property(ua => ua.AccessValue).HasMaxLength(255);
            entity.Property(ua => ua.Status).HasMaxLength(20);

            entity.HasOne(ua => ua.ReservationUnit)
                .WithMany(ru => ru.UnitAccesses)
                .HasForeignKey(ua => ua.ReservationUnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ua => ua.Reservation)
                .WithMany(r => r.UnitAccesses)
                .HasForeignKey(ua => ua.ReservationID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ua => ua.Unit)
                .WithMany(u => u.UnitAccesses)
                .HasForeignKey(ua => ua.UnitID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ua => ua.User)
                .WithMany(u => u.UnitAccesses)
                .HasForeignKey(ua => ua.UserID)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(ua => ua.IssuedByUser)
                .WithMany()
                .HasForeignKey(ua => ua.IssuedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // 31. StatusChangeLog
        modelBuilder.Entity<StatusChangeLog>(entity =>
        {
            entity.ToTable("StatusChangeLog");
            entity.HasKey(l => l.LogID);
            entity.Property(l => l.EntityType).HasMaxLength(50);
            entity.Property(l => l.OldStatus).HasMaxLength(30);
            entity.Property(l => l.NewStatus).HasMaxLength(30);
            entity.Property(l => l.Source).HasMaxLength(200);

            entity.HasOne(l => l.ChangedByUser)
                .WithMany()
                .HasForeignKey(l => l.ChangedByUserID)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
