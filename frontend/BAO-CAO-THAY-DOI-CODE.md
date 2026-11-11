# BÁO CÁO THAY ĐỔI CODE KHI TÁI CẤU TRÚC FRONTEND

## Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| Số file trong `src/` được chuyển thư mục | 102 (giữ nguyên tên file) |
| Thay đổi **code** | **Chỉ sửa đường dẫn `import` tương đối**: 216 dòng / 48 file (chi tiết ở mục 2) |
| Logic, tên hàm, tên biến, JSX, CSS | **Không đổi** |
| Tách / gộp file | Không |
| Chú thích thêm vào | 3.979 dòng **chỉ là comment** (đầu mỗi file, trước mỗi hàm trong 1.006 hàm, đầu mỗi file CSS) |
| File ngoài `src/` thay đổi | `README.md` (cập nhật mục "Cấu trúc" và đường dẫn `styles.css`) — chỉ là tài liệu |
| File tài liệu mới | `GIAI-THICH-CAU-TRUC-FRONTEND.md`, `LUONG-API-FRONTEND.md`, `BAO-CAO-THAY-DOI-CODE.md` |
| `index.html`, `vite.config.js`, `package.json`, `.env`, `vercel.json` | Không đổi (`src/App.jsx` vẫn ở chỗ cũ nên `index.html` không phải sửa) |

## Cách kiểm chứng đã làm

1. **Build trước và sau** bằng esbuild (bundle + bỏ khoảng trắng/comment, giữ nguyên tên biến):
   file JS và CSS đầu ra của code gốc và code mới **giống hệt từng byte** — kể cả 2 file chưa được dùng
   (`BusinessCatalog.jsx`, `catalogApi.js`) được build riêng. Nghĩa là hành vi chương trình không đổi.
2. **So sánh từng dòng**: lấy code gốc chỉ áp dụng việc sửa import, rồi so với code cuối cùng →
   toàn bộ khác biệt là **dòng chèn thêm, và mọi dòng chèn thêm đều là comment** (0 dòng code bị sửa hay xóa).

## Ghi chú phát hiện trong lúc đọc code (KHÔNG sửa, chỉ báo lại)

- `pages/business/BusinessCatalog.jsx` không được file nào import → code chưa dùng; vì thế `api/catalogApi.js` cũng chưa dùng.
- `features/payment/PendingPayments.jsx` import `apiPost`, `SIMULATED_PAYMENT_ENABLED`, `payLateFeesDemo` nhưng hiện không dùng tới (không ảnh hưởng chạy).
- `pages/staff/FacilityStaffAccount.jsx › DayTag` luôn trả `null` (nhãn ngày hẹn đang bị tắt).
- `features/contract/ContractModal.jsx` là màn hình ký kiểu cũ; luồng ký mới dùng `ContractSignFlow.jsx`, nhưng `CustomerAccount.jsx` vẫn còn import và dùng `ContractModal`.

Thay đổi code DUY NHẤT trong bước tái cấu trúc là **đường dẫn import tương đối** (vì file đã đổi thư mục). Không có dòng logic, tên hàm, tên biến, JSX hay CSS nào bị sửa.

Tổng số dòng import đã sửa: **216** trong **48** file.

## 1. Bảng di chuyển file (cũ → mới)

