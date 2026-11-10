# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Khách hàng thuê kho (Storage Customer):** Cá nhân có nhu cầu cất giữ đồ đạc gia đình, đồ theo mùa; hộ kinh doanh cần lưu trữ hàng hóa ngắn/dài hạn. Cần tìm kho theo khu vực gần nhất, kiểm tra giá, đặt cọc giữ chỗ qua VNPay/mô phỏng, ký hợp đồng điện tử và quản lý gia hạn/trả kho online.
2. **Nhân viên cơ sở (Facility Staff):** Thực hiện nhiệm vụ đón tiếp khách tại kho, kiểm tra hiện trạng, bàn giao chìa/mã thẻ ra vào và kiểm tra hiện trường khi khách trả kho (ghi nhận hư hại, chụp ảnh).
3. **Quản lý cơ sở (Facility Manager):** Điều phối nhân viên, duyệt bàn giao, theo dõi tiến độ đơn, phân công công việc và quản lý kho trong cơ sở.
4. **Quản lý vận hành toàn hệ thống (Business Operations Manager - BOM):** Quản trị danh sách chi nhánh/cơ sở toàn quốc, thiết lập chính sách cọc, phí phạt, khung giá và theo dõi hiệu suất doanh thu.

## Product Purpose

StoreSpace là nền tảng quản lý và cho thuê kho tự quản (Self-Storage Facility Rental & Management System) khép kín, minh bạch từ bước tìm kiếm trực quan trên bản đồ đến lúc bàn giao và kết thúc hợp đồng mà không phát sinh chi phí ẩn.

## Positioning

- **Minh bạch & Tự phục vụ:** Mọi chi phí thuê, cọc và phụ phí được hiển thị rõ ràng trước khi thanh toán.
- **Mỗi kho một hợp đồng độc lập:** Khách có thể đặt gộp nhiều kho trong cùng một cơ sở nhưng mỗi kho được tách riêng 1 hợp đồng để linh hoạt xử lý sự cố, gia hạn hoặc trả trước hạn mà không ảnh hưởng kho khác.
- **Đồng bộ chu kỳ:** Các kho trong cùng đợt thuê áp dụng chung một hình thức thanh toán (theo tháng hoặc trả 1 lần) để chuẩn hóa đối soát kỳ hạn.

## Operating Context

- Sử dụng trên trình duyệt máy tính và thiết bị di động (Responsive Web).
- Tích hợp cổng thanh toán VNPay Sandbox (thẻ ATM, QR) và chế độ thanh toán mô phỏng khi thử nghiệm.
- Có công cụ **Demo Time Travel (`DemoClockWidget`)** hỗ trợ giả lập ngày tương lai phục vụ demo kịch bản quá hạn cọc, kỳ thanh toán hàng tháng và gia hạn hợp đồng.

## Capabilities and Constraints

- **Tìm kiếm đa tiêu chí:** Lọc kho theo quận/khu vực (`DistrictPicker`), loại kho (`Climate-Control`, `Basic`, `Indoor`, `Drive-up`), kích thước (`S`, `M`, `L`, `XL`), khoảng giá và bản đồ tương tác (`FacilityMap`).
- **Đặt chỗ & Giữ kho:** Giữ kho tự động trong 15 phút để khách hoàn tất đặt cọc.
- **Tiền cọc:** Áp dụng theo số tháng tiền thuê (1-2 tháng, mặc định 2 tháng), không tính theo % tổng hợp đồng.
- **Bàn giao & Trả kho:** Nhân viên kiểm tra hiện trường, lập biên bản ghi nhận hình ảnh hư hại nếu có; khách hàng xác nhận biên bản trước khi thanh toán phí đền bù.

## Brand Commitments

- **Tên thương hiệu:** StoreSpace ("Your Space. Your Freedom.").
- **Bảng màu chủ đạo:** Xanh dương tin cậy (`#073d70`, `#075a9f`), nền sáng tinh tế (`#edf6ff`, `#ffffff`), điểm nhấn cảnh báo/thông tin với cam/vàng mật ong (`#f59e0b`, `#d97706`) và xanh lá hoàn tất (`#10b981`, `#1f7a46`).
- **Ngôn ngữ:** 100% tiếng Việt tự nhiên, chuẩn mực, từ ngữ nghiệp vụ rõ ràng, không dùng tiếng Anh lẫn lộn ở giao diện người dùng.

## Product Principles

1. **Rõ ràng trước khi cam kết:** Luôn hiển thị tổng tiền đợt 1 (tiền cọc), lịch đóng tiền thuê các tháng sau và điều kiện hủy trước khi khách bấm trả tiền.
2. **Không chặn thao tác không cần thiết:** Cho phép khách xem kho, tính giá và thêm vào giỏ hàng thoải mái trước khi yêu cầu đăng nhập/đăng ký.
3. **Chính xác & Nhất quán:** Mọi định dạng tiền tệ (VNĐ), ngày tháng (DD/MM/YYYY) và mã đơn (`RS-...`) phải đồng nhất trên mọi màn hình từ khách hàng tới ban quản lý.

