import { useState } from 'react'
import { CITY_LAYOUT } from '../game/cityLayout'
import { MAX_ACTIVE_ORDERS } from '../game/orderManager'
import type { DeliveryOrder, OrderOffer, OrderSnapshot, OrderTimeLedger } from '../game/types'
import './OrderPanel.css'

interface OrderPanelProps {
  orders: OrderSnapshot | null
  onAccept: (id: string) => boolean
  onPrioritize: (id: string) => void
}

const landmarkNames = new Map(CITY_LAYOUT.landmarks.map(({ id, name }) => [id, name]))
const ledgerLabels: { key: keyof OrderTimeLedger; label: string }[] = [
  { key: 'ridingSec', label: '行驶' },
  { key: 'trafficWaitSec', label: '等红灯' },
  { key: 'merchantDelaySec', label: '卡餐' },
  { key: 'lastMileSec', label: '末端' },
  { key: 'detourSec', label: '突发' },
  { key: 'idleSec', label: '普通停车' },
]

const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
const desktopLayout = () => typeof window !== 'undefined'
  && window.matchMedia('(min-width: 901px) and (min-height: 600px)').matches
const routeName = (order: OrderOffer) => `${landmarkNames.get(order.merchantId) ?? order.merchantId} → ${landmarkNames.get(order.deliveryId) ?? order.deliveryId}`

function Seconds({ value }: { value: number | null }) {
  return value === null ? <>—</> : <span title={`${value} 秒`}>{value.toFixed(2)} 秒</span>
}

function CompletedBill({ order }: { order: DeliveryOrder }) {
  const settlement = order.settlement
  return (
    <details className="order-panel-bill">
      <summary>
        {order.id} · {settlement ? settlement.onTime ? '准时' : '超时' : '待结算'}
        <span>实得 {settlement ? money(settlement.totalCents) : '—'}</span>
      </summary>
      <div className="order-panel-bill-body">
        <p className="order-panel-route">{routeName(order)}</p>
        <dl className="order-panel-metrics">
          <div><dt>平台理想（模拟）</dt><dd><Seconds value={order.idealSec} /></dd></div>
          <div><dt>实际用时</dt><dd><Seconds value={order.actualSec} /></dd></div>
          <div><dt>超时用时</dt><dd><Seconds value={settlement?.lateSec ?? null} /></dd></div>
          <div><dt>锁定直线总距</dt><dd title={`${order.idealDistance} 米`}>{order.idealDistance.toFixed(2)} 米</dd></div>
        </dl>
        <h4>时间账本</h4>
        <dl className="order-panel-metrics">
          {ledgerLabels.map(({ key, label }) => (
            <div key={key}><dt>{label}</dt><dd><Seconds value={order.ledger[key]} /></dd></div>
          ))}
        </dl>
        <h4>结算明细</h4>
        {settlement ? (
          <dl className="order-panel-metrics">
            <div><dt>基础费</dt><dd>{money(settlement.baseFeeCents)}</dd></div>
            <div><dt>准时奖</dt><dd>+{money(settlement.bonusCents)}</dd></div>
            <div><dt>超时扣款</dt><dd>−{money(settlement.penaltyCents)}</dd></div>
            <div><dt>实得</dt><dd><strong>{money(settlement.totalCents)}</strong></dd></div>
          </dl>
        ) : <p className="order-panel-note">暂无结算明细，不计为已入账。</p>}
        <details className="order-panel-record">
          <summary>原始接单与计时记录</summary>
          <dl className="order-panel-record-data">
            <div><dt>商家 / 送达 ID</dt><dd>{order.merchantId} / {order.deliveryId}</dd></div>
            <div><dt>状态</dt><dd>{order.status}</dd></div>
            <div><dt>派单 / 过期时刻</dt><dd>{order.offeredAt} / {order.expiresAt} 秒</dd></div>
            <div><dt>接单 / 截止时刻</dt><dd>{order.acceptedAt} / {order.deadline} 秒</dd></div>
            <div><dt>取餐 / 完成时刻</dt><dd>{order.pickedUpAt ?? '—'} / {order.completedAt ?? '—'} 秒</dd></div>
            <div><dt>接单位置 (X, Z)</dt><dd>({order.acceptedPosition.x}, {order.acceptedPosition.z}) 米</dd></div>
            <div><dt>锁定直线总距</dt><dd>{order.idealDistance} 米</dd></div>
            <div><dt>理想 / 实际用时</dt><dd>{order.idealSec} / {order.actualSec} 秒</dd></div>
            {ledgerLabels.map(({ key, label }) => (
              <div key={key}><dt>{label}</dt><dd>{order.ledger[key]} 秒</dd></div>
            ))}
            <div><dt>订单基础费</dt><dd>{order.baseFeeCents} 分</dd></div>
            {settlement && <div><dt>原始超时用时</dt><dd>{settlement.lateSec} 秒</dd></div>}
          </dl>
          <p className="order-panel-note">时刻均为本次模拟时钟；以上保留快照原始数值。</p>
        </details>
      </div>
    </details>
  )
}

