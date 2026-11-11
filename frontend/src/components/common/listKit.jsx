/**
 * ======================================================================
 * FILE: src/components/common/listKit.jsx  —  BỘ CÔNG CỤ DANH SÁCH DÙNG CHUNG CHO MỌI VAI TRÒ
 * Gồm:
 * - Đánh dấu bản ghi "Mới" (tạo trong NEW_HOURS = 48 giờ), lưu id đã xem ở localStorage 'storespace_seen_items_v1'.
 * - <Pager>: thanh phân trang ("Hiển thị 1–20 / 345", số trang, chọn số dòng/trang).
 * - useClientPaging(): chia trang cho danh sách nhỏ có sẵn ở frontend.
 * - useServerList(): danh sách phân trang ở BACKEND (?page=&pageSize=&q=&status=&sort=...) -> { items, total, statusCounts };
 *   backend chưa hỗ trợ (404/405 hoặc trả mảng) thì tự lọc/sắp xếp/chia trang ở frontend từ dữ liệu dự phòng.
 * - <Code>/<UnitCodes>: hiển thị mã đơn / mã kho / mã HĐ dạng thẻ nổi bật.
 * - <FilterChips>, <SortSelect>: nút lọc có số đếm và ô chọn sắp xếp.
 * API: chỉ useServerList gọi apiGet(path?query) với path do nơi dùng truyền vào
 * (vd /api/operations/reservations, /api/admin/users ...).
 * ======================================================================
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '../../api/api'
import './listKit.css'

/*
 * BỘ CÔNG CỤ DANH SÁCH DÙNG CHUNG (file THÊM MỚI) - mọi actor dùng chung để giao diện thống nhất:
 *   <Pager>            thanh phân trang: số trang, "Hiển thị 1–20 / 345", chọn số dòng mỗi trang.
 *   useServerList()    danh sách phân trang ở BACKEND (?page=&pageSize=&q=&status=&sort=) -> { items, total, statusCounts }.
 *                      Backend chưa có API mới (404) thì tự chia trang ở frontend từ dữ liệu sẵn có (fallback) để trang không vỡ.
 *   useClientPaging()  chia trang cho danh sách nhỏ đã có sẵn ở frontend (việc được giao, nhật ký, thông báo...).
 *   Code               mã quan trọng (mã đơn, mã kho, mã HĐ) in đậm dạng thẻ, dễ dò bằng mắt.
 *   isNewItem / NewBadge / rowClass: bản ghi mới tạo (trong NEW_HOURS giờ) được tô sáng + nhãn "Mới", luôn xếp lên đầu.
 */

export const NEW_HOURS = 48
export const PAGE_SIZES = [10, 20, 50, 100]

/* ---------- Mới / nổi bật ---------- */

const SEEN_STORAGE_KEY = 'storespace_seen_items_v1'

/**
 * Đọc tập id bản ghi người dùng đã bấm "đã xem" (tắt nhãn Mới) từ localStorage.
 */
export function getSeenSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

/**
 * Kiểm tra 1 id đã được đánh dấu đã xem chưa.
 */
export function isItemSeen(id) {
  if (!id) return false
  return getSeenSet().has(String(id))
}

/**
 * Đánh dấu 1 id là đã xem (giữ tối đa 2000 id) và phát sự kiện 'storespace:seen_updated' để các nhãn Mới cập nhật.
 */
export function markItemSeen(id) {
  if (!id) return
  try {
    const s = getSeenSet()
    const str = String(id)
    if (s.has(str)) return
    s.add(str)
    const arr = Array.from(s)
    if (arr.length > 2000) arr.splice(0, arr.length - 2000)
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr))
    window.dispatchEvent(new CustomEvent('storespace:seen_updated', { detail: str }))
  } catch { }
}

/**
 * Đánh dấu nhiều id là đã xem cùng lúc và phát sự kiện 'storespace:seen_updated'.
 */
export function markAllItemsSeen(ids) {
  if (!ids || !ids.length) return
  try {
    const s = getSeenSet()
    ids.forEach(id => { if (id) s.add(String(id)) })
    const arr = Array.from(s)
    if (arr.length > 2000) arr.splice(0, arr.length - 2000)
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(arr))
    window.dispatchEvent(new CustomEvent('storespace:seen_updated', { detail: 'all' }))
  } catch { }
}

