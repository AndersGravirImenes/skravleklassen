import { rk4Step, cloneState } from './integrator'
import type {
  OdeSystem,
  SimulationConfig,
  SimulationListener,
  SimulationSnapshot,
  StateVector,
} from './types'

const DEFAULT_DT = 1 / 60
const DEFAULT_MAX_SUBSTEPS = 8

export class SimulationEngine {
  private state: StateVector
  private readonly system: OdeSystem
  private readonly config: SimulationConfig
  private time = 0
  private tick = 0
  private accumulator = 0
  private lastFrameTime: number | null = null
  private fps = 60
  private listeners = new Set<SimulationListener>()
  private rafId: number | null = null
  private running = false

  constructor(
    system: OdeSystem,
    initialState: StateVector,
    config: SimulationConfig = { fixedDt: DEFAULT_DT },
  ) {
    this.system = system
    this.config = config
    if (initialState.length !== system.dimension) {
      throw new Error(
        `Initial state length ${initialState.length} !== system dimension ${system.dimension}`,
      )
    }
    this.state = cloneState(initialState)
  }

  getSnapshot(): SimulationSnapshot {
    return {
      state: this.state,
      time: this.time,
      tick: this.tick,
      fps: this.fps,
    }
  }

  setState(next: StateVector): void {
    if (next.length !== this.system.dimension) return
    this.state = cloneState(next)
    this.emit()
  }

  subscribe(listener: SimulationListener): () => void {
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

    if (this.lastFrameTime === null) {
      this.lastFrameTime = now
    }

    const frameDelta = Math.min((now - this.lastFrameTime) / 1000, 0.25)
    this.lastFrameTime = now
    this.accumulator += frameDelta

    const dt = this.config.fixedDt
    const maxSubSteps = this.config.maxSubSteps ?? DEFAULT_MAX_SUBSTEPS
    let steps = 0

    while (this.accumulator >= dt && steps < maxSubSteps) {
      this.state = rk4Step(
        this.system.derivatives,
        this.state,
        this.time,
        dt,
      )
      this.time += dt
      this.tick += 1
      this.accumulator -= dt
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
