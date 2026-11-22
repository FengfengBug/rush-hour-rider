import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import type { Aabb2, InteriorMode, InteriorTheme } from './types'

export interface InteriorWalkInput {
  forward: number
  strafe: number
}

export interface InteriorEnterOptions {
  theme: InteriorTheme
  landmarkId: string
  landmarkName: string
  orderId: string | null
  merchantName: string | null
}

const ROOM_HALF_X = 9.0
const ROOM_HALF_Z = 8.8
const PLAYER_RADIUS = 0.55
const WALK_SPEED = 4.6
const EYE_HEIGHT = 1.62
const DROP_POINT = { x: 3.45, z: -1.65 }
const DROP_TRIGGER_RADIUS = 2.85

function makeSignTexture(
  title: string,
  subtitle: string,
  bgColor: string,
  accentColor: string,
  textColor = '#fff7e2',
): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 160
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = accentColor
  ctx.lineWidth = 6
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16)
  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 50px "Microsoft YaHei", sans-serif'
  const titleSize = Math.min(50, (50 * 460) / Math.max(1, ctx.measureText(title).width))
  ctx.font = `800 ${titleSize}px "Microsoft YaHei", sans-serif`
  ctx.fillText(title, 256, 62)
  ctx.fillStyle = accentColor
  ctx.font = '700 24px "Microsoft YaHei", sans-serif'
  ctx.fillText(subtitle, 256, 118)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function makeFloorTexture(theme: InteriorTheme): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = theme === 'cbd' ? '#e7e2d5' : '#eef2ec'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = theme === 'cbd' ? '#d4cdbd' : '#d8e3db'
  ctx.lineWidth = 3
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, 256)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(256, i)
    ctx.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function makeReceiptTexture(orderId: string, merchantName: string): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 320
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fffdf6'
  ctx.fillRect(0, 0, 256, 320)
  ctx.fillStyle = '#f8bd27'
  ctx.fillRect(0, 0, 256, 66)
  ctx.fillStyle = '#23322c'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 32px "Microsoft YaHei", sans-serif'
  ctx.fillText('极速达外卖', 128, 34)
  ctx.fillStyle = '#26302a'
  ctx.font = '800 44px "Segoe UI", sans-serif'
  ctx.fillText(`#${orderId}`, 128, 126)
  ctx.font = '700 24px "Microsoft YaHei", sans-serif'
  const mSize = Math.min(24, (24 * 218) / Math.max(1, ctx.measureText(merchantName).width))
  ctx.font = `700 ${mSize}px "Microsoft YaHei", sans-serif`
  ctx.fillText(merchantName, 128, 184)
  ctx.strokeStyle = '#c8cbbd'
  ctx.setLineDash([8, 6])
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(24, 224)
  ctx.lineTo(232, 224)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#5a6656'
  ctx.font = '600 18px "Microsoft YaHei", sans-serif'
  ctx.fillText('午高峰保温直达 · 请趁热享用', 128, 266)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export class InteriorScene {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(54, 16 / 9, 0.08, 80)

  mode: InteriorMode = 'none'
  theme: InteriorTheme | null = null
  landmarkId: string | null = null
  landmarkName: string | null = null
  orderId: string | null = null
  merchantName: string | null = null
  elapsedSec = 0
  photoFlash = 0
  photoSuccessText: string | null = null

  private readonly roomRoot = new Group()
  private readonly pointingArm = new Group()
  private readonly geometries = new Set<BufferGeometry>()
  private readonly materials = new Set<Material>()
  private readonly textures = new Set<CanvasTexture>()
  private readonly roomGeometries: BufferGeometry[] = []
  private readonly roomMaterials: Material[] = []
  private readonly roomTextures: CanvasTexture[] = []
  private readonly colliders: Aabb2[] = []

  private dropRing: Mesh | null = null
  private riderBag: Group | null = null
  private playerX = 0
  private playerZ = 6.6
  private yaw = 0
  private pitch = 0
  private targetYaw = 0
  private targetPitch = 0
  private walkPhase = 0
  private photoAnim = 0
  private photoClock = 0
  private successTimer = 0
  private readonly camPos = new Vector3()
  private readonly camLook = new Vector3()

  constructor() {
    this.scene.background = new Color('#dce4df')
    this.scene.add(new HemisphereLight('#fff9ee', '#9eb0a5', 1.45))
    this.scene.add(new AmbientLight('#fff4e0', 0.4))
    const keyLight = new DirectionalLight('#fff4de', 1.4)
    keyLight.position.set(5, 11, 7)
    this.scene.add(keyLight)
    this.scene.add(this.roomRoot)
    this.scene.add(this.camera)
    this.buildPointingArm()
    this.pointingArm.visible = false
    this.camera.add(this.pointingArm)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(0.25, width / Math.max(1, height))
    this.camera.updateProjectionMatrix()
  }

  enter(options: InteriorEnterOptions): void {
    this.clearRoom()
    this.mode = 'walk'
    this.theme = options.theme
    this.landmarkId = options.landmarkId
    this.landmarkName = options.landmarkName
    this.orderId = options.orderId
    this.merchantName = options.merchantName
    this.elapsedSec = 0
    this.photoFlash = 0
    this.photoSuccessText = null
    this.successTimer = 0
    this.playerX = 0
    this.playerZ = 6.6
    this.yaw = 0
    this.pitch = -0.04
    this.targetYaw = 0
    this.targetPitch = -0.04
    this.walkPhase = 0
    this.photoAnim = 0
    this.pointingArm.visible = false
    this.buildLobby(options)
    this.syncCamera(0)
  }

  exit(): void {
    this.clearRoom()
    this.mode = 'none'
    this.theme = null
    this.landmarkId = null
    this.landmarkName = null
    this.orderId = null
    this.merchantName = null
    this.elapsedSec = 0
    this.photoFlash = 0
    this.photoSuccessText = null
    this.successTimer = 0
    this.pointingArm.visible = false
  }

  openPhotoMode(): boolean {
    if (this.mode !== 'walk' || !this.orderId || !this.atDropZone) return false
    this.mode = 'photo'
    this.photoAnim = 0
    this.photoClock = 0
    if (this.riderBag) this.riderBag.visible = true
    if (this.dropRing) this.dropRing.visible = false
    this.pointingArm.visible = true
    this.syncCamera(0)
    return true
  }

  closePhotoMode(): void {
    if (this.mode !== 'photo') return
    this.mode = 'walk'
    this.pointingArm.visible = false
    if (this.dropRing) this.dropRing.visible = true
    this.syncCamera(0)
  }

  triggerShutter(successText: string): void {
    this.photoFlash = 1
    this.photoSuccessText = successText
    this.successTimer = 1.25
  }

  get atDropZone(): boolean {
    return this.dropDistance <= DROP_TRIGGER_RADIUS
  }

  get dropDistance(): number {
    return Math.hypot(this.playerX - DROP_POINT.x, this.playerZ - DROP_POINT.z)
  }

  setPointerLook(normalizedX: number, normalizedY: number): void {
    if (this.mode !== 'walk') return
    const clampedX = Math.max(-1, Math.min(1, normalizedX))
    const clampedY = Math.max(-1, Math.min(1, normalizedY))
    const deadzone = (value: number, dz: number) => {
      const abs = Math.abs(value)
      if (abs <= dz) return 0
      return Math.sign(value) * Math.pow((abs - dz) / (1 - dz), 1.1)
    }
    // 室内同样限制左右 ≤ 270°（±135°），上下俯仰安全限幅
    this.targetYaw = -deadzone(clampedX, 0.05) * (Math.PI * 0.72)
    this.targetPitch = -deadzone(clampedY, 0.06) * 0.42
  }

  update(deltaSeconds: number, input: InteriorWalkInput): boolean {
    if (this.mode === 'none') return false
    const dt = Math.max(0, Math.min(deltaSeconds, 0.05))
    this.elapsedSec += dt
    if (this.photoFlash > 0) this.photoFlash = Math.max(0, this.photoFlash - dt * 4.5)
    if (this.successTimer > 0) {
      this.successTimer = Math.max(0, this.successTimer - dt)
      if (this.successTimer <= 0) return true
    }

    if (this.mode === 'walk') {
      this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-10 * dt))
      this.pitch += (this.targetPitch - this.pitch) * (1 - Math.exp(-10 * dt))
      const forwardX = -Math.sin(this.yaw)
      const forwardZ = -Math.cos(this.yaw)
      const rightX = Math.cos(this.yaw)
      const rightZ = -Math.sin(this.yaw)
      let moveX = forwardX * input.forward + rightX * input.strafe
      let moveZ = forwardZ * input.forward + rightZ * input.strafe
      const length = Math.hypot(moveX, moveZ)
      if (length > 0.001) {
        moveX = (moveX / length) * WALK_SPEED * dt
        moveZ = (moveZ / length) * WALK_SPEED * dt
        this.movePlayer(moveX, moveZ)
        this.walkPhase += dt * 9.5
      } else {
        this.walkPhase = 0
      }

      if (this.dropRing) {
        const pulse = 1 + Math.sin(this.elapsedSec * 4.2) * 0.08
        this.dropRing.scale.setScalar(pulse)
      }
      if (this.riderBag) {
        this.riderBag.visible = this.orderId !== null && this.atDropZone
      }
    } else if (this.mode === 'photo') {
      this.photoAnim = Math.min(1, this.photoAnim + dt / 0.26)
      this.photoClock += dt
    }

    this.syncCamera(dt)
    return false
  }

  private movePlayer(dx: number, dz: number): void {
    let nextX = Math.max(-ROOM_HALF_X + PLAYER_RADIUS, Math.min(ROOM_HALF_X - PLAYER_RADIUS, this.playerX + dx))
    for (const box of this.colliders) {
      if (this.playerZ <= box.minZ - PLAYER_RADIUS || this.playerZ >= box.maxZ + PLAYER_RADIUS) continue
      if (this.playerX <= box.minX - PLAYER_RADIUS && nextX > box.minX - PLAYER_RADIUS) nextX = box.minX - PLAYER_RADIUS
      else if (this.playerX >= box.maxX + PLAYER_RADIUS && nextX < box.maxX + PLAYER_RADIUS) nextX = box.maxX + PLAYER_RADIUS
    }
    let nextZ = Math.max(-ROOM_HALF_Z + PLAYER_RADIUS, Math.min(ROOM_HALF_Z - PLAYER_RADIUS, this.playerZ + dz))
    for (const box of this.colliders) {
      if (nextX <= box.minX - PLAYER_RADIUS || nextX >= box.maxX + PLAYER_RADIUS) continue
      if (this.playerZ <= box.minZ - PLAYER_RADIUS && nextZ > box.minZ - PLAYER_RADIUS) nextZ = box.minZ - PLAYER_RADIUS
      else if (this.playerZ >= box.maxZ + PLAYER_RADIUS && nextZ < box.maxZ + PLAYER_RADIUS) nextZ = box.maxZ + PLAYER_RADIUS
    }
    this.playerX = nextX
    this.playerZ = nextZ
  }

  private syncCamera(dt: number): void {
    if (this.mode === 'photo') {
      const ease = 1 - Math.pow(1 - this.photoAnim, 3)
      // 第一人称拍照构图：站在外卖存放桌前略低头 23° 对准刚放好的外卖袋，大堂背景清晰可见。
      this.camPos.set(DROP_POINT.x - 0.04, 1.56, DROP_POINT.z + 1.06)
      this.camLook.set(DROP_POINT.x + 0.02, 1.14, DROP_POINT.z)
      if (dt > 0) this.camera.position.lerp(this.camPos, 1 - Math.exp(-16 * dt))
      else this.camera.position.copy(this.camPos)
      this.camera.lookAt(this.camLook)

      // 左手黄袖骑手手臂与伸出食指平滑抬入画面，自然指向外卖袋中心！
      const swayX = Math.sin(this.photoClock * 2.1) * 0.004
      const swayY = Math.cos(this.photoClock * 2.7) * 0.003
      this.pointingArm.position.set(
        -0.02 + swayX,
        -0.24 * (1 - ease) + swayY,
        0,
      )
      this.pointingArm.rotation.set(-0.22 * (1 - ease), 0, 0)
      return
    }

    const bob = this.walkPhase > 0 ? Math.sin(this.walkPhase) * 0.032 : 0
    this.camera.position.set(this.playerX, EYE_HEIGHT + bob, this.playerZ)
    const lookX = this.playerX - Math.sin(this.yaw) * Math.cos(this.pitch) * 4
    const lookY = EYE_HEIGHT + bob + Math.sin(this.pitch) * 4
    const lookZ = this.playerZ - Math.cos(this.yaw) * Math.cos(this.pitch) * 4
    this.camera.lookAt(lookX, lookY, lookZ)
  }

  private buildPointingArm(): void {
    // 相机局部坐标系（-Z 为镜头正前方，+X 右，+Y 上）：左臂自左下方伸入，食指直指画面中心偏下的外卖袋。
    const yellowMat = this.trackMat(new MeshStandardMaterial({ color: '#f8bd27', roughness: 0.65, flatShading: true }))
    const navyMat = this.trackMat(new MeshStandardMaterial({ color: '#234956', roughness: 0.72, flatShading: true }))
    const reflectorMat = this.trackMat(new MeshStandardMaterial({ color: '#e6edcc', roughness: 0.45, flatShading: true }))
    const skinMat = this.trackMat(new MeshStandardMaterial({ color: '#e6b289', roughness: 0.7, flatShading: true }))
    const nailMat = this.trackMat(new MeshStandardMaterial({ color: '#f5d9c3', roughness: 0.5, flatShading: true }))

    const armPivot = new Group()
    // 整体朝向指向袋子中心 (0, -0.02, -1.11)
    armPivot.position.set(-0.23, -0.22, -0.44)
    armPivot.rotation.set(0.14, -0.44, -0.24)
    this.pointingArm.add(armPivot)

    // 1. 黄色骑手服前臂袖筒
    const sleeveGeo = this.trackGeo(new CylinderGeometry(0.058, 0.072, 0.34, 10))
    sleeveGeo.rotateX(Math.PI / 2)
    const sleeve = new Mesh(sleeveGeo, yellowMat)
    sleeve.position.set(0, 0, 0.08)
    armPivot.add(sleeve)

    // 2. 深蓝袖口与反光条
    const cuffGeo = this.trackGeo(new CylinderGeometry(0.056, 0.06, 0.045, 10))
    cuffGeo.rotateX(Math.PI / 2)
    const cuff = new Mesh(cuffGeo, navyMat)
    cuff.position.set(0, 0, -0.095)
    armPivot.add(cuff)

    const stripeGeo = this.trackGeo(new CylinderGeometry(0.061, 0.063, 0.022, 10))
    stripeGeo.rotateX(Math.PI / 2)
    const stripe = new Mesh(stripeGeo, reflectorMat)
    stripe.position.set(0, 0, -0.04)
    armPivot.add(stripe)

    // 3. 手腕与手掌
    const wristGeo = this.trackGeo(new CylinderGeometry(0.04, 0.045, 0.05, 10))
    wristGeo.rotateX(Math.PI / 2)
    const wrist = new Mesh(wristGeo, skinMat)
    wrist.position.set(0, 0, -0.13)
    armPivot.add(wrist)

    const palmGeo = this.trackGeo(new BoxGeometry(0.095, 0.042, 0.105))
    const palm = new Mesh(palmGeo, skinMat)
    palm.position.set(0.005, -0.002, -0.195)
    armPivot.add(palm)

    // 4. 清晰伸直的食指（最核心标志动作：直指外卖！）
    const fingerBaseGeo = this.trackGeo(new CylinderGeometry(0.0145, 0.0165, 0.085, 8))
    fingerBaseGeo.rotateX(Math.PI / 2)
    const indexBase = new Mesh(fingerBaseGeo, skinMat)
    indexBase.position.set(0.032, 0.005, -0.285)
    indexBase.rotation.set(-0.04, -0.05, 0)
    armPivot.add(indexBase)

    const fingerTipGeo = this.trackGeo(new CylinderGeometry(0.0115, 0.014, 0.055, 8))
    fingerTipGeo.rotateX(Math.PI / 2)
    const indexTip = new Mesh(fingerTipGeo, skinMat)
    indexTip.position.set(0.035, 0.003, -0.352)
    indexTip.rotation.set(-0.06, -0.05, 0)
    armPivot.add(indexTip)

    const tipBallGeo = this.trackGeo(new SphereGeometry(0.0115, 8, 6))
    const tipBall = new Mesh(tipBallGeo, nailMat)
    tipBall.position.set(0.036, 0.002, -0.38)
    armPivot.add(tipBall)

    // 5. 自然收拢的中指、无名指、小指
    const curledGeo = this.trackGeo(new BoxGeometry(0.02, 0.032, 0.052))
    const curledOffsets = [
      { x: 0.007, y: -0.018, z: -0.252, scale: 1.0 },
      { x: -0.016, y: -0.02, z: -0.246, scale: 0.94 },
      { x: -0.037, y: -0.021, z: -0.238, scale: 0.84 },
    ]
    for (const f of curledOffsets) {
      const mesh = new Mesh(curledGeo, skinMat)
      mesh.position.set(f.x, f.y, f.z)
      mesh.scale.setScalar(f.scale)
      mesh.rotation.set(0.55, 0, 0)
      armPivot.add(mesh)
    }

    // 6. 自然内收的大拇指
    const thumbGeo = this.trackGeo(new CylinderGeometry(0.014, 0.017, 0.072, 8))
    thumbGeo.rotateZ(Math.PI / 2)
    const thumb = new Mesh(thumbGeo, skinMat)
    thumb.position.set(0.044, -0.012, -0.215)
    thumb.rotation.set(0.1, 0.55, -0.25)
    armPivot.add(thumb)
  }

  private buildLobby(options: InteriorEnterOptions): void {
    const isCbd = options.theme === 'cbd'
    const boxGeo = this.trackRoomGeo(new BoxGeometry(1, 1, 1))
    const cylGeo = this.trackRoomGeo(new CylinderGeometry(1, 1, 1, 10))
    const sphereGeo = this.trackRoomGeo(new SphereGeometry(1, 10, 8))
    const planeGeo = this.trackRoomGeo(new PlaneGeometry(1, 1))

    const floorTex = this.trackRoomTex(makeFloorTexture(options.theme))
    floorTex.repeat.set(6, 6)
    floorTex.wrapS = floorTex.wrapT = 1000 // RepeatWrapping
    const floorMat = this.trackRoomMat(new MeshStandardMaterial({ map: floorTex, roughness: 0.45, metalness: 0.05 }))
    const wallMat = this.trackRoomMat(new MeshStandardMaterial({ color: isCbd ? '#dfe6e4' : '#f2f5ef', roughness: 0.85, flatShading: true }))
    const wainscotMat = this.trackRoomMat(new MeshStandardMaterial({ color: isCbd ? '#54737e' : '#8cb9a4', roughness: 0.72, flatShading: true }))
    const ceilingMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#eef1ea', roughness: 0.9 }))
    const lightStripMat = this.trackRoomMat(new MeshBasicMaterial({ color: '#fff9e6', toneMapped: false }))
    const woodMat = this.trackRoomMat(new MeshStandardMaterial({ color: isCbd ? '#a67b51' : '#d8d4c5', roughness: 0.75, flatShading: true }))
    const metalMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#6b7d82', roughness: 0.45, metalness: 0.35, flatShading: true }))
    const glassMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#8ab8c4', roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.48 }))
    const darkMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#2b3a38', roughness: 0.75, flatShading: true }))
    const redCrossMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#c4453d', roughness: 0.6, flatShading: true }))

    const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, mat: Material, collide = false) => {
      const m = new Mesh(boxGeo, mat)
      m.position.set(x, y, z)
      m.scale.set(w, h, d)
      this.roomRoot.add(m)
      if (collide) {
        this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 })
      }
      return m
    }

    // 地板与天花板
    const floor = new Mesh(planeGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.scale.set(ROOM_HALF_X * 2 + 1, ROOM_HALF_Z * 2 + 1, 1)
    this.roomRoot.add(floor)

    addBox(0, 5.9, 0, ROOM_HALF_X * 2 + 1, 0.3, ROOM_HALF_Z * 2 + 1, ceilingMat)
    for (const lx of [-5, 0, 5]) {
      addBox(lx, 5.72, -1, 0.55, 0.06, 13, lightStripMat)
    }

    // 四面墙 + 踢脚护墙板（严格垂直堆叠零共面 Z-Fighting）
    const addWall = (x: number, z: number, w: number, d: number) => {
      addBox(x, 0.6, z, w, 1.2, d, wainscotMat)
      addBox(x, 3.5, z, w, 4.6, d, wallMat)
    }
    addWall(0, -ROOM_HALF_Z - 0.25, ROOM_HALF_X * 2 + 1, 0.5)
    addWall(-ROOM_HALF_X - 0.25, 0, 0.5, ROOM_HALF_Z * 2 + 1)
    addWall(ROOM_HALF_X + 0.25, 0, 0.5, ROOM_HALF_Z * 2 + 1)
    // 入口玻璃幕墙（背后 z = +ROOM_HALF_Z）
    addBox(-5.2, 2.9, ROOM_HALF_Z + 0.15, 7.6, 5.8, 0.3, glassMat)
    addBox(5.2, 2.9, ROOM_HALF_Z + 0.15, 7.6, 5.8, 0.3, glassMat)
    addBox(0, 4.4, ROOM_HALF_Z + 0.15, 3.2, 2.8, 0.32, metalMat)

    // 主视觉大堂背景墙标牌
    const mainSignTex = this.trackRoomTex(
      makeSignTexture(
        options.landmarkName,
        isCbd ? 'CBD 一楼大堂 · 访客与外卖分流区' : '门诊一楼大厅 · 导诊与外卖存放区',
        isCbd ? '#284550' : '#2d6c5d',
        isCbd ? '#f4cc6a' : '#d9f2e3',
      ),
    )
    const mainSign = new Mesh(planeGeo, this.trackRoomMat(new MeshBasicMaterial({ map: mainSignTex, toneMapped: false })))
    mainSign.position.set(0, 3.8, -ROOM_HALF_Z + 0.08)
    mainSign.scale.set(6.8, 2.1, 1)
    this.roomRoot.add(mainSign)

    // 中央服务台 / 导诊台
    addBox(-1.4, 0.55, -5.2, 5.4, 1.1, 1.3, woodMat, true)
    addBox(-1.4, 1.14, -5.2, 5.6, 0.08, 1.45, wallMat)
    if (isCbd) {
      // CBD 柱廊 + 电梯门 + 访客闸机
      for (const cx of [-6.4, 6.4]) {
        for (const cz of [-4.2, 2.6]) {
          addBox(cx, 2.9, cz, 0.85, 5.8, 0.85, metalMat, true)
        }
      }
      for (const ex of [-3.4, 0, 3.4]) {
        addBox(ex, 1.35, -ROOM_HALF_Z + 0.12, 1.9, 2.7, 0.16, metalMat)
        addBox(ex, 2.95, -ROOM_HALF_Z + 0.14, 0.7, 0.24, 0.1, darkMat)
      }
      for (const gx of [-4.6, -3.2, -1.8]) {
        addBox(gx, 0.52, -1.6, 0.28, 1.04, 1.4, metalMat, true)
      }
    } else {
      // 医院红十字标识 + 等候座椅排
      addBox(-1.4, 2.15, -5.2, 1.4, 0.36, 0.16, redCrossMat)
      addBox(-1.4, 2.15, -5.2, 0.36, 1.4, 0.18, redCrossMat)
      for (const bz of [-1.2, 2.2]) {
        addBox(-5.2, 0.38, bz, 3.6, 0.14, 0.7, wainscotMat, true)
        addBox(-5.2, 0.72, bz - 0.3, 3.6, 0.55, 0.1, wainscotMat)
      }
    }

    // 轻量化室内人物剪影（让大堂有人流氛围）
    const npcColors = isCbd ? ['#385266', '#5e6d74', '#2c3d47', '#866b52'] : ['#eef4f0', '#588a78', '#70848a', '#b68964']
    const npcSpots: [number, number][] = [
      [-1.4, -6.2],
      [-5.2, -2.5],
      [0.4, -2.8],
      [-4.8, 1.4],
    ]
    npcSpots.forEach(([nx, nz], idx) => {
      const shirtMat = this.trackRoomMat(new MeshStandardMaterial({ color: npcColors[idx % npcColors.length], roughness: 0.78, flatShading: true }))
      const skinNpc = this.trackRoomMat(new MeshStandardMaterial({ color: '#e4b48c', roughness: 0.72, flatShading: true }))
      const body = new Mesh(cylGeo, shirtMat)
      body.position.set(nx, 0.92, nz)
      body.scale.set(0.24, 1.0, 0.24)
      this.roomRoot.add(body)
      const head = new Mesh(sphereGeo, skinNpc)
      head.position.set(nx, 1.62, nz)
      head.scale.setScalar(0.18)
      this.roomRoot.add(head)
    })

    // 外卖存放桌 / 架（核心交付点！）
    const tableX = DROP_POINT.x
    const tableZ = DROP_POINT.z
    addBox(tableX, 0.46, tableZ, 2.5, 0.92, 1.15, darkMat, true)
    addBox(tableX, 0.95, tableZ, 2.65, 0.08, 1.25, woodMat)
    // 后挡板与醒目“外卖存放处”招牌
    addBox(tableX, 1.65, tableZ - 0.56, 2.55, 1.32, 0.12, metalMat)
    const rackSignTex = this.trackRoomTex(
      makeSignTexture(
        '外卖存放处',
        isCbd ? '一楼大堂专架 · 放好拍照送达' : '门诊大厅专桌 · 放好拍照送达',
        '#254d3f',
        '#ffd662',
      ),
    )
    const rackSign = new Mesh(planeGeo, this.trackRoomMat(new MeshBasicMaterial({ map: rackSignTex, toneMapped: false })))
    rackSign.position.set(tableX, 1.82, tableZ - 0.48)
    rackSign.scale.set(2.3, 0.68, 1)
    this.roomRoot.add(rackSign)

    // 桌上已有的邻居外卖袋（增强真实感）
    const otherBag1 = this.trackRoomMat(new MeshStandardMaterial({ color: '#d87a4e', roughness: 0.75, flatShading: true }))
    const otherBag2 = this.trackRoomMat(new MeshStandardMaterial({ color: '#538fa6', roughness: 0.75, flatShading: true }))
    addBox(tableX - 0.85, 1.15, tableZ - 0.12, 0.28, 0.32, 0.22, otherBag1)
    addBox(tableX - 0.45, 1.13, tableZ + 0.05, 0.24, 0.28, 0.2, otherBag2)

    // 地面/桌面绿色引导光环（走到桌前即显放餐袋）
    const ringGeo = this.trackRoomGeo(new RingGeometry(0.45, 0.62, 32))
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = this.trackRoomMat(new MeshBasicMaterial({ color: '#4ad48c', side: DoubleSide, transparent: true, opacity: 0.88, toneMapped: false }))
    const ring = new Mesh(ringGeo, ringMat)
    ring.position.set(tableX, 0.04, tableZ + 1.25)
    this.roomRoot.add(ring)
    this.dropRing = ring

    // 玩家本单「极速达」牛皮纸/保温外卖袋 + 动态小票贴纸
    const bagGroup = new Group()
    bagGroup.position.set(tableX + 0.05, 0.99, tableZ + 0.02)
    const kraftMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#e6be7d', roughness: 0.82, flatShading: true }))
    const yellowBandMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#f8bd27', roughness: 0.65, flatShading: true }))
    const handleMat = this.trackRoomMat(new MeshStandardMaterial({ color: '#5b4428', roughness: 0.7, flatShading: true }))

    const bagBody = new Mesh(boxGeo, kraftMat)
    bagBody.position.set(0, 0.19, 0)
    bagBody.scale.set(0.34, 0.38, 0.24)
    bagGroup.add(bagBody)

    const bagFold = new Mesh(boxGeo, yellowBandMat)
    bagFold.position.set(0, 0.39, 0)
    bagFold.scale.set(0.35, 0.055, 0.25)
    bagGroup.add(bagFold)

    const handleGeo = this.trackRoomGeo(new TorusGeometry(0.065, 0.011, 6, 12, Math.PI))
    for (const hz of [-0.07, 0.07]) {
      const handle = new Mesh(handleGeo, handleMat)
      handle.position.set(0, 0.41, hz)
      bagGroup.add(handle)
    }

    const receiptTex = this.trackRoomTex(makeReceiptTexture(options.orderId ?? 'R001', options.merchantName ?? '极速达商户'))
    const receiptMat = this.trackRoomMat(new MeshBasicMaterial({ map: receiptTex, toneMapped: false }))
    const receipt = new Mesh(planeGeo, receiptMat)
    receipt.position.set(0, 0.21, 0.125)
    receipt.scale.set(0.22, 0.27, 1)
    bagGroup.add(receipt)

    bagGroup.visible = false
    this.roomRoot.add(bagGroup)
    this.riderBag = bagGroup
  }

  private clearRoom(): void {
    this.roomRoot.clear()
    this.colliders.length = 0
    this.dropRing = null
    this.riderBag = null
    for (const g of this.roomGeometries) g.dispose()
    for (const m of this.roomMaterials) m.dispose()
    for (const t of this.roomTextures) t.dispose()
    this.roomGeometries.length = 0
    this.roomMaterials.length = 0
    this.roomTextures.length = 0
  }

  private trackGeo<T extends BufferGeometry>(g: T): T {
    this.geometries.add(g)
    return g
  }

  private trackMat<T extends Material>(m: T): T {
    this.materials.add(m)
    return m
  }

  private trackRoomGeo<T extends BufferGeometry>(g: T): T {
    this.roomGeometries.push(g)
    return g
  }

  private trackRoomMat<T extends Material>(m: T): T {
    this.roomMaterials.push(m)
    return m
  }

  private trackRoomTex(t: CanvasTexture): CanvasTexture {
    this.roomTextures.push(t)
    return t
  }

  dispose(): void {
    this.clearRoom()
    this.pointingArm.clear()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    for (const t of this.textures) t.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.textures.clear()
    this.scene.clear()
  }
}

// Keep tone mapping reference imported cleanly if needed by future lighting tweaks.
export const INTERIOR_TONE_MAPPING = ACESFilmicToneMapping
