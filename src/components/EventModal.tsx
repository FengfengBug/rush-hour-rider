import { useEffect } from 'react'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Footprints,
  Info,
  MapPinOff,
  PackageX,
  Store,
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
    case 'old-estate-no-ebike':
      return <Footprints size={16} aria-hidden="true" />
    case 'cbd-elevator-jam':
      return <Building2 size={16} aria-hidden="true" />
    case 'wrong-pin-address':
      return <MapPinOff size={16} aria-hidden="true" />
    case 'locker-full':
      return <PackageX size={16} aria-hidden="true" />
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
  const latestOutcome = snapshot?.events.latestOutcome ?? null
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
    if (!latestOutcome || snapshot?.shift.ended) return null
    return (
      <div
        className="event-outcome-slot"
        data-shifted={snapshot?.distraction.active ?? false}
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
        <p className="event-rule-note">车辆已自动刹停防剐蹭 · 所选耗时将真实写入本单时间账本</p>

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
