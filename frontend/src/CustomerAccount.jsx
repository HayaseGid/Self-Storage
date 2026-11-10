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
import { focusContract, takePendingContractFocus } from './afterDeposit'
import { OPEN_SECTION_EVENT, RENEW_REQUEST_KEY, clearContractSignRequest, confirmAfterDeposit, peekContractSignRequest, requestContractSign, requestRenewal, takeCustomerSection, takeRenewalRequest } from './afterDeposit'
import { useCustomerNotifications } from './customerNoticeData'
import CustomerNotificationsPage, { NotificationsPreview } from './CustomerNotifications'
import CancelReservationModal, { retryRefund } from './CancelReservation'
import ContractCard from './ContractCard'
import { ReturnRequestModal, ReturnSection, useUnitReturns } from './UnitReturn'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from './vnpay'
import { payLateFeesDemo, useLateFees } from './lateFees'
import { CustomerPaymentCenter, PendingDepositBar, pendingDepositsOf } from './PendingPayments' // [THÊM] trang Thanh toán mới + nhắc đơn chưa đặt cọc
import { useMyInspections } from './ReturnInspection' // [THÊM 14] thông báo kết quả kiểm kho chờ xác nhận
import { Code, FilterChips, Pager, UnitCodes, newestFirst, useClientPaging } from './listKit' // [THÊM] phân trang + mã nổi bật + mới nhất lên đầu
import './CustomerAccount.css'

/* Cấu hình định danh rõ vai trò từng tab cho Khách hàng thuê kho */
const CUSTOMER_TABS = {
  overview: {
    id: 'overview',
    badge: 'Bảng điều khiển',
    title: 'Tổng quan',
    subtitle: 'Tóm tắt trạng thái & việc cần xử lý',
    purposeTitle: 'Tổng quan tài khoản & Nhắc việc quan trọng',
    purposeDesc: 'Nắm bắt nhanh các khoản cần thanh toán, hợp đồng chờ ký, thời hạn kho đang thuê và chuyển nhanh đến đúng tác vụ bạn cần.',
    pills: ['Nhắc việc ưu tiên', 'Thống kê nhanh', 'Lối tắt tác vụ']
  },
  storage: {
    id: 'storage',
    badge: 'Vận hành & Ra vào kho',
    title: 'Kho của tôi',
    subtitle: 'Mã PIN ra vào, vị trí & tác vụ theo kho',
    purposeTitle: 'Quản lý kho lưu trữ, Thẻ ra vào & Tác vụ theo từng ô kho',
    purposeDesc: 'Tra cứu mã PIN ra vào cổng, vị trí tầng/khu, diện tích ô kho và thực hiện ngay các tác vụ của từng kho: đóng cọc, ký hợp đồng, đóng tiền thuê, gia hạn hoặc báo trả kho.',
    pills: ['Mã PIN ra vào kho', 'Sơ đồ & Địa chỉ cơ sở', 'Tác vụ nhanh trên từng kho']
  },
  contract: {
    id: 'contract',
    badge: 'Pháp lý & Thủ tục',
    title: 'Hợp đồng & Pháp lý',
    subtitle: 'Ký điện tử, văn bản HĐ, gia hạn & trả kho',
    purposeTitle: 'Quản lý hồ sơ pháp lý: Ký hợp đồng, Gia hạn & Thủ tục trả kho',
    purposeDesc: 'Ký hợp đồng/phụ lục trực tuyến, tải văn bản hợp đồng pháp lý, đăng ký gia hạn thêm kỳ mới hoặc đặt lịch hẹn nhân viên kiểm tra trả kho.',
    pills: ['Ký điện tử (E-Sign)', 'Phụ lục gia hạn', 'Đăng ký & Biên bản trả kho']
  },
  payment: {
    id: 'payment',
    badge: 'Tài chính & Hóa đơn',
    title: 'Thanh toán & Hóa đơn',
    subtitle: 'Đóng cọc, tiền thuê định kỳ, phí trễ & hoàn tiền',
    purposeTitle: 'Trung tâm Thanh toán: Tiền cọc, Hóa đơn thuê kho, Phí phát sinh & Hoàn tiền',
    purposeDesc: 'Thanh toán tập trung mọi khoản phí hiện tại (tiền cọc giữ kho, hóa đơn tiền thuê định kỳ hằng tháng, phí trễ hạn), tra cứu lịch sử biên lai và theo dõi tiến trình hoàn tiền cọc.',
    pills: ['Đóng tiền cọc & tiền thuê', 'Phí trễ hạn & phát sinh', 'Lịch sử & Tiến trình hoàn cọc']
  },
  notifications: {
    id: 'notifications',
    badge: 'Cảnh báo hệ thống',
    title: 'Thông báo',
    subtitle: 'Nhắc hạn thuê, lịch bàn giao & biên bản',
    purposeTitle: 'Hộp thư thông báo & Xác nhận biên bản kiểm kho',
    purposeDesc: 'Nhận thông báo tự động khi hợp đồng sẵn sàng ký, kho sắp hết hạn, nhắc lịch đóng tiền thuê hoặc xác nhận biên bản kiểm tra kho khi trả.',
    pills: ['Nhắc lịch tự động', 'Xác nhận biên bản kiểm kho']
  },
  profile: {
    id: 'profile',
    badge: 'Định danh khách hàng',
    title: 'Hồ sơ cá nhân',
    subtitle: 'Thông tin chủ hợp đồng & bảo mật',
    purposeTitle: 'Hồ sơ chủ hợp đồng & Thông tin liên hệ',
    purposeDesc: 'Thông tin cá nhân được sử dụng để lập hợp đồng thuê kho điện tử, đối chiếu CCCD khi bàn giao kho tại cơ sở và gửi hóa đơn qua email.',
    pills: ['Thông tin định danh', 'Email nhận hợp đồng']
  }
}

function NavIcon({ name }) {
  switch (name) {
    case 'overview':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      )
    case 'storage':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9.5L12 4l9 5.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 21V13h6v8" />
        </svg>
      )
    case 'contract':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </svg>
      )
    case 'payment':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      )
    case 'notifications':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )
    case 'profile':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )
    case 'search':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      )
    default:
      return null
  }
}

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

