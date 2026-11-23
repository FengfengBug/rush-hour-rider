import { buildShiftSummary, evaluateCounterfactual } from '../game/counterfactual'
import type { EngineSnapshot, OrderTimeLedger } from '../game/types'

const POSTER_W = 900
const POSTER_H = 1200
const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", system-ui, sans-serif'

const LEDGER_ITEMS: { key: keyof OrderTimeLedger; label: string; color: string }[] = [
  { key: 'ridingSec', label: '正常骑行', color: '#478f67' },
  { key: 'trafficWaitSec', label: '等红灯', color: '#d85f49' },
  { key: 'merchantDelaySec', label: '商家卡餐', color: '#e6a530' },
  { key: 'lastMileSec', label: '进楼/门禁', color: '#4f7ea8' },
  { key: 'detourSec', label: '绕路/改址', color: '#9462a3' },
  { key: 'idleSec', label: '普通停车', color: '#96a092' },
]

function fmtMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

function fmtSec(sec: number): string {
  return `${sec.toFixed(1)}s`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4,
): number {
  const chars = [...text]
  let line = ''
  let lineCount = 0
  let cursorY = y

  for (let i = 0; i < chars.length; i += 1) {
    const test = line + chars[i]
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      lineCount += 1
      if (lineCount >= maxLines) {
        ctx.fillText(`${line.slice(0, -1)}…`, x, cursorY)
        return cursorY + lineHeight
      }
      ctx.fillText(line, x, cursorY)
      line = chars[i]
      cursorY += lineHeight
    } else {
      line = test
    }
  }
  if (line.length > 0) {
    ctx.fillText(line, x, cursorY)
    cursorY += lineHeight
  }
  return cursorY
}

function drawReceiptTeeth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, toothW: number, toothH: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  const count = Math.floor(w / toothW)
  const actualToothW = w / count
  for (let i = 0; i < count; i += 1) {
    const startX = x + i * actualToothW
    ctx.lineTo(startX + actualToothW / 2, y + toothH)
    ctx.lineTo(startX + actualToothW, y)
  }
  ctx.lineTo(x + w, y + toothH + 24)
  ctx.lineTo(x, y + toothH + 24)
  ctx.closePath()
  ctx.fill()
}

/**
 * 纯 Canvas 2D 在本机绘制 900×1200 暖纸风骑手收工战报海报（零外部截图库依赖）。
 */
