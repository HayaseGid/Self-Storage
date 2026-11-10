import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import "./staffstyles.css";
import { apiGet, apiPost, apiPut } from "./api";
import StaffReturns from "./StaffReturns"; // [MAIN-10] luồng trả kho của nhóm
import { mapOperationsState } from "./operationsState";
import { RESERVATION_SORTS, UNIT_SORTS, useOpsList } from "./opsLists";
import { useDialog } from "./Dialog";
import { formatReservationCode } from "./storageRules";
import { getTodayISO } from "./demoClock/demoClock";
import { Code, FilterChips, NewBadge, Pager, SortSelect, UnitCodes, isNewItem, newestFirst, rowClass, timeAgo, useClientPaging, useServerList } from "./listKit";

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => getTodayISO();
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

// [STAFF-TOOLS] Việc được giao (HandoverTask) – giá trị khớp CHECK trong DB
const TASK_TYPE = {
  "Move In": "Nhận kho",
  "Move Out": "Trả kho",
  "Inspection": "Kiểm tra kho",
  "Support": "Hỗ trợ khách",
};
const TASK_STATUS = {
  Scheduled: { label: "Đã lên lịch", tone: "info" },
  "In Progress": { label: "Đang làm", tone: "warn" },
  Completed: { label: "Hoàn thành", tone: "ok" },
  Cancelled: { label: "Đã hủy", tone: "bad" },
};
// [STAFF-TOOLS] Trạng thái kho Staff được đổi (backend chỉ nhận 3 giá trị này)
const STAFF_UNIT_STATUS_OPTIONS = [
  { value: "Available", label: "Còn trống" },
  { value: "Pending Inspection", label: "Chờ kiểm tra" },
  { value: "Maintenance", label: "Bảo trì" },
];
const STAFF_EDITABLE_UNIT = ["AVAILABLE", "MAINTENANCE", "PENDING_INSPECTION", "NEEDS_INSPECTION"];

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

// [STAFF-TOOLS] Việc nhận kho Manager đã giao cho chính mình ở đơn này (db.staffTasks = GET /api/staff-tools/tasks)
const myMoveInTasks = (db, res) =>
  (db.staffTasks || []).filter((t) => t.taskType === "Move In" && Number(t.reservationId) === Number(res.id) && t.status !== "Cancelled");
const isAssignedToMe = (db, res) => {
  const mine = myMoveInTasks(db, res);
  const units = unitsOf(res);
  return units.length > 0 && units.every((u) => mine.some((t) => t.unitNumber === u));
};

// Trạng thái kho KHÔNG được bàn giao (khớp HandoverService.HandoverReadyUnitStatuses ở backend)
const UNIT_NOT_READY = ["IN_USE", "RENTED", "PENDING_INSPECTION", "NEEDS_INSPECTION", "MAINTENANCE", "INACTIVE"];

// Danh sách này CHỈ để hiển thị trước cho nhân viên. Quyết định cuối cùng luôn ở backend (HandoverService),
// các điều kiện dưới đây phải giữ đúng thứ tự và ý nghĩa với backend.
function checkHandover(res, staff, db) {
  const units = unitsOf(res);
  const today = todayStr();
  const notReadyUnits = units.filter((unitId) => {
    const u = db.units.find((x) => x.id === unitId);
    return u && UNIT_NOT_READY.includes(String(u.status).toUpperCase());
  });
  const checks = [
    { key: "facility", label: "Đặt chỗ thuộc đúng cơ sở của bạn", ok: res.facilityId === staff.facilityId },
    { key: "status", label: "Đơn đã được xác nhận và chưa bàn giao", ok: res.status === "CONFIRMED" },
    { key: "payment", label: "Hệ thống đã xác nhận tiền cọc (không dựa vào thông báo từ trình duyệt)", ok: res.paymentStatus === "PAID" },
    { key: "signed", label: "Khách đã ký hợp đồng online", ok: res.contractStatus === "Signed" },
    { key: "date", label: `Đang trong kỳ thuê (từ ${fmtDate(res.startDate)} đến ${fmtDate(endOf(res))})`, ok: !!res.startDate && res.startDate <= today && today <= endOf(res) },
    { key: "assigned", label: "Bạn là người phụ trách đơn này (được hệ thống / Manager phân công)", ok: isAssignedToMe(db, res) },
    { key: "unit", label: notReadyUnits.length ? `Kho sẵn sàng bàn giao (chưa sẵn sàng: ${notReadyUnits.join(", ")})` : `Kho sẵn sàng bàn giao (${units.length} kho)`, ok: units.length > 0 && notReadyUnits.length === 0 },
    { key: "clash", label: "Kho không trùng kỳ thuê với đặt chỗ khác", ok: findClashes(db, res).length === 0 },
  ];
  return { checks, canHandover: checks.every((c) => c.ok) };
}

