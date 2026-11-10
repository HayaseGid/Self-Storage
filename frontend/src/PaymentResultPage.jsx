import React, { useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from './api'
import { useDialog } from './Dialog'
import { formatVnd } from './storageRules'
import { announceDepositSuccess, announceRenewalSuccess, openCustomerSection, requestContractSign } from './afterDeposit'
import { clearPendingVnPay, readPendingVnPay } from './vnpay'
import { cancelHeldReservations, restoreToCart, takeVnPayCartItems } from './cart'
import './PaymentResultPage.css'

/*
 * Trang VNPay chuyển về sau khi thanh toán: /payment-result?vnp_...
 * Gửi nguyên query cho backend kiểm tra chữ ký + ghi nhận cọc (idempotent), rồi:
 *  - thành công: "Đặt cọc thành công" -> OK -> tab Hợp đồng để ký;
 *  - thất bại / khách hủy: báo lý do, cho thanh toán lại trong mục Thanh toán.
 *  - thanh toán GIA HẠN (kind = 'renewal'): hoàn tất gia hạn -> "Gia hạn thành công, vui lòng ký phụ lục gia hạn"
 *    -> OK -> mở màn hình ký phụ lục.
 */
export default function PaymentResultPage({ navigate }) {
  const dialog = useDialog()
  const [state, setState] = useState({ loading: true, result: null, error: '' })
  const started = useRef(false)
  const pending = readPendingVnPay()
  const isDeposit = !pending?.kind || pending.kind === 'deposit'
  const [released, setReleased] = useState(false)

  /* Đặt cọc thất bại / khách bấm Hủy trên VNPay: hủy đơn giữ kho, trả kho về giỏ. */
  const releaseHeld = async () => {
    await cancelHeldReservations(pending?.reservationIds, 'Khách hủy thanh toán cọc trên VNPay')
    restoreToCart(takeVnPayCartItems())
    clearPendingVnPay()
    setReleased(true)
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = window.location.search
    if (!search.includes('vnp_')) {
      setState({ loading: false, result: null, error: 'Không có thông tin giao dịch VNPay trên đường dẫn này.' })
      return
    }
    apiGet(`/api/vnpay/return-verify${search}`)
      .then(async result => {
        // Tiền thuê (ngày nhận kho / hằng tháng): chỉ ghi nhận, không đổi đơn
        if (result.success && (result.kind === 'rent' || pending?.kind === 'rent')) {
          clearPendingVnPay()
          setState({ loading: false, result: { ...result, rent: true }, error: '' })
          await dialog.alert({ tone: 'success', title: 'Đã đóng tiền thuê', message: `Đã nhận ${formatVnd(result.amount)}đ tiền thuê qua VNPay.` })
          openCustomerSection(navigate, 'contract')
          return
        }
        const isRenewal = result.kind === 'renewal' || pending?.kind === 'renewal'
        if (result.success && isRenewal) {
          clearPendingVnPay()
          // Hoàn tất gia hạn (backend thường đã làm lúc ghi nhận; gọi lại để lấy hợp đồng / thử lại nếu lỗi giữa chừng).
          let contract = result.contracts?.[0] || null
          try {
            const reservationId = result.reservationIds?.[0] || pending?.reservationIds?.[0]
            if (reservationId) contract = await apiPost(`/api/contract-renewals/${reservationId}/finalize`, {})
          } catch (finalizeError) {
            setState({ loading: false, result: { ...result, renewal: true }, error: '' })
            await dialog.alert({ tone: 'warning', title: 'Đã nhận thanh toán', message: `${finalizeError.message} Hệ thống sẽ tự hoàn tất khi bạn mở trang Hợp đồng.` })
            openCustomerSection(navigate, 'contract')
            return
          }
          setState({ loading: false, result: { ...result, renewal: true, contract }, error: '' })
          await announceRenewalSuccess(dialog, {
            contractNumber: contract?.contractNumber,
            renewedFromContractNumber: contract?.renewedFromContractNumber,
            amountText: result.amount ? `${formatVnd(result.amount)}đ` : ''
          })
          if (contract?.contractId) requestContractSign(contract.contractId)
          openCustomerSection(navigate, 'contract')
          return
        }
        if (result.success && (result.kind === 'fee' || pending?.kind === 'fee')) {
          clearPendingVnPay()
          setState({ loading: false, result: { ...result, fee: true }, error: '' })
          await dialog.alert({ tone: 'success', title: 'Đã thanh toán phí phát sinh', message: `Đã nhận ${formatVnd(result.amount)}đ qua VNPay. Cảm ơn bạn đã hoàn tất trả kho.` })
          openCustomerSection(navigate, 'contract')
          return
        }
        setState({ loading: false, result, error: '' })
        // Mã 24 = khách bấm "Hủy giao dịch" trên VNPay -> không giữ đơn lại
        if (!result.success && isDeposit && new URLSearchParams(search).get('vnp_ResponseCode') === '24') {
          await releaseHeld()
          return
        }
        if (result.success) {
          clearPendingVnPay()
          await announceDepositSuccess(dialog, {
            count: result.reservationIds?.length || pending?.count || 1,
            amountText: result.amount ? `${formatVnd(result.amount)}đ` : '',
            failed: (result.contracts?.length || 0) < (result.reservationIds?.length || 0)
          })
          openCustomerSection(navigate, 'contract')
        }
      })
      .catch(error => setState({ loading: false, result: null, error: error.message }))
  }, [])

  const { loading, result, error } = state
  const failed = !loading && (error || (result && !result.success))

  return (
    <main className="pr-page">
      <section className={`pr-card${failed ? ' bad' : ''}`} aria-live="polite">
        {loading && (
          <>
            <span className="pr-spinner" aria-hidden="true" />
            <h1>Đang xác nhận thanh toán với VNPay...</h1>
            <p>Vui lòng không đóng trang.</p>
          </>
        )}
        {!loading && result?.success && (
          <>
            <span className="pr-icon ok" aria-hidden="true">✓</span>
            <h1>{result.rent ? 'Đã đóng tiền thuê' : result.fee ? 'Đã thanh toán phí phát sinh' : result.renewal ? 'Gia hạn thành công' : 'Đặt cọc thành công'}</h1>
            <p>Đã nhận {formatVnd(result.amount)}đ qua VNPay{result.transactionNo ? ` · Mã GD ${result.transactionNo}` : ''}.</p>
            <button
              type="button"
              className="dashboard-primary-btn"
              onClick={() => {
                if (result.contract?.contractId) requestContractSign(result.contract.contractId)
                openCustomerSection(navigate, 'contract')
              }}
            >
              {result.fee || result.rent ? 'Về trang Hợp đồng' : result.renewal ? 'Ký phụ lục gia hạn' : 'Ký hợp đồng'}
            </button>
          </>
        )}
        {failed && released && (
          <>
            <span className="pr-icon err" aria-hidden="true">!</span>
            <h1>Đã hủy thanh toán</h1>
            <p>Đơn giữ kho đã được hủy, bạn không mất phí. Các kho đã được trả về giỏ hàng nếu bạn muốn đặt lại.</p>
            <div className="pr-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={() => navigate('/')}>Về trang chủ</button>
              <button type="button" className="dashboard-primary-btn" onClick={() => navigate('/cart')}>Về giỏ hàng</button>
            </div>
          </>
        )}
        {failed && !released && (
          <>
            <span className="pr-icon err" aria-hidden="true">!</span>
            <h1>Chưa thanh toán được</h1>
            <p>{error || result?.message}</p>
            {result?.txnRef && <p className="pr-muted">Mã giao dịch: {result.txnRef}</p>}
            <p className="pr-muted">{pending?.kind === 'rent'
              ? 'Tiền thuê chưa được ghi nhận. Bạn có thể đóng lại trong mục Hợp đồng.'
              : pending?.kind === 'renewal'
                ? 'Yêu cầu gia hạn vẫn được giữ đến hết thời gian chờ. Bạn có thể thanh toán lại trong mục Hợp đồng > Gia hạn hợp đồng.'
                : 'Kho vẫn được giữ cho bạn đến hết thời gian giữ chỗ. Bạn có thể thanh toán lại trong mục Thanh toán.'}</p>
            <div className="pr-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={() => navigate('/')}>Về trang chủ</button>
              {isDeposit && pending?.reservationIds?.length > 0 && (
                <button type="button" className="dashboard-secondary-btn" onClick={releaseHeld}>Hủy đặt kho</button>
              )}
              <button type="button" className="dashboard-primary-btn" onClick={() => openCustomerSection(navigate, pending?.kind === 'renewal' || pending?.kind === 'rent' ? 'contract' : 'payment')}>Thanh toán lại</button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
