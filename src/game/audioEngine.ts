export interface ContinuousAudioState {
  readonly speedAbs: number
  readonly boosting: boolean
  readonly rainIntensity: number
  readonly active: boolean
  readonly indoor: boolean
}

function getAudioContextCtor(): (typeof AudioContext) | null {
  if (typeof window === 'undefined') return null
  const win = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  return win.AudioContext ?? win.webkitAudioContext ?? null
}

/**
 * 纯 Web Audio API 程序化音效引擎（零外部音频文件依赖）。
 * 所有音频节点均通过主 GainNode 统一静音控制，音量克制不刺耳，
 * 在浏览器自动播放限制下静默等待首次用户交互后自动解锁。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private motorOsc: OscillatorNode | null = null
  private motorFilter: BiquadFilterNode | null = null
  private motorGain: GainNode | null = null
  private rainSource: AudioBufferSourceNode | null = null
  private rainFilter: BiquadFilterNode | null = null
  private rainGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private muted = false
  private disposed = false
  private pageHidden = false
  private lastCollisionAt = 0

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime
      this.masterGain.gain.cancelScheduledValues(now)
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.03)
    }
  }

  get isMuted(): boolean {
    return this.muted
  }

  unlock(): void {
    if (this.disposed) return
    const ctx = this.ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended' && !this.pageHidden) {
      void ctx.resume().catch(() => {
        // Ignore autoplay policy rejections until next user gesture.
      })
    }
  }

  /**
   * 页面切到后台时挂起 AudioContext，避免隐藏标签页里持续播放电机与雨声；
   * 回到前台后恢复，真正的播放仍由下一次用户手势兜底解锁。
   */
  setPageHidden(hidden: boolean): void {
    this.pageHidden = hidden
    const ctx = this.ctx
    if (!ctx || this.disposed) return
    if (hidden) {
      if (ctx.state === 'running') {
        void ctx.suspend().catch(() => {
          // Ignore suspension failures; audio will fade out with paused state.
        })
      }
    } else if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        // Resume is retried on the next user gesture through unlock().
      })
    }
  }

  updateContinuous(state: ContinuousAudioState): void {
    if (this.disposed || !this.ctx || !this.motorOsc || !this.motorGain || !this.motorFilter || !this.rainGain || !this.rainFilter) {
      return
    }
    if (this.ctx.state !== 'running') return
    const now = this.ctx.currentTime

    // 1. 随车速变调的轻柔电驴电机声
    const motorActive = state.active && !state.indoor && state.speedAbs > 0.35
    const speedRatio = Math.max(0, Math.min(1, state.speedAbs / 15))
    const targetFreq = 92 + speedRatio * 155 + (state.boosting ? 28 : 0)
    const targetMotorGain = motorActive ? 0.018 + speedRatio * 0.034 + (state.boosting ? 0.01 : 0) : 0
    this.motorOsc.frequency.setTargetAtTime(targetFreq, now, 0.06)
    this.motorFilter.frequency.setTargetAtTime(280 + speedRatio * 520, now, 0.08)
    this.motorGain.gain.setTargetAtTime(targetMotorGain, now, 0.08)

    // 2. 雨天柔和环境雨声（室内自动衰减 70%）
    const rainLevel = state.active ? Math.max(0, Math.min(1, state.rainIntensity)) : 0
    const indoorScale = state.indoor ? 0.28 : 1.0
    const targetRainGain = rainLevel > 0.02 ? rainLevel * 0.085 * indoorScale : 0
    this.rainFilter.frequency.setTargetAtTime(state.indoor ? 680 : 1450, now, 0.15)
    this.rainGain.gain.setTargetAtTime(targetRainGain, now, 0.16)
  }

  /** 按 H 键：清脆双音电驴喇叭「嘀嘀」 */
  playHorn(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.11, 'triangle', 680, 660, 0.14)
    this.scheduleTone(ctx, now, 0.11, 'sine', 1020, 1000, 0.06)
    this.scheduleTone(ctx, now + 0.145, 0.13, 'triangle', 680, 650, 0.14)
    this.scheduleTone(ctx, now + 0.145, 0.13, 'sine', 1020, 990, 0.06)
  }

  /** 新订单来袭：温暖明快叮咚双音 */
  playNewOrder(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.14, 'sine', 659.25, 659.25, 0.11)
    this.scheduleTone(ctx, now + 0.11, 0.22, 'sine', 880, 880, 0.12)
  }

  /** 取餐完成：轻快上扬提示 */
  playPickup(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.1, 'triangle', 523.25, 523.25, 0.1)
    this.scheduleTone(ctx, now + 0.08, 0.16, 'triangle', 659.25, 659.25, 0.11)
  }

  /** 送达入账：金币悦耳和弦 */
  playDelivery(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.11, 'sine', 523.25, 523.25, 0.11)
    this.scheduleTone(ctx, now + 0.075, 0.12, 'sine', 659.25, 659.25, 0.11)
    this.scheduleTone(ctx, now + 0.15, 0.13, 'sine', 783.99, 783.99, 0.12)
    this.scheduleTone(ctx, now + 0.225, 0.28, 'sine', 1046.5, 1046.5, 0.13)
  }

  /** 拍照点送达：柔和手机快门咔嚓声 */
  playCameraShutter(): void {
    const ctx = this.readyContext()
    if (!ctx || !this.noiseBuffer || !this.masterGain) return
    const now = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(2400, now)
    filter.Q.setValueAtTime(1.4, now)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(0.16, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055)
    src.connect(filter).connect(gain).connect(this.masterGain)
    src.start(now)
    src.stop(now + 0.06)
    this.scheduleTone(ctx, now + 0.06, 0.12, 'sine', 880, 1174.66, 0.08)
  }

  /** 顾客催单来电：轻柔双脉冲铃振提示 */
  playIncomingCall(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    for (let i = 0; i < 2; i += 1) {
      const start = now + i * 0.22
      this.scheduleTone(ctx, start, 0.15, 'sine', 587.33, 622.25, 0.095)
      this.scheduleTone(ctx, start, 0.15, 'triangle', 440, 440, 0.05)
    }
  }

  /** 换电完成：充能上行提示音 */
  playBatterySwapComplete(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.1, 'sine', 440, 554.37, 0.1)
    this.scheduleTone(ctx, now + 0.09, 0.12, 'sine', 554.37, 659.25, 0.1)
    this.scheduleTone(ctx, now + 0.18, 0.22, 'sine', 659.25, 880, 0.12)
  }

  /** 闯红灯违章警告：低沉双音提示 */
  playViolation(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.14, 'sawtooth', 260, 220, 0.075, 700)
    this.scheduleTone(ctx, now + 0.18, 0.18, 'sawtooth', 220, 180, 0.08, 650)
  }

  /** 突发事件弹窗提示 */
  playModalAlert(): void {
    const ctx = this.readyContext()
    if (!ctx) return
    const now = ctx.currentTime
    this.scheduleTone(ctx, now, 0.1, 'triangle', 520, 480, 0.085)
    this.scheduleTone(ctx, now + 0.1, 0.14, 'triangle', 620, 600, 0.085)
  }

  /** 碰撞闷响（带 0.35s 防抖） */
  playCollision(): void {
    const ctx = this.readyContext()
    if (!ctx || !this.noiseBuffer || !this.masterGain) return
    const now = ctx.currentTime
    if (now - this.lastCollisionAt < 0.35) return
    this.lastCollisionAt = now

    this.scheduleTone(ctx, now, 0.16, 'sine', 135, 52, 0.2)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(340, now)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
    src.connect(filter).connect(gain).connect(this.masterGain)
    src.start(now)
    src.stop(now + 0.15)
  }

  dispose(): void {
    this.disposed = true
    try {
      this.motorOsc?.stop()
    } catch {
      // Ignore already stopped oscillator.
    }
    try {
      this.rainSource?.stop()
    } catch {
      // Ignore already stopped buffer source.
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {
        // Ignore close errors during teardown.
      })
    }
    this.ctx = null
    this.masterGain = null
    this.motorOsc = null
    this.motorFilter = null
    this.motorGain = null
    this.rainSource = null
    this.rainFilter = null
    this.rainGain = null
    this.noiseBuffer = null
    this.pageHidden = false
  }

  private readyContext(): AudioContext | null {
    if (this.disposed || this.muted) return null
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return null
    return ctx
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null
    try {
      const ctx = new Ctor()
      const master = ctx.createGain()
      master.gain.value = this.muted ? 0 : 0.72
      master.connect(ctx.destination)

      // 共享 2 秒柔和白噪音缓冲（供雨声、快门与碰撞复用）
      const bufferLength = Math.floor(ctx.sampleRate * 2)
      const noise = ctx.createBuffer(1, bufferLength, ctx.sampleRate)
      const data = noise.getChannelData(0)
      let b0 = 0
      let b1 = 0
      let b2 = 0
      for (let i = 0; i < bufferLength; i += 1) {
        const white = Math.random() * 2 - 1
        // 近似柔和粉红噪音，听感比刺耳白噪音自然得多
        b0 = 0.997 * b0 + white * 0.029
        b1 = 0.985 * b1 + white * 0.032
        b2 = 0.95 * b2 + white * 0.048
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.04) * 2.2))
      }

      // 持续电机节点
      const motorOsc = ctx.createOscillator()
      motorOsc.type = 'triangle'
      motorOsc.frequency.value = 96
      const motorFilter = ctx.createBiquadFilter()
      motorFilter.type = 'lowpass'
      motorFilter.frequency.value = 320
      const motorGain = ctx.createGain()
      motorGain.gain.value = 0
      motorOsc.connect(motorFilter).connect(motorGain).connect(master)
      motorOsc.start()

      // 持续雨声循环节点
      const rainSource = ctx.createBufferSource()
      rainSource.buffer = noise
      rainSource.loop = true
      const rainFilter = ctx.createBiquadFilter()
      rainFilter.type = 'lowpass'
      rainFilter.frequency.value = 1450
      const rainGain = ctx.createGain()
      rainGain.gain.value = 0
      rainSource.connect(rainFilter).connect(rainGain).connect(master)
      rainSource.start()

      this.ctx = ctx
      this.masterGain = master
      this.noiseBuffer = noise
      this.motorOsc = motorOsc
      this.motorFilter = motorFilter
      this.motorGain = motorGain
      this.rainSource = rainSource
      this.rainFilter = rainFilter
      this.rainGain = rainGain
      return ctx
    } catch {
      return null
    }
  }

  private scheduleTone(
    ctx: AudioContext,
    startTime: number,
    duration: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    peakGain: number,
    lowpassHz?: number,
  ): void {
    if (!this.masterGain) return
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(startFreq, startTime)
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + duration)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.015, duration * 0.2))
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    if (lowpassHz) {
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(lowpassHz, startTime)
      osc.connect(filter).connect(gain).connect(this.masterGain)
    } else {
      osc.connect(gain).connect(this.masterGain)
    }
    osc.start(startTime)
    osc.stop(startTime + duration + 0.02)
  }
}
