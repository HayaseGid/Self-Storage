/**
 * ======================================================================
 * FILE: src/services/contractSignatures.js  —  TIỆN ÍCH HIỂN THỊ CHỮ KÝ HỢP ĐỒNG
 * Dùng ở: ContractCard, ContractModal, CustomerAccount.
 * ======================================================================
 */
/**
 * Định dạng thời điểm ký hợp đồng thành "HH:mm dd/MM/yyyy" (rỗng nếu chưa ký).
 * @param {string} iso thời điểm ký (ISO).
 */
export function formatSignedAt(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  // Thêm số 0 phía trước cho đủ 2 chữ số.
  const pad = value => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}
