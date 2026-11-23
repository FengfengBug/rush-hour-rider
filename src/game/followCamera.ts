import { Box3, PerspectiveCamera, Ray, Vector3 } from 'three'
import type { CityBuilding, Point2, RideCameraMode } from './types'

const MODES: Record<RideCameraMode, { distance: number; height: number; lookAhead: number }> = {
  near: { distance: 8, height: 4.8, lookAhead: 1.1 },
  far: { distance: 13, height: 8, lookAhead: 1.7 },
  overhead: { distance: 12, height: 23, lookAhead: 2 },
}
const MAX_ORBIT_YAW = Math.PI * 0.75 // 左右各 135°，总横向视角广度严格限制为 270°
const MIN_PITCH = 0.14
const MAX_PITCH = 1.08
const MIN_ZOOM = 0.65
const MAX_ZOOM = 1.45
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const applyDeadzone = (value: number, deadzone: number) => {
  const abs = Math.abs(value)
  if (abs <= deadzone) return 0
  const scaled = Math.min(1, (abs - deadzone) / (1 - deadzone))
  return Math.sign(value) * Math.pow(scaled, 1.15)
}

export class FollowCamera {
  readonly camera = new PerspectiveCamera(52, 16 / 9, 0.35, 1200)

  private readonly obstacles: Box3[]
  private readonly roofHeight: number
  private readonly anchor = new Vector3()
  private readonly goal = new Vector3()
  private readonly lookGoal = new Vector3()
  private readonly lookTarget = new Vector3()
  private readonly positionVelocity = new Vector3()
  private readonly lookVelocity = new Vector3()
  private readonly direction = new Vector3()
  private readonly hit = new Vector3()
  private readonly offset = new Vector3()
  private readonly springTerm = new Vector3()
  private readonly ray = new Ray()
  private readonly lookAtPoint = new Vector3()
  private mode: RideCameraMode = 'near'
  private heading = 0
  private orbitYaw = 0
  private orbitPitch = 0
  private targetOrbitYaw = 0
  private targetOrbitPitch = 0
  private zoomScale = 1
  private baseFov = 52
  private initialized = false

  constructor(buildings: readonly CityBuilding[]) {
    this.obstacles = buildings.map((building) => {
      const padding = building.kind === 'shop' ? 1.85 : 0.45
      const bounds = building.bounds
      return new Box3(
        new Vector3(bounds.minX - padding, -0.3, bounds.minZ - padding),
        new Vector3(bounds.maxX + padding, building.height + 3.3, bounds.maxZ + padding),
      )
    })
    this.roofHeight = this.obstacles.reduce((height, box) => Math.max(height, box.max.y), 1.2)
    this.camera.name = 'ride-follow-camera'
  }

  setMode(mode: RideCameraMode): void {
    this.mode = mode
    this.resetOrbit()
  }

