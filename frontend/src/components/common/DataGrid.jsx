/**
 * ======================================================================
 * FILE: src/components/common/DataGrid.jsx  —  BẢNG DỮ LIỆU DÙNG CHUNG (XỬ LÝ Ở FRONTEND)
 * CHỨC NĂNG: Bảng hiển thị một mảng dữ liệu có sẵn với ô tìm kiếm, các ô lọc, bấm tiêu đề cột để sắp xếp
 *   và phân trang — tất cả làm ở frontend. Khi chưa chọn cột sắp xếp và có getCreatedAt thì xếp MỚI NHẤT
 *   LÊN ĐẦU và tô sáng bản ghi mới. Cấu hình:
 *     columns: [{ key, label, render?(row), sortValue?(row), align?: 'left'|'right'|'center', sortable?, minWidth? }]
 *     filters: [{ key, label, options: [{ value, label }], match(row, value) }]
 * THÀNH PHẦN CHÍNH:
 *   - DataGrid (default) : component bảng.
 * DÙNG Ở: src/pages/customer/CustomerAccount.jsx.
 * PHỤ THUỘC: react, ./listKit (DEFAULT_PAGE_SIZE, Pager, newestFirst, rowClass), ./DataGrid.css.
 * API: Không gọi API (dữ liệu truyền vào qua props rows).
 * LUỒNG: Trang truyền rows + columns -> người dùng gõ tìm kiếm / chọn lọc -> filtered -> bấm cột -> sorted
 *   -> cắt trang pageRows -> hiển thị; bấm dòng -> onRowClick(row) của trang.
 * ======================================================================
 */

/**
 * GHI CHÚ CÁC HÀM (tên: chức năng)
 *   DataGrid: Component bảng dữ liệu có tìm kiếm / lọc / sắp xếp / phân trang ở frontend → dùng ở: BusinessCatalog.jsx (BusinessCatalog), CustomerAccount.jsx (MyStoragePage)
 *   toggleSort: Bấm tiêu đề cột: lần lượt tăng dần -> giảm dần -> bỏ sắp xếp → dùng ở: (cấp file)
 *   resetAll: Xóa ô tìm kiếm, đưa mọi bộ lọc về "Tất cả" và về trang 1 → dùng ở: (cấp file)
 */
import React, { useMemo, useState } from 'react'
import './DataGrid.css'
import { DEFAULT_PAGE_SIZE, Pager, newestFirst, rowClass } from './listKit'

/**
 * Component bảng dữ liệu có tìm kiếm / lọc / sắp xếp / phân trang ở frontend.
 * @param {object} props columns, rows, getRowId (lấy khóa dòng), searchText(row) (chuỗi để tìm kiếm; không truyền thì ẩn ô tìm),
 *   searchPlaceholder, filters, pageSize, initialSort ({key, dir}), onRowClick, emptyText, toolbarExtra (nút thêm ở thanh công cụ),
 *   caption, getCreatedAt(row) (ngày tạo để xếp mới nhất lên đầu + tô sáng bản ghi mới).
 * @returns {JSX.Element}
 */
