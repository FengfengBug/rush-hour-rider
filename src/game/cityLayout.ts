import type {
  Aabb2,
  BuildingKind,
  CityBlock,
  CityBuilding,
  CityDistrict,
  CityLandmark,
  CityLayout,
  CityRoad,
  Direction,
  Intersection,
  Point2,
  RoadAxis,
  RoadsideAccess,
  Sidewalk,
  TrafficRoute,
  TrafficWaypoint,
} from './types'

// 单位为米，原点在地图中心；+X 向东、+Z 向南，所有建筑保持轴对齐。
const MAP_SIZE = 360
const GRID_SIZE = 4
const ROAD_WIDTH = 12
const SIDEWALK_WIDTH = 4
const HALF_MAP = MAP_SIZE / 2
const LANE_OFFSET = ROAD_WIDTH / 4
const OUTER_ROAD = HALF_MAP - ROAD_WIDTH / 2 - SIDEWALK_WIDTH
const BLOCK_SPACING = (OUTER_ROAD * 2) / GRID_SIZE
const ROAD_COORDINATES = Array.from({ length: GRID_SIZE + 1 }, (_, index) => -OUTER_ROAD + index * BLOCK_SPACING)

const districts: readonly CityDistrict[] = [
  { id: 'food-street', name: '烟火美食街', buildingKind: 'shop' },
  { id: 'old-neighborhood', name: '老旧红砖小区', buildingKind: 'apartment' },
  { id: 'cbd', name: '星辰商务区', buildingKind: 'office' },
  { id: 'civic-center', name: '社区医院与学园', buildingKind: 'civic' },
]

interface LandmarkSpec {
  readonly id: string
  readonly name: string
  readonly kind: CityLandmark['kind']
  readonly buildingKind: BuildingKind
  readonly row: number
  readonly column: number
  readonly slot: number
  readonly side: Direction
}

const landmarkSpecs: readonly LandmarkSpec[] = [
  { id: 'shaxian-snacks', name: '沙县小吃', kind: 'merchant', buildingKind: 'shop',
    row: 1, column: 1, slot: 3, side: 'south' },
  { id: 'laowang-bbq', name: '老王烧烤', kind: 'merchant', buildingKind: 'shop',
    row: 0, column: 0, slot: 2, side: 'south' },
  { id: 'mixue-tea', name: '蜜雪甜茶', kind: 'merchant', buildingKind: 'shop',
    row: 1, column: 0, slot: 1, side: 'north' },
  { id: 'bawang-tea', name: '霸王茶铺', kind: 'merchant', buildingKind: 'shop',
    row: 0, column: 1, slot: 3, side: 'east' },
  { id: 'grandma-wontons', name: '阿婆馄饨', kind: 'merchant', buildingKind: 'shop',
    row: 1, column: 1, slot: 0, side: 'north' },
  { id: 'lanzhou-noodles', name: '兰州拉面', kind: 'merchant', buildingKind: 'shop',
    row: 0, column: 0, slot: 1, side: 'north' },
  { id: 'chen-braised-chicken', name: '陈记黄焖鸡', kind: 'merchant', buildingKind: 'shop',
    row: 2, column: 1, slot: 1, side: 'east' },
  { id: 'sunshine-estate', name: '阳光老小区', kind: 'delivery', buildingKind: 'apartment',
    row: 0, column: 2, slot: 0, side: 'north' },
  { id: 'redbrick-homes', name: '红砖家园', kind: 'delivery', buildingKind: 'apartment',
    row: 0, column: 3, slot: 2, side: 'south' },
  { id: 'xingfuli-estate', name: '幸福里小区', kind: 'delivery', buildingKind: 'apartment',
    row: 1, column: 2, slot: 3, side: 'south' },
  { id: 'starlight-tower', name: '星辰科技大厦', kind: 'delivery', buildingKind: 'office',
    row: 2, column: 0, slot: 1, side: 'north' },
  { id: 'cloud-innovation-center', name: '云创中心', kind: 'delivery', buildingKind: 'office',
    row: 3, column: 1, slot: 1, side: 'north' },
  { id: 'south-community-hospital', name: '城南社区医院', kind: 'delivery', buildingKind: 'hospital',
    row: 2, column: 2, slot: 3, side: 'south' },
  { id: 'yucai-school', name: '育才小学', kind: 'delivery', buildingKind: 'school',
    row: 3, column: 3, slot: 0, side: 'north' },
]

