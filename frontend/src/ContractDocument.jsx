import React from 'react'
import { POLICY_KEYS, POLICY_TITLES, buildContractTerms, fmtDay, usePolicies } from './policies'
import { formatVnd } from './storageRules'
import './ContractSignFlow.css'

/*
 * Văn bản hợp đồng thuê kho (dùng chung cho màn hình ký và màn hình chi tiết hợp đồng).
 * group: { code, rentals: [...] }  - mỗi phần tử là một đơn đặt chỗ (Reservation); một đơn có thể gồm nhiều kho
 *        (rental.units: [{ number, type, size, monthlyPrice }]) và tương ứng MỘT hợp đồng (ContractNumber).
 * signature: { image, signerName, signedAt } nếu đã ký -> hiện khối chữ ký cuối văn bản.
 * showTerms: in kèm các nhóm điều khoản chi tiết (dùng ở màn hình chi tiết).
 * group.renewedFrom = { contractNumber, startDate, endDate } -> văn bản là PHỤ LỤC GIA HẠN của hợp đồng đó.
 */
const money = value => `${formatVnd(value || 0)}đ`
const fmtIso = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const fmtTime = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* Danh sách kho trong hợp đồng (gộp các đơn của nhóm). */
export function contractUnits(rentals) {
  // Đơn 1 kho: lấy đúng giá / tháng và tiền cọc của hợp đồng (số backend đã tính), để từng dòng khớp dòng Tổng cộng
  return rentals.flatMap(r => {
    const list = r.units?.length ? r.units : [{ number: r.unitId, type: r.type, size: r.size, monthlyPrice: r.monthlyPrice }]
    const single = list.length === 1
    return list.map(u => {
      const monthlyPrice = single && r.monthlyPrice != null ? Number(r.monthlyPrice) : u.monthlyPrice
      const deposit = single && r.depositAmount != null ? Number(r.depositAmount)
        : monthlyPrice != null ? Number(monthlyPrice) * Number(r.depositMonths || 2) : null
      return { ...u, monthlyPrice, deposit, reservationCode: r.reservationCode, reservationId: r.reservationId }
    })
  })
}

