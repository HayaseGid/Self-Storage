using SelfStorageAPI.Interfaces;

namespace SelfStorageAPI.Services;

public class CatalogService : ICatalogService
{
    private readonly ICatalogRepository _catalogRepository;
    private readonly IReservationHoldService _reservationHoldService;

    public CatalogService(ICatalogRepository catalogRepository, IReservationHoldService reservationHoldService)
    {
        _catalogRepository = catalogRepository;
        _reservationHoldService = reservationHoldService;
    }

    public async Task<CatalogServiceResponse> GetCatalogStateAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);

        var facilitiesData = await _catalogRepository.GetActiveFacilitiesAsync(cancellationToken);
        var unitsData = await _catalogRepository.GetUnitsForActiveFacilitiesAsync(now, cancellationToken);

        var facilities = facilitiesData.Select(f => new {
            id = f.FacilityId.ToString(),
            name = f.Name,
            address = f.Address,
            status = f.Status,
            depositPercent = f.DepositPercent,
            depositMonths = (int)f.DepositPercent
        });

        var units = unitsData.Select(u => new {
            id = u.UnitNumber,
            unitId = u.UnitId,
            facility = u.FacilityId.ToString(),
            type = u.TypeName,
            unitTypeId = u.UnitTypeId,
            climate = u.TypeName,
            size = u.Dimensions,
            unitSizeId = u.UnitSizeId,
            price = u.BasePrice,
            status = u.Status,
            location = (string?)null
        });

        return new CatalogServiceResponse(true, null, 200, new { facilities, units });
    }

    public async Task<CatalogServiceResponse> GetAvailabilityAsync(int facilityId, int unitTypeId, DateTime startDate, int months, CancellationToken cancellationToken)
    {
        if (months is not (1 or 3 or 6 or 12) || startDate.Date < DateTime.Today)
            return new CatalogServiceResponse(false, "Ngày bắt đầu hoặc thời hạn thuê không hợp lệ (chỉ hỗ trợ 1, 3, 6 hoặc 12 tháng).", 400, null);

        var now = DateTime.UtcNow;
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);
        
        var start = startDate.Date;
        var end = start.AddMonths(months).AddDays(-1);
        
        var isFacilityActive = await _catalogRepository.IsFacilityActiveAsync(facilityId, cancellationToken);
        if (!isFacilityActive)
        {
            return new CatalogServiceResponse(true, null, 200, new 
            { 
                facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = 2m, depositMonths = 2, units = Array.Empty<object>() 
            });
        }

        var depositMonths = await _catalogRepository.GetFacilityDepositPercentAsync(facilityId, cancellationToken);
        var discountPercent = months switch { 6 => 5m, 12 => 10m, _ => 0m };
        var unitsData = await _catalogRepository.GetAvailableUnitsAsync(facilityId, unitTypeId, start, end, now, cancellationToken);

        var units = unitsData.Select(u =>
        {
            var effectiveMonthlyPrice = decimal.Round(u.BasePrice * (100m - discountPercent) / 100m, 0, MidpointRounding.AwayFromZero);
            var rentalAmount = effectiveMonthlyPrice * months;
            var depositAmount = effectiveMonthlyPrice * depositMonths;
            return new
            {
                unitId = u.UnitId,
                unitNumber = u.UnitNumber,
                unitType = u.TypeName,
                size = u.Dimensions,
                monthlyPrice = effectiveMonthlyPrice,
                rentalAmount,
                depositAmount,
                totalAmount = rentalAmount + depositAmount
            };
        });

        return new CatalogServiceResponse(true, null, 200, new 
        { 
            facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = depositMonths, depositMonths = (int)depositMonths, units 
        });
    }
}
