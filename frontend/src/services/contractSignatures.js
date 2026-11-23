/**
 * ======================================================================
 * FILE: src/services/contractSignatures.js  —  TIỆN ÍCH HIỂN THỊ CHỮ KÝ HỢP ĐỒNG
 * CHỨC NĂNG: Định dạng thời điểm khách ký hợp đồng để hiển thị dòng "Đã ký lúc HH:mm dd/MM/yyyy"
 *   trên thẻ hợp đồng, popup hợp đồng và trang tài khoản khách.
 * THÀNH PHẦN CHÍNH:
 *   - formatSignedAt : đổi chuỗi ISO thành "HH:mm dd/MM/yyyy".
 * DÙNG Ở: src/features/contract/ContractCard.jsx, src/features/contract/ContractModal.jsx,
 *   src/pages/customer/CustomerAccount.jsx.
 * PHỤ THUỘC: Không có.
 * API: Không gọi API.
 * LUỒNG: Dữ liệu hợp đồng có signedAt (ISO) -> formatSignedAt(signedAt) -> chuỗi hiển thị.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   formatSignedAt: Định dạng thời điểm ký hợp đồng thành "HH:mm dd/MM/yyyy" theo giờ máy người dùng (rỗng nếu chưa ký) → dùng ở: ContractCard.jsx, ContractModal.jsx, CustomerAccount.jsx
 *   pad: Thêm số 0 phía trước cho đủ 2 chữ số → dùng ở: formatSignedAt
 */
/**
 * Định dạng thời điểm ký hợp đồng thành "HH:mm dd/MM/yyyy" theo giờ máy người dùng (rỗng nếu chưa ký).
 * @param {string} iso thời điểm ký (ISO).
 * @returns {string} chuỗi giờ ngày, hoặc '' nếu iso rỗng.
 */
export function formatSignedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  // Thêm số 0 phía trước cho đủ 2 chữ số.
  const pad = value => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}
