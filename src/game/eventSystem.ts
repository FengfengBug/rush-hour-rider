import type {
  ActiveGameEvent,
  BuildingKind,
  CityLandmark,
  EventLedgerKey,
  EventOutcome,
  EventSnapshot,
  GameEventKind,
} from './types'

const EVENT_COOLDOWN_SEC = 10
const SPRINT_DURATION_SEC = 3.0
const OUTCOME_TOAST_SEC = 3.8

export interface EventResolution {
  readonly orderId: string
  readonly phase: 'pickup' | 'delivery'
  readonly action: 'complete-pickup' | 'complete-delivery' | 'transfer-order'
  readonly ledgerKey: EventLedgerKey
  readonly timeCostSec: number
  readonly staminaCost: number
  readonly tipCents: number
  readonly eventPenaltyCents: number
  readonly messageKind: 'system' | 'merchant' | 'customer' | 'rider'
  readonly messageText: string
  readonly outcome: EventOutcome
}

interface InternalEvent {
  readonly view: ActiveGameEvent
  readonly riderStaminaAtStart: number
  sprint: {
    active: boolean
    taps: number
    targetTaps: number
    remainingSec: number
    durationSec: number
  } | null
}

function buildEventCard(
  instanceId: number,
  kind: GameEventKind,
  phase: 'pickup' | 'delivery',
  orderId: string,
  landmark: CityLandmark,
): ActiveGameEvent {
  const name = landmark.name
  switch (kind) {
    case 'merchant-backlog':
      return {
        instanceId,
        kind,
        phase,
        orderId,
        landmarkId: landmark.id,
        landmarkName: name,
        badge: `取餐突发 · ${name}`,
        title: '商家爆单卡餐',
        description: `${name}午高峰灶台积压十几张小票，出餐明显排队延误。`,
        options: [
          {
            id: 'a',
            keyHint: '1',
            label: '死等出餐',
            summary: '原地催促等打包，稳稳取餐继续送',
            tags: ['预计 +11~17 秒', '记入卡餐账本'],
            tone: 'safe',
          },
          {
            id: 'b',
            keyHint: '2',
            label: '报备转单',
            summary: '免去本单超时，但失去收益并扣信誉',
            tags: ['无本单收益', '信誉 -6%'],
            tone: 'risk',
          },
        ],
        sprint: null,
      }
    case 'luxury-compound-no-ebike':
      return {
        instanceId,
        kind,
        phase,
        orderId,
        landmarkId: landmark.id,
        landmarkName: name,
        badge: `高端物业门禁 · ${name}`,
        title: '高端小区禁入电驴',
        description: `${name}物业实行人车分流严禁电驴入内，门口保安拦车只能锁车步行或绕侧门。`,
        options: [
          {
            id: 'a',
            keyHint: '1',
            label: '锁车步行冲刺',
            summary: '3 秒内连续快按 Space 奔跑进小区送达，省时费力',
            tags: ['连按 Space 冲刺', '预计 +8~14 秒', '体力 -14%'],
            tone: 'action',
          },
          {
            id: 'b',
            keyHint: '2',
            label: '绕道物业侧门',
            summary: '按物业规定绕走货梯/侧门送达，省体力但耗时更长',
            tags: ['固定 +17 秒', '体力 -3%'],
            tone: 'safe',
          },
        ],
        sprint: null,
      }
    case 'cbd-elevator-jam':
      return {
        instanceId,
        kind,
        phase,
        orderId,
        landmarkId: landmark.id,
        landmarkName: name,
        badge: `写字楼高峰 · ${name}`,
        title: '午高峰电梯爆满',
        description: `${name}大堂电梯口排起长队，货梯也在检修只能硬等或爬楼。`,
        options: [
          {
            id: 'a',
            keyHint: '1',
            label: '排队等电梯',
            summary: '原地省力等梯，但耗时随机波动很大',
            tags: ['预计 +10~22 秒', '不耗体力'],
            tone: 'safe',
          },
          {
            id: 'b',
            keyHint: '2',
            label: '咬牙爬 6 楼',
            summary: '走消防楼梯耗时稳定较短，体力消耗大',
            tags: ['固定 +9 秒', '体力 -20%'],
            tone: 'action',
          },
        ],
        sprint: null,
      }
    case 'wrong-pin-address':
      return {
        instanceId,
        kind,
        phase,
        orderId,
        landmarkId: landmark.id,
        landmarkName: name,
        badge: `定位偏差 · ${name}`,
        title: '顾客填错定位',
        description: `到达${name}才发现顾客标错楼栋，电话里希望你多跑一趟隔壁栋。`,
        options: [
          {
            id: 'a',
            keyHint: '1',
            label: '好心多跑隔壁栋',
            summary: '多花绕路时间稳拿好评，有概率获小费',
            tags: ['固定 +13 秒', '体力 -6%', '60% 小费 +¥2'],
            tone: 'action',
          },
          {
            id: 'b',
            keyHint: '2',
            label: '按规放前台拍照',
            summary: '立刻省时走人，但有半数概率吃差评扣款',
            tags: ['固定 +3 秒', '50% 差评 -¥2'],
            tone: 'risk',
          },
        ],
        sprint: null,
      }
    case 'locker-full':
      return {
        instanceId,
        kind,
        phase,
        orderId,
        landmarkId: landmark.id,
        landmarkName: name,
        badge: `投递受阻 · ${name}`,
        title: '外卖柜已满',
        description: `${name}门口外卖柜格口全满，后面还有骑手等着放餐。`,
        options: [
          {
            id: 'a',
            keyHint: '1',
            label: '电话等顾客下楼',
            summary: '当面交接零差评风险，但等待耗时较长',
            tags: ['预计 +11~16 秒', '稳妥无扣款'],
            tone: 'safe',
          },
          {
            id: 'b',
            keyHint: '2',
            label: '放门卫桌自担风险',
            summary: '放下快走省时，但可能被错拿遭投诉扣款',
            tags: ['固定 +3 秒', '40% 风险 -¥2.5'],
            tone: 'risk',
          },
        ],
        sprint: null,
      }
  }
}

