# components

Component **giao diện dùng chung**, không gắn với một nghiệp vụ cụ thể (bảng dữ liệu, thanh phân trang,
hộp thoại, lịch chọn ngày...). Hiện chỉ có 1 folder con:

| Folder | Nội dung | README |
|---|---|---|
| [common/](./common/) | `DataGrid` (bảng có tìm kiếm / lọc / sắp xếp / phân trang), `listKit` (`Pager` phân trang 5 mục/trang, `useClientPaging`, `useServerList`, nhãn "Mới", mã đơn/kho), `Dialog` (hộp thoại thay `alert/confirm`), `RentalCalendar`... | [README](./common/README.md) |

Mọi trang (`pages/*`), khối nghiệp vụ (`features/*`) và `App.jsx` đều có thể dùng các component này.
Component ở đây chỉ import tầng dưới (`api`, `services`, `utils`...), không import `features/` hay `pages/`.
