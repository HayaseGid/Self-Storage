using System.Collections.Concurrent;
using System.Text.Json;
using SelfStorageAPI.Constants;
using SelfStorageAPI.DTOs;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

public class FacilityManagementService : IFacilityManagementService
{
    private readonly IFacilityManagementRepository _repo;

    private sealed class PolicyVersionEntry
    {
        public string Key { get; init; } = string.Empty;
        public int Version { get; init; }
        public string Status { get; set; } = "Active";
        public string EffectiveFrom { get; init; } = string.Empty;
        public DateTime CreatedAt { get; init; }
        public string CreatedBy { get; init; } = "ops@test.com";
        public string Note { get; init; } = string.Empty;
        public Dictionary<string, object?> Config { get; init; } = new();
    }

    private static readonly ConcurrentDictionary<string, List<PolicyVersionEntry>> _policyHistory = new(StringComparer.OrdinalIgnoreCase);
    private static readonly object _policyLock = new();

    public FacilityManagementService(IFacilityManagementRepository repo)
    {
        _repo = repo;
    }

    public async Task<OperationsServiceResponse> AssignReservationAsync(
        int reservationId,
        AssignReservationDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        var reservation = await _repo.GetReservationByIdAsync(reservationId, cancellationToken);
        if (reservation is null)
            return new OperationsServiceResponse(false, "Không tìm thấy đặt chỗ.", 404, null);

        if (!await CanManageFacilityAsync(reservation.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (reservation.Status != ReservationStatus.Paid)
            return new OperationsServiceResponse(false, "Chỉ đặt chỗ đã thanh toán mới được phân kho.", 409, null);

        var managerUser = string.IsNullOrWhiteSpace(userEmail)
            ? null
            : await _repo.GetActiveUserByEmailAsync(userEmail, cancellationToken);

        var requestedUnitNumber = request.UnitNumber?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(requestedUnitNumber))
        {
            requestedUnitNumber = reservation.ReservationUnits
                .Where(ru => ru.Status != "Released" && ru.Unit != null)
                .Select(ru => ru.Unit.UnitNumber)
                .FirstOrDefault() ?? string.Empty;
        }

        var unit = await _repo.GetUnitByNumberAndFacilityAsync(requestedUnitNumber, reservation.FacilityID, cancellationToken);
        if (unit is null)
            return new OperationsServiceResponse(false, "Kho không thuộc cơ sở đã đặt.", 400, null);

        var matchingItem = reservation.ReservationItems.FirstOrDefault(
            ri => ri.UnitTypeID == unit.UnitTypeID && ri.UnitSizeID == unit.UnitSizeID)
            ?? reservation.ReservationItems.FirstOrDefault();

        if (matchingItem is null || matchingItem.UnitTypeID != unit.UnitTypeID || matchingItem.UnitSizeID != unit.UnitSizeID)
            return new OperationsServiceResponse(false, "Kho không thuộc loại hoặc size đã đặt.", 400, null);

        if (unit.Status is UnitStatus.Maintenance or UnitStatus.Inactive)
            return new OperationsServiceResponse(false, "Kho hiện không khả dụng.", 409, null);

        return await _repo.ExecuteInTransactionAsync(async () =>
        {
            var hasConflict = await _repo.HasConflictingReservationForUnitAsync(
                reservationId,
                unit.UnitID,
                reservation.StartDate,
                reservation.EndDate,
                cancellationToken);
            if (hasConflict)
                return new OperationsServiceResponse(false, "Kho đã được đặt trong kỳ thuê này.", 409, null);

            var now = DateTime.UtcNow;
            var activeHoldsForItem = reservation.ReservationUnits
                .Where(ru => ru.ReservationItemID == matchingItem.ReservationItemID && ru.Status != "Released")
                .ToList();

            var alreadyHeldThisUnit = activeHoldsForItem.Any(ru => ru.UnitID == unit.UnitID);

            if (!alreadyHeldThisUnit)
            {
                if (activeHoldsForItem.Count >= matchingItem.Quantity)
                {
                    var holdToReplace = activeHoldsForItem[0];
                    holdToReplace.Status = "Released";
                    holdToReplace.ReleasedAt = now;
                    await _repo.SaveChangesAsync(cancellationToken);
                }

                _repo.AddReservationUnit(new ReservationUnit
                {
                    ReservationID = reservation.ReservationID,
                    ReservationItemID = matchingItem.ReservationItemID,
                    FacilityID = reservation.FacilityID,
                    UnitID = unit.UnitID,
                    UnitTypeID = unit.UnitTypeID,
                    UnitSizeID = unit.UnitSizeID,
                    Status = "Held",
                    AssignedAt = now,
                    AssignedByUserID = managerUser?.UserID
                });
                await _repo.SaveChangesAsync(cancellationToken);
            }

            reservation.Status = ReservationStatus.Confirmed;
            reservation.ConfirmedAt = now;
            reservation.ConfirmedByUserID = managerUser?.UserID;

            await _repo.SaveChangesAsync(cancellationToken);

            var contract = await _repo.EnsureContractForReservationAsync(reservation, managerUser?.UserID, cancellationToken);

            return new OperationsServiceResponse(true, null, 200, new
            {
                reservationId,
                unitNumber = unit.UnitNumber,
                status = reservation.Status,
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                message = "Đã phân kho cho đặt chỗ."
            });
        }, cancellationToken);
    }

    public async Task<OperationsServiceResponse> UpdatePolicyAsync(
        int facilityId,
        UpdateRentalPolicyDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        var rawDeposit = request.DepositMonths.HasValue ? (decimal)request.DepositMonths.Value : request.DepositPercent;
        byte depositMonths = rawDeposit <= 1 || (rawDeposit > 2 && rawDeposit <= 50) ? (byte)1 : (byte)2;

        var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facilityId, cancellationToken);
        if (policy is null)
        {
            policy = new RentalPolicy
            {
                FacilityID = facilityId,
                DepositMonths = depositMonths,
                HoldMinutes = request.HoldMinutes ?? 15,
                LateFeePerDay = request.LateFeePerDay ?? 50000m,
                GracePeriodDays = request.GracePeriodDays ?? 3,
                RenewalNoticeDays = request.RenewalNoticeDays ?? 30
            };
            _repo.AddRentalPolicy(policy);
        }
        else
        {
            policy.DepositMonths = depositMonths;
            if (request.HoldMinutes.HasValue) policy.HoldMinutes = Math.Clamp(request.HoldMinutes.Value, 1, 60);
            if (request.LateFeePerDay.HasValue) policy.LateFeePerDay = Math.Max(0m, request.LateFeePerDay.Value);
            if (request.GracePeriodDays.HasValue) policy.GracePeriodDays = Math.Max(0, request.GracePeriodDays.Value);
            if (request.RenewalNoticeDays.HasValue) policy.RenewalNoticeDays = Math.Max(0, request.RenewalNoticeDays.Value);
            policy.UpdatedAt = DateTime.UtcNow;
        }

        await _repo.SaveChangesAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 200, new
        {
            facilityId,
            depositPercent = policy.DepositMonths == 1 ? 50m : 100m,
            depositMonths = policy.DepositMonths,
            holdMinutes = policy.HoldMinutes,
            lateFeePerDay = policy.LateFeePerDay,
            gracePeriodDays = policy.GracePeriodDays,
            renewalNoticeDays = policy.RenewalNoticeDays
        });
    }

    public async Task<OperationsServiceResponse> GetSystemPoliciesAsync(CancellationToken cancellationToken)
    {
        var globalPolicy = await _repo.GetGlobalRentalPolicyAsync(cancellationToken);
        var contractTypes = await _repo.GetContractTypesAsync(cancellationToken);
        var feePolicies = await _repo.GetFeePoliciesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
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
            contractTypes = contractTypes.Select(ct => new
            {
                contractTypeId = ct.ContractTypeID,
                typeName = ct.TypeName,
                months = ct.RentalMonths,
                discountPercent = ct.DiscountRate,
                isActive = ct.IsActive
            }),
            feePolicies = feePolicies.Select(fp => new
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
        });
    }

    public async Task<OperationsServiceResponse> UpdateSystemPoliciesAsync(
        UpdateSystemPoliciesDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ Business Operations Manager mới được cấu hình chính sách hệ thống.", 403, null);

        var user = await _repo.GetActiveUserByEmailAsync(userEmail!, cancellationToken);
        var now = DateTime.UtcNow;

        var allPolicies = await _repo.GetAllRentalPoliciesAsync(cancellationToken);
        var globalPolicy = allPolicies.FirstOrDefault(p => p.FacilityID == null);
        if (globalPolicy is null)
        {
            globalPolicy = new RentalPolicy { FacilityID = null, DepositMonths = 2, HoldMinutes = 15, LateFeePerDay = 50000m, GracePeriodDays = 3, RenewalNoticeDays = 30 };
            _repo.AddRentalPolicy(globalPolicy);
            allPolicies.Add(globalPolicy);
        }

        byte? newDepositMonths = request.DepositMonths.HasValue
            ? (request.DepositMonths.Value <= 1 ? (byte)1 : (byte)2)
            : request.DepositPercent.HasValue
                ? (request.DepositPercent.Value <= 1 || (request.DepositPercent.Value > 2 && request.DepositPercent.Value <= 50) ? (byte)1 : (byte)2)
                : null;

        foreach (var p in allPolicies)
        {
            if (newDepositMonths.HasValue) p.DepositMonths = newDepositMonths.Value;
            if (request.HoldMinutes.HasValue) p.HoldMinutes = Math.Clamp(request.HoldMinutes.Value, 1, 60);
            if (request.LateFeePerDay.HasValue) p.LateFeePerDay = Math.Max(0m, request.LateFeePerDay.Value);
            if (request.GracePeriodDays.HasValue) p.GracePeriodDays = Math.Max(0, request.GracePeriodDays.Value);
            if (request.RenewalNoticeDays.HasValue) p.RenewalNoticeDays = Math.Max(0, request.RenewalNoticeDays.Value);
            p.UpdatedAt = now;
            p.UpdatedByUserID = user?.UserID;

            if (request.CancellationRules is { Count: > 0 })
            {
                var rules = request.CancellationRules
                    .GroupBy(r => Math.Max(0, r.DaysBeforeStart))
                    .Select(g => new CancellationRule
                    {
                        RentalPolicyID = p.RentalPolicyID,
                        DaysBeforeStart = g.Key,
                        RefundPercent = Math.Clamp(g.First().RefundPercent, 0m, 100m)
                    });
                _repo.ReplaceCancellationRules(p, rules);
            }
        }

        if (request.ContractDiscounts is { Count: > 0 })
        {
            var contractTypes = await _repo.GetContractTypesAsync(cancellationToken);
            foreach (var disc in request.ContractDiscounts)
            {
                var ct = contractTypes.FirstOrDefault(x => x.RentalMonths == disc.Months);
                if (ct is not null)
                {
                    ct.DiscountRate = Math.Clamp(disc.DiscountPercent, 0m, 100m);
                }
            }
        }

        if (request.ExtraFees is not null)
        {
            var existingFees = await _repo.GetFeePoliciesAsync(cancellationToken);
            foreach (var feeDto in request.ExtraFees)
            {
                var code = (!string.IsNullOrWhiteSpace(feeDto.FeeCode) ? feeDto.FeeCode : feeDto.Id)?.Trim().ToUpperInvariant();
                if (string.IsNullOrWhiteSpace(code))
                {
                    code = $"FEE_{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
                }
                if (code.Length > 30) code = code[..30];

                var existing = existingFees.FirstOrDefault(f => string.Equals(f.FeeCode, code, StringComparison.OrdinalIgnoreCase));
                var amount = Math.Max(0m, feeDto.Amount > 0 ? feeDto.Amount : (feeDto.MaxValue ?? 0m));

                if (existing is null)
                {
                    _repo.AddFeePolicy(new FeePolicy
                    {
                        FeeCode = code,
                        FeeName = string.IsNullOrWhiteSpace(feeDto.Name) ? code : feeDto.Name.Trim(),
                        FeeCategory = feeDto.Category is "ExtraFee" or "LateFee" or "Discount" or "FeeWaiver" ? feeDto.Category : "ExtraFee",
                        ValueType = feeDto.ValueType is "Amount" or "Percentage" ? feeDto.ValueType : "Amount",
                        MinValue = 0m,
                        MaxValue = amount,
                        IsActive = feeDto.IsActive ?? true,
                        CreatedAt = now,
                        UpdatedAt = now
                    });
                }
                else
                {
                    if (!string.IsNullOrWhiteSpace(feeDto.Name)) existing.FeeName = feeDto.Name.Trim();
                    existing.MaxValue = Math.Max(existing.MinValue, amount);
                    if (feeDto.IsActive.HasValue) existing.IsActive = feeDto.IsActive.Value;
                    existing.UpdatedAt = now;
                }
            }
        }

        await _repo.SaveChangesAsync(cancellationToken);
        return await GetSystemPoliciesAsync(cancellationToken);
    }

    // ===================== PRICE BANDS (/api/price-bands) =====================

    public async Task<OperationsServiceResponse> GetPriceBandsAsync(CancellationToken cancellationToken)
    {
        var categories = await _repo.GetSizeCategoriesWithDetailsAsync(cancellationToken);
        var units = await _repo.GetAllStorageUnitsAsync(cancellationToken);
        var rates = await _repo.GetAllRentalRatesAsync(cancellationToken);
        var allSizes = await _repo.GetAllUnitSizesAsync(cancellationToken);

        var bands = categories.Select(c => BuildBandObject(c, units, rates)).ToList();

        var assignedSizeIds = categories.SelectMany(c => c.UnitSizes.Select(s => s.UnitSizeID)).ToHashSet();
        var unassignedSizes = allSizes
            .Where(s => !assignedSizeIds.Contains(s.UnitSizeID))
            .Select(s => new
            {
                id = s.UnitSizeID,
                unitSizeId = s.UnitSizeID,
                code = s.SizeCode,
                sizeCode = s.SizeCode,
                dimensions = $"{s.SizeCode}: {s.DisplayName}",
                area = s.AreaM2,
                areaM2 = s.AreaM2,
                volumeM3 = s.VolumeM3
            })
            .ToList();

        return new OperationsServiceResponse(true, null, 200, new
        {
            bands,
            unassignedSizes
        });
    }

    public async Task<OperationsServiceResponse> CreatePriceBandAsync(
        UpsertPriceBandDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ Business Operations Manager mới được tạo khung giá.", 403, null);

        var code = (request.Code ?? string.Empty).Trim().ToUpperInvariant();
        var name = (request.Name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name))
            return new OperationsServiceResponse(false, "Mã khung và tên hiển thị là bắt buộc.", 400, null);

        if (request.MinArea <= 0 || request.MaxArea < request.MinArea)
            return new OperationsServiceResponse(false, "Diện tích tối đa phải lớn hơn hoặc bằng diện tích tối thiểu.", 400, null);

        if (request.MinPrice <= 0 || request.MaxPrice < request.MinPrice)
            return new OperationsServiceResponse(false, "Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.", 400, null);

        var categories = await _repo.GetSizeCategoriesWithDetailsAsync(cancellationToken);
        if (categories.Any(c => string.Equals(c.CodePrefix.Trim(), code, StringComparison.OrdinalIgnoreCase) || string.Equals(c.CategoryCode, code, StringComparison.OrdinalIgnoreCase)))
            return new OperationsServiceResponse(false, $"Mã khung giá '{code}' đã tồn tại.", 409, null);

        if (categories.Any(c => string.Equals(c.CategoryName, name, StringComparison.OrdinalIgnoreCase)))
            return new OperationsServiceResponse(false, $"Tên khung giá '{name}' đã tồn tại.", 409, null);

        var usedPrefixes = categories.Select(c => c.CodePrefix.Trim().ToUpperInvariant()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidateChars = (code + "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789").Where(char.IsAsciiLetterOrDigit).Select(c => char.ToUpperInvariant(c).ToString()).Distinct();
        var prefix = candidateChars.FirstOrDefault(p => !usedPrefixes.Contains(p));
        if (prefix is null)
            return new OperationsServiceResponse(false, "Đã hết ký hiệu tiền tố cho nhóm size mới.", 409, null);

        var user = await _repo.GetActiveUserByEmailAsync(userEmail!, cancellationToken);
        var height = request.StandardHeightM is > 0m and <= 10m ? request.StandardHeightM.Value : 2.50m;
        var minVol = decimal.Round(Math.Max(0.1m, request.MinArea * height), 2);
        var maxVol = decimal.Round(Math.Max(minVol + 0.1m, request.MaxArea * height), 2);

        var category = new SizeCategory
        {
            CategoryCode = code.Length > 20 ? code[..20] : code,
            CategoryName = name.Length > 50 ? name[..50] : name,
            CodePrefix = prefix,
            StandardHeightM = height,
            MinVolumeM3 = minVol,
            MaxVolumeM3 = maxVol,
            MinMonthlyPrice = request.MinPrice,
            MaxMonthlyPrice = request.MaxPrice,
            IsActive = request.IsActive ?? true,
            UpdatedAt = DateTime.UtcNow,
            UpdatedByUserID = user?.UserID
        };

        _repo.AddSizeCategory(category);
        await _repo.SaveChangesAsync(cancellationToken);

        var fullResult = await GetPriceBandsAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 201, fullResult.Data);
    }

    public async Task<OperationsServiceResponse> UpdatePriceBandAsync(
        string code,
        UpsertPriceBandDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ Business Operations Manager mới được cập nhật khung giá.", 403, null);

        var category = await _repo.GetSizeCategoryByCodeAsync(code, cancellationToken);
        if (category is null)
            return new OperationsServiceResponse(false, "Không tìm thấy khung giá.", 404, null);

        if (request.MinArea <= 0 || request.MaxArea < request.MinArea)
            return new OperationsServiceResponse(false, "Diện tích tối đa phải lớn hơn hoặc bằng diện tích tối thiểu.", 400, null);

        if (request.MinPrice <= 0 || request.MaxPrice < request.MinPrice)
            return new OperationsServiceResponse(false, "Giá tối đa phải lớn hơn hoặc bằng giá tối thiểu.", 400, null);

        var user = await _repo.GetActiveUserByEmailAsync(userEmail!, cancellationToken);

        await _repo.ExecuteInTransactionAsync(async () =>
        {
            var height = category.StandardHeightM > 0 ? category.StandardHeightM : 2.50m;
            var newMinVol = decimal.Round(Math.Max(0.1m, request.MinArea * height), 2);
            var newMaxVol = decimal.Round(Math.Max(newMinVol + 0.01m, request.MaxArea * height), 2);

            var activeSizes = category.UnitSizes.Where(s => s.IsActive).ToList();
            if (activeSizes.Count > 0)
            {
                var minExistingVol = activeSizes.Min(s => decimal.Round(s.WidthM * s.LengthM * s.HeightM, 2));
                var maxExistingVol = activeSizes.Max(s => decimal.Round(s.WidthM * s.LengthM * s.HeightM, 2));
                if (newMinVol > minExistingVol) newMinVol = minExistingVol;
                if (newMaxVol < maxExistingVol) newMaxVol = maxExistingVol;
            }

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var cleanName = request.Name.Trim();
                category.CategoryName = cleanName.Length > 50 ? cleanName[..50] : cleanName;
            }
            if (request.IsActive.HasValue)
            {
                category.IsActive = request.IsActive.Value;
            }

            // Bước 1: Mở rộng tạm thời khoảng giá trên SizeCategory để không bị trigger chặn khi điều chỉnh RentalRate
            category.MinVolumeM3 = Math.Min(category.MinVolumeM3, newMinVol);
            category.MaxVolumeM3 = Math.Max(category.MaxVolumeM3, newMaxVol);
            category.MinMonthlyPrice = Math.Min(category.MinMonthlyPrice, request.MinPrice);
            category.MaxMonthlyPrice = Math.Max(category.MaxMonthlyPrice, request.MaxPrice);
            category.UpdatedAt = DateTime.UtcNow;
            category.UpdatedByUserID = user?.UserID;
            await _repo.SaveChangesAsync(cancellationToken);

            // Bước 2: Đảm bảo các RentalRate thuộc nhóm size này nằm trong khung giá mới để thỏa TR_SizeCategory_ValidateExistingData
            var sizeIdsInBand = category.UnitSizes.Select(s => s.UnitSizeID).ToHashSet();
            var rates = await _repo.GetAllRentalRatesAsync(cancellationToken);
            foreach (var rate in rates.Where(r => sizeIdsInBand.Contains(r.UnitSizeID)))
            {
                if (rate.MonthlyPrice < request.MinPrice || rate.MonthlyPrice > request.MaxPrice)
                {
                    rate.MonthlyPrice = Math.Clamp(rate.MonthlyPrice, request.MinPrice, request.MaxPrice);
                    rate.UpdatedAt = DateTime.UtcNow;
                    rate.UpdatedByUserID = user?.UserID;
                }
            }
            await _repo.SaveChangesAsync(cancellationToken);

            // Bước 3: Lưu chính xác khung thể tích và khung giá mới
            category.MinVolumeM3 = newMinVol;
            category.MaxVolumeM3 = newMaxVol;
            category.MinMonthlyPrice = request.MinPrice;
            category.MaxMonthlyPrice = request.MaxPrice;
            await _repo.SaveChangesAsync(cancellationToken);

            return true;
        }, cancellationToken);

        return await GetPriceBandsAsync(cancellationToken);
    }

    public async Task<OperationsServiceResponse> DeletePriceBandAsync(
        string code,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ Business Operations Manager mới được xóa khung giá.", 403, null);

        var category = await _repo.GetSizeCategoryByCodeAsync(code, cancellationToken);
        if (category is null)
            return new OperationsServiceResponse(false, "Không tìm thấy khung giá.", 404, null);

        if (category.UnitSizes.Count > 0)
            return new OperationsServiceResponse(
                false,
                $"Không thể xóa khung giá '{category.CategoryName}' vì đang có {category.UnitSizes.Count} kích thước kho thuộc nhóm này. Hãy chuyển sang Ngừng sử dụng.",
                409,
                null);

        _repo.RemoveSizeCategory(category);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 204, null);
    }

    private static object BuildBandObject(SizeCategory c, List<StorageUnit> units, List<RentalRate> rates)
    {
        var height = c.StandardHeightM > 0 ? c.StandardHeightM : 2.50m;
        var minArea = decimal.Round(c.MinVolumeM3 / height, 2);
        var maxArea = decimal.Round(c.MaxVolumeM3 / height, 2);
        var sizeIds = c.UnitSizes.Select(s => s.UnitSizeID).ToHashSet();
        var bandRates = rates.Where(r => sizeIds.Contains(r.UnitSizeID)).ToList();
        var unitCount = units.Count(u => sizeIds.Contains(u.UnitSizeID) && u.Status != UnitStatus.Inactive);
        var currentMinPrice = bandRates.Count > 0 ? (decimal?)bandRates.Min(r => r.MonthlyPrice) : null;
        var currentMaxPrice = bandRates.Count > 0 ? (decimal?)bandRates.Max(r => r.MonthlyPrice) : null;

        return new
        {
            sizeCategoryId = c.SizeCategoryID,
            code = c.CodePrefix.Trim().ToUpperInvariant(),
            categoryCode = c.CategoryCode,
            name = c.CategoryName,
            prefix = c.CodePrefix.Trim(),
            standardHeightM = c.StandardHeightM,
            minVolumeM3 = c.MinVolumeM3,
            maxVolumeM3 = c.MaxVolumeM3,
            minArea,
            maxArea,
            minPrice = c.MinMonthlyPrice,
            maxPrice = c.MaxMonthlyPrice,
            currentMinPrice,
            currentMaxPrice,
            recommendedPrice = decimal.Round((c.MinMonthlyPrice + c.MaxMonthlyPrice) / 2m, 0),
            isActive = c.IsActive,
            updatedAt = c.UpdatedAt,
            updatedBy = c.UpdatedByUser?.Email ?? "ops@test.com",
            sizeCount = c.UnitSizes.Count,
            sizes = c.UnitSizes
                .OrderBy(s => s.UnitSizeID)
                .Select(s => new
                {
                    id = s.UnitSizeID,
                    unitSizeId = s.UnitSizeID,
                    sizeCode = s.SizeCode,
                    dimensions = $"{s.SizeCode}: {s.DisplayName}",
                    area = s.AreaM2,
                    areaM2 = s.AreaM2,
                    volumeM3 = s.VolumeM3,
                    areaOutOfRange = s.AreaM2 < minArea || s.AreaM2 > maxArea
                })
                .ToList(),
            outOfRange = Array.Empty<object>(),
            unitCount,
            rateStats = new
            {
                totalRates = bandRates.Count,
                minActual = currentMinPrice,
                maxActual = currentMaxPrice,
                outOfBandCount = bandRates.Count(r => r.MonthlyPrice < c.MinMonthlyPrice || r.MonthlyPrice > c.MaxMonthlyPrice)
            }
        };
    }

    // ===================== POLICY GROUPS (/api/policies) =====================

    private async Task EnsurePolicyHistoryInitializedAsync(CancellationToken cancellationToken)
    {
        if (_policyHistory.Count >= 4)
            return;

        var globalPolicy = await _repo.GetGlobalRentalPolicyAsync(cancellationToken);
        var feePolicies = await _repo.GetFeePoliciesAsync(cancellationToken);

        var depositMonths = (int)(globalPolicy?.DepositMonths ?? 2);
        var rules = globalPolicy?.CancellationRules.OrderByDescending(r => r.DaysBeforeStart).ToList() ?? [];

        var cleaningFee = feePolicies
            .FirstOrDefault(f => string.Equals(f.FeeCode, "CLEANING_FEE", StringComparison.OrdinalIgnoreCase))
            ?.MaxValue;
        var lockFee = feePolicies
            .FirstOrDefault(f => string.Equals(f.FeeCode, "LOCK_REPLACEMENT", StringComparison.OrdinalIgnoreCase))
            ?.MaxValue;

        var createdAt = globalPolicy?.UpdatedAt ?? new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var createdBy = globalPolicy?.UpdatedByUser?.Email ?? "ops@test.com";

        var refundTiers = rules.Count > 0
            ? rules.Select(r => (object)new Dictionary<string, object?> { ["minDaysBefore"] = r.DaysBeforeStart, ["refundPercent"] = (int)r.RefundPercent }).ToList()
            : new List<object>
            {
                new Dictionary<string, object?> { ["minDaysBefore"] = 7, ["refundPercent"] = 100 },
                new Dictionary<string, object?> { ["minDaysBefore"] = 3, ["refundPercent"] = 50 },
                new Dictionary<string, object?> { ["minDaysBefore"] = 0, ["refundPercent"] = 0 }
            };

        lock (_policyLock)
        {
            _policyHistory.GetOrAdd("deposit", _ =>
            [
                new PolicyVersionEntry
                {
                    Key = "deposit",
                    Version = 1,
                    Status = "Active",
                    EffectiveFrom = "2026-01-01",
                    CreatedAt = createdAt,
                    CreatedBy = createdBy,
                    Note = "Chính sách cọc khởi tạo từ cơ sở dữ liệu",
                    Config = new Dictionary<string, object?>
                    {
                        ["method"] = "months",
                        ["value"] = depositMonths,
                        ["scope"] = "all",
                        ["facilityIds"] = new List<object?>()
                    }
                }
            ]);

            _policyHistory.GetOrAdd("overdue", _ =>
            [
                new PolicyVersionEntry
                {
                    Key = "overdue",
                    Version = 1,
                    Status = "Active",
                    EffectiveFrom = "2026-01-01",
                    CreatedAt = createdAt,
                    CreatedBy = createdBy,
                    Note = "Chính sách quá hạn & phụ phí khởi tạo từ cơ sở dữ liệu",
                    Config = new Dictionary<string, object?>
                    {
                        ["feeType"] = "percent",
                        ["feeValue"] = 0.05m,
                        ["period"] = "day",
                        ["graceDays"] = globalPolicy?.GracePeriodDays ?? 3,
                        ["maxPercent"] = 5,
                        ["extraFees"] = new List<object?>
                        {
                            new Dictionary<string, object?> { ["code"] = "LOST_CARD", ["name"] = "Làm lại thẻ truy cập", ["amount"] = null, ["condition"] = "Khách làm mất / hỏng thẻ ra vào", ["active"] = true },
                            new Dictionary<string, object?> { ["code"] = "LOST_KEY", ["name"] = "Mất khóa", ["amount"] = null, ["condition"] = "Khách làm mất khóa", ["active"] = true },
                            new Dictionary<string, object?> { ["code"] = "REPLACE_LOCK", ["name"] = "Thay khóa", ["amount"] = lockFee, ["condition"] = "Thay khóa do lỗi / mất khóa thuộc trách nhiệm khách", ["active"] = true },
                            new Dictionary<string, object?> { ["code"] = "CLEANING", ["name"] = "Vệ sinh kho", ["amount"] = cleaningFee, ["condition"] = "Kho cần vệ sinh vượt mức sử dụng thông thường", ["active"] = true },
                            new Dictionary<string, object?> { ["code"] = "PROCESSING", ["name"] = "Phí xử lý", ["amount"] = null, ["condition"] = "Chỉ áp dụng khi đã công bố / thỏa thuận", ["active"] = false }
                        }
                    }
                }
            ]);

            _policyHistory.GetOrAdd("reservation", _ =>
            [
                new PolicyVersionEntry
                {
                    Key = "reservation",
                    Version = 1,
                    Status = "Active",
                    EffectiveFrom = "2026-01-01",
                    CreatedAt = createdAt,
                    CreatedBy = createdBy,
                    Note = "Chính sách đặt chỗ & hủy khởi tạo từ cơ sở dữ liệu",
                    Config = new Dictionary<string, object?>
                    {
                        ["holdMinutes"] = globalPolicy?.HoldMinutes ?? 15,
                        ["cancellationConditions"] = "Chỉ hủy được khi đặt chỗ chưa bàn giao. Hủy do lỗi doanh nghiệp được hoàn toàn bộ số tiền đã thanh toán.",
                        ["refundTiers"] = refundTiers,
                        ["noShowAfterDays"] = 0,
                        ["noShowRefundPercent"] = 0,
                        ["releaseUnitOnNoShow"] = true
                    }
                }
            ]);

            _policyHistory.GetOrAdd("renewal_return", _ =>
            [
                new PolicyVersionEntry
                {
                    Key = "renewal_return",
                    Version = 1,
                    Status = "Active",
                    EffectiveFrom = "2026-01-01",
                    CreatedAt = createdAt,
                    CreatedBy = createdBy,
                    Note = "Chính sách gia hạn & trả kho khởi tạo từ cơ sở dữ liệu",
                    Config = new Dictionary<string, object?>
                    {
                        ["renewalNoticeDays"] = globalPolicy?.RenewalNoticeDays ?? 7,
                        ["minRenewalMonths"] = 1,
                        ["maxRenewalMonths"] = 12,
                        ["requireNoOverdue"] = true,
                        ["renewalPaymentDeadlineDays"] = null,
                        ["renewalPricing"] = "Theo bảng giá có hiệu lực tại thời điểm gia hạn",
                        ["returnNoticeDays"] = 7,
                        ["depositRefundWorkingDays"] = 7,
                        ["returnRequirements"] = "Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập",
                        ["returnFees"] = new List<object?>
                        {
                            new Dictionary<string, object?> { ["name"] = "Vệ sinh kho", ["amount"] = cleaningFee, ["condition"] = "Kho bẩn vượt mức sử dụng thông thường" },
                            new Dictionary<string, object?> { ["name"] = "Sửa chữa hư hỏng", ["amount"] = null, ["condition"] = "Theo chi phí thực tế, có biên bản kiểm tra" }
                        }
                    }
                }
            ]);
        }
    }

    public async Task<OperationsServiceResponse> GetPolicyGroupsAsync(CancellationToken cancellationToken)
    {
        await EnsurePolicyHistoryInitializedAsync(cancellationToken);

        var current = new Dictionary<string, object>();
        var scheduled = new List<object>();

        foreach (var kvp in _policyHistory)
        {
            var versions = kvp.Value;
            var activeVersion = versions.LastOrDefault(v => v.Status == "Active") ?? versions.Last();
            current[kvp.Key] = ToPolicyDto(activeVersion);

            foreach (var sched in versions.Where(v => v.Status == "Scheduled"))
            {
                scheduled.Add(ToPolicyDto(sched));
            }
        }

        return new OperationsServiceResponse(true, null, 200, new
        {
            current,
            scheduled
        });
    }

    public async Task<OperationsServiceResponse> GetPolicyGroupHistoryAsync(string policyKey, CancellationToken cancellationToken)
    {
        await EnsurePolicyHistoryInitializedAsync(cancellationToken);

        if (!_policyHistory.TryGetValue(policyKey, out var list))
            return new OperationsServiceResponse(false, "Không tìm thấy nhóm chính sách.", 404, null);

        var versions = list
            .OrderByDescending(v => v.Version)
            .Select(ToPolicyDto)
            .ToList();

        return new OperationsServiceResponse(true, null, 200, versions);
    }

    public async Task<OperationsServiceResponse> UpdatePolicyGroupAsync(
        string policyKey,
        UpdatePolicyGroupDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ Business Operations Manager mới được cập nhật chính sách.", 403, null);

        await EnsurePolicyHistoryInitializedAsync(cancellationToken);

        if (!_policyHistory.TryGetValue(policyKey, out var historyList))
            return new OperationsServiceResponse(false, "Nhóm chính sách không hợp lệ.", 400, null);

        var user = await _repo.GetActiveUserByEmailAsync(userEmail!, cancellationToken);
        var now = DateTime.UtcNow;

        var rawDict = request.Value ?? request.Config;
        var parsedConfig = new Dictionary<string, object?>();
        if (rawDict is not null)
        {
            foreach (var (k, v) in rawDict)
            {
                parsedConfig[k] = ConvertJsonElement(v);
            }
        }

        // Đồng bộ xuống các bảng thật trong SQL Server (RentalPolicy, CancellationRule, FeePolicy)
        var allPolicies = await _repo.GetAllRentalPoliciesAsync(cancellationToken);

        if (string.Equals(policyKey, "deposit", StringComparison.OrdinalIgnoreCase))
        {
            var depValue = GetIntConfig(parsedConfig, "value", GetIntConfig(parsedConfig, "depositMonths", 2));
            byte depMonths = depValue <= 1 ? (byte)1 : (byte)2;
            foreach (var p in allPolicies)
            {
                p.DepositMonths = depMonths;
                p.UpdatedAt = now;
                p.UpdatedByUserID = user?.UserID;
            }
        }
        else if (string.Equals(policyKey, "overdue", StringComparison.OrdinalIgnoreCase))
        {
            var graceDays = Math.Max(0, GetIntConfig(parsedConfig, "graceDays", GetIntConfig(parsedConfig, "gracePeriodDays", 3)));
            foreach (var p in allPolicies)
            {
                p.GracePeriodDays = graceDays;
                p.UpdatedAt = now;
                p.UpdatedByUserID = user?.UserID;
            }
        }
        else if (string.Equals(policyKey, "reservation", StringComparison.OrdinalIgnoreCase))
        {
            var holdMinutes = Math.Clamp(GetIntConfig(parsedConfig, "holdMinutes", GetIntConfig(parsedConfig, "paymentHoldMinutes", 15)), 1, 60);
            foreach (var p in allPolicies)
            {
                p.HoldMinutes = holdMinutes;
                p.UpdatedAt = now;
                p.UpdatedByUserID = user?.UserID;

                if (parsedConfig.TryGetValue("refundTiers", out var tiersObj) && tiersObj is List<object?> tiersList && tiersList.Count > 0)
                {
                    var rules = tiersList
                        .OfType<Dictionary<string, object?>>()
                        .Select(t => new CancellationRule
                        {
                            RentalPolicyID = p.RentalPolicyID,
                            DaysBeforeStart = Math.Max(0, GetIntConfig(t, "minDaysBefore", 0)),
                            RefundPercent = Math.Clamp(GetDecimalConfig(t, "refundPercent", 0m), 0m, 100m)
                        })
                        .GroupBy(r => r.DaysBeforeStart)
                        .Select(g => g.First())
                        .ToList();

                    if (rules.Count > 0)
                    {
                        _repo.ReplaceCancellationRules(p, rules);
                    }
                }
            }
        }
        else if (string.Equals(policyKey, "renewal_return", StringComparison.OrdinalIgnoreCase))
        {
            var remindDays = Math.Max(0, GetIntConfig(parsedConfig, "renewalNoticeDays", GetIntConfig(parsedConfig, "remindBeforeEndDays", 7)));
            foreach (var p in allPolicies)
            {
                p.RenewalNoticeDays = remindDays;
                p.UpdatedAt = now;
                p.UpdatedByUserID = user?.UserID;
            }
        }

        await _repo.SaveChangesAsync(cancellationToken);

        var todayStr = DateTime.Today.ToString("yyyy-MM-dd");
        var effectiveFrom = string.IsNullOrWhiteSpace(request.EffectiveFrom) ? todayStr : request.EffectiveFrom.Trim();
        var isScheduled = string.CompareOrdinal(effectiveFrom, todayStr) > 0;

        PolicyVersionEntry newEntry;
        lock (_policyLock)
        {
            var nextVersion = historyList.Count > 0 ? historyList.Max(v => v.Version) + 1 : 1;
            if (!isScheduled)
            {
                foreach (var old in historyList.Where(v => v.Status == "Active"))
                {
                    old.Status = "Superseded";
                }
            }

            newEntry = new PolicyVersionEntry
            {
                Key = policyKey.ToLowerInvariant(),
                Version = nextVersion,
                Status = isScheduled ? "Scheduled" : "Active",
                EffectiveFrom = effectiveFrom,
                CreatedAt = now,
                CreatedBy = user?.Email ?? userEmail ?? "ops@test.com",
                Note = string.IsNullOrWhiteSpace(request.Note) ? $"Cập nhật phiên bản v{nextVersion}" : request.Note.Trim(),
                Config = parsedConfig
            };
            historyList.Add(newEntry);
        }

        return new OperationsServiceResponse(true, null, 200, ToPolicyDto(newEntry));
    }

    private static object ToPolicyDto(PolicyVersionEntry entry) => new
    {
        key = entry.Key,
        version = entry.Version,
        status = entry.Status,
        isDefault = entry.Version <= 1,
        effectiveFrom = entry.EffectiveFrom,
        createdAt = entry.CreatedAt,
        createdBy = entry.CreatedBy,
        note = entry.Note,
        value = entry.Config,
        config = entry.Config
    };

    private static object? ConvertJsonElement(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => null,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => el.TryGetInt64(out var l) ? l : (el.TryGetDecimal(out var d) ? d : el.GetDouble()),
        JsonValueKind.String => el.GetString() ?? string.Empty,
        JsonValueKind.Array => el.EnumerateArray().Select(ConvertJsonElement).ToList(),
        JsonValueKind.Object => el.EnumerateObject().ToDictionary(p => p.Name, p => ConvertJsonElement(p.Value)),
        _ => el.ToString()
    };

    private static int GetIntConfig(Dictionary<string, object?> config, string key, int fallback)
    {
        if (!config.TryGetValue(key, out var val) || val is null) return fallback;
        return int.TryParse(val.ToString(), out var parsed) ? parsed : fallback;
    }

    private static decimal GetDecimalConfig(Dictionary<string, object?> config, string key, decimal fallback)
    {
        if (!config.TryGetValue(key, out var val) || val is null) return fallback;
        return decimal.TryParse(val.ToString(), out var parsed) ? parsed : fallback;
    }

    // ===================== FACILITY & UNIT CRUD =====================

    public async Task<OperationsServiceResponse> CreateFacilityAsync(
        CreateFacilityDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (string.IsNullOrWhiteSpace(request.FacilityName) ||
            string.IsNullOrWhiteSpace(request.Address) ||
            string.IsNullOrWhiteSpace(request.ManagerEmail))
            return new OperationsServiceResponse(false, "Tên, địa chỉ và Facility Manager là bắt buộc.", 400, null);

        if (string.IsNullOrWhiteSpace(request.UnitCodePrefix) ||
            request.UnitCodePrefix.Length > 10 ||
            request.UnitCodePrefix.Any(character => !char.IsAsciiLetterOrDigit(character)))
            return new OperationsServiceResponse(false, "Mã chi nhánh chỉ được gồm tối đa 10 chữ cái hoặc chữ số.", 400, null);

        if (!string.Equals(request.Status, "active", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase))
            return new OperationsServiceResponse(false, "Trạng thái cơ sở không hợp lệ.", 400, null);

        var facilityName = request.FacilityName.Trim();
        var unitCodePrefix = request.UnitCodePrefix.Trim().ToUpperInvariant();
        var address = request.Address.Trim();

        if (await _repo.UnitCodePrefixExistsAsync(unitCodePrefix, cancellationToken))
            return new OperationsServiceResponse(false, "Mã chi nhánh đã được sử dụng.", 409, null);

        if (await _repo.FacilityNameExistsAsync(facilityName, cancellationToken))
            return new OperationsServiceResponse(false, "Tên cơ sở đã tồn tại.", 409, null);

        var manager = await _repo.GetActiveUserByEmailAndRoleAsync(request.ManagerEmail, 3, cancellationToken);
        if (manager is null)
            return new OperationsServiceResponse(false, "Cần chỉ định tài khoản Facility Manager hợp lệ.", 400, null);

        var facility = new Facility
        {
            ManagerID = manager.UserID,
            FacilityName = facilityName,
            UnitCodePrefix = unitCodePrefix,
            ContactPhone = request.ContactPhone?.Trim(),
            OpeningHours = request.OpeningHours?.Trim() ?? "07:00 - 21:00 hằng ngày",
            Description = request.Description?.Trim(),
            Status = string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active",
            CreatedAt = DateTime.UtcNow
        };
        facility.ApplyAddressString(address);
        if (!string.IsNullOrWhiteSpace(request.StreetAddress)) facility.StreetAddress = request.StreetAddress.Trim();
        if (!string.IsNullOrWhiteSpace(request.Ward)) facility.Ward = request.Ward.Trim();
        if (!string.IsNullOrWhiteSpace(request.District)) facility.District = request.District.Trim();
        if (!string.IsNullOrWhiteSpace(request.City)) facility.City = request.City.Trim();

        // Trigger TR_Facility_CreateDefaultPolicy tự động tạo RentalPolicy và CancellationRule cho cơ sở mới
        _repo.AddFacility(facility);
        await _repo.SaveChangesAsync(cancellationToken);

        byte depositMonths = 2;
        if (request.DepositMonths.HasValue || request.DepositPercent.HasValue)
        {
            var rawDep = request.DepositMonths.HasValue ? (decimal)request.DepositMonths.Value : request.DepositPercent!.Value;
            depositMonths = rawDep <= 1 || (rawDep > 2 && rawDep <= 50) ? (byte)1 : (byte)2;
            var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facility.FacilityID, cancellationToken);
            if (policy is not null && policy.DepositMonths != depositMonths)
            {
                policy.DepositMonths = depositMonths;
                await _repo.SaveChangesAsync(cancellationToken);
            }
        }

        return new OperationsServiceResponse(true, null, 201, new
        {
            facilityId = facility.FacilityID,
            name = facility.FacilityName,
            unitCodePrefix = facility.UnitCodePrefix,
            address = facility.Address,
            district = facility.District,
            contactPhone = facility.ContactPhone,
            managerEmail = manager.Email,
            depositPercent = depositMonths == 1 ? 50m : 100m,
            depositMonths = (int)depositMonths
        });
    }

    public async Task<OperationsServiceResponse> DeleteFacilityAsync(
        int facilityId,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var facility = await _repo.GetFacilityByIdAsync(facilityId, cancellationToken);
        if (facility is null)
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if (await _repo.FacilityHasDependenciesAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(
                false,
                "Không thể xóa cơ sở đã có kho, đặt chỗ hoặc nhân viên được phân công. Hãy chuyển cơ sở sang trạng thái tạm ngưng.",
                409,
                null);

        var rates = await _repo.GetRentalRatesByFacilityIdAsync(facilityId, cancellationToken);
        var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facilityId, cancellationToken);

        _repo.RemoveRentalRates(rates);
        await _repo.RemoveFacilityCatalogLinksAsync(facilityId, cancellationToken);
        if (policy is not null)
            _repo.RemoveRentalPolicy(policy);
        _repo.RemoveFacility(facility);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 204, null);
    }

    public async Task<OperationsServiceResponse> UpdateFacilityAsync(
        int facilityId,
        UpdateFacilityDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await IsBusinessOperationsManagerAsync(userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var facility = await _repo.GetFacilityByIdAsync(facilityId, cancellationToken);
        if (facility is null)
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if ((request.FacilityName is not null && string.IsNullOrWhiteSpace(request.FacilityName)) ||
            (request.Address is not null && string.IsNullOrWhiteSpace(request.Address)) ||
            (request.ManagerEmail is not null && string.IsNullOrWhiteSpace(request.ManagerEmail)))
            return new OperationsServiceResponse(false, "Tên, địa chỉ và Facility Manager không được để trống.", 400, null);

        if (request.Status is not null &&
            !request.Status.Equals("active", StringComparison.OrdinalIgnoreCase) &&
            !request.Status.Equals("inactive", StringComparison.OrdinalIgnoreCase))
            return new OperationsServiceResponse(false, "Trạng thái cơ sở không hợp lệ.", 400, null);

        if (request.ManagerEmail is not null)
        {
            var manager = await _repo.GetActiveUserByEmailAndRoleAsync(request.ManagerEmail, 3, cancellationToken);
            if (manager is null)
                return new OperationsServiceResponse(false, "Cần chỉ định tài khoản Facility Manager hợp lệ.", 400, null);
            facility.ManagerID = manager.UserID;
        }

        if (request.FacilityName is not null)
            facility.FacilityName = request.FacilityName.Trim();
        if (request.Address is not null)
            facility.ApplyAddressString(request.Address.Trim());
        if (!string.IsNullOrWhiteSpace(request.StreetAddress))
            facility.StreetAddress = request.StreetAddress.Trim();
        if (!string.IsNullOrWhiteSpace(request.Ward))
            facility.Ward = request.Ward.Trim();
        if (!string.IsNullOrWhiteSpace(request.District))
            facility.District = request.District.Trim();
        if (!string.IsNullOrWhiteSpace(request.City))
            facility.City = request.City.Trim();
        if (request.ContactPhone is not null)
            facility.ContactPhone = request.ContactPhone.Trim();
        if (request.OpeningHours is not null)
            facility.OpeningHours = request.OpeningHours.Trim();
        if (request.Description is not null)
            facility.Description = request.Description.Trim();
        if (request.Status is not null)
            facility.Status = string.Equals(request.Status, "inactive", StringComparison.OrdinalIgnoreCase)
                ? "Inactive"
                : "Active";

        if (request.DepositMonths.HasValue || request.DepositPercent.HasValue)
        {
            var rawDep = request.DepositMonths.HasValue ? (decimal)request.DepositMonths.Value : request.DepositPercent!.Value;
            byte depositMonths = rawDep <= 1 || (rawDep > 2 && rawDep <= 50) ? (byte)1 : (byte)2;
            var policy = await _repo.GetRentalPolicyByFacilityIdAsync(facility.FacilityID, cancellationToken);
            if (policy is not null)
            {
                policy.DepositMonths = depositMonths;
                policy.UpdatedAt = DateTime.UtcNow;
            }
        }

        facility.UpdatedAt = DateTime.UtcNow;
        await _repo.SaveChangesAsync(cancellationToken);

        var managerEmail = request.ManagerEmail ?? await _repo.GetUserEmailByIdAsync(facility.ManagerID, cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            facilityId = facility.FacilityID,
            name = facility.FacilityName,
            address = facility.Address,
            district = facility.District,
            contactPhone = facility.ContactPhone,
            managerEmail,
            status = facility.Status
        });
    }

    public async Task<OperationsServiceResponse> AssignStaffAsync(
        int facilityId,
        AssignFacilityStaffDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(facilityId, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var staffUser = await _repo.GetActiveUserByEmailAndRoleAsync(request.StaffEmail, 2, cancellationToken);
        if (staffUser is null)
            return new OperationsServiceResponse(false, "Không tìm thấy tài khoản Facility Staff hợp lệ.", 400, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        var assignment = await _repo.GetFacilityStaffAssignmentAsync(facilityId, staffUser.UserID, cancellationToken);
        if (assignment is null)
        {
            assignment = new FacilityStaff
            {
                FacilityID = facilityId,
                UserID = staffUser.UserID,
                AssignedDate = DateTime.Today,
                Status = "Active"
            };
            _repo.AddFacilityStaff(assignment);
        }
        else
        {
            assignment.Status = "Active";
        }

        await _repo.SaveChangesAsync(cancellationToken);
        return new OperationsServiceResponse(true, null, 200, new
        {
            StaffID = assignment.AssignmentID,
            assignment.AssignmentID,
            assignment.FacilityID,
            assignment.UserID,
            assignment.Status
        });
    }

    public async Task<OperationsServiceResponse> CreateUnitAsync(
        CreateStorageUnitDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(request.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.IsFacilityActiveAsync(request.FacilityID, cancellationToken))
            return new OperationsServiceResponse(false, "Chỉ có thể thêm kho cho cơ sở đang hoạt động.", 400, null);

        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return new OperationsServiceResponse(false, "Trạng thái kho không hợp lệ.", 400, null);

        if (request.UnitTypeID.HasValue && !await _repo.UnitTypeExistsAsync(request.UnitTypeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Loại kho không hợp lệ.", 400, null);

        if (request.UnitSizeID.HasValue && !await _repo.UnitSizeExistsAsync(request.UnitSizeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Kích thước kho không hợp lệ.", 400, null);

        return await _repo.ExecuteInTransactionAsync(async () =>
        {
            var facility = await _repo.GetFacilityByIdAsync(request.FacilityID, cancellationToken);
            if (facility is null)
                return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

            var lookups = await _repo.GetOrCreateUnitLookupsAsync(request, cancellationToken);
            await _repo.EnsureFacilityCatalogLinksAsync(
                request.FacilityID,
                lookups.unitType.UnitTypeID,
                lookups.unitSize.UnitSizeID,
                cancellationToken);

            var rate = await _repo.GetRentalRateAsync(
                request.FacilityID,
                lookups.unitType.UnitTypeID,
                lookups.unitSize.UnitSizeID,
                cancellationToken);

            var minPrice = lookups.unitSize.SizeCategory?.MinMonthlyPrice ?? 400000m;
            var maxPrice = lookups.unitSize.SizeCategory?.MaxMonthlyPrice ?? 3500000m;
            var monthlyPrice = Math.Clamp(request.BasePrice, minPrice, maxPrice);

            if (rate is null)
            {
                rate = new RentalRate
                {
                    FacilityID = request.FacilityID,
                    UnitTypeID = lookups.unitType.UnitTypeID,
                    UnitSizeID = lookups.unitSize.UnitSizeID,
                    MonthlyPrice = monthlyPrice
                };
                _repo.AddRentalRate(rate);
                await _repo.SaveChangesAsync(cancellationToken);
            }

            var unitCodePrefix = facility.UnitCodePrefix.Trim().ToUpperInvariant();
            var existingUnitNumbers = await _repo.GetUnitNumbersByFacilityAsync(request.FacilityID, cancellationToken);
            var codePrefix = $"{unitCodePrefix}-U";
            var nextUnitNumber = existingUnitNumbers
                .Where(unitNumber => unitNumber.StartsWith(codePrefix, StringComparison.OrdinalIgnoreCase))
                .Select(unitNumber => int.TryParse(unitNumber[codePrefix.Length..], out var number) ? number : 0)
                .DefaultIfEmpty()
                .Max() + 1;
            var unitNumber = $"{codePrefix}{nextUnitNumber:D2}";

            var unit = new StorageUnit
            {
                FacilityID = request.FacilityID,
                UnitTypeID = lookups.unitType.UnitTypeID,
                UnitSizeID = lookups.unitSize.UnitSizeID,
                UnitNumber = unitNumber,
                Floor = request.Floor?.Trim(),
                Zone = request.Zone?.Trim(),
                LocationNote = request.LocationNote?.Trim(),
                Status = persistedStatus,
                CreatedAt = DateTime.UtcNow
            };
            _repo.AddStorageUnit(unit);
            await _repo.SaveChangesAsync(cancellationToken);

            return new OperationsServiceResponse(true, null, 201, new
            {
                unit.UnitID,
                unit.UnitNumber,
                unitCode = unit.UnitNumber,
                unit.FacilityID,
                BasePrice = rate.MonthlyPrice,
                unit.Status
            });
        }, cancellationToken);
    }

    public async Task<OperationsServiceResponse> UpdateRentalRateAsync(
        int facilityId,
        UpdateRentalRateDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(facilityId, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        if (!await _repo.FacilityExistsAsync(facilityId, cancellationToken))
            return new OperationsServiceResponse(false, "Không tìm thấy cơ sở.", 404, null);

        if (!await _repo.UnitTypeExistsAsync(request.UnitTypeID, cancellationToken) ||
            !await _repo.UnitSizeExistsAsync(request.UnitSizeID, cancellationToken))
            return new OperationsServiceResponse(false, "Loại hoặc kích thước kho không hợp lệ.", 400, null);

        var unitSize = await _repo.GetUnitSizeWithCategoryAsync(request.UnitSizeID, cancellationToken);
        if (unitSize?.SizeCategory is not null)
        {
            if (request.BasePrice < unitSize.SizeCategory.MinMonthlyPrice || request.BasePrice > unitSize.SizeCategory.MaxMonthlyPrice)
            {
                return new OperationsServiceResponse(
                    false,
                    $"Giá thuê phải nằm trong khung của nhóm {unitSize.SizeCategory.CategoryName} ({unitSize.SizeCategory.MinMonthlyPrice:N0}đ – {unitSize.SizeCategory.MaxMonthlyPrice:N0}đ).",
                    400,
                    null);
            }
        }

        await _repo.EnsureFacilityCatalogLinksAsync(facilityId, request.UnitTypeID, request.UnitSizeID, cancellationToken);

        var rate = await _repo.GetRentalRateAsync(facilityId, request.UnitTypeID, request.UnitSizeID, cancellationToken);
        if (rate is null)
        {
            rate = new RentalRate
            {
                FacilityID = facilityId,
                UnitTypeID = request.UnitTypeID,
                UnitSizeID = request.UnitSizeID,
                MonthlyPrice = request.BasePrice,
                UpdatedAt = DateTime.UtcNow
            };
            _repo.AddRentalRate(rate);
        }
        else
        {
            rate.MonthlyPrice = request.BasePrice;
            rate.UpdatedAt = DateTime.UtcNow;
        }

        var matchingUnits = await _repo.GetUnitsByFacilityTypeAndSizeAsync(
            facilityId,
            request.UnitTypeID,
            request.UnitSizeID,
            cancellationToken);

        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            facilityId,
            request.UnitTypeID,
            request.UnitSizeID,
            request.BasePrice,
            updatedUnitCount = matchingUnits.Count
        });
    }

    public async Task<OperationsServiceResponse> DeleteRentalRateAsync(
        int facilityId,
        int unitTypeId,
        int unitSizeId,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(facilityId, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var rate = await _repo.GetRentalRateAsync(facilityId, unitTypeId, unitSizeId, cancellationToken);
        if (rate is null)
            return new OperationsServiceResponse(false, "Không tìm thấy mức giá.", 404, null);

        if (await _repo.AnyUnitUsesRateAsync(facilityId, unitTypeId, unitSizeId, cancellationToken))
            return new OperationsServiceResponse(false, "Không thể xóa mức giá đang được kho hiện hữu sử dụng.", 409, null);

        _repo.RemoveRentalRate(rate);
        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 204, null);
    }

    public async Task<OperationsServiceResponse> UpdateUnitAsync(
        string unitNumber,
        CreateStorageUnitDTO request,
        string? userEmail,
        CancellationToken cancellationToken)
    {
        if (!await CanManageFacilityAsync(request.FacilityID, userEmail, cancellationToken))
            return new OperationsServiceResponse(false, null, 403, null);

        var unit = await _repo.GetUnitByNumberAndFacilityAsync(unitNumber, request.FacilityID, cancellationToken);
        if (unit is null)
            return new OperationsServiceResponse(false, "Không tìm thấy kho tại cơ sở.", 404, null);

        if (await _repo.HasActiveBookingHoldForUnitAsync(unit.UnitID, DateTime.UtcNow, cancellationToken))
            return new OperationsServiceResponse(false, "Không thể chỉnh sửa kho đang được giữ để thanh toán.", 409, null);

        if (request.UnitTypeID is null || request.UnitSizeID is null)
            return new OperationsServiceResponse(false, "Cần chọn loại và size kho hợp lệ.", 400, null);

        var persistedStatus = ToPersistedUnitStatus(request.Status);
        if (persistedStatus is null)
            return new OperationsServiceResponse(false, "Trạng thái kho không hợp lệ.", 400, null);

        if (!await _repo.UnitTypeExistsAsync(request.UnitTypeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Loại kho không hợp lệ.", 400, null);

        if (!await _repo.UnitSizeExistsAsync(request.UnitSizeID.Value, cancellationToken))
            return new OperationsServiceResponse(false, "Kích thước kho không hợp lệ.", 400, null);

        var lookups = await _repo.GetOrCreateUnitLookupsAsync(request, cancellationToken);
        await _repo.EnsureFacilityCatalogLinksAsync(
            request.FacilityID,
            lookups.unitType.UnitTypeID,
            lookups.unitSize.UnitSizeID,
            cancellationToken);

        var minPrice = lookups.unitSize.SizeCategory?.MinMonthlyPrice ?? 400000m;
        var maxPrice = lookups.unitSize.SizeCategory?.MaxMonthlyPrice ?? 3500000m;
        var clampedPrice = Math.Clamp(request.BasePrice, minPrice, maxPrice);

        var rate = await _repo.GetRentalRateAsync(
            request.FacilityID,
            lookups.unitType.UnitTypeID,
            lookups.unitSize.UnitSizeID,
            cancellationToken);

        if (rate is null)
        {
            rate = new RentalRate
            {
                FacilityID = request.FacilityID,
                UnitTypeID = lookups.unitType.UnitTypeID,
                UnitSizeID = lookups.unitSize.UnitSizeID,
                MonthlyPrice = clampedPrice
            };
            _repo.AddRentalRate(rate);
            await _repo.SaveChangesAsync(cancellationToken);
        }
        else if (request.BasePrice > 0 && rate.MonthlyPrice != clampedPrice)
        {
            rate.MonthlyPrice = clampedPrice;
            rate.UpdatedAt = DateTime.UtcNow;
        }

        unit.UnitTypeID = lookups.unitType.UnitTypeID;
        unit.UnitSizeID = lookups.unitSize.UnitSizeID;
        if (request.Floor is not null) unit.Floor = request.Floor.Trim();
        if (request.Zone is not null) unit.Zone = request.Zone.Trim();
        if (request.LocationNote is not null) unit.LocationNote = request.LocationNote.Trim();
        unit.Status = persistedStatus;
        unit.UpdatedAt = DateTime.UtcNow;

        await _repo.SaveChangesAsync(cancellationToken);

        return new OperationsServiceResponse(true, null, 200, new
        {
            unit.UnitID,
            unit.UnitNumber,
            unit.FacilityID,
            BasePrice = rate.MonthlyPrice,
            unit.Status
        });
    }

    private async Task<bool> IsBusinessOperationsManagerAsync(string? email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        return user is not null && user.RoleID == 4;
    }

    private async Task<bool> CanManageFacilityAsync(int facilityId, string? email, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;

        var user = await _repo.GetActiveUserByEmailAsync(email, cancellationToken);
        if (user is null)
            return false;

        if (user.RoleID == 4)
            return true;

        if (user.RoleID == 3)
            return await _repo.IsFacilityManagerAsync(facilityId, user.UserID, cancellationToken);

        return false;
    }

    private static string? ToPersistedUnitStatus(string status) => status.ToUpperInvariant() switch
    {
        "AVAILABLE" => UnitStatus.Available,
        "RESERVED" => UnitStatus.Available,
        "RENTED" or "IN_USE" => UnitStatus.InUse,
        "PENDING_INSPECTION" => UnitStatus.PendingInspection,
        "NEEDS_INSPECTION" or "MAINTENANCE" => UnitStatus.Maintenance,
        "INACTIVE" => UnitStatus.Inactive,
        _ => null
    };
}
