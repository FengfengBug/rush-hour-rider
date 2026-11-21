export interface Point2 {
  readonly x: number
  readonly z: number
}

export interface Aabb2 {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export type Direction = 'north' | 'east' | 'south' | 'west'
export type RoadAxis = 'x' | 'z'
export type DistrictId = 'food-street' | 'old-neighborhood' | 'cbd' | 'civic-center'
export type BuildingKind = 'shop' | 'apartment' | 'office' | 'civic' | 'hospital' | 'school'
export type CityView = 'ride' | 'rider-rear' | 'rider-side' | 'overview' | DistrictId
export type RiderPreviewMode = 'parked' | 'motion' | 'braking'
export type RideCameraMode = 'near' | 'far' | 'overhead'

export interface RiderSnapshot {
  x: number
  z: number
  heading: number
  speed: number
  battery: number
  distance: number
  braking: boolean
  boosting: boolean
  colliding: boolean
}

export interface RoadLane {
  readonly id: string
  readonly direction: Direction
  readonly width: number
  readonly centerLine: readonly [Point2, Point2]
}

export interface CityRoad {
  readonly id: string
  readonly name: string
  readonly axis: RoadAxis
  readonly width: number
  readonly centerLine: readonly [Point2, Point2]
  readonly bounds: Aabb2
  readonly lanes: readonly RoadLane[]
}

export interface Intersection {
  readonly id: string
  readonly position: Point2
  readonly roadIds: readonly [string, string]
  readonly bounds: Aabb2
}

export interface Sidewalk {
  readonly id: string
  readonly roadId: string
  readonly bounds: Aabb2
}

export interface CityDistrict {
  readonly id: DistrictId
  readonly name: string
  readonly buildingKind: BuildingKind
}

export interface CityBlock {
  readonly id: string
  readonly row: number
  readonly column: number
  readonly districtId: DistrictId
  readonly bounds: Aabb2
  readonly buildableBounds: Aabb2
}

export interface CityBuilding {
  readonly id: string
  readonly name: string
  readonly blockId: string
  readonly kind: BuildingKind
  readonly height: number
  readonly bounds: Aabb2
}

export interface BuildingCollider {
  readonly buildingId: string
  readonly bounds: Aabb2
}

export interface RoadsideAccess {
  readonly position: Point2
  readonly radius: number
  readonly roadId: string
  readonly side: Direction
}

export interface CityLandmark {
  readonly id: string
  readonly name: string
  readonly kind: 'merchant' | 'delivery'
  readonly buildingId: string
  readonly access: RoadsideAccess
}

export interface BatteryStation {
  readonly id: string
  readonly name: string
  readonly position: Point2
  readonly access: RoadsideAccess
}

export interface TrafficWaypoint {
  readonly position: Point2
  readonly intersectionId: string
}

export interface TrafficRoute {
  readonly id: string
  readonly waypoints: readonly TrafficWaypoint[]
  // laneIds[i] 对应 waypoints[i] 到 waypoints[i + 1]，首尾路径点重合。
  readonly laneIds: readonly string[]
}

export interface CityLayout {
  readonly size: number
  readonly gridSize: number
  readonly bounds: Aabb2
  readonly roadWidth: number
  readonly sidewalkWidth: number
  readonly districts: readonly CityDistrict[]
  readonly blocks: readonly CityBlock[]
  readonly roads: readonly CityRoad[]
  readonly intersections: readonly Intersection[]
  readonly sidewalks: readonly Sidewalk[]
  readonly buildings: readonly CityBuilding[]
  readonly colliders: readonly BuildingCollider[]
  readonly landmarks: readonly CityLandmark[]
  readonly batteryStations: readonly BatteryStation[]
  readonly trafficRoutes: readonly TrafficRoute[]
  readonly spawn: { readonly position: Point2; readonly facing: Direction }
}

export type TrafficLightPhase = 'red' | 'yellow' | 'green'

export interface TrafficSignal {
  id: string
  x: number
  z: number
  phaseX: TrafficLightPhase
  phaseZ: TrafficLightPhase
  remainingX: number
  remainingZ: number
}

export interface TrafficVehicle {
  id: string
  kind: 'car' | 'bus'
  color: string
  x: number
  z: number
  heading: number
  speed: number
  length: number
  width: number
  braking: boolean
}

export interface TrafficEvent {
  id: number
  type: 'red-light' | 'collision'
  time: number
  position: Point2
  subjectId: string
}

export interface TrafficSnapshot {
  vehicleCount: number
  queuedCount: number
  redLightCount: number
  collisionCount: number
  elapsedSeconds: number
  hornActive: boolean
  nearbySignal: {
    intersectionId: string
    axis: RoadAxis
    phase: TrafficLightPhase
    remaining: number
    distance: number
  } | null
  events: TrafficEvent[]
}

export interface EngineSnapshot {
  view: CityView
  cameraMode: RideCameraMode
  riderPreview: RiderPreviewMode
  rider: RiderSnapshot
  traffic: TrafficSnapshot
  fps: number
  drawCalls: number
  triangleCount: number
  instanceCount: number
  viewportWidth: number
  viewportHeight: number
  pixelRatio: number
}
