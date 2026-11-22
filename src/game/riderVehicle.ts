import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

type XYZ = [number, number, number]

export interface RiderVisualState {
  wheelAngle: number
  steeringAngle: number
  leanAngle: number
  braking: boolean
  standLeg?: number
}

export const RIDER_WHEEL_RADIUS = 0.34

export function buildRiderVehicle() {
  // 根节点位于两轮接地中点，局部 +Z 为车头、+Y 为上。
  const root = new Group()
  root.name = 'rider-vehicle'
  const lean = new Group()
  lean.name = 'vehicle-lean'
  root.add(lean)
  const steering = new Group()
  steering.name = 'front-steering'
  steering.position.z = 0.8
  lean.add(steering)

  const geometries = new Set<BufferGeometry>()
  function geometry<T extends BufferGeometry>(value: T) {
    geometries.add(value)
    return value
  }
  const cube = geometry(new BoxGeometry(1, 1, 1))
  const cylinder = geometry(new CylinderGeometry(1, 1, 1, 10))
  const sphere = geometry(new SphereGeometry(1, 12, 8))
  const plane = geometry(new PlaneGeometry(1, 1))
  const tireGeometry = geometry(new TorusGeometry(0.26, 0.08, 6, 20))
  const rimGeometry = geometry(new TorusGeometry(0.22, 0.025, 5, 16))
  const fenderGeometry = geometry(new TorusGeometry(0.4, 0.035, 5, 16, Math.PI))
  const helmetGeometry = geometry(new SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.58))
  const jacketGeometry = geometry(new CylinderGeometry(0.28, 0.22, 1, 8))
  const materials = new Set<Material>()
  function material(color: string, metalness = 0) {
    const value = new MeshStandardMaterial({ color, roughness: 0.72, metalness, flatShading: true })
    materials.add(value)
    return value
  }
  const yellow = material('#f8bd27')
  const navy = material('#234956')
  const teal = material('#307f84')
  const rubber = material('#28343b')
  const metal = material('#a8b8b6', 0.4)
  const skin = material('#e4ad85')
  const seat = material('#374952')
  const reflector = material('#e6edcc')
  const headlight = material('#fff2c1')
  headlight.emissive.set('#ffe7a2')
  headlight.emissiveIntensity = 0.7
  const taillight = material('#ac3435')
  taillight.emissive.set('#ff2622')
  taillight.emissiveIntensity = 0.18

  function piece(parent: Group, shape: BufferGeometry, surface: Material, position: XYZ, scale: XYZ, rotation: XYZ = [0, 0, 0]) {
    const mesh = new Mesh(shape, surface)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  function box(parent: Group, surface: Material, position: XYZ, scale: XYZ, rotation: XYZ = [0, 0, 0]) {
    return piece(parent, cube, surface, position, scale, rotation)
  }
  const up = new Vector3(0, 1, 0)
  const direction = new Vector3()
  function fitBar(mesh: Mesh, from: Vector3, to: Vector3, radius: number) {
    direction.subVectors(to, from)
    mesh.position.copy(from).add(to).multiplyScalar(0.5)
    mesh.scale.set(radius, direction.length(), radius)
    mesh.quaternion.setFromUnitVectors(up, direction.normalize())
  }
  function bar(parent: Group, surface: Material, from: XYZ, to: XYZ, radius = 0.03) {
    const mesh = piece(parent, cylinder, surface, [0, 0, 0], [1, 1, 1])
    fitBar(mesh, new Vector3(...from), new Vector3(...to), radius)
    return mesh
  }

  function wheel(parent: Group, z: number, name: string) {
    const group = new Group()
    group.name = name
    group.position.set(0, RIDER_WHEEL_RADIUS, z)
    parent.add(group)
    piece(group, tireGeometry, rubber, [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0])
    piece(group, rimGeometry, metal, [0, 0, 0], [1, 1, 1], [0, Math.PI / 2, 0])
    piece(group, cylinder, metal, [0, 0, 0], [0.08, 0.2, 0.08], [0, 0, Math.PI / 2])
    for (let spoke = 0; spoke < 6; spoke += 1) {
      box(group, metal, [0, 0, 0], [0.045, 0.45, 0.026], [spoke * Math.PI / 6, 0, 0])
    }
    box(group, yellow, [0.055, 0.14, 0], [0.035, 0.06, 0.035])
    return group
  }
  const rearWheel = wheel(lean, -0.8, 'rear-wheel')
  const frontWheel = wheel(steering, 0, 'front-wheel')
  piece(lean, fenderGeometry, teal, [0, 0.34, -0.8], [1, 1, 1], [0, Math.PI / 2, 0])
  piece(steering, fenderGeometry, teal, [0, 0.34, 0], [1, 1, 1], [0, Math.PI / 2, 0])

  box(lean, teal, [0, 0.27, 0.03], [0.55, 0.14, 1.14])
  box(lean, rubber, [0, 0.347, 0.12], [0.43, 0.025, 0.62])
  box(lean, teal, [0, 0.57, -0.41], [0.45, 0.45, 0.63])
  box(lean, reflector, [0, 0.56, -0.735], [0.34, 0.09, 0.015])
  box(lean, seat, [0, 0.94, -0.26], [0.55, 0.16, 0.72])
  box(lean, navy, [0, 0.82, -0.94], [0.72, 0.08, 0.75])
  for (const side of [-1, 1]) {
    bar(lean, metal, [side * 0.13, 0.34, -0.8], [side * 0.2, 0.8, -0.58], 0.04)
    bar(lean, navy, [side * 0.18, 0.35, -0.7], [side * 0.18, 0.4, 0.45], 0.04)
    bar(steering, metal, [side * 0.115, 0.34, 0], [side * 0.115, 1.17, -0.16], 0.038)
  }
  bar(steering, teal, [0, 0.48, -0.05], [0, 1.25, -0.16], 0.085)
  bar(steering, navy, [-0.43, 1.29, -0.16], [0.43, 1.29, -0.16], 0.037)
  for (const side of [-1, 1]) {
    bar(steering, rubber, [side * 0.28, 1.29, -0.16], [side * 0.45, 1.29, -0.16], 0.046)
    bar(steering, metal, [side * 0.3, 1.3, -0.13], [side * 0.49, 1.59, -0.05], 0.014)
    piece(steering, sphere, navy, [side * 0.49, 1.61, -0.05], [0.095, 0.06, 0.028])
    piece(steering, sphere, metal, [side * 0.49, 1.61, -0.075], [0.078, 0.045, 0.008])
  }
  box(steering, navy, [0, 1.28, -0.16], [0.18, 0.045, 0.13], [0.2, 0, 0])
  box(steering, reflector, [0, 1.31, -0.175], [0.12, 0.007, 0.07], [0.2, 0, 0])

  box(steering, navy, [0, 1.02, 0.22], [0.49, 0.045, 0.39])
  for (const y of [1.04, 1.28]) {
    box(steering, navy, [0, y, 0.415], [0.52, 0.035, 0.025])
    box(steering, navy, [0, y, 0.025], [0.52, 0.035, 0.025])
    for (const x of [-0.25, 0.25]) box(steering, navy, [x, y, 0.22], [0.025, 0.035, 0.39])
  }
  for (let slat = -2; slat <= 2; slat += 1) {
    box(steering, navy, [slat * 0.11, 1.16, 0.415], [0.018, 0.25, 0.018])
    for (const x of [-0.25, 0.25]) box(steering, navy, [x, 1.16, 0.22 + slat * 0.085], [0.018, 0.25, 0.018])
  }
  box(steering, rubber, [0, 0.92, 0.24], [0.31, 0.17, 0.17])
  box(steering, headlight, [0, 0.92, 0.331], [0.25, 0.115, 0.025])
  box(lean, rubber, [0, 0.83, -1.33], [0.38, 0.15, 0.06])
  const brakeLens = box(lean, taillight, [0, 0.83, -1.367], [0.3, 0.09, 0.025])
  brakeLens.name = 'brake-light'

  box(lean, yellow, [0, 1.29, -1.03], [0.8, 0.74, 0.7])
  box(lean, navy, [0, 1.68, -1.03], [0.83, 0.075, 0.74])
  box(lean, yellow, [0, 1.72, -1.03], [0.76, 0.035, 0.67])
  box(lean, reflector, [0, 1.04, -1.386], [0.74, 0.055, 0.012])
  for (const side of [-1, 1]) {
    box(lean, reflector, [side * 0.406, 1.04, -1.03], [0.012, 0.055, 0.65])
    for (const z of [-1.35, -0.71]) box(lean, navy, [side * 0.365, 1.29, z], [0.045, 0.73, 0.045])
  }
  box(lean, navy, [0, 1.5, -1.388], [0.18, 0.06, 0.018])

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')!
  context.fillStyle = '#f8bd27'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#234956'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = '900 116px "Microsoft YaHei", sans-serif'
  context.fillText('极速达', 256, 108)
  context.font = '700 26px "Segoe UI", sans-serif'
  context.fillText('RUSH HOUR', 256, 201)
  context.fillRect(72, 168, 368, 6)
  const texture = new CanvasTexture(canvas)
  texture.name = 'local-delivery-box-lettering'
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const lettering = new MeshBasicMaterial({ map: texture, toneMapped: false })
  materials.add(lettering)
  piece(lean, plane, lettering, [0, 1.3, -1.39], [0.67, 0.335, 1], [0, Math.PI, 0])
  for (const side of [-1, 1]) piece(lean, plane, lettering, [side * 0.407, 1.3, -1.03], [0.57, 0.285, 1], [0, side * Math.PI / 2, 0])

  box(lean, navy, [0, 1.1, -0.24], [0.4, 0.25, 0.39])
  piece(lean, jacketGeometry, yellow, [0, 1.47, -0.16], [1, 0.62, 0.79], [0.14, 0, 0])
  box(lean, navy, [0, 1.44, -0.338], [0.36, 0.4, 0.04], [0.14, 0, 0])
  for (const side of [-1, 1]) {
    box(lean, reflector, [side * 0.13, 1.5, -0.373], [0.048, 0.39, 0.016], [0.14, 0, 0])
  }
  // 右腿保持在脚踏板上（静态合批），左腿（+X）作为可活动支腿在停驻时伸出撑地平衡。
  bar(lean, navy, [-0.15, 1.09, -0.2], [-0.24, 0.74, 0.3], 0.11)
  bar(lean, navy, [-0.24, 0.74, 0.3], [-0.24, 0.43, 0.17], 0.085)
  box(lean, rubber, [-0.235, 0.39, 0.24], [0.18, 0.12, 0.35])
  box(lean, reflector, [-0.235, 0.348, 0.24], [0.19, 0.028, 0.36])

  const leftHip = new Vector3(0.15, 1.09, -0.2)
  const leftKneeRide = new Vector3(0.24, 0.74, 0.3)
  const leftKneeStand = new Vector3(0.45, 0.56, 0.06)
  const leftAnkleRide = new Vector3(0.24, 0.43, 0.17)
  const leftAnkleStand = new Vector3(0.54, 0.15, 0.01)
  const leftShoeRide = new Vector3(0.235, 0.39, 0.24)
  const leftShoeStand = new Vector3(0.55, 0.115, 0.08)
  const leftSoleRide = new Vector3(0.235, 0.348, 0.24)
  const leftSoleStand = new Vector3(0.55, 0.068, 0.08)
  const leftKneeWork = new Vector3()
  const leftAnkleWork = new Vector3()

  const supportThigh = bar(lean, navy, [0.15, 1.09, -0.2], [0.24, 0.74, 0.3], 0.11)
  supportThigh.name = 'left-support-thigh'
  const supportKnee = piece(lean, sphere, navy, [0.24, 0.74, 0.3], [0.105, 0.105, 0.105])
  supportKnee.name = 'left-support-knee'
  const supportShin = bar(lean, navy, [0.24, 0.74, 0.3], [0.24, 0.43, 0.17], 0.085)
  supportShin.name = 'left-support-shin'
  const supportShoe = box(lean, rubber, [0.235, 0.39, 0.24], [0.18, 0.12, 0.35])
  supportShoe.name = 'left-support-shoe'
  const supportSole = box(lean, reflector, [0.235, 0.348, 0.24], [0.19, 0.028, 0.36])
  supportSole.name = 'left-support-sole'
  box(lean, reflector, [0, 1.32, -0.344], [0.37, 0.058, 0.019], [0.14, 0, 0])
  piece(lean, cylinder, skin, [0, 1.82, -0.1], [0.095, 0.18, 0.095])
  piece(lean, sphere, skin, [0, 1.96, -0.05], [0.215, 0.24, 0.21])
  piece(lean, helmetGeometry, yellow, [0, 2.075, -0.065], [0.31, 0.27, 0.32])
  box(lean, navy, [0, 2.11, 0.21], [0.43, 0.055, 0.12])
  box(lean, rubber, [0, 2.026, 0.143], [0.33, 0.075, 0.07])
  box(lean, skin, [0, 1.963, 0.16], [0.065, 0.055, 0.065])
  for (const side of [-1, 1]) bar(lean, navy, [side * 0.2, 2.06, -0.01], [side * 0.1, 1.8, 0.045], 0.019)
  box(lean, reflector, [0, 2.115, -0.367], [0.18, 0.065, 0.014])

  const forearms: { mesh: Mesh; elbow: Vector3; hand: Vector3; side: number }[] = []
  for (const side of [-1, 1]) {
    const elbow: XYZ = [side * 0.31, 1.46, 0.2]
    bar(lean, yellow, [side * 0.235, 1.7, -0.12], elbow, 0.105)
    const mesh = bar(lean, yellow, elbow, [side * 0.37, 1.29, 0.64], 0.082)
    mesh.name = side < 0 ? 'left-forearm' : 'right-forearm'
    forearms.push({ mesh, elbow: new Vector3(...elbow), hand: new Vector3(), side })
    piece(steering, sphere, rubber, [side * 0.37, 1.29, -0.16], [0.082, 0.075, 0.09])
  }

  const articulatedMeshes = new Set<Mesh>([
    brakeLens,
    supportThigh,
    supportKnee,
    supportShin,
    supportShoe,
    supportSole,
    ...forearms.map((arm) => arm.mesh),
  ])
  for (const group of [lean, steering, frontWheel, rearWheel]) {
    const batches = new Map<Material, BufferGeometry[]>()
    for (const child of [...group.children]) {
      if (!(child instanceof Mesh) || articulatedMeshes.has(child)) continue
      child.updateMatrix()
      const parts = batches.get(child.material) ?? []
      parts.push(child.geometry.clone().applyMatrix4(child.matrix))
      batches.set(child.material, parts)
      group.remove(child)
    }
    for (const [surface, parts] of batches) {
      const merged = geometry(mergeGeometries(parts)!)
      parts.forEach((part) => part.dispose())
      const mesh = new Mesh(merged, surface)
      mesh.castShadow = surface !== lettering
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }

  return {
    root,
    update({ wheelAngle, steeringAngle, leanAngle, braking, standLeg = 0 }: RiderVisualState) {
      const visualSteer = Math.max(-0.56, Math.min(0.56, steeringAngle))
      frontWheel.rotation.x = wheelAngle
      rearWheel.rotation.x = wheelAngle
      steering.rotation.y = visualSteer
      lean.rotation.z = leanAngle
      taillight.color.set(braking ? '#ff5548' : '#ac3435')
      taillight.emissiveIntensity = braking ? 2.8 : 0.18
      for (const arm of forearms) {
        const x = arm.side * 0.37
        arm.hand.set(x * Math.cos(visualSteer) - 0.16 * Math.sin(visualSteer), 1.29, 0.8 - x * Math.sin(visualSteer) - 0.16 * Math.cos(visualSteer))
        fitBar(arm.mesh, arm.elbow, arm.hand, 0.082)
      }
      const clampedStand = Math.max(0, Math.min(1, standLeg))
      const t = clampedStand * clampedStand * (3 - 2 * clampedStand)
      leftKneeWork.lerpVectors(leftKneeRide, leftKneeStand, t)
      leftAnkleWork.lerpVectors(leftAnkleRide, leftAnkleStand, t)
      fitBar(supportThigh, leftHip, leftKneeWork, 0.11)
      supportKnee.position.copy(leftKneeWork)
      fitBar(supportShin, leftKneeWork, leftAnkleWork, 0.085)
      supportShoe.position.lerpVectors(leftShoeRide, leftShoeStand, t)
      supportShoe.rotation.set(0, 0.24 * t, 0.075 * t)
      supportSole.position.lerpVectors(leftSoleRide, leftSoleStand, t)
      supportSole.rotation.set(0, 0.24 * t, 0.075 * t)
    },
    dispose() {
      geometries.forEach((entry) => entry.dispose())
      materials.forEach((entry) => entry.dispose())
      texture.dispose()
      root.clear()
      root.removeFromParent()
    },
  }
}