function aabb(centerX: number, centerZ: number, width: number, depth: number): Aabb2 {
  return { minX: centerX - width / 2, maxX: centerX + width / 2, minZ: centerZ - depth / 2, maxZ: centerZ + depth / 2 }
}

function roadId(axis: RoadAxis, index: number) {
  return `road-${axis}-${index}`
}

function blockId(row: number, column: number) {
  return `block-${row}-${column}`
}

function buildingId(row: number, column: number, slot: number) {
  return `building-${row}-${column}-${slot}`
}

function intersectionId(row: number, column: number) {
  return `junction-${row}-${column}`
}

function makeRoad(axis: RoadAxis, index: number, name: string): CityRoad {
  const id = roadId(axis, index)
  const coordinate = ROAD_COORDINATES[index]
  if (axis === 'x') {
    return {
      id, name, axis, width: ROAD_WIDTH,
      centerLine: [{ x: -HALF_MAP, z: coordinate }, { x: HALF_MAP, z: coordinate }],
      bounds: aabb(0, coordinate, MAP_SIZE, ROAD_WIDTH),
      lanes: [
        { id: `${id}-east`, direction: 'east', width: ROAD_WIDTH / 2,
          centerLine: [{ x: -HALF_MAP, z: coordinate + LANE_OFFSET }, { x: HALF_MAP, z: coordinate + LANE_OFFSET }] },
        { id: `${id}-west`, direction: 'west', width: ROAD_WIDTH / 2,
          centerLine: [{ x: HALF_MAP, z: coordinate - LANE_OFFSET }, { x: -HALF_MAP, z: coordinate - LANE_OFFSET }] },
      ],
    }
  }
  return {
    id, name, axis, width: ROAD_WIDTH,
    centerLine: [{ x: coordinate, z: -HALF_MAP }, { x: coordinate, z: HALF_MAP }],
    bounds: aabb(coordinate, 0, ROAD_WIDTH, MAP_SIZE),
    lanes: [
      { id: `${id}-south`, direction: 'south', width: ROAD_WIDTH / 2,
        centerLine: [{ x: coordinate - LANE_OFFSET, z: -HALF_MAP }, { x: coordinate - LANE_OFFSET, z: HALF_MAP }] },
      { id: `${id}-north`, direction: 'north', width: ROAD_WIDTH / 2,
        centerLine: [{ x: coordinate + LANE_OFFSET, z: HALF_MAP }, { x: coordinate + LANE_OFFSET, z: -HALF_MAP }] },
    ],
  }
}

const roads: readonly CityRoad[] = [
  ...['北环路', '烟火路', '午高峰大道', '文苑路', '南环路'].map((name, index) => makeRoad('x', index, name)),
  ...['西环路', '锦程路', '长安路', '朝阳路', '东环路'].map((name, index) => makeRoad('z', index, name)),
]

const intersections: readonly Intersection[] = ROAD_COORDINATES.flatMap((z, row) =>
  ROAD_COORDINATES.map((x, column) => ({
    id: intersectionId(row, column),
    position: { x, z },
    roadIds: [roadId('x', row), roadId('z', column)] as const,
    bounds: aabb(x, z, ROAD_WIDTH, ROAD_WIDTH),
  })),
)

const blocks: readonly CityBlock[] = Array.from({ length: GRID_SIZE }, (_, row) =>
  Array.from({ length: GRID_SIZE }, (_, column) => {
    const x = ROAD_COORDINATES[column] + BLOCK_SPACING / 2
    const z = ROAD_COORDINATES[row] + BLOCK_SPACING / 2
    const district = districts[(row < GRID_SIZE / 2 ? 0 : 2) + (column < GRID_SIZE / 2 ? 0 : 1)]
    const blockWidth = BLOCK_SPACING - ROAD_WIDTH
    return {
      id: blockId(row, column), row, column, districtId: district.id,
      bounds: aabb(x, z, blockWidth, blockWidth),
      buildableBounds: aabb(x, z, blockWidth - SIDEWALK_WIDTH * 2, blockWidth - SIDEWALK_WIDTH * 2),
    }
  }),
).flat()

