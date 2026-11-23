/**
 * ======================================================================
 * FILE: src/features/payment/DepositConfirm.jsx  —  KHUNG "XÁC NHẬN ĐẶT CỌC" TRƯỚC NÚT THANH TOÁN
 * CHỨC NĂNG: Khung tóm tắt đặt ngay trên nút thanh toán: các dòng thông tin (kho, thời gian thuê), các dòng tiền và
 *   tổng "Cần thanh toán bây giờ", cùng 2 ô tick bắt buộc (đã kiểm tra thông tin + đồng ý chính sách cọc). Khách tick
 *   đủ 2 ô thì trang cha mới mở nút thanh toán -> làm bằng chứng khách đã xác nhận. Dùng lại cho gia hạn hợp đồng
 *   bằng cách thay chữ của 2 ô (infoText / policyText / hint).
 * THÀNH PHẦN CHÍNH:
 *   - DepositConfirm (default export): component khung xác nhận.
 *   - money: định dạng tiền.
 * DÙNG Ở: src/App.jsx (đặt 1 kho), src/pages/customer/CartPage.jsx (giỏ hàng),
 *   src/features/contract/ContractRenewal.jsx (bước xác nhận gia hạn trong RenewalModal).
 * PHỤ THUỘC: services/policies (describePolicy, usePolicies), services/storageRules (formatVnd), DepositConfirm.css.
 * API: Không gọi API trực tiếp; nội dung chính sách đặt cọc / giữ chỗ lấy qua usePolicies() -> GET /api/policies (có cache).
 * LUỒNG: trang cha truyền rows / lines / amount -> khách tick 2 ô -> toggle() -> onChange(true/false) -> cha bật/tắt
 *   nút "Thanh toán" -> khách thanh toán (VNPay / mô phỏng) ở trang cha.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   money: Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ" → dùng ở: DepositConfirm
 *   DepositConfirm: Vẽ khung xác nhận đặt cọc: tiêu đề, bảng thông tin, bảng tiền + tổng, 2 ô tick và dòng gợi ý khi chưa tick đủ → dùng ở: App.jsx (BookingPage), ContractRenewal.jsx (RenewalModal), CartPage.jsx (CartPage)
 *   toggle: Chạy khi tick/bỏ tick 1 trong 2 ô: cập nhật state của ô đó rồi gọi onChange(info && policy) với giá trị MỚI → dùng ở: DepositConfirm
 */
import React, { useState } from 'react'
import { describePolicy, usePolicies } from '../../services/policies'
import { formatVnd } from '../../services/storageRules'
import './DepositConfirm.css'

/**
 * Định dạng số tiền (làm tròn) thành chuỗi kiểu Việt Nam kèm "đ".
 * @param {number|string} value số tiền.
 * @returns {string}
 */
const money = value => `${formatVnd(Math.round(Number(value) || 0))}đ`

/**
 * Vẽ khung xác nhận đặt cọc: tiêu đề, bảng thông tin, bảng tiền + tổng, 2 ô tick và dòng gợi ý khi chưa tick đủ.
 * Trạng thái tick được giữ bên trong; muốn reset thì cha đổi `key` của component (như RenewalModal làm).
 * @param {object} props
 * @param {string} [props.title='Xác nhận đặt cọc'] tiêu đề khung.
 * @param {Array<[string, any]>} [props.rows] [[nhãn, giá trị], ...] tóm tắt kho / cơ sở / thời gian thuê.
 * @param {Array<[string, number|string]>} [props.lines] [[nhãn, số tiền hoặc chữ], ...] các dòng tiền (số thì tự định dạng).
 * @param {number} props.amount số tiền cần thanh toán ngay (dòng tổng).
 * @param {Function} [props.onChange] onChange(agreed:boolean) — báo cha mỗi lần tick, true khi đủ cả 2 ô.
 * @param {JSX.Element} [props.infoText] thay chữ ô 1 (mặc định: đã kiểm tra kho, cơ sở, thời gian thuê).
 * @param {JSX.Element} [props.policyText] thay chữ ô 2 (mặc định: đồng ý chính sách đặt cọc + giữ chỗ hiện hành).
 * @param {string} [props.hint] thay dòng gợi ý khi chưa tick đủ.
 * @returns {JSX.Element}
 * Được gọi bởi: App.jsx, CartPage, ContractRenewal (RenewalModal).
 */
export default function DepositConfirm({ title = 'Xác nhận đặt cọc', rows = [], lines = [], amount, onChange, infoText, policyText, hint }) {
  const policies = usePolicies()
  const [checkedInfo, setCheckedInfo] = useState(false)
  const [checkedPolicy, setCheckedPolicy] = useState(false)
  const agreed = checkedInfo && checkedPolicy
  /**
   * Chạy khi tick/bỏ tick 1 trong 2 ô: cập nhật state của ô đó rồi gọi onChange(info && policy) với giá trị MỚI
   * (tự tính lại vì setState chưa áp dụng ngay).
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

  // Câu tóm tắt chính sách đặt cọc và giữ chỗ hiện hành, chèn vào chữ của ô tick thứ 2.
  const deposit = describePolicy('deposit', policies.values?.deposit).summary
  const reservation = describePolicy('reservation', policies.values?.reservation).summary

  // Khung xác nhận đặt cọc
  return (
    <section className={`dc-box${agreed ? ' ok' : ''}`} aria-labelledby="dc-title">
      <h3 id="dc-title">{title}</h3>

      {/* Bảng thông tin kho, thời gian thuê */}
      {rows.length > 0 && (
        <dl className="dc-rows">
          {rows.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}

      {/* Các khoản tiền + tổng cần trả */}
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
      {/* 2 ô tick xác nhận */}
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
