import { useLayoutEffect, useRef } from 'react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { GameEngine } from '../game/gameEngine'
import { NAVIGATION_COLORS } from '../game/navigationSystem'
import type { Aabb2, NavigationFrameListener, NavigationSnapshot, NavigationTarget, Point2 } from '../game/types'
import './MiniMap.css'

interface MapView {
  width: number
  height: number
  scale: number
  offsetX: number
  offsetY: number
  markerScale: number
}

interface MapFrame extends Point2 {
  heading: number
  navigation: NavigationSnapshot
}

const INK = '#101c18'
const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1)

function createView(width: number, height: number): MapView {
  const { minX, maxX, minZ, maxZ } = CITY_LAYOUT.bounds
  const shortest = Math.min(width, height)
  const padding = Math.min(18, shortest * 0.1)
  const scale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxZ - minZ))
  return {
    width, height, scale,
    offsetX: (width - (maxX - minX) * scale) / 2 - minX * scale,
    offsetY: (height - (maxZ - minZ) * scale) / 2 - minZ * scale,
    markerScale: Math.min(1, Math.max(0.65, shortest / 220)),
  }
}

function project(point: Point2, view: MapView) {
  return { x: view.offsetX + point.x * view.scale, y: view.offsetY + point.z * view.scale }
}

function boundsPath(context: CanvasRenderingContext2D, bounds: Aabb2, view: MapView) {
  context.beginPath()
  context.rect(
    view.offsetX + bounds.minX * view.scale,
    view.offsetY + bounds.minZ * view.scale,
    (bounds.maxX - bounds.minX) * view.scale,
    (bounds.maxZ - bounds.minZ) * view.scale,
  )
}

function drawLayout(context: CanvasRenderingContext2D, view: MapView) {
  context.fillStyle = INK
  context.fillRect(0, 0, view.width, view.height)
  context.fillStyle = '#293c32'
  boundsPath(context, CITY_LAYOUT.bounds, view)
  context.fill()

  context.fillStyle = '#354c40'
  for (const block of CITY_LAYOUT.blocks) {
    boundsPath(context, block.bounds, view)
    context.fill()
  }
  context.fillStyle = '#62745e'
  for (const sidewalk of CITY_LAYOUT.sidewalks) {
    boundsPath(context, sidewalk.bounds, view)
    context.fill()
  }
  context.fillStyle = '#adbba5'
  for (const road of CITY_LAYOUT.roads) {
    boundsPath(context, road.bounds, view)
    context.fill()
  }
  context.fillStyle = '#526c59'
  context.strokeStyle = '#789076'
  context.lineWidth = 0.6
  for (const building of CITY_LAYOUT.buildings) {
    boundsPath(context, building.bounds, view)
    context.fill()
    context.stroke()
  }
  context.strokeStyle = '#819379'
  context.lineWidth = 1
  boundsPath(context, CITY_LAYOUT.bounds, view)
  context.stroke()

  context.fillStyle = '#f1f4dd'
  context.font = '700 10px "Segoe UI", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillText('N', 12, 7)
  context.beginPath()
  context.moveTo(12, 20)
  context.lineTo(8.5, 26)
  context.lineTo(15.5, 26)
  context.closePath()
  context.fill()
}

function drawTarget(context: CanvasRenderingContext2D, target: NavigationTarget, view: MapView, selected: boolean) {
  const point = project(target.position, view)
  const color = NAVIGATION_COLORS[target.kind]
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
    // Only replace the stale first sample; every subsequent vertex is the engine's road route.
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

  // Draw last: +Z is down, so a negative canvas rotation makes heading PI/2 point east.
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

export function MiniMap({ engine }: { engine: GameEngine | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!container || !canvas || !context) return

    // A detached canvas caches city geometry; engine frames only paint navigation on top.
    const cache = document.createElement('canvas')
    const cacheContext = cache.getContext('2d')
    if (!cacheContext) return
    let active = true
    let view: MapView | null = null
    let frame: MapFrame | null = null
    let width = -1
    let height = -1
    let ratio = 0

    const draw = () => {
      if (!active || !view) return
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.drawImage(cache, 0, 0)
      context.save()
      context.setTransform(canvas.width / view.width, 0, 0, canvas.height / view.height, 0, 0)
      if (frame) drawFrame(context, view, frame)
      context.restore()
    }

    const resize = () => {
      if (!active) return
      const bounds = container.getBoundingClientRect()
      const nextRatio = pixelRatio()
      if (width === bounds.width && height === bounds.height && ratio === nextRatio) return
      width = bounds.width
      height = bounds.height
      ratio = nextRatio
      canvas.width = cache.width = Math.max(1, Math.round(width * ratio))
      canvas.height = cache.height = Math.max(1, Math.round(height * ratio))
      view = width > 0 && height > 0 ? createView(width, height) : null
      if (!view) return
      cacheContext.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
      drawLayout(cacheContext, view)
      draw()
    }

    const onNavigationFrame: NavigationFrameListener = (rider, navigation) => {
      if (!active) return
      // Copy pose primitives in case the engine reuses its mutable rider object.
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
      view = null
      cache.width = cache.height = 0
      canvas.width = canvas.height = 0
    }
  }, [engine])

  return (
    <div className="mini-map" ref={containerRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="北向上全城导航小地图，范围360米见方。白色三角为骑手，橙色方形为取餐，绿色圆形为送达，蓝色菱形为换电；光环标记选中目标，虚线显示道路导航路线。"
      >
        北向上全城导航地图：取餐方形、送达圆形、换电菱形，白色三角表示骑手方向。
      </canvas>
    </div>
  )
}
