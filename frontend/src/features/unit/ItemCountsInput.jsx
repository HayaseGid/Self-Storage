/**
 * ======================================================================
 * FILE: src/features/unit/ItemCountsInput.jsx  —  KHỐI NHẬP "ĐỒ CỦA BẠN" DÙNG CHUNG
 * Thùng nhỏ / vừa / lớn, thùng tự nhập kích thước (dài × rộng × cao cm) và đồ lớn (nệm, tủ lạnh, kệ, xe máy).
 * Dùng ở: UnitPackPlanner (cửa sổ xem kho 3D) và trang Tìm kho (bộ lọc), để 2 nơi nhập giống nhau.
 * Không gọi API. Giá trị là object counts (xem features/unit/boxCounts.js).
 * ======================================================================
 */
import React from 'react'
import { BIG_ITEM_KEYS, BOX_KEYS, CUSTOM_BOX_KEY, itemType } from '../../utils/packing'
import { normalizeBoxCounts } from './boxCounts'

/* Đổi giá trị ô nhập thành số nguyên không âm. */
const toInt = value => Math.max(0, Math.floor(Number(value) || 0))

/**
 * @param {object} props counts, onChange(nextCounts).
 */
export default function ItemCountsInput({ counts, onChange }) {
  const value = normalizeBoxCounts(counts)
  const set = (key, v) => onChange({ ...value, [key]: toInt(v) })
  const setSize = (dim, v) => onChange({ ...value, customSize: { ...value.customSize, [dim]: v } })
  // Mục mở rộng tự mở sẵn khi đã có thùng tự nhập hoặc đồ lớn.
  const hasExtra = value[CUSTOM_BOX_KEY] > 0 || BIG_ITEM_KEYS.some(key => value[key] > 0)
  const field = (key, label, sub) => (
    <label key={key}>
      <span>{label} {sub && <small>{sub}</small>}</span>
      <input type="number" min="0" step="1" inputMode="numeric" value={value[key]} onChange={e => set(key, e.target.value)} />
    </label>
  )

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
