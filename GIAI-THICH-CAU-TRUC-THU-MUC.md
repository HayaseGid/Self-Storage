# 📁 GIẢI THÍCH CHI TIẾT CẤU TRÚC THƯ MỤC & TỆP TIN Ở THƯ MỤC GỐC (ROOT)

Tài liệu này phân loại chi tiết toàn bộ các thư mục và tệp tin nằm ở ngoài cùng (thư mục gốc) của dự án **StoreSpace (Self-Storage)**.

Mỗi mục được gắn nhãn theo mức độ quan trọng:
- 🔴 **[CỐT LÕI - KHÔNG ĐƯỢC XÓA]**: Thành phần sống còn của hệ thống. Xóa sẽ gây lỗi build, mất mã nguồn, mất lịch sử Git hoặc hỏng deploy.
- 🟡 **[THÔNG TIN - NÊN GIỮ / GOM VÀO DOCS]**: Chứa tài liệu nghiệp vụ, hướng dẫn chạy, tài khoản test, kiến trúc luồng dữ liệu. Có thể giữ lại để phục vụ làm đồ án, viết báo cáo hoặc gom vào thư mục tài liệu.
- 🟢 **[DƯ THỪA / CÓ THỂ XÓA]**: File nén backup cũ, file log lịch sử đã xong, cache công cụ. Xóa đi **không hề ảnh hưởng** tới hoạt động của website hay backend.

---

## I. CÁC THƯ MỤC Ở THƯ MỤC GỐC (ROOT FOLDERS)

| Tên thư mục | Mức độ | Mục đích & Ý nghĩa | Có thể xóa không? |
| :--- | :---: | :--- | :--- |
| **`backend/`** | 🔴 **CỐT LÕI** | Chứa toàn bộ mã nguồn API ASP.NET Core (.NET 10), Controller, Service, Repository, Database Seeder, DbContext kết nối Neon PostgreSQL. | ❌ **Tuyệt đối không xóa** |
| **`frontend/`** | 🔴 **CỐT LÕI** | Chứa toàn bộ giao diện người dùng React + Vite: Khách hàng (Customer), Quản lý cơ sở (Facility Manager), Nhân viên (Staff), Vận hành tổng (BOM), Quản trị viên (Admin). | ❌ **Tuyệt đối không xóa** |
| **`.git/`** *(ẩn)* | 🔴 **CỐT LÕI** | Thư mục dữ liệu Git nội bộ, lưu toàn bộ lịch sử commit, các nhánh (branch), liên kết tới GitHub. | ❌ **Tuyệt đối không xóa** *(xóa sẽ mất liên kết Git)* |
| **`database/`** | 🟡 **THÔNG TIN** | Chứa script SQL khởi tạo bảng, quan hệ, dữ liệu mẫu ban đầu (`SelfStorageDB_test.sql`). Dùng khi cần đọc cấu trúc bảng hoặc dựng lại CSDL mới. | ⚠️ **Nên giữ lại** để làm tài liệu báo cáo đồ án. |
| **`thong_tin/`** | 🟡 **THÔNG TIN** | Chứa danh sách tài khoản demo các vai trò (`ThongTinTaiKhoan.txt`) và tài liệu nghiệp vụ đề tài do giảng viên cung cấp. | ⚠️ **Nên giữ lại** để biết tài khoản đăng nhập khi test và bảo vệ đồ án. |
| **`.vscode/`** | 🟢 **TIỆN ÍCH** | Chứa cấu hình môi trường soạn thảo của VS Code (`settings.json`, `launch.json`). | ✅ **Có thể xóa**, không ảnh hưởng đến code hay build. |
| **`.agents/`** | 🟢 **CÔNG CỤ** | Thư mục chứa các tài liệu quy chuẩn (Skill) hỗ trợ trợ lý ảo AI (Neon CLI, prompt hướng dẫn). | ✅ **Có thể xóa** nếu không dùng Agent chuyên sâu. |
| **`.tools/`** | 🟢 **CÔNG CỤ** | Chứa node runtime phụ trợ do công cụ tự tạo. | ✅ **Có thể xóa**, dự án chính dùng node trong `frontend/` và máy host. |
| **`node_modules/`** *(ở root)* | 🟢 **PHỤ TRỢ** | Chứa thư viện phụ trợ ở tầng root (cho `neon.ts`). Frontend có riêng thư mục `frontend/node_modules/` để chạy web. | ✅ **Có thể xóa** để giải phóng dung lượng ổ cứng. |
| **`graphify-out/`** | 🟢 **RÁC TẠM** | Thư mục đầu ra do công cụ phân tích đồ thị quan hệ mã nguồn (Graphify) sinh ra (gồm cache, json, báo cáo html). | ✅ **Xóa an toàn 100%**, không dính dáng gì đến mã nguồn dự án. |

---

## II. CÁC TỆP TIN Ở THƯ MỤC GỐC (ROOT FILES)

### 1. Nhóm cấu hình dự án & triển khai (🔴 CỐT LÕI)
*Các file này quyết định việc đóng gói, cài đặt và deploy ứng dụng lên Vercel/Docker:*

