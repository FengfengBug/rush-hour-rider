import type { Aabb2, CityLayout, CityRoad, NavigationKind, NavigationSnapshot, NavigationTarget, Point2 } from './types'

export const NAVIGATION_COLORS: Record<NavigationKind, string> = {
  pickup: '#f17848', delivery: '#53c58a', battery: '#62baf0',
}
const DEFAULT_TARGET = 'chen-braised-chicken'
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)

interface RoadConnection {
  road: CityRoad
  nodes: number[]
}

export class NavigationSystem {
  readonly targets: readonly NavigationTarget[]
  snapshot: NavigationSnapshot
  private readonly layout: CityLayout
  private readonly walls: Aabb2[]
  private readonly roads: RoadConnection[]
  private readonly edges: { node: number; distance: number }[][]
  private activeTargets: readonly NavigationTarget[]
  private targetId: string | null = DEFAULT_TARGET

  constructor(layout: CityLayout, riderRadius: number) {
    this.layout = layout
    this.walls = layout.colliders.map(({ bounds }) => ({
      minX: bounds.minX - riderRadius, maxX: bounds.maxX + riderRadius,
      minZ: bounds.minZ - riderRadius, maxZ: bounds.maxZ + riderRadius,
    }))
    this.targets = [
      ...layout.landmarks.map((landmark) => ({
        id: landmark.id, name: landmark.name,
        kind: landmark.kind === 'merchant' ? 'pickup' as const : 'delivery' as const,
        position: landmark.access.position, radius: landmark.access.radius, roadId: landmark.access.roadId,
      })),
      ...layout.batteryStations.map((station) => ({
        id: station.id, name: station.name, kind: 'battery' as const,
        position: station.access.position, radius: station.access.radius, roadId: station.access.roadId,
      })),
    ]
    this.activeTargets = this.targets
    this.edges = layout.intersections.map(() => [])
    this.roads = layout.roads.map((road) => {
      const nodes = layout.intersections
        .map((junction, index) => ({ junction, index }))
        .filter(({ junction }) => junction.roadIds.includes(road.id))
        .sort((a, b) => a.junction.position[road.axis] - b.junction.position[road.axis])
        .map(({ index }) => index)
      for (let index = 0; index < nodes.length - 1; index += 1) {
        const from = nodes[index]
        const to = nodes[index + 1]
        const length = distance(layout.intersections[from].position, layout.intersections[to].position)
        this.edges[from].push({ node: to, distance: length })
        this.edges[to].push({ node: from, distance: length })
      }
      return { road, nodes }
    })
    this.snapshot = { targets: this.activeTargets, targetId: this.targetId, route: [], distance: 0, directDistance: 0, arrived: false }
    this.update(layout.spawn.position)
  }

  setActiveTargets(ids: readonly string[]): void {
    const activeIds = new Set(ids)
    this.activeTargets = this.targets.filter((target) => activeIds.has(target.id))
    if (!this.activeTargets.some((target) => target.id === this.targetId)) this.targetId = null
    this.snapshot = this.targetId === null || !this.activeTargets.some((target) => target.id === this.snapshot.targetId)
      ? { targets: this.activeTargets, targetId: null, route: [], distance: 0, directDistance: 0, arrived: false }
      : { ...this.snapshot, targets: this.activeTargets }
  }

  selectTarget(id: string | null): void {
    if (id !== null && !this.activeTargets.some((target) => target.id === id)) return
    this.targetId = id
  }

  reset(): void {
    this.activeTargets = this.targets
    this.targetId = DEFAULT_TARGET
    this.update(this.layout.spawn.position)
  }

  update(position: Point2): void {
    const target = this.activeTargets.find((entry) => entry.id === this.targetId)
    if (!target) {
      this.snapshot = { targets: this.activeTargets, targetId: null, route: [], distance: 0, directDistance: 0, arrived: false }
      return
    }
    const directDistance = distance(position, target.position)
    const route = directDistance <= this.layout.roadWidth + this.layout.sidewalkWidth * 2 && !this.blocked(position, target.position)
      ? this.simplify([position, target.position])
      : this.findRoute(position, target)
    this.snapshot = {
      targets: this.activeTargets, targetId: target.id, route,
      distance: route.reduce((sum, point, index) => index === 0 ? 0 : sum + distance(route[index - 1], point), 0),
      directDistance, arrived: directDistance <= target.radius,
    }
  }

