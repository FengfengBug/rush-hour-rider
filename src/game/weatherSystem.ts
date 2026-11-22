import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
} from 'three'
import type { Point2, WeatherMode, WeatherSnapshot } from './types'

const RAIN_PARTICLE_COUNT = 1350
const RAIN_AREA_X = 72
const RAIN_AREA_Z = 72
const RAIN_HEIGHT = 28
const RAIN_FALL_SPEED = 26
const RAIN_WIND_X = 3.4
const AUTO_RAIN_START = 0.45
const AUTO_RAIN_END = 0.76
const RAIN_BONUS_CENTS = 200

const CLEAR_SKY = new Color('#dce7d5')
const RAIN_SKY = new Color('#7f95a9')
const CLEAR_SUN = new Color('#fff0ce')
const RAIN_SUN = new Color('#a6bfd6')
const CLEAR_HEMI_SKY = new Color('#fff7e6')
const RAIN_HEMI_SKY = new Color('#9eb4c8')
const CLEAR_HEMI_GROUND = new Color('#859a80')
const RAIN_HEMI_GROUND = new Color('#4c5c64')

function createRainStreakTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 32, 64)
  const grad = ctx.createLinearGradient(18, 4, 14, 60)
  grad.addColorStop(0, 'rgba(210, 232, 250, 0)')
  grad.addColorStop(0.28, 'rgba(220, 238, 255, 0.55)')
  grad.addColorStop(0.85, 'rgba(235, 246, 255, 0.92)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.strokeStyle = grad
  ctx.lineWidth = 3.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(19, 4)
  ctx.lineTo(13, 60)
  ctx.stroke()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export class WeatherSystem {
  readonly root = new Group()
  private mode: WeatherMode = 'auto'
  private currentIntensity = 0
  private readonly geometry: BufferGeometry
  private readonly material: PointsMaterial
  private readonly texture: CanvasTexture
  private readonly points: Points
  private readonly offsets: Float32Array
  private readonly speeds: Float32Array
  private readonly positions: Float32Array
  private readonly skyWork = new Color()
  private readonly sunWork = new Color()
  private readonly hemiSkyWork = new Color()
  private readonly hemiGroundWork = new Color()

  constructor() {
    this.root.name = 'weather-rain'
    this.offsets = new Float32Array(RAIN_PARTICLE_COUNT * 3)
    this.speeds = new Float32Array(RAIN_PARTICLE_COUNT)
    this.positions = new Float32Array(RAIN_PARTICLE_COUNT * 3)

    let seed = 3301
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }

    for (let i = 0; i < RAIN_PARTICLE_COUNT; i += 1) {
      const i3 = i * 3
      this.offsets[i3] = (rand() - 0.5) * RAIN_AREA_X
      this.offsets[i3 + 1] = rand() * RAIN_HEIGHT
      this.offsets[i3 + 2] = (rand() - 0.5) * RAIN_AREA_Z
      this.speeds[i] = 0.82 + rand() * 0.38
    }

    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.texture = createRainStreakTexture()
    this.material = new PointsMaterial({
      map: this.texture,
      color: '#dceeff',
      size: 1.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    })
    this.points = new Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.visible = false
    this.root.add(this.points)
  }

  get intensity(): number {
    return this.currentIntensity
  }

  get isRaining(): boolean {
    return this.currentIntensity >= 0.35
  }

  reset(): void {
    this.mode = 'auto'
    this.currentIntensity = 0
    this.points.visible = false
    this.material.opacity = 0
  }

  toggleManualWeather(): WeatherMode {
    if (this.mode === 'rain' || (this.mode === 'auto' && this.currentIntensity >= 0.35)) {
      this.mode = 'clear'
    } else {
      this.mode = 'rain'
    }
    return this.mode
  }

  setMode(mode: WeatherMode): void {
    this.mode = mode
  }

  update(deltaSeconds: number, shiftProgress: number, anchor: Point2, outdoorVisible: boolean): void {
    let target = 0
    if (this.mode === 'rain') {
      target = 1
    } else if (this.mode === 'clear') {
      target = 0
    } else if (shiftProgress >= AUTO_RAIN_START && shiftProgress <= AUTO_RAIN_END) {
      target = 1
    }

    const rate = target > this.currentIntensity ? 0.52 : 0.65
    this.currentIntensity += (target - this.currentIntensity) * (1 - Math.exp(-rate * deltaSeconds * 2.2))
    if (Math.abs(target - this.currentIntensity) < 0.004) this.currentIntensity = target

    const visible = outdoorVisible && this.currentIntensity > 0.02
    this.points.visible = visible
    if (!visible) return

    this.material.opacity = 0.68 * this.currentIntensity
    const halfX = RAIN_AREA_X * 0.5
    const halfZ = RAIN_AREA_Z * 0.5
    for (let i = 0; i < RAIN_PARTICLE_COUNT; i += 1) {
      const i3 = i * 3
      const speedScale = this.speeds[i]
      let ox = this.offsets[i3] - RAIN_WIND_X * speedScale * deltaSeconds
      let oy = this.offsets[i3 + 1] - RAIN_FALL_SPEED * speedScale * deltaSeconds
      let oz = this.offsets[i3 + 2]
      if (oy < 0.1) oy += RAIN_HEIGHT
      if (ox < -halfX) ox += RAIN_AREA_X
      else if (ox > halfX) ox -= RAIN_AREA_X
      if (oz < -halfZ) oz += RAIN_AREA_Z
      else if (oz > halfZ) oz -= RAIN_AREA_Z
      this.offsets[i3] = ox
      this.offsets[i3 + 1] = oy
      this.offsets[i3 + 2] = oz
      this.positions[i3] = anchor.x + ox
      this.positions[i3 + 1] = oy
      this.positions[i3 + 2] = anchor.z + oz
    }
    ;(this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true
  }

  applyAtmosphere(
    scene: Scene,
    sunlight: DirectionalLight,
    hemiLight: HemisphereLight,
    setStreetLampGlow: (intensity: number) => void,
    isRideView: boolean,
  ): void {
    const t = this.currentIntensity
    this.skyWork.copy(CLEAR_SKY).lerp(RAIN_SKY, t)
    if (scene.background instanceof Color) {
      scene.background.copy(this.skyWork)
    }
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(this.skyWork)
      if (isRideView) {
        scene.fog.near = 950 + (110 - 950) * t
        scene.fog.far = 2000 + (460 - 2000) * t
      } else {
        scene.fog.near = 950
        scene.fog.far = 2000
      }
    }
    this.sunWork.copy(CLEAR_SUN).lerp(RAIN_SUN, t)
    sunlight.color.copy(this.sunWork)
    sunlight.intensity = 2.7 + (1.15 - 2.7) * t

    this.hemiSkyWork.copy(CLEAR_HEMI_SKY).lerp(RAIN_HEMI_SKY, t)
    this.hemiGroundWork.copy(CLEAR_HEMI_GROUND).lerp(RAIN_HEMI_GROUND, t)
    hemiLight.color.copy(this.hemiSkyWork)
    hemiLight.groundColor.copy(this.hemiGroundWork)
    hemiLight.intensity = 1.8 + (1.05 - 1.8) * t

    setStreetLampGlow(t)
  }

  getSnapshot(): WeatherSnapshot {
    const raining = this.isRaining
    return {
      mode: this.mode,
      raining,
      intensity: this.currentIntensity,
      label: raining ? '午后阵雨' : '晴朗微风',
      rainBonusCents: raining ? RAIN_BONUS_CENTS : 0,
    }
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
    this.root.clear()
    this.root.removeFromParent()
  }
}
