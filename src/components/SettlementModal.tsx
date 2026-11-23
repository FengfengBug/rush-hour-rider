import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Award,
  Check,
  Clock,
  Download,
  Flag,
  Home,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react'
import {
  buildShiftSummary,
  evaluateCounterfactual,
  SIM_SECONDS_PER_REAL_MINUTE,
} from '../game/counterfactual'
import type { EngineSnapshot, OrderTimeLedger } from '../game/types'
import { CITY_LAYOUT } from '../game/cityLayout'
import { downloadSharePosterPng } from './sharePoster'
import './SettlementModal.css'

interface SettlementModalProps {
  visible: boolean
  snapshot: EngineSnapshot | null
  canResume?: boolean
  onResume?: () => void
  onRestart: () => void
  onReturnToTitle: () => void
}

const LEDGER_SEGMENTS: { key: keyof OrderTimeLedger; label: string; color: string }[] = [
  { key: 'ridingSec', label: '正常骑行', color: '#478f67' },
  { key: 'trafficWaitSec', label: '等红灯', color: '#d85f49' },
  { key: 'merchantDelaySec', label: '商家卡餐', color: '#e6a530' },
  { key: 'lastMileSec', label: '进楼/门禁/拍照', color: '#4f7ea8' },
  { key: 'detourSec', label: '绕路/改址', color: '#9462a3' },
  { key: 'idleSec', label: '普通停车', color: '#96a092' },
]

const PRESET_MINUTES = [0, 3, 5, 8] as const
const LANDMARK_NAMES = new Map(CITY_LAYOUT.landmarks.map(({ id, name }) => [id, name]))

function fmtMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

function fmtSec(sec: number): string {
  return `${sec.toFixed(1)}s`
}

