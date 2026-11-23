import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
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
import { RiderController, RIDER_COLLISION_RADIUS } from './riderController'
import { FollowCamera } from './followCamera'
import { buildBrakeDust } from './brakeDust'
import { TrafficSystem } from './trafficSystem'
import { buildTrafficVisuals } from './trafficVisuals'
import { NavigationSystem } from './navigationSystem'
import { buildNavigationVisuals } from './navigationVisuals'
import { OrderManager } from './orderManager'
import { EventSystem, type EventResolution } from './eventSystem'
import { InteriorScene } from './interiorScene'
import { WeatherSystem } from './weatherSystem'
import { AudioEngine } from './audioEngine'
import type { CityLandmark, CityView, Direction, EngineSnapshot, GameMode, InteriorTheme, NavigationFrameListener, OrderReportReason, PauseReason, RideCameraMode, RiderPreviewMode } from './types'

const DISTRICT_FOCUS = {
  'food-street': 'shaxian-snacks',
  'night-market': 'starlight-mall-food',
  'old-neighborhood': 'sunshine-estate',
  'luxury-compound': 'yujing-manor',
  cbd: 'starlight-tower',
  'tech-park': 'zhigu-rd-park',
  'civic-center': 'south-community-hospital',
  'university-town': 'nancheng-university',
} as const
const VIEW_ANGLE: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }
export const SHIFT_DURATION_SECONDS = 210
const SHIFT_START_MINUTES = 11 * 60 + 30
const SHIFT_SPAN_MINUTES = 120
const DISTRACTION_SAFE_SPEED = 0.8
const DISTRACTION_FULL_SPEED = 9.0
const CAMERA_MODES: RideCameraMode[] = ['near', 'far', 'overhead']
const DRIVING_KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'])
// 自适应画质：仅在持续掉帧时逐级降低渲染倍率，避免核显/高 DPI 屏跌破可玩帧率。
const RENDER_SCALE_STEPS = [1, 0.85, 0.72] as const
const QUALITY_LOW_FPS = 48
const QUALITY_HIGH_FPS = 57
const QUALITY_LOW_SAMPLES = 2
const QUALITY_HIGH_SAMPLES = 8
const QUALITY_DOWNGRADE_COOLDOWN_MS = 2500
const QUALITY_UPGRADE_COOLDOWN_MS = 7000
const QUALITY_GRACE_SECONDS = 3

