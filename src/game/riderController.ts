import type { Aabb2, CityLayout, Direction, RiderSnapshot } from './types'

export const RIDER_COLLISION_RADIUS = 1.5
const FACING: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }
const approach = (value: number, target: number, amount: number) => value + Math.max(-amount, Math.min(amount, target - value))

export interface DrivingInput {
  throttle: number
  steering: number
  brake: boolean
  boost: boolean
  distraction?: number
  distractionTime?: number
  activeOrderCount?: number
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
      wheelTravel: 0, distance: 0, battery: 100, stamina: 100, standLeg: 1, braking: false, boosting: false, colliding: false,
    }
  }

  reset() {
    this.stop()
    Object.assign(this.state, {
      x: this.spawn.position.x, z: this.spawn.position.z, heading: FACING[this.spawn.facing],
      wheelTravel: 0, distance: 0, battery: 100, stamina: 100, standLeg: 1,
    })
  }

  consumeStamina(amount: number) {
    this.state.stamina = Math.max(0, Math.min(100, this.state.stamina - amount))
  }

  refillBattery() {
    this.state.battery = 100
  }

  stop() {
    this.touchingWall = false
    Object.assign(this.state, {
      speed: 0, velocityX: 0, velocityZ: 0, steeringAngle: 0, leanAngle: 0,
      standLeg: 1, braking: false, boosting: false, colliding: false,
    })
  }

  update(deltaSeconds: number, input: DrivingInput) {
    this.state.colliding = false
    const steps = Math.ceil(deltaSeconds * 120)
    for (let step = 0; step < steps; step += 1) this.step(deltaSeconds / steps, input)
  }

  applyTrafficImpact(normalX: number, normalZ: number, distance: number, distraction = 0) {
    const state = this.state
    const incomingSpeed = state.velocityX * normalX + state.velocityZ * normalZ
    state.velocityX *= 0.4
    state.velocityZ *= 0.4
    if (incomingSpeed < 0) {
      const rebound = Math.min(1.5, -incomingSpeed * 0.12) - incomingSpeed * 0.4
      state.velocityX += normalX * rebound
      state.velocityZ += normalZ * rebound
    }
    const oldX = state.x
    const oldZ = state.z
    this.move(normalX * distance, normalZ * distance, 0)
    state.distance += Math.hypot(state.x - oldX, state.z - oldZ)
    state.wheelTravel += (state.x - oldX) * Math.sin(state.heading) + (state.z - oldZ) * Math.cos(state.heading)
    const forwardSpeed = state.velocityX * Math.sin(state.heading) + state.velocityZ * Math.cos(state.heading)
    state.speed = Math.hypot(state.velocityX, state.velocityZ) * (forwardSpeed < 0 ? -1 : 1)
    state.stamina = Math.max(0, state.stamina - (4.5 + 2.5 * distraction))
    state.boosting = false
    state.colliding = true
  }

  private step(dt: number, input: DrivingInput) {
    const state = this.state
    const distraction = Math.max(0, Math.min(1, input.distraction ?? 0))
    const distractionTime = input.distractionTime ?? 0
    const activeOrders = Math.max(0, input.activeOrderCount ?? 0)
    let speed = state.velocityX * Math.sin(state.heading) + state.velocityZ * Math.cos(state.heading)
    const reversing = input.throttle * speed < -0.1
    const lowBattery = state.battery > 0 && state.battery < 20
    const boost = input.boost && input.throttle > 0 && speed >= 0 && state.battery >= 20 && !input.brake
    const forwardTopSpeed = lowBattery ? 6.2 : boost ? 15 : 10
    state.braking = input.brake || reversing
    if (state.braking) {
      speed = approach(speed, 0, (input.brake ? 16 : 9) * dt)
    } else if (input.throttle !== 0 && state.battery > 0) {
      const target = input.throttle * (input.throttle < 0 ? 3 : forwardTopSpeed)
      const acceleration = Math.abs(speed) > Math.abs(target) ? 3.2 : boost ? 9.5 : lowBattery ? 4.8 : 6.8
      speed = approach(speed, target, acceleration * dt)
    } else {
      speed = approach(speed, 0, (1.1 + Math.abs(speed) * 0.12) * dt)
    }

    const steeringScale = 1 - 0.42 * distraction
    const steeringResponse = 11 - 5.6 * distraction
    const driftBias = distraction > 0 && Math.abs(speed) > 1.2
      ? Math.sin(distractionTime * 2.2) * 0.055 * distraction * Math.min(1, Math.abs(speed) / 8)
      : 0
    // 贴合真实两轮电驴转弯几何：低速大舵角灵活掉头，高速随车速自然收窄保持稳定。
    const maxSteerAngle = 0.74
    const speedSteerDamp = 1 + Math.abs(speed) * 0.145 + Math.pow(Math.abs(speed) / 14, 2) * 0.45
    const steeringTarget = (input.steering * maxSteerAngle * steeringScale + driftBias) / speedSteerDamp
    state.steeringAngle += (steeringTarget - state.steeringAngle) * (1 - Math.exp(-steeringResponse * dt))
    const yawRate = speed * Math.tan(state.steeringAngle) / 1.28
    state.heading += yawRate * dt
    state.heading = Math.atan2(Math.sin(state.heading), Math.cos(state.heading))
    const forwardX = Math.sin(state.heading)
    const forwardZ = Math.cos(state.heading)
    if (Math.abs(input.steering) > 0 && Math.abs(speed) > 4 && !state.braking) {
      speed *= Math.exp(-0.18 * Math.abs(state.steeringAngle) * dt)
    }
    const speedLimit = Math.max(Math.hypot(state.velocityX, state.velocityZ), input.throttle < 0 ? 3 : forwardTopSpeed)
    const grip = this.touchingWall ? 0 : input.brake ? 3 : 14
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
    if (travelled > 0.0001) {
      const effortRate = 0.12 + activeOrders * 0.05 + (state.boosting ? 0.55 : 0)
      state.stamina = Math.max(0, state.stamina - effortRate * dt)
    } else if (Math.abs(state.speed) < 0.15 && !state.colliding) {
      state.stamina = Math.min(100, state.stamina + 2.4 * dt)
    }
    const standTarget = Math.abs(state.speed) < 0.65 ? 1 : 0
    state.standLeg += (standTarget - state.standLeg) * (1 - Math.exp(-8.5 * dt))
    if (state.standLeg < 0.002) state.standLeg = 0
    if (state.standLeg > 0.998) state.standLeg = 1
    const rideLean = Math.max(-0.36, Math.min(0.36, -Math.atan(state.speed * yawRate / 9.81) * 0.52))
    const standLean = -0.075 * state.standLeg * (1 - Math.min(1, Math.abs(state.speed) / 0.8))
    const targetLean = rideLean + standLean
    state.leanAngle += (targetLean - state.leanAngle) * (1 - Math.exp(-8.5 * dt))
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