| File cũ (`src/`) | Vị trí mới (`src/`) |
|---|---|
| `AdminAccount.css` | `pages/admin/AdminAccount.css` |
| `AdminAccount.jsx` | `pages/admin/AdminAccount.jsx` |
| `App.jsx` | `App.jsx` |
| `BusinessCatalog.css` | `pages/business/BusinessCatalog.css` |
| `BusinessCatalog.jsx` | `pages/business/BusinessCatalog.jsx` |
| `BusinessFacilityForm.jsx` | `pages/business/BusinessFacilityForm.jsx` |
| `BusinessOperations.css` | `pages/business/BusinessOperations.css` |
| `BusinessOperations.jsx` | `pages/business/BusinessOperations.jsx` |
| `BusinessPanels.css` | `pages/business/BusinessPanels.css` |
| `BusinessPanels.jsx` | `pages/business/BusinessPanels.jsx` |
| `BusinessPolicyEditor.css` | `pages/business/BusinessPolicyEditor.css` |
| `BusinessPolicyEditor.jsx` | `pages/business/BusinessPolicyEditor.jsx` |
| `BusinessPriceBands.css` | `pages/business/BusinessPriceBands.css` |
| `BusinessPriceBands.jsx` | `pages/business/BusinessPriceBands.jsx` |
| `CancelReservation.css` | `features/booking/CancelReservation.css` |
| `CancelReservation.jsx` | `features/booking/CancelReservation.jsx` |
| `CartPage.css` | `pages/customer/CartPage.css` |
| `CartPage.jsx` | `pages/customer/CartPage.jsx` |
| `ContractCard.css` | `features/contract/ContractCard.css` |
| `ContractCard.jsx` | `features/contract/ContractCard.jsx` |
| `ContractDetailModal.jsx` | `features/contract/ContractDetailModal.jsx` |
| `ContractDocument.jsx` | `features/contract/ContractDocument.jsx` |
| `ContractModal.jsx` | `features/contract/ContractModal.jsx` |
| `ContractRenewal.css` | `features/contract/ContractRenewal.css` |
| `ContractRenewal.jsx` | `features/contract/ContractRenewal.jsx` |
| `ContractSignFlow.css` | `features/contract/ContractSignFlow.css` |
| `ContractSignFlow.jsx` | `features/contract/ContractSignFlow.jsx` |
| `CustomerAccount.css` | `pages/customer/CustomerAccount.css` |
| `CustomerAccount.jsx` | `pages/customer/CustomerAccount.jsx` |
| `CustomerNotifications.css` | `features/notification/CustomerNotifications.css` |
| `CustomerNotifications.jsx` | `features/notification/CustomerNotifications.jsx` |
| `DataGrid.css` | `components/common/DataGrid.css` |
| `DataGrid.jsx` | `components/common/DataGrid.jsx` |
| `DepositConfirm.css` | `features/payment/DepositConfirm.css` |
| `DepositConfirm.jsx` | `features/payment/DepositConfirm.jsx` |
| `Dialog.css` | `components/common/Dialog.css` |
| `Dialog.jsx` | `components/common/Dialog.jsx` |
| `FacilityFloorPlan.css` | `features/facility/FacilityFloorPlan.css` |
| `FacilityFloorPlan.jsx` | `features/facility/FacilityFloorPlan.jsx` |
| `FacilityManagerAccount.jsx` | `pages/manager/FacilityManagerAccount.jsx` |
| `FacilityMap.css` | `features/facility/FacilityMap.css` |
| `FacilityMap.jsx` | `features/facility/FacilityMap.jsx` |
| `FacilityStaffAccount.jsx` | `pages/staff/FacilityStaffAccount.jsx` |
| `FacilityUnitsMap.css` | `features/facility/FacilityUnitsMap.css` |
| `FacilityUnitsMap.jsx` | `features/facility/FacilityUnitsMap.jsx` |
| `HandoverChoice.css` | `features/booking/HandoverChoice.css` |
| `HandoverChoice.jsx` | `features/booking/HandoverChoice.jsx` |
| `HeaderNotificationBell.css` | `features/notification/HeaderNotificationBell.css` |
| `HeaderNotificationBell.jsx` | `features/notification/HeaderNotificationBell.jsx` |
| `ManagerNav.css` | `pages/manager/ManagerNav.css` |
| `ManagerNav.jsx` | `pages/manager/ManagerNav.jsx` |
| `ManagerPriceTable.jsx` | `pages/manager/ManagerPriceTable.jsx` |
| `PaymentResultPage.css` | `pages/payment/PaymentResultPage.css` |
| `PaymentResultPage.jsx` | `pages/payment/PaymentResultPage.jsx` |
| `PendingPayments.css` | `features/payment/PendingPayments.css` |
| `PendingPayments.jsx` | `features/payment/PendingPayments.jsx` |
| `PriceInput.css` | `components/common/PriceInput.css` |
| `PriceInput.jsx` | `components/common/PriceInput.jsx` |
| `RentalCalendar.css` | `components/common/RentalCalendar.css` |
| `RentalCalendar.jsx` | `components/common/RentalCalendar.jsx` |
| `ReturnInspection.css` | `features/return/ReturnInspection.css` |
| `ReturnInspection.jsx` | `features/return/ReturnInspection.jsx` |
| `SignaturePad.jsx` | `features/contract/SignaturePad.jsx` |
| `StaffReturns.jsx` | `features/return/StaffReturns.jsx` |
| `ThreeUnitScene.jsx` | `features/unit/ThreeUnitScene.jsx` |
| `Unit3DViewer.css` | `features/unit/Unit3DViewer.css` |
| `Unit3DViewer.jsx` | `features/unit/Unit3DViewer.jsx` |
| `UnitPackPlanner.css` | `features/unit/UnitPackPlanner.css` |
| `UnitPackPlanner.jsx` | `features/unit/UnitPackPlanner.jsx` |
| `UnitReturn.css` | `features/return/UnitReturn.css` |
| `UnitReturn.jsx` | `features/return/UnitReturn.jsx` |
| `afterDeposit.js` | `services/afterDeposit.js` |
| `api.js` | `api/api.js` |
| `bookingDraft.js` | `store/bookingDraft.js` |
| `cart.js` | `store/cart.js` |
| `catalogApi.js` | `api/catalogApi.js` |
| `contractEmail.js` | `api/contractEmail.js` |
| `contractSignatures.js` | `services/contractSignatures.js` |
| `customerNoticeData.js` | `services/customerNoticeData.js` |
| `demoClock/DemoClockWidget.css` | `demoClock/DemoClockWidget.css` |
| `demoClock/DemoClockWidget.jsx` | `demoClock/DemoClockWidget.jsx` |
| `demoClock/demoClock.js` | `demoClock/demoClock.js` |
| `districts.js` | `utils/districts.js` |
| `fmanagerstyles.css` | `styles/fmanagerstyles.css` |
| `lateFees.js` | `api/lateFees.js` |
| `listKit.css` | `components/common/listKit.css` |
| `listKit.jsx` | `components/common/listKit.jsx` |
| `operationsState.js` | `mappers/operationsState.js` |
| `opsLists.js` | `hooks/opsLists.js` |
| `otpService.js` | `api/otpService.js` |
| `packing.js` | `utils/packing.js` |
| `policies.js` | `services/policies.js` |
| `priceBandRules.js` | `services/priceBandRules.js` |
| `priceBands.js` | `services/priceBands.js` |
| `pricing.js` | `services/pricing.js` |
| `staffstyles.css` | `styles/staffstyles.css` |
| `storageRules.js` | `services/storageRules.js` |
| `styles.css` | `styles/styles.css` |
| `unitGeometry.js` | `utils/unitGeometry.js` |
| `unitTypes.css` | `features/unit/unitTypes.css` |
| `unitTypes.jsx` | `features/unit/unitTypes.jsx` |
| `vnpay.js` | `api/vnpay.js` |

