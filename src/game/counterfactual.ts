import type { DeliveryOrder, EngineSnapshot, OrderTimeLedger } from './types'

/**
 * 班次时间刻度映射：本局 3.5 分钟（210 秒）模拟现实午高峰 120 分钟（11:30–13:30）。
 * 订单层面按配送体验换算：现实每多给 1 分钟缓冲 ≈ 局内每单 +2.5 秒缓冲（+5 分钟 = +12.5 秒/单）。
 */
export const SIM_SECONDS_PER_REAL_MINUTE = 2.5

export interface RiderTitleBadge {
  readonly title: string
  readonly tag: string
  readonly reason: string
}

export interface ShiftSummary {
  readonly completedCount: number
  readonly activeCount: number
  readonly onTimeCount: number
  readonly lateCount: number
  readonly onTimeRate: number | null
  readonly grossCents: number
  readonly baseFeeCents: number
  readonly onTimeBonusCents: number
  readonly rainBonusCents: number
  readonly tipCents: number
  readonly latePenaltyCents: number
  readonly eventPenaltyCents: number
  readonly operatingCostCents: number
  readonly violationFineCents: number
  readonly totalDeductionsCents: number
  readonly netIncomeCents: number
  readonly reputation: number
  readonly redLightCount: number
  readonly collisionCount: number
  readonly batterySwapCount: number
  readonly distractedSec: number
  readonly idealTotalSec: number
  readonly actualTotalSec: number
  readonly ledger: OrderTimeLedger
  readonly nonRidingSec: number
  readonly nonRidingSharePct: number
  readonly ledgerSampleKind: 'completed' | 'active' | 'empty'
  readonly badge: RiderTitleBadge
}

export interface CounterfactualResult {
  readonly extraRealMinutes: number
  readonly extraGameSec: number
  readonly sampleKind: 'completed' | 'active' | 'empty'
  readonly orderCount: number
  readonly baselineOnTimeCount: number
  readonly projectedOnTimeCount: number
  readonly baselineOnTimeRate: number | null
  readonly projectedOnTimeRate: number | null
  readonly turnedOnTimeOrders: number
  readonly baselineRedLights: number
  readonly avoidableRedLights: number
  readonly savedOrderCents: number
  readonly savedFineCents: number
  readonly totalSavedCents: number
  readonly baselineNetIncomeCents: number
  readonly projectedNetIncomeCents: number
  readonly headline: string
}

function emptyLedger(): OrderTimeLedger {
  return {
    ridingSec: 0,
    trafficWaitSec: 0,
    merchantDelaySec: 0,
    lastMileSec: 0,
    detourSec: 0,
    idleSec: 0,
  }
}

function sumLedgers(orders: readonly DeliveryOrder[]): { ledger: OrderTimeLedger; idealSec: number; actualSec: number } {
  const ledger = emptyLedger()
  let idealSec = 0
  let actualSec = 0
  for (const order of orders) {
    ledger.ridingSec += order.ledger.ridingSec
    ledger.trafficWaitSec += order.ledger.trafficWaitSec
    ledger.merchantDelaySec += order.ledger.merchantDelaySec
    ledger.lastMileSec += order.ledger.lastMileSec
    ledger.detourSec += order.ledger.detourSec
    ledger.idleSec += order.ledger.idleSec
    idealSec += order.idealSec
    actualSec += order.actualSec
  }
  return { ledger, idealSec, actualSec }
}

function pickRiderTitle(params: {
  completedCount: number
  onTimeRate: number | null
  redLightCount: number
  collisionCount: number
  rainBonusCents: number
  reputation: number
  nonRidingSharePct: number
}): RiderTitleBadge {
  const { completedCount, onTimeRate, redLightCount, collisionCount, rainBonusCents, reputation, nonRidingSharePct } = params
  if (completedCount === 0) {
    return {
      title: '街区观察员',
      tag: '尚未完单',
      reason: '先熟悉了微缩街区路况与红绿灯节奏，下一局接上订单就能看到完整时间账本。',
    }
  }
  if (redLightCount === 0 && collisionCount === 0 && (onTimeRate ?? 0) >= 80 && reputation >= 90) {
    return {
      title: '稳健守规骑手',
      tag: '零违章高准时',
      reason: '全程守灯零剐蹭仍稳住高准时率，在效率与安全之间找到了难得的平衡。',
    }
  }
  if (completedCount >= 4 && (onTimeRate ?? 0) >= 85 && redLightCount <= 1) {
    return {
      title: '午高峰闪电侠',
      tag: '高效老骑手',
      reason: '路线规划与多单衔接极其流畅，顶着午高峰压力交出了亮眼的准时成绩。',
    }
  }
  if (rainBonusCents > 0 && completedCount >= 2) {
    return {
      title: '雨中逆行者',
      tag: '阵雨坚守',
      reason: '顶着午后突发阵雨与湿滑路面完成配送，每一份热饭背后都是实打实的奔波。',
    }
  }
  if (redLightCount >= 2 || ((onTimeRate ?? 100) < 75 && nonRidingSharePct >= 35)) {
    return {
      title: '算法困兽',
      tag: '被压缩的秒针',
      reason: '红灯、卡餐与末端门禁吞噬了大量非骑行时间，严苛倒计时正不断把人推向冒险边缘。',
    }
  }
  if (redLightCount === 0 && (onTimeRate ?? 100) < 80) {
    return {
      title: '宁等三秒守灯人',
      tag: '安全优先',
      reason: '宁愿超时扣款也坚持不闯红灯——这份克制本不该由骑手独自承担经济代价。',
    }
  }
  return {
    title: '午高峰奔跑者',
    tag: '实战体验',
    reason: '亲历了真实午高峰的派单、卡餐、门禁与路况波动，每一单的时间损耗都清晰留痕。',
  }
}

