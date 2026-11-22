import { Building2, Camera, CheckCircle2, DoorOpen, Footprints, Hospital, MapPin, RotateCcw } from 'lucide-react'
import type { GameEngine } from '../game/gameEngine'
import type { EngineSnapshot } from '../game/types'
import './DeliveryCameraOverlay.css'

interface DeliveryCameraOverlayProps {
  engine: GameEngine | null
  snapshot: EngineSnapshot | null
}

export function DeliveryCameraOverlay({ engine, snapshot }: DeliveryCameraOverlayProps) {
  const interior = snapshot?.interior
  if (!interior) return null

  // 1. 室外路侧靠近 CBD / 医院时的下车入楼提示
  if (interior.mode === 'none') {
    if (!interior.canEnter || !interior.nearbyLandmarkName || snapshot?.shift.ended || snapshot?.events.active) {
      return null
    }
    const isHospital = interior.nearbyTheme === 'hospital'
    const hasOrder = interior.nearbyOrderId !== null
    return (
      <div className="interior-curb-slot" role="region" aria-label="进入建筑大堂提示">
        <div className="interior-curb-card" data-priority={hasOrder}>
          <span className="interior-curb-icon" aria-hidden="true">
            {isHospital ? <Hospital size={18} /> : <Building2 size={18} />}
          </span>
          <div className="interior-curb-copy">
            <strong>
              {hasOrder
                ? `已到 ${interior.nearbyLandmarkName} · ${interior.nearbyOrderId} 需进大堂拍照送达`
                : `靠近 ${interior.nearbyLandmarkName}（${isHospital ? '门诊大厅' : '一楼大堂'}可进入）`}
            </strong>
            <span>停好电驴进入大堂放餐，使用手机 App 第一人称拍照留证</span>
          </div>
          <button
            type="button"
            className="interior-curb-btn"
            onClick={() => engine?.enterNearbyBuilding()}
          >
            <DoorOpen size={15} aria-hidden="true" />
            <kbd>E</kbd> 进入大堂
          </button>
        </div>
      </div>
    )
  }

  // 2. 室内大堂第一人称步行引导条
  if (interior.mode === 'walk') {
    const isHospital = interior.theme === 'hospital'
    const hasOrder = interior.orderId !== null
    return (
      <div className="interior-walk-slot" role="region" aria-label="室内大堂步行导航">
        <div className="interior-walk-bar">
          <span className="interior-walk-badge">
            {isHospital ? <Hospital size={14} aria-hidden="true" /> : <Building2 size={14} aria-hidden="true" />}
            {interior.landmarkName} · {isHospital ? '门诊大厅' : '一楼大堂'}
          </span>
          <span className="interior-walk-status">
            <Footprints size={14} aria-hidden="true" />
            {!hasOrder
              ? '大堂步行探索中 · WASD 移动，鼠标转动视角'
              : interior.atDropZone
                ? `餐品已放至「外卖存放处」！在手机 App 点「拍照点送达」或按 F`
                : `WASD 走到右前方绿色「外卖存放处」（距 ${interior.dropDistance.toFixed(1)} m）`}
          </span>
          <div className="interior-walk-actions">
            {hasOrder && interior.atDropZone && (
              <button
                type="button"
                className="interior-photo-cta"
                onClick={() => engine?.openDeliveryCamera()}
              >
                <Camera size={14} aria-hidden="true" />
                <kbd>F</kbd> 拍照点送达
              </button>
            )}
            <button
              type="button"
              className="interior-exit-btn"
              onClick={() => engine?.exitBuilding()}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <kbd>E</kbd> 返回电动车
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 3. 第一人称「手指向外卖」手机 App 拍照点送达取景界面
  const clockLabel = snapshot?.shift.clockLabel ?? '11:30'
  const captured = interior.photoSuccessText !== null
  return (
    <div className="delivery-camera-overlay" role="dialog" aria-modal="true" aria-label="极速达外卖拍照送达取景器">
      <div
        className="delivery-camera-flash"
        aria-hidden="true"
        style={{ opacity: interior.photoFlash }}
      />

      <header className="delivery-camera-top">
        <div className="delivery-camera-title">
          <span className="delivery-camera-dot" aria-hidden="true" />
          <strong>极速达 · 拍照点送达</strong>
          <span>请将外卖袋与存放处拍清，骑手手指确认位置</span>
        </div>
        {!captured && (
          <button
            type="button"
            className="delivery-camera-back"
            onClick={() => engine?.closeDeliveryCamera()}
          >
            <kbd>Esc</kbd> 返回走动
          </button>
        )}
      </header>

      <div className="delivery-camera-frame" aria-hidden="true">
        <i className="corner tl" />
        <i className="corner tr" />
        <i className="corner bl" />
        <i className="corner br" />
        <div className="delivery-camera-reticle">
          <span>对准外卖袋</span>
        </div>
      </div>

      {captured && (
        <div className="delivery-camera-success" role="status" aria-live="polite">
          <CheckCircle2 size={22} aria-hidden="true" />
          <strong>{interior.photoSuccessText}</strong>
          <span>即将返回室外电动车继续跑单…</span>
        </div>
      )}

      <footer className="delivery-camera-bottom">
        <div className="delivery-watermark">
          <div className="delivery-watermark-head">
            <span>极速达配送存证</span>
            <strong>2026-11-22 {clockLabel}</strong>
          </div>
          <p>
            <MapPin size={12} aria-hidden="true" />
            {interior.landmarkName} · {interior.theme === 'hospital' ? '门诊一楼外卖存放桌' : 'CBD 一楼外卖存放架'}
          </p>
          <p className="delivery-watermark-order">
            订单 {interior.orderId} · 商家：{interior.merchantName}
          </p>
        </div>

        <div className="delivery-shutter-wrap">
          <button
            type="button"
            className="delivery-shutter-btn"
            disabled={captured}
            onClick={() => engine?.captureDeliveryPhoto()}
          >
            <span className="delivery-shutter-ring" aria-hidden="true">
              <Camera size={22} />
            </span>
            <span>{captured ? '照片已上传' : '拍摄并确认送达'}</span>
            {!captured && <kbd>Space</kbd>}
          </button>
        </div>
      </footer>
    </div>
  )
}
