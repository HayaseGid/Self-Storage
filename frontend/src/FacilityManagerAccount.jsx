import React, { useState, useEffect, useMemo } from 'react'
import './styles.css'
import './fmanagerstyles.css'
import { apiGet, apiPost, apiPut } from './api'
import { mapOperationsState } from './operationsState'

/* Formatters */
const fmtMoney = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + 'đ'
const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')
const pad = (n) => String(n).padStart(2, '0')
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const RES_STATUS_MAP = {
  PENDING_PAYMENT: { label: 'Chờ trả cọc', tone: 'warn' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận cọc', tone: 'warn' },
  PENDING_APPROVAL: { label: 'Chờ Manager duyệt', tone: 'info' },
  CONFIRMED: { label: 'Đã phân kho', tone: 'info' },
  HANDED_OVER: { label: 'Đã bàn giao', tone: 'ok' }
}

const UNIT_STATUS_MAP = {
  AVAILABLE: { label: 'Còn trống', tone: 'ok' },
  RESERVED: { label: 'Đã giữ chỗ', tone: 'info' },
  RENTED: { label: 'Đang thuê', tone: 'ok' },
  NEEDS_INSPECTION: { label: 'Cần kiểm tra', tone: 'warn' },
  MAINTENANCE: { label: 'Bảo trì', tone: 'warn' }
}

const PAY_STATUS_MAP = {
  PENDING: { label: 'Chưa thanh toán', tone: 'warn' },
  PENDING_CONFIRMATION: { label: 'Chờ xác nhận', tone: 'warn' },
  PAID: { label: 'Đã thanh toán cọc', tone: 'ok' }
}

/* Badge Component */
function Badge({ map, value }) {
  const item = map[value] || { label: value, tone: 'info' }
  return <span className={`fm-badge fm-${item.tone}`}>{item.label}</span>
}

/* Modal Tạo/Chỉnh Sửa Kho */
function UnitFormModal({ facilityId, unitCodePrefix, editingUnit, onClose, onSave, unitTypes, unitSizes }) {
  const currentType = unitTypes.find(item => item.name === editingUnit?.type)
  const currentSize = unitSizes.find(item => item.dimensions === editingUnit?.size)
  const [typeId, setTypeId] = useState(String(editingUnit?.unitTypeId ?? currentType?.unitTypeId ?? unitTypes[0]?.unitTypeId ?? ''))
  const [sizeId, setSizeId] = useState(String(editingUnit?.unitSizeId ?? editingUnit?.sizeId ?? currentSize?.unitSizeId ?? unitSizes[0]?.unitSizeId ?? ''))
  const [pricePerMonth, setPricePerMonth] = useState(editingUnit ? editingUnit.pricePerMonth : '')
  const [status, setStatus] = useState(editingUnit ? editingUnit.status : 'AVAILABLE')
  const [error, setError] = useState('')
  const selectedType = unitTypes.find(item => String(item.unitTypeId) === typeId)
  const selectedSize = unitSizes.find(item => String(item.unitSizeId) === sizeId)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!selectedType || !selectedSize) return setError('Vui lòng chọn loại và kích thước kho hợp lệ.')
    if (!Number.isFinite(Number(pricePerMonth)) || Number(pricePerMonth) <= 0) return setError('Giá thuê phải lớn hơn 0.')
    onSave({
      facilityId,
      type: selectedType.name,
      unitTypeId: selectedType.unitTypeId,
      size: selectedSize.dimensions,
      unitSizeId: selectedSize.unitSizeId,
      sizeM2: selectedSize.volume,
      pricePerMonth: Number(pricePerMonth),
      status
    })
  }

  return (
    <div className="fm-modal-overlay">
      <div className="fm-modal-card">
        <div className="fm-modal-header">
          <h2>{editingUnit ? `Chỉnh sửa kho ${editingUnit.id}` : 'Tạo kho mới'}</h2>
          <button type="button" className="fm-modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="fm-modal-form">
          {error && <div className="auth-message error">{error}</div>}
          {!editingUnit && (
            <p className="fm-form-hint">
              Mã kho sẽ được hệ thống tự động tạo theo mã chi nhánh {unitCodePrefix}-U.
            </p>
          )}

          <div className="fm-form-row">
            <label>
              Loại kho
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                {unitTypes.map(item => <option key={item.unitTypeId} value={item.unitTypeId}>{item.name}</option>)}
              </select>
            </label>

            <label>
              Size
              <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} required>
                {unitSizes.map(item => <option key={item.unitSizeId} value={item.unitSizeId}>{item.dimensions}</option>)}
              </select>
            </label>
          </div>

          <div className="fm-form-row">
            <label>
              Giá thuê (VNĐ/tháng)
              <input
                type="number"
                step="50000"
                value={pricePerMonth}
                onChange={(e) => setPricePerMonth(e.target.value)}
                required
              />
            </label>

            <label>
              Trạng thái
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="AVAILABLE">Còn trống</option>
                <option value="RESERVED">Đã giữ chỗ</option>
                <option value="RENTED">Đang thuê</option>
                <option value="MAINTENANCE">Bảo trì</option>
              </select>
            </label>
          </div>

          <div className="fm-modal-actions">
            <button type="button" className="dashboard-secondary-btn" onClick={onClose}>Hủy</button>
            <button type="submit" className="dashboard-primary-btn">Lưu kho</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* =========================================================
   MAIN DASHBOARD COMPONENT
   ========================================================= */
