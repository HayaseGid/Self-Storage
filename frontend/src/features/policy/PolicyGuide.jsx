/**
 * ======================================================================
 * FILE: src/features/policy/PolicyGuide.jsx  —  TRANG "VỀ STORESPACE" + CHÍNH SÁCH CHUNG CHO KHÁCH
 * CHỨC NĂNG: Trình bày toàn bộ chính sách thuê kho bằng lời dễ hiểu: đặt kho & giữ chỗ, tiền cọc, thanh toán,
 *   phí quá hạn, hủy đặt chỗ, nhận kho, gia hạn, trả kho, trả kho sớm. Các con số (số tháng cọc, phút giữ chỗ,
 *   mức phí trễ, số ngày báo trước, mức hoàn cọc khi hủy...) đọc TRỰC TIẾP từ chính sách hiện hành do Business
 *   Operations Manager chỉnh (GET /api/policies qua usePolicies) nên BOM đổi chính sách thì trang này tự đổi theo.
 *   Bố cục: phần đầu (giới thiệu + 4 con số chính) → mục lục dính bên trái (tự sáng theo mục đang đọc) + các mục.
 * THÀNH PHẦN CHÍNH:
 *   - Icon, Section, Facts, Steps (nội bộ): biểu tượng, khung 1 mục, bảng thông số, các bước có đánh số.
 *   - useActiveSection (nội bộ): theo dõi mục đang hiện trên màn hình để tô sáng mục lục.
 *   - PolicyGuide (export default): nội dung trang.
 * DÙNG Ở: App.jsx › AboutPage (đường dẫn /about, mục "Về StoreSpace" trên menu).
 * PHỤ THUỘC: services/policies (usePolicies, describePolicy, describeDepositShort, fmtDay), services/storageRules
 *   (RENTAL_TERMS, MAX_ADVANCE_BOOKING_DAYS), PolicyGuide.css.
 * API: GET /api/policies (gián tiếp qua usePolicies, không cần đăng nhập).
 * ======================================================================
 */
import React, { useEffect, useRef, useState } from 'react'
import { describeDepositShort, describePolicy, fmtDay, usePolicies } from '../../services/policies'
import { MAX_ADVANCE_BOOKING_DAYS, RENTAL_TERMS } from '../../services/storageRules'
import './PolicyGuide.css'

/* Nét vẽ (path SVG 24x24) của từng biểu tượng. */
const ICON_PATHS = {
  booking: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M9 14h2M13 14h2M9 17h2" /></>,
  deposit: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  payment: <><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.5c-.4-.9-1.3-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.2 0-2.1-.6-2.5-1.5M12 6.5V8M12 16v1.5" /></>,
  overdue: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2.5h6" /></>,
  cancel: <><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  handover: <><path d="M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0 1 15 7Z" /><circle cx="16" cy="10" r="1" /></>,
  renewal: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4" /></>,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  early: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></>,
  support: <><rect x="2.5" y="4.5" width="19" height="15" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
  warn: <><path d="M10.3 4.2 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5V14M12 17.5h.01" /></>
}

/**
 * Biểu tượng SVG nét mảnh theo tên.
 * @param {{name:string, size?:number}} props
 */
function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

/** Mục lục: [id, tiêu đề ngắn, màu nhấn]. */
const SECTIONS = [
  ['booking', 'Đặt kho & giữ chỗ', 'blue'],
  ['deposit', 'Tiền cọc', 'green'],
  ['payment', 'Thanh toán tiền thuê', 'blue'],
  ['overdue', 'Phí quá hạn & phụ phí', 'amber'],
  ['cancel', 'Hủy & không đến nhận kho', 'red'],
  ['handover', 'Nhận kho', 'green'],
  ['renewal', 'Gia hạn hợp đồng', 'blue'],
  ['return', 'Trả kho', 'teal'],
  ['early', 'Trả kho sớm', 'violet'],
  ['support', 'Liên hệ hỗ trợ', 'teal']
]

