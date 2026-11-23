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

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function PauseOverlay({
  visible,
  snapshot,
  onResume,
  onResetView,
  onFinishShift,
  onReturnToTitle,
}: PauseOverlayProps) {
  const cardRef = useRef<HTMLElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!visible) return
    primaryRef.current?.focus({ preventScroll: true })
    // 简易焦点陷阱：暂停卡打开时 Tab 只在卡内循环，避免焦点跑回 3D 画布或后台按钮。
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !cardRef.current) return
      const focusable = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible])

  if (!visible || !snapshot) return null

  const { shift, orders } = snapshot
  const isFreeMode = shift.mode === 'free'
  const clockMeta = isFreeMode ? '自由骑行 · 无班次倒计时' : `剩余 ${formatCountdown(shift.remainingSec)}`
  const completedCount = orders.completed.length
  const activeCount = orders.active.length
  const rendererLost = snapshot.rendererLost
  const pauseReason = shift.pauseReason
  const badge = pauseReason === 'hidden'
    ? '切换标签页 · 已自动暂停'
    : pauseReason === 'context-lost'
      ? '渲染中断 · 已自动暂停'
      : 'ESC · 午高峰已暂停'
  const footnote = rendererLost
    ? '显卡渲染上下文正在尝试恢复。恢复前计时保持冻结；若长时间无响应，可刷新页面重新开局。'
    : pauseReason === 'hidden'
      ? '检测到页面切到后台，计时已自动冻结。点击「继续骑行」从原处无缝衔接。'
      : pauseReason === 'context-lost'
        ? '渲染上下文恢复后可继续骑行；恢复前班次时钟、订单限时、车流与音效保持冻结。'
        : '暂停期间班次倒计时、订单限时、红绿灯、车流与持续音效均已冻结，恢复后无缝衔接。'

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" aria-describedby="pause-footnote">
      <div className="pause-scrim" aria-hidden="true" />
      <section className="pause-card" ref={cardRef}>
        <div className="pause-top-badge" data-reason={pauseReason ?? 'manual'}>
          <Pause size={13} aria-hidden="true" />
          <span>{badge}</span>
        </div>

        <header className="pause-header">
          <span className="pause-mark" aria-hidden="true">
            <Pause size={26} fill="currentColor" />
          </span>
          <div>
            <h2 id="pause-title">{rendererLost ? '渲染恢复中' : '已暂停'}</h2>
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
          <button
            ref={primaryRef}
            type="button"
            className="pause-resume"
            onClick={onResume}
            disabled={rendererLost}
            title={rendererLost ? '渲染上下文恢复中，请稍候' : '继续骑行（Esc）'}
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
            <span>
              <strong>{rendererLost ? '等待渲染恢复…' : '继续骑行'}</strong>
              <small>{rendererLost ? '恢复后即可继续，计时不会流失' : '时钟、红绿灯与车流从暂停处继续'}</small>
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
            <button type="button" className="pause-action" onClick={onFinishShift} disabled={rendererLost}>
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

        <p className="pause-footnote" id="pause-footnote">{footnote}</p>
      </section>
    </div>
  )
}
