---
name: StoreSpace
description: Nền tảng quản lý và cho thuê kho tự quản thông minh, minh bạch
colors:
  primary: "#075a9f"
  primary-dark: "#073d70"
  primary-soft: "#edf6ff"
  primary-border: "#b8daf8"
  accent-warn: "#f59e0b"
  accent-warn-soft: "#fef3c7"
  accent-success: "#10b981"
  accent-success-soft: "#e7f6ed"
  neutral-bg: "#f8fafc"
  neutral-card: "#ffffff"
  text-main: "#0b3967"
  text-muted: "#4b6884"
  border-subtle: "#e2e8f0"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.2
  heading:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
---

# Design System - StoreSpace

## Overview
StoreSpace mang ngôn ngữ thiết kế tin cậy, chuyên nghiệp và minh bạch, lấy cảm hứng từ các dịch vụ tự quản hiện đại. Giao diện ưu tiên tính rõ ràng, cấu trúc thẻ (Card-based) có tổ chức cao, các điểm nhấn trạng thái trực quan và loại bỏ hoàn toàn các yếu tố gây rối mắt.

## Colors
- **Màu chủ đạo (Primary):** Xanh dương biển sâu (`#075a9f`, `#073d70`) thể hiện sự an toàn, bảo mật và uy tín đối với tài sản của khách.
- **Màu nền & Phụ trợ (Surfaces):** Nền web dịu nhẹ (`#f8fafc`), bề mặt thẻ trắng tinh khiết (`#ffffff`), các khối thông tin/banner dùng xanh nhạt dịu mắt (`#edf6ff`) với viền mềm (`#b8daf8`).
- **Trạng thái & Nhãn (Semantic Tokens):**
  - *Thành công / Còn trống / Đã cọc:* Xanh lá (`#10b981`, nền `#e7f6ed`).
  - *Cảnh báo / Giữ chỗ / Chờ cọc:* Vàng cam ấm (`#f59e0b`, nền `#fef3c7`).
  - *Lỗi / Đã hủy / Hết kho:* Đỏ hồng dịu (`#ef4444`, nền `#fee2e2`).

## Typography
- **Phông chữ duy nhất:** `Be Vietnam Pro` (hỗ trợ hiển thị tiếng Việt hoàn hảo, nét chữ hình học hiện đại, dễ đọc trên cả màn hình nhỏ).
- **Hệ phân cấp (Hierarchy):**
  - **Eyebrow:** Chữ in hoa nhỏ, nét dày (`font-size: 11px; font-weight: 800; letter-spacing: 0.08em`) dùng để phân loại ngữ cảnh màn hình (`CUSTOMER / MY CART / DEPOSIT`).
  - **Tiêu đề (Headings):** Nét đậm (`font-weight: 800`), màu xanh đậm `#073d70`.
  - **Số tiền & Mã kho:** Luôn dùng `font-weight: 800` để khách hàng nắm bắt ngay các con số quan trọng.

## Layout & Hierarchy
- **Lưới & Khoảng cách:** Cấu trúc 2 cột linh hoạt (`cart-layout`, `fm-layout`) trên desktop và co về 1 cột trực quan trên thiết bị di động.
- **Thẻ độc lập (Card Anatomy):** Mọi nhóm nghiệp vụ (Kho đã chọn, Lịch thuê, Hình thức thanh toán, Tóm tắt đơn) được đóng gói trong từng khung thẻ (`cart-card`, `fm-card`) có viền nhẹ và bo góc mềm mại.

## Elevation & Depth
- Tránh đổ bóng dày đặc hoặc bóng đen gắt.
- Sử dụng bóng đổ nhẹ đa lớp với tông xanh nhạt: `box-shadow: 0 4px 16px rgba(7, 45, 90, 0.08)` hoặc `0 12px 28px rgba(7, 45, 90, 0.16)` cho các modal nổi (như `DemoClockWidget`).

## Shapes & Forms
- **Bo góc (Border Radius):** Nhất quán theo hệ thống:
  - Nút bấm & ô nhập liệu: `10px`.
  - Khung thẻ nội dung & Banner thông báo: `14px` - `16px`.
  - Tag / Pill / Badge trạng thái: `999px` (dạng viên thuốc).

## Components
- **Banner thông báo (`cart-bundle-banner`):** Có icon tròn bên trái, tiêu đề in đậm và nội dung giải thích rõ ràng, nền xanh nhạt viền xanh dương.
- **Bảng tóm tắt đơn:** Đặt dòng tổng thanh toán đợt 1 / tiền cọc ở vị trí nổi bật nhất.
- **Bản đồ cơ sở (`FacilityMap`):** Ghim tương tác, danh sách bên cạnh có thể click để điều hướng nhanh.

## Do's and Don'ts
- **NÊN:** Luôn hiển thị đơn vị tiền tệ rõ ràng kèm ký hiệu `đ` và dấu phân cách hàng nghìn (VD: `1.200.000đ`).
- **NÊN:** Mọi thao tác quan trọng (đặt cọc, hủy, đổi ngày) phải có dialog xác nhận bằng tiếng Việt.
- **KHÔNG NÊN:** Trộn lẫn từ ngữ tiếng Anh và tiếng Việt trong nhãn nút bấm hoặc thông báo hệ thống.
- **KHÔNG NÊN:** Dùng màu đỏ cho các thông tin thông thường; chỉ dùng đỏ cho cảnh báo hủy bỏ hoặc lỗi nghiêm trọng.

