import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, Hand, Smartphone } from 'lucide-react'
import type { GameEngine } from '../game/gameEngine'
import './TouchControls.css'

interface TouchControlsProps {
  engine: GameEngine | null
  phoneOpen: boolean
  visible: boolean
  onTogglePhone: () => void
}

export function TouchControls({ engine, phoneOpen, visible, onTogglePhone }: TouchControlsProps) {
  const [touchMode, setTouchMode] = useState(() => window.matchMedia('(pointer: coarse), (max-width: 760px)').matches)
  const [steer, setSteer] = useState<-1 | 0 | 1>(0)
  const [throttle, setThrottle] = useState(false)
  const [brake, setBrake] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse), (max-width: 760px)')
    const sync = () => setTouchMode(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => () => {
    engine?.setTouchDrive({ throttle: false, brake: false, steer: 0, boost: false })
  }, [engine])

  useEffect(() => {
    if (!visible) {
      setSteer(0)
      setThrottle(false)
      setBrake(false)
      engine?.setTouchDrive({ throttle: false, brake: false, steer: 0, boost: false })
    }
  }, [visible, engine])

  const active = visible && touchMode
  const icons = useMemo(() => ({ left: <ChevronLeft size={22} aria-hidden="true" />, right: <ChevronRight size={22} aria-hidden="true" />, up: <ChevronUp size={22} aria-hidden="true" /> }), [])

  if (!active) return null

  function setSteerAxis(next: -1 | 0 | 1) {
    setSteer(next)
    engine?.setTouchDrive({ steer: next })
  }

  function setThrottleAxis(next: boolean) {
    setThrottle(next)
    engine?.setTouchDrive({ throttle: next })
  }

  function setBrakeAxis(next: boolean) {
    setBrake(next)
    engine?.setTouchDrive({ brake: next })
  }

  function releaseAll() {
    setSteer(0)
    setThrottle(false)
    setBrake(false)
    engine?.setTouchDrive({ throttle: false, brake: false, steer: 0, boost: false })
  }

  function capturePointer(event: ReactPointerEvent<HTMLButtonElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 自动化/合成指针事件没有真实 pointerId 时忽略捕获，按钮仍可通过 pointerup 释放。
    }
  }

  return (
    <div className="touch-controls" aria-label="触屏骑行控制">
      <div className="touch-pad touch-pad--steer">
        <button
          type="button"
          className="touch-btn touch-btn--steer"
          data-pressed={steer === 1}
          aria-label="向左转"
          onPointerDown={(event) => { event.preventDefault(); capturePointer(event); setSteerAxis(1) }}
          onPointerUp={() => setSteerAxis(0)}
          onPointerCancel={() => setSteerAxis(0)}
          onLostPointerCapture={() => setSteerAxis(0)}
        >
          {icons.left}
        </button>
        <button
          type="button"
          className="touch-btn touch-btn--steer"
          data-pressed={steer === -1}
          aria-label="向右转"
          onPointerDown={(event) => { event.preventDefault(); capturePointer(event); setSteerAxis(-1) }}
          onPointerUp={() => setSteerAxis(0)}
          onPointerCancel={() => setSteerAxis(0)}
          onLostPointerCapture={() => setSteerAxis(0)}
        >
          {icons.right}
        </button>
      </div>

      <div className="touch-pad touch-pad--drive">
        <button
          type="button"
          className="touch-btn touch-btn--throttle"
          data-pressed={throttle}
          aria-label="加速（按住）"
          onPointerDown={(event) => { event.preventDefault(); capturePointer(event); setThrottleAxis(true) }}
          onPointerUp={() => setThrottleAxis(false)}
          onPointerCancel={() => setThrottleAxis(false)}
          onLostPointerCapture={() => setThrottleAxis(false)}
        >
          {icons.up}
          <span>加速</span>
        </button>
        <button
          type="button"
          className="touch-btn touch-btn--brake"
          data-pressed={brake}
          aria-label="刹车（按住）"
          onPointerDown={(event) => { event.preventDefault(); capturePointer(event); setBrakeAxis(true) }}
          onPointerUp={() => setBrakeAxis(false)}
          onPointerCancel={() => setBrakeAxis(false)}
          onLostPointerCapture={() => setBrakeAxis(false)}
        >
          <Hand size={18} aria-hidden="true" />
          <span>刹车</span>
        </button>
        <button type="button" className="touch-btn touch-btn--phone" aria-pressed={phoneOpen} aria-label={phoneOpen ? '收起骑手手机' : '打开骑手手机'} onClick={() => { releaseAll(); onTogglePhone() }}>
          <Smartphone size={18} aria-hidden="true" />
          <span>{phoneOpen ? '收起' : '手机'}</span>
        </button>
      </div>
    </div>
  )
}