export class EventSystem {
  private seed = 3107
  private instanceSeq = 0
  private outcomeSeq = 0
  private activeEvent: InternalEvent | null = null
  private latestOutcome: EventOutcome | null = null
  private cooldownSec = 0
  private triggeredCount = 0
  private reputation = 100
  private goodReviews = 0
  private badReviews = 0
  private transferredCount = 0
  private readonly seenKinds = new Set<GameEventKind>()
  private readonly handledStages = new Set<string>()

  reset(): void {
    this.seed = 3107
    this.instanceSeq = 0
    this.outcomeSeq = 0
    this.activeEvent = null
    this.latestOutcome = null
    this.cooldownSec = 0
    this.triggeredCount = 0
    this.reputation = 100
    this.goodReviews = 0
    this.badReviews = 0
    this.transferredCount = 0
    this.seenKinds.clear()
    this.handledStages.clear()
  }

  get hasActiveEvent(): boolean {
    return this.activeEvent !== null
  }

  updateRidingCooldown(deltaSeconds: number): void {
    if (this.cooldownSec > 0) {
      this.cooldownSec = Math.max(0, this.cooldownSec - deltaSeconds)
    }
    if (this.latestOutcome) {
      const nextRemaining = this.latestOutcome.remainingSec - deltaSeconds
      this.latestOutcome = nextRemaining > 0
        ? { ...this.latestOutcome, remainingSec: nextRemaining }
        : null
    }
  }

  updateModal(deltaSeconds: number): EventResolution | null {
    if (this.latestOutcome) {
      const nextRemaining = this.latestOutcome.remainingSec - deltaSeconds
      this.latestOutcome = nextRemaining > 0
        ? { ...this.latestOutcome, remainingSec: nextRemaining }
        : null
    }
    const current = this.activeEvent
    if (!current || !current.sprint || !current.sprint.active) return null
    current.sprint.remainingSec = Math.max(0, current.sprint.remainingSec - deltaSeconds)
    if (current.sprint.remainingSec <= 0) {
      return this.finishSprint()
    }
    return null
  }

  tryTriggerArrival(
    phase: 'pickup' | 'delivery',
    orderId: string,
    landmark: CityLandmark,
    buildingKind: BuildingKind,
    riderStamina: number,
  ): boolean {
    const stageKey = `${orderId}:${phase}`
    if (this.activeEvent || this.handledStages.has(stageKey)) return false
    this.handledStages.add(stageKey)
    if (this.cooldownSec > 0) return false

    const candidates = this.getCandidates(phase, buildingKind)
    if (candidates.length === 0) return false

    const triggerChance = this.triggeredCount === 0
      ? (phase === 'delivery' ? 1 : 0.68)
      : 0.72
    if (this.random() > triggerChance) return false

    const unseen = candidates.filter((kind) => !this.seenKinds.has(kind))
    const pool = unseen.length > 0 ? unseen : candidates
    // Prefer the first unseen signature landmark event for rich variety.
    const chosen = unseen.length > 0 ? pool[0] : pool[Math.floor(this.random() * pool.length)]
    this.seenKinds.add(chosen)
    this.triggeredCount += 1

    const view = buildEventCard(++this.instanceSeq, chosen, phase, orderId, landmark)
    this.activeEvent = { view, riderStaminaAtStart: riderStamina, sprint: null }
    return true
  }