  setPointerLook(normalizedX: number, normalizedY: number): void {
    const sx = applyDeadzone(Math.max(-1, Math.min(1, normalizedX)), 0.05)
    const sy = applyDeadzone(Math.max(-1, Math.min(1, normalizedY)), 0.06)
    this.targetOrbitYaw = Math.max(-MAX_ORBIT_YAW, Math.min(MAX_ORBIT_YAW, -sx * MAX_ORBIT_YAW))
    const basePitch = this.basePitch()
    const rawPitch = basePitch + (sy >= 0 ? sy * 0.52 : sy * 0.28)
    const clampedPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, rawPitch))
    this.targetOrbitPitch = clampedPitch - basePitch
  }

  zoomBy(deltaY: number): void {
    const factor = Math.exp(Math.max(-240, Math.min(240, deltaY)) * 0.00085)
    this.zoomScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoomScale * factor))
  }

  resetOrbit(): void {
    this.orbitYaw = 0
    this.orbitPitch = 0
    this.targetOrbitYaw = 0
    this.targetOrbitPitch = 0
    this.zoomScale = 1
  }

  /** 开局主界面实时缓动环绕镜头，展示鲜活的 8×8 微缩中国街区与动态车流 */
  updateTitleOrbit(center: Point2, elapsedSeconds: number): void {
    if (Math.abs(this.camera.fov - this.baseFov) > 0.01) {
      this.camera.fov = this.baseFov
      this.camera.updateProjectionMatrix()
    }
    const angle = 0.55 + elapsedSeconds * 0.11
    const radius = 54 + Math.sin(elapsedSeconds * 0.24) * 6
    const height = 27 + Math.sin(elapsedSeconds * 0.31) * 3.5
    this.camera.position.set(
      center.x + Math.cos(angle) * radius,
      height,
      center.z + Math.sin(angle) * radius,
    )
    this.lookAtPoint.set(center.x, 4.2, center.z)
    this.camera.lookAt(this.lookAtPoint)
  }

  reset(position: Point2, heading: number): void {
    this.heading = wrapAngle(heading)
    this.resetOrbit()
    this.prepareGoals(position)
    this.camera.fov = this.baseFov
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(this.goal)
    this.lookTarget.copy(this.lookGoal)
    this.positionVelocity.set(0, 0, 0)
    this.lookVelocity.set(0, 0, 0)
    this.camera.lookAt(this.lookTarget)
    this.camera.updateMatrixWorld()
    this.initialized = true
  }

  update(
    position: Point2,
    heading: number,
    deltaSeconds: number,
    speed = 0,
    distraction = 0,
    distractionTime = 0,
    reducedMotion = false,
  ): void {
    if (!this.initialized) {
      this.reset(position, heading)
      return
    }
    const dt = deltaSeconds
    const turn = wrapAngle(heading - this.heading)
    this.heading = wrapAngle(this.heading + turn * (1 - Math.exp(-10 * dt)))

    const yawBlend = 1 - Math.exp(-9 * dt)
    const pitchBlend = 1 - Math.exp(-8 * dt)
    this.orbitYaw += (this.targetOrbitYaw - this.orbitYaw) * yawBlend
    this.orbitPitch += (this.targetOrbitPitch - this.orbitPitch) * pitchBlend
    this.orbitYaw = Math.max(-MAX_ORBIT_YAW, Math.min(MAX_ORBIT_YAW, this.orbitYaw))

    this.prepareGoals(position)
    this.spring(this.camera.position, this.positionVelocity, this.goal, 11, dt)
    this.spring(this.lookTarget, this.lookVelocity, this.lookGoal, 13, dt)
    if (this.shortenSegment(this.camera.position)) this.positionVelocity.set(0, 0, 0)
    if (this.shortenSegment(this.lookTarget)) this.lookVelocity.set(0, 0, 0)
    this.lookAtPoint.copy(this.lookTarget)
    // 极轻微的速度 FOV：最高 +2.6°，增强冲刺感但不做剧烈镜头晃动。
    const speedFov = reducedMotion ? 0 : Math.min(1, Math.max(0, speed) / 16.2) * 2.6
    const targetFov = this.baseFov + speedFov
    if (Math.abs(targetFov - this.camera.fov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-4 * dt))
      this.camera.updateProjectionMatrix()
    }
    if (distraction > 0.01 && !reducedMotion) {
      const sway = Math.sin(distractionTime * 2.1) * 0.16 * distraction
      const bob = Math.cos(distractionTime * 3.4) * 0.045 * distraction
      this.lookAtPoint.x += Math.cos(this.heading) * sway
      this.lookAtPoint.z -= Math.sin(this.heading) * sway
      this.lookAtPoint.y += bob
    }
    this.camera.lookAt(this.lookAtPoint)
    if (distraction > 0.01 && !reducedMotion) {
      this.camera.rotateZ(Math.sin(distractionTime * 2.6) * 0.014 * distraction)
    }
    this.camera.updateMatrixWorld()
  }

  private basePitch(): number {
    const settings = MODES[this.mode]
    return Math.atan2(Math.max(0.5, settings.height - 1.2), settings.distance)
  }

  resize(width: number, height: number): void {
    const w = width
    const h = height
    const portrait = Math.max(0, Math.min(1, (1.1 - w / h) / 0.6))
    this.baseFov = 52 + portrait * 16
    this.camera.fov = this.baseFov
    this.camera.setViewOffset(w, h, 0, -h * portrait * 0.095, w, h)
  }

  private prepareGoals(position: Point2): void {
    const settings = MODES[this.mode]
    const forwardX = Math.sin(this.heading)
    const forwardZ = Math.cos(this.heading)
    this.anchor.set(position.x, 1.2, position.z)
    this.recoverAnchor()

    const baseDy = Math.max(0.5, settings.height - this.anchor.y)
    const baseRadius = Math.hypot(settings.distance, baseDy)
    const radius = baseRadius * this.zoomScale
    const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, Math.atan2(baseDy, settings.distance) + this.orbitPitch))
    const viewYaw = wrapAngle(this.heading + this.orbitYaw)
    const horizontal = Math.cos(pitch) * radius
    const vertical = Math.sin(pitch) * radius

    this.goal.set(
      this.anchor.x - Math.sin(viewYaw) * horizontal,
      Math.max(0.6, this.anchor.y + vertical),
      this.anchor.z - Math.cos(viewYaw) * horizontal,
    )
    const lookAheadScale = Math.max(0, Math.cos(this.orbitYaw))
    this.lookGoal.set(
      this.anchor.x + forwardX * settings.lookAhead * lookAheadScale,
      this.anchor.y + 0.15,
      this.anchor.z + forwardZ * settings.lookAhead * lookAheadScale,
    )
    this.shortenSegment(this.goal)
    this.shortenSegment(this.lookGoal)
  }

  private recoverAnchor(): void {
    for (let pass = 0; pass < 4; pass += 1) {
      let moved = false
      for (const box of this.obstacles) {
        if (!box.containsPoint(this.anchor)) continue
        const left = this.anchor.x - box.min.x
        const right = box.max.x - this.anchor.x
        const back = this.anchor.z - box.min.z
        const front = box.max.z - this.anchor.z
        const nearest = Math.min(left, right, back, front)
        if (nearest === left) this.anchor.x = box.min.x - 0.12
        else if (nearest === right) this.anchor.x = box.max.x + 0.12
        else if (nearest === back) this.anchor.z = box.min.z - 0.12
        else this.anchor.z = box.max.z + 0.12
        moved = true
      }
      if (!moved) return
    }
    for (const box of this.obstacles) {
      if (box.containsPoint(this.anchor)) {
        this.anchor.y = this.roofHeight + 0.12
        return
      }
    }
  }

  private shortenSegment(point: Vector3): boolean {
    this.direction.subVectors(point, this.anchor)
    const length = this.direction.length()
    if (length < 0.00001) return false
    this.direction.divideScalar(length)
    this.ray.set(this.anchor, this.direction)
    let allowed = length
    for (const box of this.obstacles) {
      if (this.ray.intersectBox(box, this.hit)) {
        const distance = this.anchor.distanceTo(this.hit)
        if (distance <= length) allowed = Math.min(allowed, Math.max(0, distance - 0.12))
      }
    }
    if (allowed >= length) return false
    point.copy(this.anchor).addScaledVector(this.direction, allowed)
    return true
  }

  private spring(value: Vector3, velocity: Vector3, target: Vector3, frequency: number, dt: number): void {
    // Exact critically damped step for a fixed target preserves stability across frame rates.
    const decay = Math.exp(-frequency * dt)
    this.offset.subVectors(value, target)
    this.springTerm.copy(velocity).addScaledVector(this.offset, frequency)
    value.copy(target).addScaledVector(this.offset, decay).addScaledVector(this.springTerm, dt * decay)
    velocity.addScaledVector(this.springTerm, -frequency * dt).multiplyScalar(decay)
  }
}
