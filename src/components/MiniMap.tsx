import { useLayoutEffect, useRef } from 'react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { GameEngine } from '../game/gameEngine'
import { NAVIGATION_COLORS } from '../game/navigationSystem'
import type { Aabb2, BuildingKind, NavigationFrameListener, NavigationSnapshot, NavigationTarget, Point2 } from '../game/types'
import './MiniMap.css'

export type MiniMapMode = 'local' | 'full'

interface MapView {
  width: number
  height: number
  scale: number
  offsetX: number
  offsetY: number
  markerScale: number
  worldSpan: number
}

interface MapFrame extends Point2 {
  heading: number
  navigation: NavigationSnapshot
}

const INK = '#101c18'
const LOCAL_RADAR_SPAN = 360
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1)

const BUILDING_TINTS: Partial<Record<BuildingKind, string>> = {
  luxury: '#86754e',
  mall: '#7b5e4d',
  office: '#4a6e77',
  tech: '#506f80',
  hospital: '#7e5552',
  school: '#6f774f',
  campus: '#597458',
}

function createView(width: number, height: number, mode: MiniMapMode, center: Point2): MapView {
  const { minX, maxX, minZ, maxZ } = CITY_LAYOUT.bounds
  const cityWidth = maxX - minX
  const cityDepth = maxZ - minZ
  const shortest = Math.min(width, height)
  const padding = mode === 'full' ? Math.min(16, shortest * 0.08) : 6
  const span = mode === 'full' ? Math.max(cityWidth, cityDepth) : Math.min(LOCAL_RADAR_SPAN, cityWidth)
  const scale = Math.min((width - padding * 2) / span, (height - padding * 2) / span)

  let focusX = (minX + maxX) / 2
  let focusZ = (minZ + maxZ) / 2
  if (mode === 'local') {
    const halfVisibleX = (width / scale) / 2
    const halfVisibleZ = (height / scale) / 2
    const clampMinX = minX + Math.min(cityWidth / 2, halfVisibleX - 10)
    const clampMaxX = maxX - Math.min(cityWidth / 2, halfVisibleX - 10)
    const clampMinZ = minZ + Math.min(cityDepth / 2, halfVisibleZ - 10)
    const clampMaxZ = maxZ - Math.min(cityDepth / 2, halfVisibleZ - 10)
    focusX = clampMinX <= clampMaxX ? Math.max(clampMinX, Math.min(clampMaxX, center.x)) : focusX
    focusZ = clampMinZ <= clampMaxZ ? Math.max(clampMinZ, Math.min(clampMaxZ, center.z)) : focusZ
  }

  return {
    width,
    height,
    scale,
    offsetX: width / 2 - focusX * scale,
    offsetY: height / 2 - focusZ * scale,
    markerScale: Math.min(1, Math.max(0.62, shortest / 225)) * (mode === 'full' ? 0.85 : 1),
    worldSpan: span,
  }
}

function project(point: Point2, view: MapView) {
  return { x: view.offsetX + point.x * view.scale, y: view.offsetY + point.z * view.scale }
}

function drawStaticCity(context: CanvasRenderingContext2D, sizePx: number) {
  const { minX, maxX, minZ, maxZ } = CITY_LAYOUT.bounds
  const cityW = maxX - minX
  const cityD = maxZ - minZ
  const scaleX = sizePx / cityW
  const scaleZ = sizePx / cityD
  const rect = (b: Aabb2) => {
    context.beginPath()
    context.rect((b.minX - minX) * scaleX, (b.minZ - minZ) * scaleZ, (b.maxX - b.minX) * scaleX, (b.maxZ - b.minZ) * scaleZ)
  }

  context.fillStyle = '#293c32'
  context.fillRect(0, 0, sizePx, sizePx)

  context.fillStyle = '#354c40'
  for (const block of CITY_LAYOUT.blocks) {
    rect(block.bounds)
    context.fill()
  }
  context.fillStyle = '#62745e'
  for (const sidewalk of CITY_LAYOUT.sidewalks) {
    rect(sidewalk.bounds)
    context.fill()
  }
  context.fillStyle = '#adbba5'
  for (const road of CITY_LAYOUT.roads) {
    rect(road.bounds)
    context.fill()
  }
  context.strokeStyle = '#789076'
  context.lineWidth = 0.8
  for (const building of CITY_LAYOUT.buildings) {
    context.fillStyle = BUILDING_TINTS[building.kind] ?? '#526c59'
    rect(building.bounds)
    context.fill()
    context.stroke()
  }
  context.strokeStyle = '#8fa385'
  context.lineWidth = 2
  context.strokeRect(1, 1, sizePx - 2, sizePx - 2)
}

