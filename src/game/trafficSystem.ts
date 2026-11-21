import type {
  CityLayout, Intersection, Point2, RiderSnapshot, RoadAxis, TrafficEvent,
  TrafficLightPhase, TrafficSignal, TrafficSnapshot, TrafficVehicle,
} from './types'

export const TRAFFIC_STOP_DISTANCE = 10.5
export const RIDER_TRAFFIC_RADIUS = 1.25
const TURN_RADIUS = 4
const CYCLE_SECONDS = 27
const approach = (value: number, target: number, amount: number) => value + Math.max(-amount, Math.min(amount, target - value))
const wrap = (value: number, length: number) => ((value % length) + length) % length

interface TrackLeg {
  start: Point2
  center: Point2
  forward: Point2
  heading: number
  axis: RoadAxis
  straight: number
  offset: number
  length: number
  junction: Intersection
}

interface Track {
  legs: TrackLeg[]
  length: number
}

interface VehicleState extends TrafficVehicle {
  track: Track
  progress: number
  spawnProgress: number
  cruiseSpeed: number
}

export interface TrafficImpact {
  normalX: number
  normalZ: number
  distance: number
}

function phaseAt(time: number, offset: number, axis: RoadAxis): { phase: TrafficLightPhase; remaining: number } {
  const phaseTime = wrap(time + offset, CYCLE_SECONDS)
  if (axis === 'x') {
    if (phaseTime < 10) return { phase: 'green', remaining: 10 - phaseTime }
    if (phaseTime < 12) return { phase: 'yellow', remaining: 12 - phaseTime }
    return { phase: 'red', remaining: CYCLE_SECONDS - phaseTime }
  }
  if (phaseTime < 13.5) return { phase: 'red', remaining: 13.5 - phaseTime }
  if (phaseTime < 23.5) return { phase: 'green', remaining: 23.5 - phaseTime }
  if (phaseTime < 25.5) return { phase: 'yellow', remaining: 25.5 - phaseTime }
  return { phase: 'red', remaining: 40.5 - phaseTime }
}

export class TrafficSystem {
  readonly signals: TrafficSignal[]
  readonly vehicles: VehicleState[]
  private readonly layout: CityLayout
  private readonly onEvent: (event: TrafficEvent) => void
  private readonly signalIndices = new Map<string, number>()
  private readonly contacts = new Set<string>()
  private readonly crossedSignals = new Set<string>()
  private readonly nextMoves: number[]
  private readonly events: TrafficEvent[] = []
  private elapsed = 0
  private frameStartedAt = 0
  private eventId = 0
  private redLightCount = 0
  private collisionCount = 0

  constructor(layout: CityLayout, onEvent: (event: TrafficEvent) => void) {
    this.layout = layout
    this.onEvent = onEvent
    const interior = layout.size / 2 - layout.roadWidth
    this.signals = layout.intersections
      .filter(({ position }) => Math.abs(position.x) < interior && Math.abs(position.z) < interior)
      .map((junction, index) => {
        this.signalIndices.set(junction.id, index)
        return { id: junction.id, ...junction.position, phaseX: 'red', phaseZ: 'red', remainingX: 0, remainingZ: 0 }
      })
    const junctions = new Map(layout.intersections.map((junction) => [junction.id, junction]))
    const routeIndices = [0, 3, 5, 6, 9, 10, 12, 15]
    const starts = [24, 92, 225, 176, 64, 284, 118, 205]
    const colors = ['#da7958', '#62a2b8', '#e8bd58', '#80a387', '#b58ca6', '#e6ddbf']
    this.vehicles = routeIndices.flatMap((routeIndex, group) => {
      const route = layout.trafficRoutes[routeIndex]
      const track: Track = { legs: [], length: 0 }
      for (let index = 0; index < route.waypoints.length - 1; index += 1) {
        const from = route.waypoints[index].position
        const to = route.waypoints[index + 1].position
        const distance = Math.hypot(to.x - from.x, to.z - from.z)
        const forward = { x: (to.x - from.x) / distance, z: (to.z - from.z) / distance }
        const straight = distance - TURN_RADIUS * 2
        const length = straight + Math.PI / 2 * TURN_RADIUS
        track.legs.push({
          start: { x: from.x + forward.x * TURN_RADIUS, z: from.z + forward.z * TURN_RADIUS },
          center: {
            x: to.x - forward.x * TURN_RADIUS - forward.z * TURN_RADIUS,
            z: to.z - forward.z * TURN_RADIUS + forward.x * TURN_RADIUS,
          },
          forward, heading: Math.atan2(forward.x, forward.z), axis: Math.abs(forward.x) > 0.5 ? 'x' : 'z',
          straight, offset: track.length, length, junction: junctions.get(route.waypoints[index + 1].intersectionId)!,
        })
        track.length += length
      }
      return [0, 1].map((slot) => {
        const index = group * 2 + slot
        const bus = index % 5 === 0
        return {
          id: `vehicle-${index + 1}`, kind: bus ? 'bus' as const : 'car' as const,
          color: colors[index % colors.length], x: 0, z: 0, heading: 0, speed: 0,
          length: bus ? 6.8 : 4.4, width: bus ? 2.35 : 2.05, braking: false,
          track, progress: 0, spawnProgress: wrap(starts[group] - slot * 24, track.length),
          cruiseSpeed: bus ? 6.4 : 7.2 + (index % 3) * 0.45,
        }
      })
    })
    this.nextMoves = this.vehicles.map(() => 0)
    this.reset()
  }