  chooseOption(choiceIndex: 0 | 1): EventResolution | null {
    const current = this.activeEvent
    if (!current || current.sprint?.active) return null
    const { kind, orderId, phase, landmarkName } = current.view

    if (kind === 'luxury-compound-no-ebike' && choiceIndex === 0) {
      const exhausted = current.riderStaminaAtStart < 15
      current.sprint = {
        active: true,
        taps: 0,
        targetTaps: exhausted ? 12 : 10,
        remainingSec: SPRINT_DURATION_SEC,
        durationSec: SPRINT_DURATION_SEC,
      }
      return null
    }

    if (kind === 'merchant-backlog') {
      if (choiceIndex === 0) {
        const waitSec = 11 + Math.round(this.random() * 6)
        return this.commitResolution({
          orderId,
          phase,
          action: 'complete-pickup',
          ledgerKey: 'merchantDelaySec',
          timeCostSec: waitSec,
          staminaCost: 0,
          tipCents: 0,
          eventPenaltyCents: 0,
          messageKind: 'merchant',
          messageText: `${landmarkName}爆单卡餐，死等 ${waitSec} 秒后终于拿到餐品。`,
          outcomeTitle: '死等出餐完成',
          outcomeSummary: `卡餐等待 +${waitSec} 秒，已取餐继续配送`,
          tone: 'warn',
        })
      }
      this.transferredCount += 1
      this.reputation = Math.max(0, this.reputation - 6)
      return this.commitResolution({
        orderId,
        phase,
        action: 'transfer-order',
        ledgerKey: 'merchantDelaySec',
        timeCostSec: 2,
        staminaCost: 0,
        tipCents: 0,
        eventPenaltyCents: 0,
        messageKind: 'rider',
        messageText: `${landmarkName}严重卡餐，已报备转单（无本单收益，信誉 -6%）。`,
        outcomeTitle: '已报备转单',
        outcomeSummary: '避开严重超时 · 失去本单收益 · 信誉 -6%',
        tone: 'neutral',
      })
    }

    if (kind === 'luxury-compound-no-ebike') {
      return this.commitResolution({
        orderId,
        phase,
        action: 'complete-delivery',
        ledgerKey: 'lastMileSec',
        timeCostSec: 17,
        staminaCost: 3,
        tipCents: 0,
        eventPenaltyCents: 0,
        messageKind: 'system',
        messageText: `${landmarkName}高端物业禁入电驴，绕道物业侧门耗时 17 秒送达。`,
        outcomeTitle: '绕道侧门送达',
        outcomeSummary: '末端绕行 +17 秒 · 体力 -3%',
        tone: 'neutral',
      })
    }

    if (kind === 'cbd-elevator-jam') {
      if (choiceIndex === 0) {
        const waitSec = 10 + Math.round(this.random() * 12)
        return this.commitResolution({
          orderId,
          phase,
          action: 'complete-delivery',
          ledgerKey: 'lastMileSec',
          timeCostSec: waitSec,
          staminaCost: 0,
          tipCents: 0,
          eventPenaltyCents: 0,
          messageKind: 'system',
          messageText: `${landmarkName}排队等电梯耗时 ${waitSec} 秒，顺利交到顾客手中。`,
          outcomeTitle: '排队等电梯送达',
          outcomeSummary: `等梯耗掉 +${waitSec} 秒 · 未消耗体力`,
          tone: waitSec >= 16 ? 'warn' : 'neutral',
        })
      }
      return this.commitResolution({
        orderId,
        phase,
        action: 'complete-delivery',
        ledgerKey: 'lastMileSec',
        timeCostSec: 9,
        staminaCost: 20,
        tipCents: 0,
        eventPenaltyCents: 0,
        messageKind: 'rider',
        messageText: `避开${landmarkName}电梯长队，咬牙爬 6 楼仅耗 9 秒送达（体力 -20%）。`,
        outcomeTitle: '咬牙爬 6 楼送达',
        outcomeSummary: '末端爬楼 +9 秒 · 体力 -20%',
        tone: 'good',
      })
    }

    if (kind === 'wrong-pin-address') {
      if (choiceIndex === 0) {
        const gotTip = this.random() < 0.6
        const tipCents = gotTip ? 200 : 0
        this.goodReviews += 1
        this.reputation = Math.min(100, this.reputation + 2)
        return this.commitResolution({
          orderId,
          phase,
          action: 'complete-delivery',
          ledgerKey: 'detourSec',
          timeCostSec: 13,
          staminaCost: 6,
          tipCents,
          eventPenaltyCents: 0,
          messageKind: 'customer',
          messageText: gotTip
            ? `顾客致谢：不好意思填错楼栋！已给你打赏 ¥2.00 小费并五星好评。`
            : `顾客致谢：谢谢师傅多跑一趟隔壁栋，给你点五星好评！`,
          outcomeTitle: gotTip ? '改址送达 · 获小费！' : '改址送达 · 获好评',
          outcomeSummary: gotTip
            ? '绕路 +13 秒 · 体力 -6% · 顾客打赏 +¥2.00'
            : '绕路 +13 秒 · 体力 -6% · 稳拿五星好评',
          tone: 'good',
        })
      }
      const badReview = this.random() < 0.5
      if (badReview) {
        this.badReviews += 1
        this.reputation = Math.max(0, this.reputation - 8)
      }
      return this.commitResolution({
        orderId,
        phase,
        action: 'complete-delivery',
        ledgerKey: 'detourSec',
        timeCostSec: 3,
        staminaCost: 0,
        tipCents: 0,
        eventPenaltyCents: badReview ? 200 : 0,
        messageKind: badReview ? 'customer' : 'system',
        messageText: badReview
          ? `顾客不满放前台拍照给出差评，平台扣除服务费 ¥2.00（信誉 -8%）。`
          : `已按规定在${landmarkName}定位前台拍照放餐，顾客未提出异议。`,
        outcomeTitle: badReview ? '放前台遭差评扣款' : '按规放前台完成',
        outcomeSummary: badReview
          ? '耗时 +3 秒 · 触发差评扣款 -¥2.00'
          : '耗时 +3 秒 · 平安放餐无差评',
        tone: badReview ? 'warn' : 'neutral',
      })
    }

    // locker-full
    if (choiceIndex === 0) {
      const waitSec = 11 + Math.round(this.random() * 5)
      this.goodReviews += 1
      this.reputation = Math.min(100, this.reputation + 1)
      return this.commitResolution({
        orderId,
        phase,
        action: 'complete-delivery',
        ledgerKey: 'lastMileSec',
        timeCostSec: waitSec,
        staminaCost: 0,
        tipCents: 0,
        eventPenaltyCents: 0,
        messageKind: 'customer',
        messageText: `外卖柜已满，电话等顾客下楼 ${waitSec} 秒后当面交接完成。`,
        outcomeTitle: '当面交接完成',
        outcomeSummary: `末端等顾客 +${waitSec} 秒 · 稳妥无风险`,
        tone: 'neutral',
      })
    }
    const lostMeal = this.random() < 0.4
    if (lostMeal) {
      this.badReviews += 1
      this.reputation = Math.max(0, this.reputation - 8)
    }
    return this.commitResolution({
      orderId,
      phase,
      action: 'complete-delivery',
      ledgerKey: 'lastMileSec',
      timeCostSec: 3,
      staminaCost: 0,
      tipCents: 0,
      eventPenaltyCents: lostMeal ? 250 : 0,
      messageKind: lostMeal ? 'customer' : 'system',
      messageText: lostMeal
        ? `放门卫桌后餐品被错拿引发投诉，平台扣款 ¥2.50（信誉 -8%）。`
        : `将餐品暂放${landmarkName}门卫桌并拍照留言，顾客顺利取走。`,
      outcomeTitle: lostMeal ? '放门卫桌遭投诉扣款' : '暂放门卫桌送达',
      outcomeSummary: lostMeal
        ? '耗时 +3 秒 · 餐品错拿扣款 -¥2.50'
        : '耗时 +3 秒 · 顺利取餐未出意外',
      tone: lostMeal ? 'warn' : 'neutral',
    })
  }