/* ---------- small UI parts ---------- */
const Badge = ({ map, value }) => {
  const s = map[value] || { label: value, tone: "info" };
  return <span className={`st-badge st-${s.tone}`}>{s.label}</span>;
};
const Info = ({ k, children, strong = false }) => (
  <div className={strong ? "st-info-key" : ""}><small>{k}</small><strong>{children}</strong></div>
);
const DayTag = ({ res, today }) => {
  if (!AWAITING.includes(res.status)) return null; // [SỬA] chỉ nhắc ngày hẹn cho đơn đang chờ bàn giao
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
  const [idChecked, setIdChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const dialog = useDialog();

  const today = todayStr();
  const units = unitsOf(res);
  const { checks, canHandover } = checkHandover(res, staff, db);
  const clashes = findClashes(db, res);
  const handedOver = res.status === "HANDED_OVER";
  const group = dayGroup(res, today);
  const ready = canHandover && idChecked && !busy;

  const doHandover = async () => {
    const keyPreview = units.map((u) => `KEY-${u}`).join(", ");
    const confirmed = await dialog.confirm({
      tone: "warning",
      title: `Xác nhận bàn giao ${units.length} kho cho ${res.customerName}?`,
      message: `Kho ${units.join(", ")} sẽ chuyển sang đang thuê và hợp đồng được kích hoạt. Hãy chắc chắn đã đối chiếu CCCD và bàn giao chìa khóa vật lý (${keyPreview}) cho khách. Mã ra vào cơ sở 6 số sẽ được hệ thống tự động cấp vào hồ sơ của khách.`,
      confirmLabel: "Xác nhận bàn giao"
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const response = await actions.handover(res.id);
      setResult({ tone: "ok", message: response?.message || "Bàn giao thành công." });
    } catch (error) {
      setResult({ tone: "warn", message: error.message });
      void dialog.alert({ tone: "danger", title: "Bàn giao không thành công", message: error.message });
    } finally {
      setBusy(false);
    }
  };

  // [STAFF-TOOLS] Xác nhận đơn đã cọc: Paid -> Confirmed + tạo hợp đồng (thay bước Manager duyệt đã bỏ)
  const doConfirm = async () => {
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Xác nhận đơn ${resCode(res)} đã cọc?`,
      message: "Hệ thống kiểm tra lại tiền cọc và số kho đã giữ, sau đó chuyển đơn sang \"Đã xác nhận\" và tạo hợp đồng để khách ký.",
      confirmLabel: "Xác nhận đơn"
    });
    if (!ok) return;
    setConfirming(true);
    try {
      const response = await actions.confirm(res.id);
      setResult({ tone: "ok", message: response?.message || "Đã xác nhận đơn." });
    } catch (error) {
      setResult({ tone: "warn", message: error.message });
      void dialog.alert({ tone: "danger", title: "Chưa xác nhận được đơn", message: error.message });
    } finally {
      setConfirming(false);
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
          <div className="st-head-codes">
            <span className="st-head-label">Mã đơn</span>
            <Code kind="order">{resCode(res)}</Code>
            <NewBadge createdAt={res.createdAt} />
          </div>
          <h2>{res.customerName}</h2>
          <div className="st-head-units">
            <span className="st-head-label">{units.length} kho</span>
            <UnitCodes units={units} max={8} />
            <span className="st-head-type">{res.unitType}</span>
          </div>
        </div>
        <Badge map={RES_STATUS} value={res.status} />
      </div>

      {res.paymentStatus === "PENDING" && !handedOver && (
        <div className="st-alert st-warn">Khách chưa thanh toán tiền cọc. Chưa thể bàn giao.</div>
      )}
      {res.paymentStatus === "PENDING_CONFIRMATION" && (
        <div className="st-alert st-warn">Khách báo đã thanh toán nhưng hệ thống chưa nhận kết quả từ cổng thanh toán. Không bàn giao dựa trên ảnh chụp hoặc thông báo từ trình duyệt của khách.</div>
      )}
      {!handedOver && AWAITING.includes(res.status) && !isAssignedToMe(db, res) && (
        <div className="st-alert st-warn">Đơn này do nhân viên khác phụ trách (hoặc chưa có người nhận) nên bạn không bàn giao được. Liên hệ Facility Manager nếu cần đổi người.</div>
      )}
      {res.status === "PENDING_APPROVAL" && (
        <div className="st-alert st-warn st-confirm-box">
          <span>Khách đã đặt cọc nhưng đơn chưa được chuyển sang "Đã xác nhận" nên chưa thể bàn giao.</span>
          {res.paymentStatus === "PAID" && (
            <button type="button" className="dashboard-primary-btn sm" onClick={doConfirm} disabled={confirming}>
              {confirming ? "Đang xác nhận..." : "Xác nhận đơn đã cọc"}
            </button>
          )}
        </div>
      )}
      {!handedOver && group === "overdue" && (
        <div className="st-alert st-warn">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, đã quá hẹn. Hãy liên hệ khách trước khi bàn giao.</div>
      )}
      {!handedOver && group === "upcoming" && (
        <div className="st-alert st-info">Lịch hẹn là ngày {fmtDate(res.appointmentDate)}, chưa đến ngày nhận kho.</div>
      )}
      {!handedOver && res.startDate && today < res.startDate && (
        <div className="st-alert st-warn">Kỳ thuê bắt đầu ngày {fmtDate(res.startDate)}. Hệ thống không cho bàn giao kho trước ngày này.</div>
      )}
      {clashes.length > 0 && !handedOver && (
        <div className="st-alert st-warn">
          Trùng kỳ thuê: {clashes.map((c) => `${c.unitId} (đơn ${resCode(c.reservation)})`).join(", ")}. Không bàn giao, báo Facility Manager kiểm tra.
        </div>
      )}

      <div className="st-grid">
        <Info k="Lịch hẹn nhận kho" strong>{fmtDate(res.appointmentDate)} · {res.appointmentTime}</Info>
        <Info k="Cách nhận kho">{res.handoverMethod === "Online"
          ? "Bàn giao online: hoàn tất bàn giao trên hệ thống (mã truy cập hiện trong tài khoản khách), để chìa khóa kèm mã đơn tại quầy lễ tân"
          : "Khách đến nhận trực tiếp trong khung giờ trên, nên gọi xác nhận trước"}</Info>
        <Info k="Tiền cọc" strong>{fmtMoney(res.deposit)} <Badge map={PAY_STATUS} value={res.paymentStatus} /></Info>
        <Info k="Kỳ thuê">{fmtDate(res.startDate)} → {fmtDate(endOf(res))} ({res.months} tháng)</Info>
        <Info k="Liên hệ">{res.customerPhone || "—"} · {res.customerEmail}</Info>
        <Info k="Tổng tiền thuê">{fmtMoney(res.rentalFee)}</Info>
        <Info k="Hình thức trả">{res.paymentPlan === "Upfront" ? "Trả 1 lần" : "Trả theo tháng"} · {res.startRentPaid ? "đã đóng tiền thuê đầu kỳ" : `sau khi nhận kho khách đóng online ${fmtMoney(res.startRentUnpaid)} (${res.paymentPlan === "Upfront" ? "toàn bộ kỳ thuê" : "tháng đầu"})`}</Info>
        {res.paymentTxn && <Info k="Mã giao dịch"><Code>{res.paymentTxn}</Code></Info>}
        {res.createdAt && <Info k="Ngày đặt">{fmtDateTime(res.createdAt)} <span className="st-hint">({timeAgo(res.createdAt)})</span></Info>}
      </div>

      <h3>Kho bàn giao ({units.length})</h3>
      <table className="st-table st-units">
        <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Trạng thái</th></tr></thead>
        <tbody>
          {units.map((unitId) => {
            const u = db.units.find((x) => x.id === unitId);
            return (
              <tr key={unitId}>
                <td><Code kind="unit">{unitId}</Code></td>
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
          <div className="st-alert st-ok">Đã bàn giao{res.contractId ? <> · hợp đồng <Code kind="contract">{res.contractNumber || `#${res.contractId}`}</Code></> : ""}.</div>
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

          <h3>Quyền truy cập & Chìa khóa (Hệ thống tự động cấp)</h3>
          <div style={{ display: 'grid', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', margin: '12px 0' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔑</span>
              <div>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '13.5px' }}>Chìa khóa vật lý từng ô kho</strong>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Mã chìa: {units.map((u) => <code key={u} style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginRight: '4px' }}>KEY-{u}</code>)}
                  — Giao chìa vật lý trực tiếp cho khách tại quầy lễ tân.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '20px' }}>🔢</span>
              <div>
                <strong style={{ display: 'block', color: '#0f172a', fontSize: '13.5px' }}>Mã ra vào cơ sở (Access Code)</strong>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                  Mã 6 chữ số tự động kích hoạt và gửi vào hồ sơ khách hàng. Có hiệu lực trong suốt thời gian thuê, tự động tạm khóa nếu nợ quá hạn &gt; 30 ngày.
                </p>
              </div>
            </div>
          </div>
          <button className="dashboard-primary-btn" type="button" disabled={!ready} onClick={doHandover}>
            {busy ? "Đang bàn giao..." : `Xác nhận bàn giao ${units.length} kho`}
          </button>
          {!ready && !busy && <p className="st-hint">Cần đủ điều kiện và tick xác nhận đã đối chiếu giấy tờ để bàn giao.</p>}
        </>
      )}

      {result && <div className={`st-alert st-${result.tone}`} role="status">{result.message}</div>}
    </div>
  );
}

