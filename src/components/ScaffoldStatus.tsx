import { useState, version as reactVersion } from 'react'
import { ArrowRight, CheckCircle2, Terminal } from 'lucide-react'
import { REVISION } from 'three'

export function ScaffoldStatus() {
  const [interactionCount, setInteractionCount] = useState(0)

  return (
    <section className="status-panel" aria-labelledby="status-title">
      <div className="status-heading">
        <span className="status-icon"><Terminal size={22} aria-hidden="true" /></span>
        <div>
          <p className="eyebrow">WORKSPACE / READY</p>
          <h2 id="status-title">工程已启动</h2>
        </div>
        <span className="running-indicator">运行中</span>
      </div>

      <dl className="runtime-grid">
        <div><dt>界面运行时</dt><dd>React {reactVersion}</dd></div>
        <div><dt>原生 3D 依赖</dt><dd>Three.js r{REVISION}</dd></div>
        <div><dt>运行环境</dt><dd>{import.meta.env.PROD ? '生产预览' : '本地开发'}</dd></div>
      </dl>

      <div className="interaction-check">
        <p role="status" aria-live="polite">
          {interactionCount > 0 ? (
            <><CheckCircle2 size={18} aria-hidden="true" />交互检查通过 · 已响应 {interactionCount} 次</>
          ) : '点击右侧按钮，验证 React 事件与状态更新。'}
        </p>
        <button type="button" onClick={() => setInteractionCount((count) => count + 1)}>
          验证页面交互<ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
