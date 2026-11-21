import { Bike, Sun } from 'lucide-react'
import type { EngineSnapshot } from '../game/types'

interface ScaffoldStatusProps {
  snapshot: EngineSnapshot | null
}

export function ScaffoldStatus({ snapshot }: ScaffoldStatusProps) {
  return (
    <div className="scene-overlay">
      <header className="scene-header">
        <div className="scene-brand">
          <span className="brand-icon"><Bike size={25} aria-hidden="true" /></span>
          <div>
            <h1>午高峰</h1>
            <p>RUSH HOUR RIDER</p>
          </div>
        </div>
        <span className="task-badge">TASK 0.2 / 渲染底座</span>
      </header>

      <footer className="scene-footer">
        <div className="scene-caption">
          <span className="scene-eyebrow"><Sun size={16} aria-hidden="true" />日光与实时阴影</span>
          <h2>第一束光，已经照进来了。</h2>
          <p>旋转参考方块 · 原生 Three.js · 尚未接入街区与骑行</p>
        </div>

        <section className="render-status" aria-label="实时渲染状态">
          <span className="engine-state">{snapshot ? '引擎运行中' : '正在初始化'}</span>
          <dl>
            <div><dt>实测帧率</dt><dd>{snapshot && snapshot.fps > 0 ? `${snapshot.fps} FPS` : '采样中'}</dd></div>
            <div><dt>绘制调用</dt><dd>{snapshot?.drawCalls ?? '—'}</dd></div>
            <div><dt>视口</dt><dd>{snapshot ? `${snapshot.viewportWidth} × ${snapshot.viewportHeight}` : '—'}</dd></div>
            <div><dt>像素比</dt><dd>{snapshot ? `${snapshot.pixelRatio.toFixed(2)}×` : '—'}</dd></div>
          </dl>
        </section>
      </footer>
    </div>
  )
}