## 2. Chi tiết từng dòng import đã sửa

### `src/pages/admin/AdminAccount.jsx` (trước đây: `src/AdminAccount.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { NewBadge, Pager, newestFirst, parseTime, rowClass, timeAgo, useServerList } from "./listKit"; // [THÊM] phân trang ở backend + tô sáng bản ghi mới` | `import { NewBadge, Pager, newestFirst, parseTime, rowClass, timeAgo, useServerList } from "../../components/common/listKit"; // [THÊM] phân trang ở backend + tô sáng bản ghi mới` |
| 4 | `import { apiGet, apiPut } from "./api";` | `import { apiGet, apiPut } from "../../api/api";` |
| 5 | `import { useDialog } from "./Dialog";` | `import { useDialog } from "../../components/common/Dialog";` |

### `src/App.jsx` (trước đây: `src/App.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import './styles.css'` | `import './styles/styles.css'` |
| 4 | `import { apiPost, apiGet } from './api'` | `import { apiPost, apiGet } from './api/api'` |
| 5 | `import { DialogProvider, useDialog } from './Dialog'` | `import { DialogProvider, useDialog } from './components/common/Dialog'` |
| 6 | `import RentalCalendar from './RentalCalendar'` | `import RentalCalendar from './components/common/RentalCalendar'` |
| 17 | `} from './unitTypes'` | `} from './features/unit/unitTypes'` |
| 18 | `import './unitTypes.css'` | `import './features/unit/unitTypes.css'` |
| 19 | `import { getFacilityDistrict, groupFacilitiesByDistrict } from './districts'` | `import { getFacilityDistrict, groupFacilitiesByDistrict } from './utils/districts'` |
| 20 | `import { RENTAL_TERMS } from './storageRules'` | `import { RENTAL_TERMS } from './services/storageRules'` |
| 21 | `import { effectiveMonthly, holdMinutesFor, quote, setCatalogPricing } from './pricing'` | `import { effectiveMonthly, holdMinutesFor, quote, setCatalogPricing } from './services/pricing'` |
| 22 | `import FacilityMap, { directionsUrl, useFacilityLocations } from './FacilityMap'` | `import FacilityMap, { directionsUrl, useFacilityLocations } from './features/facility/FacilityMap'` |
| 23 | `import CartPage from './CartPage'` | `import CartPage from './pages/customer/CartPage'` |
| 24 | `import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from './afterDeposit'` | `import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from './services/afterDeposit'` |
| 25 | `import PaymentResultPage from './PaymentResultPage'` | `import PaymentResultPage from './pages/payment/PaymentResultPage'` |
| 26 | `import DepositConfirm from './DepositConfirm'` | `import DepositConfirm from './features/payment/DepositConfirm'` |
| 27 | `import FacilityFloorPlan from './FacilityFloorPlan'` | `import FacilityFloorPlan from './features/facility/FacilityFloorPlan'` |
| 28 | `import Unit3DViewer from './Unit3DViewer'` | `import Unit3DViewer from './features/unit/Unit3DViewer'` |
| 29 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './api/vnpay'` |
| 32 | `import { CART_LIMIT, addToCart, isInCart, useCart } from './cart'` | `import { CART_LIMIT, addToCart, isInCart, useCart } from './store/cart'` |
| 33 | `import HeaderNotificationBell, { HeaderPendingDepositBar } from './HeaderNotificationBell' // [THÊM] chuông thông báo + nhắc đơn chưa đặt cọc` | `import HeaderNotificationBell, { HeaderPendingDepositBar } from './features/notification/HeaderNotificationBell' // [THÊM] chuông thông báo + nhắc đơn chưa đặt cọc` |
| 41 | `} from './bookingDraft'` | `} from './store/bookingDraft'` |
| 42 | `import CustomerDashboard from './CustomerAccount'` | `import CustomerDashboard from './pages/customer/CustomerAccount'` |
| 43 | `import { startRegistration, resendRegistrationOtp, verifyRegistrationOtp } from './otpService'` | `import { startRegistration, resendRegistrationOtp, verifyRegistrationOtp } from './api/otpService'` |
| 44 | `import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from './HandoverChoice'` | `import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from './features/booking/HandoverChoice'` |
| 46 | `import StaffPortal from './FacilityStaffAccount'` | `import StaffPortal from './pages/staff/FacilityStaffAccount'` |
| 50 | `import FacilityManagerDashboard from './FacilityManagerAccount'` | `import FacilityManagerDashboard from './pages/manager/FacilityManagerAccount'` |
| 54 | `import Admin from './AdminAccount'` | `import Admin from './pages/admin/AdminAccount'` |
| 55 | `import BusinessOperations from './BusinessOperations'` | `import BusinessOperations from './pages/business/BusinessOperations'` |

### `src/pages/business/BusinessCatalog.jsx` (trước đây: `src/BusinessCatalog.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import DataGrid from './DataGrid'` | `import DataGrid from '../../components/common/DataGrid'` |
| 3 | `import { SizeMeter, UnitTypeChip, getUnitTypeStyle } from './unitTypes'` | `import { SizeMeter, UnitTypeChip, getUnitTypeStyle } from '../../features/unit/unitTypes'` |
| 4 | `import { catalogApi, composeDimensions, isMissingEndpoint, parseDimensions } from './catalogApi'` | `import { catalogApi, composeDimensions, isMissingEndpoint, parseDimensions } from '../../api/catalogApi'` |

### `src/pages/business/BusinessFacilityForm.jsx` (trước đây: `src/BusinessFacilityForm.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { extractDistrict } from './districts'` | `import { extractDistrict } from '../../utils/districts'` |

