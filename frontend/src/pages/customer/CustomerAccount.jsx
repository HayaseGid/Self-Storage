/**
 * ======================================================================
 * FILE: src/pages/customer/CustomerAccount.jsx  —  TRANG TÀI KHOẢN KHÁCH HÀNG (route /customer)
 * Gồm các tab (component con trong cùng file):
 * - Tổng quan (trong CustomerDashboard): việc cần làm ngay, thông báo mới, số liệu.
 * - Kho của tôi (MyStoragePage): bảng/thẻ các kho đã đặt, chi tiết kho, mã truy cập, tác vụ nhanh.
 * - Hợp đồng (ContractPage): hợp đồng chờ ký / đang thuê / đang trả kho / đã kết thúc; ký, gia hạn, trả kho, đóng tiền.
 * - Thanh toán (CustomerPaymentCenter ở features/payment/PendingPayments.jsx) + RefundTimeline (tiến trình hoàn cọc).
 * - Thông báo (CustomerNotificationsPage) · Hồ sơ (ProfilePage, chỉ xem).
 * Luồng dữ liệu / API:
 * - Danh sách đơn (customerRentals) do App.jsx tải: GET /api/customer-reservations/mine, truyền vào qua props;
 *   onReloadRentals() để tải lại.
 * - Chữ ký hợp đồng: GET/POST /api/contracts/{contractId}/signature (ContractsController).
 * - Tạo hợp đồng sau cọc (thử lại): POST /api/reservation-confirmations/mine (qua confirmAfterDeposit).
 * - Gia hạn: /api/contract-renewals/... (ContractRenewal.jsx) · Trả kho: /api/unit-returns/... (UnitReturn.jsx)
 * - Kiểm kho: /api/return-inspections/mine · Phí trễ hạn: /api/late-fees/mine · Chính sách: /api/policies
 * - Thanh toán: POST /api/vnpay/create (qua startVnPayPayment) · Email hợp đồng: POST /api/email/send-contract
 * Dùng ở: App.jsx (role CUSTOMER).
 * ======================================================================
 */
// ============================================================
// CUSTOMER ACCOUNT / CUSTOMER DASHBOARD
// ============================================================
// NOTE:
// - Class names are intentionally kept 100% the same as the original file.
// - Only the customer-related components were moved here.
// - Shared data/functions are received from App.jsx via props.

import React, { useEffect, useState } from 'react'
import ContractModal from '../../features/contract/ContractModal'
import { apiGet, apiPost } from '../../api/api'
import { formatReservationCode } from '../../services/storageRules'
import DataGrid from '../../components/common/DataGrid'
import { UnitTypeChip, getUnitTypeStyle } from '../../features/unit/unitTypes'
import '../../features/unit/unitTypes.css'
import { formatSignedAt } from '../../services/contractSignatures'
import ContractSignFlow, { CONTRACT_TERMS_VERSION } from '../../features/contract/ContractSignFlow'
import ContractDetailModal from '../../features/contract/ContractDetailModal'
import { sendContractEmail } from '../../api/contractEmail'
import { usePolicies } from '../../services/policies'
import { useDialog } from '../../components/common/Dialog'
import { useContractRenewals, RenewalSection, RenewalModal, fmtIsoDate } from '../../features/contract/ContractRenewal'
import { focusContract, takePendingContractFocus } from '../../services/afterDeposit'
import { OPEN_SECTION_EVENT, RENEW_REQUEST_KEY, clearContractSignRequest, confirmAfterDeposit, peekContractSignRequest, requestContractSign, requestRenewal, takeCustomerSection, takeRenewalRequest } from '../../services/afterDeposit'
import { useCustomerNotifications } from '../../services/customerNoticeData'
import CustomerNotificationsPage, { NotificationsPreview } from '../../features/notification/CustomerNotifications'
import CancelReservationModal, { retryRefund } from '../../features/booking/CancelReservation'
import ContractCard from '../../features/contract/ContractCard'
import { ReturnRequestModal, ReturnSection, useUnitReturns } from '../../features/return/UnitReturn'
import { SIMULATED_PAYMENT_ENABLED, startVnPayPayment } from '../../api/vnpay'
import { payLateFeesDemo, useLateFees } from '../../api/lateFees'
import { CustomerPaymentCenter, PendingDepositBar, pendingDepositsOf } from '../../features/payment/PendingPayments' // [THÊM] trang Thanh toán mới + nhắc đơn chưa đặt cọc
import { useMyInspections } from '../../features/return/ReturnInspection' // [THÊM 14] thông báo kết quả kiểm kho chờ xác nhận
import { Code, FilterChips, Pager, UnitCodes, newestFirst, useClientPaging } from '../../components/common/listKit' // [THÊM] phân trang + mã nổi bật + mới nhất lên đầu
import './CustomerAccount.css'

