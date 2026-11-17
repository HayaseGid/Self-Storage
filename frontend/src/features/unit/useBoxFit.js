/**
 * ======================================================================
 * FILE: src/features/unit/useBoxFit.js  —  KHO NÀO XẾP VỪA SỐ THÙNG KHÁCH NHẬP
 * Dùng ở: Unit3DViewer (sidebar "Kho vừa với số thùng của bạn") và trang Tìm kho (bộ lọc "Số thùng").
 * Cách tính, theo từng cỡ kho (kho cùng kích thước chỉ tính 1 lần):
 *   1. Ngay lập tức: ước tính theo thể tích dùng được (trừ lối đi) × PACK_EFFICIENCY.
 *   2. Sau đó: xếp thử thật bằng thuật toán Extreme Point trong Web Worker (biến thể 'back') rồi thay kết quả
 *      ước tính. Nếu 'back' xếp hết thì nút "Xếp thử" trong cửa sổ 3D ('best' hoặc 'back') cũng xếp hết.
 * ======================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { EXACT_PACK_LIMIT, PACK_EFFICIENCY, aisleZones, boxRequests, volumeOf } from '../../utils/packing'
import { CANCELLED, usePackChannel } from '../../utils/packingClient'
import { unitGeometry } from '../../utils/unitGeometry'

/* Khóa nhận diện 1 cỡ kho (kho cùng khóa có cùng kết quả xếp). */
export const geoKey = geo => `${geo.width}|${geo.length}|${geo.height}|${geo.isLocker}|${geo.band}`

/**
 * @param {Array} units danh sách kho cần kiểm tra.
 * @param {object} counts { 'box-s', 'box-m', 'box-l' }.
 * @param {boolean} aisleOn có chừa lối đi 80 cm không.
 * @returns {{ total:number, volume:number, pending:boolean, estimated:boolean,
 *   fits:(unit)=>boolean, usedPctOf:(unit)=>number|undefined }}
 *   pending = đang xếp thử thật; estimated = kết quả hiện tại mới là ước tính.
 */
export function useBoxFit(units, counts, aisleOn = true) {
  const channel = usePackChannel()
  const unitsRef = useRef(units)
  unitsRef.current = units
  const unitsKey = units.map(u => `${u.id}:${u.size}`).join('|')
  const countsKey = JSON.stringify(counts)

  // Gom kho theo cỡ, kèm phòng (m) và vùng lối đi.
  const groups = useMemo(() => {
    const map = new Map()
    unitsRef.current.forEach(unit => {
      const geo = unitGeometry(unit)
      const key = geoKey(geo)
      if (map.has(key)) return
      const room = { w: geo.width, h: geo.height, l: geo.length }
      const zones = aisleOn ? aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' }) : []
      map.set(key, { key, room, zones, roomVolume: room.w * room.h * room.l })
    })
    return [...map.values()]
  }, [unitsKey, aisleOn])

  const [state, setState] = useState({ total: 0, volume: 0, pending: false, estimated: false, fit: new Map() })

  useEffect(() => {
    const { requests, total, volume } = boxRequests(counts)
    // Thể tích đồ lớn hơn kho thì chắc chắn không vừa, khỏi xếp thử.
    const candidates = total ? groups.filter(g => volume <= g.roomVolume) : []
    if (!candidates.length) {
      setState({ total, volume, pending: false, estimated: false, fit: new Map() })
      return undefined
    }
    const usedPct = g => Math.round((volume / g.roomVolume) * 100)
    // Bước 1: ước tính ngay.
    const estimate = new Map()
    candidates.forEach(g => { if (volume <= (g.roomVolume - volumeOf(g.zones)) * PACK_EFFICIENCY) estimate.set(g.key, usedPct(g)) })
    setState({ total, volume, pending: true, estimated: true, fit: estimate })

    // Bước 2: xếp thử thật trong worker (chờ 250 ms khi khách đang gõ).
    let cancelled = false
    const exact = new Map()
    const byKey = new Map(candidates.map(g => [g.key, g]))
    const timer = setTimeout(() => {
      channel.run('fitGroups', { requests, groups: candidates.map(g => ({ key: g.key, room: g.room, zones: g.zones })) },
        progress => { if (progress.fits) exact.set(progress.key, usedPct(byKey.get(progress.key))) })
        .then(result => {
          if (cancelled || result === CANCELLED) return
          setState({ total, volume, pending: false, estimated: false, fit: exact })
        })
        .catch(() => { if (!cancelled) setState(s => ({ ...s, pending: false })) }) // lỗi worker: giữ kết quả ước tính
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [groups, countsKey])

  const fits = unit => state.fit.has(geoKey(unitGeometry(unit)))
  const usedPctOf = unit => state.fit.get(geoKey(unitGeometry(unit)))
  return { total: state.total, volume: state.volume, pending: state.pending, estimated: state.estimated, fits, usedPctOf }
}

/* Phòng (m) + vùng lối đi của 1 kho. */
function roomOfUnit(unit, aisleOn) {
  const geo = unitGeometry(unit)
  const room = { w: geo.width, h: geo.height, l: geo.length }
  const zones = aisleOn ? aisleZones(room, { isLocker: geo.isLocker, vehicle: geo.band === 'V' }) : []
  return { key: geoKey(geo), room, zones, roomVolume: room.w * room.h * room.l }
}

/**
 * Kho đang xem có chứa hết đồ không; nếu không, phần dư vừa với những cỡ kho nào trong `others` (để gợi ý thuê thêm 1 kho).
 * Xếp vào kho đang xem bằng cùng biến thể với nút "Xếp thử" (nên số món dư khớp với khi khách bấm "Xếp thử").
 * @param {object} unit kho đang xem. @param {Array} others các kho trống khác cùng cơ sở.
 * @param {boolean} enabled false = không tính (vd không ở tab "Tự xếp thùng").
 * @returns {{ pending:boolean, result: null | { placedCount, placedVolume, leftoverCount, leftoverVolume, roomVolume, fits:Set<string> } }}
 */
export function useSplitPack(unit, others, counts, aisleOn = true, enabled = true) {
  const channel = usePackChannel()
  const othersRef = useRef(others)
  othersRef.current = others
  const othersKey = others.map(u => `${u.id}:${u.size}`).join('|')
  const countsKey = JSON.stringify(counts)
  const [state, setState] = useState({ pending: false, result: null })

  useEffect(() => {
    const { requests, total } = boxRequests(counts)
    if (!enabled || !unit || !total) { setState({ pending: false, result: null }); return undefined }
    const current = roomOfUnit(unit, aisleOn)
    const candidates = new Map()
    othersRef.current.forEach(u => { const c = roomOfUnit(u, aisleOn); if (!candidates.has(c.key)) candidates.set(c.key, c) })
    setState({ pending: true, result: null })
    let cancelled = false
    const timer = setTimeout(() => {
      channel.run('splitPack', {
        room: current.room,
        zones: current.zones,
        requests,
        prefer: total > EXACT_PACK_LIMIT ? 'back' : 'best',
        candidates: [...candidates.values()]
      })
        .then(result => {
          if (cancelled || result === CANCELLED) return
          setState({ pending: false, result: { ...result, roomVolume: current.roomVolume, fits: new Set(result.fits) } })
        })
        .catch(() => { if (!cancelled) setState({ pending: false, result: null }) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [unit?.id, othersKey, countsKey, aisleOn, enabled])

  return state
}