const sidewalks: Sidewalk[] = blocks.flatMap((block) => {
  const { minX, maxX, minZ, maxZ } = block.bounds
  return [
    { id: `${block.id}-walk-north`, roadId: roadId('x', block.row),
      bounds: { minX, maxX, minZ, maxZ: minZ + SIDEWALK_WIDTH } },
    { id: `${block.id}-walk-south`, roadId: roadId('x', block.row + 1),
      bounds: { minX, maxX, minZ: maxZ - SIDEWALK_WIDTH, maxZ } },
    { id: `${block.id}-walk-west`, roadId: roadId('z', block.column),
      bounds: { minX, maxX: minX + SIDEWALK_WIDTH, minZ: minZ + SIDEWALK_WIDTH, maxZ: maxZ - SIDEWALK_WIDTH } },
    { id: `${block.id}-walk-east`, roadId: roadId('z', block.column + 1),
      bounds: { minX: maxX - SIDEWALK_WIDTH, maxX, minZ: minZ + SIDEWALK_WIDTH, maxZ: maxZ - SIDEWALK_WIDTH } },
  ]
})

for (let index = 0; index < GRID_SIZE; index += 1) {
  const start = ROAD_COORDINATES[index] + ROAD_WIDTH / 2
  const end = ROAD_COORDINATES[index + 1] - ROAD_WIDTH / 2
  sidewalks.push(
    { id: `outer-walk-north-${index}`, roadId: roadId('x', 0),
      bounds: { minX: start, maxX: end, minZ: -HALF_MAP, maxZ: -HALF_MAP + SIDEWALK_WIDTH } },
    { id: `outer-walk-south-${index}`, roadId: roadId('x', GRID_SIZE),
      bounds: { minX: start, maxX: end, minZ: HALF_MAP - SIDEWALK_WIDTH, maxZ: HALF_MAP } },
    { id: `outer-walk-west-${index}`, roadId: roadId('z', 0),
      bounds: { minX: -HALF_MAP, maxX: -HALF_MAP + SIDEWALK_WIDTH, minZ: start, maxZ: end } },
    { id: `outer-walk-east-${index}`, roadId: roadId('z', GRID_SIZE),
      bounds: { minX: HALF_MAP - SIDEWALK_WIDTH, maxX: HALF_MAP, minZ: start, maxZ: end } },
  )
}

const buildingSizes: Record<BuildingKind, { width: number; depth: number; height: number }> = {
  shop: { width: 26, depth: 22, height: 6 },
  apartment: { width: 26, depth: 24, height: 15 },
  office: { width: 24, depth: 26, height: 30 },
  civic: { width: 24, depth: 24, height: 9 },
  hospital: { width: 28, depth: 26, height: 15 },
  school: { width: 28, depth: 22, height: 9 },
}

const buildings: readonly CityBuilding[] = blocks.flatMap((block) =>
  Array.from({ length: 4 }, (_, slot) => {
    const spec = landmarkSpecs.find((entry) => entry.row === block.row && entry.column === block.column && entry.slot === slot)
    const district = districts.find((entry) => entry.id === block.districtId)!
    const kind = spec?.buildingKind ?? district.buildingKind
    const size = buildingSizes[kind]
    const x = (block.bounds.minX + block.bounds.maxX) / 2 + (slot % 2 === 0 ? -16 : 16)
    const z = (block.bounds.minZ + block.bounds.maxZ) / 2 + (slot < 2 ? -16 : 16)
    return {
      id: buildingId(block.row, block.column, slot),
      name: spec?.name ?? `${district.name}${block.row * GRID_SIZE + block.column + 1}号街坊${slot + 1}栋`,
      blockId: block.id, kind,
      height: size.height + ((block.row + block.column + slot) % 3) * (kind === 'shop' ? 1.5 : 3),
      bounds: aabb(x, z, size.width, size.depth),
    }
  }),
)