/**
 * Hook: trả về id mục đang đọc (mục cuối cùng có mép trên đã cuộn qua vạch 150px dưới header) để tô sáng mục lục.
 * Cuộn tới cuối trang thì chọn mục cuối cùng.
 * @returns {string} id mục đang đọc.
 */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0])
  // Chạy 1 lần khi mount: lắng nghe cuộn trang (gộp theo khung hình); gỡ khi rời trang.
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let current = SECTIONS[0][0]
      for (const [id] of SECTIONS) {
        const el = document.getElementById(`pg-${id}`)
        if (el && el.getBoundingClientRect().top <= 150) current = id
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = SECTIONS[SECTIONS.length - 1][0]
      setActive(current)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) window.cancelAnimationFrame(frame) }
  }, [])
  return active
}

/**
 * Khung 1 mục chính sách: biểu tượng + số thứ tự + tiêu đề + câu tóm tắt + nội dung.
 * @param {{index:number, id:string, title:string, tone:string, lead?:string, children:any}} props
 */
function Section({ index, id, title, tone, lead, children }) {
  return (
    <section className={`pg-section tone-${tone}`} id={`pg-${id}`} aria-labelledby={`pg-${id}-title`}>
      <header className="pg-section-head">
        <span className="pg-icon"><Icon name={id} size={22} /></span>
        <div>
          <span className="pg-kicker">Mục {String(index).padStart(2, '0')}</span>
          <h2 id={`pg-${id}-title`}>{title}</h2>
        </div>
      </header>
      {lead && <p className="pg-lead">{lead}</p>}
      <div className="pg-body">{children}</div>
    </section>
  )
}

/**
 * Danh sách gạch đầu dòng có dấu ✓.
 * @param {{items:any[]}} props
 */
function Checks({ items }) {
  return (
    <ul className="pg-checks">
      {items.map((it, i) => <li key={i}><span className="pg-check"><Icon name="check" size={14} /></span><span>{it}</span></li>)}
    </ul>
  )
}

/**
 * Bảng thông số [tên, giá trị] dạng 2 cột, kẻ dòng.
 * @param {{rows:Array<[string,string]>, title?:string}} props
 */
function Facts({ rows, title = 'Thông số áp dụng' }) {
  if (!rows?.length) return null
  return (
    <div className="pg-facts">
      <span className="pg-facts-title">{title}</span>
      <dl>
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </div>
  )
}

/**
 * Các bước có đánh số theo trục dọc.
 * @param {{items:Array<[string, any]>}} props mỗi bước = [tiêu đề, mô tả].
 */
function Steps({ items }) {
  return (
    <ol className="pg-steps">
      {items.map(([title, text], i) => (
        <li key={title}><span className="pg-step-dot">{i + 1}</span><div><b>{title}</b><p>{text}</p></div></li>
      ))}
    </ol>
  )
}

/**
 * Khung ghi chú nổi bật (info / ok / warn).
 * @param {{tone:'info'|'ok'|'warn', children:any}} props
 */
function Callout({ tone = 'info', children }) {
  return <div className={`pg-callout ${tone}`}><Icon name={tone === 'warn' ? 'warn' : tone === 'ok' ? 'check' : 'info'} size={18} /><div>{children}</div></div>
}

/**
 * Nội dung trang chính sách. Số liệu lấy từ chính sách hiện hành (thiếu thì dùng mặc định).
 * @returns {JSX.Element}
 */
