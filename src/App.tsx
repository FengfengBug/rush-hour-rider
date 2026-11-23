import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import { RiderPhone } from './components/RiderPhone'
import { EventModal } from './components/EventModal'
import { DeliveryCameraOverlay } from './components/DeliveryCameraOverlay'
import { DeliveryDeltaToast } from './components/DeliveryDeltaToast'
import { PauseOverlay } from './components/PauseOverlay'
import { StartOverlay } from './components/StartOverlay'
import { ControlsHint } from './components/ControlsHint'
import { SettlementModal } from './components/SettlementModal'
import type { GameEngine } from './game/gameEngine'
import type { CityView, EngineSnapshot, GameMode, RideCameraMode, RiderPreviewMode } from './game/types'
import './App.css'

const MUTE_STORAGE_KEY = 'rush-hour-rider:muted'

function readMutedPreference(): boolean {
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [engine, setEngine] = useState<GameEngine | null>(null)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [muted, setMuted] = useState<boolean>(readMutedPreference)
  const phoneAutoOpened = useRef(false)
  const [toastOrderId, setToastOrderId] = useState<string | null>(null)
  const lastToastKey = useRef<string | null>(null)
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(() => {
    try {
      return new URLSearchParams(window.location.search).get('dev') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    engine?.setPhoneOpen(phoneOpen)
  }, [engine, phoneOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'F3' || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      setDevPanelOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    engine?.setMuted(muted)
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
    } catch {
      // Ignore storage unavailability in private browsing modes.
    }
  }, [engine, muted])

  // 首局自动展开手机 3.2 秒，让评委不用先学 Tab 就能看到“抢单大厅”；之后不再打扰。
  useEffect(() => {
    if (!snapshot?.shift.started || phoneAutoOpened.current) return
    phoneAutoOpened.current = true
    setPhoneOpen(true)
    const timer = window.setTimeout(() => setPhoneOpen(false), 3200)
    return () => window.clearTimeout(timer)
  }, [snapshot?.shift.started])

  function selectView(view: CityView) {
    engine?.setCityView(view)
  }

  function selectRiderPreview(mode: RiderPreviewMode) {
    engine?.setRiderPreviewMode(mode)
  }

  function selectCamera(mode: RideCameraMode) {
    engine?.setRideCameraMode(mode)
  }

  function cycleCamera() {
    engine?.cycleRideCameraMode()
  }

  function toggleWeather() {
    engine?.toggleWeather()
  }

  function toggleMute() {
    setMuted((current) => !current)
  }

  function resetRider() {
    setPhoneOpen(false)
    engine?.resetRider()
  }

  function startSession(mode: GameMode) {
    setPhoneOpen(false)
    engine?.startSession(mode)
  }

  function returnToTitle() {
    setPhoneOpen(false)
    engine?.returnToTitle()
  }

  function finishShiftEarly() {
    setPhoneOpen(false)
    engine?.finishShiftEarly()
  }

  function resumeShift() {
    engine?.resumeShiftFromSettlement()
  }

  function togglePause() {
    engine?.togglePause()
  }

  function resumePause() {
    engine?.setPaused(false)
  }

  function resetPauseView() {
    engine?.resetView()
  }

  const started = snapshot?.shift.started ?? false
  const shiftEnded = snapshot?.shift.ended ?? false
  const completedOrders = snapshot?.orders.completed ?? []
  const latestCompleted = completedOrders.length
    ? [...completedOrders].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
    : null
  const toastKey = latestCompleted && snapshot ? `${snapshot.orders.shiftId}:${latestCompleted.id}` : null

  useEffect(() => {
    if (!started || shiftEnded || !toastKey) {
      setToastOrderId(null)
      return
    }
    if (lastToastKey.current === toastKey) return
    lastToastKey.current = toastKey
    const latest = completedOrders.find((order) => `${snapshot?.orders.shiftId}:${order.id}` === toastKey)
    if (!latest) return
    setToastOrderId(latest.id)
    const timer = window.setTimeout(() => setToastOrderId(null), 2400)
    return () => window.clearTimeout(timer)
    // completedOrders 每帧都是新数组，不能作为依赖；toastKey 已唯一标识“新完成一单”。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, shiftEnded, toastKey])

  const toastOrder = toastOrderId
    ? completedOrders.find((order) => order.id === toastOrderId) ?? null
    : null
  const canResumeSettlement = !!snapshot && (
    snapshot.shift.mode === 'free'
    || snapshot.shift.remainingSec > 0.05
  )
  const distractionLevel = snapshot?.distraction.level ?? 0
  const distractionActive = snapshot?.distraction.active ?? false
  const distractionStyle = {
    '--distraction': distractionLevel.toFixed(3),
  } as CSSProperties

  return (
    <main className="game-shell" data-distracted={distractionActive}>
      <GameViewport onSnapshot={setSnapshot} onEngineReady={setEngine} />
      <div
        className="distraction-vignette"
        aria-hidden="true"
        data-active={started && distractionLevel > 0.01}
        style={distractionStyle}
      />
      <ScaffoldStatus
        engine={engine}
        snapshot={snapshot}
        muted={muted}
        devPanelOpen={devPanelOpen}
        onToggleDevPanel={() => setDevPanelOpen((open) => !open)}
        onNavigationTargetChange={(id) => engine?.setNavigationTarget(id)}
        onViewChange={selectView}
        onRiderPreviewChange={selectRiderPreview}
        onCameraChange={selectCamera}
        onCycleCamera={cycleCamera}
        onToggleWeather={toggleWeather}
        onToggleMute={toggleMute}
        onResetRider={resetRider}
        onFinishShift={finishShiftEarly}
        onReturnToTitle={returnToTitle}
        onTogglePause={togglePause}
      />
      {started && (
        <RiderPhone
          key={`phone-${snapshot?.orders.shiftId ?? 0}`}
          engine={engine}
          snapshot={snapshot}
          open={phoneOpen}
          onOpenChange={setPhoneOpen}
        />
      )}
      <ControlsHint snapshot={snapshot} />
      {started && <EventModal engine={engine} snapshot={snapshot} />}
      {started && <DeliveryCameraOverlay engine={engine} snapshot={snapshot} />}
      {started && !shiftEnded && <DeliveryDeltaToast order={toastOrder} />}
      {started && (
        <PauseOverlay
          visible={snapshot?.shift.paused ?? false}
          snapshot={snapshot}
          onResume={resumePause}
          onResetView={resetPauseView}
          onFinishShift={finishShiftEarly}
          onReturnToTitle={returnToTitle}
        />
      )}
      <SettlementModal
        key={`settlement-${snapshot?.orders.shiftId ?? 0}`}
        visible={started && shiftEnded}
        snapshot={snapshot}
        canResume={canResumeSettlement}
        onResume={resumeShift}
        onRestart={resetRider}
        onReturnToTitle={returnToTitle}
      />
      {snapshot?.rendererLost && (
        <div className="render-recovery" role="alert">
          <span className="render-recovery-icon" aria-hidden="true">
            <AlertTriangle size={18} />
          </span>
          <div>
            <strong>显卡渲染上下文中断</strong>
            <span>正在尝试自动恢复，计时与派单保持冻结。若长时间无响应，可刷新页面。</span>
          </div>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={14} aria-hidden="true" />
            刷新页面
          </button>
        </div>
      )}
      <StartOverlay visible={!started} initialMode={snapshot?.shift.mode ?? 'challenge'} onStart={startSession} />
    </main>
  )
}