export function buildShiftSummary(snapshot: EngineSnapshot): ShiftSummary {
  const completed = snapshot.orders.completed
  const active = snapshot.orders.active
  const completedCount = completed.length
  const activeCount = active.length
  const onTimeCount = completed.filter((o) => o.settlement?.onTime).length
  const lateCount = completedCount - onTimeCount
  const onTimeRate = completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : null

  let baseFeeCents = 0
  let onTimeBonusCents = 0
  let rainBonusCents = 0
  let tipCents = 0
  let latePenaltyCents = 0
  let eventPenaltyCents = 0

  for (const order of completed) {
    const s = order.settlement
    if (!s) continue
    baseFeeCents += s.baseFeeCents
    onTimeBonusCents += s.bonusCents
    rainBonusCents += s.rainBonusCents
    tipCents += s.tipCents
    latePenaltyCents += s.penaltyCents
    eventPenaltyCents += s.eventPenaltyCents
  }

  const grossCents = baseFeeCents + onTimeBonusCents + rainBonusCents + tipCents
  const operatingCostCents = snapshot.orders.operatingCostCents
  const violationFineCents = snapshot.events.violationFineCents
  const totalDeductionsCents = latePenaltyCents + eventPenaltyCents + operatingCostCents
  const netIncomeCents = snapshot.orders.incomeCents

  const ledgerSampleKind: ShiftSummary['ledgerSampleKind'] =
    completedCount > 0 ? 'completed' : activeCount > 0 ? 'active' : 'empty'
  const ledgerSource = completedCount > 0 ? completed : active
  const { ledger, idealSec, actualSec } = sumLedgers(ledgerSource)
  const nonRidingSec = Math.max(0, actualSec - ledger.ridingSec)
  const nonRidingSharePct = actualSec > 0.01 ? Math.round((nonRidingSec / actualSec) * 100) : 0

  const redLightCount = snapshot.traffic.redLightCount
  const collisionCount = snapshot.traffic.collisionCount
  const reputation = snapshot.events.reputation

  const badge = pickRiderTitle({
    completedCount,
    onTimeRate,
    redLightCount,
    collisionCount,
    rainBonusCents,
    reputation,
    nonRidingSharePct,
  })

  return {
    completedCount,
    activeCount,
    onTimeCount,
    lateCount,
    onTimeRate,
    grossCents,
    baseFeeCents,
    onTimeBonusCents,
    rainBonusCents,
    tipCents,
    latePenaltyCents,
    eventPenaltyCents,
    operatingCostCents,
    violationFineCents,
    totalDeductionsCents,
    netIncomeCents,
    reputation,
    redLightCount,
    collisionCount,
    batterySwapCount: snapshot.events.batterySwapCount,
    distractedSec: snapshot.distraction.elapsedSec,
    idealTotalSec: idealSec,
    actualTotalSec: actualSec,
    ledger,
    nonRidingSec,
    nonRidingSharePct,
    ledgerSampleKind,
    badge,
  }
}

