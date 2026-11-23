/**
 * ======================================================================
 * FILE: src/components/common/PriceInput.jsx  —  Ô NHẬP GIÁ THUÊ THEO THÁNG (VNĐ)
 * CHỨC NĂNG: Ô nhập tiền dùng cho các màn đặt giá: tự thêm dấu chấm phân cách hàng nghìn khi gõ
 *   (1.250.000), chỉ nhận chữ số, rời ô thì tự làm tròn theo bước giá 1.000đ, và hiện dòng gợi ý bên dưới:
 *   cách đọc ("≈ 1,25 triệu/tháng"), lỗi (dưới tối thiểu / trên tối đa) hoặc cảnh báo lệch giá tham chiếu.
 * THÀNH PHẦN CHÍNH:
 *   - PriceInput (default) : component ô nhập giá.
 * DÙNG Ở: src/pages/manager/FacilityManagerAccount.jsx, src/pages/manager/ManagerPriceTable.jsx,
 *   src/pages/business/BusinessPolicyEditor.jsx, src/pages/business/BusinessPriceBands.jsx.
 * PHỤ THUỘC: react, src/services/storageRules (PRICE_RULES, validateMonthlyPrice, formatVnd, parseVnd,
 *   roundPrice, describeVnd), ./PriceInput.css.
 * API: Không gọi API.
 * LUỒNG: Người dùng gõ -> handleChange() lọc chữ số, định dạng, gọi onChange(number) báo trang cha
 *   -> validateMonthlyPrice() tính lỗi/cảnh báo -> rời ô -> handleBlur() làm tròn 1.000đ.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   PriceInput: Component ô nhập giá thuê theo tháng → dùng ở: BusinessPolicyEditor.jsx (OverdueFields, RenewalReturnFields), BusinessPriceBands.jsx (PriceBandForm), FacilityManagerAccount.jsx (UnitFormModal) +1
 *   handleChange: Khi gõ: chỉ giữ chữ số (tối đa 12), định dạng lại có dấu chấm và báo số mới lên component cha → dùng ở: (cấp file)
 *   handleBlur: Khi rời ô: đánh dấu đã chạm (để hiện lỗi) và tự làm tròn giá theo bước 1.000đ nếu cần → dùng ở: (cấp file)
 */
import React, { useEffect, useState } from 'react'
import { PRICE_RULES, describeVnd, formatVnd, parseVnd, roundPrice, validateMonthlyPrice } from '../../services/storageRules'
import './PriceInput.css'

/**
 * Component ô nhập giá thuê theo tháng.
 * @param {object} props value (số hoặc chuỗi số), onChange(number|null) (báo giá mới cho trang cha),
 *   reference (giá tham chiếu để cảnh báo lệch), referenceLabel (tên nguồn tham chiếu), readOnly, id, name,
 *   ariaLabel, placeholder, showErrorsBeforeTouch (hiện lỗi ngay cả khi chưa rời ô).
 * @returns {JSX.Element}
 */
export default function PriceInput({
  value,
  onChange,
  reference = null,
  referenceLabel = 'giá tham chiếu',
  readOnly = false,
  id,
  name,
  ariaLabel,
  placeholder = 'Ví dụ: 500.000',
  showErrorsBeforeTouch = false
}) {
  const [text, setText] = useState(() => (value === '' || value == null ? '' : formatVnd(value))) // chuỗi hiển thị trong ô
  const [touched, setTouched] = useState(false) // đã rời ô ít nhất 1 lần -> mới hiện lỗi

  // Chạy khi prop value đổi: đồng bộ chuỗi hiển thị khi giá trị thay đổi từ bên ngoài
  // (đổi loại/size có biểu giá, khôi phục giá trị ban đầu).
  useEffect(() => {
    const current = parseVnd(text)
    const next = value === '' || value == null ? null : Number(value)
    if (current !== next) setText(next == null ? '' : formatVnd(next))
  }, [value])

  const result = validateMonthlyPrice(parseVnd(text), reference)
  const showError = (touched || showErrorsBeforeTouch) && !result.ok && text !== ''

  // Khi gõ: chỉ giữ chữ số (tối đa 12), định dạng lại có dấu chấm và báo số mới lên component cha.
  const handleChange = event => {
    const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 12)
    const number = digits ? Number(digits) : null
    setText(number == null ? '' : formatVnd(number))
    onChange?.(number)
  }

  // Khi rời ô: đánh dấu đã chạm (để hiện lỗi) và tự làm tròn giá theo bước 1.000đ nếu cần.
  const handleBlur = () => {
    setTouched(true)
    const number = parseVnd(text)
    if (number && number % PRICE_RULES.step !== 0 && number >= PRICE_RULES.min) {
      const rounded = roundPrice(number)
      setText(formatVnd(rounded))
      onChange?.(rounded)
    }
  }

  // Ô nhập giá + dòng gợi ý / báo lỗi
  return (
    <div className={`price-input${showError ? ' has-error' : ''}${result.warning && !showError ? ' has-warning' : ''}${readOnly ? ' is-readonly' : ''}`}>
      {/* Ô nhập số tiền có đuôi "đ/tháng" */}
      <div className="price-input-field">
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          readOnly={readOnly}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={showError || undefined}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <span className="price-input-unit">đ/tháng</span>
      </div>
      {/* Dòng gợi ý cách đọc / lỗi / cảnh báo giá */}
      <div className="price-input-hint" aria-live="polite">
        {showError
          ? <span className="price-input-error">{result.error}</span>
          : result.warning
            ? <span className="price-input-warning">⚠ {result.warning.replace('giá tham chiếu', referenceLabel)}</span>
            : result.value
              ? <span>≈ {describeVnd(result.value)}/tháng{reference ? ` · ${referenceLabel}: ${formatVnd(reference)}đ` : ''}</span>
              : <span>Từ {formatVnd(PRICE_RULES.min)}đ đến {formatVnd(PRICE_RULES.max)}đ, làm tròn theo {formatVnd(PRICE_RULES.step)}đ.</span>}
      </div>
    </div>
  )
}
