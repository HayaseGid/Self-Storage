import React, { useState } from 'react'
import SignaturePad from './SignaturePad'
import { formatSignedAt } from './contractSignatures'

export default function ContractModal({ rental, customerName, signature, onClose, onSign }) {
  const [agree, setAgree] = useState(false)
  const [signatureImg, setSignatureImg] = useState(null)
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSigned = !!signature

  const contractCode = rental.contractId || rental.unitId
  const nameMatches = typedName.trim().toLowerCase() === String(customerName || '').trim().toLowerCase()

  const submit = async () => {
    if (!agree) return setError('Bạn cần đồng ý với các điều khoản hợp đồng.')
    if (!signatureImg) return setError('Vui lòng ký vào khung chữ ký.')
    if (!nameMatches) return setError('Họ tên xác nhận phải trùng với tên tài khoản của bạn.')
    setError('')
    setIsSubmitting(true)
    try {
      await onSign({
        image: signatureImg,
        signerName: customerName,
        signedAt: new Date().toISOString(),
        contractId: contractCode,
        unitId: rental.unitId
      })
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const rows = [
    ['Bên cho thuê', `StoreSpace · ${rental.facility}`],
    ['Bên thuê', customerName || '—'],
    ['Mã kho', rental.unitId],
    ['Loại kho / diện tích', `${rental.type || ''}${rental.size ? ' · ' + rental.size : ''}`],
    ['Thời hạn thuê', `${rental.startDate} → ${rental.endDate}`],
    ['Giá thuê', rental.price]
  ]

  const terms = [
    'Bên thuê sử dụng kho đúng mục đích lưu trữ hàng hoá hợp pháp, không lưu trữ hàng cấm, chất nguy hiểm, cháy nổ.',
    'Bên thuê chịu trách nhiệm bảo quản mã/khoá truy cập và không chuyển nhượng quyền sử dụng cho bên thứ ba khi chưa được đồng ý.',
    'Tiền thuê được thanh toán theo chu kỳ đã thoả thuận; chậm thanh toán có thể dẫn đến tạm khoá quyền truy cập.',
    'Khi hết hạn hợp đồng, bên thuê dọn trống kho và bàn giao lại cho StoreSpace, hoặc gia hạn trước ngày kết thúc.',
    'Hai bên cam kết tuân thủ nội quy của cơ sở lưu trữ. Chữ ký điện tử trên hợp đồng này có giá trị xác nhận bên thuê đã đọc và đồng ý toàn bộ điều khoản.'
  ]

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(7, 30, 55, 0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto'
      }}
    >
      <div
        className="overview-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 28 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span className="customer-eyebrow">HỢP ĐỒNG THUÊ KHO</span>
            <h2 style={{ margin: '4px 0 0' }}>Hợp đồng #{contractCode}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ background: '#f4f8fc', borderRadius: 10, padding: '10px 14px' }}>
              <small style={{ display: 'block', color: '#5b7089' }}>{k}</small>
              <strong>{v}</strong>
            </div>
          ))}
        </div>

        <h3 style={{ marginBottom: 8 }}>Điều khoản</h3>
        <ol style={{ paddingLeft: 20, lineHeight: 1.6, color: '#25384d', marginTop: 0 }}>
          {terms.map((t, i) => <li key={i}>{t}</li>)}
        </ol>

        <h3 style={{ margin: '20px 0 8px' }}>Chữ ký của bên thuê</h3>

        {isSigned ? (
          <div style={{ border: '1px solid #bfe3cc', background: '#f1fbf5', borderRadius: 12, padding: 16 }}>
            <img src={signature.image} alt="Chữ ký" style={{ maxWidth: '100%', height: 110, objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1px solid #dfe9e2' }} />
            <p style={{ margin: '10px 0 0' }}>
              <strong>{signature.signerName}</strong> đã ký điện tử lúc {formatSignedAt(signature.signedAt)}.
            </p>
          </div>
        ) : (
          <>
            <SignaturePad onChange={setSignatureImg} />

            <label style={{ display: 'block', marginTop: 14 }}>
              <small style={{ display: 'block', color: '#5b7089', marginBottom: 4 }}>
                Nhập lại họ tên để xác nhận ({customerName})
              </small>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Họ và tên"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #c4d3e3', boxSizing: 'border-box' }}
              />
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} />
              <span>Tôi đã đọc, hiểu và đồng ý với toàn bộ điều khoản của hợp đồng thuê kho này.</span>
            </label>

            {error && <p style={{ color: '#d64545', margin: '12px 0 0', fontWeight: 600 }}>{error}</p>}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="dashboard-secondary-btn" onClick={onClose}>
            {isSigned ? 'Đóng' : 'Để sau'}
          </button>
          {!isSigned && (
            <button type="button" className="dashboard-primary-btn" onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? 'Đang lưu chữ ký...' : 'Ký & xác nhận thuê'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
