using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;
using SelfStorageAPI.Services;

namespace SelfStorageAPI.Repositories;

public class OperationsStateRepository : IOperationsStateRepository
{
    private readonly SelfStorageDbContext _context;

    public OperationsStateRepository(SelfStorageDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken)
    {
        return await _context.Users.FirstOrDefaultAsync(
            u => u.Email == email && u.Status == "Active",
            cancellationToken);
    }

    public async Task<int[]> GetFacilityIdsInScopeAsync(User requestingUser, CancellationToken cancellationToken)
    {
        var facilityQuery = _context.Facilities.AsQueryable();

        if (requestingUser.RoleID == 1)
        {
            facilityQuery = facilityQuery.Where(f => _context.Reservations
                .Any(r => r.FacilityID == f.FacilityID && r.CustomerID == requestingUser.UserID));
        }
        else if (requestingUser.RoleID == 2)
        {
            var staffFacilityIds = await _context.FacilityStaffs
                .Where(fs => fs.UserID == requestingUser.UserID && fs.Status == "Active")
                .Select(fs => fs.FacilityID)
                .ToArrayAsync(cancellationToken);
            facilityQuery = facilityQuery.Where(f => staffFacilityIds.Contains(f.FacilityID));
        }
        else if (requestingUser.RoleID == 3)
        {
            facilityQuery = facilityQuery.Where(f => f.ManagerID == requestingUser.UserID);
        }

        return await facilityQuery
            .OrderBy(f => f.FacilityID)
            .Select(f => f.FacilityID)
            .ToArrayAsync(cancellationToken);
    }