export function SettlementModal({
  visible,
  snapshot,
  canResume = false,
  onResume,
  onRestart,
  onReturnToTitle,
}: SettlementModalProps) {
  const [extraMinutes, setExtraMinutes] = useState<number>(0)
  const [exportedLabel, setExportedLabel] = useState<string | null>(null)

  const summary = useMemo(
    () => (snapshot ? buildShiftSummary(snapshot) : null),
    [snapshot],
  )
  const cf = useMemo(
    () => (snapshot ? evaluateCounterfactual(snapshot, extraMinutes) : null),
    [snapshot, extraMinutes],
  )

  if (!visible || !snapshot || !summary || !cf) return null

  function handleDownloadPoster() {
    if (!snapshot) return
    const filename = downloadSharePosterPng(snapshot, extraMinutes)
    setExportedLabel(`已导出 ${filename}`)
    window.setTimeout(() => setExportedLabel(null), 3200)
  }

  const maxBarSec = Math.max(1, summary.idealTotalSec, summary.actualTotalSec)
  const idealBarPct = Math.min(100, (summary.idealTotalSec / maxBarSec) * 100)
  const actualBarPct = Math.min(100, (summary.actualTotalSec / maxBarSec) * 100)
  const overflowSec = summary.actualTotalSec - summary.idealTotalSec

  return (
    <div className="settlement-backdrop" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
      <article className="settlement-sheet">
        <header className="settlement-header">
          <div className="settlement-title-block">
            <span className="settlement-eyebrow">
              <Flag size={13} aria-hidden="true" />
              {snapshot.shift.mode === 'free' ? '自由骑行 · 阶段结算' : `${snapshot.shift.clockLabel} 午高峰收工 · 算法时间账本`}
            </span>
            <div className="settlement-badge-row">
              <h2 id="settlement-title" className="settlement-rider-title">
                <Award size={22} aria-hidden="true" />
                {summary.badge.title}
              </h2>
              <span className="settlement-rider-tag">{summary.badge.tag}</span>
            </div>
            <p className="settlement-rider-reason">{summary.badge.reason}</p>
          </div>

          <div className="settlement-income-hero">
            <span className="settlement-income-label">本班次净到手</span>
            <strong className="settlement-income-amount">{fmtMoney(summary.netIncomeCents)}</strong>
            <span className="settlement-income-sub">
              毛收入 {fmtMoney(summary.grossCents)} · 扣款/支出 −{fmtMoney(summary.totalDeductionsCents)}
            </span>
          </div>
        </header>

        <section className="settlement-kpis" aria-label="今日核心战绩">
          <div className="settlement-kpi">
            <span>完成单数</span>
            <strong>
              {summary.completedCount} <small>单</small>
            </strong>
            <em>{summary.activeCount > 0 ? `另有 ${summary.activeCount} 单在途` : `准时 ${summary.onTimeCount} · 超时 ${summary.lateCount}`}</em>
          </div>
          <div className="settlement-kpi" data-warn={summary.onTimeRate !== null && summary.onTimeRate < 80}>
            <span>准时率</span>
            <strong>{summary.onTimeRate !== null ? `${summary.onTimeRate}%` : '—'}</strong>
            <em>{summary.completedCount > 0 ? `${summary.onTimeCount} / ${summary.completedCount} 单准时` : '尚无完单记录'}</em>
          </div>
          <div className="settlement-kpi" data-warn={summary.redLightCount > 0 || summary.reputation < 85}>
            <span>安全与信誉</span>
            <strong>{summary.reputation}%</strong>
            <em>闯红灯 {summary.redLightCount} 次 · 碰撞 {summary.collisionCount} 次</em>
          </div>
          <div className="settlement-kpi">
            <span>非骑行时间占比</span>
            <strong>{summary.actualTotalSec > 0.01 ? `${summary.nonRidingSharePct}%` : '—'}</strong>
            <em>
              {summary.actualTotalSec > 0.01
                ? `等灯/卡餐/末端 ${fmtSec(summary.nonRidingSec)}`
                : '接单后自动统计'}
            </em>
          </div>
        </section>

        <section className="settlement-panel" aria-label="算法时间账本拆解">
          <div className="settlement-panel-head">
            <h3>
              <Clock size={16} aria-hidden="true" />
              《算法时间账本》：理想预估 vs 现实耗时
            </h3>
            <span className="settlement-panel-meta">
              {summary.ledgerSampleKind === 'completed'
                ? `基于本局 ${summary.completedCount} 笔已完成订单真实计时`
                : summary.ledgerSampleKind === 'active'
                  ? `基于当前 ${summary.activeCount} 笔在途订单实测计时`
                  : '本局暂未接单'}
            </span>
          </div>

          {summary.ledgerSampleKind === 'empty' ? (
            <p className="settlement-empty">
              本局尚未接取订单。下一局按 <kbd>Tab</kbd> 抢下订单并完成配送后，这里会完整拆解「正常骑行、等红灯、商家卡餐、进楼/门禁与绕路」各自吞噬了多少秒。
            </p>
          ) : (
            <div className="ledger-bars">
              <div className="ledger-row">
                <div className="ledger-row-label">
                  <strong>平台理想预估</strong>
                  <span>{fmtSec(summary.idealTotalSec)}</span>
                </div>
                <div className="ledger-track">
                  <div className="ledger-ideal-fill" style={{ width: `${idealBarPct}%` }}>
                    <span>算法按直线距离划定的理想时限</span>
                  </div>
                </div>
              </div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <strong>累计每单配送时长</strong>
                  <span data-over={overflowSec > 0.1}>
                    {fmtSec(summary.actualTotalSec)}
                    {overflowSec > 0.1 ? `（超出 +${fmtSec(overflowSec)}）` : ''}
                  </span>
                </div>
                <div className="ledger-track">
                  <div className="ledger-actual-stack" style={{ width: `${actualBarPct}%` }}>
                    {LEDGER_SEGMENTS.map(({ key, label, color }) => {
                      const val = summary.ledger[key]
                      if (val <= 0.02 || summary.actualTotalSec <= 0.01) return null
                      const share = (val / summary.actualTotalSec) * 100
                      return (
                        <span
                          key={key}
                          className="ledger-segment"
                          style={{ width: `${share}%`, backgroundColor: color }}
                          title={`${label}：${fmtSec(val)}（占现实耗时 ${Math.round(share)}%）`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="ledger-legend">
                {LEDGER_SEGMENTS.map(({ key, label, color }) => {
                  const val = summary.ledger[key]
                  const pct = summary.actualTotalSec > 0.01 ? Math.round((val / summary.actualTotalSec) * 100) : 0
                  return (
                    <div key={key} className="ledger-legend-item" data-zero={val <= 0.02}>
                      <i style={{ backgroundColor: color }} aria-hidden="true" />
                      <span>{label}</span>
                      <strong>{fmtSec(val)}</strong>
                      <small>{pct}%</small>
                    </div>
                  )
                })}
              </div>

              <p className="ledger-note">
                本局 210 秒模拟现实午高峰 120 分钟；每单从接单起独立计时，多单并行时同一秒会同时记入多单，因此「逐单相加」会大于班次总时长。
              </p>

              {summary.completedCount > 0 && (
                <details className="ledger-orders">
                  <summary>逐单明细 · {summary.completedCount} 单</summary>
                  <ul>
                    {snapshot.orders.completed.map((order) => {
                      const top = LEDGER_SEGMENTS
                        .filter(({ key }) => key !== 'ridingSec')
                        .map(({ key, label }) => ({ label, value: order.ledger[key] }))
                        .sort((a, b) => b.value - a.value)[0]
                      const settlement = order.settlement
                      const onTime = settlement?.onTime ?? false
                      const lateSec = settlement?.lateSec ?? 0
                      const marginSec = order.deadline - (order.completedAt ?? order.acceptedAt)
                      return (
                        <li key={order.id}>
                          <div className="ledger-order-head">
                            <strong>{order.id}</strong>
                            <span>{LANDMARK_NAMES.get(order.deliveryId) ?? order.deliveryId}</span>
                          </div>
                          <div className="ledger-order-metrics">
                            <span>平台 {order.idealSec}s</span>
                            <span data-late={!onTime}>现实 {order.actualSec.toFixed(1)}s</span>
                            <span data-late={!onTime}>
                              {onTime ? `准时 · 余 ${Math.max(0, marginSec).toFixed(1)}s` : `超时 ${lateSec.toFixed(1)}s`}
                            </span>
                          </div>
                          <small>
                            {top && top.value > 0.05
                              ? `最大耗时：${top.label} ${top.value.toFixed(1)}s`
                              : '全程骑行，无额外时间损耗'}
                          </small>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        <section className="settlement-panel settlement-panel--cf" aria-label="多给 5 分钟反事实推演">
          <div className="settlement-panel-head">
            <h3>
              <SlidersHorizontal size={16} aria-hidden="true" />
              反事实推演：如果平台每单多给一点缓冲时间？
            </h3>
            <span className="cf-buffer-pill" data-active={extraMinutes > 0}>
              +{extraMinutes} 分钟（局内 +{cf.extraGameSec.toFixed(1)}s / 单）
            </span>
          </div>

          <div className="cf-controls">
            <input
              type="range"
              min={0}
              max={8}
              step={1}
              value={extraMinutes}
              aria-label="每单增加缓冲分钟数"
              className="cf-slider"
              onChange={(e) => setExtraMinutes(Number(e.target.value))}
            />
            <div className="cf-presets" role="group" aria-label="快捷缓冲档位">
              {PRESET_MINUTES.map((min) => (
                <button
                  key={min}
                  type="button"
                  className="cf-preset-btn"
                  data-active={extraMinutes === min}
                  data-featured={min === 5}
                  onClick={() => setExtraMinutes(min)}
                >
                  {min === 0 ? '原算法 (+0分)' : min === 5 ? '多给 5 分钟 ★' : `+${min} 分钟`}
                </button>
              ))}
            </div>
          </div>

          <div className="cf-cards">
            <div className="cf-card" data-improved={cf.turnedOnTimeOrders > 0}>
              <span className="cf-card-label">
                <TrendingUp size={14} aria-hidden="true" />
                准时率变化
              </span>
              <div className="cf-compare">
                <span>{cf.baselineOnTimeRate !== null ? `${cf.baselineOnTimeRate}%` : '—'}</span>
                <ArrowRight size={14} aria-hidden="true" />
                <strong>{cf.projectedOnTimeRate !== null ? `${cf.projectedOnTimeRate}%` : '—'}</strong>
              </div>
              <small>
                {cf.turnedOnTimeOrders > 0
                  ? `${cf.turnedOnTimeOrders} 笔超时单转为准时`
                  : cf.sampleKind === 'completed'
                    ? '本局已无额外可转准时单'
                    : '完单后按真实超时秒数重算'}
              </small>
            </div>

            <div className="cf-card" data-improved={cf.avoidableRedLights > 0}>
              <span className="cf-card-label">
                <ShieldCheck size={14} aria-hidden="true" />
                可免闯红灯冒险
              </span>
              <div className="cf-compare">
                <span>{cf.baselineRedLights} 次</span>
                <ArrowRight size={14} aria-hidden="true" />
                <strong>{Math.max(0, cf.baselineRedLights - cf.avoidableRedLights)} 次</strong>
              </div>
              <small>
                {cf.avoidableRedLights > 0
                  ? `本可少冒 ${cf.avoidableRedLights} 次抢灯风险`
                  : cf.baselineRedLights === 0
                    ? '本局全程遵守红绿灯'
                    : '增加缓冲即可覆盖路口等灯'}
              </small>
            </div>

            <div className="cf-card" data-improved={cf.totalSavedCents > 0}>
              <span className="cf-card-label">
                <Award size={14} aria-hidden="true" />
                净收入保住
              </span>
              <div className="cf-compare">
                <span>{fmtMoney(cf.baselineNetIncomeCents)}</span>
                <ArrowRight size={14} aria-hidden="true" />
                <strong>{fmtMoney(cf.projectedNetIncomeCents)}</strong>
              </div>
              <small>
                {cf.totalSavedCents > 0
                  ? `多保住 +${fmtMoney(cf.totalSavedCents)}（含准时奖/免扣款）`
                  : '无超时或违章扣款损失'}
              </small>
            </div>
          </div>

          <p className="cf-headline">{cf.headline}</p>
          {cf.tightestOrderId && (
            <p className="cf-tightest">
              最脆弱的一单 <strong>{cf.tightestOrderId}</strong>：
              {cf.tightestMarginSec >= 0
                ? `距超时只剩 ${fmtSec(cf.tightestMarginSec)} 缓冲`
                : `已超时 ${fmtSec(Math.abs(cf.tightestMarginSec))}`}
              {extraMinutes > 0
                ? `；每单多给 ${extraMinutes} 分钟 → ${
                  cf.projectedTightestMarginSec >= 0
                    ? `缓冲变为 ${fmtSec(cf.projectedTightestMarginSec)}`
                    : `仍超时 ${fmtSec(Math.abs(cf.projectedTightestMarginSec))}`
                }`
                : '；拖动滑块看看它能多出多少缓冲'}
              。
            </p>
          )}
          <p className="cf-footnote">
            数据口径：以上全部指标均基于你本局真实订单账本与违章记录动态重算（非预设数据）；按本局 3.5 分钟模拟午高峰刻度，现实每 +1 分钟缓冲 = 局内每单 +{SIM_SECONDS_PER_REAL_MINUTE} 秒。
          </p>
        </section>

        <footer className="settlement-footer">
          <div className="settlement-footer-left">
            <button type="button" className="settlement-btn settlement-btn--ghost" onClick={onReturnToTitle}>
              <Home size={15} aria-hidden="true" />
              返回主界面
            </button>
            {canResume && onResume && (
              <button type="button" className="settlement-btn settlement-btn--ghost" onClick={onResume}>
                继续当前局
              </button>
            )}
          </div>
          <div className="settlement-footer-right">
            <button
              type="button"
              className="settlement-btn settlement-btn--poster"
              data-exported={exportedLabel !== null}
              onClick={handleDownloadPoster}
              title="使用本机纯 Canvas 2D 生成 900×1200 高清骑手账单海报 PNG"
            >
              {exportedLabel ? <Check size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
              {exportedLabel ? '已保存战报 PNG' : '下载今日骑手账单海报'}
            </button>
            <button type="button" className="settlement-btn settlement-btn--primary" onClick={onRestart}>
              <RotateCcw size={15} aria-hidden="true" />
              再来一局
            </button>
          </div>
        </footer>
      </article>
    </div>
  )
}
