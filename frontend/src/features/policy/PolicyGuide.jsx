/**
 * ======================================================================
 * FILE: src/features/policy/PolicyGuide.jsx  —  TRANG "VỀ STORESPACE" + CHÍNH SÁCH CHUNG CHO KHÁCH
 * CHỨC NĂNG: Trình bày toàn bộ chính sách thuê kho bằng lời dễ hiểu: đặt kho & giữ chỗ, tiền cọc, thanh toán,
 *   phí quá hạn, hủy đặt chỗ, nhận kho, gia hạn, trả kho, trả kho sớm. Các con số (số tháng cọc, phút giữ chỗ,
 *   mức phí trễ, số ngày báo trước, mức hoàn cọc khi hủy...) đọc TRỰC TIẾP từ chính sách hiện hành do Business
 *   Operations Manager chỉnh (GET /api/policies qua usePolicies) nên BOM đổi chính sách thì trang này tự đổi theo.
 * THÀNH PHẦN CHÍNH:
 *   - PolicyGuide (export default): nội dung trang (mục lục + các mục chính sách).
 * DÙNG Ở: App.jsx › AboutPage (đường dẫn /about, mục "Về StoreSpace" trên menu).
 * PHỤ THUỘC: services/policies (usePolicies, describePolicy, fmtDay), services/storageRules (RENTAL_TERMS,
 *   MAX_ADVANCE_BOOKING_DAYS, formatVnd), PolicyGuide.css.
 * API: GET /api/policies (gián tiếp qua usePolicies, không cần đăng nhập).
 * ======================================================================
 */
import React from 'react'
import { describePolicy, fmtDay, usePolicies } from '../../services/policies'
import { MAX_ADVANCE_BOOKING_DAYS, RENTAL_TERMS } from '../../services/storageRules'
import './PolicyGuide.css'

/** Mục lục: [id, tiêu đề]. */
const SECTIONS = [
  ['booking', 'Đặt kho & giữ chỗ'],
  ['deposit', 'Tiền cọc'],
  ['payment', 'Thanh toán tiền thuê'],
  ['overdue', 'Phí quá hạn & phụ phí'],
  ['cancel', 'Hủy đặt chỗ & không đến nhận kho'],
  ['handover', 'Nhận kho'],
  ['renewal', 'Gia hạn hợp đồng'],
  ['return', 'Trả kho'],
  ['early', 'Trả kho sớm'],
  ['support', 'Liên hệ hỗ trợ']
]

/**
 * Một mục chính sách: tiêu đề, các ý chính và bảng thông số (nếu có).
 * @param {{id:string, title:string, children:any, settings?:Array<[string,string]>}} props
 */
