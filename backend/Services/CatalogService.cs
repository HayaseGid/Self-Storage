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
            depositPercent = f.DepositPercent
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
        if (months is < 1 or > 12 || startDate.Date < DateTime.Today)
            return new CatalogServiceResponse(false, "Ngày bắt đầu hoặc thời gian thuê không hợp lệ.", 400, null);

        var now = DateTime.UtcNow;
        await _reservationHoldService.ReleaseExpiredAsync(now, cancellationToken);
        
        var start = startDate.Date;
        var end = start.AddMonths(months).AddDays(-1);
        
        var isFacilityActive = await _catalogRepository.IsFacilityActiveAsync(facilityId, cancellationToken);
        if (!isFacilityActive)
        {
            return new CatalogServiceResponse(true, null, 200, new 
            { 
                facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = 20m, units = Array.Empty<object>() 
            });
        }

        var policy = await _catalogRepository.GetFacilityDepositPercentAsync(facilityId, cancellationToken);
        var unitsData = await _catalogRepository.GetAvailableUnitsAsync(facilityId, unitTypeId, start, end, now, cancellationToken);

        var units = unitsData.Select(u => new
        {
            unitId = u.UnitId,
            unitNumber = u.UnitNumber,
            unitType = u.TypeName,
            size = u.Dimensions,
            monthlyPrice = u.BasePrice,
            rentalAmount = decimal.Round(u.BasePrice * months, 2),
            depositAmount = decimal.Round(u.BasePrice * months * policy / 100m, 2),
            totalAmount = decimal.Round(u.BasePrice * months * (1m + policy / 100m), 2)
        });

        return new CatalogServiceResponse(true, null, 200, new 
        { 
            facilityId, unitTypeId, startDate = start, endDate = end, months, depositPercent = policy, units 
        });
    }
}