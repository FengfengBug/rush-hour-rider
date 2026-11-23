import { useEffect, useRef } from 'react'
import { Flag, Home, Pause, Play, RotateCcw } from 'lucide-react'
import type { EngineSnapshot } from '../game/types'
import './PauseOverlay.css'

interface PauseOverlayProps {
  visible: boolean
  snapshot: EngineSnapshot | null
  onResume: () => void
  onResetView: () => void
  onFinishShift: () => void
  onReturnToTitle: () => void
}

function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

export function PauseOverlay({
  visible,
  snapshot,
  onResume,
  onResetView,
  onFinishShift,
  onReturnToTitle,
}: PauseOverlayProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible) return
    primaryRef.current?.focus({ preventScroll: true })
  }, [visible])

  if (!visible || !snapshot) return null

  const { shift, orders } = snapshot
  const isFreeMode = shift.mode === 'free'
  const clockMeta = isFreeMode ? '自由骑行 · 无班次倒计时' : `剩余 ${formatCountdown(shift.remainingSec)}`
  const completedCount = orders.completed.length
  const activeCount = orders.active.length

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="pause-scrim" aria-hidden="true" />
      <section className="pause-card">
        <div className="pause-top-badge">
          <Pause size={13} aria-hidden="true" />
          <span>ESC · 午高峰已暂停</span>
        </div>

        <header className="pause-header">
          <span className="pause-mark" aria-hidden="true">
            <Pause size={26} fill="currentColor" />
          </span>
          <div>
            <h2 id="pause-title">已暂停</h2>
            <p>
              模拟时钟 <strong>{shift.clockLabel}</strong> · {clockMeta}
            </p>
          </div>
        </header>

        <dl className="pause-stats">
          <div>
            <dt>今日收入</dt>
            <dd>{formatMoney(orders.incomeCents)}</dd>
          </div>
          <div>
            <dt>已完成</dt>
            <dd>{completedCount}<small>单</small></dd>
          </div>
          <div>
            <dt>在途订单</dt>
            <dd>{activeCount}<small>单</small></dd>
          </div>
        </dl>

        <div className="pause-actions">
          <button ref={primaryRef} type="button" className="pause-resume" onClick={onResume}>
            <Play size={18} fill="currentColor" aria-hidden="true" />
            <span>
              <strong>继续骑行</strong>
              <small>时钟、红绿灯与车流从暂停处继续</small>
            </span>
            <kbd>Esc</kbd>
          </button>

          <div className="pause-action-grid">
            <button type="button" className="pause-action" onClick={onResetView}>
              <RotateCcw size={17} aria-hidden="true" />
              <span>
                <strong>重置视角</strong>
                <small>镜头回正并继续骑行</small>
              </span>
            </button>
            <button type="button" className="pause-action" onClick={onFinishShift}>
              <Flag size={17} aria-hidden="true" />
              <span>
                <strong>提前收工</strong>
                <small>查看《算法时间账本》</small>
              </span>
            </button>
            <button type="button" className="pause-action" onClick={onReturnToTitle}>
              <Home size={17} aria-hidden="true" />
              <span>
                <strong>返回主界面</strong>
                <small>切换挑战 / 自由模式</small>
              </span>
            </button>
          </div>
        </div>

        <p className="pause-footnote">暂停期间班次倒计时、订单限时、红绿灯、车流与持续音效均已冻结，恢复后无缝衔接。</p>
      </section>
    </div>
  )
}
