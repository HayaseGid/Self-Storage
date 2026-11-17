# services

Tầng **quy tắc nghiệp vụ** của frontend (tầng nền, dùng chung). Phần lớn là hàm thuần (không gọi API): hằng số và quy tắc thuê kho, tính giá / cọc, kiểm tra khung giá, chính sách kinh doanh, tính danh sách thông báo cho khách. Chỉ 2 file có gọi API: `afterDeposit.js` (xác nhận đơn sau cọc) và `policies.js` (tải chính sách, có cache).

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [storageRules.js](./storageRules.js) | Hằng số + quy tắc dùng chung: kỳ hạn thuê, nhãn trạng thái kho/đơn, mã đơn `RS-2026-00012`, kho bị khóa sửa, sinh mã chi nhánh / mã kho, định dạng & kiểm tra giá VNĐ, ngày kết thúc HĐ | `src/App.jsx`, `src/components/common/PriceInput.jsx`, `src/mappers/operationsState.js`, `src/api/contractEmail.js`, các service khác, hầu hết `src/features/*` và `src/pages/*` | Không |
| [policies.js](./policies.js) | 4 nhóm chính sách (cọc, phí quá hạn, đặt chỗ/hủy, gia hạn/trả kho): mặc định, tính cọc, mô tả, điều khoản hợp đồng, tải có cache | `src/features/contract/*` (ContractDocument, ContractSignFlow, ContractDetailModal), `src/features/payment/DepositConfirm.jsx`, `src/features/return/*` (StaffReturns, UnitReturn), `src/features/notification/HeaderNotificationBell.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/business/BusinessPolicyEditor.jsx`, `src/services/customerNoticeData.js`, `src/api/contractEmail.js` | `GET /api/policies` |
| [pricing.js](./pricing.js) | Báo giá hiển thị: tiền/tháng, tiền thuê, tiền cọc theo cơ sở (không giảm giá) | `src/App.jsx`, `src/pages/customer/CartPage.jsx` | Không |
| [priceBands.js](./priceBands.js) | Khung giá theo nhóm kích thước: lấy mã nhóm, diện tích, kiểm tra giá trong khung | `src/pages/business/BusinessPriceBands.jsx`, `src/pages/manager/ManagerPriceTable.jsx`, `src/utils/unitGeometry.js` | Không |
| [priceBandRules.js](./priceBandRules.js) | Kiểm tra 5 quy tắc khi tạo/sửa khung giá (giống backend) + gợi ý giới hạn | `src/pages/business/BusinessPriceBands.jsx` | Không |
| [afterDeposit.js](./afterDeposit.js) | Sau đặt cọc / gia hạn: xác nhận đơn, hộp thoại thành công, mở tab khách hàng, truyền yêu cầu ký / gia hạn / cuộn tới hợp đồng qua sessionStorage + sự kiện | `src/App.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/customer/CustomerAccount.jsx`, `src/pages/payment/PaymentResultPage.jsx`, `src/features/contract/ContractRenewal.jsx`, `src/features/notification/HeaderNotificationBell.jsx`, `src/features/return/UnitReturn.jsx` | `POST /api/reservation-confirmations/mine` |
| [customerNoticeData.js](./customerNoticeData.js) | Tính danh sách thông báo cho khách từ dữ liệu sẵn có + trạng thái "đã xem" (localStorage) | `src/pages/customer/CustomerAccount.jsx`, `src/features/notification/HeaderNotificationBell.jsx` | Không (dữ liệu do trang tải rồi truyền vào) |
| [contractSignatures.js](./contractSignatures.js) | Định dạng thời điểm ký hợp đồng | `src/features/contract/ContractCard.jsx`, `src/features/contract/ContractModal.jsx`, `src/pages/customer/CustomerAccount.jsx` | Không |

## Các hàm / component chính

**storageRules.js**
- Hằng số: `DEPOSIT_HOLD_MINUTES`, `RENTAL_TERMS` ([6, 12]), `DEPOSIT_MONTHS` (2), `UNIT_TYPE_CODES`, `PRICE_RULES`.
- Trạng thái: `UNIT_STATUS_LABELS`, `EDITABLE_UNIT_STATUSES`, `ACTIVE_RESERVATION_STATUSES`, `RESERVATION_STATUS_LABELS`.
- `formatReservationCode(id)` — mã đơn thống nhất.
- `getActiveReservationsForUnit`, `getUnitLock(unit, reservations)` — kho có bị khóa sửa không + lý do.
- `generateUnitCodePrefix`, `getUnitTypeCode`, `previewNextUnitCode` — sinh mã.
- `calculateEndDate(start, months)` — ngày kết thúc = bắt đầu + số tháng − 1 ngày.
- `formatVnd`, `parseVnd`, `roundPrice`, `describeVnd`, `validateMonthlyPrice`, `medianPrice`, `computeDeposit` — tiền.