### `src/pages/business/BusinessOperations.jsx` (trước đây: `src/BusinessOperations.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { apiDelete, apiGet, apiPost, apiPut } from "./api";` | `import { apiDelete, apiGet, apiPost, apiPut } from "../../api/api";` |
| 4 | `import { mapOperationsState } from "./operationsState";` | `import { mapOperationsState } from "../../mappers/operationsState";` |
| 5 | `import { useDialog } from "./Dialog";` | `import { useDialog } from "../../components/common/Dialog";` |
| 6 | `import { generateUnitCodePrefix } from "./storageRules";` | `import { generateUnitCodePrefix } from "../../services/storageRules";` |
| 7 | `import "./unitTypes.css";` | `import "../../features/unit/unitTypes.css";` |

### `src/pages/business/BusinessPanels.jsx` (trước đây: `src/BusinessPanels.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { getFacilityDistrict, groupFacilitiesByDistrict } from './districts'` | `import { getFacilityDistrict, groupFacilitiesByDistrict } from '../../utils/districts'` |
| 3 | `import { UNIT_TYPE_ORDER, UNIT_TYPE_STYLES, UnitTypeChip, getUnitTypeKey, getUnitTypeStyle } from './unitTypes'` | `import { UNIT_TYPE_ORDER, UNIT_TYPE_STYLES, UnitTypeChip, getUnitTypeKey, getUnitTypeStyle } from '../../features/unit/unitTypes'` |
| 4 | `import { RESERVATION_STATUS_LABELS, formatVnd } from './storageRules'` | `import { RESERVATION_STATUS_LABELS, formatVnd } from '../../services/storageRules'` |
| 6 | `import { Code, NewBadge, Pager, newestFirst, rowClass, useClientPaging } from './listKit'` | `import { Code, NewBadge, Pager, newestFirst, rowClass, useClientPaging } from '../../components/common/listKit'` |
| 7 | `import { getTodayISO } from './demoClock/demoClock'` | `import { getTodayISO } from '../../demoClock/demoClock'` |

### `src/pages/business/BusinessPolicyEditor.jsx` (trước đây: `src/BusinessPolicyEditor.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet, apiPut } from './api'` | `import { apiGet, apiPut } from '../../api/api'` |
| 3 | `import PriceInput from './PriceInput'` | `import PriceInput from '../../components/common/PriceInput'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 8 | `} from './policies'` | `} from '../../services/policies'` |
| 9 | `import { getTodayISO } from './demoClock/demoClock'` | `import { getTodayISO } from '../../demoClock/demoClock'` |

### `src/pages/business/BusinessPriceBands.jsx` (trước đây: `src/BusinessPriceBands.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiDelete, apiGet, apiPost, apiPut } from './api'` | `import { apiDelete, apiGet, apiPost, apiPut } from '../../api/api'` |
| 3 | `import PriceInput from './PriceInput'` | `import PriceInput from '../../components/common/PriceInput'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import { formatArea, formatBandPrice } from './priceBands'` | `import { formatArea, formatBandPrice } from '../../services/priceBands'` |
| 6 | `import { bandHints, validateBand } from './priceBandRules'` | `import { bandHints, validateBand } from '../../services/priceBandRules'` |

### `src/features/booking/CancelReservation.jsx` (trước đây: `src/CancelReservation.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 3 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import './ContractSignFlow.css'` | `import '../contract/ContractSignFlow.css'` |

### `src/pages/customer/CartPage.jsx` (trước đây: `src/CartPage.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiPost } from './api'` | `import { apiPost } from '../../api/api'` |
| 3 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 4 | `import RentalCalendar from './RentalCalendar'` | `import RentalCalendar from '../../components/common/RentalCalendar'` |
| 5 | `import { UnitTypeArt, UnitTypeChip } from './unitTypes'` | `import { UnitTypeArt, UnitTypeChip } from '../../features/unit/unitTypes'` |
| 6 | `import { CHECKOUT_LIMIT, cancelHeldReservations, newOrderCode, rememberVnPayCartItems, removeFromCart, removeManyFromCart, restoreToCart, saveCartOrder, useCart } from './cart'` | `import { CHECKOUT_LIMIT, cancelHeldReservations, newOrderCode, rememberVnPayCartItems, removeFromCart, removeManyFromCart, restoreToCart, saveCartOrder, useCart } from '../../store/cart'` |
| 7 | `import { RENTAL_TERMS, formatVnd } from './storageRules'` | `import { RENTAL_TERMS, formatVnd } from '../../services/storageRules'` |
| 8 | `import { effectiveMonthly, holdMinutesFor, quote } from './pricing'` | `import { effectiveMonthly, holdMinutesFor, quote } from '../../services/pricing'` |
| 9 | `import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from './afterDeposit'` | `import { announceDepositSuccess, confirmAfterDeposit, openCustomerSection } from '../../services/afterDeposit'` |
| 10 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'` |
| 11 | `import DepositConfirm from './DepositConfirm'` | `import DepositConfirm from '../../features/payment/DepositConfirm'` |
| 12 | `import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from './HandoverChoice'` | `import HandoverChoice, { HANDOVER_METHODS, ONLINE_HANDOVER_NOTE, handoverChoiceError, slotLabel } from '../../features/booking/HandoverChoice'` |
| 13 | `import { getTodayDate } from './demoClock/demoClock'` | `import { getTodayDate } from '../../demoClock/demoClock'` |