export function evaluateCounterfactual(snapshot: EngineSnapshot, extraRealMinutes: number): CounterfactualResult {
  const clampedMin = Math.max(0, Math.min(8, Math.round(extraRealMinutes)))
  const extraGameSec = clampedMin * SIM_SECONDS_PER_REAL_MINUTE
  const completed = snapshot.orders.completed
  const active = snapshot.orders.active
  const redLightCount = snapshot.traffic.redLightCount
  const violationFineCents = snapshot.events.violationFineCents
  const baselineNetIncomeCents = snapshot.orders.incomeCents

  if (completed.length === 0) {
    const sampleKind: CounterfactualResult['sampleKind'] = active.length > 0 ? 'active' : 'empty'
    const avoidableRedLights = redLightCount > 0 && clampedMin > 0
      ? Math.min(redLightCount, Math.floor((extraGameSec + 0.5) / 4.2))
      : 0
    const savedFineCents = redLightCount > 0
      ? Math.round(violationFineCents * (avoidableRedLights / redLightCount))
      : 0
    const headline = clampedMin === 0
      ? '拖动滑块至 +5 分钟，查看宽松时限对准时率、违章风险与收入的真实变化。'
      : sampleKind === 'active'
        ? `当前尚有 ${active.length} 单未送达；若每单多给 ${clampedMin} 分钟（+${extraGameSec.toFixed(1)} 秒），在途配送压力明显缓解${avoidableRedLights > 0 ? `，且本可少冒 ${avoidableRedLights} 次闯红灯风险` : ''}。`
        : '本局暂未完成订单；下一局完成 1 单以上即可基于你的真实每单耗时生成精准反事实推演。'
    return {
      extraRealMinutes: clampedMin,
      extraGameSec,
      sampleKind,
      orderCount: active.length,
      baselineOnTimeCount: 0,
      projectedOnTimeCount: 0,
      baselineOnTimeRate: null,
      projectedOnTimeRate: null,
      turnedOnTimeOrders: 0,
      baselineRedLights: redLightCount,
      avoidableRedLights,
      savedOrderCents: 0,
      savedFineCents,
      totalSavedCents: savedFineCents,
      baselineNetIncomeCents,
      projectedNetIncomeCents: baselineNetIncomeCents + savedFineCents,
      headline,
    }
  }

  let baselineOnTimeCount = 0
  let projectedOnTimeCount = 0
  let savedOrderCents = 0

  for (const order of completed) {
    const s = order.settlement
    if (!s) continue
    if (s.onTime) baselineOnTimeCount += 1

    const newLateSec = Math.max(0, s.lateSec - extraGameSec)
    const newOnTime = newLateSec <= 0.0000001
    if (newOnTime) projectedOnTimeCount += 1

    const newBonusCents = newOnTime ? 150 : 0
    const newPenaltyCents = newOnTime
      ? 0
      : Math.min(order.baseFeeCents, Math.ceil(newLateSec - 0.0000001) * 5)
    savedOrderCents += (s.penaltyCents - newPenaltyCents) + (newBonusCents - s.bonusCents)
  }

  const orderCount = completed.length
  const baselineOnTimeRate = Math.round((baselineOnTimeCount / orderCount) * 100)
  const projectedOnTimeRate = Math.round((projectedOnTimeCount / orderCount) * 100)
  const turnedOnTimeOrders = Math.max(0, projectedOnTimeCount - baselineOnTimeCount)

  const avoidableRedLights = redLightCount > 0 && clampedMin > 0
    ? Math.min(redLightCount, Math.floor((extraGameSec + 0.5) / 4.2))
    : 0
  const savedFineCents = redLightCount > 0
    ? Math.round(violationFineCents * (avoidableRedLights / redLightCount))
    : 0
  const totalSavedCents = savedOrderCents + savedFineCents
  const projectedNetIncomeCents = baselineNetIncomeCents + totalSavedCents

  let headline: string
  if (clampedMin === 0) {
    headline = '当前为平台原始算法时限（+0 分钟缓冲）；向右拖动滑块，看看多给 5 分钟会发生什么。'
  } else if (turnedOnTimeOrders > 0 || totalSavedCents > 0 || avoidableRedLights > 0) {
    const parts: string[] = [
      `准时率从 ${baselineOnTimeRate}% 升至 ${projectedOnTimeRate}%`,
    ]
    if (avoidableRedLights > 0) {
      parts.push(`本可少冒 ${avoidableRedLights} 次闯红灯风险`)
    }
    if (totalSavedCents > 0) {
      parts.push(`净收入多保住 ¥${(totalSavedCents / 100).toFixed(2)}`)
    }
    headline = `如果平台每单多给 ${clampedMin} 分钟缓冲（局内 +${extraGameSec.toFixed(1)} 秒）→ 你的${parts.join('，')}。`
  } else {
    headline = `你本局已全部准时且零违章；即便如此，每单多出 ${clampedMin} 分钟缓冲也能让等灯、进楼与雨天骑行多一份从容。`
  }

  return {
    extraRealMinutes: clampedMin,
    extraGameSec,
    sampleKind: 'completed',
    orderCount,
    baselineOnTimeCount,
    projectedOnTimeCount,
    baselineOnTimeRate,
    projectedOnTimeRate,
    turnedOnTimeOrders,
    baselineRedLights: redLightCount,
    avoidableRedLights,
    savedOrderCents,
    savedFineCents,
    totalSavedCents,
    baselineNetIncomeCents,
    projectedNetIncomeCents,
    headline,
  }
}
