/**
 * ======================================================================
 * FILE: src/pages/admin/AdminAccount.jsx  —  TRANG QUẢN TRỊ HỆ THỐNG (SYSTEM ADMIN)
 * CHỨC NĂNG: Màn hình dành cho tài khoản System Administrator. Có thanh menu bên trái gồm 5 mục:
 *   Tổng quan · Duyệt tài khoản (nhân sự đăng ký chờ duyệt) · Tất cả tài khoản (tìm/lọc/phân trang + chi tiết)
 *   · Vai trò & quyền (mô tả từng vai trò) · Nhật ký hoạt động. Admin có thể duyệt / từ chối, khóa / mở khóa,
 *   đổi vai trò và đặt lại mật khẩu cho tài khoản.
 * THÀNH PHẦN CHÍNH:
 *   - roleOptions: danh sách vai trò có thể gán cho tài khoản.
 *   - Admin (export default): component trang quản trị.
 *     + loadAdminData / updateUser / resetPassword: các hàm gọi API.
 *     + approveUser / rejectUser / toggleLock / changeRole: thao tác trên 1 tài khoản (gọi updateUser).
 *     + renderDashboard / renderPending / renderUsers / renderUserDetail / renderRoles / renderLogs: vẽ từng màn hình.
 * DÙNG Ở: src/App.jsx (hiển thị khi người dùng đăng nhập có vai trò SYSTEM_ADMIN).
 * PHỤ THUỘC: api/api (apiGet, apiPut), components/common/Dialog (hộp thoại xác nhận),
 *   components/common/listKit (useServerList phân trang, Pager, NewBadge, rowClass, timeAgo...), AdminAccount.css.
 * API (AdminController):
 *   GET /api/admin/users                    -> danh sách tài khoản (có thể kèm ?page=&pageSize=&q=&status=&role= qua useServerList)
 *   GET /api/admin/activity                 -> nhật ký hoạt động (có thể phân trang qua useServerList)
 *   PUT /api/admin/users/{userId}           -> body { roleName, status }: duyệt / từ chối / khóa / mở khóa / đổi vai trò
 *   PUT /api/admin/users/{userId}/password  -> body { password }: đặt lại mật khẩu
 * LUỒNG: mở trang -> loadAdminData tải users + logs -> admin chọn menu (activeMenu) -> bấm nút thao tác
 *   (vd "Khóa tài khoản") -> hỏi xác nhận bằng dialog -> updateUser gọi PUT -> tải lại dữ liệu -> hiện toast.
 * ======================================================================
 */
import React, { useEffect, useMemo, useState } from "react";
import { NewBadge, Pager, newestFirst, parseTime, rowClass, timeAgo, useServerList } from "../../components/common/listKit"; // phân trang ở backend + tô sáng bản ghi mới
import "./AdminAccount.css";
import { apiGet, apiPut } from "../../api/api";
import { useDialog } from "../../components/common/Dialog";

/** Các vai trò admin có thể gán cho tài khoản (dùng cho ô lọc và ô "Thay đổi role"). */
const roleOptions = [
  "Storage Customer",
  "Facility Staff",
  "Facility Manager",
  "Business Operations Manager",
];

/**
 * Trang quản trị hệ thống: tải danh sách tài khoản + nhật ký từ backend, cung cấp các thao tác
 * quản lý tài khoản và vẽ màn hình con tương ứng với mục menu đang chọn (activeMenu).
 * Đăng xuất sẽ xóa phiên đăng nhập trong localStorage.
 * Được gọi bởi: App.jsx khi người dùng hiện tại là System Admin.
 * @returns {JSX.Element} bố cục trang gồm sidebar menu + nội dung chính + toast.
 */