### `src/features/contract/ContractCard.jsx` (trước đây: `src/ContractCard.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { Code, NewBadge, UnitCodes } from './listKit'` | `import { Code, NewBadge, UnitCodes } from '../../components/common/listKit'` |
| 3 | `import { extractDistrict } from './districts'` | `import { extractDistrict } from '../../utils/districts'` |
| 4 | `import { formatSignedAt } from './contractSignatures'` | `import { formatSignedAt } from '../../services/contractSignatures'` |
| 5 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 7 | `import { lateFeePolicyText } from './lateFees'` | `import { lateFeePolicyText } from '../../api/lateFees'` |
| 8 | `import { getTodayDate } from './demoClock/demoClock'` | `import { getTodayDate } from '../../demoClock/demoClock'` |
| 10 | `import './UnitReturn.css'` | `import '../return/UnitReturn.css'` |
| 11 | `import { ONLINE_HANDOVER_NOTE } from './HandoverChoice'` | `import { ONLINE_HANDOVER_NOTE } from '../booking/HandoverChoice'` |

### `src/features/contract/ContractDetailModal.jsx` (trước đây: `src/ContractDetailModal.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet } from './api'` | `import { apiGet } from '../../api/api'` |
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import { sendContractEmail } from './contractEmail'` | `import { sendContractEmail } from '../../api/contractEmail'` |
| 6 | `import { usePolicies } from './policies'` | `import { usePolicies } from '../../services/policies'` |

### `src/features/contract/ContractDocument.jsx` (trước đây: `src/ContractDocument.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { POLICY_KEYS, POLICY_TITLES, buildContractTerms, fmtDay, usePolicies } from './policies'` | `import { POLICY_KEYS, POLICY_TITLES, buildContractTerms, fmtDay, usePolicies } from '../../services/policies'` |
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |

### `src/features/contract/ContractModal.jsx` (trước đây: `src/ContractModal.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 4 | `import { formatSignedAt } from './contractSignatures'` | `import { formatSignedAt } from '../../services/contractSignatures'` |

### `src/features/contract/ContractRenewal.jsx` (trước đây: `src/ContractRenewal.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 4 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 5 | `import DepositConfirm from './DepositConfirm'` | `import DepositConfirm from '../payment/DepositConfirm'` |
| 6 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'` |
| 7 | `import { announceRenewalSuccess, focusContract, requestContractSign } from './afterDeposit'` | `import { announceRenewalSuccess, focusContract, requestContractSign } from '../../services/afterDeposit'` |

### `src/features/contract/ContractSignFlow.jsx` (trước đây: `src/ContractSignFlow.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { buildContractTerms, usePolicies } from './policies'` | `import { buildContractTerms, usePolicies } from '../../services/policies'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |

### `src/pages/customer/CustomerAccount.jsx` (trước đây: `src/CustomerAccount.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 10 | `import ContractModal from './ContractModal'` | `import ContractModal from '../../features/contract/ContractModal'` |
| 11 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 12 | `import { formatReservationCode } from './storageRules'` | `import { formatReservationCode } from '../../services/storageRules'` |
| 13 | `import DataGrid from './DataGrid'` | `import DataGrid from '../../components/common/DataGrid'` |
| 14 | `import { UnitTypeChip, getUnitTypeStyle } from './unitTypes'` | `import { UnitTypeChip, getUnitTypeStyle } from '../../features/unit/unitTypes'` |
| 15 | `import './unitTypes.css'` | `import '../../features/unit/unitTypes.css'` |
| 16 | `import { formatSignedAt } from './contractSignatures'` | `import { formatSignedAt } from '../../services/contractSignatures'` |
| 17 | `import ContractSignFlow, { CONTRACT_TERMS_VERSION } from './ContractSignFlow'` | `import ContractSignFlow, { CONTRACT_TERMS_VERSION } from '../../features/contract/ContractSignFlow'` |
| 18 | `import ContractDetailModal from './ContractDetailModal'` | `import ContractDetailModal from '../../features/contract/ContractDetailModal'` |
| 19 | `import { sendContractEmail } from './contractEmail'` | `import { sendContractEmail } from '../../api/contractEmail'` |
| 20 | `import { usePolicies } from './policies'` | `import { usePolicies } from '../../services/policies'` |
| 21 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 22 | `import { useContractRenewals, RenewalSection, RenewalModal, fmtIsoDate } from './ContractRenewal'` | `import { useContractRenewals, RenewalSection, RenewalModal, fmtIsoDate } from '../../features/contract/ContractRenewal'` |
| 23 | `import { focusContract, takePendingContractFocus } from './afterDeposit'` | `import { focusContract, takePendingContractFocus } from '../../services/afterDeposit'` |
| 24 | `import { OPEN_SECTION_EVENT, RENEW_REQUEST_KEY, clearContractSignRequest, confirmAfterDeposit, peekContractSignRequest, requestContractSign, requestRenewal, takeCustomerSection, takeRenewalRequest } from './afterDeposit'` | `import { OPEN_SECTION_EVENT, RENEW_REQUEST_KEY, clearContractSignRequest, confirmAfterDeposit, peekContractSignRequest, requestContractSign, requestRenewal, takeCustomerSection, takeRenewalRequest } from '../../services/afterDeposit'` |
| 25 | `import { useCustomerNotifications } from './customerNoticeData'` | `import { useCustomerNotifications } from '../../services/customerNoticeData'` |
| 26 | `import CustomerNotificationsPage, { NotificationsPreview } from './CustomerNotifications'` | `import CustomerNotificationsPage, { NotificationsPreview } from '../../features/notification/CustomerNotifications'` |
| 27 | `import CancelReservationModal, { retryRefund } from './CancelReservation'` | `import CancelReservationModal, { retryRefund } from '../../features/booking/CancelReservation'` |
| 28 | `import ContractCard from './ContractCard'` | `import ContractCard from '../../features/contract/ContractCard'` |
| 29 | `import { ReturnRequestModal, ReturnSection, useUnitReturns } from './UnitReturn'` | `import { ReturnRequestModal, ReturnSection, useUnitReturns } from '../../features/return/UnitReturn'` |
| 30 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'` |
| 31 | `import { payLateFeesDemo, useLateFees } from './lateFees'` | `import { payLateFeesDemo, useLateFees } from '../../api/lateFees'` |
| 32 | `import { CustomerPaymentCenter, PendingDepositBar, pendingDepositsOf } from './PendingPayments' // [THÊM] trang Thanh toán mới + nhắc đơn chưa đặt cọc` | `import { CustomerPaymentCenter, PendingDepositBar, pendingDepositsOf } from '../../features/payment/PendingPayments' // [THÊM] trang Thanh toán mới + nhắc đơn chưa đặt cọc` |
| 33 | `import { useMyInspections } from './ReturnInspection' // [THÊM 14] thông báo kết quả kiểm kho chờ xác nhận` | `import { useMyInspections } from '../../features/return/ReturnInspection' // [THÊM 14] thông báo kết quả kiểm kho chờ xác nhận` |
| 34 | `import { Code, FilterChips, Pager, UnitCodes, newestFirst, useClientPaging } from './listKit' // [THÊM] phân trang + mã nổi bật + mới nhất lên đầu` | `import { Code, FilterChips, Pager, UnitCodes, newestFirst, useClientPaging } from '../../components/common/listKit' // [THÊM] phân trang + mã nổi bật + mới nhất lên đầu` |

