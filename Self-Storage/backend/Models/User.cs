using System;
using System.Collections.Generic;

namespace SelfStorageAPI.Models;

public class User
{
    public int UserID { get; set; }
    public int RoleID { get; set; }
    public string? Username { get; set; }
    public string PasswordHash { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public bool EmailVerified { get; set; }
    public string? PhoneNumber { get; set; }
    public string Status { get; set; } = null!;
    public byte FailedLoginCount { get; set; }
    public DateTime? LockoutEndAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public Role Role { get; set; } = null!;
    public ICollection<EmailVerificationCode> EmailVerificationCodes { get; set; } = new List<EmailVerificationCode>();
    public ICollection<UserActivityLog> UserActivityLogs { get; set; } = new List<UserActivityLog>();
    public ICollection<Facility> ManagedFacilities { get; set; } = new List<Facility>();
    public ICollection<FacilityStaff> FacilityStaffs { get; set; } = new List<FacilityStaff>();
    public ICollection<Reservation> Reservations { get; set; } = new List<Reservation>();
    public ICollection<UnitAccess> UnitAccesses { get; set; } = new List<UnitAccess>();
    public ICollection<HandoverTask> HandoverTasksAsStaff { get; set; } = new List<HandoverTask>();
    public ICollection<SupportRequest> SupportRequestsAsCustomer { get; set; } = new List<SupportRequest>();
    public ICollection<SupportRequest> SupportRequestsAsStaff { get; set; } = new List<SupportRequest>();
}
