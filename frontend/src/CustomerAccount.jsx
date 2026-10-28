// ============================================================
// CUSTOMER ACCOUNT / CUSTOMER DASHBOARD
// ============================================================
// NOTE:
// - Class names are intentionally kept 100% the same as the original file.
// - Only the customer-related components were moved here.
// - Shared data/functions are received from App.jsx via props.

import React, { useEffect, useState } from 'react'
import ContractModal from './ContractModal'
import { apiGet, apiPost } from './api'
import { formatSignedAt } from './contractSignatures'

function MyStoragePage({ customerRental, customerRentals, facilities }) {
  const [selectedRental, setSelectedRental] = useState(null)
  
  // Đã cập nhật: Hiển thị nhiều kho (kho Staff vừa bàn giao + Kho mẫu)
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(Boolean)
    : customerRental
      ? [customerRental]
      : []
  //Đã thêm: 05/10/2026

  return (
    <div className="customer-content-page">

      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">
            MY STORAGE
          </span>

          <h1>Kho của tôi</h1>

          <p>Thông tin đặt chỗ và kho của bạn từ hệ thống StoreSpace.</p>
        </div>

        <span className="page-count">
          {rentals.filter(rental => rental.status === 'Handed Over').length} kho đang thuê
        </span>
      </div>

      {rentals.length === 0 && <div className="empty-state">Bạn chưa có đặt chỗ hoặc kho thuê nào.</div>}
      {rentals.map(rental => ( //Map duyệt qua tất cả các kho trong mảng rentals
        <div key={rental.reservationId || rental.contractId || rental.unitId} style={{ marginBottom: 28 }}>
          <div className="my-storage-card">

            <div className="storage-card-image">
              <img
                src={
                  facilities.find(
                    (item) => item.name === rental.facility
                  )?.image
                }
                alt={rental.facility}
              />
            </div>

            <div className="storage-card-content">

              <div className="storage-card-heading">
                <div>
                  <span className="storage-facility-name">
                    {rental.facility}
                  </span>

                  <h2>{rental.unitId || 'Chưa phân kho'}</h2>

                  <p>
                    {rental.type} · {rental.size}
                  </p>
                </div>

                <span className="storage-status">
                  ● {rental.statusLabel}
                </span>
              </div>

              <div className="storage-info-grid">

                <div>
                  <small>Ngày bắt đầu</small>
                  <strong>{rental.startDate}</strong>
                </div>

                <div>
                  <small>Ngày kết thúc</small>
                  <strong>{rental.endDate}</strong>
                </div>

                <div>
                  <small>Giá thuê</small>
                  <strong>{rental.price}</strong>
                </div>

                {rental.status === 'Handed Over' && <div>
                  <small>Còn lại</small>
                  <strong>
                    {rental.remainingDays} ngày
                  </strong>
                </div>}

              </div>

              <div className="storage-progress">

                <div className="storage-progress-header">
                  <span>Thời hạn thuê</span>
                  <strong>{rental.progress}%</strong>
                </div>

                <div className="rental-progress">
                  <div
                    style={{
                      width: `${rental.progress}%`
                    }}
                  />
                </div>

              </div>

              <div className="storage-actions">

                <button
                  type="button"
                  className="dashboard-primary-btn"
                  onClick={() => setSelectedRental(rental)}
                >
                  Xem chi tiết
                </button>

                <button className="dashboard-secondary-btn" type="button" disabled>
                  Gia hạn (chưa hỗ trợ)
                </button>

              </div>

            </div>

          </div>

          <div className="storage-summary-grid">

            <div className="customer-info-card">
              <span className="customer-eyebrow">
                ACCESS
              </span>

              <h2>Quyền truy cập</h2>

              <div className="access-code">
                <span>{rental.accessType || 'Chưa được bàn giao'}</span>
                <strong>{rental.accessValue || '—'}</strong>
              </div>

              <p>
                Mã truy cập được dùng để vào khu vực kho
                của bạn.
              </p>
            </div>

            <div className="customer-info-card">
              <span className="customer-eyebrow">
                LOCATION
              </span>

              <h2>Vị trí kho</h2>

              <div className="location-detail">
                <strong>{rental.facility}</strong>
                <span>{(facilities.find(item => item.name === rental.facility) || {}).location || '—'}</span>
                {rental.location && <span>{rental.location}</span>}
              </div>
            </div>

          </div>

        </div>
      ))}

      {selectedRental && (
        <div
          onClick={() => setSelectedRental(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(7, 30, 55, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            overflowY: 'auto'
          }}
        >
          <div
            className="overview-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 760,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: 18,
              padding: 28,
              margin: 'auto'
            }}
          >
            <div className="overview-panel-heading">
              <div>
                <span className="customer-eyebrow">
                  STORAGE DETAILS
                </span>

                <h2>Chi tiết kho lưu trữ</h2>

                <p>
                  Thông tin chi tiết về kho bạn đang thuê tại StoreSpace.
                </p>
              </div>

              <button
                type="button"
                className="dashboard-secondary-btn"
                onClick={() => setSelectedRental(null)}
              >
                ✕ Đóng
              </button>
            </div>

            {/* THÔNG TIN CƠ SỞ */}
            <div
              style={{
                padding: 20,
                background: '#f2f7fc',
                borderRadius: 14,
                marginTop: 20
              }}
            >
              <span className="customer-eyebrow">
                FACILITY INFORMATION
              </span>

              <h2 style={{ margin: '10px 0' }}>
                {selectedRental.facility || 'Chưa cập nhật cơ sở'}
              </h2>

              <p>
                Địa chỉ:
                {' '}
                {(facilities.find(
                  item => item.name === selectedRental.facility
                ) || {}).location || 'TP. Hồ Chí Minh'}
              </p>

              <p>
                Vị trí kho: Tầng 1 · Khu A
              </p>
            </div>

            {/* THÔNG TIN ĐƠN VỊ KHO */}
            <section style={{ marginTop: 24 }}>
              <h3>Thông tin đơn vị kho</h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 16,
                  marginTop: 16
                }}
              >
                {[
                  ['Mã kho', selectedRental.unitId || 'Chưa phân kho'],
                  ['Loại kho', selectedRental.type],
                  ['Diện tích / kích thước', selectedRental.size],
                  ['Giá thuê', selectedRental.price],
                  ['Ngày bắt đầu', selectedRental.startDate],
                  ['Ngày kết thúc', selectedRental.endDate],
                  ['Thời gian còn lại', `${selectedRental.remainingDays ?? '—'} ngày`],
                  ['Tiến độ thời hạn', `${selectedRental.progress ?? 0}%`]
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      padding: 16,
                      border: '1px solid #e2e8f0',
                      borderRadius: 12
                    }}
                  >
                    <small style={{ color: '#64748b' }}>
                      {label}
                    </small>

                    <p
                      style={{
                        fontWeight: 700,
                        color: '#073d70',
                        margin: '8px 0 0',
                        overflowWrap: 'anywhere'
                      }}
                    >
                      {value || 'Chưa cập nhật'}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* QUYỀN TRUY CẬP */}
            <section style={{ marginTop: 24 }}>
              <h3>Quyền truy cập kho</h3>

              <div
                style={{
                  padding: 18,
                  borderRadius: 12,
                  background: '#f8fafc',
                  marginTop: 12
                }}
              >
                <p>
                  <strong>Hình thức truy cập: </strong>
                  {selectedRental.accessType || 'Chưa được bàn giao'}
                </p>

                <p>
                  <strong>Mã truy cập: </strong>
                  {selectedRental.accessValue || 'Chưa được bàn giao'}
                </p>

                <p style={{ color: '#64748b', fontSize: 14 }}>
                  Sử dụng thông tin truy cập được nhân viên bàn giao
                  để vào khu vực kho.
                </p>
              </div>
            </section>

            {/* THÔNG TIN HỢP ĐỒNG */}
            <section style={{ marginTop: 24 }}>
              <h3>Thông tin hợp đồng</h3>

              <div
                style={{
                  padding: 18,
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  marginTop: 12
                }}
              >
                <p>
                  <strong>Mã hợp đồng: </strong>
                  {selectedRental.contractId ||
                    `SS-${selectedRental.unitId || 'N/A'}`}
                </p>

                <p>
                  <strong>Trạng thái: </strong>
                  <span style={{ fontWeight: 700 }}>
                    {selectedRental.contractStatus || selectedRental.statusLabel}
                  </span>
                </p>

                <p>
                  <strong>Ngày kết thúc hợp đồng: </strong>
                  {selectedRental.endDate || 'Chưa cập nhật'}
                </p>
              </div>
            </section>

            <button
              type="button"
              className="dashboard-primary-btn full"
              style={{ marginTop: 24 }}
              onClick={() => setSelectedRental(null)}
            >
              Hoàn tất
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function DatePicker({ value, onChange }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Ngày nhận kho không được cách ngày đặt kho quá 30 ngày.
  const maxBookingDate = new Date(today)
  maxBookingDate.setDate(maxBookingDate.getDate() + 30)

  const [open, setOpen] = useState(false)

  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const parseDate = value => {
    if (!value) return null

    const [year, month, day] = value
      .split('-')
      .map(Number)

    return new Date(year, month - 1, day)
  }

  const selectedDate = parseDate(value)

  const formatDisplayDate = date => {
    if (!date) return 'Chọn ngày bắt đầu'

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
  }

  const formatInputDate = date => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const monthName = date =>
    date.toLocaleDateString('vi-VN', {
      month: 'long',
      year: 'numeric'
    })

  const getCalendarDays = monthDate => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    let startDay = firstDay.getDay()

    // Monday = 0
    startDay = startDay === 0 ? 6 : startDay - 1

    const days = []

    for (let i = 0; i < startDay; i++) {
      days.push(null)
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(
        new Date(year, month, day)
      )
    }

    while (days.length < 42) {
      days.push(null)
    }

    return days
  }

  const isSameDay = (a, b) => {
    if (!a || !b) return false

    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  const selectDate = date => {
    if (!date || date < today || date > maxBookingDate) return

    onChange(formatInputDate(date))
    setOpen(false)
  }

  const previousMonth = () => {
    setCurrentMonth(
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1
      )
    )
  }

  const nextMonth = () => {
    setCurrentMonth(
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1
      )
    )
  }

  const renderCalendar = monthDate => {
    const days = getCalendarDays(monthDate)

    return (
      <div className="calendar-month">
        <div className="calendar-month-title">
          {monthName(monthDate)}
        </div>

        <div className="calendar-weekdays">
          {[
            'T2',
            'T3',
            'T4',
            'T5',
            'T6',
            'T7',
            'CN'
          ].map(day => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((date, index) => {
            if (!date) {
              return (
                <span
                  className="calendar-empty"
                  key={index}
                />
              )
            }

            const disabled =
              date < today || date > maxBookingDate
            const selected = isSameDay(
              date,
              selectedDate
            )

            return (
              <button
                key={index}
                type="button"
                className={[
                  'calendar-day',
                  disabled ? 'disabled' : '',
                  selected ? 'selected' : ''
                ].join(' ')}
                disabled={disabled}
                onClick={() => selectDate(date)}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="date-picker">

      <button
        type="button"
        className={`date-picker-input ${open ? 'open' : ''}`}
        onClick={() => setOpen(value => !value)}
      >
        <span className="date-picker-left">
          <span className="calendar-icon">▣</span>

          <span
            className={
              value
                ? 'date-picker-value'
                : 'date-picker-placeholder'
            }
          >
            {formatDisplayDate(selectedDate)}
          </span>
        </span>

        <span className="date-picker-chevron">
          {open ? '⌃' : '⌄'}
        </span>
      </button>

      {open && (
        <>
          <div
            className="date-picker-backdrop"
            onClick={() => setOpen(false)}
          />

          <div className="date-picker-popup">

            <div className="calendar-header">

              <button
                type="button"
                onClick={previousMonth}
              >
                ‹
              </button>

              <div className="calendar-header-title">
                Chọn ngày bắt đầu
              </div>

              <button
                type="button"
                onClick={nextMonth}
              >
                ›
              </button>

            </div>

            <div className="calendar-months">
              {renderCalendar(currentMonth)}

              {renderCalendar(
                new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth() + 1,
                  1
                )
              )}
            </div>

            <div className="calendar-footer">
              <span>
                ● Chọn ngày bắt đầu thuê
              </span>

              {selectedDate && (
                <strong>
                  {formatDisplayDate(selectedDate)}
                </strong>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}

function BookingPage({ facilities, storageUnits, getCurrentUser }) {
  const [step, setStep] = useState(1)

  const [selectedFacility, setSelectedFacility] = useState('')
  const [selectedUnit, setSelectedUnit] = useState('')

  const [startDate, setStartDate] = useState('')

  const [duration, setDuration] = useState(1)

  const [paymentMode, setPaymentMode] = useState('cycle')
  const [paymentCycle, setPaymentCycle] = useState(1)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [booking, setBooking] = useState(null)

  const units = selectedFacility
    ? storageUnits[selectedFacility] || []
    : []

  const availableUnits = units.filter(
    unit => unit.available
  )

  const selectedUnitData = units.find(
    unit => unit.id === selectedUnit
  )

  const monthlyPrice = selectedUnitData
    ? Number(
      selectedUnitData.price.replace(/\D/g, '')
    )
    : 0

  const totalMonths = Number(duration)
  const totalRent = monthlyPrice * totalMonths
  const deposit = Math.round(totalRent * 0.2)

  const formatPrice = value =>
    new Intl.NumberFormat('vi-VN').format(value) + 'đ'

  const getStartDate = () => {
    if (!startDate) {
      return null
    }

    const [year, month, day] = startDate
      .split('-')
      .map(Number)

    const date = new Date(
      year,
      month - 1,
      day
    )

    if (Number.isNaN(date.getTime())) {
      return null
    }

    return date
  }

  const formatDate = date => {
    if (!date || Number.isNaN(date.getTime())) {
      return '—'
    }

    const day = String(date.getDate()).padStart(2, '0')
    const month = String(
      date.getMonth() + 1
    ).padStart(2, '0')
    const year = date.getFullYear()

    return `${day}/${month}/${year}`
  }

  const calculateEndDate = () => {
    const startDate = getStartDate()

    if (!startDate) {
      return null
    }

    const endDate = new Date(startDate)

    endDate.setMonth(
      endDate.getMonth() + totalMonths
    )

    return endDate
  }

  const endDate = calculateEndDate()

  const canContinueStep1 = selectedFacility
  const canContinueStep2 = selectedUnit
  const bookingDate = new Date()
  bookingDate.setHours(0, 0, 0, 0)

  const selectedStartDate = getStartDate()

  const daysUntilStart = selectedStartDate
    ? Math.floor(
      (selectedStartDate.getTime() - bookingDate.getTime()) /
      (1000 * 60 * 60 * 24)
    )
    : null

  const canConfirm =
    selectedUnitData &&
    selectedStartDate &&
    daysUntilStart >= 0 &&
    daysUntilStart <= 30 &&
    duration >= 1 &&
    duration <= 12

  const handleSelectFacility = name => {
    setSelectedFacility(name)
    setSelectedUnit('')
    setError('')
  }

  const handleConfirmBooking = () => {
    setError('')
    setSuccess('')

    if (!selectedUnitData) {
      setError('Vui lòng chọn một kho.')
      return
    }

    if (!selectedStartDate) {
      setError('Vui lòng chọn ngày nhận kho.')
      return
    }

    if (daysUntilStart < 0 || daysUntilStart > 30) {
      setError(
        'Ngày nhận kho phải nằm trong vòng 30 ngày kể từ ngày đặt kho.'
      )
      return
    }

    if (duration < 1 || duration > 12) {
      setError('Thời gian thuê phải từ 1 đến 12 tháng.')
      return
    }

    const currentUser = getCurrentUser()

    if (!currentUser) {
      setError(
        'Vui lòng đăng nhập trước khi đặt kho.'
      )
      return
    }

    const bookingData = {
      id: `BK-${Date.now()}`,
      customerName: currentUser.name,
      customerEmail: currentUser.email,

      facility: selectedFacility,
      unitId: selectedUnitData.id,
      unitType: selectedUnitData.type,
      size: selectedUnitData.size,

      startDate: formatDate(getStartDate()),
      endDate: formatDate(endDate),

      durationMonths: totalMonths,

      monthlyPrice,
      totalRent,

      paymentMode,
      paymentCycle:
        paymentMode === 'cycle'
          ? Number(paymentCycle)
          : totalMonths,

      deposit,

      status: 'PENDING_DEPOSIT_PAYMENT',

      createdAt: new Date().toISOString()
    }

    localStorage.setItem(
      'storespace_pending_booking',
      JSON.stringify(bookingData)
    )

    setBooking(bookingData)
    setSuccess(
      'Đặt chỗ đã được tạo. Vui lòng thanh toán tiền cọc 20%.'
    )
    setStep(4)
  }

  return (
    <div className="customer-content-page">

      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">
            BOOK STORAGE
          </span>

          <h1>Đặt kho</h1>

          <p>
            Hoàn tất thông tin thuê trước khi xác nhận
            đặt chỗ.
          </p>
        </div>

        <div className="booking-step-indicator">
          <span className={step >= 1 ? 'active' : ''}>
            1
          </span>

          <i />

          <span className={step >= 2 ? 'active' : ''}>
            2
          </span>

          <i />

          <span className={step >= 3 ? 'active' : ''}>
            3
          </span>

          <i />

          <span className={step >= 4 ? 'active' : ''}>
            4
          </span>
        </div>
      </div>

      <div className="booking-card">

        {error && (
          <div className="auth-message error">
            {error}
          </div>
        )}

        {success && (
          <div className="auth-message success">
            {success}
          </div>
        )}

        {/* ================================================= */}
        {/* STEP 1 - CHỌN CƠ SỞ */}
        {/* ================================================= */}

        {step === 1 && (
          <div>
            <div className="booking-card-title">
              <h2>Chọn cơ sở</h2>

              <p>
                Chọn nơi bạn muốn thuê kho.
              </p>
            </div>

            <div className="booking-facility-grid">
              {facilities.map(facility => (
                <button
                  key={facility.name}
                  type="button"
                  className={
                    selectedFacility === facility.name
                      ? 'booking-facility selected'
                      : 'booking-facility'
                  }
                  onClick={() =>
                    handleSelectFacility(
                      facility.name
                    )
                  }
                >
                  <img
                    src={facility.image}
                    alt={facility.name}
                  />

                  <div>
                    <strong>
                      {facility.name}
                    </strong>

                    <span>
                      {facility.available} kho trống
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="booking-actions">
              <button
                className="dashboard-primary-btn"
                type="button"
                disabled={!canContinueStep1}
                onClick={() => setStep(2)}
              >
                Tiếp tục
              </button>
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* STEP 2 - CHỌN KHO */}
        {/* ================================================= */}

        {step === 2 && (
          <div>
            <div className="booking-card-title">
              <h2>Chọn kho</h2>

              <p>
                {selectedFacility}
              </p>
            </div>

            {availableUnits.length === 0 ? (
              <div className="empty-state">
                Cơ sở này hiện không còn kho trống.
              </div>
            ) : (
              <div className="booking-unit-list">
                {availableUnits.map(unit => (
                  <button
                    key={unit.id}
                    type="button"
                    className={
                      selectedUnit === unit.id
                        ? 'booking-unit selected'
                        : 'booking-unit'
                    }
                    onClick={() => {
                      setSelectedUnit(unit.id)
                      setError('')
                    }}
                  >
                    <div>
                      <strong>{unit.id}</strong>
                      <span>{unit.type}</span>
                    </div>

                    <div>
                      <strong>{unit.size}</strong>
                      <span>{unit.price}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="booking-actions">

              <button
                className="dashboard-secondary-btn"
                type="button"
                onClick={() => setStep(1)}
              >
                Quay lại
              </button>

              <button
                className="dashboard-primary-btn"
                type="button"
                disabled={!canContinueStep2}
                onClick={() => setStep(3)}
              >
                Tiếp tục
              </button>

            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* STEP 3 - THỜI GIAN + THANH TOÁN */}
        {/* ================================================= */}

        {step === 3 && selectedUnitData && (
          <div>

            <div className="booking-card-title">
              <h2>Thông tin thuê</h2>

              <p>
                Chọn ngày bắt đầu và thời gian thuê từ
                1 đến 12 tháng.
              </p>
            </div>

            {/* NGÀY BẮT ĐẦU */}

            <div className="booking-large-field">

              <label>
                Ngày nhận kho
              </label>

              <DatePicker
                value={startDate}
                onChange={value => {
                  setStartDate(value)
                  setError('')
                }}
              />

              <p className="booking-date-limit-note">
                Bạn chỉ có thể chọn ngày nhận kho trong vòng
                <strong> 30 ngày </strong>
                kể từ ngày đặt kho.
              </p>

            </div>

            {/* THỜI GIAN THUÊ */}

            <div className="booking-large-field">

              <label>
                Thời gian thuê
              </label>

              <div className="duration-picker">

                <button
                  type="button"
                  onClick={() =>
                    setDuration(
                      Math.max(
                        1,
                        duration - 1
                      )
                    )
                  }
                >
                  −
                </button>

                <div className="duration-value">
                  <strong>{duration}</strong>

                  <span>
                    {duration === 1
                      ? 'tháng'
                      : 'tháng'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setDuration(
                      Math.min(
                        12,
                        duration + 1
                      )
                    )
                  }
                >
                  +
                </button>

              </div>

              <div className="duration-slider-wrap">

                <input
                  type="range"
                  min="1"
                  max="12"
                  value={duration}
                  onChange={e =>
                    setDuration(
                      Number(e.target.value)
                    )
                  }
                />

                <div className="duration-slider-label">
                  <span>1 tháng</span>
                  <span>12 tháng</span>
                </div>

              </div>

            </div>

            {/* TÓM TẮT THỜI GIAN */}

            <div className="booking-period-summary">

              <div>
                <small>
                  Ngày bắt đầu
                </small>

                <strong>
                  {formatDate(getStartDate())}
                </strong>
              </div>

              <div>
                <small>
                  Ngày kết thúc dự kiến
                </small>

                <strong>
                  {formatDate(endDate)}
                </strong>
              </div>

              <div>
                <small>
                  Thời gian thuê
                </small>

                <strong>
                  {duration} tháng
                </strong>
              </div>

            </div>

            {/* THANH TOÁN */}

            <div className="booking-large-field">

              <label>
                Phương thức thanh toán
              </label>

              <div className="payment-mode-grid">

                <button
                  type="button"
                  className={
                    paymentMode === 'cycle'
                      ? 'payment-mode-card active'
                      : 'payment-mode-card'
                  }
                  onClick={() =>
                    setPaymentMode('cycle')
                  }
                >
                  <span className="payment-mode-icon">
                    ↻
                  </span>

                  <strong>
                    Thanh toán theo chu kỳ
                  </strong>

                  <small>
                    Thanh toán từng kỳ trong thời gian thuê.
                  </small>
                </button>

                <button
                  type="button"
                  className={
                    paymentMode === 'full'
                      ? 'payment-mode-card active'
                      : 'payment-mode-card'
                  }
                  onClick={() =>
                    setPaymentMode('full')
                  }
                >
                  <span className="payment-mode-icon">
                    ✓
                  </span>

                  <strong>
                    Thanh toán toàn bộ
                  </strong>

                  <small>
                    Thanh toán toàn bộ tiền thuê một lần.
                  </small>
                </button>

              </div>

            </div>

            {paymentMode === 'cycle' && (
              <div className="cycle-select-box">

                <label>
                  Chu kỳ thanh toán
                </label>

                <select
                  value={paymentCycle}
                  onChange={e =>
                    setPaymentCycle(
                      Number(e.target.value)
                    )
                  }
                >
                  <option value="1">
                    Mỗi 1 tháng
                  </option>

                  {duration >= 3 && (
                    <option value="3">
                      Mỗi 3 tháng
                    </option>
                  )}

                  {duration >= 6 && (
                    <option value="6">
                      Mỗi 6 tháng
                    </option>
                  )}
                </select>

              </div>
            )}

            {/* CHI TIẾT TIỀN */}

            <div className="booking-price-breakdown">

              <div>
                <span>
                  Giá thuê / tháng
                </span>

                <strong>
                  {formatPrice(monthlyPrice)}
                </strong>
              </div>

              <div>
                <span>
                  Thời gian thuê
                </span>

                <strong>
                  {duration} tháng
                </strong>
              </div>

              <div className="price-divider" />

              <div>
                <span>
                  Tổng tiền thuê
                </span>

                <strong className="main-price">
                  {formatPrice(totalRent)}
                </strong>
              </div>

              <div className="deposit-row">
                <div>
                  <span>
                    Tiền cọc
                  </span>

                  <small>
                    20% tổng giá thuê
                  </small>
                </div>

                <strong className="deposit-price">
                  {formatPrice(deposit)}
                </strong>
              </div>

            </div>

            <div className="deposit-notice">

              <div className="deposit-notice-icon">
                $
              </div>

              <div>
                <strong>
                  Thanh toán tiền cọc trước
                </strong>

                <p>
                  Bạn chỉ cần thanh toán
                  <strong>
                    {' '}
                    {formatPrice(deposit)}
                  </strong>
                  {' '}
                  tiền cọc trước.
                  Sau khi thanh toán cọc, đơn đặt kho
                  sẽ được chuyển cho Facility Manager
                  để xét duyệt.
                </p>

                <p>
                  Tiền thuê kho sẽ chỉ được thanh toán
                  sau khi Manager phê duyệt.
                </p>
              </div>

            </div>

            <div className="booking-actions">

              <button
                className="dashboard-secondary-btn"
                type="button"
                onClick={() => setStep(2)}
              >
                Quay lại
              </button>

              <button
                className="dashboard-primary-btn"
                type="button"
                disabled={!canConfirm}
                onClick={handleConfirmBooking}
              >
                Xác nhận đặt kho
              </button>

            </div>

          </div>
        )}

        {/* ================================================= */}
        {/* STEP 4 - THANH TOÁN CỌC */}
        {/* ================================================= */}

        {step === 4 && booking && (
          <div className="deposit-payment-page">

            <div className="deposit-payment-header">
              <span className="customer-eyebrow">
                DEPOSIT PAYMENT
              </span>

              <h2>
                Thanh toán tiền cọc
              </h2>

              <p>
                Đặt chỗ của bạn đã được tạo.
                Vui lòng thanh toán tiền cọc 20%
                để gửi yêu cầu đến Facility Manager.
              </p>
            </div>

            <div className="deposit-payment-layout">

              <div className="deposit-qr-card">

                <div className="deposit-qr-title">
                  <strong>
                    Quét mã QR để thanh toán
                  </strong>

                  <span>
                    Số tiền cọc
                  </span>
                </div>

                <div className="qr-wrapper">

                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(
                      `StoreSpace|${booking.id}|Deposit|${booking.deposit}`
                    )}`}
                    alt="QR thanh toán tiền cọc"
                  />

                </div>

                <strong className="qr-amount">
                  {formatPrice(booking.deposit)}
                </strong>

                <p className="qr-note">
                  Nội dung chuyển khoản:
                  <strong>
                    {' '}
                    {booking.id}
                  </strong>
                </p>

              </div>

              <div className="deposit-payment-info">

                <div className="payment-info-block">

                  <span>
                    THÔNG TIN THANH TOÁN
                  </span>

                  <div>
                    <small>
                      Người nhận
                    </small>

                    <strong>
                      StoreSpace
                    </strong>
                  </div>

                  <div>
                    <small>
                      Ngân hàng
                    </small>

                    <strong>
                      NGÂN HÀNG DEMO
                    </strong>
                  </div>

                  <div>
                    <small>
                      Số tài khoản
                    </small>

                    <strong>
                      0000 0000 0000
                    </strong>
                  </div>

                  <div>
                    <small>
                      Số tiền
                    </small>

                    <strong className="payment-highlight">
                      {formatPrice(booking.deposit)}
                    </strong>
                  </div>

                  <div>
                    <small>
                      Nội dung
                    </small>

                    <strong>
                      {booking.id}
                    </strong>
                  </div>

                </div>

                <div className="payment-booking-summary">

                  <span>
                    ĐẶT KHO
                  </span>

                  <strong>
                    {booking.facility}
                  </strong>

                  <p>
                    {booking.unitId}
                    {' · '}
                    {booking.unitType}
                  </p>

                  <div>
                    <span>
                      Thời gian
                    </span>

                    <strong>
                      {booking.durationMonths}
                      {' tháng'}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Tổng tiền thuê
                    </span>

                    <strong>
                      {formatPrice(
                        booking.totalRent
                      )}
                    </strong>
                  </div>

                </div>

              </div>

            </div>

            <div className="payment-warning">

              <strong>
                Chưa thanh toán?
              </strong>

              <span>
                Bạn chưa cần thanh toán tiền thuê toàn bộ
                ở bước này. Chỉ thanh toán tiền cọc.
                Sau khi Manager duyệt, hệ thống mới chuyển
                sang bước thanh toán tiền thuê.
              </span>

            </div>

            <div className="deposit-status">

              <div className="deposit-status-dot" />

              <div>
                <strong>
                  Đang chờ thanh toán cọc
                </strong>

                <small>
                  Mã đặt chỗ: {booking.id}
                </small>
              </div>

              <span>
                PENDING
              </span>

            </div>

          </div>
        )}

      </div>
    </div>
  )
}

function ContractPage({ customerRental, customerRentals, getCurrentUser }) {
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(rental => rental?.contractId)
    : customerRental
      ? customerRental.contractId ? [customerRental] : []
      : []
  const [signatures, setSignatures] = useState({})
  const [signatureErrors, setSignatureErrors] = useState({})
  const [loadedSignatures, setLoadedSignatures] = useState({})
  const [openRental, setOpenRental] = useState(null)
  const customerName = getCurrentUser()?.name

  const keyOf = rental => String(rental.contractId)

  const reloadSignature = async rental => {
    const contractId = keyOf(rental)
    setLoadedSignatures(current => ({ ...current, [contractId]: false }))
    try {
      const status = await apiGet(`/api/contracts/${contractId}/signature`)
      setSignatures(current => ({
        ...current,
        [contractId]: status.isSigned ? {
          image: status.signatureImage,
          signerName: status.signerName,
          signedAt: status.signedAt
        } : null
      }))
      setSignatureErrors(current => {
        const next = { ...current }
        delete next[contractId]
        return next
      })
      setLoadedSignatures(current => ({ ...current, [contractId]: true }))
    } catch (error) {
      setSignatureErrors(current => ({ ...current, [contractId]: error.message }))
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all(rentals.map(async rental => {
      const contractId = keyOf(rental)
      try {
        const status = await apiGet(`/api/contracts/${contractId}/signature`)
        return { contractId, status }
      } catch (error) {
        return { contractId, error }
      }
    })).then(results => {
      if (cancelled) return
      const nextSignatures = {}
      const nextErrors = {}
      const nextLoaded = {}
      for (const result of results) {
        nextLoaded[result.contractId] = !result.error
        if (result.error) {
          nextErrors[result.contractId] = result.error.message
          continue
        }
        if (result.status.isSigned) {
          nextSignatures[result.contractId] = {
            image: result.status.signatureImage,
            signerName: result.status.signerName,
            signedAt: result.status.signedAt
          }
        }
      }
      setSignatures(nextSignatures)
      setSignatureErrors(nextErrors)
      setLoadedSignatures(nextLoaded)
    })
    return () => { cancelled = true }
  }, [customerName])

  const handleSign = async (rental, record) => {
    const contractId = keyOf(rental)
    const result = await apiPost(`/api/contracts/${contractId}/signature`, {
      signatureImage: record.image,
      termsVersion: 'storage-rental-v1',
      acceptedTerms: true
    })
    const signature = {
      image: result.signatureImage,
      signerName: result.signerName,
      signedAt: result.signedAt
    }
    setSignatures(current => ({ ...current, [contractId]: signature }))
    setSignatureErrors(current => {
      const next = { ...current }
      delete next[contractId]
      return next
    })
    setOpenRental(null)
  }

  const pendingCount = rentals.filter(r => loadedSignatures[keyOf(r)] && !signatures[keyOf(r)]).length

  return (
    <div className="customer-content-page">

      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">
            MY CONTRACT
          </span>

          <h1>Hợp đồng</h1>

          <p>
            Quản lý và ký hợp đồng thuê kho của bạn.
          </p>
        </div>

        {pendingCount > 0 && (
          <span className="page-count">
            {pendingCount} hợp đồng chờ ký
          </span>
        )}
      </div>

      {rentals.length === 0 && <div className="empty-state">Chưa có hợp đồng trong database.</div>}
      {rentals.map(rental => {
        const signature = signatures[keyOf(rental)]
        const isSigned = !!signature
        const signatureError = signatureErrors[keyOf(rental)]
        const signatureLoaded = loadedSignatures[keyOf(rental)]

        return (
          <div key={keyOf(rental)} style={{ marginBottom: 28 }}>
            <div className="contract-card">

              <div className="contract-header">

                <div>
                  <span>HỢP ĐỒNG THUÊ KHO</span>

                  <h2>
                    Hợp đồng #{keyOf(rental)}
                  </h2>

                  <p>
                    StoreSpace · {rental.facility}
                  </p>
                </div>

                <span
                  className="contract-status"
                  style={isSigned ? undefined : { background: '#fff3d6', color: '#9a6700' }}
                >
                  {isSigned ? 'Đã ký' : rental.contractStatus || 'Chưa ký'}
                </span>

              </div>

              {signatureError && (
                <div className="auth-message error">
                  Không tải được trạng thái chữ ký: {signatureError}
                  <button type="button" onClick={() => reloadSignature(rental)} style={{ marginLeft: 12 }}>
                    Thử lại
                  </button>
                </div>
              )}
              {!isSigned && !signatureError && (
                <div style={{ margin: '0 0 16px', padding: '12px 16px', borderRadius: 12, background: '#fff8e6', border: '1px solid #f3d98b', color: '#7a5600' }}>
                  {signatureLoaded ? 'Hợp đồng chưa có chữ ký điện tử.' : 'Đang tải trạng thái chữ ký từ backend...'}
                </div>
              )}

              <div className="contract-details">

                <div>
                  <small>Khách hàng</small>
                  <strong>
                    {customerName}
                  </strong>
                </div>

                <div>
                  <small>Mã kho</small>
                  <strong>{rental.unitId}</strong>
                </div>

                <div>
                  <small>Loại kho</small>
                  <strong>{rental.type}</strong>
                </div>

                <div>
                  <small>Diện tích</small>
                  <strong>{rental.size}</strong>
                </div>

                <div>
                  <small>Ngày bắt đầu</small>
                  <strong>{rental.startDate}</strong>
                </div>

                <div>
                  <small>Ngày kết thúc</small>
                  <strong>{rental.endDate}</strong>
                </div>

                <div>
                  <small>Tiền thuê</small>
                  <strong>{rental.price}</strong>
                </div>

                <div>
                  <small>Trạng thái ký</small>
                  <strong className={isSigned ? 'status-text' : undefined}>
                    {isSigned ? `Đã ký ${formatSignedAt(signature.signedAt)}` : 'Chưa ký'}
                  </strong>
                </div>

              </div>

              <div className="contract-progress">

                <div>
                  <span>Tiến độ thời hạn hợp đồng</span>
                  <strong>
                    {rental.progress}%
                  </strong>
                </div>

                <div className="rental-progress">
                  <div
                    style={{
                      width: `${rental.progress}%`
                    }}
                  />
                </div>

                <small>
                  Còn {rental.remainingDays} ngày
                  trước khi hợp đồng kết thúc.
                </small>

              </div>

              <div className="contract-actions">

                {!isSigned && signatureLoaded && (
                  <button
                    type="button"
                    className="dashboard-primary-btn"
                    onClick={() => setOpenRental(rental)}
                  >
                    ✍ Ký hợp đồng
                  </button>
                )}

                <button
                  type="button"
                  className={isSigned ? 'dashboard-primary-btn' : 'dashboard-secondary-btn'}
                  disabled={!signatureLoaded}
                  onClick={() => setOpenRental(rental)}
                >
                  Xem hợp đồng
                </button>

              </div>

            </div>

          </div>
        )
      })}

      {openRental && (
        <ContractModal
          rental={openRental}
          customerName={customerName}
          signature={signatures[keyOf(openRental)]}
          onClose={() => setOpenRental(null)}
          onSign={record => handleSign(openRental, record)}
        />
      )}
    </div>
  )
}

function CustomerPaymentPage({ reservations }) {
  const pending = reservations.filter(item =>
    item.status === 'Pending Deposit' && item.paymentStatus !== 'Completed'
  )
  const paid = reservations.filter(item => item.paymentStatus === 'Completed')
  const pendingAmount = pending.reduce(
    (total, item) => total + Number(item.depositAmount || 0),
    0
  )
  const formatMoney = amount => `${new Intl.NumberFormat('vi-VN').format(amount || 0)}đ`

  return (
    <div className="customer-content-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">PAYMENT CENTER</span>
          <h1>Thanh toán</h1>
          <p>Trạng thái và giao dịch tiền cọc đã lưu trong database.</p>
        </div>
      </div>
      <section className="customer-stats">
        <div className="customer-stat-card">
          <small>Tiền cọc đang chờ</small>
          <strong>{formatMoney(pendingAmount)}</strong>
          <span className="stat-note">{pending.length} đặt chỗ</span>
        </div>
        <div className="customer-stat-card">
          <small>Giao dịch đã ghi nhận</small>
          <strong>{paid.length}</strong>
          <span className="stat-note">Theo dữ liệu backend</span>
        </div>
      </section>
      {reservations.length === 0 && <div className="empty-state">Chưa có giao dịch hoặc đặt chỗ.</div>}
      {reservations.map(item => (
        <section className="customer-section" key={item.reservationId}>
          <div className="overview-panel">
            <div className="overview-panel-heading">
              <div>
                <h2>{item.facility}</h2>
                <p>{item.unitId || 'Chưa phân kho'} · Đặt chỗ #{item.reservationId}</p>
              </div>
              <span className="rental-status">
                {item.paymentStatus === 'Completed' ? '● Đã thanh toán' : '● Chưa thanh toán'}
              </span>
            </div>
            <div className="contract-summary">
              <div><span>Tiền cọc yêu cầu</span><strong>{formatMoney(item.depositAmount)}</strong></div>
              <div><span>Đã thanh toán</span><strong>{item.paymentAmount == null ? '—' : formatMoney(item.paymentAmount)}</strong></div>
              <div><span>Trạng thái đặt chỗ</span><strong>{item.statusLabel}</strong></div>
              <div><span>Mã giao dịch</span><strong>{item.paymentReference || '—'}</strong></div>
              <div><span>Ngày giao dịch</span><strong>{item.paymentDate ? item.paymentDate.slice(0, 10) : '—'}</strong></div>
            </div>
          </div>
        </section>
      ))}
      <div className="payment-warning">
        Backend hiện chưa kết nối ngân hàng. Trạng thái giao dịch được hiển thị theo database, không xác minh thanh toán ngoài hệ thống.
      </div>
    </div>
  )
}

function CustomerDashboard({ facilities, storageUnits, customerRental, customerRentals, getCurrentUser, navigate, currentUserKey }) {
  const user = getCurrentUser()
  // Đã cập nhật: Danh sách kho đang thuê, kho Staff vừa bàn giao đứng đầu (05/10/2026)
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(Boolean)
    : customerRental
      ? [customerRental]
      : []
  const activeRentals = rentals.filter(item => item.status === 'Handed Over')
  const rental = activeRentals[0] || rentals[0]
  const unpaidReservations = rentals.filter(item =>
    item.status === 'Pending Deposit' && item.paymentStatus !== 'Completed'
  )
  const pendingAmount = unpaidReservations.reduce(
    (total, item) => total + Number(item.depositAmount || 0),
    0
  )
  const expiringRentals = activeRentals.filter(item => item.remainingDays <= 30)
  const [activeSection, setActiveSection] = useState('overview')

  const logout = () => {
    localStorage.removeItem(currentUserKey)
    navigate('/')
  }

  if (!rental) {
    return (
      <div className="customer-layout">
        <main className="customer-main">
          <div className="customer-page-heading">
            <div>
              <span className="customer-eyebrow">CUSTOMER DASHBOARD</span>
              <h1>Xin chào, {user?.name || 'Customer'}!</h1>
              <p>Tài khoản hiện chưa có kho thuê hoặc đặt chỗ.</p>
            </div>
          </div>
          <div className="empty-state">
            <p>Dữ liệu đặt thuê sẽ hiển thị tại đây sau khi được tải từ hệ thống.</p>
            <button className="dashboard-primary-btn" type="button" onClick={() => navigate('/facilities')}>
              Tìm kho
            </button>
            <button className="dashboard-secondary-btn" type="button" onClick={logout}>
              Đăng xuất
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    // <div className="customer-page">
    //   <SiteHeader />

    <div className="customer-layout">

      <aside className="customer-sidebar">

        <div className="customer-brand" type="button" onClick={() => navigate('/')}>
          <span className="brand-mark">S</span>

          <div>
            <strong>StoreSpace</strong>
            <small>Customer Portal</small>
          </div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>

          <div>
            <strong>{user?.name || 'Customer'}</strong>
            <small>Customer</small>
          </div>
        </div>

        <nav className="customer-nav">

          <button
            className={activeSection === 'overview' ? 'active' : ''}
            onClick={() => setActiveSection('overview')}
          >
            <span>⌂</span>
            Tổng quan
          </button>

          <button
            className={activeSection === 'storage' ? 'active' : ''}
            onClick={() => setActiveSection('storage')}
          >
            <span>▣</span>
            Kho của tôi
          </button>

          <button
            className={activeSection === 'booking' ? 'active' : ''}
            onClick={() => {
              navigate('/search')
            }}
          >
            <span>◷</span>
            Đặt kho
          </button>

          <button
            className={activeSection === 'contract' ? 'active' : ''}
            onClick={() => setActiveSection('contract')}
          >
            <span>▤</span>
            Hợp đồng
          </button>

          <button
            type="button"
            className={activeSection === 'payment' ? 'active' : ''}
            onClick={() => setActiveSection('payment')}
          >
            <span>◫</span>
            Thanh toán
          </button>

          <button>
            <span>♙</span>
            Hồ sơ
          </button>

        </nav>

        <div className="customer-sidebar-bottom">
          <button onClick={logout}>
            <span>↪</span>
            Đăng xuất
          </button>
        </div>

      </aside>

      <main className="customer-main">

        <div className="customer-topbar">
          <div>
            <span className="customer-eyebrow">
              CUSTOMER DASHBOARD
            </span>

            <h1>
              Xin chào, {user?.name || 'Customer'}!
            </h1>

            <p>
              Quản lý kho thuê và thông tin tài khoản của bạn.
            </p>
          </div>

          <button className="customer-profile-button">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </button>
        </div>

        {activeSection === 'overview' && (
          <div className="overview-page">

            {/* ===== STATS ===== */}

            <section className="customer-stats">

              <div className="customer-stat-card">
                <span className="stat-icon">▣</span>
                <small>Kho đang thuê</small>
                <strong>{activeRentals.length}</strong>
                <span className="stat-note">Đang hoạt động</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon yellow">◷</span>
                <small>Kho sắp hết hạn</small>
                <strong>{expiringRentals.length}</strong>
                <span className="stat-note warning">
                  Cần chú ý
                </span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon blue">₫</span>
                <small>Thanh toán sắp tới</small>
                <strong>{new Intl.NumberFormat('vi-VN').format(pendingAmount)}đ</strong>
                <span className="stat-note">
                  {unpaidReservations.length} khoản cọc chưa thanh toán
                </span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">◴</span>
                <small>Ngày còn lại</small>
                <strong>{rental.remainingDays ?? '—'}</strong>
                <span className="stat-note">
                  Ngày thuê hiện tại
                </span>
              </div>

            </section>


            {/* ===== CURRENT RENTAL ===== */}

            <section className="customer-section">

              <div className="customer-section-heading">
                <div>
                  <span className="customer-eyebrow">
                    CURRENT RENTAL
                  </span>

                  <h2>Kho đang thuê</h2>
                </div>

                <button
                  type="button"
                  className="overview-text-button"
                  onClick={() => setActiveSection('storage')}
                >
                  Xem tất cả →
                </button>
              </div>


              <div className="overview-rental-card">

                <div className="overview-rental-left">

                  <div className="overview-rental-top">
                    <div>

                      <span className="rental-facility">
                        {rental.facility}
                      </span>

                      <h3>{rental.unitId || 'Chưa phân kho'}</h3>

                      <p>
                        {rental.type} · {rental.size}
                      </p>

                    </div>

                    <span className="rental-status">
                      ● {rental.statusLabel}
                    </span>
                  </div>


                  <div className="overview-rental-info">

                    <div>
                      <small>Ngày bắt đầu</small>
                      <strong>{rental.startDate}</strong>
                    </div>

                    <div>
                      <small>Ngày kết thúc</small>
                      <strong>{rental.endDate}</strong>
                    </div>

                    <div>
                      <small>Giá thuê</small>
                      <strong>{rental.price}</strong>
                    </div>

                  </div>

                </div>


                <div className="overview-rental-progress">

                  <div className="overview-progress-heading">
                    <span>Tiến độ thời hạn</span>
                    <strong>{rental.progress ?? 0}%</strong>
                  </div>

                  <div className="rental-progress">
                    <div
                      style={{
                        width: `${rental.progress ?? 0}%`
                      }}
                    />
                  </div>

                  <div className="overview-progress-bottom">
                    <span>
                      Đã sử dụng {rental.progress ?? 0}%
                    </span>

                    <strong>
                      Còn {rental.remainingDays ?? '—'} ngày
                    </strong>
                  </div>

                </div>

              </div>

            </section>


            {/* ===== TWO COLUMNS ===== */}

            <div className="overview-two-columns">


              {/* PAYMENT */}

              <section className="overview-panel">

                <div className="overview-panel-heading">

                  <div>
                    <span className="customer-eyebrow">
                      NEXT PAYMENT
                    </span>

                    <h2>Thanh toán</h2>
                  </div>

                  <span className="overview-panel-icon yellow">
                    ₫
                  </span>

                </div>


                <div className="payment-main">

                  <small>Khoản thanh toán tiếp theo</small>

                  <strong>{new Intl.NumberFormat('vi-VN').format(pendingAmount)}đ</strong>

                  <span>
                    Tiền cọc chưa thanh toán theo các đặt chỗ trong database
                  </span>

                </div>


                <div className="payment-status">
                  <span>Trạng thái</span>

                  <strong>
                    ● {unpaidReservations.length ? 'Chưa hoàn tất' : 'Không có khoản chờ'}
                  </strong>
                </div>


                <button
                  className="dashboard-primary-btn full"
                  onClick={() => setActiveSection('payment')}
                >
                  Thanh toán ngay
                </button>

              </section>


              {/* CONTRACT */}

              <section className="overview-panel">

                <div className="overview-panel-heading">

                  <div>
                    <span className="customer-eyebrow">
                      CONTRACT
                    </span>

                    <h2>Hợp đồng</h2>
                  </div>

                  <span className="overview-panel-icon">
                    ▤
                  </span>

                </div>


                <div className="contract-summary">

                  <div>
                    <span>Mã hợp đồng</span>
                    <strong>
                      #{rental.contractId || rental.reservationId}
                    </strong>
                  </div>

                  <div>
                    <span>Trạng thái</span>
                    <strong className="contract-active">
                      {rental.contractStatus || rental.statusLabel}
                    </strong>
                  </div>

                  <div>
                    <span>Ngày hết hạn</span>
                    <strong>{rental.endDate}</strong>
                  </div>

                </div>


                <button
                  className="dashboard-secondary-btn full"
                  onClick={() =>
                    setActiveSection('contract')
                  }
                >
                  Xem hợp đồng
                </button>

              </section>

            </div>


            {/* ===== QUICK ACTIONS ===== */}

            <section className="overview-panel quick-actions-panel">

              <div className="overview-panel-heading">

                <div>
                  <span className="customer-eyebrow">
                    QUICK ACTIONS
                  </span>

                  <h2>Thao tác nhanh</h2>
                </div>

              </div>


              <div className="quick-actions-grid">

                <button
                  className="quick-action"
                  onClick={() => navigate('/facilities')}
                >
                  <span className="quick-action-icon blue">
                    +
                  </span>

                  <div>
                    <strong>Đặt kho mới</strong>
                    <small>
                      Tìm và thuê thêm một kho
                    </small>
                  </div>

                  <span>→</span>
                </button>


                <button
                  className="quick-action"
                  onClick={() =>
                    setActiveSection('storage')
                  }
                >
                  <span className="quick-action-icon">
                    ▣
                  </span>

                  <div>
                    <strong>Kho của tôi</strong>
                    <small>
                      Xem các kho đang thuê
                    </small>
                  </div>

                  <span>→</span>
                </button>


                <button
                  className="quick-action"
                  onClick={() =>
                    setActiveSection('contract')
                  }
                >
                  <span className="quick-action-icon yellow">
                    ▤
                  </span>

                  <div>
                    <strong>Hợp đồng</strong>
                    <small>
                      Xem thông tin hợp đồng
                    </small>
                  </div>

                  <span>→</span>
                </button>

              </div>

            </section>


            {/* ===== RECENT NOTIFICATIONS ===== */}

            <section className="overview-panel">

              <div className="overview-panel-heading">

                <div>
                  <span className="customer-eyebrow">
                    RECENT ACTIVITY
                  </span>

                  <h2>Hoạt động gần đây</h2>
                </div>

              </div>


              <div className="activity-list">
                {rentals.slice(0, 5).map(item => (
                  <div className="activity-item" key={item.reservationId}>
                    <span className={`activity-dot ${item.paymentStatus === 'Completed' ? 'green' : 'yellow'}`} />
                    <div>
                      <strong>Đặt chỗ #{item.reservationId} · {item.statusLabel}</strong>
                      <small>{item.facility} · {item.unitId || 'Chưa phân kho'} · {item.startDate}</small>
                    </div>
                    <span className="activity-time">{item.paymentStatus || 'Chưa thanh toán'}</span>
                  </div>
                ))}
                {rentals.length === 0 && <p>Chưa có hoạt động.</p>}
              </div>

            </section>

          </div>
        )}

        {activeSection === 'storage' && (
          <MyStoragePage customerRental={customerRental} customerRentals={rentals} facilities={facilities} />
        )}

        {activeSection === 'booking-demo-disabled' && (
          <BookingPage facilities={facilities} storageUnits={storageUnits} getCurrentUser={getCurrentUser} />
        )}

        {activeSection === 'contract' && (
          <ContractPage customerRental={customerRental} customerRentals={rentals} getCurrentUser={getCurrentUser} />
        )}


        {activeSection === 'payment' && (
          <CustomerPaymentPage reservations={rentals} />
        )}

        {activeSection === 'payment-demo-disabled' && (
          <div className="customer-content-page">

            <div className="customer-page-heading">
              <div>
                <span className="customer-eyebrow">PAYMENT CENTER</span>
                <h1>Thanh toán</h1>
                <p>Quản lý các khoản phí và lịch sử thanh toán kho thuê của bạn.</p>
              </div>
            </div>

            {/* TỔNG QUAN THANH TOÁN */}
            <section className="customer-stats">
              <div className="customer-stat-card">
                <span className="stat-icon yellow">₫</span>
                <small>Khoản cần thanh toán</small>
                <strong>{paymentPaid ? '0đ' : '650K'}</strong>
                <span className="stat-note">
                  {paymentPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                </span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon blue">▤</span>
                <small>Mã hợp đồng</small>
                <strong>{rental?.unitId || 'N/A'}</strong>
                <span className="stat-note">Hợp đồng kho thuê</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">◷</span>
                <small>Hạn thanh toán</small>
                <strong>01/11/2026</strong>
                <span className="stat-note warning">Kỳ thanh toán tiếp theo</span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">✓</span>
                <small>Trạng thái</small>
                <strong>{paymentPaid ? 'Hoàn tất' : 'Chờ trả'}</strong>
                <span className="stat-note">
                  {paymentPaid ? 'Đã xác nhận demo' : 'Đang chờ thanh toán'}
                </span>
              </div>
            </section>

            {/* KHOẢN THANH TOÁN */}
            <section className="customer-section">
              <div className="customer-section-heading">
                <div>
                  <span className="customer-eyebrow">OUTSTANDING PAYMENT</span>
                  <h2>Khoản thanh toán của bạn</h2>
                </div>
              </div>

              <div className="overview-panel">
                <div className="overview-panel-heading">
                  <div>
                    <h2>{rental?.facility || 'StoreSpace'}</h2>
                    <p>Kho {rental?.unitId || 'CD-101'}</p>
                  </div>

                  <span className="rental-status">
                    {paymentPaid ? '● Đã thanh toán' : '● Chưa thanh toán'}
                  </span>
                </div>

                <div className="contract-summary">
                  <div>
                    <span>Mã hợp đồng</span>
                    <strong>#SS-{rental?.unitId || 'CD-101'}</strong>
                  </div>

                  <div>
                    <span>Nội dung</span>
                    <strong>Tiền thuê kho</strong>
                  </div>

                  <div>
                    <span>Hạn thanh toán</span>
                    <strong>01/11/2026</strong>
                  </div>
                </div>

                <div className="payment-main">
                  <small>Số tiền cần thanh toán</small>
                  <strong>{paymentPaid ? '0đ' : '650.000đ'}</strong>
                  <span>
                    {paymentPaid
                      ? 'Khoản thanh toán demo đã được xác nhận.'
                      : 'Vui lòng hoàn tất trước ngày đến hạn.'}
                  </span>
                </div>

                {!paymentPaid && (
                  <button
                    type="button"
                    className="dashboard-primary-btn full"
                    onClick={() => setShowPaymentQR(true)}
                  >
                    Thanh toán ngay →
                  </button>
                )}
              </div>
            </section>

            {/* LỊCH SỬ THANH TOÁN */}
            <section className="customer-section">
              <div className="customer-section-heading">
                <div>
                  <span className="customer-eyebrow">TRANSACTION HISTORY</span>
                  <h2>Lịch sử thanh toán</h2>
                </div>
              </div>

              <div className="overview-panel">
                <div className="contract-summary">
                  <div>
                    <span>Kho</span>
                    <strong>{rental?.unitId || 'CD-101'}</strong>
                  </div>

                  <div>
                    <span>Số tiền</span>
                    <strong>650.000đ</strong>
                  </div>

                  <div>
                    <span>Trạng thái</span>
                    <strong className={paymentPaid ? 'contract-active' : ''}>
                      {paymentPaid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* MÀN HÌNH QR THANH TOÁN DEMO */}
            {showPaymentQR && !paymentPaid && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9999,
                  background: 'rgba(7, 30, 55, 0.65)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 20
                }}
              >
                <div
                  className="overview-panel"
                  style={{
                    width: '100%',
                    maxWidth: 440,
                    background: '#fff',
                    padding: 28,
                    borderRadius: 18,
                    textAlign: 'center',
                    maxHeight: '90vh',
                    overflowY: 'auto'
                  }}
                >
                  <div className="overview-panel-heading">
                    <div style={{ textAlign: 'left' }}>
                      <span className="customer-eyebrow">SECURE PAYMENT</span>
                      <h2>Thanh toán tiền thuê</h2>
                    </div>

                    <button
                      type="button"
                      className="dashboard-secondary-btn"
                      onClick={() => setShowPaymentQR(false)}
                    >
                      ✕
                    </button>
                  </div>

                  <p>Quét mã QR để thanh toán</p>

                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                      `StoreSpace|SS-${rental?.unitId || 'CD-101'}|Rent|650000`
                    )}`}
                    alt="Mã QR thanh toán demo"
                    style={{
                      width: 220,
                      maxWidth: '100%',
                      height: 'auto',
                      margin: '16px auto',
                      display: 'block'
                    }}
                  />

                  <h2 style={{ color: '#08477f', margin: '12px 0' }}>
                    650.000đ
                  </h2>

                  <p style={{ color: '#64748b', fontSize: 14 }}>
                    Nội dung chuyển khoản: SS-{rental?.unitId || 'CD-101'}
                  </p>

                  <div
                    style={{
                      padding: 12,
                      background: '#fff8db',
                      borderRadius: 10,
                      fontSize: 13,
                      margin: '16px 0'
                    }}
                  >
                    Đây là giao diện thanh toán mô phỏng. Chưa kết nối ngân hàng
                    hoặc xác minh giao dịch thật.
                  </div>

                  <button
                    type="button"
                    className="dashboard-primary-btn full"
                    onClick={() => {
                      setPaymentPaid(true)
                      setShowPaymentQR(false)
                    }}
                  >
                    Xác nhận thanh toán demo
                  </button>

                  <button
                    type="button"
                    className="dashboard-secondary-btn full"
                    style={{ marginTop: 10 }}
                    onClick={() => setShowPaymentQR(false)}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}

          </div>
        )}


      </main>

    </div>
    // {/* </div> */}
  )
}



// Export only the main customer dashboard to App.jsx.
export default CustomerDashboard