function MyStoragePage({ customerRental, customerRentals, facilities, onRentalsChanged, onOpenPayment, onOpenContract, onSignContract }) {
  const [selectedRental, setSelectedRental] = useState(null)
  const renewals = useContractRenewals()
  const returns = useUnitReturns()
  const lateFees = useLateFees()
  const dialog = useDialog()
  const [renewItem, setRenewItem] = useState(null)
  const [returnItem, setReturnItem] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
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
  const activeRentals = rentals.filter(rental => rental.status === 'Handed Over')
  // [THÊM] Kiểu thẻ: mới nhất lên đầu, chia trang 5 thẻ / trang
  const cardPaging = useClientPaging(newestFirst(rentals, { id: r => r.reservationId }), { pageSize: 5 })

  const lateUnpaidOf = rental => (lateFees.byReservation(rental.reservationId)?.lateFees || [])
    .filter(f => f.status === 'Unpaid' && !f.pendingPayment)
    .reduce((n, f) => n + Number(f.amount || 0), 0)

  const copyPin = (id, text) => {
    if (!text) return
    try {
      navigator.clipboard?.writeText(String(text))
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(curr => (curr === id ? null : curr)), 1800)
    } catch { /* bỏ qua */ }
  }

  const openReturnFor = rental => {
    const info = returns.byReservation(rental.reservationId)
    if (info?.eligible) {
      setReturnItem(info)
    } else {
      dialog.alert({
        tone: 'warning',
        title: 'Chưa thể đăng ký trả kho',
        message: returns.error
          ? `Không tải được thông tin trả kho: ${returns.error}`
          : info?.reason || (returns.loading ? 'Đang tải thông tin trả kho, vui lòng thử lại sau giây lát.' : 'Kho này hiện chưa đủ điều kiện báo trả kho hoặc đã có yêu cầu trả kho đang xử lý.')
      })
    }
  }

  /* Tác vụ nhanh theo trạng thái thực tế của từng kho:
     - Chưa đặt cọc -> Đóng tiền cọc (trỏ sang Thanh toán)
     - Có hợp đồng chưa ký -> Ký hợp đồng (trỏ sang Hợp đồng & mở luồng ký)
     - Có tiền thuê / phí trễ đến hạn -> Đóng tiền thuê (trỏ sang Thanh toán)
     - Đang thuê -> Xem hợp đồng, Gia hạn, Báo trả kho */
  const renderUnitActions = (rental, { stopProp = false } = {}) => {
    const wrap = fn => event => {
      if (stopProp) event.stopPropagation()
      fn()
    }
    const needDeposit = rental.status === 'Pending Deposit' && rental.paymentStatus !== 'Completed'
    const isSigned = rental.contractStatus === 'Signed' || rental.contractStatus === 'Active'
    const needSign = Boolean(rental.contractId && !isSigned && (rental.status === 'Confirmed' || rental.isRenewal))
    const rentDue = Number(rental.rentPayableNow || 0) + lateUnpaidOf(rental)
    const renewal = renewals.byReservation(rental.reservationId)
    const returnInfo = returns.byReservation(rental.reservationId)

    return (
      <div className="cportal-unit-actions" onClick={stopProp ? e => e.stopPropagation() : undefined}>
        {needDeposit && onOpenPayment && (
          <button type="button" className="cportal-action-chip warn" onClick={wrap(() => onOpenPayment())}>
            💳 Đóng tiền cọc
          </button>
        )}
        {needSign && onSignContract && (
          <button type="button" className="cportal-action-chip accent" onClick={wrap(() => onSignContract(rental))}>
            ✍️ Ký hợp đồng
          </button>
        )}
        {rentDue > 0 && onOpenPayment && (
          <button type="button" className="cportal-action-chip warn" onClick={wrap(() => onOpenPayment())}>
            💰 Đóng phí ({new Intl.NumberFormat('vi-VN').format(rentDue)}đ)
          </button>
        )}
        {rental.contractId && onOpenContract && (
          <button type="button" className="cportal-action-chip" onClick={wrap(() => onOpenContract(rental.reservationId))}>
            📄 Hợp đồng
          </button>
        )}
        {rental.status === 'Handed Over' && !renewal?.renewedBy && (
          <button
            type="button"
            className="cportal-action-chip"
            disabled={!renewal?.eligible}
            title={renewal && !renewal.eligible ? renewal.reason || '' : 'Gia hạn thêm kỳ thuê mới'}
            onClick={wrap(() => setRenewItem(renewal))}
          >
            ↻ Gia hạn
          </button>
        )}
        {rental.status === 'Handed Over' && (
          returnInfo?.request ? (
            <button type="button" className="cportal-action-chip" onClick={wrap(() => onOpenContract?.(rental.reservationId))}>
              ⇦ Đang trả kho
            </button>
          ) : (
            <button type="button" className="cportal-action-chip" onClick={wrap(() => openReturnFor(rental))}>
              ⇦ Báo trả kho
            </button>
          )
        )}
      </div>
    )
  }

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
      {returnItem && (
        <ReturnRequestModal
          item={returnItem}
          rules={returns.rules}
          fees={returns.fees}
          onClose={() => setReturnItem(null)}
          onDone={() => { returns.reload(); onRentalsChanged?.() }}
        />
      )}

      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">
            VẬN HÀNH & THẺ RA VÀO KHO
          </span>

          <h1>Kho của tôi</h1>

          <p>Tra cứu mã PIN ra vào cổng, vị trí ô kho và thao tác nhanh (đóng phí, ký hợp đồng, gia hạn, trả kho) cho từng kho.</p>
        </div>

        <span className="page-count">
          {activeRentals.length} kho đang sử dụng · {rentals.length} tổng đơn
        </span>
      </div>

      {/* THẺ RA VÀO NHANH CHO CÁC KHO ĐANG SỬ DỤNG */}
      {activeRentals.length > 0 && (
        <section className="cportal-access-section" aria-label="Thẻ ra vào kho đang thuê">
          <div className="cportal-access-grid">
            {activeRentals.slice(0, 3).map(item => {
              const fac = facilities.find(f => f.name === item.facility)
              const pinValue = item.accessValue || `PIN-${String(item.reservationId || '100').padStart(4, '0')}`
              const keyId = item.reservationId || item.unitId
              const rentDue = Number(item.rentPayableNow || 0) + lateUnpaidOf(item)
              const renewal = renewals.byReservation(item.reservationId)
              return (
                <article key={keyId} className="cportal-access-card">
                  <div className="cportal-access-top">
                    <div>
                      <span className="cportal-access-kicker">THẺ RA VÀO KHO · {item.facility}</span>
                      <h3>Ô kho {item.unitId || (item.unitNumbers || []).join(', ') || 'Đang sử dụng'}</h3>
                      <p>{item.type} · {item.size} {item.location ? `· ${item.location}` : '· Tầng 1 · Khu A'}</p>
                    </div>
                    <span className="cportal-access-status">● Đang hoạt động</span>
                  </div>

                  <div className="cportal-access-pin-box">
                    <div>
                      <small>{item.accessType || 'Mã PIN cổng & khóa điện tử'}</small>
                      <span className="cportal-access-pin-code">{pinValue}</span>
                    </div>
                    <button
                      type="button"
                      className="cportal-copy-btn"
                      onClick={() => copyPin(keyId, pinValue)}
                    >
                      {copiedId === keyId ? '✓ Đã sao chép' : 'Sao chép mã'}
                    </button>
                  </div>

                  <div className="cportal-access-actions">
                    {rentDue > 0 && onOpenPayment && (
                      <button type="button" className="cportal-access-btn primary" onClick={() => onOpenPayment()}>
                        💰 Đóng tiền thuê ({new Intl.NumberFormat('vi-VN').format(rentDue)}đ)
                      </button>
                    )}
                    {onOpenContract && (
                      <button type="button" className="cportal-access-btn" onClick={() => onOpenContract(item.reservationId)}>
                        📄 Hợp đồng
                      </button>
                    )}
                    {renewal?.eligible && !renewal?.renewedBy && (
                      <button type="button" className="cportal-access-btn" onClick={() => setRenewItem(renewal)}>
                        ↻ Gia hạn
                      </button>
                    )}
                    <button type="button" className="cportal-access-btn" onClick={() => openReturnFor(item)}>
                      ⇦ Báo trả kho
                    </button>
                    <button type="button" className="cportal-access-btn" onClick={() => setSelectedRental(item)}>
                      Chi tiết kho
                    </button>
                  </div>

                  <div className="cportal-access-meta">
                    <span>📍 {fac?.location || 'Mở cửa 24/7 (06:00 – 22:00 hỗ trợ trực tiếp)'}</span>
                    <strong>Còn {item.remainingDays} ngày</strong>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

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
          getCreatedAt={rental => rental.createdAt}
          onRowClick={rental => setSelectedRental(rental)}
          caption="Bấm vào một dòng để xem chi tiết kho, hoặc dùng cột 'Tác vụ nhanh' để đóng phí, ký hợp đồng, gia hạn, trả kho."
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
              render: rental => <Code kind="order">{rental.reservationCode || formatReservationCode(rental.reservationId)}</Code>
            },
            { key: 'facility', label: 'Cơ sở' },
            {
              key: 'unitId',
              label: 'Kho',
              render: rental => <UnitCodes units={rental.unitNumbers?.length ? rental.unitNumbers : rental.unitId} max={3} />
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
              key: 'status',
              label: 'Trạng thái',
              sortValue: rental => rental.statusLabel,
              render: rental => <span className={`dg-pill dg-pill-wrap ${RENTAL_STATUS_TONES[rental.status] || 'info'}`}>{rental.statusLabel}</span>
            },
            {
              key: 'actions',
              label: 'Tác vụ nhanh',
              render: rental => renderUnitActions(rental, { stopProp: true })
            }
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

      {view === 'cards' && cardPaging.pageRows.map(rental => ( //Map duyệt qua các kho của trang đang xem
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

              <div className="storage-actions" style={{ flexWrap: 'wrap', gap: 10 }}>

                <button
                  type="button"
                  className="dashboard-primary-btn"
                  onClick={() => setSelectedRental(rental)}
                >
                  Xem chi tiết kho
                </button>

                {renderUnitActions(rental)}

              </div>

            </div>

          </div>

          <div className="storage-summary-grid">

            <div className="customer-info-card">
              <span className="customer-eyebrow">
                QUYỀN TRUY CẬP & MÃ PIN
              </span>

              <h2>Quyền truy cập</h2>

              <div className="access-code">
                <span>{rental.accessType || 'Chưa được bàn giao'}</span>
                <strong>{rental.accessValue || '—'}</strong>
              </div>

              <p>
                Mã truy cập được dùng để mở cổng và vào khu vực kho
                của bạn.
              </p>
            </div>

            <div className="customer-info-card">
              <span className="customer-eyebrow">
                ĐỊA CHỈ & VỊ TRÍ Ô KHO
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
      {view === 'cards' && <Pager {...cardPaging.pagerProps} unit="kho" />}

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
                  THÔNG TIN VẬN HÀNH Ô KHO
                </span>

                <h2>Chi tiết kho lưu trữ</h2>

                <p>
                  Thông tin kỹ thuật, mã ra vào và tác vụ nhanh cho kho của bạn tại StoreSpace.
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
                CƠ SỞ LƯU TRỮ & SƠ ĐỒ VỊ TRÍ
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
                Vị trí ô kho: {selectedRental.location || 'Tầng 1 · Khu A'}
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
                  ['Mã đơn', <Code kind="order">{selectedRental.reservationCode || formatReservationCode(selectedRental.reservationId)}</Code>],
                  ['Mã kho', <UnitCodes units={selectedRental.unitNumbers?.length ? selectedRental.unitNumbers : selectedRental.unitId} max={8} />],
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

            {/* TÁC VỤ NHANH TRÊN KHO NÀY */}
            <section style={{ marginTop: 24 }}>
              <h3>Tác vụ liên quan đến kho này</h3>
              <div style={{ marginTop: 12 }}>
                {renderUnitActions(selectedRental)}
              </div>
            </section>

            <button
              type="button"
              className="dashboard-primary-btn full"
              style={{ marginTop: 24 }}
              onClick={() => setSelectedRental(null)}
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function ContractPage({ customerRental, customerRentals, getCurrentUser, facilities = [], onRentalsChanged, onOpenPayment }) {
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
  const [cancelRental, setCancelRental] = useState(null)
  const returns = useUnitReturns()
  const lateFees = useLateFees() // [7a] phí trễ hạn tiền thuê
  const lateFeeOf = rental => {
    const item = lateFees.byReservation(rental.reservationId)
    return item ? { ...item, policy: lateFees.policy } : null
  }
  const lateUnpaidOf = rental => (lateFeeOf(rental)?.lateFees || [])
    .filter(f => f.status === 'Unpaid' && !f.pendingPayment)
    .reduce((n, f) => n + Number(f.amount || 0), 0)
  const [returnItem, setReturnItem] = useState(null)
  const [creatingContracts, setCreatingContracts] = useState(false)
  const policies = usePolicies()
  const dialog = useDialog()
  const customer = getCurrentUser()
  const customerName = customer?.name

  /* Đóng tiền thuê: sau khi nhận kho (toàn bộ hoặc tháng đầu) / từng kỳ khi đang thuê.
     Backend quyết định đóng được bao nhiêu (GET/POST /api/rent-payments, POST /api/vnpay/create). */
  const [payingRent, setPayingRent] = useState(null)
  const payRent = async rental => {
    // [7a] tiền thuê đóng được ngay + phí trễ hạn chưa đóng (VNPay thu chung 1 giao dịch)
    const rentAmount = Number(rental.rentPayableNow || 0)
    const lateAmount = lateUnpaidOf(rental)
    const amount = rentAmount + lateAmount
    if (!amount) return
    const vnd = n => new Intl.NumberFormat('vi-VN').format(n)
    const ok = await dialog.confirm({
      tone: 'info',
      title: `Đóng ${vnd(amount)}đ${lateAmount > 0 ? (rentAmount > 0 ? ' (tiền thuê + phí trễ hạn)' : ' phí trễ hạn') : ' tiền thuê'}?`,
      message: `Hợp đồng ${rental.contractNumber || rental.reservationCode} · ${rental.paymentPlan === 'Upfront' ? 'trả 1 lần (toàn bộ kỳ thuê)' : 'trả theo tháng'}.` +
        (lateAmount > 0 ? `\nGồm ${rentAmount > 0 ? `${vnd(rentAmount)}đ tiền thuê và ` : ''}${vnd(lateAmount)}đ phí trễ hạn.` : ''),
      confirmLabel: 'Đóng tiền'
    })
    if (!ok) return
    setPayingRent(rental.reservationId)
    try {
      const demo = SIMULATED_PAYMENT_ENABLED && await dialog.confirm({
        tone: 'info', title: 'Chọn cách thanh toán', message: 'Đang bật chế độ demo. Thanh toán mô phỏng (không qua VNPay)?',
        confirmLabel: 'Mô phỏng', cancelLabel: 'Qua VNPay'
      })
      if (!demo) {
        await startVnPayPayment([rental.reservationId], { amount, count: 1, label: rental.contractNumber, kind: 'rent' })
        return
      }
      const messages = []
      if (rentAmount > 0) messages.push((await apiPost(`/api/rent-payments/${rental.reservationId}/pay-demo`, {})).message)
      if (lateAmount > 0) messages.push((await payLateFeesDemo(rental.reservationId)).message)
      onRentalsChanged?.()
      lateFees.reload()
      await dialog.alert({ tone: 'success', title: 'Đã thanh toán', message: messages.join(' ') })
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa đóng được tiền thuê', message: error.message })
    } finally {
      setPayingRent(null)
    }
  }

  /*
   * Hợp đồng ký online NGAY SAU KHI khách đặt cọc (không còn bước Facility Manager duyệt).
   * Backend: MỘT đơn đặt chỗ (có thể nhiều kho, đặt từ giỏ hàng) = MỘT hợp đồng (ContractNumber),
   * nên mỗi nhóm ở đây là một đơn; danh sách kho nằm trong rental.units (Phụ lục 01).
   */
  const allRentals = Array.isArray(customerRentals) ? customerRentals.filter(Boolean) : []
  const unitCountOf = r => (r.units?.length || r.unitCount || 1)
  // Phụ lục gia hạn: lấy hợp đồng gốc từ API danh sách đặt chỗ, hoặc từ API gia hạn (nếu backend dùng API cũ).
  const renewedFromOf = r => r.renewedFrom || renewals.byReservation(r.reservationId)?.renewedFrom || null
  const isRenewalRental = r => Boolean(r.isRenewal || renewedFromOf(r))
  const buildGroups = list => list.map(r => ({
    key: String(r.reservationId),
    code: r.contractNumber || r.reservationCode || `HĐ-${r.contractId || r.reservationId}`,
    title: isRenewalRental(r)
      ? `Phụ lục gia hạn${renewedFromOf(r)?.contractNumber ? ` HĐ ${renewedFromOf(r).contractNumber}` : ''} · ${unitCountOf(r) > 1 ? `${unitCountOf(r)} kho` : `kho ${r.unitId || ''}`.trim()}`
      : unitCountOf(r) > 1
        ? `Hợp đồng thuê ${unitCountOf(r)} kho · ${r.facility}`
        : `Hợp đồng thuê kho ${r.unitId || ''}`.trim(),
    renewedFrom: renewedFromOf(r),
    rentals: [r]
  }))
  const facilityAddressOf = group => facilities.find(f => f.name === group.rentals[0].facility)?.location
  const isSignedRental = r => Boolean(signatures[String(r.contractId)]) || r.contractStatus === 'Signed' || r.contractStatus === 'Active'
  // Chờ ký: hợp đồng mới (đã cọc) + phụ lục gia hạn chưa ký (khách vẫn đang dùng kho nên đơn ở trạng thái "Handed Over").
  const toSign = allRentals.filter(r => r.contractId && !isSignedRental(r) &&
    (r.status === 'Confirmed' || (r.status === 'Handed Over' && isRenewalRental(r))))
  const preparing = allRentals.filter(r => r.status === 'Confirmed' && !r.contractId)
  const waitingApproval = allRentals.filter(r => r.status === 'Paid')
  const signedBeforeHandover = allRentals.filter(r => r.status === 'Confirmed' && r.contractId && isSignedRental(r))

  /*
   * [SỬA] Chia trang Hợp đồng thành các tab để khách thấy ngay mình đang ở đâu:
   *   pending  - đã cọc: chờ ký / đang tạo hợp đồng / đã ký chờ nhận kho
   *   active   - đang thuê (kèm gia hạn)
   *   returns  - đang trả kho / chờ quyết toán, hoàn cọc
   *   ended    - đã kết thúc
   */
  const activeRentals = rentals.filter(r => r.status === 'Handed Over')
  const endedRentals = rentals.filter(r => r.status !== 'Handed Over')
  const pendingCountAll = toSign.length + preparing.length + waitingApproval.length + signedBeforeHandover.length
  const returnsInProgress = returns.items.filter(i => i.request && (i.request.status !== 'Completed' ||
    Number(i.request.amountOwed) > 0 || (Number(i.request.refundAmount) > 0 && i.request.refundStatus !== 'Completed'))).length
  const [contractTab, setContractTab] = useState(() => (pendingCountAll > 0 ? 'pending' : 'active'))
  const tabOfReservation = id => {
    const r = allRentals.find(x => String(x.reservationId) === String(id))
    if (!r) return null
    if (r.status === 'Handed Over') return 'active'
    if (r.status === 'Confirmed' || r.status === 'Paid') return 'pending'
    return 'ended'
  }

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

  // Mở từ thông báo / chỗ khác: cuộn tới đúng thẻ hợp đồng khi danh sách đã hiển thị.
  const [focusTick, setFocusTick] = useState(0)
  useEffect(() => {
    const onOpen = () => setFocusTick(t => t + 1)
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [])
  useEffect(() => {
    // [SỬA] Thẻ hợp đồng cần mở nằm ở tab khác -> chuyển tab trước rồi mới cuộn tới
    let pending = null
    try { pending = sessionStorage.getItem('storespace_focus_contract') } catch { /* bỏ qua */ }
    const targetTab = pending ? tabOfReservation(pending) : null
    if (targetTab && targetTab !== 'pending') setContractTab(targetTab)
    const timer = window.setTimeout(() => {
      let wanted = null
      try { wanted = sessionStorage.getItem('storespace_focus_contract') } catch { /* bỏ qua */ }
      if (wanted && document.getElementById(`contract-${wanted}`)) {
        takePendingContractFocus()
        focusContract(wanted)
      } else if (wanted && (targetTab === 'active' || targetTab === 'ended')) {
        // Thẻ nằm ở trang khác của danh sách -> bỏ ô tìm, mở đúng trang rồi cuộn tới
        const list = newestFirst(targetTab === 'ended' ? endedRentals : activeRentals, { id: r => r.reservationId })
        const index = list.findIndex(r => String(r.reservationId) === String(wanted))
        if (index >= 0) {
          setContractQuery('')
          contractPaging.setPage(Math.floor(index / contractPaging.pageSize) + 1)
          retry = window.setTimeout(() => {
            if (document.getElementById(`contract-${wanted}`)) { takePendingContractFocus(); focusContract(wanted) }
          }, 200)
        }
      }
    }, 350)
    let retry = null
    return () => { window.clearTimeout(timer); window.clearTimeout(retry) }
  }, [focusTick, rentals.map(r => r.reservationId).join(',')])

  // Thông báo "Kho sắp hết hạn" -> "Gia hạn ngay": mở hộp thoại gia hạn của đúng hợp đồng.
  const [renewTick, setRenewTick] = useState(0)
  useEffect(() => {
    const onOpen = () => setRenewTick(t => t + 1)
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [])
  useEffect(() => {
    let wanted = null
    try { wanted = sessionStorage.getItem(RENEW_REQUEST_KEY) } catch { /* bỏ qua */ }
    if (!wanted || !renewals.data) return
    takeRenewalRequest()
    const item = renewals.byReservation(wanted)
    if (item?.eligible && !item.pendingRenewal) setRenewItem(item)
  }, [renewals.data, renewTick])

  // "Gia hạn thành công, vui lòng ký phụ lục gia hạn" -> OK: mở màn hình ký đúng hợp đồng khi dữ liệu đã có.
  const [signRequest, setSignRequest] = useState(() => peekContractSignRequest())
  useEffect(() => {
    const onOpen = () => setSignRequest(peekContractSignRequest())
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [])
  useEffect(() => {
    if (!signRequest) return
    const target = allRentals.find(r => String(r.contractId) === String(signRequest))
    if (!target) {
      onRentalsChanged?.() // hợp đồng vừa tạo chưa có trong danh sách -> tải lại
      return
    }
    clearContractSignRequest()
    setSignRequest(null)
    if (!isSignedRental(target)) {
      setDetail(null)
      setSignGroup(buildGroups([target])[0])
    }
  }, [signRequest, allRentals.map(r => `${r.contractId}:${r.contractStatus}`).join(',')])

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
      title: signedGroup.renewedFrom ? 'Đã ký phụ lục gia hạn' : 'Đã ký hợp đồng',
      message: signedGroup.renewedFrom
        ? `Bạn đã ký phụ lục gia hạn ${signedGroup.code} của hợp đồng ${signedGroup.renewedFrom.contractNumber}, thời hạn ${signedGroup.rentals[0].startDate} → ${signedGroup.rentals[0].endDate}. Bạn tiếp tục sử dụng kho như hiện tại, không cần đến cơ sở.\n${mail.text}${remainingToSign > 0 ? `\nBạn còn ${remainingToSign} hợp đồng chờ ký.` : ''}`
        : `Bạn đã ký hợp đồng ${signedGroup.code} (${unitCountOf(signedGroup.rentals[0])} kho). Hãy đến cơ sở vào ngày ${signedGroup.rentals[0].startDate} để nhận kho, mang theo CCCD.\n${mail.text}${remainingToSign > 0 ? `\nBạn còn ${remainingToSign} hợp đồng chờ ký.` : ''}`
    })
    renewals.reload()
    onRentalsChanged?.()
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

  // [SỬA] Danh sách hợp đồng của tab đang mở: tìm + mới nhất lên đầu + chia trang
  const [contractQuery, setContractQuery] = useState('')
  const tabRentals = contractTab === 'ended' ? endedRentals : activeRentals
  const listedContracts = newestFirst(tabRentals.filter(r => {
    const q = contractQuery.trim().toLowerCase()
    return !q || [r.contractNumber, r.reservationCode, r.facility, ...(r.unitNumbers || [r.unitId])].some(v => String(v ?? '').toLowerCase().includes(q))
  }), { id: r => r.reservationId })
  const contractPaging = useClientPaging(listedContracts, { pageSize: 5, resetKey: `${contractTab}|${contractQuery}` })

  return (
    <div className="customer-content-page">

      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">
            PHÁP LÝ & VĂN BẢN THUÊ KHO
          </span>

          <h1>Hợp đồng & Thủ tục pháp lý</h1>

          <p>
            Ký hợp đồng/phụ lục trực tuyến, xem văn bản hợp đồng, đăng ký gia hạn và đặt lịch hẹn trả kho.
          </p>
        </div>

        {(pendingCount > 0 || toSign.length > 0) && (
          <span className="page-count">
            {toSign.length || pendingCount} hợp đồng chờ ký
          </span>
        )}
      </div>

      {/* QUY TRÌNH 4 BƯỚC PHÁP LÝ RÕ RÀNG */}
      <div className="cportal-lifecycle" aria-label="Quy trình hợp đồng thuê kho">
        <div className="cportal-lifecycle-step">
          <span className="cportal-lifecycle-num">1</span>
          <div>
            <strong>Đặt cọc giữ kho</strong>
            <small>Hệ thống lập hợp đồng tự động</small>
          </div>
        </div>
        <div className="cportal-lifecycle-step">
          <span className="cportal-lifecycle-num">2</span>
          <div>
            <strong>Ký hợp đồng điện tử</strong>
            <small>Xác nhận điều khoản trực tuyến</small>
          </div>
        </div>
        <div className="cportal-lifecycle-step">
          <span className="cportal-lifecycle-num">3</span>
          <div>
            <strong>Nhận bàn giao & Sử dụng</strong>
            <small>Nhận mã PIN ra vào kho 24/7</small>
          </div>
        </div>
        <div className="cportal-lifecycle-step">
          <span className="cportal-lifecycle-num">4</span>
          <div>
            <strong>Gia hạn hoặc Trả kho</strong>
            <small>Kiểm tra kho & hoàn trả tiền cọc</small>
          </div>
        </div>
      </div>

      <FilterChips
        options={[
          ['pending', 'Đã cọc · chờ nhận kho'],
          ['active', 'Đang thuê'],
          ['returns', 'Trả kho'],
          ['ended', 'Đã kết thúc']
        ]}
        value={contractTab}
        onChange={setContractTab}
        counts={{ pending: pendingCountAll, active: activeRentals.length, returns: returnsInProgress, ended: endedRentals.length }}
        className="cc-tabs"
      />

      {contractTab === 'returns' && (
        <>
          <p className="cc-tab-hint">Kho bạn đã báo trả: theo dõi từng bước từ hẹn trả kho đến khi nhận lại tiền cọc.</p>
          <ReturnSection returns={returns} onChanged={onRentalsChanged} />
          {!returns.loading && !returns.items.some(i => i.request) && <div className="empty-state">Bạn không có kho nào đang trả. Muốn trả kho, mở tab "Đang thuê" và bấm "Trả kho" trên hợp đồng.</div>}
        </>
      )}

      {contractTab === 'active' && (
        <RenewalSection renewals={renewals} onRenew={setRenewItem} onChanged={onRentalsChanged} />
      )}

      {returnItem && (
        <ReturnRequestModal
          item={returnItem}
          rules={returns.rules}
          fees={returns.fees}
          onClose={() => setReturnItem(null)}
          onDone={() => { returns.reload(); onRentalsChanged?.() }}
        />
      )}

      {cancelRental && (
        <CancelReservationModal
          rental={cancelRental}
          onClose={() => setCancelRental(null)}
          onDone={() => { onRentalsChanged?.(); renewals.reload() }}
        />
      )}

      {renewItem && (
        <RenewalModal
          key={renewItem.reservationId}
          item={renewItem}
          onClose={() => setRenewItem(null)}
          onDone={() => { renewals.reload(); onRentalsChanged?.() }}
        />
      )}

      {contractTab === 'pending' && pendingCountAll === 0 && (
        <div className="empty-state">Không có đơn nào đang chờ. Đơn đã đặt cọc sẽ hiện ở đây để bạn ký hợp đồng và xem lịch nhận kho.</div>
      )}
      {contractTab === 'pending' && pendingCountAll > 0 && (
        <section className="sign-queue" aria-label="Hợp đồng đang xử lý">
          {buildGroups(toSign).map(group => (
            <article key={group.key} className="sign-card">
              <div>
                <span className="sign-badge todo">{group.renewedFrom ? 'Chờ ký phụ lục gia hạn' : 'Chờ bạn ký'}</span>
                <h3>{group.title}</h3>
                <p>Mã {group.code} · {group.rentals[0].startDate} → {group.rentals[0].endDate} · {group.renewedFrom
                  ? `Đã thanh toán gia hạn hợp đồng ${group.renewedFrom.contractNumber}. Bạn tiếp tục dùng kho, chỉ cần ký phụ lục.`
                  : 'Đã đặt cọc, kho đã được giữ cho bạn.'}</p>
                <div className="sign-units">{group.rentals.flatMap(r => r.units || []).map(u => <span key={u.number}>{u.number}</span>)}</div>
              </div>
              <div className="sign-actions">
                {!group.renewedFrom && <button type="button" className="cr-link-btn" onClick={() => setCancelRental(group.rentals[0])}>Hủy đặt kho</button>}
                <button type="button" className="dashboard-secondary-btn" onClick={() => setDetail({ group })}>Xem chi tiết</button>
                <button type="button" className="dashboard-primary-btn" onClick={() => setSignGroup(group)}>{group.renewedFrom ? 'Xem & ký phụ lục' : 'Xem & ký hợp đồng'}</button>
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
                <button type="button" className="cr-link-btn" onClick={() => setCancelRental(group.rentals[0])}>Hủy đặt kho</button>
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
                {group.rentals[0].paymentPlan && Number(group.rentals[0].rentDueAtStart) > 0 && (
                  <p>Sau khi nhận kho, bạn đóng {new Intl.NumberFormat('vi-VN').format(Number(group.rentals[0].rentDueAtStart))}đ tiền thuê ({group.rentals[0].paymentPlan === 'Upfront' ? 'trả 1 lần, toàn bộ kỳ thuê' : 'trả theo tháng, tháng đầu'}) tại mục <strong>Thanh toán & Hóa đơn</strong>.</p>
                )}
                <div className="sign-units">{group.rentals.flatMap(r => r.units || []).map(u => <span key={u.number}>{u.number}</span>)}</div>
              </div>
              <div className="sign-actions">
                <button type="button" className="cr-link-btn" onClick={() => setCancelRental(group.rentals[0])}>Hủy đặt kho</button>
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
          onCancel={['Paid', 'Confirmed'].includes(detail.group.rentals[0]?.status) && !detail.group.renewedFrom && !detail.group.rentals[0]?.isRenewal
            ? () => { const r = detail.group.rentals[0]; setDetail(null); setCancelRental(r) }
            : undefined}
          onRenew={(() => {
            const renewal = renewals.byReservation(detail.group.rentals[0]?.reservationId)
            return renewal?.eligible && !renewal.pendingRenewal ? () => { setDetail(null); setRenewItem(renewal) } : undefined
          })()}
        />
      )}

      {(contractTab === 'active' || contractTab === 'ended') && (
        <div className="cc-list-head">
          <div>
            <h2>{contractTab === 'active' ? 'Hợp đồng đang thuê' : 'Hợp đồng đã kết thúc'} <span>{tabRentals.length}</span></h2>
            <p>{contractTab === 'active' ? 'Kho bạn đang sử dụng. Hợp đồng mới nhất nằm trên cùng.' : 'Hợp đồng đã trả kho hoặc đã đóng.'}</p>
          </div>
          {tabRentals.length > 0 && (
            <input className="ss-search" type="search" value={contractQuery} onChange={e => setContractQuery(e.target.value)} placeholder="Tìm mã HĐ, mã đơn, cơ sở, mã kho..." aria-label="Tìm hợp đồng" />
          )}
        </div>
      )}
      {(contractTab === 'active' || contractTab === 'ended') && tabRentals.length === 0 && (
        <div className="empty-state">{contractTab === 'active' ? 'Bạn chưa có kho nào đang thuê.' : 'Chưa có hợp đồng nào kết thúc.'}</div>
      )}
      {(contractTab === 'active' || contractTab === 'ended') && tabRentals.length > 0 && listedContracts.length === 0 && <div className="empty-state">Không có hợp đồng phù hợp.</div>}
      {(contractTab === 'active' || contractTab === 'ended') && contractPaging.pageRows.map(rental => {
        const signature = signatures[keyOf(rental)]
        const signatureError = signatureErrors[keyOf(rental)]
        const signatureLoaded = loadedSignatures[keyOf(rental)]
        const renewal = renewals.byReservation(rental.reservationId)

        return (
          <ContractCard
            key={keyOf(rental)}
            rental={rental}
            facility={facilities.find(f => f.name === rental.facility)}
            customerName={customerName}
            signature={signature}
            signatureLoaded={signatureLoaded}
            signatureError={signatureError}
            renewal={renewal}
            onReloadSignature={() => reloadSignature(rental)}
            onSign={() => setOpenRental(rental)}
            onDetail={() => setDetail({ group: buildGroups([rental])[0], signature: signature || undefined })}
            onRenew={renewal?.eligible ? () => setRenewItem(renewal) : undefined}
            returnInfo={returns.byReservation(rental.reservationId)}
            onPayRent={() => payRent(rental)}
            onOpenPayment={onOpenPayment}
            payingRent={payingRent === rental.reservationId}
            lateFee={lateFeeOf(rental)}
            onReturn={rental.status === 'Handed Over' ? () => {
              const info = returns.byReservation(rental.reservationId)
              if (info?.eligible) setReturnItem(info)
              else dialog.alert({
                tone: 'warning',
                title: 'Chưa trả kho được',
                message: returns.error
                  ? `Không tải được thông tin trả kho: ${returns.error}`
                  : info?.reason || (returns.loading ? 'Đang tải thông tin trả kho, thử lại sau giây lát.' : 'Hợp đồng này hiện chưa thể báo trả kho.')
              })
            } : undefined}
          />
        )
      })}

      {(contractTab === 'active' || contractTab === 'ended') && <Pager {...contractPaging.pagerProps} unit="hợp đồng" />}

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

/* Tiến trình hoàn cọc khi khách hủy: tạo yêu cầu -> gửi cổng thanh toán -> cổng xác nhận đã hoàn. */
const fmtUtc = iso => {
  if (!iso) return ''
  const text = String(iso)
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function RefundTimeline({ item, formatMoney }) {
  const done = item.refundStatus === 'Completed'
  const viaVnPay = item.refundProvider === 'VNPay'
  // VNPay sandbox hạn chế API hoàn tiền -> backend có thể ghi nhận hoàn mô phỏng (mã hoàn bắt đầu bằng SIM-).
  const simulatedFallback = viaVnPay && done && String(item.refundReference || '').startsWith('SIM-')
  const steps = [
    { label: 'Đã hủy đơn, tạo yêu cầu hoàn', note: fmtUtc(item.refundRequestedAt || item.cancelledAt), state: 'done' },
    viaVnPay && {
      label: 'Gửi yêu cầu hoàn sang VNPay',
      note: item.refundLastAttempt ? `${fmtUtc(item.refundLastAttemptAt)} · ${item.refundLastAttempt}` : (done ? '' : 'Chưa gửi được'),
      state: done ? 'done' : item.refundLastAttempt ? 'error' : 'todo'
    },
    {
      label: simulatedFallback ? 'Ghi nhận hoàn (mô phỏng)' : viaVnPay ? 'VNPay xác nhận đã hoàn' : 'Đã hoàn tiền (thanh toán mô phỏng)',
      note: done ? `${fmtUtc(item.refundCompletedAt)}${item.refundReference ? ` · Mã hoàn ${item.refundReference}` : ''}` : 'Đang chờ',
      state: done ? 'done' : 'todo'
    }
  ].filter(Boolean)
  return (
    <div className={`refund-box ${done ? 'ok' : 'pending'}`}>
      <div className="refund-box-head">
        <strong>Hoàn cọc {formatMoney(item.refundAmount)}</strong>
        <span>{done ? 'Đã hoàn' : 'Đang hoàn'}</span>
      </div>
      <ol className="refund-steps">
        {steps.map(step => (
          <li key={step.label} className={step.state}>
            <b>{step.label}</b>
            {step.note && <small>{step.note}</small>}
          </li>
        ))}
      </ol>
      <p className="refund-help">
        {viaVnPay
          ? simulatedFallback
            ? 'VNPay sandbox không cho dùng API hoàn tiền (trả lỗi 99), nên hệ thống ghi nhận hoàn MÔ PHỎNG để hoàn tất luồng. Ở môi trường thật, lệnh hoàn sẽ được gửi sang VNPay và tiền về thẻ / tài khoản của khách.'
            : done
            ? 'VNPay đã nhận lệnh hoàn. Tiền về đúng thẻ / tài khoản đã thanh toán, thường trong 1–3 ngày làm việc tùy ngân hàng. Môi trường thử nghiệm (sandbox) không có tiền thật: xem giao dịch hoàn trong trang quản trị merchant của VNPay.'
            : 'VNPay chưa xác nhận lệnh hoàn. Xem lý do ở bước 2, sau đó bấm "Gửi lại yêu cầu hoàn tiền".'
          : 'Đơn được thanh toán mô phỏng nên hoàn tiền cũng là mô phỏng.'}
      </p>
    </div>
  )
}

/* [SỬA] Trang Thanh toán cũ (CustomerPaymentPage) đã thay bằng CustomerPaymentCenter trong PendingPayments.jsx */

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
          <span className="customer-eyebrow">HỒ SƠ CHỦ HỢP ĐỒNG & ĐỊNH DANH</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>Thông tin pháp lý dùng để đứng tên hợp đồng thuê kho, đối chiếu CCCD khi nhận kho và nhận thông báo từ StoreSpace.</p>
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
  const rentDueRentals = rentals.filter(item =>
    !['Completed', 'Cancelled', 'Expired'].includes(item.status) && Number(item.rentPayableNow || 0) > 0
  )
  const rentDueAmount = rentDueRentals.reduce(
    (total, item) => total + Number(item.rentPayableNow || 0),
    0
  )
  const totalPayableNow = pendingAmount + rentDueAmount
  const unsignedContracts = rentals.filter(item =>
    item.contractId && item.contractStatus !== 'Signed' && item.contractStatus !== 'Active' &&
    (item.status === 'Confirmed' || item.status === 'Paid')
  )
  const expiringRentals = activeRentals.filter(item => item.remainingDays <= 30)
  const [activeSection, setActiveSection] = useState(() => takeCustomerSection('overview'))
  const currentTabMeta = CUSTOMER_TABS[activeSection] || CUSTOMER_TABS.overview

  // Thông báo: tính từ đơn thuê + gia hạn + chính sách; mở mục nào thì thông báo của mục đó được tính là đã xem.
  const renewalsForNotices = useContractRenewals()
  const policiesForNotices = usePolicies()
  const returnsForNotices = useUnitReturns()
  const inspectionsForNotices = useMyInspections() // [THÊM 14]
  const notices = useCustomerNotifications({
    email: user?.email,
    rentals,
    renewals: renewalsForNotices.data,
    policies: policiesForNotices,
    returns: returnsForNotices.data,
    inspections: inspectionsForNotices.data // [THÊM 14]
  })
  const noticeIdsKey = notices.notifications.map(n => n.id).join('|')
  useEffect(() => {
    if (['contract', 'payment', 'storage'].includes(activeSection)) notices.markSection(activeSection)
  }, [activeSection, noticeIdsKey])
  // Dữ liệu đặt chỗ thay đổi (gia hạn, ký, thanh toán) -> tải lại thông tin gia hạn cho thông báo.
  const rentalsKey = rentals.map(r => `${r.reservationId}:${r.status}:${r.contractStatus}`).join(',')
  const firstRentalsKey = React.useRef(rentalsKey)
  useEffect(() => { if (rentalsKey !== firstRentalsKey.current) { renewalsForNotices.reload(); returnsForNotices.reload(); inspectionsForNotices.reload() } }, [rentalsKey])
  const openNotice = item => {
    const action = item.action || {}
    if (action.signContractId) requestContractSign(action.signContractId)
    if (action.renewReservationId) requestRenewal(action.renewReservationId)
    if (action.section) setActiveSection(action.section)
    if (action.focusReservationId && !action.renewReservationId && !action.signContractId) focusContract(action.focusReservationId)
  }
  // [THÊM] Đơn chưa đặt cọc + Hóa đơn tiền thuê đến hạn đều hiện badge ở mục Thanh toán
  const paymentBadgeIds = new Set([
    ...notices.notifications.filter(n => n.section === 'payment' && !notices.isSeen(n.id)).map(n => n.id),
    ...pendingDepositsOf(rentals).filter(r => !r.isRenewal).map(r => `deposit:${r.reservationId}`),
    ...rentDueRentals.map(r => `rent:${r.reservationId}`)
  ])
  const navBadge = section => {
    const count = section === 'notifications' ? notices.unseenCount : section === 'payment' ? paymentBadgeIds.size : notices.countBySection[section] || 0
    return count > 0 && activeSection !== section
      ? <span className="cnav-badge" aria-label={`${count} thông báo mới`}>{count > 9 ? '9+' : count}</span>
      : null
  }
  // Mở tab theo yêu cầu (vd sau khi gia hạn: tab Hợp đồng để ký phụ lục).
  useEffect(() => {
    const onOpen = event => { if (event.detail) setActiveSection(event.detail) }
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [])

  const openContractForReservation = reservationId => {
    if (reservationId) focusContract(reservationId)
    setActiveSection('contract')
  }

  const signContractForRental = targetRental => {
    if (targetRental?.contractId) requestContractSign(targetRental.contractId)
    setActiveSection('contract')
  }

  const logout = () => {
    localStorage.removeItem(currentUserKey)
    navigate('/')
  }

  // Danh sách việc cần xử lý ngay trong trang Tổng quan
  const urgentTasks = [
    ...unpaidReservations.map(item => ({
      id: `dep-${item.reservationId}`,
      tone: 'danger',
      title: `Đơn ${formatReservationCode(item.reservationId)} (${item.facility} · Kho ${item.unitId || 'đặt mới'}) chờ thanh toán cọc`,
      sub: `Cần đóng ${new Intl.NumberFormat('vi-VN').format(Number(item.depositAmount || 0))}đ tiền cọc giữ kho trước khi hết giờ giữ chỗ.`,
      btnLabel: 'Đóng tiền cọc',
      onClick: () => setActiveSection('payment')
    })),
    ...unsignedContracts.map(item => ({
      id: `sign-${item.reservationId}`,
      tone: 'warn',
      title: `Hợp đồng ${item.contractNumber || formatReservationCode(item.reservationId)} chờ chữ ký điện tử của bạn`,
      sub: `${item.facility} · Kho ${item.unitId || 'đã đặt'} · Ký trực tuyến để sẵn sàng nhận bàn giao kho.`,
      btnLabel: 'Ký hợp đồng ngay',
      onClick: () => signContractForRental(item)
    })),
    ...rentDueRentals.map(item => ({
      id: `rent-${item.reservationId}`,
      tone: 'danger',
      title: `Kho ${item.unitId || formatReservationCode(item.reservationId)} đến hạn đóng tiền thuê kỳ này`,
      sub: `Số tiền cần đóng: ${new Intl.NumberFormat('vi-VN').format(Number(item.rentPayableNow || 0))}đ (${item.facility}).`,
      btnLabel: 'Thanh toán hóa đơn',
      onClick: () => setActiveSection('payment')
    })),
    ...expiringRentals.map(item => ({
      id: `exp-${item.reservationId}`,
      tone: 'warn',
      title: `Kho ${item.unitId} (${item.facility}) còn ${item.remainingDays} ngày sử dụng`,
      sub: `Ngày hết hạn: ${item.endDate}. Bạn có thể gia hạn trực tuyến hoặc đăng ký lịch trả kho.`,
      btnLabel: 'Gia hạn / Xem HĐ',
      onClick: () => openContractForReservation(item.reservationId)
    }))
  ]

  return (
    <div className="customer-layout">

      <aside className="customer-sidebar cportal-sidebar">

        <div className="customer-brand" role="button" tabIndex={0} onClick={() => navigate('/')} onKeyDown={e => e.key === 'Enter' && navigate('/')}>
          <span className="brand-mark">S</span>

          <div>
            <strong>StoreSpace</strong>
            <small>Cổng khách hàng thuê kho</small>
          </div>
        </div>

        <div className="customer-profile-mini">
          <div className="customer-avatar">
            {user?.name?.charAt(0)?.toUpperCase() || 'K'}
          </div>

          <div>
            <strong>{user?.name || 'Khách hàng'}</strong>
            <small>{activeRentals.length} kho đang thuê</small>
          </div>
        </div>

        <div className="cportal-nav-group">
          <span className="cportal-nav-group-label">Quản lý thuê kho</span>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            <span className="cportal-nav-icon"><NavIcon name="overview" /></span>
            <span className="cportal-nav-text">
              <strong>Tổng quan</strong>
              <small>Tóm tắt & việc cần làm</small>
            </span>
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveSection('storage')}
          >
            <span className="cportal-nav-icon"><NavIcon name="storage" /></span>
            <span className="cportal-nav-text">
              <strong>Kho của tôi</strong>
              <small>Mã PIN, vị trí & tác vụ kho</small>
            </span>
            {navBadge('storage')}
          </button>

          <button
            type="button"
            className="cportal-nav-btn cportal-book-cta"
            onClick={() => navigate('/search')}
          >
            <span className="cportal-nav-icon"><NavIcon name="search" /></span>
            <span className="cportal-nav-text">
              <strong>Thuê thêm kho mới ↗</strong>
              <small>Tìm cơ sở & chọn ô kho</small>
            </span>
          </button>
        </div>

        <div className="cportal-nav-group">
          <span className="cportal-nav-group-label">Pháp lý & Tài chính</span>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'contract' ? 'active' : ''}`}
            onClick={() => setActiveSection('contract')}
          >
            <span className="cportal-nav-icon"><NavIcon name="contract" /></span>
            <span className="cportal-nav-text">
              <strong>Hợp đồng & Pháp lý</strong>
              <small>Ký HĐ, gia hạn, trả kho</small>
            </span>
            {navBadge('contract')}
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'payment' ? 'active' : ''}`}
            onClick={() => setActiveSection('payment')}
          >
            <span className="cportal-nav-icon"><NavIcon name="payment" /></span>
            <span className="cportal-nav-text">
              <strong>Thanh toán & Hóa đơn</strong>
              <small>Đóng cọc, tiền thuê, hoàn tiền</small>
            </span>
            {navBadge('payment')}
          </button>
        </div>

        <div className="cportal-nav-group">
          <span className="cportal-nav-group-label">Tài khoản</span>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveSection('notifications')}
          >
            <span className="cportal-nav-icon"><NavIcon name="notifications" /></span>
            <span className="cportal-nav-text">
              <strong>Thông báo</strong>
              <small>Nhắc lịch & biên bản kho</small>
            </span>
            {navBadge('notifications')}
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveSection('profile')}
          >
            <span className="cportal-nav-icon"><NavIcon name="profile" /></span>
            <span className="cportal-nav-text">
              <strong>Hồ sơ cá nhân</strong>
              <small>Thông tin chủ hợp đồng</small>
            </span>
          </button>
        </div>

        <div className="customer-sidebar-bottom" style={{ marginTop: 'auto' }}>
          <button type="button" onClick={logout}>
            <span>↪</span>
            Đăng xuất tài khoản
          </button>
        </div>

      </aside>

      <main className="customer-main">

        {/* HEADER CHUNG + NÚT THÔNG BÁO / HỒ SƠ */}
        <div className="cportal-header-bar">
          <div className="cportal-welcome">
            <span className="cportal-welcome-kicker">CỔNG QUẢN LÝ KHO TỰ LƯU TRỮ STORESPACE</span>
            <h1>Xin chào, {user?.name || 'Khách hàng'}!</h1>
            <p>Mỗi phân mục dưới đây đảm nhận một nghiệp vụ riêng biệt để bạn quản lý kho thuê thuận tiện nhất.</p>
          </div>

          <div className="customer-topbar-actions">
            <button
              type="button"
              className="customer-bell"
              onClick={() => setActiveSection('notifications')}
              aria-label={notices.unseenCount ? `Thông báo, ${notices.unseenCount} chưa xem` : 'Thông báo'}
              title="Thông báo"
            >
              🔔
              {notices.unseenCount > 0 && <span className="cnav-badge">{notices.unseenCount > 9 ? '9+' : notices.unseenCount}</span>}
            </button>
            <button
              type="button"
              className="customer-profile-button"
              onClick={() => setActiveSection('profile')}
              title="Hồ sơ cá nhân"
            >
              {user?.name?.charAt(0)?.toUpperCase() || 'K'}
            </button>
          </div>
        </div>

        {/* THANH CHUYỂN NHANH 4 NGHIỆP VỤ CHÍNH (RÕ RÀNG VAI TRÒ TỪNG TAB) */}
        <nav className="cportal-tab-switcher" aria-label="Các phân mục nghiệp vụ chính">
          {['overview', 'storage', 'contract', 'payment'].map(tabKey => {
            const tab = CUSTOMER_TABS[tabKey]
            const isActive = activeSection === tabKey
            return (
              <button
                key={tabKey}
                type="button"
                className={`cportal-tab-card ${isActive ? 'active' : ''}`}
                onClick={() => setActiveSection(tabKey)}
              >
                <span className="cportal-tab-card-icon">
                  <NavIcon name={tabKey} />
                </span>
                <span className="cportal-tab-card-body">
                  <span className="cportal-tab-card-title">
                    {tab.title}
                    {navBadge(tabKey)}
                  </span>
                  <span className="cportal-tab-card-desc">{tab.subtitle}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* BANNER GIẢI THÍCH Ý NGHĨA & CHỨC NĂNG CỦA TAB ĐANG MỞ */}
        <div className="cportal-purpose-banner" role="region" aria-label="Chức năng của trang hiện tại">
          <div className="cportal-purpose-banner-main">
            <span className="cportal-purpose-badge">{currentTabMeta.badge}</span>
            <div className="cportal-purpose-text">
              <h2>{currentTabMeta.purposeTitle}</h2>
              <p>{currentTabMeta.purposeDesc}</p>
            </div>
          </div>
          <div className="cportal-purpose-pills">
            {currentTabMeta.pills.map(pill => (
              <span key={pill} className="cportal-purpose-pill">✓ {pill}</span>
            ))}
          </div>
        </div>

        {/* [THÊM] Đơn chưa đặt cọc: nhắc ở đầu mọi mục (trừ mục Thanh toán vì ở đó đã có khối "Cần thanh toán") */}
        {activeSection !== 'payment' && (
          <PendingDepositBar rentals={rentals} variant="inline" onPay={() => setActiveSection('payment')} actionLabel="Thanh toán ngay" />
        )}

        {activeSection === 'overview' && (
          <div className="overview-page">

            {/* KHỐI VIỆC CẦN XỬ LÝ NGAY */}
            {urgentTasks.length > 0 && (
              <section className="cportal-urgent-box" aria-label="Việc cần xử lý ngay">
                <div className="cportal-urgent-head">
                  <h2>
                    <span>⚡ Việc bạn cần xử lý ngay</span>
                    <span className="cportal-urgent-count">{urgentTasks.length} tác vụ</span>
                  </h2>
                </div>
                <div className="cportal-urgent-list">
                  {urgentTasks.slice(0, 4).map(task => (
                    <div key={task.id} className="cportal-urgent-item">
                      <div className="cportal-urgent-item-info">
                        <span className={`cportal-urgent-dot ${task.tone === 'danger' ? 'danger' : ''}`} />
                        <div>
                          <strong>{task.title}</strong>
                          <span>{task.sub}</span>
                        </div>
                      </div>
                      <button type="button" className="dashboard-primary-btn" onClick={task.onClick}>
                        {task.btnLabel} →
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <NotificationsPreview center={notices} onAction={openNotice} onOpenAll={() => setActiveSection('notifications')} />

            {/* ===== STATS ===== */}

            <section className="customer-stats">

              <div className="customer-stat-card" onClick={() => setActiveSection('storage')} style={{ cursor: 'pointer' }}>
                <span className="stat-icon">▣</span>
                <small>Kho đang sử dụng</small>
                <strong>{activeRentals.length}</strong>
                <span className="stat-note">Xem mã PIN & tác vụ kho →</span>
              </div>

              <div className="customer-stat-card" onClick={() => setActiveSection('contract')} style={{ cursor: 'pointer' }}>
                <span className="stat-icon yellow">◷</span>
                <small>Kho sắp hết hạn (≤ 30 ngày)</small>
                <strong>{expiringRentals.length}</strong>
                <span className="stat-note warning">
                  {expiringRentals.length > 0 ? 'Bấm để gia hạn ngay →' : 'Chưa có kho sắp hết hạn'}
                </span>
              </div>

              <div className="customer-stat-card" onClick={() => setActiveSection('payment')} style={{ cursor: 'pointer' }}>
                <span className="stat-icon blue">₫</span>
                <small>Cần thanh toán hiện tại</small>
                <strong>{new Intl.NumberFormat('vi-VN').format(totalPayableNow)}đ</strong>
                <span className="stat-note">
                  {unpaidReservations.length + rentDueRentals.length > 0
                    ? `${unpaidReservations.length} đơn cọc · ${rentDueRentals.length} hóa đơn thuê →`
                    : 'Không có khoản nợ chờ đóng'}
                </span>
              </div>

              <div className="customer-stat-card">
                <span className="stat-icon">◴</span>
                <small>Thời hạn kho chính</small>
                <strong>{rental?.remainingDays != null ? `${rental.remainingDays} ngày` : '—'}</strong>
                <span className="stat-note">
                  {rental?.unitId ? `Ô kho ${rental.unitId}` : 'Chưa có kho đang thuê'}
                </span>
              </div>

            </section>


            {/* ===== CURRENT RENTAL ===== */}

            <section className="customer-section">

              <div className="customer-section-heading">
                <div>
                  <span className="customer-eyebrow">
                    KHO ĐANG THUÊ & MÃ RA VÀO
                  </span>

                  <h2>Kho lưu trữ hiện tại của bạn</h2>
                </div>

                <button
                  type="button"
                  className="overview-text-button"
                  onClick={() => setActiveSection('storage')}
                >
                  Mở trang Kho của tôi →
                </button>
              </div>

              {rental ? (
                <div className="overview-rental-card">

                  <div className="overview-rental-left">

                    <div className="overview-rental-top">
                      <div>

                        <span className="rental-facility">
                          {rental.facility}
                        </span>

                        <h3>Ô kho {rental.unitId || 'Chưa phân kho'}</h3>

                        <p>
                          {rental.type} · {rental.size} · Mã ra vào: <strong>{rental.accessValue || 'Xem tại Kho của tôi'}</strong>
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

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                      <button type="button" className="cportal-action-chip primary" onClick={() => setActiveSection('storage')}>
                        🔑 Vào Kho của tôi & Mã PIN
                      </button>
                      <button type="button" className="cportal-action-chip" onClick={() => openContractForReservation(rental.reservationId)}>
                        📄 Xem hợp đồng & Gia hạn
                      </button>
                      <button type="button" className="cportal-action-chip" onClick={() => setActiveSection('payment')}>
                        💳 Thanh toán & Hóa đơn
                      </button>
                    </div>

                  </div>

                  <div className="overview-rental-progress">

                    <div className="overview-progress-heading">
                      <span>Tiến độ kỳ thuê</span>
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
                    Tìm & đặt kho ngay
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
                      TÀI CHÍNH & HÓA ĐƠN
                    </span>

                    <h2>Thanh toán & Công nợ</h2>
                  </div>

                  <span className="overview-panel-icon yellow">
                    ₫
                  </span>

                </div>


                <div className="payment-main">

                  <small>Tổng số tiền cần thanh toán ngay</small>

                  <strong>{new Intl.NumberFormat('vi-VN').format(totalPayableNow)}đ</strong>

                  <span>
                    {totalPayableNow > 0
                      ? `Gồm ${unpaidReservations.length} đơn cọc giữ kho và ${rentDueRentals.length} hóa đơn tiền thuê đến kỳ.`
                      : 'Tất cả tiền cọc và tiền thuê định kỳ hiện tại đã hoàn tất.'}
                  </span>

                </div>


                <div className="payment-status">
                  <span>Trạng thái tài chính</span>

                  <strong>
                    ● {totalPayableNow > 0 ? 'Có khoản chờ thanh toán' : 'Đã thanh toán đầy đủ'}
                  </strong>
                </div>


                <button
                  type="button"
                  className="dashboard-primary-btn full"
                  onClick={() => setActiveSection('payment')}
                >
                  {totalPayableNow > 0 ? 'Đến Trung tâm Thanh toán ngay' : 'Xem hóa đơn & lịch sử giao dịch'}
                </button>

              </section>


              {/* CONTRACT */}

              <section className="overview-panel">

                <div className="overview-panel-heading">

                  <div>
                    <span className="customer-eyebrow">
                      PHÁP LÝ & VĂN BẢN
                    </span>

                    <h2>Hợp đồng thuê kho</h2>
                  </div>

                  <span className="overview-panel-icon">
                    ▤
                  </span>

                </div>


                <div className="contract-summary">

                  <div>
                    <span>Mã hợp đồng</span>
                    <strong>
                      {rental?.contractNumber || `#${rental?.contractId || rental?.reservationId || '—'}`}
                    </strong>
                  </div>

                  <div>
                    <span>Trạng thái pháp lý</span>
                    <strong className="contract-active">
                      {unsignedContracts.length > 0
                        ? `${unsignedContracts.length} hợp đồng chờ ký`
                        : (rental?.contractStatus || rental?.statusLabel || '—')}
                    </strong>
                  </div>

                  <div>
                    <span>Ngày hết hạn</span>
                    <strong>{rental?.endDate || '—'}</strong>
                  </div>

                </div>


                <button
                  type="button"
                  className="dashboard-secondary-btn full"
                  onClick={() => setActiveSection('contract')}
                >
                  {unsignedContracts.length > 0 ? 'Ký hợp đồng trực tuyến ngay' : 'Mở trang Hợp đồng & Gia hạn'}
                </button>

              </section>

            </div>


            {/* ===== QUICK ACTIONS ===== */}

            <section className="overview-panel quick-actions-panel">

              <div className="overview-panel-heading">

                <div>
                  <span className="customer-eyebrow">
                    ĐIỀU HƯỚNG NHANH
                  </span>

                  <h2>Bạn muốn thực hiện tác vụ gì?</h2>
                </div>

              </div>


              <div className="quick-actions-grid">

                <button
                  type="button"
                  className="quick-action"
                  onClick={() => navigate('/facilities')}
                >
                  <span className="quick-action-icon blue">
                    +
                  </span>

                  <div>
                    <strong>Thuê thêm kho mới</strong>
                    <small>
                      Chọn cơ sở, diện tích và đặt giữ chỗ
                    </small>
                  </div>

                  <span>→</span>
                </button>


                <button
                  type="button"
                  className="quick-action"
                  onClick={() => setActiveSection('storage')}
                >
                  <span className="quick-action-icon">
                    ▣
                  </span>

                  <div>
                    <strong>Lấy mã PIN & Thao tác kho</strong>
                    <small>
                      Xem thẻ ra vào, đóng phí, gia hạn, trả kho
                    </small>
                  </div>

                  <span>→</span>
                </button>


                <button
                  type="button"
                  className="quick-action"
                  onClick={() => setActiveSection('contract')}
                >
                  <span className="quick-action-icon yellow">
                    ▤
                  </span>

                  <div>
                    <strong>Ký HĐ, Gia hạn & Trả kho</strong>
                    <small>
                      Thủ tục pháp lý & biên bản bàn giao
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
                    NHẬT KÝ ĐƠN THUÊ
                  </span>

                  <h2>Hoạt động đặt thuê gần đây</h2>
                </div>

              </div>


              <div className="activity-list">
                {rentals.slice(0, 5).map(item => (
                  <div className="activity-item" key={item.reservationId}>
                    <span className={`activity-dot ${item.paymentStatus === 'Completed' ? 'green' : 'yellow'}`} />
                    <div>
                      <strong>Đơn {formatReservationCode(item.reservationId)} · {item.statusLabel}</strong>
                      <small>{item.facility} · {item.unitId || 'Chưa phân kho'} · {item.startDate} → {item.endDate}</small>
                    </div>
                    <span className="activity-time">{item.paymentStatus === 'Completed' ? 'Đã đặt cọc' : 'Chờ đặt cọc'}</span>
                  </div>
                ))}
                {rentals.length === 0 && <p>Chưa có hoạt động đặt thuê kho nào.</p>}
              </div>

            </section>

          </div>
        )}

        {activeSection === 'storage' && (
          <MyStoragePage
            customerRental={customerRental}
            customerRentals={rentals}
            facilities={facilities}
            onRentalsChanged={onReloadRentals}
            onOpenPayment={() => setActiveSection('payment')}
            onOpenContract={openContractForReservation}
            onSignContract={signContractForRental}
          />
        )}

        {activeSection === 'contract' && (
          <ContractPage
            customerRental={customerRental}
            customerRentals={rentals}
            getCurrentUser={getCurrentUser}
            facilities={facilities}
            onRentalsChanged={onReloadRentals}
            onOpenPayment={() => setActiveSection('payment')}
          />
        )}

        {activeSection === 'payment' && (
          <CustomerPaymentCenter
            reservations={rentals}
            onChanged={onReloadRentals}
            onOpenContract={openContractForReservation}
            renderRefund={item => <RefundTimeline item={item} formatMoney={n => `${new Intl.NumberFormat('vi-VN').format(n || 0)}đ`} />}
          />
        )}

        {activeSection === 'notifications' && (
          <CustomerNotificationsPage center={notices} onAction={openNotice} />
        )}

        {activeSection === 'profile' && (
          <ProfilePage user={user} rentals={rentals} onLogout={logout} onOpenStorage={() => setActiveSection('storage')} />
        )}

      </main>

    </div>
  )
}

// Export only the main customer dashboard to App.jsx.
export default CustomerDashboard
