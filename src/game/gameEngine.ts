import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CITY_LAYOUT } from './cityLayout'
import { buildWorld } from './worldBuilder'
import { buildRiderVehicle, RIDER_WHEEL_RADIUS } from './riderVehicle'
import type { CityView, Direction, EngineSnapshot, RiderPreviewMode } from './types'

const DISTRICT_FOCUS = {
  'food-street': 'shaxian-snacks',
  'old-neighborhood': 'sunshine-estate',
  cbd: 'starlight-tower',
  'civic-center': 'south-community-hospital',
} as const
const VIEW_ANGLE: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }

export class GameEngine {
  private readonly container: HTMLElement
  private readonly onSnapshot: (snapshot: EngineSnapshot) => void
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-300, 300, 300, -300, 0.1, 2400)
  private readonly renderer: WebGLRenderer
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver
  private readonly sunlight = new DirectionalLight('#fff0ce', 2.7)
  private readonly world: ReturnType<typeof buildWorld>
  private readonly rider: ReturnType<typeof buildRiderVehicle>
  private riderPreview: RiderPreviewMode = 'parked'
  private previewTime = 0
  private wheelAngle = 0
  private frameId: number | null = null
  private previousTime = 0
  private lastSnapshotTime = 0
  private sampleStartedAt = 0
  private sampleFrames = 0
  private fps = 0
  private viewportWidth = 1
  private viewportHeight = 1

  constructor(container: HTMLElement, onSnapshot: (snapshot: EngineSnapshot) => void) {
    this.container = container
    this.onSnapshot = onSnapshot
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.domElement.setAttribute('role', 'img')
    this.renderer.domElement.setAttribute('aria-label', '可旋转缩放的中国微缩城市与外卖骑手，黄色头盔、反光服、电动车及极速达保温箱')
    this.container.append(this.renderer.domElement)

    this.scene.background = new Color('#dce7d5')
    this.scene.fog = new Fog('#dce7d5', 850, 1500)
    this.scene.add(new HemisphereLight('#fff7e6', '#859a80', 1.8))
    this.sunlight.position.set(-240, 410, 220)
    this.sunlight.castShadow = true
    this.sunlight.shadow.mapSize.set(2048, 2048)
    this.sunlight.shadow.camera.left = -290
    this.sunlight.shadow.camera.right = 290
    this.sunlight.shadow.camera.top = 290
    this.sunlight.shadow.camera.bottom = -290
    this.sunlight.shadow.camera.near = 30
    this.sunlight.shadow.camera.far = 950
    this.sunlight.shadow.normalBias = 0.06
    this.sunlight.shadow.bias = -0.0001
    // 驻车时缓存阴影，模型动作演示时才逐帧刷新。
    this.sunlight.shadow.autoUpdate = false
    this.sunlight.shadow.needsUpdate = true
    this.scene.add(this.sunlight, this.sunlight.target)
    this.world = buildWorld(CITY_LAYOUT)
    this.scene.add(this.world.root)
    this.rider = buildRiderVehicle()
    this.rider.root.position.set(CITY_LAYOUT.spawn.position.x, 0, CITY_LAYOUT.spawn.position.z)
    this.rider.root.rotation.y = VIEW_ANGLE[CITY_LAYOUT.spawn.facing]
    this.scene.add(this.rider.root)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.screenSpacePanning = false
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = Math.PI / 2.25
    this.controls.minZoom = 0.7
    this.controls.maxZoom = 180
    this.controls.maxTargetRadius = CITY_LAYOUT.size * 0.8
    this.setCityView('rider-rear')

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  setCityView(view: CityView) {
    this.controls.enableDamping = false
    this.controls.update()
    const riderView = view === 'rider-rear' || view === 'rider-side'
    const shadowExtent = riderView ? 7 : 290
    this.sunlight.target.position.copy(riderView ? this.rider.root.position : this.scene.position)
    this.sunlight.position.copy(this.sunlight.target.position).add({ x: -240, y: 410, z: 220 })
    this.sunlight.shadow.camera.left = -shadowExtent
    this.sunlight.shadow.camera.right = shadowExtent
    this.sunlight.shadow.camera.top = shadowExtent
    this.sunlight.shadow.camera.bottom = -shadowExtent
    this.sunlight.shadow.normalBias = riderView ? 0.005 : 0.06
    this.sunlight.shadow.bias = riderView ? -0.000005 : -0.0001
    this.sunlight.shadow.camera.updateProjectionMatrix()
    this.sunlight.shadow.needsUpdate = true
    if (riderView) {
      const { x, z } = this.rider.root.position
      const angle = this.rider.root.rotation.y
      const side = view === 'rider-rear' ? 4 : 6
      const back = view === 'rider-rear' ? -6 : 1
      this.controls.target.set(x, 1.1, z)
      this.camera.position.set(x + Math.cos(angle) * side + Math.sin(angle) * back, 4.2, z - Math.sin(angle) * side + Math.cos(angle) * back)
      this.camera.zoom = 110
    } else if (view === 'overview') {
      this.controls.target.set(0, 0, 0)
      this.camera.position.set(340, 330, 420)
      this.camera.zoom = 1
    } else {
      const landmark = CITY_LAYOUT.landmarks.find((entry) => entry.id === DISTRICT_FOCUS[view])!
      const building = CITY_LAYOUT.buildings.find((entry) => entry.id === landmark.buildingId)!
      const x = (building.bounds.minX + building.bounds.maxX) / 2
      const z = (building.bounds.minZ + building.bounds.maxZ) / 2
      const angle = VIEW_ANGLE[landmark.access.side]
      this.controls.target.set(x, 4, z)
      this.camera.position.set(x + Math.sin(angle) * 160 + Math.cos(angle) * 110, 134, z + Math.cos(angle) * 160 - Math.sin(angle) * 110)
      this.camera.zoom = 5.8
    }
    this.camera.updateProjectionMatrix()
    this.controls.update()
    this.controls.enableDamping = true
  }

  setRiderPreviewMode(mode: RiderPreviewMode) {
    this.riderPreview = mode
    this.previewTime = 0
    this.rider.update({ wheelAngle: this.wheelAngle, steeringAngle: 0, leanAngle: 0, braking: mode === 'braking' })
    this.sunlight.shadow.needsUpdate = true
  }

  start() {
    if (this.frameId !== null) return
    this.previousTime = performance.now()
    this.sampleStartedAt = this.previousTime
    this.sampleFrames = 0
    this.lastSnapshotTime = this.previousTime - 100
    this.frameId = requestAnimationFrame(this.tick)
  }

  dispose() {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId)
      this.frameId = null
    }
    this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.resize)
    this.controls.dispose()
    this.rider.dispose()
    this.world.dispose()
    this.sunlight.shadow.dispose()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }

  private readonly resize = () => {
    this.viewportWidth = Math.max(this.container.clientWidth, 1)
    this.viewportHeight = Math.max(this.container.clientHeight, 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    const aspect = this.viewportWidth / this.viewportHeight
    const halfHeight = 295 / Math.min(aspect, 1)
    const halfWidth = halfHeight * aspect
    this.camera.left = -halfWidth
    this.camera.right = halfWidth
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    const offsetX = aspect > 1.1 ? -this.viewportWidth * 0.06 : 0
    const offsetY = aspect < 1 && this.viewportHeight <= 640 ? -this.viewportHeight * 0.08 : 0
    this.camera.setViewOffset(this.viewportWidth, this.viewportHeight, offsetX, offsetY, this.viewportWidth, this.viewportHeight)
  }

  private readonly tick = (time: number) => {
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.05)
    this.previousTime = time
    if (this.riderPreview === 'motion') {
      this.previewTime += deltaSeconds
      this.wheelAngle = (this.wheelAngle + deltaSeconds * 3.2 / RIDER_WHEEL_RADIUS) % (Math.PI * 2)
      const turn = Math.sin(this.previewTime * 1.3)
      this.rider.update({ wheelAngle: this.wheelAngle, steeringAngle: turn * 0.16, leanAngle: -turn * 0.2, braking: false })
      this.sunlight.shadow.needsUpdate = true
    }
    this.controls.update(deltaSeconds)
    this.renderer.render(this.scene, this.camera)
    this.sampleFrames += 1
    const sampleDuration = time - this.sampleStartedAt
    if (sampleDuration >= 500) {
      this.fps = Math.round(this.sampleFrames * 1000 / sampleDuration)
      this.sampleFrames = 0
      this.sampleStartedAt = time
    }
    if (time - this.lastSnapshotTime >= 100) {
      this.onSnapshot({
        fps: this.fps,
        drawCalls: this.renderer.info.render.calls,
        triangleCount: this.renderer.info.render.triangles,
        instanceCount: this.world.instanceCount,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        pixelRatio: this.renderer.getPixelRatio(),
      })
      this.lastSnapshotTime = time
    }
    this.frameId = requestAnimationFrame(this.tick)
  }
}
