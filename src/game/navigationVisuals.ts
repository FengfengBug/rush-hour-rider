import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Shape,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { NAVIGATION_COLORS } from './navigationSystem'
import type { NavigationKind, NavigationSnapshot, NavigationTarget, RiderSnapshot } from './types'

const KINDS = ['pickup', 'delivery', 'battery'] as const
const KIND_LABELS: Record<NavigationKind, string> = { pickup: '取餐点', delivery: '送达点', battery: '换电站' }
const GROUND_Y = 0.24

export function buildNavigationVisuals(targets: readonly NavigationTarget[]): {
  root: Group
  update(deltaSeconds: number, rider: Readonly<RiderSnapshot>, navigation: NavigationSnapshot, showArrow: boolean): void
  dispose(): void
} {
  const root = new Group()
  root.name = 'navigation-visuals'
  const transform = new Object3D()
  const columnGeometry = new CylinderGeometry(1, 1, 1, 6, 1, true)
  const columnOpacity = new InstancedBufferAttribute(new Float32Array(targets.length), 1).setUsage(DynamicDrawUsage)
  columnGeometry.setAttribute('navigationOpacity', columnOpacity)
  const ringGeometry = new RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2)
  const columnMaterial = new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true, toneMapped: false })
  columnMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float navigationOpacity;\nvarying float vNavigationOpacity;\nvarying float vNavigationHeight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNavigationOpacity = navigationOpacity;\nvNavigationHeight = position.y + 0.5;')
    // Leave the rider-height foot of each open column clear, without opaque caps.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vNavigationOpacity;\nvarying float vNavigationHeight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNavigationOpacity * smoothstep(0.06, 0.19, vNavigationHeight) * (1.0 - smoothstep(0.90, 1.0, vNavigationHeight));')
  }
  const ringMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
  const markerMaterial = new MeshStandardMaterial({ roughness: 0.72, metalness: 0, flatShading: true })

  function mergeMarker(parts: BufferGeometry[]): BufferGeometry {
    const geometry = mergeGeometries(parts)!
    for (const part of parts) part.dispose()
    return geometry
  }

  const markerGeometries = {
    pickup: mergeMarker([
      new BoxGeometry(1.15, 0.9, 0.76).translate(0, -0.15, 0),
      new TorusGeometry(0.28, 0.075, 4, 8, Math.PI).translate(0, 0.3, 0),
    ]),
    delivery: mergeMarker([
      new BoxGeometry(1, 0.8, 1).translate(0, -0.15, 0),
      new CylinderGeometry(0, 0.9, 0.55, 4).rotateY(Math.PI / 4).translate(0, 0.525, 0),
    ]),
    battery: mergeMarker([
      new BoxGeometry(0.86, 1.25, 0.65).translate(0, -0.05, 0),
      new BoxGeometry(0.4, 0.2, 0.38).translate(0, 0.675, 0),
    ]),
  }
  const columns = new InstancedMesh(columnGeometry, columnMaterial, targets.length)
  columns.name = 'navigation-columns'
  columns.renderOrder = 1
  const rings = new InstancedMesh(ringGeometry, ringMaterial, targets.length)
  rings.name = 'navigation-access-rings'
  rings.renderOrder = 2
  const markerMeshes = {} as Record<NavigationKind, InstancedMesh>
  for (const kind of KINDS) {
    const mesh = new InstancedMesh(markerGeometries[kind], markerMaterial, targets.filter((target) => target.kind === kind).length * 2)
    mesh.name = `navigation-${kind}-markers`
    markerMeshes[kind] = mesh
  }
  const meshes = [columns, rings, ...KINDS.map((kind) => markerMeshes[kind])]
  for (const mesh of meshes) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.visible = mesh.count > 0
    root.add(mesh)
  }
  const markerCounts: Record<NavigationKind, number> = { pickup: 0, delivery: 0, battery: 0 }
  const highlight = new Color('#fff5df')
  const visuals = targets.map((target, index) => {
    const color = new Color(NAVIGATION_COLORS[target.kind])
    const markerIndex = markerCounts[target.kind]
    markerCounts[target.kind] += 2
    transform.position.set(target.position.x, GROUND_Y + 0.035, target.position.z)
    transform.rotation.set(0, 0, 0)
    transform.scale.set(target.radius, 1, target.radius)
    transform.updateMatrix()
    rings.setMatrixAt(index, transform.matrix)
    return { target, color, selectedColor: color.clone().lerp(highlight, 0.32), markerIndex, markerMesh: markerMeshes[target.kind] }
  })
  rings.instanceMatrix.needsUpdate = true

  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const context = canvas.getContext('2d')
  const labelTexture = new CanvasTexture(canvas)
  labelTexture.name = 'navigation-selected-label'
  labelTexture.colorSpace = SRGBColorSpace
  labelTexture.generateMipmaps = false
  labelTexture.minFilter = LinearFilter
  labelTexture.magFilter = LinearFilter
  const labelMaterial = new SpriteMaterial({ map: labelTexture, transparent: true, depthWrite: false, toneMapped: false })
  const label = new Sprite(labelMaterial)
  label.name = 'navigation-selected-label'
  label.scale.set(8, 2, 1)
  label.renderOrder = 3
  label.visible = false
  root.add(label)
  let labelName: string | null = null
  let labelKind: NavigationKind | null = null
  let labelArrived = false

  const arrowShape = new Shape()
  arrowShape.moveTo(0, 1.35)
  arrowShape.lineTo(-0.8, 0.15)
  arrowShape.lineTo(-0.28, 0.15)
  arrowShape.lineTo(-0.28, -1)
  arrowShape.lineTo(0.28, -1)
  arrowShape.lineTo(0.28, 0.15)
  arrowShape.lineTo(0.8, 0.15)
  arrowShape.closePath()
  const arrowGeometry = new ExtrudeGeometry(arrowShape, { depth: 0.18, bevelEnabled: false, steps: 1 }).rotateX(Math.PI / 2).translate(0, 0.09, 0)
  const arrowOutlineMaterial = new MeshBasicMaterial({ color: '#243c38', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, toneMapped: false })
  const arrowMaterial = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false })
  const arrow = new Group()
  arrow.name = 'navigation-direction-arrow'
  const arrowOutline = new Mesh(arrowGeometry, arrowOutlineMaterial)
  arrowOutline.scale.set(1.2, 1.35, 1.15)
  arrowOutline.position.y = -0.04
  arrowOutline.renderOrder = 20
  arrowOutline.frustumCulled = false
  const arrowFill = new Mesh(arrowGeometry, arrowMaterial)
  arrowFill.position.y = 0.06
  arrowFill.renderOrder = 21
  arrowFill.frustumCulled = false
  arrow.add(arrowOutline, arrowFill)
  arrow.scale.setScalar(0.75)
  arrow.visible = false
  root.add(arrow)
  let arrowTargetId: string | null = null
  let arrowHeading = 0
  let elapsed = 0
  let previousSelection = -2
  let disposed = false

  function updateLandmarks(selectedIndex: number, rider?: Readonly<RiderSnapshot>): void {
    const selectionChanged = selectedIndex !== previousSelection
    for (let index = 0; index < visuals.length; index += 1) {
      const visual = visuals[index]
      const { target, markerMesh, markerIndex } = visual
      const selected = index === selectedIndex
      const height = selected ? 50 : 44
      const phase = index * 0.79
      const bob = Math.sin(elapsed * 1.7 + phase) * 0.2
      const radius = selected ? 1.6 : 1.25
      transform.position.set(target.position.x, GROUND_Y + height / 2, target.position.z)
      transform.rotation.set(0, elapsed * 0.2 + phase, 0)
      transform.scale.set(radius, height, radius)
      transform.updateMatrix()
      columns.setMatrixAt(index, transform.matrix)
      const distance = rider ? Math.hypot(rider.x - target.position.x, rider.z - target.position.z) : 24
      const proximity = Math.min(1, Math.max(0, (distance - target.radius - 1) / 16))
      const fade = proximity * proximity * (3 - 2 * proximity)
      columnOpacity.setX(index, (selected ? 0.32 : 0.18) * (0.16 + 0.84 * fade))
      transform.rotation.y = elapsed * 0.32 + phase
      transform.position.y = 5.4 + bob
      transform.scale.setScalar(selected ? 1.2 : 1)
      transform.updateMatrix()
      markerMesh.setMatrixAt(markerIndex, transform.matrix)
      transform.position.y = GROUND_Y + height + 0.7 + bob
      transform.scale.setScalar(selected ? 2.5 : 2.1)
      transform.updateMatrix()
      markerMesh.setMatrixAt(markerIndex + 1, transform.matrix)
      if (selectionChanged) {
        const color = selected ? visual.selectedColor : visual.color
        columns.setColorAt(index, color)
        rings.setColorAt(index, color)
        markerMesh.setColorAt(markerIndex, color)
        markerMesh.setColorAt(markerIndex + 1, color)
      }
    }
    columnOpacity.needsUpdate = true
    columns.instanceMatrix.needsUpdate = true
    for (const kind of KINDS) markerMeshes[kind].instanceMatrix.needsUpdate = true
    if (selectionChanged) {
      for (const mesh of meshes) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    }
    previousSelection = selectedIndex
  }

  function updateLabel(target: NavigationTarget, arrived: boolean): void {
    if (!context || (labelName === target.name && labelKind === target.kind && labelArrived === arrived)) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = 'rgba(25, 43, 39, 0.92)'
    context.beginPath()
    context.roundRect(4, 4, 504, 120, 16)
    context.fill()
    context.fillStyle = NAVIGATION_COLORS[target.kind]
    context.fillRect(18, 22, 6, 84)
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '600 23px "Microsoft YaHei", sans-serif'
    context.fillText(`${arrived ? '已到达 · ' : ''}${KIND_LABELS[target.kind]}`, 266, 34)
    context.font = '700 40px "Microsoft YaHei", sans-serif'
    const fontSize = Math.min(40, 40 * 448 / Math.max(1, context.measureText(target.name).width))
    context.font = `700 ${fontSize}px "Microsoft YaHei", sans-serif`
    context.fillStyle = '#fff4dd'
    context.fillText(target.name, 266, 82)
    labelTexture.needsUpdate = true
    labelName = target.name
    labelKind = target.kind
    labelArrived = arrived
  }

  function update(deltaSeconds: number, rider: Readonly<RiderSnapshot>, navigation: NavigationSnapshot, showArrow: boolean): void {
    if (disposed) return
    const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
    elapsed += dt
    const selectedIndex = navigation.targetId === null ? -1 : targets.findIndex((target) => target.id === navigation.targetId)
    const target = selectedIndex < 0 ? null : targets[selectedIndex]
    updateLandmarks(selectedIndex, rider)
    label.visible = target !== null && context !== null
    if (target) {
      updateLabel(target, navigation.arrived)
      label.position.set(target.position.x, 7.8 + Math.sin(elapsed * 1.7 + selectedIndex * 0.79) * 0.1, target.position.z)
    }
    if (!showArrow || !target || navigation.arrived) {
      arrow.visible = false
      arrowTargetId = null
      return
    }
    let destination = target.position
    // route[0] is the previous 10 Hz rider sample, never an instruction to turn back.
    for (let index = 1; index < navigation.route.length; index += 1) {
      const waypoint = navigation.route[index]
      const dx = waypoint.x - rider.x
      const dz = waypoint.z - rider.z
      if (dx * dx + dz * dz > 9) {
        destination = waypoint
        break
      }
    }
    const dx = destination.x - rider.x
    const dz = destination.z - rider.z
    if (dx * dx + dz * dz < 0.000001) {
      arrow.visible = false
      arrowTargetId = null
      return
    }
    const desiredHeading = Math.atan2(dx, dz)
    if (!arrow.visible || arrowTargetId !== target.id) arrowHeading = desiredHeading
    else {
      const difference = Math.atan2(Math.sin(desiredHeading - arrowHeading), Math.cos(desiredHeading - arrowHeading))
      arrowHeading += difference * (1 - Math.exp(-12 * dt))
      arrowHeading = Math.atan2(Math.sin(arrowHeading), Math.cos(arrowHeading))
    }
    arrowMaterial.color.copy(visuals[selectedIndex].selectedColor)
    arrow.position.set(rider.x + Math.sin(rider.heading) * 7, 0.85, rider.z + Math.cos(rider.heading) * 7)
    arrow.rotation.y = arrowHeading
    arrow.visible = true
    arrowTargetId = target.id
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    arrow.visible = false
    label.visible = false
    root.clear()
    root.removeFromParent()
    for (const mesh of meshes) mesh.dispose()
    for (const geometry of [columnGeometry, ringGeometry, ...KINDS.map((kind) => markerGeometries[kind]), arrowGeometry]) geometry.dispose()
    for (const material of [columnMaterial, ringMaterial, markerMaterial, labelMaterial, arrowOutlineMaterial, arrowMaterial]) material.dispose()
    labelTexture.dispose()
  }

  updateLandmarks(-1)
  for (const mesh of meshes) if (mesh.instanceColor) mesh.instanceColor.setUsage(DynamicDrawUsage)
  return { root, update, dispose }
}
