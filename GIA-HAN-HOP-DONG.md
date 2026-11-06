# Gia hạn hợp đồng (customer)

## Luồng
1. Khách bấm **Gia hạn** (trang Hợp đồng, Kho của tôi, hoặc trong Chi tiết hợp đồng).
2. Chọn số tháng (1/3/6/12, giới hạn theo chính sách gia hạn của BO). Xem thời gian mới và giá thuê hiện hành.
3. **Xác nhận & thanh toán**: tick 2 ô xác nhận, trả ngay
   - tiền thuê **tháng đầu** của kỳ gia hạn,
   - cộng **cọc bổ sung** nếu giá thuê tăng (cọc kỳ cũ được chuyển sang kỳ mới, không phải đóng lại),
   - các tháng sau trả hằng tháng.
   Thanh toán qua VNPay (hoặc mô phỏng khi `VITE_ALLOW_SIMULATED_PAYMENT=true`).
4. Thanh toán xong: "Gia hạn thành công, vui lòng ký phụ lục gia hạn" → OK → mở màn hình **ký phụ lục gia hạn**.
5. Khách tiếp tục dùng kho, không cần Staff bàn giao lại. Khi kỳ cũ hết hạn, hệ thống đóng kỳ cũ và chuyển mã/thẻ ra vào sang kỳ mới.

Nếu khách đóng VNPay giữa chừng: yêu cầu gia hạn được giữ 15 phút, hiện ở mục "Gia hạn hợp đồng" (Thanh toán tiếp / Hủy).

## Backend (chỉ file thêm mới, không sửa code của nhóm)
| File | Việc |
|---|---|
| `Services/ContractRenewalFinalizer.cs` (mới) | Hoàn tất gia hạn sau khi thanh toán: chuyển cọc, hoàn cọc kỳ cũ, Paid → Confirmed → hợp đồng (`RenewedFromContractID`) → kho Active → Handed Over |
| `Controllers/ContractRenewalsController.cs` | `POST /api/contract-renewals` tạo đơn gia hạn **chờ thanh toán** (mã `GH-yyyy-xxxxx`); `POST /{id}/pay-demo`, `/{id}/finalize`, `/{id}/cancel`; `GET /mine` có thêm `pendingRenewal`, `renewedBy.isSigned` |
| `Controllers/VnPayController.cs` | Đơn `GH-...`: thu tiền tháng đầu + cọc bổ sung thay vì tiền cọc; xong thì gọi Finalizer; `return-verify` trả `kind: "renewal"` |
| `Controllers/ReservationConfirmationsController.cs` | Đơn `GH-...` ở trạng thái Paid thì hoàn tất theo luồng gia hạn |
| `Controllers/CustomerReservationsController.cs` | Thêm `isRenewal`, `amountDueNow`, `renewedFrom` |

Không cần sửa database hay Program.cs. Dùng sẵn loại phí `Renewal` (cọc bổ sung) có trong `CK_Charge_Type`.
