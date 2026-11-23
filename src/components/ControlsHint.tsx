import { useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import type { EngineSnapshot } from '../game/types'
import './ControlsHint.css'

interface ControlsHintProps {
  snapshot: EngineSnapshot | null
}

export function ControlsHint({ snapshot }: ControlsHintProps) {
  const [dismissedShiftId, setDismissedShiftId] = useState<number | null>(null)

  if (!snapshot) return null
  const { shift, orders, view, interior, events } = snapshot
  if (!shift.started || shift.ended || view !== 'ride' || interior.mode !== 'none' || events.active) {
    return null
  }
  if (dismissedShiftId === orders.shiftId) return null

  const completedFirst = orders.completed.length > 0
  const pickedUp = completedFirst || orders.active.some((o) => o.status === 'delivery')
  const accepted = pickedUp || orders.active.length > 0
  const phoneOpen = snapshot.distraction.phoneOpen

  // 完成首单后自动隐藏（保留 3 秒成就感），或超过 40 秒且已进入配送循环后自动收起
  if (completedFirst && orders.completed[0]?.completedAt !== null && orders.elapsedSec - (orders.completed[0]?.completedAt ?? 0) > 3.5) {
    return null
  }
  if (!completedFirst && shift.elapsedSec > 45) return null

  const stepIndex = completedFirst ? 3 : pickedUp ? 2 : accepted ? 1 : 0
  const nextCue = completedFirst
    ? '首单送达完成！继续抢单挑战午高峰，或点击右上角随时切换晴雨'
    : pickedUp
      ? '跟随绿色光柱与路面箭头送达顾客（CBD/医院门口按 E 进大堂拍照）'
      : accepted
        ? '已接单！跟随橙色光柱骑往商家取餐，WASD 控制方向、Shift 加速'
        : phoneOpen
          ? '点击手机里的「一键抢单」接下第一单；建议先跑 1 单熟悉路线'
          : '按 Tab 展开右下角骑手手机，在「抢单大厅」抢下你的第一单'

  const steps = [
    { label: '按 Tab 抢第一单', done: accepted, current: stepIndex === 0 },
    { label: '跟橙柱取餐', done: pickedUp, current: stepIndex === 1 },
    { label: '跟绿柱送达', done: completedFirst, current: stepIndex === 2 },
  ]

  return (
    <aside className="controls-hint" role="status" aria-live="polite" aria-label="新手快速引导">
      <div className="controls-hint-row">
        <div className="controls-hint-steps">
          {steps.map((step, idx) => (
            <span key={step.label} className="controls-hint-step" data-done={step.done} data-current={step.current}>
              <i className="controls-hint-dot" aria-hidden="true">
                {step.done ? <Check size={10} strokeWidth={3} /> : idx + 1}
              </i>
              {step.label}
              {idx < steps.length - 1 && <ChevronRight size={12} className="controls-hint-sep" aria-hidden="true" />}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="controls-hint-close"
          aria-label="关闭新手引导"
          title="关闭引导"
          onClick={() => setDismissedShiftId(orders.shiftId)}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <p className="controls-hint-cue">{nextCue}</p>
    </aside>
  )
}