**policies.js**
- `DEFAULT_POLICIES`, `POLICY_KEYS`, `POLICY_TITLES`, `PERIOD_LABELS`, `DEPOSIT_METHOD_LABELS`, `DISCOUNTS`.
- `fmtDay(iso)` — 'YYYY-MM-DD' -> 'DD/MM/YYYY'.
- `depositFor(policy, { facilityId, monthlyPrice, months })`, `describeDepositShort(policy, facilityId)`.
- `describePolicy(key, value)` — `{ summary, settings }`.
- `buildContractTerms(policies)` — các nhóm điều khoản trước khi ký.
- `loadPolicies(force)`, `usePolicies()` — tải có cache / hook React.

**pricing.js**
- `setCatalogPricing(catalog)`, `quote(prices, months, facilityId)`, `effectiveMonthly(price)`, `depositMonthsFor`, `holdMinutesFor`, `DISCOUNT_ENABLED`, `discountFor`.

**priceBands.js**
- `getBandCode`, `getArea`, `findBand`, `checkPriceInBand`, `formatArea`, `formatBandPrice`.

**priceBandRules.js**
- `validateBand(candidate, ruleBands, current)` — danh sách lỗi.
- `bandHints(candidate, ruleBands, current)` — dòng gợi ý.
- `isSpecialBand(code)` — nhóm xe "V".

**afterDeposit.js**
- `confirmAfterDeposit(ids)`, `announceDepositSuccess(dialog, opts)`, `announceRenewalSuccess(dialog, opts)`.
- `openCustomerSection(navigate, section)`, `takeCustomerSection(fallback)`.
- `requestContractSign`, `peekContractSignRequest`, `clearContractSignRequest`.
- `requestRenewal`, `takeRenewalRequest`, `focusContract`, `takePendingContractFocus`.
- Hằng: `CUSTOMER_SECTION_KEY`, `SIGN_REQUEST_KEY`, `OPEN_SECTION_EVENT`, `RENEW_REQUEST_KEY`, `FOCUS_CONTRACT_KEY`.

**customerNoticeData.js**
- `buildCustomerNotifications({ rentals, renewals, policies, returns, inspections })` — mảng thông báo đã sắp ưu tiên.
- `useCustomerNotifications({ email, ... })` — `{ notifications, unseenCount, countBySection, markSection, markAll, isSeen }`.

**contractSignatures.js**
- `formatSignedAt(iso)` — "HH:mm dd/MM/yyyy".

## Kết nối với các phần khác

- **Import từ:** `src/api/api.js` (afterDeposit, policies); `src/demoClock/demoClock.js` (storageRules, customerNoticeData). Trong folder: `storageRules` là gốc — `policies`, `priceBands`, `priceBandRules`, `customerNoticeData` đều import `formatVnd` / `RENTAL_TERMS` từ đây; `customerNoticeData` import `policies`.
- **Được import bởi:** `src/App.jsx`, `src/api/contractEmail.js`, `src/mappers/operationsState.js`, `src/components/common/PriceInput.jsx`, `src/utils/unitGeometry.js`, toàn bộ trang khách (`CartPage`, `CustomerAccount`, `PaymentResultPage`), Manager (`FacilityManagerAccount`, `ManagerPriceTable`), Staff (`FacilityStaffAccount`), Business (`BusinessOperations`, `BusinessPanels`, `BusinessPolicyEditor`, `BusinessPriceBands`) và các feature hợp đồng / thanh toán / trả kho / thông báo / sơ đồ kho.

## Luồng hoạt động

1. **Sau khi đặt cọc:** VNPay trả về → `PaymentResultPage` gọi `confirmAfterDeposit(ids)` → `POST /api/reservation-confirmations/mine` (backend tạo hợp đồng) → `announceDepositSuccess(dialog)` → `openCustomerSection(navigate)` → `CustomerAccount` đọc `takeCustomerSection()` mở tab Hợp đồng để ký.
2. **Hiển thị điều khoản hợp đồng:** `ContractSignFlow` gọi `usePolicies()` → `loadPolicies()` → `GET /api/policies` (cache) → `buildContractTerms(values)` → `describePolicy()` từng nhóm → khách đọc và xác nhận trước khi ký.
3. **Manager đặt giá:** Nhập giá ở `ManagerPriceTable` → `checkPriceInBand(bands, dimensions, price)` (khung do Business đặt, kiểm bằng `validateBand` khi tạo) + `validateMonthlyPrice()` → hợp lệ mới cho lưu.
4. **Badge thông báo khách:** `CustomerAccount` tải đơn / gia hạn / chính sách / trả kho → `useCustomerNotifications()` → badge theo tab → mở tab → `markSection()` lưu "đã xem".
