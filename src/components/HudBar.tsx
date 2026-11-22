import {
  AlertTriangle,
  BatteryCharging,
  Bike,
  Clock,
  CloudRain,
  Eye,
  Flag,
  HeartPulse,
  RotateCcw,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { MAX_ACTIVE_ORDERS } from '../game/orderManager'
import type { EngineSnapshot, RideCameraMode } from '../game/types'
import './HudBar.css'

interface HudBarProps {
  snapshot: EngineSnapshot | null
  muted: boolean
  onCycleCamera: () => void
  onToggleWeather: () => void
  onToggleMute: () => void
  onResetRider: () => void
}

const CAMERA_LABELS: Record<RideCameraMode, string> = {
  near: '近距',
  far: '远距',
  overhead: '俯视',
}

function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function formatMoney(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

export function HudBar({
  snapshot,
  muted,
  onCycleCamera,
  onToggleWeather,
  onToggleMute,
  onResetRider,
}: HudBarProps) {
  const shift = snapshot?.shift
  const rider = snapshot?.rider
  const orders = snapshot?.orders
  const distraction = snapshot?.distraction
  const traffic = snapshot?.traffic
  const weather = snapshot?.weather
  const cameraMode = snapshot?.cameraMode ?? 'near'
  const raining = weather?.raining ?? false

  const completed = orders?.completed ?? []
  const completedCount = completed.length
  const activeCount = orders?.active.length ?? 0
  const onTimeCount = completed.filter((order) => order.settlement?.onTime).length
  const onTimeRate = completedCount > 0 ? Math.round((onTimeCount / completedCount) * 100) : null
  const reputation = snapshot?.events.reputation ?? 100

  const battery = rider ? Math.max(0, Math.min(100, rider.battery)) : 100
  const stamina = rider ? Math.max(0, Math.min(100, rider.stamina)) : 100
  const shiftProgress = shift && shift.durationSec > 0
    ? Math.max(0, Math.min(100, (shift.elapsedSec / shift.durationSec) * 100))
    : 0
  const clockUrgent = !!shift && !shift.ended && shift.remainingSec <= 30

  return (
    <div className="hud-top-stack">
      <header className="hud-bar" aria-label="午高峰顶部状态栏">
        <div className="hud-brand">
          <span className="hud-brand-icon" aria-hidden="true">
            <Bike size={20} />
          </span>
          <div className="hud-brand-copy">
            <h1>午高峰</h1>
            <p>RUSH HOUR RIDER</p>
          </div>
        </div>

        <div className="hud-metrics" role="group" aria-label="班次与骑手状态">
          <div
            className="hud-metric hud-metric--clock"
            data-urgent={clockUrgent}
            data-ended={shift?.ended ?? false}
            title={shift ? `午高峰模拟时段 11:30 → 13:30（本局总长 3.5 分钟，已用 ${Math.floor(shift.elapsedSec)} 秒）` : '午高峰模拟时钟'}
          >
            <div className="hud-clock-row">
              <Clock size={14} aria-hidden="true" />
              <strong className="hud-clock-time">{shift?.clockLabel ?? '11:30'}</strong>
              <span className="hud-clock-rem">
                {shift?.ended ? '已收工' : `剩 ${formatCountdown(shift?.remainingSec ?? 210)}`}
              </span>
            </div>
            <div className="hud-progress-track" aria-hidden="true">
              <span style={{ width: `${shiftProgress}%` }} />
            </div>
          </div>

          <div className="hud-metric hud-metric--income" title="本班次已结算净收入">
            <span className="hud-label">今日收入</span>
            <strong className="hud-value hud-value--money">{orders ? formatMoney(orders.incomeCents) : '¥0.00'}</strong>
          </div>

          <div className="hud-metric hud-metric--orders" title={`已完成 ${completedCount} 单，当前在途 ${activeCount}/${MAX_ACTIVE_ORDERS} 单`}>
            <span className="hud-label">完成单数</span>
            <strong className="hud-value">
              {completedCount}
              <small>单</small>
              {activeCount > 0 && <em className="hud-active-pill">在途 {activeCount}/{MAX_ACTIVE_ORDERS}</em>}
            </strong>
          </div>

          <div
            className="hud-metric hud-metric--ontime"
            data-low={onTimeRate !== null && onTimeRate < 80}
            title={completedCount > 0 ? `准时 ${onTimeCount} / ${completedCount} 单` : '完成首单后统计准时率'}
          >
            <span className="hud-label">准时率</span>
            <strong className="hud-value">{onTimeRate !== null ? `${onTimeRate}%` : '—'}</strong>
          </div>

          <div
            className="hud-metric hud-metric--reputation"
            data-low={reputation < 80}
            title={`骑手信誉 ${reputation}%（安抚催单/好评加分，闯红灯/差评/转单扣分）`}
          >
            <span className="hud-label">信誉</span>
            <strong className="hud-value">{reputation}%</strong>
          </div>

          <div
            className="hud-meter"
            data-kind="battery"
            data-low={battery <= 20}
            title={`电动车剩余电量 ${battery.toFixed(1)}%`}
          >
            <div className="hud-meter-head">
              <span><BatteryCharging size={13} aria-hidden="true" />电量</span>
              <strong>{rider ? `${Math.round(battery)}%` : '—'}</strong>
            </div>
            <div className="hud-meter-track" aria-hidden="true">
              <span style={{ width: `${battery}%` }} />
            </div>
          </div>

          <div
            className="hud-meter"
            data-kind="stamina"
            data-low={stamina <= 25}
            title={`骑手剩余体力 ${stamina.toFixed(1)}%（停车可缓慢恢复）`}
          >
            <div className="hud-meter-head">
              <span><HeartPulse size={13} aria-hidden="true" />体力</span>
              <strong>{rider ? `${Math.round(stamina)}%` : '—'}</strong>
            </div>
            <div className="hud-meter-track" aria-hidden="true">
              <span style={{ width: `${stamina}%` }} />
            </div>
          </div>
        </div>

        <div className="hud-actions" role="group" aria-label="天气、视角与音效控制">
          <button
            className="hud-action-btn hud-action-btn--weather"
            type="button"
            disabled={!snapshot}
            data-raining={raining}
            title={raining ? '当前午后阵雨（路面湿滑 · 送达自动附加雨天补贴 +¥2.00），点击可切换晴天' : '当前晴朗微风（班次中段自动触发阵雨），点击可手动切换阵雨'}
            aria-label={raining ? '切换为晴天' : '切换为阵雨天气'}
            onClick={(event) => {
              onToggleWeather()
              if (event.detail > 0) (event.currentTarget as HTMLButtonElement).blur()
            }}
          >
            {raining ? <CloudRain size={14} aria-hidden="true" /> : <Sun size={14} aria-hidden="true" />}
            <span>{raining ? '阵雨 +¥2' : '晴朗'}</span>
          </button>

          <button
            className="hud-action-btn"
            type="button"
            disabled={!snapshot}
            title="切换第三人称骑行视角（快捷键 C）"
            aria-label={`切换骑行视角，当前为${CAMERA_LABELS[cameraMode]}`}
            onClick={onCycleCamera}
          >
            <Eye size={14} aria-hidden="true" />
            <span>{CAMERA_LABELS[cameraMode]}</span>
          </button>

          <button
            className="hud-action-btn"
            type="button"
            aria-pressed={muted}
            title={muted ? '已静音（点击开启；Task 3.4 将接入合成音效）' : '音效已开启（点击静音；Task 3.4 将接入合成音效）'}
            aria-label={muted ? '取消静音' : '静音'}
            onClick={(event) => {
              onToggleMute()
              if (event.detail > 0) (event.currentTarget as HTMLButtonElement).blur()
            }}
          >
            {muted ? <VolumeX size={14} aria-hidden="true" /> : <Volume2 size={14} aria-hidden="true" />}
            <span>{muted ? '静音' : '音效'}</span>
          </button>
        </div>
      </header>

      {distraction?.active && !shift?.ended && (
        <div className="hud-alert-slot">
          <div className="distraction-alert" role="alert">
            <span className="distraction-alert-icon" aria-hidden="true">
              <AlertTriangle size={18} />
            </span>
            <div className="distraction-alert-copy">
              <strong>边骑边看手机，注意前方路况！</strong>
              <span>转向变迟钝 · 碰撞风险升高 · 减速停车或按 <kbd>Tab</kbd> 收起</span>
            </div>
          </div>
        </div>
      )}

      {shift?.ended && (
        <div className="hud-alert-slot">
          <div className="shift-ended-banner" role="status" aria-live="polite">
            <span className="shift-ended-icon" aria-hidden="true">
              <Flag size={18} />
            </span>
            <div className="shift-ended-copy">
              <strong>13:30 午高峰班次结束</strong>
              <span>
                完成 {completedCount} 单 · 准时率 {onTimeRate !== null ? `${onTimeRate}%` : '—'} · 实得 {orders ? formatMoney(orders.incomeCents) : '¥0.00'}
                {traffic ? ` · 闯红灯 ${traffic.redLightCount} 次 · 碰撞 ${traffic.collisionCount} 次` : ''}
              </span>
            </div>
            <button className="shift-ended-restart" type="button" onClick={onResetRider}>
              <RotateCcw size={14} aria-hidden="true" />
              重新开工
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
