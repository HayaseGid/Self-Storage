using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Services;

/*
 * HOÀN TẤT GIA HẠN HỢP ĐỒNG (file THÊM MỚI, lớp static, không cần đăng ký trong Program.cs).
 * Dùng chung cho ContractRenewalsController (thanh toán mô phỏng), VnPayController (VNPay trả về / IPN)
 * và ReservationConfirmationsController (tự thử lại).
 *
 * Đơn gia hạn = Reservation có mã "GH-yyyy-xxxxx", bắt đầu ngay ngày sau ngày hết hạn của đơn cũ, cùng các kho.
 * Lúc tạo (chờ thanh toán) đơn gia hạn có:
 *   - Deposit  (mỗi kho 1 dòng): phần cọc CHUYỂN TỪ kỳ cũ (mô tả có TransferMarker) -> không thu tiền khách;
 *              kho không còn cọc cũ thì dòng cọc phải thu (không có marker).
 *   - Renewal  : tiền cọc bổ sung khi giá thuê tăng (cọc mới > cọc cũ).
 *   - Rent     : tiền thuê từng tháng; THÁNG ĐẦU thu ngay khi gia hạn, các tháng sau trả hằng tháng.
 * Khách thanh toán (VNPay / mô phỏng) = tiền thuê tháng đầu + cọc bổ sung (+ cọc của kho không còn cọc cũ).
 * Sau khi thanh toán: chuyển cọc (Payment nội bộ) -> hoàn cọc kỳ cũ -> Paid -> Confirmed -> hợp đồng
 * (phụ lục gia hạn, RenewedFromContractID) -> kho Active -> Handed Over (khách đang giữ kho, không bàn giao lại).
 * Khách ký phụ lục gia hạn online ngay sau đó.
 */
public static class ContractRenewalFinalizer
{
    public const string CodePrefix = "GH-";
    public const string TransferMarker = "chuyển từ kỳ trước";
    public const string TransferProvider = "DepositTransfer";

    public static bool IsRenewal(Reservation reservation) =>
        reservation.ReservationCode?.StartsWith(CodePrefix, StringComparison.OrdinalIgnoreCase) == true;

    /* Khoản khách phải trả ngay khi gia hạn. */
    public static bool IsPayableNow(Charge charge, Reservation reservation) =>
        charge.Status == "Unpaid" && (
            charge.ChargeType == "Renewal" ||
            (charge.ChargeType == "Rent" && charge.PeriodStart?.Date == reservation.StartDate.Date) ||
            (charge.ChargeType == "Deposit" && !(charge.Description ?? "").Contains(TransferMarker, StringComparison.OrdinalIgnoreCase)));

    /* Đơn cũ (đang thuê) mà đơn gia hạn nối tiếp. */
    public static async Task<Reservation?> FindPreviousAsync(SelfStorageDbContext context, Reservation renewal, CancellationToken ct)
    {
        var unitIds = renewal.ReservationUnits.Where(ru => ru.Status != "Released").Select(ru => ru.UnitID).ToList();
        var previousEnd = renewal.StartDate.Date.AddDays(-1);
        var candidates = await context.Reservations
            .Include(r => r.Contract)
            .Include(r => r.Charges)
            .Include(r => r.ReservationUnits)
            .AsSplitQuery()
            .Where(r => r.CustomerID == renewal.CustomerID &&
                        r.FacilityID == renewal.FacilityID &&
                        r.ReservationID != renewal.ReservationID &&
                        r.EndDate == previousEnd &&
                        r.Contract != null &&
                        (r.Status == ReservationStatus.HandedOver || r.Status == ReservationStatus.Completed))
            .ToListAsync(ct);
        return candidates.FirstOrDefault(r => unitIds.All(id => r.ReservationUnits.Any(ru => ru.UnitID == id)));
    }

