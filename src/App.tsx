import { useState } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import { RiderPhone } from './components/RiderPhone'
import type { GameEngine } from './game/gameEngine'
import type { CityView, EngineSnapshot, RideCameraMode, RiderPreviewMode } from './game/types'
import './App.css'

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [engine, setEngine] = useState<GameEngine | null>(null)

  function selectView(view: CityView) {
    engine?.setCityView(view)
  }

  function selectRiderPreview(mode: RiderPreviewMode) {
    engine?.setRiderPreviewMode(mode)
  }

  function selectCamera(mode: RideCameraMode) {
    engine?.setRideCameraMode(mode)
  }

  function resetRider() {
    engine?.resetRider()
  }

  return (
    <main className="game-shell">
      <GameViewport onSnapshot={setSnapshot} onEngineReady={setEngine} />
      <ScaffoldStatus
        engine={engine}
        snapshot={snapshot}
        onNavigationTargetChange={(id) => engine?.setNavigationTarget(id)}
        onViewChange={selectView}
        onRiderPreviewChange={selectRiderPreview}
        onCameraChange={selectCamera}
        onResetRider={resetRider}
      />
      <RiderPhone key={snapshot?.orders.shiftId ?? 0} engine={engine} snapshot={snapshot} />
    </main>
  )
}