  tapSprint(): EventResolution | null {
    const current = this.activeEvent
    if (!current || !current.sprint || !current.sprint.active) return null
    current.sprint.taps += 1
    if (current.sprint.taps >= current.sprint.targetTaps) {
      return this.finishSprint()
    }
    return null
  }

  getSnapshot(): EventSnapshot {
    const active: ActiveGameEvent | null = this.activeEvent
      ? {
          ...this.activeEvent.view,
          sprint: this.activeEvent.sprint ? { ...this.activeEvent.sprint } : null,
        }
      : null
    return {
      active,
      latestOutcome: this.latestOutcome ? { ...this.latestOutcome } : null,
      triggeredCount: this.triggeredCount,
      reputation: this.reputation,
      goodReviews: this.goodReviews,
      badReviews: this.badReviews,
      transferredCount: this.transferredCount,
    }
  }

  private finishSprint(): EventResolution {
    const current = this.activeEvent!
    const sprint = current.sprint!
    sprint.active = false
    const ratio = Math.max(0, Math.min(1, sprint.taps / sprint.targetTaps))
    const timeCostSec = Math.round(14 - ratio * 6)
    const staminaCost = Math.round(9 + ratio * 5)
    const fullSuccess = ratio >= 1
    return this.commitResolution({
      orderId: current.view.orderId,
      phase: current.view.phase,
      action: 'complete-delivery',
      ledgerKey: 'lastMileSec',
      timeCostSec,
      staminaCost,
      tipCents: 0,
      eventPenaltyCents: 0,
      messageKind: 'rider',
      messageText: fullSuccess
        ? `在${current.view.landmarkName}百米冲刺到位！仅耗 ${timeCostSec} 秒送达（体力 -${staminaCost}%）。`
        : `在${current.view.landmarkName}快步跑进楼栋，耗时 ${timeCostSec} 秒送达（体力 -${staminaCost}%）。`,
      outcomeTitle: fullSuccess ? '步行冲刺成功！' : '步行送达完成',
      outcomeSummary: `连按 ${sprint.taps}/${sprint.targetTaps} 次 · 末端 +${timeCostSec} 秒 · 体力 -${staminaCost}%`,
      tone: fullSuccess ? 'good' : 'neutral',
    })
  }

