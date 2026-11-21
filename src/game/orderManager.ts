import type { CityLandmark, CityLayout, DeliveryOrder, OrderOffer, OrderSnapshot, Point2 } from './types'

export const MAX_ACTIVE_ORDERS = 3
const OFFER_LIFETIME = 40
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)

function entryFraction(from: Point2, to: Point2, point: Point2, radius: number): number | null {
  const ox = from.x - point.x
  const oz = from.z - point.z
  const c = ox * ox + oz * oz - radius * radius
  if (c <= 0) return 0
  const dx = to.x - from.x
  const dz = to.z - from.z
  const a = dx * dx + dz * dz
  if (a === 0) return null
  const b = ox * dx + oz * dz
  const discriminant = b * b - a * c
  if (discriminant < 0) return null
  const fraction = (-b - Math.sqrt(discriminant)) / a
  return fraction >= 0 && fraction <= 1 ? fraction : null
}

export class OrderManager {
  revision = 0
  private readonly merchants: readonly CityLandmark[]
  private readonly destinations: readonly CityLandmark[]
  private readonly landmarks: Map<string, CityLandmark>
  private readonly spawn: Point2
  private elapsed = 0
  private nextOfferAt = 0
  private sequence = 0
  private seed = 22
  private offers: OrderOffer[] = []
  private active: DeliveryOrder[] = []
  private completed: DeliveryOrder[] = []
  private priorityId: string | null = null
  private incomeCents = 0
  private notice = '开工了，选择一单开始配送。'

  constructor(layout: CityLayout) {
    this.merchants = layout.landmarks.filter((landmark) => landmark.kind === 'merchant')
    this.destinations = layout.landmarks.filter((landmark) => landmark.kind === 'delivery')
    this.landmarks = new Map(layout.landmarks.map((landmark) => [landmark.id, landmark]))
    this.spawn = layout.spawn.position
    this.reset()
  }

  reset(): void {
    this.elapsed = 0
    this.sequence = 0
    this.seed = 22
    this.offers = []
    this.active = []
    this.completed = []
    this.priorityId = null
    this.incomeCents = 0
    this.notice = '开工了，选择一单开始配送。'
    const nearby = [...this.merchants].sort((a, b) => distance(a.access.position, this.spawn) - distance(b.access.position, this.spawn))
    for (const merchant of nearby.slice(0, 3)) {
      const destination = [...this.destinations].sort((a, b) => distance(a.access.position, merchant.access.position) - distance(b.access.position, merchant.access.position))[0]
      this.createOffer(merchant, destination, this.spawn, 0)
    }
    this.nextOfferAt = this.interval()
    this.revision += 1
  }

  get activeTargetIds(): string[] {
    return this.active.map((order) => order.status === 'pickup' ? order.merchantId : order.deliveryId)
  }

  get priorityTargetId(): string | null {
    const order = this.active.find((entry) => entry.id === this.priorityId)
    return order ? order.status === 'pickup' ? order.merchantId : order.deliveryId : null
  }

  prioritize(id: string): boolean {
    if (!this.active.some((order) => order.id === id)) return false
    this.priorityId = id
    return true
  }

  prioritizeTarget(id: string): void {
    const order = this.active.find((entry) => (entry.status === 'pickup' ? entry.merchantId : entry.deliveryId) === id)
    if (order) this.priorityId = order.id
  }

  accept(id: string, rider: Point2): boolean {
    const offer = this.offers.find((entry) => entry.id === id && entry.expiresAt > this.elapsed)
    if (!offer || this.active.length >= MAX_ACTIVE_ORDERS) return false
    const estimate = this.estimate(offer.merchantId, offer.deliveryId, rider)
    this.active.push({
      ...offer, ...estimate, status: 'pickup', acceptedAt: this.elapsed,
      acceptedPosition: { x: rider.x, z: rider.z }, deadline: this.elapsed + estimate.idealSec,
      pickedUpAt: null, completedAt: null, actualSec: 0,
      ledger: { ridingSec: 0, trafficWaitSec: 0, merchantDelaySec: 0, lastMileSec: 0, detourSec: 0, idleSec: 0 },
      settlement: null,
    })
    this.offers = this.offers.filter((entry) => entry.id !== id)
    this.priorityId ??= id
    this.notice = `${id} 已接单，前往${this.landmarks.get(offer.merchantId)!.name}取餐。`
    this.revision += 1
    return true
  }