  private project(position: Point2, road: CityRoad): Point2 {
    const [from, to] = road.centerLine
    const along = Math.max(from[road.axis], Math.min(to[road.axis], position[road.axis]))
    return road.axis === 'x' ? { x: along, z: from.z } : { x: from.x, z: along }
  }

  private adjacentNodes(position: Point2, connection: RoadConnection): number[] {
    const { axis } = connection.road
    const next = connection.nodes.findIndex((node) => this.layout.intersections[node].position[axis] >= position[axis])
    if (next < 0) return [connection.nodes[connection.nodes.length - 1]]
    if (next === 0 || this.layout.intersections[connection.nodes[next]].position[axis] === position[axis]) return [connection.nodes[next]]
    return [connection.nodes[next - 1], connection.nodes[next]]
  }

  private findRoute(position: Point2, target: NavigationTarget): Point2[] {
    const nodes = this.layout.intersections
    const costs = nodes.map(() => Infinity)
    const previous = nodes.map(() => -1)
    const entryPoints: (Point2 | null)[] = nodes.map(() => null)
    const visited = nodes.map(() => false)
    const destinationRoad = this.roads.find(({ road }) => road.id === target.roadId)!
    const destination = this.project(target.position, destinationRoad.road)
    let shortest = Infinity
    let direct: Point2[] | null = null

    for (const connection of this.roads) {
      const entry = this.project(position, connection.road)
      if (this.blocked(position, entry)) continue
      const entryDistance = distance(position, entry)
      for (const node of this.adjacentNodes(entry, connection)) {
        const cost = entryDistance + distance(entry, nodes[node].position)
        if (cost < costs[node]) {
          costs[node] = cost
          entryPoints[node] = entry
        }
      }
      if (connection === destinationRoad) {
        shortest = entryDistance + distance(entry, destination) + distance(destination, target.position)
        direct = [position, entry, destination, target.position]
      }
    }

    for (let iteration = 0; iteration < nodes.length; iteration += 1) {
      let nearest = -1
      for (let node = 0; node < nodes.length; node += 1) {
        if (!visited[node] && (nearest < 0 || costs[node] < costs[nearest])) nearest = node
      }
      if (nearest < 0 || !Number.isFinite(costs[nearest])) break
      visited[nearest] = true
      for (const edge of this.edges[nearest]) {
        const cost = costs[nearest] + edge.distance
        if (cost < costs[edge.node]) {
          costs[edge.node] = cost
          previous[edge.node] = nearest
        }
      }
    }

    let last = -1
    for (const node of this.adjacentNodes(destination, destinationRoad)) {
      const cost = costs[node] + distance(nodes[node].position, destination) + distance(destination, target.position)
      if (cost < shortest) {
        shortest = cost
        last = node
      }
    }
    if (last < 0) return this.simplify(direct!)
    const junctionPath: Point2[] = []
    let first = last
    while (previous[first] >= 0) {
      junctionPath.push(nodes[first].position)
      first = previous[first]
    }
    junctionPath.push(nodes[first].position)
    junctionPath.reverse()
    return this.simplify([position, entryPoints[first]!, ...junctionPath, destination, target.position])
  }

  private blocked(from: Point2, to: Point2): boolean {
    return this.walls.some((wall) => {
      let enter = 0
      let exit = 1
      for (const axis of ['x', 'z'] as const) {
        const low = axis === 'x' ? wall.minX : wall.minZ
        const high = axis === 'x' ? wall.maxX : wall.maxZ
        const movement = to[axis] - from[axis]
        if (Math.abs(movement) < 0.00000001) {
          if (from[axis] <= low || from[axis] >= high) return false
        } else {
          const first = (low - from[axis]) / movement
          const second = (high - from[axis]) / movement
          enter = Math.max(enter, Math.min(first, second))
          exit = Math.min(exit, Math.max(first, second))
        }
      }
      return enter < exit - 0.00000001 && exit > 0.00000001 && enter < 1 - 0.00000001
    })
  }

  private simplify(points: readonly Point2[]): Point2[] {
    const route: Point2[] = []
    for (const point of points) {
      if (route.length && distance(route[route.length - 1], point) < 0.000001) continue
      while (route.length >= 2) {
        const a = route[route.length - 2]
        const b = route[route.length - 1]
        const cross = (b.x - a.x) * (point.z - b.z) - (b.z - a.z) * (point.x - b.x)
        if (Math.abs(cross) >= 0.000001) break
        route.pop()
      }
      if (!route.length || distance(route[route.length - 1], point) >= 0.000001) {
        route.push({ x: point.x, z: point.z })
      }
    }
    return route
  }
}