### `src/features/notification/CustomerNotifications.jsx` (trước đây: `src/CustomerNotifications.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { Pager, useClientPaging } from './listKit'` | `import { Pager, useClientPaging } from '../../components/common/listKit'` |

### `src/features/payment/DepositConfirm.jsx` (trước đây: `src/DepositConfirm.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { describePolicy, usePolicies } from './policies'` | `import { describePolicy, usePolicies } from '../../services/policies'` |
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |

### `src/features/facility/FacilityFloorPlan.jsx` (trước đây: `src/FacilityFloorPlan.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 3 | `import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from './unitGeometry'` | `import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'` |
| 4 | `import Unit3DViewer from './Unit3DViewer'` | `import Unit3DViewer from '../unit/Unit3DViewer'` |

### `src/pages/manager/FacilityManagerAccount.jsx` (trước đây: `src/FacilityManagerAccount.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import './styles.css'` | `import '../../styles/styles.css'` |
| 3 | `import './fmanagerstyles.css'` | `import '../../styles/fmanagerstyles.css'` |
| 4 | `import { apiGet, apiPost, apiPut, apiDelete } from './api'` | `import { apiGet, apiPost, apiPut, apiDelete } from '../../api/api'` |
| 5 | `import { mapOperationsState } from './operationsState'` | `import { mapOperationsState } from '../../mappers/operationsState'` |
| 6 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 16 | `} from './storageRules'` | `} from '../../services/storageRules'` |
| 17 | `import PriceInput from './PriceInput'` | `import PriceInput from '../../components/common/PriceInput'` |
| 18 | `import ContractDocument from './ContractDocument'` | `import ContractDocument from '../../features/contract/ContractDocument'` |
| 20 | `import { UnitTypeChip } from './unitTypes'` | `import { UnitTypeChip } from '../../features/unit/unitTypes'` |
| 21 | `import { getTodayISO } from './demoClock/demoClock'` | `import { getTodayISO } from '../../demoClock/demoClock'` |
| 22 | `import './unitTypes.css'` | `import '../../features/unit/unitTypes.css'` |
| 23 | `import { ManagerReturnInspectionsTab } from './ReturnInspection' // [THÊM 14] xác nhận & khiếu nại kết quả kiểm kho` | `import { ManagerReturnInspectionsTab } from '../../features/return/ReturnInspection' // [THÊM 14] xác nhận & khiếu nại kết quả kiểm kho` |
| 25 | `import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, markAllItemsSeen, markItemSeen, newestFirst, rowClass, timeAgo, useClientPaging } from './listKit' // [THÊM] phân trang + làm nổi mã` | `import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, markAllItemsSeen, markItemSeen, newestFirst, rowClass, timeAgo, useClientPaging } from '../../components/common/listKit' // [THÊM] phân trang + làm nổi mã` |
| 26 | `import { CONTRACT_SORTS, RESERVATION_SORTS, UNIT_SORTS, useOpsList } from './opsLists' // [THÊM] danh sách phân trang ở backend` | `import { CONTRACT_SORTS, RESERVATION_SORTS, UNIT_SORTS, useOpsList } from '../../hooks/opsLists' // [THÊM] danh sách phân trang ở backend` |

### `src/features/facility/FacilityMap.jsx` (trước đây: `src/FacilityMap.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet } from './api'` | `import { apiGet } from '../../api/api'` |

