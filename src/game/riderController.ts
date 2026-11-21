import type { Aabb2, CityLayout, Direction, RiderSnapshot } from './types'

export const RIDER_COLLISION_RADIUS = 1.5
const FACING: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }
const approach = (value: number, target: number, amount: number) => value + Math.max(-amount, Math.min(amount, target - value))

export interface DrivingInput {
  throttle: number
  steering: number
  brake: boolean
  boost: boolean
}

export interface RiderState extends RiderSnapshot {
  velocityX: number
  velocityZ: number
  steeringAngle: number
  leanAngle: number
  wheelTravel: number
}

export class RiderController {
  readonly state: RiderState
  private readonly walls: Aabb2[]
  private readonly bounds: Aabb2
  private readonly spawn: CityLayout['spawn']
  private touchingWall = false

  constructor(layout: CityLayout) {
    const radius = RIDER_COLLISION_RADIUS
    this.walls = layout.colliders.map(({ bounds }) => ({
      minX: bounds.minX - radius, maxX: bounds.maxX + radius,
      minZ: bounds.minZ - radius, maxZ: bounds.maxZ + radius,
    }))
    this.bounds = {
      minX: layout.bounds.minX + radius, maxX: layout.bounds.maxX - radius,
      minZ: layout.bounds.minZ + radius, maxZ: layout.bounds.maxZ - radius,
    }
    this.spawn = layout.spawn
    this.state = {
      x: this.spawn.position.x, z: this.spawn.position.z, heading: FACING[this.spawn.facing],
      speed: 0, velocityX: 0, velocityZ: 0, steeringAngle: 0, leanAngle: 0,
      wheelTravel: 0, distance: 0, battery: 100, braking: false, boosting: false, colliding: false,
    }
  }

  reset() {
    this.stop()
    Object.assign(this.state, {
      x: this.spawn.position.x, z: this.spawn.position.z, heading: FACING[this.spawn.facing],
      wheelTravel: 0, distance: 0, battery: 100,
    })
  }

  stop() {
    this.touchingWall = false
    Object.assign(this.state, {
      speed: 0, velocityX: 0, velocityZ: 0, steeringAngle: 0, leanAngle: 0,
      braking: false, boosting: false, colliding: false,
    })
  }

  update(deltaSeconds: number, input: DrivingInput) {
    this.state.colliding = false
    const steps = Math.ceil(deltaSeconds * 120)
    for (let step = 0; step < steps; step += 1) this.step(deltaSeconds / steps, input)
  }

  private step(dt: number, input: DrivingInput) {
    const state = this.state
    let speed = state.velocityX * Math.sin(state.heading) + state.velocityZ * Math.cos(state.heading)
    const reversing = input.throttle * speed < -0.1
    const boost = input.boost && input.throttle > 0 && speed >= 0 && state.battery > 0 && !input.brake
    state.braking = input.brake || reversing
    if (state.braking) {
      speed = approach(speed, 0, (input.brake ? 16 : 9) * dt)
    } else if (input.throttle !== 0 && state.battery > 0) {
      const target = input.throttle * (input.throttle < 0 ? 3 : boost ? 15 : 10)
      const acceleration = Math.abs(speed) > Math.abs(target) ? 3.2 : boost ? 9.5 : 6.8
      speed = approach(speed, target, acceleration * dt)
    } else {
      speed = approach(speed, 0, (1.1 + Math.abs(speed) * 0.12) * dt)
    }

    const steeringTarget = input.steering * 0.5 / (1 + Math.abs(speed) * 0.18)
    state.steeringAngle += (steeringTarget - state.steeringAngle) * (1 - Math.exp(-9 * dt))
    const yawRate = speed * Math.tan(state.steeringAngle) / 1.6
    state.heading += yawRate * dt
    state.heading = Math.atan2(Math.sin(state.heading), Math.cos(state.heading))
    const forwardX = Math.sin(state.heading)
    const forwardZ = Math.cos(state.heading)
    const speedLimit = Math.max(Math.hypot(state.velocityX, state.velocityZ), input.throttle < 0 ? 3 : boost ? 15 : 10)
    const grip = this.touchingWall ? 0 : input.brake ? 3 : 13
    const lateralSpeed = (state.velocityX * forwardZ - state.velocityZ * forwardX) * Math.exp(-grip * dt)
    state.velocityX = forwardX * speed + forwardZ * lateralSpeed
    state.velocityZ = forwardZ * speed - forwardX * lateralSpeed
    const magnitude = Math.hypot(state.velocityX, state.velocityZ)
    if (magnitude > speedLimit) {
      state.velocityX *= speedLimit / magnitude
      state.velocityZ *= speedLimit / magnitude
    }
    if (Math.hypot(state.velocityX, state.velocityZ) < 0.015) {
      state.velocityX = 0
      state.velocityZ = 0
    }

    const oldX = state.x
    const oldZ = state.z
    this.move(state.velocityX * dt, state.velocityZ * dt, dt)
    const dx = state.x - oldX
    const dz = state.z - oldZ
    const travelled = Math.hypot(dx, dz)
    state.distance += travelled
    state.wheelTravel += dx * forwardX + dz * forwardZ
    state.boosting = boost && travelled > 0.000001
    state.battery = Math.max(0, state.battery - travelled * (boost ? 0.08 : 0.025))
    const forwardSpeed = state.velocityX * forwardX + state.velocityZ * forwardZ
    state.speed = Math.hypot(state.velocityX, state.velocityZ) * (forwardSpeed < 0 ? -1 : 1)
    const targetLean = Math.max(-0.35, Math.min(0.35, -Math.atan(state.speed * yawRate / 9.81) * 0.55))
    state.leanAngle += (targetLean - state.leanAngle) * (1 - Math.exp(-8 * dt))
  }

  private move(dx: number, dz: number, dt: number) {
    const state = this.state
    let x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, state.x + dx))
    // 对膨胀后的 AABB 分轴扫掠，截断法向位移并保留沿墙切向位移。
    for (const wall of this.walls) {
      if (state.z <= wall.minZ || state.z >= wall.maxZ) continue
      if (state.x <= wall.minX && x > wall.minX) x = wall.minX
      else if (state.x >= wall.maxX && x < wall.maxX) x = wall.maxX
    }
    const hitX = Math.abs(x - state.x - dx) > 0.00000001
    let z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, state.z + dz))
    for (const wall of this.walls) {
      if (x <= wall.minX || x >= wall.maxX) continue
      if (state.z <= wall.minZ && z > wall.minZ) z = wall.minZ
      else if (state.z >= wall.maxZ && z < wall.maxZ) z = wall.maxZ
    }
    const hitZ = Math.abs(z - state.z - dz) > 0.00000001
    state.x = x
    state.z = z
    if (hitX) state.velocityX = 0
    if (hitZ) state.velocityZ = 0
    this.touchingWall = hitX || hitZ
    if (this.touchingWall) {
      state.colliding = true
      const friction = Math.exp(-0.8 * dt)
      state.velocityX *= friction
      state.velocityZ *= friction
    }
  }
}