export default function DataGrid({
  columns,
  rows,
  getRowId,
  searchText,
  searchPlaceholder = 'Tìm kiếm...',
  filters = [],
  pageSize = DEFAULT_PAGE_SIZE,
  initialSort,
  onRowClick,
  emptyText = 'Không có dữ liệu.',
  toolbarExtra = null,
  caption,
  getCreatedAt = null
}) {
  const [query, setQuery] = useState('') // nội dung ô tìm kiếm
  const [filterValues, setFilterValues] = useState(() => Object.fromEntries(filters.map(f => [f.key, 'all']))) // giá trị từng ô lọc
  const [sort, setSort] = useState(initialSort || null) // { key, dir: 'asc' | 'desc' }
  const [page, setPage] = useState(1)
  const size = pageSize

  // Lọc dòng theo ô tìm kiếm và các bộ lọc đang chọn.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false
      return filters.every(f => filterValues[f.key] === 'all' || f.match(row, filterValues[f.key]))
    })
  }, [rows, query, filterValues, filters, searchText])

  /**
   * Sắp xếp dòng theo cột đang chọn (số so sánh số, chuỗi so sánh tiếng Việt có số tự nhiên);
   * chưa chọn cột thì xếp mới nhất lên đầu (nếu có getCreatedAt).
   */
  const sorted = useMemo(() => {
    if (!sort) return getCreatedAt ? newestFirst(filtered, { date: getCreatedAt, id: getRowId }) : filtered
    const column = columns.find(c => c.key === sort.key)
    if (!column) return filtered
    const valueOf = column.sortValue || (row => row[column.key])
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = valueOf(a)
      const vb = valueOf(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor
      return String(va).localeCompare(String(vb), 'vi', { numeric: true }) * factor
    })
  }, [filtered, sort, columns, getCreatedAt, getRowId])

  const pageCount = Math.max(1, Math.ceil(sorted.length / size))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sorted.slice((currentPage - 1) * size, currentPage * size)

  // Bấm tiêu đề cột: lần lượt tăng dần -> giảm dần -> bỏ sắp xếp.
  const toggleSort = column => {
    if (column.sortable === false) return
    setSort(current => {
      if (!current || current.key !== column.key) return { key: column.key, dir: 'asc' }
      if (current.dir === 'asc') return { key: column.key, dir: 'desc' }
      return null
    })
  }

  // Xóa ô tìm kiếm, đưa mọi bộ lọc về "Tất cả" và về trang 1.
  const resetAll = () => {
    setQuery('')
    setFilterValues(Object.fromEntries(filters.map(f => [f.key, 'all'])))
    setPage(1)
  }
  const hasActiveFilter = query.trim() || Object.values(filterValues).some(v => v !== 'all')

  // Bảng dữ liệu: thanh công cụ + bảng + phân trang
  return (
    <div className="dg">
      {/* Ô tìm kiếm, các ô lọc, nút đặt lại */}
      <div className="dg-toolbar">
        {searchText && (
          <div className="dg-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1) }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
        )}
        {filters.map(f => (
          <select
            key={f.key}
            value={filterValues[f.key]}
            aria-label={f.label}
            onChange={e => { setFilterValues(current => ({ ...current, [f.key]: e.target.value })); setPage(1) }}
          >
            <option value="all">{f.label}: Tất cả</option>
            {f.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ))}
        {hasActiveFilter && <button type="button" className="dg-reset" onClick={resetAll}>Xóa lọc</button>}
        <span className="dg-count">{sorted.length} / {rows.length} dòng</span>
        {toolbarExtra}
      </div>

      {/* Bảng: tiêu đề cột bấm để sắp xếp, các dòng dữ liệu */}
      <div className="dg-wrap">
        <table className="dg-table">
          {caption && <caption className="dg-caption">{caption}</caption>}
          <thead>
            <tr>
              {columns.map(column => {
                const active = sort?.key === column.key
                const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                // Tiêu đề 1 cột (bấm để sắp xếp)
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={column.sortable === false ? undefined : ariaSort}
                    style={{ textAlign: column.align || 'left', minWidth: column.minWidth }}
                  >
                    {column.sortable === false ? column.label : (
                      <button type="button" className={`dg-sort${active ? ' active' : ''}`} onClick={() => toggleSort(column)}>
                        {column.label}
                        <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td className="dg-empty" colSpan={columns.length}>{hasActiveFilter ? 'Không có dòng nào khớp bộ lọc.' : emptyText}</td></tr>
            )}
            {pageRows.map(row => ( // 1 dòng dữ liệu (bấm để mở chi tiết)
              <tr
                key={getRowId(row)}
                className={rowClass(getCreatedAt ? getCreatedAt(row) : null, onRowClick ? 'dg-clickable' : '')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? e => { if (e.key === 'Enter') onRowClick(row) } : undefined}
              >
                {columns.map(column => (
                  <td key={column.key} style={{ textAlign: column.align || 'left' }}>
                    {column.render ? column.render(row) : (row[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Thanh phân trang */}
      <Pager
        page={currentPage}
        pageCount={pageCount}
        total={sorted.length}
        pageSize={size}
        onPage={p => setPage(Math.max(1, Math.min(pageCount, p)))}
      />
    </div>
  )
}
