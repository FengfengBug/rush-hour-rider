import { Bike, Sun } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { CityView, EngineSnapshot } from '../game/types'

const cityViews: { id: CityView; label: string }[] = [
  { id: 'overview', label: '全城俯瞰' },
  { id: 'food-street', label: '烟火美食街' },
  { id: 'old-neighborhood', label: '红砖小区' },
  { id: 'cbd', label: '星辰 CBD' },
  { id: 'civic-center', label: '医院与学园' },
]

const cityPoints = [
  ...CITY_LAYOUT.landmarks.map((landmark) => ({
    ...landmark, label: landmark.kind === 'merchant' ? '取餐' : '送达',
  })),
  ...CITY_LAYOUT.batteryStations.map((station) => ({ ...station, label: '换电' })),
]

interface ScaffoldStatusProps {
  snapshot: EngineSnapshot | null
  view: CityView
  onViewChange: (view: CityView) => void
}

export function ScaffoldStatus({ snapshot, view, onViewChange }: ScaffoldStatusProps) {
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
        <span className="task-badge">TASK 1.2 / 城市街景</span>
      </header>

      <section className="city-explorer" aria-label="城市漫游">
        <div className="city-explorer-intro">
          <h2>街区漫游 <span>再次点击视角复位</span></h2>
          <p>拖动旋转 · 滚轮缩放 · 右键平移</p>
        </div>
        <nav className="city-views" aria-label="城市视角">
          {cityViews.map((option, index) => (
            <button
              key={option.id}
              className="city-view"
              type="button"
              data-view={option.id}
              aria-pressed={view === option.id}
              onClick={() => onViewChange(option.id)}
            >
              <span className="city-view-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              {option.label}
            </button>
          ))}
        </nav>

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
              <div><dt>巡航线（数据）</dt><dd>{CITY_LAYOUT.trafficRoutes.length}</dd></div>
              <div><dt>功能区</dt><dd>{CITY_LAYOUT.districts.length}</dd></div>
            </dl>
            <p className="city-districts">{CITY_LAYOUT.districts.map((district) => district.name).join(' / ')}</p>
            <h3>预留交互点坐标 <span>(X, Z) · 米</span></h3>
            <p className="city-coordinate-note">路侧接入点；中心为原点，+X 向东、+Z 向南</p>
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
      </section>

      <footer className="scene-footer">
        <div className="scene-caption">
          <span className="scene-eyebrow"><Sun size={15} aria-hidden="true" />程序生成 · 中国低多边形街景</span>
          <h2>先看看，这座小城。</h2>
          <p>骑手与车流尚未接入。</p>
        </div>

        <section className="render-status" aria-label="实时渲染状态">
          <span className="engine-state" data-ready={snapshot !== null}>{snapshot ? '引擎运行中' : '正在初始化'}</span>
          <dl>
            <div><dt>实测帧率</dt><dd>{snapshot && snapshot.fps > 0 ? `${snapshot.fps} FPS` : '采样中'}</dd></div>
            <div><dt>绘制调用</dt><dd>{snapshot?.drawCalls ?? '—'}</dd></div>
            <div><dt>三角面</dt><dd>{snapshot?.triangleCount ?? '—'}</dd></div>
            <div><dt>实例数</dt><dd>{snapshot?.instanceCount ?? '—'}</dd></div>
            <div><dt>视口</dt><dd>{snapshot ? `${snapshot.viewportWidth} × ${snapshot.viewportHeight}` : '—'}</dd></div>
            <div><dt>像素比</dt><dd>{snapshot ? `${snapshot.pixelRatio.toFixed(2)}×` : '—'}</dd></div>
          </dl>
        </section>
      </footer>
    </div>
  )
}
