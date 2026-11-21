import { useState } from 'react'
import { GameViewport } from './components/GameViewport'
import { ScaffoldStatus } from './components/ScaffoldStatus'
import type { EngineSnapshot } from './game/types'
import './App.css'

export default function App() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)

  return (
    <main className="game-shell">
      <GameViewport onSnapshot={setSnapshot} />
      <ScaffoldStatus snapshot={snapshot} />
    </main>
  )
}
