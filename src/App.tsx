import { Bike } from 'lucide-react'
import { ScaffoldStatus } from './components/ScaffoldStatus'

export default function App() {
  return (
    <main className="workspace">
      <header className="workspace-header">
        <div className="brand">
          <span className="brand-icon"><Bike size={24} aria-hidden="true" /></span>
          <span>RUSH HOUR RIDER</span>
        </div>
        <span className="task-badge">TASK 0.1 / 工程启动</span>
      </header>

      <section className="intro" aria-labelledby="project-title">
        <p className="eyebrow">2026 QODER 高校创造力大赛 · HACK4GOOD</p>
        <h1 id="project-title">午高峰<span>外卖骑手模拟器</span></h1>
        <p className="description">用一次配送体验，看见算法之外的真实时间。</p>
      </section>

      <ScaffoldStatus />

      <footer className="workspace-footer">
        <span>纯前端 · 程序化 3D · 零外部重资产</span>
        <span>当前为工程启动检查页，尚未接入 3D 与配送玩法。</span>
      </footer>
    </main>
  )
}
