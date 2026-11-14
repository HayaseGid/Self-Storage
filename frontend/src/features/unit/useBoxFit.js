/**
 * ======================================================================
 * FILE: src/features/unit/useBoxFit.js  —  KHO NÀO XẾP VỪA SỐ THÙNG KHÁCH NHẬP
 * Dùng ở: Unit3DViewer (sidebar "Kho vừa với số thùng của bạn") và trang Tìm kho (bộ lọc "Số thùng").
 * Cách tính, theo từng cỡ kho (kho cùng kích thước chỉ tính 1 lần):
 *   1. Ngay lập tức: ước tính theo thể tích dùng được (trừ lối đi) × PACK_EFFICIENCY.
 *   2. Sau đó: xếp thử thật bằng thuật toán Extreme Point trong Web Worker (biến thể 'fit') rồi thay kết quả
 *      ước tính. Nếu 'fit' xếp hết thì nút "Xếp thử" trong cửa sổ 3D cũng xếp hết.
 * ======================================================================
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { PACK_EFFICIENCY, aisleZones, boxRequests, volumeOf } from '../../utils/packing'
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