export default function PolicyGuide() {
  const { values, meta, scheduled, loaded } = usePolicies()
  const active = useActiveSection()
  const tocRef = useRef(null)
  // Điện thoại / máy tính bảng: mục lục là thanh cuộn ngang -> trượt nút của mục đang đọc vào giữa thanh.
  useEffect(() => {
    const nav = tocRef.current
    const btn = nav?.querySelector('button.active')
    if (!nav || !btn || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollTo({ left: btn.offsetLeft - nav.clientWidth / 2 + btn.clientWidth / 2, behavior: 'smooth' })
  }, [active])
  const deposit = describePolicy('deposit', values.deposit)
  const overdue = describePolicy('overdue', values.overdue)
  const reservation = describePolicy('reservation', values.reservation)
  const rr = values.renewal_return || {}
  const res = values.reservation || {}
  const renewal = describePolicy('renewal_return', rr)
  const updated = Object.values(meta || {}).map(m => m?.effectiveFrom).filter(Boolean).sort().pop()
  const notice = Number(rr.returnNoticeDays ?? 7)
  const go = id => document.getElementById(`pg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // 4 con số chính ở phần đầu trang
  const stats = [
    [`${RENTAL_TERMS.join(' / ')} tháng`, 'Gói thuê kho'],
    [describeDepositShort(values.deposit).replace(' / kho', ''), 'Tiền cọc mỗi kho'],
    [`${res.holdMinutes ?? 15} phút`, 'Giữ chỗ chờ đặt cọc'],
    ['0đ', 'Phí chấm dứt hợp đồng sớm']
  ]

  return (
    <div className="pg">
      <header className="pg-hero">
        <div className="pg-hero-copy">
          <span className="pg-eyebrow">VỀ STORESPACE</span>
          <h1>Thuê kho rõ ràng,<br />chính sách minh bạch.</h1>
          <p>
            StoreSpace kết nối bạn với các cơ sở lưu trữ và quản lý trọn vòng đời thuê kho — tìm kho, đặt kho, thanh toán,
            ký hợp đồng, nhận kho, gia hạn và trả kho. Dưới đây là toàn bộ chính sách chung áp dụng cho mọi hợp đồng.
          </p>
          <div className="pg-hero-meta">
            <span className={`pg-dot${loaded ? ' live' : ''}`} />
            {loaded ? `Chính sách hiện hành${updated ? ` · cập nhật ${fmtDay(updated)}` : ''}` : 'Đang tải chính sách mới nhất...'}
          </div>
          {scheduled?.length > 0 && (
            <div className="pg-hero-scheduled">Có {scheduled.length} thay đổi sắp áp dụng từ {fmtDay(scheduled.map(s => s.effectiveFrom).sort()[0])}</div>
          )}
        </div>
        <div className="pg-stats">
          {stats.map(([value, label]) => (
            <div key={label} className="pg-stat"><strong>{value}</strong><span>{label}</span></div>
          ))}
        </div>
      </header>

      <div className="pg-layout">
        <aside className="pg-aside">
          <nav className="pg-toc" aria-label="Mục lục chính sách" ref={tocRef}>
            <span className="pg-toc-title">Mục lục</span>
            {SECTIONS.map(([id, title, tone], i) => (
              <button key={id} type="button" className={`tone-${tone}${active === id ? ' active' : ''}`} onClick={() => go(id)} aria-current={active === id ? 'true' : undefined}>
                <span className="pg-toc-num">{String(i + 1).padStart(2, '0')}</span>{title}
              </button>
            ))}
          </nav>
          <div className="pg-aside-card">
            <b>Cần hỗ trợ?</b>
            <p>Gửi tin ở mục Liên hệ trong tài khoản hoặc email cho chúng tôi.</p>
            <a href="mailto:storespacevn101@gmail.com">storespacevn101@gmail.com</a>
          </div>
          <p className="pg-aside-note">Hợp đồng đang hiệu lực giữ nguyên giá thuê đã ký. Khi chính sách thay đổi, trang này tự cập nhật.</p>
        </aside>

        <div className="pg-content">
          <Section index={1} id="booking" title="Đặt kho & giữ chỗ" tone="blue" lead={`Chọn kho, chọn gói ${RENTAL_TERMS.join(' hoặc ')} tháng và ngày nhận kho trong vòng ${MAX_ADVANCE_BOOKING_DAYS} ngày tới.`}>
            <Checks items={[
              <>Thuê mới theo gói <strong>{RENTAL_TERMS.join(' hoặc ')} tháng</strong>. Một tháng thuê tính từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng sau.</>,
              <>Ngày bắt đầu thuê (ngày nhận kho) chọn trong vòng <strong>{MAX_ADVANCE_BOOKING_DAYS} ngày</strong> kể từ hôm nay.</>,
              <>Sau khi đặt, kho được <strong>giữ chỗ {res.holdMinutes ?? 15} phút</strong> để bạn đóng tiền cọc; quá thời gian, đơn tự hết hạn và kho mở lại cho người khác.</>,
              <>Một lần đặt có thể chọn nhiều kho; mỗi kho có hợp đồng và khoản cọc riêng.</>
            ]} />
          </Section>

          <Section index={2} id="deposit" title="Tiền cọc" tone="green" lead={deposit.summary}>
            <Checks items={[
              'Tiền cọc được hoàn lại sau khi trả kho và kiểm tra kho xong.',
              'Chỉ bị trừ khi có căn cứ: tiền thuê / phí còn thiếu, mất khóa hoặc thẻ, hư hỏng do khách.'
            ]} />
            <Facts rows={deposit.settings} />
          </Section>

          <Section index={3} id="payment" title="Thanh toán tiền thuê" tone="blue" lead="Khi đặt kho chỉ đóng tiền cọc. Tiền thuê đóng sau khi nhận kho, hạn là ngày bắt đầu thuê.">
            <div className="pg-compare">
              <div><span className="pg-tag">Trả 1 lần</span><p>Đóng toàn bộ tiền thuê của cả kỳ ({RENTAL_TERMS.join(' hoặc ')} tháng) một lần khi bắt đầu thuê.</p></div>
              <div><span className="pg-tag">Trả theo tháng</span><p>Đóng tháng đầu khi bắt đầu thuê; mỗi tháng sau có hạn là ngày đầu kỳ, được đóng trước tối đa 7 ngày.</p></div>
            </div>
            <Callout>Thanh toán qua VNPay. Mọi khoản đã đóng / chưa đóng hiển thị ở mục <strong>Thanh toán</strong> trong tài khoản.</Callout>
          </Section>

          <Section index={4} id="overdue" title="Phí quá hạn & phụ phí" tone="amber" lead={overdue.summary}>
            <Checks items={[
              'Phí tính riêng cho từng kỳ tiền thuê, tăng dần tới khi bạn đóng tiền hoặc chạm mức tối đa.',
              'Còn khoản quá hạn có thể không gia hạn được hợp đồng.'
            ]} />
            <Facts rows={overdue.settings} />
          </Section>

          <Section index={5} id="cancel" title="Hủy đặt chỗ & không đến nhận kho" tone="red" lead={reservation.summary}>
            <Facts rows={reservation.settings} title="Mức hoàn cọc & điều kiện" />
          </Section>

          <Section index={6} id="handover" title="Nhận kho" tone="green" lead="Điều kiện nhận kho: đã đóng tiền cọc và đã ký hợp đồng điện tử (ký tay trên màn hình hoặc tải ảnh chữ ký).">
            <div className="pg-compare">
              <div><span className="pg-tag">Nhận trực tiếp</span><p>Đến cơ sở đúng khung giờ đã chọn, nhân viên bàn giao kho và mã ra vào.</p></div>
              <div><span className="pg-tag">Bàn giao online</span><p>Mã ra vào hiện trong tài khoản, chìa khóa để ở lễ tân cơ sở.</p></div>
            </div>
          </Section>

          <Section index={7} id="renewal" title="Gia hạn hợp đồng" tone="blue" lead={`Gửi yêu cầu gia hạn trước ngày hết hạn ít nhất ${rr.renewalNoticeDays ?? 7} ngày.`}>
            <Checks items={['Khi gia hạn, bạn chọn lại hình thức trả cho kỳ mới và đóng ngay toàn bộ kỳ mới (trả 1 lần) hoặc tháng đầu kỳ mới (trả theo tháng).']} />
            <Facts rows={renewal.settings.slice(0, 5)} />
          </Section>

          <Section index={8} id="return" title="Trả kho" tone="teal" lead={`Báo trả kho trong tài khoản, báo trước ít nhất ${notice} ngày. Hệ thống tự giao nhân viên nhận lại kho.`}>
            <Steps items={[
              ['Báo trả kho', `Chọn ngày và khung giờ còn nhân viên rảnh, báo trước ít nhất ${notice} ngày.`],
              ['Dọn kho', rr.returnRequirements || 'Lấy hết tài sản, vệ sinh kho, trả khóa / thẻ truy cập.'],
              ['Nhận lại & kiểm tra', `Nhân viên thu hồi mã / thẻ ra vào và kiểm tra kho. Có phí phát sinh thì chụp ảnh, Quản lý duyệt, bạn có ${rr.inspectionConfirmDays ?? 3} ngày để đồng ý hoặc khiếu nại.`],
              ['Hoàn cọc', `Tiền cọc còn lại được hoàn trong ${rr.depositRefundWorkingDays ?? 7} ngày sau khi quyết toán; cọc không đủ bù phí thì đóng thêm phần thiếu trong 7 ngày.`]
            ]} />
            <Callout tone="warn">Hợp đồng hết hạn mà chưa báo trả, cơ sở sẽ lên lịch thu hồi kho.</Callout>
            <Facts rows={renewal.settings.slice(5).filter(([k]) => k !== 'Trả kho sớm')} />
          </Section>

          <Section index={9} id="early" title="Trả kho sớm" tone="violet" lead="Hợp đồng còn hơn 30 ngày mới hết hạn mà muốn ngừng thuê: bấm “Trả kho sớm”, gửi đơn để Quản lý cơ sở duyệt.">
            <Callout tone="ok"><strong>Không có phí chấm dứt hợp đồng sớm.</strong> Tháng đang dở tính tròn tháng (không hoàn theo ngày lẻ).</Callout>
            <div className="pg-compare">
              <div><span className="pg-tag">Đã trả 1 lần</span><p>Hoàn lại <strong>đủ tiền thuê các tháng sau tháng chứa ngày trả kho</strong>, cùng thời hạn với hoàn cọc.</p></div>
              <div><span className="pg-tag">Trả theo tháng</span><p>Các kỳ sau ngày trả kho <strong>được hủy, không phải đóng</strong>.</p></div>
            </div>
            <Callout tone="warn">
              Trả theo tháng: muốn không phải đóng kỳ tới, gửi đơn <strong>trước ngày đóng tiền kỳ tới ít nhất {notice} ngày</strong>.
              Gửi muộn hơn thì <strong>phải đóng cả kỳ tới</strong> (và được dùng kho tới hết kỳ đó).
            </Callout>
            <Steps items={[
              ['Gửi đơn', 'Chọn ngày giờ trả kho, lý do và xem trước số tiền được hoàn. Trước khi được duyệt bạn có thể rút đơn.'],
              ['Quản lý duyệt', 'Được duyệt thì lịch trả kho giao cho nhân viên; bị từ chối bạn thấy lý do và tiếp tục thuê như hợp đồng.'],
              ['Trả kho như bình thường', 'Đi tiếp các bước ở mục 08. Sau khi duyệt, lịch trả kho không hủy được; muốn đổi ngày giờ, liên hệ cơ sở.']
            ]} />
          </Section>

          <Section index={10} id="support" title="Liên hệ hỗ trợ" tone="teal" lead="Chúng tôi phản hồi qua email của bạn.">
            <div className="pg-support">
              <div><b>Trong tài khoản</b><p>Khách đã đăng nhập gửi tin ở mục <strong>Liên hệ</strong> (nhóm Hỗ trợ).</p></div>
              <div><b>Email</b><p><a href="mailto:storespacevn101@gmail.com">storespacevn101@gmail.com</a></p></div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