### `src/pages/staff/FacilityStaffAccount.jsx` (trước đây: `src/FacilityStaffAccount.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import "./styles.css";` | `import "../../styles/styles.css";` |
| 3 | `import "./staffstyles.css";` | `import "../../styles/staffstyles.css";` |
| 4 | `import { apiGet, apiPost, apiPut } from "./api";` | `import { apiGet, apiPost, apiPut } from "../../api/api";` |
| 5 | `import StaffReturns from "./StaffReturns"; // [MAIN-10] luồng trả kho của nhóm` | `import StaffReturns from "../../features/return/StaffReturns"; // [MAIN-10] luồng trả kho của nhóm` |
| 6 | `import { mapOperationsState } from "./operationsState";` | `import { mapOperationsState } from "../../mappers/operationsState";` |
| 7 | `import { RESERVATION_SORTS, UNIT_SORTS, useOpsList } from "./opsLists";` | `import { RESERVATION_SORTS, UNIT_SORTS, useOpsList } from "../../hooks/opsLists";` |
| 8 | `import { useDialog } from "./Dialog";` | `import { useDialog } from "../../components/common/Dialog";` |
| 9 | `import { formatReservationCode } from "./storageRules";` | `import { formatReservationCode } from "../../services/storageRules";` |
| 10 | `import { getTodayISO } from "./demoClock/demoClock";` | `import { getTodayISO } from "../../demoClock/demoClock";` |
| 11 | `import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, isNewItem, markAllItemsSeen, markItemSeen, newestFirst, rowClass, timeAgo, useClientPaging, useServerList } from "./listKit";` | `import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, isNewItem, markAllItemsSeen, markItemSeen, newestFirst, rowClass, timeAgo, useClientPaging, useServerList } from "../../components/common/listKit";` |

### `src/features/facility/FacilityUnitsMap.jsx` (trước đây: `src/FacilityUnitsMap.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 4 | `import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from './unitGeometry'` | `import { BAND_LABELS, BAND_ORDER, formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'` |

### `src/features/notification/HeaderNotificationBell.jsx` (trước đây: `src/HeaderNotificationBell.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { useCustomerNotifications } from './customerNoticeData'` | `import { useCustomerNotifications } from '../../services/customerNoticeData'` |
| 4 | `import { useContractRenewals } from './ContractRenewal'` | `import { useContractRenewals } from '../contract/ContractRenewal'` |
| 5 | `import { usePolicies } from './policies'` | `import { usePolicies } from '../../services/policies'` |
| 6 | `import { useUnitReturns } from './UnitReturn'` | `import { useUnitReturns } from '../return/UnitReturn'` |
| 7 | `import { focusContract, openCustomerSection, requestContractSign, requestRenewal } from './afterDeposit'` | `import { focusContract, openCustomerSection, requestContractSign, requestRenewal } from '../../services/afterDeposit'` |
| 8 | `import { PendingDepositBar, fmtLeft, usePendingDeposits } from './PendingPayments'` | `import { PendingDepositBar, fmtLeft, usePendingDeposits } from '../payment/PendingPayments'` |
| 9 | `import { useMyInspections } from './ReturnInspection'` | `import { useMyInspections } from '../return/ReturnInspection'` |
| 10 | `import { formatReservationCode } from './storageRules'` | `import { formatReservationCode } from '../../services/storageRules'` |

### `src/pages/manager/ManagerNav.jsx` (trước đây: `src/ManagerNav.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet } from './api'` | `import { apiGet } from '../../api/api'` |

### `src/pages/manager/ManagerPriceTable.jsx` (trước đây: `src/ManagerPriceTable.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiPut } from './api'` | `import { apiPut } from '../../api/api'` |
| 3 | `import PriceInput from './PriceInput'` | `import PriceInput from '../../components/common/PriceInput'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import { checkPriceInBand, findBand, formatArea, formatBandPrice, getArea } from './priceBands'` | `import { checkPriceInBand, findBand, formatArea, formatBandPrice, getArea } from '../../services/priceBands'` |
| 6 | `import './BusinessPriceBands.css'` | `import '../business/BusinessPriceBands.css'` |

### `src/pages/payment/PaymentResultPage.jsx` (trước đây: `src/PaymentResultPage.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 3 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import { announceDepositSuccess, announceRenewalSuccess, openCustomerSection, requestContractSign } from './afterDeposit'` | `import { announceDepositSuccess, announceRenewalSuccess, openCustomerSection, requestContractSign } from '../../services/afterDeposit'` |
| 6 | `import { clearPendingVnPay, readPendingVnPay } from './vnpay'` | `import { clearPendingVnPay, readPendingVnPay } from '../../api/vnpay'` |
| 7 | `import { cancelHeldReservations, restoreToCart, takeVnPayCartItems } from './cart'` | `import { cancelHeldReservations, restoreToCart, takeVnPayCartItems } from '../../store/cart'` |

### `src/features/payment/PendingPayments.jsx` (trước đây: `src/PendingPayments.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from './listKit'` | `import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from '../../components/common/listKit'` |
| 3 | `import { formatReservationCode } from './storageRules'` | `import { formatReservationCode } from '../../services/storageRules'` |
| 4 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 5 | `import { apiPost } from './api'` | `import { apiPost } from '../../api/api'` |
| 6 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'` |
| 7 | `import { lateFeePolicyText, payLateFeesDemo, useLateFees } from './lateFees'` | `import { lateFeePolicyText, payLateFeesDemo, useLateFees } from '../../api/lateFees'` |
| 8 | `import { fmtIsoDate } from './ContractRenewal'` | `import { fmtIsoDate } from '../contract/ContractRenewal'` |
| 9 | `import CancelReservationModal, { retryRefund } from './CancelReservation'` | `import CancelReservationModal, { retryRefund } from '../booking/CancelReservation'` |

### `src/components/common/PriceInput.jsx` (trước đây: `src/PriceInput.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { PRICE_RULES, describeVnd, formatVnd, parseVnd, roundPrice, validateMonthlyPrice } from './storageRules'` | `import { PRICE_RULES, describeVnd, formatVnd, parseVnd, roundPrice, validateMonthlyPrice } from '../../services/storageRules'` |