// Backend trả giờ UTC không kèm "Z" -> tự thêm để không lệch 7 tiếng
/**
 * Parse thời điểm từ backend thành milisecond. Hỗ trợ "YYYY-MM-DD HH:mm", "YYYY-MM-DD" (00:00 giờ máy);
 * giờ UTC không kèm "Z" thì tự thêm "Z" để không lệch 7 tiếng.
 * @returns {number} NaN nếu không parse được.
 */
export function parseTime(value) {
  if (!value) return NaN
  if (value instanceof Date) return value.getTime()
  const text = String(value).replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2') // "2026-11-10 08:30" -> ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Date.parse(`${text}T00:00:00`)
  return Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
}

/**
 * Kiểm tra bản ghi có còn "mới" không: tạo trong `hours` giờ gần đây và chưa bị đánh dấu đã xem.
 */
export function isNewItem(createdAt, hours = NEW_HOURS, id = null) {
  const itemId = id || (createdAt ? String(createdAt) : null)
  if (itemId && isItemSeen(itemId)) return false
  const t = parseTime(createdAt)
  if (Number.isNaN(t)) return false
  const age = Date.now() - t
  return age >= -60000 && age < hours * 3600000
}

/* Mới nhất lên đầu: theo createdAt, không có thì theo id giảm dần. */
/**
 * Sắp xếp mới nhất lên đầu: theo ngày tạo (hàm date), nếu không có ngày thì theo id giảm dần.
 * @param {object[]} rows
 * @param {{date?:Function, id?:Function}} options hàm lấy ngày / id của mỗi dòng.
 */
export function newestFirst(rows, { date = r => r?.createdAt, id = r => r?.id } = {}) {
  return [...(rows || [])].sort((a, b) => {
    const ta = parseTime(date(a))
    const tb = parseTime(date(b))
    if (!Number.isNaN(ta) || !Number.isNaN(tb)) {
      if (Number.isNaN(ta)) return 1
      if (Number.isNaN(tb)) return -1
      if (tb !== ta) return tb - ta
    }
    const ia = Number(id(a))
    const ib = Number(id(b))
    if (Number.isFinite(ia) && Number.isFinite(ib)) return ib - ia
    return String(id(b) ?? '').localeCompare(String(id(a) ?? ''), 'vi', { numeric: true })
  })
}

/**
 * Component nhãn "Mới" (bấm ✕ để tắt nhãn của bản ghi đó). Tự ẩn khi bản ghi đã xem hoặc hết thời gian mới.
 * @param {{createdAt, id, show?, label?, onDismiss?}} props
 */
export function NewBadge({ createdAt, id, show, label = 'Mới', onDismiss }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    // Khi có sự kiện 'storespace:seen_updated' thì vẽ lại để ẩn/hiện nhãn cho đúng.
    const handler = () => setTick(t => t + 1)
    window.addEventListener('storespace:seen_updated', handler)
    return () => window.removeEventListener('storespace:seen_updated', handler)
  }, [])

  const itemId = id || (createdAt ? String(createdAt) : null)
  if (itemId && isItemSeen(itemId)) return null
  const visible = show ?? isNewItem(createdAt, NEW_HOURS, itemId)
  if (!visible) return null

  // Bấm vào nhãn: chặn sự kiện lan ra dòng cha, đánh dấu đã xem, gọi onDismiss.
  const handleClick = (e) => {
    e.stopPropagation()
    if (itemId) markItemSeen(itemId)
    onDismiss?.()
  }

  return (
    <span
      className="ss-new-badge"
      title="Bấm để tắt đánh dấu Mới"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
      {label}
      <span style={{ marginLeft: 4, opacity: 0.8, fontSize: '9px' }}>✕</span>
    </span>
  )
}

/* Thêm vào className của dòng / thẻ: 'ss-row-new' khi bản ghi mới tạo */
/**
 * Trả về className cho dòng/thẻ: thêm 'ss-row-new' (tô sáng) nếu bản ghi còn mới và chưa xem.
 */
export function rowClass(createdAt, extra = '', id = null) {
  const itemId = id || (createdAt ? String(createdAt) : null)
  if (itemId && isItemSeen(itemId)) return extra
  return [extra, isNewItem(createdAt, NEW_HOURS, itemId) ? 'ss-row-new' : ''].filter(Boolean).join(' ')
}

/**
 * Định dạng ngày giờ ngắn "HH:mm dd/MM/yyyy" (không hợp lệ -> "—").
 */
export function fmtDateTimeShort(value) {
  const t = parseTime(value)
  if (Number.isNaN(t)) return '—'
  return new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}

