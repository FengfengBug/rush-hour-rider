import { ArrowRight } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { DeliveryOrder, OrderTimeLedger } from '../game/types'
import './DeliveryDeltaToast.css'

const LANDMARK_NAMES = new Map(CITY_LAYOUT.landmarks.map(({ id, name }) => [id, name]))

const SEGMENTS: { key: keyof OrderTimeLedger; label: string; color: string }[] = [
  { key: 'trafficWaitSec', label: '等红灯', color: '#d79a2b' },
  { key: 'merchantDelaySec', label: '商家卡餐', color: '#c46a3a' },
  { key: 'lastMileSec', label: '进楼/门禁', color: '#4f7ea8' },
  { key: 'detourSec', label: '绕路/改址', color: '#8a6fa8' },
  { key: 'idleSec', label: '停车/等待', color: '#96a092' },
]

function money(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`
}

export function DeliveryDeltaToast({ order }: { order: DeliveryOrder | null }) {
  if (!order) return null
  const settlement = order.settlement
  if (!settlement) return null

  const deltaSec = order.actualSec - order.idealSec
  const onTime = settlement.onTime
  const losses = SEGMENTS
    .map(({ key, label, color }) => ({ label, color, value: order.ledger[key] }))
    .filter((entry) => entry.value > 0.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)

  return (
    <aside className="delivery-delta" role="status" aria-live="polite" aria-label="本单平台预估与现实耗时对比">
      <div className="delivery-delta-head">
        <span className="delivery-delta-badge" data-late={!onTime}>{onTime ? '准时送达' : '超时送达'}</span>
        <strong>{order.id} · {LANDMARK_NAMES.get(order.deliveryId) ?? order.deliveryId}</strong>
        <span className="delivery-delta-money">{money(settlement.totalCents)}</span>
      </div>
      <div className="delivery-delta-times">
        <span>平台预估 <b>{order.idealSec}s</b></span>
        <ArrowRight size={12} aria-hidden="true" />
        <span>我的现实 <b>{order.actualSec.toFixed(1)}s</b></span>
        <em data-late={deltaSec > 0}>{deltaSec >= 0 ? `+${deltaSec.toFixed(1)}s` : `${deltaSec.toFixed(1)}s`}</em>
      </div>
      <div className="delivery-delta-segments">
        {losses.length > 0
          ? losses.map((entry) => (
            <span key={entry.label}>
              <i style={{ backgroundColor: entry.color }} aria-hidden="true" />
              {entry.label} {entry.value.toFixed(1)}s
            </span>
          ))
          : <span><i style={{ backgroundColor: '#6f9c6b' }} aria-hidden="true" />全程骑行</span>}
        {!onTime && <span className="delivery-delta-late">超时 {settlement.lateSec.toFixed(1)}s</span>}
      </div>
    </aside>
  )
}
