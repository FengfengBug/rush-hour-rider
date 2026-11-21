import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three'
import type { CityLayout, Point2, TrafficLightPhase, TrafficSignal, TrafficVehicle } from './types'

type Part = { batch: number; index: number; matrix: Matrix4 }
type Batch = { name: string; geometry: BufferGeometry; material: Material; shadow: boolean; colors: Color[] }
type SignalVisual = {
  parts: Part[]
  bulbsX: number[]
  bulbsZ: number[]
  x: number
  z: number
  phaseX: TrafficLightPhase | null
  phaseZ: TrafficLightPhase | null
}
type VehicleVisual = {
  parts: Part[]
  paint: number[]
  brakes: number[]
  width: number
  length: number
  color: string
  braking: boolean | null
}

const SOLID = 0
const GLASS = 1
const WHEEL = 2
const LAMP = 3
const BULB = 4
const PHASES = ['red', 'yellow', 'green'] as const
const APPROACHES = [
  { yaw: -Math.PI / 2, axis: 'x' },
  { yaw: Math.PI / 2, axis: 'x' },
  { yaw: Math.PI, axis: 'z' },
  { yaw: 0, axis: 'z' },
] as const
const HORN_DURATION = 0.7
const RING_DELAY = 0.13
const RING_LIFETIME = HORN_DURATION - RING_DELAY

