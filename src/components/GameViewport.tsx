import { useEffect, useRef } from 'react'
import { GameEngine } from '../game/gameEngine'
import type { EngineSnapshot } from '../game/types'

interface GameViewportProps {
  onSnapshot: (snapshot: EngineSnapshot) => void
}

export function GameViewport({ onSnapshot }: GameViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const engine = new GameEngine(containerRef.current!, onSnapshot)
    engine.start()
    return () => engine.dispose()
  }, [onSnapshot])

  return <div className="game-viewport" ref={containerRef} />
}
