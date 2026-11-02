import React, { useEffect, useRef, useState } from 'react'
import { magnetSnap, placeAt } from './packing'

/*
 * Cảnh 3D của một kho bằng Three.js (nạp từ CDN khi cần, giống cách nạp Leaflet cho bản đồ).
 *  - mode "sample": xem kho có đồ mẫu bày sẵn (chỉ xoay / phóng to, rê chuột xem tên đồ).
 *  - mode "pack":   khách tự xếp: bấm chọn món, KÉO trên sàn để di chuyển (tự chồng lên món bên dưới),
 *                   món đỏ = vị trí không hợp lệ (ra ngoài kho / quá trần) -> thả ra sẽ quay về chỗ cũ.
 * Đơn vị: mét. Kho: x = rộng (W), y = cao (H), z = dài (L); hai vách ở x = 0 và z = 0.
 */
const THREE_URL = 'https://unpkg.com/three@0.128.0/build/three.min.js'
let threePromise = null
export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE)
  if (threePromise) return threePromise
  threePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = THREE_URL
    script.async = true
    script.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error('Không tải được thư viện 3D.')))
    script.onerror = () => { threePromise = null; reject(new Error('Không tải được thư viện 3D (cần kết nối Internet).')) }
    document.head.appendChild(script)
  })
  return threePromise
}

const SNAP = 0.05
const snap = v => Math.round(v / SNAP) * SNAP
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function makeLabel(THREE, text, { bg = '#073d70', fg = '#ffffff', scale = 0.32 } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = 'bold 40px "Be Vietnam Pro", Arial, sans-serif'
  ctx.font = font
  const width = Math.ceil(ctx.measureText(text).width) + 36
  canvas.width = width
  canvas.height = 64
  ctx.font = font
  ctx.fillStyle = bg
  const r = 16
  ctx.beginPath()
  ctx.moveTo(r, 0); ctx.lineTo(width - r, 0); ctx.quadraticCurveTo(width, 0, width, r)
  ctx.lineTo(width, 64 - r); ctx.quadraticCurveTo(width, 64, width - r, 64)
  ctx.lineTo(r, 64); ctx.quadraticCurveTo(0, 64, 0, 64 - r)
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 18, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }))
  sprite.scale.set(scale * (width / 64), scale, 1)
  sprite.renderOrder = 10
  return sprite
}

/* Một món đồ: hộp có viền; vài món có thêm chi tiết (bánh xe, băng keo, ngăn kệ). */
function buildItem(THREE, item) {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({ color: item.color || '#c98b4f', roughness: 0.82, metalness: 0.02 })
  const key = item.key || ''
  const addBox = (w, h, d, x, y, z, mat = material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  const { w, h, d } = item
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#212121', roughness: 0.9 })
  if (key === 'car') {
    addBox(w, h * 0.45, d, 0, -h * 0.2, 0)
    addBox(w * 0.86, h * 0.4, d * 0.5, 0, h * 0.22, -d * 0.04, new THREE.MeshStandardMaterial({ color: '#90caf9', roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.85 }))
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20), wheelMat)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(sx * (w / 2 - 0.05), -h / 2 + 0.33, sz * (d / 2 - 0.75))
      wheel.castShadow = true
      group.add(wheel)
    })
  } else if (key === 'bike' || key === 'motorbike') {
    const radius = key === 'bike' ? 0.33 : 0.3
    ;[-1, 1].forEach(sz => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(radius, key === 'bike' ? 0.025 : 0.07, 10, 28), wheelMat)
      wheel.rotation.y = Math.PI / 2
      wheel.position.set(0, -h / 2 + radius, sz * (d / 2 - radius))
      wheel.castShadow = true
      group.add(wheel)
    })
    addBox(key === 'bike' ? 0.06 : w * 0.5, h * (key === 'bike' ? 0.08 : 0.45), d * 0.62, 0, -h / 2 + radius + (key === 'bike' ? 0.18 : 0.25), 0)
    addBox(0.05, h * 0.45, 0.05, 0, h * 0.18, d / 2 - radius - 0.05)
  } else if (key === 'shelf') {
    addBox(w, h, d, 0, 0, 0)
    const plank = new THREE.MeshStandardMaterial({ color: '#5d3a24', roughness: 0.85 })
    for (let i = 1; i < 5; i += 1) addBox(w * 0.96, 0.025, d * 1.02, 0, -h / 2 + (h * i) / 5, 0.002, plank)
  } else if (key === 'lamp') {
    addBox(0.04, h * 0.85, 0.04, 0, -h * 0.07, 0, new THREE.MeshStandardMaterial({ color: '#616161' }))
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, w / 2, 0.3, 20), material)
    shade.position.set(0, h / 2 - 0.15, 0)
    shade.castShadow = true
    group.add(shade)
  } else if (key === 'chair') {
    const seat = new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.8 })
    addBox(w, 0.08, d, 0, -h / 2 + 0.45, 0, seat)
    addBox(w, h * 0.5, 0.06, 0, h * 0.2, -d / 2 + 0.03, seat)
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => addBox(0.04, 0.45, 0.04, sx * (w / 2 - 0.04), -h / 2 + 0.225, sz * (d / 2 - 0.04), wheelMat))
  } else {
    addBox(w, h, d, 0, 0, 0)
    if (key.startsWith('box')) {
      const tape = new THREE.MeshStandardMaterial({ color: '#e8cf9c', roughness: 0.6 })
      addBox(Math.min(0.06, w * 0.15), 0.004, d * 1.002, 0, h / 2 + 0.002, 0, tape)
    }
  }
  // Viền để các món tách bạch khi chồng lên nhau.
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: '#3e2c1c', transparent: true, opacity: key.startsWith('box') ? 0.35 : 0.15 }))
  edges.raycast = () => {} // không cho viền "bắt" chuột (ngưỡng mặc định của Line rất lớn -> chọn nhầm món)
  group.add(edges)
  group.position.set(item.x + w / 2, item.y + h / 2, item.z + d / 2)
  group.userData = { itemId: item.id, name: item.name, material, edges }
  group.traverse(child => { child.userData.itemId = item.id })
  return group
}