/**
 * Component icon SVG cho từng mục menu bên trái của trang khách (overview, storage, contract, payment...).
 * @param {{name: string}} props tên mục.
 */
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
/**
 * Đổi ngày 'dd/MM/yyyy' thành số yyyymmdd để sắp xếp đúng theo ngày (sai định dạng -> null).
 */
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

/**
 * Component tab "Kho của tôi": hiển thị các kho/đơn của khách dạng Bảng (DataGrid có lọc trạng thái, cơ sở) hoặc Thẻ
 * (phân trang 5 thẻ), hộp chi tiết kho, mã truy cập (sao chép được), tác vụ nhanh theo trạng thái.
 * Tải thêm qua hook: useContractRenewals, useUnitReturns, useLateFees.
 * @param {object} props customerRental, customerRentals, facilities, onRentalsChanged(), onOpenPayment(),
 *   onOpenContract(reservationId), onSignContract(rental).
 */
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
  // Đổi kiểu hiển thị (bảng / thẻ) và nhớ lựa chọn vào localStorage.
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

  // Tính tổng phí trễ hạn chưa đóng (không đang chờ VNPay) của 1 đơn.
  const lateUnpaidOf = rental => (lateFees.byReservation(rental.reservationId)?.lateFees || [])
    .filter(f => f.status === 'Unpaid' && !f.pendingPayment)
    .reduce((n, f) => n + Number(f.amount || 0), 0)

  // Sao chép mã truy cập / mã PIN vào clipboard và hiện "Đã chép" trong 1,8 giây.
  const copyPin = (id, text) => {
    if (!text) return
    try {
      navigator.clipboard?.writeText(String(text))
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(curr => (curr === id ? null : curr)), 1800)
    } catch { /* bỏ qua */ }
  }

  // Mở hộp thoại báo trả kho cho 1 kho nếu đủ điều kiện; không đủ thì báo lý do.
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
  /**
   * Vẽ các nút tác vụ nhanh theo trạng thái thực tế của kho: Đóng tiền cọc, Ký hợp đồng, Đóng phí, Hợp đồng,
   * Gia hạn, Báo trả kho / Đang trả kho.
   * @param {object} rental đơn/kho.
   * @param {{stopProp?:boolean, closeDetail?:boolean}} options stopProp: chặn click lan ra dòng; closeDetail: đóng hộp chi tiết.
   */
  const renderUnitActions = (rental, { stopProp = false, closeDetail = false } = {}) => {
    // Bọc hàm xử lý nút: chặn lan sự kiện / đóng hộp chi tiết (nếu cần) rồi chạy hàm.
    const wrap = fn => event => {
      if (stopProp) event.stopPropagation()
      if (closeDetail) setSelectedRental(null)
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
          <span className="customer-eyebrow">KHO LƯU TRỮ CỦA BẠN</span>
          <h1>Kho của tôi</h1>
          <p>Mã PIN ra vào cổng, vị trí ô kho và thao tác nhanh theo từng kho.</p>
        </div>

        <span className="page-count">
          {activeRentals.length} đang thuê · {rentals.length} đơn
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
              // Bộ lọc "Trạng thái": dòng khớp khi trạng thái đơn bằng giá trị chọn.
              match: (rental, value) => rental.status === value
            },
            {
              key: 'facility',
              label: 'Cơ sở',
              options: [...new Set(rentals.map(rental => rental.facility).filter(Boolean))].map(name => ({ value: name, label: name })),
              // Bộ lọc "Cơ sở": dòng khớp khi tên cơ sở bằng giá trị chọn.
              match: (rental, value) => rental.facility === value
            }
          ]}
          getCreatedAt={rental => rental.createdAt}
          onRowClick={rental => setSelectedRental(rental)}
          caption="Bấm vào một dòng để xem chi tiết kho và thực hiện các tác vụ (ký hợp đồng, gia hạn, trả kho, đóng phí)."
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
              // Giá trị sắp xếp cột Mã đơn (số mã đơn).
              sortValue: rental => Number(rental.reservationId) || 0,
              // Hiển thị mã đơn dạng thẻ nổi bật.
              render: rental => <Code kind="order">{rental.reservationCode || formatReservationCode(rental.reservationId)}</Code>
            },
            { key: 'facility', label: 'Cơ sở' },
            {
              key: 'unitId',
              label: 'Kho',
              // Hiển thị danh sách mã kho của đơn.
              render: rental => <UnitCodes units={rental.unitNumbers?.length ? rental.unitNumbers : rental.unitId} max={3} />
            },
            {
              key: 'type',
              label: 'Loại · Size',
              // Giá trị sắp xếp cột Loại · Size (tên loại kho tiếng Việt).
              sortValue: rental => getUnitTypeStyle(rental.type).label,
              // Hiển thị nhãn loại kho + kích thước.
              render: rental => <>{rental.type ? <UnitTypeChip type={rental.type} compact /> : '—'}<span className="dg-cell-sub">{rental.size || '—'}</span></>
            },
            {
              key: 'startDate',
              label: 'Kỳ thuê',
              // Giá trị sắp xếp cột Kỳ thuê (ngày bắt đầu dạng số).
              sortValue: rental => dateSortValue(rental.startDate),
              // Hiển thị kỳ thuê "ngày bắt đầu đến ngày kết thúc".
              render: rental => <span className="dg-nowrap">{rental.startDate}<span className="dg-cell-sub">đến {rental.endDate}</span></span>
            },
            {
              key: 'remainingDays',
              label: 'Còn lại',
              align: 'right',
              // Giá trị sắp xếp cột Còn lại (chỉ với kho đang thuê).
              sortValue: rental => rental.status === 'Handed Over' ? rental.remainingDays : null,
              // Hiển thị số ngày còn lại + thanh tiến độ sử dụng (chỉ với kho đang thuê).
              render: rental => rental.status === 'Handed Over'
                ? <>{rental.remainingDays} ngày<div className="dg-progress" aria-hidden="true"><div style={{ width: `${rental.progress || 0}%` }} /></div></>
                : <span className="dg-cell-sub">—</span>
            },
            {
              key: 'monthlyPrice',
              label: 'Giá / tháng',
              align: 'right',
              // Giá trị sắp xếp cột Giá / tháng.
              sortValue: rental => Number(rental.monthlyPrice) || 0,
              // Hiển thị giá thuê / tháng định dạng VNĐ.
              render: rental => <span className="dg-nowrap">{new Intl.NumberFormat('vi-VN').format(Number(rental.monthlyPrice) || 0)}đ</span>
            },
            {
              key: 'status',
              label: 'Trạng thái',
              // Giá trị sắp xếp cột Trạng thái (nhãn trạng thái).
              sortValue: rental => rental.statusLabel,
              // Hiển thị nhãn trạng thái có màu.
              render: rental => <span className={`dg-pill dg-pill-wrap ${RENTAL_STATUS_TONES[rental.status] || 'info'}`}>{rental.statusLabel}</span>
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

              <div className="storage-actions">
                <button
                  type="button"
                  className="dashboard-primary-btn"
                  onClick={() => setSelectedRental(rental)}
                >
                  Xem chi tiết kho
                </button>
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
                {renderUnitActions(selectedRental, { closeDetail: true })}
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

/**
 * Component tab "Hợp đồng": chia tab Chờ ký & nhận kho / Đang thuê / Trả kho / Đã kết thúc; khối Gia hạn và Trả kho;
 * ký hợp đồng (ContractSignFlow), xem chi tiết (ContractDetailModal), gia hạn (RenewalModal), báo trả kho,
 * hủy đặt kho, đóng tiền thuê; tự tạo hợp đồng cho đơn đã cọc nếu lần trước lỗi; tự cuộn/mở theo yêu cầu từ thông báo.
 * API: GET/POST /api/contracts/{contractId}/signature, POST /api/reservation-confirmations/mine, POST /api/vnpay/create.
 * @param {object} props customerRental, customerRentals, getCurrentUser(), facilities, onRentalsChanged(), onOpenPayment().
 */
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
  const inspections = useMyInspections() // [14] kết quả kiểm kho
  const lateFees = useLateFees() // [7a] phí trễ hạn tiền thuê
  // Lấy thông tin phí trễ hạn của 1 đơn (kèm chính sách).
  const lateFeeOf = rental => {
    const item = lateFees.byReservation(rental.reservationId)
    return item ? { ...item, policy: lateFees.policy } : null
  }
  // Tính tổng phí trễ hạn chưa đóng (không đang chờ VNPay) của 1 đơn.
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
  /**
   * Đóng tiền thuê (tháng đầu / cả kỳ / kỳ đến hạn) + phí trễ hạn qua VNPay sau khi khách xác nhận.
   * API: POST /api/vnpay/create (qua startVnPayPayment, kind 'rent').
   */
  const payRent = async rental => {
    // [7a] tiền thuê đóng được ngay + phí trễ hạn chưa đóng (VNPay thu chung 1 giao dịch)
    const rentAmount = Number(rental.rentPayableNow || 0)
    const lateAmount = lateUnpaidOf(rental)
    const amount = rentAmount + lateAmount
    if (!amount) return
    // Định dạng số tiền kiểu Việt Nam (không kèm "đ").
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
      await startVnPayPayment([rental.reservationId], { amount, count: 1, label: rental.contractNumber, kind: 'rent' })
    } catch (error) {
      await dialog.alert({ tone: 'danger', title: 'Chưa đóng được tiền thuê', message: error.message })
      setPayingRent(null)
    }
  }

  /*
   * Hợp đồng ký online NGAY SAU KHI khách đặt cọc (không còn bước Facility Manager duyệt).
   * Backend: MỘT đơn đặt chỗ (có thể nhiều kho, đặt từ giỏ hàng) = MỘT hợp đồng (ContractNumber),
   * nên mỗi nhóm ở đây là một đơn; danh sách kho nằm trong rental.units (Phụ lục 01).
   */
  const allRentals = Array.isArray(customerRentals) ? customerRentals.filter(Boolean) : []
  // Số kho trong 1 đơn (mặc định 1).
  const unitCountOf = r => (r.units?.length || r.unitCount || 1)
  // Phụ lục gia hạn: lấy hợp đồng gốc từ API danh sách đặt chỗ, hoặc từ API gia hạn (nếu backend dùng API cũ).
  // Lấy thông tin hợp đồng gốc nếu đơn là phụ lục gia hạn (từ dữ liệu đơn hoặc API gia hạn).
  const renewedFromOf = r => r.renewedFrom || renewals.byReservation(r.reservationId)?.renewedFrom || null
  // Kiểm tra đơn có phải phụ lục gia hạn không.
  const isRenewalRental = r => Boolean(r.isRenewal || renewedFromOf(r))
  // Dựng "nhóm hợp đồng" để hiển thị/ký: mỗi đơn = 1 hợp đồng (key, code, title, renewedFrom, rentals).
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
  // Lấy địa chỉ cơ sở của 1 nhóm hợp đồng.
  const facilityAddressOf = group => facilities.find(f => f.name === group.rentals[0].facility)?.location
  // Kiểm tra hợp đồng của đơn đã được ký chưa (theo chữ ký đã tải hoặc trạng thái hợp đồng).
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
  const returnsInProgress = returns.items.filter(i => {
    if (!i.request) return false
    const insp = inspections.byReservation(i.reservationId)
    if (insp && insp.status !== 'Settled') return true
    return i.request.status !== 'Completed' ||
      Number(i.request.amountOwed) > 0 ||
      (Number(i.request.refundAmount) > 0 && i.request.refundStatus !== 'Completed')
  }).length
  const [contractTab, setContractTab] = useState(() => (pendingCountAll > 0 ? 'pending' : 'active'))
  // Xác định tab chứa 1 đơn (active / pending / ended) để chuyển tab trước khi cuộn tới thẻ hợp đồng.
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
  /**
   * Xác nhận đơn đã cọc + tạo hợp đồng (thử lại khi lần trước lỗi); tạo được thì tải lại danh sách.
   * API: POST /api/reservation-confirmations/mine (qua confirmAfterDeposit)
   * @param {Array} ids mã các đơn; showResult = true thì báo lỗi bằng pop-up.
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
    // Khi có sự kiện mở tab Hợp đồng: tăng biến đếm để chạy lại logic cuộn tới thẻ hợp đồng.
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
    // Khi có sự kiện mở tab Hợp đồng: tăng biến đếm để kiểm tra yêu cầu mở hộp thoại gia hạn.
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
    // Khi có sự kiện mở tab Hợp đồng: đọc lại yêu cầu mở màn hình ký hợp đồng.
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

  /**
   * Ký tất cả hợp đồng trong nhóm đang ký; ký xong gửi email hợp đồng, mở chi tiết, báo thành công và tải lại.
   * API: POST /api/contracts/{contractId}/signature  body { signatureImage, termsVersion, acceptedTerms }
   *      POST /api/email/send-contract (qua sendContractEmail)
   */
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

  // Khóa của 1 đơn trong các bảng chữ ký = contractId (chuỗi).
  const keyOf = rental => String(rental.contractId)

  /**
   * Tải lại trạng thái chữ ký của 1 hợp đồng.
   * API: GET /api/contracts/{contractId}/signature
   */
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

  /**
   * Ký 1 hợp đồng từ hộp thoại ContractModal (luồng cũ) và cập nhật chữ ký.
   * API: POST /api/contracts/{contractId}/signature
   */
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
          <span className="customer-eyebrow">HỢP ĐỒNG & THỦ TỤC</span>
          <h1>Hợp đồng thuê kho</h1>
          <p>Ký hợp đồng trực tuyến, gia hạn kỳ mới và đăng ký trả kho.</p>
        </div>

        {(pendingCount > 0 || toSign.length > 0) && (
          <span className="page-count">
            {toSign.length || pendingCount} hợp đồng chờ ký
          </span>
        )}
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
            inspection={inspections.byReservation(rental.reservationId)}
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
/**
 * Định dạng thời điểm UTC (tự thêm "Z" nếu thiếu) thành "HH:mm dd/MM/yyyy".
 */
