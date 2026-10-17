import os

models = {
    "Role.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class Role
    {
        public int RoleID { get; set; }
        public string RoleName { get; set; } = null!;
        public string? Description { get; set; }

        public ICollection<User> Users { get; set; } = new List<User>();
    }
}""",
    "User.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class User
    {
        public int UserID { get; set; }
        public int RoleID { get; set; }
        public string Username { get; set; } = null!;
        public string PasswordHash { get; set; } = null!;
        public string FullName { get; set; } = null!;
        public string? Email { get; set; }
        public string? PhoneNumber { get; set; }
        public string? Status { get; set; }

        public Role Role { get; set; } = null!;
        public ICollection<UserActivityLog> UserActivityLogs { get; set; } = new List<UserActivityLog>();
        public ICollection<Facility> ManagedFacilities { get; set; } = new List<Facility>();
        public ICollection<FacilityStaff> FacilityStaffs { get; set; } = new List<FacilityStaff>();
        public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
        public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
        public ICollection<HandoverTask> HandoverTasksAsStaff { get; set; } = new List<HandoverTask>();
        public ICollection<HandoverTask> HandoverTasksAsCustomer { get; set; } = new List<HandoverTask>();
    }
}""",
    "UserActivityLog.cs": """using System;

namespace SelfStorageAPI.Models
{
    public class UserActivityLog
    {
        public int LogID { get; set; }
        public int UserID { get; set; }
        public string Action { get; set; } = null!;
        public string? IPAddress { get; set; }
        public DateTime Timestamp { get; set; }
        public string? Details { get; set; }

        public User User { get; set; } = null!;
    }
}""",
    "Facility.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class Facility
    {
        public int FacilityID { get; set; }
        public int ManagerID { get; set; }
        public string FacilityName { get; set; } = null!;
        public string Address { get; set; } = null!;
        public string? ContactPhone { get; set; }
        public string? Status { get; set; }

        public User Manager { get; set; } = null!;
        public ICollection<FacilityStaff> FacilityStaffs { get; set; } = new List<FacilityStaff>();
        public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
        public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    }
}""",
    "FacilityStaff.cs": """using System;

namespace SelfStorageAPI.Models
{
    public class FacilityStaff
    {
        public int StaffID { get; set; }
        public int FacilityID { get; set; }
        public int UserID { get; set; }
        public DateTime AssignedDate { get; set; }
        public string? Status { get; set; }

        public Facility Facility { get; set; } = null!;
        public User User { get; set; } = null!;
    }
}""",
    "UnitType.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class UnitType
    {
        public int UnitTypeID { get; set; }
        public string TypeName { get; set; } = null!;
        public string? Description { get; set; }

        public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
        public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    }
}""",
    "UnitSize.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class UnitSize
    {
        public int UnitSizeID { get; set; }
        public string Dimensions { get; set; } = null!;
        public decimal? Volume { get; set; }

        public ICollection<StorageUnit> StorageUnits { get; set; } = new List<StorageUnit>();
    }
}""",
    "StorageUnit.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class StorageUnit
    {
        public int UnitID { get; set; }
        public int FacilityID { get; set; }
        public int UnitTypeID { get; set; }
        public int UnitSizeID { get; set; }
        public string UnitNumber { get; set; } = null!;
        public decimal BasePrice { get; set; }
        public string Status { get; set; } = null!;

        public Facility Facility { get; set; } = null!;
        public UnitType UnitType { get; set; } = null!;
        public UnitSize UnitSize { get; set; } = null!;
        public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
        public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
        public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
    }
}""",
    "ContractType.cs": """using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class ContractType
    {
        public int ContractTypeID { get; set; }
        public string TypeName { get; set; } = null!;
        public int MinDays { get; set; }
        public int MaxDays { get; set; }
        public decimal DiscountRate { get; set; }

        public ICollection<Contract> Contracts { get; set; } = new List<Contract>();
    }
}""",
    "Reservation.cs": """using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class Reservation
    {
        public int ReservationID { get; set; }
        public int CustomerID { get; set; }
        public int FacilityID { get; set; }
        public int UnitTypeID { get; set; }
        public int? AssignedUnitID { get; set; }
        public DateTime StartDate { get; set; }
        public int RentalPeriod { get; set; }
        public DateTime EndDate { get; set; }
        public decimal? TotalEstimatedCost { get; set; }
        public string Status { get; set; } = null!;

        public User Customer { get; set; } = null!;
        public Facility Facility { get; set; } = null!;
        public UnitType UnitType { get; set; } = null!;
        public StorageUnit? AssignedUnit { get; set; }
        public Contract? Contract { get; set; }
        public ICollection<Payment> Payments { get; set; } = new List<Payment>();
        public ICollection<HandoverTask> HandoverTasks { get; set; } = new List<HandoverTask>();
    }
}""",
    "Contract.cs": """using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models
{
    public class Contract
    {
        public int ContractID { get; set; }
        public int ReservationID { get; set; }
        public int ContractTypeID { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public decimal DepositAmount { get; set; }
        public decimal TotalFee { get; set; }
        public string ContractStatus { get; set; } = null!;

        public Reservation Reservation { get; set; } = null!;
        public ContractType ContractType { get; set; } = null!;
        public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
    }
}""",
    "Payment.cs": """using System;

namespace SelfStorageAPI.Models
{
    public class Payment
    {
        public int PaymentID { get; set; }
        public int ReservationID { get; set; }
        public string? TransactionReference { get; set; }
        public decimal Amount { get; set; }
        public string? PaymentType { get; set; }
        public DateTime PaymentDate { get; set; }
        public string? PaymentStatus { get; set; }

        public Reservation Reservation { get; set; } = null!;
    }
}""",
    "UnitAccess.cs": """using System;

namespace SelfStorageAPI.Models
{
    public class UnitAccess
    {
        public int AccessID { get; set; }
        public int ContractID { get; set; }
        public int UserID { get; set; }
        public int UnitID { get; set; }
        public string? AccessType { get; set; }
        public string? AccessValue { get; set; }
        public DateTime IssueDate { get; set; }
        public DateTime? ReturnDate { get; set; }
        public string? Status { get; set; }

        public Contract Contract { get; set; } = null!;
        public User User { get; set; } = null!;
        public StorageUnit Unit { get; set; } = null!;
    }
}""",
    "HandoverTask.cs": """using System;

namespace SelfStorageAPI.Models
{
    public class HandoverTask
    {
        public int TaskID { get; set; }
        public int StaffID { get; set; }
        public string? TaskType { get; set; }
        public DateTime? ScheduledDate { get; set; }
        public DateTime? ActualDate { get; set; }
        public string? UnitConditionNotes { get; set; }
        public string? Status { get; set; }
        public int ReservationID { get; set; }
        public int CustomerID { get; set; }
        public int UnitID { get; set; }
        public string? EvidenceImages { get; set; }

        public User Staff { get; set; } = null!;
        public Reservation Reservation { get; set; } = null!;
        public User Customer { get; set; } = null!;
        public StorageUnit Unit { get; set; } = null!;
    }
}"""
}

models_dir = os.path.join(os.getcwd(), 'Models')
if not os.path.exists(models_dir):
    os.makedirs(models_dir)

for filename, content in models.items():
    with open(os.path.join(models_dir, filename), 'w', encoding='utf-8') as f:
        f.write(content)

print("Created all model files successfully.")
