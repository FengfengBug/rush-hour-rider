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
  DistrictId,
  Intersection,
  Point2,
  RoadAxis,
  RoadsideAccess,
  Sidewalk,
  TrafficRoute,
  TrafficWaypoint,
} from './types'

// 单位为米，原点在地图中心；+X 向东、+Z 向南，8×8 街区总面积为原 4×4 街区的 4 倍（720m × 720m）。
const MAP_SIZE = 720
const GRID_SIZE = 8
const ROAD_WIDTH = 12
const SIDEWALK_WIDTH = 4
const HALF_MAP = MAP_SIZE / 2
const LANE_OFFSET = ROAD_WIDTH / 4
const OUTER_ROAD = HALF_MAP - ROAD_WIDTH / 2 - SIDEWALK_WIDTH
const BLOCK_SPACING = (OUTER_ROAD * 2) / GRID_SIZE
const ROAD_COORDINATES = Array.from({ length: GRID_SIZE + 1 }, (_, index) => -OUTER_ROAD + index * BLOCK_SPACING)

const districts: readonly CityDistrict[] = [
  { id: 'food-street', name: '烟火美食街', buildingKind: 'shop' },
  { id: 'night-market', name: '星光商业夜市', buildingKind: 'mall' },
  { id: 'old-neighborhood', name: '老旧红砖小区', buildingKind: 'apartment' },
  { id: 'luxury-compound', name: '翡翠高端住宅区', buildingKind: 'luxury' },
  { id: 'cbd', name: '星辰 CBD 商务区', buildingKind: 'office' },
  { id: 'tech-park', name: '智谷科创产业园', buildingKind: 'tech' },
  { id: 'civic-center', name: '社区医院与学园', buildingKind: 'civic' },
  { id: 'university-town', name: '南城大学城', buildingKind: 'campus' },
]

function districtForBlock(row: number, column: number): DistrictId {
  if (row < 2 && column < 4) return 'night-market'
  if (row < 4 && column < 4) return 'food-street'
  if (row < 4 && column < 6) return 'old-neighborhood'
  if (row < 4) return 'luxury-compound'
  if (row < 6 && column < 4) return 'cbd'
  if (column < 4) return 'tech-park'
  if (column < 6) return 'civic-center'
  return 'university-town'
}

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
  // 12 家餐饮/零售取餐商家
  { id: 'shaxian-snacks', name: '沙县小吃', kind: 'merchant', buildingKind: 'shop', row: 3, column: 3, slot: 3, side: 'south' },
  { id: 'grandma-wontons', name: '阿婆馄饨', kind: 'merchant', buildingKind: 'shop', row: 3, column: 3, slot: 0, side: 'north' },
  { id: 'bawang-tea', name: '霸王茶铺', kind: 'merchant', buildingKind: 'shop', row: 2, column: 3, slot: 3, side: 'east' },
  { id: 'laowang-bbq', name: '老王烧烤', kind: 'merchant', buildingKind: 'shop', row: 2, column: 2, slot: 2, side: 'south' },
  { id: 'mixue-tea', name: '蜜雪甜茶', kind: 'merchant', buildingKind: 'shop', row: 3, column: 2, slot: 1, side: 'north' },
  { id: 'lanzhou-noodles', name: '兰州拉面', kind: 'merchant', buildingKind: 'shop', row: 2, column: 1, slot: 1, side: 'north' },
  { id: 'chen-braised-chicken', name: '陈记黄焖鸡', kind: 'merchant', buildingKind: 'shop', row: 3, column: 1, slot: 3, side: 'south' },
  { id: 'starlight-mall-food', name: '星光万象食集', kind: 'merchant', buildingKind: 'mall', row: 1, column: 2, slot: 2, side: 'south' },
  { id: 'night-skewer-alley', name: '夜市大排档', kind: 'merchant', buildingKind: 'mall', row: 0, column: 1, slot: 3, side: 'south' },
  { id: 'coffee-lab', name: '蓝鲸精品咖啡', kind: 'merchant', buildingKind: 'shop', row: 4, column: 3, slot: 1, side: 'north' },
  { id: 'tech-bistro', name: '智谷轻食社', kind: 'merchant', buildingKind: 'shop', row: 6, column: 2, slot: 0, side: 'north' },
  { id: 'campus-canteen', name: '大学城小吃街', kind: 'merchant', buildingKind: 'shop', row: 5, column: 6, slot: 2, side: 'west' },

  // 14 个送达地标（区分老旧开放小区与高端封闭小区）
  { id: 'xingfuli-estate', name: '幸福里小区', kind: 'delivery', buildingKind: 'apartment', row: 3, column: 4, slot: 3, side: 'south' },
  { id: 'sunshine-estate', name: '阳光老小区', kind: 'delivery', buildingKind: 'apartment', row: 2, column: 4, slot: 0, side: 'north' },
  { id: 'redbrick-homes', name: '红砖家园', kind: 'delivery', buildingKind: 'apartment', row: 1, column: 5, slot: 2, side: 'south' },
  { id: 'yujing-manor', name: '御景华府', kind: 'delivery', buildingKind: 'luxury', row: 3, column: 6, slot: 2, side: 'south' },
  { id: 'jade-residence', name: '翡翠云邸', kind: 'delivery', buildingKind: 'luxury', row: 2, column: 6, slot: 0, side: 'west' },
  { id: 'platinum-court', name: '铂金公馆', kind: 'delivery', buildingKind: 'luxury', row: 1, column: 7, slot: 2, side: 'west' },
  { id: 'starlight-tower', name: '星辰科技大厦', kind: 'delivery', buildingKind: 'office', row: 4, column: 2, slot: 1, side: 'north' },
  { id: 'cloud-innovation-center', name: '云创中心', kind: 'delivery', buildingKind: 'office', row: 5, column: 3, slot: 1, side: 'east' },
  { id: 'skyline-finance', name: '天穹金融中心', kind: 'delivery', buildingKind: 'office', row: 4, column: 1, slot: 0, side: 'north' },
  { id: 'zhigu-rd-park', name: '智谷研发园', kind: 'delivery', buildingKind: 'tech', row: 6, column: 3, slot: 1, side: 'north' },
  { id: 'south-community-hospital', name: '城南社区医院', kind: 'delivery', buildingKind: 'hospital', row: 4, column: 4, slot: 3, side: 'south' },
  { id: 'first-hospital-branch', name: '市一院南分院', kind: 'delivery', buildingKind: 'hospital', row: 6, column: 5, slot: 0, side: 'north' },
  { id: 'yucai-school', name: '育才小学', kind: 'delivery', buildingKind: 'school', row: 5, column: 5, slot: 0, side: 'north' },
  { id: 'nancheng-university', name: '南城大学东门', kind: 'delivery', buildingKind: 'campus', row: 5, column: 7, slot: 0, side: 'west' },
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
  ...['北环路', '星光北路', '烟火路', '银杏路', '午高峰大道', '滨河路', '文苑路', '科创路', '南环路'].map((name, index) => makeRoad('x', index, name)),
  ...['西环路', '锦程路', '美食街', '梧桐路', '长安路', '朝阳路', '翡翠大道', '学院路', '东环路'].map((name, index) => makeRoad('z', index, name)),
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
    const districtId = districtForBlock(row, column)
    const blockWidth = BLOCK_SPACING - ROAD_WIDTH
    return {
      id: blockId(row, column), row, column, districtId,
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
  shop: { width: 26, depth: 22, height: 6.5 },
  mall: { width: 28, depth: 24, height: 11.5 },
  apartment: { width: 26, depth: 24, height: 15 },
  luxury: { width: 25, depth: 25, height: 24 },
  office: { width: 24, depth: 26, height: 32 },
  tech: { width: 27, depth: 24, height: 18 },
  civic: { width: 24, depth: 24, height: 10 },
  hospital: { width: 28, depth: 26, height: 16 },
  school: { width: 28, depth: 22, height: 9.5 },
  campus: { width: 27, depth: 23, height: 13 },
}

