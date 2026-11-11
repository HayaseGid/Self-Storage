/**
 * ======================================================================
 * FILE: src/features/payment/DepositConfirm.jsx  —  KHUNG "XÁC NHẬN ĐẶT CỌC" ĐẶT NGAY TRÊN NÚT THANH TOÁN
 * Khách phải tick đủ 2 ô (đã kiểm tra thông tin + đồng ý chính sách cọc) mới được thanh toán
 * -> làm bằng chứng khách đã xác nhận. Nội dung chính sách lấy từ usePolicies() (GET /api/policies, có cache).
 * Dùng ở: App.jsx (đặt 1 kho), CartPage (giỏ hàng), ContractRenewal (gia hạn).
 * ======================================================================
 */
import React, { useState } from 'react'
import { describePolicy, usePolicies } from '../../services/policies'
import { formatVnd } from '../../services/storageRules'
import './DepositConfirm.css'

/*
 * Khung "Xác nhận đặt cọc" đặt ngay trên nút thanh toán (trang đặt 1 kho + giỏ hàng).
 * Khách phải tick đủ 2 ô thì mới thanh toán được -> có bằng chứng khách đã xác nhận cọc.
 *
 * rows:   [[nhãn, giá trị], ...]  tóm tắt kho / thời gian thuê
 * lines:  [[nhãn, số tiền], ...]  các dòng tiền (giá thuê, tiền cọc...)
 * amount: số tiền cần thanh toán ngay
 * onChange(agreed: boolean)
 * infoText / policyText / hint: thay nội dung 2 ô xác nhận (dùng cho gia hạn hợp đồng).
 */
/**
 * Định dạng tiền làm tròn kèm "đ".
 */
const money = value => `${formatVnd(Math.round(Number(value) || 0))}đ`

/**
 * Component khung xác nhận đặt cọc.
 * @param {object} props title, rows ([[nhãn, giá trị]] tóm tắt kho/thời gian), lines ([[nhãn, số tiền]] các dòng tiền),
 *   amount (số tiền cần trả ngay), onChange(agreed:boolean), infoText / policyText / hint (đổi nội dung cho trường hợp gia hạn).
 */
export default function DepositConfirm({ title = 'Xác nhận đặt cọc', rows = [], lines = [], amount, onChange, infoText, policyText, hint }) {
  const policies = usePolicies()
  const [checkedInfo, setCheckedInfo] = useState(false)
  const [checkedPolicy, setCheckedPolicy] = useState(false)
  const agreed = checkedInfo && checkedPolicy
  /**
   * Tick/bỏ tick 1 trong 2 ô xác nhận và báo lên cha khi cả 2 ô cùng được tick.
   * @param {'info'|'policy'} which ô nào.
   * @param {boolean} value trạng thái mới.
   */
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
        <span>{infoText || <>Tôi đã kiểm tra đúng <strong>kho, cơ sở và thời gian thuê</strong> ở trên.</>}</span>
      </label>
      <label className={`dc-check${checkedPolicy ? ' on' : ''}`}>
        <input type="checkbox" checked={checkedPolicy} onChange={event => toggle('policy', event.target.checked)} />
        <span>
          {policyText || <>Tôi đồng ý <strong>chính sách đặt cọc</strong>: {deposit} {reservation}</>}
        </span>
      </label>
      {!agreed && <p className="dc-hint">{hint || 'Tick đủ 2 ô để thanh toán tiền cọc.'}</p>}
    </section>
  )
}
