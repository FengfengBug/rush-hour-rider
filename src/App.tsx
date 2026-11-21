import { useCallback, useRef, useState } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import type { GameEngine } from './game/gameEngine'
import type { CityView, EngineSnapshot } from './game/types'
import './App.css'

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [view, setView] = useState<CityView>('overview')
  const engineRef = useRef<GameEngine | null>(null)
  const handleEngineReady = useCallback((engine: GameEngine | null) => {
    engineRef.current = engine
  }, [])

  function selectView(nextView: CityView) {
    engineRef.current?.setCityView(nextView)
    setView(nextView)
  }

  return (
    <main className="game-shell">
      <GameViewport onSnapshot={setSnapshot} onEngineReady={handleEngineReady} />
      <ScaffoldStatus snapshot={snapshot} view={view} onViewChange={selectView} />
    </main>
  )
}
