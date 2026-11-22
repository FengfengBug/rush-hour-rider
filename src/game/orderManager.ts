import type { BuildingKind, CityLandmark, CityLayout, DeliveryOrder, OrderMessage, OrderOffer, OrderReportReason, OrderSnapshot, Point2 } from './types'
import type { EventResolution } from './eventSystem'

export const MAX_ACTIVE_ORDERS = 3
const OFFER_LIFETIME = 40
const distance = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.z - b.z)

export interface ArrivalCheck {
  readonly phase: 'pickup' | 'delivery'
  readonly order: DeliveryOrder
  readonly landmark: CityLandmark
  readonly buildingKind: BuildingKind
}

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
  private readonly buildingKinds: Map<string, BuildingKind>
  private readonly spawn: Point2
  private elapsed = 0
  private shiftId = 0
  private messages: OrderMessage[] = []
  private readonly reminded = new Set<string>()
  private nextOfferAt = 0
  private sequence = 0
  private seed = 22
  private offers: OrderOffer[] = []
  private active: DeliveryOrder[] = []
  private completed: DeliveryOrder[] = []
  private priorityId: string | null = null
  private incomeCents = 0
  private operatingCostCents = 0
  private raining = false
  private notice = '开工了，选择一单开始配送。'

  constructor(layout: CityLayout) {
    this.merchants = layout.landmarks.filter((landmark) => landmark.kind === 'merchant')
    this.destinations = layout.landmarks.filter((landmark) => landmark.kind === 'delivery')
    this.landmarks = new Map(layout.landmarks.map((landmark) => [landmark.id, landmark]))
    this.buildingKinds = new Map(layout.buildings.map((building) => [building.id, building.kind]))
    this.spawn = layout.spawn.position
    this.reset()
  }

  reset(): void {
    this.shiftId += 1
    this.messages = []
    this.reminded.clear()
    this.elapsed = 0
    this.sequence = 0
    this.seed = 22
    this.offers = []
    this.active = []
    this.completed = []
    this.priorityId = null
    this.incomeCents = 0
    this.operatingCostCents = 0
    this.raining = false
    this.notice = '开工了，选择一单开始配送。'
    const nearby = [...this.merchants].sort((a, b) => distance(a.access.position, this.spawn) - distance(b.access.position, this.spawn))
    const usedDestinations = new Set<string>()
    // 开局三单涵盖三大特色送达体验：CBD 入楼拍照送达（星辰科技大厦）、高端封闭小区门禁（御景华府）、老旧开放小区直达（幸福里小区）。
    const preferredDeliveries = ['starlight-tower', 'yujing-manor', 'xingfuli-estate']
    nearby.slice(0, 3).forEach((merchant, index) => {
      const preferredId = preferredDeliveries[index]
      const preferred = preferredId ? this.destinations.find((entry) => entry.id === preferredId && !usedDestinations.has(entry.id)) : undefined
      const destination = preferred ?? [...this.destinations]
        .filter((entry) => !usedDestinations.has(entry.id))
        .sort((a, b) => distance(a.access.position, merchant.access.position) - distance(b.access.position, merchant.access.position))[0]
        ?? this.destinations[0]
      usedDestinations.add(destination.id)
      this.createOffer(merchant, destination, this.spawn, 0)
    })
    this.nextOfferAt = this.interval()
    this.revision += 1
  }

  get activeOrders(): readonly DeliveryOrder[] {
    return this.active
  }

  get elapsedSeconds(): number {
    return this.elapsed
  }

  getLandmarkName(id: string): string {
    return this.landmarks.get(id)?.name ?? id
  }

  findAddonCandidate(rider: Point2): { merchant: CityLandmark; destination: CityLandmark } | null {
    if (this.active.length >= MAX_ACTIVE_ORDERS) return null
    const all = this.merchants.flatMap((merchant) => this.destinations.map((destination) => ({ merchant, destination })))
      .filter(({ merchant, destination }) => ![...this.offers, ...this.active].some((order) => order.merchantId === merchant.id && order.deliveryId === destination.id))
    const nearby = all.filter(({ merchant, destination }) => (
      distance(rider, merchant.access.position) <= 220
      && distance(merchant.access.position, destination.access.position) <= 260
    ))
    const pool = nearby.length > 0 ? nearby : all
    if (pool.length === 0) return null
    return pool[Math.floor(this.random() * pool.length)]
  }

  acceptAddonOrder(merchantId: string, deliveryId: string, baseFeeCents: number, rider: Point2): string | null {
    if (this.active.length >= MAX_ACTIVE_ORDERS) return null
    const id = `R${String(++this.sequence).padStart(3, '0')}`
    const estimate = this.estimate(merchantId, deliveryId, rider)
    this.active.push({
      id,
      merchantId,
      deliveryId,
      offeredAt: this.elapsed,
      expiresAt: this.elapsed + OFFER_LIFETIME,
      ...estimate,
      baseFeeCents,
      status: 'pickup',
      acceptedAt: this.elapsed,
      acceptedPosition: { x: rider.x, z: rider.z },
      deadline: this.elapsed + estimate.idealSec,
      pickedUpAt: null,
      completedAt: null,
      actualSec: 0,
      ledger: { ridingSec: 0, trafficWaitSec: 0, merchantDelaySec: 0, lastMileSec: 0, detourSec: 0, idleSec: 0 },
      tipCents: 0,
      eventPenaltyCents: 0,
      settlement: null,
      reports: [],
    })
    this.priorityId ??= id
    this.notice = `${id} 顺路加单已接！前往${this.getLandmarkName(merchantId)}取餐。`
    this.addMessage(id, 'system', `${this.notice}（基础费 ¥${(baseFeeCents / 100).toFixed(2)}）`, this.elapsed)
    this.revision += 1
    return id
  }

  recordOperatingExpense(cents: number, kind: OrderMessage['kind'], text: string, orderId = '系统'): void {
    if (cents > 0) {
      this.operatingCostCents += cents
      this.incomeCents = Math.max(0, this.incomeCents - cents)
    }
    this.notice = text
    this.addMessage(orderId, kind, text, this.elapsed)
  }

  addSystemMessage(orderId: string, kind: OrderMessage['kind'], text: string): void {
    this.addMessage(orderId, kind, text, this.elapsed)
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
      tipCents: 0, eventPenaltyCents: 0, settlement: null, reports: [],
    })
    this.offers = this.offers.filter((entry) => entry.id !== id)
    this.priorityId ??= id
    this.notice = `${id} 已接单，前往${this.landmarks.get(offer.merchantId)!.name}取餐。`
    this.addMessage(id, 'system', this.notice, this.elapsed)
    this.revision += 1
    return true
  }

  report(id: string, reason: OrderReportReason): boolean {
    const order = this.active.find((entry) => entry.id === id)
    if (!order || order.reports.some((entry) => entry.reason === reason)) return false
    const labels: Record<OrderReportReason, string> = { traffic: '道路拥堵', merchant: '商家问题', address: '地址问题' }
    order.reports.push({ reason, at: this.elapsed })
    this.notice = `${id} 已记录“${labels[reason]}”报备；计时与计费不变。`
    this.addMessage(id, 'rider', this.notice, this.elapsed)
    return true
  }

  isEnterableBuildingKind(kind: BuildingKind): boolean {
    return kind === 'office' || kind === 'tech' || kind === 'hospital'
  }

  getOrderForEnterableDelivery(landmarkId: string): { orderId: string; merchantName: string } | null {
    const order = this.active.find((entry) => entry.status === 'delivery' && entry.deliveryId === landmarkId)
    if (!order) return null
    return {
      orderId: order.id,
      merchantName: this.landmarks.get(order.merchantId)?.name ?? order.merchantId,
    }
  }

  updateInterior(deltaSeconds: number, rider: Point2): void {
    const startedAt = this.elapsed
    this.elapsed += deltaSeconds
    for (const order of this.active) {
      order.ledger.lastMileSec += deltaSeconds
      order.actualSec += deltaSeconds
      const reminderAt = Math.max(order.acceptedAt, order.deadline - 15)
      if (!this.reminded.has(order.id) && startedAt + deltaSeconds >= reminderAt) {
        this.reminded.add(order.id)
        this.addMessage(order.id, 'customer', '快到配送时限了，麻烦留意送达进度。', reminderAt)
      }
    }
    this.offers = this.offers.filter((offer) => offer.expiresAt > this.elapsed)
    while (this.elapsed >= this.nextOfferAt) {
      this.refreshOffer(rider, this.nextOfferAt)
      this.nextOfferAt += this.interval()
    }
    this.offers = this.offers.filter((offer) => offer.expiresAt > this.elapsed)
  }

  completeInteriorPhotoDelivery(orderId: string, landmarkName: string): boolean {
    const target = this.active.find((entry) => entry.id === orderId && entry.status === 'delivery')
    if (!target) return false
    this.addMessage(target.id, 'rider', `已在${landmarkName}一楼外卖存放处拍照留证并点击送达。`, this.elapsed)
    this.settleOrder(target, this.elapsed)
    this.active = this.active.filter((order) => order.status !== 'completed')
    if (!this.active.some((order) => order.id === this.priorityId)) {
      this.priorityId = [...this.active].sort((a, b) => a.deadline - b.deadline)[0]?.id ?? null
    }
    return true
  }

  update(
    deltaSeconds: number,
    from: Point2,
    rider: Point2,
    waitingAtRed: boolean,
    onArrivalIntercept?: (check: ArrivalCheck) => boolean,
  ): boolean {
    const startedAt = this.elapsed
    this.elapsed += deltaSeconds
    const category = distance(from, rider) > 0.0000001 ? 'ridingSec' : waitingAtRed ? 'trafficWaitSec' : 'idleSec'
    let intercepted = false
    for (const order of this.active) {
      let pickupFraction = 0
      if (!intercepted && order.status === 'pickup') {
        const merchantLandmark = this.landmarks.get(order.merchantId)!
        const merchant = merchantLandmark.access
        const fraction = entryFraction(from, rider, merchant.position, merchant.radius)
        if (fraction !== null) {
          const buildingKind = this.buildingKinds.get(merchantLandmark.buildingId) ?? 'shop'
          if (onArrivalIntercept?.({ phase: 'pickup', order, landmark: merchantLandmark, buildingKind })) {
            intercepted = true
            order.ledger[category] += deltaSeconds
            order.actualSec += deltaSeconds
            continue
          }
          pickupFraction = fraction
          this.completePickupOrder(order, startedAt + deltaSeconds * fraction)
        }
      }
      const deliveryLandmark = this.landmarks.get(order.deliveryId)!
      const delivery = deliveryLandmark.access
      const deliveryKind = this.buildingKinds.get(deliveryLandmark.buildingId) ?? 'apartment'
      const afterPickup = {
        x: from.x + (rider.x - from.x) * pickupFraction,
        z: from.z + (rider.z - from.z) * pickupFraction,
      }
      const arrival = !intercepted && order.status === 'delivery'
        ? entryFraction(afterPickup, rider, delivery.position, delivery.radius)
        : null
      if (arrival !== null && this.isEnterableBuildingKind(deliveryKind)) {
        // CBD / 医院等人流集中建筑需下车进入一楼大堂放餐并拍照点送达，不在路边直接自动签收。
        order.ledger[category] += deltaSeconds
        order.actualSec += deltaSeconds
        continue
      }
      if (arrival !== null) {
        if (onArrivalIntercept?.({ phase: 'delivery', order, landmark: deliveryLandmark, buildingKind: deliveryKind })) {
          intercepted = true
          order.ledger[category] += deltaSeconds
          order.actualSec += deltaSeconds
          continue
        }
      }
      const fraction = arrival === null ? null : pickupFraction + (1 - pickupFraction) * arrival
      const spent = deltaSeconds * (fraction ?? 1)
      order.ledger[category] += spent
      order.actualSec += spent
      const reminderAt = Math.max(order.acceptedAt, order.deadline - 15)
      if (!this.reminded.has(order.id) && startedAt + spent >= reminderAt) {
        this.reminded.add(order.id)
        this.addMessage(order.id, 'customer', '快到配送时限了，麻烦留意送达进度。', reminderAt)
      }
      if (fraction === null) continue
      this.settleOrder(order, startedAt + deltaSeconds * fraction)
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
    return intercepted
  }

  applyEventResolution(resolution: EventResolution): void {
    const target = this.active.find((entry) => entry.id === resolution.orderId)
    if (!target) return

    if (resolution.timeCostSec > 0 && resolution.ledgerKey) {
      for (const order of this.active) {
        if (resolution.action === 'transfer-order' && order.id === target.id) continue
        order.ledger[resolution.ledgerKey] += resolution.timeCostSec
        order.actualSec += resolution.timeCostSec
        order.deadline -= resolution.timeCostSec
        const reminderAt = Math.max(order.acceptedAt, order.deadline - 15)
        if (!this.reminded.has(order.id) && this.elapsed >= reminderAt) {
          this.reminded.add(order.id)
          this.addMessage(order.id, 'customer', '快到配送时限了，麻烦留意送达进度。', this.elapsed)
        }
      }
    }

    this.addMessage(target.id, resolution.messageKind, resolution.messageText, this.elapsed)

    if (resolution.action === 'transfer-order') {
      this.active = this.active.filter((order) => order.id !== target.id)
      if (!this.active.some((order) => order.id === this.priorityId)) {
        this.priorityId = [...this.active].sort((a, b) => a.deadline - b.deadline)[0]?.id ?? null
      }
      this.notice = `${target.id} 已报备转单，已释放持单槽位。`
      this.revision += 1
      return
    }

    if (resolution.action === 'complete-pickup') {
      this.completePickupOrder(target, this.elapsed)
      return
    }

    target.tipCents += resolution.tipCents
    target.eventPenaltyCents += resolution.eventPenaltyCents
    this.settleOrder(target, this.elapsed)
    this.active = this.active.filter((order) => order.status !== 'completed')
    if (!this.active.some((order) => order.id === this.priorityId)) {
      this.priorityId = [...this.active].sort((a, b) => a.deadline - b.deadline)[0]?.id ?? null
    }
  }

  private completePickupOrder(order: DeliveryOrder, at: number): void {
    order.status = 'delivery'
    order.pickedUpAt = at
    this.notice = `${order.id} 已取餐，送往${this.landmarks.get(order.deliveryId)!.name}。`
    this.addMessage(
      order.id,
      'merchant',
      `${this.landmarks.get(order.merchantId)!.name}：餐品已交接，请送往${this.landmarks.get(order.deliveryId)!.name}。`,
      at,
    )
    this.revision += 1
  }

  setRaining(raining: boolean): void {
    this.raining = raining
  }

  private settleOrder(order: DeliveryOrder, at: number): void {
    order.status = 'completed'
    order.completedAt = at
    const lateSec = Math.max(0, at - order.deadline)
    const onTime = lateSec <= 0.0000001
    const bonusCents = onTime ? 150 : 0
    const rainBonusCents = this.raining ? 200 : 0
    const penaltyCents = onTime ? 0 : Math.min(order.baseFeeCents, Math.ceil(lateSec - 0.0000001) * 5)
    const tipCents = order.tipCents
    const eventPenaltyCents = order.eventPenaltyCents
    const totalCents = Math.max(0, order.baseFeeCents + bonusCents + rainBonusCents + tipCents - penaltyCents - eventPenaltyCents)
    order.settlement = {
      onTime,
      lateSec: onTime ? 0 : lateSec,
      baseFeeCents: order.baseFeeCents,
      bonusCents,
      rainBonusCents,
      tipCents,
      penaltyCents,
      eventPenaltyCents,
      totalCents,
    }
    this.incomeCents += order.settlement.totalCents
    this.completed.unshift(order)
    const extras: string[] = []
    if (onTime) extras.push('含准时奖 ¥1.50')
    else extras.push(`超时扣款 ¥${(penaltyCents / 100).toFixed(2)}`)
    if (rainBonusCents > 0) extras.push(`雨天补贴 +¥${(rainBonusCents / 100).toFixed(2)}`)
    if (tipCents > 0) extras.push(`顾客小费 +¥${(tipCents / 100).toFixed(2)}`)
    if (eventPenaltyCents > 0) extras.push(`异常/差评扣款 −¥${(eventPenaltyCents / 100).toFixed(2)}`)
    this.notice = `${order.id} 已送达，实得 ¥${(totalCents / 100).toFixed(2)}。`
    this.addMessage(order.id, 'payment', `配送完成，实得 ¥${(totalCents / 100).toFixed(2)}；${extras.join('，')}。`, at)
    this.revision += 1
  }

  getSnapshot(rider: Point2, paused: boolean): OrderSnapshot {
    const copy = (order: DeliveryOrder): DeliveryOrder => ({
      ...order, acceptedPosition: { ...order.acceptedPosition }, ledger: { ...order.ledger },
      settlement: order.settlement ? { ...order.settlement } : null,
      reports: order.reports.map((report) => ({ ...report })),
    })
    const target = this.priorityTargetId ? this.landmarks.get(this.priorityTargetId)!.access.position : null
    return {
      shiftId: this.shiftId,
      elapsedSec: this.elapsed, nextOfferInSec: Math.max(0, this.nextOfferAt - this.elapsed),
      messages: this.messages.map((message) => ({ ...message })),
      offers: this.offers.map((offer) => {
        const merchant = this.landmarks.get(offer.merchantId)!.access.position
        const delivery = this.landmarks.get(offer.deliveryId)!.access.position
        const extraDistance = target ? distance(rider, merchant) + distance(merchant, delivery) + distance(delivery, target) - distance(rider, target) : Infinity
        return { ...offer, ...this.estimate(offer.merchantId, offer.deliveryId, rider), onTheWay: extraDistance <= 35 }
      }),
      active: this.active.map(copy), completed: this.completed.map(copy),
      priorityId: this.priorityId, incomeCents: this.incomeCents, operatingCostCents: this.operatingCostCents, paused, notice: this.notice,
    }
  }

  private addMessage(orderId: string, kind: OrderMessage['kind'], text: string, at: number): void {
    this.messages.push({ id: this.messages.length + 1, orderId, kind, text, at })
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
    return { idealDistance, idealSec: Math.max(34, Math.ceil(idealDistance / 6.8 + 18)) }
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
    const allCandidates = this.merchants.flatMap((merchant) => this.destinations.map((destination) => ({ merchant, destination })))
      .filter(({ merchant, destination }) => ![...this.offers, ...this.active].some((order) => order.merchantId === merchant.id && order.deliveryId === destination.id))
    // 8×8 扩容大城下优先派送合理半径内的近中程单，避免跨 720m 全图导致无解超时。
    const localCandidates = allCandidates.filter(({ merchant, destination }) => (
      distance(rider, merchant.access.position) <= 270
      && distance(merchant.access.position, destination.access.position) <= 340
    ))
    const pool = localCandidates.length > 0 ? localCandidates : allCandidates
    const pair = pool[Math.floor(this.random() * pool.length)]
    this.createOffer(pair.merchant, pair.destination, rider, at)
  }
}
