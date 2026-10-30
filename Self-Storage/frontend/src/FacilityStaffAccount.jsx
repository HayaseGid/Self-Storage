import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import "./staffstyles.css";
import { apiGet, apiPost } from "./api";
import { mapOperationsState } from "./operationsState";
import { useDialog } from "./Dialog";
import { formatReservationCode } from "./storageRules";

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => fmtISO(new Date());
const addMonths = (s, n) => {
  const [y, m, d] = String(s || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const last = new Date(y, m - 1 + n + 1, 0).getDate();           // kẹp về cuối tháng (31/01 + 1 tháng = 28/02)
  return fmtISO(new Date(y, m - 1 + n, Math.min(d, last)));
};
const fmtDate = (s) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "—");
const fmtMoney = (n) => new Intl.NumberFormat("vi-VN").format(Number(n) || 0) + "đ";
const fmtDateTime = (s) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("vi-VN");
};

// Ngày kết thúc: ưu tiên ngày backend trả về (khớp hợp đồng), chỉ tự tính khi thiếu
const endOf = (r) => r.endDate || addMonths(r.startDate, r.months);
const overlaps = (a, b) => a.startDate < endOf(b) && b.startDate < endOf(a);

// Tất cả kho của một đơn (đơn có thể gồm nhiều kho)
const unitsOf = (r) => {
  const list = Array.isArray(r.unitNumbers) && r.unitNumbers.length ? r.unitNumbers : [r.assignedUnitId || r.unitId];
  return list.filter(Boolean);
};
const resCode = (r) => r.reservationCode || formatReservationCode(r.id);

