import React, { useEffect, useState } from 'react'
import { PRICE_RULES, describeVnd, formatVnd, parseVnd, roundPrice, validateMonthlyPrice } from './storageRules'
import './PriceInput.css'

/*
 * Ô nhập giá thuê theo tháng (VNĐ):
 * - Hiển thị dấu phân cách hàng nghìn khi gõ (1.250.000).
 * - Chỉ nhận chữ số; rời ô thì tự làm tròn theo 1.000đ.
 * - Hiện cách đọc ("1,25 triệu/tháng"), lỗi (dưới tối thiểu, trên tối đa) và cảnh báo lệch giá tham chiếu.
 *
 * value: số (hoặc chuỗi số) | onChange(number|null) | reference: giá tham chiếu | referenceLabel: nguồn tham chiếu
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
  const [text, setText] = useState(() => (value === '' || value == null ? '' : formatVnd(value)))
  const [touched, setTouched] = useState(false)

  // Đồng bộ khi giá trị thay đổi từ bên ngoài (đổi loại/size có biểu giá, khôi phục giá trị ban đầu).
  useEffect(() => {
    const current = parseVnd(text)
    const next = value === '' || value == null ? null : Number(value)
    if (current !== next) setText(next == null ? '' : formatVnd(next))
  }, [value])

  const result = validateMonthlyPrice(parseVnd(text), reference)
  const showError = (touched || showErrorsBeforeTouch) && !result.ok && text !== ''

  const handleChange = event => {
    const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 12)
    const number = digits ? Number(digits) : null
    setText(number == null ? '' : formatVnd(number))
    onChange?.(number)
  }

  const handleBlur = () => {
    setTouched(true)
    const number = parseVnd(text)
    if (number && number % PRICE_RULES.step !== 0 && number >= PRICE_RULES.min) {
      const rounded = roundPrice(number)
      setText(formatVnd(rounded))
      onChange?.(rounded)
    }
  }

  return (
    <div className={`price-input${showError ? ' has-error' : ''}${result.warning && !showError ? ' has-warning' : ''}${readOnly ? ' is-readonly' : ''}`}>
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