/* Thời gian tương đối ngắn: "5 phút trước", "3 giờ trước", "2 ngày trước" */
/**
 * Thời gian tương đối: "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước"; quá 30 ngày thì hiện ngày.
 */
export function timeAgo(value) {
  const t = parseTime(value)
  if (Number.isNaN(t)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (minutes < 1) return 'vừa xong'
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ngày trước`
  return fmtDateTimeShort(value).split(' ').pop()
}

/* ---------- Mã quan trọng ---------- */

/* kind: 'order' (mã đơn) | 'unit' (mã kho) | 'contract' (mã HĐ) | undefined */
/**
 * Component hiển thị 1 mã quan trọng dạng thẻ in đậm (kind: 'order' mã đơn | 'unit' mã kho | 'contract' mã HĐ).
 */
export function Code({ children, kind, title, className = '' }) {
  if (children == null || children === '') return <span className="ss-muted">—</span>
  return <span className={`ss-code${kind ? ` ss-code-${kind}` : ''} ${className}`.trim()} title={title}>{children}</span>
}

/* Danh sách mã kho: mỗi mã một thẻ */
/**
 * Component hiển thị danh sách mã kho, mỗi mã 1 thẻ; quá `max` mã thì hiện "+N".
 */
export function UnitCodes({ units, max = 4 }) {
  const list = (Array.isArray(units) ? units : String(units || '').split(','))
    .map(u => String(u ?? '').trim())
    .filter(Boolean)
  if (!list.length) return <span className="ss-muted">Chưa phân kho</span>
  const shown = list.slice(0, max)
  return (
    <span className="ss-codes">
      {shown.map(u => <Code key={u} kind="unit">{u}</Code>)}
      {list.length > max && <span className="ss-muted" title={list.join(', ')}>+{list.length - max}</span>}
    </span>
  )
}

/* ---------- Thanh phân trang ---------- */

/**
 * Tính các số trang cần hiển thị trên thanh phân trang (trang đầu, cuối, quanh trang hiện tại, chèn "…").
 * @returns {Array<number|string>} số trang hoặc khóa 'gap-N' cho dấu "…".
 */
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  if (page <= 3) [2, 3, 4].forEach(p => pages.add(p))
  if (page >= pageCount - 2) [pageCount - 1, pageCount - 2, pageCount - 3].forEach(p => pages.add(p))
  const sorted = [...pages].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(`gap-${p}`)
    out.push(p)
  })
  return out
}

/**
 * Component thanh phân trang: thông tin "Hiển thị từ–đến / tổng", nút trang trước/sau, số trang, ô chọn số dòng/trang.
 * @param {object} props page, pageCount, total, pageSize, onPage, onPageSize, pageSizes, unit, loading, compact.
 */
export function Pager({ page, pageCount, total, pageSize, onPage, onPageSize, pageSizes = PAGE_SIZES, unit = 'dòng', loading = false, compact = false }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  if (!total && !loading) return null
  return (
    <nav className={`ss-pager${compact ? ' compact' : ''}`} aria-label="Phân trang">
      <span className="ss-pager-info">
        {loading ? 'Đang tải…' : <>Hiển thị <b>{from}–{to}</b> / <b>{total}</b> {unit}</>}
      </span>
      {pageCount > 1 && (
        <span className="ss-pager-pages">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1 || loading} aria-label="Trang trước">‹</button>
          {pageWindow(page, pageCount).map(p => typeof p === 'number'
            ? (
              <button key={p} type="button" className={p === page ? 'active' : ''} aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)} disabled={loading}>{p}</button>
            )
            : <span key={p} className="ss-pager-gap">…</span>)}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount || loading} aria-label="Trang sau">›</button>
        </span>
      )}
      {onPageSize && !compact && (
        <label className="ss-pager-size">
          <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))} aria-label="Số dòng mỗi trang">
            {[...new Set([pageSize, ...pageSizes])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n} / trang</option>)}
          </select>
        </label>
      )}
    </nav>
  )
}

/* ---------- Chia trang ở frontend ---------- */

/**
 * Hook chia trang ở frontend cho một mảng có sẵn.
 * @param {object[]} rows dữ liệu.
 * @param {{pageSize?:number, resetKey?:string}} options resetKey đổi thì quay về trang 1.
 * @returns {{pageRows, page, setPage, pageCount, total, pageSize, pagerProps}} pagerProps truyền thẳng vào <Pager>.
 */
export function useClientPaging(rows, { pageSize: initialSize = 10, resetKey = '' } = {}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)
  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  useEffect(() => { setPage(1) }, [resetKey, pageSize])
  // Cắt ra các dòng của trang hiện tại.
  const pageRows = useMemo(() => list.slice((current - 1) * pageSize, current * pageSize), [list, current, pageSize])
  return {
    pageRows,
    page: current,
    setPage,
    pageCount,
    total,
    pageSize,
    pagerProps: {
      page: current,
      pageCount,
      total,
      pageSize,
      // Chuyển trang (giới hạn trong khoảng 1..pageCount).
      onPage: p => setPage(Math.max(1, Math.min(pageCount, p))),
      onPageSize: setPageSize
    }
  }
}

/* ---------- Phân trang ở backend ---------- */

/**
 * Hook trì hoãn (debounce): chỉ cập nhật giá trị sau `delay` ms người dùng ngừng gõ (tránh gọi API liên tục).
 */
function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * Đổi object tham số thành query string (bỏ giá trị rỗng; mảng nối bằng dấu phẩy).
 */
const toQuery = params => Object.entries(params)
  .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`)
  .join('&')

/*
 * useServerList({ path, q, status, sort, extra, pageSize, reloadKey, enabled, fallback })
 *   path      : '/api/operations/reservations'
 *   q, status, sort, extra: tham số lọc (extra: { facilityId, email, ... })
 *   reloadKey : đổi giá trị -> tải lại trang hiện tại (vd sau khi bàn giao / làm mới)
 *   fallback  : { rows, match(row, { q, status }), compare(a, b, sort), statusOf(row) }
 *               dùng khi backend chưa có API phân trang (404 / trả mảng) -> chia trang ở frontend.
 * Trả về { items, total, page, pageCount, pageSize, statusCounts, loading, error, mode, setPage, setPageSize, pagerProps, reload }
 */
/**
 * Hook danh sách phân trang ở backend.
 * API: GET {path}?page=&pageSize=&q=&status=&sort=&...extra  -> { items, total, pageCount, statusCounts, page }
 * - Đổi bộ lọc -> tự về trang 1; từ khóa q được debounce 300ms; đổi reloadKey -> tải lại.
 * - Backend trả mảng (bản cũ) hoặc 404/405 -> chuyển sang chế độ dự phòng ('client') dùng fallback.rows.
 * @param {object} options path, q, status, sort, extra, pageSize, reloadKey, enabled,
 *   fallback { rows, match(row,{q,status}), compare(a,b,sort), statusOf(row) }.
 * @returns {{items,total,page,pageCount,pageSize,statusCounts,loading,error,mode,setPage,setPageSize,reload,pagerProps}}
 */
export function useServerList({ path, q = '', status = '', sort = 'newest', extra = {}, pageSize: initialSize = 20, reloadKey = 0, enabled = true, fallback = null }) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)
  const [state, setState] = useState({ items: [], total: 0, pageCount: 1, statusCounts: null, loading: true, error: '', mode: 'server' })
  const [tick, setTick] = useState(0)
  const debouncedQ = useDebounced(q)
  const extraKey = JSON.stringify(extra)
  const statusKey = Array.isArray(status) ? status.join(',') : status
  const filterKey = `${debouncedQ}|${statusKey}|${sort}|${extraKey}|${pageSize}`
  const lastFilterKey = useRef(filterKey)
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const [useFallback, setUseFallback] = useState(false)

  // Đổi bộ lọc -> về trang 1
  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey
      setPage(1)
    }
  }, [filterKey])

  useEffect(() => {
    if (!enabled || useFallback) return undefined
    let cancelled = false
    setState(s => ({ ...s, loading: true, error: '' }))
    const query = toQuery({ page, pageSize, q: debouncedQ.trim(), status: statusKey, sort, ...extra })
    apiGet(`${path}?${query}`)
      .then(data => {
        if (cancelled) return
        if (Array.isArray(data)) { setUseFallback(true); return } // backend cũ: trả cả mảng
        setState({
          items: Array.isArray(data?.items) ? data.items : [],
          total: Number(data?.total) || 0,
          pageCount: Math.max(1, Number(data?.pageCount) || 1),
          statusCounts: data?.statusCounts || null,
          loading: false,
          error: '',
          mode: 'server'
        })
        if (data?.page && data.page !== page) setPage(data.page)
      })
      .catch(error => {
        if (cancelled) return
        if ((error?.status === 404 || error?.status === 405) && fallbackRef.current) { setUseFallback(true); return }
        setState(s => ({ ...s, loading: false, error: error?.message || 'Không tải được danh sách.' }))
      })
    return () => { cancelled = true }
  }, [enabled, useFallback, path, page, pageSize, debouncedQ, statusKey, sort, extraKey, reloadKey, tick])

  // Chế độ dự phòng: lọc + sắp xếp + chia trang ở frontend
  // Chế độ dự phòng: lọc theo từ khóa, đếm theo trạng thái, lọc trạng thái, sắp xếp, rồi cắt trang ngay ở frontend.
  const fallbackResult = useMemo(() => {
    if (!useFallback || !fallback) return null
    const statuses = statusKey ? statusKey.split(',') : []
    const all = (fallback.rows || [])
    const byQ = all.filter(row => !fallback.match || fallback.match(row, { q: debouncedQ.trim().toLowerCase(), status: [] }))
    const statusCounts = {}
    if (fallback.statusOf) byQ.forEach(row => { const s = fallback.statusOf(row); statusCounts[s] = (statusCounts[s] || 0) + 1 })
    const filtered = statuses.length && fallback.statusOf ? byQ.filter(row => statuses.includes(fallback.statusOf(row))) : byQ
    const sorted = fallback.compare ? [...filtered].sort((a, b) => fallback.compare(a, b, sort)) : newestFirst(filtered)
    const total = sorted.length
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const current = Math.min(page, pageCount)
    return { items: sorted.slice((current - 1) * pageSize, current * pageSize), total, pageCount, statusCounts, page: current }
  }, [useFallback, fallback, debouncedQ, statusKey, sort, page, pageSize])

  const view = fallbackResult
    ? { ...fallbackResult, loading: false, error: '', mode: 'client' }
    : { ...state, page }

  return {
    ...view,
    pageSize,
    setPage,
    setPageSize,
    // Tải lại trang hiện tại (tăng biến tick để kích hoạt lại effect gọi API).
    reload: () => setTick(t => t + 1),
    pagerProps: {
      page: view.page,
      pageCount: view.pageCount,
      total: view.total,
      pageSize,
      loading: view.loading && !view.items.length,
      // Chuyển trang (giới hạn trong khoảng hợp lệ).
      onPage: p => setPage(Math.max(1, Math.min(view.pageCount, p))),
      // Đổi số dòng mỗi trang.
      onPageSize: size => setPageSize(size)
    }
  }
}

