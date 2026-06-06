import type { DerivativeFn, StateVector } from './types'

/** Classic 4th-order Runge–Kutta step. */
export function rk4Step(
  derivatives: DerivativeFn,
  state: StateVector,
  time: number,
  dt: number,
): StateVector {
  const n = state.length
  const k1 = derivatives(state, time)
  const y2 = addScaled(state, k1, dt * 0.5)
  const k2 = derivatives(y2, time + dt * 0.5)
  const y3 = addScaled(state, k2, dt * 0.5)
  const k3 = derivatives(y3, time + dt * 0.5)
  const y4 = addScaled(state, k3, dt)
  const k4 = derivatives(y4, time + dt)

  const next = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    next[i] =
      state[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])
  }
  return next
}

function addScaled(
  state: StateVector,
  delta: StateVector,
  scale: number,
): StateVector {
  return state.map((v, i) => v + scale * delta[i])
}

export function cloneState(state: StateVector): StateVector {
  return state.slice()
}
