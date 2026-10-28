
import React, { useState } from 'react'
import SignaturePad from './SignaturePad'
import { formatSignedAt } from './contractSignatures'

export default function ContractModal({
  rental,
  customerName,
  signature,
  onClose,
  onSign
}) {
  const [agree, setAgree] = useState(false)
  const [signatureImg, setSignatureImg] = useState(null)
  const [typedName, setTypedName] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [expandedSections, setExpandedSections] = useState({
    parties: true,
    storage: true,
    payment: true,
    terms: true,
    signature: true
  })

  const isSigned = !!signature
  const contractCode = rental.contractId || rental.unitId

  const nameMatches =
    typedName.trim().toLowerCase() ===
    String(customerName || '').trim().toLowerCase()

  const toggleSection = (section) => {
    setExpandedSections(current => ({
      ...current,
      [section]: !current[section]
    }))
  }

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') {
      return 'Chưa cập nhật'
    }

    if (typeof value === 'number') {
      return new Intl.NumberFormat('vi-VN').format(value) + 'đ'
    }

    return value
  }

  const submit = async () => {
    if (!agree) {
      setError('Bạn cần đồng ý với các điều khoản hợp đồng.')
      return
    }

    if (!signatureImg) {
      setError('Vui lòng ký vào khung chữ ký.')
      return
    }

    if (!nameMatches) {
      setError('Họ tên xác nhận phải trùng với tên tài khoản của bạn.')
      return
    }

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
      setError(submitError.message || 'Không thể lưu chữ ký hợp đồng.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const terms = [
    'Bên thuê sử dụng kho đúng mục đích lưu trữ hàng hoá hợp pháp, không lưu trữ hàng cấm, chất nguy hiểm, cháy nổ.',
    'Bên thuê chịu trách nhiệm bảo quản mã/khoá truy cập và không chuyển nhượng quyền sử dụng cho bên thứ ba khi chưa được đồng ý.',
    'Tiền thuê được thanh toán theo chu kỳ đã thoả thuận; chậm thanh toán có thể dẫn đến tạm khoá quyền truy cập.',
    'Khi hết hạn hợp đồng, bên thuê dọn trống kho và bàn giao lại cho StoreSpace, hoặc gia hạn trước ngày kết thúc.',
    'Hai bên cam kết tuân thủ nội quy của cơ sở lưu trữ. Chữ ký điện tử trên hợp đồng này xác nhận bên thuê đã đọc và đồng ý toàn bộ điều khoản.'
  ]

  const renderSection = (id, title, subtitle, content) => (
    <section className="contract-detail-section" key={id}>
      <button
        type="button"
        className="contract-detail-toggle"
        onClick={() => toggleSection(id)}
        aria-expanded={!!expandedSections[id]}
      >
        <span className="contract-detail-toggle-icon">
          {id === 'parties' && '♙'}
          {id === 'storage' && '▦'}
          {id === 'payment' && '₫'}
          {id === 'terms' && '☷'}
          {id === 'signature' && '✍'}
        </span>

        <span className="contract-detail-toggle-text">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>

        <span className="contract-detail-chevron">
          {expandedSections[id] ? '−' : '+'}
        </span>
      </button>

      {expandedSections[id] && (
        <div className="contract-detail-content">
          {content}
        </div>
      )}
    </section>
  )

  const detailItem = (label, value) => (
    <div className="contract-detail-item" key={label}>
      <small>{label}</small>
      <strong>{value || 'Chưa cập nhật'}</strong>
    </div>
  )

  return (
    <div
      className="contract-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="contract-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contract-modal-header">
          <div>
            <span className="customer-eyebrow">
              HỢP ĐỒNG THUÊ KHO
            </span>

            <h2>Hợp đồng #{contractCode}</h2>

            <p>
              Xem thông tin, điều khoản và chữ ký của hợp đồng thuê kho.
            </p>
          </div>

          <button
            type="button"
            className="contract-modal-close"
            onClick={onClose}
            aria-label="Đóng hợp đồng"
          >
            ×
          </button>
        </div>

        <div className="contract-modal-status">
          <span className={isSigned ? 'signed' : 'unsigned'}>
            <span className="contract-status-dot" />
            {isSigned ? 'Đã ký điện tử' : 'Chờ ký xác nhận'}
          </span>

          <span className="contract-modal-code">
            Mã hợp đồng: {contractCode}
          </span>
        </div>

        <div className="contract-detail-list">
          {renderSection(
            'parties',
            'Thông tin các bên',
            'Thông tin bên cho thuê và bên thuê',
            <div className="contract-detail-grid">
              {detailItem('Bên cho thuê', 'StoreSpace')}
              {detailItem('Cơ sở cho thuê', rental.facility)}
              {detailItem('Bên thuê', customerName)}
              {detailItem(
                'Mã hợp đồng',
                contractCode
              )}
            </div>
          )}

          {renderSection(
            'storage',
            'Thông tin kho lưu trữ',
            'Mã kho, loại kho, diện tích và thời hạn thuê',
            <div className="contract-detail-grid">
              {detailItem('Mã kho', rental.unitId)}
              {detailItem('Loại kho', rental.type)}
              {detailItem('Diện tích / kích thước', rental.size)}
              {detailItem('Ngày bắt đầu thuê', rental.startDate)}
              {detailItem('Ngày kết thúc thuê', rental.endDate)}
              {detailItem(
                'Trạng thái hợp đồng',
                isSigned
                  ? 'Đã ký điện tử'
                  : rental.contractStatus || 'Chưa ký'
              )}
            </div>
          )}

          {renderSection(
            'payment',
            'Thời hạn và chi phí',
            'Giá thuê và thông tin thanh toán',
            <div className="contract-detail-grid">
              {detailItem('Giá thuê', formatMoney(rental.price))}
              {detailItem(
                'Thời gian còn lại',
                rental.remainingDays != null
                  ? `${rental.remainingDays} ngày`
                  : 'Chưa cập nhật'
              )}
              {detailItem(
                'Tiến độ hợp đồng',
                rental.progress != null
                  ? `${rental.progress}%`
                  : 'Chưa cập nhật'
              )}
              {detailItem(
                'Ngày hết hạn',
                rental.endDate
              )}
            </div>
          )}

          {renderSection(
            'terms',
            'Điều khoản hợp đồng',
            `${terms.length} điều khoản thuê kho`,
            <ol className="contract-terms-list">
              {terms.map((term, index) => (
                <li key={index}>
                  <strong>Điều {index + 1}.</strong> {term}
                </li>
              ))}
            </ol>
          )}

          {renderSection(
            'signature',
            'Chữ ký của bên thuê',
            isSigned
              ? 'Thông tin xác nhận hợp đồng'
              : 'Ký điện tử để xác nhận đồng ý hợp đồng',
            isSigned ? (
              <div className="contract-signed-box">
                <div className="contract-signed-heading">
                  <span className="contract-signed-check">✓</span>
                  <div>
                    <strong>Hợp đồng đã được ký</strong>
                    <p>
                      Chữ ký điện tử đã được lưu trong hệ thống.
                    </p>
                  </div>
                </div>

                {signature.image && (
                  <img
                    src={signature.image}
                    alt="Chữ ký điện tử của khách hàng"
                    className="contract-signature-image"
                  />
                )}

                <div className="contract-detail-grid">
                  {detailItem('Người ký', signature.signerName)}
                  {detailItem(
                    'Thời điểm ký',
                    formatSignedAt(signature.signedAt)
                  )}
                </div>
              </div>
            ) : (
              <div className="contract-signing-area">
                <p className="contract-signing-description">
                  Vui lòng đọc các điều khoản trước khi ký và xác nhận.
                </p>

                <SignaturePad onChange={setSignatureImg} />

                <label className="contract-name-label">
                  <span>
                    Nhập lại họ tên để xác nhận
                  </span>

                  <small>
                    Họ tên tài khoản: {customerName || '—'}
                  </small>

                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Nhập họ và tên của bạn"
                  />
                </label>

                <label className="contract-agreement">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />

                  <span>
                    Tôi đã đọc, hiểu và đồng ý với toàn bộ điều khoản
                    của hợp đồng thuê kho này.
                  </span>
                </label>

                {error && (
                  <div className="contract-signing-error">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  className="dashboard-primary-btn contract-sign-submit"
                  onClick={submit}
                  disabled={isSubmitting}
                >
                  {isSubmitting
                    ? 'Đang lưu chữ ký...'
                    : '✍ Ký và xác nhận hợp đồng'}
                </button>
              </div>
            )
          )}
        </div>

        <div className="contract-modal-footer">
          <span>
            StoreSpace · Your Space. Your Freedom.
          </span>

          <button
            type="button"
            className="dashboard-secondary-btn"
            onClick={onClose}
          >
            Đóng hợp đồng
          </button>
        </div>
      </div>

      <style>{`
        .contract-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
          background: rgba(7, 30, 55, .68);
          backdrop-filter: blur(4px);
        }

        .contract-modal-panel {
          width: 100%;
          max-width: 820px;
          max-height: 92vh;
          overflow-y: auto;
          margin: auto;
          padding: 28px;
          border: 1px solid #e0eaf2;
          border-radius: 20px;
          background: #fff;
          box-shadow: 0 24px 80px rgba(7, 30, 55, .22);
        }

        .contract-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .contract-modal-header h2 {
          margin: 7px 0;
          color: #073d70;
          font-size: 25px;
        }

        .contract-modal-header p {
          margin: 0;
          color: #71879a;
          font-size: 13px;
          line-height: 1.6;
        }

        .contract-modal-close {
          flex: none;
          width: 38px;
          height: 38px;
          border: 1px solid #e1eaf1;
          border-radius: 11px;
          background: #f7fafc;
          color: #37556d;
          font-size: 25px;
          cursor: pointer;
        }

        .contract-modal-close:hover {
          background: #edf6fd;
          color: #0877cf;
        }

        .contract-modal-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin: 22px 0;
          padding: 14px 16px;
          border: 1px solid #e1eaf1;
          border-radius: 12px;
          background: #f8fbfd;
        }

        .contract-modal-status > span:first-child {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 800;
        }

        .contract-modal-status .signed {
          color: #16804a;
        }

        .contract-modal-status .unsigned {
          color: #a16c00;
        }

        .contract-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }

        .contract-modal-code {
          color: #698096;
          font-size: 12px;
        }

        .contract-detail-list {
          display: grid;
          gap: 12px;
        }

        .contract-detail-section {
          overflow: hidden;
          border: 1px solid #dfe8f0;
          border-radius: 14px;
          background: #fff;
        }

        .contract-detail-toggle {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 13px;
          padding: 17px;
          border: 0;
          background: #fff;
          text-align: left;
          cursor: pointer;
          transition: background .2s;
        }

        .contract-detail-toggle:hover,
        .contract-detail-toggle[aria-expanded="true"] {
          background: #f5faff;
        }

        .contract-detail-toggle-icon {
          display: grid;
          place-items: center;
          flex: none;
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: #eaf5ff;
          color: #0877cf;
          font-size: 20px;
          font-weight: 800;
        }

        .contract-detail-toggle-text {
          display: grid;
          flex: 1;
          gap: 4px;
        }

        .contract-detail-toggle-text strong {
          color: #173f60;
          font-size: 14px;
        }

        .contract-detail-toggle-text small {
          color: #8194a5;
          font-size: 11px;
        }

        .contract-detail-chevron {
          display: grid;
          place-items: center;
          flex: none;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: #edf5fb;
          color: #0877cf;
          font-size: 21px;
          font-weight: 600;
        }

        .contract-detail-content {
          padding: 0 17px 18px;
          border-top: 1px solid #edf1f5;
        }

        .contract-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding-top: 16px;
        }

        .contract-detail-item {
          min-width: 0;
          padding: 14px;
          border: 1px solid #e3ebf2;
          border-radius: 11px;
          background: #fbfdff;
        }

        .contract-detail-item small {
          display: block;
          margin-bottom: 7px;
          color: #7b8fa1;
          font-size: 11px;
        }

        .contract-detail-item strong {
          display: block;
          overflow-wrap: anywhere;
          color: #17466d;
          font-size: 13px;
          line-height: 1.6;
        }

        .contract-terms-list {
          display: grid;
          gap: 13px;
          margin: 16px 0 0;
          padding-left: 22px;
          color: #4e6578;
          font-size: 13px;
          line-height: 1.8;
        }

        .contract-terms-list li {
          padding-left: 4px;
        }

        .contract-terms-list strong {
          color: #17466d;
        }

        .contract-signed-box {
          padding-top: 17px;
        }

        .contract-signed-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border: 1px solid #ccebd8;
          border-radius: 12px;
          background: #f1fbf5;
        }

        .contract-signed-check {
          display: grid;
          place-items: center;
          flex: none;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #d8f3e2;
          color: #16804a;
          font-size: 19px;
          font-weight: 800;
        }

        .contract-signed-heading strong {
          color: #176c43;
          font-size: 13px;
        }

        .contract-signed-heading p {
          margin: 4px 0 0;
          color: #60816f;
          font-size: 11px;
        }

        .contract-signature-image {
          display: block;
          width: 100%;
          max-width: 340px;
          height: 110px;
          margin: 16px 0 0;
          padding: 8px;
          border: 1px solid #e1e9e4;
          border-radius: 10px;
          background: #fff;
          object-fit: contain;
        }

        .contract-signing-area {
          padding-top: 16px;
        }

        .contract-signing-description {
          margin: 0 0 14px;
          color: #71879a;
          font-size: 12px;
          line-height: 1.7;
        }

        .contract-name-label {
          display: grid;
          gap: 7px;
          margin-top: 16px;
        }

        .contract-name-label > span {
          color: #254b69;
          font-size: 13px;
          font-weight: 700;
        }

        .contract-name-label > small {
          color: #8194a5;
          font-size: 11px;
        }

        .contract-name-label input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 14px;
          border: 1px solid #d2e0eb;
          border-radius: 10px;
          outline: none;
          color: #244b69;
          font: inherit;
        }

        .contract-name-label input:focus {
          border-color: #1684db;
          box-shadow: 0 0 0 3px rgba(22, 132, 219, .1);
        }

        .contract-agreement {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-top: 16px;
          color: #4e6578;
          font-size: 12px;
          line-height: 1.7;
          cursor: pointer;
        }

        .contract-agreement input {
          flex: none;
          margin-top: 4px;
          accent-color: #1684db;
        }

        .contract-signing-error {
          margin-top: 13px;
          padding: 12px;
          border: 1px solid #f4caca;
          border-radius: 10px;
          background: #fff4f4;
          color: #bd3636;
          font-size: 12px;
          line-height: 1.6;
        }

        .contract-sign-submit {
          margin-top: 18px;
        }

        .contract-sign-submit:disabled {
          opacity: .65;
          cursor: wait;
        }

        .contract-modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid #e5edf3;
        }

        .contract-modal-footer > span {
          color: #8496a5;
          font-size: 11px;
        }

        @media (max-width: 600px) {
          .contract-modal-backdrop {
            padding: 10px;
          }

          .contract-modal-panel {
            max-height: 95vh;
            padding: 17px;
            border-radius: 15px;
          }

          .contract-modal-header h2 {
            font-size: 20px;
            overflow-wrap: anywhere;
          }

          .contract-detail-grid {
            grid-template-columns: 1fr;
          }

          .contract-detail-toggle {
            padding: 13px;
            gap: 10px;
          }

          .contract-detail-toggle-icon {
            width: 34px;
            height: 34px;
          }

          .contract-detail-content {
            padding: 0 12px 14px;
          }

          .contract-modal-footer {
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  )
}
