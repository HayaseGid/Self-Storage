using System.Data;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SelfStorageAPI.Constants;
using SelfStorageAPI.Data;
using SelfStorageAPI.Interfaces;
using SelfStorageAPI.Models;

namespace SelfStorageAPI.Controllers;

/*
 * GIA HẠN HỢP ĐỒNG CỦA KHÁCH HÀNG (file THÊM MỚI, không sửa code cũ, không cần sửa Program.cs).
 *
 *   GET  /api/contract-renewals/mine   -> các hợp đồng của khách + điều kiện & báo giá gia hạn
 *   POST /api/contract-renewals        -> { reservationId, months, expectedAmount } gia hạn + thanh toán (mô phỏng)
 *
 * Cách làm (đúng ràng buộc của SelfStorageDB_test.sql):
 *   - Mỗi Reservation chỉ có 1 Contract và ngày của Contract phải trùng Reservation, nên gia hạn = tạo
 *     Reservation MỚI cho đúng các kho đang thuê, bắt đầu từ ngày hôm sau ngày hết hạn cũ,
 *     cùng Contract MỚI có RenewedFromContractID = hợp đồng cũ.
 *   - Giá gia hạn: bảng giá (RentalRate) hiện hành + % giảm của gói (ContractType), giống lúc đặt mới.
 *   - Tiền cọc được chuyển sang kỳ mới: thu cọc kỳ mới và hoàn cọc kỳ cũ trong cùng giao dịch,
 *     khách chỉ trả (hoặc được hoàn) phần chênh lệch.
 *   - Khách đang giữ kho nên đơn gia hạn được xác nhận + bàn giao ngay (không cần Staff bàn giao lại).
 *   - Khi kỳ cũ kết thúc: kỳ cũ được đóng (Completed), hợp đồng cũ chuyển "Renewed",
 *     quyền truy cập kho (mã/thẻ) được chuyển sang kỳ mới. Việc này chạy mỗi khi gọi API này.
 *   - Điều kiện lấy từ chính sách "renewal_return" (BOM chỉnh): renewalNoticeDays, min/maxRenewalMonths, requireNoOverdue.
 */