/* ---------- Nút lọc có số đếm ---------- */

/* options: [[value, label]] hoặc [{ value, label }] ; counts: { VALUE: n } ; value '' = Tất cả */
/**
 * Component dãy nút lọc (chip) có số đếm. value '' hoặc 'all' = Tất cả.
 * @param {object} props options ([[value,label]] hoặc [{value,label}]), value, onChange, counts ({ MÃ: số }), total.
 */
export function FilterChips({ options = [], value, onChange, counts, total, className = '' }) {
  return (
    <div className={`ss-chips ${className}`.trim()} role="tablist">
      {options.map((opt) => {
        const key = Array.isArray(opt) ? opt[0] : (opt?.value ?? opt?.key ?? '')
        const label = Array.isArray(opt) ? opt[1] : (opt?.label ?? opt?.text ?? String(opt))
        const keys = String(key).split(',').filter(Boolean)
        const n = key === '' || key === 'all'
          ? (total != null ? total : (counts ? Object.values(counts).reduce((a, b) => a + Number(b || 0), 0) : null))
          : (counts ? keys.reduce((sum, k) => sum + (counts?.[k] || 0), 0) : null)
        return (
          <button key={key || 'all'} type="button" role="tab" aria-selected={value === key}
            className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
            {label}{n != null && <span>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Component ô chọn kiểu sắp xếp.
 * @param {object} props value, onChange, options ([[value,label]]), label.
 */
export function SortSelect({ value, onChange, options = [], label = 'Sắp xếp' }) {
  return (
    <label className="ss-sort">
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}>
        {options.map((opt) => {
          const key = Array.isArray(opt) ? opt[0] : (opt?.value ?? opt?.key ?? '')
          const text = Array.isArray(opt) ? opt[1] : (opt?.label ?? opt?.text ?? String(opt))
          return <option key={key} value={key}>{text}</option>
        })}
      </select>
    </label>
  )
}
