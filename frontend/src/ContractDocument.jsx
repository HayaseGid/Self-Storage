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
 */
const money = value => `${formatVnd(value || 0)}đ`
const fmtTime = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* Danh sách kho trong hợp đồng (gộp các đơn của nhóm). */
export function contractUnits(rentals) {
  return rentals.flatMap(r => (r.units?.length ? r.units : [{ number: r.unitId, type: r.type, size: r.size, monthlyPrice: r.monthlyPrice }])
    .map(u => ({ ...u, reservationCode: r.reservationCode, reservationId: r.reservationId, deposit: u.monthlyPrice != null ? Number(u.monthlyPrice) * Number(r.depositMonths || 2) : null })))
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

  return (
    <article className={`csf-doc${draft ? ' draft' : ''}`} id={id}>
      {draft && <div className="csf-draft-mark">BẢN XEM TRƯỚC · CHƯA CÓ HIỆU LỰC</div>}
      <h3>HỢP ĐỒNG THUÊ KHO LƯU TRỮ</h3>
      <p className="csf-doc-meta">Số: {group.code}{first.reservationCode ? ` · Đơn ${first.reservationCode}` : ''} · Áp dụng chính sách hiện hành ngày {fmtDay(new Date().toISOString())}{versionText ? ` (${versionText})` : ' (mặc định hệ thống)'}</p>
      <section>
        <h4>Điều 1. Các bên</h4>
        <p><strong>Bên cho thuê:</strong> StoreSpace, cơ sở {first.facility}{facilityAddress ? `, địa chỉ ${facilityAddress}` : ''}.</p>
        <p><strong>Bên thuê:</strong> {customer?.name} · Email: {customer?.email}{customer?.phone ? ` · SĐT: ${customer.phone}` : ''}</p>
      </section>
      <section>
        <h4>Điều 2. Đối tượng và thời hạn thuê</h4>
        <p>Bên thuê thuê {units.length} kho lưu trữ liệt kê tại Phụ lục 01, thời hạn {first.months} tháng, từ ngày <strong>{first.startDate}</strong> đến hết ngày <strong>{first.endDate}</strong>. Một tháng thuê tính từ ngày bắt đầu đến ngày liền trước cùng ngày của tháng tiếp theo.</p>
      </section>
      <section>
        <h4>Điều 3. Giá thuê, tiền cọc và thanh toán</h4>
        <p>Tổng tiền thuê mỗi tháng: <strong>{money(monthlyTotal)}</strong>. Tổng tiền thuê cả kỳ: <strong>{money(rentTotal)}</strong>.</p>
        <p>Tiền cọc: <strong>{money(depositTotal)}</strong> ({depositMonths} tháng tiền thuê mỗi kho), <strong>đã thanh toán khi đặt chỗ</strong>. Tiền cọc dùng để bảo đảm nghĩa vụ, không mặc nhiên là tiền thuê tháng cuối, và được hoàn trong {policies.values.renewal_return?.depositRefundWorkingDays ?? 7} ngày làm việc sau khi trả kho nếu không phát sinh khấu trừ.</p>
        <p>Giá thuê đã xác nhận không thay đổi trong suốt thời hạn hợp đồng.</p>
      </section>
      <section>
        <h4>Điều 4. Quyền và nghĩa vụ</h4>
        <p>Bên thuê sử dụng kho đúng mục đích, không lưu trữ hàng cấm, hàng dễ cháy nổ; bảo quản khóa/thẻ ra vào; báo trả kho trước ít nhất {policies.values.renewal_return?.returnNoticeDays ?? 7} ngày. Bên cho thuê bàn giao kho đúng hiện trạng, bảo đảm an ninh khu vực chung và hoàn cọc đúng hạn.</p>
      </section>
      <section>
        <h4>Điều 5. Hiệu lực</h4>
        <p>Hợp đồng có hiệu lực khi Bên thuê ký điện tử trên hệ thống StoreSpace và kho được bàn giao. Khi nhận kho, Bên thuê xuất trình CCCD để nhân viên đối chiếu.</p>
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