### `src/components/common/RentalCalendar.jsx` (trước đây: `src/RentalCalendar.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { getTodayDate } from './demoClock/demoClock'` | `import { getTodayDate } from '../../demoClock/demoClock'` |

### `src/features/return/ReturnInspection.jsx` (trước đây: `src/ReturnInspection.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from './listKit' // [THÊM] chia trang + mã nổi bật` | `import { Code, NewBadge, Pager, UnitCodes, rowClass, useClientPaging } from '../../components/common/listKit' // [THÊM] chia trang + mã nổi bật` |
| 4 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 5 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 6 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |

### `src/features/return/StaffReturns.jsx` (trước đây: `src/StaffReturns.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { Code, Pager, UnitCodes, useClientPaging } from './listKit' // [THÊM] chia trang + mã nổi bật` | `import { Code, Pager, UnitCodes, useClientPaging } from '../../components/common/listKit' // [THÊM] chia trang + mã nổi bật` |
| 3 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 4 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 5 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 6 | `import { usePolicies } from './policies'` | `import { usePolicies } from '../../services/policies'` |
| 8 | `import { getTodayISO } from './demoClock/demoClock'` | `import { getTodayISO } from '../../demoClock/demoClock'` |

### `src/features/unit/ThreeUnitScene.jsx` (trước đây: `src/ThreeUnitScene.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { magnetSnap, placeAt } from './packing'` | `import { magnetSnap, placeAt } from '../../utils/packing'` |

### `src/features/unit/Unit3DViewer.jsx` (trước đây: `src/Unit3DViewer.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 4 | `import { formatMeters, unitGeometry, unitPlanStatus } from './unitGeometry'` | `import { formatMeters, unitGeometry, unitPlanStatus } from '../../utils/unitGeometry'` |

### `src/features/unit/UnitPackPlanner.jsx` (trước đây: `src/UnitPackPlanner.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 3 | `import { PACK_ITEMS, aisleZones, autoPack, describeItems, findPosition, itemType, placeAt, remainingCapacity, sampleFurniture, volumeOf } from './packing'` | `import { PACK_ITEMS, aisleZones, autoPack, describeItems, findPosition, itemType, placeAt, remainingCapacity, sampleFurniture, volumeOf } from '../../utils/packing'` |

### `src/features/return/UnitReturn.jsx` (trước đây: `src/UnitReturn.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet, apiPost } from './api'` | `import { apiGet, apiPost } from '../../api/api'` |
| 3 | `import { useDialog } from './Dialog'` | `import { useDialog } from '../../components/common/Dialog'` |
| 4 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../../services/storageRules'` |
| 5 | `import { usePolicies } from './policies'` | `import { usePolicies } from '../../services/policies'` |
| 6 | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'` | `import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'` |
| 7 | `import { focusContract } from './afterDeposit'` | `import { focusContract } from '../../services/afterDeposit'` |
| 8 | `import './ContractSignFlow.css'` | `import '../contract/ContractSignFlow.css'` |

### `src/services/afterDeposit.js` (trước đây: `src/afterDeposit.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 1 | `import { apiPost } from './api'` | `import { apiPost } from '../api/api'` |

### `src/api/api.js` (trước đây: `src/api.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 1 | `import { SIMULATED_DATE_HEADER, getSimulatedDateISO } from './demoClock/demoClock'` | `import { SIMULATED_DATE_HEADER, getSimulatedDateISO } from '../demoClock/demoClock'` |

### `src/store/cart.js` (trước đây: `src/cart.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiPost } from './api'` | `import { apiPost } from '../api/api'` |

### `src/api/contractEmail.js` (trước đây: `src/contractEmail.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 16 | `import { contractUnits } from './ContractDocument'` | `import { contractUnits } from '../features/contract/ContractDocument'` |
| 17 | `import { describePolicy } from './policies'` | `import { describePolicy } from '../services/policies'` |
| 18 | `import { formatVnd } from './storageRules'` | `import { formatVnd } from '../services/storageRules'` |

### `src/services/customerNoticeData.js` (trước đây: `src/customerNoticeData.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 4 | `import { getTodayDate } from './demoClock/demoClock'` | `import { getTodayDate } from '../demoClock/demoClock'` |

### `src/components/common/listKit.jsx` (trước đây: `src/listKit.jsx`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet } from './api'` | `import { apiGet } from '../../api/api'` |

### `src/mappers/operationsState.js` (trước đây: `src/operationsState.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 1 | `import { DEPOSIT_MONTHS } from './storageRules'` | `import { DEPOSIT_MONTHS } from '../services/storageRules'` |

### `src/hooks/opsLists.js` (trước đây: `src/opsLists.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { parseTime, useServerList } from './listKit'` | `import { parseTime, useServerList } from '../components/common/listKit'` |
| 3 | `import { mapContract, mapReservation, mapUnit } from './operationsState'` | `import { mapContract, mapReservation, mapUnit } from '../mappers/operationsState'` |

### `src/services/policies.js` (trước đây: `src/policies.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 2 | `import { apiGet } from './api'` | `import { apiGet } from '../api/api'` |

### `src/services/storageRules.js` (trước đây: `src/storageRules.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 9 | `import { getTodayISO } from './demoClock/demoClock'` | `import { getTodayISO } from '../demoClock/demoClock'` |

### `src/utils/unitGeometry.js` (trước đây: `src/unitGeometry.js`)

| Dòng | Trước | Sau |
|---|---|---|
| 6 | `import { getBandCode } from './priceBands'` | `import { getBandCode } from '../services/priceBands'` |
