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
import type { CityView, Direction, EngineSnapshot, NavigationFrameListener, OrderReportReason, RideCameraMode, RiderPreviewMode } from './types'

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
  private readonly traffic = new TrafficSystem(CITY_LAYOUT, (event) => console.info('交通事件', event))
  private readonly trafficVisuals: ReturnType<typeof buildTrafficVisuals>
  private readonly navigation = new NavigationSystem(CITY_LAYOUT, RIDER_COLLISION_RADIUS)
  private readonly orders = new OrderManager(CITY_LAYOUT)
  private readonly eventSystem = new EventSystem()
  private readonly navigationVisuals: ReturnType<typeof buildNavigationVisuals>
  private navigationFrameListener: NavigationFrameListener | null = null
  private navigationElapsed = 0
  private hornRemaining = 0
  private readonly keys = new Set<string>()
  private readonly renderer: WebGLRenderer
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver
  private readonly sunlight = new DirectionalLight('#fff0ce', 2.7)
  private readonly world: ReturnType<typeof buildWorld>
  private readonly rider: ReturnType<typeof buildRiderVehicle>
  private view: CityView = 'ride'
  private cameraMode: RideCameraMode = 'near'
  private riderPreview: RiderPreviewMode = 'parked'
  private muted = false
  private phoneOpen = false
  private shiftElapsed = 0
  private shiftEnded = false
  private distractionLevel = 0
  private distractionActive = false
  private distractionPhaseTime = 0
  private distractedElapsedSec = 0
  private distractionWarningCount = 0
  private readonly reducedMotionQuery: MediaQueryList | null
  private previewTime = 0
  private wheelAngle = 0
  private collisionDisplayTime = 0
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
    this.scene.add(new HemisphereLight('#fff7e6', '#859a80', 1.8))
    this.sunlight.castShadow = true
    this.sunlight.shadow.mapSize.set(2048, 2048)
    this.sunlight.shadow.camera.near = 30
    this.sunlight.shadow.camera.far = 1500
    this.sunlight.shadow.autoUpdate = false
    this.scene.add(this.sunlight, this.sunlight.target)
    this.world = buildWorld(CITY_LAYOUT)
    this.scene.add(this.world.root)
    this.rider = buildRiderVehicle()
    this.trafficVisuals = buildTrafficVisuals(CITY_LAYOUT, this.traffic.signals, this.traffic.vehicles)
    this.navigationVisuals = buildNavigationVisuals(this.navigation.targets)
    this.syncOrderNavigation()
    this.scene.add(this.rider.root, this.dust.root, this.trafficVisuals.root, this.navigationVisuals.root)
    this.updateRider()

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
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.clearInput)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.renderer.domElement.addEventListener('pointerdown', this.focusCanvas)
    this.renderer.domElement.addEventListener('pointermove', this.onCanvasPointerMove)
    this.renderer.domElement.addEventListener('wheel', this.onCanvasWheel, { passive: false })
    this.renderer.domElement.addEventListener('dblclick', this.onCanvasDoubleClick)
    this.resize()
  }

  setCityView(view: CityView) {
    this.clearInput()
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
    this.lastSnapshotTime = 0
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

  private applyEventResolution(resolution: EventResolution) {
    if (resolution.staminaCost > 0) this.controller.consumeStamina(resolution.staminaCost)
    this.orders.applyEventResolution(resolution)
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

  resetRider() {
    this.controller.reset()
    this.orders.reset()
    this.eventSystem.reset()
    this.navigation.reset()
    this.syncOrderNavigation()
    this.traffic.reset()
    this.trafficVisuals.update(0)
    this.collisionDisplayTime = 0
    this.shiftElapsed = 0
    this.shiftEnded = false
    this.distractionLevel = 0
    this.distractionActive = false
    this.distractionPhaseTime = 0
    this.distractedElapsedSec = 0
    this.distractionWarningCount = 0
    this.setCityView('ride')
    this.lastSnapshotTime = 0
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
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.clearInput)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.renderer.domElement.removeEventListener('pointerdown', this.focusCanvas)
    this.renderer.domElement.removeEventListener('pointermove', this.onCanvasPointerMove)
    this.renderer.domElement.removeEventListener('wheel', this.onCanvasWheel)
    this.renderer.domElement.removeEventListener('dblclick', this.onCanvasDoubleClick)
    this.keys.clear()
    this.controls.dispose()
    this.dust.dispose()
    this.trafficVisuals.dispose()
    this.navigationFrameListener = null
    this.navigationVisuals.dispose()
    this.rider.dispose()
    this.world.dispose()
    this.sunlight.shadow.dispose()
    this.scene.clear()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }

  readonly focusCanvas = () => this.renderer.domElement.focus({ preventScroll: true })

  private readonly onCanvasPointerMove = (event: PointerEvent) => {
    if (this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    if (event.pointerType === 'touch') return
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    // 以画布中心为正前方，按画布 44% 半径映射至 [-1, 1]，无需按键即可丝滑侧头观察。
    const nx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.44)
    const ny = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.44)
    this.followCamera.setPointerLook(nx, ny)
  }

  private readonly onCanvasWheel = (event: WheelEvent) => {
    if (this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    event.preventDefault()
    this.followCamera.zoomBy(event.deltaY)
  }

  private readonly onCanvasDoubleClick = () => {
    if (this.view !== 'ride' || this.eventSystem.hasActiveEvent) return
    this.followCamera.resetOrbit()
  }

  private readonly clearInput = () => {
    this.keys.clear()
    this.controller.stop()
    this.hornRemaining = 0
    this.trafficVisuals.clearHorn()
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.clearInput()
    this.previousTime = performance.now()
    this.lastSnapshotTime = 0
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (this.eventSystem.hasActiveEvent) return
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, button, a, summary, [contenteditable="true"]')) return
    if (event.code === 'KeyC') {
      event.preventDefault()
      if (!event.repeat) this.cycleRideCameraMode()
    } else if (this.view === 'ride' && !this.shiftEnded && event.code === 'KeyH') {
      event.preventDefault()
      if (!event.repeat && this.hornRemaining <= 0) {
        this.hornRemaining = 0.7
        this.trafficVisuals.honk(this.controller.state, this.controller.state.heading)
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
    })
  }

  private readonly resize = () => {
    this.viewportWidth = Math.max(this.container.clientWidth, 1)
    this.viewportHeight = Math.max(this.container.clientHeight, 1)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false)
    this.followCamera.resize(this.viewportWidth, this.viewportHeight)
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
    const shiftActive = this.view === 'ride' && !document.hidden && !this.shiftEnded
    const eventBlocking = this.eventSystem.hasActiveEvent
    if (shiftActive && !eventBlocking) {
      const stepSeconds = Math.min(deltaSeconds, Math.max(0, SHIFT_DURATION_SECONDS - this.shiftElapsed))
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
      const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp')
      const reverse = this.keys.has('KeyS') || this.keys.has('ArrowDown')
      this.controller.update(stepSeconds, {
        throttle: Number(forward) - Number(reverse),
        steering: Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')) - Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')),
        brake: this.keys.has('Space') || forward && reverse,
        boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
        distraction: this.distractionLevel,
        distractionTime: this.distractionPhaseTime,
        activeOrderCount: this.orders.activeTargetIds.length,
      })
      const state = this.controller.state
      const impact = this.traffic.checkCollision(state, this.distractionLevel)
      if (impact) this.controller.applyTrafficImpact(impact.normalX, impact.normalZ, impact.distance, this.distractionLevel)
      this.traffic.checkSignals(previousPosition, state)
      const orderRevision = this.orders.revision
      const intercepted = this.orders.update(
        stepSeconds,
        previousPosition,
        state,
        this.traffic.isWaitingAtRedLight(state),
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
            this.lastSnapshotTime = 0
          }
          return triggered
        },
      )
      if (orderRevision !== this.orders.revision) this.syncOrderNavigation()
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
      this.sunlight.shadow.needsUpdate = true
      if (!intercepted && this.shiftElapsed >= SHIFT_DURATION_SECONDS - 0.000001) {
        this.shiftElapsed = SHIFT_DURATION_SECONDS
        this.shiftEnded = true
        this.distractionActive = false
        this.distractionLevel = 0
        this.clearInput()
        this.updateRider()
        this.lastSnapshotTime = 0
      }
    } else if (this.view === 'ride') {
      this.distractionActive = false
      this.distractionLevel = 0
      if (shiftActive && eventBlocking) {
        const sprintResolution = this.eventSystem.updateModal(deltaSeconds)
        if (sprintResolution) this.applyEventResolution(sprintResolution)
      }
      this.followCamera.update(this.controller.state, this.controller.state.heading, deltaSeconds, 0, 0, 0, true)
    } else {
      this.distractionActive = false
      this.distractionLevel = 0
      if (this.riderPreview === 'motion') {
        this.previewTime += deltaSeconds
        this.wheelAngle = (this.wheelAngle + deltaSeconds * 3.2 / RIDER_WHEEL_RADIUS) % (Math.PI * 2)
        const turn = Math.sin(this.previewTime * 1.3)
        this.rider.update({ wheelAngle: this.wheelAngle, steeringAngle: turn * 0.16, leanAngle: -turn * 0.2, braking: false, standLeg: 0 })
        this.sunlight.shadow.needsUpdate = true
      }
      this.controls.update(deltaSeconds)
    }
    this.navigationVisuals.update(deltaSeconds, this.controller.state, this.navigation.snapshot, this.view === 'ride')
    this.navigationFrameListener?.(this.controller.state, this.navigation.snapshot)
    this.world.updateCanopyOcclusion(this.followCamera.camera.position, this.view === 'ride' ? this.rider.root.position : null, deltaSeconds)
    this.renderer.render(this.scene, this.view === 'ride' ? this.followCamera.camera : this.previewCamera)
    this.sampleFrames += 1
    const sampleDuration = time - this.sampleStartedAt
    if (sampleDuration >= 500) {
      this.fps = Math.round(this.sampleFrames * 1000 / sampleDuration)
      this.sampleFrames = 0
      this.sampleStartedAt = time
    }
    const eventSnapshot = this.eventSystem.getSnapshot()
    const snapshotInterval = eventSnapshot.active?.sprint?.active ? 33 : 100
    if (time - this.lastSnapshotTime >= snapshotInterval) {
      const state = this.controller.state
      let instanceCount = 0
      this.scene.traverse((object) => { if (object instanceof InstancedMesh && object.visible) instanceCount += object.count })
      this.onSnapshot({
        view: this.view,
        cameraMode: this.cameraMode,
        riderPreview: this.riderPreview,
        muted: this.muted,
        shift: {
          durationSec: SHIFT_DURATION_SECONDS,
          elapsedSec: this.shiftElapsed,
          remainingSec: Math.max(0, SHIFT_DURATION_SECONDS - this.shiftElapsed),
          clockLabel: formatShiftClock(this.shiftElapsed),
          ended: this.shiftEnded,
        },
        distraction: {
          phoneOpen: this.phoneOpen,
          active: this.distractionActive,
          level: this.distractionLevel,
          elapsedSec: this.distractedElapsedSec,
          warningCount: this.distractionWarningCount,
        },
        events: eventSnapshot,
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
        instanceCount,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        pixelRatio: this.renderer.getPixelRatio(),
      })
      this.lastSnapshotTime = time
    }
    this.frameId = requestAnimationFrame(this.tick)
  }
}