  reset(): void {
    this.elapsed = 0
    this.frameStartedAt = 0
    this.eventId = 0
    this.redLightCount = 0
    this.collisionCount = 0
    this.events.length = 0
    this.contacts.clear()
    this.crossedSignals.clear()
    this.updateSignals()
    for (const vehicle of this.vehicles) {
      vehicle.progress = vehicle.spawnProgress
      vehicle.speed = 0
      vehicle.braking = false
      this.placeVehicle(vehicle)
    }
  }

  update(deltaSeconds: number, rider?: Point2): void {
    this.frameStartedAt = this.elapsed
    const steps = Math.ceil(deltaSeconds * 60)
    for (let step = 0; step < steps; step += 1) {
      const dt = deltaSeconds / steps
      this.elapsed += dt
      this.updateSignals()
      this.vehicles.forEach((vehicle, index) => {
        let gap = Infinity
        const leg = this.getLeg(vehicle)
        const signalIndex = this.signalIndices.get(leg.junction.id)
        if (signalIndex !== undefined) {
          const phase = leg.axis === 'x' ? this.signals[signalIndex].phaseX : this.signals[signalIndex].phaseZ
          const direction = leg.forward[leg.axis]
          const stop = leg.junction.position[leg.axis] - direction * (TRAFFIC_STOP_DISTANCE + vehicle.length / 2 + 0.4)
          const stopProgress = leg.offset + (stop - leg.start[leg.axis]) * direction
          const remaining = stopProgress - vehicle.progress
          if (phase !== 'green' && remaining >= -0.000001) gap = Math.max(0, remaining)
        }
        for (const leader of this.vehicles) {
          if (leader === vehicle || leader.track !== vehicle.track) continue
          const separation = wrap(leader.progress - vehicle.progress, vehicle.track.length)
          gap = Math.min(gap, Math.max(0, separation - (vehicle.length + leader.length) / 2 - 2))
        }
        if (rider) {
          const dx = rider.x - vehicle.x
          const dz = rider.z - vehicle.z
          const ahead = dx * Math.sin(vehicle.heading) + dz * Math.cos(vehicle.heading)
          const lateral = Math.abs(dx * Math.cos(vehicle.heading) - dz * Math.sin(vehicle.heading))
          if (ahead > 0 && lateral < vehicle.width / 2 + RIDER_TRAFFIC_RADIUS + 0.3) {
            gap = Math.min(gap, Math.max(0, ahead - vehicle.length / 2 - RIDER_TRAFFIC_RADIUS - 1))
          }
        }
        const targetSpeed = Math.min(vehicle.cruiseSpeed, Math.sqrt(2 * 5 * gap))
        const previousSpeed = vehicle.speed
        vehicle.speed = approach(vehicle.speed, targetSpeed, (targetSpeed < vehicle.speed ? 5 : 2.6) * dt)
        this.nextMoves[index] = Math.min(gap, vehicle.speed * dt)
        if (gap <= vehicle.speed * dt) vehicle.speed = 0
        vehicle.braking = vehicle.speed < previousSpeed - 0.001 || gap < 0.3
      })
      this.vehicles.forEach((vehicle, index) => {
        vehicle.progress = wrap(vehicle.progress + this.nextMoves[index], vehicle.track.length)
        this.placeVehicle(vehicle)
      })
    }
  }

