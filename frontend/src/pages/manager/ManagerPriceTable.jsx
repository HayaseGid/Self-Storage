/**
 * ======================================================================
 * FILE: src/pages/manager/ManagerPriceTable.jsx  —  BẢNG GIÁ CỦA CƠ SỞ (FACILITY MANAGER)
 * CHỨC NĂNG: Mục "Bảng giá" trên trang Quản lý cơ sở. Manager đặt giá thuê / tháng cho từng cặp loại kho + size
 *   (S1, S2, M1...) tại cơ sở mình. Giá phải nằm trong khung giá của nhóm (S/M/L...) do Business Operations đặt
 *   (kiểm tra bằng services/priceBands.js). Lưu giá -> áp dụng cho mọi kho cùng loại + size của cơ sở và kho tạo sau;
 *   đơn đã đặt giữ giá cũ.
 * THÀNH PHẦN CHÍNH:
 *   - money(value): định dạng số tiền kèm "đ".
 *   - ManagerPriceTable (export default): bảng giá + ô nhập giá mới cho từng dòng + khối "Thêm giá" cho cặp loại/size mới.
 * DÙNG Ở: src/pages/manager/FacilityManagerAccount.jsx (khi activeTab = 'prices').
 * PHỤ THUỘC: api/api.js (apiPut), components/common/PriceInput (ô nhập tiền), services/storageRules (formatVnd),
 *   services/priceBands (checkPriceInBand, findBand, formatArea, formatBandPrice, getArea),
 *   pages/business/BusinessPriceBands.css (dùng chung giao diện với trang khung giá của Business).
 * API: PUT /api/operations/facilities/{facilityId}/rates  body { unitTypeID, unitSizeID, basePrice }.
 * LUỒNG: FacilityManagerAccount tải sẵn units, rentalRates, unitTypes, unitSizes, priceBands rồi truyền vào ->
 *   bảng gộp thành các dòng "loại|size" -> Manager nhập giá -> bấm "Lưu giá" -> save() kiểm tra khung + hỏi xác nhận
 *   -> PUT .../rates -> gọi onChanged() để trang tải lại dữ liệu -> bảng hiện giá mới.
 * ======================================================================
 */
import React, { useMemo, useState } from 'react'
import { apiPut } from '../../api/api'
import PriceInput from '../../components/common/PriceInput'
import { formatVnd } from '../../services/storageRules'
import { checkPriceInBand, findBand, formatArea, formatBandPrice, getArea } from '../../services/priceBands'
import '../business/BusinessPriceBands.css'

/**
 * Định dạng số tiền thành chuỗi VNĐ có dấu chấm ngăn cách, thêm "đ" ở cuối (null/0 -> "0đ").
 * @param {number|string} value số tiền.
 * @returns {string} vd "1.200.000đ".
 */
const money = value => `${formatVnd(value || 0)}đ`

/**
 * Bảng giá của cơ sở: liệt kê từng cặp loại + size (lấy từ mức giá đã lưu và từ kho thực tế), khung giá nhóm,
 * giá đang áp dụng, ô nhập giá mới cho từng dòng; cuối bảng có khối thêm giá cho cặp loại + size chưa có kho.
 * Gọi API PUT /api/operations/facilities/{facilityId}/rates khi lưu.
 * @param {object} props
 * @param {object} props.facility cơ sở của Manager ({ facilityId, name }); null -> hiện thông báo chưa phân công.
 * @param {Array} props.units các kho của cơ sở (unitTypeId, sizeId/unitSizeId, pricePerMonth).
 * @param {Array} props.rentalRates mức giá đã lưu (facilityId, unitTypeId, unitSizeId, price).
 * @param {Array} props.unitTypes danh sách loại kho ({ unitTypeId, name }).
 * @param {Array} props.unitSizes danh sách size ({ unitSizeId, dimensions, volume }).
 * @param {Array} props.priceBands khung giá nhóm do Business đặt ({ code, name, minArea, maxArea, minPrice, maxPrice }).
 * @param {object} props.dialog hộp thoại dùng chung của trang (dialog.alert / dialog.confirm trả Promise).
 * @param {Function} [props.onChanged] gọi sau khi lưu giá thành công để trang cha tải lại dữ liệu.
 * Được dùng bởi: FacilityManagerAccount.jsx (mục "Bảng giá").
 */