function drawNorthBadge(context: CanvasRenderingContext2D) {
  context.save()
  context.fillStyle = 'rgba(16, 28, 24, 0.72)'
  context.beginPath()
  context.roundRect(4, 4, 18, 26, 4)
  context.fill()
  context.fillStyle = '#f1f4dd'
  context.font = '700 10px "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillText('N', 13, 6)
  context.beginPath()
  context.moveTo(13, 19)
  context.lineTo(9.5, 25)
  context.lineTo(16.5, 25)
  context.closePath()
  context.fill()
  context.restore()
}

function drawTarget(context: CanvasRenderingContext2D, target: NavigationTarget, view: MapView, selected: boolean) {
  const point = project(target.position, view)
  const color = NAVIGATION_COLORS[target.kind]
  const margin = 12
  const offScreen = point.x < margin || point.x > view.width - margin || point.y < margin || point.y > view.height - margin

  if (offScreen) {
    if (!selected) return
    // 局部跟随模式下，目标在视野外时在雷达边缘画清晰方向指示箭头。
    const cx = view.width / 2
    const cy = view.height / 2
    const dx = point.x - cx
    const dy = point.y - cy
    const angle = Math.atan2(dy, dx)
    const maxW = view.width / 2 - 12
    const maxH = view.height / 2 - 12
    const t = Math.min(
      Math.abs(dx) > 0.001 ? maxW / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.001 ? maxH / Math.abs(dy) : Infinity,
    )
    const ex = cx + dx * t
    const ey = cy + dy * t
    context.save()
    context.translate(ex, ey)
    context.rotate(angle)
    context.beginPath()
    context.moveTo(7, 0)
    context.lineTo(-5, -5)
    context.lineTo(-2.5, 0)
    context.lineTo(-5, 5)
    context.closePath()
    context.fillStyle = color
    context.strokeStyle = INK
    context.lineWidth = 2
    context.fill()
    context.stroke()
    context.restore()
    return
  }

  context.save()
  context.translate(point.x, point.y)
  context.scale(view.markerScale, view.markerScale)
  context.fillStyle = color
  if (selected) {
    context.beginPath()
    context.arc(0, 0, 10.5, 0, Math.PI * 2)
    context.globalAlpha = 0.22
    context.fill()
    context.globalAlpha = 1
    context.strokeStyle = color
    context.lineWidth = 1.5
    context.stroke()
  }

  context.beginPath()
  if (target.kind === 'pickup') {
    context.rect(-5.5, -5.5, 11, 11)
  } else if (target.kind === 'delivery') {
    context.arc(0, 0, 6, 0, Math.PI * 2)
  } else {
    context.moveTo(0, -7)
    context.lineTo(6.5, 0)
    context.lineTo(0, 7)
    context.lineTo(-6.5, 0)
    context.closePath()
  }
  context.strokeStyle = INK
  context.lineWidth = 2
  context.lineJoin = 'round'
  context.fill()
  context.stroke()

  context.beginPath()
  context.lineWidth = 1.4
  context.lineCap = 'round'
  if (target.kind === 'pickup') {
    context.arc(0, -1, 2.3, Math.PI, 0)
    context.stroke()
  } else if (target.kind === 'delivery') {
    context.moveTo(-3, 0)
    context.lineTo(0, -3)
    context.lineTo(3, 0)
    context.moveTo(-2, -1)
    context.lineTo(-2, 3)
    context.lineTo(2, 3)
    context.lineTo(2, -1)
    context.stroke()
  } else {
    context.moveTo(1, -4)
    context.lineTo(-2.5, 0.5)
    context.lineTo(0, 0.5)
    context.lineTo(-1, 4)
    context.lineTo(3, -0.8)
    context.lineTo(0.5, -0.8)
    context.closePath()
    context.fillStyle = INK
    context.fill()
  }
  context.restore()
}

