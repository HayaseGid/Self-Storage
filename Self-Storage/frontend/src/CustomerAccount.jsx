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
import { formatReservationCode } from './storageRules'
import DataGrid from './DataGrid'
import { UnitTypeChip, getUnitTypeStyle } from './unitTypes'
import './unitTypes.css'
import { formatSignedAt } from './contractSignatures'
import ContractSignFlow, { CONTRACT_TERMS_VERSION } from './ContractSignFlow'
import ContractDetailModal from './ContractDetailModal'
import { sendContractEmail } from './contractEmail'
import { usePolicies } from './policies'
import { useDialog } from './Dialog'
import { useContractRenewals, RenewalSection, RenewalModal, fmtIsoDate } from './ContractRenewal'
import { confirmAfterDeposit, takeCustomerSection } from './afterDeposit'
import { startVnPayPayment } from './vnpay'

/* Chuyển 'dd/mm/yyyy' thành số yyyymmdd để sắp xếp đúng theo ngày. */
const dateSortValue = value => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''))
  return match ? Number(`${match[3]}${match[2]}${match[1]}`) : null
}

const RENTAL_STATUS_TONES = {
  'Pending Deposit': 'warn',
  Paid: 'info',
  Confirmed: 'info',
  'Handed Over': 'ok',
  Cancelled: 'muted',
  Expired: 'muted'
}

const RENTAL_STATUS_FILTERS = [
  { value: 'Pending Deposit', label: 'Chờ thanh toán cọc' },
  { value: 'Paid', label: 'Đã cọc · Đang tạo hợp đồng' },
  { value: 'Confirmed', label: 'Chờ ký hợp đồng / nhận kho' },
  { value: 'Handed Over', label: 'Đang thuê' },
  { value: 'Expired', label: 'Hết hạn giữ kho' },
  { value: 'Cancelled', label: 'Đã hủy' }
]

const STORAGE_VIEW_KEY = 'storespace_my_storage_view'