[ApiController]
[Route("api/contract-renewals")]
public sealed class ContractRenewalsController(
    SelfStorageDbContext context,
    IFacilityManagementService facilityManagementService,
    ILogger<ContractRenewalsController> logger) : ControllerBase
{
    private static readonly int[] AllowedMonths = [1, 3, 6, 12];
    // Tạm bỏ giảm giá theo gói (yêu cầu 29/10/2026). Làm lại giảm giá thì đổi thành true.
    private const bool ApplyContractDiscount = false;
    private static readonly string[] RenewableContractStatuses = ["Active", "Expiring Soon"];

    public sealed record RenewContractRequest(int ReservationId, int Months, decimal? ExpectedAmount);

    private sealed record RenewalRules(int NoticeDays, int MinMonths, int MaxMonths, bool RequireNoOverdue);

    private sealed record UnitQuote(
        int UnitId, string UnitNumber, int UnitTypeId, int UnitSizeId, string? TypeName, string? SizeLabel,
        decimal ListPrice, decimal MonthlyPrice, decimal OldDeposit);

    private sealed record PlanQuote(
        int Months, decimal DiscountPercent, DateTime StartDate, DateTime EndDate,
        decimal MonthlyBase, decimal Monthly, decimal Rent, decimal NewDeposit, decimal OldDeposit,
        decimal AmountDue, decimal RefundAmount, List<UnitQuote> Units);

    // ------------------------------------------------------------------ GET

    [HttpGet("mine")]
    public async Task<IActionResult> GetMine(CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        await TrySettleEndedTermsAsync(customerId.Value, cancellationToken);

        var rules = await ReadRulesAsync(cancellationToken);
        var plans = await GetPlansAsync(rules, cancellationToken);
        var reservations = await LoadCustomerReservationsAsync(customerId.Value, null, cancellationToken);

        var contractIds = reservations.Where(r => r.Contract != null).Select(r => r.Contract!.ContractID).ToList();
        var renewals = await context.Contracts.AsNoTracking()
            .Include(c => c.Reservation)
            .Where(c => c.RenewedFromContractID != null && contractIds.Contains(c.RenewedFromContractID.Value))
            .ToListAsync(cancellationToken);
        var parentIds = reservations
            .Where(r => r.Contract?.RenewedFromContractID != null)
            .Select(r => r.Contract!.RenewedFromContractID!.Value)
            .ToList();
        var parents = await context.Contracts.AsNoTracking()
            .Include(c => c.Reservation)
            .Where(c => parentIds.Contains(c.ContractID))
            .ToListAsync(cancellationToken);

        var today = Today();
        var items = reservations.Where(r => r.Contract != null).Select(r =>
        {
            var contract = r.Contract!;
            var renewedBy = renewals.FirstOrDefault(c => c.RenewedFromContractID == contract.ContractID
                                                        && c.Reservation.Status != ReservationStatus.Cancelled);
            var renewedFrom = contract.RenewedFromContractID is null
                ? null
                : parents.FirstOrDefault(c => c.ContractID == contract.RenewedFromContractID);
            var (eligible, reason) = CheckEligibility(r, renewedBy != null, rules, today);
            var deadline = r.EndDate.Date.AddDays(-rules.NoticeDays);

            return new
            {
                reservationId = r.ReservationID,
                reservationCode = r.ReservationCode,
                contractId = contract.ContractID,
                contractNumber = contract.ContractNumber,
                contractStatus = contract.ContractStatus,
                facilityId = r.FacilityID,
                facility = r.Facility.FacilityName,
                startDate = r.StartDate.Date,
                endDate = r.EndDate.Date,
                months = r.RentalPeriod,
                daysLeft = (r.EndDate.Date - today).Days,
                renewDeadline = deadline,
                eligible,
                reason,
                renewedBy = renewedBy == null ? null : new
                {
                    reservationId = renewedBy.ReservationID,
                    reservationCode = renewedBy.Reservation.ReservationCode,
                    contractId = renewedBy.ContractID,
                    contractNumber = renewedBy.ContractNumber,
                    startDate = renewedBy.StartDate.Date,
                    endDate = renewedBy.EndDate.Date,
                    months = renewedBy.Reservation.RentalPeriod
                },
                renewedFrom = renewedFrom == null ? null : new
                {
                    reservationId = renewedFrom.ReservationID,
                    reservationCode = renewedFrom.Reservation.ReservationCode,
                    contractId = renewedFrom.ContractID,
                    contractNumber = renewedFrom.ContractNumber,
                    startDate = renewedFrom.StartDate.Date,
                    endDate = renewedFrom.EndDate.Date
                },
                quotes = eligible ? plans.Select(p => ToQuoteDto(BuildQuote(r, p.Months, p.DiscountRate))).ToList() : []
            };
        }).ToList();

        return Ok(new
        {
            rules = new
            {
                renewalNoticeDays = rules.NoticeDays,
                minRenewalMonths = rules.MinMonths,
                maxRenewalMonths = rules.MaxMonths,
                requireNoOverdue = rules.RequireNoOverdue
            },
            plans = plans.Select(p => new { months = p.Months, discountPercent = p.DiscountRate }),
            items
        });
    }

    // ------------------------------------------------------------------ POST

    [HttpPost]
    public async Task<IActionResult> Renew([FromBody] RenewContractRequest request, CancellationToken cancellationToken)
    {
        var customerId = await GetCustomerIdAsync(cancellationToken);
        if (customerId is null)
            return Unauthorized(new { message = "Vui lòng đăng nhập bằng tài khoản khách hàng." });

        if (!AllowedMonths.Contains(request.Months))
            return BadRequest(new { message = "Kỳ gia hạn chỉ được chọn 1, 3, 6 hoặc 12 tháng." });

        await TrySettleEndedTermsAsync(customerId.Value, cancellationToken);

        var rules = await ReadRulesAsync(cancellationToken);
        var plans = await GetPlansAsync(rules, cancellationToken);
        var plan = plans.FirstOrDefault(p => p.Months == request.Months);
        if (plan is null)
            return BadRequest(new { message = $"Theo chính sách hiện hành, kỳ gia hạn phải từ {rules.MinMonths} đến {rules.MaxMonths} tháng." });

        try
        {
            await using var transaction = await context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);

            var old = (await LoadCustomerReservationsAsync(customerId.Value, request.ReservationId, cancellationToken)).FirstOrDefault();
            if (old?.Contract is null)
                return NotFound(new { message = "Không tìm thấy hợp đồng thuộc tài khoản này." });

            var alreadyRenewed = await context.Contracts.AnyAsync(c =>
                c.RenewedFromContractID == old.Contract.ContractID &&
                c.Reservation.Status != ReservationStatus.Cancelled, cancellationToken);

            var (eligible, reason) = CheckEligibility(old, alreadyRenewed, rules, Today());
            if (!eligible)
                return Conflict(new { message = reason });

            var quote = BuildQuote(old, plan.Months, plan.DiscountRate);
            if (quote.Units.Count == 0)
                return Conflict(new { message = "Hợp đồng không còn kho đang thuê để gia hạn." });
            if (quote.Units.Any(u => u.ListPrice <= 0))
                return Conflict(new { message = "Có kho chưa được cấu hình giá thuê hiện hành, vui lòng liên hệ cơ sở." });

            if (request.ExpectedAmount is not null && request.ExpectedAmount.Value != quote.AmountDue)
                return Conflict(new
                {
                    message = "Giá gia hạn vừa thay đổi theo bảng giá mới. Vui lòng xem lại số tiền và xác nhận lại.",
                    quote = ToQuoteDto(quote)
                });

            var now = DateTime.UtcNow;
            var renewal = await CreateRenewalAsync(old, quote, customerId.Value, now, cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return StatusCode(201, new
            {
                message = $"Đã gia hạn hợp đồng {old.Contract.ContractNumber} thêm {quote.Months} tháng.",
                reservationId = renewal.Reservation.ReservationID,
                reservationCode = renewal.Reservation.ReservationCode,
                contractId = renewal.Contract.ContractID,
                contractNumber = renewal.Contract.ContractNumber,
                renewedFromContractNumber = old.Contract.ContractNumber,
                startDate = quote.StartDate,
                endDate = quote.EndDate,
                months = quote.Months,
                paymentReference = renewal.PaymentReference,
                quote = ToQuoteDto(quote)
            });
        }
        catch (DbUpdateException exception)
        {
            var text = exception.InnerException?.Message ?? exception.Message;
            logger.LogWarning(exception, "Gia hạn hợp đồng thất bại (reservation {ReservationId})", request.ReservationId);
            if (text.Contains("RESERVATION_OVERLAP", StringComparison.OrdinalIgnoreCase))
                return Conflict(new { message = "Kho đã có người đặt cho thời gian sau hợp đồng hiện tại nên không thể gia hạn. Vui lòng liên hệ cơ sở." });
            var colon = text.IndexOf(':');
            return Conflict(new { message = colon > 0 && colon < 60 ? text[(colon + 1)..].Trim() : "Không thể gia hạn hợp đồng lúc này. Vui lòng thử lại." });
        }
    }

    // ------------------------------------------------------------------ Tạo đơn gia hạn

    private sealed record RenewalResult(Reservation Reservation, Contract Contract, string PaymentReference);

    private async Task<RenewalResult> CreateRenewalAsync(Reservation old, PlanQuote quote, int customerId, DateTime now, CancellationToken ct)
    {
        // 1) Đơn mới (chờ thanh toán) + dòng yêu cầu + kho + các khoản phí, giống ReservationService.
        var reservation = new Reservation
        {
            ReservationCode = await NewReservationCodeAsync(now, ct),
            CheckInToken = Guid.NewGuid(),
            CustomerID = customerId,
            FacilityID = old.FacilityID,
            StartDate = quote.StartDate,
            RentalPeriod = quote.Months,
            EndDate = quote.EndDate,
            DepositMonths = old.DepositMonths,
            HoldExpiresAt = now.AddMinutes(15),
            AppointmentDate = quote.StartDate,
            AppointmentTime = new TimeSpan(9, 0, 0),
            Status = ReservationStatus.PendingPayment,
            CreatedAt = now
        };

        var depositCharges = new List<Charge>();
        var newUnits = new List<ReservationUnit>();
        foreach (var group in quote.Units.GroupBy(u => new { u.UnitTypeId, u.UnitSizeId }))
        {
            var item = new ReservationItem
            {
                Reservation = reservation,
                FacilityID = old.FacilityID,
                UnitTypeID = group.Key.UnitTypeId,
                UnitSizeID = group.Key.UnitSizeId,
                Quantity = (byte)group.Count(),
                MonthlyPrice = group.First().ListPrice,
                DiscountPercent = quote.DiscountPercent,
                CreatedAt = now
            };
            reservation.ReservationItems.Add(item);

            foreach (var unit in group)
            {
                var ru = new ReservationUnit
                {
                    Reservation = reservation,
                    ReservationItem = item,
                    FacilityID = old.FacilityID,
                    UnitID = unit.UnitId,
                    UnitTypeID = unit.UnitTypeId,
                    UnitSizeID = unit.UnitSizeId,
                    Status = "Held",
                    AssignedAt = now
                };
                item.ReservationUnits.Add(ru);
                reservation.ReservationUnits.Add(ru);
                newUnits.Add(ru);

                var deposit = new Charge
                {
                    Reservation = reservation,
                    ReservationUnit = ru,
                    ChargeType = "Deposit",
                    Description = $"Tiền cọc {old.DepositMonths} tháng (gia hạn) - kho {unit.UnitNumber}",
                    Amount = unit.MonthlyPrice * old.DepositMonths,
                    DueDate = now.Date,
                    Status = "Unpaid",
                    CreatedAt = now,
                    CreatedByUserID = customerId
                };
                reservation.Charges.Add(deposit);
                depositCharges.Add(deposit);

                for (var m = 0; m < quote.Months; m++)
                {
                    var periodStart = quote.StartDate.AddMonths(m);
                    reservation.Charges.Add(new Charge
                    {
                        Reservation = reservation,
                        ReservationUnit = ru,
                        ChargeType = "Rent",
                        Description = $"Tiền thuê tháng {m + 1} (gia hạn) - kho {unit.UnitNumber}",
                        PeriodStart = periodStart,
                        PeriodEnd = quote.StartDate.AddMonths(m + 1).AddDays(-1),
                        Amount = unit.MonthlyPrice,
                        DueDate = periodStart,
                        Status = "Unpaid",
                        CreatedAt = now,
                        CreatedByUserID = customerId
                    });
                }
            }
        }

        context.Reservations.Add(reservation);
        await context.SaveChangesAsync(ct);

        // 2) Thu cọc kỳ mới (cổng thanh toán mô phỏng, đúng thứ tự trigger: Pending -> gán khoản -> Completed).
        var providerTxn = $"SIM-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
        var collection = new Payment
        {
            ReservationID = reservation.ReservationID,
            OrderCode = $"ORD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
            IdempotencyKey = $"RENEW-{reservation.ReservationID}-{Guid.NewGuid():N}",
            Provider = "Simulator",
            Direction = "Collection",
            Amount = depositCharges.Sum(c => c.Amount),
            PaymentMethod = "QR",
            Status = "Pending",
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(15),
            CreatedByUserID = customerId
        };
        context.Payments.Add(collection);
        await context.SaveChangesAsync(ct);

        foreach (var charge in depositCharges) charge.PaymentID = collection.PaymentID;
        await context.SaveChangesAsync(ct);

        collection.Status = "Completed";
        collection.ProviderTransactionId = providerTxn;
        collection.ReceivedAmount = collection.Amount;
        collection.ConfirmedAt = now;
        await context.SaveChangesAsync(ct);

        foreach (var charge in depositCharges) { charge.Status = "Paid"; charge.PaidAt = now; }
        await context.SaveChangesAsync(ct);

        // 3) Đơn: Paid -> Confirmed (đã đủ kho) -> tạo hợp đồng mới -> bàn giao ngay (khách đang giữ kho).
        reservation.Status = ReservationStatus.Paid;
        reservation.PaidAt = now;
        await context.SaveChangesAsync(ct);

        reservation.Status = ReservationStatus.Confirmed;
        reservation.ConfirmedAt = now;
        await context.SaveChangesAsync(ct);

        var contract = new Contract
        {
            ContractNumber = $"HD-{now:yyyy}-{reservation.ReservationID:D5}",
            ReservationID = reservation.ReservationID,
            StartDate = reservation.StartDate,
            EndDate = reservation.EndDate,
            ContractStatus = "Active",
            RenewedFromContractID = old.Contract!.ContractID,
            CreatedAt = now,
            CreatedByUserID = customerId
        };
        context.Contracts.Add(contract);
        await context.SaveChangesAsync(ct);

        foreach (var ru in newUnits) { ru.Status = "Active"; ru.HandedOverAt = now; }
        await context.SaveChangesAsync(ct);

        reservation.Status = ReservationStatus.HandedOver;
        await context.SaveChangesAsync(ct);

        // 4) Hoàn cọc kỳ cũ (cọc được chuyển sang kỳ mới).
        var oldDeposits = old.Charges
            .Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0 &&
                        quote.Units.Any(u => old.ReservationUnits.Any(ru => ru.ReservationUnitID == c.ReservationUnitID && ru.UnitID == u.UnitId)))
            .ToList();
        var refundTotal = oldDeposits.Sum(c => c.Amount);
        if (refundTotal > 0)
        {
            var refund = new Payment
            {
                ReservationID = old.ReservationID,
                OrderCode = $"RFD-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}",
                IdempotencyKey = $"RENEW-REFUND-{old.ReservationID}-{Guid.NewGuid():N}",
                Provider = "Simulator",
                Direction = "Refund",
                RefundReason = "DepositReturn",
                Amount = refundTotal,
                PaymentMethod = "Transfer to renewal",
                Status = "Pending",
                CreatedAt = now,
                CreatedByUserID = customerId
            };
            context.Payments.Add(refund);
            await context.SaveChangesAsync(ct);

            foreach (var charge in oldDeposits) { charge.RefundedAmount = charge.Amount; charge.RefundPaymentID = refund.PaymentID; }
            await context.SaveChangesAsync(ct);

            refund.Status = "Completed";
            refund.ProviderTransactionId = $"SIM-RFD-{now:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
            refund.ReceivedAmount = refund.Amount;
            refund.ConfirmedAt = now;
            await context.SaveChangesAsync(ct);
        }

        return new RenewalResult(reservation, contract, providerTxn);
    }

    // ------------------------------------------------------------------ Đóng kỳ cũ khi đã qua ngày hết hạn

    private async Task TrySettleEndedTermsAsync(int customerId, CancellationToken ct)
    {
        try
        {
            await SettleEndedTermsAsync(customerId, ct);
        }
        catch (Exception exception)
        {
            // Không chặn việc xem / gia hạn nếu bước dọn dẹp lỗi; lần gọi sau sẽ thử lại.
            logger.LogWarning(exception, "Không đóng được kỳ thuê cũ đã gia hạn của khách {CustomerId}", customerId);
            context.ChangeTracker.Clear();
        }
    }

    private async Task SettleEndedTermsAsync(int customerId, CancellationToken ct)
    {
        var today = Today();
        var renewals = await context.Contracts
            .Include(c => c.Reservation).ThenInclude(r => r.ReservationUnits)
            .Include(c => c.RenewedFromContract!).ThenInclude(o => o.Reservation).ThenInclude(r => r.ReservationUnits).ThenInclude(ru => ru.UnitAccesses)
            .Where(c => c.RenewedFromContractID != null &&
                        c.Reservation.CustomerID == customerId &&
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
    }

    // ------------------------------------------------------------------ Helpers

    private (bool Eligible, string? Reason) CheckEligibility(Reservation r, bool alreadyRenewed, RenewalRules rules, DateTime today)
    {
        var contract = r.Contract!;
        if (alreadyRenewed)
            return (false, "Hợp đồng này đã được gia hạn.");
        if (r.Status != ReservationStatus.HandedOver)
            return (false, r.Status == ReservationStatus.Completed ? "Hợp đồng đã kết thúc." : "Chỉ gia hạn được hợp đồng đang thuê (đã nhận kho).");
        if (!RenewableContractStatuses.Contains(contract.ContractStatus))
            return (false, $"Hợp đồng đang ở trạng thái \"{contract.ContractStatus}\" nên không thể gia hạn.");
        if (r.EndDate.Date < today)
            return (false, "Hợp đồng đã quá hạn. Vui lòng liên hệ cơ sở để xử lý trước khi gia hạn.");
        var deadline = r.EndDate.Date.AddDays(-rules.NoticeDays);
        if (today > deadline)
            return (false, $"Theo chính sách, cần gia hạn trước ngày hết hạn ít nhất {rules.NoticeDays} ngày (hạn chót {deadline:dd/MM/yyyy}). Vui lòng liên hệ cơ sở.");
        if (rules.RequireNoOverdue && r.Charges.Any(c =>
                (c.ChargeType == "LateFee" || c.ChargeType == "ExtraFee") &&
                c.Status == "Unpaid" && c.DueDate.Date < today))
            return (false, "Bạn còn khoản phí quá hạn chưa thanh toán. Vui lòng thanh toán trước khi gia hạn.");
        if (!r.ReservationUnits.Any(ru => ru.Status == "Active"))
            return (false, "Hợp đồng không còn kho đang thuê để gia hạn.");
        if (r.Facility.Status != "Active")
            return (false, "Cơ sở đang tạm ngừng hoạt động nên chưa nhận gia hạn.");
        return (true, null);
    }

    private static PlanQuote BuildQuote(Reservation r, int months, decimal discountRate)
    {
        var start = r.EndDate.Date.AddDays(1);
        var end = start.AddMonths(months).AddDays(-1);
        var units = r.ReservationUnits
            .Where(ru => ru.Status == "Active" && ru.Unit != null)
            .OrderBy(ru => ru.Unit.UnitNumber)
            .Select(ru =>
            {
                var listPrice = ru.Unit.RentalRate?.MonthlyPrice ?? 0m;
                var monthly = decimal.Round(listPrice * (100m - discountRate) / 100m, 0, MidpointRounding.AwayFromZero);
                var oldDeposit = r.Charges
                    .Where(c => c.ChargeType == "Deposit" && c.Status == "Paid" && c.RefundedAmount == 0 && c.ReservationUnitID == ru.ReservationUnitID)
                    .Sum(c => c.Amount);
                return new UnitQuote(
                    ru.UnitID, ru.Unit.UnitNumber, ru.Unit.UnitTypeID, ru.Unit.UnitSizeID,
                    ru.Unit.UnitType?.TypeName,
                    ru.Unit.UnitSize == null ? null : $"{ru.Unit.UnitSize.SizeCode}: {ru.Unit.UnitSize.DisplayName}",
                    listPrice, monthly, oldDeposit);
            })
            .ToList();

        var monthlyBase = units.Sum(u => u.ListPrice);
        var monthlyTotal = units.Sum(u => u.MonthlyPrice);
        var newDeposit = monthlyTotal * r.DepositMonths;
        var oldDepositTotal = units.Sum(u => u.OldDeposit);
        var difference = newDeposit - oldDepositTotal;
        return new PlanQuote(
            months, discountRate, start, end, monthlyBase, monthlyTotal, monthlyTotal * months,
            newDeposit, oldDepositTotal,
            AmountDue: Math.Max(0m, difference),
            RefundAmount: Math.Max(0m, -difference),
            units);
    }

    private static object ToQuoteDto(PlanQuote q) => new
    {
        months = q.Months,
        discountPercent = q.DiscountPercent,
        startDate = q.StartDate,
        endDate = q.EndDate,
        monthlyBase = q.MonthlyBase,
        monthly = q.Monthly,
        rent = q.Rent,
        newDeposit = q.NewDeposit,
        oldDeposit = q.OldDeposit,
        amountDue = q.AmountDue,
        refundAmount = q.RefundAmount,
        units = q.Units.Select(u => new
        {
            unitId = u.UnitId,
            unitNumber = u.UnitNumber,
            type = u.TypeName,
            size = u.SizeLabel,
            listPrice = u.ListPrice,
            monthlyPrice = u.MonthlyPrice
        })
    };

    private Task<List<Reservation>> LoadCustomerReservationsAsync(int customerId, int? reservationId, CancellationToken ct)
    {
        var query = context.Reservations
            .Include(r => r.Facility)
            .Include(r => r.Contract)
            .Include(r => r.Charges)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.RentalRate)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitType)
            .Include(r => r.ReservationUnits).ThenInclude(ru => ru.Unit).ThenInclude(u => u.UnitSize)
            .AsSplitQuery()
            .Where(r => r.CustomerID == customerId && r.Contract != null);
        if (reservationId is not null)
            query = query.Where(r => r.ReservationID == reservationId.Value);
        return query.OrderByDescending(r => r.EndDate).ToListAsync(ct);
    }

    private sealed record Plan(int Months, decimal DiscountRate);

    private async Task<List<Plan>> GetPlansAsync(RenewalRules rules, CancellationToken ct)
    {
        var types = await context.ContractTypes.AsNoTracking()
            .Where(t => t.IsActive)
            .Select(t => new { t.RentalMonths, t.DiscountRate })
            .ToListAsync(ct);
        return AllowedMonths
            .Where(m => m >= rules.MinMonths && m <= rules.MaxMonths)
            .Where(m => types.Count == 0 || types.Any(t => t.RentalMonths == m))
            .Select(m => new Plan(m, ApplyContractDiscount ? types.FirstOrDefault(t => t.RentalMonths == m)?.DiscountRate ?? 0m : 0m))
            .ToList();
    }

    private async Task<RenewalRules> ReadRulesAsync(CancellationToken ct)
    {
        var globalNotice = await context.RentalPolicies.AsNoTracking()
            .Where(p => p.FacilityID == null)
            .Select(p => (int?)p.RenewalNoticeDays)
            .FirstOrDefaultAsync(ct);
        var rules = new RenewalRules(globalNotice ?? 7, 1, 12, true);

        try
        {
            var result = await facilityManagementService.GetPolicyGroupsAsync(ct);
            if (!result.IsSuccess || result.Data is null) return rules;
            using var doc = JsonDocument.Parse(JsonSerializer.Serialize(result.Data));
            if (!doc.RootElement.TryGetProperty("current", out var current) ||
                !current.TryGetProperty("renewal_return", out var policy))
                return rules;
            var value = policy.TryGetProperty("value", out var v) ? v : policy.TryGetProperty("config", out var c) ? c : default;
            if (value.ValueKind != JsonValueKind.Object) return rules;

            var notice = Math.Clamp(ReadInt(value, "renewalNoticeDays", rules.NoticeDays), 0, 365);
            var min = Math.Clamp(ReadInt(value, "minRenewalMonths", rules.MinMonths), 1, 12);
            var max = Math.Clamp(ReadInt(value, "maxRenewalMonths", rules.MaxMonths), min, 12);
            var requireNoOverdue = value.TryGetProperty("requireNoOverdue", out var flag)
                ? flag.ValueKind != JsonValueKind.False && !(flag.ValueKind == JsonValueKind.String && flag.GetString() == "false")
                : rules.RequireNoOverdue;
            return new RenewalRules(notice, min, max, requireNoOverdue);
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Không đọc được chính sách gia hạn, dùng giá trị mặc định.");
            return rules;
        }
    }

    private static int ReadInt(JsonElement obj, string name, int fallback)
    {
        if (!obj.TryGetProperty(name, out var el)) return fallback;
        if (el.ValueKind == JsonValueKind.Number && el.TryGetDecimal(out var d)) return (int)d;
        if (el.ValueKind == JsonValueKind.String && decimal.TryParse(el.GetString(), out var s)) return (int)s;
        return fallback;
    }

    private async Task<string> NewReservationCodeAsync(DateTime now, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var code = $"RS-{now:yyyy}-{Random.Shared.Next(10000, 99999)}";
            if (!await context.Reservations.AnyAsync(r => r.ReservationCode == code, ct))
                return code;
        }
        return $"RS-{now:yyyy}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}";
    }

    /* Ngày hiện tại: lấy ngày muộn hơn giữa giờ máy chủ và UTC (khớp cách trigger DB tính "quá hạn"). */
    private static DateTime Today()
    {
        var local = DateTime.Today;
        var utc = DateTime.UtcNow.Date;
        return local > utc ? local : utc;
    }

    private Task<int?> GetCustomerIdAsync(CancellationToken ct)
    {
        var email = Request.Headers["X-User-Email"].ToString();
        if (string.IsNullOrWhiteSpace(email))
            return Task.FromResult<int?>(null);

        return context.Users
            .Where(u => u.Email == email && u.RoleID == 1 && u.Status == "Active")
            .Select(u => (int?)u.UserID)
            .FirstOrDefaultAsync(ct);
    }
}
