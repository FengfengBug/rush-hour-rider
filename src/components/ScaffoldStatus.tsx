import { Bike, Sun } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { CityView, EngineSnapshot, RideCameraMode, RiderPreviewMode } from '../game/types'

const cityViews: { id: CityView; label: string }[] = [
  { id: 'rider-rear', label: '骑手后视' },
  { id: 'rider-side', label: '骑手侧视' },
  { id: 'overview', label: '全城俯瞰' },
  { id: 'food-street', label: '烟火美食街' },
  { id: 'old-neighborhood', label: '红砖小区' },
  { id: 'cbd', label: '星辰 CBD' },
  { id: 'civic-center', label: '医院与学园' },
]

const cameraModes: { id: RideCameraMode; label: string }[] = [
  { id: 'near', label: '近距' },
  { id: 'far', label: '远距' },
  { id: 'overhead', label: '俯视' },
]

const riderPreviewModes: { id: RiderPreviewMode; label: string }[] = [
  { id: 'parked', label: '驻车' },
  { id: 'motion', label: '动作演示' },
  { id: 'braking', label: '刹车灯' },
]

const cityPoints = [
  ...CITY_LAYOUT.landmarks.map((landmark) => ({
    ...landmark, label: landmark.kind === 'merchant' ? '取餐' : '送达',
  })),
  ...CITY_LAYOUT.batteryStations.map((station) => ({ ...station, label: '换电' })),
]

interface ScaffoldStatusProps {
  snapshot: EngineSnapshot | null
  onViewChange: (view: CityView) => void
  onRiderPreviewChange: (mode: RiderPreviewMode) => void
  onCameraChange: (mode: RideCameraMode) => void
  onResetRider: () => void
}