function MyStoragePage({ customerRental, customerRentals, facilities, onRentalsChanged }) {
  const [selectedRental, setSelectedRental] = useState(null)
  const renewals = useContractRenewals()
  const [renewItem, setRenewItem] = useState(null)
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(STORAGE_VIEW_KEY) === 'cards' ? 'cards' : 'grid' } catch { return 'grid' }
  })
  const changeView = next => {
    setView(next)
    try { localStorage.setItem(STORAGE_VIEW_KEY, next) } catch { /* bỏ qua */ }
  }

  // Đã cập nhật: Hiển thị nhiều kho (kho Staff vừa bàn giao + Kho mẫu)
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(Boolean)
    : customerRental
      ? [customerRental]
      : []
  //Đã thêm: 05/10/2026

  return (
    <div className="customer-content-page">
      {renewItem && (
        <RenewalModal
          key={renewItem.reservationId}
          item={renewItem}
          onClose={() => setRenewItem(null)}
          onDone={() => { renewals.reload(); onRentalsChanged?.() }}
        />
      )}

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

      {rentals.length > 0 && view === 'grid' && (
        <DataGrid
          rows={rentals}
          getRowId={rental => rental.reservationId || rental.contractId || rental.unitId}
          searchText={rental => [formatReservationCode(rental.reservationId), rental.facility, rental.unitId, rental.type, rental.type && getUnitTypeStyle(rental.type).label, rental.size, rental.statusLabel].filter(Boolean).join(' ')}
          searchPlaceholder="Tìm mã đơn, cơ sở, mã kho..."
          filters={[
            {
              key: 'status',
              label: 'Trạng thái',
              options: RENTAL_STATUS_FILTERS.filter(option => rentals.some(rental => rental.status === option.value)),
              match: (rental, value) => rental.status === value
            },
            {
              key: 'facility',
              label: 'Cơ sở',
              options: [...new Set(rentals.map(rental => rental.facility).filter(Boolean))].map(name => ({ value: name, label: name })),
              match: (rental, value) => rental.facility === value
            }
          ]}
          initialSort={{ key: 'startDate', dir: 'desc' }}
          onRowClick={rental => setSelectedRental(rental)}
          caption="Bấm vào một dòng (hoặc chọn dòng rồi nhấn Enter) để xem chi tiết kho."
          toolbarExtra={(
            <div className="dg-view-toggle" role="group" aria-label="Kiểu hiển thị">
              <button type="button" className="active" aria-pressed="true">Bảng</button>
              <button type="button" aria-pressed="false" onClick={() => changeView('cards')}>Thẻ</button>
            </div>
          )}
          columns={[
            {
              key: 'reservationId',
              label: 'Mã đơn',
              sortValue: rental => Number(rental.reservationId) || 0,
              render: rental => <span className="dg-cell-strong dg-nowrap">{formatReservationCode(rental.reservationId)}</span>
            },
            { key: 'facility', label: 'Cơ sở' },
            {
              key: 'unitId',
              label: 'Kho',
              render: rental => rental.unitId
                ? <span className="dg-cell-strong dg-nowrap">{rental.unitId}</span>
                : <span className="dg-cell-sub dg-nowrap">Chưa phân kho</span>
            },
            {
              key: 'type',
              label: 'Loại · Size',
              sortValue: rental => getUnitTypeStyle(rental.type).label,
              render: rental => <>{rental.type ? <UnitTypeChip type={rental.type} compact /> : '—'}<span className="dg-cell-sub">{rental.size || '—'}</span></>
            },
            {
              key: 'startDate',
              label: 'Kỳ thuê',
              sortValue: rental => dateSortValue(rental.startDate),
              render: rental => <span className="dg-nowrap">{rental.startDate}<span className="dg-cell-sub">đến {rental.endDate}</span></span>
            },
            {
              key: 'remainingDays',
              label: 'Còn lại',
              align: 'right',
              sortValue: rental => rental.status === 'Handed Over' ? rental.remainingDays : null,
              render: rental => rental.status === 'Handed Over'
                ? <>{rental.remainingDays} ngày<div className="dg-progress" aria-hidden="true"><div style={{ width: `${rental.progress || 0}%` }} /></div></>
                : <span className="dg-cell-sub">—</span>
            },
            {
              key: 'monthlyPrice',
              label: 'Giá / tháng',
              align: 'right',
              sortValue: rental => Number(rental.monthlyPrice) || 0,
              render: rental => <span className="dg-nowrap">{new Intl.NumberFormat('vi-VN').format(Number(rental.monthlyPrice) || 0)}đ</span>
            },
            {
              key: 'paymentStatus',
              label: 'Tiền cọc',
              render: rental => rental.paymentStatus === 'Completed'
                ? <span className="dg-pill ok">Đã trả</span>
                : <span className="dg-pill warn">Chưa trả</span>
            },
            {
              key: 'status',
              label: 'Trạng thái',
              sortValue: rental => rental.statusLabel,
              render: rental => <span className={`dg-pill dg-pill-wrap ${RENTAL_STATUS_TONES[rental.status] || 'info'}`}>{rental.statusLabel}</span>
            },
          ]}
        />
      )}

      {rentals.length > 0 && view === 'cards' && (
        <div className="dg-toolbar" style={{ marginBottom: 16 }}>
          <div className="dg-view-toggle" role="group" aria-label="Kiểu hiển thị">
            <button type="button" aria-pressed="false" onClick={() => changeView('grid')}>Bảng</button>
            <button type="button" className="active" aria-pressed="true">Thẻ</button>
          </div>
        </div>
      )}

      {view === 'cards' && rentals.map(rental => ( //Map duyệt qua tất cả các kho trong mảng rentals
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

                {(() => {
                  const renewal = renewals.byReservation(rental.reservationId)
                  if (renewal?.renewedBy) {
                    return <span className="sign-badge done">Đã gia hạn đến {fmtIsoDate(renewal.renewedBy.endDate)}</span>
                  }
                  return (
                    <button
                      className="dashboard-secondary-btn"
                      type="button"
                      disabled={!renewal?.eligible}
                      title={renewal && !renewal.eligible ? renewal.reason || '' : undefined}
                      onClick={() => setRenewItem(renewal)}
                    >
                      ↻ Gia hạn
                    </button>
                  )
                })()}

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
                  ['Mã đơn', formatReservationCode(selectedRental.reservationId)],
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

function ContractPage({ customerRental, customerRentals, getCurrentUser, facilities = [], onRentalsChanged }) {
  // Danh sách hợp đồng đã bàn giao. Hợp đồng chờ ký trước bàn giao (đơn "Confirmed") được ký ở khu
  // "Hợp đồng chờ ký" phía trên, theo nhóm (một hợp đồng có thể gồm nhiều kho).
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(rental => rental?.contractId && rental.status !== 'Confirmed')
    : customerRental
      ? customerRental.contractId ? [customerRental] : []
      : []
  const [signatures, setSignatures] = useState({})
  const [signatureErrors, setSignatureErrors] = useState({})
  const [loadedSignatures, setLoadedSignatures] = useState({})
  const [openRental, setOpenRental] = useState(null)
  const [signGroup, setSignGroup] = useState(null)
  const [detail, setDetail] = useState(null) // { group, signature?, mail? }
  const renewals = useContractRenewals()
  const [renewItem, setRenewItem] = useState(null)
  const [creatingContracts, setCreatingContracts] = useState(false)
  const policies = usePolicies()
  const dialog = useDialog()
  const customer = getCurrentUser()
  const customerName = customer?.name

  /*
   * Hợp đồng ký online NGAY SAU KHI khách đặt cọc (không còn bước Facility Manager duyệt).
   * Backend: MỘT đơn đặt chỗ (có thể nhiều kho, đặt từ giỏ hàng) = MỘT hợp đồng (ContractNumber),
   * nên mỗi nhóm ở đây là một đơn; danh sách kho nằm trong rental.units (Phụ lục 01).
   */
  const allRentals = Array.isArray(customerRentals) ? customerRentals.filter(Boolean) : []
  const unitCountOf = r => (r.units?.length || r.unitCount || 1)
  const buildGroups = list => list.map(r => ({
    key: String(r.reservationId),
    code: r.contractNumber || r.reservationCode || `HĐ-${r.contractId || r.reservationId}`,
    title: unitCountOf(r) > 1
      ? `Hợp đồng thuê ${unitCountOf(r)} kho · ${r.facility}`
      : `Hợp đồng thuê kho ${r.unitId || ''}`.trim(),
    rentals: [r]
  }))
  const facilityAddressOf = group => facilities.find(f => f.name === group.rentals[0].facility)?.location
  const isSignedRental = r => Boolean(signatures[String(r.contractId)]) || r.contractStatus === 'Signed' || r.contractStatus === 'Active'
  const toSign = allRentals.filter(r => r.status === 'Confirmed' && r.contractId && !isSignedRental(r))
  const preparing = allRentals.filter(r => r.status === 'Confirmed' && !r.contractId)
  const waitingApproval = allRentals.filter(r => r.status === 'Paid')
  const signedBeforeHandover = allRentals.filter(r => r.status === 'Confirmed' && r.contractId && isSignedRental(r))

  /*
   * Không còn bước Manager duyệt: đơn đã cọc ("Paid") được xác nhận + tạo hợp đồng ngay.
   * Thường đã làm lúc thanh toán; ở đây tự thử lại nếu lần đó lỗi mạng.
   */
  const createPendingContracts = async (ids, showResult = false) => {
    setCreatingContracts(true)
    const result = await confirmAfterDeposit(ids)
    setCreatingContracts(false)
    if (result.confirmed?.length) onRentalsChanged?.()
    if (showResult && (result.error || result.failed?.length)) {
      await dialog.alert({
        tone: 'danger',
        title: 'Chưa tạo được hợp đồng',
        message: result.error?.message || result.failed.map(f => f.message).join('\n')
      })
    }
  }
  const waitingKey = waitingApproval.map(r => r.reservationId).join(',')
  useEffect(() => {
    if (waitingKey) createPendingContracts(waitingKey.split(','))
  }, [waitingKey])

  const signGroupContracts = async ({ image, termsVersion }) => {
    const done = []
    const errors = []
    for (const r of signGroup.rentals) {
      try {
        const result = await apiPost(`/api/contracts/${r.contractId}/signature`, {
          signatureImage: image,
          termsVersion: termsVersion || CONTRACT_TERMS_VERSION,
          acceptedTerms: true
        })
        done.push({ contractId: String(r.contractId), result })
      } catch (error) {
        errors.push(`${r.contractNumber || r.reservationCode || r.reservationId}: ${error.message}`)
      }
    }
    if (done.length) {
      setSignatures(current => {
        const next = { ...current }
        done.forEach(({ contractId, result }) => {
          next[contractId] = { image: result.signatureImage, signerName: result.signerName, signedAt: result.signedAt }
        })
        return next
      })
    }
    if (errors.length) throw new Error(`Chưa ký được: ${errors.join('; ')}`)
    const signedGroup = signGroup
    const remainingToSign = toSign.filter(r => !signedGroup.rentals.some(x => x.reservationId === r.reservationId)).length
    setSignGroup(null)
    const first = done[0]?.result
    const signature = first ? { image: first.signatureImage, signerName: first.signerName, signedAt: first.signedAt } : null
    // Ký xong thì gửi bản hợp đồng qua email (EmailJS). Gửi lỗi không ảnh hưởng việc ký.
    let mail
    try {
      const sent = await sendContractEmail({ group: signedGroup, customer, facilityAddress: facilityAddressOf(signedGroup), signature, policies: policies.values })
      mail = { tone: 'ok', text: `Bản hợp đồng đã được gửi tới email ${sent.sentTo}.` }
    } catch (mailError) {
      mail = { tone: 'err', text: `Chưa gửi được hợp đồng qua email: ${mailError.message} Bạn có thể bấm "Gửi qua email" để gửi lại.` }
    }
    setDetail({ group: signedGroup, signature, mail })
    await dialog.alert({
      tone: 'success',
      title: 'Đã ký hợp đồng',
      message: `Bạn đã ký hợp đồng ${signedGroup.code} (${unitCountOf(signedGroup.rentals[0])} kho). Hãy đến cơ sở vào ngày ${signedGroup.rentals[0].startDate} để nhận kho, mang theo CCCD.\n${mail.text}${remainingToSign > 0 ? `\nBạn còn ${remainingToSign} hợp đồng chờ ký.` : ''}`
    })
  }

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
  }, [customerName, rentals.map(keyOf).join(',')])

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

      <RenewalSection renewals={renewals} onRenew={setRenewItem} />

      {renewItem && (
        <RenewalModal
          key={renewItem.reservationId}
          item={renewItem}
          onClose={() => setRenewItem(null)}
          onDone={() => { renewals.reload(); onRentalsChanged?.() }}
        />
      )}

      {(toSign.length > 0 || preparing.length > 0 || waitingApproval.length > 0 || signedBeforeHandover.length > 0) && (
        <section className="sign-queue" aria-label="Hợp đồng đang xử lý">
          {buildGroups(toSign).map(group => (
            <article key={group.key} className="sign-card">
              <div>
                <span className="sign-badge todo">Chờ bạn ký</span>
                <h3>{group.title}</h3>
                <p>Mã {group.code} · {group.rentals[0].startDate} → {group.rentals[0].endDate} · Đã đặt cọc, kho đã được giữ cho bạn.</p>
                <div className="sign-units">{group.rentals.flatMap(r => r.units || []).map(u => <span key={u.number}>{u.number}</span>)}</div>
              </div>
              <div className="sign-actions">
                <button type="button" className="dashboard-secondary-btn" onClick={() => setDetail({ group })}>Xem chi tiết</button>
                <button type="button" className="dashboard-primary-btn" onClick={() => setSignGroup(group)}>Xem & ký hợp đồng</button>
              </div>
            </article>
          ))}
          {buildGroups(preparing).map(group => (
            <article key={group.key} className="sign-card waiting">
              <div>
                <span className="sign-badge wait">Đang tạo hợp đồng</span>
                <h3>{group.title}</h3>
                <p>Đã nhận tiền cọc. Hợp đồng sẽ sẵn sàng để ký ngay khi hệ thống tạo xong.</p>
              </div>
            </article>
          ))}
          {buildGroups(waitingApproval).map(group => (
            <article key={group.key} className="sign-card waiting">
              <div>
                <span className="sign-badge wait">Đang tạo hợp đồng</span>
                <h3>{group.title}</h3>
                <p>Đã nhận tiền cọc, hệ thống đang tạo hợp đồng để bạn ký. Nếu chờ lâu, bấm "Tạo hợp đồng ngay".</p>
                <div className="sign-units">{group.rentals.flatMap(r => r.units || []).map(u => <span key={u.number}>{u.number}</span>)}</div>
              </div>
              <div className="sign-actions">
                <button type="button" className="dashboard-secondary-btn" onClick={() => setDetail({ group })}>Xem bản xem trước</button>
                <button type="button" className="dashboard-primary-btn" disabled={creatingContracts} onClick={() => createPendingContracts(group.rentals.map(r => r.reservationId), true)}>
                  {creatingContracts ? 'Đang tạo...' : 'Tạo hợp đồng ngay'}
                </button>
              </div>
            </article>
          ))}
          {buildGroups(signedBeforeHandover).map(group => (
            <article key={group.key} className="sign-card signed">
              <div>
                <span className="sign-badge done">Đã ký · Chờ nhận kho</span>
                <h3>{group.title}</h3>
                <p>Đến cơ sở vào ngày {group.rentals[0].startDate} để nhận kho, mang theo CCCD.</p>
                <div className="sign-units">{group.rentals.flatMap(r => r.units || []).map(u => <span key={u.number}>{u.number}</span>)}</div>
              </div>
              <div className="sign-actions">
                <button type="button" className="dashboard-primary-btn" onClick={() => setDetail({ group })}>Xem chi tiết hợp đồng</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {signGroup && (
        <ContractSignFlow group={signGroup} customer={customer} onClose={() => setSignGroup(null)} onSign={signGroupContracts} />
      )}

      {detail && !signGroup && (
        <ContractDetailModal
          key={detail.group.key}
          group={detail.group}
          customer={customer}
          facilityAddress={facilityAddressOf(detail.group)}
          knownSignature={detail.signature}
          autoMailResult={detail.mail}
          onClose={() => setDetail(null)}
          onSign={group => { setDetail(null); setSignGroup(group) }}
        />
      )}

      {rentals.length === 0 && <div className="empty-state">Chưa có hợp đồng trong database.</div>}
      {rentals.map(rental => {
        const signature = signatures[keyOf(rental)]
        const isSigned = !!signature
        const signatureError = signatureErrors[keyOf(rental)]
        const signatureLoaded = loadedSignatures[keyOf(rental)]
        const renewal = renewals.byReservation(rental.reservationId)

        return (
          <div key={keyOf(rental)} style={{ marginBottom: 28 }}>
            <div className="contract-card">

              <div className="contract-header">

                <div>
                  <span>HỢP ĐỒNG THUÊ KHO</span>

                  <h2>
                    Hợp đồng {rental.contractNumber || `#${keyOf(rental)}`}
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

              {renewal?.renewedFrom && (
                <p className="contract-renew-note">
                  Hợp đồng gia hạn từ <strong>{renewal.renewedFrom.contractNumber}</strong> ({fmtIsoDate(renewal.renewedFrom.startDate)} → {fmtIsoDate(renewal.renewedFrom.endDate)}). Bạn tiếp tục dùng kho, không cần nhận lại.
                </p>
              )}
              {renewal?.renewedBy && (
                <p className="contract-renew-note">
                  Đã gia hạn bằng hợp đồng <strong>{renewal.renewedBy.contractNumber}</strong> đến {fmtIsoDate(renewal.renewedBy.endDate)}.
                </p>
              )}

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
                  onClick={() => setDetail({ group: buildGroups([rental])[0], signature: signature || undefined })}
                >
                  Xem chi tiết hợp đồng
                </button>

                {renewal?.eligible && (
                  <button type="button" className="dashboard-secondary-btn" onClick={() => setRenewItem(renewal)}>
                    ↻ Gia hạn
                  </button>
                )}

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
  const dialog = useDialog()
  const [paying, setPaying] = useState(null)
  const payWithVnPay = async items => {
    setPaying(items.map(i => i.reservationId).join(','))
    try {
      await startVnPayPayment(items.map(i => i.reservationId), { amount: items.reduce((n, i) => n + Number(i.depositAmount || 0), 0), count: items.length })
    } catch (error) {
      setPaying(null)
      await dialog.alert({ tone: 'danger', title: 'Chưa mở được trang thanh toán VNPay', message: error.message })
    }
  }
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
          {pending.length > 1 && (
            <button type="button" className="dashboard-primary-btn" disabled={Boolean(paying)} onClick={() => payWithVnPay(pending)}>
              {paying ? 'Đang chuyển...' : `Thanh toán tất cả qua VNPay`}
            </button>
          )}
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
                <p>{item.unitId || 'Chưa phân kho'} · Mã đơn {formatReservationCode(item.reservationId)}</p>
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
            {item.status === 'Pending Deposit' && item.paymentStatus !== 'Completed' && (
              <div className="contract-actions">
                <button type="button" className="dashboard-primary-btn" disabled={Boolean(paying)} onClick={() => payWithVnPay([item])}>
                  {paying === String(item.reservationId) ? 'Đang chuyển sang VNPay...' : `Thanh toán ${formatMoney(item.depositAmount)} qua VNPay`}
                </button>
              </div>
            )}
          </div>
        </section>
      ))}
      <div className="payment-warning">
        Tiền cọc được thanh toán qua cổng VNPay (môi trường thử nghiệm). Giao dịch chỉ được ghi nhận khi VNPay xác nhận và hệ thống kiểm tra đúng chữ ký, số tiền.
      </div>
    </div>
  )
}

/* Hồ sơ tài khoản (chỉ xem). Backend hiện chưa có API sửa hồ sơ / đổi mật khẩu. */
function ProfilePage({ user, rentals, onLogout, onOpenStorage }) {
  const activeCount = rentals.filter(item => item.status === 'Handed Over').length
  const pendingCount = rentals.filter(item => item.status === 'Pending Deposit').length
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()
  const rows = [
    ['Họ và tên', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Loại tài khoản', 'Khách hàng thuê kho'],
    ['Mã khách hàng', user?.userId ? `KH-${user.userId}` : '—']
  ]
  return (
    <div className="customer-content-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">MY PROFILE</span>
          <h1>Hồ sơ của tôi</h1>
          <p>Thông tin tài khoản dùng để đặt kho và nhận thông báo từ StoreSpace.</p>
        </div>
      </div>

      <section className="profile-card">
        <div className="profile-head">
          <span className="profile-avatar" aria-hidden="true">{initial}</span>
          <div>
            <h2>{user?.name || 'Khách hàng'}</h2>
            <p>{user?.email}</p>
          </div>
        </div>
        <dl className="profile-info">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <div className="profile-stats">
          <button type="button" onClick={onOpenStorage}><strong>{rentals.length}</strong><span>Tổng đơn đặt kho</span></button>
          <button type="button" onClick={onOpenStorage}><strong>{activeCount}</strong><span>Kho đang thuê</span></button>
          <button type="button" onClick={onOpenStorage}><strong>{pendingCount}</strong><span>Chờ thanh toán cọc</span></button>
        </div>
        <p className="profile-note">Muốn đổi họ tên, email hoặc mật khẩu, vui lòng liên hệ <a href="mailto:support@storespace.vn">support@storespace.vn</a>. Chức năng tự chỉnh sửa sẽ có khi hệ thống hỗ trợ.</p>
        <div className="profile-actions">
          <button type="button" className="dashboard-secondary-btn" onClick={onLogout}>Đăng xuất</button>
        </div>
      </section>
    </div>
  )
}

function CustomerDashboard({ facilities, storageUnits, customerRental, customerRentals, getCurrentUser, navigate, currentUserKey, onReloadRentals }) {
  const user = getCurrentUser()
  // Đã cập nhật: Danh sách kho đang thuê, kho Staff vừa bàn giao đứng đầu (05/10/2026)
  const rentals = Array.isArray(customerRentals)
    ? customerRentals.filter(Boolean)
    : customerRental
      ? [customerRental]
      : []
  const activeRentals = rentals.filter(item => item.status === 'Handed Over')
  const rental = activeRentals[0] || rentals[0] || null
  const unpaidReservations = rentals.filter(item =>
    item.status === 'Pending Deposit' && item.paymentStatus !== 'Completed'
  )
  const pendingAmount = unpaidReservations.reduce(
    (total, item) => total + Number(item.depositAmount || 0),
    0
  )
  const expiringRentals = activeRentals.filter(item => item.remainingDays <= 30)
  const [activeSection, setActiveSection] = useState(() => takeCustomerSection('overview'))

  const logout = () => {
    localStorage.removeItem(currentUserKey)
    navigate('/')
  }

  // if (!rental) {
  //   return (
  //     <div className="customer-layout">
  //       <main className="customer-main">
  //         <div className="customer-page-heading">
  //           <div>
  //             <span className="customer-eyebrow">CUSTOMER DASHBOARD</span>
  //             <h1>Xin chào, {user?.name || 'Customer'}!</h1>
  //             <p>Tài khoản hiện chưa có kho thuê hoặc đặt chỗ.</p>
  //           </div>
  //         </div>
  //         <div className="empty-state">
  //           <p>Dữ liệu đặt thuê sẽ hiển thị tại đây sau khi được tải từ hệ thống.</p>
  //           <button className="dashboard-primary-btn" type="button" onClick={() => navigate('/facilities')}>
  //             Tìm kho
  //           </button>
  //           <button className="dashboard-secondary-btn" type="button" onClick={logout}>
  //             Đăng xuất
  //           </button>
  //         </div>
  //       </main>
  //     </div>
  //   )
  // }

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

          <button
            type="button"
            className={activeSection === 'profile' ? 'active' : ''}
            onClick={() => setActiveSection('profile')}
          >
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
                <strong>{rental?.remainingDays ?? '—'}</strong>
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


              {/* <div className="overview-rental-card">

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

              </div> */}

              {rental ? (
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
              ) : (
                <div className="empty-state">
                  <p>Bạn chưa có kho nào được đặt hoặc đang thuê.</p>

                  <button
                    className="dashboard-primary-btn"
                    type="button"
                    onClick={() => navigate('/facilities')}
                  >
                    Tìm kho
                  </button>
                </div>
              )}

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
                      #{rental?.contractId || rental?.reservationId}
                    </strong>
                  </div>

                  <div>
                    <span>Trạng thái</span>
                    <strong className="contract-active">
                      {rental?.contractStatus || rental?.statusLabel}
                    </strong>
                  </div>

                  <div>
                    <span>Ngày hết hạn</span>
                    <strong>{rental?.endDate}</strong>
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
                      <strong>Đơn {formatReservationCode(item.reservationId)} · {item.statusLabel}</strong>
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
          <MyStoragePage customerRental={customerRental} customerRentals={rentals} facilities={facilities} onRentalsChanged={onReloadRentals} />
        )}

        {activeSection === 'contract' && (
          <ContractPage customerRental={customerRental} customerRentals={rentals} getCurrentUser={getCurrentUser} facilities={facilities} onRentalsChanged={onReloadRentals} />
        )}


        {activeSection === 'payment' && (
          <CustomerPaymentPage reservations={rentals} />
        )}

        {activeSection === 'profile' && (
          <ProfilePage user={user} rentals={rentals} onLogout={logout} onOpenStorage={() => setActiveSection('storage')} />
        )}



      </main>

    </div>
    // {/* </div> */}
  )
}



// Export only the main customer dashboard to App.jsx.
export default CustomerDashboard
