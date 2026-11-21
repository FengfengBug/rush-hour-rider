import { useCallback, useRef, useState } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import type { GameEngine } from './game/gameEngine'
import type { CityView, EngineSnapshot, RideCameraMode, RiderPreviewMode } from './game/types'
import './App.css'

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const handleEngineReady = useCallback((engine: GameEngine | null) => {
    engineRef.current = engine
  }, [])

  function selectView(view: CityView) {
    engineRef.current?.setCityView(view)
  }

  function selectRiderPreview(mode: RiderPreviewMode) {
    engineRef.current?.setRiderPreviewMode(mode)
  }

  function selectCamera(mode: RideCameraMode) {
    engineRef.current?.setRideCameraMode(mode)
  }

  function resetRider() {
    engineRef.current?.resetRider()
  }

  return (
    <main className="game-shell">
      <GameViewport onSnapshot={setSnapshot} onEngineReady={handleEngineReady} />
      <ScaffoldStatus
        snapshot={snapshot}
        onViewChange={selectView}
        onRiderPreviewChange={selectRiderPreview}
        onCameraChange={selectCamera}
        onResetRider={resetRider}
      />
    </main>
  )
}