  update(deltaSeconds: number, from: Point2, rider: Point2, waitingAtRed: boolean): void {
    const startedAt = this.elapsed
    this.elapsed += deltaSeconds
    const category = distance(from, rider) > 0.0000001 ? 'ridingSec' : waitingAtRed ? 'trafficWaitSec' : 'idleSec'
    for (const order of this.active) {
      let pickupFraction = 0
      if (order.status === 'pickup') {
        const merchant = this.landmarks.get(order.merchantId)!.access
        const fraction = entryFraction(from, rider, merchant.position, merchant.radius)
        if (fraction !== null) {
          pickupFraction = fraction
          order.status = 'delivery'
          order.pickedUpAt = startedAt + deltaSeconds * fraction
          this.notice = `${order.id} 已取餐，送往${this.landmarks.get(order.deliveryId)!.name}。`
          this.revision += 1
        }
      }
      const delivery = this.landmarks.get(order.deliveryId)!.access
      const afterPickup = {
        x: from.x + (rider.x - from.x) * pickupFraction,
        z: from.z + (rider.z - from.z) * pickupFraction,
      }
      const arrival = order.status === 'delivery' ? entryFraction(afterPickup, rider, delivery.position, delivery.radius) : null
      const fraction = arrival === null ? null : pickupFraction + (1 - pickupFraction) * arrival
      const spent = deltaSeconds * (fraction ?? 1)
      order.ledger[category] += spent
      order.actualSec += spent
      if (fraction === null) continue
      const at = startedAt + deltaSeconds * fraction
      order.status = 'completed'
      order.completedAt = at
      const lateSec = Math.max(0, at - order.deadline)
      const onTime = lateSec <= 0.0000001
      const bonusCents = onTime ? 150 : 0
      const penaltyCents = onTime ? 0 : Math.min(order.baseFeeCents, Math.ceil(lateSec - 0.0000001) * 5)
      order.settlement = {
        onTime, lateSec: onTime ? 0 : lateSec, baseFeeCents: order.baseFeeCents,
        bonusCents, penaltyCents, totalCents: order.baseFeeCents + bonusCents - penaltyCents,
      }
      this.incomeCents += order.settlement.totalCents
      this.completed.unshift(order)
      this.notice = `${order.id} 已送达，${onTime ? '准时奖已入账' : '超时扣款已明细记账'}。`
      this.revision += 1
    }
    this.active = this.active.filter((order) => order.status !== 'completed')
    if (!this.active.some((order) => order.id === this.priorityId)) {
      this.priorityId = [...this.active].sort((a, b) => a.deadline - b.deadline)[0]?.id ?? null
    }
    this.offers = this.offers.filter((offer) => offer.expiresAt > this.elapsed)
    while (this.elapsed >= this.nextOfferAt) {
      this.refreshOffer(rider, this.nextOfferAt)
      this.nextOfferAt += this.interval()
    }
    this.offers = this.offers.filter((offer) => offer.expiresAt > this.elapsed)
  }

  getSnapshot(rider: Point2, paused: boolean): OrderSnapshot {
    const copy = (order: DeliveryOrder): DeliveryOrder => ({
      ...order, acceptedPosition: { ...order.acceptedPosition }, ledger: { ...order.ledger },
      settlement: order.settlement ? { ...order.settlement } : null,
    })
    return {
      elapsedSec: this.elapsed, nextOfferInSec: Math.max(0, this.nextOfferAt - this.elapsed),
      offers: this.offers.map((offer) => ({ ...offer, ...this.estimate(offer.merchantId, offer.deliveryId, rider) })),
      active: this.active.map(copy), completed: this.completed.map(copy),
      priorityId: this.priorityId, incomeCents: this.incomeCents, paused, notice: this.notice,
    }
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }

  private interval(): number {
    return 12 + this.random() * 8
  }

  private estimate(merchantId: string, deliveryId: string, rider: Point2) {
    const merchant = this.landmarks.get(merchantId)!.access.position
    const delivery = this.landmarks.get(deliveryId)!.access.position
    const idealDistance = distance(rider, merchant) + distance(merchant, delivery)
    return { idealDistance, idealSec: Math.max(25, Math.ceil(idealDistance / 8 + 12)) }
  }

  private createOffer(merchant: CityLandmark, destination: CityLandmark, rider: Point2, at: number): void {
    this.offers.push({
      id: `R${String(++this.sequence).padStart(3, '0')}`,
      merchantId: merchant.id, deliveryId: destination.id,
      offeredAt: at, expiresAt: at + OFFER_LIFETIME,
      ...this.estimate(merchant.id, destination.id, rider),
      baseFeeCents: 500 + Math.round(distance(merchant.access.position, destination.access.position) * 1.2),
    })
  }

  private refreshOffer(rider: Point2, at: number): void {
    if (this.offers.length >= 3) this.offers.shift()
    const candidates = this.merchants.flatMap((merchant) => this.destinations.map((destination) => ({ merchant, destination })))
      .filter(({ merchant, destination }) => ![...this.offers, ...this.active].some((order) => order.merchantId === merchant.id && order.deliveryId === destination.id))
    const pair = candidates[Math.floor(this.random() * candidates.length)]
    this.createOffer(pair.merchant, pair.destination, rider, at)
  }
}
