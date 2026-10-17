import React, { useEffect, useMemo, useState } from "react";
import "./AdminAccount.css";
import { apiGet, apiPut } from "./api";

const roleOptions = [
  "Storage Customer",
  "Facility Staff",
  "Facility Manager",
  "Business Operations Manager",
];

function Admin() {
  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [logSearch, setLogSearch] = useState("");
  const [toast, setToast] = useState("");

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

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = window.setTimeout(() => setToast(""), 2500);
  };

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
    } finally {
      setSaving(false);
    }
  };

  const approveUser = (id) => {
    const user = users.find((item) => item.id === id);
    if (user) void updateUser(id, user.role, "Active", `Đã duyệt tài khoản ${user.username}`);
  };

  const rejectUser = (id) => {
    const user = users.find((item) => item.id === id);
    if (user) void updateUser(id, user.role, "Rejected", `Đã từ chối tài khoản ${user.username}`);
  };

  const toggleLock = (id) => {
    const user = users.find((item) => item.id === id);
    if (user) {
      const nextStatus = user.status === "Locked" ? "Active" : "Locked";
      void updateUser(id, user.role, nextStatus, `${nextStatus === "Locked" ? "Đã khóa" : "Đã mở khóa"} ${user.username}`);
    }
  };

  const changeRole = (id, newRole) => {
    const user = users.find((item) => item.id === id);
    if (user && user.role !== newRole) {
      void updateUser(id, newRole, user.status, `Đã đổi role của ${user.username}`);
    }
  };

  const pendingUsers = useMemo(
    () => users.filter((user) => user.status === "Pending" && user.role !== "Storage Customer"),
    [users]
  );

  const filteredUsers = useMemo(() => users.filter((user) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [user.name, user.username, user.email, user.facility].some((value) => value.toLowerCase().includes(q));
    const matchesRole = roleFilter === "All" || user.role === roleFilter;
    const matchesStatus = statusFilter === "All" || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  }), [users, search, roleFilter, statusFilter]);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const q = logSearch.trim().toLowerCase();
    return !q || [log.actor, log.action, log.target].some((value) => value.toLowerCase().includes(q));
  }), [logs, logSearch]);

  const selectUser = (user) => {
    setSelectedUser(user);
    setTimeout(() => document.getElementById("admin-user-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const logout = () => {
    localStorage.removeItem("storespace_current_user");
    localStorage.removeItem("userLoggedIn");
    window.location.href = "/";
  };

  const renderStatus = (status) => <span className={`admin-status admin-status-${status.toLowerCase()}`}>{status}</span>;

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
            {pendingUsers.length === 0 ? <tr><td colSpan="7" className="admin-empty">Không có tài khoản đang chờ duyệt.</td></tr> : pendingUsers.map((user) => (
              <tr key={user.id} onClick={() => selectUser(user)} className="admin-clickable-row">
                <td><strong>{user.name}</strong><small>{user.email}</small></td>
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
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Người dùng</th><th>Tài khoản</th><th>Role</th><th>Cơ sở</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th></tr></thead><tbody>
        {filteredUsers.map((user) => <tr key={user.id} onClick={() => selectUser(user)} className="admin-clickable-row"><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.username}</td><td>{user.role}</td><td>{user.facility}</td><td>{renderStatus(user.status)}</td><td>{user.lastLogin}</td></tr>)}
      </tbody></table></div>
      {selectedUser && renderUserDetail(selectedUser)}
    </section>
  );

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
      {user.role !== "Storage Customer" && <p className="admin-detail-note">Tài khoản nghiệp vụ có lịch sử hoạt động nên hệ thống ưu tiên khóa thay vì xóa để bảo toàn dữ liệu.</p>}
    </div>
  );

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

  const renderLogs = () => (
    <section className="admin-section">
      <div className="admin-section-heading"><div><p className="admin-eyebrow">AUDIT TRAIL</p><h2>Nhật ký hoạt động</h2><p>Theo dõi đăng nhập và các thay đổi quan trọng do người dùng thực hiện.</p></div></div>
      <div className="admin-toolbar"><input value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Tìm actor, hành động, tài khoản..." /></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Loại</th></tr></thead><tbody>{filteredLogs.map((log) => <tr key={log.id}><td>{log.time}</td><td><strong>{log.actor}</strong></td><td>{log.action}</td><td>{log.target}</td><td><span className={`admin-log-type admin-log-${log.type}`}>{log.type}</span></td></tr>)}</tbody></table></div>
    </section>
  );

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
        {[['dashboard', 'Dashboard', '⌂'], ['pending', 'Duyệt tài khoản', '◷'], ['users', 'Quản lý tài khoản', '▣'], ['roles', 'Phân quyền', '▤'], ['logs', 'Nhật ký hoạt động', '≡']].map(([key, label, icon]) => (
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
          <h1>{activeMenu === 'dashboard' ? 'Dashboard' : activeMenu === 'pending' ? 'Duyệt tài khoản' : activeMenu === 'users' ? 'Quản lý tài khoản' : activeMenu === 'roles' ? 'Phân quyền' : 'Nhật ký hoạt động'}</h1>
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
