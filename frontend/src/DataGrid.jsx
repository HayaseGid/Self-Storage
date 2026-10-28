import React, { useMemo, useState } from 'react'
import './DataGrid.css'

/*
 * Bảng dữ liệu dùng chung: sắp xếp theo cột, tìm kiếm, lọc, phân trang.
 *
 * columns: [{ key, label, render?(row), sortValue?(row), align?: 'left'|'right'|'center', sortable?: boolean, minWidth? }]
 * filters: [{ key, label, options: [{ value, label }], match(row, value) }]
 */
export default function DataGrid({
  columns,
  rows,
  getRowId,
  searchText,
  searchPlaceholder = 'Tìm kiếm...',
  filters = [],
  pageSize = 10,
  initialSort,
  onRowClick,
  emptyText = 'Không có dữ liệu.',
  toolbarExtra = null,
  caption
}) {
  const [query, setQuery] = useState('')
  const [filterValues, setFilterValues] = useState(() => Object.fromEntries(filters.map(f => [f.key, 'all'])))
  const [sort, setSort] = useState(initialSort || null) // { key, dir: 'asc' | 'desc' }
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      if (q && searchText && !searchText(row).toLowerCase().includes(q)) return false
      return filters.every(f => filterValues[f.key] === 'all' || f.match(row, filterValues[f.key]))
    })
  }, [rows, query, filterValues, filters, searchText])

  const sorted = useMemo(() => {
    if (!sort) return filtered
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
  }, [filtered, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const toggleSort = column => {
    if (column.sortable === false) return
    setSort(current => {
      if (!current || current.key !== column.key) return { key: column.key, dir: 'asc' }
      if (current.dir === 'asc') return { key: column.key, dir: 'desc' }
      return null
    })
  }

  const resetAll = () => {
    setQuery('')
    setFilterValues(Object.fromEntries(filters.map(f => [f.key, 'all'])))
    setPage(1)
  }
  const hasActiveFilter = query.trim() || Object.values(filterValues).some(v => v !== 'all')

  return (
    <div className="dg">
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

      <div className="dg-wrap">
        <table className="dg-table">
          {caption && <caption className="dg-caption">{caption}</caption>}
          <thead>
            <tr>
              {columns.map(column => {
                const active = sort?.key === column.key
                const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
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
            {pageRows.map(row => (
              <tr
                key={getRowId(row)}
                className={onRowClick ? 'dg-clickable' : ''}
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

      {pageCount > 1 && (
        <div className="dg-pager">
          <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>‹ Trước</button>
          <span>Trang {currentPage} / {pageCount}</span>
          <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>Sau ›</button>
        </div>
      )}
    </div>
  )
}
