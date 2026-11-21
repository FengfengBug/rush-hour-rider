import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import type { EngineSnapshot } from './types'

export class GameEngine {
  private readonly container: HTMLElement
  private readonly onSnapshot: (snapshot: EngineSnapshot) => void
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 180)
  private readonly renderer: WebGLRenderer
  private readonly resizeObserver: ResizeObserver
  private readonly sunlight = new DirectionalLight('#ffe3b2', 3)
  private readonly ground = new Mesh(
    new PlaneGeometry(240, 240),
    new MeshStandardMaterial({ color: '#b5bea3', roughness: 1 }),
  )
  private readonly referenceCube = new Mesh(
    new BoxGeometry(2.5, 2.5, 2.5),
    new MeshStandardMaterial({ color: '#efb23c', roughness: 0.85 }),
  )
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
    this.renderer.domElement.setAttribute('aria-label', '暖色日光下，黄色参考方块在地面上旋转并投射实时阴影')
    this.container.append(this.renderer.domElement)

    this.scene.background = new Color('#e9eee4')
    this.scene.fog = new Fog('#e9eee4', 35, 100)
    this.scene.add(new HemisphereLight('#f5f4e7', '#979d7c', 1.6))

    this.sunlight.position.set(-8, 14, 8)
    this.sunlight.castShadow = true
    this.sunlight.shadow.mapSize.set(1024, 1024)
    this.sunlight.shadow.camera.left = -10
    this.sunlight.shadow.camera.right = 10
    this.sunlight.shadow.camera.top = 10
    this.sunlight.shadow.camera.bottom = -10
    this.sunlight.shadow.camera.near = 0.5
    this.sunlight.shadow.camera.far = 50
    this.sunlight.shadow.normalBias = 0.02
    this.sunlight.shadow.bias = -0.0001
    this.scene.add(this.sunlight)

    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    this.referenceCube.position.y = 1.25
    this.referenceCube.rotation.y = Math.PI / 6
    this.referenceCube.castShadow = true
    this.referenceCube.receiveShadow = true
    this.scene.add(this.referenceCube)

    this.camera.position.set(8, 6, 11)
    this.camera.lookAt(0, 1, 0)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    window.addEventListener('resize', this.resize)
    this.resize()
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
    this.ground.geometry.dispose()
    this.ground.material.dispose()
    this.referenceCube.geometry.dispose()
    this.referenceCube.material.dispose()
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
    this.camera.aspect = this.viewportWidth / this.viewportHeight
    this.camera.updateProjectionMatrix()
  }

  private readonly tick = (time: number) => {
    const deltaSeconds = Math.min((time - this.previousTime) / 1000, 0.05)
    this.previousTime = time
    this.referenceCube.rotation.y += deltaSeconds * 0.55
    this.renderer.render(this.scene, this.camera)

    this.sampleFrames += 1
    const sampleDuration = time - this.sampleStartedAt
    if (sampleDuration >= 500) {
      this.fps = Math.round((this.sampleFrames * 1000) / sampleDuration)
      this.sampleFrames = 0
      this.sampleStartedAt = time
    }

    if (time - this.lastSnapshotTime >= 100) {
      this.onSnapshot({
        fps: this.fps,
        drawCalls: this.renderer.info.render.calls,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        pixelRatio: this.renderer.getPixelRatio(),
      })
      this.lastSnapshotTime = time
    }

    this.frameId = requestAnimationFrame(this.tick)
  }
}
