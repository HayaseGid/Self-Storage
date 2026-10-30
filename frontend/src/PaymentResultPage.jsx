import React, { useEffect, useRef, useState } from 'react'
import { apiGet } from './api'
import { useDialog } from './Dialog'
import { formatVnd } from './storageRules'
import { announceDepositSuccess, openCustomerSection } from './afterDeposit'
import { clearPendingVnPay, readPendingVnPay } from './vnpay'
import './PaymentResultPage.css'

/*
 * Trang VNPay chuyển về sau khi thanh toán: /payment-result?vnp_...
 * Gửi nguyên query cho backend kiểm tra chữ ký + ghi nhận cọc (idempotent), rồi:
 *  - thành công: "Đặt cọc thành công" -> OK -> tab Hợp đồng để ký;
 *  - thất bại / khách hủy: báo lý do, cho thanh toán lại trong mục Thanh toán.
 */
export default function PaymentResultPage({ navigate }) {
  const dialog = useDialog()
  const [state, setState] = useState({ loading: true, result: null, error: '' })
  const started = useRef(false)
  const pending = readPendingVnPay()

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
        setState({ loading: false, result, error: '' })
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
            <h1>Đặt cọc thành công</h1>
            <p>Đã nhận {formatVnd(result.amount)}đ qua VNPay{result.transactionNo ? ` · Mã GD ${result.transactionNo}` : ''}.</p>
            <button type="button" className="dashboard-primary-btn" onClick={() => openCustomerSection(navigate, 'contract')}>Ký hợp đồng</button>
          </>
        )}
        {failed && (
          <>
            <span className="pr-icon err" aria-hidden="true">!</span>
            <h1>Chưa thanh toán được</h1>
            <p>{error || result?.message}</p>
            {result?.txnRef && <p className="pr-muted">Mã giao dịch: {result.txnRef}</p>}
            <p className="pr-muted">Kho vẫn được giữ cho bạn đến hết thời gian giữ chỗ. Bạn có thể thanh toán lại trong mục Thanh toán.</p>
            <div className="pr-actions">
              <button type="button" className="dashboard-secondary-btn" onClick={() => navigate('/')}>Về trang chủ</button>
              <button type="button" className="dashboard-primary-btn" onClick={() => openCustomerSection(navigate, 'payment')}>Thanh toán lại</button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
