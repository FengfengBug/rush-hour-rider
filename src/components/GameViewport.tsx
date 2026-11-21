import { useEffect, useRef } from 'react'
import { GameEngine } from '../game/gameEngine'
import type { EngineSnapshot } from '../game/types'

interface GameViewportProps {
  onSnapshot: (snapshot: EngineSnapshot) => void
  onEngineReady: (engine: GameEngine | null) => void
}

export function GameViewport({ onSnapshot, onEngineReady }: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const engine = new GameEngine(containerRef.current!, onSnapshot)
    onEngineReady(engine)
    engine.start()
    return () => {
      onEngineReady(null)
      engine.dispose()
    }
  }, [onSnapshot, onEngineReady])

  return <div className="game-viewport" ref={containerRef} />
}
