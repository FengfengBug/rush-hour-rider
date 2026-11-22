import { useEffect } from 'react'
import {
  AlertCircle,
  BatteryCharging,
  BatteryWarning,
  Building2,
  CheckCircle2,
  Clock,
  Footprints,
  HeartPulse,
  Info,
  MapPinOff,
  PackageX,
  PhoneCall,
  Store,
  TrafficCone,
  Zap,
} from 'lucide-react'
import type { GameEngine } from '../game/gameEngine'
import type { EngineSnapshot, GameEventKind } from '../game/types'
import './EventModal.css'

interface EventModalProps {
  engine: GameEngine | null
  snapshot: EngineSnapshot | null
}

function EventIcon({ kind }: { kind: GameEventKind }) {
  switch (kind) {
    case 'merchant-backlog':
      return <Store size={16} aria-hidden="true" />
    case 'luxury-compound-no-ebike':
      return <Footprints size={16} aria-hidden="true" />
    case 'cbd-elevator-jam':
      return <Building2 size={16} aria-hidden="true" />
    case 'wrong-pin-address':
      return <MapPinOff size={16} aria-hidden="true" />
    case 'locker-full':
      return <PackageX size={16} aria-hidden="true" />
    case 'addon-order':
      return <Zap size={16} aria-hidden="true" />
  }
}

function formatRemaining(seconds: number): string {
  const late = seconds < -0.0000001
  const whole = Math.ceil(late ? -seconds - 0.0000001 : Math.max(0, seconds))
  const mm = String(Math.floor(whole / 60)).padStart(2, '0')
  const ss = String(whole % 60).padStart(2, '0')
  return `${late ? '已超时 ' : '剩 '}${mm}:${ss}`
}