    /*
     * Hoàn tất đơn gia hạn đã được thanh toán. Gọi nhiều lần không sao (đã xong thì trả về hợp đồng).
     * Trả về null nếu khách chưa trả đủ các khoản phải trả ngay.
     */
    public static async Task<Contract?> FinalizeAsync(SelfStorageDbContext context, int reservationId, int? actorUserId, CancellationToken ct)
    {
        context.ChangeTracker.Clear();
        await using var transaction = await context.Database.BeginTransactionAsync(ct);

        var renewal = await context.Reservations
            .Include(r => r.Charges)
            .Include(r => r.ReservationUnits)
            .Include(r => r.ReservationItems)
            .Include(r => r.Contract)
            .AsSplitQuery()
            .FirstOrDefaultAsync(r => r.ReservationID == reservationId, ct);
        if (renewal is null || !IsRenewal(renewal))
            return null;
        if (renewal.Contract is not null && renewal.Status == ReservationStatus.HandedOver)
            return renewal.Contract;
        if (renewal.Status is not (ReservationStatus.PendingPayment or ReservationStatus.Paid or ReservationStatus.Confirmed))
            throw new InvalidOperationException($"RENEWAL_STATE: Đơn gia hạn {renewal.ReservationCode} đang ở trạng thái {renewal.Status}.");
        if (renewal.Charges.Any(c => IsPayableNow(c, renewal)))
            return null; // chưa thanh toán xong

        var previous = await FindPreviousAsync(context, renewal, ct)
            ?? throw new InvalidOperationException("RENEWAL_PREVIOUS: Không tìm thấy hợp đồng cũ của đơn gia hạn.");
        var now = DateTime.UtcNow;
        var activeUnits = renewal.ReservationUnits.Where(ru => ru.Status != "Released").ToList();
        var unitIds = activeUnits.Select(ru => ru.UnitID).ToHashSet();

        // 1) Chuyển cọc kỳ cũ sang kỳ mới (giao dịch nội bộ, không thu tiền khách).
        var transferCharges = renewal.Charges
            .Where(c => c.ChargeType == "Deposit" && c.Status == "Unpaid" &&
                        (c.Description ?? "").Contains(TransferMarker, StringComparison.OrdinalIgnoreCase))
            .ToList();
        if (transferCharges.Count > 0)
        {
            var transfer = new Payment
            {
                ReservationID = renewal.ReservationID,
                OrderCode = $"DT-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}",
                IdempotencyKey = $"RENEW-TRANSFER-{renewal.ReservationID}-{Guid.NewGuid():N}",
                Provider = TransferProvider,
                Direction = "Collection",
                Amount = transferCharges.Sum(c => c.Amount),
                PaymentMethod = $"Chuyển cọc từ HĐ {previous.Contract!.ContractNumber}",
                Status = "Pending",
                CreatedAt = now,
                CreatedByUserID = actorUserId
            };
            context.Payments.Add(transfer);
            await context.SaveChangesAsync(ct);

            foreach (var charge in transferCharges) charge.PaymentID = transfer.PaymentID;
            await context.SaveChangesAsync(ct);

            transfer.Status = "Completed";
            transfer.ProviderTransactionId = $"DT-{renewal.ReservationID}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            transfer.ReceivedAmount = transfer.Amount;
            transfer.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);

            foreach (var charge in transferCharges) { charge.Status = "Paid"; charge.PaidAt = now; }
            await context.SaveChangesAsync(ct);
        }

        // 2) Hoàn cọc kỳ cũ (phần trùng đã chuyển sang kỳ mới, phần dư nếu giá giảm được trả lại khách).
        var oldDeposits = previous.Charges
            .Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0 &&
                        previous.ReservationUnits.Any(ru => ru.ReservationUnitID == c.ReservationUnitID && unitIds.Contains(ru.UnitID)))
            .ToList();
        if (oldDeposits.Count > 0)
        {
            var refund = new Payment
            {
                ReservationID = previous.ReservationID,
                OrderCode = $"RFD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                IdempotencyKey = $"RENEW-REFUND-{previous.ReservationID}-{Guid.NewGuid():N}",
                Provider = TransferProvider,
                Direction = "Refund",
                RefundReason = "DepositReturn",
                Amount = oldDeposits.Sum(c => c.Amount),
                PaymentMethod = $"Chuyển cọc sang HĐ gia hạn {renewal.ReservationCode}",
                Status = "Pending",
                CreatedAt = now,
                CreatedByUserID = actorUserId
            };
            context.Payments.Add(refund);
            await context.SaveChangesAsync(ct);

            foreach (var charge in oldDeposits) { charge.RefundedAmount = charge.Amount; charge.RefundPaymentID = refund.PaymentID; }
            await context.SaveChangesAsync(ct);

            refund.Status = "Completed";
            refund.ProviderTransactionId = $"RFD-{previous.ReservationID}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            refund.ReceivedAmount = refund.Amount;
            refund.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);
        }

        // 3) Paid -> Confirmed -> hợp đồng (phụ lục gia hạn) -> kho Active -> Handed Over.
        if (renewal.Status == ReservationStatus.PendingPayment)
        {
            renewal.Status = ReservationStatus.Paid;
            renewal.PaidAt = now;
            await context.SaveChangesAsync(ct);
        }
        if (renewal.Status == ReservationStatus.Paid)
        {
            renewal.Status = ReservationStatus.Confirmed;
            renewal.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);
        }

        var contract = renewal.Contract;
        if (contract is null)
        {
            contract = new Contract
            {
                ContractNumber = $"HD-{now:yyyy}-{renewal.ReservationID:D5}",
                ReservationID = renewal.ReservationID,
                StartDate = renewal.StartDate,
                EndDate = renewal.EndDate,
                ContractStatus = "Active",
                RenewedFromContractID = previous.Contract!.ContractID,
                CreatedAt = now,
                CreatedByUserID = actorUserId
            };
            context.Contracts.Add(contract);
            await context.SaveChangesAsync(ct);
        }

        foreach (var ru in activeUnits.Where(ru => ru.Status == "Held")) { ru.Status = "Active"; ru.HandedOverAt = now; }
        await context.SaveChangesAsync(ct);

        renewal.Status = ReservationStatus.HandedOver;
        await context.SaveChangesAsync(ct);

        await transaction.CommitAsync(ct);
        return contract;
    }
}