export function ScaffoldStatus({
  snapshot, onViewChange, onRiderPreviewChange, onCameraChange, onResetRider,
}: ScaffoldStatusProps) {
  const view = snapshot?.view ?? 'ride'
  const cameraMode = snapshot?.cameraMode ?? 'near'
  const riderPreview = snapshot?.riderPreview ?? 'parked'
  const rider = snapshot?.rider
  const isRiding = view === 'ride'
  const speed = rider ? `${rider.speed > 0 ? '+' : ''}${(rider.speed * 3.6).toFixed(1)}` : '—'
  const direction = rider ? rider.speed < 0 ? '倒车' : rider.speed > 0 ? '前进' : '静止' : '待连接'
  const fps = snapshot && snapshot.fps > 0 ? `${snapshot.fps} FPS` : '采样中'

  function inspectRider(mode: RiderPreviewMode) {
    if (view !== 'rider-rear' && view !== 'rider-side') onViewChange('rider-rear')
    onRiderPreviewChange(mode)
  }

  return (
    <div className="scene-overlay">
      <header className="scene-header">
        <div className="scene-brand">
          <span className="brand-icon"><Bike size={24} aria-hidden="true" /></span>
          <div>
            <h1>午高峰</h1>
            <p>RUSH HOUR RIDER</p>
          </div>
        </div>
        <span className="task-badge">TASK 1.4 / 驾驶与安全测试</span>
      </header>

      <div className="scene-controls">
        <section className="ride-card" aria-label="实时驾驶数据与操作">
          <div className="ride-heading">
            <h2>{isRiding ? '街区试骑' : '检查模式 · 已驻车'}</h2>
            {isRiding ? <span className="ride-mode">键盘驾驶</span> : (
              <button className="return-ride" type="button" data-view="ride" onClick={() => onViewChange('ride')}>
                返回骑行
              </button>
            )}
          </div>

          <dl className="ride-readouts">
            <div>
              <dt>时速 <span className="ride-direction" data-reverse={rider ? rider.speed < 0 : false}>{direction}</span></dt>
              <dd><strong className="speed-value">{speed}</strong><span className="readout-unit">km/h</span></dd>
            </div>
            <div className="battery-readout" data-low={rider ? rider.battery <= 20 : false}>
              <dt>剩余电量</dt>
              <dd><strong>{rider ? rider.battery.toFixed(1) : '—'}</strong><span className="readout-unit">%</span></dd>
              <div className="battery-track" aria-hidden="true">
                <span style={{ width: `${rider ? Math.max(0, Math.min(100, rider.battery)) : 0}%` }} />
              </div>
            </div>
          </dl>

          <dl className="ride-telemetry">
            <div><dt>累计里程</dt><dd>{rider ? `${rider.distance.toFixed(1)} m` : '—'}</dd></div>
            <div><dt>位置 (X, Z) · 米</dt><dd>{rider ? `(${rider.x.toFixed(1)}, ${rider.z.toFixed(1)})` : '—'}</dd></div>
          </dl>

          <div className="drive-status" role="group" aria-label="车辆状态">
            <span data-active={rider?.boosting ?? false}>{rider ? rider.boosting ? '助推中' : '助推待机' : '助推 —'}</span>
            <span data-active={rider?.braking ?? false}>{rider ? rider.braking ? '制动中' : '未刹车' : '刹车 —'}</span>
            <span className="contact-status" data-active={rider?.colliding ?? false}>{rider ? rider.colliding ? '墙体接触' : '无墙体接触' : '墙体 —'}</span>
          </div>

          <div className="ride-actions">
            <div className="ride-cameras" role="group" aria-label="骑行镜头">
              {cameraModes.map((option) => (
                <button
                  key={option.id}
                  className="ride-camera"
                  type="button"
                  data-camera={option.id}
                  aria-pressed={cameraMode === option.id}
                  aria-label={`${option.label}骑行镜头`}
                  disabled={!snapshot}
                  onClick={() => onCameraChange(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              className="reset-rider"
              type="button"
              data-action="reset-rider"
              title="恢复起点与电量，清零里程"
              aria-label="回到起点，恢复电量并清零里程"
              disabled={!snapshot}
              onClick={onResetRider}
            >
              回到起点
            </button>
          </div>

          <div className="ride-hints">
            <p><kbd>WASD</kbd> / <kbd>方向键</kbd> 前后行驶 · 左右转向</p>
            <p className="key-shortcuts">
              <span><kbd>Space</kbd> 急刹</span>
              <span><kbd>Shift</kbd> 耗电助推</span>
              <span><kbd>C</kbd> 切镜头</span>
            </p>
            <p className="desktop-hint">需实体键盘，建议使用电脑体验。</p>
          </div>
        </section>

        <details className="city-explorer">
          <summary>城市与模型检查 <small>{cityViews.length} 个视角 · 渲染 / 地图数据</small></summary>
          <div className="city-explorer-body">
            <div className="city-explorer-intro">
              <p>检查时停车并停用驾驶输入；返回骑行保留位置。</p>
              <p>拖动旋转 · 滚轮缩放 · 右键平移</p>
            </div>
            <nav className="city-views" aria-label="检查视角">
              {cityViews.map((option, index) => (
                <button
                  key={option.id}
                  className="city-view"
                  type="button"
                  data-view={option.id}
                  aria-pressed={view === option.id}
                  disabled={!snapshot}
                  onClick={() => onViewChange(option.id)}
                >
                  <span className="city-view-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {option.label}
                </button>
              ))}
            </nav>
            <div className="rider-preview-modes" role="group" aria-label="骑手模型状态" aria-describedby="rider-preview-note">
              {riderPreviewModes.map((option) => (
                <button
                  key={option.id}
                  className="rider-preview"
                  type="button"
                  data-preview={option.id}
                  aria-pressed={riderPreview === option.id}
                  disabled={!snapshot}
                  onClick={() => inspectRider(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p id="rider-preview-note" className="inspection-note">模型状态仅作原地演示，不是实际驾驶。回到起点会恢复电量并清零里程。</p>

            <section className="render-status" aria-label="实时渲染状态">
              <h3>实时渲染</h3>
              <dl>
                <div><dt>实测帧率</dt><dd>{fps}</dd></div>
                <div><dt>绘制调用</dt><dd>{snapshot?.drawCalls ?? '—'}</dd></div>
                <div><dt>三角面</dt><dd>{snapshot?.triangleCount ?? '—'}</dd></div>
                <div><dt>实例数</dt><dd>{snapshot?.instanceCount ?? '—'}</dd></div>
                <div><dt>视口</dt><dd>{snapshot ? `${snapshot.viewportWidth} × ${snapshot.viewportHeight}` : '—'}</dd></div>
                <div><dt>像素比</dt><dd>{snapshot ? `${snapshot.pixelRatio.toFixed(2)}×` : '—'}</dd></div>
              </dl>
            </section>

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
                  <div><dt>巡航线（仅数据）</dt><dd>{CITY_LAYOUT.trafficRoutes.length}</dd></div>
                  <div><dt>功能区</dt><dd>{CITY_LAYOUT.districts.length}</dd></div>
                </dl>
                <p className="city-districts">{CITY_LAYOUT.districts.map((district) => district.name).join(' / ')}</p>
                <h3>预留交互点坐标 <span>(X, Z) · 米</span></h3>
                <p className="city-coordinate-note">尚无交互；路侧接入点，+X 向东、+Z 向南</p>
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
          </div>
        </details>
      </div>

      <footer className="scene-footer">
        <div className="scene-caption">
          <h2><Sun size={14} aria-hidden="true" />先练稳，再出发。</h2>
          <p>驾驶与安全测试 · 暂无订单与车流</p>
        </div>
        <div className="engine-summary">
          <span className="engine-state" data-ready={snapshot !== null}>{snapshot ? '引擎运行中' : '正在初始化'}</span>
          <span>{fps}</span>
        </div>
      </footer>
    </div>
  )
}
