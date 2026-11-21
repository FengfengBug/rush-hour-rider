import { useCallback, useRef, useState } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import type { GameEngine } from './game/gameEngine'
import type { CityView, EngineSnapshot, RiderPreviewMode } from './game/types'
import './App.css'

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [view, setView] = useState<CityView>('rider-rear')
  const [riderPreview, setRiderPreview] = useState<RiderPreviewMode>('parked')
  const engineRef = useRef<GameEngine | null>(null)
  const handleEngineReady = useCallback((engine: GameEngine | null) => {
    engineRef.current = engine
  }, [])

  function selectView(nextView: CityView) {
    engineRef.current?.setCityView(nextView)
    setView(nextView)
  }

  function selectRiderPreview(mode: RiderPreviewMode) {
    engineRef.current?.setRiderPreviewMode(mode)
    setRiderPreview(mode)
  }

  return (
    <main className="game-shell">
      <GameViewport onSnapshot={setSnapshot} onEngineReady={handleEngineReady} />
      <ScaffoldStatus snapshot={snapshot} view={view} onViewChange={selectView} riderPreview={riderPreview} onRiderPreviewChange={selectRiderPreview} />
    </main>
  )
}
