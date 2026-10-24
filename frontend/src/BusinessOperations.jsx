import React, { useEffect, useState } from "react";
import "./BusinessOperations.css";
import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import { mapOperationsState } from "./operationsState";

function BusinessOperations({ currentUser, navigate, currentUserKey = "storespace_current_user" }) {
    const [activeMenu, setActiveMenu] = useState("dashboard");
    const [showAddFacility, setShowAddFacility] = useState(false);
    const [operationState, setOperationState] = useState(null);
    const [reports, setReports] = useState(null);
    const [loading, setLoading] = useState(true);
    const [apiError, setApiError] = useState("");
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
            totalUnits: units.length,
            rentedUnits: units.filter(unit => unit.status === "RENTED").length,
            maintenanceUnits: units.filter(unit => unit.status === "MAINTENANCE").length,
            status: facility.status
        };
    }) || [];

    const loadBusinessData = async () => {
        if (!currentUser?.email) {
            setApiError("Phiên đăng nhập không có email Business Operations.");
            setLoading(false);
            return;
        }
        setLoading(true);
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

    useEffect(() => { loadBusinessData(); }, [currentUser?.email]);

    const [newFacility, setNewFacility] = useState({
        name: "",
        unitCodePrefix: "",
        area: "",
        address: "",
        manager: "",
        status: "active"
    });

    const runOperation = async operation => {
        setApiError("");
        try {
            await operation();
            await loadBusinessData();
        } catch (error) {
            setApiError(error.message);
        }
    };

    const updateFacility = (facility, values) => runOperation(() =>
        apiPut(`/api/operations/facilities/${facility.facilityId}`, {
            facilityName: values.name ?? facility.name,
            address: values.address ?? facility.address,
            managerEmail: values.managerEmail ?? facility.managerEmail,
            status: values.status ?? facility.status
        })
    );

    const deleteFacility = facility => {
        if (!window.confirm(`Bạn có chắc muốn xóa cơ sở "${facility.name}"? Thao tác này không thể hoàn tác.`)) {
            return;
        }
        return runOperation(() => apiDelete(`/api/operations/facilities/${facility.facilityId}`));
    };

    const updateUnit = (unit, status) => runOperation(() =>
        apiPut(`/api/operations/units/${encodeURIComponent(unit.id)}`, {
            facilityID: unit.facilityDbId,
            unitTypeID: unit.unitTypeId,
            unitSizeID: unit.sizeId,
            unitType: unit.type,
            size: unit.size,
            sizeM2: unit.sizeM2,
            basePrice: unit.pricePerMonth,
            status
        })
    );

    const updateRate = (facilityId, unitTypeId, unitSizeId, basePrice) => runOperation(() =>
        apiPut(`/api/operations/facilities/${facilityId}/rates`, {
            unitTypeID: Number(unitTypeId),
            unitSizeID: Number(unitSizeId),
            basePrice: Number(basePrice)
        })
    );

    const updatePolicy = (facilityId, depositPercent) => runOperation(() =>
        apiPut(`/api/operations/facilities/${facilityId}/policy`, {
            depositPercent: Number(depositPercent)
        })
    );

    const handleAddFacility = () => {
        if (
            !newFacility.name.trim() ||
            !newFacility.unitCodePrefix.trim() ||
            !newFacility.address.trim()
        ) {
            alert("Vui lòng nhập đầy đủ thông tin cơ sở.");
            return;
        }

        if (!newFacility.manager || !newFacility.manager.includes("@")) {
            alert("Vui lòng chọn Facility Manager hợp lệ.");
            return;
        }

        apiPost("/api/operations/facilities", {
            facilityName: newFacility.name.trim(),
            unitCodePrefix: newFacility.unitCodePrefix.trim().toUpperCase(),
            address: newFacility.address.trim(),
            managerEmail: newFacility.manager,
            status: newFacility.status
        }).then(async () => {
            await loadBusinessData();
            setNewFacility({ name: "", unitCodePrefix: "", area: "", address: "", manager: "", status: "active" });
            setShowAddFacility(false);
        }).catch(error => setApiError(error.message));
    };

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

    const handleLogout = () => {
        localStorage.removeItem(currentUserKey);
        navigate("/");
    };

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
                        <span>⌂</span> Dashboard
                    </button>

                    <button
                        className={
                            activeMenu === "facilities"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("facilities")}
                    >
                        <span>▣</span> Cơ sở & kho
                    </button>

                    <button
                        className={
                            activeMenu === "prices"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("prices")}
                    >
                        <span>◷</span> Giá & phí
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
                        <span>◈</span> Doanh thu
                    </button>

                    <button
                        className={
                            activeMenu === "reports"
                                ? "active"
                                : ""
                        }
                        onClick={() => setActiveMenu("reports")}
                    >
                        <span>▥</span> Báo cáo
                    </button>

                </nav>

                <div className="customer-sidebar-bottom">

                    <button >
                        <span>⚙</span> Cấu hình
                    </button>

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
                            {activeMenu === "facilities" && "Cơ sở & kho"}
                            {activeMenu === "prices" && "Giá & phí"}
                            {activeMenu === "policies" && "Chính sách kinh doanh"}
                            {activeMenu === "revenue" && "Doanh thu"}
                            {activeMenu === "reports" && "Báo cáo"}
                        </h1>

                        <p>
                            Quản lý và theo dõi hoạt động kinh doanh của StoreSpace
                        </p>
                    </div>

                    <div className="business-header-right">

                        <button className="business-notification">
                            🔔
                            <span className="notification-dot"></span>
                        </button>

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
                        <BusinessLiveFacilities
                            facilities={facilities}
                            units={operationState.units}
                            onUpdateFacility={updateFacility}
                            onDeleteFacility={deleteFacility}
                            onUpdateUnit={updateUnit}
                            onAddFacility={() => setShowAddFacility(true)}
                        />
                    )}

                    {activeMenu === "prices" && (
                        <BusinessLivePrices facilities={facilities} rates={operationState.rentalRates} unitTypes={operationState.unitTypes} unitSizes={operationState.unitSizes} onSave={updateRate} />
                    )}

                    {activeMenu === "policies" && (
                        <BusinessLivePolicies facilities={operationState.facilities} onSave={updatePolicy} />
                    )}

                    {activeMenu === "revenue" && (
                        <BusinessLiveRevenue reports={reports} />
                    )}

                    {activeMenu === "reports" && (
                        <BusinessLiveReports reports={reports} />
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
                                <input
                                    value={newFacility.unitCodePrefix}
                                    onChange={(e) =>
                                        setNewFacility({
                                            ...newFacility,
                                            unitCodePrefix: e.target.value.toUpperCase()
                                        })
                                    }
                                    placeholder="Ví dụ: TD, BT, Q1"
                                    maxLength={10}
                                    pattern="[A-Za-z0-9]{1,10}"
                                    required
                                />
                                <small>Chỉ dùng chữ cái và chữ số; ví dụ Thủ Đức: TD, Bình Tân: BT.</small>
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

function BusinessLiveDashboard({ facilities, reports }) {
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

function BusinessLiveFacilities({ facilities, units, onUpdateFacility, onDeleteFacility, onUpdateUnit, onAddFacility }) {
    return <div className="business-panel">
        <div className="business-panel-header"><h2>Cơ sở và kho từ database</h2><button className="dashboard-primary-btn" type="button" onClick={onAddFacility}>Thêm cơ sở</button></div>
        {!facilities.length && <p>Chưa có cơ sở.</p>}
        {facilities.map(facility => <section className="business-panel" key={facility.facilityId}>
            <div className="business-panel-header"><div><h3>{facility.name}</h3><p>{facility.unitCodePrefix} · {facility.address} · Quản lý: {facility.managerEmail}</p></div>
                <div className="business-facility-actions">
                    <label>Trạng thái <select value={facility.status} onChange={event => onUpdateFacility(facility, { status: event.target.value })}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
                    <button className="dashboard-secondary-btn" type="button" onClick={() => onDeleteFacility(facility)}>Xóa cơ sở</button>
                </div>
            </div>
            <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Mã kho</th><th>Loại</th><th>Kích thước</th><th>Giá/tháng</th><th>Trạng thái</th></tr></thead><tbody>
                {units.filter(unit => unit.facilityDbId === facility.facilityId).map(unit => <tr key={unit.unitId}>
                    <td>{unit.id}</td><td>{unit.type}</td><td>{unit.size}</td><td>{new Intl.NumberFormat("vi-VN").format(unit.pricePerMonth)}đ</td>
                    <td><select value={unit.status} onChange={event => onUpdateUnit(unit, event.target.value)}><option value="AVAILABLE">Còn trống</option><option value="RESERVED">Đã giữ chỗ</option><option value="RENTED">Đang sử dụng</option><option value="MAINTENANCE">Bảo trì</option></select></td>
                </tr>)}
            </tbody></table></div>
        </section>)}
    </div>;
}

function BusinessLivePrices({ facilities, rates, unitTypes, unitSizes, onSave }) {
    const [facilityId, setFacilityId] = useState("");
    const [typeId, setTypeId] = useState("");
    const [sizeId, setSizeId] = useState("");
    const [price, setPrice] = useState("");
    useEffect(() => {
        if (!facilityId && facilities.length) setFacilityId(String(facilities[0].facilityId));
        if (!typeId && unitTypes.length) setTypeId(String(unitTypes[0].unitTypeId));
        if (!sizeId && unitSizes.length) setSizeId(String(unitSizes[0].unitSizeId));
    }, [facilities, unitTypes, unitSizes]);
    const save = () => {
        if (Number(price) <= 0) return;
        void onSave(facilityId, typeId, sizeId, price);
        setPrice("");
    };
    return <section className="business-panel">
        <h2>Biểu giá từ database</h2>
        <div className="admin-toolbar">
            <select value={facilityId} onChange={event => setFacilityId(event.target.value)}>{facilities.map(item => <option key={item.facilityId} value={item.facilityId}>{item.name}</option>)}</select>
            <select value={typeId} onChange={event => setTypeId(event.target.value)}>{unitTypes.map(item => <option key={item.unitTypeId} value={item.unitTypeId}>{item.name}</option>)}</select>
            <select value={sizeId} onChange={event => setSizeId(event.target.value)}>{unitSizes.map(item => <option key={item.unitSizeId} value={item.unitSizeId}>{item.dimensions}</option>)}</select>
            <input aria-label="Giá thuê mỗi tháng" type="number" min="1" value={price} onChange={event => setPrice(event.target.value)} placeholder="Giá thuê/tháng" />
            <button className="dashboard-primary-btn" type="button" onClick={save} disabled={!facilityId || !typeId || !sizeId || Number(price) <= 0}>Lưu mức giá</button>
        </div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Cơ sở</th><th>Loại kho</th><th>Kích thước</th><th>Giá/tháng</th></tr></thead><tbody>
            {rates.filter(rate => String(rate.facilityId) === facilityId).map(rate => <tr key={`${rate.unitTypeId}-${rate.unitSizeId}`}><td>{facilities.find(item => item.facilityId === rate.facilityId)?.name}</td><td>{rate.unitType}</td><td>{rate.size}</td><td>{new Intl.NumberFormat("vi-VN").format(rate.price)}đ</td></tr>)}
        </tbody></table></div>
    </section>;
}

function BusinessLivePolicies({ facilities, onSave }) {
    const [drafts, setDrafts] = useState({});
    return <section className="business-panel">
        <h2>Chính sách tiền cọc</h2>
        <p>Tỷ lệ cọc được lưu theo từng cơ sở và dùng khi tạo đặt chỗ.</p>
        {facilities.map(facility => <div className="admin-toolbar" key={facility.facilityId}>
            <strong>{facility.name}</strong>
            <input aria-label={`Tỷ lệ cọc ${facility.name}`} type="number" min="0" max="100" value={drafts[facility.facilityId] ?? facility.depositPercent} onChange={event => setDrafts(current => ({ ...current, [facility.facilityId]: event.target.value }))} />
            <span>%</span>
            <button className="dashboard-primary-btn" type="button" onClick={() => void onSave(facility.facilityId, drafts[facility.facilityId] ?? facility.depositPercent)}>Lưu tỷ lệ cọc</button>
        </div>)}
    </section>;
}

function BusinessLiveReports({ reports }) {
    const money = value => `${new Intl.NumberFormat("vi-VN").format(value || 0)}đ`;
    return <section className="business-panel">
        <h2>Báo cáo vận hành từ database</h2>
        <p>Tổng thu đã ghi nhận: <strong>{money(reports?.totalRevenue)}</strong> · Tỷ lệ sử dụng kho: <strong>{reports?.occupancyRate ?? 0}%</strong></p>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Cơ sở</th><th>Tổng kho</th><th>Đang sử dụng</th><th>Tỷ lệ sử dụng</th><th>Doanh thu ghi nhận</th><th>Bàn giao</th></tr></thead><tbody>
            {(reports?.facilities || []).map(facility => <tr key={facility.facilityId}><td>{facility.name}</td><td>{facility.totalUnits}</td><td>{facility.handedOverUnits}</td><td>{facility.occupancyRate}%</td><td>{money(facility.receivedRevenue)}</td><td>{facility.handedOverCount}</td></tr>)}
        </tbody></table></div>
    </section>;
}

function BusinessLiveRevenue({ reports }) {
    return <section className="business-panel">
        <h2>Doanh thu ghi nhận</h2>
        <p>Tổng tiền từ thanh toán đã hoàn tất: <strong>{new Intl.NumberFormat("vi-VN").format(reports?.totalRevenue || 0)}đ</strong></p>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tháng</th><th>Đã thu</th></tr></thead><tbody>
            {(reports?.monthlyRevenue || []).map(item => <tr key={`${item.year}-${item.month}`}><td>{item.month}/{item.year}</td><td>{new Intl.NumberFormat("vi-VN").format(item.receivedAmount)}đ</td></tr>)}
        </tbody></table></div>
    </section>;
}

/* =====================================================
   BUSINESS PRICES
===================================================== */

function BusinessPrices({ facilities }) {
    const [selectedFacilityId, setSelectedFacilityId] = useState(
        facilities.length > 0 ? facilities[0].id : null
    );
    // Luôn lấy Id của unit đầu tiên
    // selectedFacilityId: ID của cơ sở mà người dùng đang chọn.
    // selectedFacility: cơ sở tìm được trong danh sách 

    const [pricesByFacility, setPricesByFacility] = useState({
        1: [
            { id: 101, type: "Kho thường", size: "10 m²", price: 1500000 },
            { id: 102, type: "Kho thường", size: "20 m²", price: 2800000 },
            { id: 103, type: "Kho lạnh", size: "10 m²", price: 2000000 },
            { id: 104, type: "Kho lạnh", size: "20 m²", price: 3500000 },
            { id: 105, type: "Kho đông lạnh", size: "10 m²", price: 2500000 },
            { id: 106, type: "Kho đông lạnh", size: "20 m²", price: 4000000 }
        ],
        2: [
            { id: 201, type: "Kho thường", size: "10 m²", price: 1400000 },
            { id: 202, type: "Kho thường", size: "20 m²", price: 2700000 },
            { id: 203, type: "Kho lạnh", size: "10 m²", price: 1900000 },
            { id: 204, type: "Kho lạnh", size: "20 m²", price: 3300000 },
            { id: 205, type: "Kho đông lạnh", size: "10 m²", price: 2400000 },
            { id: 206, type: "Kho đông lạnh", size: "20 m²", price: 3800000 }
        ],
        3: [
            { id: 301, type: "Kho thường", size: "10 m²", price: 1300000 },
            { id: 302, type: "Kho thường", size: "20 m²", price: 2500000 },
            { id: 303, type: "Kho lạnh", size: "10 m²", price: 1800000 },
            { id: 304, type: "Kho lạnh", size: "20 m²", price: 3200000 },
            { id: 305, type: "Kho đông lạnh", size: "10 m²", price: 2300000 },
            { id: 306, type: "Kho đông lạnh", size: "20 m²", price: 3600000 }
        ],
        4: [
            { id: 401, type: "Kho thường", size: "10 m²", price: 1500000 },
            { id: 402, type: "Kho thường", size: "20 m²", price: 2700000 },
            { id: 403, type: "Kho lạnh", size: "10 m²", price: 1950000 },
            { id: 404, type: "Kho lạnh", size: "20 m²", price: 3400000 },
            { id: 405, type: "Kho đông lạnh", size: "10 m²", price: 2450000 },
            { id: 406, type: "Kho đông lạnh", size: "20 m²", price: 3900000 }
        ],
        5: [
            { id: 501, type: "Kho thường", size: "10 m²", price: 1300000 },
            { id: 502, type: "Kho thường", size: "20 m²", price: 2500000 },
            { id: 503, type: "Kho lạnh", size: "10 m²", price: 1800000 },
            { id: 504, type: "Kho lạnh", size: "20 m²", price: 3100000 },
            { id: 505, type: "Kho đông lạnh", size: "10 m²", price: 2300000 },
            { id: 506, type: "Kho đông lạnh", size: "20 m²", price: 3500000 }
        ]
    });

    const [showPriceModal, setShowPriceModal] = useState(false);
    const [editingPrice, setEditingPrice] = useState(null);
    const [priceForm, setPriceForm] = useState({
        type: "Kho thường",
        size: "10 m²",
        price: ""
    });

    // type price size là 3 thuộc tính của const priceForm

    const selectedFacility = facilities.find(
        (facility) => facility.id === selectedFacilityId
    );
    // facility là tên biến. find là hàm tìm 

    const currentPrices = selectedFacility
        ? pricesByFacility[selectedFacility.id] || []
        : [];
        // Nếu selectedFacility tồn tại → lấy bảng giá của cơ sở đó
        // Nếu selectedFacility không tồn tại → lấy mảng rỗng []
        // Code ở dưới, tìm được unit có Id giống

    const formatMoney = (money) => {
        return new Intl.NumberFormat("vi-VN").format(money) + " đ";
    };
    // định dạng số tiền

    const openAddPrice = () => {
        setEditingPrice(null);
        setPriceForm({
            type: "Kho thường",
            size: "10 m²",
            price: ""
        });
        setShowPriceModal(true);
    };
    // Khi người dùng nhấn nút "Thêm mức giá", mở modal thêm giá mới

    const openEditPrice = (priceItem) => {
        setEditingPrice(priceItem);
        setPriceForm({
            type: priceItem.type,
            size: priceItem.size,
            price: String(priceItem.price)
        });
        setShowPriceModal(true);
    };
    // Khi người dùng nhấn nút "Sửa", mở modal chỉnh sửa giá
    //

    const handleSavePrice = () => {
        if (!selectedFacility) {
            alert("Vui lòng chọn cơ sở.");
            return;
        }

        const numericPrice = Number(priceForm.price);

        if (!priceForm.type || !priceForm.size || !priceForm.price) {
            alert("Vui lòng nhập đầy đủ thông tin giá.");
            return;
        }

        if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
            alert("Giá thuê phải lớn hơn 0.");
            return;
        }

        if (editingPrice) {
            setPricesByFacility((currentPricesByFacility) => ({
                ...currentPricesByFacility,
                [selectedFacility.id]: (
                    currentPricesByFacility[selectedFacility.id] || []
                ).map((item) =>
                    item.id === editingPrice.id
                        ? {
                            ...item,
                            type: priceForm.type,
                            size: priceForm.size,
                            price: numericPrice
                        }
                        : item
                )
            }));
        } else {
            const duplicate = currentPrices.some(
                (item) =>
                    item.type === priceForm.type &&
                    item.size === priceForm.size
            );

            if (duplicate) {
                alert("Mức giá cho loại kho và diện tích này đã tồn tại.");
                return;
            }

            const newPrice = {
                id: Date.now(),
                type: priceForm.type,
                size: priceForm.size,
                price: numericPrice
            };

            setPricesByFacility((currentPricesByFacility) => ({
                ...currentPricesByFacility,
                [selectedFacility.id]: [
                    ...(currentPricesByFacility[selectedFacility.id] || []),
                    newPrice
                ]
            }));
        }

        setShowPriceModal(false);
        setEditingPrice(null);
    };

    const handleDeletePrice = (priceId) => {
        if (!selectedFacility) return;

        const confirmed = window.confirm(
            "Bạn có chắc muốn xóa mức giá này không?"
        );

        if (!confirmed) return;

        setPricesByFacility((currentPricesByFacility) => ({
            ...currentPricesByFacility,
            [selectedFacility.id]: (
                currentPricesByFacility[selectedFacility.id] || []
            ).filter((item) => item.id !== priceId)
        }));
    };

    return (
        <div className="business-prices">

            <div className="business-page-header">
                <div>
                    <h2>Giá & phí</h2>
                    <p>
                        Thiết lập giá thuê theo từng cơ sở, loại kho và diện tích.
                    </p>
                </div>

                <button
                    className="facility-add-button"
                    onClick={openAddPrice}
                    disabled={!selectedFacility}
                >
                    + Thêm mức giá
                </button>
            </div>

            <div
                className="business-panel bo-prices-box-01"
            >
                <div className="business-panel-header">
                    <div>
                        <h3>Chọn cơ sở</h3>
                        <p>
                            Mỗi cơ sở có thể áp dụng bảng giá riêng.
                        </p>
                    </div>
                </div>

                <div
                    className="bo-prices-grid-02"
                >
                    <select
                        value={selectedFacilityId || ""}
                        onChange={(e) =>
                            setSelectedFacilityId(Number(e.target.value))
                        }
                        className="bo-prices-field-03"
                    >
                        {facilities.length === 0 && (
                            <option value="">Chưa có cơ sở</option>
                        )}

                        {facilities.map((facility) => (
                            <option key={facility.id} value={facility.id}>
                                {facility.name} · {facility.area}
                            </option>
                        ))}
                    </select>

                    {selectedFacility && (
                        <div
                            className="bo-prices-box-04"
                        >
                            <strong className="bo-prices-text-05">
                                {selectedFacility.name}
                            </strong>
                            <br />
                            {selectedFacility.address}
                        </div>
                    )}
                </div>
            </div>

            <div className="business-panel">

                <div className="business-panel-header">
                    <div>
                        <h3>
                            Bảng giá · {selectedFacility?.name || "Chưa chọn cơ sở"}
                        </h3>
                        <p>
                            Giá thuê được tính theo tháng và có thể khác nhau giữa các cơ sở.
                        </p>
                    </div>

                    <div
                        className="bo-prices-box-06"
                    >
                        {currentPrices.length} mức giá
                    </div>
                </div>

                {currentPrices.length > 0 ? (
                    <div
                        className="bo-prices-box-07"
                    >
                        <div
                            className="bo-prices-box-08"
                        >
                            <div
                                className="bo-prices-grid-09"
                            >
                                <span>Loại kho</span>
                                <span>Diện tích</span>
                                <span>Giá thuê / tháng</span>
                                <span>Thao tác</span>
                            </div>

                            {currentPrices.map((priceItem) => (
                                <div
                                    key={priceItem.id}
                                    className="bo-prices-grid-10"
                                >
                                    <strong>{priceItem.type}</strong>
                                    <span>{priceItem.size}</span>
                                    <strong className="bo-prices-text-05">
                                        {formatMoney(priceItem.price)}
                                    </strong>
                                    <div className="bo-prices-flex-11">
                                        <button
                                            type="button"
                                            onClick={() => openEditPrice(priceItem)}
                                            className="bo-prices-btn-12"
                                        >
                                            ✏️ Sửa
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleDeletePrice(priceItem.id)}
                                            className="bo-prices-btn-13"
                                        >
                                            Xóa
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div
                        className="bo-prices-box-14"
                    >
                        Cơ sở này chưa có bảng giá.
                        <br />
                        <button
                            type="button"
                            onClick={openAddPrice}
                            className="bo-prices-btn-15"
                        >
                            + Thêm mức giá đầu tiên
                        </button>
                    </div>
                )}
            </div>

            {showPriceModal && (
                <div
                    className="facility-modal-overlay"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowPriceModal(false);
                        }
                    }}
                >
                    <div className="facility-modal">

                        <div className="facility-modal-header">
                            <div>
                                <h3>
                                    {editingPrice ? "Chỉnh sửa mức giá" : "Thêm mức giá"}
                                </h3>
                                <p>
                                    {selectedFacility?.name}
                                </p>
                            </div>

                            <button onClick={() => setShowPriceModal(false)}>
                                ✕
                            </button>
                        </div>

                        <div className="facility-form-grid">

                            <div className="facility-form-group">
                                <label>Loại kho</label>
                                <select
                                    value={priceForm.type}
                                    onChange={(e) =>
                                        setPriceForm({
                                            ...priceForm,
                                            type: e.target.value
                                        })
                                    }
                                >
                                    <option value="Kho thường">Kho thường</option>
                                    <option value="Kho lạnh">Kho lạnh</option>
                                    <option value="Kho đông lạnh">Kho đông lạnh</option>
                                </select>
                            </div>

                            <div className="facility-form-group">
                                <label>Diện tích</label>
                                <select
                                    value={priceForm.size}
                                    onChange={(e) =>
                                        setPriceForm({
                                            ...priceForm,
                                            size: e.target.value
                                        })
                                    }
                                >
                                    <option value="5 m²">5 m²</option>
                                    <option value="10 m²">10 m²</option>
                                    <option value="12 m²">12 m²</option>
                                    <option value="15 m²">15 m²</option>
                                    <option value="20 m²">20 m²</option>
                                    <option value="30 m²">30 m²</option>
                                </select>
                            </div>

                            <div className="facility-form-group full">
                                <label>Giá thuê / tháng</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={priceForm.price}
                                    onChange={(e) =>
                                        setPriceForm({
                                            ...priceForm,
                                            price: e.target.value
                                        })
                                    }
                                    placeholder="Ví dụ: 1500000"
                                />
                                <small>
                                    Nhập giá bằng VNĐ, ví dụ 1500000 = 1.500.000 đ/tháng.
                                </small>
                            </div>

                        </div>

                        <div className="facility-modal-footer">
                            <button
                                className="facility-cancel-button"
                                onClick={() => setShowPriceModal(false)}
                            >
                                Hủy
                            </button>

                            <button
                                className="facility-save-button"
                                onClick={handleSavePrice}
                            >
                                {editingPrice ? "Lưu thay đổi" : "Thêm mức giá"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}


/* =====================================================
   BUSINESS POLICIES
===================================================== */

function BusinessPolicies() {
    const [activePolicy, setActivePolicy] = useState("cancellation");
    const [showEditModal, setShowEditModal] = useState(false);
    const [showSavePopup, setShowSavePopup] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [policyVersion, setPolicyVersion] = useState("v1.0");
    const [lastUpdated, setLastUpdated] = useState("05/10/2026");
    const [notifyCustomer, setNotifyCustomer] = useState(true);
    const [notifyManager, setNotifyManager] = useState(true);
    const [notifyStaff, setNotifyStaff] = useState(true);

    const [cancellationRules, setCancellationRules] = useState([
        { id: 1, period: "≥ 30 ngày", rentalRefund: 100, depositRefund: 100 },
        { id: 2, period: "15–29 ngày", rentalRefund: 100, depositRefund: 100 },
        { id: 3, period: "7–14 ngày", rentalRefund: 100, depositRefund: 50 },
        { id: 4, period: "3–6 ngày", rentalRefund: 70, depositRefund: 0 },
        { id: 5, period: "1–2 ngày", rentalRefund: 30, depositRefund: 0 },
        { id: 6, period: "Ngày bắt đầu, chưa bàn giao", rentalRefund: 0, depositRefund: 0 }
    ]);

    const [earlyPeriodicRules, setEarlyPeriodicRules] = useState([
        { id: 1, period: "Month 1–3", fee: 2, unit: "tháng tiền thuê" },
        { id: 2, period: "Month 4–6", fee: 1, unit: "tháng tiền thuê" },
        { id: 3, period: "Month 7–9", fee: 50, unit: "% tiền thuê 1 tháng" },
        { id: 4, period: "Month 10–11", fee: 30, unit: "% tiền thuê 1 tháng" },
        { id: 5, period: "Month 12 / hết hạn", fee: 0, unit: "%" }
    ]);

    const [earlyUpfrontRules, setEarlyUpfrontRules] = useState([
        { id: 1, period: "Month 1–3", unused: "> 75%", refund: 60 },
        { id: 2, period: "Month 4–6", unused: "50–75%", refund: 70 },
        { id: 3, period: "Month 7–9", unused: "25–49%", refund: 80 },
        { id: 4, period: "Month 10–11", unused: "< 25%", refund: 90 },
        { id: 5, period: "Month 12", unused: "0%", refund: 0 }
    ]);

    const [noticeDays, setNoticeDays] = useState(30);

    const [damageRules] = useState([
        { level: "Level 0", name: "Normal Wear & Tear", description: "Hao mòn thông thường do sử dụng đúng mục đích", handling: "Không tính Customer" },
        { level: "Level 1", name: "Minor Damage", description: "Trầy xước, bẩn hoặc hư hỏng nhỏ", handling: "Tính chi phí vệ sinh/sửa chữa hợp lệ" },
        { level: "Level 2", name: "Moderate Damage", description: "Hư khóa, cửa, tường hoặc thiết bị nhưng có thể sửa chữa", handling: "Chi phí sửa chữa được phê duyệt" },
        { level: "Level 3", name: "Major Damage", description: "Hư hỏng nghiêm trọng, cần thay thế bộ phận/tài sản", handling: "Customer chịu 100% chi phí sửa chữa/thay thế hợp lệ" },
        { level: "Level 4", name: "Severe / Intentional Damage", description: "Cố ý phá hoại hoặc gây thiệt hại nghiêm trọng", handling: "Customer chịu toàn bộ thiệt hại hợp lệ và chi phí phát sinh" }
    ]);

    const [history, setHistory] = useState([
        {
            version: "v1.0",
            date: "05/10/2026",
            time: "09:30",
            person: "Business Manager",
            title: "Tạo chính sách ban đầu",
            detail: "Thiết lập Cancellation, Early Return và Damage Settlement Policy."
        }
    ]);

    const policyInfo = {
        cancellation: {
            icon: "❌",
            title: "Chính sách hủy thuê",
            description: "Quy định hoàn tiền khi Customer hủy reservation trước ngày bắt đầu thuê."
        },
        earlyReturn: {
            icon: "🔄",
            title: "Trả kho / chấm dứt hợp đồng sớm",
            description: "Quy định xử lý khi Customer trả kho trước ngày kết thúc hợp đồng."
        },
        damage: {
            icon: "🔧",
            title: "Hư hỏng & hoàn tiền cọc",
            description: "Quy định kiểm tra kho, đánh giá Damage và xử lý Deposit sau khi trả kho."
        }
    };

    const updateNestedValue = (setter, id, field, value) => {
        setter((current) =>
            current.map((item) =>
                item.id === id ? { ...item, [field]: value } : item
            )
        );
    };

    const handleSavePolicy = () => {
        const nextVersionNumber = Number(policyVersion.replace("v", "")) + 1;
        const nextVersion = `v${nextVersionNumber.toFixed(1)}`;
        const now = new Date();
        const date = now.toLocaleDateString("vi-VN");
        const time = now.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit"
        });

        setPolicyVersion(nextVersion);
        setLastUpdated(date);
        setHistory((current) => [
            {
                version: nextVersion,
                date,
                time,
                person: "Business Manager",
                title: `Cập nhật ${policyInfo[activePolicy].title}`,
                detail: "Thay đổi được lưu và tạo phiên bản chính sách mới."
            },
            ...current
        ]);

        setShowEditModal(false);
        setShowSavePopup(true);
    };

    const renderPolicyEditor = () => {
        if (activePolicy === "cancellation") {
            return (
                <div>
                    <div className="bo-policy-info-warning-box">
                        <strong>Business được chỉnh các tỷ lệ hoàn tiền.</strong>
                        <span>
                            Nếu reservation đã bàn giao, hệ thống chuyển sang Early Return / Early Termination Policy.
                        </span>
                    </div>

                    <div className="bo-policy-table-wrapper">
                        <table className="bo-policy-table">
                            <thead>
                                <tr>
                                    <th>Thời điểm Customer hủy</th>
                                    <th>Hoàn tiền thuê</th>
                                    <th>Hoàn tiền cọc</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cancellationRules.map((rule) => (
                                    <tr key={rule.id}>
                                        <td>{rule.period}</td>
                                        <td>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={rule.rentalRefund}
                                                onChange={(e) =>
                                                    updateNestedValue(
                                                        setCancellationRules,
                                                        rule.id,
                                                        "rentalRefund",
                                                        e.target.value
                                                    )
                                                }
                                                className="bo-policy-number-input"
                                            /> %
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={rule.depositRefund}
                                                onChange={(e) =>
                                                    updateNestedValue(
                                                        setCancellationRules,
                                                        rule.id,
                                                        "depositRefund",
                                                        e.target.value
                                                    )
                                                }
                                                className="bo-policy-number-input"
                                            /> %
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        if (activePolicy === "earlyReturn") {
            return (
                <div>
                    <div className="bo-policy-tab">
                        <div className="bo-policy-sub-card">
                            <div className="bo-policy-sub-title">Option A — Periodic Payment</div>
                            <p className="bo-policy-small-text">
                                Customer thanh toán theo từng chu kỳ. Phí chấm dứt phụ thuộc vào Contract Month.
                            </p>

                            <div className="bo-policy-table-wrapper">
                                <table className="bo-policy-table">
                                    <thead>
                                        <tr>
                                            <th>Contract Month</th>
                                            <th>Early Termination Fee</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {earlyPeriodicRules.map((rule) => (
                                            <tr key={rule.id}>
                                                <td>{rule.period}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={rule.fee}
                                                        onChange={(e) =>
                                                            updateNestedValue(
                                                                setEarlyPeriodicRules,
                                                                rule.id,
                                                                "fee",
                                                                e.target.value
                                                            )
                                                        }
                                                        className="bo-policy-number-input"
                                                    /> {rule.unit}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bo-policy-sub-card">
                            <div className="bo-policy-sub-title">Option B — Full Upfront Payment</div>
                            <p className="bo-policy-small-text">
                                Hoàn tiền dựa trên phần thời gian chưa sử dụng và tỷ lệ hoàn tiền tương ứng.
                            </p>

                            <div className="bo-policy-table-wrapper">
                                <table className="bo-policy-table">
                                    <thead>
                                        <tr>
                                            <th>Tháng trả kho</th>
                                            <th>Thời gian chưa sử dụng</th>
                                            <th>Tỷ lệ hoàn</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {earlyUpfrontRules.map((rule) => (
                                            <tr key={rule.id}>
                                                <td>{rule.period}</td>
                                                <td>{rule.unused}</td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={rule.refund}
                                                        onChange={(e) =>
                                                            updateNestedValue(
                                                                setEarlyUpfrontRules,
                                                                rule.id,
                                                                "refund",
                                                                e.target.value
                                                            )
                                                        }
                                                        className="bo-policy-number-input"
                                                    /> %
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="bo-policy-notice-box">
                        <div>
                            <strong>Thời gian báo trước tối thiểu</strong>
                            <p className="bo-policy-small-text">
                                Customer phải thông báo yêu cầu trả kho trước ít nhất số ngày được cấu hình dưới đây.
                            </p>
                        </div>
                        <div className="bo-policies-flex-01">
                            <input
                                type="number"
                                min="0"
                                value={noticeDays}
                                onChange={(e) => setNoticeDays(e.target.value)}
                                className="bo-policy-number-input"
                            />
                            <span>ngày</span>
                        </div>
                    </div>

                    <div className="bo-policy-info-info-box">
                        <strong>Deposit được xử lý độc lập.</strong>
                        <span>
                            Deposit chỉ được hoàn sau khi Customer trả kho, Facility kiểm tra, không còn nghĩa vụ hợp lệ và đã xử lý Damage nếu có.
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div>
                <div className="bo-policy-info-warning-box">
                    <strong>Quyền hạn được phân tách rõ ràng.</strong>
                    <span>
                        Staff kiểm tra và lập Damage Report. Facility Manager quyết định trách nhiệm, Damage Level và Repair Cost. Business chỉ cấu hình Policy.
                    </span>
                </div>

                <div className="bo-policy-table-wrapper">
                    <table className="bo-policy-table">
                        <thead>
                            <tr>
                                <th>Mức độ</th>
                                <th>Mô tả</th>
                                <th>Cách xử lý</th>
                            </tr>
                        </thead>
                        <tbody>
                            {damageRules.map((rule) => (
                                <tr key={rule.level}>
                                    <td>
                                        <strong>{rule.level}</strong>
                                        <div className="bo-policies-box-02">
                                            {rule.name}
                                        </div>
                                    </td>
                                    <td>{rule.description}</td>
                                    <td>{rule.handling}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="bo-policy-settlement-grid">
                    <div className="bo-policy-sub-card">
                        <div className="bo-policy-sub-title">✓ Không có trách nhiệm Customer</div>
                        <p className="bo-policy-small-text">
                            Normal Wear & Tear hoặc hư hỏng không thuộc trách nhiệm Customer thì không tính phí sửa chữa và Deposit được xử lý hoàn trả theo Deposit Policy.
                        </p>
                    </div>

                    <div className="bo-policy-sub-card">
                        <div className="bo-policy-sub-title">⚠ Có trách nhiệm Customer</div>
                        <p className="bo-policy-small-text">
                            Customer phải thanh toán Repair Cost được duyệt trước khi Deposit được hoàn. Nếu Repair Cost cao hơn Deposit, phần còn thiếu được ghi nhận là Outstanding Amount.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="bo-policies-flex-03">

            <div className="bo-policy-hero">
                <div>
                    <div className="bo-policy-eyebrow">BUSINESS POLICY CENTER</div>
                    <h2 className="bo-policy-title">Chính sách kinh doanh</h2>
                    <p className="bo-policy-description">
                        Quản lý các quy định áp dụng cho hoạt động thuê kho và theo dõi lịch sử thay đổi chính sách của StoreSpace.
                    </p>
                </div>

                <div className="bo-policy-version-badge">
                    <span>Phiên bản hiện hành</span>
                    <strong>{policyVersion}</strong>
                    <small>Cập nhật {lastUpdated}</small>
                </div>
            </div>

            <div className="bo-policy-main-grid">
                <div className="bo-policy-list">
                    {Object.entries(policyInfo).map(([key, item]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActivePolicy(key)}
                            className={activePolicy === key ? "bo-policy-list-item bo-policy-list-item-active" : "bo-policy-list-item"}
                        >
                            <span className="bo-policy-list-icon">{item.icon}</span>
                            <span className="bo-policies-text-04">
                                <strong className="bo-policies-text-05">
                                    {item.title}
                                </strong>
                                <span className="bo-policies-text-06">
                                    {item.description}
                                </span>
                            </span>
                            <span className="bo-policies-text-07">›</span>
                        </button>
                    ))}

                    <button
                        type="button"
                        onClick={() => setShowHistory(true)}
                        className="bo-policy-history-button"
                    >
                        <span>🕘</span>
                        <span>
                            <strong className="bo-policies-text-08">Lịch sử thay đổi</strong>
                            <small className="bo-policies-text-09">Xem các phiên bản Policy đã cập nhật</small>
                        </span>
                    </button>
                </div>

                <div className="bo-policy-detail">
                    <div className="bo-policy-detail-header">
                        <div>
                            <div className="bo-policies-box-10">
                                {policyInfo[activePolicy].icon} Chính sách hiện hành
                            </div>
                            <h3 className="bo-policies-title-11">
                                {policyInfo[activePolicy].title}
                            </h3>
                            <p className="bo-policies-text-12">
                                {policyInfo[activePolicy].description}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowEditModal(true)}
                            className="bo-policy-edit-button"
                        >
                            ✏️ Chỉnh sửa chính sách
                        </button>
                    </div>

                    <div className="bo-policies-box-13">
                        {renderPolicyEditor()}
                    </div>

                    <div className="bo-policy-footer-note">
                        <span>ℹ️</span>
                        <span>
                            Sau khi lưu, hệ thống tạo phiên bản Policy mới. Business không trực tiếp quyết định Damage Report, Repair Cost hoặc Deposit Settlement của từng Customer.
                        </span>
                    </div>
                </div>
            </div>

            <div className="bo-policy-notification-card">
                <div>
                    <div className="bo-policies-box-14">
                        📢 Thông báo khi chính sách thay đổi
                    </div>
                    <p className="bo-policies-text-15">
                        Khi Business lưu Policy mới, hệ thống tạo thông báo cho các actor liên quan.
                    </p>
                </div>

                <div className="bo-policy-notification-options">
                    <label className="bo-policy-check">
                        <input
                            type="checkbox"
                            checked={notifyCustomer}
                            onChange={(e) => setNotifyCustomer(e.target.checked)}
                        />
                        Customer
                    </label>
                    <label className="bo-policy-check">
                        <input
                            type="checkbox"
                            checked={notifyManager}
                            onChange={(e) => setNotifyManager(e.target.checked)}
                        />
                        Facility Manager
                    </label>
                    <label className="bo-policy-check">
                        <input
                            type="checkbox"
                            checked={notifyStaff}
                            onChange={(e) => setNotifyStaff(e.target.checked)}
                        />
                        Facility Staff
                    </label>
                </div>
            </div>

            {showEditModal && (
                <div
                    className="bo-policy-modal-overlay"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowEditModal(false);
                    }}
                >
                    <div className="bo-policy-modal">
                        <div className="bo-policy-modal-header">
                            <div>
                                <div className="bo-policies-box-16">
                                    Chỉnh sửa Policy
                                </div>
                                <h3 className="bo-policies-title-17">
                                    {policyInfo[activePolicy].title}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="bo-policy-close-button"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="bo-policies-box-18">
                            {renderPolicyEditor()}
                        </div>

                        <div className="bo-policy-modal-footer">
                            <button
                                type="button"
                                onClick={() => setShowEditModal(false)}
                                className="bo-policy-cancel-button"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                onClick={handleSavePolicy}
                                className="bo-policy-save-button"
                            >
                                ✓ Lưu thay đổi
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSavePopup && (
                <div className="bo-policy-modal-overlay">
                    <div className="bo-policy-success-popup">
                        <div className="bo-policy-success-icon">✓</div>
                        <h3 className="bo-policies-title-19">
                            Cập nhật chính sách thành công!
                        </h3>
                        <p className="bo-policies-text-20">
                            Chính sách đã được lưu thành phiên bản <strong>{policyVersion}</strong>.
                        </p>
                        <p className="bo-policies-text-21">
                            {notifyCustomer || notifyManager || notifyStaff
                                ? "Thông báo sẽ được gửi đến các actor đã được chọn."
                                : "Bạn chưa chọn actor nhận thông báo."}
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowSavePopup(false)}
                            className="bo-policy-save-button"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            )}

            {showHistory && (
                <div
                    className="bo-policy-modal-overlay"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowHistory(false);
                    }}
                >
                    <div className="bo-policy-modal">
                        <div className="bo-policy-modal-header">
                            <div>
                                <div className="bo-policies-box-16">
                                    Audit / Version History
                                </div>
                                <h3 className="bo-policies-title-17">Lịch sử thay đổi chính sách</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHistory(false)}
                                className="bo-policy-close-button"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="bo-policies-flex-22">
                            {history.map((item, index) => (
                                <div key={`${item.version}-${index}`} className="bo-policy-history-item">
                                    <div className="bo-policy-history-version">
                                        {item.version}
                                        {index === 0 && (
                                            <span className="bo-policy-current-badge">Hiện hành</span>
                                        )}
                                    </div>
                                    <div className="bo-policies-box-23">
                                        <strong className="bo-policies-text-24">
                                            {item.title}
                                        </strong>
                                        <p className="bo-policies-text-25">
                                            {item.detail}
                                        </p>
                                        <small className="bo-policies-text-26">
                                            {item.date} • {item.time} • {item.person}
                                        </small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


/* =====================================================
   BUSINESS REPORTS
===================================================== */

function BusinessReports({ facilities }) {
    const [reportPeriod, setReportPeriod] = useState("6");
    const [reportFacility, setReportFacility] = useState("all");
    const [reportDetail, setReportDetail] = useState(null);
    const [selectedReportRow, setSelectedReportRow] = useState(null);

    const activeFacilities = facilities.filter(
        (facility) => facility.status === "active"
    );

    const filteredFacilities =
        reportFacility === "all"
            ? activeFacilities
            : activeFacilities.filter(
                (facility) => String(facility.id) === reportFacility
            );

    const totalUnits = filteredFacilities.reduce(
        (sum, facility) => sum + Number(facility.totalUnits || 0),
        0
    );

    const rentedUnits = filteredFacilities.reduce(
        (sum, facility) => sum + Number(facility.rentedUnits || 0),
        0
    );

    const maintenanceUnits = filteredFacilities.reduce(
        (sum, facility) => sum + Number(facility.maintenanceUnits || 0),
        0
    );

    const availableUnits = Math.max(
        0,
        totalUnits - rentedUnits - maintenanceUnits
    );

    const utilization = totalUnits > 0
        ? Math.round((rentedUnits / totalUnits) * 100)
        : 0;

    const formatMoney = (value) =>
        new Intl.NumberFormat("vi-VN").format(value) + " đ";

    const monthData6 = [
        { month: "May", value: 72 },
        { month: "Jun", value: 78 },
        { month: "Jul", value: 82 },
        { month: "Aug", value: 84 },
        { month: "Sep", value: 88 },
        { month: "Oct", value: 91 }
    ];

    const monthData12 = [
        { month: "Nov", value: 64 },
        { month: "Dec", value: 67 },
        { month: "Jan", value: 69 },
        { month: "Feb", value: 71 },
        { month: "Mar", value: 73 },
        { month: "Apr", value: 70 },
        { month: "May", value: 72 },
        { month: "Jun", value: 78 },
        { month: "Jul", value: 82 },
        { month: "Aug", value: 84 },
        { month: "Sep", value: 88 },
        { month: "Oct", value: 91 }
    ];

    const monthDataYear = [
        { month: "Jan", value: 69 },
        { month: "Feb", value: 71 },
        { month: "Mar", value: 73 },
        { month: "Apr", value: 70 },
        { month: "May", value: 72 },
        { month: "Jun", value: 78 },
        { month: "Jul", value: 82 },
        { month: "Aug", value: 84 },
        { month: "Sep", value: 88 },
        { month: "Oct", value: 91 }
    ];

    const chartData =
        reportPeriod === "12"
            ? monthData12
            : reportPeriod === "year"
                ? monthDataYear
                : monthData6;

    const currentRevenue = filteredFacilities.reduce(
        (sum, facility) =>
            sum + Number(facility.rentedUnits || 0) * 2100000,
        0
    );

    const previousRevenue = Math.round(currentRevenue / 1.092);
    const growth = previousRevenue > 0
        ? (((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1)
        : "0.0";

    const expiringContracts = filteredFacilities.length > 0
        ? Math.min(7, Math.max(2, Math.ceil(rentedUnits * 0.12)))
        : 0;

    const overduePayments = filteredFacilities.length > 0
        ? Math.min(3, Math.max(1, Math.ceil(rentedUnits * 0.04)))
        : 0;

    const totalCustomers = rentedUnits;

    // Dữ liệu demo để Business Manager có thể đi từ báo cáo tổng quan
    // xuống danh sách và xem thông tin chi tiết của từng trường hợp.
    const reportDetails = {
        active: {
            title: "Khách hàng đang thuê",
            subtitle: "Danh sách khách hàng đang có hợp đồng hoạt động.",
            icon: "👤",
            columns: ["Khách hàng", "Tài khoản", "Kho", "Cơ sở", "Hết hạn", "Trạng thái"],
            rows: [
                ["Nguyễn Văn An", "nguyenan01", "Q1-U03", "StoreSpace Quận 1", "12/12/2026", "Đang thuê"],
                ["Trần Minh Anh", "minhanh99", "TB-U02", "StoreSpace Tân Bình", "18/11/2026", "Đang thuê"],
                ["Lê Hoàng Nam", "lehoangnam", "TD-U05", "StoreSpace Thủ Đức", "25/12/2026", "Đang thuê"],
                ["Phạm Gia Huy", "phamhuy08", "Q2-U04", "StoreSpace Quận 2", "08/01/2027", "Đang thuê"]
            ]
        },
        expiring: {
            title: "Hợp đồng sắp hết hạn",
            subtitle: "Các hợp đồng cần được liên hệ để hỗ trợ gia hạn.",
            icon: "🕐",
            columns: ["Khách hàng", "Tài khoản", "Kho", "Ngày hết hạn", "Còn lại", "Tiền thuê/tháng"],
            rows: [
                ["Nguyễn Văn An", "nguyenan01", "Q1-U03", "12/10/2026", "7 ngày", "2.200.000 đ"],
                ["Trần Minh Anh", "minhanh99", "TB-U02", "18/10/2026", "13 ngày", "1.800.000 đ"],
                ["Lê Hoàng Nam", "lehoangnam", "TD-U05", "25/10/2026", "20 ngày", "2.500.000 đ"],
                ["Phạm Gia Huy", "phamhuy08", "Q2-U04", "29/10/2026", "24 ngày", "2.100.000 đ"]
            ]
        },
        overdue: {
            title: "Khoản thanh toán quá hạn",
            subtitle: "Các khoản công nợ Business Manager cần theo dõi và xử lý.",
            icon: "💳",
            columns: ["Khách hàng", "Tài khoản", "Kho", "Hạn thanh toán", "Quá hạn", "Số tiền"],
            rows: [
                ["Nguyễn Văn B", "nguyenb01", "Q1-U05", "01/10/2026", "4 ngày", "2.200.000 đ"],
                ["Phạm Thị C", "phamc99", "TB-U03", "28/09/2026", "7 ngày", "1.800.000 đ"],
                ["Lê Văn D", "levand01", "Q2-U02", "25/09/2026", "10 ngày", "2.900.000 đ"]
            ]
        },
        maintenance: {
            title: "Kho đang bảo trì",
            subtitle: "Các kho hiện chưa sẵn sàng để cho thuê.",
            icon: "🔧",
            columns: ["Mã kho", "Cơ sở", "Loại kho", "Lý do", "Bắt đầu", "Dự kiến xong"],
            rows: [
                ["Q1-U08", "StoreSpace Quận 1", "Kho lạnh", "Bảo trì hệ thống lạnh", "02/10/2026", "08/10/2026"],
                ["TB-U07", "StoreSpace Tân Bình", "Kho thường", "Sửa khóa cửa", "03/10/2026", "07/10/2026"],
                ["TD-U09", "StoreSpace Thủ Đức", "Kho thường", "Kiểm tra điện", "04/10/2026", "09/10/2026"]
            ]
        },
        available: {
            title: "Kho đang trống",
            subtitle: "Các kho có thể được đặt và cho thuê ngay.",
            icon: "📦",
            columns: ["Mã kho", "Cơ sở", "Loại kho", "Diện tích", "Giá thuê/tháng", "Đã trống"],
            rows: [
                ["Q1-U06", "StoreSpace Quận 1", "Kho thường", "10 m²", "2.000.000 đ", "12 ngày"],
                ["Q1-U11", "StoreSpace Quận 1", "Kho lạnh", "15 m²", "3.200.000 đ", "8 ngày"],
                ["TB-U06", "StoreSpace Tân Bình", "Kho thường", "12 m²", "2.200.000 đ", "15 ngày"],
                ["TD-U03", "StoreSpace Thủ Đức", "Kho thường", "8 m²", "1.500.000 đ", "5 ngày"]
            ]
        }
    };

    const openReportDetail = (type) => {
        setReportDetail(type);
        setSelectedReportRow(null);
        window.setTimeout(() => {
            document.getElementById("business-report-detail")?.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }, 50);
    };

    const openReportRowDetail = (type, row, rowIndex) => {
        setReportDetail(type);
        setSelectedReportRow({ type, row, rowIndex });
        window.setTimeout(() => {
            document.getElementById("business-report-row-detail")?.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        }, 50);
    };

    const getReportRowDetail = (type, row) => {
        if (type === "overdue") {
            return {
                name: row[0], username: row[1], unit: row[2], dueDate: row[3], overdue: row[4], amount: row[5],
                phone: type === "overdue" && row[1] === "nguyenb01" ? "0903 123 456" : row[1] === "phamc99" ? "0918 456 789" : "0908 777 222",
                email: `${row[1]}@gmail.com`,
                facility: row[2].startsWith("Q1") ? "StoreSpace Quận 1" : row[2].startsWith("TB") ? "StoreSpace Tân Bình" : "StoreSpace Quận 2",
                unitType: row[2] === "Q1-U05" ? "Kho thường · 15 m²" : row[2] === "TB-U03" ? "Kho thường · 20 m²" : "Kho lạnh · 15 m²",
                contractStart: row[2] === "Q1-U05" ? "01/07/2026" : row[2] === "TB-U03" ? "28/06/2026" : "25/06/2026",
                lastPayment: row[2] === "Q1-U05" ? "01/09/2026" : row[2] === "TB-U03" ? "28/08/2026" : "25/08/2026",
                status: "Quá hạn thanh toán"
            };
        }

        if (type === "expiring" || type === "active") {
            const facility = row[2]?.startsWith("Q1") ? "StoreSpace Quận 1" : row[2]?.startsWith("TB") ? "StoreSpace Tân Bình" : row[2]?.startsWith("TD") ? "StoreSpace Thủ Đức" : "StoreSpace Quận 2";
            return {
                name: row[0], username: row[1], unit: row[2], facility,
                phone: row[1] === "nguyenan01" ? "0903 222 111" : row[1] === "minhanh99" ? "0912 333 444" : row[1] === "lehoangnam" ? "0908 555 666" : "0938 777 888",
                email: `${row[1]}@gmail.com`,
                startDate: type === "expiring" ? "12/07/2026" : "12/09/2026",
                endDate: type === "expiring" ? row[3] : row[4],
                rent: type === "expiring" ? row[5] : "2.200.000 đ/tháng",
                unitType: type === "expiring" ? "Kho thường · 15 m²" : "Kho lưu trữ · 15 m²",
                paymentStatus: "Đã thanh toán",
                status: type === "expiring" ? "Sắp hết hạn" : "Đang thuê"
            };
        }

        if (type === "maintenance") {
            return {
                unit: row[0], facility: row[1], unitType: row[2], reason: row[3], startDate: row[4], expectedDate: row[5],
                status: "Đang bảo trì",
                note: "Kho tạm thời không thể tiếp nhận đặt thuê cho đến khi hoàn tất bảo trì."
            };
        }

        if (type === "available") {
            return {
                unit: row[0], facility: row[1], unitType: row[2], size: row[3], rent: row[4], emptyDays: row[5],
                status: "Đang trống",
                note: "Kho đang sẵn sàng để khách hàng đặt thuê."
            };
        }

        return null;
    };

    const selectedReportDetail = reportDetail ? reportDetails[reportDetail] : null;

    return (
        <div className="bo-reports-box-01">
            <div
                className="bo-reports-flex-02"
            >
                <div>
                    <h2 className="bo-reports-title-03">
                        Báo cáo hoạt động
                    </h2>
                    <p className="bo-reports-text-04">
                        Tổng quan tình hình vận hành và hiệu quả kinh doanh của StoreSpace.
                    </p>
                </div>

                <div className="bo-reports-flex-05">
                    <select
                        value={reportFacility}
                        onChange={(e) => setReportFacility(e.target.value)}
                        className="bo-reports-field-06"
                    >
                        <option value="all">Tất cả cơ sở</option>
                        {activeFacilities.map((facility) => (
                            <option key={facility.id} value={facility.id}>
                                {facility.name}
                            </option>
                        ))}
                    </select>

                    <select
                        value={reportPeriod}
                        onChange={(e) => setReportPeriod(e.target.value)}
                        className="bo-reports-field-06"
                    >
                        <option value="6">6 tháng gần nhất</option>
                        <option value="12">12 tháng gần nhất</option>
                        <option value="year">Năm 2026</option>
                    </select>
                </div>
            </div>

            <div
                className="bo-reports-grid-07"
            >
                <div className="bo-report-card">
                    <div className="bo-reports-box-08">🏢</div>
                    <strong className="bo-reports-text-09">
                        {filteredFacilities.length}
                    </strong>
                    <span className="bo-reports-text-10">Cơ sở hoạt động</span>
                </div>

                <div className="bo-report-card">
                    <div className="bo-reports-box-08">📦</div>
                    <strong className="bo-reports-text-09">
                        {totalUnits}
                    </strong>
                    <span className="bo-reports-text-10">Tổng số kho</span>
                </div>

                <div className="bo-report-card">
                    <div className="bo-reports-box-08">🔑</div>
                    <strong className="bo-reports-text-09">
                        {rentedUnits}
                    </strong>
                    <span className="bo-reports-text-10">Kho đang thuê</span>
                </div>

                <div className="bo-report-card">
                    <div className="bo-reports-box-08">🟢</div>
                    <strong className="bo-reports-text-11">
                        {availableUnits}
                    </strong>
                    <span className="bo-reports-text-10">Kho còn trống</span>
                </div>

                <div className="bo-report-card">
                    <div className="bo-reports-box-08">📊</div>
                    <strong className="bo-reports-text-09">
                        {utilization}%
                    </strong>
                    <span className="bo-reports-text-10">Tỷ lệ lấp đầy</span>
                </div>
            </div>

            <div
                className="bo-reports-grid-12"
            >
                <div className="bo-report-card">
                    <div className="bo-reports-flex-13">
                        <div>
                            <h3 className="bo-section-title">📈 Tỷ lệ lấp đầy theo tháng</h3>
                            <p className="bo-section-text">Theo dõi xu hướng sử dụng kho theo thời gian.</p>
                        </div>
                        <span className="bo-report-status-badge bo-report-status-badge-green">
                            +{Math.max(0, chartData[chartData.length - 1].value - chartData[0].value)} điểm
                        </span>
                    </div>

                    <div
                        className="bo-reports-flex-14"
                    >
                        {chartData.map((item) => (
                            <div
                                key={item.month}
                                className="bo-reports-flex-15"
                            >
                                <strong className="bo-reports-text-16">
                                    {item.value}%
                                </strong>
                                <div
                                    className="bo-reports-box-17"
                                    style={{ height: `${Math.max(8, item.value * 1.65)}px` }}
                                />
                                <span className="bo-reports-text-18">
                                    {item.month}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bo-report-card">
                    <h3 className="bo-section-title">💰 Hiệu quả kinh doanh</h3>
                    <p className="bo-section-text">Tóm tắt chỉ số tài chính trong kỳ.</p>

                    <div className="bo-reports-box-19">
                        <span className="bo-reports-text-20">Doanh thu ước tính</span>
                        <strong className="bo-reports-text-21">
                            {formatMoney(currentRevenue)}
                        </strong>
                    </div>

                    <div className="bo-reports-box-22">
                        <span className="bo-reports-text-20">So với kỳ trước</span>
                        <strong className="bo-reports-text-23">
                            ↑ {growth}%
                        </strong>
                    </div>

                    <div className="bo-reports-box-22">
                        <span className="bo-reports-text-20">Khách hàng đang thuê</span>
                        <strong className="bo-reports-text-24">
                            {totalCustomers}
                        </strong>
                    </div>
                </div>
            </div>

            <div className="bo-reports-box-25">
                <div className="bo-reports-box-26">
                    <h3 className="bo-section-title">🏢 Hiệu quả theo từng cơ sở</h3>
                    <p className="bo-section-text">So sánh số kho, công suất và doanh thu ước tính.</p>
                </div>

                <div className="bo-reports-box-27">
                    <div className="bo-reports-box-28">
                        <div
                            className="bo-reports-grid-29"
                        >
                            <span>Cơ sở</span>
                            <span>Tổng kho</span>
                            <span>Đang thuê</span>
                            <span>Trống</span>
                            <span>Lấp đầy</span>
                            <span>Doanh thu</span>
                        </div>

                        {filteredFacilities.map((facility) => {
                            const facilityAvailable = Math.max(
                                0,
                                facility.totalUnits - facility.rentedUnits - facility.maintenanceUnits
                            );
                            const facilityUtilization = facility.totalUnits > 0
                                ? Math.round((facility.rentedUnits / facility.totalUnits) * 100)
                                : 0;
                            const facilityRevenue = facility.rentedUnits * 2100000;

                            return (
                                <div
                                    key={facility.id}
                                    className="bo-reports-grid-30"
                                >
                                    <strong className="bo-reports-text-31">{facility.name}</strong>
                                    <span>{facility.totalUnits}</span>
                                    <span>{facility.rentedUnits}</span>
                                    <span>{facilityAvailable}</span>
                                    <div>
                                        <strong className="bo-reports-text-32">
                                            {facilityUtilization}%
                                        </strong>
                                        <div className="bo-reports-box-33">
                                            <div className="bo-reports-box-34" style={{ width: `${facilityUtilization}%` }} />
                                        </div>
                                    </div>
                                    <strong className="bo-reports-text-35">{formatMoney(facilityRevenue)}</strong>
                                </div>
                            );
                        })}

                        {filteredFacilities.length === 0 && (
                            <div className="bo-reports-box-36">
                                Không có cơ sở phù hợp.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div
                className="bo-reports-grid-37"
            >
                <div className="bo-report-card">
                    <h3 className="bo-section-title">📄 Tình hình hợp đồng</h3>
                    <p className="bo-section-text">Các nhóm hợp đồng cần Business Manager theo dõi.</p>

                    <div className="bo-reports-grid-38">
                        <div className="bo-reports-box-39">
                            <span className="bo-reports-text-40">Đang hoạt động</span>
                            <strong className="bo-reports-text-41">{rentedUnits}</strong>
                            <button onClick={() => openReportDetail("active")} className="bo-report-detail-btn bo-report-detail-btn-green">Xem →</button>
                        </div>
                        <div className="bo-reports-box-42">
                            <span className="bo-reports-text-43">Sắp hết hạn</span>
                            <strong className="bo-reports-text-44">{expiringContracts}</strong>
                            <button onClick={() => openReportDetail("expiring")} className="bo-report-detail-btn bo-report-detail-btn-amber">Xem →</button>
                        </div>
                        <div className="bo-reports-box-45">
                            <span className="bo-reports-text-46">Khách hàng đang thuê</span>
                            <strong className="bo-reports-text-47">{totalCustomers}</strong>
                            <button onClick={() => openReportDetail("active")} className="bo-report-detail-btn bo-report-detail-btn-blue">Xem →</button>
                        </div>
                        <div className="bo-reports-box-48">
                            <span className="bo-reports-text-49">Quá hạn thanh toán</span>
                            <strong className="bo-reports-text-50">{overduePayments}</strong>
                            <button onClick={() => openReportDetail("overdue")} className="bo-report-detail-btn bo-report-detail-btn-red">Xem →</button>
                        </div>
                    </div>
                </div>

                <div className="bo-report-card">
                    <h3 className="bo-section-title">⚠️ Cảnh báo cần chú ý</h3>
                    <p className="bo-section-text">Các vấn đề nên được xử lý trong kỳ báo cáo.</p>

                    <div className="bo-reports-grid-51">
                        <div className="bo-reports-box-52">
                            <strong className="bo-reports-text-53">🕐 {expiringContracts} hợp đồng sắp hết hạn</strong>
                            <p className="bo-reports-text-54">
                                Nên liên hệ khách hàng để hỗ trợ gia hạn.
                            </p>
                            <button onClick={() => openReportDetail("expiring")} className="bo-report-detail-btn bo-report-detail-btn-amber-2">Xem chi tiết →</button>
                        </div>

                        <div className="bo-reports-box-55">
                            <strong className="bo-reports-text-56">💳 {overduePayments} khoản thanh toán quá hạn</strong>
                            <p className="bo-reports-text-57">
                                Cần kiểm tra và xử lý các khoản công nợ.
                            </p>
                            <button onClick={() => openReportDetail("overdue")} className="bo-report-detail-btn bo-report-detail-btn-red-2">Xem chi tiết →</button>
                        </div>

                        <div className="bo-reports-box-58">
                            <strong className="bo-reports-text-59">🔧 {maintenanceUnits} kho đang bảo trì</strong>
                            <p className="bo-reports-text-60">
                                Có thể ảnh hưởng đến số kho sẵn sàng cho thuê.
                            </p>
                            <button onClick={() => openReportDetail("maintenance")} className="bo-report-detail-btn bo-report-detail-btn-blue-2">Xem chi tiết →</button>
                        </div>

                        <div className="bo-reports-box-61">
                            <strong className="bo-reports-text-62">📦 {availableUnits} kho đang trống</strong>
                            <p className="bo-reports-text-63">
                                Có thể đẩy mạnh hoạt động đặt kho và quảng bá.
                            </p>
                            <button onClick={() => openReportDetail("available")} className="bo-report-detail-btn bo-report-detail-btn-green-2">Xem chi tiết →</button>
                        </div>
                    </div>
                </div>
            </div>

            {selectedReportDetail && (
                <div
                    id="business-report-detail"
                    className="bo-reports-box-64"
                >
                    <div className="bo-reports-flex-65">
                        <div>
                            <h3 className="bo-section-title">{selectedReportDetail.icon} {selectedReportDetail.title}</h3>
                            <p className="bo-section-text">{selectedReportDetail.subtitle}</p>
                        </div>
                        <button
                            onClick={() => setReportDetail(null)}
                            className="bo-reports-btn-66"
                        >
                            Đóng chi tiết
                        </button>
                    </div>

                    <div className="bo-reports-box-27">
                        <table className="bo-reports-table-67">
                            <thead>
                                <tr className="bo-reports-table-68">
                                    {selectedReportDetail.columns.map((column) => (
                                        <th key={column} className="bo-reports-cell-69">
                                            {column}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {selectedReportDetail.rows.map((row, rowIndex) => {
                                    const isSelected = selectedReportRow?.type === reportDetail && selectedReportRow?.rowIndex === rowIndex;
                                    return (
                                        <tr
                                            key={rowIndex}
                                            onClick={() => openReportRowDetail(reportDetail, row, rowIndex)}
                                            className={`bo-reports-table-70 ${isSelected ? "bo-reports-row-selected" : "bo-reports-row-default"}`}
                                            title="Bấm để xem thông tin chi tiết"
                                        >
                                            {row.map((cell, cellIndex) => (
                                                <td key={cellIndex} className={`bo-reports-cell-71 ${cellIndex === 0 ? "bo-reports-cell-first" : "bo-reports-cell-rest"}`}>
                                                    {cellIndex === row.length - 1 && (reportDetail === "overdue" || reportDetail === "expiring") ? (
                                                        <span className={`bo-report-status-badge ${reportDetail === "overdue" ? "bo-report-status-badge-red" : "bo-report-status-badge-amber"}`}>{cell}</span>
                                                    ) : cell}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="bo-reports-box-72">
                        💡 Bấm trực tiếp vào một dòng để xem đầy đủ thông tin chi tiết.
                    </div>

                    {selectedReportRow && selectedReportRow.type === reportDetail && getReportRowDetail(reportDetail, selectedReportRow.row) && (
                        <div
                            id="business-report-row-detail"
                            className="bo-reports-box-73"
                        >
                            {(() => {
                                const detail = getReportRowDetail(reportDetail, selectedReportRow.row);
                                const customerDetail = reportDetail === "overdue" || reportDetail === "expiring" || reportDetail === "active";
                                const accent = reportDetail === "overdue" ? "#c54242" : reportDetail === "expiring" ? "#b17b00" : reportDetail === "active" ? "#176a9c" : "#3d6f8f";
                                const accentBg = reportDetail === "overdue" ? "#fff7f7" : reportDetail === "expiring" ? "#fffaf0" : "#f6f9fc";
                                return (
                                    <>
                                        <div className="bo-reports-box-74" style={{ background: accentBg }}>
                                            <div className="bo-reports-flex-75">
                                                <div>
                                                    <div className="bo-reports-box-76" style={{ color: accent }}>
                                                        Chi tiết đối tượng
                                                    </div>
                                                    <h3 className="bo-reports-title-77">
                                                        {customerDetail ? detail.name : detail.unit}
                                                    </h3>
                                                    <div className="bo-reports-box-78">
                                                        {detail.status}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => setSelectedReportRow(null)}
                                                    className="bo-reports-btn-79"
                                                >
                                                    Ẩn chi tiết
                                                </button>
                                            </div>
                                        </div>

                                        <div className="bo-reports-box-80">
                                            {customerDetail ? (
                                                <>
                                                    <div className="bo-reports-box-81">
                                                        Thông tin khách hàng
                                                    </div>
                                                    <div className="bo-reports-grid-82">
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Tài khoản</span><strong className="bo-reports-text-84">{detail.username}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Số điện thoại</span><strong className="bo-reports-text-84">{detail.phone}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Email</span><strong className="bo-reports-text-85">{detail.email}</strong></div>
                                                    </div>

                                                    <div className="bo-reports-box-81">
                                                        Thông tin kho & hợp đồng
                                                    </div>
                                                    <div className="bo-reports-grid-82">
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Cơ sở</span><strong className="bo-reports-text-84">{detail.facility}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Mã kho</span><strong className="bo-reports-text-84">{detail.unit}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Loại kho</span><strong className="bo-reports-text-84">{detail.unitType}</strong></div>
                                                        {detail.startDate && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Ngày bắt đầu hợp đồng</span><strong className="bo-reports-text-84">{detail.startDate}</strong></div>}
                                                        {detail.endDate && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Ngày hết hạn</span><strong className="bo-reports-text-84">{detail.endDate}</strong></div>}
                                                        {detail.dueDate && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Hạn thanh toán</span><strong className="bo-reports-text-84">{detail.dueDate}</strong></div>}
                                                    </div>

                                                    <div className="bo-reports-box-81">
                                                        Tình trạng thanh toán
                                                    </div>
                                                    <div className="bo-reports-grid-86">
                                                        {detail.overdue && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Thời gian quá hạn</span><strong className="bo-reports-text-87">{detail.overdue}</strong></div>}
                                                        {(detail.rent || detail.amount) && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Số tiền cần xử lý</span><strong className={`bo-reports-text-88 ${reportDetail === "overdue" ? "bo-reports-amount-danger" : "bo-reports-amount-normal"}`}>{detail.amount || detail.rent}</strong></div>}
                                                        {detail.lastPayment && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Lần thanh toán gần nhất</span><strong className="bo-reports-text-84">{detail.lastPayment}</strong></div>}
                                                        {detail.paymentStatus && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Trạng thái</span><strong className="bo-reports-text-89" style={{ color: accent }}>{detail.paymentStatus}</strong></div>}
                                                    </div>

                                                    {reportDetail === "overdue" && (
                                                        <div className="bo-reports-box-90">
                                                            Khoản thanh toán này đang quá hạn. Business Manager nên liên hệ khách hàng để nhắc thanh toán và kiểm tra tình trạng hợp đồng.
                                                        </div>
                                                    )}

                                                    {reportDetail === "expiring" && (
                                                        <div className="bo-reports-box-91">
                                                            Hợp đồng sắp hết hạn. Nên chủ động liên hệ khách hàng để hỗ trợ gia hạn trước ngày hết hạn.
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <div className="bo-reports-box-81">
                                                        Thông tin kho
                                                    </div>
                                                    <div className="bo-reports-grid-86">
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Mã kho</span><strong className="bo-reports-text-84">{detail.unit}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Cơ sở</span><strong className="bo-reports-text-84">{detail.facility}</strong></div>
                                                        <div className="bo-detail-info-box"><span className="bo-reports-text-83">Loại kho</span><strong className="bo-reports-text-84">{detail.unitType}</strong></div>
                                                        {detail.reason && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Lý do</span><strong className="bo-reports-text-84">{detail.reason}</strong></div>}
                                                        {detail.size && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Diện tích</span><strong className="bo-reports-text-84">{detail.size}</strong></div>}
                                                        {detail.rent && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Giá thuê / tháng</span><strong className="bo-reports-text-84">{detail.rent}</strong></div>}
                                                        {detail.startDate && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Bắt đầu</span><strong className="bo-reports-text-84">{detail.startDate}</strong></div>}
                                                        {detail.expectedDate && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Dự kiến hoàn thành</span><strong className="bo-reports-text-84">{detail.expectedDate}</strong></div>}
                                                        {detail.emptyDays && <div className="bo-detail-info-box"><span className="bo-reports-text-83">Thời gian trống</span><strong className="bo-reports-text-84">{detail.emptyDays}</strong></div>}
                                                    </div>
                                                    {detail.note && (
                                                        <div className="bo-reports-box-92">
                                                            {detail.note}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}

            <div
                className="bo-reports-box-93"
            >
                <div className="bo-reports-flex-94">
                    <div>
                        <h3 className="bo-reports-title-95">💡 Nhận định kỳ báo cáo</h3>
                        <p className="bo-reports-text-96">
                            Công suất hiện tại đạt {utilization}%. Có {availableUnits} kho còn trống và {maintenanceUnits} kho đang bảo trì.
                            {utilization >= 80
                                ? " Tỷ lệ lấp đầy đang ở mức tốt, nên ưu tiên gia hạn khách hàng hiện tại."
                                : " Nên tăng hoạt động thu hút khách hàng mới để cải thiện tỷ lệ lấp đầy."}
                        </p>
                    </div>
                    <div className="bo-reports-box-97">
                        <span className="bo-reports-text-98">Mức độ hoạt động</span>
                        <strong className="bo-reports-text-99">{utilization}%</strong>
                    </div>
                </div>
            </div>
        </div>
    );
}


/* =====================================================
   BUSINESS PLACEHOLDER
===================================================== */

function BusinessPlaceholder({ title, text }) {
    return (
        <div className="business-placeholder">
            <h2>{title}</h2>
            <p>{text}</p>
        </div>
    );
}


/* =====================================================
   BUSINESS FACILITIES
===================================================== */

function BusinessFacilities({
    facilities,
    setFacilities,
    setShowAddFacility
}) {
    const [selectedFacility, setSelectedFacility] = useState(null);

    const [searchFacility, setSearchFacility] = useState("");
    const [facilityStatus, setFacilityStatus] = useState("all");

    const [searchUnit, setSearchUnit] = useState("");
    const [unitType, setUnitType] = useState("all");
    const [unitStatus, setUnitStatus] = useState("all");

    const [showEditFacility, setShowEditFacility] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);

    const [unitsData, setUnitsData] = useState([
        {
            id: 1,
            facilityId: 1,
            code: "Q1-U01",
            type: "Kho thường",
            size: "10 m²",
            price: 1500000,
            status: "rented"
        },
        {
            id: 2,
            facilityId: 1,
            code: "Q1-U02",
            type: "Kho lạnh",
            size: "15 m²",
            price: 2200000,
            status: "available"
        },
        {
            id: 3,
            facilityId: 1,
            code: "Q1-U03",
            type: "Kho đông lạnh",
            size: "20 m²",
            price: 3000000,
            status: "maintenance"
        },
        {
            id: 4,
            facilityId: 1,
            code: "Q1-U04",
            type: "Kho thường",
            size: "12 m²",
            price: 1800000,
            status: "rented"
        },
        {
            id: 5,
            facilityId: 2,
            code: "TB-U01",
            type: "Kho thường",
            size: "10 m²",
            price: 1400000,
            status: "rented"
        },
        {
            id: 6,
            facilityId: 2,
            code: "TB-U02",
            type: "Kho lạnh",
            size: "15 m²",
            price: 2100000,
            status: "available"
        },
        {
            id: 7,
            facilityId: 2,
            code: "TB-U03",
            type: "Kho thường",
            size: "20 m²",
            price: 2700000,
            status: "rented"
        },
        {
            id: 8,
            facilityId: 3,
            code: "TD-U01",
            type: "Kho thường",
            size: "10 m²",
            price: 1300000,
            status: "rented"
        },
        {
            id: 9,
            facilityId: 3,
            code: "TD-U02",
            type: "Kho lạnh",
            size: "15 m²",
            price: 2000000,
            status: "available"
        },
        {
            id: 10,
            facilityId: 4,
            code: "Q2-U01",
            type: "Kho thường",
            size: "12 m²",
            price: 1600000,
            status: "available"
        },
        {
            id: 11,
            facilityId: 4,
            code: "Q2-U02",
            type: "Kho đông lạnh",
            size: "20 m²",
            price: 2900000,
            status: "rented"
        },
        {
            id: 12,
            facilityId: 5,
            code: "Q3-U01",
            type: "Kho thường",
            size: "10 m²",
            price: 1300000,
            status: "available"
        },
        {
            id: 13,
            facilityId: 5,
            code: "Q3-U02",
            type: "Kho lạnh",
            size: "15 m²",
            price: 2000000,
            status: "rented"
        }
    ]);

    const [newFacilityEdit, setNewFacilityEdit] = useState({
        name: "",
        area: "",
        address: "",
        totalUnits: "",
        manager: "",
        status: "active"
    });

    const totalUnits = facilities.reduce(
        (total, facility) => total + facility.totalUnits,
        0
    );

    const rentedUnits = facilities.reduce(
        (total, facility) => total + facility.rentedUnits,
        0
    );

    const maintenanceUnits = facilities.reduce(
        (total, facility) => total + facility.maintenanceUnits,
        0
    );

    const availableUnits =
        totalUnits - rentedUnits - maintenanceUnits;

    const filteredFacilities = facilities.filter((facility) => {
        const keyword = searchFacility.toLowerCase().trim();

        const matchSearch =
            facility.name.toLowerCase().includes(keyword) ||
            facility.area.toLowerCase().includes(keyword);

        const matchStatus =
            facilityStatus === "all" ||
            facility.status === facilityStatus;

        return matchSearch && matchStatus;
    });

    const currentFacility = facilities.find(
        (facility) => facility.id === selectedFacility
    );

    const openEditFacility = () => {
        if (!currentFacility) return;

        setNewFacilityEdit({
            name: currentFacility.name,
            area: currentFacility.area,
            address: currentFacility.address,
            totalUnits: currentFacility.totalUnits,
            manager: currentFacility.manager || "",
            status: currentFacility.status
        });

        setShowEditFacility(true);
    };

    const handleEditFacility = () => {
        if (!currentFacility) return;

        if (
            !newFacilityEdit.name.trim() ||
            !newFacilityEdit.area.trim() ||
            !newFacilityEdit.address.trim() ||
            !newFacilityEdit.totalUnits
        ) {
            alert("Vui lòng nhập đầy đủ thông tin cơ sở.");
            return;
        }

        const totalUnits = Number(newFacilityEdit.totalUnits);

        if (totalUnits <= 0) {
            alert("Số lượng kho phải lớn hơn 0.");
            return;
        }

        if (totalUnits < currentFacility.rentedUnits + currentFacility.maintenanceUnits) {
            alert("Số lượng kho không thể nhỏ hơn số kho đang thuê và đang bảo trì.");
            return;
        }

        setFacilities((currentFacilities) =>
            currentFacilities.map((facility) =>
                facility.id === currentFacility.id
                    ? {
                        ...facility,
                        name: newFacilityEdit.name.trim(),
                        area: newFacilityEdit.area.trim(),
                        address: newFacilityEdit.address.trim(),
                        totalUnits,
                        manager: newFacilityEdit.manager.trim(),
                        status: newFacilityEdit.status
                    }
                    : facility
            )
        );

        setShowEditFacility(false);
    };

    const handleDeleteFacility = () => {
        if (!currentFacility) return;

        if (currentFacility.rentedUnits > 0) {
            alert("Không thể xóa cơ sở đang có kho được thuê. Hãy xử lý các hợp đồng trước.");
            setShowDeleteConfirm(false);
            return;
        }

        setFacilities((currentFacilities) =>
            currentFacilities.filter((facility) => facility.id !== currentFacility.id)
        );

        setShowDeleteConfirm(false);
        setSelectedFacility(null);
    };

    const handleUnitStatusChange = (unitId, newStatus) => {
        const targetUnit = unitsData.find((unit) => unit.id === unitId);
        if (!targetUnit || !currentFacility) return;

        if (targetUnit.status === "rented" && newStatus === "maintenance") {
            alert("Kho đang được thuê không thể chuyển trực tiếp sang bảo trì.");
            return;
        }

        setUnitsData((currentUnitsData) =>
            currentUnitsData.map((unit) =>
                unit.id === unitId
                    ? { ...unit, status: newStatus }
                    : unit
            )
        );

        const rentedDelta =
            (targetUnit.status === "rented" ? -1 : 0) +
            (newStatus === "rented" ? 1 : 0);

        const maintenanceDelta =
            (targetUnit.status === "maintenance" ? -1 : 0) +
            (newStatus === "maintenance" ? 1 : 0);

        setFacilities((currentFacilities) =>
            currentFacilities.map((facility) =>
                facility.id === currentFacility.id
                    ? {
                        ...facility,
                        rentedUnits: Math.max(0, facility.rentedUnits + rentedDelta),
                        maintenanceUnits: Math.max(0, facility.maintenanceUnits + maintenanceDelta)
                    }
                    : facility
            )
        );

        setEditingUnit(null);
    };

    const currentUnits = unitsData.filter(
        (unit) => unit.facilityId === selectedFacility
    );

    const filteredUnits = currentUnits.filter((unit) => {
        const matchSearch = unit.code
            .toLowerCase()
            .includes(searchUnit.toLowerCase().trim());

        const matchType =
            unitType === "all" ||
            unit.type === unitType;

        const matchStatus =
            unitStatus === "all" ||
            unit.status === unitStatus;

        return matchSearch && matchType && matchStatus;
    });

    const formatMoney = (money) => {
        return new Intl.NumberFormat("vi-VN").format(money) + " đ";
    };

    const getUnitStatus = (status) => {
        if (status === "rented") {
            return {
                text: "Đang thuê",
                className: "facility-status rented"
            };
        }

        if (status === "maintenance") {
            return {
                text: "Bảo trì",
                className: "facility-status maintenance"
            };
        }

        return {
            text: "Còn trống",
            className: "facility-status available"
        };
    };

    const handleCloseDetail = () => {
        setSelectedFacility(null);
        setSearchUnit("");
        setUnitType("all");
        setUnitStatus("all");
    };

    if (currentFacility) {
        return (
            <div className="business-facilities">

                <button
                    className="facility-back-button"
                    onClick={handleCloseDetail}
                >
                    ← Quay lại danh sách cơ sở
                </button>

                <div className="facility-detail-header">

                    <div>
                        <div className="facility-detail-title-row">

                            <h2>
                                {currentFacility.name}
                            </h2>

                            <span className="facility-active-badge">
                                {currentFacility.status === "active"
                                    ? "Đang hoạt động"
                                    : "Tạm ngưng"}
                            </span>

                        </div>

                        <p>
                            📍 {currentFacility.address}
                        </p>

                        <p>
                            👤 Quản lý:{" "}
                            {currentFacility.manager
                                ? currentFacility.manager
                                : "Chưa phân công"}
                        </p>
                    </div>

                    <div className="facility-detail-actions">
                        <button
                            className="facility-edit-button"
                            onClick={openEditFacility}
                        >
                            ✏️ Chỉnh sửa cơ sở
                        </button>

                        <button
                            className="facility-delete-button bo-facilities-btn-01"
                            onClick={() => setShowDeleteConfirm(true)}
                        >
                            🗑️ Xóa cơ sở
                        </button>
                    </div>

                </div>

                <div className="facility-kpi-grid">

                    <div className="facility-kpi-card">
                        <span>📦</span>
                        <div>
                            <strong>{currentFacility.totalUnits}</strong>
                            <small>Tổng kho</small>
                        </div>
                    </div>

                    <div className="facility-kpi-card">
                        <span>🔑</span>
                        <div>
                            <strong>{currentFacility.rentedUnits}</strong>
                            <small>Đang thuê</small>
                        </div>
                    </div>

                    <div className="facility-kpi-card">
                        <span>🟢</span>
                        <div>
                            <strong>
                                {currentFacility.totalUnits -
                                    currentFacility.rentedUnits -
                                    currentFacility.maintenanceUnits}
                            </strong>
                            <small>Còn trống</small>
                        </div>
                    </div>

                    <div className="facility-kpi-card">
                        <span>🔧</span>
                        <div>
                            <strong>{currentFacility.maintenanceUnits}</strong>
                            <small>Bảo trì</small>
                        </div>
                    </div>

                    <div className="facility-kpi-card">
                        <span>📊</span>
                        <div>
                            <strong>
                                {currentFacility.totalUnits > 0
                                    ? Math.round(
                                        (currentFacility.rentedUnits /
                                            currentFacility.totalUnits) *
                                        100
                                    )
                                    : 0}
                                %
                            </strong>
                            <small>Công suất</small>
                        </div>
                    </div>

                </div>

                <div className="business-panel facility-unit-panel">

                    <div className="business-panel-header">

                        <div>
                            <h3>
                                Danh sách kho
                            </h3>

                            <p>
                                Quản lý các kho thuộc {currentFacility.name}
                            </p>
                        </div>

                    </div>

                    <div className="facility-filter-bar">

                        <input
                            type="text"
                            placeholder="🔍 Tìm theo mã kho..."
                            value={searchUnit}
                            onChange={(e) => setSearchUnit(e.target.value)}
                        />

                        <select
                            value={unitType}
                            onChange={(e) => setUnitType(e.target.value)}
                        >
                            <option value="all">
                                Tất cả loại kho
                            </option>

                            <option value="Kho thường">
                                Kho thường
                            </option>

                            <option value="Kho lạnh">
                                Kho lạnh
                            </option>

                            <option value="Kho đông lạnh">
                                Kho đông lạnh
                            </option>
                        </select>

                        <select
                            value={unitStatus}
                            onChange={(e) => setUnitStatus(e.target.value)}
                        >
                            <option value="all">
                                Tất cả trạng thái
                            </option>

                            <option value="available">
                                Còn trống
                            </option>

                            <option value="rented">
                                Đang thuê
                            </option>

                            <option value="maintenance">
                                Bảo trì
                            </option>
                        </select>

                    </div>

                    <div className="facility-unit-table">

                        <div className="facility-unit-header">
                            <span>Mã kho</span>
                            <span>Loại kho</span>
                            <span>Diện tích</span>
                            <span>Giá thuê/tháng</span>
                            <span>Trạng thái</span>
                            <span>Thao tác</span>
                        </div>

                        {filteredUnits.length === 0 && (
                            <div className="facility-empty">
                                Không tìm thấy kho phù hợp.
                            </div>
                        )}

                        {filteredUnits.map((unit) => {
                            const status = getUnitStatus(unit.status);

                            return (
                                <div
                                    className="facility-unit-row"
                                    key={unit.id}
                                >
                                    <strong>
                                        {unit.code}
                                    </strong>

                                    <span>
                                        {unit.type}
                                    </span>

                                    <span>
                                        {unit.size}
                                    </span>

                                    <span>
                                        {formatMoney(unit.price)}
                                    </span>

                                    <span>
                                        <span className={status.className}>
                                            {status.text}
                                        </span>
                                    </span>

                                    <div className="facility-unit-actions">
                                        <button
                                            title="Đổi trạng thái kho"
                                            onClick={() => setEditingUnit(unit)}
                                        >
                                            ✏️
                                        </button>

                                        <button
                                            title="Bảo trì"
                                            onClick={() => handleUnitStatusChange(unit.id, "maintenance")}
                                        >
                                            🔧
                                        </button>
                                    </div>
                                </div>
                            );
                        })}

                    </div>
                </div>

                {showEditFacility && (
                    <div
                        className="facility-modal-overlay"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) setShowEditFacility(false);
                        }}
                    >
                        <div className="facility-modal">
                            <div className="facility-modal-header">
                                <div>
                                    <h3>Chỉnh sửa cơ sở</h3>
                                    <p>Cập nhật thông tin và quy mô kho</p>
                                </div>
                                <button onClick={() => setShowEditFacility(false)}>✕</button>
                            </div>

                            <div className="facility-form-grid">
                                <div className="facility-form-group">
                                    <label>Tên cơ sở</label>
                                    <input value={newFacilityEdit.name} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, name: e.target.value })} />
                                </div>
                                <div className="facility-form-group">
                                    <label>Khu vực</label>
                                    <input value={newFacilityEdit.area} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, area: e.target.value })} />
                                </div>
                                <div className="facility-form-group full">
                                    <label>Địa chỉ</label>
                                    <input value={newFacilityEdit.address} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, address: e.target.value })} />
                                </div>
                                <div className="facility-form-group">
                                    <label>Tổng số kho</label>
                                    <input type="number" min="1" value={newFacilityEdit.totalUnits} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, totalUnits: e.target.value })} />
                                    <small>Không được thấp hơn số kho đang thuê + bảo trì.</small>
                                </div>
                                <div className="facility-form-group">
                                    <label>Người quản lý</label>
                                    <input value={newFacilityEdit.manager} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, manager: e.target.value })} placeholder="Chưa phân công" />
                                </div>
                                <div className="facility-form-group">
                                    <label>Trạng thái</label>
                                    <select value={newFacilityEdit.status} onChange={(e) => setNewFacilityEdit({ ...newFacilityEdit, status: e.target.value })}>
                                        <option value="active">Đang hoạt động</option>
                                        <option value="inactive">Tạm ngưng</option>
                                    </select>
                                </div>
                            </div>

                            <div className="facility-modal-footer">
                                <button className="facility-cancel-button" onClick={() => setShowEditFacility(false)}>Hủy</button>
                                <button className="facility-save-button" onClick={handleEditFacility}>Lưu thay đổi</button>
                            </div>
                        </div>
                    </div>
                )}

                {showDeleteConfirm && (
                    <div className="facility-modal-overlay">
                        <div className="facility-modal facility-delete-modal">
                            <div className="facility-modal-header">
                                <div>
                                    <h3>Xóa cơ sở?</h3>
                                    <p>Bạn đang xóa {currentFacility.name}. Thao tác này không thể hoàn tác.</p>
                                </div>
                                <button onClick={() => setShowDeleteConfirm(false)}>✕</button>
                            </div>
                            <div
                                className="facility-delete-warning bo-facilities-box-02"
                            >
                                ⚠️ Chỉ nên xóa cơ sở khi cơ sở không còn kho đang cho thuê.
                            </div>
                            <div className="facility-modal-footer">
                                <button className="facility-cancel-button" onClick={() => setShowDeleteConfirm(false)}>Hủy</button>
                                <button
                                    className="facility-delete-confirm-button bo-facilities-btn-03"
                                    onClick={handleDeleteFacility}
                                >
                                    Xóa cơ sở
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {editingUnit && (
                    <div className="facility-modal-overlay">
                        <div className="facility-modal">
                            <div className="facility-modal-header">
                                <div>
                                    <h3>Cập nhật trạng thái kho</h3>
                                    <p>{editingUnit.code} · {editingUnit.type} · {editingUnit.size}</p>
                                </div>
                                <button onClick={() => setEditingUnit(null)}>✕</button>
                            </div>
                            <div className="facility-form-grid">
                                <div className="facility-form-group full">
                                    <label>Trạng thái kho</label>
                                    <select value={editingUnit.status} onChange={(e) => setEditingUnit({ ...editingUnit, status: e.target.value })}>
                                        <option value="available">Còn trống</option>
                                        <option value="rented">Đang thuê</option>
                                        <option value="maintenance">Bảo trì</option>
                                    </select>
                                </div>
                            </div>
                            <div className="facility-modal-footer">
                                <button className="facility-cancel-button" onClick={() => setEditingUnit(null)}>Hủy</button>
                                <button className="facility-save-button" onClick={() => handleUnitStatusChange(editingUnit.id, editingUnit.status)}>Lưu trạng thái</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        );
    }

    return (
        <div className="business-facilities">

            <div className="facilities-page-header">

                <div>
                    <h2>
                        Cơ sở & kho
                    </h2>

                    <p>
                        Quản lý toàn bộ cơ sở lưu trữ của StoreSpace.
                    </p>
                </div>

                <button
                    className="facility-add-button"
                    onClick={() => setShowAddFacility(true)}
                >
                    + Thêm cơ sở
                </button>

            </div>

            <div className="facility-stat-grid">

                <div className="facility-stat-card">
                    <div className="facility-stat-icon">
                        🏢
                    </div>

                    <div>
                        <strong>{facilities.length}</strong>
                        <span>Tổng cơ sở</span>
                    </div>
                </div>

                <div className="facility-stat-card">
                    <div className="facility-stat-icon blue">
                        📦
                    </div>

                    <div>
                        <strong>{totalUnits}</strong>
                        <span>Tổng kho</span>
                    </div>
                </div>

                <div className="facility-stat-card">
                    <div className="facility-stat-icon yellow">
                        🔑
                    </div>

                    <div>
                        <strong>{rentedUnits}</strong>
                        <span>Đang thuê</span>
                    </div>
                </div>

                <div className="facility-stat-card">
                    <div className="facility-stat-icon green">
                        ✓
                    </div>

                    <div>
                        <strong>{availableUnits}</strong>
                        <span>Còn trống</span>
                    </div>
                </div>

                <div className="facility-stat-card">
                    <div className="facility-stat-icon orange">
                        🔧
                    </div>

                    <div>
                        <strong>{maintenanceUnits}</strong>
                        <span>Bảo trì</span>
                    </div>
                </div>

            </div>

            <div className="business-panel facility-list-panel">

                <div className="business-panel-header">

                    <div>
                        <h3>
                            Danh sách cơ sở
                        </h3>

                        <p>
                            Các cơ sở đang được quản lý trong hệ thống
                        </p>
                    </div>

                </div>

                <div className="facility-filter-bar">

                    <input
                        type="text"
                        placeholder="🔍 Tìm tên hoặc khu vực..."
                        value={searchFacility}
                        onChange={(e) =>
                            setSearchFacility(e.target.value)
                        }
                    />

                    <select
                        value={facilityStatus}
                        onChange={(e) =>
                            setFacilityStatus(e.target.value)
                        }
                    >
                        <option value="all">
                            Tất cả trạng thái
                        </option>

                        <option value="active">
                            Đang hoạt động
                        </option>

                        <option value="inactive">
                            Ngừng hoạt động
                        </option>
                    </select>

                </div>

                <div className="facility-list">

                    {filteredFacilities.map((facility) => {
                        const available =
                            facility.totalUnits -
                            facility.rentedUnits -
                            facility.maintenanceUnits;

                        const utilization =
                            facility.totalUnits > 0
                                ? Math.round(
                                    (facility.rentedUnits /
                                        facility.totalUnits) *
                                    100
                                )
                                : 0;

                        return (
                            <div
                                className="bo-facility-card"
                                key={facility.id}
                            >

                                <div className="facility-card-top">

                                    <div className="facility-card-title">

                                        <div className="facility-building-icon">
                                            🏢
                                        </div>

                                        <div>
                                            <h3>
                                                {facility.name}
                                            </h3>

                                            <p>
                                                📍 {facility.area}
                                            </p>
                                        </div>

                                    </div>

                                    <span
                                        className={
                                            facility.status === "active"
                                                ? "facility-status active"
                                                : "facility-status inactive"
                                        }
                                    >
                                        {facility.status === "active"
                                            ? "Đang hoạt động"
                                            : "Tạm ngưng"}
                                    </span>

                                </div>

                                <div className="facility-address">
                                    {facility.address}
                                </div>

                                <div className="facility-card-stats">

                                    <div>
                                        <strong>
                                            {facility.totalUnits}
                                        </strong>
                                        <span>Tổng kho</span>
                                    </div>

                                    <div>
                                        <strong>
                                            {facility.rentedUnits}
                                        </strong>
                                        <span>Đang thuê</span>
                                    </div>

                                    <div>
                                        <strong>
                                            {available}
                                        </strong>
                                        <span>Còn trống</span>
                                    </div>

                                    <div>
                                        <strong>
                                            {facility.maintenanceUnits}
                                        </strong>
                                        <span>Bảo trì</span>
                                    </div>

                                </div>

                                <div className="facility-utilization">

                                    <div className="facility-utilization-header">

                                        <span>
                                            Công suất sử dụng
                                        </span>

                                        <strong>
                                            {utilization}%
                                        </strong>

                                    </div>

                                    <div className="facility-progress">
                                        <div
                                            style={{ width: `${utilization}%` }}
                                        ></div>
                                    </div>

                                </div>

                                <div className="facility-manager">

                                    <span>
                                        👤 Người quản lý
                                    </span>

                                    <strong>
                                        {facility.manager
                                            ? facility.manager
                                            : "Chưa phân công"}
                                    </strong>

                                </div>

                                <div className="facility-card-footer">

                                    <span>
                                        {facility.manager
                                            ? "Manager đã được phân công"
                                            : "Chưa có Facility Manager"}
                                    </span>

                                    <button
                                        onClick={() =>
                                            setSelectedFacility(facility.id)
                                        }
                                    >
                                        Xem chi tiết →
                                    </button>

                                </div>

                            </div>
                        );
                    })}

                </div>

                {filteredFacilities.length === 0 && (
                    <div className="facility-empty">
                        Không tìm thấy cơ sở phù hợp.
                    </div>
                )}

            </div>

        </div>
    );
}


/* =====================================================
   BUSINESS REVENUE
===================================================== */

function BusinessRevenue({ facilities }) {
    const [period, setPeriod] = useState("6 tháng");
    const [facilityFilter, setFacilityFilter] = useState("all");

    const revenueData = {
        "6 tháng": [
            { month: "May", revenue: 312 },
            { month: "Jun", revenue: 356 },
            { month: "Jul", revenue: 328 },
            { month: "Aug", revenue: 398 },
            { month: "Sep", revenue: 382 },
            { month: "Oct", revenue: 428 }
        ],
        "12 tháng": [
            { month: "Nov", revenue: 265 },
            { month: "Dec", revenue: 278 },
            { month: "Jan", revenue: 286 },
            { month: "Feb", revenue: 294 },
            { month: "Mar", revenue: 301 },
            { month: "Apr", revenue: 305 },
            { month: "May", revenue: 312 },
            { month: "Jun", revenue: 356 },
            { month: "Jul", revenue: 328 },
            { month: "Aug", revenue: 398 },
            { month: "Sep", revenue: 382 },
            { month: "Oct", revenue: 428 }
        ],
        "Năm 2026": [
            { month: "Jan", revenue: 286 },
            { month: "Feb", revenue: 294 },
            { month: "Mar", revenue: 301 },
            { month: "Apr", revenue: 305 },
            { month: "May", revenue: 312 },
            { month: "Jun", revenue: 356 },
            { month: "Jul", revenue: 328 },
            { month: "Aug", revenue: 398 },
            { month: "Sep", revenue: 382 },
            { month: "Oct", revenue: 428 }
        ]
    };

    const currentRevenueData = revenueData[period];
    const currentRevenue = currentRevenueData[currentRevenueData.length - 1].revenue;
    const previousRevenue = currentRevenueData.length > 1
        ? currentRevenueData[currentRevenueData.length - 2].revenue
        : currentRevenue;
    const revenueGrowth = previousRevenue > 0
        ? (((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1)
        : "0.0";

    const totalRevenue = currentRevenueData.reduce(
        (sum, item) => sum + item.revenue,
        0
    );

    const averageRevenue = currentRevenueData.length > 0
        ? totalRevenue / currentRevenueData.length
        : 0;

    const formatMillion = (value) => `${value.toLocaleString("vi-VN")}M đ`;

    const totalRentedUnits = facilities.reduce(
        (sum, facility) => sum + facility.rentedUnits,
        0
    );

    const totalUnits = facilities.reduce(
        (sum, facility) => sum + facility.totalUnits,
        0
    );

    const utilization = totalUnits > 0
        ? Math.round((totalRentedUnits / totalUnits) * 100)
        : 0;

    const facilityRevenue = facilities.map((facility) => {
        const baseRate =
            facility.id === 1 ? 15.9 :
                facility.id === 2 ? 15.2 :
                    facility.id === 3 ? 14.4 :
                        facility.id === 4 ? 15.0 : 13.8;

        return {
            ...facility,
            revenue: Math.round(facility.rentedUnits * baseRate)
        };
    });

    const filteredFacilityRevenue = facilityFilter === "all"
        ? facilityRevenue
        : facilityRevenue.filter(
            (facility) => String(facility.id) === facilityFilter
        );

    const maxRevenue = Math.max(
        ...currentRevenueData.map((item) => item.revenue),
        1
    );

    const paymentSummary = [
        {
            label: "Tiền thuê kho",
            value: Math.round(currentRevenue * 0.78),
            icon: "🏢"
        },
        {
            label: "Tiền cọc",
            value: Math.round(currentRevenue * 0.14),
            icon: "🔐"
        },
        {
            label: "Phí phát sinh",
            value: Math.round(currentRevenue * 0.08),
            icon: "💳"
        }
    ];

    return (
        <div className="business-dashboard">

            <div className="business-welcome">
                <div>
                    <h2>Doanh thu</h2>
                    <p>
                        Theo dõi doanh thu, tình hình thanh toán và hiệu quả kinh doanh của StoreSpace.
                    </p>
                </div>

                <select
                    className="business-select"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                >
                    <option>6 tháng</option>
                    <option>12 tháng</option>
                    <option>Năm 2026</option>
                </select>
            </div>

            <div className="business-kpi-grid">
                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">💰</span>
                        <span className="business-kpi-label">Doanh thu tháng này</span>
                    </div>
                    <div className="business-kpi-value">{formatMillion(currentRevenue)}</div>
                    <div className="business-kpi-description">
                        <span className={`bo-revenue-text-01 ${Number(revenueGrowth) >= 0 ? "bo-revenue-growth-up" : "bo-revenue-growth-down"}`}>
                            {Number(revenueGrowth) >= 0 ? "+" : ""}{revenueGrowth}%
                        </span>{" "}
                        so với tháng trước
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">📊</span>
                        <span className="business-kpi-label">Doanh thu kỳ này</span>
                    </div>
                    <div className="business-kpi-value">{formatMillion(totalRevenue)}</div>
                    <div className="business-kpi-description">
                        Tổng doanh thu trong {period.toLowerCase()}
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">📈</span>
                        <span className="business-kpi-label">Doanh thu trung bình</span>
                    </div>
                    <div className="business-kpi-value">{formatMillion(Math.round(averageRevenue))}</div>
                    <div className="business-kpi-description">
                        Bình quân mỗi tháng
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">🔑</span>
                        <span className="business-kpi-label">Công suất kho</span>
                    </div>
                    <div className="business-kpi-value">{utilization}%</div>
                    <div className="business-kpi-description">
                        {totalRentedUnits}/{totalUnits} kho đang thuê
                    </div>
                </div>
            </div>

            <div className="business-dashboard-grid">
                <div className="business-panel">
                    <div className="business-panel-header">
                        <div>
                            <h3>Biểu đồ doanh thu</h3>
                            <p>Doanh thu theo từng tháng</p>
                        </div>
                        <span
                            className="bo-revenue-text-02"
                        >
                            Đơn vị: triệu đồng
                        </span>
                    </div>

                    <div
                        className="bo-revenue-flex-03"
                    >
                        {currentRevenueData.map((item, index) => (
                            <div
                                key={`${item.month}-${index}`}
                                className="bo-revenue-flex-04"
                            >
                                <strong className="bo-revenue-text-05">
                                    {item.revenue}M
                                </strong>
                                <div
                                    title={`${item.month}: ${item.revenue}M đ`}
                                    className={`bo-revenue-box-06 ${index === currentRevenueData.length - 1 ? "bo-revenue-bar-current" : "bo-revenue-bar-past"}`}
                                    style={{ height: `${Math.max(8, (item.revenue / maxRevenue) * 220)}px` }}
                                ></div>
                                <span className="bo-revenue-text-07">
                                    {item.month}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="business-panel">
                    <div className="business-panel-header">
                        <div>
                            <h3>Cơ cấu doanh thu</h3>
                            <p>Phân loại nguồn doanh thu tháng hiện tại</p>
                        </div>
                    </div>

                    <div className="bo-revenue-grid-08">
                        {paymentSummary.map((item) => (
                            <div
                                key={item.label}
                                className="bo-revenue-flex-09"
                            >
                                <div
                                    className="bo-revenue-flex-10"
                                >
                                    {item.icon}
                                </div>
                                <div className="bo-revenue-box-11">
                                    <span className="bo-revenue-text-12">
                                        {item.label}
                                    </span>
                                    <strong className="bo-revenue-text-13">
                                        {formatMillion(item.value)}
                                    </strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="business-panel">
                <div className="business-panel-header">
                    <div>
                        <h3>Doanh thu theo cơ sở</h3>
                        <p>So sánh hiệu quả doanh thu giữa các cơ sở</p>
                    </div>

                    <select
                        className="business-select"
                        value={facilityFilter}
                        onChange={(e) => setFacilityFilter(e.target.value)}
                    >
                        <option value="all">Tất cả cơ sở</option>
                        {facilities.map((facility) => (
                            <option key={facility.id} value={facility.id}>
                                {facility.name}
                            </option>
                        ))}
                    </select>
                </div>

                {filteredFacilityRevenue.length > 0 ? (
                    <div className="bo-revenue-box-14">
                        <div
                            className="bo-revenue-box-15"
                        >
                            <div
                                className="bo-revenue-grid-16"
                            >
                                <span>Cơ sở</span>
                                <span>Tổng kho</span>
                                <span>Đang thuê</span>
                                <span>Công suất</span>
                                <span>Doanh thu ước tính</span>
                            </div>

                            {filteredFacilityRevenue.map((facility) => {
                                const facilityUtilization = facility.totalUnits > 0
                                    ? Math.round((facility.rentedUnits / facility.totalUnits) * 100)
                                    : 0;

                                return (
                                    <div
                                        key={facility.id}
                                        className="bo-revenue-grid-17"
                                    >
                                        <div>
                                            <strong>{facility.name}</strong>
                                            <span className="bo-revenue-text-18">
                                                {facility.area}
                                            </span>
                                        </div>
                                        <span>{facility.totalUnits}</span>
                                        <span>{facility.rentedUnits}</span>
                                        <span>
                                            <strong>{facilityUtilization}%</strong>
                                            <span
                                                className="bo-revenue-text-19"
                                            >
                                                <span
                                                    className="bo-revenue-text-20"
                                                    style={{ width: `${facilityUtilization}%` }}
                                                ></span>
                                            </span>
                                        </span>
                                        <strong className="bo-revenue-text-21">
                                            {formatMillion(facility.revenue)}
                                        </strong>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div
                        className="bo-revenue-box-22"
                    >
                        Chưa có dữ liệu cơ sở.
                    </div>
                )}
            </div>

            <div className="business-panel">
                <div className="business-panel-header">
                    <div>
                        <h3>Giao dịch doanh thu gần đây</h3>
                        <p>Các khoản thu tiêu biểu trong tháng 10/2026</p>
                    </div>
                </div>

                <div className="bo-revenue-box-14">
                    <div
                        className="bo-revenue-box-15"
                    >
                        {[
                            ["INV-1026-001", "StoreSpace Quận 1", "Tiền thuê kho", "18.500.000 đ", "Đã thanh toán"],
                            ["INV-1026-002", "StoreSpace Tân Bình", "Tiền thuê kho", "15.200.000 đ", "Đã thanh toán"],
                            ["INV-1026-003", "StoreSpace Thủ Đức", "Tiền cọc", "12.000.000 đ", "Đã thanh toán"],
                            ["INV-1026-004", "StoreSpace Quận 2", "Phí phát sinh", "4.800.000 đ", "Đã thanh toán"],
                            ["INV-1026-005", "StoreSpace Quận 3", "Tiền thuê kho", "13.800.000 đ", "Đã thanh toán"]
                        ].map((transaction, index) => (
                            <div
                                key={transaction[0]}
                                className={index < 4 ? "bo-revenue-grid-23 bo-revenue-row-divider" : "bo-revenue-grid-23"}
                            >
                                <strong>{transaction[0]}</strong>
                                <span>{transaction[1]}</span>
                                <span>{transaction[2]}</span>
                                <strong className="bo-revenue-text-21">{transaction[3]}</strong>
                                <span
                                    className="bo-revenue-text-24"
                                >
                                    {transaction[4]}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div
                className="bo-revenue-box-25"
            >
                <strong>📌 Lưu ý:</strong> Các số liệu doanh thu trong giao diện hiện là dữ liệu mô phỏng phục vụ happy case/demo. Khi kết nối backend, phần này có thể lấy trực tiếp từ các giao dịch thanh toán thực tế.
            </div>
        </div>
    );
}


/* =====================================================
   BUSINESS DASHBOARD
===================================================== */

function BusinessDashboard({ facilities }) {
    const totalUnits = facilities.reduce(
        (sum, facility) => sum + facility.totalUnits,
        0
    );

    const rentedUnits = facilities.reduce(
        (sum, facility) => sum + facility.rentedUnits,
        0
    );

    const utilization =
        totalUnits > 0
            ? Math.round((rentedUnits / totalUnits) * 100)
            : 0;

    return (
        <div className="business-dashboard">

            <div className="business-welcome">

                <div>
                    <h2>
                        Xin chào, Business Manager 👋
                    </h2>

                    <p>
                        Đây là tổng quan hoạt động kinh doanh của hệ thống.
                    </p>
                </div>

                <div className="business-date">📅 {new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" })}</div>

            </div>

            <div className="business-kpi-grid">

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">
                            🏢
                        </span>

                        <span className="business-kpi-label">
                            Tổng cơ sở
                        </span>
                    </div>

                    <div className="business-kpi-value">
                        {facilities.length}
                    </div>

                    <div className="business-kpi-description">
                        Cơ sở đang quản lý
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">
                            📦
                        </span>

                        <span className="business-kpi-label">
                            Tổng kho
                        </span>
                    </div>

                    <div className="business-kpi-value">
                        {totalUnits}
                    </div>

                    <div className="business-kpi-description">
                        Kho trong toàn hệ thống
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">
                            🔑
                        </span>

                        <span className="business-kpi-label">
                            Kho đang thuê
                        </span>
                    </div>

                    <div className="business-kpi-value">
                        {rentedUnits}
                    </div>

                    <div className="business-kpi-description">
                        {utilization}% công suất sử dụng
                    </div>
                </div>

                <div className="business-kpi-card">
                    <div className="business-kpi-top">
                        <span className="business-kpi-icon">
                            💰
                        </span>

                        <span className="business-kpi-label">
                            Doanh thu tháng
                        </span>
                    </div>

                    <div className="business-kpi-value">
                        428M
                    </div>

                    <div className="business-kpi-description">
                        +12.5% so với tháng trước
                    </div>
                </div>

            </div>

            <div className="business-dashboard-grid">

                <div className="business-panel">

                    <div className="business-panel-header">

                        <div>
                            <h3>
                                Doanh thu
                            </h3>

                            <p>
                                Doanh thu trong 6 tháng gần nhất
                            </p>
                        </div>

                        <select className="business-select">
                            <option>6 tháng</option>
                            <option>12 tháng</option>
                            <option>Năm 2026</option>
                        </select>

                    </div>

                    <div className="business-chart">

                        <div className="chart-y-axis">
                            <span>500M</span>
                            <span>400M</span>
                            <span>300M</span>
                            <span>200M</span>
                            <span>100M</span>
                            <span>0</span>
                        </div>

                        <div className="chart-area">

                            <div className="chart-grid-line"></div>
                            <div className="chart-grid-line"></div>
                            <div className="chart-grid-line"></div>
                            <div className="chart-grid-line"></div>
                            <div className="chart-grid-line"></div>

                            <div className="chart-bars">

                                <div className="chart-column">
                                    <div
                                        className="chart-bar bo-dashboard-box-01"
                                    ></div>
                                    <span>May</span>
                                </div>

                                <div className="chart-column">
                                    <div
                                        className="chart-bar bo-dashboard-box-02"
                                    ></div>
                                    <span>Jun</span>
                                </div>

                                <div className="chart-column">
                                    <div
                                        className="chart-bar bo-dashboard-box-03"
                                    ></div>
                                    <span>Jul</span>
                                </div>

                                <div className="chart-column">
                                    <div
                                        className="chart-bar bo-dashboard-box-04"
                                    ></div>
                                    <span>Aug</span>
                                </div>

                                <div className="chart-column">
                                    <div
                                        className="chart-bar bo-dashboard-box-05"
                                    ></div>
                                    <span>Sep</span>
                                </div>

                                <div className="chart-column">
                                    <div
                                        className="chart-bar active bo-dashboard-box-06"
                                    ></div>
                                    <span>Oct</span>
                                </div>

                            </div>

                        </div>

                    </div>

                </div>

                <div className="business-panel">

                    <div className="business-panel-header">

                        <div>
                            <h3>
                                Công suất kho
                            </h3>

                            <p>
                                Tình trạng sử dụng hiện tại
                            </p>
                        </div>

                    </div>

                    <div className="utilization-content">

                        <div className="utilization-circle">

                            <div>
                                <strong>
                                    {utilization}%
                                </strong>

                                <span>
                                    Đang thuê
                                </span>
                            </div>

                        </div>

                        <div className="utilization-info">

                            <div className="utilization-row">
                                <span>Đang thuê</span>
                                <strong>{rentedUnits}</strong>
                            </div>

                            <div className="utilization-row">
                                <span>Còn trống</span>
                                <strong>{totalUnits - rentedUnits}</strong>
                            </div>

                            <div className="utilization-row">
                                <span>Bảo trì</span>
                                <strong>
                                    {facilities.reduce(
                                        (sum, facility) =>
                                            sum + facility.maintenanceUnits,
                                        0
                                    )}
                                </strong>
                            </div>

                        </div>

                    </div>

                </div>

            </div>

            <div className="business-panel">

                <div className="business-panel-header">

                    <div>
                        <h3>
                            Hiệu suất cơ sở
                        </h3>

                        <p>
                            Theo dõi tình trạng hoạt động của từng cơ sở
                        </p>
                    </div>

                </div>

                <div className="facility-table">

                    <div className="facility-table-header">
                        <span>Cơ sở</span>
                        <span>Tổng kho</span>
                        <span>Đang thuê</span>
                        <span>Công suất</span>
                        <span>Trạng thái</span>
                    </div>

                    {facilities.map((facility) => {

                        const facilityUtilization =
                            facility.totalUnits > 0
                                ? Math.round(
                                    (facility.rentedUnits /
                                        facility.totalUnits) *
                                    100
                                )
                                : 0;

                        return (
                            <div
                                className="facility-table-row"
                                key={facility.id}
                            >
                                <span>
                                    {facility.name}
                                </span>

                                <span>
                                    {facility.totalUnits}
                                </span>

                                <span>
                                    {facility.rentedUnits}
                                </span>

                                <span>
                                    {facilityUtilization}%
                                </span>

                                <span
                                    className={
                                        facility.status === "active"
                                            ? "status-active"
                                            : "status-warning"
                                    }
                                >
                                    {facility.status === "active"
                                        ? "Đang hoạt động"
                                        : "Tạm ngưng"}
                                </span>
                            </div>
                        );
                    })}

                </div>

            </div>

            <div className="business-panel">

                <div className="business-panel-header">

                    <div>
                        <h3>
                            Cần chú ý
                        </h3>

                        <p>
                            Các vấn đề Business Operations nên kiểm tra
                        </p>
                    </div>

                </div>

                <div className="business-alert-list">

                    <div className="business-alert">

                        <div className="business-alert-icon warning">
                            ⚠️
                        </div>

                        <div>
                            <strong>
                                Kiểm tra các cơ sở có công suất thấp
                            </strong>

                            <p>
                                Business Operations có thể theo dõi và điều chỉnh
                                giá hoặc chính sách kinh doanh.
                            </p>
                        </div>

                        <button>
                            Kiểm tra
                        </button>

                    </div>

                    <div className="business-alert">

                        <div className="business-alert-icon">
                            💰
                        </div>

                        <div>
                            <strong>
                                Có giao dịch cần theo dõi
                            </strong>

                            <p>
                                Kiểm tra trạng thái thanh toán trong hệ thống.
                            </p>
                        </div>

                        <button>
                            Xem
                        </button>

                    </div>

                    <div className="business-alert">

                        <div className="business-alert-icon">
                            📦
                        </div>

                        <div>
                            <strong>
                                Kho đang bảo trì
                            </strong>

                            <p>
                                Theo dõi tình trạng kho và thời gian dự kiến
                                hoạt động trở lại.
                            </p>
                        </div>

                        <button>
                            Xem
                        </button>

                    </div>

                </div>

            </div>

        </div>
    );
}
export default BusinessOperations;
