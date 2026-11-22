import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Ray,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BuildingKind, CityBuilding, CityLayout, Direction } from './types'

type Part = { matrix: Matrix4; color: Color }
type Sign = { text: string; color: string; matrix: Matrix4 }

const BUILDING_BASE = 0.16
const FACING: Record<Direction, number> = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 }
const PALETTES: Record<BuildingKind, readonly string[]> = {
  shop: ['#e5cba7', '#f1dbb8', '#e5b98e', '#d9c3a1'],
  apartment: ['#ba7966', '#cd8d72', '#ae7161', '#d5a185'],
  office: ['#77a6b4', '#6193a4', '#a2c6cd', '#8bb2bd'],
  civic: ['#d6dfcc', '#eadfbb', '#c5d9ca', '#e5d3ac'],
  hospital: ['#ece6d9'],
  school: ['#eed49c'],
}
const SHOP_COLORS = ['#a64032', '#cd6c30', '#307b70', '#8b3840', '#346863', '#315c83', '#b16b25']
const GENERIC_SIGNS: Record<BuildingKind, readonly string[]> = {
  shop: ['巷口早点', '街坊便利', '鲜果铺', '家常小炒'],
  apartment: ['红砖公寓', '邻里人家'],
  office: ['星辰商务', '创客空间'],
  civic: ['社区服务', '邻里书屋', '便民中心'],
  hospital: ['社区门诊'],
  school: ['育才学园'],
}