export function renderSharePosterCanvas(snapshot: EngineSnapshot, selectedExtraMinutes: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')!

  const summary = buildShiftSummary(snapshot)
  // 若玩家当前停留在 +0 分原算法，海报默认用最具洞察力的「多给 5 分钟」推演金句；否则尊重玩家所选档位
  const posterBufferMin = selectedExtraMinutes > 0 ? selectedExtraMinutes : 5
  const cf = evaluateCounterfactual(snapshot, posterBufferMin)

  // 1. 背景暖灰绿画布 + 微妙纹理光晕
  const bgGrad = ctx.createLinearGradient(0, 0, 0, POSTER_H)
  bgGrad.addColorStop(0, '#2a372f')
  bgGrad.addColorStop(1, '#1d2721')
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  // 顶部柔和暖光装饰
  const glow = ctx.createRadialGradient(740, 120, 20, 740, 120, 360)
  glow.addColorStop(0, 'rgba(246, 194, 68, 0.22)')
  glow.addColorStop(1, 'rgba(246, 194, 68, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, POSTER_W, 500)

  // 2. 主票据卡片（暖纸底）
  const cardX = 44
  const cardY = 44
  const cardW = POSTER_W - 88
  const cardH = POSTER_H - 96

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.34)'
  ctx.shadowBlur = 32
  ctx.shadowOffsetY = 14
  roundRect(ctx, cardX, cardY, cardW, cardH, 26)
  ctx.fillStyle = '#fcf9f0'
  ctx.fill()
  ctx.restore()

  // 顶边暖黄条
  ctx.save()
  roundRect(ctx, cardX, cardY, cardW, cardH, 26)
  ctx.clip()
  ctx.fillStyle = '#f0ba38'
  ctx.fillRect(cardX, cardY, cardW, 12)
  ctx.restore()

  const padX = cardX + 42
  const innerW = cardW - 84

  // 3. 品牌头与班次时间
  ctx.fillStyle = '#fdeab4'
  roundRect(ctx, padX, cardY + 34, 290, 32, 16)
  ctx.fill()
  ctx.fillStyle = '#6c4b0e'
  ctx.font = `800 15px ${FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.fillText('午高峰：外卖骑手模拟器 · 战报', padX + 16, cardY + 50)

  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} · ${snapshot.shift.mode === 'free' ? '自由体验' : `午高峰 ${snapshot.shift.clockLabel}`}`
  ctx.fillStyle = '#68735e'
  ctx.font = `700 15px ${FONT_FAMILY}`
  ctx.textAlign = 'right'
  ctx.fillText(stamp, padX + innerW, cardY + 50)
  ctx.textAlign = 'left'

  // 4. 骑手称号 + 净收入主卡
  const titleY = cardY + 106
  ctx.fillStyle = '#212c22'
  ctx.font = `900 42px ${FONT_FAMILY}`
  ctx.fillText(summary.badge.title, padX, titleY)

  const titleWidth = ctx.measureText(summary.badge.title).width
  const tagX = padX + titleWidth + 14
  ctx.font = `800 15px ${FONT_FAMILY}`
  const tagW = ctx.measureText(summary.badge.tag).width + 24
  if (tagX + tagW < padX + innerW - 230) {
    roundRect(ctx, tagX, titleY - 16, tagW, 30, 15)
    ctx.fillStyle = '#e7f4e4'
    ctx.fill()
    ctx.strokeStyle = '#bdd6b8'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#295f3f'
    ctx.fillText(summary.badge.tag, tagX + 12, titleY)
  }

  ctx.fillStyle = '#4e5b4b'
  ctx.font = `500 17px ${FONT_FAMILY}`
  drawWrappedText(ctx, summary.badge.reason, padX, titleY + 38, innerW - 238, 25, 2)

  // 右上净到手金额盒
  const heroW = 216
  const heroX = padX + innerW - heroW
  const heroY = cardY + 82
  roundRect(ctx, heroX, heroY, heroW, 108, 16)
  const heroGrad = ctx.createLinearGradient(heroX, heroY, heroX + heroW, heroY + 108)
  heroGrad.addColorStop(0, '#fff9eb')
  heroGrad.addColorStop(1, '#fcedc2')
  ctx.fillStyle = heroGrad
  ctx.fill()
  ctx.strokeStyle = '#e0cf9e'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.textAlign = 'right'
  ctx.fillStyle = '#75581e'
  ctx.font = `700 14px ${FONT_FAMILY}`
  ctx.fillText('本班次净到手', heroX + heroW - 18, heroY + 24)
  ctx.fillStyle = '#7e480a'
  ctx.font = `900 36px ${FONT_FAMILY}`
  ctx.fillText(fmtMoney(summary.netIncomeCents), heroX + heroW - 18, heroY + 60)
  ctx.fillStyle = '#6c6144'
  ctx.font = `600 12.5px ${FONT_FAMILY}`
  ctx.fillText(`毛 ${fmtMoney(summary.grossCents)} · 扣 −${fmtMoney(summary.totalDeductionsCents)}`, heroX + heroW - 18, heroY + 91)
  ctx.textAlign = 'left'

  // 分割虚线
  const div1Y = cardY + 210
  ctx.save()
  ctx.setLineDash([6, 6])
  ctx.strokeStyle = '#d6dcc9'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(padX, div1Y)
  ctx.lineTo(padX + innerW, div1Y)
  ctx.stroke()
  ctx.restore()

  // 5. 4 格核心 KPI
  const kpiY = div1Y + 22
  const kpiGap = 14
  const kpiW = (innerW - kpiGap * 3) / 4
  const kpiH = 104
  const kpis = [
    {
      label: '完成单数',
      value: `${summary.completedCount} 单`,
      sub: `准时 ${summary.onTimeCount} · 超时 ${summary.lateCount}`,
      warn: false,
    },
    {
      label: '准时率',
      value: summary.onTimeRate !== null ? `${summary.onTimeRate}%` : '—',
      sub: summary.completedCount > 0 ? `${summary.onTimeCount}/${summary.completedCount} 单准时` : '尚无完单',
      warn: summary.onTimeRate !== null && summary.onTimeRate < 80,
    },
    {
      label: '安全与信誉',
      value: `${summary.reputation}%`,
      sub: `闯红灯 ${summary.redLightCount} · 碰撞 ${summary.collisionCount}`,
      warn: summary.redLightCount > 0 || summary.reputation < 85,
    },
    {
      label: '非骑行损耗',
      value: summary.actualTotalSec > 0.01 ? `${summary.nonRidingSharePct}%` : '—',
      sub: summary.actualTotalSec > 0.01 ? `共耗时 ${fmtSec(summary.nonRidingSec)}` : '接单后统计',
      warn: summary.nonRidingSharePct >= 35,
    },
  ]

  kpis.forEach((item, idx) => {
    const x = padX + idx * (kpiW + kpiGap)
    roundRect(ctx, x, kpiY, kpiW, kpiH, 14)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#dfe4d3'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#68735f'
    ctx.font = `700 13.5px ${FONT_FAMILY}`
    ctx.fillText(item.label, x + 15, kpiY + 24)
    ctx.fillStyle = item.warn ? '#b63930' : '#233124'
    ctx.font = `900 28px ${FONT_FAMILY}`
    ctx.fillText(item.value, x + 15, kpiY + 58)
    ctx.fillStyle = '#616e5c'
    ctx.font = `600 12.5px ${FONT_FAMILY}`
    ctx.fillText(item.sub, x + 15, kpiY + 86)
  })

  // 6. 《算法时间账本》模块
  const ledgerBoxY = kpiY + kpiH + 22
  const ledgerBoxH = 290
  roundRect(ctx, padX, ledgerBoxY, innerW, ledgerBoxH, 18)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#dce1cf'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#222f23'
  ctx.font = `900 21px ${FONT_FAMILY}`
  ctx.fillText('《算法时间账本》：理想预估 vs 现实耗时', padX + 22, ledgerBoxY + 34)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#6b7562'
  ctx.font = `700 13.5px ${FONT_FAMILY}`
  ctx.fillText(
    summary.ledgerSampleKind === 'completed'
      ? `基于 ${summary.completedCount} 单真实计时`
      : summary.ledgerSampleKind === 'active'
        ? `基于 ${summary.activeCount} 单在途实测`
        : '本局暂未接单',
    padX + innerW - 22,
    ledgerBoxY + 34,
  )
  ctx.textAlign = 'left'

  const barX = padX + 22
  const barW = innerW - 44
  const maxBarSec = Math.max(1, summary.idealTotalSec, summary.actualTotalSec)
  const idealW = Math.max(12, (summary.idealTotalSec / maxBarSec) * barW)
  const actualW = Math.max(12, (summary.actualTotalSec / maxBarSec) * barW)
  const overflowSec = summary.actualTotalSec - summary.idealTotalSec

  // Ideal bar
  ctx.fillStyle = '#2d3a2e'
  ctx.font = `800 15px ${FONT_FAMILY}`
  ctx.fillText('平台理想预估总时长', barX, ledgerBoxY + 74)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#4e6050'
  ctx.fillText(fmtSec(summary.idealTotalSec), barX + barW, ledgerBoxY + 74)
  ctx.textAlign = 'left'

  roundRect(ctx, barX, ledgerBoxY + 88, barW, 28, 8)
  ctx.fillStyle = '#ecefe2'
  ctx.fill()
  if (summary.idealTotalSec > 0.01) {
    roundRect(ctx, barX, ledgerBoxY + 88, idealW, 28, 8)
    ctx.fillStyle = '#638da3'
    ctx.fill()
  }

  // Actual stacked bar
  ctx.fillStyle = '#2d3a2e'
  ctx.font = `800 15px ${FONT_FAMILY}`
  ctx.fillText('现实实际总耗时', barX, ledgerBoxY + 138)
  ctx.textAlign = 'right'
  ctx.fillStyle = overflowSec > 0.1 ? '#b63930' : '#4e6050'
  ctx.fillText(
    `${fmtSec(summary.actualTotalSec)}${overflowSec > 0.1 ? `（超出 +${fmtSec(overflowSec)}）` : ''}`,
    barX + barW,
    ledgerBoxY + 138,
  )
  ctx.textAlign = 'left'

  roundRect(ctx, barX, ledgerBoxY + 152, barW, 30, 8)
  ctx.fillStyle = '#ecefe2'
  ctx.fill()

  if (summary.actualTotalSec > 0.01) {
    ctx.save()
    roundRect(ctx, barX, ledgerBoxY + 152, actualW, 30, 8)
    ctx.clip()
    let segX = barX
    for (const seg of LEDGER_ITEMS) {
      const val = summary.ledger[seg.key]
      if (val <= 0.01) continue
      const w = Math.max(3, (val / summary.actualTotalSec) * actualW)
      ctx.fillStyle = seg.color
      ctx.fillRect(segX, ledgerBoxY + 152, w, 30)
      segX += w
    }
    ctx.restore()
  }

  // 6 项彩色图例（2 行 × 3 列）
  const legStartY = ledgerBoxY + 210
  const colW = barW / 3
  LEDGER_ITEMS.forEach((seg, idx) => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    const lx = barX + col * colW
    const ly = legStartY + row * 34
    const val = summary.ledger[seg.key]
    const pct = summary.actualTotalSec > 0.01 ? Math.round((val / summary.actualTotalSec) * 100) : 0

    ctx.globalAlpha = val > 0.02 ? 1 : 0.45
    roundRect(ctx, lx, ly - 7, 14, 14, 4)
    ctx.fillStyle = seg.color
    ctx.fill()

    ctx.fillStyle = '#384637'
    ctx.font = `700 14.5px ${FONT_FAMILY}`
    ctx.fillText(seg.label, lx + 22, ly)

    ctx.textAlign = 'right'
    ctx.fillStyle = '#222f23'
    ctx.font = `800 14.5px ${FONT_FAMILY}`
    ctx.fillText(`${fmtSec(val)} (${pct}%)`, lx + colW - 18, ly)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
  })

  // 7. “多给 5 分钟”反事实推演金句卡
  const cfBoxY = ledgerBoxY + ledgerBoxH + 22
  const cfBoxH = 296
  roundRect(ctx, padX, cfBoxY, innerW, cfBoxH, 18)
  const cfGrad = ctx.createLinearGradient(padX, cfBoxY, padX, cfBoxY + cfBoxH)
  cfGrad.addColorStop(0, '#fffdf4')
  cfGrad.addColorStop(1, '#fff4d2')
  ctx.fillStyle = cfGrad
  ctx.fill()
  ctx.strokeStyle = '#dfbe67'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#273225'
  ctx.font = `900 21px ${FONT_FAMILY}`
  ctx.fillText(`反事实推演：如果平台每单多给 ${posterBufferMin} 分钟？`, padX + 22, cfBoxY + 34)

  const pillText = `+${posterBufferMin} 分钟（局内 +${cf.extraGameSec.toFixed(1)}s/单）`
  ctx.font = `800 13.5px ${FONT_FAMILY}`
  const pillW = ctx.measureText(pillText).width + 24
  roundRect(ctx, padX + innerW - 22 - pillW, cfBoxY + 18, pillW, 30, 15)
  ctx.fillStyle = '#ffd76a'
  ctx.fill()
  ctx.fillStyle = '#5c3b07'
  ctx.textAlign = 'center'
  ctx.fillText(pillText, padX + innerW - 22 - pillW / 2, cfBoxY + 33)
  ctx.textAlign = 'left'

  // 3 格前后对比卡
  const cfCardY = cfBoxY + 66
  const cfGap = 14
  const cfCardW = (barW - cfGap * 2) / 3
  const cfCardH = 98
  const cfCards = [
    {
      label: '准时率变化',
      from: cf.baselineOnTimeRate !== null ? `${cf.baselineOnTimeRate}%` : '—',
      to: cf.projectedOnTimeRate !== null ? `${cf.projectedOnTimeRate}%` : '—',
      improved: cf.turnedOnTimeOrders > 0,
      note: cf.turnedOnTimeOrders > 0 ? `+${cf.turnedOnTimeOrders} 单转为准时` : '按真实超时重算',
    },
    {
      label: '闯红灯冒险',
      from: `${cf.baselineRedLights}次`,
      to: `${Math.max(0, cf.baselineRedLights - cf.avoidableRedLights)}次`,
      improved: cf.avoidableRedLights > 0,
      note: cf.avoidableRedLights > 0 ? `可少冒 ${cf.avoidableRedLights} 次风险` : cf.baselineRedLights === 0 ? '全程守规零闯灯' : '需更大缓冲空间',
    },
    {
      label: '实得净收入',
      from: fmtMoney(cf.baselineNetIncomeCents),
      to: fmtMoney(cf.projectedNetIncomeCents),
      improved: cf.totalSavedCents > 0,
      note: cf.totalSavedCents > 0 ? `多保住 +${fmtMoney(cf.totalSavedCents)}` : '无额外扣款损失',
    },
  ]

  cfCards.forEach((card, idx) => {
    const x = barX + idx * (cfCardW + cfGap)
    roundRect(ctx, x, cfCardY, cfCardW, cfCardH, 13)
    ctx.fillStyle = card.improved ? '#effaf0' : 'rgba(255,255,255,0.85)'
    ctx.fill()
    ctx.strokeStyle = card.improved ? '#88bd92' : '#e3d9bc'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#5c6856'
    ctx.font = `700 13.5px ${FONT_FAMILY}`
    ctx.fillText(card.label, x + 14, cfCardY + 22)

    ctx.fillStyle = '#6b7766'
    ctx.font = `700 16px ${FONT_FAMILY}`
    const fromText = `${card.from} → `
    ctx.fillText(fromText, x + 14, cfCardY + 54)
    const fromW = ctx.measureText(fromText).width
    ctx.fillStyle = card.improved ? '#1e7443' : '#253326'
    ctx.font = `900 22px ${FONT_FAMILY}`
    ctx.fillText(card.to, x + 14 + fromW, cfCardY + 54)

    ctx.fillStyle = '#5d6958'
    ctx.font = `600 12.5px ${FONT_FAMILY}`
    ctx.fillText(card.note, x + 14, cfCardY + 81)
  })

  // 金句引言盒
  const quoteY = cfCardY + cfCardH + 16
  roundRect(ctx, barX, quoteY, barW, 88, 12)
  ctx.fillStyle = 'rgba(255, 240, 196, 0.72)'
  ctx.fill()
  ctx.fillStyle = '#d99a1e'
  ctx.fillRect(barX, quoteY, 5, 88)

  ctx.fillStyle = '#2a3425'
  ctx.font = `800 16.5px ${FONT_FAMILY}`
  drawWrappedText(ctx, cf.headline, barX + 18, quoteY + 28, barW - 32, 26, 3)

  // 8. 页脚 Hack4Good 结语 + 撕纸锯齿底边
  const footY = cardY + cardH - 54
  ctx.fillStyle = '#4f5d4c'
  ctx.font = `700 14.5px ${FONT_FAMILY}`
  ctx.fillText('多给外卖员 5 分钟，或许就是城市少一次急刹与冒险。', padX, footY)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#7b8571'
  ctx.font = `600 13px ${FONT_FAMILY}`
  ctx.fillText('2026 Hack4Good · 全部数据均来自本局真实骑行账本', padX + innerW, footY)
  ctx.textAlign = 'left'

  // 底部撕纸装饰锯齿
  ctx.fillStyle = '#1d2721'
  drawReceiptTeeth(ctx, cardX, cardY + cardH - 14, cardW, 24, 14)

  return canvas
}

export function downloadSharePosterPng(snapshot: EngineSnapshot, selectedExtraMinutes: number): string {
  const canvas = renderSharePosterCanvas(snapshot, selectedExtraMinutes)
  const dataUrl = canvas.toDataURL('image/png')
  const now = new Date()
  const filename = `rush-hour-rider-bill-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}.png`
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  return filename
}
