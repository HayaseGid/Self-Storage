# contract

Folder `src/features/contract` chứa các phần giao diện **hợp đồng thuê kho phía khách hàng**: văn bản hợp đồng, khung ký tay, hộp thoại ký online, hộp thoại xem chi tiết, thẻ hợp đồng ở tab "Hợp đồng" và toàn bộ chức năng **gia hạn hợp đồng**. Đây là tầng *feature* của frontend: các component ở đây không phải trang riêng mà được trang `src/pages/customer/CustomerAccount.jsx` (và vài nơi khác) ghép vào.

## Các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [ContractCard.jsx](./ContractCard.jsx) | Thẻ 1 hợp đồng ở tab "Hợp đồng": vị trí, kho, thời hạn, chi phí, tiền thuê & phí trễ hạn, chữ ký, các nút Ký / Chi tiết / Gia hạn / Trả kho / Đóng tiền | `src/pages/customer/CustomerAccount.jsx` | Không gọi API (dữ liệu do cha truyền vào) |
| [ContractCard.css](./ContractCard.css) | Giao diện cho `ContractCard.jsx` (class `cc-*`) | `ContractCard.jsx` | — |
| [ContractDetailModal.jsx](./ContractDetailModal.jsx) | Hộp thoại chi tiết hợp đồng ở mọi giai đoạn: tiến trình, tóm tắt tiền, toàn văn, In/PDF, gửi email, Ký / Gia hạn / Hủy | `src/pages/customer/CustomerAccount.jsx` | `GET /api/contracts/{id}/signature`, `POST /api/email/send-contract` (qua `api/contractEmail.js`) |
| [ContractDocument.jsx](./ContractDocument.jsx) | Văn bản hợp đồng / phụ lục gia hạn dùng chung (Điều 1–6, Phụ lục 01, khối chữ ký) + hàm `contractUnits` | `ContractSignFlow.jsx`, `ContractDetailModal.jsx`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/api/contractEmail.js` | Gián tiếp `GET /api/policies` (usePolicies, có cache) |
| [ContractModal.jsx](./ContractModal.jsx) | Hộp thoại hợp đồng 1 đơn kiểu cũ (các mục thu gọn) có khu vực ký tay; mở khi bấm "✍ Ký hợp đồng" trên thẻ | `src/pages/customer/CustomerAccount.jsx` | Không gọi API (cha gửi `POST /api/contracts/{id}/signature`) |
| [ContractRenewal.jsx](./ContractRenewal.jsx) | Gia hạn hợp đồng: hook tải dữ liệu, khối nhắc gia hạn, hộp thoại gia hạn, thanh toán, hoàn tất | `src/pages/customer/CustomerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx`, `ContractCard.jsx`, `src/features/payment/PendingPayments.jsx` | `GET /api/contract-renewals/mine`, `POST /api/contract-renewals`, `POST /api/contract-renewals/{id}/pay-demo`, `/finalize`, `/cancel`, `POST /api/vnpay/create` |
| [ContractRenewal.css](./ContractRenewal.css) | Giao diện cho khối / hộp thoại gia hạn (class `rn-*`) | `ContractRenewal.jsx` | — |
| [ContractSignFlow.jsx](./ContractSignFlow.jsx) | Hộp thoại ký hợp đồng / phụ lục 3 bước: xem → xác nhận điều khoản → ký tay + gõ họ tên | `src/pages/customer/CustomerAccount.jsx` | Không gọi API (cha gửi `POST /api/contracts/{id}/signature`); đọc `GET /api/policies` qua usePolicies |
| [ContractSignFlow.css](./ContractSignFlow.css) | Khung hộp thoại dùng chung (class `csf-*`, `cdm-*`, `sign-badge`) | `ContractSignFlow.jsx`, `ContractDetailModal.jsx`, `ContractDocument.jsx`, `ContractRenewal.jsx`, `src/features/booking/CancelReservation.jsx` | — |
| [SignaturePad.jsx](./SignaturePad.jsx) | Khung ký: vẽ chữ ký tay trên canvas **hoặc tải ảnh chữ ký** (PNG / JPG / WEBP, tự bỏ nền giấy, nén PNG ≤ 200 KB), trả ảnh PNG base64 | `ContractSignFlow.jsx`, `ContractModal.jsx` | Không gọi API |

## Các hàm / component chính

**ContractCard.jsx**
- `ContractCard` (default): vẽ thẻ hợp đồng, tính số tiền cần đóng (tiền thuê đến hạn + phí trễ chưa đóng), chọn nhãn trạng thái (ưu tiên trạng thái kiểm kho).
- `money`, `parseVnDate`, `daysFromToday`: định dạng tiền, đổi `dd/MM/yyyy` sang Date, đếm ngày tới ngày bắt đầu (theo Demo Clock).
- `STATUS_TONE`: màu chip theo trạng thái đơn.

**ContractDetailModal.jsx**
- `ContractDetailModal` (default): hộp thoại chi tiết; tự tải chữ ký, gửi email (`sendMail`).
- `contractStage(rentals)`: trả giai đoạn `approval | preparing | toSign | signed | active`.
- `STAGE_LABEL`: nhãn + màu badge cho từng giai đoạn.

**ContractDocument.jsx**
- `ContractDocument` (default): văn bản hợp đồng / phụ lục gia hạn, có chế độ bản nháp (`draft`) và điều khoản chi tiết (`showTerms`).
- `contractUnits(rentals)`: gộp danh sách kho của mọi đơn trong nhóm (tính giá/tháng và tiền cọc từng kho).

**ContractModal.jsx**
- `ContractModal` (default): hộp thoại hợp đồng 1 đơn; hàm con `toggleSection`, `formatMoney`, `submit`, `renderSection`, `detailItem`.

**ContractRenewal.jsx**
- `fmtIsoDate`: đổi ngày ISO sang `dd/MM/yyyy` (được nhiều file import).
- `useContractRenewals()`: hook tải điều kiện + báo giá gia hạn; trả `items`, `rules`, `byReservation`, `reload`.
- `payRenewal(dialog, info)`: thanh toán yêu cầu gia hạn (mô phỏng hoặc VNPay).
- `finishRenewal(dialog, result, amount)`: báo "Gia hạn thành công" rồi yêu cầu mở màn hình ký phụ lục.
- `RenewalSection`: khối nhắc gia hạn (chờ thanh toán / sắp hết hạn / đã gia hạn chờ ký); hàm con `continuePay`, `cancelPending`.
- `RenewalModal`: hộp thoại gia hạn (chọn kỳ + hình thức trả → xác nhận & thanh toán); hàm con `submit`, `dueOf`.

**ContractSignFlow.jsx**
- `ContractSignFlow` (default): hộp thoại ký 3 bước; hàm con `toggle`, `submit`.
- `CONTRACT_TERMS_VERSION`: mã phiên bản điều khoản gửi kèm chữ ký.

**SignaturePad.jsx**
- `SignaturePad` (default): canvas ký tay; hàm con `getPos`, `start`, `move`, `end`, `clear`; tải ảnh `pickFile`, `handleFile`.
- `cleanSignatureImage(img)`: bỏ nền giấy (trong suốt), giữ nét mực, co vừa khung 640×200.

## Kết nối với các phần khác

- **Folder này import từ:**
  - `src/api/api` (`apiGet`, `apiPost`), `src/api/vnpay` (`startVnPayPayment`, `SIMULATED_PAYMENT_ENABLED`), `src/api/contractEmail` (`sendContractEmail`), `src/api/lateFees` (`lateFeePolicyText`).
  - `src/services/policies` (chính sách / điều khoản), `src/services/storageRules` (`formatVnd`), `src/services/contractSignatures` (`formatSignedAt`), `src/services/afterDeposit` (`announceRenewalSuccess`, `focusContract`, `requestContractSign`).
  - `src/components/common/Dialog` (`useDialog`), `src/components/common/listKit` (`Code`, `NewBadge`, `UnitCodes`), `src/utils/districts`, `src/demoClock/demoClock`.
  - `src/features/payment/DepositConfirm` (bước xác nhận gia hạn), `src/features/booking/HandoverChoice` (`ONLINE_HANDOVER_NOTE`), `src/features/return/UnitReturn.css`.
- **Ai import folder này:**
  - `src/pages/customer/CustomerAccount.jsx`: ContractCard, ContractDetailModal, ContractModal, ContractSignFlow (+ `CONTRACT_TERMS_VERSION`), ContractRenewal (`useContractRenewals`, `RenewalSection`, `RenewalModal`, `fmtIsoDate`).
  - `src/pages/manager/FacilityManagerAccount.jsx`: ContractDocument.
  - `src/api/contractEmail.js`: `contractUnits`.
  - `src/features/notification/HeaderNotificationBell.jsx`: `useContractRenewals`.
  - `src/features/payment/PendingPayments.jsx`: `fmtIsoDate`.
  - `src/features/booking/CancelReservation.jsx`: dùng `ContractSignFlow.css`.

## Luồng hoạt động

**1. Ký hợp đồng sau khi đặt cọc**
1. Khách đặt cọc xong → backend tạo hợp đồng → tab "Hợp đồng" hiện `ContractCard` với nút "Ký hợp đồng".
2. Bấm ký → `CustomerAccount` mở `ContractSignFlow` (hoặc `ContractModal` khi bấm từ thẻ đơn lẻ).
3. Bước 1 xem `ContractDocument` → bước 2 tick đủ điều khoản → bước 3 vẽ chữ ký **hoặc tải ảnh chữ ký** trên `SignaturePad` + gõ đúng họ tên.
4. `submit()` → `onSign({ image, acceptedPolicies, termsVersion })` → `CustomerAccount` gọi `POST /api/contracts/{contractId}/signature` rồi gửi email hợp đồng (`POST /api/email/send-contract`).

**2. Xem chi tiết và gửi email hợp đồng**
1. Bấm "Xem chi tiết hợp đồng" trên `ContractCard` → mở `ContractDetailModal`.
2. `useEffect` gọi `GET /api/contracts/{id}/signature` để lấy ảnh chữ ký → hiện trong `ContractDocument`.
3. Bấm "✉ Gửi qua email" → `sendMail()` → `sendContractEmail()` → `POST /api/email/send-contract` → hiện thông báo kết quả.

**3. Gia hạn hợp đồng**
1. `useContractRenewals()` gọi `GET /api/contract-renewals/mine`; `RenewalSection` nhắc hợp đồng sắp hết hạn.
2. Bấm "Gia hạn" → `RenewalModal`: chọn số tháng + hình thức trả (Monthly / Upfront) → "Tiếp tục" → tick 2 ô `DepositConfirm`.
3. Bấm "Thanh toán" → `POST /api/contract-renewals` → `payRenewal()`: VNPay (`POST /api/vnpay/create`, chuyển trang) hoặc mô phỏng (`POST /api/contract-renewals/{id}/pay-demo`).
4. Thành công → `finishRenewal()` báo "Gia hạn thành công" → `requestContractSign(contractId)` (sessionStorage + sự kiện) → `CustomerAccount` mở `ContractSignFlow` để ký phụ lục gia hạn.