export default function ManagerPriceTable({ facility, units, rentalRates, unitTypes, unitSizes, priceBands, dialog, onChanged }) {
  const [drafts, setDrafts] = useState({}) // giá đang nhập (chưa lưu) theo khóa dòng "loại|size"
  const [savingKey, setSavingKey] = useState('') // khóa dòng đang gửi lên server (để hiện "Đang lưu...")
  const [newTypeId, setNewTypeId] = useState('') // khối "Thêm giá": loại kho đã chọn
  const [newSizeId, setNewSizeId] = useState('') // khối "Thêm giá": size đã chọn
  const [newPrice, setNewPrice] = useState('') // khối "Thêm giá": giá đã nhập

  const facilityId = facility?.facilityId
  /**
   * Dựng các dòng bảng giá: gộp mức giá đã lưu và các kho đang có theo khóa "loại|size", kèm tên loại, kích thước,
   * diện tích, khung giá nhóm, giá thấp/cao nhất của các kho; sắp theo diện tích rồi tên loại.
   */
  const rows = useMemo(() => {
    const map = new Map()
    // Tạo khóa "unitTypeId|unitSizeId" cho 1 cặp loại + size.
    const keyOf = (typeId, sizeId) => `${typeId}|${sizeId}`
    for (const rate of rentalRates.filter(r => Number(r.facilityId) === Number(facilityId))) {
      map.set(keyOf(rate.unitTypeId, rate.unitSizeId), { typeId: Number(rate.unitTypeId), sizeId: Number(rate.unitSizeId), rate: Number(rate.price), units: [] })
    }
    for (const unit of units) {
      const typeId = Number(unit.unitTypeId)
      const sizeId = Number(unit.sizeId ?? unit.unitSizeId)
      if (!typeId || !sizeId) continue
      const key = keyOf(typeId, sizeId)
      if (!map.has(key)) map.set(key, { typeId, sizeId, rate: null, units: [] })
      map.get(key).units.push(unit)
    }
    return [...map.entries()].map(([key, row]) => {
      const size = unitSizes.find(s => Number(s.unitSizeId) === row.sizeId)
      const type = unitTypes.find(t => Number(t.unitTypeId) === row.typeId)
      const prices = row.units.map(u => Number(u.pricePerMonth)).filter(Boolean)
      return {
        key,
        ...row,
        typeName: type?.name || `Loại #${row.typeId}`,
        dimensions: size?.dimensions || `Size #${row.sizeId}`,
        area: getArea(size?.dimensions, size?.volume),
        band: findBand(priceBands, size?.dimensions),
        minUnitPrice: prices.length ? Math.min(...prices) : null,
        maxUnitPrice: prices.length ? Math.max(...prices) : null
      }
    }).sort((a, b) => (a.area ?? 0) - (b.area ?? 0) || a.typeName.localeCompare(b.typeName))
  }, [rentalRates, units, unitSizes, unitTypes, priceBands, facilityId])

  // Giá đang áp dụng của 1 dòng: mức giá đã lưu, hoặc giá chung nếu mọi kho cùng giá.
  const currentPrice = row => row.rate ?? (row.minUnitPrice === row.maxUnitPrice ? row.minUnitPrice : null)
  // Kiểm tra giá hiện tại của dòng có nằm ngoài khung giá nhóm không (để cảnh báo cần cập nhật).
  const outOfBand = row => {
    if (!row.band) return false
    const prices = [row.rate, row.minUnitPrice, row.maxUnitPrice].filter(v => v != null)
    return prices.some(p => p < Number(row.band.minPrice) || p > Number(row.band.maxPrice))
  }

  /**
   * Lưu giá mới cho 1 dòng: kiểm tra trong khung giá, hỏi xác nhận rồi gửi lên backend, xóa giá nháp và tải lại dữ liệu.
   * Được gọi khi bấm nút "Lưu giá" ở 1 dòng, hoặc từ addRow() khi bấm "Thêm giá".
   * API: PUT /api/operations/facilities/{facilityId}/rates  body { unitTypeID, unitSizeID, basePrice }
   * @param {object} row dòng bảng giá.
   * @param {number} [explicitPrice] giá truyền thẳng (khi thêm dòng mới), mặc định lấy giá đang nhập.
   * @returns {Promise<boolean>} true nếu lưu thành công.
   */
  const save = async (row, explicitPrice) => {
    const price = explicitPrice ?? drafts[row.key]
    if (!price) return false
    const check = checkPriceInBand(priceBands, row.dimensions, price)
    if (!check.ok) {
      await dialog.alert({ tone: 'warning', title: 'Giá nằm ngoài khung', message: check.error })
      return false
    }
    const ok = await dialog.confirm({
      tone: 'warning',
      title: `Đặt giá ${row.typeName} · ${row.dimensions}?`,
      message: `Giá mới: ${money(price)}/tháng${currentPrice(row) ? ` (hiện tại ${money(currentPrice(row))})` : ''}.\nÁp dụng cho ${row.units.length} kho cùng loại + size tại ${facility.name} và các kho tạo sau này. Đơn đã đặt giữ nguyên giá cũ.`,
      confirmLabel: 'Lưu giá'
    })
    if (!ok) return false
    setSavingKey(row.key)
    try {
      await apiPut(`/api/operations/facilities/${facilityId}/rates`, { unitTypeID: row.typeId, unitSizeID: row.sizeId, basePrice: Number(price) })
      setDrafts(current => { const next = { ...current }; delete next[row.key]; return next })
      await onChanged?.()
      return true
    } catch (saveError) {
      await dialog.alert({ tone: 'warning', title: 'Không lưu được giá', message: saveError.message })
      return false
    } finally {
      setSavingKey('')
    }
  }

  // Thông tin cho khối "Thêm giá": size đã chọn, khung giá nhóm của size đó, và giá đã nhập có hợp lệ không.
  const newSize = unitSizes.find(s => String(s.unitSizeId) === newSizeId)
  const newBand = findBand(priceBands, newSize?.dimensions)
  const newCheck = newPrice ? checkPriceInBand(priceBands, newSize?.dimensions, newPrice) : { ok: true }

  // Bấm nút "Thêm giá": thêm giá cho 1 cặp loại + size chưa có trong bảng (báo nếu đã có), dùng lại hàm save
  // (PUT .../rates); lưu xong thì xóa trắng 3 ô chọn/nhập.
  const addRow = async () => {
    if (!newTypeId || !newSizeId || !newPrice) return
    const key = `${newTypeId}|${newSizeId}`
    if (rows.some(row => row.key === key)) {
      await dialog.alert({ tone: 'info', title: 'Đã có trong bảng giá', message: 'Loại + size này đã có dòng trong bảng, hãy sửa giá ở dòng đó.' })
      return
    }
    const saved = await save({
      key,
      typeId: Number(newTypeId),
      sizeId: Number(newSizeId),
      rate: null,
      units: [],
      typeName: unitTypes.find(t => String(t.unitTypeId) === newTypeId)?.name || '',
      dimensions: newSize?.dimensions || '',
      band: newBand
    }, newPrice)
    if (saved) { setNewTypeId(''); setNewSizeId(''); setNewPrice('') }
  }

  if (!facility) return <div className="fm-card"><p>Chưa có cơ sở được phân công.</p></div>

  return (
    <div className="fm-card mpt-root">
      <div>
        <h3 style={{ margin: '0 0 6px' }}>Bảng giá cơ sở {facility.name}</h3>
        <p className="fm-muted" style={{ margin: 0 }}>
          Bạn đặt giá cụ thể cho từng loại + size. Giá phải nằm trong <strong>khung giá của nhóm</strong> do Business Operations đặt.
          Lưu giá sẽ áp dụng cho mọi kho cùng loại + size tại cơ sở.
        </p>
      </div>

      <div className="mpt-bands" aria-label="Khung giá do Business Operations đặt">
        {priceBands.length
          ? priceBands.map(band => (
            <span key={band.code}><b>{band.code}</b> · {band.name} · {formatArea(band.minArea)}–{formatArea(band.maxArea)} · {formatBandPrice(band)}</span>
          ))
          : <span>Chưa có khung giá. Giá chỉ bị giới hạn bởi quy tắc chung.</span>}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table mpt-table">
          <thead>
            <tr><th>Loại kho</th><th>Size</th><th>Khung nhóm</th><th>Số kho</th><th>Giá hiện tại</th><th>Giá mới</th><th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="fm-muted">Cơ sở chưa có kho nào.</td></tr>}
            {rows.map(row => {
              const draft = drafts[row.key]
              const check = draft ? checkPriceInBand(priceBands, row.dimensions, draft) : { ok: true }
              return (
                <tr key={row.key}>
                  <td><strong>{row.typeName}</strong></td>
                  <td>{row.dimensions}<span className="mpt-range">{formatArea(row.area)}</span></td>
                  <td>
                    {row.band
                      ? <><span className="mpt-band-tag">{row.band.code}</span><span className="mpt-range">{formatBandPrice(row.band)}</span></>
                      : <span className="fm-muted">Chưa có khung</span>}
                  </td>
                  <td>{row.units.length}</td>
                  <td>
                    {row.rate != null
                      ? <strong>{money(row.rate)}</strong>
                      : row.minUnitPrice != null
                        ? <span>{row.minUnitPrice === row.maxUnitPrice ? money(row.minUnitPrice) : `${money(row.minUnitPrice)} – ${money(row.maxUnitPrice)}`}<span className="mpt-range">chưa có biểu giá</span></span>
                        : '—'}
                    {outOfBand(row) && <span className="mpt-bad">⚠ Ngoài khung, cần cập nhật</span>}
                  </td>
                  <td>
                    <PriceInput
                      value={draft ?? ''}
                      onChange={n => setDrafts(current => ({ ...current, [row.key]: n ?? '' }))}
                      ariaLabel={`Giá mới ${row.typeName} ${row.dimensions}`}
                      placeholder={row.band ? formatVnd(row.band.minPrice) : 'Giá mới'}
                    />
                    {draft && !check.ok && <span className="mpt-bad">Ngoài khung {row.band.code}: {formatBandPrice(row.band)}</span>}
                  </td>
                  <td>
                    <button type="button" className="dashboard-primary-btn sm" disabled={!draft || !check.ok || savingKey === row.key} onClick={() => save(row)}>
                      {savingKey === row.key ? 'Đang lưu...' : 'Lưu giá'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mpt-add">
        <strong style={{ width: '100%', color: '#073d70' }}>Thêm giá cho loại + size chưa có kho</strong>
        <label>Loại kho
          <select value={newTypeId} onChange={e => setNewTypeId(e.target.value)}>
            <option value="">Chọn loại</option>
            {unitTypes.map(t => <option key={t.unitTypeId} value={t.unitTypeId}>{t.name}</option>)}
          </select>
        </label>
        <label>Size
          <select value={newSizeId} onChange={e => setNewSizeId(e.target.value)}>
            <option value="">Chọn size</option>
            {unitSizes.map(s => {
              const band = findBand(priceBands, s.dimensions)
              return <option key={s.unitSizeId} value={s.unitSizeId}>{s.dimensions}{band ? ` · khung ${band.code}` : ''}</option>
            })}
          </select>
        </label>
        <label>Giá / tháng
          <PriceInput value={newPrice} onChange={n => setNewPrice(n ?? '')} ariaLabel="Giá cho loại và size mới" placeholder={newBand ? formatVnd(newBand.minPrice) : 'Giá'} />
          {newBand && <span className={newCheck.ok ? 'mpt-range' : 'mpt-bad'}>Khung {newBand.code}: {formatBandPrice(newBand)}</span>}
        </label>
        <button type="button" className="dashboard-secondary-btn" disabled={!newTypeId || !newSizeId || !newPrice || !newCheck.ok} onClick={addRow}>Thêm giá</button>
      </div>
    </div>
  )
}