const fmtUtc = iso => {
  if (!iso) return ''
  const text = String(iso)
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
/**
 * Component tiến trình hoàn cọc khi hủy đặt kho: tạo yêu cầu -> gửi cổng thanh toán -> cổng xác nhận đã hoàn
 * (có ghi chú khi VNPay sandbox phải hoàn mô phỏng).
 * @param {object} props item (đơn có thông tin hoàn tiền), formatMoney.
 */
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
/**
 * Component tab "Hồ sơ" (chỉ xem): thông tin tài khoản, số kho đang thuê / chờ cọc, mã truy cập cơ sở (sao chép được).
 * Backend chưa có API sửa hồ sơ / đổi mật khẩu.
 * @param {object} props user, rentals, onLogout(), onOpenStorage().
 */
function ProfilePage({ user, rentals, onLogout, onOpenStorage }) {
  const [copied, setCopied] = useState(false)
  const activeCount = rentals.filter(item => item.status === 'Handed Over').length
  const pendingCount = rentals.filter(item => item.status === 'Pending Deposit').length
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase()

  const accessCode = user?.accessCode || rentals.find(r => r.customerAccessCode)?.customerAccessCode || rentals.flatMap(r => r.accesses || []).find(a => a.accessType === 'Access Code')?.accessValue || null
  const latestAccessStatus = rentals.find(r => r.customerAccessCodeStatus)?.customerAccessCodeStatus
  const accessStatus = latestAccessStatus || user?.accessCodeStatus || (accessCode ? 'Active' : 'Unissued')

  // Sao chép mã truy cập cơ sở vào clipboard và hiện "Đã chép" 2 giây.
  const handleCopyCode = () => {
    if (!accessCode) return
    navigator.clipboard.writeText(accessCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const rows = [
    ['Họ và tên', user?.name || '—'],
    ['Email', user?.email || '—'],
    ['Loại tài khoản', 'Khách hàng thuê kho'],
    ['Mã khách hàng', user?.userId ? `KH-${user.userId}` : '—']
  ]
  // Trạng thái hiển thị của mã ra vào: chưa cấp / tạm khóa / đang hoạt động.
  const accessState = !accessCode ? 'unissued' : accessStatus === 'Locked' ? 'locked' : 'active'
  const accessBadge = { unissued: 'Chưa cấp', locked: 'Tạm khóa do nợ quá hạn', active: 'Đang hoạt động' }[accessState]
  return (
    <div className="customer-content-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">HỒ SƠ CHỦ HỢP ĐỒNG & ĐỊNH DANH</span>
          <h1>Hồ sơ cá nhân</h1>
          <p>Thông tin pháp lý dùng để đứng tên hợp đồng thuê kho, đối chiếu CCCD khi nhận kho và nhận thông báo từ StoreSpace.</p>
        </div>
      </div>

      <div className="profile-layout">
        <section className="profile-card">
          <div className="profile-head">
            <span className="profile-avatar" aria-hidden="true">{initial}</span>
            <div>
              <h2>{user?.name || 'Khách hàng'}</h2>
              <p>{user?.email}</p>
              <div className="profile-tags">
                <span className="profile-tag">Khách hàng thuê kho</span>
                {user?.userId && <span className="profile-tag">KH-{user.userId}</span>}
              </div>
            </div>
          </div>

          <h3 className="profile-section-title">Thông tin tài khoản</h3>
          <dl className="profile-info">
            {rows.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>

          <h3 className="profile-section-title">Hoạt động thuê kho</h3>
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

        <section className={`access-card is-${accessState}`}>
          <div className="access-card-head">
            <span className="access-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
                <path d="M12 14.5v2.5" />
              </svg>
            </span>
            <div className="access-card-title">
              <h3>Mã ra vào cơ sở</h3>
              <small>Dùng mở cổng &amp; cửa an ninh cơ sở StoreSpace</small>
            </div>
            <span className="access-badge">● {accessBadge}</span>
          </div>

          <div className="access-code-box">
            <div>
              <span>Mã 6 chữ số cá nhân của bạn</span>
              <strong className={accessCode ? 'access-code-value' : 'access-code-empty'}>
                {accessCode || 'Chưa cấp, cấp khi nhận bàn giao kho'}
              </strong>
            </div>
            {accessCode && (
              <button type="button" className="access-copy-btn" onClick={handleCopyCode}>
                {copied ? '✓ Đã sao chép' : 'Sao chép mã'}
              </button>
            )}
          </div>

          <ul className="access-rules">
            <li><strong>Định danh cá nhân</strong><span>Mã 6 chữ số này là định danh duy nhất để mở cổng và cửa an ninh cơ sở.</span></li>
            <li><strong>Chìa khóa ô kho</strong><span>Mỗi ô kho được cấp chìa khóa vật lý riêng, nhân viên bàn giao trực tiếp tại cơ sở.</span></li>
            <li><strong>Thời hạn hiệu lực</strong><span>Mã hoạt động liên tục trong suốt thời gian có hợp đồng thuê kho hợp lệ.</span></li>
            <li><strong>Bảo mật &amp; tạm khóa</strong><span>Chậm thanh toán tiền thuê hoặc chi phí phát sinh quá 30 ngày, hệ thống tự động tạm khóa mã.</span></li>
          </ul>
        </section>
      </div>
    </div>
  )
}

/**
 * Component khung trang khách hàng: menu trái (có số thông báo), các tab, Tổng quan (việc cần làm ngay, thông báo),
 * tính thông báo (useCustomerNotifications), đánh dấu đã xem khi mở tab, điều hướng theo thông báo, đăng xuất.
 * @param {object} props facilities, storageUnits, customerRental, customerRentals, getCurrentUser(), navigate,
 *   currentUserKey, onReloadRentals().
 */
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
  // Mở đúng nơi xử lý của 1 thông báo (ký hợp đồng, gia hạn, chuyển tab, cuộn tới thẻ hợp đồng).
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
  // Vẽ số đỏ (badge) cho 1 mục menu: thông báo chưa xem; mục Thanh toán còn cộng đơn chờ cọc và hóa đơn đến hạn.
  const navBadge = section => {
    const count = section === 'notifications' ? notices.unseenCount : section === 'payment' ? paymentBadgeIds.size : notices.countBySection[section] || 0
    return count > 0 && activeSection !== section
      ? <span className="cnav-badge" aria-label={`${count} thông báo mới`}>{count > 9 ? '9+' : count}</span>
      : null
  }
  // Mở tab theo yêu cầu (vd sau khi gia hạn: tab Hợp đồng để ký phụ lục).
  useEffect(() => {
    // Nhận sự kiện 'storespace:open-section' để chuyển sang tab được yêu cầu.
    const onOpen = event => { if (event.detail) setActiveSection(event.detail) }
    window.addEventListener(OPEN_SECTION_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen)
  }, [])

  // Chuyển sang tab Hợp đồng và cuộn tới thẻ hợp đồng của đơn.
  const openContractForReservation = reservationId => {
    if (reservationId) focusContract(reservationId)
    setActiveSection('contract')
  }

  // Chuyển sang tab Hợp đồng và mở màn hình ký cho hợp đồng của đơn.
  const signContractForRental = targetRental => {
    if (targetRental?.contractId) requestContractSign(targetRental.contractId)
    setActiveSection('contract')
  }

  // Đăng xuất: xóa phiên khỏi localStorage và về trang chủ.
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
      // Nút việc cần làm "Đóng tiền cọc": mở tab Thanh toán.
      onClick: () => setActiveSection('payment')
    })),
    ...unsignedContracts.map(item => ({
      id: `sign-${item.reservationId}`,
      tone: 'warn',
      title: `Hợp đồng ${item.contractNumber || formatReservationCode(item.reservationId)} chờ chữ ký điện tử của bạn`,
      sub: `${item.facility} · Kho ${item.unitId || 'đã đặt'} · Ký trực tuyến để sẵn sàng nhận bàn giao kho.`,
      btnLabel: 'Ký hợp đồng ngay',
      // Nút việc cần làm "Ký hợp đồng ngay": mở màn hình ký hợp đồng.
      onClick: () => signContractForRental(item)
    })),
    ...rentDueRentals.map(item => ({
      id: `rent-${item.reservationId}`,
      tone: 'danger',
      title: `Kho ${item.unitId || formatReservationCode(item.reservationId)} đến hạn đóng tiền thuê kỳ này`,
      sub: `Số tiền cần đóng: ${new Intl.NumberFormat('vi-VN').format(Number(item.rentPayableNow || 0))}đ (${item.facility}).`,
      btnLabel: 'Thanh toán hóa đơn',
      // Nút việc cần làm "Thanh toán hóa đơn": mở tab Thanh toán.
      onClick: () => setActiveSection('payment')
    })),
    ...expiringRentals.map(item => ({
      id: `exp-${item.reservationId}`,
      tone: 'warn',
      title: `Kho ${item.unitId} (${item.facility}) còn ${item.remainingDays} ngày sử dụng`,
      sub: `Ngày hết hạn: ${item.endDate}. Bạn có thể gia hạn trực tuyến hoặc đăng ký lịch trả kho.`,
      btnLabel: 'Gia hạn / Xem HĐ',
      // Nút việc cần làm "Gia hạn / Xem HĐ": mở thẻ hợp đồng của kho sắp hết hạn.
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
            <small>Khách hàng</small>
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
          <span className="cportal-nav-group-label">Quản lý kho</span>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            <span className="cportal-nav-icon"><NavIcon name="overview" /></span>
            <span className="cportal-nav-label">Tổng quan</span>
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveSection('storage')}
          >
            <span className="cportal-nav-icon"><NavIcon name="storage" /></span>
            <span className="cportal-nav-label">Kho của tôi</span>
            {navBadge('storage')}
          </button>

          <button
            type="button"
            className="cportal-nav-btn cportal-book-cta"
            onClick={() => navigate('/search')}
          >
            <span className="cportal-nav-icon"><NavIcon name="search" /></span>
            <span className="cportal-nav-label">Thuê thêm kho ↗</span>
          </button>
        </div>

        <div className="cportal-nav-group">
          <span className="cportal-nav-group-label">Pháp lý & Phí</span>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'contract' ? 'active' : ''}`}
            onClick={() => setActiveSection('contract')}
          >
            <span className="cportal-nav-icon"><NavIcon name="contract" /></span>
            <span className="cportal-nav-label">Hợp đồng</span>
            {navBadge('contract')}
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'payment' ? 'active' : ''}`}
            onClick={() => setActiveSection('payment')}
          >
            <span className="cportal-nav-icon"><NavIcon name="payment" /></span>
            <span className="cportal-nav-label">Thanh toán</span>
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
            <span className="cportal-nav-label">Thông báo</span>
            {navBadge('notifications')}
          </button>

          <button
            type="button"
            className={`cportal-nav-btn ${activeSection === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveSection('profile')}
          >
            <span className="cportal-nav-icon"><NavIcon name="profile" /></span>
            <span className="cportal-nav-label">Hồ sơ</span>
          </button>
        </div>

        <div className="customer-sidebar-bottom">
          <button type="button" onClick={logout}>
            <span>↪</span>
            Đăng xuất
          </button>
        </div>

      </aside>

      <main className="customer-main">

        {/* HEADER GỌN GÀNG */}
        <div className="cportal-header-bar">
          {activeSection === 'overview' ? (
            <div className="cportal-welcome">
              <h1>Xin chào, {user?.name || 'Khách hàng'}!</h1>
              <p>Tóm tắt kho đang thuê, hợp đồng và các khoản thanh toán của bạn.</p>
            </div>
          ) : <div />}

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
