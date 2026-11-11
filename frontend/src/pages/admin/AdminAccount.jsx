/**
 * ======================================================================
 * FILE: src/pages/admin/AdminAccount.jsx  —  TRANG QUẢN TRỊ HỆ THỐNG (System Admin, route /admin)
 * Menu: Tổng quan · Tài khoản chờ duyệt · Quản lý tài khoản (+ chi tiết) · Phân quyền (vai trò) · Nhật ký hoạt động.
 * Luồng API (AdminController):
 *   GET /api/admin/users                    -> danh sách tài khoản (hỗ trợ ?page=&pageSize=&q=&status=&role= qua useServerList)
 *   GET /api/admin/activity                 -> nhật ký hoạt động (hỗ trợ phân trang qua useServerList)
 *   PUT /api/admin/users/{userId}           -> { roleName, status } duyệt / từ chối / khóa / mở khóa / đổi vai trò
 *   PUT /api/admin/users/{userId}/password  -> { newPassword } đặt lại mật khẩu
 * Dùng ở: App.jsx (role SYSTEM_ADMIN).
 * ======================================================================
 */
import React, { useEffect, useMemo, useState } from "react";
import { NewBadge, Pager, newestFirst, parseTime, rowClass, timeAgo, useServerList } from "../../components/common/listKit"; // [THÊM] phân trang ở backend + tô sáng bản ghi mới
import "./AdminAccount.css";
import { apiGet, apiPut } from "../../api/api";
import { useDialog } from "../../components/common/Dialog";

const roleOptions = [
  "Storage Customer",
  "Facility Staff",
  "Facility Manager",
  "Business Operations Manager",
];

/**
 * Component trang quản trị: tải tài khoản + nhật ký, các thao tác quản lý tài khoản, các màn hình con theo menu.
 */
function Admin() {
  const dialog = useDialog();
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [logSearch, setLogSearch] = useState("");
  const [toast, setToast] = useState("");

  /**
   * Tải song song danh sách tài khoản và nhật ký hoạt động, chuẩn hóa thời gian hiển thị của nhật ký.
   * API: GET /api/admin/users + GET /api/admin/activity
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

  useEffect(() => { loadAdminData(); }, []);

  // Hiện thông báo nhỏ (toast) trong 2,5 giây.
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = window.setTimeout(() => setToast(""), 2500);
  };

  /**
   * Cập nhật vai trò + trạng thái 1 tài khoản rồi tải lại dữ liệu và báo thành công.
   * API: PUT /api/admin/users/{id}  body { roleName, status }
   * @param {number} id mã tài khoản; role vai trò; status trạng thái; successMessage câu báo thành công.
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
    }
  };

  // Duyệt tài khoản đang chờ (status -> Active).
  const approveUser = (id) => {
    const user = users.find((item) => item.id === id);
    if (user) void updateUser(id, user.role, "Active", `Đã duyệt tài khoản ${user.username}`);
  };

  // Từ chối tài khoản đang chờ (hỏi xác nhận, status -> Rejected).
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

  // Khóa / mở khóa tài khoản (hỏi xác nhận, status Active <-> Locked).
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

  // Đổi vai trò của tài khoản (hỏi xác nhận).
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
   * Đặt lại mật khẩu cho tài khoản: kiểm tra độ dài + khớp ô xác nhận, hỏi xác nhận rồi gửi.
   * API: PUT /api/admin/users/{userId}/password
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

  // Lọc tài khoản theo ô tìm kiếm, vai trò và trạng thái (dùng cho Tổng quan / Phân quyền).
  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [user.name, user.username, user.email, user.facility].some((value) => value.toLowerCase().includes(q));
    const matchesRole = roleFilter === "All" || user.role === roleFilter;
    const matchesStatus = statusFilter === "All" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  }), [users, search, roleFilter, statusFilter]);

  // Lọc nhật ký hoạt động theo ô tìm kiếm.
  const filteredLogs = useMemo(() => logs.filter((log) => {
    const q = logSearch.trim().toLowerCase();
    return !q || [log.actor, log.action, log.target].some((value) => value.toLowerCase().includes(q));
  }), [logs, logSearch]);

  // [PHÂN TRANG] Quản lý tài khoản: backend lọc + chia trang (GET /api/admin/users?page=...), mới tạo lên đầu.
  // Backend cũ (trả cả mảng) -> tự chia trang từ danh sách đã tải.
  const userList = useServerList({
    path: "/api/admin/users",
    q: search,
    status: statusFilter === "All" ? "" : statusFilter.toUpperCase(),
    extra: { role: roleFilter === "All" ? undefined : roleFilter },
    pageSize: 20,
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
  // [PHÂN TRANG] Nhật ký hoạt động (GET /api/admin/activity?page=...), mới nhất lên đầu
  const logList = useServerList({
    path: "/api/admin/activity",
    q: logSearch,
    pageSize: 25,
    reloadKey: logs,
    enabled: activeMenu === "logs",
    fallback: { rows: logs, match: (l, { q }) => !q || [l.actor, l.action, l.target].some((v) => String(v || "").toLowerCase().includes(q)), compare: () => 0 },
  });
  const logRows = logList.mode === "server"
    ? logList.items.map((l) => ({ ...l, at: l.time, time: new Date(l.time).toLocaleString("vi-VN") }))
    : logList.items;

  // Chọn 1 tài khoản để xem chi tiết: xóa ô mật khẩu và cuộn tới khung chi tiết.
  const selectUser = (user) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setTimeout(() => document.getElementById("admin-user-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  // Đăng xuất: xóa phiên đăng nhập khỏi localStorage và về trang chủ.
  const logout = () => {
    localStorage.removeItem("storespace_current_user");
    localStorage.removeItem("userLoggedIn");
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
        <label>Thay đổi role<select value={user.role} onChange={(e) => changeRole(user.id, e.target.value)}>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
        <div className="admin-action-group"><button className="admin-button admin-button-light" onClick={() => toggleLock(user.id)}>{user.status === "Locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}</button></div>
      </div>
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