export function buildWorld(layout: CityLayout) {
  const root = new Group()
  root.name = 'procedural-city'
  const boxGeometry = new BoxGeometry(1, 1, 1)
  const planeGeometry = new PlaneGeometry(1, 1)
  const trunkGeometry = new CylinderGeometry(1, 1, 1, 7)
  const crownGeometry = new IcosahedronGeometry(1, 0)
  crownGeometry.computeBoundingBox()
  const matte = new MeshStandardMaterial({ roughness: 0.92, flatShading: true })
  const canopyMaterial = new MeshStandardMaterial({ roughness: 0.92, flatShading: true, transparent: true, depthWrite: false })
  canopyMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float canopyOpacity;\nvarying float vCanopyOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCanopyOpacity = canopyOpacity;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCanopyOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vCanopyOpacity;')
  }
  const glass = new MeshStandardMaterial({ roughness: 0.4, metalness: 0.18 })
  const unlit = new MeshBasicMaterial({ toneMapped: false })
  const transform = new Object3D()
  const batches: { name: string; geometry: BufferGeometry; material: Material; shadow: boolean; parts: Part[] }[] = []

  function batch(name: string, geometry: BufferGeometry = boxGeometry, material: Material = matte, shadow = true) {
    const entry = { name, geometry, material, shadow, parts: [] as Part[] }
    batches.push(entry)
    return entry.parts
  }

  function put(parts: Part[], x: number, y: number, z: number, width: number, height: number, depth: number, color: string, yaw = 0) {
    transform.position.set(x, y, z)
    transform.rotation.set(0, yaw, 0)
    transform.scale.set(width, height, depth)
    transform.updateMatrix()
    parts.push({ matrix: transform.matrix.clone(), color: new Color(color) })
  }

  const foundations = batch('street-foundations')
  const shells = batch('building-shells')
  const details = batch('architecture-details')
  const markings = batch('road-markings', boxGeometry, unlit, false)
  const windows = batch('window-panes', planeGeometry, glass, false)
  const trunks = batch('tree-trunks', trunkGeometry)
  const crowns = batch('tree-canopies', crownGeometry, canopyMaterial)
  const furniture = batch('street-furniture')
  const signs: Sign[] = []

  put(foundations, 0, -5, 0, 2200, 1, 2200, '#bed0b1')
  put(foundations, 0, -2, 0, layout.size + 12, 3.6, layout.size + 12, '#d4c6a9')
  put(foundations, 0, -3.65, 0, layout.size + 16, 0.4, layout.size + 16, '#b4b9a0')

  function roadBox(minX: number, maxX: number, minZ: number, maxZ: number) {
    put(foundations, (minX + maxX) / 2, -0.045, (minZ + maxZ) / 2, maxX - minX, 0.09, maxZ - minZ, '#697b79')
  }

  const horizontalRoads = layout.roads.filter((road) => road.axis === 'x').sort((a, b) => a.bounds.minZ - b.bounds.minZ)
  for (const road of layout.roads) {
    const { minX, maxX, minZ, maxZ } = road.bounds
    if (road.axis === 'x') roadBox(minX, maxX, minZ, maxZ)
    else {
      let start = minZ
      for (const crossing of horizontalRoads) {
        if (crossing.bounds.minZ > start) roadBox(minX, maxX, start, crossing.bounds.minZ)
        start = crossing.bounds.maxZ
      }
      if (start < maxZ) roadBox(minX, maxX, start, maxZ)
    }
  }

  for (const block of layout.blocks) {
    const b = block.buildableBounds
    const x = (b.minX + b.maxX) / 2
    const z = (b.minZ + b.maxZ) / 2
    put(foundations, x, 0.08, z, b.maxX - b.minX, 0.16, b.maxZ - b.minZ, '#d4d2bd')
    put(foundations, x, 0.18, z, 4.4, 0.04, 51, '#9fb286')
    put(foundations, x, 0.21, z, 12, 0.02, 8, '#e6dcc0')
  }
  for (const sidewalk of layout.sidewalks) {
    const b = sidewalk.bounds
    put(foundations, (b.minX + b.maxX) / 2, 0.12, (b.minZ + b.maxZ) / 2, b.maxX - b.minX, 0.24, b.maxZ - b.minZ, '#e4ddc8')
  }

  function paint(x: number, z: number, width: number, depth: number, color = '#f5efda') {
    const b = layout.bounds
    if (x - width / 2 < b.minX || x + width / 2 > b.maxX || z - depth / 2 < b.minZ || z + depth / 2 > b.maxZ) return
    put(markings, x, 0.018, z, width, 0.025, depth, color)
  }

  for (const road of layout.roads) {
    const start = road.centerLine[0]
    const end = road.centerLine[1]
    for (let along = start[road.axis] + 3; along < end[road.axis] - 3; along += 7) {
      if (layout.intersections.some((junction) => junction.roadIds.includes(road.id) && Math.abs(junction.position[road.axis] - along) < 14)) continue
      if (road.axis === 'x') paint(along, start.z, 3.4, 0.22)
      else paint(start.x, along, 0.22, 3.4)
    }
  }
  for (const junction of layout.intersections) {
    const { x, z } = junction.position
    const offset = layout.roadWidth / 2 + 2
    for (let stripe = -4.5; stripe <= 4.5; stripe += 1.3) {
      paint(x + stripe, z - offset, 0.72, 2.8)
      paint(x + stripe, z + offset, 0.72, 2.8)
      paint(x - offset, z + stripe, 2.8, 0.72)
      paint(x + offset, z + stripe, 2.8, 0.72)
    }
    paint(x - 10.5, z + 3, 0.25, 5)
    paint(x + 10.5, z - 3, 0.25, 5)
    paint(x - 3, z - 10.5, 5, 0.25)
    paint(x + 3, z + 10.5, 5, 0.25)
  }

  function facade(building: CityBuilding, side: Direction, along: number, y: number, offset = 0.055) {
    const b = building.bounds
    const yaw = FACING[side]
    const extent = (side === 'east' || side === 'west' ? b.maxX - b.minX : b.maxZ - b.minZ) / 2
    return {
      x: (b.minX + b.maxX) / 2 + Math.sin(yaw) * (extent + offset) + Math.cos(yaw) * along,
      y: y + BUILDING_BASE,
      z: (b.minZ + b.maxZ) / 2 + Math.cos(yaw) * (extent + offset) - Math.sin(yaw) * along,
      yaw,
    }
  }

  function sign(text: string, color: string, x: number, y: number, z: number, width: number, height: number, yaw: number) {
    put(details, x - Math.sin(yaw) * 0.14, y, z - Math.cos(yaw) * 0.14, width + 0.35, height + 0.3, 0.22, '#344b43', yaw)
    transform.position.set(x, y, z)
    transform.rotation.set(0, yaw, 0)
    transform.scale.set(width, height, 1)
    transform.updateMatrix()
    signs.push({ text, color, matrix: transform.matrix.clone() })
  }

  layout.buildings.forEach((building, index) => {
    const b = building.bounds
    const width = b.maxX - b.minX
    const depth = b.maxZ - b.minZ
    const x = (b.minX + b.maxX) / 2
    const z = (b.minZ + b.maxZ) / 2
    const h = building.height
    const kind = building.kind
    const palette = PALETTES[kind]
    const landmark = layout.landmarks.find((point) => point.buildingId === building.id)
    const front = landmark?.access.side ?? (index % 4 < 2 ? 'north' : 'south')
    const accent = kind === 'shop' ? SHOP_COLORS[index % SHOP_COLORS.length]
      : kind === 'apartment' ? '#8b5146' : kind === 'hospital' ? '#a34840'
        : kind === 'school' ? '#397e72' : '#3d6e79'
    const plinthHeight = 0.7
    const upperHeight = Math.max(0.5, h - plinthHeight)
    // 底座与主体墙面垂直堆叠且零重叠，彻底消除建筑底部共面 Z-Fighting 条纹屏闪。
    put(details, x, BUILDING_BASE + plinthHeight / 2, z, width, plinthHeight, depth, kind === 'shop' ? accent : '#b8bcae')
    put(shells, x, BUILDING_BASE + plinthHeight + upperHeight / 2, z, width, upperHeight, depth, palette[index % palette.length])
    put(details, x, BUILDING_BASE + h + 0.24, z, width, 0.48, depth, kind === 'apartment' ? '#825e52' : '#f0e5c9')

    if (kind === 'office') {
      put(details, x, BUILDING_BASE + h + 1.1, z, width * 0.68, 1.7, depth * 0.62, '#5b808d')
      for (const dx of [-width / 2 + 0.31, width / 2 - 0.31]) {
        for (const dz of [-depth / 2 + 0.31, depth / 2 - 0.31]) {
          put(details, x + dx, BUILDING_BASE + plinthHeight + upperHeight / 2, z + dz, 0.7, upperHeight, 0.7, '#d5e4df')
        }
      }
    } else if (kind === 'apartment') {
      put(details, x, BUILDING_BASE + h + 0.85, z, width * 0.66, 1.2, depth * 0.57, '#b9957b')
      put(trunks, x + 6, BUILDING_BASE + h + 1.65, z - 4, 1.55, 2.3, 1.55, '#a8b6ac')
    } else if (kind === 'shop') {
      put(details, x, BUILDING_BASE + h + 0.7, z, width * 0.88, 0.55, depth * 0.84, accent)
    }

    for (const side of ['north', 'east', 'south', 'west'] as const) {
      const faceWidth = side === 'north' || side === 'south' ? width : depth
      const columns = Math.floor(faceWidth / (kind === 'office' ? 4.8 : 5.8))
      const floors = kind === 'shop' ? 1 : Math.floor(h / 3.4)
      for (let floor = 0; floor < floors; floor += 1) {
        for (let column = 0; column < columns; column += 1) {
          const along = (column + 0.5) * faceWidth / columns - faceWidth / 2
          const p = facade(building, side, along, 1.65 + floor * 3.4)
          const windowWidth = faceWidth / columns - (kind === 'office' ? 0.65 : 2.2)
          const windowHeight = kind === 'shop' ? 2.1 : kind === 'office' ? 2.55 : 1.85
          const tint = (floor + column + index) % 5 === 0 ? '#bdd9cc' : kind === 'apartment' ? '#4b777a' : '#467c8c'
          put(windows, p.x, p.y, p.z, windowWidth, windowHeight, 1, tint, p.yaw)
          if (kind === 'apartment') put(details, p.x, p.y - 1.05, p.z, windowWidth + 0.35, 0.2, 0.48, '#e5cfb0', p.yaw)
        }
      }
    }

    const entry = facade(building, front, 0, 1.45, 0.095)
    put(windows, entry.x, entry.y, entry.z, kind === 'shop' ? 2.1 : 3.2, 2.6, 1, '#284d56', entry.yaw)
    const signHeight = kind === 'shop' ? 3.1 : 2.8
    const signY = kind === 'shop' ? h - 1.75 : Math.min(h - 2.2, 6)
    const p = facade(building, front, 0, signY, 0.24)
    const faceWidth = front === 'north' || front === 'south' ? width : depth
    const title = landmark?.name ?? GENERIC_SIGNS[kind][index % GENERIC_SIGNS[kind].length]
    sign(title, accent, p.x, p.y, p.z, faceWidth * 0.84, signHeight, p.yaw)

    if (kind === 'shop') {
      for (let stripe = 0; stripe < 8; stripe += 1) {
        const along = (stripe + 0.5) * faceWidth / 8 - faceWidth / 2
        const awning = facade(building, front, along, 2.75, 0.7)
        put(details, awning.x, awning.y, awning.z, faceWidth / 8, 0.17, 1.6, stripe % 2 ? '#f7dfaa' : accent, awning.yaw)
      }
    }
    if (kind === 'hospital') {
      const cross = facade(building, front, 0, h - 4, 0.08)
      put(details, cross.x, cross.y, cross.z, 4.8, 1.25, 0.16, '#b8493e', cross.yaw)
      put(details, cross.x, cross.y, cross.z, 1.25, 4.8, 0.18, '#b8493e', cross.yaw)
    }
    if (kind === 'school') {
      for (let section = 0; section < 5; section += 1) {
        const band = facade(building, front, (section - 2) * 4, h - 0.75, 0.08)
        put(details, band.x, band.y, band.z, 3.8, 0.65, 0.15, ['#d8835b', '#e1b751', '#80a78a', '#6896a0', '#bc8376'][section], band.yaw)
      }
    }
  })

  const accesses = [...layout.landmarks, ...layout.batteryStations].map((point) => point.access)
  const roadById = new Map(layout.roads.map((road) => [road.id, road]))
  const clearEntrance = (x: number, z: number) => accesses.every((access) => Math.hypot(access.position.x - x, access.position.z - z) > access.radius + 3.3)

  function tree(x: number, z: number, index: number) {
    put(trunks, x, 1.75, z, 0.3, 3.1, 0.3, '#947459')
    put(crowns, x, 5.3, z, 3.1, 3.5 + index % 2 * 0.45, 3.1, ['#719766', '#91ab73', '#588e74'][index % 3], index * 0.7)
    put(furniture, x, 0.24, z, 1.45, 0.16, 1.45, '#b5b795')
  }

  layout.sidewalks.forEach((sidewalk, index) => {
    const b = sidewalk.bounds
    const alongX = b.maxX - b.minX > b.maxZ - b.minZ
    const start = alongX ? b.minX : b.minZ
    const end = alongX ? b.maxX : b.maxZ
    const fixed = alongX ? (b.minZ + b.maxZ) / 2 : (b.minX + b.maxX) / 2
    const road = roadById.get(sidewalk.roadId)!
    for (let along = start + 12; along < end - 7; along += 24) {
      const x = alongX ? along : fixed
      const z = alongX ? fixed : along
      if (clearEntrance(x, z)) tree(x, z, index)
    }
    for (let along = start + 24; along < end - 8; along += 36) {
      const x = alongX ? along : fixed
      const z = alongX ? fixed : along
      if (!clearEntrance(x, z)) continue
      const nx = road.axis === 'z' ? Math.sign(road.centerLine[0].x - x) : 0
      const nz = road.axis === 'x' ? Math.sign(road.centerLine[0].z - z) : 0
      put(furniture, x, 3.7, z, 0.24, 7.1, 0.24, '#52665f')
      put(furniture, x + nx, 7.1, z + nz, nx ? 2.2 : 0.2, 0.22, nz ? 2.2 : 0.2, '#52665f')
      put(furniture, x + nx * 2, 6.95, z + nz * 2, nx ? 1.3 : 0.65, 0.3, nz ? 1.3 : 0.65, '#40544d')
      put(markings, x + nx * 2, 6.77, z + nz * 2, nx ? 1.05 : 0.48, 0.035, nz ? 1.05 : 0.48, '#ffe9b0')
    }
  })

  layout.blocks.forEach((block, index) => {
    const x = (block.bounds.minX + block.bounds.maxX) / 2
    const z = (block.bounds.minZ + block.bounds.maxZ) / 2
    tree(x, z - 19, index)
    tree(x, z + 19, index + 1)
  })

  for (const station of layout.batteryStations) {
    const { x, z } = station.position
    const yaw = FACING[station.access.side]
    put(furniture, x, 1.6, z, 2.6, 2.8, 1.2, '#387d91', yaw)
    put(furniture, x, 3.1, z, 2.8, 0.3, 1.4, '#e4d394', yaw)
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const along = (column - 0.5) * 1.12
        put(windows, x + Math.cos(yaw) * along + Math.sin(yaw) * 0.615, 0.75 + row * 0.67, z - Math.sin(yaw) * along + Math.cos(yaw) * 0.615, 0.96, 0.53, 1, '#c4e0c8', yaw)
      }
    }
    sign('便民换电', '#32647e', x + Math.sin(yaw) * 0.75, 2.7, z + Math.cos(yaw) * 0.75, 2.45, 0.48, yaw)
  }

  const canopyBounds = crowns.map(({ matrix }) => crownGeometry.boundingBox!.clone().applyMatrix4(matrix).expandByScalar(0.4))
  const canopyOpacity = new InstancedBufferAttribute(new Float32Array(crowns.length).fill(1), 1).setUsage(DynamicDrawUsage)
  crownGeometry.setAttribute('canopyOpacity', canopyOpacity)
  const sightline = new Ray()
  const sightTarget = new Vector3()
  const sightHit = new Vector3()

  let instanceCount = 0
  for (const entry of batches) {
    const mesh = new InstancedMesh(entry.geometry, entry.material, entry.parts.length)
    mesh.name = entry.name
    entry.parts.forEach((part, index) => {
      mesh.setMatrixAt(index, part.matrix)
      mesh.setColorAt(index, part.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.castShadow = entry.shadow
    mesh.receiveShadow = entry.material !== unlit
    mesh.computeBoundingSphere()
    root.add(mesh)
    instanceCount += entry.parts.length
  }

  const tiles = [...new Map(signs.map((entry) => [`${entry.text}|${entry.color}`, entry])).values()]
  const canvas = document.createElement('canvas')
  const tileWidth = 512
  const tileHeight = 128
  canvas.width = tileWidth * 2
  canvas.height = 2 ** Math.ceil(Math.log2(Math.ceil(tiles.length / 2) * tileHeight))
  const context = canvas.getContext('2d')!
  tiles.forEach((entry, index) => {
    const x = index % 2 * tileWidth
    const y = Math.floor(index / 2) * tileHeight
    context.fillStyle = entry.color
    context.fillRect(x, y, tileWidth, tileHeight)
    context.strokeStyle = '#f2d99d'
    context.lineWidth = 3
    context.strokeRect(x + 10, y + 10, tileWidth - 20, tileHeight - 20)
    context.font = '800 76px "Microsoft YaHei", sans-serif'
    const fontSize = Math.min(76, 76 * (tileWidth - 56) / context.measureText(entry.text).width)
    context.font = `800 ${fontSize}px "Microsoft YaHei", sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = '#fff1cf'
    context.fillText(entry.text, x + tileWidth / 2, y + tileHeight / 2)
  })
  const atlas = new CanvasTexture(canvas)
  atlas.name = 'local-chinese-sign-atlas'
  atlas.colorSpace = SRGBColorSpace
  atlas.anisotropy = 4
  const signMaterial = new MeshBasicMaterial({ map: atlas, toneMapped: false })
  const signGeometries = signs.map((entry) => {
    const index = tiles.findIndex((tile) => tile.text === entry.text && tile.color === entry.color)
    const u = index % 2 * tileWidth
    const v = Math.floor(index / 2) * tileHeight
    const geometry = new PlaneGeometry(1, 1)
    const uv = geometry.getAttribute('uv')
    for (let vertex = 0; vertex < uv.count; vertex += 1) {
      uv.setXY(vertex, (u + 2 + uv.getX(vertex) * (tileWidth - 4)) / canvas.width, 1 - (v + tileHeight - 2 - uv.getY(vertex) * (tileHeight - 4)) / canvas.height)
    }
    geometry.applyMatrix4(entry.matrix)
    return geometry
  })
  const signGeometry = mergeGeometries(signGeometries)!
  signGeometries.forEach((geometry) => geometry.dispose())
  const signMesh = new Mesh(signGeometry, signMaterial)
  signMesh.name = 'chinese-signs'
  root.add(signMesh)

  return {
    root,
    instanceCount,
    updateCanopyOcclusion(cameraPosition: Vector3, riderPosition: Vector3 | null, deltaSeconds: number) {
      let distance = 0
      if (riderPosition) {
        sightTarget.copy(riderPosition).y += 1.8
        sightline.origin.copy(cameraPosition)
        sightline.direction.subVectors(sightTarget, cameraPosition)
        distance = sightline.direction.length()
        sightline.direction.normalize()
      }
      const blend = 1 - Math.exp(-12 * deltaSeconds)
      let changed = false
      canopyBounds.forEach((bounds, index) => {
        const blocked = riderPosition && (bounds.containsPoint(cameraPosition)
          || sightline.intersectBox(bounds, sightHit) && cameraPosition.distanceTo(sightHit) < distance)
        const target = blocked ? 0.08 : 1
        const current = canopyOpacity.getX(index)
        const next = !riderPosition || Math.abs(target - current) < 0.001 ? target : current + (target - current) * blend
        if (next !== current) {
          canopyOpacity.setX(index, next)
          changed = true
        }
      })
      if (changed) canopyOpacity.needsUpdate = true
    },
    dispose() {
      for (const child of root.children) if (child instanceof InstancedMesh) child.dispose()
      for (const geometry of [boxGeometry, planeGeometry, trunkGeometry, crownGeometry, signGeometry]) geometry.dispose()
      for (const material of [matte, canopyMaterial, glass, unlit, signMaterial]) material.dispose()
      atlas.dispose()
      root.clear()
      root.removeFromParent()
    },
  }
}
