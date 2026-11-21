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
import type { CityView, Direction, EngineSnapshot } from './types'

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
    this.renderer.domElement.setAttribute('aria-label', '可旋转缩放的中国风微缩城市，包含美食街、红砖小区、玻璃写字楼、医院与学校')
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
    // 城市当前为静态几何，移动预览相机不需要重画光源阴影。
    this.sunlight.shadow.autoUpdate = false
    this.sunlight.shadow.needsUpdate = true
    this.scene.add(this.sunlight)
    this.world = buildWorld(CITY_LAYOUT)
    this.scene.add(this.world.root)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.screenSpacePanning = false
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = Math.PI / 2.25
    this.controls.minZoom = 0.7
    this.controls.maxZoom = 14
    this.controls.maxTargetRadius = CITY_LAYOUT.size * 0.8
    this.setCityView('overview')

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  setCityView(view: CityView) {
    this.controls.enableDamping = false
    this.controls.update()
    if (view === 'overview') {
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
    const offset = aspect > 1.1 ? halfWidth * 0.12 : 0
    this.camera.left = -halfWidth - offset
    this.camera.right = halfWidth - offset
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    this.camera.updateProjectionMatrix()
  }

  private readonly tick = (time: number) => {
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.05)
    this.previousTime = time
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
