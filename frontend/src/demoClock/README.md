# demoClock

Tầng **đồng hồ giả lập (Demo Clock / Time Travel)** — tầng nền phục vụ demo và kiểm thử. Cho phép chọn một ngày giả lập để thử các nghiệp vụ phụ thuộc thời gian (quá hạn, phí trễ, gia hạn, hết hạn hợp đồng...) mà không phải đợi ngày thật. Ngày giả lập lưu ở localStorage `storespace_demo_date`; `src/api/api.js` gửi nó lên backend qua header `X-Simulated-Date` (backend dùng `BusinessClock.Today`). Mọi chỗ ở frontend cần "hôm nay" nên gọi `getTodayISO()` / `getTodayDate()` thay vì `new Date()`.

## Bảng các file

| File | Chức năng | Được dùng bởi | API gọi |
|---|---|---|---|
| [demoClock.js](./demoClock.js) | Đọc / ghi / xóa ngày giả lập; "hôm nay" của hệ thống; cộng ngày / tháng; định dạng ngày | `src/api/api.js`, `src/App.jsx`, `src/demoClock/DemoClockWidget.jsx`, `src/services/storageRules.js`, `src/services/customerNoticeData.js`, `src/components/common/RentalCalendar.jsx`, `src/features/contract/ContractCard.jsx`, `src/features/return/StaffReturns.jsx`, `src/pages/customer/CartPage.jsx`, `src/pages/manager/FacilityManagerAccount.jsx`, `src/pages/staff/FacilityStaffAccount.jsx`, `src/pages/business/BusinessPanels.jsx`, `src/pages/business/BusinessPolicyEditor.jsx` | Không |
| [DemoClockWidget.jsx](./DemoClockWidget.jsx) | Nút nổi góc màn hình hiển thị ngày đang áp dụng; bảng chọn ngày, nhảy nhanh, về hôm nay; xác nhận thì tải lại trang | `src/App.jsx` | Không |
| [DemoClockWidget.css](./DemoClockWidget.css) | Định dạng giao diện cho `DemoClockWidget.jsx` (nút nổi, bảng điều chỉnh, huy hiệu "Đang giả lập") | `src/demoClock/DemoClockWidget.jsx` | — |

## Các hàm / component chính

**demoClock.js**
- `DEMO_DATE_STORAGE_KEY` (`'storespace_demo_date'`), `SIMULATED_DATE_HEADER` (`'X-Simulated-Date'`).
- `getTodayISO()` / `getTodayDate()` — "hôm nay" có tính giả lập (chuỗi / Date).
- `getRealTodayISO()` — ngày thật; `getSimulatedDateISO()` — ngày giả lập hoặc null.
- `setSimulatedDateISO(iso)` — bật/đổi (trùng ngày thật hoặc rỗng thì tắt); `clearSimulatedDate()` — tắt.
- `formatISODate(date)`, `addDaysISO(base, days)`, `addMonthsISO(base, months)`, `formatDateVN(iso)`.

**DemoClockWidget.jsx**
- `DemoClockWidget` (default) — handler `toggleOpen`, `handleConfirm` (lưu + reload), `handleResetToday` (tắt + reload).
- `ClockIcon` — biểu tượng SVG.

## Kết nối với các phần khác

- **Import từ:** chỉ `react` và localStorage (không phụ thuộc folder nào khác).
- **Được import bởi:** `src/api/api.js` (header cho MỌI request), `src/services/storageRules.js` và `src/services/customerNoticeData.js` (tính ngày còn lại / hết hạn), `src/components/common/RentalCalendar.jsx` (chặn ngày quá khứ), `src/App.jsx` (render widget, ngày tối thiểu khi đặt kho) và các trang khách / Manager / Staff / Business.

## Luồng hoạt động

1. **Chuyển sang ngày giả lập:** Bấm nút đồng hồ → `toggleOpen()` → chọn ngày hoặc bấm "+7 ngày" (`addDaysISO`) → "Xác nhận" → `setSimulatedDateISO()` ghi localStorage → `window.location.reload()` → mọi request qua `apiRequest()` gắn `X-Simulated-Date` → backend tính phí trễ / hết hạn theo ngày mới; frontend `getTodayISO()` cũng trả ngày giả lập.
2. **Về ngày thật:** Bấm "Về hôm nay" → `clearSimulatedDate()` → reload.