- **`.gitignore`**: Cấu hình các file và thư mục mà Git không được đẩy lên GitHub (ví dụ: `node_modules`, `bin/`, `obj/`, `.env`). **(Bắt buộc)**
- **`package.json`** *(ở root)*: Khai báo script `"build": "npm --prefix frontend run build"`. Vercel và CI/CD đọc file này từ thư mục gốc để tự động build frontend. **(Bắt buộc)**
- **`package-lock.json`** *(ở root)*: Khóa phiên bản các package phụ thuộc ở root. **(Bắt buộc đi kèm package.json)**
- **`Dockerfile`**: Kịch bản đóng gói ứng dụng chạy trong môi trường Docker Container. **(Quan trọng nếu triển khai Docker)**
- **`neon.ts`**: Cấu hình phân nhánh dữ liệu tự động cho Neon Database CLI. **(Nên giữ)**

---

### 2. Nhóm tài liệu & hướng dẫn nghiệp vụ (🟡 MANG Ý NGHĨA THÔNG TIN)
*Rất hữu ích khi viết báo cáo môn học, bảo vệ đồ án hoặc giải thích luồng cho thành viên trong nhóm:*

- **`API_DOCUMENTATION.md`**: Bản mô tả đầy đủ các RESTful API của hệ thống (Endpoint, Method, Request/Response).
- **`HUONG-DAN-VNPAY.md`**: Tài liệu hướng dẫn cấu hình, thanh toán online và tài khoản thẻ test cổng VNPay Sandbox.
- **`luong_du_lieu.md`**: Sơ đồ phân tích luồng dữ liệu (Data flow) giữa các Actor và bảng cơ sở dữ liệu.
- **`GIA-HAN-HOP-DONG.md`**: Tài liệu đặc tả chức năng tự động tính kỳ hạn và gia hạn hợp đồng thuê kho.
- **`TRA-KHO.md`**: Hướng dẫn quy trình nghiệp vụ trả kho, kiểm tra hiện trạng và thanh quyết toán cọc.
- **`PHAN-TRANG-VA-UI.md`**: Tài liệu chuẩn hóa giao diện, thanh công cụ tìm kiếm, sắp xếp và phân trang.
- **`README.md`**: Giới thiệu tổng quan hệ thống StoreSpace theo tiêu chuẩn kho GitHub.
- **`CLAUDE.md`**: Bản ghi nhớ quy chuẩn code và hướng dẫn cấu trúc dự án cho trợ lý lập trình.
- **`DOC-TRUOC.txt` / `HUONG-DAN.txt` / `HUONG-DAN-14.txt`**: Các file ghi chú nhanh quá trình chạy thử hoặc lưu ý khi dev.

---

### 3. Nhóm file tạm thời & lịch sử (🟢 CÓ THỂ XÓA AN TOÀN)
*Các file này đã hoàn thành vai trò lịch sử hoặc là file nén dự phòng, xóa đi hoàn toàn không ảnh hưởng gì tới code hay trang web:*

1. **`StoreSpace-dot-1.zip`** *(186 KB)*:
   - File nén backup mã nguồn cũ ở Đợt 1.
   - **Khuyến nghị**: **NÊN XÓA** để repo sạch sẽ, vì toàn bộ code đã nằm trên Git.
2. **`DOT-1-SUA-LOI.md`**:
   - File nhật ký ghi lại các lỗi đã sửa trong đợt đầu.
   - **Khuyến nghị**: Có thể xóa nếu không cần đọc lại lịch sử cũ.
3. **`SUA-LOI-P1.md`**:
   - Ghi chú các lỗi giao diện và API đã được xử lý trong đợt 1.
   - **Khuyến nghị**: Có thể xóa hoặc gom vào thư mục lưu trữ.
4. **`SUA-LOI-TRA-KHO.md`**:
   - Ghi chú quá trình sửa lỗi nghiệp vụ trả kho (đã hoàn tất và merge vào code).
   - **Khuyến nghị**: Có thể xóa.
5. **`skills-lock.json`**:
   - File sinh tự động khi cài các extension agent skill.
   - **Khuyến nghị**: Có thể xóa nếu muốn dọn sạch.

---

## III. TỔNG KẾT HÀNH ĐỘNG KHUYẾN NGHỊ NẾU MUỐN DỌN DẸP REPO

Nếu bạn muốn thư mục gốc nhìn gọn gàng, chuyên nghiệp như các dự án lớn:
1. **Có thể xóa ngay**:
   - `StoreSpace-dot-1.zip`
   - `graphify-out/`
   - Các file nhật ký fix lỗi cũ: `DOT-1-SUA-LOI.md`, `SUA-LOI-P1.md`, `SUA-LOI-TRA-KHO.md`.
2. **Gom các file tài liệu vào 1 thư mục riêng**:
   - Gom `API_DOCUMENTATION.md`, `HUONG-DAN-VNPAY.md`, `luong_du_lieu.md`, `GIA-HAN-HOP-DONG.md`, `TRA-KHO.md`, `PHAN-TRANG-VA-UI.md` vào thư mục `thong_tin/` hoặc tạo thư mục `docs/`.
3. **Giữ nguyên ở root**:
   - `backend/`, `frontend/`, `database/`, `.gitignore`, `package.json`, `package-lock.json`, `Dockerfile`, `README.md`.

