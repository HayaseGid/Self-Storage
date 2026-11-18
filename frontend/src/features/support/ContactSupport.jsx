/**
 * ======================================================================
 * FILE: src/features/support/ContactSupport.jsx  —  TRANG "LIÊN HỆ" (KHÁCH GỬI TIN NHẮN CHO BỘ PHẬN HỖ TRỢ)
 * CHỨC NĂNG: Khách đang đăng nhập chọn chủ đề, nhập nội dung rồi bấm "Gửi tin nhắn". Tin nhắn được backend gửi qua
 *   email (Brevo) tới hộp thư hỗ trợ storespacevn101@gmail.com, kèm Reply-To là email của khách, nên bộ phận hỗ trợ
 *   bấm "Trả lời" trong Gmail là trả lời thẳng cho khách.
 * THÀNH PHẦN CHÍNH:
 *   - ContactSupport (export default): form chủ đề + nội dung + nút gửi, thông báo đã gửi / lỗi, khung thông tin liên hệ.
 *   - SUPPORT_EMAIL, TOPICS: hộp thư hỗ trợ và danh sách chủ đề gợi ý.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx (mục "Liên hệ" trong nhóm "Hỗ trợ" ở menu trái, activeSection === 'contact').
 * PHỤ THUỘC: react, src/api/api (apiPost), ./ContactSupport.css.
 * API: POST /api/support/contact  body { subject, message }  (SupportController -> EmailService.SendSupportMessageAsync -> Brevo).
 * LUỒNG: chọn chủ đề -> nhập nội dung -> bấm "Gửi tin nhắn" -> submit() kiểm tra độ dài -> POST /api/support/contact
 *   -> thành công: xóa ô nhập, hiện khung "Đã gửi"; lỗi (vd gửi dồn trong 30 giây, lỗi máy chủ email): hiện câu lỗi.
 * ======================================================================
 */
import React, { useState } from 'react'
import { apiPost } from '../../api/api'
import './ContactSupport.css'

/* Hộp thư nhận tin nhắn hỗ trợ (backend cũng mặc định gửi về đây). Dùng cho liên kết "gửi email trực tiếp". */
export const SUPPORT_EMAIL = 'storespacevn101@gmail.com'

/* Chủ đề gợi ý: bấm để chọn nhanh (gửi kèm tiêu đề email cho bộ phận hỗ trợ dễ phân loại). */
export const TOPICS = ['Hợp đồng & gia hạn', 'Thanh toán & hoàn tiền', 'Kho & mã ra vào', 'Trả kho', 'Khác']

const MIN_LENGTH = 5
const MAX_LENGTH = 4000

/**
 * Trang "Liên hệ" trong khu tài khoản khách hàng: gửi tin nhắn cho bộ phận hỗ trợ qua email.
 * Được CustomerDashboard (CustomerAccount.jsx) hiển thị khi khách bấm mục "Liên hệ" ở menu trái.
 * @param {object} props
 * @param {{name?: string, email?: string}} props.user khách đang đăng nhập (để hiện email sẽ nhận câu trả lời).
 * @returns {JSX.Element}
 */
export default function ContactSupport({ user }) {
  const [topic, setTopic] = useState(TOPICS[0]) // chủ đề đang chọn (gửi làm tiêu đề email)
  const [message, setMessage] = useState('') // nội dung khách nhập
  const [sending, setSending] = useState(false) // đang gửi -> khóa nút
  const [error, setError] = useState('') // câu lỗi hiện dưới ô nhập
  const [sent, setSent] = useState(null) // { topic, at } của tin vừa gửi thành công

  const length = message.trim().length

  // Bấm "Gửi tin nhắn": kiểm tra độ dài, gọi POST /api/support/contact; thành công thì xóa ô nhập và hiện khung "Đã gửi".
  const submit = async event => {
    event.preventDefault()
    const text = message.trim()
    if (text.length < MIN_LENGTH) {
      setError(`Vui lòng nhập nội dung (ít nhất ${MIN_LENGTH} ký tự).`)
      return
    }
    setSending(true)
    setError('')
    try {
      await apiPost('/api/support/contact', { subject: topic, message: text })
      setSent({ topic, at: new Date() })
      setMessage('')
    } catch (err) {
      setError(err?.message || 'Chưa gửi được tin nhắn. Vui lòng thử lại sau.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="customer-content-page">
      <div className="customer-page-heading">
        <div>
          <span className="customer-eyebrow">HỖ TRỢ KHÁCH HÀNG</span>
          <h1>Liên hệ StoreSpace</h1>
          <p>Gửi câu hỏi hoặc yêu cầu cho bộ phận hỗ trợ. Chúng tôi sẽ trả lời qua email {user?.email ? <strong>{user.email}</strong> : 'của bạn'}.</p>
        </div>
      </div>

      <div className="cs-layout">
        <form className="cs-card" onSubmit={submit}>
          <span className="cs-label">Chủ đề</span>
          <div className="cs-topics" role="radiogroup" aria-label="Chủ đề tin nhắn">
            {TOPICS.map(item => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={topic === item}
                className={topic === item ? 'active' : ''}
                onClick={() => setTopic(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <label className="cs-label" htmlFor="cs-message">Nội dung</label>
          <textarea
            id="cs-message"
            className="cs-textarea"
            rows={7}
            maxLength={MAX_LENGTH}
            placeholder="Mô tả vấn đề của bạn, ví dụ: mã kho, mã hợp đồng, thời gian xảy ra..."
            value={message}
            onChange={e => { setMessage(e.target.value); if (error) setError('') }}
          />
          <div className="cs-row">
            <small className="cs-counter">{length}/{MAX_LENGTH} ký tự</small>
            <button type="submit" className="dashboard-primary-btn cs-send" disabled={sending || length < MIN_LENGTH}>
              {sending ? 'Đang gửi…' : 'Gửi tin nhắn'}
            </button>
          </div>
          {error && <p className="cs-error" role="alert">{error}</p>}
          {sent && !error && (
            <p className="cs-success" role="status">
              ✓ Đã gửi tin nhắn "{sent.topic}" lúc {sent.at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.
              Bộ phận hỗ trợ sẽ trả lời qua email của bạn.
            </p>
          )}
        </form>

        <aside className="cs-info">
          <h3>Thông tin liên hệ</h3>
          <dl>
            <div><dt>Email hỗ trợ</dt><dd><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></dd></div>
            <div><dt>Thời gian trả lời</dt><dd>Trong giờ làm việc, thường trong 24 giờ</dd></div>
            <div><dt>Câu trả lời gửi tới</dt><dd>{user?.email || 'Email tài khoản của bạn'}</dd></div>
          </dl>
          <p className="cs-hint">Cần gấp về kho đang thuê? Ghi rõ <strong>mã kho</strong> hoặc <strong>mã hợp đồng</strong> để được xử lý nhanh hơn.</p>
        </aside>
      </div>
    </div>
  )
}
