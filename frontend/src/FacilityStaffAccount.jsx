import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import "./staffstyles.css";
import { apiGet, apiPost } from "./api";
import { mapOperationsState } from "./operationsState";

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => fmtISO(new Date());
const addMonths = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();           // kẹp về cuối tháng (31/01 + 1 tháng = 28/02)
  return fmtISO(new Date(y, m - 1 + n, Math.min(d, last)));
};
const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtMoney = (n) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
const endOf = (r) => addMonths(r.startDate, r.months);
const overlaps = (a, b) => a.startDate < endOf(b) && b.startDate < endOf(a);

const RES_STATUS = {
  PENDING_PAYMENT: { label: "Chờ khách trả cọc", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận thanh toán", tone: "warn" },
  PENDING_APPROVAL: { label: "Chờ Manager duyệt", tone: "info" },
  CONFIRMED: { label: "Đã xác nhận", tone: "info" },
  HANDED_OVER: { label: "Đã bàn giao", tone: "ok" },
};
const PAY_STATUS = {
  PENDING: { label: "Chưa thanh toán", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận", tone: "warn" },
  PAID: { label: "Đã xác nhận cọc", tone: "ok" },
  FAILED: { label: "Thất bại", tone: "bad" },
};
const UNIT_STATUS = {
  AVAILABLE: { label: "Trống", tone: "ok" },
  RESERVED: { label: "Đã giữ chỗ", tone: "info" },
  RENTED: { label: "Đang thuê", tone: "ok" },
  NEEDS_INSPECTION: { label: "Cần kiểm tra", tone: "warn" },
  MAINTENANCE: { label: 'Bảo trì', tone: 'warn' }
};

/* ---------- handover checks ---------- */
const HOLDING = ["CONFIRMED", "HANDED_OVER"];
const findClash = (db, res, unitId) =>
  unitId ? db.reservations.find((r) => r.id !== res.id && r.assignedUnitId === unitId && HOLDING.includes(r.status) && overlaps(r, res)) : null;

function checkHandover(res, staff, db) {
  const checks = [
    { key: "facility", label: "Đặt chỗ thuộc đúng cơ sở của bạn", ok: res.facilityId === staff.facilityId },
    { key: "payment", label: "Hệ thống đã xác nhận tiền cọc (không dựa vào thông báo từ trình duyệt)", ok: res.paymentStatus === "PAID" },
    { key: "unit", label: "Facility Manager đã duyệt và phân kho", ok: !!res.assignedUnitId },
    { key: "clash", label: "Kho không trùng kỳ thuê với đặt chỗ khác", ok: !findClash(db, res, res.assignedUnitId) },
    { key: "status", label: "Đặt chỗ chưa được bàn giao", ok: res.status === "CONFIRMED" },
  ];
  return { checks, canHandover: checks.every((c) => c.ok) };
}

/* ---------- small UI parts ---------- */
const Badge = ({ map, value }) => {
  const s = map[value] || { label: value, tone: "info" };
  return <span className={`st-badge st-${s.tone}`}>{s.label}</span>;
};
const Info = ({ k, children }) => (
  <div><small>{k}</small><strong>{children}</strong></div>
);

/* Khung đăng nhập dùng lại class auth-* của trang khách */
function AuthFrame({ title, subtitle, onBrand, children }) {
  return (
    <div className="auth-page">
      <div className="auth-background auth-bg-one" />
      <div className="auth-background auth-bg-two" />
      <div className="auth-card">
        <button className="auth-brand" type="button" onClick={onBrand}>
          <span className="brand-mark">S</span>
          <span><strong>StoreSpace</strong><small>Facility Staff Portal</small></span>
        </button>
        <div className="auth-heading">
          <div className="eyebrow"><span /> FACILITY STAFF</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function NoAccess({ navigate }) {
  return (
    <AuthFrame title="Cần tài khoản nhân viên" subtitle="Trang này chỉ dành cho Facility Staff. Hãy đăng nhập bằng tài khoản nhân viên do quản trị viên cấp." onBrand={() => navigate("/")}>
      <div className="auth-form">
        <button className="auth-submit" type="button" onClick={() => navigate("/login")}>Đến trang đăng nhập</button>
        <button className="back-home" type="button" onClick={() => navigate("/")}>← Quay lại trang chủ</button>
      </div>
    </AuthFrame>
  );
}

/* ---------- Reservation detail + handover ---------- */
function ReservationDetail({ res, unit, staff, db, actions }) {
  const [accessType, setAccessType] = useState("Khóa");
  const [accessValue, setAccessValue] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [result, setResult] = useState(null);

  const { checks, canHandover } = checkHandover(res, staff, db);
  const handedOver = res.status === "HANDED_OVER";
  const notToday = res.appointmentDate !== todayStr();
  const ready = canHandover && idChecked && accessValue.trim().length > 0;
  const doHandoverClick = async () => {
    try {
      const response = await actions.handover(res.id, { type: accessType, value: accessValue });
      setResult({ ok: true, message: response.message });
    } catch (error) {
      setResult({ ok: false, message: error.message });
    }
  };

  return (
    <div className="st-card st-detail">
      <div className="st-head">
        <div>
          <span className="customer-eyebrow">ĐẶT CHỖ {res.id}</span>
          <h2>{res.customerName}</h2>
          <p>{res.unitType} · khách chọn {res.unitId}</p>
        </div>
        <Badge map={RES_STATUS} value={res.status} />
      </div>

      {res.paymentStatus === "PENDING" && !handedOver && (
        <div className="st-alert st-warn">Khách chưa thanh toán tiền cọc. Chưa thể bàn giao.</div>
      )}
      {res.paymentStatus === "PENDING_CONFIRMATION" && (
        <div className="st-alert st-warn">Khách báo đã thanh toán nhưng hệ thống chưa nhận kết quả từ cổng thanh toán. Không bàn giao dựa trên ảnh chụp hoặc thông báo từ trình duyệt của khách.</div>
      )}
      {notToday && !handedOver && res.source !== "live" && <div className="st-alert st-warn">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, không phải hôm nay.</div>}

      <div className="st-grid">
        <Info k="Liên hệ">{res.customerPhone} · {res.customerEmail}</Info>
        <Info k="Kho được phân">{res.assignedUnitId ? `${res.assignedUnitId}${unit?.size ? ` (${unit.size})` : ""}` : "Chưa phân"}</Info>
        <Info k="Kỳ thuê">{fmtDate(res.startDate)} → {fmtDate(endOf(res))} ({res.months} tháng)</Info>
        <Info k="Lịch hẹn">{fmtDate(res.appointmentDate)} · {res.appointmentTime}</Info>
        <Info k="Tiền cọc">{fmtMoney(res.deposit)} <Badge map={PAY_STATUS} value={res.paymentStatus} /></Info>
        <Info k="Tổng tiền thuê">{fmtMoney(res.rentalFee)}</Info>
        {res.paymentTxn && <Info k="Mã giao dịch">{res.paymentTxn}</Info>}
      </div>

      {handedOver ? (
        <>
          <div className="st-alert st-ok">Đã bàn giao{res.contractId ? ` — hợp đồng ${res.contractId}` : ""}.</div>
          <button className="dashboard-secondary-btn" type="button" onClick={doHandoverClick}>Tải lại trạng thái bàn giao</button>
        </>
      ) : (
        <>
          <h3>Kiểm tra trước khi bàn giao</h3>
          <ul className="st-checks">
            {checks.map((c) => (
              <li key={c.key} className={c.ok ? "st-yes" : "st-no"}>
                <span aria-hidden="true">{c.ok ? "✓" : "✕"}</span> {c.label}
              </li>
            ))}
          </ul>
          <label className="st-check">
            <input type="checkbox" checked={idChecked} onChange={(e) => setIdChecked(e.target.checked)} />
            Đã đối chiếu giấy tờ, đúng khách hàng đặt chỗ
          </label>

          <h3>Thông tin truy cập</h3>
          <div className="st-form-row">
            <label>Hình thức
              <select className="st-input" value={accessType} onChange={(e) => setAccessType(e.target.value)}>
                <option>Khóa</option><option>Thẻ truy cập</option><option>Mã truy cập</option>
              </select>
            </label>
            <label>{accessType === "Khóa" ? "Số hiệu khóa" : accessType === "Thẻ truy cập" ? "Mã thẻ" : "Mã truy cập"}
              <input className="st-input" value={accessValue} onChange={(e) => setAccessValue(e.target.value)} placeholder="VD: KEY-0301" />
            </label>
          </div>
          <button className="dashboard-primary-btn" type="button" disabled={!ready} onClick={doHandoverClick}>Xác nhận bàn giao</button>
          {!ready && <p className="st-hint">Cần đủ điều kiện, tick đối chiếu giấy tờ và nhập thông tin truy cập.</p>}
        </>
      )}

      {result && <div className={`st-alert ${result.ok ? "st-ok" : "st-warn"}`} role="status">{result.message}</div>}
    </div>
  );
}

/* Danh sách đặt chỗ + chi tiết (dùng cho "Nhận kho hôm nay" và "Tất cả đặt chỗ") */
function Workspace({ list, query, setQuery, selected, setSelectedId, selectedId, staff, db, actions }) {
  return (
    <div className="st-split">
      <div>
        <input className="st-search" placeholder="Tìm theo mã đặt chỗ, tên, email, mã kho" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="st-list">
          {list.length === 0 && <div className="st-card st-empty">Không có đặt chỗ nào phù hợp.</div>}
          {list.map((r) => (
            <button type="button" key={r.id} className={`st-item ${r.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(r.id)}>
              <div className="st-item-top">
                <strong className="st-time">{r.appointmentTime}</strong>
                <span className="st-name">{r.customerName}</span>
                {r.source === "live" && <span className="st-badge st-new">Mới từ khách</span>}
              </div>
              <div className="st-item-sub">{r.id} · {r.unitId} · {r.unitType}</div>
              <div className="st-item-foot"><Badge map={RES_STATUS} value={r.status} /><span>{fmtDate(r.startDate)}</span></div>
            </button>
          ))}
        </div>
      </div>
      <div>
        {selected ? (
          <ReservationDetail key={selected.id} res={selected} unit={db.units.find((u) => u.id === selected.assignedUnitId)} staff={staff} db={db} actions={actions} />
        ) : (
          <div className="st-card st-empty">Chọn một đặt chỗ ở danh sách bên trái để kiểm tra và bàn giao kho.</div>
        )}
      </div>
    </div>
  );
}

/* ---------- Portal (khung giống Customer Portal) ---------- */
const NAV = [
  ["overview", "⌂", "Tổng quan"],
  ["today", "◷", "Nhận kho hôm nay"],
  ["all", "▤", "Tất cả đặt chỗ"],
  ["units", "▣", "Kho tại cơ sở"],
  ["log", "◫", "Nhật ký bàn giao"],
];

function Portal({ staff, db, onLogout, onRefresh, onHandover }) {
  const [section, setSection] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const facility = db.facilities.find((f) => f.id === staff.facilityId);
  const mine = useMemo(() => db.reservations.filter((r) => r.facilityId === staff.facilityId), [db, staff]);
  const today = todayStr();
  const sortKey = (r) => (r.source === "live" ? "0" : "1") + r.appointmentDate + r.appointmentTime;
  const bySort = (a, b) => sortKey(a).localeCompare(sortKey(b));
  const matches = (r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.id, r.customerName, r.customerEmail, r.unitId].some((v) => String(v).toLowerCase().includes(q));
  };

  const todayList = useMemo(() => mine.filter((r) => r.appointmentDate === today || r.source === "live").sort(bySort), [mine, today]);
  const todayVisible = todayList.filter((r) => r.appointmentDate === today || r.status !== "HANDED_OVER").filter(matches);
  const allVisible = [...mine].sort(bySort).filter(matches);

  const counts = {
    waiting: todayList.filter((r) => checkHandover(r, staff, db).canHandover).length,
    blocked: todayList.filter((r) => r.status !== "HANDED_OVER" && !checkHandover(r, staff, db).canHandover).length,
    done: todayList.filter((r) => r.status === "HANDED_OVER").length,
  };
  const units = db.units.filter((u) => u.facilityId === staff.facilityId);
  const freeUnits = units.filter((u) => u.status === "AVAILABLE").length;
  const selected = mine.find((r) => r.id === selectedId) || null;

  const actions = {
    handover: (id, access) => onHandover(id, access),
  };
  const open = (id) => { setSelectedId(id); setSection("today"); };

  const HEAD = {
    overview: ["STAFF DASHBOARD", `Xin chào, ${staff.fullName}!`, `Nhận kho và bàn giao cho khách tại ${facility?.name}.`],
    today: ["CHECK-IN & HANDOVER", "Nhận kho hôm nay", "Kiểm tra đặt chỗ, thanh toán và bàn giao kho cho khách."],
    all: ["RESERVATIONS", "Tất cả đặt chỗ", "Toàn bộ đặt chỗ thuộc cơ sở của bạn."],
    units: ["FACILITY UNITS", "Kho tại cơ sở", "Trạng thái các kho đang quản lý tại cơ sở."],
    log: ["ACTIVITY LOG", "Nhật ký bàn giao", "Lịch sử bàn giao kho tại cơ sở của bạn."],
  }[section];
  const initial = staff.fullName.trim().split(" ").pop().charAt(0).toUpperCase();

  return (
    <div className="customer-layout">
      <aside className="customer-sidebar">
        <div className="customer-brand">
          <span className="brand-mark">S</span>
          <div><strong>StoreSpace</strong><small>Staff Portal</small></div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">{initial}</div>
          <div><strong>{staff.fullName}</strong><small>Facility Staff · {facility?.name}</small></div>
        </div>

        <nav className="customer-nav">
          {NAV.map(([key, icon, label]) => (
            <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>

        <div className="customer-sidebar-bottom">
          <button type="button" onClick={onRefresh}><span>↻</span>Làm mới đặt chỗ</button>
          <button type="button" onClick={onLogout}><span>↪</span>Đăng xuất</button>
        </div>
      </aside>

      <main className="customer-main">
        <div className="customer-topbar">
          <div>
            <span className="customer-eyebrow">{HEAD[0]}</span>
            <h1>{HEAD[1]}</h1>
            <p>{HEAD[2]}</p>
          </div>
          <button type="button" className="customer-profile-button" onClick={() => setSection("overview")}>{initial}</button>
        </div>

        {section === "overview" && (
          <div>
            <section className="customer-stats">
              <div className="customer-stat-card"><span className="stat-icon">▣</span><small>Sẵn sàng bàn giao</small><strong>{counts.waiting}</strong><span className="stat-note">Đủ điều kiện</span></div>
              <div className="customer-stat-card"><span className="stat-icon yellow">◷</span><small>Chưa đủ điều kiện</small><strong>{counts.blocked}</strong><span className="stat-note warning">Cần xử lý</span></div>
              <div className="customer-stat-card"><span className="stat-icon blue">✓</span><small>Đã bàn giao</small><strong>{counts.done}</strong><span className="stat-note">Hôm nay</span></div>
              <div className="customer-stat-card"><span className="stat-icon">◴</span><small>Kho còn trống</small><strong>{freeUnits}</strong><span className="stat-note">Tại {facility?.name}</span></div>
            </section>

            <section className="customer-section">
              <div className="customer-section-heading">
                <div><span className="customer-eyebrow">TODAY</span><h2>Việc cần làm hôm nay</h2></div>
                <button type="button" className="overview-text-button" onClick={() => setSection("today")}>Mở màn hình bàn giao →</button>
              </div>
              <div className="st-card st-todo-card">
                {todayList.length === 0 && <div className="st-empty">Hôm nay chưa có khách cần nhận kho.</div>}
                {todayList.map((r) => (
                  <button type="button" key={r.id} className="st-todo" onClick={() => open(r.id)}>
                    <span className="st-time">{r.appointmentTime}</span>
                    <span className="st-todo-main"><strong>{r.customerName}</strong><small>{r.id} · {r.unitId} · {r.unitType}</small></span>
                    {r.source === "live" && <span className="st-badge st-new">Mới từ khách</span>}
                    <Badge map={RES_STATUS} value={r.status} />
                    <span className="st-go">→</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {section === "today" && (
          <Workspace list={todayVisible} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} />
        )}
        {section === "all" && (
          <Workspace list={allVisible} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} />
        )}

        {section === "units" && (
          <div className="st-card">
            <table className="st-table">
              <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Giá thuê / tháng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}><td><strong>{u.id}</strong></td><td>{u.type}</td><td>{u.size || "—"}</td><td>{fmtMoney(u.pricePerMonth)}</td><td><Badge map={UNIT_STATUS} value={u.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "log" && (
          <div className="st-card">
            {db.activity.filter((a) => a.facilityId === staff.facilityId).length === 0 && <div className="st-empty">Chưa có lần bàn giao nào.</div>}
            <ul className="st-log">
              {db.activity.filter((a) => a.facilityId === staff.facilityId).map((a) => (
                <li key={a.id}><small>{new Date(a.at).toLocaleString("vi-VN")} · {a.staffName}</small><div>{a.text}</div></li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Root ---------- */
/* Uses the authenticated site session and backend operations API. */
export default function StaffPortal({ embedded = false, currentUser = null, navigate = null, currentUserKey = "storespace_current_user" } = {}) {
  const [db, setDb] = useState({ facilities: [], units: [], reservations: [], activity: [], staff: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadState = async () => {
    if (!currentUser?.email || currentUser.role !== "FACILITY_STAFF") {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/api/operations/state?email=${encodeURIComponent(currentUser.email)}`);
      setDb(mapOperationsState(data));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
  }, [currentUser?.email, currentUser?.role]);

  const assignment = db.staff.find(item =>
    item.email?.toLowerCase() === currentUser?.email?.toLowerCase() &&
    item.status?.toLowerCase() === "active"
  );
  const staff = assignment ? {
    id: assignment.id,
    fullName: assignment.fullName,
    email: assignment.email,
    facilityId: assignment.facilityId,
    role: "FACILITY_STAFF"
  } : null;

  const logout = () => {
    localStorage.removeItem(currentUserKey);
    navigate("/");
  };
  const handover = async (reservationId, access) => {
    const response = await apiPost("/api/handover/complete", {
      reservationID: Number(reservationId),
      accessType: access.type,
      accessValue: access.value.trim(),
      notes: ""
    });
    await loadState();
    return response;
  };

  return (
    <div className="st-root">
      {loading ? <div className="st-card">Đang tải dữ liệu vận hành từ backend...</div> :
        error ? <div className="st-card"><div className="st-alert st-warn" role="alert">{error}</div><button type="button" className="dashboard-primary-btn" onClick={loadState}>Thử lại</button></div> :
          staff ? <Portal staff={staff} db={db} onLogout={logout} onRefresh={loadState} onHandover={handover} /> :
            <NoAccess navigate={navigate} />}
    </div>
  );
}