const cm = v => Math.round(v * 100)
export const sizeText = it => `Rộng ${cm(it.w)} × Sâu ${cm(it.d)} × Cao ${cm(it.h)} cm`

export default function ThreeUnitScene({ geo, color = '#075a9f', mode = 'sample', items = [], zones = [], selectedId = null, onSelect, onMove, height = 440 }) {
  const boxRef = useRef(null)
  const ctx = useRef(null) // { THREE, renderer, scene, camera, itemGroup, orbit, frame }
  const itemsRef = useRef(items)
  const zonesRef = useRef(zones)
  zonesRef.current = zones
  const propsRef = useRef({ mode, selectedId, onSelect, onMove })
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [hover, setHover] = useState(null) // { name, size, x, y }
  itemsRef.current = items
  propsRef.current = { mode, selectedId, onSelect, onMove }
  const room = { w: geo.width, h: geo.height, l: geo.length }

  // Khởi tạo cảnh một lần cho mỗi kho.
  useEffect(() => {
    let disposed = false
    const host = boxRef.current
    loadThree().then(THREE => {
      if (disposed || !host) return
      const W = geo.width, H = geo.height, L = geo.length
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
      renderer.setSize(host.clientWidth || 600, host.clientHeight || height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.outputEncoding = THREE.sRGBEncoding
      renderer.domElement.style.display = 'block'
      renderer.domElement.style.touchAction = 'none'
      host.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color('#e4ecf3')
      const camera = new THREE.PerspectiveCamera(35, (host.clientWidth || 600) / (host.clientHeight || height), 0.05, 300)

      scene.add(new THREE.HemisphereLight(0xffffff, 0xb6c6d6, 0.8))
      const sun = new THREE.DirectionalLight(0xffffff, 0.75)
      const span = Math.max(W, L, H) * 1.6
      sun.position.set(W + span, H + span * 1.4, L + span * 0.8)
      sun.target.position.set(W / 2, 0, L / 2)
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.5, far: span * 6 })
      sun.shadow.camera.updateProjectionMatrix()
      scene.add(sun, sun.target)

      // Mặt đất + sàn kho kẻ ô 0,5 m (đậm mỗi 1 m)
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 8, span * 8), new THREE.MeshStandardMaterial({ color: '#d5dfe8', roughness: 1 }))
      ground.rotation.x = -Math.PI / 2
      ground.position.set(W / 2, -0.06, L / 2)
      ground.receiveShadow = true
      scene.add(ground)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.06, L + 0.12), new THREE.MeshStandardMaterial({ color: '#8fa3b5', roughness: 0.9 }))
      slab.position.set(W / 2, -0.03, L / 2)
      slab.receiveShadow = true
      scene.add(slab)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: '#eef2f5', roughness: 0.95 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.set(W / 2, 0.001, L / 2)
      floor.receiveShadow = true
      scene.add(floor)
      const lines = []
      for (let x = 0; x <= W + 1e-6; x += 0.5) lines.push(x, 0.003, 0, x, 0.003, L)
      for (let z = 0; z <= L + 1e-6; z += 0.5) lines.push(0, 0.003, z, W, 0.003, z)
      const gridGeo = new THREE.BufferGeometry()
      gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3))
      scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: '#c3d0dc' })))

      // Hai vách (trong cùng + bên trái), vách trong cùng mang màu loại kho; khung viền cả khối kho.
      const wallT = 0.06
      const back = new THREE.Mesh(new THREE.BoxGeometry(W + wallT, H, wallT), new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.55 }))
      back.position.set(W / 2 - wallT / 2, H / 2, -wallT / 2)
      back.receiveShadow = true
      const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, L), new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.9 }))
      left.position.set(-wallT / 2, H / 2, L / 2)
      left.receiveShadow = true
      // Cửa cuốn trên vách trái
      const doorW = Math.min(L * 0.7, 2.6)
      const doorH = Math.min(H * 0.85, 2.3)
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, doorH, doorW), new THREE.MeshStandardMaterial({ color: '#b0bec5', roughness: 0.5, metalness: 0.3 }))
      door.position.set(0.012, doorH / 2, L / 2)
      scene.add(back, left, door)
      for (let y = 0.12; y < doorH; y += 0.12) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.012, doorW), new THREE.MeshStandardMaterial({ color: '#90a4ae' }))
        slat.position.set(0.016, y, L / 2)
        scene.add(slat)
      }
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)), new THREE.LineBasicMaterial({ color: '#4f6d86', transparent: true, opacity: 0.55 }))
      frame.position.set(W / 2, H / 2, L / 2)
      scene.add(frame)

      // Số đo
      const fmt = v => `${Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} m`
      const labelScale = Math.max(0.22, Math.max(W, L) * 0.05)
      const lw = makeLabel(THREE, fmt(W), { scale: labelScale }); lw.position.set(W / 2, 0.05, L + labelScale * 1.6)
      const ll = makeLabel(THREE, fmt(L), { scale: labelScale }); ll.position.set(W + labelScale * 2.2, 0.05, L / 2)
      const lh = makeLabel(THREE, fmt(H), { scale: labelScale }); lh.position.set(W + labelScale * 1.6, H / 2, L)
      scene.add(lw, ll, lh)

      const itemGroup = new THREE.Group()
      const zoneGroup = new THREE.Group()
      scene.add(itemGroup, zoneGroup)

      const target = new THREE.Vector3(W / 2, H * 0.32, L / 2)
      const baseRadius = Math.max(W, L, H * 1.3) * 2.3 + 1
      const orbit = { theta: Math.PI / 4, phi: 0.95, radius: baseRadius, min: baseRadius * 0.35, max: baseRadius * 2.2 }
      const placeCamera = () => {
        camera.position.set(
          target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
          target.y + orbit.radius * Math.cos(orbit.phi),
          target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
        )
        camera.lookAt(target)
      }
      placeCamera()

      let frameId = 0
      const loop = () => {
        renderer.render(scene, camera)
        frameId = requestAnimationFrame(loop)
      }
      loop()

      const resize = () => {
        const w = host.clientWidth || 600
        const h = host.clientHeight || height
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
      observer?.observe(host)

      ctx.current = { THREE, renderer, scene, camera, itemGroup, zoneGroup, orbit, placeCamera, floorPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), raycaster: new THREE.Raycaster(), frameId: () => frameId, observer }
      setReady(true)
    }).catch(err => !disposed && setError(err.message))

    return () => {
      disposed = true
      const c = ctx.current
      if (c) {
        cancelAnimationFrame(c.frameId())
        c.observer?.disconnect()
        c.scene.traverse(obj => {
          obj.geometry?.dispose?.()
          const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
          mats.forEach(m => { m.map?.dispose?.(); m.dispose?.() })
        })
        c.renderer.dispose()
        c.renderer.domElement.remove()
      }
      ctx.current = null
      setReady(false)
    }
  }, [geo.width, geo.length, geo.height, color])

  // Lối đi chừa lại: vạch vàng trên sàn.
  const zonesKey = zones.map(z => `${z.x},${z.z},${z.w},${z.d}`).join('|')
  useEffect(() => {
    const c = ctx.current
    if (!ready || !c) return
    const { THREE, zoneGroup } = c
    while (zoneGroup.children.length) {
      const child = zoneGroup.children.pop()
      child.geometry?.dispose?.(); child.material?.map?.dispose?.(); child.material?.dispose?.()
    }
    zones.forEach(z => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), new THREE.MeshBasicMaterial({ color: '#ffd54f', transparent: true, opacity: 0.38, depthWrite: false }))
      plane.rotation.x = -Math.PI / 2
      plane.position.set(z.x + z.w / 2, 0.006, z.z + z.d / 2)
      plane.raycast = () => {}
      zoneGroup.add(plane)
      const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(z.w, z.d)), new THREE.LineBasicMaterial({ color: '#f9a825' }))
      border.rotation.x = -Math.PI / 2
      border.position.copy(plane.position)
      border.raycast = () => {}
      zoneGroup.add(border)
      const label = makeLabel(THREE, 'Lối đi', { bg: '#f9a825', fg: '#3e2700', scale: Math.max(0.2, Math.min(z.w, z.d) * 0.3) })
      label.position.set(z.x + z.w / 2, 0.08, z.z + z.d / 2)
      label.raycast = () => {}
      zoneGroup.add(label)
    })
  }, [ready, zonesKey])

  // Vẽ lại các món khi danh sách / lựa chọn thay đổi.
  useEffect(() => {
    const c = ctx.current
    if (!ready || !c) return
    const { THREE, itemGroup } = c
    while (itemGroup.children.length) {
      const child = itemGroup.children.pop()
      child.traverse(obj => { obj.geometry?.dispose?.(); obj.material?.dispose?.() })
    }
    items.forEach(item => {
      const g = buildItem(THREE, item)
      if (item.id === selectedId) {
        g.userData.material.emissive = new THREE.Color('#1e88e5')
        g.userData.material.emissiveIntensity = 0.35
        g.userData.edges.material.color.set('#0d47a1')
        g.userData.edges.material.opacity = 1
      }
      itemGroup.add(g)
    })
  }, [ready, items, selectedId])

  // Chuột / cảm ứng: xoay, phóng to, chọn & kéo món.
  useEffect(() => {
    const c = ctx.current
    if (!ready || !c) return undefined
    const el = c.renderer.domElement
    const { THREE, camera, raycaster, floorPlane, orbit, placeCamera, itemGroup } = c
    const pointer = new THREE.Vector2()
    let action = null

    const setPointer = event => {
      const rect = el.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      return rect
    }
    const pickItem = () => {
      const hit = raycaster.intersectObjects(itemGroup.children, true)[0]
      return hit ? hit.object.userData.itemId : null
    }
    const floorPoint = () => {
      const p = new THREE.Vector3()
      return raycaster.ray.intersectPlane(floorPlane, p) ? p : null
    }

    const onDown = event => {
      setPointer(event)
      const { mode: m } = propsRef.current
      const id = pickItem()
      if (m === 'pack' && id != null) {
        const item = itemsRef.current.find(it => it.id === id)
        const p = floorPoint()
        propsRef.current.onSelect?.(id)
        if (item && p) {
          action = { type: 'drag', id, dx: item.x - p.x, dz: item.z - p.z, start: { x: item.x, y: item.y, z: item.z }, last: null }
          el.setPointerCapture?.(event.pointerId)
          return
        }
      }
      if (m === 'pack' && id == null) propsRef.current.onSelect?.(null)
      action = { type: 'orbit', x: event.clientX, y: event.clientY, theta: orbit.theta, phi: orbit.phi }
      el.setPointerCapture?.(event.pointerId)
    }

    const onMoveEvt = event => {
      const rect = setPointer(event)
      if (!action) {
        const id = pickItem()
        const item = id != null ? itemsRef.current.find(it => it.id === id) : null
        setHover(item ? { name: item.name, size: sizeText(item), x: event.clientX - rect.left, y: event.clientY - rect.top } : null)
        el.style.cursor = item ? (propsRef.current.mode === 'pack' ? 'grab' : 'help') : 'grab'
        return
      }
      if (action.type === 'orbit') {
        orbit.theta = clamp(action.theta - (event.clientX - action.x) * 0.008, -0.25, Math.PI / 2 + 0.25)
        orbit.phi = clamp(action.phi - (event.clientY - action.y) * 0.006, 0.2, 1.4)
        placeCamera()
        return
      }
      // Kéo món: bám theo sàn, tự rơi lên món bên dưới.
      const p = floorPoint()
      if (!p) return
      const item = itemsRef.current.find(it => it.id === action.id)
      if (!item) return
      // Bám lưới 5 cm, rồi "hít" vào mép vách / mép thùng khác trong 12 cm để xếp khít.
      const all = [...itemsRef.current, ...zonesRef.current]
      const snapped = magnetSnap(all, room, snap(p.x + action.dx), snap(p.z + action.dz), item.w, item.d, item.id)
      const x = clamp(snapped.x, 0, Math.max(0, room.w - item.w))
      const z = clamp(snapped.z, 0, Math.max(0, room.l - item.d))
      const spot = placeAt([...itemsRef.current, ...zonesRef.current], room, x, z, item.w, item.h, item.d, item.id, { floorOnly: Boolean(item.floorOnly) })
      const group = itemGroup.children.find(g => g.userData.itemId === item.id)
      if (group) {
        const y = spot ? spot.y : Math.min(room.h, item.y)
        group.position.set(x + item.w / 2, y + item.h / 2, z + item.d / 2)
        group.userData.material.color.set(spot ? item.color : '#e53935')
      }
      action.last = spot ? { x, y: spot.y, z } : null
      el.style.cursor = 'grabbing'
    }

    const onUp = event => {
      el.releasePointerCapture?.(event.pointerId)
      if (action?.type === 'drag') {
        const item = itemsRef.current.find(it => it.id === action.id)
        if (action.last) propsRef.current.onMove?.(action.id, action.last)
        else if (item) {
          // Vị trí không hợp lệ: trả về chỗ cũ.
          const group = itemGroup.children.find(g => g.userData.itemId === item.id)
          if (group) {
            group.position.set(item.x + item.w / 2, item.y + item.h / 2, item.z + item.d / 2)
            group.userData.material.color.set(item.color)
          }
        }
      }
      action = null
    }

    const onWheel = event => {
      event.preventDefault()
      orbit.radius = clamp(orbit.radius * (event.deltaY < 0 ? 0.9 : 1.1), orbit.min, orbit.max)
      placeCamera()
    }
    const onLeave = () => setHover(null)

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMoveEvt)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMoveEvt)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('wheel', onWheel)
    }
  }, [ready, room.w, room.l, room.h])

  const zoom = factor => {
    const c = ctx.current
    if (!c) return
    c.orbit.radius = clamp(c.orbit.radius * factor, c.orbit.min, c.orbit.max)
    c.placeCamera()
  }
  const rotate = delta => {
    const c = ctx.current
    if (!c) return
    c.orbit.theta = clamp(c.orbit.theta + delta, -0.25, Math.PI / 2 + 0.25)
    c.placeCamera()
  }
  const resetView = () => {
    const c = ctx.current
    if (!c) return
    Object.assign(c.orbit, { theta: Math.PI / 4, phi: 0.95, radius: (c.orbit.min / 0.35) })
    c.placeCamera()
  }
  const topView = () => {
    const c = ctx.current
    if (!c) return
    Object.assign(c.orbit, { theta: Math.PI / 4, phi: 0.2 })
    c.placeCamera()
  }

  return (
    <div className="t3d-wrap" style={{ height }}>
      <div ref={boxRef} className="t3d-canvas" role="img" aria-label={`Mô hình 3D kho rộng ${geo.width} m, dài ${geo.length} m, cao ${geo.height} m`} />
      {!ready && !error && <div className="t3d-overlay">Đang tải mô hình 3D...</div>}
      {error && <div className="t3d-overlay error">{error}<small>Bạn vẫn xem được chế độ “Kho trống”.</small></div>}
      {ready && hover && <div className="t3d-hover" style={{ left: hover.x, top: hover.y }}><strong>{hover.name}</strong><small>{hover.size}</small></div>}
      {ready && (
        <div className="t3d-controls" role="group" aria-label="Điều khiển góc nhìn">
          <button type="button" onClick={() => rotate(-0.35)} aria-label="Xoay trái">⟲</button>
          <button type="button" onClick={() => rotate(0.35)} aria-label="Xoay phải">⟳</button>
          <button type="button" onClick={() => zoom(0.85)} aria-label="Phóng to">+</button>
          <button type="button" onClick={() => zoom(1.18)} aria-label="Thu nhỏ">−</button>
          <button type="button" onClick={topView}>Nhìn từ trên</button>
          <button type="button" onClick={resetView}>Đặt lại</button>
        </div>
      )}
    </div>
  )
}
