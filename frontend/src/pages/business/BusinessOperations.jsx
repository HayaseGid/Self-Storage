/**
 * ======================================================================
 * FILE: src/pages/business/BusinessOperations.jsx  —  TRANG LÀM VIỆC CỦA BUSINESS OPERATIONS MANAGER
 * CHỨC NĂNG: Khung trang chính (sidebar + topbar + nội dung) cho vai trò Business Operations.
 *   Tải toàn bộ dữ liệu vận hành + báo cáo từ backend, điều hướng giữa 6 mục menu:
 *   Tổng quan · Cơ sở toàn hệ thống · Kích thước & giá · Chính sách · Doanh thu & hiệu suất · Báo cáo & xuất file.
 *   Tự xử lý thêm / sửa / ngừng hoạt động / xóa cơ sở; các mục còn lại giao cho component con.
 * THÀNH PHẦN CHÍNH:
 *   - BusinessOperations (export default): component trang, giữ state dữ liệu và mục menu đang mở.
 *     + loadBusinessData: tải dữ liệu vận hành + báo cáo.
 *     + runOperation / showOperationError: chạy 1 thao tác API rồi tải lại ngầm / hiện lỗi.
 *     + updateFacility / deleteFacility / handleAddFacility: sửa / xóa / tạo cơ sở.
 *   - BusinessLiveDashboard (nội bộ): màn hình "Tổng quan" (thẻ KPI + bảng doanh thu theo tháng).
 * DÙNG Ở: src/App.jsx (khi người dùng có vai trò BUSINESS_OPERATIONS).
 * PHỤ THUỘC: api/api, mappers/operationsState (mapOperationsState), components/common/Dialog,
 *   services/storageRules (generateUnitCodePrefix), features/unit/unitTypes.css, BusinessOperations.css,
 *   các màn hình con cùng folder: BusinessPanels, BusinessPolicyEditor, BusinessPriceBands, BusinessFacilityForm.
 * API (OperationsController):
 *   GET    /api/operations/state?email=...      -> toàn bộ dữ liệu vận hành (cơ sở, kho, đơn, quản lý...) -> mapOperationsState()
 *   GET    /api/operations/reports               -> số liệu báo cáo, doanh thu theo tháng
 *   POST   /api/operations/facilities            -> tạo cơ sở mới (mã chi nhánh tự sinh từ tên)
 *   PUT    /api/operations/facilities/{id}       -> sửa tên / địa chỉ / quản lý / trạng thái cơ sở
 *   DELETE /api/operations/facilities/{id}       -> xóa cơ sở
 *   (Các component con tự gọi thêm API riêng: khung giá, chính sách...)
 * LUỒNG: mở trang -> loadBusinessData (GET state + reports) -> tính mảng `facilities` (kèm số kho / đang thuê)
 *   -> người dùng chọn menu -> component con hiển thị; khi sửa / xóa cơ sở -> runOperation gọi API
 *   -> tải lại ngầm (silent) -> giao diện cập nhật.
 * ======================================================================
 */
import React, { useEffect, useState } from "react";
import "./BusinessOperations.css";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/api";
import { mapOperationsState } from "../../mappers/operationsState";
import { useDialog } from "../../components/common/Dialog";
import { generateUnitCodePrefix } from "../../services/storageRules";
import "../../features/unit/unitTypes.css";
import { BusinessFacilitiesByArea, BusinessPerformance, BusinessReportsCenter } from "./BusinessPanels";
import { BusinessPolicyEditor } from "./BusinessPolicyEditor";
import BusinessFacilityForm from "./BusinessFacilityForm";
import BusinessPriceBands from "./BusinessPriceBands";

/**
 * Trang Business Operations: tải dữ liệu vận hành + báo cáo, điều hướng giữa các mục menu,
 * thêm / sửa / ngừng hoạt động / xóa cơ sở và đăng xuất (xóa phiên trong localStorage).
 * Được gọi bởi: App.jsx khi người dùng đăng nhập là Business Operations Manager.
 * @param {object} props
 * @param {object} props.currentUser người đang đăng nhập (cần `email` để gọi /api/operations/state, `name` để hiển thị).
 * @param {Function} props.navigate hàm điều hướng của App.
 * @param {string} [props.currentUserKey] khóa localStorage lưu phiên đăng nhập (mặc định "storespace_current_user").
 * @returns {JSX.Element} bố cục trang Business Operations.
 */