export function buildTrafficVisuals(layout: CityLayout, signals: readonly TrafficSignal[], vehicles: readonly TrafficVehicle[]) {
  const root = new Group()
  root.name = 'traffic-visuals'
  const boxGeometry = new BoxGeometry(1, 1, 1)
  const wheelGeometry = new CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2)
  const bulbGeometry = new SphereGeometry(1, 10, 6)
  const ringGeometry = new RingGeometry(0.955, 1, 48).rotateX(-Math.PI / 2)
  const matte = new MeshStandardMaterial({ roughness: 0.78, metalness: 0.06, flatShading: true })
  const glass = new MeshStandardMaterial({ roughness: 0.3, metalness: 0.22, flatShading: true })
  const unlit = new MeshBasicMaterial({ toneMapped: false })
  const batches: Batch[] = [
    { name: 'traffic-bodies-and-posts', geometry: boxGeometry, material: matte, shadow: true, colors: [] },
    { name: 'traffic-windows', geometry: boxGeometry, material: glass, shadow: false, colors: [] },
    { name: 'traffic-tires-and-hubs', geometry: wheelGeometry, material: matte, shadow: true, colors: [] },
    { name: 'traffic-vehicle-lamps', geometry: boxGeometry, material: unlit, shadow: false, colors: [] },
    { name: 'traffic-signal-bulbs', geometry: bulbGeometry, material: unlit, shadow: false, colors: [] },
  ]
  const transform = new Object3D()
  const combinedMatrix = new Matrix4()
  const color = new Color()
  const activeBulbs = [new Color('#ff513f'), new Color('#ffd45b'), new Color('#65f19c')]
  const inactiveBulbs = [new Color('#4a2b29'), new Color('#4c4029'), new Color('#294337')]
  const brakeOn = new Color('#ff5142')
  const brakeOff = new Color('#74332e')
  const signalVisuals: SignalVisual[] = []
  const vehicleVisuals: VehicleVisual[] = []

  function put(batch: number, parts: Part[], x: number, y: number, z: number, width: number, height: number, depth: number, tint: string | Color, yaw = 0) {
    transform.position.set(x, y, z)
    transform.rotation.set(0, yaw, 0)
    transform.scale.set(width, height, depth)
    transform.updateMatrix()
    const index = batches[batch].colors.length
    batches[batch].colors.push(new Color(tint))
    parts.push({ batch, index, matrix: transform.matrix.clone() })
    return index
  }

  const laneOffset = layout.roadWidth / 4
  const shoulder = layout.roadWidth / 2 + Math.min(0.7, layout.sidewalkWidth / 2)
  const stopOffset = 10
  for (let index = 0; index < signals.length; index += 1) {
    const visual: SignalVisual = { parts: [], bulbsX: [], bulbsZ: [], x: NaN, z: NaN, phaseX: null, phaseZ: null }
    signalVisuals.push(visual)
    for (const approach of APPROACHES) {
      const sin = Math.sin(approach.yaw)
      const cos = Math.cos(approach.yaw)
      // Local +Z faces the incoming rider; local +X is the approach's right shoulder.
      function postPart(batch: number, x: number, y: number, z: number, width: number, height: number, depth: number, tint: string | Color) {
        return put(batch, visual.parts, cos * x + sin * z, y, -sin * x + cos * z, width, height, depth, tint, approach.yaw)
      }
      postPart(SOLID, shoulder, 0.36, stopOffset, 0.64, 0.24, 0.64, '#a4aa94')
      postPart(SOLID, shoulder, 3.5, stopOffset, 0.2, 6.4, 0.2, '#53675e')
      postPart(SOLID, shoulder, 1.16, stopOffset, 0.215, 0.38, 0.215, '#ddc78d')
      postPart(SOLID, (shoulder + laneOffset) / 2, 6.5, stopOffset, shoulder - laneOffset + 0.24, 0.2, 0.2, '#53675e')
      postPart(SOLID, laneOffset, 5.37, stopOffset - 0.24, 1.04, 2.26, 0.12, '#aaa990')
      postPart(SOLID, laneOffset, 5.36, stopOffset, 0.86, 2, 0.42, '#202c29')
      const bulbs = approach.axis === 'x' ? visual.bulbsX : visual.bulbsZ
      for (let bulb = 0; bulb < PHASES.length; bulb += 1) {
        const y = 5.98 - bulb * 0.62
        postPart(SOLID, laneOffset, y + 0.27, stopOffset + 0.23, 0.76, 0.07, 0.46, '#202c29')
        bulbs.push(postPart(BULB, laneOffset, y, stopOffset + 0.235, 0.235, 0.235, 0.145, inactiveBulbs[bulb]))
      }
    }
  }

  for (let index = 0; index < vehicles.length; index += 1) {
    const vehicle = vehicles[index]
    const w = vehicle.width
    const l = vehicle.length
    const bus = vehicle.kind === 'bus'
    const visual: VehicleVisual = { parts: [], paint: [], brakes: [], width: w, length: l, color: vehicle.color, braking: null }
    vehicleVisuals.push(visual)
    function piece(batch: number, x: number, y: number, z: number, width: number, height: number, depth: number, tint: string | Color) {
      return put(batch, visual.parts, x, y, z, width, height, depth, tint)
    }
    function painted(x: number, y: number, z: number, width: number, height: number, depth: number) {
      visual.paint.push(piece(SOLID, x, y, z, width, height, depth, vehicle.color))
    }

    if (bus) {
      piece(SOLID, 0, 0.57, 0, w * 0.8, 0.22, l * 0.87, '#30423e')
      painted(0, 1.58, 0, w * 0.94, 2.04, l * 0.96)
      piece(SOLID, 0, 2.68, 0, w * 0.97, 0.2, l * 0.98, '#f0e4cb')
      piece(SOLID, 0, 2.9, -l * 0.09, w * 0.58, 0.24, l * 0.25, '#d4d8c7')
      piece(SOLID, 0, 3.027, -l * 0.09, w * 0.4, 0.018, l * 0.17, '#748d86')
      piece(GLASS, 0, 2.02, l * 0.48 + 0.015, w * 0.83, 0.72, 0.025, '#427782')
      piece(GLASS, 0, 2.01, -l * 0.48 - 0.015, w * 0.74, 0.73, 0.025, '#365e68')
      piece(SOLID, 0, 2.48, l * 0.48 + 0.02, w * 0.69, 0.16, 0.035, '#283e3c')
      piece(LAMP, 0, 2.48, l * 0.48 + 0.041, w * 0.38, 0.055, 0.012, '#e9d59a')
      for (const side of [-1, 1]) {
        const columns = side < 0 ? 4 : 5
        for (let column = 0; column < columns; column += 1) {
          piece(GLASS, side * (w * 0.47 + 0.012), 2.03, l * (-0.34 + column * 0.18), 0.02, 0.8, l * 0.148, column % 2 ? '#497d85' : '#3b6b76')
        }
        piece(SOLID, side * (w * 0.47 + 0.012), 1.45, -l * 0.02, 0.022, 0.12, l * 0.87, '#eadcb6')
      }
      piece(SOLID, -w * 0.47 - 0.013, 1.5, l * 0.373, 0.025, 1.75, l * 0.17, '#304641')
      for (const z of [0.333, 0.413]) piece(GLASS, -w * 0.47 - 0.031, 1.68, l * z, 0.015, 1.22, l * 0.066, '#50818a')
      piece(SOLID, -w * 0.47 - 0.03, 0.64, l * 0.373, 0.028, 0.065, l * 0.16, '#e8d8ac')
    } else {
      piece(SOLID, 0, 0.4, 0, w * 0.8, 0.18, l * 0.84, '#30423e')
      painted(0, 0.73, 0, w * 0.95, 0.56, l * 0.94)
      painted(0, 1.02, l * 0.33, w * 0.91, 0.14, l * 0.28)
      painted(0, 1, -l * 0.38, w * 0.91, 0.13, l * 0.17)
      painted(0, 1.25, -l * 0.06, w * 0.82, 0.5, l * 0.51)
      piece(SOLID, 0, 1.57, -l * 0.06, w * 0.86, 0.14, l * 0.55, '#f2e5ca')
      piece(GLASS, 0, 1.27, l * 0.195 + 0.016, w * 0.74, 0.37, 0.025, '#427782')
      piece(GLASS, 0, 1.27, -l * 0.315 - 0.016, w * 0.71, 0.37, 0.025, '#365e68')
      for (const side of [-1, 1]) {
        for (const z of [0.069, -0.189]) {
          piece(GLASS, side * (w * 0.41 + 0.014), 1.27, l * z, 0.025, 0.37, l * 0.208, '#477985')
          piece(SOLID, side * (w * 0.475 + 0.008), 0.97, l * (z - 0.045), 0.02, 0.04, 0.15, '#e5dbc1')
        }
      }
      visual.brakes.push(piece(LAMP, 0, 1.46, -l * 0.315 - 0.032, w * 0.28, 0.055, 0.022, brakeOff))
    }

    const radius = bus ? 0.48 : 0.36
    const tireWidth = bus ? 0.28 : 0.24
    const lightY = bus ? 0.98 : 0.82
    const bodyEnd = l * (bus ? 0.48 : 0.47)
    for (const side of [-1, 1]) {
      for (const axle of [-1, 1]) {
        const z = axle * l * (bus ? 0.31 : 0.3)
        piece(WHEEL, side * (w / 2 - tireWidth / 2), radius, z, tireWidth, radius, radius, '#273834')
        piece(WHEEL, side * (w / 2 - 0.024), radius, z, 0.032, radius * 0.54, radius * 0.54, '#c7ccba')
      }
      piece(LAMP, side * w * 0.31, lightY, bodyEnd + 0.018, w * 0.2, bus ? 0.2 : 0.16, 0.045, '#fff0bf')
      piece(LAMP, side * w * 0.419, lightY, bodyEnd + 0.018, w * 0.055, 0.12, 0.045, '#e6ad53')
      visual.brakes.push(piece(LAMP, side * w * 0.32, lightY, -bodyEnd - 0.018, w * 0.18, bus ? 0.28 : 0.17, 0.045, brakeOff))
      piece(SOLID, 0, bus ? 0.7 : 0.55, side * (l / 2 - 0.09), w * 0.9, 0.12, 0.18, '#d8d7bd')
    }
    piece(SOLID, 0, lightY, bodyEnd + 0.012, w * 0.29, 0.12, 0.03, '#344a45')
    piece(SOLID, 0, bus ? 0.81 : 0.65, -bodyEnd - 0.008, 0.4, 0.12, 0.025, '#eddbac')
  }

  const meshes = batches.map((batch) => {
    const mesh = new InstancedMesh(batch.geometry, batch.material, batch.colors.length)
    mesh.name = batch.name
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    for (let index = 0; index < batch.colors.length; index += 1) mesh.setColorAt(index, batch.colors[index])
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(DynamicDrawUsage)
      mesh.instanceColor.needsUpdate = true
    }
    mesh.castShadow = batch.shadow
    mesh.receiveShadow = batch.material !== unlit
    // Traffic moves beyond its initial instance bounds; keep these five small batches uncullable.
    mesh.frustumCulled = false
    mesh.visible = mesh.count > 0
    root.add(mesh)
    return mesh
  })
  const matrixDirty = new Uint8Array(meshes.length)
  const colorDirty = new Uint8Array(meshes.length)
  const rings = Array.from({ length: 2 }, (_, index) => {
    const material = new MeshBasicMaterial({ color: '#f3cb61', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
    const mesh = new Mesh(ringGeometry, material)
    mesh.name = `traffic-horn-ring-${index + 1}`
    mesh.visible = false
    mesh.renderOrder = 1
    root.add(mesh)
    return mesh
  })
  let hornAge = HORN_DURATION
  let disposed = false

  function place(parts: Part[], x: number, z: number, heading: number, scaleX = 1, scaleZ = 1): void {
    transform.position.set(x, 0, z)
    transform.rotation.set(0, heading, 0)
    transform.scale.set(scaleX, 1, scaleZ)
    transform.updateMatrix()
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      combinedMatrix.multiplyMatrices(transform.matrix, part.matrix)
      meshes[part.batch].setMatrixAt(part.index, combinedMatrix)
      matrixDirty[part.batch] = 1
    }
  }

  function lightSignal(indices: number[], phase: TrafficLightPhase): void {
    for (let index = 0; index < indices.length; index += 1) {
      const bulb = index % PHASES.length
      meshes[BULB].setColorAt(indices[index], phase === PHASES[bulb] ? activeBulbs[bulb] : inactiveBulbs[bulb])
    }
    colorDirty[BULB] = 1
  }

  function updateHorn(): void {
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index]
      const age = hornAge - index * RING_DELAY
      ring.visible = age >= 0 && age < RING_LIFETIME
      if (!ring.visible) {
        ring.material.opacity = 0
        continue
      }
      const progress = age / RING_LIFETIME
      ring.scale.setScalar(0.45 + progress * 2.2)
      ring.material.opacity = 0.32 * (1 - progress) * (1 - progress)
    }
  }

  function update(deltaSeconds: number): void {
    if (disposed) return
    for (let index = 0; index < signalVisuals.length; index += 1) {
      const signal = signals[index]
      const visual = signalVisuals[index]
      if (signal.x !== visual.x || signal.z !== visual.z) {
        place(visual.parts, signal.x, signal.z, 0)
        visual.x = signal.x
        visual.z = signal.z
      }
      if (signal.phaseX !== visual.phaseX) {
        lightSignal(visual.bulbsX, signal.phaseX)
        visual.phaseX = signal.phaseX
      }
      if (signal.phaseZ !== visual.phaseZ) {
        lightSignal(visual.bulbsZ, signal.phaseZ)
        visual.phaseZ = signal.phaseZ
      }
    }
    for (let index = 0; index < vehicleVisuals.length; index += 1) {
      const vehicle = vehicles[index]
      const visual = vehicleVisuals[index]
      place(visual.parts, vehicle.x, vehicle.z, vehicle.heading, vehicle.width / visual.width, vehicle.length / visual.length)
      if (vehicle.color !== visual.color) {
        color.set(vehicle.color)
        for (let part = 0; part < visual.paint.length; part += 1) meshes[SOLID].setColorAt(visual.paint[part], color)
        visual.color = vehicle.color
        colorDirty[SOLID] = 1
      }
      if (vehicle.braking !== visual.braking) {
        for (let lamp = 0; lamp < visual.brakes.length; lamp += 1) meshes[LAMP].setColorAt(visual.brakes[lamp], vehicle.braking ? brakeOn : brakeOff)
        visual.braking = vehicle.braking
        colorDirty[LAMP] = 1
      }
    }
    for (let index = 0; index < meshes.length; index += 1) {
      const mesh = meshes[index]
      if (matrixDirty[index]) mesh.instanceMatrix.needsUpdate = true
      if (colorDirty[index] && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      matrixDirty[index] = 0
      colorDirty[index] = 0
    }
    if (hornAge < HORN_DURATION) {
      hornAge = Math.min(HORN_DURATION, hornAge + deltaSeconds)
      updateHorn()
    }
  }

  function honk(position: Point2, heading: number): void {
    if (disposed) return
    const x = position.x + Math.sin(heading) * 1.45
    const z = position.z + Math.cos(heading) * 1.45
    const onSidewalk = layout.sidewalks.some(({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ)
    const inBlock = layout.blocks.some(({ bounds }) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ)
    const y = (onSidewalk ? 0.24 : inBlock ? 0.16 : 0) + 0.055
    for (let index = 0; index < rings.length; index += 1) rings[index].position.set(x, y, z)
    hornAge = 0
    updateHorn()
  }

  function clearHorn(): void {
    if (disposed) return
    hornAge = HORN_DURATION
    for (let index = 0; index < rings.length; index += 1) {
      rings[index].visible = false
      rings[index].material.opacity = 0
    }
  }

  function dispose(): void {
    if (disposed) return
    clearHorn()
    disposed = true
    root.clear()
    root.removeFromParent()
    for (const mesh of meshes) mesh.dispose()
    for (const geometry of [boxGeometry, wheelGeometry, bulbGeometry, ringGeometry]) geometry.dispose()
    for (const material of [matte, glass, unlit]) material.dispose()
    for (const ring of rings) ring.material.dispose()
  }

  update(0)
  return { root, update, honk, clearHorn, dispose }
}