  private commitResolution(params: {
    orderId: string
    phase: 'pickup' | 'delivery'
    action: EventResolution['action']
    ledgerKey: EventLedgerKey
    timeCostSec: number
    staminaCost: number
    tipCents: number
    eventPenaltyCents: number
    messageKind: EventResolution['messageKind']
    messageText: string
    outcomeTitle: string
    outcomeSummary: string
    tone: EventOutcome['tone']
  }): EventResolution {
    const kind = this.activeEvent!.view.kind
    const outcome: EventOutcome = {
      id: ++this.outcomeSeq,
      kind,
      orderId: params.orderId,
      title: params.outcomeTitle,
      summary: params.outcomeSummary,
      ledgerKey: params.ledgerKey,
      timeCostSec: params.timeCostSec,
      staminaDelta: -params.staminaCost,
      moneyDeltaCents: params.tipCents - params.eventPenaltyCents,
      tone: params.tone,
      remainingSec: OUTCOME_TOAST_SEC,
    }
    this.activeEvent = null
    this.latestOutcome = outcome
    this.cooldownSec = EVENT_COOLDOWN_SEC
    return {
      orderId: params.orderId,
      phase: params.phase,
      action: params.action,
      ledgerKey: params.ledgerKey,
      timeCostSec: params.timeCostSec,
      staminaCost: params.staminaCost,
      tipCents: params.tipCents,
      eventPenaltyCents: params.eventPenaltyCents,
      messageKind: params.messageKind,
      messageText: params.messageText,
      outcome,
    }
  }

  private getCandidates(phase: 'pickup' | 'delivery', buildingKind: BuildingKind): GameEventKind[] {
    if (phase === 'pickup') return ['merchant-backlog']
    switch (buildingKind) {
      case 'luxury':
        // 贴合国内现实：高端封闭式物业小区常严禁外卖电驴入内
        return ['luxury-compound-no-ebike', 'wrong-pin-address']
      case 'apartment':
        // 老旧开放小区大多可直接骑车进楼下，不再触发禁入电驴
        return ['wrong-pin-address']
      case 'office':
      case 'tech':
        return ['cbd-elevator-jam', 'locker-full', 'wrong-pin-address']
      case 'hospital':
        return ['locker-full', 'wrong-pin-address']
      case 'school':
      case 'campus':
        return ['locker-full', 'wrong-pin-address']
      default:
        return ['wrong-pin-address']
    }
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }
}