  checkSignals(previous: Point2, current: Point2): void {
    for (let index = 0; index < this.signals.length; index += 1) {
      const signal = this.signals[index]
      if (Math.abs(current.x - signal.x) > 16.5 || Math.abs(current.z - signal.z) > 16.5) {
        this.crossedSignals.delete(signal.id)
      }
      if (this.crossedSignals.has(signal.id)) continue
      for (const axis of ['x', 'z'] as const) {
        const lateral = axis === 'x' ? 'z' : 'x'
        for (const direction of [-1, 1]) {
          const line = signal[axis] - direction * (TRAFFIC_STOP_DISTANCE + RIDER_TRAFFIC_RADIUS)
          const before = (previous[axis] - line) * direction
          const after = (current[axis] - line) * direction
          if (before >= 0 || after < 0) continue
          const fraction = -before / (after - before)
          const crossLane = previous[lateral] + (current[lateral] - previous[lateral]) * fraction
          if (Math.abs(crossLane - signal[lateral]) > this.layout.roadWidth / 2) continue
          this.crossedSignals.add(signal.id)
          const crossingTime = this.frameStartedAt + (this.elapsed - this.frameStartedAt) * fraction
          if (phaseAt(crossingTime, index * 3, axis).phase === 'red') {
            this.record('red-light', signal.id, {
              x: previous.x + (current.x - previous.x) * fraction,
              z: previous.z + (current.z - previous.z) * fraction,
            }, crossingTime)
          }
        }
      }
    }
  }

  checkCollision(rider: Point2): TrafficImpact | null {
    let impact: TrafficImpact | null = null
    for (const vehicle of this.vehicles) {
      const sin = Math.sin(vehicle.heading)
      const cos = Math.cos(vehicle.heading)
      const dx = rider.x - vehicle.x
      const dz = rider.z - vehicle.z
      const localX = dx * cos - dz * sin
      const localZ = dx * sin + dz * cos
      const halfWidth = vehicle.width / 2
      const halfLength = vehicle.length / 2
      const nearestX = Math.max(-halfWidth, Math.min(halfWidth, localX))
      const nearestZ = Math.max(-halfLength, Math.min(halfLength, localZ))
      const offsetX = localX - nearestX
      const offsetZ = localZ - nearestZ
      const distance = Math.hypot(offsetX, offsetZ)
      if (distance > RIDER_TRAFFIC_RADIUS + 0.8) this.contacts.delete(vehicle.id)
      if (distance >= RIDER_TRAFFIC_RADIUS) continue
      let normalX: number
      let normalZ: number
      let depth: number
      if (distance > 0.00001) {
        normalX = offsetX / distance
        normalZ = offsetZ / distance
        depth = RIDER_TRAFFIC_RADIUS - distance
      } else if (halfWidth - Math.abs(localX) < halfLength - Math.abs(localZ)) {
        normalX = localX < 0 ? -1 : 1
        normalZ = 0
        depth = RIDER_TRAFFIC_RADIUS + halfWidth - Math.abs(localX)
      } else {
        normalX = 0
        normalZ = localZ < 0 ? -1 : 1
        depth = RIDER_TRAFFIC_RADIUS + halfLength - Math.abs(localZ)
      }
      if (!this.contacts.has(vehicle.id)) {
        this.contacts.add(vehicle.id)
        this.record('collision', vehicle.id, { x: rider.x, z: rider.z }, this.elapsed)
      }
      if (!impact || depth + 0.04 > impact.distance) {
        impact = { normalX: normalX * cos + normalZ * sin, normalZ: -normalX * sin + normalZ * cos, distance: depth + 0.04 }
      }
    }
    return impact
  }

