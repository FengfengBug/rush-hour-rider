import { CITY_LAYOUT } from '../game/cityLayout'
import type { DeliveryOrder, OrderTimeLedger } from '../game/types'
import './OrderPanel.css'

const landmarkNames = new Map(CITY_LAYOUT.landmarks.map(({ id, name }) => [id, name]))
const ledgerLabels: { key: keyof OrderTimeLedger; label: string }[] = [
  { key: 'ridingSec', label: '行驶' },
  { key: 'trafficWaitSec', label: '等红灯' },
  { key: 'merchantDelaySec', label: '卡餐' },
  { key: 'lastMileSec', label: '末端' },
  { key: 'detourSec', label: '突发' },
  { key: 'idleSec', label: '普通停车' },
]
const reportLabels = { traffic: '道路拥堵', merchant: '商家问题', address: '地址问题' }
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`

function Seconds({ value }: { value: number | null }) {
  return value === null ? <>—</> : <span title={`${value} 秒`}>{value.toFixed(2)} 秒</span>
}

export function CompletedBill({ order }: { order: DeliveryOrder }) {
  const settlement = order.settlement
  return (
    <details className="order-panel-bill">
      <summary>{order.id} · {settlement?.onTime ? '准时' : '超时'}<span>实得 {settlement ? money(settlement.totalCents) : '—'}</span></summary>
      <div className="order-panel-bill-body">
        <p className="order-panel-route">{landmarkNames.get(order.merchantId)} → {landmarkNames.get(order.deliveryId)}</p>
        <dl className="order-panel-metrics">
          <div><dt>理想限时（模拟）</dt><dd><Seconds value={order.idealSec} /></dd></div>
          <div><dt>实际用时</dt><dd><Seconds value={order.actualSec} /></dd></div>
          <div><dt>超时用时</dt><dd><Seconds value={settlement?.lateSec ?? null} /></dd></div>
          <div><dt>锁定直线总距</dt><dd title={`${order.idealDistance} 米`}>{order.idealDistance.toFixed(2)} 米</dd></div>
        </dl>
        <h4>时间账本</h4>
        <dl className="order-panel-metrics">
          {ledgerLabels.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd><Seconds value={order.ledger[key]} /></dd></div>)}
        </dl>
        <h4>结算明细</h4>
        {settlement && <dl className="order-panel-metrics">
          <div><dt>基础费</dt><dd>{money(settlement.baseFeeCents)}</dd></div>
          <div><dt>准时奖</dt><dd>+{money(settlement.bonusCents)}</dd></div>
          {settlement.rainBonusCents > 0 && <div><dt>雨天补贴</dt><dd>+{money(settlement.rainBonusCents)}</dd></div>}
          <div><dt>超时扣款</dt><dd>−{money(settlement.penaltyCents)}</dd></div>
          {settlement.tipCents > 0 && <div><dt>顾客小费</dt><dd>+{money(settlement.tipCents)}</dd></div>}
          {settlement.eventPenaltyCents > 0 && <div><dt>异常/差评扣款</dt><dd>−{money(settlement.eventPenaltyCents)}</dd></div>}
          <div><dt>实得</dt><dd><strong>{money(settlement.totalCents)}</strong></dd></div>
        </dl>}
        <details className="order-panel-record">
          <summary>原始接单与计时记录</summary>
          <dl className="order-panel-record-data">
            <div><dt>商家 / 送达 ID</dt><dd>{order.merchantId} / {order.deliveryId}</dd></div>
            <div><dt>派单 / 过期时刻</dt><dd>{order.offeredAt} / {order.expiresAt} 秒</dd></div>
            <div><dt>接单 / 截止时刻</dt><dd>{order.acceptedAt} / {order.deadline} 秒</dd></div>
            <div><dt>取餐 / 完成时刻</dt><dd>{order.pickedUpAt ?? '—'} / {order.completedAt ?? '—'} 秒</dd></div>
            <div><dt>接单位置 (X, Z)</dt><dd>({order.acceptedPosition.x}, {order.acceptedPosition.z}) 米</dd></div>
            <div><dt>理想 / 实际用时</dt><dd>{order.idealSec} / {order.actualSec} 秒</dd></div>
            {ledgerLabels.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{order.ledger[key]} 秒</dd></div>)}
            <div><dt>玩家报备（不改计费）</dt><dd>{order.reports.length ? order.reports.map((report) => `${report.at.toFixed(2)} 秒 · ${reportLabels[report.reason]}`).join('；') : '无'}</dd></div>
          </dl>
          <p className="order-panel-note">时刻均为本次游玩时钟；以上保留原始快照数值。</p>
        </details>
      </div>
    </details>
  )
}

export function OrderRules() {
  return (
    <details className="order-panel-rules">
      <summary>模拟规则与计时口径</summary>
      <p>以下仅为游戏模拟，并非真实平台规则。</p>
      <ul>
        <li>理想限时 = max(40 秒, ceil((接单位置到商家 + 商家到客户的直线米数) / 5.4 + 24))，接单时锁定。</li>
        <li>基础费 = ¥5.00 + 商家到客户直线米数 × ¥0.012，四舍五入到分；准时奖 ¥1.50。</li>
        <li>超时秒数向上取整，每秒扣 ¥0.05，最多扣基础费；实际用时不以理想估算代替。</li>
        <li>顺路仅指经新单取送点再到当前优先目标的直线增量不超过 35 米，不保证实际路程或准时。</li>
        <li>消息为本地配送模拟：实际取餐后生成商家交接消息，剩余 15 秒时产生一次顾客提醒；报备不改变计时、计费。</li>
        <li>检查与后台暂停，前台停车仍计时；移动计行驶，正确朝向的红灯停止线前停车计等灯，其余计普通停车。</li>
        <li>卡餐 / 末端 / 突发由取送现场真实交互事件触发并按选择写入对应账本；多单时间独立累加，不可相加为班次时长。</li>
      </ul>
    </details>
  )
}