function BusinessOperations({ currentUser, navigate, currentUserKey = "storespace_current_user" }) {
    const dialog = useDialog();
    const [activeMenu, setActiveMenu] = useState("dashboard"); // 'dashboard' | 'facilities' | 'prices' | 'policies' | 'revenue' | 'reports'
    const [showAddFacility, setShowAddFacility] = useState(false); // bật/tắt modal "Thêm cơ sở mới"
    const [operationState, setOperationState] = useState(null); // dữ liệu vận hành đã chuẩn hóa (facilities, units, managers...)
    const [reports, setReports] = useState(null); // số liệu báo cáo từ /api/operations/reports
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState("");
    // Danh sách cơ sở để hiển thị: ghép thông tin cơ sở với số kho, số kho đang thuê / bảo trì của cơ sở đó.
    const facilities = operationState?.facilities.map(facility => {
        const units = operationState.units.filter(unit => unit.facilityDbId === facility.facilityId);
        return {
            id: facility.facilityId,
            facilityId: facility.facilityId,
            name: facility.name,
            unitCodePrefix: facility.unitCodePrefix,
            area: facility.address,
            address: facility.address,
            manager: facility.managerEmail,
            managerEmail: facility.managerEmail,
            totalUnits: units.length,
            rentedUnits: units.filter(unit => unit.status === "RENTED").length,
            maintenanceUnits: units.filter(unit => unit.status === "MAINTENANCE").length,
            status: facility.status,
            createdAt: facility.createdAt
        };
    }) || [];

    /**
     * Tải song song dữ liệu vận hành và báo cáo, chuẩn hóa bằng mapOperationsState rồi lưu vào state.
     * API: GET /api/operations/state?email=...  +  GET /api/operations/reports
     * Được gọi khi: mở trang / đổi email (useEffect), bấm "Thử lại", sau khi tạo cơ sở, và trong runOperation.
     * @param {{silent?: boolean}} [options] silent = true: tải lại ngầm sau thao tác,
     *   không thay cả trang bằng màn hình "Đang tải".
     */
    const loadBusinessData = async ({ silent = false } = {}) => {
        if (!currentUser?.email) {
            setApiError("Phiên đăng nhập không có email Business Operations.");
            setLoading(false);
            return;
        }
        if (!silent) setLoading(true);
        setApiError("");
        try {
            const [stateData, reportData] = await Promise.all([
                apiGet(`/api/operations/state?email=${encodeURIComponent(currentUser.email)}`),
                apiGet("/api/operations/reports")
            ]);
            setOperationState(mapOperationsState(stateData));
            setReports(reportData);
        } catch (error) {
            setApiError(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Chạy khi mở trang và mỗi khi email người đăng nhập thay đổi: tải lại toàn bộ dữ liệu.
    useEffect(() => { loadBusinessData(); }, [currentUser?.email]);

    // Dữ liệu đang nhập trong modal "Thêm cơ sở mới".
    const [newFacility, setNewFacility] = useState({
        name: "",
        unitCodePrefix: "",
        area: "",
        address: "",
        manager: "",
        status: "active"
    });


    // Hiện lỗi thao tác bằng pop-up (không chỉ một dòng nhỏ ở đầu trang) và lưu vào apiError.
    // Trả về Promise của hộp thoại để nơi gọi có thể await đến khi người dùng đóng.
    const showOperationError = (error, title = "Thao tác không thành công") => {
        setApiError(error.message);
        return dialog.alert({ tone: "danger", title, message: error.message });
    };

    /**
     * Chạy 1 thao tác gọi API, thành công thì tải lại dữ liệu ngầm (silent), lỗi thì hiện pop-up.
     * Được gọi bởi: updateFacility, deleteFacility.
     * @param {Function} operation hàm trả về Promise (lời gọi API).
     * @param {string} errorTitle tiêu đề pop-up khi lỗi.
     * @returns {Promise<boolean>} true nếu thành công.
     */
    const runOperation = async (operation, errorTitle) => {
        setApiError("");
        try {
            await operation();
            await loadBusinessData({ silent: true });
            return true;
        } catch (error) {
            await showOperationError(error, errorTitle);
            return false;
        }
    };

    const [editingFacility, setEditingFacility] = useState(null); // cơ sở đang mở trong BusinessFacilityForm (null = đóng)

    /**
     * Cập nhật thông tin cơ sở; trường nào không có trong `values` thì giữ giá trị cũ.
     * Hỏi xác nhận khi chuyển sang ngừng hoạt động (trừ khi skipConfirm).
     * API: PUT /api/operations/facilities/{facilityId}  body { facilityName, address, managerEmail, status }
     * Được gọi khi: bấm bật/tắt trạng thái ở BusinessFacilitiesByArea, hoặc bấm Lưu ở BusinessFacilityForm.
     * @param {object} facility cơ sở hiện tại.
     * @param {object} values giá trị mới { name?, address?, managerEmail?, status? }.
     * @param {{skipConfirm?: boolean}} [options] true = bỏ qua hộp thoại xác nhận.
     * @returns {Promise<boolean|undefined>} true nếu thành công, undefined nếu người dùng hủy.
     */
    const updateFacility = async (facility, values, { skipConfirm = false } = {}) => {
        if (!skipConfirm && values.status === "inactive" && facility.status !== "inactive") {
            const confirmed = await dialog.confirm({
                tone: "warning",
                title: `Ngừng hoạt động "${facility.name}"?`,
                message: "Khách hàng sẽ không thể đặt kho mới tại cơ sở này cho đến khi bật lại.",
                confirmLabel: "Ngừng hoạt động"
            });
            if (!confirmed) return;
        }
        return runOperation(() =>
            apiPut(`/api/operations/facilities/${facility.facilityId}`, {
                facilityName: values.name ?? facility.name,
                address: values.address ?? facility.address,
                managerEmail: values.managerEmail ?? facility.managerEmail ?? facility.manager,
                status: values.status ?? facility.status
            }),
            "Không cập nhật được cơ sở"
        );
    };

    /**
     * Xóa cơ sở sau khi hỏi xác nhận (không hoàn tác được).
     * API: DELETE /api/operations/facilities/{facilityId}
     * Được gọi khi: bấm nút xóa cơ sở trong BusinessFacilitiesByArea (prop onDelete).
     * @param {object} facility cơ sở cần xóa.
     */
    const deleteFacility = async facility => {
        const confirmed = await dialog.confirm({
            tone: "danger",
            title: `Xóa cơ sở "${facility.name}"?`,
            message: "Toàn bộ dữ liệu cơ sở sẽ bị xóa và không thể hoàn tác.",
            confirmLabel: "Xóa cơ sở"
        });
        if (!confirmed) return;
        return runOperation(() => apiDelete(`/api/operations/facilities/${facility.facilityId}`), "Không xóa được cơ sở");
    };



    // Mã chi nhánh do hệ thống tự sinh từ tên cơ sở (không cho người dùng nhập),
    // tự tránh trùng với các mã đã có.
    const autoUnitCodePrefix = newFacility.name.trim()
        ? generateUnitCodePrefix(newFacility.name, (operationState?.facilities || []).map(facility => facility.unitCodePrefix))
        : "";

    /**
     * Tạo cơ sở mới từ modal: kiểm tra đã nhập tên, địa chỉ và chọn quản lý; mã chi nhánh lấy từ
     * autoUnitCodePrefix (tự sinh). Thành công thì tải lại dữ liệu, xóa form và đóng modal.
     * API: POST /api/operations/facilities  body { facilityName, unitCodePrefix, address, managerEmail, status }
     * Được gọi khi: bấm nút "Tạo cơ sở" trong modal.
     */
    const handleAddFacility = () => {
        if (
            !newFacility.name.trim() ||
            !newFacility.address.trim()
        ) {
            void dialog.alert({ tone: "warning", title: "Thiếu thông tin", message: "Vui lòng nhập đầy đủ tên và địa chỉ cơ sở." });
            return;
        }

        if (!newFacility.manager || !newFacility.manager.includes("@")) {
            void dialog.alert({ tone: "warning", title: "Chưa chọn quản lý", message: "Vui lòng chọn Facility Manager hợp lệ." });
            return;
        }

        apiPost("/api/operations/facilities", {
            facilityName: newFacility.name.trim(),
            unitCodePrefix: autoUnitCodePrefix,
            address: newFacility.address.trim(),
            managerEmail: newFacility.manager,
            status: newFacility.status
        }).then(async () => {
            await loadBusinessData();
            setNewFacility({ name: "", unitCodePrefix: "", area: "", address: "", manager: "", status: "active" });
            setShowAddFacility(false);
        }).catch(error => showOperationError(error, "Không tạo được cơ sở"));
    };

    // Đóng modal thêm cơ sở và xóa dữ liệu đang nhập. Chạy khi bấm "Hủy" hoặc nút ✕.
    const handleCloseAddFacility = () => {
        setShowAddFacility(false);

        setNewFacility({
            name: "",
            unitCodePrefix: "",
            area: "",
            address: "",
            manager: "",
            status: "active"
        });
    };

    // Đăng xuất (nút ở cuối sidebar): xóa khóa currentUserKey khỏi localStorage và về trang chủ.
    const handleLogout = () => {
        localStorage.removeItem(currentUserKey);
        navigate("/");
    };

    // Đang tải lần đầu -> màn hình chờ; lỗi mà chưa có dữ liệu -> báo lỗi + nút "Thử lại".
    if (loading) return <main className="customer-main" style={{ padding: 32 }}>Đang tải dữ liệu kinh doanh từ backend...</main>;
    if (apiError && !operationState) {
        return <main className="customer-main" style={{ padding: 32 }}>
            <div className="auth-message error" role="alert">{apiError}</div>
            <button className="dashboard-primary-btn" type="button" onClick={loadBusinessData}>Thử lại</button>
        </main>;
    }

    return (
        <div className="customer-layout business-layout">

            {/* SIDEBAR */}
            <aside className="customer-sidebar">

                <div className="customer-brand">
                    <span className="brand-mark">S</span>
                    <div>
                        <strong>StoreSpace</strong>
                        <small>Business Operations</small>
                    </div>
                </div>

                <nav className="customer-nav">

                    <button
                        className={
                            activeMenu === "dashboard"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("dashboard")}
                    >
                        <span>⌂</span> Tổng quan
                    </button>

                    <button
                        className={
                            activeMenu === "facilities"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("facilities")}
                    >
                        <span>▣</span> Cơ sở toàn hệ thống
                    </button>

                    <button
                        className={
                            activeMenu === "prices"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("prices")}
                    >
                        <span>◷</span> Kích thước & giá
                    </button>

                    <button
                        className={
                            activeMenu === "policies"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("policies")}
                    >
                        <span>▤</span> Chính sách
                    </button>

                    <button
                        className={
                            activeMenu === "revenue"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("revenue")}
                    >
                        <span>◈</span> Doanh thu & hiệu suất
                    </button>

                    <button
                        className={
                            activeMenu === "reports"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("reports")}
                    >
                        <span>▥</span> Báo cáo & xuất file
                    </button>

                </nav>

                <div className="customer-sidebar-bottom">


                    <button
                        
                        onClick={handleLogout}
                    >
                        <span>↪</span> Đăng xuất
                    </button>

                </div>

            </aside>

            {/* MAIN */}
            <main className="customer-main">

                <div className="customer-topbar">

                    <div>
                        <span className="customer-eyebrow">BUSINESS OPERATIONS</span>
                        <h1>
                            {activeMenu === "dashboard" && "Tổng quan kinh doanh"}
                            {activeMenu === "facilities" && "Quản lý cơ sở"}
                            {activeMenu === "prices" && "Quy chuẩn kích thước & khung giá"}
                            {activeMenu === "policies" && "Thiết lập chính sách chung"}
                            {activeMenu === "revenue" && "Doanh thu & hiệu suất"}
                            {activeMenu === "reports" && "Báo cáo toàn hệ thống"}
                        </h1>

                        <p>
                            Quản lý và theo dõi hoạt động kinh doanh của StoreSpace
                        </p>
                    </div>

                    <div className="business-header-right">
                        <div className="business-user">

                            <div className="business-avatar">
                                {currentUser?.name?.charAt(0)?.toUpperCase() || "BO"}
                            </div>

                            <div className="business-user-info">
                                <strong>{currentUser?.name || "Business Operations"}</strong>

                                <span>
                                    Business Operations
                                </span>
                            </div>

                        </div>

                    </div>

                </div>

                <section className="business-content">
                    {apiError && <div className="auth-message error" role="alert">{apiError}</div>}

                    {activeMenu === "dashboard" && (
                        <BusinessLiveDashboard facilities={facilities} reports={reports} />
                    )}

                    {activeMenu === "facilities" && (
                        <BusinessFacilitiesByArea
                            facilities={facilities}
                            units={operationState.units}
                            onAdd={() => setShowAddFacility(true)}
                            onEdit={facility => setEditingFacility(facility)}
                            onUpdateStatus={(facility, status) => updateFacility(facility, { status })}
                            onDelete={deleteFacility}
                        />
                    )}

                    {editingFacility && (
                        <BusinessFacilityForm
                            facility={editingFacility}
                            facilities={facilities}
                            managers={operationState.managers}
                            dialog={dialog}
                            onClose={() => setEditingFacility(null)}
                            onSave={async values => {
                                const ok = await updateFacility(editingFacility, values, { skipConfirm: true });
                                if (ok) setEditingFacility(null);
                            }}
                        />
                    )}

                    {activeMenu === "prices" && <BusinessPriceBands dialog={dialog} />}

                    {activeMenu === "policies" && <BusinessPolicyEditor facilities={facilities} dialog={dialog} />}

                    {activeMenu === "revenue" && <BusinessPerformance reports={reports} facilities={facilities} />}

                    {activeMenu === "reports" && (
                        <BusinessReportsCenter reports={reports} operationState={operationState} facilities={facilities} />
                    )}

                </section>

            </main>

            {/* ADD FACILITY MODAL */}
            {showAddFacility && (
                <div
                    className="facility-modal-overlay"
                    // onClick={(e) => {
                    //     if (e.target === e.currentTarget) {
                    //         handleCloseAddFacility();
                    //     }
                    // }}
                >
                    <div className="facility-modal">

                        <div className="facility-modal-header">

                            <div>
                                <h3>
                                    Thêm cơ sở mới
                                </h3>

                                <p>
                                    Tạo một cơ sở lưu trữ mới
                                </p>
                            </div>

                            <button onClick={handleCloseAddFacility}>
                                ✕
                            </button>

                        </div>

                        <div className="facility-form-grid">

                            <div className="facility-form-group">
                                <label>
                                    Tên cơ sở
                                </label>

                                <input
                                    value={newFacility.name}
                                    onChange={(e) =>
                                        setNewFacility({
                                            ...newFacility,
                                            name: e.target.value
                                        })
                                    }
                                    placeholder="Ví dụ: StoreSpace Bình Thạnh"
                                />
                            </div>

                            <div className="facility-form-group">
                                <label>
                                    Mã chi nhánh (tiền tố mã kho)
                                </label>
                                <div className="business-auto-code" aria-live="polite">
                                    {autoUnitCodePrefix
                                        ? <><strong>{autoUnitCodePrefix}</strong><span>Mã kho sẽ có dạng {autoUnitCodePrefix}-U01, {autoUnitCodePrefix}-U02…</span></>
                                        : <span>Nhập tên cơ sở, hệ thống sẽ tự sinh mã.</span>}
                                </div>
                                <small>Hệ thống tự sinh từ tên cơ sở và không trùng với cơ sở khác, không nhập tay.</small>
                            </div>

                            <div className="facility-form-group full">
                                <label>
                                    Địa chỉ
                                </label>

                                <input
                                    value={newFacility.address}
                                    onChange={(e) =>
                                        setNewFacility({
                                            ...newFacility,
                                            address: e.target.value
                                        })
                                    }
                                    placeholder="Ví dụ: 125 Điện Biên Phủ, Bình Thạnh, TP.HCM"
                                />
                            </div>

                            <div className="facility-form-group">
                                <label>
                                    Người quản lý
                                </label>

                                <select
                                    value={newFacility.manager}
                                    onChange={(e) =>
                                        setNewFacility({
                                            ...newFacility,
                                            manager: e.target.value
                                        })
                                    }
                                >
                                    <option value="">Chọn Facility Manager</option>
                                    {operationState.managers.map(manager => <option key={manager.userId} value={manager.email}>{manager.fullName} · {manager.email}</option>)}
                                </select>

                                                <small>Chỉ chọn Facility Manager đã hoạt động trong database.</small>
                            </div>

                            <div className="facility-form-group">
                                <label>
                                    Trạng thái
                                </label>

                                <select
                                    value={newFacility.status}
                                    onChange={(e) =>
                                        setNewFacility({
                                            ...newFacility,
                                            status: e.target.value
                                        })
                                    }
                                >
                                    <option value="active">
                                        Đang hoạt động
                                    </option>

                                    <option value="inactive">
                                        Ngừng hoạt động
                                    </option>
                                </select>
                            </div>

                        </div>

                        <div className="facility-modal-footer">

                            <button
                                className="facility-cancel-button"
                                onClick={handleCloseAddFacility}
                            >
                                Hủy
                            </button>

                            <button
                                className="facility-save-button"
                                onClick={handleAddFacility}
                            >
                                Tạo cơ sở
                            </button>

                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}

/**
 * Màn hình "Tổng quan" của Business Operations: 4 thẻ KPI (tổng cơ sở, tổng kho, kho đang sử dụng + % công suất,
 * doanh thu đã ghi nhận) và bảng doanh thu theo tháng. Không gọi API, chỉ hiển thị dữ liệu được truyền vào.
 * Được gọi bởi: BusinessOperations khi activeMenu === "dashboard".
 * @param {object} props
 * @param {Array} props.facilities danh sách cơ sở đã ghép số liệu kho.
 * @param {object|null} props.reports số liệu từ GET /api/operations/reports (totalUnits, handedOverUnits, occupancyRate, totalRevenue, monthlyRevenue).
 */
function BusinessLiveDashboard({ facilities, reports }) {
    // Định dạng tiền kiểu Việt Nam kèm "đ".
    const money = value => `${new Intl.NumberFormat("vi-VN").format(value || 0)}đ`;
    return <div className="business-dashboard">
        <div className="business-kpi-grid">
            <div className="business-kpi-card"><span className="business-kpi-label">Tổng cơ sở</span><div className="business-kpi-value">{facilities.length}</div></div>
            <div className="business-kpi-card"><span className="business-kpi-label">Tổng kho</span><div className="business-kpi-value">{reports?.totalUnits ?? 0}</div></div>
            <div className="business-kpi-card"><span className="business-kpi-label">Kho đang sử dụng</span><div className="business-kpi-value">{reports?.handedOverUnits ?? 0}</div><small>{reports?.occupancyRate ?? 0}% công suất</small></div>
            <div className="business-kpi-card"><span className="business-kpi-label">Doanh thu đã ghi nhận</span><div className="business-kpi-value">{money(reports?.totalRevenue)}</div></div>
        </div>
        <section className="business-panel">
            <div className="business-panel-header"><div><h2>Doanh thu theo tháng</h2><p>Thanh toán hoàn tất được lưu trong database.</p></div></div>
            {!reports?.monthlyRevenue?.length ? <p>Chưa có giao dịch thanh toán.</p> :
                <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tháng</th><th>Doanh thu</th></tr></thead><tbody>
                    {reports.monthlyRevenue.map(month => <tr key={`${month.year}-${month.month}`}><td>{month.month}/{month.year}</td><td>{money(month.receivedAmount)}</td></tr>)}
                </tbody></table></div>}
        </section>
    </div>;
}


export default BusinessOperations;