export function OrderPanel({ orders, onAccept, onPrioritize }: OrderPanelProps) {
  const [open, setOpen] = useState(desktopLayout)
  const held = orders?.active.length ?? 0
  const full = held >= MAX_ACTIVE_ORDERS
  const offers = orders?.offers ?? []

  function accept(offer: OrderOffer) {
    if (onAccept(offer.id) && !desktopLayout()) setOpen(false)
  }

  function prioritize(id: string) {
    if (!orders || orders.paused || !orders.active.some((order) => order.id === id)) return
    onPrioritize(id)
    if (!desktopLayout()) setOpen(false)
  }

  return (
    <details className="order-panel" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <strong>订单调度</strong>
        <span>持有 {held}/{MAX_ACTIVE_ORDERS}</span>
        <span>收入 {orders ? money(orders.incomeCents) : '—'}</span>
      </summary>
      <div className="order-panel-body">
        <p className="order-panel-notice" role="status" aria-live="polite" aria-atomic="true">{orders?.notice ?? '订单调度连接中，暂无订单数据。'}</p>
        {orders?.paused && <p className="order-panel-warning">已暂停：派单与配送计时冻结，接单和优先导航暂不可用；返回骑行后继续。</p>}
        {full && <p className="order-panel-warning">持有已满 3 单，请先完成配送再接单。</p>}
        {orders && (
          <>
            <section aria-label="待抢订单">
              <h3>待抢订单 <span>{offers.length}/3</span></h3>
              <ul className="order-panel-list">
                {offers.map((offer) => {
                  const remaining = Math.max(0, Math.ceil(offer.expiresAt - orders.elapsedSec))
                  const unavailable = orders.paused || full || remaining === 0
                  return (
                    <li key={offer.id}>
                      <p className="order-panel-route">{routeName(offer)}</p>
                      <p className="order-panel-note">{offer.id} · 基础费 {money(offer.baseFeeCents)}</p>
                      <p>模拟理想限时 {offer.idealSec} 秒 · 可抢剩余 {remaining} 秒</p>
                      <button type="button" disabled={unavailable} onClick={() => accept(offer)} aria-label={`接单 ${offer.id}，${routeName(offer)}`}>
                        {orders.paused ? '暂停中' : full ? '持有已满' : remaining === 0 ? '已过期' : '一键接单'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {offers.length === 0 && <p className="order-panel-note">暂无待抢订单，下次派单还有 {Math.ceil(orders.nextOfferInSec)} 秒{orders.paused ? '（已冻结）' : ''}。</p>}
              <p className="order-panel-note">限时预估随当前位置更新，成功接单时锁定。</p>
            </section>
            <section aria-label="在途订单">
              <h3>在途订单 <span>{held}/{MAX_ACTIVE_ORDERS}</span></h3>
              <ul className="order-panel-list">
                {orders.active.map((order) => {
                  const remaining = order.deadline - orders.elapsedSec
                  const late = remaining < -0.0000001
                  const priority = orders.priorityId === order.id
                  return (
                    <li key={order.id} data-priority={priority}>
                      <div className="order-panel-row"><strong>{order.id} · {order.status === 'pickup' ? '待取餐' : '待送达'}</strong><span>{priority ? '当前优先' : '在途'}</span></div>
                      <p className="order-panel-route">{routeName(order)}</p>
                      <p className="order-panel-countdown" data-late={late}>{late ? `超时 ${Math.ceil(-remaining - 0.0000001)} 秒` : `配送剩余 ${Math.max(0, Math.ceil(remaining))} 秒`}</p>
                      <p className="order-panel-note">实际已用 <Seconds value={order.actualSec} /> / 锁定限时 {order.idealSec} 秒</p>
                      <button type="button" disabled={orders.paused} aria-pressed={priority} onClick={() => prioritize(order.id)} aria-label={`优先导航 ${order.id}，前往${landmarkNames.get(order.status === 'pickup' ? order.merchantId : order.deliveryId) ?? order.id}`}>
                        优先导航 · {order.status === 'pickup' ? '取餐' : '送达'}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {held === 0 && <p className="order-panel-note">暂无在途订单，可从待抢列表接单。</p>}
              <p className="order-panel-note">进入对应地点的交互范围后自动取餐或送达。</p>
            </section>
            <details className="order-panel-completed">
              <summary>完成账单 · 全部 {orders.completed.length} 单</summary>
              <p className="order-panel-note">本阶段卡餐 / 末端 / 突发未接入，保持 0；多单时间独立累加，不可相加为班次时长。</p>
              {orders.completed.length === 0 ? <p className="order-panel-note">暂无完成订单，送达后保留全部账单。</p> : (
                <ul className="order-panel-list">
                  {orders.completed.map((order) => <li key={order.id}><CompletedBill order={order} /></li>)}
                </ul>
              )}
            </details>
          </>
        )}
        <details className="order-panel-rules">
          <summary>模拟规则与计时口径</summary>
          <p>以下仅为游戏模拟，并非真实平台规则。</p>
          <ul>
            <li>理想限时 = max(25 秒, ceil((接单位置到商家直线距离 + 商家到客户直线距离) / 8 + 12))。距离单位为米，ceil 表示向上取整。</li>
            <li>基础费 = ¥5.00 + 商家到客户直线米数 × ¥0.012，四舍五入到分。</li>
            <li>准时送达加 ¥1.50；超时秒数向上取整，每秒扣 ¥0.05（不足 1 秒按 1 秒计），最多扣基础费。</li>
            <li>接单时锁定限时；等待抢单的时间不扣配送限时。实际用时独立记录，不用理想估算替代。</li>
            <li>账本与交通共用游玩时钟；检查模式与后台暂停，前台停车仍计时。移动计入行驶，停止线前朝向正确且停在红灯前才计等灯，其余停车单列。</li>
            <li>本阶段卡餐 / 末端 / 突发未接入，保持 0；多单时间独立累加，不可相加为班次时长。</li>
          </ul>
        </details>
      </div>
    </details>
  )
}
