import { useEffect, useState } from 'react'
import { Bike, Compass, Play, Smartphone, Sparkles, Timer } from 'lucide-react'
import type { GameMode } from '../game/types'
import './StartOverlay.css'

interface StartOverlayProps {
  visible: boolean
  initialMode?: GameMode
  onStart: (mode: GameMode) => void
}

const KEY_ITEMS = [
  { keys: 'WASD', label: '骑行 / 转向' },
  { keys: 'Tab', label: '骑手手机抢单' },
  { keys: 'Space', label: '急刹 / 冲刺' },
  { keys: 'Shift', label: '电驴加速' },
  { keys: 'E', label: '进楼拍照送达' },
  { keys: 'H / C', label: '喇叭 / 视角' },
] as const

export function StartOverlay({ visible, initialMode = 'challenge', onStart }: StartOverlayProps) {
  const [mode, setMode] = useState<GameMode>(initialMode)
  const [compactExperience, setCompactExperience] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse), (max-width: 760px)')
    const sync = () => setCompactExperience(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.code === 'Enter') {
        event.preventDefault()
        onStart(mode)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible, mode, onStart])

  if (!visible) return null

  return (
    <div className="start-overlay" role="dialog" aria-modal="true" aria-labelledby="start-title">
      <div className="start-scrim" aria-hidden="true" />
      <section className="start-card">
        <div className="start-card-scroll">
          <div className="start-top-badge">
            <Sparkles size={13} aria-hidden="true" />
            <span>2026 Hack4Good · 3D 城市外卖体验模拟</span>
          </div>

          <header className="start-header">
            <span className="start-logo" aria-hidden="true">
              <Bike size={28} />
            </span>
            <div>
              <h1 id="start-title" className="start-title">午高峰：外卖骑手模拟器</h1>
              <p className="start-subtitle">RUSH HOUR RIDER · 11:30 – 13:30</p>
            </div>
          </header>

          <p className="start-quote">
            算法算得出距离，算不出红灯、电梯与一场阵雨。
          </p>

          {compactExperience && (
            <div className="start-compact-hint" role="note">
              <Smartphone size={16} aria-hidden="true" />
              <div>
                <strong>手机 / 平板可玩</strong>
                <p>左下转向、右下加速/刹车，点「手机」抢单。横屏视野更完整，电脑体验最佳。</p>
              </div>
            </div>
          )}

          <div className="start-modes" role="radiogroup" aria-label="选择游玩模式">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'challenge'}
              className="start-mode-card"
              data-selected={mode === 'challenge'}
              onClick={() => setMode('challenge')}
            >
              <div className="start-mode-head">
                <span className="start-mode-title">
                  <Timer size={15} aria-hidden="true" />
                  午高峰 3.5 分钟挑战
                </span>
                <em className="start-mode-rec">推荐</em>
              </div>
              <p>11:30 → 13:30 限时午高峰、中段突发阵雨，收工揭晓《算法时间账本》。</p>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={mode === 'free'}
              className="start-mode-card"
              data-selected={mode === 'free'}
              onClick={() => setMode('free')}
            >
              <div className="start-mode-head">
                <span className="start-mode-title">
                  <Compass size={15} aria-hidden="true" />
                  自由骑行体验
                </span>
                <em className="start-mode-tag">无倒计时</em>
              </div>
              <p>不限时长慢逛 8×8 微缩中国街区，自由切换晴雨、随时抢单与进楼送餐。</p>
            </button>
          </div>

          <div className="start-keys" aria-label="核心操作键位">
            {KEY_ITEMS.map(({ keys, label }) => (
              <div key={keys} className="start-key-item">
                <kbd>{keys}</kbd>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="start-footer">
          <button
            type="button"
            className="start-cta"
            onClick={() => onStart(mode)}
          >
            <Play size={18} fill="currentColor" aria-hidden="true" />
            <span>上线接单</span>
            <kbd>Enter</kbd>
          </button>
          <p className="start-tip">无需登录 · Esc 暂停 · F3 技术数据 · 鼠标悬停环顾视角（左右 270°），滚轮缩放</p>
        </div>
      </section>
    </div>
  )
}