function formatShiftClock(elapsedSeconds: number): string {
  const ratio = Math.max(0, Math.min(1, elapsedSeconds / SHIFT_DURATION_SECONDS))
  const totalMinutes = SHIFT_START_MINUTES + Math.floor(ratio * SHIFT_SPAN_MINUTES)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export class GameEngine {
  private readonly container: HTMLElement
  private readonly onSnapshot: (snapshot: EngineSnapshot) => void
  private readonly scene = new Scene()
  private readonly previewCamera = new OrthographicCamera(-560, 560, 560, -560, 0.1, 3400)
  private readonly followCamera = new FollowCamera(CITY_LAYOUT.buildings)
  private readonly controller = new RiderController(CITY_LAYOUT)
  private readonly dust = buildBrakeDust()
  private readonly traffic = new TrafficSystem(CITY_LAYOUT, (event) => {
    if (event.type === 'red-light') {
      const { fineCents, messageText } = this.eventSystem.handleRedLightViolation()
      this.audio.playViolation()
      if (fineCents > 0) {
        this.orders.recordOperatingExpense(fineCents, 'payment', messageText, '交警提示')
      } else {
        this.orders.addSystemMessage('交警提示', 'system', messageText)
      }
      this.lastSnapshotTime = 0
    }
  })
  private readonly trafficVisuals: ReturnType<typeof buildTrafficVisuals>
  private readonly navigation = new NavigationSystem(CITY_LAYOUT, RIDER_COLLISION_RADIUS)
  private readonly orders = new OrderManager(CITY_LAYOUT)
  private readonly eventSystem = new EventSystem()
  private readonly interior = new InteriorScene()
  private readonly weather = new WeatherSystem()
  private readonly audio = new AudioEngine()
  private lastKnownOfferCount = 0
  private lastKnownCompletedCount = 0
  private lastKnownPickedUpCount = 0
  private readonly enterableLandmarks: readonly { landmark: CityLandmark; theme: InteriorTheme }[]
  private readonly navigationVisuals: ReturnType<typeof buildNavigationVisuals>
  private navigationFrameListener: NavigationFrameListener | null = null
  private navigationElapsed = 0
  private hornRemaining = 0
  private readonly keys = new Set<string>()
  private touchDrive = { throttle: false, brake: false, steer: 0, boost: false }
  private readonly renderer: WebGLRenderer
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver
  private readonly hemiLight = new HemisphereLight('#fff7e6', '#859a80', 1.8)
  private readonly sunlight = new DirectionalLight('#fff0ce', 2.7)
  private readonly world: ReturnType<typeof buildWorld>
  private readonly rider: ReturnType<typeof buildRiderVehicle>
  private view: CityView = 'ride'
  private cameraMode: RideCameraMode = 'near'
  private riderPreview: RiderPreviewMode = 'parked'
  private started = false
  private gameMode: GameMode = 'challenge'
  private titleElapsed = 0
  private muted = false
  private paused = false
  private pauseReason: PauseReason | null = null
  private phoneOpen = false
  private shiftElapsed = 0
  private shiftEnded = false
  private distractionLevel = 0
  private distractionActive = false
  private distractionPhaseTime = 0
  private distractedElapsedSec = 0
  private distractionWarningCount = 0
  private batterySwapStationId: string | null = null
  private batterySwapElapsed = 0
  private readonly reducedMotionQuery: MediaQueryList | null
  private previewTime = 0
  private wheelAngle = 0
  private collisionDisplayTime = 0
  private shadowUpdateElapsed = 0
  private frameId: number | null = null
  private previousTime = 0
  private lastSnapshotTime = 0
  private sampleStartedAt = 0
  private sampleFrames = 0
  private fps = 0
  private renderScale = 1
  private contextLost = false
  private sessionStartedAt = 0
  private lowFpsStreak = 0
  private highFpsStreak = 0
  private lastQualityChangeAt = 0
  private instanceCount = 0
  private viewportWidth = 1
  private viewportHeight = 1

  constructor(container: HTMLElement, onSnapshot: (snapshot: EngineSnapshot) => void) {
    this.container = container
    this.onSnapshot = onSnapshot
    this.reducedMotionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.domElement.tabIndex = 0
    this.renderer.domElement.setAttribute('role', 'img')
    this.renderer.domElement.setAttribute('aria-label', '外卖骑手驾驶场景，WASD或方向键骑行，空格急刹，Shift冲刺，鼠标移动自由观察视角（左右270°），滚轮缩放，C切换视角，H鸣笛')
    this.container.append(this.renderer.domElement)

    this.scene.background = new Color('#dce7d5')
    this.scene.fog = new Fog('#dce7d5', 950, 2000)
    this.scene.add(this.hemiLight)
    this.sunlight.castShadow = true
    this.sunlight.shadow.mapSize.set(2048, 2048)
    this.sunlight.shadow.camera.near = 30
    this.sunlight.shadow.camera.far = 1500
    this.sunlight.shadow.autoUpdate = false
    this.scene.add(this.sunlight, this.sunlight.target)
    this.world = buildWorld(CITY_LAYOUT)
    this.scene.add(this.world.root)
    const buildingKinds = new Map(CITY_LAYOUT.buildings.map((building) => [building.id, building.kind]))
    this.enterableLandmarks = CITY_LAYOUT.landmarks
      .filter((landmark) => {
        const kind = buildingKinds.get(landmark.buildingId)
        return kind === 'office' || kind === 'tech' || kind === 'hospital'
      })
      .map((landmark) => ({
        landmark,
        theme: buildingKinds.get(landmark.buildingId) === 'hospital' ? 'hospital' as const : 'cbd' as const,
      }))
    this.rider = buildRiderVehicle()
    this.trafficVisuals = buildTrafficVisuals(CITY_LAYOUT, this.traffic.signals, this.traffic.vehicles)
    this.navigationVisuals = buildNavigationVisuals(this.navigation.targets)
    this.syncOrderNavigation()
    this.scene.add(this.rider.root, this.dust.root, this.trafficVisuals.root, this.navigationVisuals.root, this.weather.root)
    this.updateRider()
    this.instanceCount = this.countSceneInstances()
    this.sessionStartedAt = performance.now()

    this.controls = new OrbitControls(this.previewCamera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.screenSpacePanning = false
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = Math.PI / 2.25
    this.controls.minZoom = 0.7
    this.controls.maxZoom = 180
    this.controls.maxTargetRadius = CITY_LAYOUT.size * 0.8
    this.setCityView('ride')

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.resize)
    window.addEventListener('pointerdown', this.unlockAudio, { passive: true })
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clearInput)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.renderer.domElement.addEventListener('pointerdown', this.focusCanvas)
    this.renderer.domElement.addEventListener('pointermove', this.onCanvasPointerMove)
    this.renderer.domElement.addEventListener('wheel', this.onCanvasWheel, { passive: false })
    this.renderer.domElement.addEventListener('dblclick', this.onCanvasDoubleClick)
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored)
    this.resize()
    // 仅在 ?dev=1 时暴露引擎句柄，供本地自动化冒烟/数据核验使用；正常访问不注入任何全局对象。
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('dev')) {
      ;(window as unknown as { __RHR_DEV__?: GameEngine }).__RHR_DEV__ = this
    }
  }

  setCityView(view: CityView) {
    this.clearInput()
    if (view !== 'ride' && this.interior.mode !== 'none') this.interior.exit()
    this.view = view
    this.riderPreview = 'parked'
    this.previewTime = 0
    this.dust.clear()
    this.updateRider()
    const riderView = view === 'rider-rear' || view === 'rider-side'
    this.navigationVisuals.root.visible = !riderView
    this.navigationVisuals.update(0, this.controller.state, this.navigation.snapshot, view === 'ride')
    const shadowExtent = view === 'ride' ? 44 : riderView ? 7 : 560
    this.sunlight.target.position.copy(view === 'ride' || riderView ? this.rider.root.position : this.scene.position)
    this.sunlight.position.copy(this.sunlight.target.position).add(view === 'ride' || riderView ? { x: -240, y: 410, z: 220 } : { x: -420, y: 680, z: 380 })
    this.sunlight.shadow.camera.left = -shadowExtent
    this.sunlight.shadow.camera.right = shadowExtent
    this.sunlight.shadow.camera.top = shadowExtent
    this.sunlight.shadow.camera.bottom = -shadowExtent
    this.sunlight.shadow.normalBias = view === 'ride' || riderView ? 0.005 : 0.06
    this.sunlight.shadow.bias = view === 'ride' || riderView ? -0.000005 : -0.0001
    this.sunlight.shadow.camera.updateProjectionMatrix()
    this.sunlight.shadow.needsUpdate = true
    this.controls.enabled = view !== 'ride'
    if (view === 'ride') {
      this.followCamera.reset(this.controller.state, this.controller.state.heading)
      this.focusCanvas()
      return
    }

    this.controls.enableDamping = false
    this.controls.update()
    if (riderView) {
      const { x, y, z } = this.rider.root.position
      const angle = this.rider.root.rotation.y
      const side = view === 'rider-rear' ? 4 : 6
      const back = view === 'rider-rear' ? -6 : 1
      this.controls.target.set(x, y + 1.1, z)
      this.previewCamera.position.set(x + Math.cos(angle) * side + Math.sin(angle) * back, y + 4.2, z - Math.sin(angle) * side + Math.cos(angle) * back)
      this.previewCamera.zoom = 205
    } else if (view === 'overview') {
      this.controls.target.set(0, 0, 0)
      this.previewCamera.position.set(580, 560, 720)
      this.previewCamera.zoom = 1
    } else {
      const landmark = CITY_LAYOUT.landmarks.find((entry) => entry.id === DISTRICT_FOCUS[view])!
      const building = CITY_LAYOUT.buildings.find((entry) => entry.id === landmark.buildingId)!
      const x = (building.bounds.minX + building.bounds.maxX) / 2
      const z = (building.bounds.minZ + building.bounds.maxZ) / 2
      const angle = VIEW_ANGLE[landmark.access.side]
      this.controls.target.set(x, 4, z)
      this.previewCamera.position.set(x + Math.sin(angle) * 190 + Math.cos(angle) * 130, 156, z + Math.cos(angle) * 190 - Math.sin(angle) * 130)
      this.previewCamera.zoom = 9.2
    }
    this.previewCamera.updateProjectionMatrix()
    this.controls.update()
    this.controls.enableDamping = true
  }

  setRideCameraMode(mode: RideCameraMode) {
    this.cameraMode = mode
    this.followCamera.setMode(mode)
    if (this.view !== 'ride') this.setCityView('ride')
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  cycleRideCameraMode() {
    this.setRideCameraMode(CAMERA_MODES[(CAMERA_MODES.indexOf(this.cameraMode) + 1) % CAMERA_MODES.length])
  }

  setMuted(muted: boolean) {
    if (this.muted === muted) return
    this.muted = muted
    this.audio.setMuted(muted)
    this.lastSnapshotTime = 0
  }

  /** 比赛暂停：冻结班次时钟、车流、订单倒计时与持续音效，但保留 3D 画面渲染。 */
  setPaused(paused: boolean, reason: PauseReason = 'manual') {
    if (!this.started || this.shiftEnded || this.paused === paused) return
    if (!paused && this.contextLost) return
    if (paused) {
      if (this.interior.mode === 'photo' || this.eventSystem.hasActiveEvent) return
      this.clearInput()
      this.distractionActive = false
      this.distractionLevel = 0
      this.pauseReason = reason
      this.lowFpsStreak = 0
      this.highFpsStreak = 0
    } else {
      this.previousTime = performance.now()
      this.pauseReason = null
      this.audio.unlock()
      this.focusCanvas()
    }
    this.paused = paused
    this.lastSnapshotTime = 0
  }

  togglePause() {
    this.setPaused(!this.paused)
  }

  /** 暂停菜单中的「重置视角」：回正第三人称镜头并回到骑行。 */
  resetView() {
    this.followCamera.resetOrbit()
    if (this.paused) this.setPaused(false)
    else this.focusCanvas()
    this.lastSnapshotTime = 0
  }

  /** 触屏精简操控：只暴露油门/刹车/转向三个轴，桌面键盘逻辑完全不变。 */
  setTouchDrive(patch: Partial<{ throttle: boolean; brake: boolean; steer: number; boost: boolean }>) {
    this.touchDrive = {
      ...this.touchDrive,
      ...patch,
      steer: Math.max(-1, Math.min(1, patch.steer ?? this.touchDrive.steer)),
    }
    this.lastSnapshotTime = 0
  }

  toggleWeather() {
    this.weather.toggleManualWeather()
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  startSession(mode: GameMode) {
    this.audio.unlock()
    this.gameMode = mode
    this.started = true
    this.resetRider()
    this.audio.playNewOrder()
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  returnToTitle() {
    this.clearInput()
    this.paused = false
    this.pauseReason = null
    this.started = false
    this.titleElapsed = 0
    this.interior.exit()
    this.weather.reset()
    this.view = 'ride'
    this.navigationVisuals.root.visible = false
    this.lastSnapshotTime = 0
  }

  finishShiftEarly() {
    if (!this.started || this.shiftEnded) return
    this.clearInput()
    this.paused = false
    this.pauseReason = null
    this.distractionActive = false
    this.distractionLevel = 0
    if (this.interior.mode === 'photo') this.interior.closePhotoMode()
    this.shiftEnded = true
    this.lastSnapshotTime = 0
  }

  resumeShiftFromSettlement() {
    if (!this.started || !this.shiftEnded) return
    if (this.gameMode === 'challenge' && this.shiftElapsed >= SHIFT_DURATION_SECONDS - 0.000001) return
    this.shiftEnded = false
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  setPhoneOpen(open: boolean) {
    if (this.phoneOpen === open) return
    this.phoneOpen = open
    if (!open) {
      this.distractionActive = false
    }
    this.lastSnapshotTime = 0
  }

  setNavigationTarget(id: string | null) {
    this.navigation.selectTarget(id)
    if (id !== null && id !== this.orders.priorityTargetId) this.orders.prioritizeTarget(id)
    this.navigation.update(this.controller.state)
    this.navigationElapsed = 0
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  acceptOrder(id: string) {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.eventSystem.hasActiveEvent || !this.orders.accept(id, this.controller.state)) return false
    this.syncOrderNavigation()
    this.focusCanvas()
    return true
  }

  prioritizeOrder(id: string) {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.eventSystem.hasActiveEvent || !this.orders.prioritize(id)) return
    this.setNavigationTarget(this.orders.priorityTargetId)
  }

  reportOrder(id: string, reason: OrderReportReason) {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.eventSystem.hasActiveEvent || !this.orders.report(id, reason)) return false
    this.lastSnapshotTime = 0
    return true
  }

  resolveEventChoice(choiceIndex: 0 | 1) {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded) return
    const resolution = this.eventSystem.chooseOption(choiceIndex)
    if (resolution) this.applyEventResolution(resolution)
    else this.lastSnapshotTime = 0
  }

  tapEventSprint() {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded) return
    const resolution = this.eventSystem.tapSprint()
    if (resolution) this.applyEventResolution(resolution)
    else this.lastSnapshotTime = 0
  }

  resolveIncomingCall(choice: 0 | 1 | 2) {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.eventSystem.hasActiveEvent) return
    const result = this.eventSystem.resolveIncomingCall(choice)
    if (result) {
      this.orders.addSystemMessage(result.orderId, result.messageKind, result.messageText)
      this.lastSnapshotTime = 0
    }
    this.focusCanvas()
  }

  enterNearbyBuilding(): boolean {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.eventSystem.hasActiveEvent || this.interior.mode !== 'none') {
      return false
    }
    const nearby = this.findNearbyEnterable()
    if (!nearby) return false
    const order = this.orders.getOrderForEnterableDelivery(nearby.landmark.id)
    this.clearInput()
    this.distractionActive = false
    this.distractionLevel = 0
    this.interior.enter({
      theme: nearby.theme,
      landmarkId: nearby.landmark.id,
      landmarkName: nearby.landmark.name,
      orderId: order?.orderId ?? null,
      merchantName: order?.merchantName ?? null,
    })
    this.lastSnapshotTime = 0
    this.focusCanvas()
    return true
  }

  exitBuilding(): void {
    if (this.interior.mode === 'none') return
    this.interior.exit()
    this.keys.clear()
    this.followCamera.reset(this.controller.state, this.controller.state.heading)
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  openDeliveryCamera(): boolean {
    if (this.view !== 'ride' || document.hidden || this.shiftEnded || this.interior.mode !== 'walk') return false
    if (!this.interior.openPhotoMode()) return false
    this.keys.clear()
    this.lastSnapshotTime = 0
    this.focusCanvas()
    return true
  }

  closeDeliveryCamera(): void {
    if (this.interior.mode !== 'photo') return
    this.interior.closePhotoMode()
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  captureDeliveryPhoto(): boolean {
    if (this.interior.mode !== 'photo' || !this.interior.orderId || this.interior.photoSuccessText) return false
    const landmarkName = this.interior.landmarkName ?? '建筑大堂'
    const orderId = this.interior.orderId
    if (!this.orders.completeInteriorPhotoDelivery(orderId, landmarkName)) return false
    this.audio.playCameraShutter()
    this.audio.playDelivery()
    this.lastKnownCompletedCount = this.orders.getSnapshot(this.controller.state, false).completed.length
    this.interior.triggerShutter(`${orderId} 拍照存证成功 · 已确认送达！`)
    this.syncOrderNavigation()
    this.lastSnapshotTime = 0
    return true
  }

  private findNearbyEnterable(): { landmark: CityLandmark; theme: InteriorTheme } | null {
    const state = this.controller.state
    let best: { landmark: CityLandmark; theme: InteriorTheme; dist: number } | null = null
    for (const entry of this.enterableLandmarks) {
      const dist = Math.hypot(state.x - entry.landmark.access.position.x, state.z - entry.landmark.access.position.z)
      if (dist <= 12 && (!best || dist < best.dist)) {
        best = { ...entry, dist }
      }
    }
    return best ? { landmark: best.landmark, theme: best.theme } : null
  }

  private updateBatterySwap(stepSeconds: number): void {
    const state = this.controller.state
    const station = CITY_LAYOUT.batteryStations.find((entry) => {
      const dist = Math.hypot(state.x - entry.access.position.x, state.z - entry.access.position.z)
      return dist <= Math.max(3.6, entry.access.radius + 0.8)
    })
    if (!station || Math.abs(state.speed) >= 1.2) {
      if (this.batterySwapStationId !== null || this.batterySwapElapsed > 0) {
        this.batterySwapStationId = null
        this.batterySwapElapsed = 0
        this.eventSystem.setBatterySwap(null)
        this.lastSnapshotTime = 0
      } else {
        this.eventSystem.setBatterySwap(null)
      }
      return
    }
    const durationSec = 3.0
    const feeCents = 200
    if (state.battery >= 98) {
      this.batterySwapStationId = station.id
      this.batterySwapElapsed = 0
      this.eventSystem.setBatterySwap({
        stationId: station.id,
        stationName: station.name,
        progress: 1,
        durationSec,
        feeCents,
        alreadyFull: true,
      })
      return
    }
    if (this.batterySwapStationId !== station.id) {
      this.batterySwapStationId = station.id
      this.batterySwapElapsed = 0
    }
    this.batterySwapElapsed = Math.min(durationSec, this.batterySwapElapsed + stepSeconds)
    if (this.batterySwapElapsed >= durationSec) {
      this.controller.refillBattery()
      this.orders.recordOperatingExpense(
        feeCents,
        'payment',
        `在${station.name}换电柜更换满电电池（电量 100%，运营成本 -¥2.00）。`,
        '换电柜',
      )
      this.eventSystem.recordBatterySwap(station.name)
      this.audio.playBatterySwapComplete()
      this.batterySwapStationId = null
      this.batterySwapElapsed = 0
      this.lastSnapshotTime = 0
      return
    }
    this.eventSystem.setBatterySwap({
      stationId: station.id,
      stationName: station.name,
      progress: this.batterySwapElapsed / durationSec,
      durationSec,
      feeCents,
      alreadyFull: false,
    })
  }

  private applyEventResolution(resolution: EventResolution) {
    if (resolution.action === 'accept-addon') {
      if (resolution.addonMerchantId && resolution.addonDeliveryId && resolution.addonFeeCents) {
        this.orders.acceptAddonOrder(
          resolution.addonMerchantId,
          resolution.addonDeliveryId,
          resolution.addonFeeCents,
          this.controller.state,
        )
        this.syncOrderNavigation()
      }
      this.lastSnapshotTime = 0
      this.focusCanvas()
      return
    }
    if (resolution.action === 'decline-addon') {
      this.orders.addSystemMessage(resolution.orderId, resolution.messageKind, resolution.messageText)
      this.lastSnapshotTime = 0
      this.focusCanvas()
      return
    }
    if (resolution.staminaCost > 0) this.controller.consumeStamina(resolution.staminaCost)
    this.orders.applyEventResolution(resolution)
    if (resolution.action === 'complete-pickup') this.audio.playPickup()
    else if (resolution.action === 'complete-delivery') this.audio.playDelivery()
    const os = this.orders.getSnapshot(this.controller.state, false)
    this.lastKnownOfferCount = os.offers.length
    this.lastKnownCompletedCount = os.completed.length
    this.lastKnownPickedUpCount = os.active.filter((o) => o.status === 'delivery').length
    this.syncOrderNavigation()
    this.lastSnapshotTime = 0
    this.focusCanvas()
  }

  releaseDrivingKeys() {
    this.keys.clear()
  }

  private syncOrderNavigation() {
    this.navigation.setActiveTargets([
      ...this.orders.activeTargetIds,
      ...CITY_LAYOUT.batteryStations.map((station) => station.id),
    ])
    this.navigation.selectTarget(this.orders.priorityTargetId)
    this.navigation.update(this.controller.state)
    this.navigationElapsed = 0
    this.lastSnapshotTime = 0
  }

  setNavigationFrameListener(listener: NavigationFrameListener | null) {
    this.navigationFrameListener = listener
    listener?.(this.controller.state, this.navigation.snapshot)
  }

  resetShift() {
    this.clearInput()
    this.paused = false
    this.pauseReason = null
    this.phoneOpen = false
    this.interior.exit()
    this.weather.reset()
    this.weather.applyAtmosphere(
      this.scene,
      this.sunlight,
      this.hemiLight,
      (intensity) => this.world.setStreetLampGlow(intensity),
      true,
    )
    this.controller.reset()
    this.orders.reset()
    this.orders.setRaining(false)
    this.eventSystem.reset()
    this.navigation.reset()
    this.syncOrderNavigation()
    this.traffic.reset()
    this.trafficVisuals.clearHorn()
    this.trafficVisuals.update(0)
    this.dust.clear()
    this.audio.updateContinuous({
      speedAbs: 0,
      boosting: false,
      rainIntensity: 0,
      active: false,
      indoor: false,
    })
    this.collisionDisplayTime = 0
    this.shiftElapsed = 0
    this.shiftEnded = false
    this.sessionStartedAt = performance.now()
    this.distractionLevel = 0
    this.distractionActive = false
    this.distractionPhaseTime = 0
    this.distractedElapsedSec = 0
    this.distractionWarningCount = 0
    this.batterySwapStationId = null
    this.batterySwapElapsed = 0
    this.lastKnownOfferCount = this.orders.getSnapshot(this.controller.state, false).offers.length
    this.lastKnownCompletedCount = 0
    this.lastKnownPickedUpCount = 0
    this.setCityView('ride')
    this.lastSnapshotTime = 0
  }

  resetRider() {
    this.resetShift()
  }

  setRiderPreviewMode(mode: RiderPreviewMode) {
    if (this.view === 'ride') this.setCityView('rider-rear')
    this.riderPreview = mode
    this.previewTime = 0
    const standLeg = mode === 'motion' ? 0 : 1
    this.rider.update({ wheelAngle: this.wheelAngle, steeringAngle: 0, leanAngle: mode === 'motion' ? 0 : -0.075, braking: mode === 'braking', standLeg })
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
    window.removeEventListener('pointerdown', this.unlockAudio)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clearInput)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.renderer.domElement.removeEventListener('pointerdown', this.focusCanvas)
    this.renderer.domElement.removeEventListener('pointermove', this.onCanvasPointerMove)
    this.renderer.domElement.removeEventListener('wheel', this.onCanvasWheel)
    this.renderer.domElement.removeEventListener('dblclick', this.onCanvasDoubleClick)
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.audio.setPageHidden(false)
    this.keys.clear()
    this.controls.dispose()
    this.dust.dispose()
    this.trafficVisuals.dispose()
    this.navigationFrameListener = null
    this.navigationVisuals.dispose()
    this.rider.dispose()
    this.interior.dispose()
    this.weather.dispose()
    this.audio.dispose()
    this.world.dispose()
    this.sunlight.shadow.dispose()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __RHR_DEV__?: GameEngine }
      if (win.__RHR_DEV__ === this) delete win.__RHR_DEV__
    }
  }

  readonly focusCanvas = () => {
    // 不在无用户手势时创建 AudioContext，避免自动播放策略在首屏控制台留下告警。
    this.renderer.domElement.focus({ preventScroll: true })
  }

  private readonly unlockAudio = () => {
    this.audio.unlock()
  }

  private readonly onCanvasPointerMove = (event: PointerEvent) => {
    if (!this.started || this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    if (event.pointerType === 'touch') return
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    // 以画布中心为正前方，按画布 44% 半径映射至 [-1, 1]，无需按键即可丝滑侧头观察。
    const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.44)
    const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.44)
    if (this.interior.mode === 'walk') this.interior.setPointerLook(nx, ny)
    else if (this.interior.mode === 'none') this.followCamera.setPointerLook(nx, ny)
  }

  private readonly onCanvasWheel = (event: WheelEvent) => {
    if (!this.started || this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    event.preventDefault()
    this.followCamera.zoomBy(event.deltaY)
  }

  private readonly onCanvasDoubleClick = () => {
    if (!this.started || this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    this.followCamera.resetOrbit()
  }

  private readonly clearInput = () => {
    this.keys.clear()
    this.touchDrive = { throttle: false, brake: false, steer: 0, boost: false }
    this.controller.stop()
    this.hornRemaining = 0
    this.trafficVisuals.clearHorn()
  }

  private readonly onVisibilityChange = () => {
    const hidden = document.hidden
    this.audio.setPageHidden(hidden)
    if (hidden) {
      this.clearInput()
      // 切到后台自动暂停计时，回到前台由玩家确认继续，避免“黑屏掉秒”的不公平。
      if (this.started && !this.shiftEnded && !this.paused) this.setPaused(true, 'hidden')
    }
    this.previousTime = performance.now()
    this.lastSnapshotTime = 0
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.audio.unlock()
    if (!this.started || this.shiftEnded) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (this.paused) {
      if (event.code === 'Escape') {
        event.preventDefault()
        if (!event.repeat) this.setPaused(false)
      }
      return
    }
    if (this.eventSystem.hasActiveEvent) return
    if (this.interior.mode === 'photo') {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        if (!event.repeat) this.captureDeliveryPhoto()
      } else if (event.code === 'Escape') {
        event.preventDefault()
        if (!event.repeat) this.closeDeliveryCamera()
      }
      return
    }
    if (event.code === 'Escape' && !event.repeat) {
      if (!this.phoneOpen) {
        event.preventDefault()
        this.setPaused(true, 'manual')
      }
      return
    }
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, summary, [contenteditable="true"]')) return
    if (this.view === 'ride' && !this.shiftEnded && this.eventSystem.hasIncomingCall && !event.repeat) {
      if (event.code === 'Digit1' || event.code === 'Numpad1') {
        event.preventDefault()
        this.resolveIncomingCall(0)
        return
      }
      if (event.code === 'Digit2' || event.code === 'Numpad2') {
        event.preventDefault()
        this.resolveIncomingCall(1)
        return
      }
      if (event.code === 'Digit3' || event.code === 'Numpad3') {
        event.preventDefault()
        this.resolveIncomingCall(2)
        return
      }
    }
    if (this.interior.mode === 'walk') {
      if (event.code === 'KeyE') {
        event.preventDefault()
        if (!event.repeat) this.exitBuilding()
      } else if (event.code === 'KeyF') {
        event.preventDefault()
        if (!event.repeat) this.openDeliveryCamera()
      } else if (DRIVING_KEYS.has(event.code)) {
        if (!event.code.startsWith('Shift')) event.preventDefault()
        this.keys.add(event.code)
      }
      return
    }
    if (event.code === 'KeyE' && this.view === 'ride' && !this.shiftEnded) {
      if (!event.repeat && this.enterNearbyBuilding()) event.preventDefault()
      return
    }
    if (event.code === 'KeyC') {
      event.preventDefault()
      if (!event.repeat) this.cycleRideCameraMode()
    } else if (this.view === 'ride' && !this.shiftEnded && event.code === 'KeyH') {
      event.preventDefault()
      if (!event.repeat && this.hornRemaining <= 0) {
        this.hornRemaining = 0.7
        this.trafficVisuals.honk(this.controller.state, this.controller.state.heading)
        this.audio.playHorn()
      }
    } else if (this.view === 'ride' && !this.shiftEnded && DRIVING_KEYS.has(event.code)) {
      if (!event.code.startsWith('Shift')) event.preventDefault()
      this.keys.add(event.code)
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => { this.keys.delete(event.code) }

  private updateRider() {
    const state = this.controller.state
    const onSidewalk = CITY_LAYOUT.sidewalks.some(({ bounds }) => state.x >= bounds.minX && state.x <= bounds.maxX && state.z >= bounds.minZ && state.z <= bounds.maxZ)
    const inBlock = CITY_LAYOUT.blocks.some(({ bounds }) => state.x >= bounds.minX && state.x <= bounds.maxX && state.z >= bounds.minZ && state.z <= bounds.maxZ)
    this.rider.root.position.set(state.x, onSidewalk ? 0.24 : inBlock ? 0.16 : 0, state.z)
    this.rider.root.rotation.y = state.heading
    this.wheelAngle = state.wheelTravel / RIDER_WHEEL_RADIUS % (Math.PI * 2)
    this.rider.update({
      wheelAngle: this.wheelAngle,
      steeringAngle: state.steeringAngle,
      leanAngle: state.leanAngle,
      braking: state.braking,
      standLeg: state.standLeg,
      headlightIntensity: this.weather.intensity,
    })
  }

  private countSceneInstances(): number {
    let count = 0
    this.scene.traverse((object) => {
      if (object instanceof InstancedMesh) count += object.count
    })
    return count
  }

  /** 按持续掉帧/恢复情况逐级调整渲染倍率，兼顾画质与低端设备可玩性。 */
  private updateAdaptiveQuality(now: number) {
    // 用真实墙钟而不是游戏内时钟：极低帧率下游戏 delta 会被钳制，内时钟几乎不前进。
    if (now - this.sessionStartedAt < QUALITY_GRACE_SECONDS * 1000 || this.fps <= 0) return
    if (this.fps < QUALITY_LOW_FPS) {
      this.lowFpsStreak += 1
      this.highFpsStreak = 0
    } else if (this.fps > QUALITY_HIGH_FPS) {
      this.highFpsStreak += 1
      this.lowFpsStreak = 0
    } else {
      this.lowFpsStreak = 0
      this.highFpsStreak = 0
    }

    const sinceLastChange = now - this.lastQualityChangeAt
    const floorScale = RENDER_SCALE_STEPS[RENDER_SCALE_STEPS.length - 1]
    if (this.lowFpsStreak >= QUALITY_LOW_SAMPLES && sinceLastChange >= QUALITY_DOWNGRADE_COOLDOWN_MS && this.renderScale > floorScale) {
      const next = RENDER_SCALE_STEPS.find((step) => step < this.renderScale - 0.001) ?? floorScale
      this.renderScale = next
      this.lastQualityChangeAt = now
      this.lowFpsStreak = 0
      this.highFpsStreak = 0
      this.applyRenderScale()
      return
    }

    if (this.highFpsStreak >= QUALITY_HIGH_SAMPLES && sinceLastChange >= QUALITY_UPGRADE_COOLDOWN_MS && this.renderScale < 1) {
      const next = RENDER_SCALE_STEPS.find((step) => step > this.renderScale + 0.001) ?? 1
      this.renderScale = next
      this.lastQualityChangeAt = now
      this.lowFpsStreak = 0
      this.highFpsStreak = 0
      this.applyRenderScale()
    }
  }

  /** 应用当前自适应渲染倍率（实际 DPR 上限仍为 2，避免高分屏过度绘制）。 */
  private applyRenderScale() {
    const ratio = Math.min(window.devicePixelRatio, 2) * this.renderScale
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    this.lastSnapshotTime = 0
  }

  /** 阴影贴图按 30Hz 更新：移动中的骑手/车流影子几乎无感延迟，但阴影 pass 开销减半。 */
  private requestShadowUpdate(deltaSeconds: number) {
    this.shadowUpdateElapsed += deltaSeconds
    if (this.shadowUpdateElapsed >= 1 / 30) {
      this.sunlight.shadow.needsUpdate = true
      this.shadowUpdateElapsed = 0
    }
  }

  private readonly onContextLost = (event: Event) => {
    event.preventDefault()
    if (this.contextLost) return
    this.contextLost = true
    this.lastSnapshotTime = 0
    if (this.started && !this.shiftEnded && !this.paused) this.setPaused(true, 'context-lost')
  }

  private readonly onContextRestored = () => {
    this.contextLost = false
    this.previousTime = performance.now()
    this.lastSnapshotTime = 0
    this.applyRenderScale()
    this.sunlight.shadow.needsUpdate = true
  }

  private readonly resize = () => {
    this.viewportWidth = Math.max(this.container.clientWidth, 1)
    this.viewportHeight = Math.max(this.container.clientHeight, 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * this.renderScale)
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    this.followCamera.resize(this.viewportWidth, this.viewportHeight)
    this.interior.resize(this.viewportWidth, this.viewportHeight)
    const aspect = this.viewportWidth / this.viewportHeight
    const halfHeight = 565 / Math.min(aspect, 1)
    const halfWidth = halfHeight * aspect
    this.previewCamera.left = -halfWidth
    this.previewCamera.right = halfWidth
    this.previewCamera.top = halfHeight
    this.previewCamera.bottom = -halfHeight
    const offsetX = aspect > 1.1 ? -this.viewportWidth * 0.06 : 0
    const offsetY = aspect < 1 && this.viewportHeight <= 640 ? -this.viewportHeight * 0.08 : 0
    this.previewCamera.setViewOffset(this.viewportWidth, this.viewportHeight, offsetX, offsetY, this.viewportWidth, this.viewportHeight)
  }

  private readonly tick = (time: number) => {
    const deltaSeconds = Math.max(0, Math.min((time - this.previousTime) / 1000, 0.05))
    this.previousTime = time
    const isChallenge = this.gameMode === 'challenge'
    const paused = this.started && this.paused && !this.shiftEnded
    const shiftActive = this.started && this.view === 'ride' && !document.hidden && !this.shiftEnded && !paused && !this.contextLost
    const eventBlocking = this.eventSystem.hasActiveEvent
    const insideBuilding = this.started && this.interior.mode !== 'none'
    if (!this.started) {
      this.distractionActive = false
      this.distractionLevel = 0
      if (!document.hidden) {
        this.titleElapsed += deltaSeconds
        this.traffic.update(deltaSeconds)
        this.trafficVisuals.update(deltaSeconds)
      }
      const center = { x: this.controller.state.x + 12, z: this.controller.state.z - 8 }
      this.followCamera.updateTitleOrbit(center, this.titleElapsed)
      this.sunlight.target.position.set(center.x, 0, center.z)
      this.sunlight.position.set(center.x - 260, 420, center.z + 240)
      this.requestShadowUpdate(deltaSeconds)
    } else if (insideBuilding) {
      this.distractionActive = false
      this.distractionLevel = 0
      if (shiftActive) {
        const stepSeconds = isChallenge
          ? Math.min(deltaSeconds, Math.max(0, SHIFT_DURATION_SECONDS - this.shiftElapsed))
          : deltaSeconds
        this.shiftElapsed += stepSeconds
        this.eventSystem.updateRidingCooldown(stepSeconds)
        this.traffic.update(stepSeconds)
        this.trafficVisuals.update(stepSeconds)
        this.orders.updateInterior(stepSeconds, this.controller.state)
        const keyboardForward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
        const keyboardStrafe = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
        const forward = Math.max(-1, Math.min(1, keyboardForward + Number(this.touchDrive.throttle) - Number(this.touchDrive.brake)))
        const strafe = Math.max(-1, Math.min(1, keyboardStrafe - this.touchDrive.steer))
        this.eventSystem.setLiveTelemetry({
          waitingAtRed: false,
          dt: stepSeconds,
          battery: this.controller.state.battery,
          stamina: this.controller.state.stamina,
        })
        const shouldAutoExit = this.interior.update(stepSeconds, { forward, strafe }, this.controller.state.stamina <= 20)
        if (shouldAutoExit) this.exitBuilding()
        if (isChallenge && this.shiftElapsed >= SHIFT_DURATION_SECONDS - 0.000001) {
          this.shiftElapsed = SHIFT_DURATION_SECONDS
          this.shiftEnded = true
          this.paused = false
          this.pauseReason = null
          if (this.interior.mode === 'photo') this.interior.closePhotoMode()
          this.keys.clear()
          this.lastSnapshotTime = 0
        }
      }
    } else if (shiftActive && !eventBlocking) {
      const stepSeconds = isChallenge
        ? Math.min(deltaSeconds, Math.max(0, SHIFT_DURATION_SECONDS - this.shiftElapsed))
        : deltaSeconds
      this.shiftElapsed += stepSeconds
      this.eventSystem.updateRidingCooldown(stepSeconds)
      const previousPosition = { x: this.controller.state.x, z: this.controller.state.z }
      const speedAbs = Math.abs(this.controller.state.speed)
      const isRisky = this.phoneOpen && speedAbs >= DISTRACTION_SAFE_SPEED
      if (isRisky && !this.distractionActive) {
        this.distractionWarningCount += 1
        this.lastSnapshotTime = 0
      } else if (!isRisky && this.distractionActive) {
        this.lastSnapshotTime = 0
      }
      this.distractionActive = isRisky
      const targetDistraction = isRisky
        ? Math.max(0.28, Math.min(1, (speedAbs - DISTRACTION_SAFE_SPEED) / (DISTRACTION_FULL_SPEED - DISTRACTION_SAFE_SPEED)))
        : 0
      const distractionRate = isRisky ? 5.5 : 10
      this.distractionLevel += (targetDistraction - this.distractionLevel) * (1 - Math.exp(-distractionRate * stepSeconds))
      if (this.distractionLevel < 0.005) this.distractionLevel = 0
      if (isRisky) {
        this.distractionPhaseTime += stepSeconds
        this.distractedElapsedSec += stepSeconds
      }

      this.traffic.update(stepSeconds, this.controller.state, this.distractionLevel)
      this.hornRemaining = Math.max(0, this.hornRemaining - stepSeconds)
      this.trafficVisuals.update(stepSeconds)
      const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchDrive.throttle
      const reverse = this.keys.has('KeyS') || this.keys.has('ArrowDown')
      this.controller.update(stepSeconds, {
        throttle: Number(forward) - Number(reverse),
        steering: Math.max(-1, Math.min(1, Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) - Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) + this.touchDrive.steer)),
        brake: this.keys.has('Space') || forward && reverse || this.touchDrive.brake,
        boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchDrive.boost,
        distraction: this.distractionLevel,
        distractionTime: this.distractionPhaseTime,
        activeOrderCount: this.orders.activeTargetIds.length,
        rainIntensity: this.weather.intensity,
      })
      const state = this.controller.state
      const impact = this.traffic.checkCollision(state, this.distractionLevel)
      if (impact) {
        this.controller.applyTrafficImpact(impact.normalX, impact.normalZ, impact.distance, this.distractionLevel)
        this.audio.playCollision()
      } else if (state.colliding) {
        this.audio.playCollision()
      }
      this.traffic.checkSignals(previousPosition, state)
      const waitingAtRed = this.traffic.isWaitingAtRedLight(state)
      this.eventSystem.setLiveTelemetry({
        waitingAtRed,
        dt: stepSeconds,
        battery: state.battery,
        stamina: state.stamina,
      })
      this.updateBatterySwap(stepSeconds)
      const orderRevision = this.orders.revision
      const intercepted = this.orders.update(
        stepSeconds,
        previousPosition,
        state,
        waitingAtRed,
        (check) => {
          const triggered = this.eventSystem.tryTriggerArrival(
            check.phase,
            check.order.id,
            check.landmark,
            check.buildingKind,
            state.stamina,
          )
          if (triggered) {
            this.clearInput()
            this.distractionActive = false
            this.distractionLevel = 0
            this.audio.playModalAlert()
            this.lastSnapshotTime = 0
          }
          return triggered
        },
      )
      if (!intercepted && !this.eventSystem.hasActiveEvent && !this.eventSystem.hasIncomingCall) {
        if (this.orders.activeOrders.length === 2) {
          const addonCandidate = this.orders.findAddonCandidate(state)
          if (addonCandidate && this.eventSystem.tryTriggerAddonOffer(addonCandidate.merchant, addonCandidate.destination, 2)) {
            this.clearInput()
            this.distractionActive = false
            this.distractionLevel = 0
            this.audio.playModalAlert()
            this.lastSnapshotTime = 0
          }
        }
        if (!this.eventSystem.hasActiveEvent) {
          const urgentOrder = this.orders.activeOrders.find((order) => {
            const rem = order.deadline - this.orders.elapsedSeconds
            return rem <= 18 && rem > -10
          })
          if (urgentOrder) {
            const triggeredCall = this.eventSystem.tryTriggerIncomingCall(
              urgentOrder.id,
              this.orders.getLandmarkName(urgentOrder.deliveryId),
              urgentOrder.ledger.merchantDelaySec > 0,
            )
            if (triggeredCall) {
              this.audio.playIncomingCall()
              this.lastSnapshotTime = 0
            }
          }
        }
      }
      if (orderRevision !== this.orders.revision) {
        const os = this.orders.getSnapshot(state, false)
        const pickedUpCount = os.active.filter((o) => o.status === 'delivery').length
        if (os.completed.length > this.lastKnownCompletedCount) {
          this.audio.playDelivery()
        } else if (pickedUpCount > this.lastKnownPickedUpCount) {
          this.audio.playPickup()
        } else if (os.offers.length > this.lastKnownOfferCount) {
          this.audio.playNewOrder()
        }
        this.lastKnownOfferCount = os.offers.length
        this.lastKnownCompletedCount = os.completed.length
        this.lastKnownPickedUpCount = pickedUpCount
        this.syncOrderNavigation()
      }
      this.navigationElapsed += stepSeconds
      if (this.navigationElapsed >= 0.1) {
        this.navigation.update(state)
        this.navigationElapsed %= 0.1
      }
      this.collisionDisplayTime = state.colliding ? 0.35 : Math.max(0, this.collisionDisplayTime - stepSeconds)
      this.updateRider()
      this.dust.update(stepSeconds, state, state.heading, state.speed, state.braking)
      this.followCamera.update(
        state,
        state.heading,
        stepSeconds,
        state.speed,
        intercepted ? 0 : this.distractionLevel,
        this.distractionPhaseTime,
        this.reducedMotionQuery?.matches ?? false,
      )
      this.sunlight.target.position.copy(this.rider.root.position)
      this.sunlight.position.copy(this.sunlight.target.position).add({ x: -240, y: 410, z: 220 })
      this.requestShadowUpdate(stepSeconds)
      if (isChallenge && !intercepted && this.shiftElapsed >= SHIFT_DURATION_SECONDS - 0.000001) {
        this.shiftElapsed = SHIFT_DURATION_SECONDS
        this.shiftEnded = true
        this.paused = false
        this.pauseReason = null
        this.distractionActive = false
        this.distractionLevel = 0
        this.clearInput()
        this.updateRider()
        this.lastSnapshotTime = 0
      }
    } else if (this.view === 'ride') {
      this.distractionActive = false
      this.distractionLevel = 0
      if (!paused && shiftActive && eventBlocking) {
        const sprintResolution = this.eventSystem.updateModal(deltaSeconds)
        if (sprintResolution) this.applyEventResolution(sprintResolution)
      }
      if (!paused) this.followCamera.update(this.controller.state, this.controller.state.heading, deltaSeconds, 0, 0, 0, true)
    } else {
      this.distractionActive = false
      this.distractionLevel = 0
      if (this.riderPreview === 'motion') {
        this.previewTime += deltaSeconds
        this.wheelAngle = (this.wheelAngle + deltaSeconds * 3.2 / RIDER_WHEEL_RADIUS) % (Math.PI * 2)
        const turn = Math.sin(this.previewTime * 1.3)
        this.rider.update({ wheelAngle: this.wheelAngle, steeringAngle: turn * 0.16, leanAngle: -turn * 0.2, braking: false, standLeg: 0 })
        this.requestShadowUpdate(deltaSeconds)
      }
      this.controls.update(deltaSeconds)
    }
    const weatherProgress = isChallenge
      ? this.shiftElapsed / SHIFT_DURATION_SECONDS
      : (this.shiftElapsed % SHIFT_DURATION_SECONDS) / SHIFT_DURATION_SECONDS
    if (!paused) this.weather.update(deltaSeconds, this.started ? weatherProgress : 0, this.controller.state, this.interior.mode === 'none')
    this.weather.applyAtmosphere(
      this.scene,
      this.sunlight,
      this.hemiLight,
      (intensity) => this.world.setStreetLampGlow(intensity),
      this.view === 'ride',
    )
    this.orders.setRaining(this.weather.isRaining)
    this.audio.updateContinuous({
      speedAbs: Math.abs(this.controller.state.speed),
      boosting: this.controller.state.boosting,
      rainIntensity: this.weather.intensity,
      active: shiftActive && !eventBlocking,
      indoor: insideBuilding,
    })
    if (this.interior.mode !== 'none') {
      if (!this.contextLost) this.renderer.render(this.interior.scene, this.interior.camera)
    } else {
      if (!shiftActive || eventBlocking) this.updateRider()
      this.navigationVisuals.root.visible = this.started && this.view !== 'rider-rear' && this.view !== 'rider-side'
      this.navigationVisuals.update(paused ? 0 : deltaSeconds, this.controller.state, this.navigation.snapshot, this.started && this.view === 'ride')
      this.navigationFrameListener?.(this.controller.state, this.navigation.snapshot)
      this.world.updateCanopyOcclusion(this.followCamera.camera.position, this.started && this.view === 'ride' ? this.rider.root.position : null, paused ? 0 : deltaSeconds)
      if (!this.contextLost) this.renderer.render(this.scene, this.view === 'ride' ? this.followCamera.camera : this.previewCamera)
    }
    this.sampleFrames += 1
    const sampleDuration = time - this.sampleStartedAt
    if (sampleDuration >= 500) {
      this.fps = Math.round(this.sampleFrames * 1000 / sampleDuration)
      this.sampleFrames = 0
      this.sampleStartedAt = time
      if (!document.hidden && !this.contextLost && !paused) this.updateAdaptiveQuality(time)
    }
    const eventSnapshot = this.eventSystem.getSnapshot()
    const snapshotInterval =
      eventSnapshot.active?.sprint?.active
      || (eventSnapshot.batterySwap !== null && !eventSnapshot.batterySwap.alreadyFull)
      || this.interior.photoFlash > 0
        ? 33
        : 100
    if (time - this.lastSnapshotTime >= snapshotInterval) {
      const state = this.controller.state
      const nearbyEnterable = this.interior.mode === 'none' && this.view === 'ride' && !this.shiftEnded && !eventBlocking
        ? this.findNearbyEnterable()
        : null
      const nearbyOrder = nearbyEnterable ? this.orders.getOrderForEnterableDelivery(nearbyEnterable.landmark.id) : null
      this.onSnapshot({
        view: this.view,
        cameraMode: this.cameraMode,
        riderPreview: this.riderPreview,
        muted: this.muted,
        shift: {
          started: this.started,
          mode: this.gameMode,
          durationSec: SHIFT_DURATION_SECONDS,
          elapsedSec: this.shiftElapsed,
          remainingSec: isChallenge ? Math.max(0, SHIFT_DURATION_SECONDS - this.shiftElapsed) : SHIFT_DURATION_SECONDS,
          clockLabel: formatShiftClock(isChallenge ? this.shiftElapsed : this.shiftElapsed % SHIFT_DURATION_SECONDS),
          ended: this.shiftEnded,
          paused: this.paused && this.started && !this.shiftEnded,
          pauseReason: this.paused && this.started && !this.shiftEnded ? this.pauseReason : null,
        },
        distraction: {
          phoneOpen: this.phoneOpen,
          active: this.distractionActive,
          level: this.distractionLevel,
          elapsedSec: this.distractedElapsedSec,
          warningCount: this.distractionWarningCount,
        },
        events: eventSnapshot,
        interior: {
          mode: this.interior.mode,
          canEnter: nearbyEnterable !== null,
          nearbyLandmarkId: nearbyEnterable?.landmark.id ?? null,
          nearbyLandmarkName: nearbyEnterable?.landmark.name ?? null,
          nearbyTheme: nearbyEnterable?.theme ?? null,
          nearbyOrderId: nearbyOrder?.orderId ?? null,
          theme: this.interior.theme,
          landmarkId: this.interior.landmarkId,
          landmarkName: this.interior.landmarkName,
          orderId: this.interior.orderId,
          merchantName: this.interior.merchantName,
          atDropZone: this.interior.atDropZone,
          dropDistance: this.interior.dropDistance,
          elapsedSec: this.interior.elapsedSec,
          photoFlash: this.interior.photoFlash,
          photoSuccessText: this.interior.photoSuccessText,
        },
        weather: this.weather.getSnapshot(),
        rider: {
          x: state.x, z: state.z, heading: state.heading, speed: state.speed,
          battery: state.battery, stamina: state.stamina, standLeg: state.standLeg, distance: state.distance, braking: state.braking,
          boosting: state.boosting, colliding: this.collisionDisplayTime > 0,
        },
        traffic: this.traffic.getSnapshot(state, this.hornRemaining > 0),
        navigation: this.navigation.snapshot,
        orders: this.orders.getSnapshot(state, !shiftActive || this.eventSystem.hasActiveEvent),
        fps: this.fps,
        drawCalls: this.renderer.info.render.calls,
        triangleCount: this.renderer.info.render.triangles,
        instanceCount: this.instanceCount,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        pixelRatio: this.renderer.getPixelRatio(),
        renderScale: this.renderScale,
        rendererLost: this.contextLost,
      })
      this.lastSnapshotTime = time
    }
    this.frameId = requestAnimationFrame(this.tick)
  }
}