  isWaitingAtRedLight(rider: RiderSnapshot): boolean {
    if (Math.abs(rider.speed) > 0.25) return false
    const x = Math.sin(rider.heading)
    const z = Math.cos(rider.heading)
    const axis = Math.abs(x) > Math.abs(z) ? 'x' : 'z'
    const forward = axis === 'x' ? x : z
    if (Math.abs(forward) < 0.9) return false
    const direction = Math.sign(forward)
    const lateral = axis === 'x' ? 'z' : 'x'
    return this.signals.some((signal) => {
      if ((axis === 'x' ? signal.phaseX : signal.phaseZ) !== 'red') return false
      const lane = (rider[lateral] - signal[lateral]) * direction * (axis === 'x' ? 1 : -1)
      const stopDistance = (signal[axis] - rider[axis]) * direction - TRAFFIC_STOP_DISTANCE - RIDER_TRAFFIC_RADIUS
      return lane >= 0.5 && lane <= this.layout.roadWidth / 2 - RIDER_TRAFFIC_RADIUS
        && stopDistance >= 0 && stopDistance <= 5
    })
  }

  getSnapshot(rider: RiderSnapshot, hornActive: boolean): TrafficSnapshot {
    const heading = rider.heading + (rider.speed < 0 ? Math.PI : 0)
    const axis = Math.abs(Math.sin(heading)) > Math.abs(Math.cos(heading)) ? 'x' : 'z'
    const lateral = axis === 'x' ? 'z' : 'x'
    const direction = Math.sign(axis === 'x' ? Math.sin(heading) : Math.cos(heading))
    let nearbySignal: TrafficSnapshot['nearbySignal'] = null
    for (const signal of this.signals) {
      if (Math.abs(rider[lateral] - signal[lateral]) > this.layout.roadWidth / 2) continue
      const distance = (signal[axis] - rider[axis]) * direction - TRAFFIC_STOP_DISTANCE - RIDER_TRAFFIC_RADIUS
      if (distance < -0.5 || distance > 65 || nearbySignal && distance >= nearbySignal.distance) continue
      nearbySignal = {
        intersectionId: signal.id, axis, distance: Math.max(0, distance),
        phase: axis === 'x' ? signal.phaseX : signal.phaseZ,
        remaining: axis === 'x' ? signal.remainingX : signal.remainingZ,
      }
    }
    return {
      vehicleCount: this.vehicles.length,
      queuedCount: this.vehicles.filter((vehicle) => vehicle.speed < 0.25 && vehicle.braking).length,
      redLightCount: this.redLightCount, collisionCount: this.collisionCount,
      elapsedSeconds: this.elapsed, hornActive, nearbySignal,
      events: this.events.map((event) => ({ ...event, position: { ...event.position } })),
    }
  }

  private updateSignals(): void {
    this.signals.forEach((signal, index) => {
      const x = phaseAt(this.elapsed, index * 3, 'x')
      const z = phaseAt(this.elapsed, index * 3, 'z')
      signal.phaseX = x.phase
      signal.phaseZ = z.phase
      signal.remainingX = x.remaining
      signal.remainingZ = z.remaining
    })
  }

  private getLeg(vehicle: VehicleState): TrackLeg {
    return vehicle.track.legs.find((leg) => vehicle.progress < leg.offset + leg.length)!
  }

  private placeVehicle(vehicle: VehicleState): void {
    const leg = this.getLeg(vehicle)
    const along = vehicle.progress - leg.offset
    if (along <= leg.straight) {
      vehicle.x = leg.start.x + leg.forward.x * along
      vehicle.z = leg.start.z + leg.forward.z * along
      vehicle.heading = leg.heading
    } else {
      const turn = (along - leg.straight) / TURN_RADIUS
      vehicle.heading = leg.heading - turn
      vehicle.x = leg.center.x + Math.cos(vehicle.heading) * TURN_RADIUS
      vehicle.z = leg.center.z - Math.sin(vehicle.heading) * TURN_RADIUS
    }
  }

  private record(type: TrafficEvent['type'], subjectId: string, position: Point2, time: number): void {
    const event = { id: ++this.eventId, type, subjectId, position, time }
    if (type === 'red-light') this.redLightCount += 1
    else this.collisionCount += 1
    this.events.unshift(event)
    if (this.events.length > 3) this.events.pop()
    this.onEvent(event)
  }
}