    public async Task<object> GetStateDataAsync(int[] facilityIdsInScope, int? customerId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        // Đảm bảo mọi đơn đã Confirmed hoặc Handed Over đều có bản ghi Contract để khách có thể ký hợp đồng online
        var reservationsMissingContract = await _context.Reservations
            .Where(r =>
                (r.Status == ReservationStatus.Confirmed || r.Status == ReservationStatus.HandedOver) &&
                r.Contract == null)
            .ToListAsync(cancellationToken);

        if (reservationsMissingContract.Count > 0)
        {
            foreach (var r in reservationsMissingContract)
            {
                _context.Contracts.Add(new Contract
                {
                    ContractNumber = $"HD-{now:yyyy}-{r.ReservationID:D5}",
                    ReservationID = r.ReservationID,
                    StartDate = r.StartDate,
                    EndDate = r.EndDate,
                    ContractStatus = "Active",
                    CreatedAt = r.ConfirmedAt ?? now,
                    CreatedByUserID = r.ConfirmedByUserID
                });
            }
            await _context.SaveChangesAsync(cancellationToken);
        }

        var rawFacilities = await _context.Facilities
            .Where(f => facilityIdsInScope.Contains(f.FacilityID))
            .OrderBy(f => f.FacilityID)
            .Select(f => new
            {
                id = f.FacilityName,
                facilityId = f.FacilityID,
                name = f.FacilityName,
                unitCodePrefix = f.UnitCodePrefix,
                address = f.StreetAddress + ", " + f.Ward + (f.District != null ? ", " + f.District : "") + ", " + f.City,
                streetAddress = f.StreetAddress,
                ward = f.Ward,
                district = f.District,
                city = f.City,
                contactPhone = f.ContactPhone,
                openingHours = f.OpeningHours,
                description = f.Description,
                status = f.Status,
                createdAt = f.CreatedAt,
                managerEmail = f.Manager.Email,
                depositMonths = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.DepositMonths)
                    .FirstOrDefault() ?? 2,
                holdMinutes = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.HoldMinutes)
                    .FirstOrDefault() ?? 15,
                lateFeePerDay = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (decimal?)p.LateFeePerDay)
                    .FirstOrDefault() ?? 50000m,
                gracePeriodDays = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.GracePeriodDays)
                    .FirstOrDefault() ?? 3,
                renewalNoticeDays = _context.RentalPolicies
                    .Where(p => p.FacilityID == f.FacilityID || p.FacilityID == null)
                    .OrderBy(p => p.FacilityID != null ? 0 : 1)
                    .Select(p => (int?)p.RenewalNoticeDays)
                    .FirstOrDefault() ?? 30
            })
            .ToListAsync(cancellationToken);

        var facilities = rawFacilities.Select(f => new
        {
            f.id,
            f.facilityId,
            f.name,
            f.unitCodePrefix,
            f.address,
            f.streetAddress,
            f.ward,
            f.district,
            f.city,
            f.contactPhone,
            f.openingHours,
            f.description,
            f.status,
            f.createdAt,
            f.managerEmail,
            depositPercent = f.depositMonths <= 1 ? 50m : 100m,
            f.depositMonths,
            f.holdMinutes,
            f.lateFeePerDay,
            f.gracePeriodDays,
            f.renewalNoticeDays
        }).ToList();

        var units = await ProjectUnitsAsync(
            _context.StorageUnits.Where(u => facilityIdsInScope.Contains(u.FacilityID)),
            cancellationToken);

        var reservationsQuery = _context.Reservations
            .Where(r => facilityIdsInScope.Contains(r.FacilityID));
        if (customerId.HasValue)
            reservationsQuery = reservationsQuery.Where(r => r.CustomerID == customerId.Value);

        var reservations = await ProjectReservationsAsync(
            reservationsQuery.OrderByDescending(r => r.ReservationID),
            now,
            cancellationToken);

        var contracts = await ProjectContractsAsync(
            _context.Contracts.Where(c => c.Reservation.CustomerID == customerId || facilityIdsInScope.Contains(c.Reservation.FacilityID)),
            cancellationToken);

        var payments = await _context.Payments
            .Where(p => facilityIdsInScope.Contains(p.Reservation.FacilityID) &&
                (!customerId.HasValue || p.Reservation.CustomerID == customerId.Value))
            .Select(p => new
            {
                txn = p.ProviderTransactionId ?? p.OrderCode,
                resId = p.ReservationID,
                amount = p.Amount,
                paymentType = p.PaymentMethod,
                status = p.Status,
                date = p.ConfirmedAt ?? p.CreatedAt,
                facility = p.Reservation.Facility.FacilityName,
                customerName = p.Reservation.Customer.FullName,
                customerEmail = p.Reservation.Customer.Email
            })
            .ToListAsync(cancellationToken);

        var staff = await _context.FacilityStaffs
            .Where(fs => facilityIdsInScope.Contains(fs.FacilityID))
            .Include(fs => fs.Facility)
            .Include(fs => fs.User)
            .Select(fs => new
            {
                id = fs.UserID,
                staffId = fs.AssignmentID,
                fullName = fs.User.FullName,
                email = fs.User.Email,
                facilityId = fs.Facility.FacilityName,
                status = fs.Status
            })
            .ToListAsync(cancellationToken);

        var managers = await _context.Users
            .Where(u => u.RoleID == 3 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);

        var staffUsers = await _context.Users
            .Where(u => u.RoleID == 2 && u.Status == "Active")
            .OrderBy(u => u.FullName)
            .Select(u => new { userId = u.UserID, fullName = u.FullName, email = u.Email })
            .ToListAsync(cancellationToken);

        var unitTypes = await _context.UnitTypes
            .OrderBy(t => t.TypeName)
            .Select(t => new
            {
                id = t.UnitTypeID,
                unitTypeId = t.UnitTypeID,
                name = t.TypeName,
                typeName = t.TypeName,
                description = t.Description,
                isActive = t.IsActive,
                unitCount = _context.StorageUnits.Count(u => u.UnitTypeID == t.UnitTypeID),
                reservationCount = _context.ReservationItems.Count(ri => ri.UnitTypeID == t.UnitTypeID),
                rateCount = _context.RentalRates.Count(r => r.UnitTypeID == t.UnitTypeID)
            })
            .ToListAsync(cancellationToken);

        var unitSizes = await _context.UnitSizes
            .OrderBy(s => s.UnitSizeID)
            .Select(s => new
            {
                id = s.UnitSizeID,
                unitSizeId = s.UnitSizeID,
                sizeCategoryId = s.SizeCategoryID,
                categoryCode = s.SizeCategory.CategoryCode,
                sizeCode = s.SizeCode,
                displayName = s.DisplayName,
                dimensions = s.SizeCode + ": " + s.DisplayName,
                volume = s.VolumeM3,
                areaM2 = s.AreaM2,
                widthM = s.WidthM,
                lengthM = s.LengthM,
                heightM = s.HeightM,
                isActive = s.IsActive,
                unitCount = _context.StorageUnits.Count(u => u.UnitSizeID == s.UnitSizeID),
                reservationCount = _context.ReservationItems.Count(ri => ri.UnitSizeID == s.UnitSizeID),
                rateCount = _context.RentalRates.Count(r => r.UnitSizeID == s.UnitSizeID)
            })
            .ToListAsync(cancellationToken);

        var rentalRates = await _context.RentalRates
            .Where(r => facilityIdsInScope.Contains(r.FacilityID))
            .Select(r => new
            {
                facilityId = r.FacilityID,
                unitTypeId = r.UnitTypeID,
                unitType = r.UnitType.TypeName,
                unitSizeId = r.UnitSizeID,
                size = r.UnitSize.SizeCode + ": " + r.UnitSize.DisplayName,
                price = r.MonthlyPrice
            })
            .ToListAsync(cancellationToken);

        var globalPolicy = await _context.RentalPolicies
            .Include(p => p.CancellationRules)
            .FirstOrDefaultAsync(p => p.FacilityID == null, cancellationToken);

        var contractTypes = await _context.ContractTypes
            .OrderBy(ct => ct.RentalMonths)
            .Select(ct => new
            {
                contractTypeId = ct.ContractTypeID,
                typeName = ct.TypeName,
                months = ct.RentalMonths,
                discountPercent = ct.DiscountRate,
                isActive = ct.IsActive
            })
            .ToListAsync(cancellationToken);

        var feePolicies = await _context.FeePolicies
            .OrderBy(fp => fp.FeePolicyID)
            .Select(fp => new
            {
                id = fp.FeeCode,
                feePolicyId = fp.FeePolicyID,
                feeCode = fp.FeeCode,
                name = fp.FeeName,
                category = fp.FeeCategory,
                valueType = fp.ValueType,
                minValue = fp.MinValue,
                maxValue = fp.MaxValue,
                amount = fp.MaxValue,
                isActive = fp.IsActive
            })
            .ToListAsync(cancellationToken);

        var sizeCategories = await _context.SizeCategories
            .OrderBy(c => c.SizeCategoryID)
            .Select(c => new
            {
                sizeCategoryId = c.SizeCategoryID,
                code = c.CodePrefix.Trim(),
                categoryCode = c.CategoryCode,
                name = c.CategoryName,
                prefix = c.CodePrefix.Trim(),
                standardHeightM = c.StandardHeightM,
                minVolumeM3 = c.MinVolumeM3,
                maxVolumeM3 = c.MaxVolumeM3,
                minArea = decimal.Round(c.MinVolumeM3 / (c.StandardHeightM > 0 ? c.StandardHeightM : 2.5m), 2),
                maxArea = decimal.Round(c.MaxVolumeM3 / (c.StandardHeightM > 0 ? c.StandardHeightM : 2.5m), 2),
                minPrice = c.MinMonthlyPrice,
                maxPrice = c.MaxMonthlyPrice,
                minMonthlyPrice = c.MinMonthlyPrice,
                maxMonthlyPrice = c.MaxMonthlyPrice,
                recommendedPrice = decimal.Round((c.MinMonthlyPrice + c.MaxMonthlyPrice) / 2m, 0),
                isActive = c.IsActive
            })
            .ToListAsync(cancellationToken);

        var policies = new
        {
            depositMonths = globalPolicy?.DepositMonths ?? (byte)2,
            holdMinutes = globalPolicy?.HoldMinutes ?? 15,
            lateFeePerDay = globalPolicy?.LateFeePerDay ?? 50000m,
            gracePeriodDays = globalPolicy?.GracePeriodDays ?? 3,
            renewalNoticeDays = globalPolicy?.RenewalNoticeDays ?? 30,
            cancellationRules = globalPolicy?.CancellationRules
                .OrderByDescending(r => r.DaysBeforeStart)
                .Select(r => new
                {
                    cancellationRuleId = r.CancellationRuleID,
                    daysBeforeStart = r.DaysBeforeStart,
                    refundPercent = r.RefundPercent
                })
                .ToList(),
            contractTypes,
            feePolicies,
            sizeCategories
        };

        var activity = await _context.HandoverTasks
            .Where(t => facilityIdsInScope.Contains(t.FacilityID))
            .OrderByDescending(t => t.TaskID)
            .Select(t => new
            {
                id = t.TaskID,
                at = t.ActualAt ?? (DateTime?)t.CreatedAt,
                facilityId = t.Facility.FacilityName,
                staffName = t.AssignedStaff.FullName,
                unitNumber = t.Unit.UnitNumber,
                customerName = t.Reservation != null ? t.Reservation.Customer.FullName : "Khách hàng",
                reservationId = t.ReservationID
            })
            .ToListAsync(cancellationToken);

        var activityLog = activity.Select(item => new
        {
            item.id,
            item.at,
            item.facilityId,
            item.staffName,
            text = $"Bàn giao {item.unitNumber} cho {item.customerName} (đặt chỗ {item.reservationId})."
        });

        return new
        {
            facilities,
            units,
            reservations,
            contracts,
            payments,
            staff,
            unitTypes,
            unitSizes,
            rentalRates,
            priceBands = sizeCategories,
            managers,
            staffUsers,
            policies,
            activity = activityLog
        };
    }

    public async Task<object> GetReportsDataAsync(CancellationToken cancellationToken)
    {
        // Theo vw_Revenue trong SelfStorageDB_test.sql: chỉ tính Charge đã Paid và KHÔNG tính Deposit, trừ RefundedAmount
        var paidRevenueCharges = await _context.Charges
            .Where(c => c.Status == "Paid" && c.ChargeType != "Deposit")
            .Select(c => new
            {
                FacilityID = c.Reservation.FacilityID,
                RevenueDate = c.PaidAt ?? c.CreatedAt,
                NetAmount = c.Amount - c.RefundedAmount
            })
            .ToListAsync(cancellationToken);

        var monthlyRevenue = paidRevenueCharges
            .GroupBy(c => new { c.RevenueDate.Year, c.RevenueDate.Month })
            .Select(group => new
            {
                year = group.Key.Year,
                month = group.Key.Month,
                receivedAmount = group.Sum(item => item.NetAmount)
            })
            .OrderByDescending(item => item.year)
            .ThenByDescending(item => item.month)
            .Take(12)
            .OrderBy(item => item.year)
            .ThenBy(item => item.month)
            .ToList();

        var revenueByFacility = paidRevenueCharges
            .GroupBy(c => c.FacilityID)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.NetAmount));

        var rawFacilities = await _context.Facilities
            .Select(f => new
            {
                facilityId = f.FacilityID,
                name = f.FacilityName,
                district = f.District,
                totalUnits = f.StorageUnits.Count(u => u.Status != UnitStatus.Inactive),
                handedOverUnits = f.StorageUnits.Count(u => u.Status == UnitStatus.InUse),
                handedOverCount = f.Reservations.Count(r => r.Status == ReservationStatus.HandedOver)
            })
            .ToListAsync(cancellationToken);

        var facilities = rawFacilities.Select(f => new
        {
            f.facilityId,
            f.name,
            f.district,
            f.totalUnits,
            f.handedOverUnits,
            occupancyRate = f.totalUnits == 0 ? 0m :
                decimal.Round((decimal)f.handedOverUnits * 100m / f.totalUnits, 2),
            receivedRevenue = revenueByFacility.TryGetValue(f.facilityId, out var rev) ? rev : 0m,
            f.handedOverCount
        }).ToList();

        return new
        {
            totalRevenue = facilities.Sum(f => f.receivedRevenue),
            totalUnits = facilities.Sum(f => f.totalUnits),
            handedOverUnits = facilities.Sum(f => f.handedOverUnits),
            handedOverCount = facilities.Sum(f => f.handedOverCount),
            occupancyRate = facilities.Sum(f => f.totalUnits) == 0 ? 0m :
                decimal.Round((decimal)facilities.Sum(f => f.handedOverUnits) * 100m / facilities.Sum(f => f.totalUnits), 2),
            monthlyRevenue,
            facilities
        };
    }

    /* ---------- DANH SÁCH CÓ PHÂN TRANG (GET /api/operations/reservations | units | contracts) ----------
     * Lọc + đếm + Skip/Take ngay trong SQL, chỉ chiếu (Select) đúng trang đang xem.
     * Từng dòng có cùng cấu trúc JSON với mảng tương ứng trong /api/operations/state (thêm createdAt) nên frontend dùng lại được. */

    public async Task<PagedResult<object>> GetReservationsPageAsync(int[] facilityIdsInScope, int? customerId, PageQuery query, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var filtered = _context.Reservations.AsNoTracking()
            .Where(r => facilityIdsInScope.Contains(r.FacilityID));
        if (customerId.HasValue)
            filtered = filtered.Where(r => r.CustomerID == customerId.Value);
        if (query.FacilityId.HasValue)
            filtered = filtered.Where(r => r.FacilityID == query.FacilityId.Value);

        var keyword = query.Keyword;
        if (keyword.Length > 0)
        {
            filtered = filtered.Where(r =>
                r.ReservationCode.Contains(keyword) ||
                r.Customer.FullName.Contains(keyword) ||
                r.Customer.Email.Contains(keyword) ||
                (r.Customer.PhoneNumber != null && r.Customer.PhoneNumber.Contains(keyword)) ||
                r.ReservationUnits.Any(ru => ru.Status != "Released" && ru.Unit.UnitNumber.Contains(keyword)) ||
                (r.Contract != null && r.Contract.ContractNumber.Contains(keyword)));
        }

        // Số đơn theo trạng thái (trước khi lọc trạng thái) cho các nút lọc
        var byStatus = await filtered
            .GroupBy(r => r.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var expiredPending = await filtered
            .CountAsync(r => r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now, cancellationToken);
        var statusCounts = new Dictionary<string, int>();
        foreach (var row in byStatus)
        {
            var code = NormalizeReservationStatus(row.Status);
            var count = row.Status == ReservationStatus.PendingPayment ? row.Count - expiredPending : row.Count;
            statusCounts[code] = (statusCounts.TryGetValue(code, out var current) ? current : 0) + count;
        }
        if (expiredPending > 0)
            statusCounts["EXPIRED"] = (statusCounts.TryGetValue("EXPIRED", out var expired) ? expired : 0) + expiredPending;

        var codes = query.Statuses;
        if (codes.Length > 0)
        {
            var plain = codes.Select(ToDbReservationStatus).Where(s => s != null).Select(s => s!).ToArray();
            var wantPending = codes.Contains("PENDING_PAYMENT");
            var wantExpired = codes.Contains("EXPIRED");
            filtered = filtered.Where(r =>
                plain.Contains(r.Status) ||
                (wantPending && r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt > now) ||
                (wantExpired && (r.Status == ReservationStatus.Expired ||
                                 (r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now))));
        }

        IOrderedQueryable<Reservation> ordered = query.SortKey switch
        {
            "oldest" => filtered.OrderBy(r => r.CreatedAt).ThenBy(r => r.ReservationID),
            "appointment" => filtered.OrderBy(r => r.AppointmentDate ?? r.StartDate).ThenBy(r => r.AppointmentTime).ThenBy(r => r.ReservationID),
            "appointment_desc" => filtered.OrderByDescending(r => r.AppointmentDate ?? r.StartDate).ThenByDescending(r => r.AppointmentTime).ThenByDescending(r => r.ReservationID),
            "start" => filtered.OrderByDescending(r => r.StartDate).ThenByDescending(r => r.ReservationID),
            "code" => filtered.OrderBy(r => r.ReservationCode),
            _ => filtered.OrderByDescending(r => r.CreatedAt).ThenByDescending(r => r.ReservationID)
        };

        var total = await filtered.CountAsync(cancellationToken);
        var items = await ProjectReservationsAsync(
            ordered.Skip(query.SkipFor(total)).Take(query.SafePageSize), now, cancellationToken);
        return PagedResult<object>.Create(items, total, query, statusCounts);
    }

    public async Task<PagedResult<object>> GetUnitsPageAsync(int[] facilityIdsInScope, PageQuery query, CancellationToken cancellationToken)
    {
        var filtered = _context.StorageUnits.AsNoTracking()
            .Where(u => facilityIdsInScope.Contains(u.FacilityID));
        if (query.FacilityId.HasValue)
            filtered = filtered.Where(u => u.FacilityID == query.FacilityId.Value);
        if (query.TypeId.HasValue)
            filtered = filtered.Where(u => u.UnitTypeID == query.TypeId.Value);

        var keyword = query.Keyword;
        if (keyword.Length > 0)
        {
            filtered = filtered.Where(u =>
                u.UnitNumber.Contains(keyword) ||
                u.UnitType.TypeName.Contains(keyword) ||
                u.UnitSize.SizeCode.Contains(keyword) ||
                (u.Zone != null && u.Zone.Contains(keyword)) ||
                (u.Floor != null && u.Floor.Contains(keyword)) ||
                (u.LocationNote != null && u.LocationNote.Contains(keyword)));
        }

        // "Còn trống" nhưng đã có đơn giữ (đã cọc / đã xác nhận) -> hiển thị RESERVED, giống /state
        var byStatus = await filtered
            .GroupBy(u => u.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var reservedAvailable = await filtered.CountAsync(u =>
            u.Status == UnitStatus.Available &&
            _context.ReservationUnits.Any(ru => ru.UnitID == u.UnitID && ru.Status == "Held" &&
                (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed)),
            cancellationToken);
        var statusCounts = new Dictionary<string, int>();
        foreach (var row in byStatus)
        {
            var code = NormalizeUnitStatus(row.Status);
            var count = row.Status == UnitStatus.Available ? row.Count - reservedAvailable : row.Count;
            statusCounts[code] = (statusCounts.TryGetValue(code, out var current) ? current : 0) + count;
        }
        if (reservedAvailable > 0)
            statusCounts["RESERVED"] = (statusCounts.TryGetValue("RESERVED", out var reserved) ? reserved : 0) + reservedAvailable;

        var codes = query.Statuses;
        if (codes.Length > 0)
        {
            var plain = new List<string>();
            foreach (var code in codes)
            {
                switch (code)
                {
                    case "RENTED": plain.Add(UnitStatus.InUse); break;
                    case "MAINTENANCE": plain.Add(UnitStatus.Maintenance); plain.Add(UnitStatus.PendingInspection); break;
                    case "INACTIVE": plain.Add(UnitStatus.Inactive); break;
                    case "BOOKING": plain.Add(UnitStatus.Booking); break;
                    case "RESERVED": plain.Add(UnitStatus.Reserved); break;
                }
            }
            var plainArray = plain.ToArray();
            var wantAvailable = codes.Contains("AVAILABLE");
            var wantReserved = codes.Contains("RESERVED");
            filtered = filtered.Where(u =>
                plainArray.Contains(u.Status) ||
                (u.Status == UnitStatus.Available && (
                    (wantReserved && _context.ReservationUnits.Any(ru => ru.UnitID == u.UnitID && ru.Status == "Held" &&
                        (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed))) ||
                    (wantAvailable && !_context.ReservationUnits.Any(ru => ru.UnitID == u.UnitID && ru.Status == "Held" &&
                        (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed))))));
        }

        IOrderedQueryable<StorageUnit> ordered = query.SortKey switch
        {
            "oldest" => filtered.OrderBy(u => u.CreatedAt).ThenBy(u => u.UnitID),
            "code" => filtered.OrderBy(u => u.UnitNumber),
            "code_desc" => filtered.OrderByDescending(u => u.UnitNumber),
            "updated" => filtered.OrderByDescending(u => u.UpdatedAt ?? u.CreatedAt).ThenByDescending(u => u.UnitID),
            _ => filtered.OrderByDescending(u => u.CreatedAt).ThenByDescending(u => u.UnitID)
        };

        var total = await filtered.CountAsync(cancellationToken);
        var items = await ProjectUnitsAsync(ordered.Skip(query.SkipFor(total)).Take(query.SafePageSize), cancellationToken);
        return PagedResult<object>.Create(items, total, query, statusCounts);
    }

    public async Task<PagedResult<object>> GetContractsPageAsync(int[] facilityIdsInScope, int? customerId, PageQuery query, CancellationToken cancellationToken)
    {
        var today = BusinessClock.Today;
        var soon = today.AddDays(ContractExpiringDays);
        var filtered = _context.Contracts.AsNoTracking()
            .Where(c => c.Reservation.CustomerID == customerId || facilityIdsInScope.Contains(c.Reservation.FacilityID));
        if (customerId.HasValue)
            filtered = filtered.Where(c => c.Reservation.CustomerID == customerId.Value);
        if (query.FacilityId.HasValue)
            filtered = filtered.Where(c => c.Reservation.FacilityID == query.FacilityId.Value);

        var keyword = query.Keyword;
        if (keyword.Length > 0)
        {
            filtered = filtered.Where(c =>
                c.ContractNumber.Contains(keyword) ||
                c.Reservation.ReservationCode.Contains(keyword) ||
                c.Reservation.Customer.FullName.Contains(keyword) ||
                c.Reservation.Customer.Email.Contains(keyword) ||
                (c.Reservation.Customer.PhoneNumber != null && c.Reservation.Customer.PhoneNumber.Contains(keyword)) ||
                c.Reservation.ReservationUnits.Any(ru => ru.Status != "Released" && ru.Unit.UnitNumber.Contains(keyword)));
        }

        // Giai đoạn hợp đồng (giống contractPhase ở trang Manager): RENEWED | CLOSED | EXPIRED | EXPIRING | ACTIVE
        var open = filtered.Where(c => c.ContractStatus != "Renewed" && c.ContractStatus != "Completed" && c.ContractStatus != "Terminated");
        var statusCounts = new Dictionary<string, int>
        {
            ["RENEWED"] = await filtered.CountAsync(c => c.ContractStatus == "Renewed", cancellationToken),
            ["CLOSED"] = await filtered.CountAsync(c => c.ContractStatus == "Completed" || c.ContractStatus == "Terminated", cancellationToken),
            ["EXPIRED"] = await open.CountAsync(c => c.EndDate < today, cancellationToken),
            ["EXPIRING"] = await open.CountAsync(c => c.EndDate >= today && c.EndDate <= soon, cancellationToken),
            ["ACTIVE"] = await open.CountAsync(c => c.EndDate > soon, cancellationToken)
        };

        var codes = query.Statuses;
        if (codes.Length > 0)
        {
            var wantRenewed = codes.Contains("RENEWED");
            var wantClosed = codes.Contains("CLOSED");
            var wantExpired = codes.Contains("EXPIRED");
            var wantExpiring = codes.Contains("EXPIRING");
            var wantActive = codes.Contains("ACTIVE");
            filtered = filtered.Where(c =>
                (wantRenewed && c.ContractStatus == "Renewed") ||
                (wantClosed && (c.ContractStatus == "Completed" || c.ContractStatus == "Terminated")) ||
                (c.ContractStatus != "Renewed" && c.ContractStatus != "Completed" && c.ContractStatus != "Terminated" &&
                    ((wantExpired && c.EndDate < today) ||
                     (wantExpiring && c.EndDate >= today && c.EndDate <= soon) ||
                     (wantActive && c.EndDate > soon))));
        }

        IOrderedQueryable<Contract> ordered = query.SortKey switch
        {
            "oldest" => filtered.OrderBy(c => c.CreatedAt).ThenBy(c => c.ContractID),
            "ending" => filtered.OrderBy(c => c.EndDate).ThenBy(c => c.ContractID),
            "code" => filtered.OrderBy(c => c.ContractNumber),
            _ => filtered.OrderByDescending(c => c.CreatedAt).ThenByDescending(c => c.ContractID)
        };

        var total = await filtered.CountAsync(cancellationToken);
        var items = await ProjectContractsAsync(ordered.Skip(query.SkipFor(total)).Take(query.SafePageSize), cancellationToken);
        return PagedResult<object>.Create(items, total, query, statusCounts);
    }

    /// <summary>Số ngày trước hạn được tính là "sắp hết hạn" (giống EXPIRING_DAYS ở frontend).</summary>
    private const int ContractExpiringDays = 30;

    private static string? ToDbReservationStatus(string code) => code switch
    {
        "PENDING_APPROVAL" => ReservationStatus.Paid,
        "CONFIRMED" => ReservationStatus.Confirmed,
        "HANDED_OVER" => ReservationStatus.HandedOver,
        "COMPLETED" => ReservationStatus.Completed,
        "CANCELLED" => ReservationStatus.Cancelled,
        _ => null // PENDING_PAYMENT / EXPIRED xử lý riêng theo HoldExpiresAt
    };

    /* ---------- Phép chiếu dùng chung cho /state và các API danh sách có phân trang ---------- */

    private async Task<List<object>> ProjectUnitsAsync(IQueryable<StorageUnit> source, CancellationToken cancellationToken)
    {
        var rawUnits = await source
            .Select(u => new
            {
                u.CreatedAt,
                u.UnitNumber,
                u.UnitID,
                FacilityName = u.Facility.FacilityName,
                u.FacilityID,
                TypeName = u.UnitType.TypeName,
                u.UnitTypeID,
                SizeCode = u.UnitSize.SizeCode,
                SizeDisplayName = u.UnitSize.DisplayName,
                u.UnitSizeID,
                u.UnitSize.AreaM2,
                u.UnitSize.VolumeM3,
                MonthlyPrice = u.RentalRate != null ? u.RentalRate.MonthlyPrice : 0m,
                u.Status,
                u.Floor,
                u.Zone,
                u.LocationNote,
                IsReserved = _context.ReservationUnits.Any(ru =>
                    ru.UnitID == u.UnitID &&
                    ru.Status == "Held" &&
                    (ru.Reservation.Status == ReservationStatus.Paid || ru.Reservation.Status == ReservationStatus.Confirmed))
            })
            .ToListAsync(cancellationToken);

        return rawUnits.Select(u => (object)new
        {
            id = u.UnitNumber,
            unitId = u.UnitID,
            facilityId = u.FacilityName,
            facilityDbId = u.FacilityID,
            type = u.TypeName,
            unitTypeId = u.UnitTypeID,
            size = $"{u.SizeCode}: {u.SizeDisplayName}",
            sizeId = u.UnitSizeID,
            sizeM2 = u.AreaM2,
            areaM2 = u.AreaM2,
            volumeM3 = u.VolumeM3,
            pricePerMonth = u.MonthlyPrice,
            floor = u.Floor,
            zone = u.Zone,
            locationNote = u.LocationNote,
            createdAt = u.CreatedAt,
            status = u.Status == UnitStatus.Available && u.IsReserved
                ? "RESERVED"
                : NormalizeUnitStatus(u.Status)
        }).ToList();
    }

    private async Task<List<object>> ProjectReservationsAsync(IQueryable<Reservation> source, DateTime now, CancellationToken cancellationToken)
    {
        // source đã được sắp xếp (và phân trang nếu có) ở nơi gọi
        var rawReservations = await source
            .Select(r => new
            {
                r.CreatedAt,
                r.ReservationID,
                r.ReservationCode,
                CustomerFullName = r.Customer.FullName,
                CustomerEmail = r.Customer.Email,
                CustomerPhone = r.Customer.PhoneNumber,
                FacilityName = r.Facility.FacilityName,
                r.FacilityID,
                AssignedUnitNumbers = r.ReservationUnits
                    .Where(ru => ru.Status != "Released")
                    .Select(ru => ru.Unit.UnitNumber)
                    .ToList(),
                UnitTypeNames = r.ReservationItems
                    .Select(ri => ri.UnitType.TypeName)
                    .Distinct()
                    .ToList(),
                UnitTypeId = r.ReservationItems
                    .Select(ri => (int?)ri.UnitTypeID)
                    .FirstOrDefault() ?? 0,
                r.StartDate,
                r.EndDate,
                r.RentalPeriod,
                r.DepositMonths,
                r.AppointmentDate,
                r.AppointmentTime,
                r.HandoverMethod,
                Deposit = r.Charges
                    .Where(c => c.ChargeType == "Deposit" && c.Status != "Cancelled")
                    .Sum(c => (decimal?)c.Amount) ?? 0m,
                RentalFee = r.Charges
                    .Where(c => c.ChargeType == "Rent" && c.Status != "Cancelled")
                    .Sum(c => (decimal?)c.Amount) ?? 0m,
                r.PaymentPlan,
                RentRows = r.Charges
                    .Where(c => c.ChargeType == "Rent")
                    .Select(c => new { c.Status, c.Amount, c.DueDate, c.PeriodStart })
                    .ToList(),
                IsPaid = r.Payments.Any(p => p.Status == "Completed" && p.Direction == "Collection"),
                PaymentTxn = r.Payments
                    .Where(p => p.Status == "Completed" && p.Direction == "Collection")
                    .OrderByDescending(p => p.PaymentID)
                    .Select(p => p.ProviderTransactionId ?? p.OrderCode)
                    .FirstOrDefault(),
                r.Status,
                r.HoldExpiresAt,
                ContractId = r.Contract == null ? (int?)null : r.Contract.ContractID,
                IsSigned = r.Contract != null && r.Contract.Signature != null,
                SignedAt = r.Contract != null && r.Contract.Signature != null ? (DateTimeOffset?)r.Contract.Signature.SignedAt : null
            })
            .ToListAsync(cancellationToken);

        var today = BusinessClock.Today;
        return rawReservations.Select(r =>
        {
            // Tiền thuê phải đóng lúc nhận kho: tính bằng RentPaymentRules (cùng luật với HandoverService)
            var rentState = RentPaymentRules.Snapshot(r.Status, r.StartDate, r.EndDate, r.PaymentPlan,
                r.RentRows.Select(x => (x.Status, x.Amount, x.DueDate, x.PeriodStart)));
            var dueAtStart = RentPaymentRules.DueAtStart(rentState);
            return (object)new
        {
            id = r.ReservationID,
            reservationCode = r.ReservationCode,
            customerName = r.CustomerFullName,
            customerEmail = r.CustomerEmail,
            customerPhone = r.CustomerPhone,
            facilityId = r.FacilityName,
            facilityDbId = r.FacilityID,
            unitId = r.AssignedUnitNumbers.FirstOrDefault(),
            assignedUnitId = r.AssignedUnitNumbers.FirstOrDefault(),
            unitNumbers = r.AssignedUnitNumbers,
            unitCount = r.AssignedUnitNumbers.Count,
            unitType = string.Join(", ", r.UnitTypeNames),
            unitTypeId = r.UnitTypeId,
            startDate = r.StartDate,
            endDate = r.EndDate,
            months = r.RentalPeriod,
            depositMonths = r.DepositMonths,
            appointmentDate = r.AppointmentDate ?? r.StartDate,
            // Khung giờ nhận kho "08:00–10:00"; bàn giao online không hẹn giờ
            appointmentTime = StaffAssignmentPolicy.SlotLabel(r.AppointmentTime)
                ?? (r.HandoverMethod == HandoverMethod.Online ? "Bàn giao online" : "Cả ngày"),
            handoverMethod = r.HandoverMethod,
            deposit = r.Deposit,
            rentalFee = r.RentalFee,
            paymentPlan = r.PaymentPlan,
            startRentAmount = dueAtStart.Sum(c => c.Amount),
            startRentUnpaid = dueAtStart.Where(c => c.Status == "Unpaid").Sum(c => c.Amount),
            startRentPaid = RentPaymentRules.IsStartRentPaid(rentState),
            rentOverdue = RentPaymentRules.Overdue(rentState, today).Sum(c => c.Amount),
            paymentStatus = r.IsPaid ? "PAID" : "PENDING",
            paymentTxn = r.PaymentTxn,
            status = NormalizeReservationStatus(
                r.Status == ReservationStatus.PendingPayment && r.HoldExpiresAt <= now
                    ? ReservationStatus.Expired
                    : r.Status),
            depositExpiresAt = r.HoldExpiresAt,
            contractId = r.ContractId,
            contractStatus = r.IsSigned ? "Signed" : "Pending Signature",
            isSigned = r.IsSigned,
            signedAt = r.SignedAt,
            createdAt = r.CreatedAt,
            source = "live"
        };
        }).ToList();
    }

    private async Task<List<object>> ProjectContractsAsync(IQueryable<Contract> source, CancellationToken cancellationToken)
    {
        var rawContracts = await source
            .Select(c => new
            {
                createdAt = c.CreatedAt,
                reservationCode = c.Reservation.ReservationCode,
                customerEmail = c.Reservation.Customer.Email,
                reservationStatus = c.Reservation.Status,
                id = c.ContractID,
                contractNumber = c.ContractNumber,
                reservationId = c.ReservationID,
                customerName = c.Reservation.Customer.FullName,
                facilityId = c.Reservation.Facility.FacilityName,
                facilityDbId = c.Reservation.FacilityID,
                unitNumbers = c.Reservation.ReservationUnits
                    .Where(ru => ru.Status != "Released")
                    .Select(ru => ru.Unit.UnitNumber)
                    .ToList(),
                startDate = c.StartDate,
                endDate = c.EndDate,
                deposit = c.Reservation.Charges
                    .Where(ch => ch.ChargeType == "Deposit" && ch.Status != "Cancelled")
                    .Sum(ch => (decimal?)ch.Amount) ?? 0m,
                totalFee = c.Reservation.Charges
                    .Where(ch => ch.ChargeType == "Rent" && ch.Status != "Cancelled")
                    .Sum(ch => (decimal?)ch.Amount) ?? 0m,
                status = c.ContractStatus,
                isSigned = c.Signature != null,
                signedAt = c.Signature != null ? (DateTimeOffset?)c.Signature.SignedAt : null,
                signerName = c.Signature != null ? c.Signature.SignerName : null,
                accessType = c.Reservation.UnitAccesses.Select(a => a.AccessType).FirstOrDefault(),
                accessValue = c.Reservation.UnitAccesses.Select(a => a.AccessValue).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        return rawContracts.Select(c => (object)new
        {
            c.createdAt,
            c.reservationCode,
            c.customerEmail,
            reservationStatus = NormalizeReservationStatus(c.reservationStatus),
            c.id,
            c.contractNumber,
            c.reservationId,
            c.customerName,
            c.facilityId,
            c.facilityDbId,
            unitId = c.unitNumbers.Count > 1 ? string.Join(", ", c.unitNumbers) : c.unitNumbers.FirstOrDefault(),
            c.unitNumbers,
            c.startDate,
            c.endDate,
            c.deposit,
            c.totalFee,
            c.status,
            c.isSigned,
            c.signedAt,
            c.signerName,
            c.accessType,
            c.accessValue
        }).ToList();
    }

    private static string NormalizeUnitStatus(string status) => status switch
    {
        "Available" => "AVAILABLE",
        "Reserved" => "RESERVED",
        "In Use" => "RENTED",
        "Pending Inspection" => "MAINTENANCE",
        "Maintenance" => "MAINTENANCE",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };

    private static string NormalizeReservationStatus(string status) => status switch
    {
        "Pending Payment" or "Pending Deposit" => "PENDING_PAYMENT",
        "Paid" => "PENDING_APPROVAL",
        "Confirmed" => "CONFIRMED",
        "Handed Over" => "HANDED_OVER",
        "Completed" => "COMPLETED",
        "Cancelled" => "CANCELLED",
        "Expired" => "EXPIRED",
        _ => status.ToUpperInvariant().Replace(' ', '_')
    };
}
