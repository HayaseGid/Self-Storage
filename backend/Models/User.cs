using System.Collections.Generic;

namespace SelfStorageAPI.Models;

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
