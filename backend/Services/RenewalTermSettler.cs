using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/// <summary>
/// CHỐT KỲ THUÊ CŨ SAU GIA HẠN (mục 4.2).
/// Khi khách gia hạn, kỳ mới (phụ lục) nối tiếp kỳ cũ; kỳ cũ vẫn "Đã bàn giao" tới hết ngày kết thúc.
/// Sau ngày đó: đơn cũ -> Completed, hợp đồng cũ -> "Renewed", quyền truy cập chuyển sang kỳ mới.
///
/// Trước đây chỉ chạy khi khách mở trang gia hạn, nên khách không quay lại thì một kho nằm trong 2 hợp đồng đang hiệu lực.
/// Giờ dùng chung cho:
///   - ContractRenewalsController (customerId = khách đang đăng nhập, như cũ),
///   - RenewalSettleJob (customerId = null: mọi khách, chạy hằng ngày).
/// Mỗi kỳ cũ chốt trong 1 transaction riêng. Trả về số kỳ đã chốt.
/// </summary>
public static class RenewalTermSettler
{
    public static async Task<int> SettleAsync(SelfStorageDbContext context, int? customerId, DateTime today, CancellationToken ct)
    {

        var renewals = await context.Contracts
            .Include(c => c.Reservation).ThenInclude(r => r.ReservationUnits)
            .Include(c => c.RenewedFromContract!).ThenInclude(o => o.Reservation).ThenInclude(r => r.ReservationUnits).ThenInclude(ru => ru.UnitAccesses)
            .Where(c => c.RenewedFromContractID != null &&
                        (customerId == null || c.Reservation.CustomerID == customerId) &&
                        c.Reservation.Status == ReservationStatus.HandedOver &&
                        c.RenewedFromContract!.Reservation.Status == ReservationStatus.HandedOver &&
                        c.RenewedFromContract!.Reservation.EndDate < today)
            .ToListAsync(ct);

        foreach (var renewal in renewals)
        {
            var oldContract = renewal.RenewedFromContract!;
            var old = oldContract.Reservation;
            var now = DateTime.UtcNow;
            await using var transaction = await context.Database.BeginTransactionAsync(ct);

            // Thu quyền truy cập cũ trước (mỗi kho chỉ 1 quyền Active / loại) rồi cấp lại cho kỳ mới.
            var transfers = new List<UnitAccess>();
            foreach (var oldUnit in old.ReservationUnits.Where(ru => ru.Status == "Active"))
            {
                var newUnit = renewal.Reservation.ReservationUnits.FirstOrDefault(ru => ru.UnitID == oldUnit.UnitID && ru.Status == "Active");
                foreach (var access in oldUnit.UnitAccesses.Where(a => a.Status == "Active"))
                {
                    access.Status = "Returned";
                    access.ClosedAt = now;
                    if (newUnit != null)
                    {
                        transfers.Add(new UnitAccess
                        {
                            ReservationUnitID = newUnit.ReservationUnitID,
                            ReservationID = renewal.ReservationID,
                            UnitID = newUnit.UnitID,
                            UserID = renewal.Reservation.CustomerID,
                            AccessType = access.AccessType,
                            AccessValue = access.AccessValue,
                            IssuedAt = now,
                            IssuedByUserID = access.IssuedByUserID,
                            Status = "Active"
                        });
                    }
                }
                oldUnit.Status = "Returned";
                oldUnit.ReturnedOn = old.EndDate.Date;
            }
            await context.SaveChangesAsync(ct);

            if (transfers.Count > 0)
            {
                context.UnitAccesses.AddRange(transfers);
                await context.SaveChangesAsync(ct);
            }

            old.Status = ReservationStatus.Completed;
            old.CompletedAt = now;
            oldContract.ContractStatus = "Renewed";
            oldContract.ActualEndDate = old.EndDate.Date;
            await context.SaveChangesAsync(ct);

            await transaction.CommitAsync(ct);
        }

        return renewals.Count;
    }
}