export default function FacilityManagerDashboard({ embedded = false, currentUser = null, navigate = null, currentUserKey = 'storespace_current_user' }) {
  const [db, setDb] = useState({ facilities: [], units: [], reservations: [], contracts: [], staff: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [query, setQuery] = useState('')
  const [editingUnit, setEditingUnit] = useState(null)
  const [showUnitModal, setShowUnitModal] = useState(false)
  const [selectedResId, setSelectedResId] = useState(null)
  const [selectedUnitForAssign, setSelectedUnitForAssign] = useState('')

  const manager = currentUser
  const loadState = async () => {
    if (!manager?.email) {
      setError('Phiên đăng nhập không có email Facility Manager.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await apiGet(`/api/operations/state?email=${encodeURIComponent(manager.email)}`)
      const mapped = mapOperationsState(data)
      setDb(mapped)
      if (!mapped.facilities.length) setError('Tài khoản chưa được gán cơ sở trong database.')
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadState()
  }, [manager?.email])

  const managedFacility = db.facilities.find(facility =>
    facility.managerEmail?.toLowerCase() === manager?.email?.toLowerCase()
  ) || db.facilities[0]
  const facilityName = managedFacility?.name || 'Chưa được gán cơ sở'

  /* Dữ liệu đã lọc theo Cơ sở của Manager */
  const facilityUnits = useMemo(() => db.units.filter(u => u.facilityId === facilityName), [db, facilityName])
  const facilityReservations = useMemo(() => db.reservations.filter(r => r.facilityId === facilityName), [db, facilityName])
  const facilityContracts = useMemo(() => db.contracts.filter(c => c.facilityId === facilityName), [db, facilityName])

  /* Thống kê Báo cáo (Reports & Analytics) */
  const stats = useMemo(() => {
    const totalUnits = facilityUnits.length
    const rentedUnits = facilityUnits.filter(u => u.status === 'RENTED').length
    const reservedUnits = facilityUnits.filter(u => u.status === 'RESERVED').length
    const availableUnits = facilityUnits.filter(u => u.status === 'AVAILABLE').length
    const occupancyRate = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0

    const totalRevenue = facilityReservations
      .filter(r => r.status === 'HANDED_OVER' && r.paymentStatus === 'PAID')
      .reduce((sum, r) => sum + (r.rentalFee || 0), 0)

    const pendingApprovals = facilityReservations.filter(r => r.status === 'PENDING_APPROVAL').length

    return { totalUnits, rentedUnits, reservedUnits, availableUnits, occupancyRate, totalRevenue, pendingApprovals }
  }, [facilityUnits, facilityReservations])

  /* Xử lý Cập nhật DB */
  const handleApproveAndAssign = async (resId, unitId) => {
    if (!unitId) {
      setError('Vui lòng chọn một kho trống để phân bổ.')
      return
    }
    setError('')
    try {
      await apiPost(`/api/operations/reservations/${resId}/assign`, { unitNumber: unitId })
      await loadState()
      setSelectedResId(null)
      setSelectedUnitForAssign('')
    } catch (actionError) {
      setError(actionError.message)
    }
  }

  const handleSaveUnit = async (unitData) => {
    const request = {
      facilityID: managedFacility?.facilityId,
      unitTypeID: unitData.unitTypeId,
      unitSizeID: unitData.unitSizeId,
      unitType: unitData.type,
      size: unitData.size,
      sizeM2: unitData.sizeM2 ?? undefined,
      basePrice: Number(unitData.pricePerMonth),
      status: unitData.status
    }
    if (!Number.isInteger(request.facilityID) || !request.unitTypeID || !request.unitSizeID) {
      setError('Thiếu cơ sở, loại kho hoặc size hợp lệ từ database. Hãy tải lại dữ liệu.')
      return
    }
    setError('')
    try {
      const editing = Boolean(editingUnit)
      if (editing) {
        await apiPut(`/api/operations/units/${encodeURIComponent(editingUnit.id)}`, request)
      } else {
        await apiPost('/api/operations/units', request)
      }
      await loadState()
      setShowUnitModal(false)
      setEditingUnit(null)
    } catch (actionError) {
      setError(actionError.message)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(currentUserKey)
    navigate?.('/')
  }

  const pendingList = facilityReservations.filter(r => r.status === 'PENDING_APPROVAL')
  const staffList = db.staff.filter(staff => staff.facilityId === facilityName)

  if (loading) return <div className="customer-main" style={{ padding: 32 }}>Đang tải dữ liệu cơ sở từ backend...</div>
  if (error && !db.facilities.length) {
    return <main className="customer-main" style={{ padding: 32 }}>
      <div className="auth-message error" role="alert">{error}</div>
      <button className="dashboard-primary-btn" type="button" onClick={loadState}>Thử lại</button>
    </main>
  }
  const managerName = manager?.name || manager?.fullName || 'Facility Manager'

  return (
    <div className="customer-layout fm-root">
      {/* SIDEBAR */}
      <aside className="customer-sidebar">
        <div className="customer-brand">
          <span className="brand-mark">S</span>
          <div>
            <strong>StoreSpace</strong>
            <small>Manager Portal</small>
          </div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">
            {managerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <strong>{managerName}</strong>
            <small>Facility Manager</small>
          </div>
        </div>

        <nav className="customer-nav">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            <span>⌂</span> Tổng quan & Báo cáo
          </button>
          <button className={activeTab === 'approvals' ? 'active' : ''} onClick={() => setActiveTab('approvals')}>
            <span>◷</span> Xét duyệt đặt chỗ {stats.pendingApprovals > 0 && <span className="fm-count-badge">{stats.pendingApprovals}</span>}
          </button>
          <button className={activeTab === 'units' ? 'active' : ''} onClick={() => setActiveTab('units')}>
            <span>▣</span> Quản lý kho cơ sở
          </button>
          <button className={activeTab === 'contracts' ? 'active' : ''} onClick={() => setActiveTab('contracts')}>
            <span>▤</span> Hợp đồng & Khách hàng
          </button>
          <button className={activeTab === 'staff' ? 'active' : ''} onClick={() => setActiveTab('staff')}>
            <span>👥</span> Nhân sự tại cơ sở
          </button>
        </nav>

        <div className="customer-sidebar-bottom">
          <button onClick={handleLogout}>
            <span>↪</span> Đăng xuất
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="customer-main">
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {/* TOPBAR */}
        <div className="customer-topbar">
          <div>
            <span className="customer-eyebrow">FACILITY MANAGER · {facilityName.toUpperCase()}</span>
            <h1>
              {activeTab === 'overview' && 'Tổng quan & Báo cáo cơ sở'}
              {activeTab === 'approvals' && 'Xét duyệt & Phân bổ kho'}
              {activeTab === 'units' && 'Danh mục kho tại cơ sở'}
              {activeTab === 'contracts' && 'Giám sát hợp đồng thuê'}
              {activeTab === 'staff' && 'Phân công nhân viên cơ sở'}
            </h1>
            <p>Quản lý vận hành, xét duyệt đặt kho và giám sát doanh thu cơ sở {facilityName}.</p>
          </div>
          <div className="fm-facility-chip">
            📍 <strong>{facilityName}</strong>
          </div>
        </div>

        {/* TAB 1: OVERVIEW & REPORTS */}
        {activeTab === 'overview' && (
          <div className="overview-page">
            <section className="customer-stats">
              <div className="customer-stat-card">
                <span className="stat-icon blue">▣</span>
                <small>Tổng số kho</small>
                <strong>{stats.totalUnits}</strong>
                <span className="stat-note">Tại {facilityName}</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">📈</span>
                <small>Tỷ lệ lấp đầy</small>
                <strong>{stats.occupancyRate}%</strong>
                <span className="stat-note">{stats.rentedUnits} kho đang thuê</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon yellow">⏳</span>
                <small>Chờ duyệt & Phân kho</small>
                <strong>{stats.pendingApprovals}</strong>
                <span className="stat-note warning">Đơn đã đóng cọc</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon blue">₫</span>
                <small>Doanh thu ghi nhận</small>
                <strong>{fmtMoney(stats.totalRevenue)}</strong>
                <span className="stat-note">Hợp đồng đã bàn giao</span>
              </div>
            </section>

            {/* BÁO CÁO NHANH TRẠNG THÁI KHO */}
            <section className="overview-panel">
              <div className="overview-panel-heading">
                <div>
                  <span className="customer-eyebrow">FACILITY OCCUPANCY</span>
                  <h2>Báo cáo trạng thái kho cơ sở</h2>
                </div>
              </div>

              <div className="fm-progress-bar-container">
                <div className="fm-progress-bar">
                  <div className="fm-bar-rented" style={{ width: `${(stats.rentedUnits / (stats.totalUnits || 1)) * 100}%` }} title="Đang thuê" />
                  <div className="fm-bar-reserved" style={{ width: `${(stats.reservedUnits / (stats.totalUnits || 1)) * 100}%` }} title="Đã giữ chỗ" />
                  <div className="fm-bar-available" style={{ width: `${(stats.availableUnits / (stats.totalUnits || 1)) * 100}%` }} title="Còn trống" />
                </div>
                <div className="fm-progress-legend">
                  <span><i className="dot rented" /> Đang thuê ({stats.rentedUnits})</span>
                  <span><i className="dot reserved" /> Đã giữ chỗ ({stats.reservedUnits})</span>
                  <span><i className="dot available" /> Còn trống ({stats.availableUnits})</span>
                </div>
              </div>
            </section>

            {/* CẦN XỬ LÝ NGAY */}
            {pendingList.length > 0 && (
              <section className="overview-panel">
                <div className="overview-panel-heading">
                  <div>
                    <span className="customer-eyebrow">ACTION REQUIRED</span>
                    <h2>Đơn đặt kho chờ bạn xét duyệt ({pendingList.length})</h2>
                  </div>
                  <button className="overview-text-button" onClick={() => setActiveTab('approvals')}>Xem tất cả →</button>
                </div>

                <div className="fm-pending-mini-list">
                  {pendingList.map(r => (
                    <div key={r.id} className="fm-pending-mini-item">
                      <div>
                        <strong>{r.customerName}</strong>
                        <small>{r.id} · {r.unitType} · Thuê {r.months} tháng</small>
                      </div>
                      <div className="fm-item-right">
                        <span className="fm-amount">{fmtMoney(r.deposit)} (Đã cọc)</span>
                        <button className="dashboard-primary-btn" onClick={() => setActiveTab('approvals')}>Duyệt ngay</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 2: XÉT DUYỆT & PHÂN KHO */}
        {activeTab === 'approvals' && (
          <div className="fm-section-card">
            <div className="fm-card-header">
              <h2>Đơn đặt kho chờ duyệt & Phân kho cụ thể</h2>
              <p>Khách hàng đã thanh toán 20% tiền cọc. Hãy đối chiếu và chọn kho cụ thể còn trống để phân bổ.</p>
            </div>

            {pendingList.length === 0 ? (
              <div className="empty-state">Hiện không có đơn đặt kho nào đang chờ xét duyệt.</div>
            ) : (
              <div className="fm-approval-grid">
                {pendingList.map(res => {
                  const availableUnitsForType = facilityUnits.filter(u => u.status === 'AVAILABLE' && u.type.includes(res.unitType.split(' ')[0]))
                  const isSelected = selectedResId === res.id

                  return (
                    <div key={res.id} className="fm-approval-card">
                      <div className="fm-approval-head">
                        <div>
                          <span className="customer-eyebrow">MÃ ĐẶT CHỖ: {res.id}</span>
                          <h3>{res.customerName}</h3>
                          <p>✉ {res.customerEmail}</p>
                        </div>
                        <Badge map={RES_STATUS_MAP} value={res.status} />
                      </div>

                      <div className="rental-info-grid">
                        <div>
                          <small>Loại kho yêu cầu</small>
                          <strong>{res.unitType}</strong>
                        </div>
                        <div>
                          <small>Kho khách chọn</small>
                          <strong>{res.unitId || 'Tự động'}</strong>
                        </div>
                        <div>
                          <small>Ngày bắt đầu</small>
                          <strong>{fmtDate(res.startDate)}</strong>
                        </div>
                        <div>
                          <small>Thời gian thuê</small>
                          <strong>{res.months} tháng</strong>
                        </div>
                        <div>
                          <small>Tiền cọc 20%</small>
                          <strong className="available-text">{fmtMoney(res.deposit)}</strong>
                        </div>
                        <div>
                          <small>Tổng giá trị</small>
                          <strong>{fmtMoney(res.rentalFee)}</strong>
                        </div>
                      </div>

                      <div className="fm-assign-box">
                        <label><strong>Chọn kho cụ thể tại {facilityName} để gán:</strong></label>
                        <select
                          className="fm-input"
                          value={isSelected ? selectedUnitForAssign : (res.assignedUnitId || res.unitId || '')}
                          onChange={(e) => {
                            setSelectedResId(res.id)
                            setSelectedUnitForAssign(e.target.value)
                          }}
                        >
                          <option value="">-- Chọn kho phù hợp --</option>
                          {facilityUnits.filter(u => u.status === 'AVAILABLE' || u.id === (res.assignedUnitId || res.unitId)).map(u => (
                            <option key={u.id} value={u.id}>
                              {u.id} - {u.type} ({u.size}) - {fmtMoney(u.pricePerMonth)}/tháng
                            </option>
                          ))}
                        </select>

                        <div className="fm-actions-row">
                          <button
                            className="dashboard-primary-btn"
                            onClick={() => handleApproveAndAssign(res.id, isSelected ? selectedUnitForAssign : (res.assignedUnitId || res.unitId))}
                          >
                            ✓ Duyệt đơn & Phân gán kho
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: QUẢN LÝ KHO CƠ SỞ */}
        {activeTab === 'units' && (
          <div className="fm-section-card">
            <div className="fm-card-header-flex">
              <div>
                <h2>Danh mục kho tại {facilityName}</h2>
                <p>Thêm mới, điều chỉnh giá và cập nhật trạng thái kho trực thuộc cơ sở.</p>
              </div>
              <button className="dashboard-primary-btn" onClick={() => { setEditingUnit(null); setShowUnitModal(true) }}>
                + Tạo kho mới
              </button>
            </div>

            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Mã kho</th>
                    <th>Loại kho</th>
                    <th>Size</th>
                    <th>Giá thuê / tháng</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {facilityUnits.map(unit => (
                    <tr key={unit.id}>
                      <td><strong>{unit.id}</strong></td>
                      <td>{unit.type}</td>
                      <td>{unit.size}</td>
                      <td><strong>{fmtMoney(unit.pricePerMonth)}</strong></td>
                      <td><Badge map={UNIT_STATUS_MAP} value={unit.status} /></td>
                      <td>
                        <button
                          className="dashboard-secondary-btn sm"
                          onClick={() => { setEditingUnit(unit); setShowUnitModal(true) }}
                        >
                          Sửa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: HỢP ĐỒNG & KHÁCH HÀNG */}
        {activeTab === 'contracts' && (
          <div className="fm-section-card">
            <div className="fm-card-header">
              <h2>Hợp đồng thuê đang hoạt động tại {facilityName}</h2>
              <p>Giám sát thời hạn hợp đồng, mã truy cập và nghĩa vụ thanh toán của khách hàng.</p>
            </div>

            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Mã HĐ</th>
                    <th>Khách hàng</th>
                    <th>Kho</th>
                    <th>Ngày bắt đầu</th>
                    <th>Ngày kết thúc</th>
                    <th>Thông tin ra vào</th>
                    <th>Thanh toán</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {facilityContracts.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center">Chưa có hợp đồng nào được khởi tạo tại cơ sở này.</td>
                    </tr>
                  ) : (
                    facilityContracts.map(c => {
                      // Hợp đồng nối với đặt chỗ gốc qua mã đặt chỗ (hoặc mã hợp đồng ghi trên đặt chỗ)
                      const r = db.reservations.find(x =>
                        String(x.contractId ?? '') === String(c.id) ||
                        (c.reservationId != null && String(x.id) === String(c.reservationId)))
                      const expired = String(c.endDate).slice(0, 10) < todayStr()
                      return (
                        <tr key={c.id}>
                          <td><strong>{c.id}</strong></td>
                          <td>{c.customerName}</td>
                          <td><span className="fm-tag-blue">{c.unitId}</span></td>
                          <td>{fmtDate(c.startDate)}</td>
                          <td>{fmtDate(c.endDate)}</td>
                          <td><code>{c.accessType}: {c.accessValue}</code></td>
                          <td>{r ? <Badge map={PAY_STATUS_MAP} value={r.paymentStatus} /> : '—'}</td>
                          <td>
                            {expired
                              ? <span className="fm-badge fm-warn">Đã hết hạn</span>
                              : <span className="fm-badge fm-ok">Đang hiệu lực</span>}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: PHÂN CÔNG NHÂN VIÊN */}
        {activeTab === 'staff' && (
          <div className="fm-section-card">
            <div className="fm-card-header">
              <h2>Đội ngũ Facility Staff tại {facilityName}</h2>
              <p>Danh sách nhân viên vận hành phụ trách kiểm tra kho và hỗ trợ check-in bàn giao cho khách.</p>
            </div>

            <div className="fm-staff-grid">
              {staffList.map(st => (
                <div key={st.id} className="fm-staff-card">
                  <div className="fm-staff-avatar">{st.fullName.charAt(0)}</div>
                  <div className="fm-staff-info">
                    <h3>{st.fullName}</h3>
                    <p>✉ {st.email}</p>
                    <p>📞 —</p>
                    <div className="fm-shift-tag">Trạng thái: {st.status}</div>
                  </div>
                  <div className="fm-staff-status">
                    <span className="fm-badge fm-ok">Đang làm việc</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL TẠO/SỬA KHO */}
      {showUnitModal && (
        <UnitFormModal
          key={editingUnit?.id || 'new-unit'}
          facilityId={facilityName}
          unitCodePrefix={managedFacility?.unitCodePrefix}
          editingUnit={editingUnit}
          onClose={() => setShowUnitModal(false)}
          onSave={handleSaveUnit}
          unitTypes={db.unitTypes}
          unitSizes={db.unitSizes}
        />
      )}
    </div>
  )
}
