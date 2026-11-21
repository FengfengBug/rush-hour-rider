import { Bike, Sun } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { EngineSnapshot } from '../game/types'

const cityPoints = [
  ...CITY_LAYOUT.landmarks.map((landmark) => ({
    ...landmark, label: landmark.kind === 'merchant' ? '取餐' : '送达',
  })),
  ...CITY_LAYOUT.batteryStations.map((station) => ({ ...station, label: '换电' })),
]

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
        <span className="task-badge">TASK 1.1 / 街区数据</span>
      </header>

      <details className="city-data">
        <summary>
          地图数据检查
          <small>{CITY_LAYOUT.gridSize} × {CITY_LAYOUT.gridSize} 街区 · {CITY_LAYOUT.landmarks.length} 地标 · {CITY_LAYOUT.batteryStations.length} 换电点</small>
        </summary>
        <div className="city-data-body">
          <p className="city-size">{CITY_LAYOUT.size}m × {CITY_LAYOUT.size}m · {CITY_LAYOUT.roads.reduce((count, road) => count + road.lanes.length, 0)} 条右行车道</p>
          <dl className="city-metrics">
            <div><dt>道路</dt><dd>{CITY_LAYOUT.roads.length}</dd></div>
            <div><dt>路口</dt><dd>{CITY_LAYOUT.intersections.length}</dd></div>
            <div><dt>人行道段</dt><dd>{CITY_LAYOUT.sidewalks.length}</dd></div>
            <div><dt>建筑 / 碰撞盒</dt><dd>{CITY_LAYOUT.buildings.length} / {CITY_LAYOUT.colliders.length}</dd></div>
            <div><dt>闭环巡航线</dt><dd>{CITY_LAYOUT.trafficRoutes.length}</dd></div>
            <div><dt>功能区</dt><dd>{CITY_LAYOUT.districts.length}</dd></div>
          </dl>
          <p className="city-districts">{CITY_LAYOUT.districts.map((district) => district.name).join(' / ')}</p>
          <h2>交互点坐标 <span>(X, Z) · 米</span></h2>
          <p className="city-coordinate-note">中心为原点，+X 向东、+Z 向南</p>
          <ul className="city-landmarks">
            {cityPoints.map((point) => (
              <li key={point.id}>
                <span className="city-point-kind">{point.label}</span>
                <span>{point.name}</span>
                <code>({point.access.position.x}, {point.access.position.z})</code>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <footer className="scene-footer">
        <div className="scene-caption">
          <span className="scene-eyebrow"><Sun size={16} aria-hidden="true" />日光底座 · 地图数据就绪</span>
          <h2>每一站，都有了坐标。</h2>
          <p>当前仍为参考方块，3D 城市街景将在 Task 1.2 接入。</p>
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