const RES_STATUS = {
  PENDING_PAYMENT: { label: "Chờ khách trả cọc", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận thanh toán", tone: "warn" },
  PENDING_APPROVAL: { label: "Đã cọc · Chờ xác nhận", tone: "warn" },
  CONFIRMED: { label: "Sẵn sàng bàn giao", tone: "info" },
  HANDED_OVER: { label: "Đã bàn giao", tone: "ok" },
  COMPLETED: { label: "Đã hoàn tất", tone: "ok" },
  CANCELLED: { label: "Đã hủy", tone: "bad" },
  EXPIRED: { label: "Hết hạn giữ chỗ", tone: "bad" },
};
const PAY_STATUS = {
  PENDING: { label: "Chưa thanh toán", tone: "warn" },
  PENDING_CONFIRMATION: { label: "Chờ xác nhận", tone: "warn" },
  PAID: { label: "Đã xác nhận cọc", tone: "ok" },
  FAILED: { label: "Thất bại", tone: "bad" },
};
const UNIT_STATUS = {
  AVAILABLE: { label: "Còn trống", tone: "ok" },
  BOOKING: { label: "Đang giữ chỗ chờ cọc", tone: "warn" },
  RESERVED: { label: "Đã giữ chỗ", tone: "info" },
  RENTED: { label: "Đang thuê", tone: "ok" },
  IN_USE: { label: "Đang thuê", tone: "ok" },
  NEEDS_INSPECTION: { label: "Chờ kiểm tra", tone: "warn" },
  PENDING_INSPECTION: { label: "Chờ kiểm tra", tone: "warn" },
  MAINTENANCE: { label: "Bảo trì", tone: "warn" },
  INACTIVE: { label: "Ngừng sử dụng", tone: "bad" },
};

// Giá trị gửi backend phải khớp CHECK của DB: Key, Access Card, PIN Code, Smart Lock, QR
const ACCESS_TYPES = [
  { value: "Key", label: "Chìa khóa", field: "Số hiệu chìa khóa", placeholder: "VD: KEY-0301" },
  { value: "Access Card", label: "Thẻ truy cập", field: "Mã thẻ", placeholder: "VD: CARD-1029" },
  { value: "PIN Code", label: "Mã PIN", field: "Mã PIN", placeholder: "VD: 482915" },
  { value: "Smart Lock", label: "Khóa thông minh", field: "Mã khóa thông minh", placeholder: "VD: SL-7781" },
  { value: "QR", label: "Mã QR", field: "Mã QR", placeholder: "VD: QR-55120" },
];

// Đơn đã cọc, đang chờ bàn giao
const AWAITING = ["PENDING_APPROVAL", "CONFIRMED"];
// Đơn đang giữ kho (dùng để phát hiện trùng lịch)
const HOLDING = ["PENDING_PAYMENT", "PENDING_APPROVAL", "CONFIRMED", "HANDED_OVER"];

// Nhóm theo ngày hẹn so với hôm nay
const dayGroup = (r, today) => {
  if (!r.appointmentDate) return "upcoming";
  if (r.appointmentDate < today) return "overdue";
  if (r.appointmentDate === today) return "today";
  return "upcoming";
};

/* ---------- handover checks ---------- */
// Các kho của đơn đang bị đơn khác giữ trùng kỳ thuê
const findClashes = (db, res) =>
  unitsOf(res).flatMap((unitId) =>
    db.reservations
      .filter((r) => r.id !== res.id && HOLDING.includes(r.status) && unitsOf(r).includes(unitId) && overlaps(r, res))
      .map((r) => ({ unitId, reservation: r })));

function checkHandover(res, staff, db) {
  const units = unitsOf(res);
  const checks = [
    { key: "facility", label: "Đặt chỗ thuộc đúng cơ sở của bạn", ok: res.facilityId === staff.facilityId },
    { key: "payment", label: "Hệ thống đã xác nhận tiền cọc (không dựa vào thông báo từ trình duyệt)", ok: res.paymentStatus === "PAID" },
    { key: "unit", label: `Kho đã được giữ cho đơn (${units.length} kho)`, ok: units.length > 0 },
    { key: "signed", label: "Khách đã ký hợp đồng online", ok: res.status === "HANDED_OVER" || res.contractStatus !== "Pending Signature" },
    { key: "clash", label: "Kho không trùng kỳ thuê với đặt chỗ khác", ok: findClashes(db, res).length === 0 },
    { key: "status", label: "Đơn đã được xác nhận và chưa bàn giao", ok: res.status === "CONFIRMED" },
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
const DayTag = ({ res, today }) => {
  if (res.status === "HANDED_OVER") return null;
  const group = dayGroup(res, today);
  if (group === "today") return <span className="st-badge st-new">Hôm nay</span>;
  if (group === "overdue") return <span className="st-badge st-bad">Quá hẹn</span>;
  return null;
};

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
    <AuthFrame title="Cần tài khoản nhân viên" subtitle="Trang này chỉ dành cho Facility Staff đang được phân công tại một cơ sở. Hãy đăng nhập bằng tài khoản nhân viên hoặc liên hệ Facility Manager để được thêm vào cơ sở." onBrand={() => navigate("/")}>
      <div className="auth-form">
        <button className="auth-submit" type="button" onClick={() => navigate("/login")}>Đến trang đăng nhập</button>
        <button className="back-home" type="button" onClick={() => navigate("/")}>← Quay lại trang chủ</button>
      </div>
    </AuthFrame>
  );
}

/* ---------- Reservation detail + handover ---------- */
function ReservationDetail({ res, staff, db, actions }) {
  const [accessType, setAccessType] = useState(ACCESS_TYPES[0].value);
  const [accessValue, setAccessValue] = useState("");
  const [idChecked, setIdChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const dialog = useDialog();

  const today = todayStr();
  const units = unitsOf(res);
  const access = ACCESS_TYPES.find((a) => a.value === accessType) || ACCESS_TYPES[0];
  const { checks, canHandover } = checkHandover(res, staff, db);
  const clashes = findClashes(db, res);
  const handedOver = res.status === "HANDED_OVER";
  const group = dayGroup(res, today);
  const ready = canHandover && idChecked && accessValue.trim().length > 0 && !busy;

  const doHandover = async () => {
    const confirmed = await dialog.confirm({
      tone: "warning",
      title: `Xác nhận bàn giao ${units.length} kho cho ${res.customerName}?`,
      message: `Kho ${units.join(", ")} sẽ chuyển sang đang thuê và hợp đồng được kích hoạt. Hãy chắc chắn đã đối chiếu giấy tờ và giao ${access.label.toLowerCase()} (${accessValue.trim()}) cho khách.`,
      confirmLabel: "Xác nhận bàn giao"
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await actions.handover(res.id, { type: accessType, value: accessValue });
      setResult({ tone: "ok", message: response?.message || "Bàn giao thành công." });
    } catch (error) {
      setResult({ tone: "warn", message: error.message });
      void dialog.alert({ tone: "danger", title: "Bàn giao không thành công", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  // Kiểm tra chống bàn giao 2 lần: gửi lại yêu cầu cho đơn đã bàn giao, hệ thống phải từ chối
  const retryHandover = async () => {
    setBusy(true);
    try {
      await actions.handover(res.id, { type: ACCESS_TYPES[0].value, value: "CHECK-DUPLICATE" });
      setResult({ tone: "warn", message: "Hệ thống đã chấp nhận yêu cầu lần 2. Hãy báo lại cho nhóm phát triển." });
    } catch (error) {
      setResult({
        tone: "ok",
        message: `Hệ thống từ chối bàn giao lần 2: "${error.message}". Không có hợp đồng hay kho nào được tạo thêm.`
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="st-card st-detail">
      <div className="st-head">
        <div>
          <span className="customer-eyebrow">MÃ ĐƠN {resCode(res)}</span>
          <h2>{res.customerName}</h2>
          <p>{res.unitType} · {units.length} kho: {units.join(", ") || "—"}</p>
        </div>
        <Badge map={RES_STATUS} value={res.status} />
      </div>

      {res.paymentStatus === "PENDING" && !handedOver && (
        <div className="st-alert st-warn">Khách chưa thanh toán tiền cọc. Chưa thể bàn giao.</div>
      )}
      {res.paymentStatus === "PENDING_CONFIRMATION" && (
        <div className="st-alert st-warn">Khách báo đã thanh toán nhưng hệ thống chưa nhận kết quả từ cổng thanh toán. Không bàn giao dựa trên ảnh chụp hoặc thông báo từ trình duyệt của khách.</div>
      )}
      {res.status === "PENDING_APPROVAL" && (
        <div className="st-alert st-warn">Khách đã đặt cọc nhưng đơn chưa được hệ thống chuyển sang "Đã xác nhận" nên chưa thể bàn giao.</div>
      )}
      {!handedOver && group === "overdue" && (
        <div className="st-alert st-warn">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, đã quá hẹn. Hãy liên hệ khách trước khi bàn giao.</div>
      )}
      {!handedOver && group === "upcoming" && (
        <div className="st-alert st-info">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, chưa đến ngày nhận kho.</div>
      )}
      {clashes.length > 0 && !handedOver && (
        <div className="st-alert st-warn">
          Trùng kỳ thuê: {clashes.map((c) => `${c.unitId} (đơn ${resCode(c.reservation)})`).join(", ")}. Không bàn giao, báo Facility Manager kiểm tra.
        </div>
      )}

      <div className="st-grid">
        <Info k="Liên hệ">{res.customerPhone} · {res.customerEmail}</Info>
        <Info k="Kỳ thuê">{fmtDate(res.startDate)} → {fmtDate(endOf(res))} ({res.months} tháng)</Info>
        <Info k="Lịch hẹn">{fmtDate(res.appointmentDate)} · {res.appointmentTime}</Info>
        <Info k="Tiền cọc">{fmtMoney(res.deposit)} <Badge map={PAY_STATUS} value={res.paymentStatus} /></Info>
        <Info k="Tổng tiền thuê">{fmtMoney(res.rentalFee)}</Info>
        {res.paymentTxn && <Info k="Mã giao dịch">{res.paymentTxn}</Info>}
      </div>

      <h3>Kho bàn giao ({units.length})</h3>
      <table className="st-table st-units">
        <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {units.map((unitId) => {
            const u = db.units.find((x) => x.id === unitId);
            return (
              <tr key={unitId}>
                <td><strong>{unitId}</strong></td>
                <td>{u?.type || "—"}</td>
                <td>{u?.size || "—"}</td>
                <td>{u ? <Badge map={UNIT_STATUS} value={u.status} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {handedOver ? (
        <>
          <div className="st-alert st-ok">Đã bàn giao{res.contractId ? ` · hợp đồng ${res.contractId}` : ""}.</div>
          <button className="dashboard-secondary-btn" type="button" onClick={retryHandover} disabled={busy}>
            {busy ? "Đang kiểm tra..." : "Thử bàn giao lại (kiểm tra chống trùng)"}
          </button>
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
                {ACCESS_TYPES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label>{access.field}
              <input className="st-input" value={accessValue} maxLength={255} onChange={(e) => setAccessValue(e.target.value)} placeholder={access.placeholder} />
            </label>
          </div>
          {units.length > 1 && <p className="st-hint">Thông tin truy cập này áp dụng cho cả {units.length} kho của đơn.</p>}
          <button className="dashboard-primary-btn" type="button" disabled={!ready} onClick={doHandover}>
            {busy ? "Đang bàn giao..." : `Xác nhận bàn giao ${units.length} kho`}
          </button>
          {!ready && !busy && <p className="st-hint">Cần đủ điều kiện, tick đối chiếu giấy tờ và nhập thông tin truy cập.</p>}
        </>
      )}

      {result && <div className={`st-alert st-${result.tone}`} role="status">{result.message}</div>}
    </div>
  );
}

/* Danh sách đặt chỗ + chi tiết */
function Workspace({ list, query, setQuery, selected, selectedId, setSelectedId, staff, db, actions, chips }) {
  const today = todayStr();
  return (
    <div className="st-split">
      <div>
        {chips}
        <input className="st-search" placeholder="Tìm theo mã đơn, tên, email, mã kho" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="st-list">
          {list.length === 0 && <div className="st-card st-empty">Không có đặt chỗ nào phù hợp.</div>}
          {list.map((r) => (
            <button type="button" key={r.id} className={`st-item ${r.id === selectedId ? "active" : ""}`} onClick={() => setSelectedId(r.id)}>
              <div className="st-item-top">
                <strong className="st-time">{r.appointmentTime}</strong>
                <span className="st-name">{r.customerName}</span>
                <DayTag res={r} today={today} />
              </div>
              <div className="st-item-sub">{resCode(r)} · {unitsOf(r).join(", ") || "—"} · {r.unitType}</div>
              <div className="st-item-foot"><Badge map={RES_STATUS} value={r.status} /><span>Hẹn {fmtDate(r.appointmentDate)}</span></div>
            </button>
          ))}
        </div>
      </div>
      <div>
        {selected ? (
          <ReservationDetail key={selected.id} res={selected} staff={staff} db={db} actions={actions} />
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
  ["today", "◷", "Nhận kho"],
  ["all", "▤", "Tất cả đặt chỗ"],
  ["units", "▣", "Kho tại cơ sở"],
  ["log", "◫", "Nhật ký bàn giao"],
];

function Portal({ staff, facilities, onSwitchFacility, db, onLogout, onRefresh, onHandover }) {
  const [section, setSection] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [dayFilter, setDayFilter] = useState("today");

  const facility = db.facilities.find((f) => f.id === staff.facilityId);
  const mine = useMemo(() => db.reservations.filter((r) => r.facilityId === staff.facilityId), [db, staff]);
  const today = todayStr();
  const sortKey = (r) => `${r.appointmentDate || "9999"}${r.appointmentTime || ""}`;
  const bySort = (a, b) => sortKey(a).localeCompare(sortKey(b));
  const matches = (r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.id, resCode(r), r.customerName, r.customerEmail, ...unitsOf(r)].some((v) => String(v ?? "").toLowerCase().includes(q));
  };

  // Đơn cần bàn giao (đã cọc, chưa bàn giao), chia theo ngày hẹn
  const awaiting = useMemo(() => mine.filter((r) => AWAITING.includes(r.status)).sort(bySort), [mine]);
  const groups = {
    today: awaiting.filter((r) => dayGroup(r, today) === "today"),
    overdue: awaiting.filter((r) => dayGroup(r, today) === "overdue"),
    upcoming: awaiting.filter((r) => dayGroup(r, today) === "upcoming"),
    all: awaiting,
  };
  const handoverVisible = groups[dayFilter].filter(matches);
  const allVisible = [...mine].sort(bySort).filter(matches);

  // Việc cần xử lý ngay = hôm nay + quá hẹn
  const actionable = [...groups.overdue, ...groups.today];
  const facilityActivity = db.activity.filter((a) => a.facilityId === staff.facilityId);
  const counts = {
    ready: actionable.filter((r) => checkHandover(r, staff, db).canHandover).length,
    blocked: actionable.filter((r) => !checkHandover(r, staff, db).canHandover).length,
    doneToday: facilityActivity.filter((a) => a.at && fmtISO(new Date(a.at)) === today).length,
  };
  const units = db.units.filter((u) => u.facilityId === staff.facilityId);
  const freeUnits = units.filter((u) => u.status === "AVAILABLE").length;
  const selected = mine.find((r) => r.id === selectedId) || null;

  const actions = { handover: (id, access) => onHandover(id, access) };
  const open = (id) => { setSelectedId(id); setDayFilter("all"); setSection("today"); };

  const HEAD = {
    overview: ["STAFF DASHBOARD", `Xin chào, ${staff.fullName}!`, `Nhận kho và bàn giao cho khách tại ${facility?.name || staff.facilityId}.`],
    today: ["CHECK-IN & HANDOVER", "Nhận kho", "Kiểm tra đặt chỗ, thanh toán và bàn giao kho cho khách theo lịch hẹn."],
    all: ["RESERVATIONS", "Tất cả đặt chỗ", "Toàn bộ đặt chỗ thuộc cơ sở của bạn."],
    units: ["FACILITY UNITS", "Kho tại cơ sở", "Trạng thái các kho tại cơ sở."],
    log: ["ACTIVITY LOG", "Nhật ký bàn giao", "Lịch sử bàn giao kho tại cơ sở của bạn."],
  }[section];
  const initial = staff.fullName.trim().split(" ").pop().charAt(0).toUpperCase();

  const dayChips = (
    <div className="st-chips">
      {[
        ["today", `Hôm nay ${groups.today.length}`],
        ["overdue", `Quá hẹn ${groups.overdue.length}`],
        ["upcoming", `Sắp tới ${groups.upcoming.length}`],
        ["all", `Tất cả ${groups.all.length}`],
      ].map(([key, label]) => (
        <button key={key} type="button" className={dayFilter === key ? "active" : ""} onClick={() => setDayFilter(key)}>{label}</button>
      ))}
    </div>
  );

  return (
    <div className="customer-layout">
      <aside className="customer-sidebar">
        <div className="customer-brand">
          <span className="brand-mark">S</span>
          <div><strong>StoreSpace</strong><small>Staff Portal</small></div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">{initial}</div>
          <div><strong>{staff.fullName}</strong><small>Facility Staff · {facility?.name || staff.facilityId}</small></div>
        </div>

        {facilities.length > 1 && (
          <label className="st-facility-switch">
            <small>Cơ sở đang làm việc</small>
            <select className="st-input" value={staff.facilityId} onChange={(e) => { setSelectedId(null); onSwitchFacility(e.target.value); }}>
              {facilities.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        )}

        <nav className="customer-nav">
          {NAV.map(([key, icon, label]) => (
            <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}>
              <span>{icon}</span>{label}
              {key === "today" && actionable.length > 0 && <span className="st-nav-count">{actionable.length}</span>}
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
              <div className="customer-stat-card"><span className="stat-icon">▣</span><small>Sẵn sàng bàn giao</small><strong>{counts.ready}</strong><span className="stat-note">Hôm nay & quá hẹn</span></div>
              <div className="customer-stat-card"><span className="stat-icon yellow">◷</span><small>Chưa đủ điều kiện</small><strong>{counts.blocked}</strong><span className="stat-note warning">Cần xử lý</span></div>
              <div className="customer-stat-card"><span className="stat-icon blue">✓</span><small>Đã bàn giao</small><strong>{counts.doneToday}</strong><span className="stat-note">Hôm nay</span></div>
              <div className="customer-stat-card"><span className="stat-icon">◴</span><small>Kho còn trống</small><strong>{freeUnits}</strong><span className="stat-note">Tại {facility?.name || staff.facilityId}</span></div>
            </section>

            <section className="customer-section">
              <div className="customer-section-heading">
                <div><span className="customer-eyebrow">TODAY</span><h2>Việc cần làm hôm nay</h2></div>
                <button type="button" className="overview-text-button" onClick={() => { setDayFilter("today"); setSection("today"); }}>Mở màn hình bàn giao →</button>
              </div>
              <div className="st-card st-todo-card">
                {actionable.length === 0 && <div className="st-empty">Hôm nay chưa có khách cần nhận kho.</div>}
                {actionable.map((r) => (
                  <button type="button" key={r.id} className="st-todo" onClick={() => open(r.id)}>
                    <span className="st-time">{r.appointmentTime}</span>
                    <span className="st-todo-main"><strong>{r.customerName}</strong><small>{resCode(r)} · {unitsOf(r).join(", ")} · {r.unitType}</small></span>
                    <DayTag res={r} today={today} />
                    <Badge map={RES_STATUS} value={r.status} />
                    <span className="st-go">→</span>
                  </button>
                ))}
              </div>
              {groups.upcoming.length > 0 && (
                <p className="st-hint">Sắp tới còn {groups.upcoming.length} đơn chờ nhận kho (xem trong mục Nhận kho → Sắp tới).</p>
              )}
            </section>
          </div>
        )}

        {section === "today" && (
          <Workspace list={handoverVisible} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} chips={dayChips} />
        )}
        {section === "all" && (
          <Workspace list={allVisible} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} />
        )}

        {section === "units" && (
          <div className="st-card">
            <table className="st-table">
              <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Giá thuê / tháng</th><th>Trạng thái</th></tr></thead>
              <tbody>
                {units.length === 0 && <tr><td colSpan="5" className="st-empty">Cơ sở chưa có kho.</td></tr>}
                {[...units].sort((a, b) => String(a.id).localeCompare(String(b.id), "vi", { numeric: true })).map((u) => (
                  <tr key={u.id}><td><strong>{u.id}</strong></td><td>{u.type}</td><td>{u.size || "—"}</td><td>{fmtMoney(u.pricePerMonth)}</td><td><Badge map={UNIT_STATUS} value={u.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === "log" && (
          <div className="st-card">
            {facilityActivity.length === 0 && <div className="st-empty">Chưa có lần bàn giao nào.</div>}
            <ul className="st-log">
              {facilityActivity.map((a) => (
                <li key={a.id}><small>{fmtDateTime(a.at)} · {a.staffName}</small><div>{a.text}</div></li>
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
const FACILITY_KEY = "storespace_staff_facility";

export default function StaffPortal({ embedded = false, currentUser = null, navigate = null, currentUserKey = "storespace_current_user" } = {}) {
  const [db, setDb] = useState({ facilities: [], units: [], reservations: [], activity: [], staff: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [facilityChoice, setFacilityChoice] = useState(() => {
    try { return localStorage.getItem(FACILITY_KEY) || ""; } catch { return ""; }
  });

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

  // Một nhân viên có thể được phân công ở nhiều cơ sở
  const assignments = db.staff.filter(item =>
    item.email?.toLowerCase() === currentUser?.email?.toLowerCase() &&
    item.status?.toLowerCase() === "active"
  );
  const facilities = [...new Set(assignments.map(a => a.facilityId))];
  const assignment = assignments.find(a => a.facilityId === facilityChoice) || assignments[0];
  const staff = assignment ? {
    id: assignment.id,
    fullName: assignment.fullName,
    email: assignment.email,
    facilityId: assignment.facilityId,
    role: "FACILITY_STAFF"
  } : null;

  const switchFacility = (facilityId) => {
    setFacilityChoice(facilityId);
    try { localStorage.setItem(FACILITY_KEY, facilityId); } catch { /* bỏ qua */ }
  };

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
          staff ? <Portal staff={staff} facilities={facilities} onSwitchFacility={switchFacility} db={db} onLogout={logout} onRefresh={loadState} onHandover={handover} /> :
            <NoAccess navigate={navigate} />}
    </div>
  );
}