export default function ContractDocument({ group, customer, facilityAddress, signature, showTerms = false, draft = false, id = 'csf-print' }) {
  const policies = usePolicies()
  const rentals = group.rentals
  const first = rentals[0]
  const monthlyTotal = rentals.reduce((n, r) => n + Number(r.monthlyPrice || 0), 0)
  const rentTotal = rentals.reduce((n, r) => n + Number(r.rentalAmount || Number(r.monthlyPrice || 0) * Number(r.months || 0)), 0)
  const depositTotal = rentals.reduce((n, r) => n + Number(r.depositAmount || 0), 0)
  const units = contractUnits(rentals)
  const depositMonths = first.depositMonths || 2
  const versionText = POLICY_KEYS
    .filter(key => policies.meta?.[key]?.version)
    .map(key => `${POLICY_TITLES[key]} v${policies.meta[key].version}`)
    .join(', ')
  const terms = showTerms ? buildContractTerms(policies.values) : []
  const renewedFrom = group.renewedFrom || first.renewedFrom || null
  const parentText = renewedFrom
    ? `hợp đồng số ${renewedFrom.contractNumber}${renewedFrom.startDate ? ` (${fmtIso(renewedFrom.startDate)} → ${fmtIso(renewedFrom.endDate)})` : ''}`
    : ''

  return (
    <article className={`csf-doc${draft ? ' draft' : ''}`} id={id}>
      {draft && <div className="csf-draft-mark">BẢN XEM TRƯỚC · CHƯA CÓ HIỆU LỰC</div>}
      <h3>{renewedFrom ? 'PHỤ LỤC GIA HẠN HỢP ĐỒNG THUÊ KHO LƯU TRỮ' : 'HỢP ĐỒNG THUÊ KHO LƯU TRỮ'}</h3>
      <p className="csf-doc-meta">Số: {group.code}{renewedFrom ? ` · Gia hạn ${parentText}` : ''}{first.reservationCode ? ` · Đơn ${first.reservationCode}` : ''} · Áp dụng chính sách hiện hành ngày {fmtDay(new Date().toISOString())}{versionText ? ` (${versionText})` : ' (mặc định hệ thống)'}</p>
      <section>
        <h4>Điều 1. Các bên</h4>
        <p><strong>Bên cho thuê:</strong> StoreSpace, cơ sở {first.facility}{facilityAddress ? `, địa chỉ ${facilityAddress}` : ''}.</p>
        <p><strong>Bên thuê:</strong> {customer?.name} · Email: {customer?.email}{customer?.phone ? ` · SĐT: ${customer.phone}` : ''}</p>
      </section>
      <section>
        <h4>Điều 2. Đối tượng và thời hạn thuê</h4>
        {renewedFrom ? (
          <p>Hai bên đồng ý <strong>gia hạn {parentText}</strong> thêm {first.months} tháng, từ ngày <strong>{first.startDate}</strong> đến hết ngày <strong>{first.endDate}</strong>, cho {units.length} kho liệt kê tại Phụ lục 01. Bên thuê tiếp tục sử dụng các kho này, không cần bàn giao lại.</p>
        ) : (
        <p>Bên thuê thuê {units.length} kho lưu trữ liệt kê tại Phụ lục 01, thời hạn {first.months} tháng, từ ngày <strong>{first.startDate}</strong> đến hết ngày <strong>{first.endDate}</strong>. Một tháng thuê tính từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng tiếp theo.</p>
        )}
      </section>
      <section>
        <h4>Điều 3. Giá thuê, tiền cọc và thanh toán</h4>
        <p>Tổng tiền thuê mỗi tháng: <strong>{money(monthlyTotal)}</strong>. Tổng tiền thuê cả kỳ: <strong>{money(rentTotal)}</strong>.</p>
        {renewedFrom && <p>Tiền thuê tháng đầu của kỳ gia hạn <strong>đã thanh toán khi gia hạn</strong>; các tháng tiếp theo thanh toán trước ngày bắt đầu của mỗi tháng.</p>}
        <p>Tiền cọc: <strong>{money(depositTotal)}</strong> ({depositMonths} tháng tiền thuê mỗi kho), <strong>{renewedFrom ? `được chuyển từ ${parentText} (bổ sung phần chênh lệch nếu giá thuê thay đổi)` : 'đã thanh toán khi đặt chỗ'}</strong>. Tiền cọc dùng để bảo đảm nghĩa vụ, không mặc nhiên là tiền thuê tháng cuối, và được hoàn trong {policies.values.renewal_return?.depositRefundWorkingDays ?? 7} ngày làm việc sau khi trả kho nếu không phát sinh khấu trừ.</p>
        <p>Giá thuê đã xác nhận không thay đổi trong suốt thời hạn hợp đồng.</p>
      </section>
      <section>
        <h4>Điều 4. Quyền và nghĩa vụ, mã ra vào & chìa khóa</h4>
        <p>Bên thuê sử dụng kho đúng mục đích, không lưu trữ hàng cấm, hàng dễ cháy nổ, chất nguy hiểm.</p>
        <p><strong>Mã ra vào cơ sở:</strong> Khách hàng được cấp 01 mã Access Code 6 số duy nhất để ra vào cổng và cửa an ninh cơ sở. Mã có hiệu lực trong suốt thời gian thuê, tự động tạm khóa nếu chậm thanh toán quá 30 ngày.</p>
        <p><strong>Chìa khóa ô kho:</strong> Mỗi ô kho được cấp chìa khóa vật lý riêng, nhân viên bàn giao tại quầy lễ tân khi nhận kho. Bên thuê có trách nhiệm tự bảo quản chìa khóa; trường hợp làm mất chìa sẽ chịu phí làm lại/thay ổ khóa theo quy định.</p>
        <p>Bên thuê có trách nhiệm báo trả kho trước ít nhất {policies.values.renewal_return?.returnNoticeDays ?? 7} ngày, hoàn trả chìa khóa vật lý và dọn trống kho khi kết thúc hợp đồng.</p>
      </section>
      <section>
        <h4>Điều 5. Hiệu lực</h4>
        {renewedFrom ? (
          <p>Phụ lục có hiệu lực khi Bên thuê ký điện tử trên hệ thống StoreSpace và là một phần không tách rời của {parentText}. Các điều khoản khác của hợp đồng gốc không được sửa đổi trong phụ lục này giữ nguyên hiệu lực.</p>
        ) : (
        <p>Hợp đồng có hiệu lực khi Bên thuê ký điện tử trên hệ thống StoreSpace và kho được bàn giao. Khi nhận kho, Bên thuê xuất trình CCCD để nhân viên đối chiếu.</p>
        )}
      </section>
      {terms.length > 0 && (
        <section>
          <h4>Điều 6. Các điều khoản chi tiết</h4>
          {terms.map(term => (
            <div key={term.key} className="csf-doc-term">
              <strong>{term.title}</strong>
              <ul>{term.settings.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ul>
            </div>
          ))}
        </section>
      )}
      <section>
        <h4>Phụ lục 01. Danh sách kho thuê</h4>
        <div className="csf-table-wrap">
          <table className="csf-table">
            <thead><tr><th>#</th><th>Kho</th><th>Loại · Kích thước</th><th>Giá / tháng</th><th>Tiền cọc</th></tr></thead>
            <tbody>
              {units.map((u, i) => (
                <tr key={`${u.reservationId}-${u.number}`}>
                  <td>{i + 1}</td>
                  <td><strong>{u.number || '—'}</strong></td>
                  <td>{u.type || '—'} · {u.size || '—'}</td>
                  <td>{u.monthlyPrice != null ? money(u.monthlyPrice) : '—'}</td>
                  <td>{u.deposit != null ? money(u.deposit) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan="3">Tổng cộng ({units.length} kho)</td><td>{money(monthlyTotal)}</td><td>{money(depositTotal)}</td></tr></tfoot>
          </table>
        </div>
      </section>
      {(signature || showTerms) && (
        <section className="csf-doc-signs">
          <div>
            <h4>Đại diện bên cho thuê</h4>
            <p>StoreSpace · {first.facility}</p>
          </div>
          <div>
            <h4>Bên thuê</h4>
            {signature
              ? <>
                {signature.image && <img src={signature.image} alt={`Chữ ký của ${signature.signerName || customer?.name}`} />}
                <p><strong>{signature.signerName || customer?.name}</strong><br /><small>Ký điện tử lúc {fmtTime(signature.signedAt)}</small></p>
              </>
              : <p className="csf-unsigned">Chưa ký</p>}
          </div>
        </section>
      )}
    </article>
  )
}