function Admin() {
  const dialog = useDialog();
  const [activeMenu, setActiveMenu] = useState("dashboard"); // 'dashboard' | 'pending' | 'users' | 'roles' | 'logs'
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false); // đang gửi thao tác cập nhật -> hiện "Đang lưu thay đổi..."
  const [selectedUser, setSelectedUser] = useState(null); // tài khoản đang xem chi tiết
  // Tài khoản đang xem có được đổi vai trò không: { userId, loading, canChangeRole, blockers[], error }
  const [roleCheck, setRoleCheck] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [logSearch, setLogSearch] = useState("");
  const [toast, setToast] = useState("");

  /**
   * Tải song song danh sách tài khoản và nhật ký hoạt động, đổi thời gian nhật ký sang dạng hiển thị vi-VN
   * rồi lưu vào state users / logs. Báo lỗi nếu backend không trả về mảng.
   * API: GET /api/admin/users + GET /api/admin/activity
   * Được gọi khi: mở trang (useEffect) và sau mỗi lần cập nhật tài khoản / đặt lại mật khẩu.
   */
  const loadAdminData = async () => {
    setLoading(true);
    setError("");
    try {
      const [userData, activityData] = await Promise.all([
        apiGet("/api/admin/users"),
        apiGet("/api/admin/activity"),
      ]);
      if (!Array.isArray(userData) || !Array.isArray(activityData)) {
        throw new Error("Backend trả về dữ liệu quản trị không hợp lệ.");
      }
      setUsers(userData);
      setLogs(activityData.map((log) => ({
        id: log.id,
        at: log.time,
        time: new Date(log.time).toLocaleString("vi-VN"),
        actor: log.actor,
        action: log.action,
        target: log.target,
        type: log.type,
      })));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  // Chạy 1 lần khi mở trang: tải dữ liệu quản trị.
  useEffect(() => { loadAdminData(); }, []);

  // Hiện thông báo nhỏ (toast) góc màn hình trong 2,5 giây; hẹn giờ lưu ở window để hủy hẹn giờ cũ khi có toast mới.
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = window.setTimeout(() => setToast(""), 2500);
  };

  /**
   * Cập nhật vai trò + trạng thái 1 tài khoản, tải lại dữ liệu, đồng bộ khung chi tiết đang mở và hiện toast.
   * Lỗi thì hiện hộp thoại báo lỗi.
   * API: PUT /api/admin/users/{id}  body { roleName, status }
   * Được gọi bởi: approveUser, rejectUser, toggleLock, changeRole.
   * @param {number} id mã tài khoản.
   * @param {string} role vai trò mới (giữ nguyên nếu chỉ đổi trạng thái).
   * @param {string} status trạng thái mới: 'Active' | 'Rejected' | 'Locked' ...
   * @param {string} successMessage câu hiện trong toast khi thành công.
   */
  const updateUser = async (id, role, status, successMessage) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await apiPut(`/api/admin/users/${id}`, { roleName: role, status });
      await loadAdminData();
      setSelectedUser((current) => current?.id === id ? { ...current, role, status } : current);
      showToast(successMessage);
    } catch (updateError) {
      setError(updateError.message);
      void dialog.alert({ tone: "danger", title: "Không cập nhật được tài khoản", message: updateError.message });
    } finally {
      setSaving(false);
      if (selectedUser?.id === id) void loadRoleCheck(id);
    }
  };

  // Duyệt tài khoản đang chờ (status -> Active). Chạy khi bấm "Duyệt tài khoản".
  const approveUser = (id) => {
    const user = users.find((item) => item.id === id);
    if (user) void updateUser(id, user.role, "Active", `Đã duyệt tài khoản ${user.username}`);
  };

  // Từ chối tài khoản đang chờ (hỏi xác nhận, status -> Rejected). Chạy khi bấm "Từ chối".
  const rejectUser = async (id) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const confirmed = await dialog.confirm({
      tone: "danger",
      title: `Từ chối tài khoản ${user.username}?`,
      message: "Người dùng này sẽ không thể đăng nhập vào hệ thống.",
      confirmLabel: "Từ chối",
    });
    if (confirmed) void updateUser(id, user.role, "Rejected", `Đã từ chối tài khoản ${user.username}`);
  };

  // Khóa / mở khóa tài khoản (status Active <-> Locked; chỉ hỏi xác nhận khi khóa). Chạy khi bấm nút khóa/mở khóa ở khung chi tiết.
  const toggleLock = async (id) => {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    const nextStatus = user.status === "Locked" ? "Active" : "Locked";
    if (nextStatus === "Locked") {
      const confirmed = await dialog.confirm({
        tone: "danger",
        title: `Khóa tài khoản ${user.username}?`,
        message: "Người dùng sẽ bị đăng xuất khỏi các thao tác tiếp theo và không thể đăng nhập cho đến khi được mở khóa.",
        confirmLabel: "Khóa tài khoản",
      });
      if (!confirmed) return;
    }
    void updateUser(id, user.role, nextStatus, `${nextStatus === "Locked" ? "Đã khóa" : "Đã mở khóa"} ${user.username}`);
  };

  /**
   * Kiểm tra tài khoản có đang trống để đổi vai trò không (không còn đơn thuê, nợ, việc được giao, cơ sở quản lý...).
   * API: GET /api/admin/users/{id}/role-eligibility -> { canChangeRole, blockers[] }
   * Gọi khi mở chi tiết 1 tài khoản và sau mỗi lần cập nhật tài khoản đó.
   */
  const loadRoleCheck = async (id) => {
    setRoleCheck({ userId: id, loading: true, canChangeRole: false, blockers: [], error: "" });
    try {
      const data = await apiGet(`/api/admin/users/${id}/role-eligibility`);
      setRoleCheck({ userId: id, loading: false, canChangeRole: !!data?.canChangeRole, blockers: data?.blockers || [], error: "" });
    } catch (checkError) {
      setRoleCheck({ userId: id, loading: false, canChangeRole: false, blockers: [], error: checkError.message });
    }
  };
  // Chạy khi đổi tài khoản đang xem: tải lại điều kiện đổi vai trò.
  useEffect(() => {
    if (selectedUser?.id) void loadRoleCheck(selectedUser.id);
    else setRoleCheck(null);
  }, [selectedUser?.id]);

  // Đổi vai trò của tài khoản (hỏi xác nhận, giữ nguyên trạng thái). Chạy khi chọn ô "Thay đổi role".
  // Chỉ đổi được khi tài khoản trống hoàn toàn (roleCheck.canChangeRole); backend cũng chặn và trả lý do.
  const changeRole = async (id, newRole) => {
    const user = users.find((item) => item.id === id);
    if (!user || user.role === newRole) return;
    const confirmed = await dialog.confirm({
      tone: "warning",
      title: `Đổi role của ${user.username}?`,
      message: `Từ "${user.role}" sang "${newRole}". Quyền truy cập của người dùng sẽ thay đổi ngay.`,
      confirmLabel: "Đổi role",
    });
    if (confirmed) void updateUser(id, newRole, user.status, `Đã đổi role của ${user.username}`);
  };

  /**
   * Đặt lại mật khẩu cho tài khoản: kiểm tra mật khẩu mới >= 6 ký tự và khớp ô xác nhận, hỏi xác nhận rồi gửi;
   * thành công thì xóa 2 ô mật khẩu, tải lại dữ liệu và hiện toast.
   * API: PUT /api/admin/users/{userId}/password  body { password }
   * Được gọi khi: submit form "Đặt lại mật khẩu" trong khung chi tiết tài khoản.
   * @param {object} user tài khoản cần đặt lại mật khẩu (cần id, username).
   */
  const resetPassword = async (user) => {
    if (newPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }
    const confirmed = await dialog.confirm({
      tone: "warning",
      title: `Đặt lại mật khẩu cho ${user.username}?`,
      message: "Mật khẩu hiện tại sẽ được thay thế. Mật khẩu mới không thể xem lại sau khi lưu.",
      confirmLabel: "Đặt lại mật khẩu",
    });
    if (!confirmed) return;

    setSaving(true);
    setError("");
    try {
      await apiPut(`/api/admin/users/${user.id}/password`, { password: newPassword });
      setNewPassword("");
      setConfirmPassword("");
      await loadAdminData();
      showToast(`Đã đặt lại mật khẩu cho ${user.username}`);
    } catch (resetError) {
      setError(resetError.message);
      void dialog.alert({ tone: "danger", title: "Không đặt lại được mật khẩu", message: resetError.message });
    } finally {
      setSaving(false);
    }
  };

  // Danh sách tài khoản nhân sự đang chờ duyệt (không tính khách hàng).
  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "Pending" && user.role !== "Storage Customer"),
    [users]
  );

  // Lọc tài khoản theo ô tìm kiếm, vai trò và trạng thái (tính trên toàn bộ users đã tải).
  // Lưu ý: hiện không màn hình nào dùng biến này (màn hình Tài khoản dùng userList bên dưới).
  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [user.name, user.username, user.email, user.facility].some((value) => value.toLowerCase().includes(q));
    const matchesRole = roleFilter === "All" || user.role === roleFilter;
    const matchesStatus = statusFilter === "All" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  }), [users, search, roleFilter, statusFilter]);

  // Lọc nhật ký hoạt động theo ô tìm kiếm (hiện cũng không được dùng; màn hình Nhật ký dùng logList).
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const q = logSearch.trim().toLowerCase();
    return !q || [log.actor, log.action, log.target].some((value) => value.toLowerCase().includes(q));
  }), [logs, logSearch]);

  // [PHÂN TRANG] Màn hình "Tất cả tài khoản": nhờ backend lọc + chia trang (GET /api/admin/users?page=&q=&status=&role=),
  // tài khoản mới tạo lên đầu. Chỉ chạy khi đang mở menu 'users'; tải lại khi users đổi (reloadKey).
  // Nếu backend trả cả mảng (không phân trang) -> dùng `fallback` để tự lọc/sắp xếp/chia trang ở frontend.
  const userList = useServerList({
    path: "/api/admin/users",
    q: search,
    status: statusFilter === "All" ? "" : statusFilter.toUpperCase(),
    extra: { role: roleFilter === "All" ? undefined : roleFilter },
    reloadKey: users,
    enabled: activeMenu === "users",
    fallback: {
      rows: roleFilter === "All" ? users : users.filter((u) => u.role === roleFilter),
      // Tìm kiếm tài khoản khi phải chia trang ở frontend: khớp tên, username, email, cơ sở.
      match: (u, { q }) => !q || [u.name, u.username, u.email, u.facility].some((v) => String(v || "").toLowerCase().includes(q)),
      // Mã trạng thái của tài khoản (viết hoa) để lọc khi chia trang ở frontend.
      statusOf: (u) => String(u.status || "").toUpperCase(),
      // Sắp xếp tài khoản mới tạo lên đầu (rồi theo id giảm dần).
      compare: (a, b) => (parseTime(b.createdAt) || 0) - (parseTime(a.createdAt) || 0) || b.id - a.id,
    },
  });
  // [PHÂN TRANG] Màn hình "Nhật ký hoạt động" (GET /api/admin/activity?page=&q=), mới nhất lên đầu; chỉ chạy khi mở menu 'logs'.
  const logList = useServerList({
    path: "/api/admin/activity",
    q: logSearch,
    reloadKey: logs,
    enabled: activeMenu === "logs",
    fallback: { rows: logs, match: (l, { q }) => !q || [l.actor, l.action, l.target].some((v) => String(v || "").toLowerCase().includes(q)), compare: () => 0 },
  });
  // Dòng nhật ký để vẽ bảng: dữ liệu từ server cần đổi thời gian sang dạng vi-VN; dữ liệu fallback đã đổi sẵn trong loadAdminData.
  const logRows = logList.mode === "server"
    ? logList.items.map((l) => ({ ...l, at: l.time, time: new Date(l.time).toLocaleString("vi-VN") }))
    : logList.items;

  // Chọn 1 tài khoản để xem chi tiết (bấm vào dòng / nút "Xem"): xóa 2 ô mật khẩu và cuộn mượt tới khung chi tiết.
  const selectUser = (user) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => document.getElementById("admin-user-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  // Đăng xuất (nút "Đăng xuất" ở sidebar): xóa khóa storespace_current_user trong localStorage rồi tải lại trang chủ.
  const logout = () => {
    localStorage.removeItem("storespace_current_user");
    window.location.href = "/";
  };

  // Vẽ nhãn trạng thái tài khoản có màu theo trạng thái.
  const renderStatus = (status) => <span className={`admin-status admin-status-${status.toLowerCase()}`}>{status}</span>;

  // Vẽ màn hình "Tài khoản chờ duyệt" (nút Duyệt / Từ chối).
  const renderPending = () => (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div>
          <p className="admin-eyebrow">ACCOUNT APPROVAL</p>
          <h2>Duyệt tài khoản</h2>
          <p>Duyệt các role nghiệp vụ trước khi cấp quyền truy cập hệ thống. Customer được kích hoạt trực tiếp.</p>
        </div>
        <span className="admin-count-badge">{pendingUsers.length} chờ duyệt</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Người dùng</th><th>Tài khoản</th><th>Role đăng ký</th><th>Cơ sở</th><th>Ngày đăng ký</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {pendingUsers.length === 0 ? <tr><td colSpan="7" className="admin-empty">Không có tài khoản đang chờ duyệt.</td></tr> : newestFirst(pendingUsers, { date: (u) => u.createdAt }).map((user) => (
              <tr key={user.id} onClick={() => selectUser(user)} className={rowClass(user.createdAt, "admin-clickable-row")}>
                <td><strong>{user.name} <NewBadge createdAt={user.createdAt} /></strong><small>{user.email}</small></td>
                <td>{user.username}</td><td>{user.role}</td><td>{user.facility}</td><td>{user.createdAt}</td><td>{renderStatus(user.status)}</td>
                <td><button className="admin-link-button" onClick={(e) => { e.stopPropagation(); selectUser(user); }}>Xem</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && selectedUser.status === "Pending" && (
        <div className="admin-approval-actions">
          <div><strong>{selectedUser.name}</strong><span>Đang xem tài khoản {selectedUser.username}</span></div>
          <div className="admin-action-group"><button className="admin-button admin-button-danger" onClick={() => rejectUser(selectedUser.id)}>Từ chối</button><button className="admin-button admin-button-primary" onClick={() => approveUser(selectedUser.id)}>Duyệt tài khoản</button></div>
        </div>
      )}
    </section>
  );

  // Vẽ màn hình "Quản lý tài khoản": tìm kiếm, lọc vai trò/trạng thái, bảng phân trang, khung chi tiết.
  const renderUsers = () => (
    <section className="admin-section">
      <div className="admin-section-heading">
        <div><p className="admin-eyebrow">USER MANAGEMENT</p><h2>Quản lý tài khoản</h2><p>Xem thông tin, role, cơ sở và trạng thái của toàn bộ tài khoản.</p></div>
      </div>
      <div className="admin-toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, tài khoản, email, cơ sở..." />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}><option value="All">Tất cả role</option>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="All">Tất cả trạng thái</option><option>Active</option><option>Pending</option><option>Locked</option><option>Rejected</option></select>
      </div>
      {userList.error && <div className="ss-error-line" role="alert">{userList.error}</div>}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Người dùng</th><th>Tài khoản</th><th>Role</th><th>Cơ sở</th><th>Trạng thái</th><th>Ngày tạo</th><th>Đăng nhập gần nhất</th></tr></thead><tbody>
        {userList.loading && userList.items.length === 0 && <tr><td colSpan="7" className="admin-empty">Đang tải tài khoản…</td></tr>}
        {!userList.loading && userList.items.length === 0 && <tr><td colSpan="7" className="admin-empty">Không có tài khoản phù hợp.</td></tr>}
        {userList.items.map((user) => <tr key={user.id} onClick={() => selectUser(user)} className={rowClass(user.createdAt, "admin-clickable-row")}><td><strong>{user.name} <NewBadge createdAt={user.createdAt} /></strong><small>{user.email}</small></td><td><span className="admin-username">{user.username}</span></td><td>{user.role}</td><td>{user.facility}</td><td>{renderStatus(user.status)}</td><td>{user.createdAt}<small>{timeAgo(user.createdAt)}</small></td><td>{user.lastLogin}</td></tr>)}
      </tbody></table></div>
      <Pager {...userList.pagerProps} unit="tài khoản" />
      {selectedUser && renderUserDetail(selectedUser)}
    </section>
  );

  // Vẽ khung chi tiết 1 tài khoản: thông tin, đổi vai trò, khóa/mở khóa, đặt lại mật khẩu.
  const renderUserDetail = (user) => (
    <div className="admin-detail" id="admin-user-detail">
      <div className="admin-detail-header"><div><p className="admin-eyebrow">ACCOUNT DETAIL</p><h3>{user.name}</h3><p>{user.username} · {renderStatus(user.status)}</p></div><button className="admin-button admin-button-light" onClick={() => setSelectedUser(null)}>Ẩn chi tiết</button></div>
      <div className="admin-detail-grid">
        <div><span>Họ tên</span><strong>{user.name}</strong></div><div><span>Tài khoản</span><strong>{user.username}</strong></div><div><span>Email</span><strong>{user.email}</strong></div><div><span>Số điện thoại</span><strong>{user.phone}</strong></div>
        <div><span>Role</span><strong>{user.role}</strong></div><div><span>Cơ sở</span><strong>{user.facility}</strong></div><div><span>Ngày tạo</span><strong>{user.createdAt}</strong></div><div><span>Đăng nhập gần nhất</span><strong>{user.lastLogin}</strong></div>
      </div>
      <div className="admin-detail-actions">
        <label>Thay đổi role<select value={user.role} disabled={!roleCheck || roleCheck.userId !== user.id || roleCheck.loading || !roleCheck.canChangeRole} title={roleCheck?.canChangeRole ? undefined : "Tài khoản đang còn nghiệp vụ chưa xong, chưa đổi được vai trò"} onChange={(e) => changeRole(user.id, e.target.value)}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
        <div className="admin-action-group"><button className="admin-button admin-button-light" onClick={() => toggleLock(user.id)}>{user.status === "Locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}</button></div>
      </div>
      {/* Điều kiện đổi vai trò: tài khoản phải trống hoàn toàn (không còn nghiệp vụ đang mở) */}
      {roleCheck && roleCheck.userId === user.id && (
        roleCheck.loading ? <p className="admin-role-check">Đang kiểm tra tài khoản có đang vướng nghiệp vụ không...</p>
        : roleCheck.error ? <p className="admin-role-check blocked">Không kiểm tra được điều kiện đổi vai trò: {roleCheck.error}</p>
        : roleCheck.canChangeRole ? <p className="admin-role-check ok">✓ Tài khoản trống, không còn nghiệp vụ nào đang mở — có thể đổi vai trò.</p>
        : (
          <div className="admin-role-check blocked">
            <strong>Chưa đổi được vai trò — tài khoản còn nghiệp vụ chưa xong:</strong>
            <ul>{roleCheck.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            <small>Khóa / mở khóa tài khoản vẫn làm được bình thường.</small>
          </div>
        )
      )}
      {user.role !== "System Administrator" && (
        <form className="admin-password-reset" onSubmit={(event) => { event.preventDefault(); void resetPassword(user); }}>
          <div>
            <h4>Đặt lại mật khẩu</h4>
            <p>Mật khẩu mới phải có ít nhất 6 ký tự. Hệ thống chỉ lưu mật khẩu đã mã hóa.</p>
          </div>
          <label>Mật khẩu mới<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
          <label>Xác nhận mật khẩu<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>
          <button className="admin-button admin-button-primary" type="submit" disabled={saving}>Đặt lại mật khẩu</button>
        </form>
      )}
      {user.role !== "Storage Customer" && <p className="admin-detail-note">Tài khoản nghiệp vụ có lịch sử hoạt động nên hệ thống ưu tiên khóa thay vì xóa để bảo toàn dữ liệu.</p>}
    </div>
  );

  // Vẽ màn hình "Phân quyền": số tài khoản theo từng vai trò.
  const renderRoles = () => (
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">ACCESS CONTROL</p><h2>Phân quyền</h2><p>Quản lý role và phạm vi truy cập của từng nhóm người dùng.</p></div></div>
      <div className="admin-role-grid">
        {[
          ["Storage Customer", "Đặt kho, thanh toán, quản lý kho thuê và gửi yêu cầu hỗ trợ."],
          ["Facility Staff", "Check-in, bàn giao, nhận kho, cập nhật trạng thái và xử lý vấn đề tại cơ sở."],
          ["Facility Manager", "Quản lý kho, khách thuê, hợp đồng, staff và hoạt động tại cơ sở được phân công."],
          ["Business Operations", "Quản lý toàn hệ thống, chính sách, biểu phí, doanh thu và báo cáo."],
        ].map(([role, description]) => <div className="admin-role-card" key={role}><h3>{role}</h3><p>{description}</p><span>Quyền được kiểm soát theo role và cơ sở.</span></div>)}
      </div>
    </section>
  );

  // Vẽ màn hình "Nhật ký hoạt động": tìm kiếm + bảng phân trang.
  const renderLogs = () => (
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">AUDIT TRAIL</p><h2>Nhật ký hoạt động</h2><p>Theo dõi đăng nhập và các thay đổi quan trọng do người dùng thực hiện.</p></div></div>
      <div className="admin-toolbar"><input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Tìm actor, hành động, tài khoản..." /></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Loại</th></tr></thead><tbody>{logRows.map((log) => <tr key={log.id} className={rowClass(log.at)}><td><b>{log.time}</b> <NewBadge createdAt={log.at} /></td><td><strong>{log.actor}</strong></td><td>{log.action}</td><td>{log.target}</td><td><span className={`admin-log-type admin-log-${log.type}`}>{log.type}</span></td></tr>)}</tbody></table></div>
      <Pager {...logList.pagerProps} unit="dòng nhật ký" />
    </section>
  );

  // Vẽ màn hình "Tổng quan": thẻ số liệu tài khoản và hoạt động gần đây.
  const renderDashboard = () => {
    const active = users.filter((u) => u.status === "Active").length;
    const locked = users.filter((u) => u.status === "Locked").length;
    const managers = users.filter((u) => u.role.includes("Manager") && u.status === "Active").length;
    return <>
      <div className="admin-welcome"><div><p className="admin-eyebrow">SYSTEM ADMINISTRATOR</p><h1>Quản trị hệ thống</h1><p>Quản lý tài khoản, role, quyền truy cập và nhật ký hoạt động của StoreSpace.</p></div><button className="admin-button admin-button-primary" onClick={() => setActiveMenu("pending")}>Xem yêu cầu duyệt</button></div>
      <div className="admin-kpi-grid"><div className="admin-kpi"><span>Tổng tài khoản</span><strong>{users.length}</strong><small>Toàn hệ thống</small></div><div className="admin-kpi admin-kpi-warning"><span>Chờ duyệt</span><strong>{pendingUsers.length}</strong><small>Role nghiệp vụ</small></div><div className="admin-kpi"><span>Manager đang hoạt động</span><strong>{managers}</strong><small>Facility + Business</small></div><div className="admin-kpi admin-kpi-danger"><span>Đang khóa</span><strong>{locked}</strong><small>Cần theo dõi</small></div></div>
      <div className="admin-dashboard-grid"><div className="admin-panel"><div className="admin-panel-heading"><h2>Yêu cầu gần đây</h2><button className="admin-link-button" onClick={() => setActiveMenu("pending")}>Xem tất cả</button></div>{pendingUsers.slice(0, 3).map((user) => <button className="admin-request" key={user.id} onClick={() => { setActiveMenu("pending"); selectUser(user); }}><span className="admin-avatar">{user.name.charAt(0)}</span><span><strong>{user.name}</strong><small>{user.role} · {user.createdAt}</small></span><span className="admin-arrow">→</span></button>)}</div><div className="admin-panel"><div className="admin-panel-heading"><h2>Hoạt động gần đây</h2><button className="admin-link-button" onClick={() => setActiveMenu("logs")}>Nhật ký</button></div>{logs.slice(0, 4).map((log) => <div className="admin-activity" key={log.id}><span className={`admin-activity-dot admin-dot-${log.type}`}></span><div><strong>{log.action}</strong><span>{log.target} · {log.time}</span></div></div>)}</div></div>
    </>;
  };

  // Chọn màn hình nội dung theo mục menu đang mở (mặc định là Tổng quan).
  let content = renderDashboard();
  if (activeMenu === "pending") content = renderPending();
  if (activeMenu === "users") content = renderUsers();
  if (activeMenu === "roles") content = renderRoles();
  if (activeMenu === "logs") content = renderLogs();

  return <div className="customer-layout admin-layout">
    <aside className="customer-sidebar">
      <div className="customer-brand">
        <span className="brand-mark">S</span>
        <div><strong>StoreSpace</strong><small>System Administrator</small></div>
      </div>
      <nav className="customer-nav">
        {[['dashboard', 'Tổng quan', '⌂'], ['pending', 'Duyệt tài khoản', '◷'], ['users', 'Tất cả tài khoản', '▣'], ['roles', 'Vai trò & quyền', '▤'], ['logs', 'Nhật ký hoạt động', '≡']].map(([key, label, icon]) => (
          <button key={key} className={activeMenu === key ? 'active' : ''} onClick={() => { setActiveMenu(key); setSelectedUser(null); }}>
            <span>{icon}</span>{label}
            {key === 'pending' && pendingUsers.length > 0 && <b className="admin-nav-badge">{pendingUsers.length}</b>}
          </button>
        ))}
      </nav>
      <div className="customer-sidebar-bottom">
        <button onClick={logout}><span>↪</span> Đăng xuất</button>
      </div>
    </aside>
    <main className="customer-main">
      <div className="customer-topbar">
        <div>
          <span className="customer-eyebrow">SYSTEM ADMINISTRATOR</span>
          <h1>{activeMenu === 'dashboard' ? 'Tổng quan hệ thống' : activeMenu === 'pending' ? 'Duyệt tài khoản' : activeMenu === 'users' ? 'Tất cả tài khoản' : activeMenu === 'roles' ? 'Vai trò & quyền' : 'Nhật ký hoạt động'}</h1>
          <p>StoreSpace · System Administration</p>
        </div>
        <div className="admin-profile"><div className="admin-profile-avatar">AD</div><div><strong>System Admin</strong><span>Administrator</span></div></div>
      </div>
      <div className="admin-content">
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {loading ? (
          <div className="admin-section">Đang tải dữ liệu quản trị từ backend...</div>
        ) : (
          <>
            {saving && <div className="admin-section">Đang lưu thay đổi...</div>}
            {content}
          </>
        )}
      </div>
    </main>
    {toast && <div className="admin-toast">{toast}</div>}
  </div>;
}

export default Admin;