function roadsideAccess(block: CityBlock, side: Direction, along: number): RoadsideAccess {
  const halfWalk = SIDEWALK_WIDTH / 2
  let position: Point2
  let adjacentRoad: string
  if (side === 'north' || side === 'south') {
    position = { x: along, z: side === 'north' ? block.bounds.minZ + halfWalk : block.bounds.maxZ - halfWalk }
    adjacentRoad = roadId('x', block.row + (side === 'south' ? 1 : 0))
  } else {
    position = { x: side === 'west' ? block.bounds.minX + halfWalk : block.bounds.maxX - halfWalk, z: along }
    adjacentRoad = roadId('z', block.column + (side === 'east' ? 1 : 0))
  }
  return { position, radius: 2.5, roadId: adjacentRoad, side }
}

const landmarks: readonly CityLandmark[] = landmarkSpecs.map((spec) => {
  const block = blocks.find((entry) => entry.id === blockId(spec.row, spec.column))!
  const building = buildings.find((entry) => entry.id === buildingId(spec.row, spec.column, spec.slot))!
  const along = spec.side === 'north' || spec.side === 'south'
    ? (building.bounds.minX + building.bounds.maxX) / 2
    : (building.bounds.minZ + building.bounds.maxZ) / 2
  return {
    id: spec.id, name: spec.name, kind: spec.kind, buildingId: building.id,
    access: roadsideAccess(block, spec.side, along),
  }
})

const batteryStations = ([
  { id: 'food-street-battery', name: '烟火街换电站', row: 1, column: 0, side: 'south' },
  { id: 'south-battery', name: '城南换电站', row: 3, column: 2, side: 'north' },
] as const).map((spec) => {
  const block = blocks.find((entry) => entry.id === blockId(spec.row, spec.column))!
  const x = (block.bounds.minX + block.bounds.maxX) / 2
  const access = roadsideAccess(block, spec.side, x)
  const position = { x: x + 4, z: access.position.z }
  return { id: spec.id, name: spec.name, position, access }
})

const trafficRoutes: readonly TrafficRoute[] = blocks.map((block) => {
  const west = ROAD_COORDINATES[block.column] + LANE_OFFSET
  const east = ROAD_COORDINATES[block.column + 1] - LANE_OFFSET
  const north = ROAD_COORDINATES[block.row] + LANE_OFFSET
  const south = ROAD_COORDINATES[block.row + 1] - LANE_OFFSET
  const start: TrafficWaypoint = { position: { x: west, z: north }, intersectionId: intersectionId(block.row, block.column) }
  return {
    id: `${block.id}-clockwise`,
    waypoints: [
      start,
      { position: { x: east, z: north }, intersectionId: intersectionId(block.row, block.column + 1) },
      { position: { x: east, z: south }, intersectionId: intersectionId(block.row + 1, block.column + 1) },
      { position: { x: west, z: south }, intersectionId: intersectionId(block.row + 1, block.column) },
      start,
    ],
    laneIds: [
      `${roadId('x', block.row)}-east`, `${roadId('z', block.column + 1)}-south`,
      `${roadId('x', block.row + 1)}-west`, `${roadId('z', block.column)}-north`,
    ],
  }
})

export const CITY_LAYOUT: CityLayout = {
  size: MAP_SIZE,
  gridSize: GRID_SIZE,
  bounds: aabb(0, 0, MAP_SIZE, MAP_SIZE),
  roadWidth: ROAD_WIDTH,
  sidewalkWidth: SIDEWALK_WIDTH,
  districts, blocks, roads, intersections, sidewalks, buildings,
  colliders: buildings.map((building) => ({ buildingId: building.id, bounds: building.bounds })),
  landmarks, batteryStations, trafficRoutes,
  spawn: { position: { x: -28, z: LANE_OFFSET }, facing: 'east' },
}
