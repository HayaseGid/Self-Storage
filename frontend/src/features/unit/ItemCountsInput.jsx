/**
 * ======================================================================
 * FILE: src/features/unit/ItemCountsInput.jsx  —  KHỐI NHẬP "ĐỒ CỦA BẠN"
 * CHỨC NĂNG: Form nhỏ cho khách nhập số lượng đồ cần gửi: thùng nhỏ / vừa / lớn, thùng tự nhập kích thước
 *   (dài × rộng × cao cm) và đồ lớn (nệm, tủ lạnh, kệ, xe máy). Dùng chung ở cửa sổ xem kho 3D và bộ lọc trang
 *   Tìm kho để 2 nơi nhập giống hệt nhau. Component "có kiểm soát": giá trị do cha giữ, mỗi lần gõ gọi onChange.
 * THÀNH PHẦN CHÍNH: ItemCountsInput (default export).
 * DÙNG Ở: src/App.jsx (bộ lọc trang Tìm kho), features/unit/UnitPackPlanner.jsx.
 * PHỤ THUỘC: utils/packing.js (BOX_KEYS, BIG_ITEM_KEYS, CUSTOM_BOX_KEY, itemType), ./boxCounts (normalizeBoxCounts).
 * API: Không gọi API.
 * LUỒNG: khách gõ số -> set / setSize -> onChange(counts mới) -> component cha cập nhật state (và lưu sessionStorage)
 *   -> useBoxFit / UnitPackPlanner tính lại kho vừa / cách xếp.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   toInt: Đổi giá trị ô nhập thành số nguyên không âm → dùng ở: set
 *   ItemCountsInput: Hiển thị các ô nhập số lượng đồ: hàng thùng thường luôn hiện; thùng tự nhập + đồ lớn nằm trong mục mở rộng (<details>) → dùng ở: App.jsx (SearchPage), UnitPackPlanner.jsx (controls)
 *   set: Khách sửa ô số lượng của loại `key` -> gửi counts mới lên cha → dùng ở: field
 *   setSize: Khách sửa kích thước thùng tự nhập (w/d/h, cm); giữ nguyên chuỗi gõ, chuẩn hóa ở normalizeBoxCounts → dùng ở: ItemCountsInput
 *   field: Vẽ 1 ô nhập số lượng: nhãn (tên + kích thước nhỏ) và input số → dùng ở: ItemCountsInput
 */
import React from 'react'
import { BIG_ITEM_KEYS, BOX_KEYS, CUSTOM_BOX_KEY, itemType } from '../../utils/packing'
import { normalizeBoxCounts } from './boxCounts'

/* Đổi giá trị ô nhập thành số nguyên không âm. */
const toInt = value => Math.max(0, Math.floor(Number(value) || 0))

/**
 * Hiển thị các ô nhập số lượng đồ: hàng thùng thường luôn hiện; thùng tự nhập + đồ lớn nằm trong mục mở rộng
 * (<details>), tự mở sẵn nếu đã có số lượng.
 * @param {object} props
 * @param {object} props.counts số đồ hiện tại (xem boxCounts.js).
 * @param {(next:object) => void} props.onChange gọi với counts mới mỗi khi khách sửa một ô.
 */
export default function ItemCountsInput({ counts, onChange }) {
  const value = normalizeBoxCounts(counts)
  // Khách sửa ô số lượng của loại `key` -> gửi counts mới lên cha.
  const set = (key, v) => onChange({ ...value, [key]: toInt(v) })
  // Khách sửa kích thước thùng tự nhập (w/d/h, cm); giữ nguyên chuỗi gõ, chuẩn hóa ở normalizeBoxCounts.
  const setSize = (dim, v) => onChange({ ...value, customSize: { ...value.customSize, [dim]: v } })
  // Mục mở rộng tự mở sẵn khi đã có thùng tự nhập hoặc đồ lớn.
  const hasExtra = value[CUSTOM_BOX_KEY] > 0 || BIG_ITEM_KEYS.some(key => value[key] > 0)
  // Vẽ 1 ô nhập số lượng: nhãn (tên + kích thước nhỏ) và input số.
  const field = (key, label, sub) => (
    <label key={key}>
      <span>{label} {sub && <small>{sub}</small>}</span>
      <input type="number" min="0" step="1" inputMode="numeric" value={value[key]} onChange={e => set(key, e.target.value)} />
    </label>
  )

  // Ô nhập số thùng / đồ lớn
  return (
    <div className="ici">
      <div className="ici-row">
        {BOX_KEYS.map(key => field(key, itemType(key).name, itemType(key).size))}
      </div>
      <details className="ici-more" open={hasExtra || undefined}>
        <summary>Thùng tự nhập kích thước, đồ lớn</summary>
        <div className="ici-custom">
          {field(CUSTOM_BOX_KEY, 'Thùng tự nhập', 'số lượng')}
          <div className="ici-size" role="group" aria-label="Kích thước thùng tự nhập (cm)">
            {[['w', 'Dài'], ['d', 'Rộng'], ['h', 'Cao']].map(([dim, label]) => (
              <label key={dim}>
                <span>{label} <small>cm</small></span>
                <input type="number" min="5" max="300" step="1" inputMode="numeric" value={value.customSize[dim]} onChange={e => setSize(dim, e.target.value)} />
              </label>
            ))}
          </div>
        </div>
        <div className="ici-row ici-big">
          {BIG_ITEM_KEYS.map(key => field(key, itemType(key).name, itemType(key).size))}
        </div>
      </details>
    </div>
  )
}
