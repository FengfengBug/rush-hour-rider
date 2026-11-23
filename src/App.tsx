import { useEffect, useState, type CSSProperties } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import { RiderPhone } from './components/RiderPhone'
import { EventModal } from './components/EventModal'
import { DeliveryCameraOverlay } from './components/DeliveryCameraOverlay'
import { StartOverlay } from './components/StartOverlay'
import { ControlsHint } from './components/ControlsHint'
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

  useEffect(() => {
    engine?.setPhoneOpen(phoneOpen)
  }, [engine, phoneOpen])

  useEffect(() => {
    engine?.setMuted(muted)
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0')
    } catch {
      // Ignore storage unavailability in private browsing modes.
    }
  }, [engine, muted])

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

  const started = snapshot?.shift.started ?? false
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
        onNavigationTargetChange={(id) => engine?.setNavigationTarget(id)}
        onViewChange={selectView}
        onRiderPreviewChange={selectRiderPreview}
        onCameraChange={selectCamera}
        onCycleCamera={cycleCamera}
        onToggleWeather={toggleWeather}
        onToggleMute={toggleMute}
        onResetRider={resetRider}
        onReturnToTitle={returnToTitle}
      />
      {started && (
        <RiderPhone
          key={snapshot?.orders.shiftId ?? 0}
          engine={engine}
          snapshot={snapshot}
          open={phoneOpen}
          onOpenChange={setPhoneOpen}
        />
      )}
      <ControlsHint snapshot={snapshot} />
      {started && <EventModal engine={engine} snapshot={snapshot} />}
      {started && <DeliveryCameraOverlay engine={engine} snapshot={snapshot} />}
      <StartOverlay visible={!started} initialMode={snapshot?.shift.mode ?? 'challenge'} onStart={startSession} />
    </main>
  )
}
