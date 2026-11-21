import { Box3, PerspectiveCamera, Ray, Vector3 } from 'three'
import type { CityBuilding, Point2, RideCameraMode } from './types'

const MODES: Record<RideCameraMode, { distance: number; height: number; lookAhead: number }> = {
  near: { distance: 8, height: 4.8, lookAhead: 1.1 },
  far: { distance: 13, height: 8, lookAhead: 1.7 },
  overhead: { distance: 12, height: 23, lookAhead: 2 },
}

export class FollowCamera {
  readonly camera = new PerspectiveCamera(52, 16 / 9, 0.1, 1200)

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
  private mode: RideCameraMode = 'near'
  private heading = 0
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
  }

  reset(position: Point2, heading: number): void {
    this.heading = Math.atan2(Math.sin(heading), Math.cos(heading))
    this.prepareGoals(position)
    this.camera.position.copy(this.goal)
    this.lookTarget.copy(this.lookGoal)
    this.positionVelocity.set(0, 0, 0)
    this.lookVelocity.set(0, 0, 0)
    this.camera.lookAt(this.lookTarget)
    this.camera.updateMatrixWorld()
    this.initialized = true
  }

  update(position: Point2, heading: number, deltaSeconds: number): void {
    if (!this.initialized) {
      this.reset(position, heading)
      return
    }
    const dt = deltaSeconds
    const turn = Math.atan2(Math.sin(heading - this.heading), Math.cos(heading - this.heading))
    this.heading += turn * (1 - Math.exp(-10 * dt))
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading))
    this.prepareGoals(position)
    this.spring(this.camera.position, this.positionVelocity, this.goal, 8, dt)
    this.spring(this.lookTarget, this.lookVelocity, this.lookGoal, 11, dt)
    if (this.shortenSegment(this.camera.position)) this.positionVelocity.set(0, 0, 0)
    if (this.shortenSegment(this.lookTarget)) this.lookVelocity.set(0, 0, 0)
    this.camera.lookAt(this.lookTarget)
    this.camera.updateMatrixWorld()
  }

  resize(width: number, height: number): void {
    const w = width
    const h = height
    const portrait = Math.max(0, Math.min(1, (1.1 - w / h) / 0.6))
    this.camera.fov = 52 + portrait * 16
    this.camera.setViewOffset(w, h, 0, -h * portrait * 0.095, w, h)
  }

  private prepareGoals(position: Point2): void {
    const settings = MODES[this.mode]
    const forwardX = Math.sin(this.heading)
    const forwardZ = Math.cos(this.heading)
    this.anchor.set(position.x, 1.2, position.z)
    this.recoverAnchor()
    this.goal.set(
      this.anchor.x - forwardX * settings.distance,
      Math.max(settings.height, this.anchor.y + 0.5),
      this.anchor.z - forwardZ * settings.distance,
    )
    this.lookGoal.set(
      this.anchor.x + forwardX * settings.lookAhead,
      this.anchor.y + 0.25,
      this.anchor.z + forwardZ * settings.lookAhead,
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