function Section({ id, title, children, settings }) {
  return (
    <section className="pg-section" id={`pg-${id}`} aria-labelledby={`pg-${id}-title`}>
      <h2 id={`pg-${id}-title`}>{title}</h2>
      <div className="pg-body">{children}</div>
      {settings?.length > 0 && (
        <dl className="pg-settings">
          {settings.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}
    </section>
  )
}

/**
 * Nội dung trang chính sách. Số liệu lấy từ chính sách hiện hành (thiếu thì dùng mặc định).
 * @returns {JSX.Element}
 */
export default function PolicyGuide() {
  const { values, meta, scheduled, loaded } = usePolicies()
  const deposit = describePolicy('deposit', values.deposit)
  const overdue = describePolicy('overdue', values.overdue)
  const reservation = describePolicy('reservation', values.reservation)
  const rr = values.renewal_return || {}
  const res = values.reservation || {}
  const renewal = describePolicy('renewal_return', rr)
  const updated = Object.values(meta || {}).map(m => m?.effectiveFrom).filter(Boolean).sort().pop()
  const notice = Number(rr.returnNoticeDays ?? 7)
  const go = id => document.getElementById(`pg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="pg">
      <header className="pg-hero">
        <div className="eyebrow green">ABOUT STORESPACE</div>
        <h1>Về StoreSpace & chính sách thuê kho</h1>
        <p>
          StoreSpace kết nối bạn với các cơ sở lưu trữ và quản lý toàn bộ quá trình thuê kho — từ tìm kho, đặt kho, thanh toán,
          ký hợp đồng, nhận kho đến gia hạn và trả kho. Dưới đây là các chính sách chung áp dụng cho mọi hợp đồng.
        </p>
        <small>
          {loaded ? `Chính sách hiện hành${updated ? `, cập nhật ngày ${fmtDay(updated)}` : ''}.` : 'Đang tải chính sách mới nhất...'}
          {' '}Khi có thay đổi, nội dung trang này được cập nhật tự động. Hợp đồng đang hiệu lực giữ nguyên giá thuê đã ký.
        </small>
        {scheduled?.length > 0 && (
          <div className="pg-scheduled">Có {scheduled.length} thay đổi chính sách sắp áp dụng từ ngày {fmtDay(scheduled.map(s => s.effectiveFrom).sort()[0])}.</div>
        )}
      </header>

      <nav className="pg-toc" aria-label="Mục lục chính sách">
        {SECTIONS.map(([id, title], i) => (
          <button key={id} type="button" onClick={() => go(id)}><b>{String(i + 1).padStart(2, '0')}</b>{title}</button>
        ))}
      </nav>

      <Section id="booking" title="1. Đặt kho & giữ chỗ">
        <ul>
          <li>Thuê mới theo gói <strong>{RENTAL_TERMS.join(' hoặc ')} tháng</strong>. Một tháng thuê tính từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng sau.</li>
          <li>Ngày bắt đầu thuê (ngày nhận kho) chọn trong vòng <strong>{MAX_ADVANCE_BOOKING_DAYS} ngày</strong> kể từ hôm nay.</li>
          <li>Sau khi đặt, kho được <strong>giữ chỗ {res.holdMinutes ?? 15} phút</strong> để bạn đóng tiền cọc. Quá thời gian này mà chưa đóng cọc, đơn tự hết hạn và kho được mở lại cho người khác.</li>
          <li>Mỗi lần đặt có thể chọn nhiều kho; mỗi kho có hợp đồng và khoản cọc riêng.</li>
        </ul>
      </Section>

      <Section id="deposit" title="2. Tiền cọc" settings={deposit.settings}>
        <p>{deposit.summary}</p>
        <p>Tiền cọc được hoàn lại sau khi trả kho và kiểm tra kho xong; chỉ bị trừ khi có căn cứ (tiền thuê / phí còn thiếu, mất khóa hoặc thẻ, hư hỏng do khách).</p>
      </Section>

      <Section id="payment" title="3. Thanh toán tiền thuê">
        <ul>
          <li>Khi đặt kho chỉ đóng <strong>tiền cọc</strong>. Tiền thuê đóng sau khi nhận kho, hạn là ngày bắt đầu thuê.</li>
          <li><strong>Trả 1 lần:</strong> đóng toàn bộ tiền thuê của cả kỳ (6 hoặc 12 tháng) một lần.</li>
          <li><strong>Trả theo tháng:</strong> đóng tháng đầu khi bắt đầu thuê; mỗi tháng sau có hạn là ngày đầu kỳ đó, được đóng trước tối đa 7 ngày.</li>
          <li>Thanh toán qua VNPay; mọi khoản đã đóng / chưa đóng hiển thị ở mục Thanh toán trong tài khoản.</li>
        </ul>
      </Section>

      <Section id="overdue" title="4. Phí quá hạn & phụ phí" settings={overdue.settings}>
        <p>{overdue.summary}</p>
        <p>Phí quá hạn tính riêng cho từng kỳ tiền thuê, tăng dần tới khi bạn đóng tiền hoặc chạm mức tối đa. Còn khoản quá hạn có thể không gia hạn được hợp đồng.</p>
      </Section>

      <Section id="cancel" title="5. Hủy đặt chỗ & không đến nhận kho" settings={reservation.settings}>
        <p>{reservation.summary}</p>
      </Section>

      <Section id="handover" title="6. Nhận kho">
        <ul>
          <li>Điều kiện nhận kho: đã đóng tiền cọc và đã ký hợp đồng điện tử (ký tay trên màn hình hoặc tải ảnh chữ ký).</li>
          <li><strong>Nhận trực tiếp:</strong> đến cơ sở đúng khung giờ đã chọn, nhân viên bàn giao kho và mã ra vào.</li>
          <li><strong>Bàn giao online:</strong> mã ra vào hiện trong tài khoản, chìa khóa để ở lễ tân cơ sở.</li>
        </ul>
      </Section>

      <Section id="renewal" title="7. Gia hạn hợp đồng" settings={renewal.settings.slice(0, 5)}>
        <p>Gửi yêu cầu gia hạn trước ngày hết hạn ít nhất <strong>{rr.renewalNoticeDays ?? 7} ngày</strong>. Khi gia hạn, bạn chọn lại hình thức trả cho kỳ mới và đóng ngay toàn bộ kỳ mới (trả 1 lần) hoặc tháng đầu kỳ mới (trả theo tháng).</p>
      </Section>

      <Section id="return" title="8. Trả kho" settings={renewal.settings.slice(5).filter(([k]) => k !== 'Trả kho sớm')}>
        <ol>
          <li>Báo trả kho trong tài khoản, chọn ngày và khung giờ — báo trước ít nhất <strong>{notice} ngày</strong>. Hệ thống tự giao nhân viên nhận lại kho.</li>
          <li>{rr.returnRequirements || 'Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập.'}</li>
          <li>Nhân viên nhận lại kho, thu hồi mã / thẻ ra vào và kiểm tra kho. Có phí phát sinh thì nhân viên chụp ảnh, Quản lý duyệt, rồi bạn có <strong>{rr.inspectionConfirmDays ?? 3} ngày</strong> để đồng ý hoặc khiếu nại (quá hạn hệ thống tự xác nhận).</li>
          <li>Tiền cọc còn lại được hoàn trong <strong>{rr.depositRefundWorkingDays ?? 7} ngày</strong> sau khi quyết toán; cọc không đủ bù phí thì bạn đóng thêm phần thiếu trong 7 ngày.</li>
          <li>Hợp đồng hết hạn mà chưa báo trả, cơ sở sẽ lên lịch thu hồi kho.</li>
        </ol>
      </Section>

      <Section id="early" title="9. Trả kho sớm (chấm dứt hợp đồng trước hạn)">
        <ul>
          <li>Hợp đồng còn <strong>hơn 30 ngày</strong> mới hết hạn: bấm <strong>"Trả kho sớm"</strong>, chọn ngày giờ trả, lý do và xem trước số tiền được hoàn. Đơn được gửi tới <strong>Quản lý cơ sở</strong> duyệt; khi được duyệt, lịch trả kho được giao cho nhân viên và bạn trả kho như bình thường (mục 8).</li>
          <li><strong>Không có phí chấm dứt hợp đồng sớm.</strong> Tháng đang dở tính tròn tháng (không hoàn theo ngày lẻ).</li>
          <li><strong>Đã trả 1 lần:</strong> hoàn lại đủ tiền thuê các tháng sau tháng chứa ngày trả kho, cùng thời hạn với hoàn cọc.</li>
          <li><strong>Trả theo tháng:</strong> các kỳ sau ngày trả kho được hủy, không phải đóng. Muốn không phải đóng kỳ tới, phải gửi đơn <strong>trước ngày đóng tiền kỳ tới ít nhất {notice} ngày</strong>; gửi muộn hơn thì <strong>phải đóng cả kỳ tới</strong> (và được dùng kho tới hết kỳ đó).</li>
          <li>Sau khi được duyệt, lịch trả kho không hủy được; muốn đổi ngày giờ, liên hệ cơ sở. Trước khi duyệt, bạn có thể rút đơn.</li>
        </ul>
      </Section>

      <Section id="support" title="10. Liên hệ hỗ trợ">
        <p>Khách đã đăng nhập gửi tin ở mục <strong>Liên hệ</strong> trong tài khoản, hoặc email <a href="mailto:storespacevn101@gmail.com">storespacevn101@gmail.com</a>. Chúng tôi phản hồi qua email của bạn.</p>
      </Section>
    </div>
  )
}