export function EventModal({ engine, snapshot }: EventModalProps) {
  const active = snapshot?.events.active ?? null
  const incomingCall = snapshot?.events.incomingCall ?? null
  const batterySwap = snapshot?.events.batterySwap ?? null
  const latestOutcome = snapshot?.events.latestOutcome ?? null
  const waitingAtRedLightSec = snapshot?.events.waitingAtRedLightSec ?? 0
  const lowBatteryWarning = snapshot?.events.lowBatteryWarning ?? false
  const staminaExhausted = snapshot?.events.staminaExhausted ?? false
  const sprint = active?.sprint ?? null
  const sprintActive = !!sprint?.active

  useEffect(() => {
    if (!active || !engine) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
      if (sprintActive) {
        if (event.code === 'Space') {
          event.preventDefault()
          event.stopPropagation()
          if (!event.repeat) engine.tapEventSprint()
        }
        return
      }
      if (event.repeat) return
      if (event.code === 'Digit1' || event.code === 'Numpad1') {
        event.preventDefault()
        event.stopPropagation()
        engine.resolveEventChoice(0)
      } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
        event.preventDefault()
        event.stopPropagation()
        engine.resolveEventChoice(1)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, sprintActive, engine])

  if (!active) {
    if (snapshot?.shift.ended || snapshot?.view !== 'ride') return null
    const shifted = snapshot?.distraction.active ?? false

    if (incomingCall) {
      const progress = Math.max(0, Math.min(100, (incomingCall.remainingSec / incomingCall.durationSec) * 100))
      return (
        <div className="event-outcome-slot event-outcome-slot--interactive" data-shifted={shifted} role="region" aria-label="顾客催单来电">
          <div className="incoming-call-bar">
            <div className="incoming-call-head">
              <span className="incoming-call-badge">
                <PhoneCall size={14} aria-hidden="true" />
                顾客催单来电 · {incomingCall.orderId}
              </span>
              <span className="incoming-call-meta">
                {incomingCall.deliveryName} · {Math.ceil(incomingCall.remainingSec)}s
              </span>
            </div>
            <p className="incoming-call-quote">“师傅请问餐还有多久到呀？午休快结束了麻烦快一点～”</p>
            <div className="incoming-call-actions">
              <button type="button" className="incoming-call-btn" data-tone="good" onClick={() => engine?.resolveIncomingCall(0)}>
                <kbd>1</kbd> 诚恳道歉安抚 <em>信誉+2%</em>
              </button>
              <button type="button" className="incoming-call-btn" data-tone="neutral" onClick={() => engine?.resolveIncomingCall(1)}>
                <kbd>2</kbd> {incomingCall.hasMerchantDelay ? '说明商家卡餐' : '说明正在赶路'} <em>{incomingCall.hasMerchantDelay ? '信誉+1%' : '理解'}</em>
              </button>
              <button type="button" className="incoming-call-btn" data-tone="risk" onClick={() => engine?.resolveIncomingCall(2)}>
                <kbd>3</kbd> 静音专注骑行 <em>信誉-3%</em>
              </button>
            </div>
            <div className="incoming-call-track" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )
    }

    if (batterySwap) {
      const swapPercent = Math.round(batterySwap.progress * 100)
      return (
        <div className="event-outcome-slot" data-shifted={shifted} role="status" aria-live="polite">
          <div className="battery-swap-card" data-full={batterySwap.alreadyFull}>
            <span className="battery-swap-icon" aria-hidden="true">
              <BatteryCharging size={18} />
            </span>
            <div className="battery-swap-copy">
              <div className="battery-swap-head">
                <strong>
                  {batterySwap.alreadyFull
                    ? `${batterySwap.stationName} · 当前电量充足`
                    : `正在换电 · ${batterySwap.stationName}`}
                </strong>
                <span>{batterySwap.alreadyFull ? '无需换电' : `${swapPercent}% · ¥${(batterySwap.feeCents / 100).toFixed(2)}`}</span>
              </div>
              {!batterySwap.alreadyFull && (
                <div className="battery-swap-track" aria-hidden="true">
                  <span style={{ width: `${swapPercent}%` }} />
                </div>
              )}
              <small>
                {batterySwap.alreadyFull
                  ? '电量已高于 98%，可直接出发配送'
                  : '保持停车 3 秒自动换满电电池（移动即取消）'}
              </small>
            </div>
          </div>
        </div>
      )
    }

    if (latestOutcome) {
      return (
        <div
          className="event-outcome-slot"
          data-shifted={shifted}
          role="status"
          aria-live="polite"
        >
          <div className="event-outcome-toast" data-tone={latestOutcome.tone}>
            <span className="event-outcome-icon" aria-hidden="true">
              {latestOutcome.tone === 'good' ? (
                <CheckCircle2 size={16} />
              ) : latestOutcome.tone === 'warn' ? (
                <AlertCircle size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <div className="event-outcome-copy">
              <strong>{latestOutcome.title}</strong>
              <span>{latestOutcome.summary}</span>
            </div>
          </div>
        </div>
      )
    }

    if (lowBatteryWarning || staminaExhausted || waitingAtRedLightSec >= 0.4) {
      const mode = lowBatteryWarning ? 'battery' : staminaExhausted ? 'stamina' : 'redlight'
      return (
        <div className="event-outcome-slot" data-shifted={shifted} role="status" aria-live="polite">
          <div className="live-status-pill" data-mode={mode}>
            {mode === 'battery' ? (
              <>
                <BatteryWarning size={15} aria-hidden="true" />
                <span>电量低于 20% 已限速 · 请就近前往蓝色换电柜换电</span>
              </>
            ) : mode === 'stamina' ? (
              <>
                <HeartPulse size={15} aria-hidden="true" />
                <span>体力透支（步行/冲刺变慢）· 停车片刻可快速恢复</span>
              </>
            ) : (
              <>
                <TrafficCone size={15} aria-hidden="true" />
                <span>红灯安全等待中 {Math.floor(waitingAtRedLightSec)}s · 宁等三秒不抢一秒</span>
              </>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  const order = snapshot?.orders.active.find((entry) => entry.id === active.orderId)
  const orderRemaining = order && snapshot ? order.deadline - snapshot.orders.elapsedSec : null
  const sprintProgress = sprint ? Math.min(100, (sprint.taps / Math.max(1, sprint.targetTaps)) * 100) : 0

  return (
    <div className="event-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
      <section className="event-card" data-kind={active.kind}>
        <header className="event-card-top">
          <span className="event-badge">
            <EventIcon kind={active.kind} />
            {active.badge}
          </span>
          {orderRemaining !== null && (
            <span className="event-order-clock" data-critical={orderRemaining < 30}>
              <Clock size={12} aria-hidden="true" />
              {active.orderId} · {formatRemaining(orderRemaining)}
            </span>
          )}
        </header>

        <h2 id="event-modal-title" className="event-title">{active.title}</h2>
        <p className="event-desc">{active.description}</p>
        <p className="event-rule-note">
          {active.kind === 'addon-order'
            ? '车辆已自动刹停防剐蹭 · 可按需决定是否接下本单'
            : '车辆已自动刹停防剐蹭 · 所选耗时将真实写入本单时间账本'}
        </p>

        {sprintActive && sprint ? (
          <div className="event-sprint-box">
            <div className="event-sprint-head">
              <span>
                <Footprints size={15} aria-hidden="true" />
                步行冲刺进度 <strong>{sprint.taps} / {sprint.targetTaps}</strong>
              </span>
              <span className="event-sprint-timer" data-urgent={sprint.remainingSec <= 1}>
                {sprint.remainingSec.toFixed(1)} s
              </span>
            </div>
            <div className="event-sprint-track" aria-hidden="true">
              <span style={{ width: `${sprintProgress}%` }} />
            </div>
            <button
              type="button"
              className="event-sprint-btn"
              onClick={() => engine?.tapEventSprint()}
            >
              <Zap size={17} aria-hidden="true" />
              连按 <kbd>Space</kbd> 奔跑冲刺！（或点击加速）
            </button>
            <p className="event-sprint-hint">
              3 秒内按满 {sprint.targetTaps} 次可压到 8 秒送达，未按满则按实际步速结算。
            </p>
          </div>
        ) : (
          <div className="event-options" role="group" aria-label="现场处理方案">
            {active.options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className="event-option-btn"
                data-tone={option.tone}
                onClick={() => engine?.resolveEventChoice(index as 0 | 1)}
              >
                <span className="event-option-head">
                  <kbd className="event-keycap">{option.keyHint}</kbd>
                  <strong>{option.label}</strong>
                </span>
                <span className="event-option-summary">{option.summary}</span>
                <span className="event-option-tags">
                  {option.tags.map((tag) => (
                    <span key={tag} className="event-tag">{tag}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
