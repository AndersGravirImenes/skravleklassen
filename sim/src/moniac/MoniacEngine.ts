import { DEFAULT_PARAMS, createInitialTanks, moniacStatus, updateSimulation } from './updateSimulation'
import type { MoniacSnapshot, Params, Tank } from './types'

const DT = 1 / 60
const MAX_SUBSTEPS = 8

export type MoniacListener = (snapshot: MoniacSnapshot) => void

export class MoniacEngine {
  private tanks: Record<string, Tank>
  private flows = updateSimulation(createInitialTanks(DEFAULT_PARAMS), DEFAULT_PARAMS, 0).flows
  private params: Params = { ...DEFAULT_PARAMS }
  private time = 0
  private tick = 0
  private accumulator = 0
  private lastFrameTime: number | null = null
  private fps = 60
  private normalized = false
  private listeners = new Set<MoniacListener>()
  private rafId: number | null = null
  private running = false

  constructor(initialParams: Params = DEFAULT_PARAMS) {
    this.params = { ...initialParams }
    this.tanks = createInitialTanks(this.params)
    const step = updateSimulation(this.tanks, this.params, 0)
    this.flows = step.flows
    this.normalized = step.normalized
  }

  getSnapshot(): MoniacSnapshot {
    const mult =
      1 /
      Math.max(
        0.1,
        this.params.mpc +
          this.params.saveRate +
          this.params.taxRate +
          this.params.importPropensity,
      )
    return {
      tanks: this.tanks,
      flows: this.flows,
      time: this.time,
      tick: this.tick,
      fps: this.fps,
      multiplier: mult,
      status: moniacStatus(this.tanks, this.flows, this.normalized),
    }
  }

  setParams(next: Params): void {
    this.params = { ...next }
    this.emit()
  }

  reset(params?: Params): void {
    if (params) this.params = { ...params }
    this.tanks = createInitialTanks(this.params)
    this.time = 0
    this.tick = 0
    this.accumulator = 0
    const step = updateSimulation(this.tanks, this.params, 0)
    this.flows = step.flows
    this.normalized = step.normalized
    this.emit()
  }

  subscribe(listener: MoniacListener): () => void {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameTime = null
    this.accumulator = 0
    this.rafId = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private loop = (now: number): void => {
    if (!this.running) return

    if (this.lastFrameTime === null) this.lastFrameTime = now

    const frameDelta = Math.min((now - this.lastFrameTime) / 1000, 0.25)
    this.lastFrameTime = now
    this.accumulator += frameDelta

    let steps = 0
    while (this.accumulator >= DT && steps < MAX_SUBSTEPS) {
      const step = updateSimulation(this.tanks, this.params, DT)
      this.tanks = step.nextTanks
      this.flows = step.flows
      this.normalized = step.normalized
      this.time += DT
      this.tick += 1
      this.accumulator -= DT
      steps += 1
    }

    const instantFps = frameDelta > 0 ? 1 / frameDelta : 60
    this.fps = this.fps * 0.9 + instantFps * 0.1

    this.emit()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