const buildings: readonly CityBuilding[] = blocks.flatMap((block) =>
  Array.from({ length: 4 }, (_, slot) => {
    const spec = landmarkSpecs.find((entry) => entry.row === block.row && entry.column === block.column && entry.slot === slot)
    const district = districts.find((entry) => entry.id === block.districtId)!
    const kind = spec?.buildingKind ?? district.buildingKind
    const size = buildingSizes[kind]
    const x = (block.bounds.minX + block.bounds.maxX) / 2 + (slot % 2 === 0 ? -16.5 : 16.5)
    const z = (block.bounds.minZ + block.bounds.maxZ) / 2 + (slot < 2 ? -16.5 : 16.5)
    return {
      id: buildingId(block.row, block.column, slot),
      name: spec?.name ?? `${district.name}${block.row * GRID_SIZE + block.column + 1}号坊${slot + 1}栋`,
      blockId: block.id, kind,
      height: size.height + ((block.row + block.column + slot) % 3) * (kind === 'shop' ? 1.5 : 3.2),
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
  { id: 'food-street-battery', name: '烟火街换电站', row: 3, column: 2, side: 'south' },
  { id: 'night-market-battery', name: '星光广场换电站', row: 1, column: 1, side: 'south' },
  { id: 'luxury-gate-battery', name: '翡翠大道换电站', row: 2, column: 5, side: 'east' },
  { id: 'cbd-battery', name: '星辰CBD换电站', row: 5, column: 1, side: 'north' },
  { id: 'south-battery', name: '城南换电站', row: 5, column: 4, side: 'north' },
  { id: 'campus-battery', name: '大学城换电站', row: 6, column: 6, side: 'north' },
] as const).map((spec) => {
  const block = blocks.find((entry) => entry.id === blockId(spec.row, spec.column))!
  const centerAlong = spec.side === 'north' || spec.side === 'south'
    ? (block.bounds.minX + block.bounds.maxX) / 2
    : (block.bounds.minZ + block.bounds.maxZ) / 2
  const access = roadsideAccess(block, spec.side, centerAlong)
  const position = spec.side === 'north' || spec.side === 'south'
    ? { x: centerAlong + 3.6, z: access.position.z }
    : { x: access.position.x, z: centerAlong + 3.6 }
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
