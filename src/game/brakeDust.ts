import { DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import type { Point2 } from './types'

const POOL_SIZE = 32

type Puff = {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  lifetime: number
  radius: number
  twist: number
}

export function buildBrakeDust() {
  const root = new Group()
  root.name = 'brake-dust'
  const geometry = new IcosahedronGeometry(1, 0)
  const material = new MeshBasicMaterial({
    color: '#dfd8c6',
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new InstancedMesh(geometry, material, POOL_SIZE)
  mesh.name = 'brake-dust-puffs'
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  root.add(mesh)
  const transform = new Object3D()
  const puffs: Puff[] = Array.from({ length: POOL_SIZE }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    age: 0, lifetime: 0, radius: 0, twist: 0,
  }))
  let cursor = 0
  let sequence = 0
  let emission = 0
  let previousX = 0
  let previousZ = 0
  let previousHeading = 0
  let hasPrevious = false
  let disposed = false

  function emit(x: number, z: number, heading: number, speed: number, age: number): void {
    const puff = puffs[cursor]
    const variation = (sequence * 0.61803398875) % 1
    const side = sequence % 2 === 0 ? -1 : 1
    const forwardX = Math.sin(heading)
    const forwardZ = Math.cos(heading)
    const sideways = side * (0.04 + variation * 0.08)
    const backwards = (0.28 + Math.min(Math.abs(speed), 12) * 0.015) * Math.sign(speed)
    const spread = side * (0.18 + variation * 0.2)
    puff.vx = -forwardX * backwards + forwardZ * spread
    puff.vy = 0.28 + variation * 0.16
    puff.vz = -forwardZ * backwards - forwardX * spread
    puff.x = x - forwardX * 0.8 + forwardZ * sideways + puff.vx * age
    puff.y = 0.12 + puff.vy * age
    puff.z = z - forwardZ * 0.8 - forwardX * sideways + puff.vz * age
    puff.age = age
    puff.lifetime = 0.46 + variation * 0.1
    puff.radius = 0.1 + variation * 0.06
    puff.twist = sequence * 2.4
    cursor = (cursor + 1) % POOL_SIZE
    sequence = (sequence + 1) % 4096
  }

  function clear(): void {
    if (disposed) return
    cursor = 0
    sequence = 0
    emission = 0
    hasPrevious = false
    transform.position.set(0, 0, 0)
    transform.rotation.set(0, 0, 0)
    transform.scale.setScalar(0)
    transform.updateMatrix()
    for (let index = 0; index < POOL_SIZE; index += 1) {
      puffs[index].age = 0
      puffs[index].lifetime = 0
      mesh.setMatrixAt(index, transform.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.visible = false
  }

  clear()

  return {
    root,
    update(deltaSeconds: number, position: Point2, heading: number, speed: number, braking: boolean): void {
      if (disposed) return
      const dt = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0
      for (const puff of puffs) {
        if (puff.age >= puff.lifetime) continue
        puff.age += dt
        puff.x += puff.vx * dt
        puff.y += puff.vy * dt
        puff.z += puff.vz * dt
      }
      if (braking && Math.abs(speed) > 2) {
        const rate = 12 + Math.min(Math.abs(speed), 12) * 0.6
        emission += Math.min(dt, 0.1) * rate
        const turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading))
        while (emission >= 1) {
          emission -= 1
          const age = emission / rate
          const blend = hasPrevious && dt > 0 && dt <= 0.1 ? Math.max(0, 1 - age / dt) : 1
          emit(
            previousX + (position.x - previousX) * blend,
            previousZ + (position.z - previousZ) * blend,
            hasPrevious ? previousHeading + turn * blend : heading,
            speed,
            age,
          )
        }
      } else {
        emission = 0
      }
      previousX = position.x
      previousZ = position.z
      previousHeading = heading
      hasPrevious = true
      let active = 0
      for (let index = 0; index < POOL_SIZE; index += 1) {
        const puff = puffs[index]
        if (puff.age < puff.lifetime) {
          const scale = puff.radius * Math.sin(Math.PI * puff.age / puff.lifetime)
          transform.position.set(puff.x, puff.y, puff.z)
          transform.rotation.set(puff.age * 1.2, puff.twist, 0)
          transform.scale.set(scale, scale * 0.7, scale)
          active += 1
        } else {
          transform.scale.setScalar(0)
        }
        transform.updateMatrix()
        mesh.setMatrixAt(index, transform.matrix)
      }
      mesh.visible = active > 0
      mesh.instanceMatrix.needsUpdate = true
    },
    clear,
    dispose(): void {
      if (disposed) return
      clear()
      disposed = true
      mesh.dispose()
      geometry.dispose()
      material.dispose()
      root.clear()
      root.removeFromParent()
    },
  }
}
