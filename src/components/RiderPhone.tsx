import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Inbox, MessageSquare, Navigation, Signal, Store, Wallet, Zap } from 'lucide-react'
import { CITY_LAYOUT } from '../game/cityLayout'
import type { GameEngine } from '../game/gameEngine'
import { MAX_ACTIVE_ORDERS } from '../game/orderManager'
import type { DeliveryOrder, EngineSnapshot, OrderMessage, OrderOffer, OrderReportReason } from '../game/types'
import { CompletedBill, OrderRules } from './OrderPanel'
import './RiderPhone.css'

interface RiderPhoneProps {
  engine: GameEngine | null
  snapshot: EngineSnapshot | null
}

type PhoneTab = 'lobby' | 'active' | 'wallet'
const tabs = [
  { id: 'lobby', label: '抢单大厅', Icon: Store },
  { id: 'active', label: '配送中', Icon: Navigation },
  { id: 'wallet', label: '消息·账单', Icon: MessageSquare },
] as const
const landmarkNames = new Map(CITY_LAYOUT.landmarks.map(({ id, name }) => [id, name]))
const reportReasons: { value: OrderReportReason; label: string }[] = [
  { value: 'traffic', label: '路况拥堵' },
  { value: 'merchant', label: '商家出餐慢' },
  { value: 'address', label: '地址不清' },
]
const sourceLabels: Record<OrderMessage['kind'], string> = {
  system: '系统通知', merchant: '商家', customer: '顾客', rider: '骑手报备', payment: '结算入账',
}
const interactiveSelector = 'button, input, select, textarea, summary, details, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="tab"], [role="combobox"], [tabindex]'
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`
const landmarkName = (id: string) => landmarkNames.get(id) ?? id
const compactViewport = () => window.matchMedia('(max-width: 600px), (max-height: 500px)').matches

function elapsedTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

function countdown(seconds: number) {
  const late = seconds < -0.0000001
  return `${late ? '超时' : '剩余'} ${elapsedTime(Math.ceil(late ? -seconds - 0.0000001 : Math.max(0, seconds)))}`
}

function RouteStops({ order, stage }: { order: Pick<OrderOffer, 'merchantId' | 'deliveryId'>; stage?: 'pickup' | 'delivery' }) {
  return (
    <dl className="rider-phone-route" data-stage={stage}>
      <div><dt>取</dt><dd>{landmarkName(order.merchantId)}</dd></div>
      <div><dt>送</dt><dd>{landmarkName(order.deliveryId)}</dd></div>
    </dl>
  )
}

function ReportForm({ order, unavailable, onReport }: {
  order: DeliveryOrder
  unavailable: boolean
  onReport: (id: string, reason: OrderReportReason) => void
}) {
  const [selected, setSelected] = useState<OrderReportReason>('traffic')
  const alreadyReported = order.reports.some(({ reason }) => reason === selected)
  const allReported = reportReasons.every(({ value }) => order.reports.some(({ reason }) => reason === value))
  return (
    <details className="rider-phone-report">
      <summary>异常报备{order.reports.length > 0 && <span>已记录 {order.reports.length} 项</span>}</summary>
      <p>仅作本地模拟记录，不联系商家或顾客；不退费、不减免扣款、不改变倒计时。</p>
      <label className="rider-phone-report-label">
        选择异常原因
        <select value={selected} disabled={unavailable || allReported} onChange={(event) => setSelected(event.target.value as OrderReportReason)}>
          {reportReasons.map(({ value, label }) => {
            const reported = order.reports.some(({ reason }) => reason === value)
            return <option key={value} value={value} disabled={reported}>{label}{reported ? '（已记录）' : ''}</option>
          })}
        </select>
      </label>
      <button className="rider-phone-secondary" type="button" disabled={unavailable || alreadyReported || allReported} onClick={() => onReport(order.id, selected)}>
        {unavailable ? '暂停中，暂不可报备' : allReported ? '全部原因已记录' : alreadyReported ? '此原因已记录，请选择其他原因' : '提交本地报备'}
      </button>
      {order.reports.length > 0 && (
        <ul className="rider-phone-report-history">
          {order.reports.map(({ reason, at }) => (
            <li key={reason}><span>{reportReasons.find(({ value }) => value === reason)?.label ?? reason}</span><span>游玩 {elapsedTime(at)}</span></li>
          ))}
        </ul>
      )}
    </details>
  )
}

export function RiderPhone({ engine, snapshot }: RiderPhoneProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PhoneTab>('lobby')
  const [seenOfferIds, setSeenOfferIds] = useState<ReadonlySet<string>>(() => new Set())
  const [actionError, setActionError] = useState<{ text: string; notice: string } | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lobbyTabRef = useRef<HTMLButtonElement>(null)
  const focusCloseOnOpen = useRef(false)
  const panelId = useId()
  const orders = snapshot?.orders
  const elapsed = orders?.elapsedSec ?? 0
  const active = orders?.active ?? []
  const offers = orders?.offers ?? []
  const held = active.length
  const full = held >= MAX_ACTIVE_ORDERS
  const liveOffers = offers.filter((offer) => offer.expiresAt > elapsed)
  const lobbyVisible = open && tab === 'lobby'
  // Only arrivals, expiry and actually viewing the lobby update the seen set, not each snapshot tick.
  const liveOfferKey = JSON.stringify(liveOffers.map(({ id }) => id).sort())
  useEffect(() => {
    if (!lobbyVisible) return
    const visibleIds = JSON.parse(liveOfferKey) as string[]
    setSeenOfferIds((seen) => visibleIds.every((id) => seen.has(id)) ? seen : new Set([...seen, ...visibleIds]))
  }, [lobbyVisible, liveOfferKey])
  const unread = lobbyVisible ? 0 : liveOffers.filter(({ id }) => !seenOfferIds.has(id)).length
  // Priority is a navigation choice; the collapsed warning must always use the earliest deadline.
  const urgent = active.reduce<DeliveryOrder | null>((first, order) => !first || order.deadline < first.deadline ? order : first, null)
  const urgentRemaining = urgent ? urgent.deadline - elapsed : 0
  const urgentDestination = urgent ? landmarkName(urgent.status === 'pickup' ? urgent.merchantId : urgent.deliveryId) : ''
  const notice = actionError?.notice === (orders?.notice ?? '') ? actionError.text : orders?.notice

  const closePhone = useCallback(() => {
    setOpen(false)
    focusCloseOnOpen.current = false
    engine?.focusCanvas()
  }, [engine])

  useEffect(() => {
    if (open && focusCloseOnOpen.current) {
      closeRef.current?.focus({ preventScroll: true })
      focusCloseOnOpen.current = false
    }
  }, [open])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.repeat) return
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        closePhone()
        return
      }
      if (event.key !== 'Tab') return
      const target = event.target instanceof Element ? event.target : document.activeElement
      const collapsedToggle = !open && !!target && !!toggleRef.current?.contains(target)
      // Canvas Tab is a game shortcut. Native controls keep ordinary Tab / Shift+Tab traversal.
      if (!collapsedToggle && !(target instanceof HTMLCanvasElement) && target?.closest(interactiveSelector)) return
      event.preventDefault()
      if (open) closePhone()
      else {
        setOpen(true)
        // Do not move focus into the phone when opening from the canvas: W and a second Tab still work.
        if (collapsedToggle) engine?.focusCanvas()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, engine, closePhone])

  function accept(id: string) {
    if (!engine || !orders || orders.paused || full) return
    if (!engine.acceptOrder(id)) {
      setActionError({ text: '当前无法接单，订单可能已过期，请查看最新状态。', notice: orders.notice })
      return
    }
    setActionError(null)
    if (compactViewport()) closePhone()
  }

  function prioritize(id: string) {
    if (!engine || !orders || orders.paused || !orders.active.some((order) => order.id === id)) return
    engine.prioritizeOrder(id)
    setActionError(null)
    if (compactViewport()) closePhone()
  }

  function report(id: string, reason: OrderReportReason) {
    if (!engine || !orders || orders.paused) return
    const order = orders.active.find((entry) => entry.id === id)
    if (!order || order.reports.some((entry) => entry.reason === reason)) return
    if (engine.reportOrder(id, reason)) setActionError(null)
    else setActionError({ text: '报备未提交，订单状态可能已更新，请检查配送列表。', notice: orders.notice })
  }

  function messageSource(message: OrderMessage) {
    const order = [...offers, ...active, ...(orders?.completed ?? [])].find(({ id }) => id === message.orderId)
    if (order && message.kind === 'merchant') return `商家 · ${landmarkName(order.merchantId)}`
    if (order && message.kind === 'customer') return `顾客 · ${landmarkName(order.deliveryId)}`
    return sourceLabels[message.kind]
  }

  return (
    <aside className="rider-phone" data-open={open} aria-label="极速达骑手手机" onFocusCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(interactiveSelector)) engine?.releaseDrivingKeys()
    }}>
      {!open ? (
        <button className="rider-phone-peek" ref={toggleRef} type="button" aria-expanded={false} aria-controls={panelId} onClick={() => {
          focusCloseOnOpen.current = true
          setOpen(true)
        }}>
          <span className="rider-phone-peek-heading">
            <span className="rider-phone-peek-brand"><Zap size={16} aria-hidden="true" />极速达</span>
            <span className="rider-phone-peek-held">持有 {held}/{MAX_ACTIVE_ORDERS}</span>
            {unread > 0 && <span className="rider-phone-new-badge">新单 {unread}</span>}
          </span>
          {urgent ? (
            <span className="rider-phone-peek-order" data-critical={urgentRemaining < 30}>
              <span className="rider-phone-peek-clock"><span>{orders?.paused ? '已暂停' : '最急一单'}</span><strong>{countdown(urgentRemaining)}</strong></span>
              <span className="rider-phone-peek-destination"><span>{urgent.status === 'pickup' ? '前往取餐' : '前往送达'}</span><strong>{urgentDestination}</strong></span>
            </span>
          ) : (
            <span className="rider-phone-peek-empty">{!orders ? '等待订单数据' : orders.paused ? '派单已暂停，返回骑行后继续' : liveOffers.length > 0 ? `${liveOffers.length} 个待抢订单，出发前看看` : '暂无在途订单，等待新单'}</span>
          )}
          <span className="rider-phone-peek-footer"><span><kbd>Tab</kbd> 展开手机</span><ChevronUp size={15} aria-hidden="true" /></span>
        </button>
      ) : (
        <div className="rider-phone-screen" id={panelId}>
          <div className="rider-phone-top">
            <div className="rider-phone-hardware" aria-hidden="true"><i /><b /></div>
            <div className="rider-phone-statusbar">
              <span>游玩 <strong>{orders ? elapsedTime(elapsed) : '—'}</strong></span>
              <span className="rider-phone-status-icons">
                <span className="rider-phone-signal" title="本地离线模拟" role="img" aria-label="本地离线模拟"><Signal size={14} aria-hidden="true" /></span>
                <span className="rider-phone-vehicle-battery" data-low={!!snapshot && snapshot.rider.battery < 20}>
                  <span className="rider-phone-battery-icon" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, snapshot?.rider.battery ?? 0))}%` }} /></span>
                  车电 {snapshot ? `${Math.round(snapshot.rider.battery)}%` : '—'}
                </span>
              </span>
            </div>
            <header className="rider-phone-header">
              <span className="rider-phone-logo" aria-hidden="true"><Zap size={26} fill="currentColor" /></span>
              <div className="rider-phone-brand"><strong>极速达</strong><span>骑手端 <i /> 本地模拟</span></div>
              <button className="rider-phone-close" ref={closeRef} type="button" aria-label="收起手机，返回骑行画布" aria-expanded={true} aria-controls={panelId} title="收起手机（Esc / 画布上 Tab）" onClick={closePhone}><ChevronDown size={20} aria-hidden="true" /></button>
            </header>
          </div>

          <div className="rider-phone-content" key={tab} role="region" aria-label={tabs.find(({ id }) => id === tab)?.label} tabIndex={0} onKeyDown={(event) => {
            // Arrow keys scroll this focused region instead of reaching the driving input listener.
            if (event.target === event.currentTarget && event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation()
          }}>
            <p className="rider-phone-notice" role="status" aria-live="polite" aria-atomic="true">{notice || (orders ? '接单后跟随光柱，进入地点范围自动取送。' : '正在等待本地订单数据。')}</p>
            {orders?.paused && <p className="rider-phone-warning">已暂停 · 派单与计时冻结，返回骑行后可接单、导航和报备。</p>}

            {tab === 'lobby' && (
              <section aria-label="待抢订单">
                <div className="rider-phone-section-heading"><h2>附近好单</h2><span>持有 <b>{held}/{MAX_ACTIVE_ORDERS}</b></span></div>
                {full && <p className="rider-phone-warning">配送已满 {MAX_ACTIVE_ORDERS} 单，完成一单后可继续接单。</p>}
                <ul className="rider-phone-card-list">
                  {offers.map((offer) => {
                    const remaining = Math.max(0, Math.ceil(offer.expiresAt - elapsed))
                    const reason = remaining === 0 ? '订单已过期' : orders?.paused ? '暂停中，暂不可接单' : full ? '持有已满，请先送达' : !engine ? '等待引擎就绪' : ''
                    return (
                      <li className="rider-phone-card" key={offer.id}>
                        <div className="rider-phone-offer-heading">
                          <span className="rider-phone-order-id">{offer.id}</span>
                          {offer.onTheWay && <span className="rider-phone-on-the-way" title="根据当前位置与在途订单地点的直线几何关系估算，未计算路网、红灯或卡餐，不保证实际顺路或更快。"><Navigation size={12} aria-hidden="true" />顺路·直线估算</span>}
                        </div>
                        <RouteStops order={offer} />
                        <div className="rider-phone-offer-fee"><span>基础配送费</span><strong>{money(offer.baseFeeCents)}</strong></div>
                        <dl className="rider-phone-offer-metrics">
                          <div><dt>平台理想限时</dt><dd>{offer.idealSec} <span>秒</span></dd></div>
                          <div><dt>可抢剩余</dt><dd data-expiring={remaining < 10}>{remaining} <span>秒</span></dd></div>
                        </dl>
                        <button className="rider-phone-primary" type="button" disabled={!!reason} onClick={() => accept(offer.id)} aria-label={`${reason || '接单'} ${offer.id}，${landmarkName(offer.merchantId)}送往${landmarkName(offer.deliveryId)}`}>
                          {reason || '一键抢单'}{!reason && <span aria-hidden="true">→</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {offers.length === 0 && <div className="rider-phone-empty"><Inbox size={27} aria-hidden="true" /><strong>{orders ? '新订单正在路上' : '等待订单数据'}</strong><p>{orders ? `下次派单还有 ${Math.max(0, Math.ceil(orders.nextOfferInSec))} 秒${orders.paused ? '（已冻结）' : ''}。` : '引擎就绪后，这里会显示真实派单。'}</p></div>}
                <p className="rider-phone-footnote">限时来自直线估算，随位置更新、接单时锁定；实际收入以送达结算为准。</p>
              </section>
            )}

            {tab === 'active' && (
              <section aria-label="配送中的订单">
                <div className="rider-phone-section-heading"><h2>手上的每一单</h2><span><b>{held}</b> / {MAX_ACTIVE_ORDERS} 单</span></div>
                <ul className="rider-phone-card-list">
                  {active.map((order) => {
                    const remaining = order.deadline - elapsed
                    const priority = orders?.priorityId === order.id
                    const destination = landmarkName(order.status === 'pickup' ? order.merchantId : order.deliveryId)
                    return (
                      <li className="rider-phone-card rider-phone-delivery-card" key={order.id} data-priority={priority} data-critical={remaining < 30}>
                        <div className="rider-phone-delivery-heading"><span className="rider-phone-stage" data-stage={order.status}>{order.status === 'pickup' ? '待取餐' : '待送达'}</span><span className="rider-phone-order-id">{order.id}</span>{priority && <span className="rider-phone-priority-label">当前导航</span>}</div>
                        <RouteStops order={order} stage={order.status === 'pickup' ? 'pickup' : 'delivery'} />
                        <div className="rider-phone-countdown"><strong>{countdown(remaining)}</strong><span>限时 {order.idealSec} 秒</span></div>
                        <div className="rider-phone-progress" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, remaining / Math.max(1, order.deadline - order.acceptedAt) * 100))}%` }} /></div>
                        <p className="rider-phone-delivery-meta">已用 {order.actualSec.toFixed(1)} 秒 · 基础费 {money(order.baseFeeCents)}</p>
                        <button className="rider-phone-secondary rider-phone-navigate" type="button" disabled={!engine || orders?.paused} aria-pressed={priority} aria-label={`优先导航 ${order.id}，前往${destination}${orders?.paused ? '，暂停中不可用' : ''}`} onClick={() => prioritize(order.id)}><Navigation size={14} aria-hidden="true" />{orders?.paused ? '暂停中，暂不可导航' : `${priority ? '正在导航' : '优先导航'} · ${order.status === 'pickup' ? '取餐' : '送达'}`}</button>
                        <ReportForm order={order} unavailable={!engine || !!orders?.paused} onReport={report} />
                      </li>
                    )
                  })}
                </ul>
                {held === 0 && <div className="rider-phone-empty"><Navigation size={27} aria-hidden="true" /><strong>{orders?.completed.length ? '这一程已送达' : '轻装出发，从一单开始'}</strong><p>暂无在途订单。去抢单大厅看看，最多可同时配送 3 单。</p><button className="rider-phone-secondary" type="button" onClick={() => { setTab('lobby'); lobbyTabRef.current?.focus({ preventScroll: true }) }}>前往抢单大厅</button></div>}
                <p className="rider-phone-footnote">点选优先导航切换光柱和路线。进入对应地点范围自动取餐或送达；报备不会延长限时。</p>
              </section>
            )}

            {tab === 'wallet' && (
              <>
                <section className="rider-phone-wallet" aria-label="本班收入">
                  <div><span><Wallet size={15} aria-hidden="true" />本班已入账</span><strong>{orders ? money(orders.incomeCents) : '—'}</strong></div>
                  <p><b>{orders?.completed.length ?? 0}</b> 单已完成</p>
                </section>
                <div className="order-panel phone-ledger">
                  <details className="order-panel-completed">
                    <summary>完成账单 · {orders?.completed.length ?? 0} 单</summary>
                    {orders?.completed.length ? <ul className="order-panel-list">{[...orders.completed].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).map((order) => <li key={order.id}><CompletedBill order={order} /></li>)}</ul> : <p className="order-panel-note">还没有完成账单；真实送达后才会结算入账。</p>}
                  </details>
                  <OrderRules />
                </div>
                <section className="rider-phone-messages" aria-label="真实订单消息，最新在前">
                  <div className="rider-phone-section-heading"><h2>订单消息</h2><span>最新在前</span></div>
                  <ol className="rider-phone-message-list">
                    {[...(orders?.messages ?? [])].sort((a, b) => b.at - a.at || b.id - a.id).map((message) => (
                      <li key={message.id} data-source={message.kind}>
                        <div className="rider-phone-message-heading"><strong>{messageSource(message)}</strong><span title={`游玩 ${message.at} 秒`}>游玩 {elapsedTime(message.at)}</span></div>
                        <p>{message.text}</p>
                        <span className="rider-phone-message-order">{message.orderId}</span>
                      </li>
                    ))}
                  </ol>
                  {!orders?.messages.length && <div className="rider-phone-empty"><MessageSquare size={26} aria-hidden="true" /><strong>暂时没有订单消息</strong><p>接单、取送、报备与结算产生的真实记录会显示在这里。</p></div>}
                  <p className="rider-phone-footnote">消息时刻均为本次游玩经过时间。仅本地离线模拟，不发送真实通信。</p>
                </section>
              </>
            )}
          </div>

          <nav className="rider-phone-tabs" aria-label="手机页面">
            {tabs.map(({ id, label, Icon }) => (
              <button type="button" key={id} ref={id === 'lobby' ? lobbyTabRef : undefined} aria-pressed={tab === id} aria-controls={panelId} onClick={() => setTab(id)}>
                <span className="rider-phone-tab-icon"><Icon size={19} aria-hidden="true" /></span>
                <span>{label}{id === 'active' && held > 0 && <b className="rider-phone-tab-count">{held}</b>}</span>
                {id === 'lobby' && unread > 0 && <span className="rider-phone-tab-badge" aria-label={`${unread} 个未读新订单`}>{unread}</span>}
              </button>
            ))}
          </nav>
          <div className="rider-phone-home-indicator" aria-hidden="true"><i /></div>
        </div>
      )}
    </aside>
  )
}
