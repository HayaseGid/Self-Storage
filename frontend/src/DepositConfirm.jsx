import React, { useState } from 'react'
import { describePolicy, usePolicies } from './policies'
import { formatVnd } from './storageRules'
import './DepositConfirm.css'

/*
 * Khung "Xác nhận đặt cọc" đặt ngay trên nút thanh toán (trang đặt 1 kho + giỏ hàng).
 * Khách phải tick đủ 2 ô thì mới thanh toán được -> có bằng chứng khách đã xác nhận cọc.
 *
 * rows:   [[nhãn, giá trị], ...]  tóm tắt kho / thời gian thuê
 * lines:  [[nhãn, số tiền], ...]  các dòng tiền (giá thuê, tiền cọc...)
 * amount: số tiền cần thanh toán ngay
 * onChange(agreed: boolean)
 */
const money = value => `${formatVnd(Math.round(Number(value) || 0))}đ`

export default function DepositConfirm({ title = 'Xác nhận đặt cọc', rows = [], lines = [], amount, onChange }) {
  const policies = usePolicies()
  const [checkedInfo, setCheckedInfo] = useState(false)
  const [checkedPolicy, setCheckedPolicy] = useState(false)
  const agreed = checkedInfo && checkedPolicy
  const toggle = (which, value) => {
    const info = which === 'info' ? value : checkedInfo
    const policy = which === 'policy' ? value : checkedPolicy
    if (which === 'info') setCheckedInfo(value)
    else setCheckedPolicy(value)
    onChange?.(info && policy)
  }

  const deposit = describePolicy('deposit', policies.values?.deposit).summary
  const reservation = describePolicy('reservation', policies.values?.reservation).summary

  return (
    <section className={`dc-box${agreed ? ' ok' : ''}`} aria-labelledby="dc-title">
      <h3 id="dc-title">{title}</h3>

      {rows.length > 0 && (
        <dl className="dc-rows">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}

      <dl className="dc-money">
        {lines.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{typeof value === 'number' ? money(value) : value}</dd></div>
        ))}
        <div className="dc-total"><dt>Cần thanh toán bây giờ</dt><dd>{money(amount)}</dd></div>
      </dl>

      <label className={`dc-check${checkedInfo ? ' on' : ''}`}>
        <input type="checkbox" checked={checkedInfo} onChange={event => toggle('info', event.target.checked)} />
        <span>Tôi đã kiểm tra đúng <strong>kho, cơ sở và thời gian thuê</strong> ở trên.</span>
      </label>
      <label className={`dc-check${checkedPolicy ? ' on' : ''}`}>
        <input type="checkbox" checked={checkedPolicy} onChange={event => toggle('policy', event.target.checked)} />
        <span>
          Tôi đồng ý <strong>chính sách đặt cọc</strong>: {deposit} {reservation}
        </span>
      </label>
      {!agreed && <p className="dc-hint">Tick đủ 2 ô để thanh toán tiền cọc.</p>}
    </section>
  )
}
