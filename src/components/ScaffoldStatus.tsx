import { useState } from 'react'
import { Sun } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import { NAVIGATION_COLORS } from '../game/navigationSystem'
import { HudBar } from './HudBar'
import { MiniMap, type MiniMapMode } from './MiniMap'
import type { GameEngine } from '../game/gameEngine'
import type { CityView, EngineSnapshot, NavigationKind, RideCameraMode, RiderPreviewMode } from '../game/types'

const cityViews: { id: CityView; label: string }[] = [
  { id: 'rider-rear', label: '骑手后视' },
  { id: 'rider-side', label: '骑手侧视' },
  { id: 'overview', label: '全城俯瞰' },
  { id: 'food-street', label: '烟火美食街' },
  { id: 'night-market', label: '商业夜市' },
  { id: 'old-neighborhood', label: '老旧红砖' },
  { id: 'luxury-compound', label: '翡翠高端' },
  { id: 'cbd', label: '星辰 CBD' },
  { id: 'tech-park', label: '智谷科创' },
  { id: 'civic-center', label: '医院学园' },
  { id: 'university-town', label: '南城大学' },
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

const navigationKinds: { kind: NavigationKind; label: string }[] = [
  { kind: 'pickup', label: '取餐' }, { kind: 'delivery', label: '送达' }, { kind: 'battery', label: '换电' },
]

interface ScaffoldStatusProps {
  engine: GameEngine | null
  snapshot: EngineSnapshot | null
  muted: boolean
  onNavigationTargetChange: (id: string | null) => void
  onViewChange: (view: CityView) => void
  onRiderPreviewChange: (mode: RiderPreviewMode) => void
  onCameraChange: (mode: RideCameraMode) => void
  onCycleCamera: () => void
  onToggleMute: () => void
  onResetRider: () => void
}

export function ScaffoldStatus({
  engine, snapshot, muted, onNavigationTargetChange, onViewChange, onRiderPreviewChange, onCameraChange, onCycleCamera, onToggleMute, onResetRider,
}: ScaffoldStatusProps) {
  const [mapMode, setMapMode] = useState<MiniMapMode>('local')
  const view = snapshot?.view ?? 'ride'
  const cameraMode = snapshot?.cameraMode ?? 'near'
  const riderPreview = snapshot?.riderPreview ?? 'parked'
  const rider = snapshot?.rider
  const traffic = snapshot?.traffic
  const navigation = snapshot?.navigation
  const selectedTarget = navigation?.targets.find((target) => target.id === navigation.targetId)
  const nearbySignal = traffic?.nearbySignal
  const recentEvents = traffic?.events.slice(0, 3)
  const signalLabels = { red: '红灯', yellow: '黄灯', green: '绿灯' }
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
      <HudBar
        snapshot={snapshot}
        muted={muted}
        onCycleCamera={onCycleCamera}
        onToggleMute={onToggleMute}
        onResetRider={onResetRider}
      />

      <div className="scene-controls">
        <section className="navigation-panel" aria-label="订单导航" style={{ borderTopColor: selectedTarget ? NAVIGATION_COLORS[selectedTarget.kind] : undefined }}>
          <header className="navigation-heading">
            <h2>街区导航</h2>
            {isRiding ? (
              <button
                className="map-mode-toggle"
                type="button"
                aria-pressed={mapMode === 'full'}
                title="切换局部雷达跟随 / 全城 8×8 俯瞰"
                onClick={() => setMapMode((current) => current === 'local' ? 'full' : 'local')}
              >
                {mapMode === 'local' ? '局部跟随' : '全城 8×8'}
              </button>
            ) : (
              <button className="return-ride" type="button" data-view="ride" onClick={() => onViewChange('ride')}>返回骑行</button>
            )}
          </header>
          <MiniMap engine={engine} mode={mapMode} />
          <div className="navigation-legend" aria-label="地图图例">
            {navigationKinds.map(({ kind, label }) => <span key={kind}><i data-kind={kind} style={{ backgroundColor: NAVIGATION_COLORS[kind] }} />{label}</span>)}
          </div>
          <label className="navigation-select-label" htmlFor="navigation-target">优先导航地点</label>
          <select id="navigation-target" className="navigation-select" aria-label="优先导航地点" value={navigation?.targetId ?? ''} disabled={!navigation} onChange={(event) => onNavigationTargetChange(event.target.value || null)}>
            <option value="">不设置优先目标</option>
            {navigationKinds.map(({ kind, label }) => (
              <optgroup key={kind} label={`${label}地点`}>
                {navigation?.targets.filter((target) => target.kind === kind).map((target) => <option key={target.id} value={target.id}>{label} · {target.name}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="navigation-readout" data-arrived={navigation?.arrived ?? false}>
            <strong>{!navigation ? '连接中' : !selectedTarget ? '未选目标' : navigation.arrived ? '已到达目标点' : `${Math.ceil(navigation.distance)} m`}</strong>
            <span>{selectedTarget ? navigation?.arrived ? `${selectedTarget.radius}m 范围内` : '沿路距离' : `${navigation?.targets.length ?? 0} 个地点`}</span>
          </div>
          <p className="navigation-note">{!isRiding ? '检查中 · 配送与交通暂停' : snapshot?.orders.active.length ? `${snapshot.orders.active.length} 单在途 · 光圈内自动取送` : '接单后显取送点 · 换电仅导航'}</p>
        </section>

        <aside className="inspection-stack" aria-label="驾驶数据与城市检查">
        <details className="drive-inspector">
          <summary>驾驶与交通 <small>{speed} km/h · {rider ? `${rider.battery.toFixed(0)}%` : '—'}</small></summary>
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
              title="清空本轮订单与账本，重新生成开局单；恢复起点、电量并重置车流、里程与安全记录"
              aria-label="重新开工，清空本轮订单与账本，恢复起点和电量并重置车流与里程"
              disabled={!snapshot}
              onClick={onResetRider}
            >
              重新开工
            </button>
          </div>

          <section className="traffic-status" aria-label="实时车流与交通安全">
            <h3>街区车流 <small>{traffic ? `${traffic.vehicleCount} 辆 · ${isRiding ? '运行中' : '已冻结'}` : '待连接'}</small></h3>
            <dl className="traffic-counts">
              <div><dt>{isRiding ? '行驶' : '未排队'}</dt><dd>{traffic ? traffic.vehicleCount - traffic.queuedCount : '—'}</dd></div>
              <div><dt>排队</dt><dd>{traffic?.queuedCount ?? '—'}</dd></div>
              <div><dt>闯红灯</dt><dd>{traffic?.redLightCount ?? '—'}</dd></div>
              <div><dt>碰撞</dt><dd>{traffic?.collisionCount ?? '—'}</dd></div>
            </dl>
            <div className="nearby-signal">
              {nearbySignal ? (
                <>
                  <p>最近接近路口 · {nearbySignal.axis === 'x' ? '东西' : '南北'}向 · {nearbySignal.distance.toFixed(0)} m</p>
                  <div className="signal-readout">
                    <span className="signal-phase" data-phase={nearbySignal.phase}>
                      {signalLabels[nearbySignal.phase]} · 剩余 {Math.ceil(Math.max(0, nearbySignal.remaining))} s
                    </span>
                    <span className="signal-id">{nearbySignal.intersectionId}</span>
                  </div>
                </>
              ) : <p>{traffic ? '附近暂无接近路口信号' : '路口信号待连接'}</p>}
            </div>
          </section>

          <dl className="ride-telemetry">
            <div><dt>累计里程</dt><dd>{rider ? `${rider.distance.toFixed(1)} m` : '—'}</dd></div>
            <div><dt>位置 (X, Z) · 米</dt><dd>{rider ? `(${rider.x.toFixed(1)}, ${rider.z.toFixed(1)})` : '—'}</dd></div>
            <div><dt>骑手体力</dt><dd>{rider ? `${rider.stamina.toFixed(1)}%` : '—'}</dd></div>
            <div><dt>边骑看屏累计</dt><dd>{snapshot ? `${snapshot.distraction.elapsedSec.toFixed(1)} s (${snapshot.distraction.warningCount} 次)` : '—'}</dd></div>
          </dl>

          <div className="drive-status" role="group" aria-label="车辆状态">
            <span data-active={rider?.boosting ?? false}>{rider ? rider.boosting ? '助推中' : '助推待机' : '助推 —'}</span>
            <span data-active={rider?.braking ?? false}>{rider ? rider.braking ? '制动中' : '未刹车' : '刹车 —'}</span>
            <span className="contact-status" data-active={rider?.colliding ?? false}>{rider ? rider.colliding ? '碰撞接触' : '无碰撞接触' : '碰撞 —'}</span>
            <span className="contact-status" data-active={snapshot?.distraction.active ?? false}>{snapshot ? snapshot.distraction.active ? '低头看屏风险' : '视野清晰' : '看屏 —'}</span>
            <span data-active={traffic?.hornActive ?? false} role="status">{traffic ? traffic.hornActive ? '鸣笛波纹中' : '鸣笛待机' : '鸣笛 —'}</span>
          </div>

          <div className="ride-hints">
            <p><kbd>WASD</kbd> / <kbd>方向键</kbd> 前后行驶 · 左右转向</p>
            <p className="key-shortcuts">
              <span><kbd>Space</kbd> 急刹</span>
              <span><kbd>Shift</kbd> 耗电助推</span>
              <span><kbd>Tab</kbd> 收放手机</span>
              <span><kbd>C</kbd> 切镜头</span>
              <span><kbd>H</kbd> 鸣笛（波纹）</span>
              <span><kbd>鼠标移动</kbd> 自由侧头视角（左右 ≤ 270° · 滚轮缩放 · 双击回正）</span>
            </p>
            <p className="horn-note">鸣笛仅显示波纹，暂无声音。</p>
            <p className="desktop-hint">需实体键盘，建议使用电脑体验。</p>
          </div>

          <details className="safety-record">
            <summary>安全记录 <small>最近 {recentEvents?.length ?? '—'} 条</small></summary>
            <div className="safety-record-body">
              <p>交通时钟 {traffic ? `${traffic.elapsedSeconds.toFixed(1)} s` : '—'}{!isRiding && ' · 已冻结'}</p>
              {recentEvents && recentEvents.length > 0 ? (
                <ol>
                  {recentEvents.map((event) => (
                    <li key={event.id}>
                      <div><strong>{event.type === 'red-light' ? '闯红灯' : '交通碰撞'}</strong><span>{event.time.toFixed(1)} s</span></div>
                      <p>位置 (X, Z) · ({event.position.x.toFixed(1)}, {event.position.z.toFixed(1)}) m</p>
                    </li>
                  ))}
                </ol>
              ) : <p>{traffic ? '暂无安全事件。' : '安全记录待连接。'}</p>}
              <p>重新开工会清空本轮订单、收入与账本，并重置骑手、车流及安全记录。</p>
            </div>
          </details>
        </section>
        </details>

        <details className="city-explorer">
          <summary>城市与模型检查 <small>{cityViews.length} 个视角 · 渲染 / 地图数据</small></summary>
          <div className="city-explorer-body">
            <div className="city-explorer-intro">
              <p>检查时冻结骑手、车流与交通时钟，并停用驾驶输入；返回骑行从原处继续。</p>
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
            <p id="rider-preview-note" className="inspection-note">模型演示时暂停配送与交通计时。重新开工会清空本轮订单、收入与账本，恢复骑手位置、电量并重置车流与安全记录。</p>

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
                  <div><dt>巡航路线</dt><dd>{CITY_LAYOUT.trafficRoutes.length}</dd></div>
                  <div><dt>功能区</dt><dd>{CITY_LAYOUT.districts.length}</dd></div>
                </dl>
                <p className="city-districts">{CITY_LAYOUT.districts.map((district) => district.name).join(' / ')}</p>
                <h3>预留交互点坐标 <span>(X, Z) · 米</span></h3>
                <p className="city-coordinate-note">已接订单在路侧光圈自动取送；+X 向东、+Z 向南</p>
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
        </aside>
      </div>

      <footer className="scene-footer">
        <div className="scene-caption">
          <h2><Sun size={14} aria-hidden="true" />看清方向，再出发。</h2>
          <p>鼠标悬停移动自由观察（左右 ≤ 270°）· 滚轮缩放 · 双击/C 键回正</p>
        </div>
        <div className="engine-summary">
          <span className="engine-state" data-ready={snapshot !== null}>{snapshot ? '引擎运行中' : '正在初始化'}</span>
          <span>{fps}</span>
        </div>
      </footer>
    </div>
  )
}