/* Danh sách đặt chỗ + chi tiết */
/* [AUTO-ASSIGN] Nén ảnh trước khi gửi: cạnh dài tối đa 1280px, JPEG chất lượng 0.7 */
const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("Không đọc được ảnh."));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error("File không phải ảnh hợp lệ."));
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

/* [AUTO-ASSIGN] Báo cáo tình trạng / sự cố kho (POST /api/staff-tools/unit-reports)
   Hư hỏng: kho trống chuyển Bảo trì. Bình thường: kho đang Bảo trì / Chờ kiểm tra được mở lại. */
function UnitReportModal({ unit, onClose, onSubmit }) {
  const [result, setResult] = useState("Damaged");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const addImages = async (fileList) => {
    const files = [...fileList].slice(0, 3 - images.length);
    try {
      const compressed = await Promise.all(files.map(compressImage));
      setImages((prev) => [...prev, ...compressed].slice(0, 3));
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (result === "Damaged" && !notes.trim()) return setError("Vui lòng mô tả tình trạng hư hỏng.");
    setError("");
    setSaving(true);
    try {
      await onSubmit({ unitId: unit.unitId, result, notes: notes.trim() || null, evidenceImages: images });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="st-modal-overlay" role="dialog" aria-modal="true" aria-label={`Báo cáo kho ${unit.id}`}>
      <form className="st-modal" onSubmit={submit}>
        <div className="st-modal-head">
          <h3>Báo cáo tình trạng kho {unit.id}</h3>
          <button type="button" className="st-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        {error && <div className="st-alert st-warn" role="alert">{error}</div>}
        <div className="st-report-choice">
          <label className={result === "Damaged" ? "active bad" : ""}>
            <input type="radio" name="result" value="Damaged" checked={result === "Damaged"} onChange={() => setResult("Damaged")} />
            Hư hỏng / có sự cố
          </label>
          <label className={result === "Good" ? "active ok" : ""}>
            <input type="radio" name="result" value="Good" checked={result === "Good"} onChange={() => setResult("Good")} />
            Bình thường / đã sửa xong
          </label>
        </div>
        <p className="st-hint">
          {result === "Damaged"
            ? "Kho đang trống sẽ chuyển sang Bảo trì để khách không đặt được. Kho đang có khách thì giữ nguyên, Manager sẽ xử lý."
            : "Kho đang Bảo trì / Chờ kiểm tra sẽ được mở lại thành Còn trống."}
        </p>
        <label className="st-field">
          Mô tả tình trạng {result === "Damaged" ? "*" : "(không bắt buộc)"}
          <textarea className="st-input" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Khóa cửa bị kẹt, trần có vết thấm nước" />
        </label>
        <div className="st-field">
          Ảnh minh chứng (tối đa 3)
          <div className="st-report-images">
            {images.map((src, i) => (
              <div key={i} className="st-report-thumb">
                <img src={src} alt={`Ảnh ${i + 1}`} />
                <button type="button" onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))} aria-label="Xóa ảnh">×</button>
              </div>
            ))}
            {images.length < 3 && (
              <label className="st-report-add">
                + Thêm ảnh
                <input type="file" accept="image/*" multiple hidden onChange={(e) => { addImages(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>
        <div className="st-modal-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="dashboard-primary-btn" disabled={saving}>{saving ? "Đang gửi..." : "Gửi báo cáo"}</button>
        </div>
      </form>
    </div>
  );
}

function ReservationItem({ r, active, onSelect, db, today }) {
  const units = unitsOf(r);
  return (
    <button type="button" className={rowClass(r.createdAt, `st-item ${active ? "active" : ""}`)} onClick={onSelect}>
      <div className="st-item-top">
        <Code kind="order">{resCode(r)}</Code>
        <span className="st-name">{r.customerName}</span>
        <NewBadge createdAt={r.createdAt} />
        <DayTag res={r} today={today} />
      </div>
      <div className="st-item-mid">
        <UnitCodes units={units} max={3} />
        {r.unitType && <span className="st-item-type">{r.unitType}</span>}
      </div>
      <div className="st-item-foot">
        <span className="st-item-badges">
          <Badge map={RES_STATUS} value={r.status} />
          {AWAITING.includes(r.status) && (isAssignedToMe(db, r)
            ? <span className="st-badge st-ok">Giao cho bạn</span>
            : <span className="st-badge st-warn">Chưa giao cho bạn</span>)}
        </span>
        <span className="st-item-when"><b>{r.appointmentTime}</b> · Hẹn {fmtDate(r.appointmentDate)}</span>
      </div>
    </button>
  );
}

/* Danh sách (trái) + chi tiết (phải). pager / toolbar: phân trang + bộ lọc của từng màn hình. */
function Workspace({ list, query, setQuery, selected, selectedId, setSelectedId, staff, db, actions, chips, toolbar, pager, loading, error, emptyText }) {
  const today = todayStr();
  return (
    <div className="st-split">
      <div>
        {chips}
        <input className="st-search" placeholder="Tìm theo mã đơn, tên khách, email, SĐT, mã kho" value={query} onChange={(e) => setQuery(e.target.value)} />
        {toolbar}
        {error && <div className="ss-error-line" role="alert">{error}</div>}
        <div className="st-list" aria-busy={loading ? "true" : "false"}>
          {loading && list.length === 0 && <div className="st-card st-empty">Đang tải danh sách…</div>}
          {!loading && list.length === 0 && <div className="st-card st-empty">{emptyText || "Không có đặt chỗ nào phù hợp."}</div>}
          {list.map((r) => (
            <ReservationItem key={r.id} r={r} active={r.id === selectedId} onSelect={() => setSelectedId(r.id)} db={db} today={today} />
          ))}
        </div>
        {pager && <Pager {...pager} unit="đơn" compact />}
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
/* [SỬA] Tên mục nói rõ việc của mục đó; số bên cạnh = việc đang chờ */
const NAV = [
  ["overview", "⌂", "Tổng quan", "Việc hôm nay, số liệu nhanh"],
  ["today", "◷", "Bàn giao kho", "Đơn đã cọc chờ giao kho cho khách"],
  ["all", "▤", "Đơn đặt chỗ", "Mọi đơn tại cơ sở, mới nhất lên đầu"],
  ["units", "▣", "Kho tại cơ sở", "Tình trạng từng kho, báo sự cố"],
  ["returns", "⇦", "Trả kho & kiểm kho", "Nhận lại kho, quyết toán cọc"],
  ["tasks", "☑", "Việc được giao", "Việc Manager giao cho bạn"],
  ["log", "◫", "Nhật ký bàn giao", "Lịch sử bàn giao kho"],
];

const STAFF_RES_FILTERS = [
  ["", "Tất cả"],
  ["PENDING_APPROVAL,CONFIRMED", "Chờ bàn giao"],
  ["HANDED_OVER", "Đang thuê"],
  ["PENDING_PAYMENT", "Chờ cọc"],
  ["COMPLETED", "Đã trả kho"],
  ["CANCELLED,EXPIRED", "Hủy / hết hạn"],
];
const STAFF_UNIT_FILTERS = [
  ["", "Tất cả"],
  ["AVAILABLE", "Còn trống"],
  ["RESERVED", "Đã giữ chỗ"],
  ["RENTED", "Đang thuê"],
  ["MAINTENANCE", "Bảo trì / chờ kiểm tra"],
  ["INACTIVE", "Ngừng dùng"],
];
const sumCounts = (counts) => Object.values(counts || {}).reduce((a, b) => a + b, 0);

function Portal({ staff, facilities, onSwitchFacility, db, onLogout, onRefresh, onHandover, onConfirm, onUnitStatus, onReportUnit }) {
  const [section, setSection] = useState("overview");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [dayFilter, setDayFilter] = useState("today");
  // [STAFF-TOOLS] việc được giao + đổi trạng thái kho
  const [unitBusy, setUnitBusy] = useState("");
  const [reportUnit, setReportUnit] = useState(null); // [AUTO-ASSIGN] kho đang mở form báo cáo
  // [PHÂN TRANG] bộ lọc của "Đơn đặt chỗ" và "Kho tại cơ sở" (lọc / chia trang ở backend)
  const [allStatus, setAllStatus] = useState("");
  const [allSort, setAllSort] = useState("newest");
  const [unitQuery, setUnitQuery] = useState("");
  const [unitStatus, setUnitStatus] = useState("");
  const [unitSort, setUnitSort] = useState("newest");
  const dialog = useDialog();

  const facility = db.facilities.find((f) => f.id === staff.facilityId);
  const mine = useMemo(() => db.reservations.filter((r) => r.facilityId === staff.facilityId), [db, staff]);
  const today = todayStr();
  const sortKey = (r) => `${r.appointmentDate || "9999"}${r.appointmentTime || ""}`;
  const bySort = (a, b) => sortKey(a).localeCompare(sortKey(b));
  const matches = (r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.id, resCode(r), r.customerName, r.customerEmail, ...unitsOf(r)].some((v) => String(v ?? "").toLowerCase().includes(q));
  };

  // Đơn cần bàn giao (đã cọc, chưa bàn giao) MÀ MÌNH PHỤ TRÁCH, chia theo ngày hẹn
  // [AUTO-ASSIGN] Hệ thống tự phân công nên mỗi nhân viên chỉ thấy đơn được giao cho mình
  const awaiting = useMemo(() => mine.filter((r) => AWAITING.includes(r.status) && isAssignedToMe(db, r)).sort(bySort), [mine, db]);
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

  // [PHÂN TRANG] Đơn đặt chỗ: backend lọc + chia trang (GET /api/operations/reservations)
  const allList = useOpsList("reservations", {
    q: query, status: allStatus, sort: allSort, facilityId: facility?.facilityId, pageSize: 10,
    reloadKey: db, fallbackRows: mine, enabled: section === "all" && facility?.facilityId != null,
  });
  // [PHÂN TRANG] Kho tại cơ sở (GET /api/operations/units)
  const unitList = useOpsList("units", {
    q: unitQuery, status: unitStatus, sort: unitSort, facilityId: facility?.facilityId, pageSize: 20,
    reloadKey: db, fallbackRows: units, enabled: section === "units" && facility?.facilityId != null,
  });
  // Bàn giao kho: danh sách nhỏ (đơn giao cho mình) -> chia trang ở frontend
  const handoverPaging = useClientPaging(handoverVisible, { pageSize: 10, resetKey: `${dayFilter}|${query}` });
  const pendingTasks = (db.staffTasks || []).filter((t) => t.facilityName === staff.facilityId && t.status !== "Completed" && t.status !== "Cancelled").length;

  const selected = mine.find((r) => r.id === selectedId) || allList.items.find((r) => r.id === selectedId) || null;

  const actions = { handover: (id, access) => onHandover(id, access), confirm: (id) => onConfirm(id) };

  // [STAFF-TOOLS] Việc được giao tại cơ sở đang chọn (tải cùng state, xem StaffPortal.loadState)
  const tasks = (db.staffTasks || []).filter((t) => t.facilityName === staff.facilityId);
  const tasksError = db.staffTasksError || "";
  const taskPaging = useClientPaging(tasks, { pageSize: 15 });
  const logPaging = useClientPaging(facilityActivity, { pageSize: 20 });

  // [STAFF-TOOLS] Đổi trạng thái kho (PUT /api/staff-tools/units/{unitId}/status)
  const changeUnitStatus = async (unit, nextStatus) => {
    const option = STAFF_UNIT_STATUS_OPTIONS.find((o) => o.value === nextStatus);
    if (!option) return;
    const ok = await dialog.confirm({
      tone: "warning",
      title: `Đổi trạng thái kho ${unit.id}?`,
      message: `Kho ${unit.id} sẽ chuyển sang "${option.label}".`,
      confirmLabel: "Đổi trạng thái"
    });
    if (!ok) return;
    setUnitBusy(unit.id);
    try {
      await onUnitStatus(unit.unitId, nextStatus);
    } catch (err) {
      void dialog.alert({ tone: "danger", title: "Không đổi được trạng thái kho", message: err.message });
    } finally {
      setUnitBusy("");
    }
  };
  const open = (id) => { setSelectedId(id); setDayFilter("all"); setSection("today"); };

  const HEAD = {
    overview: ["STAFF DASHBOARD", `Xin chào, ${staff.fullName}!`, `Nhận kho và bàn giao cho khách tại ${facility?.name || staff.facilityId}.`],
    today: ["CHECK-IN & HANDOVER", "Bàn giao kho", "Đơn đã cọc được giao cho bạn: kiểm tra điều kiện và bàn giao kho cho khách theo lịch hẹn."],
    all: ["RESERVATIONS", "Đơn đặt chỗ", "Toàn bộ đơn đặt chỗ tại cơ sở. Đơn mới đặt nằm đầu danh sách và được tô vàng."],
    units: ["FACILITY UNITS", "Kho tại cơ sở", "Kiểm tra kho và báo cáo khi phát hiện sự cố. Kho hư hỏng tự chuyển sang Bảo trì."],
    returns: ["MOVE-OUT & INSPECTION", "Trả kho & kiểm kho", "Nhận lại kho khách trả, kiểm tra tình trạng và quyết toán tiền cọc."],
    tasks: ["MY TASKS", "Việc được giao", "Các công việc nhận kho, trả kho, kiểm tra được giao cho bạn."],
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
          {NAV.map(([key, icon, label, hint]) => {
            const count = key === "today" ? actionable.length : key === "tasks" ? pendingTasks : 0;
            return (
              <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)} title={hint}>
                <span>{icon}</span>{label}
                {count > 0 && <span className="st-nav-count">{count}</span>}
              </button>
            );
          })}
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
                    <span className="st-todo-main"><strong>{r.customerName}</strong><small className="st-todo-codes"><Code kind="order">{resCode(r)}</Code><UnitCodes units={unitsOf(r)} max={3} /><span>{r.unitType}</span></small></span>
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
          <Workspace list={handoverPaging.pageRows} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions} chips={dayChips}
            pager={handoverPaging.pagerProps} emptyText="Không có đơn nào cần bàn giao trong nhóm này." />
        )}
        {section === "all" && (
          <Workspace list={allList.items} query={query} setQuery={setQuery} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} staff={staff} db={db} actions={actions}
            chips={<FilterChips options={STAFF_RES_FILTERS} value={allStatus} onChange={setAllStatus} counts={allList.statusCounts} total={sumCounts(allList.statusCounts)} className="st-chips-row" />}
            toolbar={<div className="ss-toolbar st-list-toolbar"><SortSelect value={allSort} onChange={setAllSort} options={RESERVATION_SORTS} /></div>}
            pager={allList.pagerProps} loading={allList.loading} error={allList.error} />
        )}

        {section === "units" && (
          <div className="st-card">
            <div className="ss-toolbar">
              <input className="ss-search ss-grow" placeholder="Tìm mã kho, loại kho, khu, tầng" value={unitQuery} onChange={(e) => setUnitQuery(e.target.value)} />
              <SortSelect value={unitSort} onChange={setUnitSort} options={UNIT_SORTS} />
            </div>
            <FilterChips options={STAFF_UNIT_FILTERS} value={unitStatus} onChange={setUnitStatus} counts={unitList.statusCounts} total={sumCounts(unitList.statusCounts)} className="st-chips-row" />
            {unitList.error && <div className="ss-error-line" role="alert">{unitList.error}</div>}
            <table className="st-table">
              <thead><tr><th>Mã kho</th><th>Loại kho</th><th>Size</th><th>Vị trí</th><th>Giá thuê / tháng</th><th>Trạng thái</th><th>Đổi trạng thái</th><th>Báo cáo</th></tr></thead>
              <tbody>
                {unitList.loading && unitList.items.length === 0 && <tr><td colSpan="8" className="st-empty">Đang tải danh sách kho…</td></tr>}
                {!unitList.loading && unitList.items.length === 0 && <tr><td colSpan="8" className="st-empty">{units.length === 0 ? "Cơ sở chưa có kho." : "Không có kho phù hợp bộ lọc."}</td></tr>}
                {unitList.items.map((u) => (
                  <tr key={u.id} className={rowClass(u.createdAt)}>
                    <td><Code kind="unit">{u.id}</Code> <NewBadge createdAt={u.createdAt} /></td><td>{u.type}</td><td>{u.size || "—"}</td>
                    <td>{[u.zone && `Khu ${u.zone}`, u.floor && `Tầng ${u.floor}`].filter(Boolean).join(" · ") || "—"}</td>
                    <td><b>{fmtMoney(u.pricePerMonth)}</b></td>
                    <td><Badge map={UNIT_STATUS} value={u.status} /></td>
                    <td>
                      {STAFF_EDITABLE_UNIT.includes(u.status) && u.unitId != null ? (
                        <select className="st-input st-unit-status" value="" disabled={unitBusy === u.id} onChange={(e) => changeUnitStatus(u, e.target.value)}>
                          <option value="">{unitBusy === u.id ? "Đang lưu..." : "Chọn trạng thái mới"}</option>
                          {STAFF_UNIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : <span className="st-hint">Kho đang có đơn hoặc ngừng dùng</span>}
                    </td>
                    <td>
                      {u.unitId != null && u.status !== "INACTIVE"
                        ? <button type="button" className="dashboard-secondary-btn sm" onClick={() => setReportUnit(u)}>Báo cáo</button>
                        : <span className="st-hint">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...unitList.pagerProps} unit="kho" />
          </div>
        )}

        {section === "returns" && <StaffReturns staff={staff} />}

        {/* [STAFF-TOOLS] VIỆC ĐƯỢC GIAO */}
        {section === "tasks" && (
          <div className="st-card">
            {tasksError && <div className="st-alert st-warn" role="alert">{tasksError}</div>}
            {(
              <table className="st-table">
                <thead><tr><th>Ngày hẹn</th><th>Loại việc</th><th>Kho</th><th>Đơn / Khách</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {tasks.length === 0 && <tr><td colSpan="5" className="st-empty">Bạn chưa được giao việc nào tại cơ sở này.</td></tr>}
                  {taskPaging.pageRows.map((t) => (
                    <tr key={t.taskId} className={rowClass(t.createdAt)}>
                      <td><b>{fmtDate(t.scheduledDate)}</b>{t.scheduledSlot || t.scheduledTime ? ` · ${t.scheduledSlot || t.scheduledTime}` : ""} <NewBadge createdAt={t.createdAt} label="Mới giao" />{t.handoverMethod === "Online" && t.taskType === "Move In" ? <span className="st-cell-sub">Bàn giao online · chìa để ở lễ tân</span> : ""}</td>
                      <td>{TASK_TYPE[t.taskType] || t.taskType}</td>
                      <td><Code kind="unit">{t.unitNumber}</Code></td>
                      <td><Code kind="order">{t.reservationCode || (t.reservationId ? formatReservationCode(t.reservationId) : null)}</Code>{t.customerName ? <span className="st-cell-sub">{t.customerName}</span> : ""}{t.customerPhone || t.customerEmail ? <span className="st-cell-sub">{t.customerPhone ? <a href={`tel:${t.customerPhone}`}>{t.customerPhone}</a> : null}{t.customerPhone && t.customerEmail ? " · " : ""}{t.customerEmail ? <a href={`mailto:${t.customerEmail}`}>{t.customerEmail}</a> : null}</span> : ""}</td>
                      <td><Badge map={TASK_STATUS} value={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Pager {...taskPaging.pagerProps} unit="việc" />
          </div>
        )}

        {reportUnit && (
          <UnitReportModal
            unit={reportUnit}
            onClose={() => setReportUnit(null)}
            onSubmit={async (body) => {
              const response = await onReportUnit(body);
              setReportUnit(null);
              const text = [response?.message, response?.warning].filter(Boolean).join(" ");
              void dialog.alert({ tone: response?.warning ? "warning" : "success", title: "Đã gửi báo cáo", message: text || "Đã ghi báo cáo kho." });
            }}
          />
        )}

        {section === "log" && (
          <div className="st-card">
            {facilityActivity.length === 0 && <div className="st-empty">Chưa có lần bàn giao nào.</div>}
            <ul className="st-log">
              {logPaging.pageRows.map((a) => (
                <li key={a.id} className={rowClass(a.at)}><small><b>{fmtDateTime(a.at)}</b> · {a.staffName} <NewBadge createdAt={a.at} /></small><div>{a.text}</div></li>
              ))}
            </ul>
            <Pager {...logPaging.pagerProps} unit="lượt" />
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

  // silent = tải lại ngầm, không che trang (dùng sau bàn giao / xác nhận / đổi trạng thái)
  const loadState = async ({ silent = false } = {}) => {
    if (!currentUser?.email || currentUser.role !== "FACILITY_STAFF") {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await apiGet(`/api/operations/state?email=${encodeURIComponent(currentUser.email)}`);
      // [AUTO-ASSIGN] Tự phân công đơn đã cọc chưa có người ở các cơ sở mình làm việc, rồi mới tải việc của mình
      const mapped = mapOperationsState(data);
      const myFacilityNames = (mapped.staff || [])
        .filter((s) => s.email?.toLowerCase() === currentUser.email.toLowerCase() && s.status?.toLowerCase() === "active")
        .map((s) => s.facilityId);
      const facilityIds = (mapped.facilities || [])
        .filter((f) => myFacilityNames.includes(f.id) && f.facilityId != null)
        .map((f) => f.facilityId);
      await Promise.all(facilityIds.map((id) => apiPost(`/api/manager-tools/facilities/${id}/auto-assign`, {}).catch(() => null)));
      // [7a] Cập nhật phí trễ hạn tiền thuê của cơ sở tới hôm nay (lỗi không chặn trang)
      await Promise.all(facilityIds.map((id) => apiPost(`/api/late-fees/facilities/${id}/sync`, {}).catch(() => null)));
      // [STAFF-TOOLS] Việc Manager giao cho mình: dùng để kiểm tra quyền bàn giao và hiện mục "Việc được giao"
      let staffTasks = [];
      let staffTasksError = "";
      try {
        const taskData = await apiGet("/api/staff-tools/tasks");
        staffTasks = Array.isArray(taskData) ? taskData : [];
      } catch (taskError) {
        staffTasksError = taskError.message;
      }
      setDb({ ...mapped, staffTasks, staffTasksError });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
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
  const handover = async (reservationId) => {
    // [STAFF-TOOLS] Bàn giao qua API có kiểm tra phân công (hệ thống tự sinh AccessCode & KEY-UnitNumber)
    const response = await apiPost("/api/staff-tools/handover", {
      reservationID: Number(reservationId),
      notes: ""
    });
    await loadState({ silent: true });
    return response;
  };

  // [STAFF-TOOLS] Paid -> Confirmed + tạo hợp đồng
  const confirmReservation = async (reservationId) => {
    const response = await apiPost(`/api/staff-tools/reservations/${Number(reservationId)}/confirm`);
    await loadState({ silent: true });
    return response;
  };

  // [STAFF-TOOLS] Đổi trạng thái kho
  // [AUTO-ASSIGN] Báo cáo tình trạng / sự cố kho
  const reportUnitCondition = async (body) => {
    const response = await apiPost("/api/staff-tools/unit-reports", body);
    await loadState({ silent: true });
    return response;
  };

  const updateUnitStatus = async (unitId, status) => {
    const response = await apiPut(`/api/staff-tools/units/${Number(unitId)}/status`, { status });
    await loadState({ silent: true });
    return response;
  };

  return (
    <div className="st-root">
      {loading ? <div className="st-card">Đang tải dữ liệu vận hành từ backend...</div> :
        error ? <div className="st-card"><div className="st-alert st-warn" role="alert">{error}</div><button type="button" className="dashboard-primary-btn" onClick={() => loadState()}>Thử lại</button></div> :
          staff ? <Portal staff={staff} facilities={facilities} onSwitchFacility={switchFacility} db={db} onLogout={logout} onRefresh={() => loadState()} onHandover={handover} onConfirm={confirmReservation} onUnitStatus={updateUnitStatus} onReportUnit={reportUnitCondition} /> :
            <NoAccess navigate={navigate} />}
    </div>
  );
}
