/** State vector for an ODE system (column vector as number[]). */
export type StateVector = number[]

/** Derivatives dx/dt at the given state and simulation time. */
export type DerivativeFn = (state: StateVector, time: number) => StateVector

export interface OdeSystem {
  readonly dimension: number
  readonly derivatives: DerivativeFn
}

export interface SimulationConfig {
  /** Fixed integration step in seconds (1/60 for 60 Hz physics). */
  readonly fixedDt: number
  readonly maxSubSteps?: number
}

export interface SimulationSnapshot {
  readonly state: Readonly<StateVector>
  readonly time: number
  readonly tick: number
  readonly fps: number
}

export type SimulationListener = (snapshot: SimulationSnapshot) => void