function drawFrame(context: CanvasRenderingContext2D, view: MapView, frame: MapFrame) {
  const { navigation } = frame
  const selected = navigation.targets.find((target) => target.id === navigation.targetId)
  const rider = project(frame, view)
  if (selected && navigation.route.length > 1) {
    context.save()
    context.beginPath()
    context.moveTo(rider.x, rider.y)
    for (let index = 1; index < navigation.route.length; index += 1) {
      const point = project(navigation.route[index], view)
      context.lineTo(point.x, point.y)
    }
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = 5 * view.markerScale
    context.strokeStyle = INK
    context.stroke()
    context.lineWidth = 2.5 * view.markerScale
    context.strokeStyle = NAVIGATION_COLORS[selected.kind]
    context.setLineDash([5 * view.markerScale, 4 * view.markerScale])
    context.stroke()
    context.restore()
  }

  for (const target of navigation.targets) {
    if (target.id !== selected?.id) drawTarget(context, target, view, false)
  }
  if (selected) drawTarget(context, selected, view, true)

  // +Z 朝南（画布向下），负旋转使 PI/2 朝东（右）。
  context.save()
  context.translate(rider.x, rider.y)
  context.rotate(-frame.heading)
  context.scale(view.markerScale, view.markerScale)
  context.beginPath()
  context.moveTo(0, 9)
  context.lineTo(-5.5, -6)
  context.lineTo(5.5, -6)
  context.closePath()
  context.fillStyle = '#fffceb'
  context.strokeStyle = INK
  context.lineWidth = 2.5
  context.lineJoin = 'round'
  context.fill()
  context.stroke()
  context.restore()
}

export function MiniMap({ engine, mode = 'local' }: { engine: GameEngine | null; mode?: MiniMapMode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef<MiniMapMode>(mode)
  modeRef.current = mode

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!container || !canvas || !context) return

    // 预渲染高分辨率 8×8 静态城市底图，逐帧仅做平移/缩放贴图与路线绘制。
    const cityCache = document.createElement('canvas')
    const cachePx = 768
    cityCache.width = cachePx
    cityCache.height = cachePx
    const cacheContext = cityCache.getContext('2d')
    if (!cacheContext) return
    drawStaticCity(cacheContext, cachePx)

    let active = true
    let frame: MapFrame | null = null
    let width = -1
    let height = -1
    let ratio = 0

    const draw = () => {
      if (!active || width <= 0 || height <= 0) return
      const center = frame ?? CITY_LAYOUT.spawn.position
      const view = createView(width, height, modeRef.current, center)
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
      context.fillStyle = INK
      context.fillRect(0, 0, width, height)
      const { minX, maxX, minZ, maxZ } = CITY_LAYOUT.bounds
      const dx = view.offsetX + minX * view.scale
      const dy = view.offsetY + minZ * view.scale
      const dw = (maxX - minX) * view.scale
      const dh = (maxZ - minZ) * view.scale
      context.drawImage(cityCache, dx, dy, dw, dh)
      if (frame) drawFrame(context, view, frame)
      drawNorthBadge(context)
    }

    const resize = () => {
      if (!active) return
      const bounds = container.getBoundingClientRect()
      const nextRatio = pixelRatio()
      if (width === bounds.width && height === bounds.height && ratio === nextRatio) return
      width = bounds.width
      height = bounds.height
      ratio = nextRatio
      canvas.width = Math.max(1, Math.round(width * ratio))
      canvas.height = Math.max(1, Math.round(height * ratio))
      draw()
    }

    const onNavigationFrame: NavigationFrameListener = (rider, navigation) => {
      if (!active) return
      frame = { x: rider.x, z: rider.z, heading: rider.heading, navigation }
      if (ratio !== pixelRatio()) resize()
      else draw()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    window.addEventListener('resize', resize)
    resize()
    engine?.setNavigationFrameListener(onNavigationFrame)

    return () => {
      active = false
      engine?.setNavigationFrameListener(null)
      observer.disconnect()
      window.removeEventListener('resize', resize)
      frame = null
      cityCache.width = cityCache.height = 0
      canvas.width = canvas.height = 0
    }
  }, [engine, mode])

  return (
    <div className="mini-map" ref={containerRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`北向上导航小地图（${mode === 'local' ? '跟随局部雷达' : '全城 720 米 8×8 俯瞰'}）。白色三角为骑手，橙色方形为取餐，绿色圆形为送达，蓝色菱形为换电。`}
      >
        北向上导航地图：取餐方形、送达圆形、换电菱形，白色三角表示骑手方向。
      </canvas>
    </div>
  )
}
