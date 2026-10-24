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
    public DbSet<UserActivityLog> UserActivityLogs { get; set; } = null!;
    public DbSet<Facility> Facilities { get; set; } = null!;
    public DbSet<FacilityStaff> FacilityStaffs { get; set; } = null!;
    public DbSet<UnitType> UnitTypes { get; set; } = null!;
    public DbSet<UnitSize> UnitSizes { get; set; } = null!;
    public DbSet<StorageUnit> StorageUnits { get; set; } = null!;
    public DbSet<ContractType> ContractTypes { get; set; } = null!;
    public DbSet<Reservation> Reservations { get; set; } = null!;
    public DbSet<Contract> Contracts { get; set; } = null!;
    public DbSet<ContractSignature> ContractSignatures { get; set; } = null!;
    public DbSet<Payment> Payments { get; set; } = null!;
    public DbSet<UnitAccess> UnitAccesses { get; set; } = null!;
    public DbSet<HandoverTask> HandoverTasks { get; set; } = null!;
    public DbSet<RentalPolicy> RentalPolicies { get; set; } = null!;
    public DbSet<RentalRate> RentalRates { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Map precisely to the table names in SelfStorageDB.sql
        modelBuilder.Entity<Role>().ToTable("Role");
        modelBuilder.Entity<User>().ToTable("Users"); // SQL table is named 'Users'
        modelBuilder.Entity<UserActivityLog>().ToTable("UserActivityLog");
        modelBuilder.Entity<Facility>().ToTable("Facility");
        modelBuilder.Entity<FacilityStaff>().ToTable("FacilityStaff");
        modelBuilder.Entity<UnitType>().ToTable("UnitType");
        modelBuilder.Entity<UnitSize>().ToTable("UnitSize");
        modelBuilder.Entity<StorageUnit>().ToTable("StorageUnit");
        modelBuilder.Entity<ContractType>().ToTable("ContractType");
        modelBuilder.Entity<Reservation>().ToTable("Reservation");
        modelBuilder.Entity<Contract>().ToTable("Contract");
        modelBuilder.Entity<ContractSignature>().ToTable("ContractSignature");
        modelBuilder.Entity<Payment>().ToTable("Payment");
        modelBuilder.Entity<UnitAccess>().ToTable("UnitAccess");
        modelBuilder.Entity<HandoverTask>().ToTable("HandoverTask");
        modelBuilder.Entity<RentalPolicy>().ToTable("RentalPolicy");
        modelBuilder.Entity<RentalRate>().ToTable("RentalRate");

        // Users -> Role
        modelBuilder.Entity<User>()
            .HasOne(u => u.Role)
            .WithMany(r => r.Users)
            .HasForeignKey(u => u.RoleID)
            .OnDelete(DeleteBehavior.Restrict);

        // UserActivityLog -> Users
        modelBuilder.Entity<UserActivityLog>()
            .HasOne(l => l.User)
            .WithMany(u => u.UserActivityLogs)
            .HasForeignKey(l => l.UserID)
            .OnDelete(DeleteBehavior.Restrict);

        // Facility -> Users (Manager)
        modelBuilder.Entity<Facility>()
            .HasOne(f => f.Manager)
            .WithMany(u => u.ManagedFacilities)
            .HasForeignKey(f => f.ManagerID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Facility>()
            .HasIndex(f => f.UnitCodePrefix)
            .IsUnique();

        modelBuilder.Entity<RentalPolicy>()
            .HasIndex(p => p.FacilityID)
            .IsUnique();
        modelBuilder.Entity<RentalPolicy>()
            .HasOne(p => p.Facility)
            .WithMany()
            .HasForeignKey(p => p.FacilityID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<RentalRate>()
            .HasIndex(r => new { r.FacilityID, r.UnitTypeID, r.UnitSizeID })
            .IsUnique();
        modelBuilder.Entity<RentalRate>()
            .HasOne(r => r.Facility)
            .WithMany()
            .HasForeignKey(r => r.FacilityID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<RentalRate>()
            .HasOne(r => r.UnitType)
            .WithMany()
            .HasForeignKey(r => r.UnitTypeID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<RentalRate>()
            .HasOne(r => r.UnitSize)
            .WithMany()
            .HasForeignKey(r => r.UnitSizeID)
            .OnDelete(DeleteBehavior.Restrict);

        // FacilityStaff -> Facility, Users
        modelBuilder.Entity<FacilityStaff>()
            .HasOne(fs => fs.Facility)
            .WithMany(f => f.FacilityStaffs)
            .HasForeignKey(fs => fs.FacilityID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<FacilityStaff>()
            .HasOne(fs => fs.User)
            .WithMany(u => u.FacilityStaffs)
            .HasForeignKey(fs => fs.UserID)
            .OnDelete(DeleteBehavior.Restrict);

        // StorageUnit
        modelBuilder.Entity<StorageUnit>()
            .HasIndex(u => new { u.FacilityID, u.UnitNumber })
            .IsUnique();
        modelBuilder.Entity<StorageUnit>()
            .HasOne(su => su.Facility)
            .WithMany(f => f.StorageUnits)
            .HasForeignKey(su => su.FacilityID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<StorageUnit>()
            .HasOne(su => su.UnitType)
            .WithMany(ut => ut.StorageUnits)
            .HasForeignKey(su => su.UnitTypeID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<StorageUnit>()
            .HasOne(su => su.UnitSize)
            .WithMany(us => us.StorageUnits)
            .HasForeignKey(su => su.UnitSizeID)
            .OnDelete(DeleteBehavior.Restrict);

        // Reservation
        modelBuilder.Entity<Reservation>()
            .HasOne(r => r.Customer)
            .WithMany(u => u.Reservations)
            .HasForeignKey(r => r.CustomerID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Reservation>()
            .HasOne(r => r.Facility)
            .WithMany(f => f.Reservations)
            .HasForeignKey(r => r.FacilityID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Reservation>()
            .HasOne(r => r.UnitType)
            .WithMany(ut => ut.Reservations)
            .HasForeignKey(r => r.UnitTypeID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Reservation>()
            .HasOne(r => r.AssignedUnit)
            .WithMany(su => su.Reservations)
            .HasForeignKey(r => r.AssignedUnitID)
            .OnDelete(DeleteBehavior.Restrict);

        // Contract (One-to-One with Reservation)
        modelBuilder.Entity<Contract>()
            .HasIndex(c => c.ReservationID)
            .IsUnique();
        modelBuilder.Entity<Contract>()
            .HasOne(c => c.Reservation)
            .WithOne(r => r.Contract)
            .HasForeignKey<Contract>(c => c.ReservationID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<Contract>()
            .HasOne(c => c.ContractType)
            .WithMany(ct => ct.Contracts)
            .HasForeignKey(c => c.ContractTypeID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ContractSignature>()
            .HasKey(signature => signature.ContractID);
        modelBuilder.Entity<ContractSignature>()
            .Property(signature => signature.SignerName)
            .HasMaxLength(100);
        modelBuilder.Entity<ContractSignature>()
            .Property(signature => signature.SignatureImage)
            .HasColumnType("nvarchar(max)");
        modelBuilder.Entity<ContractSignature>()
            .Property(signature => signature.TermsVersion)
            .HasMaxLength(50);
        modelBuilder.Entity<ContractSignature>()
            .HasOne(signature => signature.Contract)
            .WithOne(contract => contract.Signature)
            .HasForeignKey<ContractSignature>(signature => signature.ContractID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<ContractSignature>()
            .HasOne(signature => signature.User)
            .WithMany()
            .HasForeignKey(signature => signature.UserID)
            .OnDelete(DeleteBehavior.Restrict);

        // Payment -> Reservation
        modelBuilder.Entity<Payment>()
            .HasOne(p => p.Reservation)
            .WithMany(r => r.Payments)
            .HasForeignKey(p => p.ReservationID)
            .OnDelete(DeleteBehavior.Restrict);

        // UnitAccess -> Contract, Users, StorageUnit
        modelBuilder.Entity<UnitAccess>()
            .HasOne(ua => ua.Contract)
            .WithMany(c => c.UnitAccesses)
            .HasForeignKey(ua => ua.ContractID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<UnitAccess>()
            .HasOne(ua => ua.User)
            .WithMany(u => u.UnitAccesses)
            .HasForeignKey(ua => ua.UserID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<UnitAccess>()
            .HasOne(ua => ua.Unit)
            .WithMany(su => su.UnitAccesses)
            .HasForeignKey(ua => ua.UnitID)
            .OnDelete(DeleteBehavior.Restrict);

        // HandoverTask -> Users (Staff), Reservation, Users (Customer), StorageUnit
        modelBuilder.Entity<HandoverTask>()
            .HasOne(ht => ht.Staff)
            .WithMany(u => u.HandoverTasksAsStaff)
            .HasForeignKey(ht => ht.StaffID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<HandoverTask>()
            .HasOne(ht => ht.Customer)
            .WithMany(u => u.HandoverTasksAsCustomer)
            .HasForeignKey(ht => ht.CustomerID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<HandoverTask>()
            .HasOne(ht => ht.Reservation)
            .WithMany(r => r.HandoverTasks)
            .HasForeignKey(ht => ht.ReservationID)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<HandoverTask>()
            .HasOne(ht => ht.Unit)
            .WithMany(su => su.HandoverTasks)
            .HasForeignKey(ht => ht.UnitID)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
